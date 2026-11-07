import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { stringify as stringifyYaml } from 'yaml'
import { applyCatalogCleanup, classifyCleanup, registryFilesById, renderMarkdown } from '../scripts/propose-catalog-cleanup.mjs'

const COMMIT = 'c'.repeat(40)
const OLD_REPO = 'old-owner/old-repo'
const NEW_REPO = 'new-owner/new-repo'

function catalog(skin, npmSources = {}) {
  return { schemaVersion: 1, skins: [skin], npmSources }
}

function skin(overrides = {}) {
  return {
    id: 'owner.skin',
    package: 'dsh-example-skin',
    repo: `https://github.com/${OLD_REPO}`,
    install: {
      target: `github:${OLD_REPO}#${COMMIT}`,
      version: '1.2.3',
      commit: COMMIT,
      npm: undefined,
    },
    screenshots: [`https://raw.githubusercontent.com/${OLD_REPO}/${COMMIT}/docs/a.png`],
    ...overrides,
  }
}

function report(ids = ['owner.skin']) {
  return {
    checked: 1,
    missing: [{ kind: 'github', repository: OLD_REPO, url: `https://codeload.github.com/${OLD_REPO}/tar.gz/${COMMIT}`, ids }],
    unknown: [],
  }
}

interface FakeResponse {
  ok: boolean
  status: number
  json?: () => Promise<unknown>
  arrayBuffer?: () => Promise<ArrayBuffer>
}

function response(overrides: Partial<FakeResponse>): FakeResponse {
  return { ok: (overrides.status ?? 200) >= 200 && (overrides.status ?? 200) < 300, status: overrides.status ?? 200, ...overrides }
}

function npmTarballFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'catalog-cleanup-npm-'))
  const packageDir = join(dir, 'package')
  mkdirSync(packageDir, { recursive: true })
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
    name: 'dsh-example-skin', version: '1.2.3',
    repository: { type: 'git', url: `git+https://github.com/${OLD_REPO}.git` },
  }))
  writeFileSync(join(packageDir, 'cordis.patch.yml'), '- insert:\n    - id: example-skin\n      name: dsh-example-skin\n')
  const tarball = join(dir, 'package.tgz')
  execFileSync('tar', ['-czf', tarball, '-C', dir, 'package'])
  const bytes = readFileSync(tarball)
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
  return { bytes, integrity }
}

function fakeFetch(route: (url: string, init?: { method?: string }) => FakeResponse | undefined) {
  return async (url: string, init?: { method?: string }): Promise<FakeResponse> => {
    const result = route(url, init)
    if (result !== undefined) return result
    return response({ status: 404 })
  }
}

function npmRoutes(tarball: { bytes: Buffer; integrity: string }) {
  return fakeFetch(url => {
    if (url === `https://api.github.com/repos/${OLD_REPO}`) return response({ status: 404 })
    if (url === 'https://registry.npmjs.org/dsh-example-skin') {
      return response({
        status: 200,
        json: async () => ({
          'dist-tags': { latest: '1.2.3' },
          versions: {
            '1.2.3': {
              gitHead: COMMIT,
              repository: { type: 'git', url: `git+https://github.com/${OLD_REPO}.git` },
              dist: { integrity: tarball.integrity, tarball: 'https://registry.npmjs.org/dsh-example-skin/-/dsh-example-skin-1.2.3.tgz' },
            },
          },
        }),
      })
    }
    if (url === 'https://registry.npmjs.org/dsh-example-skin/-/dsh-example-skin-1.2.3.tgz') {
      return response({ status: 200, arrayBuffer: async () => tarball.bytes.buffer.slice(tarball.bytes.byteOffset, tarball.bytes.byteOffset + tarball.bytes.byteLength) })
    }
    return undefined
  })
}

function tempRegistry(entry: ReturnType<typeof skin>): string {
  const dir = mkdtempSync(join(tmpdir(), 'catalog-cleanup-registry-'))
  writeFileSync(join(dir, 'owner__skin.yml'), stringifyYaml(entry, { lineWidth: 0 }))
  return dir
}

