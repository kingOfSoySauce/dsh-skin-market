import { describe, expect, it } from 'vitest'
import { managedUpdateTarget } from '../src/managed-update.ts'
import type { SkinEntry } from '../src/types.ts'

const COMMIT = '0f95a8cf6eed9bf0357c827759f53e8ce9a9a8e7'
const OTHER_COMMIT = '1111111111111111111111111111111111111111'
const INTEGRITY = 'sha512-mNW95viqpfne7ksm7+rcf0OTGQqryfz6+xYP06aycnBx2IYnuf4qDLw38Km8x5e54iBbjO951f7wyq9jT+2cjw=='

function skin(install: SkinEntry['install'], overrides: Partial<SkinEntry> = {}): SkinEntry {
  return {
    id: 'acme.demo',
    name: { zh: 'demo', en: 'demo' },
    author: 'acme',
    description: 'demo',
    repo: 'https://github.com/acme/dsh-demo',
    package: 'dsh-demo',
    rowId: 'demo',
    category: 'skin',
    tags: [],
    modes: ['light'],
    install,
    compatibility: { dsh: '^0.1.0', platform: ['web'] },
    screenshots: [],
    license: { code: 'MIT', commercialUse: true },
    featuredRank: 0,
    starsSnapshot: 0,
    releaseUpdatedAt: '',
    metadataUpdatedAt: '',
    starsUpdatedAt: '',
    updatedAt: '',
    ...overrides,
  }
}

function reviewedNpm(overrides: Partial<SkinEntry['install']['npm']> = {}): NonNullable<SkinEntry['install']['npm']> {
  return { name: 'dsh-demo', version: '1.2.3', integrity: INTEGRITY, repository: 'https://github.com/acme/dsh-demo', gitHead: COMMIT, ...overrides }
}

describe('managedUpdateTarget', () => {
  it('offers the reviewed pinned Git spec when the installed copy is an older commit of the same directory', () => {
    const target = `github:acme/dsh-demo#${COMMIT}`
    expect(managedUpdateTarget(skin({ target, version: '1.2.3', commit: COMMIT }), `github:acme/dsh-demo#${OTHER_COMMIT}`, '1.2.2'))
      .toEqual({ kind: 'git', version: '1.2.3', spec: target })
  })

  it('keeps the subdirectory selector in the Git spec', () => {
    const target = `github:acme/dsh-demo#${COMMIT}&path:/skins/demo`
    const current = `github:acme/dsh-demo#${OTHER_COMMIT}&path:/skins/demo`
    const entry = skin({ target, version: '1.2.3', commit: COMMIT }, { subpath: 'skins/demo' })
    expect(managedUpdateTarget(entry, current, '1.2.2')).toEqual({ kind: 'git', version: '1.2.3', spec: target })
  })

  it('refuses a Git copy that is not pinned to a full commit', () => {
    const entry = skin({ target: `github:acme/dsh-demo#${COMMIT}`, version: '1.2.3', commit: COMMIT })
    expect(managedUpdateTarget(entry, 'github:acme/dsh-demo#main', '1.2.2')).toBeUndefined()
    expect(managedUpdateTarget(entry, 'github:acme/dsh-demo#0f95a8c', '1.2.2')).toBeUndefined()
  })

  it('refuses a Git copy from another repository', () => {
    const entry = skin({ target: `github:acme/dsh-demo#${COMMIT}`, version: '1.2.3', commit: COMMIT })
    expect(managedUpdateTarget(entry, `github:other/dsh-demo#${OTHER_COMMIT}`, '1.2.2')).toBeUndefined()
  })

  it('refuses a codeload tarball spec: only a pinned Git spec is renewable', () => {
    const entry = skin({ target: `github:acme/dsh-demo#${COMMIT}`, version: '1.2.3', commit: COMMIT })
    expect(managedUpdateTarget(entry, `https://codeload.github.com/acme/dsh-demo/tar.gz/${OTHER_COMMIT}`, '1.2.2')).toBeUndefined()
  })

  it('offers the exact npm version for a reviewed registry copy', () => {
    const entry = skin({ target: `github:acme/dsh-demo#${COMMIT}`, version: '1.2.3', commit: COMMIT, npm: reviewedNpm() })
    expect(managedUpdateTarget(entry, '^1.2.0', '1.2.2')).toEqual({ kind: 'registry', version: '1.2.3' })
  })

  it('refuses an npm copy without a reviewed npm source', () => {
    const entry = skin({ target: `github:acme/dsh-demo#${COMMIT}`, version: '1.2.3', commit: COMMIT })
    expect(managedUpdateTarget(entry, '1.2.2', '1.2.1')).toBeUndefined()
  })

  it('refuses a reviewed npm source whose gitHead does not match the reviewed commit', () => {
    const entry = skin({
      target: `github:acme/dsh-demo#${COMMIT}`, version: '1.2.3', commit: COMMIT,
      npm: reviewedNpm({ gitHead: OTHER_COMMIT }),
    })
    expect(managedUpdateTarget(entry, '1.2.2', '1.2.1')).toBeUndefined()
  })

  it('refuses local, linked and aliased specs', () => {
    const entry = skin({ target: `github:acme/dsh-demo#${COMMIT}`, version: '1.2.3', commit: COMMIT, npm: reviewedNpm() })
    expect(managedUpdateTarget(entry, 'file:/tmp/dsh-demo.tgz', '1.2.2')).toBeUndefined()
    expect(managedUpdateTarget(entry, 'link:/tmp/dsh-demo', '1.2.2')).toBeUndefined()
    expect(managedUpdateTarget(entry, 'npm:dsh-demo-fork@1.2.3', '1.2.2')).toBeUndefined()
  })

  it('refuses a target that is not strictly newer', () => {
    const entry = skin({ target: `github:acme/dsh-demo#${COMMIT}`, version: '1.2.3', commit: COMMIT })
    expect(managedUpdateTarget(entry, `github:acme/dsh-demo#${OTHER_COMMIT}`, '1.2.3')).toBeUndefined()
    expect(managedUpdateTarget(entry, `github:acme/dsh-demo#${OTHER_COMMIT}`, '1.2.4')).toBeUndefined()
  })

  it('refuses an unreadable installed version or a missing saved spec', () => {
    const entry = skin({ target: `github:acme/dsh-demo#${COMMIT}`, version: '1.2.3', commit: COMMIT })
    expect(managedUpdateTarget(entry, `github:acme/dsh-demo#${OTHER_COMMIT}`, 'not-a-version')).toBeUndefined()
    expect(managedUpdateTarget(entry, `github:acme/dsh-demo#${OTHER_COMMIT}`, null)).toBeUndefined()
    expect(managedUpdateTarget(entry, undefined, '1.2.2')).toBeUndefined()
    expect(managedUpdateTarget(entry, '', '1.2.2')).toBeUndefined()
  })

  it('refuses a reviewed target that is not itself a pinned Git spec', () => {
    const entry = skin({ target: 'github:acme/dsh-demo#main', version: '1.2.3', commit: COMMIT })
    expect(managedUpdateTarget(entry, `github:acme/dsh-demo#${OTHER_COMMIT}`, '1.2.2')).toBeUndefined()
  })
})
