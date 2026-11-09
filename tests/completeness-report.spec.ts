import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
    expect(markdown).toContain('- catalog generatedAt: unknown')
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
    expect(markdown).toContain('- catalog generatedAt: unknown')
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
    expect(renderMarkdown(current)).toContain(`- catalog generatedAt: ${generatedAt}`)
    expect(renderDiffMarkdown({ ...diff, catalogGeneratedAt: generatedAt })).toContain(`- catalog generatedAt: ${generatedAt}`)
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
      expect(unchanged).toContain(`- catalog generatedAt: ${snapshot.catalogGeneratedAt}`)
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
