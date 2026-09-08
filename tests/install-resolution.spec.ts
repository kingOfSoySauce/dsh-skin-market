import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { atomicWriteJson } from '../src/profile.ts'
import { companionAsSkin, discoverMonorepoTarget, githubInstallTarget, githubPathQuery, npmInstallTarget, parseGithubTarget, preferredInstallTarget } from '../src/install-resolution.ts'
import { loadCatalog } from '../src/catalog.ts'

describe('install resolution', () => {
  it('prefers an exact npm source and parses immutable GitHub targets', () => {
    const base = loadCatalog().skins[0]
    const skin = {
      ...base,
      install: {
        ...base.install,
        npm: { name: base.package, version: base.install.version, integrity: 'sha512-abc', repository: base.repo, gitHead: base.install.commit },
      },
    }

    expect(npmInstallTarget(skin)).toBe(`${base.package}@${base.install.version}`)
    expect(preferredInstallTarget(skin)).toBe(`${base.package}@${base.install.version}`)
    expect(parseGithubTarget(base.install.target)).toMatchObject({ commit: base.install.commit })
  })

  it('redirects a root GitHub collection to its unique DSH child package', () => {
    const directory = mkdtempSync(join(tmpdir(), 'skin-resolution-'))
    const base = loadCatalog().skins[0]
    const commit = 'a'.repeat(40)
    const root = join(directory, 'node_modules', 'repo-root')
    mkdirSync(join(root, 'packages', 'skin'), { recursive: true })
    atomicWriteJson(join(root, 'package.json'), { name: 'repo-root', workspaces: ['packages/*'] })
    atomicWriteJson(join(root, 'packages', 'skin', 'package.json'), { name: base.package, version: base.install.version, dsh: { client: { platform: 'web' } } })

    expect(discoverMonorepoTarget(directory, base, `github:example/repo#${commit}`))
      .toBe(`github:example/repo#${commit}&path:/packages/skin`)
  })

  it('rejects an ambiguous collection instead of guessing a child', () => {
    const directory = mkdtempSync(join(tmpdir(), 'skin-resolution-'))
    const base = loadCatalog().skins[0]
    const commit = 'b'.repeat(40)
    const root = join(directory, 'node_modules', 'repo-root')
    mkdirSync(join(root, 'packages', 'one'), { recursive: true })
    mkdirSync(join(root, 'packages', 'two'), { recursive: true })
    atomicWriteJson(join(root, 'package.json'), { name: 'repo-root', workspaces: ['packages/*'] })
    for (const child of ['one', 'two']) {
      atomicWriteJson(join(root, 'packages', child, 'package.json'), { name: base.package, version: base.install.version, dsh: { client: { platform: 'web' } } })
    }

    expect(() => discoverMonorepoTarget(directory, base, `github:example/repo#${commit}`)).toThrow('找到多个')
  })

  it('emits pnpm subdirectory selectors with a leading slash and parses both spellings', () => {
    const commit = 'c'.repeat(40)
    expect(githubPathQuery('maid-atelier')).toBe('&path:/maid-atelier')
    expect(githubPathQuery('/packages/skin')).toBe('&path:/packages/skin')
    expect(githubInstallTarget('owner/repo', commit, 'maid-atelier'))
      .toBe(`github:owner/repo#${commit}&path:/maid-atelier`)
    expect(parseGithubTarget(`github:owner/repo#${commit}&path:/maid-atelier`))
      .toEqual({ repository: 'owner/repo', commit, subpath: 'maid-atelier' })
    expect(parseGithubTarget(`github:owner/repo#${commit}&path:maid-atelier`))
      .toEqual({ repository: 'owner/repo', commit, subpath: 'maid-atelier' })
    expect(() => githubPathQuery('../escape')).toThrow('invalid github subpath')
  })

  it('accepts root companions from another GitHub repository', () => {
    const base = loadCatalog().skins.find(skin => skin.id === 'sodazilla-zzz.dsh-tide-ui')!
    const companion = base.install.companions![0]!
    expect(parseGithubTarget(companion.target)).toEqual({
      repository: 'SoDaZilla-zzz/dsh-liquid-glass-balance-card',
      commit: companion.commit,
    })
    expect(companionAsSkin(base, companion)).toMatchObject({
      repo: 'https://github.com/SoDaZilla-zzz/dsh-liquid-glass-balance-card',
      package: companion.package,
      rowId: companion.rowId,
      subpath: undefined,
    })
  })
})
