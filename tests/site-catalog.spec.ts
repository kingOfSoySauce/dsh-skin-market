import { describe, expect, it, vi } from 'vitest'
import { fetchLiveCatalog, fetchLiveCatalogWithFallback } from '../site/catalog.ts'

describe('live site catalog', () => {
  it('loads the published catalog without browser caching', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ schemaVersion: 1, generatedAt: '2026-09-08T00:00:00Z', skins: [{ id: 'skin.example', install: {} }] }),
    }))

    await expect(fetchLiveCatalog<{ id: string }>('/dsh-skin-market/catalog.json', fetcher)).resolves.toEqual([{ id: 'skin.example', install: {} }])
    expect(fetcher).toHaveBeenCalledWith('/dsh-skin-market/catalog.json', {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    })
  })

  it('rejects failed or malformed catalog responses', async () => {
    await expect(fetchLiveCatalog('/catalog.json', async () => ({ ok: false, status: 503, json: async () => ({}) }))).rejects.toThrow('HTTP 503')
    await expect(fetchLiveCatalog('/catalog.json', async () => ({ ok: true, status: 200, json: async () => ({ schemaVersion: 2, skins: [] }) }))).rejects.toThrow('目录版本不受支持')
  })

  it('falls back to the bundled Pages catalog when the remote catalog is unavailable', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ schemaVersion: 1, generatedAt: '2026-09-08T00:00:00Z', skins: [{ id: 'fallback.skin', install: {} }] }) })

    await expect(fetchLiveCatalogWithFallback<{ id: string }>('/raw/catalog.json', '/pages/catalog.json', fetcher)).resolves.toEqual([{ id: 'fallback.skin', install: {} }])
    expect(fetcher).toHaveBeenNthCalledWith(1, '/raw/catalog.json', { cache: 'no-store', headers: { accept: 'application/json' } })
    expect(fetcher).toHaveBeenNthCalledWith(2, '/pages/catalog.json', { cache: 'no-store', headers: { accept: 'application/json' } })
  })

  it('expands verified npm sources for site installation links and falls back on tampered metadata', async () => {
    const entry = { id: 'skin.example', package: 'example-skin', repo: 'https://github.com/example/skin', install: { version: '1.0.0', commit: 'a'.repeat(40), target: `github:example/skin#${'a'.repeat(40)}` } }
    const source = { name: entry.package, version: '1.0.0', repository: entry.repo, gitHead: entry.install.commit, integrity: 'sha512-YWJj' }
    const wire = { schemaVersion: 1, generatedAt: '2026-09-08T00:00:00Z', skins: [entry], npmSources: { [entry.id]: source } }
    const response = (value: unknown) => ({ ok: true, status: 200, json: async () => value })
    await expect(fetchLiveCatalog('/catalog.json', async () => response(wire))).resolves.toEqual([{ ...entry, install: { ...entry.install, npm: source } }])
    const invalid = { ...wire, npmSources: { [entry.id]: { ...source, gitHead: 'b'.repeat(40) } } }
    const fetcher = vi.fn().mockResolvedValueOnce(response(invalid)).mockResolvedValueOnce(response(wire))
    await expect(fetchLiveCatalogWithFallback('/remote.json', '/fallback.json', fetcher)).resolves.toEqual([{ ...entry, install: { ...entry.install, npm: source } }])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
