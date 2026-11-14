import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stringify } from 'yaml'
import { describe, expect, it } from 'vitest'
import { loadContract } from '../scripts/submission-contract.mjs'
import { catalogCopyUpdateErrors, classifyChangedFiles, inspectEntryUpdate } from '../scripts/entry-update-guard.mjs'

const contract = await loadContract()
const guardScript = resolve(dirname(fileURLToPath(import.meta.url)), '../scripts/entry-update-guard.mjs')
const commit = 'a'.repeat(40)
const registryFile = 'registry/skins/example__dsh-skin.yml'
const registryIds = new Set(['example.skin', 'other.skin'])
const assetBase = 'skin-screenshots/example__dsh-skin/' + commit

function baseSkin() {
  return {
    id: 'example.skin',
    name: { zh: '示例皮肤', en: 'Example Skin' },
    author: 'example',
    description: 'A skin',
    repo: 'https://github.com/example/dsh-skin',
    package: 'dsh-skin',
    rowId: 'example-skin',
    category: 'skin',
    tags: ['appearance'],
    modes: ['light', 'dark'],
    install: { target: 'github:example/dsh-skin#' + commit, version: '1.0.0', commit },
    compatibility: { dsh: '>=0.2.0-rc.1', platform: ['web'] },
    screenshots: ['https://raw.githubusercontent.com/example/dsh-skin/' + commit + '/docs/home.png'],
    marketScreenshots: [assetBase + '/home.png', assetBase + '/settings.png'],
    listScreenshot: assetBase + '/home.png',
    review: { compatibility: 'verified', preview: 'verified', installation: 'verified' },
    health: {
      status: 'healthy',
      checks: { readmeScreenshots: 'pass', compatibility: 'pass', installation: 'pass' },
      suggestions: [],
    },
    license: { code: 'MIT', commercialUse: true },
    featuredRank: 1000,
    starsSnapshot: 3,
    releaseUpdatedAt: '2026-11-01T00:00:00.000Z',
    metadataUpdatedAt: '2026-11-01T00:00:00.000Z',
    starsUpdatedAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  }
}

function copyEntry(overrides: Record<string, unknown> = {}) {
  return {
    name: { zh: '示例皮肤', en: 'Example Skin' },
    descriptionPolicy: 'show',
    description: { zh: '中文描述', en: 'English description' },
    source: { kind: 'curated', hash: 'abc123', approvedAt: '2026-11-01' },
    override: true,
    nameSource: 'repository-evidence',
    ...overrides,
  }
}

function copyFile(entry: Record<string, unknown> = copyEntry()) {
  return { skins: { 'example.skin': entry, 'other.skin': copyEntry() } }
}

function inspect(overrides: Record<string, unknown> = {}) {
  return inspectEntryUpdate({
    changedFiles: [registryFile],
    contract,
    registryIds,
    baseRegistry: baseSkin(),
    headRegistry: baseSkin(),
    ...overrides,
  })
}

function updateSkin(change: (skin: Record<string, any>) => void) {
  const head = baseSkin()
  change(head)
  return inspect({ headRegistry: head })
}

