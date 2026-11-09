import { describe, expect, it } from 'vitest'
import { previewState, copyState, classifyCatalog } from '../scripts/completeness-report.mjs'

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
  })
})
