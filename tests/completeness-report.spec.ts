import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { previewState, copyState, classifyCatalog, diffReports, renderMarkdown, renderDiffMarkdown } from '../scripts/completeness-report.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

function runReport(args: string[]) {
  return execFileSync(process.execPath, [join(root, 'scripts', 'completeness-report.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function runReportFailure(args: string[]) {
  try {
    runReport(args)
  } catch (error) {
    return String((error as { stderr?: Buffer }).stderr ?? '')
  }
  throw new Error(`expected failure: ${args.join(' ')}`)
}

const fullCopy = { name: { zh: '名', en: 'Name' }, description: { zh: '描述', en: 'Description' } }

function captureSkin(id: string) {
  return { id, repo: `r/${id}`, marketScreenshots: ['x'], screenshots: [], review: { preview: 'verified' } }
}

function missingPreviewSkin(id: string) {
  return { id, repo: `r/${id}`, screenshots: [], review: { preview: 'verified' } }
}

function upstreamSkin(id: string) {
  return { id, repo: `r/${id}`, screenshots: ['https://raw.githubusercontent.com/a/b/c/home.png'], review: { preview: 'verified' } }
}

function report(skins: unknown[], copies: Record<string, unknown> = {}, generatedAt?: string) {
  return classifyCatalog({ ...(generatedAt ? { generatedAt } : {}), skins, displayCopy: { skins: copies } })
}

describe('completeness classification', () => {
  it('detects captured previews', () => {
    expect(previewState({ marketScreenshots: ['https://example.com/home.png'], screenshots: [], review: { preview: 'verified' } })).toBe('capture')
    expect(previewState({ screenshots: ['skin-screenshots/a/abc/home.png'], review: { preview: 'verified' } })).toBe('capture')
  })

  it('detects upstream previews', () => {
    expect(previewState({ screenshots: ['https://raw.githubusercontent.com/a/b/c/home.png'], review: { preview: 'verified' } })).toBe('upstream')
  })

  it('detects repository-card and missing previews', () => {
    expect(previewState({ screenshots: ['https://opengraph.githubassets.com/x'], review: { preview: 'repository-card' } })).toBe('card')
    expect(previewState({ screenshots: [], review: { preview: 'repository-card' } })).toBe('missing')
    expect(previewState({ screenshots: [], review: { preview: 'verified' } })).toBe('missing')
  })

  it('classifies display copy', () => {
    const full = { name: { zh: '名', en: 'Name' }, description: { zh: '描述', en: 'Description' } }
    expect(copyState(undefined)).toBe('missing')
    expect(copyState(full)).toBe('approved')
    expect(copyState({ descriptionPolicy: 'omit' })).toBe('approved')
    expect(copyState({ name: full.name })).toBe('partial')
  })

  it('summarizes a catalog', () => {
    const report = classifyCatalog({
      skins: [
        { id: 'a', repo: 'r/a', marketScreenshots: ['x'], screenshots: [], review: { preview: 'verified' } },
        { id: 'b', repo: 'r/b', screenshots: ['https://opengraph.githubassets.com/x'], review: { preview: 'repository-card' } },
        { id: 'c', repo: 'r/c', screenshots: [], review: { preview: 'verified' } },
      ],
      displayCopy: { skins: { a: { name: { zh: 'A', en: 'A' }, description: { zh: 'a', en: 'a' } } } },
    })
    expect(report.counts.total).toBe(3)
    expect(report.counts.preview.capture).toBe(1)
    expect(report.counts.preview.card).toBe(1)
    expect(report.counts.preview.missing).toBe(1)
    expect(report.counts.copy.approved).toBe(1)
    expect(report.counts.copy.missing).toBe(2)
    expect(report.missingPreview.map(item => item.id)).toEqual(['c'])
    expect(report.items.map(item => item.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('completeness diff', () => {
  it('reports added entries', () => {
    const diff = diffReports(report([captureSkin('a')]), report([captureSkin('a'), captureSkin('b')]))
    expect(diff.added).toEqual(['b'])
    expect(diff.removed).toEqual([])
    expect(diff.changed).toEqual([])
    expect(diff.counts).toEqual({ total: 2, added: 1, removed: 0, changed: 0 })
  })

  it('reports removed entries', () => {
    const diff = diffReports(report([captureSkin('a'), captureSkin('b')]), report([captureSkin('a')]))
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual(['b'])
    expect(diff.changed).toEqual([])
    expect(diff.counts).toEqual({ total: 1, added: 0, removed: 1, changed: 0 })
  })

  it('reports a preview regression', () => {
    const diff = diffReports(
      report([captureSkin('a')], { a: fullCopy }),
      report([missingPreviewSkin('a')], { a: fullCopy }),
    )
    expect(diff.changed).toEqual([{
      id: 'a',
      repo: 'r/a',
      before: { preview: 'capture', copy: 'approved' },
      after: { preview: 'missing', copy: 'approved' },
    }])
    expect(diff.counts).toEqual({ total: 1, added: 0, removed: 0, changed: 1 })
  })

  it('reports copy moving from missing to approved', () => {
    const diff = diffReports(report([captureSkin('a')]), report([captureSkin('a')], { a: fullCopy }))
    expect(diff.changed).toEqual([{
      id: 'a',
      repo: 'r/a',
      before: { preview: 'capture', copy: 'missing' },
      after: { preview: 'capture', copy: 'approved' },
    }])
  })

  it('reports no changes for identical reports', () => {
    const previous = report([captureSkin('a'), missingPreviewSkin('b')], { a: fullCopy })
    const current = report([captureSkin('a'), missingPreviewSkin('b')], { a: fullCopy })
    expect(diffReports(previous, current)).toEqual({
      added: [],
      removed: [],
      changed: [],
      counts: { total: 2, added: 0, removed: 0, changed: 0 },
    })
  })
})

describe('completeness markdown', () => {
  it('shows preview state in the missing-preview section', () => {
    const markdown = renderMarkdown(report([missingPreviewSkin('a')]))
    const section = markdown.split('## 缺预览（1）')[1].split('## 仅仓库卡')[0]
    expect(markdown).toContain('- catalogGeneratedAt: unknown')
    expect(section).toContain('- `a` — r/a — missing')
  })

  it('shows copy state in the missing-copy section', () => {
    const markdown = renderMarkdown(report([upstreamSkin('b')]))
    const section = markdown.split('## 缺文案（1）')[1].split('## 文案不完整')[0]
    expect(section).toContain('- `b` — r/b — missing')
    expect(section).not.toContain('upstream')
  })

  it('shows copy state in the partial-copy section', () => {
    const markdown = renderMarkdown(report([upstreamSkin('c')], { c: { name: fullCopy.name } }))
    const section = markdown.split('## 文案不完整（1）')[1]
    expect(section).toContain('- `c` — r/c — partial')
    expect(section).not.toContain('upstream')
  })

  it('renders a no-change diff', () => {
    const diff = diffReports(report([captureSkin('a')]), report([captureSkin('a')]))
    const markdown = renderDiffMarkdown(diff)
    expect(markdown).toContain('- catalogGeneratedAt: unknown')
    expect(markdown).toContain('新增：0 / 移除：0 / 变化：0')
    expect(markdown).toContain('无变化。')
  })

  it('renders a changed diff', () => {
    const diff = diffReports(
      report([captureSkin('a')], { a: fullCopy }),
      report([missingPreviewSkin('a')], { a: fullCopy }),
    )
    const markdown = renderDiffMarkdown(diff)
    expect(markdown).toContain('新增：0 / 移除：0 / 变化：1')
    expect(markdown).toContain('- `a` — r/a — 预览 capture → missing')
    expect(markdown).not.toContain('无变化。')
  })

  it('renders the catalog generatedAt in JSON and Markdown', () => {
    const generatedAt = '2026-11-09T08:11:11.602Z'
    const current = report([captureSkin('a')], {}, generatedAt)
    const diff = diffReports(report([captureSkin('a')]), current)
    expect(current.catalogGeneratedAt).toBe(generatedAt)
    expect(JSON.parse(JSON.stringify(current)).catalogGeneratedAt).toBe(generatedAt)
    expect(renderMarkdown(current)).toContain(`- catalogGeneratedAt: ${generatedAt}`)
    expect(renderDiffMarkdown({ ...diff, catalogGeneratedAt: generatedAt })).toContain(`- catalogGeneratedAt: ${generatedAt}`)
  })
})

describe('completeness --since CLI', () => {
  it('renders no-change and changed Markdown output', () => {
    const dir = mkdtempSync(join(tmpdir(), 'completeness-diff-'))
    try {
      const snapshot = JSON.parse(runReport(['--json']))
      const previousPath = join(dir, 'previous.json')
      writeFileSync(previousPath, JSON.stringify(snapshot, null, 2))

      const unchanged = runReport(['--since', previousPath])
      expect(unchanged).toContain(`- catalogGeneratedAt: ${snapshot.catalogGeneratedAt}`)
      expect(unchanged).toContain('新增：0 / 移除：0 / 变化：0')
      expect(unchanged).toContain('无变化。')

      const changedItem = snapshot.items.find((item: { preview: string; copy: string }) => item.preview !== 'missing' || item.copy !== 'missing')
      const addedItem = snapshot.items.find((item: { id: string }) => item.id !== changedItem?.id)
      if (!changedItem || !addedItem) throw new Error('catalog needs at least two items with one non-missing state')
      const previous = JSON.parse(JSON.stringify(snapshot))
      previous.items = previous.items
        .filter((item: { id: string }) => item.id !== addedItem.id)
        .map((item: { id: string }) => item.id === changedItem.id ? { ...item, preview: 'missing', copy: 'missing' } : item)
      previous.items.push({ id: 'example.removed', repo: 'https://github.com/example/removed', preview: 'missing', copy: 'missing' })
      writeFileSync(previousPath, JSON.stringify(previous, null, 2))

      const changed = runReport(['--since', previousPath])
      expect(changed).toContain('新增：1 / 移除：1 / 变化：1')
      expect(changed).toContain(`- \`${addedItem.id}\``)
      expect(changed).toContain('- `example.removed`')
      expect(changed).toContain(`- \`${changedItem.id}\` — ${changedItem.repo} —`)
      expect(changed).not.toContain('无变化。')

      const changedJson = JSON.parse(runReport(['--since', previousPath, '--json']))
      expect(changedJson.counts).toEqual({ total: snapshot.items.length, added: 1, removed: 1, changed: 1 })
      expect(changedJson.catalogGeneratedAt).toBe(snapshot.catalogGeneratedAt)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('completeness --catalog CLI', () => {
  const localGeneratedAt = JSON.parse(readFileSync(join(root, 'data', 'catalog.json'), 'utf8')).generatedAt as string

  function writeFixture(dir: string) {
    const path = join(dir, 'catalog-main.json')
    writeFileSync(path, JSON.stringify({
      generatedAt: '2000-01-01T00:00:00.000Z',
      skins: [
        { id: 'fixture.capture', repo: 'https://github.com/example/fixture-capture', marketScreenshots: ['https://example.com/x.png'], screenshots: [], review: { preview: 'verified' } },
        { id: 'fixture.missing', repo: 'https://github.com/example/fixture-missing', screenshots: [], review: { preview: 'verified' } },
      ],
      displayCopy: { skins: { 'fixture.capture': fullCopy } },
    }, null, 2))
    return path
  }

  it('reads a fixture catalog from --catalog <path> and marks it explicit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'completeness-catalog-'))
    try {
      const fixture = writeFixture(dir)
      const report = JSON.parse(runReport(['--catalog', fixture, '--json']))
      expect(report.catalogGeneratedAt).toBe('2000-01-01T00:00:00.000Z')
      expect(report.localCatalogGeneratedAt).toBe(localGeneratedAt)
      expect(report.catalogSource).toBe('explicit')
      expect(report.localCatalogBehind).toBe(true)
      expect(report.catalogFreshness).toBeUndefined()
      expect(report.counts.total).toBe(2)
      expect(report.items.map((item: { id: string }) => item.id)).toEqual(['fixture.capture', 'fixture.missing'])
      expect(report.counts.preview).toEqual({ capture: 1, upstream: 0, card: 0, missing: 1 })
      expect(report.counts.copy).toEqual({ approved: 1, partial: 0, missing: 1 })

      const markdown = runReport(['--catalog', fixture])
      expect(markdown).toContain('- catalogGeneratedAt: 2000-01-01T00:00:00.000Z')
      expect(markdown).toContain('- catalog source: explicit')
      expect(markdown).toContain('- local catalog behind: true')
      expect(markdown).not.toContain('localCatalogGeneratedAt:')
      expect(markdown).not.toContain('catalog 新鲜度')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('marks the default repository catalog as repository and not behind', () => {
    const report = JSON.parse(runReport(['--json']))
    expect(report.catalogSource).toBe('repository')
    expect(report.localCatalogBehind).toBe(false)
    expect(report.catalogFreshness).toBeUndefined()

    const markdown = runReport([])
    expect(markdown).toContain('- catalog source: repository')
    expect(markdown).toContain('- local catalog behind: false')
  })

  it('combines --catalog with --since', () => {
    const dir = mkdtempSync(join(tmpdir(), 'completeness-catalog-diff-'))
    try {
      const fixture = writeFixture(dir)
      const snapshotPath = join(dir, 'snapshot.json')
      writeFileSync(snapshotPath, runReport(['--catalog', fixture, '--json']))

      const diff = JSON.parse(runReport(['--catalog', fixture, '--since', snapshotPath, '--json']))
      expect(diff.counts).toEqual({ total: 2, added: 0, removed: 0, changed: 0 })
      expect(diff.catalogGeneratedAt).toBe('2000-01-01T00:00:00.000Z')
      expect(diff.catalogSource).toBe('explicit')
      expect(diff.localCatalogBehind).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('accepts --catalog=<path>, including a path relative to the cwd', () => {
    const dir = mkdtempSync(join(tmpdir(), 'completeness-catalog-inline-'))
    try {
      const fixture = writeFixture(dir)
      const inline = JSON.parse(runReport([`--catalog=${fixture}`, '--json']))
      expect(inline.counts.total).toBe(2)
      expect(inline.catalogGeneratedAt).toBe('2000-01-01T00:00:00.000Z')

      const relativeFixture = relative(root, fixture)
      expect(relativeFixture.startsWith('..')).toBe(true)
      const relativeReport = JSON.parse(runReport([`--catalog=${relativeFixture}`, '--json']))
      expect(relativeReport.items.map((item: { id: string }) => item.id)).toEqual(['fixture.capture', 'fixture.missing'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails when --catalog has no path', () => {
    expect(runReportFailure(['--catalog'])).toContain('--catalog 需要一个 catalog 文件路径')
  })

  it('fails when --catalog is followed by another flag', () => {
    expect(runReportFailure(['--catalog', '--json'])).toContain('--catalog 需要一个 catalog 文件路径')
  })

  it('fails when the catalog file is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'completeness-catalog-missing-'))
    try {
      const stderr = runReportFailure(['--catalog', join(dir, 'missing.json'), '--json'])
      expect(stderr).toContain('无法读取 catalog')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('fails when the catalog has no skins', () => {
    const dir = mkdtempSync(join(tmpdir(), 'completeness-catalog-empty-'))
    try {
      const fixture = join(dir, 'catalog-main.json')
      for (const body of [{ generatedAt: '2000-01-01T00:00:00.000Z', skins: [] }, { generatedAt: '2000-01-01T00:00:00.000Z' }]) {
        writeFileSync(fixture, JSON.stringify(body))
        expect(runReportFailure(['--catalog', fixture, '--json'])).toContain('catalog 缺少 skins 或为空')
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
