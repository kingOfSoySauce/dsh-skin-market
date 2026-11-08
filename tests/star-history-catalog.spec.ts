import { describe, expect, it } from 'vitest'
import { latestCatalogSnapshots } from '../scripts/star-history.mjs'

describe('catalog star readings', () => {
  it('keeps the newest reading per repository across skins', () => {
    const snapshots = latestCatalogSnapshots([
      { repo: 'https://github.com/a/b', starsSnapshot: 3057, starsUpdatedAt: '2026-11-07T12:05:04.294Z' },
      { repo: 'https://github.com/A/B', starsSnapshot: 1607, starsUpdatedAt: '2026-08-23T05:26:45.427Z' },
      { repo: 'https://github.com/c/d', starsSnapshot: 9, starsUpdatedAt: '2026-11-08T00:17:46.188Z' },
    ])
    expect(snapshots.get('a/b')?.[1]).toBe(3057)
    expect(snapshots.get('c/d')?.[1]).toBe(9)
    expect(snapshots.size).toBe(2)
  })

  it('ignores entries without a usable reading', () => {
    const snapshots = latestCatalogSnapshots([
      { repo: 'https://github.com/a/b', starsSnapshot: 'many', starsUpdatedAt: '2026-11-07T12:05:04.294Z' },
      { repo: 'https://github.com/a/c', starsSnapshot: 4, starsUpdatedAt: 'not a date' },
      { repo: 'https://gitlab.com/a/d', starsSnapshot: 4, starsUpdatedAt: '2026-11-07T12:05:04.294Z' },
      { repo: 'https://github.com/a/e', starsSnapshot: -1, starsUpdatedAt: '2026-11-07T12:05:04.294Z' },
    ])
    expect(snapshots.size).toBe(0)
    expect(snapshots.get('a/b')).toBeUndefined()
    expect(snapshots.get('a/c')).toBeUndefined()
    expect(snapshots.get('a/e')).toBeUndefined()
  })
})