describe('community entry update guard', () => {
  it('accepts exactly one registry YAML, optionally with catalog copy', () => {
    expect(classifyChangedFiles([registryFile]).errors).toEqual([])
    expect(classifyChangedFiles([registryFile, 'data/catalog-copy.json']).errors).toEqual([])
  })

  it('rejects generated catalog changes, extra files and multiple entries', () => {
    expect(classifyChangedFiles([registryFile, 'data/catalog.json']).errors.join('\n')).toMatch(/data\/catalog.json 是生成文件/)
    expect(classifyChangedFiles([registryFile, 'README.md']).errors.join('\n')).toMatch(/不允许修改：README.md/)
    expect(classifyChangedFiles([registryFile, 'registry/skins/second.yml']).errors.join('\n')).toMatch(/只能修改一个/)
    expect(classifyChangedFiles(['data/catalog-copy.json']).errors.join('\n')).toMatch(/没有找到 registry\/skins/)
    expect(classifyChangedFiles(['registry/skins/nested/entry.yml']).errors.join('\n')).toMatch(/只允许一个直接放置的 \.yml/)
  })

  it('accepts a new thin entry and rejects anything else in the add PR', () => {
    const thin = { url: 'https://github.com/example/dsh-new-skin', name: { zh: '新皮肤', en: 'New Skin' }, tags: ['appearance'] }
    const file = 'registry/skins/example__dsh-new-skin.yml'
    expect(inspect({ changedFiles: [file], baseRegistry: null, headRegistry: thin }).errors).toEqual([])
    const withCopy = inspect({ changedFiles: [file, 'data/catalog-copy.json'], baseRegistry: null, headRegistry: thin })
    expect(withCopy.errors.join('\n')).toMatch(/新增条目的 PR 不能修改 data\/catalog-copy.json/)
    const full = inspect({ changedFiles: [file], baseRegistry: null, headRegistry: baseSkin() })
    expect(full.errors.join('\n')).toMatch(/新条目必须是薄条目/)
  })

  it('allows the documented display-field updates', () => {
    expect(updateSkin(skin => { skin.description = 'Updated description' }).errors).toEqual([])
    expect(updateSkin(skin => { skin.name = { zh: '新名字', en: 'New Name' } }).errors).toEqual([])
    expect(updateSkin(skin => { skin.author = 'Someone Else' }).errors).toEqual([])
    expect(updateSkin(skin => { skin.category = 'pet' }).errors).toEqual([])
    expect(updateSkin(skin => { skin.tags = ['retro', 'neon'] }).errors).toEqual([])
    expect(updateSkin(skin => { skin.modes = ['dark'] }).errors).toEqual([])
    expect(updateSkin(skin => { skin.screenshots = [...skin.screenshots, 'https://raw.githubusercontent.com/example/dsh-skin/' + commit + '/docs/settings.png'] }).errors).toEqual([])
    expect(updateSkin(skin => { skin.compatibility.dsh = '>=0.2.2-rc.1' }).errors).toEqual([])
  })

  it('allows reordering marketScreenshots and moving the cover to another existing shot', () => {
    const reordered = updateSkin(skin => { skin.marketScreenshots = [...skin.marketScreenshots].reverse() })
    expect(reordered.errors).toEqual([])
    const covered = updateSkin(skin => { skin.listScreenshot = assetBase + '/settings.png' })
    expect(covered.errors).toEqual([])
  })

  it('keeps machine-owned fields immutable', () => {
    for (const change of [
      skin => { skin.id = 'example.other' },
      skin => { skin.repo = 'https://github.com/example/other' },
      skin => { skin.package = 'other' },
      skin => { skin.rowId = 'other-row' },
      skin => { skin.install.version = '2.0.0' },
      skin => { skin.license.code = 'Apache-2.0' },
      skin => { skin.review.compatibility = 'unverified' },
      skin => { skin.health.status = 'improvements' },
      skin => { skin.featuredRank = 1 },
      skin => { skin.starsSnapshot = 99 },
      skin => { skin.updatedAt = '2026-12-01T00:00:00.000Z' },
      skin => { skin.compatibility.platform = ['web', 'desktop'] },
    ]) {
      expect(updateSkin(change).errors.length).toBeGreaterThan(0)
    }
    const added = updateSkin(skin => { skin.unexpected = true })
    expect(added.errors.join('\n')).toMatch(/不能新增字段 unexpected/)
  })

  it('requires a valid compatibility range and never allows reverting to unverified', () => {
    expect(updateSkin(skin => { skin.compatibility.dsh = 'nonsense' }).errors.join('\n')).toMatch(/不是合法的 semver 区间/)
    expect(updateSkin(skin => { skin.compatibility.dsh = 'unverified' }).errors.join('\n')).toMatch(/不能改回 unverified/)
    const legacy = baseSkin()
    legacy.compatibility.dsh = 'unverified'
    const legacyHead = structuredClone(legacy)
    expect(inspect({ baseRegistry: legacy, headRegistry: legacyHead }).errors).toEqual([])
  })

  it('rejects marketScreenshots set changes while allowing new screenshots', () => {
    const removed = updateSkin(skin => { skin.marketScreenshots = [skin.marketScreenshots[0]] })
    expect(removed.errors.join('\n')).toMatch(/marketScreenshots 只允许重排/)
    const replaced = updateSkin(skin => { skin.marketScreenshots = [assetBase + '/home.png', assetBase + '/other.png'] })
    expect(replaced.errors.join('\n')).toMatch(/marketScreenshots 只允许重排/)
    const badScheme = updateSkin(skin => { skin.screenshots = ['http://example.com/a.png'] })
    expect(badScheme.errors.join('\n')).toMatch(/screenshots\[0\] 必须是 https:\/\/ 或 skin-screenshots\//)
  })

  it('keeps the cover pointing at an existing screenshot', () => {
    const bad = updateSkin(skin => { skin.listScreenshot = 'https://example.com/cover.png' })
    expect(bad.errors.join('\n')).toMatch(/listScreenshot 封面必须引用/)
    const legacy = baseSkin()
    legacy.listScreenshot = 'https://example.com/legacy-cover.png'
    const legacyHead = structuredClone(legacy)
    expect(inspect({ baseRegistry: legacy, headRegistry: legacyHead }).errors).toEqual([])
  })

  it('rejects incomplete bilingual names and invalid field values', () => {
    expect(updateSkin(skin => { skin.name = { zh: '只有中文' } }).errors.join('\n')).toMatch(/name\.en 必须是非空字符串/)
    expect(updateSkin(skin => { skin.category = 'theme' }).errors.join('\n')).toMatch(/category 只能是/)
    expect(updateSkin(skin => { skin.modes = ['sepia'] }).errors.join('\n')).toMatch(/modes 只能是 light 或 dark/)
    expect(updateSkin(skin => { skin.tags = [] }).errors.join('\n')).toMatch(/tags 必须是非空字符串数组/)
    expect(updateSkin(skin => { delete skin.description }).errors.join('\n')).toMatch(/不能删除字段 description/)
  })
})

describe('catalog display-copy updates in community PRs', () => {
  function copyErrors(baseCopy: unknown, headCopy: unknown, skinId = 'example.skin') {
    return catalogCopyUpdateErrors({ baseCopy, headCopy, skinId, registryIds })
  }

  it('allows changing the own entry display copy', () => {
    const head = copyFile()
    ;(head.skins['example.skin'] as Record<string, unknown>).description = { zh: '新的中文描述', en: 'New English description' }
    expect(copyErrors(copyFile(), head)).toEqual([])
  })

  it('allows adding display copy with only name, description and descriptionPolicy', () => {
    const base = { skins: { 'other.skin': copyEntry() } }
    const head = { skins: { ...base.skins, 'example.skin': { name: { zh: '名称', en: 'Name' }, descriptionPolicy: 'omit' } } }
    expect(copyErrors(base, head)).toEqual([])
    const withSource = { skins: { ...base.skins, 'example.skin': { name: { zh: '名称', en: 'Name' }, descriptionPolicy: 'omit', source: { kind: 'curated' } } } }
    expect(copyErrors(base, withSource).join('\n')).toMatch(/新增展示文案只允许 name、description、descriptionPolicy/)
  })

  it('rejects multiple changed ids or another entry copy change', () => {
    const head = copyFile()
    ;(head.skins['example.skin'] as Record<string, unknown>).name = { zh: '新名字', en: 'New Name' }
    ;(head.skins['other.skin'] as Record<string, unknown>).name = { zh: '别人的', en: 'Other' }
    expect(copyErrors(copyFile(), head).join('\n')).toMatch(/一次只能改一个条目/)
    const otherOnly = copyFile()
    ;(otherOnly.skins['other.skin'] as Record<string, unknown>).description = { zh: '改别人', en: 'Edit other' }
    expect(copyErrors(copyFile(), otherOnly).join('\n')).toMatch(/只能改被更新条目自己的 id/)
  })

  it('keeps source/override/nameSource metadata immutable', () => {
    const changedSource = copyFile()
    ;((changedSource.skins['example.skin'] as Record<string, any>).source as Record<string, string>).hash = 'changed'
    expect(copyErrors(copyFile(), changedSource).join('\n')).toMatch(/source 属于维护者元数据/)
    const removedOverride = copyFile()
    delete (removedOverride.skins['example.skin'] as Record<string, unknown>).override
    expect(copyErrors(copyFile(), removedOverride).join('\n')).toMatch(/override 属于维护者元数据/)
    const legacyBase = { skins: { 'example.skin': { name: { zh: '名称', en: 'Name' }, descriptionPolicy: 'omit' }, 'other.skin': copyEntry() } }
    const legacyHead = structuredClone(legacyBase)
    ;(legacyHead.skins['example.skin'] as Record<string, unknown>).descriptionPolicy = 'show'
    ;(legacyHead.skins['example.skin'] as Record<string, unknown>).description = { zh: '新', en: 'New' }
    expect(copyErrors(legacyBase, legacyHead)).toEqual([])
    ;(legacyHead.skins['example.skin'] as Record<string, unknown>).source = { kind: 'curated' }
    expect(copyErrors(legacyBase, legacyHead).join('\n')).toMatch(/source 属于维护者元数据/)
  })

  it('rejects the curate authoring state and inconsistent show/omit copy', () => {
    const curate = copyFile()
    ;(curate.skins['example.skin'] as Record<string, unknown>).descriptionPolicy = 'curate'
    expect(copyErrors(copyFile(), curate).join('\n')).toMatch(/descriptionPolicy 只能改成 show 或 omit/)
    const omitWithDescription = copyFile()
    ;(omitWithDescription.skins['example.skin'] as Record<string, unknown>).descriptionPolicy = 'omit'
    expect(copyErrors(copyFile(), omitWithDescription).join('\n')).toMatch(/omit 时不能保留 description/)
    const showWithoutEnglish = copyFile()
    ;(showWithoutEnglish.skins['example.skin'] as Record<string, unknown>).description = { zh: '只有中文' }
    expect(copyErrors(copyFile(), showWithoutEnglish).join('\n')).toMatch(/description\.en 必须是非空字符串/)
  })

  it('rejects deleting the file or including it without a real change', () => {
    expect(copyErrors(copyFile(), null).join('\n')).toMatch(/不能删除展示文案文件/)
    expect(copyErrors(copyFile(), copyFile()).join('\n')).toMatch(/没有实际展示文案变化/)
  })

  it('is wired into the update decision and requires the updated entry id', () => {
    const headCopy = copyFile()
    ;(headCopy.skins['example.skin'] as Record<string, unknown>).description = { zh: '新的中文描述', en: 'New English description' }
    const result = inspect({ changedFiles: [registryFile, 'data/catalog-copy.json'], baseCatalogCopy: copyFile(), headCatalogCopy: headCopy })
    expect(result.errors).toEqual([])
    expect(result.copyChanged).toBe(true)
    const otherOnly = copyFile()
    ;(otherOnly.skins['other.skin'] as Record<string, unknown>).description = { zh: '改别人', en: 'Edit other' }
    const bad = inspect({ changedFiles: [registryFile, 'data/catalog-copy.json'], baseCatalogCopy: copyFile(), headCatalogCopy: otherOnly })
    expect(bad.errors.join('\n')).toMatch(/只能改被更新条目自己的 id/)
  })
})

describe('entry update guard command line', () => {
  function git(cwd: string, args: string[]) {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim()
  }

  function runGuard(cwd: string, base: string, head: string) {
    try {
      const stdout = execFileSync(process.execPath, [guardScript, '--base', base, '--head', head, '--cwd', cwd], { encoding: 'utf8', env: process.env })
      return { status: 0, stdout, stderr: '' }
    } catch (error) {
      const failure = error as { status?: number; stdout?: string; stderr?: string }
      return { status: failure.status ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' }
    }
  }

  function initRepo() {
    const dir = mkdtempSync(join(tmpdir(), 'entry-guard-'))
    git(dir, ['init', '-q'])
    git(dir, ['config', 'user.email', 'guard@example.com'])
    git(dir, ['config', 'user.name', 'Guard Test'])
    mkdirSync(join(dir, 'registry', 'skins'), { recursive: true })
    mkdirSync(join(dir, 'data'), { recursive: true })
    writeFileSync(join(dir, registryFile), stringify(baseSkin()))
    writeFileSync(join(dir, 'data', 'catalog-copy.json'), JSON.stringify(copyFile(), null, 2))
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-qm', 'base'])
    const branch = git(dir, ['symbolic-ref', '--short', 'HEAD'])
    return { dir, base: git(dir, ['rev-parse', 'HEAD']), branch }
  }

  it('passes a display + own copy update and ignores changes only on a newer base branch', () => {
    const repo = initRepo()
    try {
      git(repo.dir, ['checkout', '-q', '-b', 'feature'])
      const skin = baseSkin()
      skin.description = 'Updated description'
      writeFileSync(join(repo.dir, registryFile), stringify(skin))
      const copy = copyFile()
      ;(copy.skins['example.skin'] as Record<string, unknown>).description = { zh: '新的中文描述', en: 'New English description' }
      writeFileSync(join(repo.dir, 'data', 'catalog-copy.json'), JSON.stringify(copy, null, 2))
      git(repo.dir, ['add', '-A'])
      git(repo.dir, ['commit', '-qm', 'feature'])
      const head = git(repo.dir, ['rev-parse', 'HEAD'])
      const ok = runGuard(repo.dir, repo.base, head)
      expect(ok.status).toBe(0)
      expect(ok.stdout).toContain('校验通过')

      git(repo.dir, ['checkout', '-q', repo.branch])
      writeFileSync(join(repo.dir, 'data', 'catalog.json'), JSON.stringify({ skins: [] }, null, 2))
      git(repo.dir, ['add', '-A'])
      git(repo.dir, ['commit', '-qm', 'main regenerates catalog'])
      const main = git(repo.dir, ['rev-parse', 'HEAD'])
      // The feature branch does not contain main's catalog.json change; a raw
      // base..head diff would flag it. The guard diffs from the merge-base.
      const stale = runGuard(repo.dir, main, head)
      expect(stale.status).toBe(0)
      expect(stale.stdout).toContain('校验通过')
    } finally {
      rmSync(repo.dir, { recursive: true, force: true })
    }
  })

  it('fails when the PR touches the generated catalog', () => {
    const repo = initRepo()
    try {
      git(repo.dir, ['checkout', '-q', '-b', 'bad'])
      writeFileSync(join(repo.dir, 'data', 'catalog.json'), JSON.stringify({ skins: [] }, null, 2))
      git(repo.dir, ['add', '-A'])
      git(repo.dir, ['commit', '-qm', 'bad catalog change'])
      const head = git(repo.dir, ['rev-parse', 'HEAD'])
      const bad = runGuard(repo.dir, repo.base, head)
      expect(bad.status).toBe(1)
      expect(bad.stderr).toContain('data/catalog.json 是生成文件')
    } finally {
      rmSync(repo.dir, { recursive: true, force: true })
    }
  })

  it('accepts a new thin entry through the command line', () => {
    const repo = initRepo()
    try {
      git(repo.dir, ['checkout', '-q', '-b', 'add-skin'])
      writeFileSync(
        join(repo.dir, 'registry', 'skins', 'example__dsh-new-skin.yml'),
        stringify({ url: 'https://github.com/example/dsh-new-skin', name: { zh: '新皮肤', en: 'New Skin' } }),
      )
      git(repo.dir, ['add', '-A'])
      git(repo.dir, ['commit', '-qm', 'add skin'])
      const head = git(repo.dir, ['rev-parse', 'HEAD'])
      const ok = runGuard(repo.dir, repo.base, head)
      expect(ok.status).toBe(0)
      expect(ok.stdout).toContain('新薄条目')
    } finally {
      rmSync(repo.dir, { recursive: true, force: true })
    }
  })
})