describe('catalog cleanup classification', () => {
  it('classifies a GitHub rename when the pinned commit still exists', async () => {
    const fetchImpl = fakeFetch(url => {
      if (url === `https://api.github.com/repos/${OLD_REPO}`) return response({ status: 200, json: async () => ({ full_name: NEW_REPO }) })
      if (url === `https://codeload.github.com/${NEW_REPO}/tar.gz/${COMMIT}`) return response({ status: 200 })
      return undefined
    })
    const classified = await classifyCleanup(report(), catalog(skin()), { fetchImpl, token: undefined })
    expect(classified.actions).toHaveLength(1)
    expect(classified.actions[0]).toMatchObject({ kind: 'rename', newRepository: NEW_REPO })
  })

  it('revives an entry through npm when the registry artifact matches the pinned commit', async () => {
    const tarball = npmTarballFixture()
    const classified = await classifyCleanup(report(), catalog(skin()), { fetchImpl: npmRoutes(tarball), token: undefined })
    expect(classified.actions).toHaveLength(1)
    expect(classified.actions[0]).toMatchObject({ kind: 'npm-revive', id: 'owner.skin' })
    expect(classified.actions[0].npm).toMatchObject({
      name: 'dsh-example-skin', version: '1.2.3', gitHead: COMMIT,
      repository: `https://github.com/${OLD_REPO}`, integrity: tarball.integrity,
    })
  })

  it('does not rewrite an entry that already ships the verified npm source', async () => {
    const tarball = npmTarballFixture()
    const existing = { name: 'dsh-example-skin', version: '1.2.3', integrity: tarball.integrity, repository: `https://github.com/${OLD_REPO}`, gitHead: COMMIT }
    const classified = await classifyCleanup(report(), catalog(skin(), { 'owner.skin': existing }), { fetchImpl: npmRoutes(tarball), token: undefined })
    expect(classified.actions).toHaveLength(0)
    expect(classified.review.some(item => item.reason.includes('already uses a verified npm source'))).toBe(true)
  })

  it('removes an entry when the repository is gone and npm does not match', async () => {
    const classified = await classifyCleanup(report(), catalog(skin()), {
      fetchImpl: fakeFetch(url => url === `https://api.github.com/repos/${OLD_REPO}` ? response({ status: 404 }) : undefined),
      token: undefined,
    })
    expect(classified.actions).toHaveLength(1)
    expect(classified.actions[0]).toMatchObject({ kind: 'remove', id: 'owner.skin' })
  })

  it('does not auto-remove non-github or unknown sources', async () => {
    const classified = await classifyCleanup({ missing: [{ kind: 'npm', repository: 'some-package', ids: ['owner.skin'] }] }, catalog(skin()), {
      fetchImpl: fakeFetch(() => response({ status: 404 })),
      token: undefined,
    })
    expect(classified.actions).toHaveLength(0)
    expect(classified.review).toHaveLength(1)
  })

  it('renders a reviewable markdown report', async () => {
    const tarball = npmTarballFixture()
    const classified = await classifyCleanup(report(), catalog(skin()), { fetchImpl: npmRoutes(tarball), token: undefined })
    const result = { removed: [], revived: [{ id: 'owner.skin' }], renamed: [], skipped: [] }
    const markdown = renderMarkdown(result, classified)
    expect(markdown).toContain('npm revive')
    expect(markdown).toContain('dsh-example-skin@1.2.3')
  })
})

describe('catalog cleanup application', () => {
  it('removes the registry file for a removed entry', () => {
    const entry = skin()
    const registryDir = tempRegistry(entry)
    expect(registryFilesById(registryDir).get('owner.skin')).toBeDefined()
    const result = applyCatalogCleanup([{ kind: 'remove', id: 'owner.skin', source: report().missing[0], reason: 'gone' }], { registryDir, write: true, runRegistry: () => {} })
    expect(result.removed).toEqual([{ id: 'owner.skin' }])
    expect(registryFilesById(registryDir).get('owner.skin')).toBeUndefined()
  })

  it('adds the verified npm source to the entry', () => {
    const entry = skin()
    const registryDir = tempRegistry(entry)
    const npm = { name: 'dsh-example-skin', version: '1.2.3', integrity: 'sha512-x', repository: `https://github.com/${OLD_REPO}`, gitHead: COMMIT }
    const result = applyCatalogCleanup([{ kind: 'npm-revive', id: 'owner.skin', source: report().missing[0], npm }], { registryDir, write: true, runRegistry: () => {} })
    expect(result.revived).toHaveLength(1)
    const updated = readFileSync(registryFilesById(registryDir).get('owner.skin')!, 'utf8')
    expect(updated).toContain('npm:')
    expect(updated).toContain('integrity: sha512-x')
  })

  it('rewrites repo, install target and screenshot URLs for a rename', () => {
    const entry = skin()
    const registryDir = tempRegistry(entry)
    const result = applyCatalogCleanup([{ kind: 'rename', source: report().missing[0], newRepository: NEW_REPO }], { registryDir, write: true, runRegistry: () => {} })
    expect(result.renamed).toEqual([{ id: 'owner.skin', from: OLD_REPO, to: NEW_REPO }])
    const updated = readFileSync(registryFilesById(registryDir).get('owner.skin')!, 'utf8')
    expect(updated).toContain(`github.com/${NEW_REPO}`)
    expect(updated).toContain(`github:${NEW_REPO}#${COMMIT}`)
    expect(updated).toContain(`raw.githubusercontent.com/${NEW_REPO}`)
    expect(updated).not.toContain(OLD_REPO)
  })
})
