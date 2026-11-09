import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogStore, catalogWithStars, recommend, repositorySlug, validateCatalog } from '../src/catalog.ts'
import { loadCatalog } from '../src/catalog.ts'
import { cleanupTempDirs, tempDir } from './fixtures/temp.ts'

afterEach(cleanupTempDirs)

describe('catalog', () => {
  it('contains pinned, curated install targets', () => {
    const catalog = loadCatalog()
    expect(catalog.skins.length).toBeGreaterThanOrEqual(3)
    for (const skin of catalog.skins) {
      expect(skin.install.commit).toMatch(/^[0-9a-f]{40}$/)
      expect(skin.install.target).toContain(skin.install.commit)
      expect(repositorySlug(skin.repo)).toContain('/')
      if (skin.subpath !== undefined) {
        expect(skin.install.target).toContain(`&path:/${skin.subpath}`)
        expect(skin.install.target).not.toContain(`&path:${skin.subpath}&`)
      }
    }
    const maid = catalog.skins.find(skin => skin.id === 'small-tailqwq.maid-atelier')
    expect(maid?.install.companions?.[0]).toMatchObject({
      package: '@dsh-external/dsh-client-ui-skin-deep-whale-manager',
      rowId: 'ui-skin-deep-whale-manager',
    })
    expect(maid?.install.companions?.[0]?.target).toContain('&path:/skin-manager')

    const tide = catalog.skins.find(skin => skin.id === 'sodazilla-zzz.dsh-tide-ui')
    expect(tide?.install.companions?.[0]).toMatchObject({
      package: 'dsh-liquid-glass-balance-card',
      rowId: 'liquid-glass-balance-card',
      target: 'github:SoDaZilla-zzz/dsh-liquid-glass-balance-card#3fbca87bf6d68af66f1669c592bae1e6e6ab4463',
    })
    expect(catalog.skins.some(skin => skin.package === 'dsh-liquid-glass-balance-card')).toBe(false)
    expect(tide?.install.desktop).toEqual({ mode: 'manual-only', reason: 'companion-not-desktop-installable' })
  })

  it('keeps managed Desktop metadata tied to the reviewed package release', () => {
    const catalog = loadCatalog()
    for (const skin of catalog.skins) {
      if (skin.install.desktop?.mode !== 'managed') continue
      expect(skin.install.desktop.packageName).toBe(skin.package)
      expect(skin.install.desktop.packageVersion).toBe(skin.install.version)
    }

    const invalid = structuredClone(catalog)
    const managed = invalid.skins.find(skin => skin.install.desktop?.mode === 'managed')!
    const desktop = managed.install.desktop!
    if (desktop.mode !== 'managed') throw new Error('expected a managed Desktop skin')
    desktop.packageName = 'wrong-package'
    expect(() => validateCatalog(invalid)).toThrow('invalid Desktop package name')

    desktop.packageName = managed.package
    desktop.packageVersion = '0.0.0'
    expect(() => validateCatalog(invalid)).toThrow('invalid Desktop package version')
  })

  it('preserves conflicting review digests for the use-time risk confirmation path', () => {
    const catalog = loadCatalog()
    const skin = structuredClone(catalog.skins.find(item => item.id === 'johnnyting.dsh-official-homepage-theme')!)
    const desktop = skin.install.desktop!
    if (desktop.mode !== 'managed' || skin.install.npm === undefined) throw new Error('expected reviewed npm and Desktop sources')
    // Keep the reported failure reproducible even after review data is refreshed.
    desktop.integrity = 'sha512-NNSnPIeK5HHG1ogholwmUEcqtQz/FdJ3CG1UWsRRNlRQbdghf29v1q7/RPb5jaZw8rUz6SLCngqX0zPR05Iolw=='
    skin.install.npm.integrity = 'sha512-CWs1PXSUDXyVFvJXWJmyD844TcQuzcFBnF+2l16dQl4nWZlRviSevRWl0HEd31u2g7bfiANYhrJ2yqijsEhtbw=='
    const checked = validateCatalog({ ...catalog, skins: [skin] })
    expect(checked.skins[0]).toEqual(skin)
    expect(checked.skins[0].install.desktop).toEqual(desktop)
  })

  it('keeps the Chinese homepage description for dsh-ads', () => {
    const skin = loadCatalog().skins.find(item => item.id === 'nagi-ovo.dsh-ads')
    expect(skin?.description).toMatch(/[\u3400-\u9fff]/)
  })

  it('ranks only other skins and caps recommendations at four', () => {
    const catalog = loadCatalog()
    const result = recommend(catalog.skins[0], catalog.skins, new Map())
    expect(result).not.toContain(catalog.skins[0].id)
    expect(result).toHaveLength(Math.min(4, catalog.skins.length - 1))
  })

  it('scores each recommendation candidate once while preserving ranking and stable ties', () => {
    const seed = loadCatalog().skins[0]
    const current = { ...seed, id: 'current', tags: ['shared'], modes: ['dark'] } as typeof seed
    const candidate = (id: string, overrides: Partial<typeof seed> = {}) => ({
      ...seed, id, tags: [], modes: [], starsSnapshot: 0, featuredRank: 0,
      releaseUpdatedAt: '2020-01-01T00:00:00.000Z', ...overrides,
    }) as typeof seed
    const skins = [
      current,
      candidate('shared-tags', { tags: ['shared'] }),
      candidate('shared-mode', { modes: ['dark'] }),
      candidate('popular'),
      candidate('tied-a', { releaseUpdatedAt: '2026-10-25T00:00:00.000Z' }),
      candidate('tied-b', { releaseUpdatedAt: '2026-10-25T00:00:00.000Z' }),
    ]
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-26T00:00:00.000Z'))
    const parse = vi.spyOn(Date, 'parse')
    try {
      expect(recommend(current, skins, new Map([['popular', 999]]))).toEqual([
        'popular', 'shared-tags', 'shared-mode', 'tied-a',
      ])
      expect(parse).toHaveBeenCalledTimes(skins.length - 1)
    } finally {
      parse.mockRestore()
      now.mockRestore()
    }
  })

  it('serves scheduled Stars snapshots without browser-time GitHub requests', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const catalog = loadCatalog()
    const result = await catalogWithStars('/unused-profile')
    expect(result[0]).toMatchObject({ githubStars: catalog.skins[0].starsSnapshot, starsStale: false, starsUpdatedAt: catalog.skins[0].starsUpdatedAt })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts a newer remote catalog, caches it, and reuses it offline', async () => {
    const dir = tempDir('skin-catalog-')
    const bundled = loadCatalog()
    const remote = structuredClone(bundled)
    remote.generatedAt = new Date(Date.parse(bundled.generatedAt) + 60_000).toISOString()
    remote.skins[0].starsSnapshot += 1
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, json: async () => remote }))
    const store = new CatalogStore(dir, { fetcher, refreshIntervalMs: 60_000 })

    const accepted = await store.refresh(true)
    expect(accepted).toMatchObject({ source: 'remote', catalog: { generatedAt: remote.generatedAt } })
    expect(accepted.catalog.skins[0].starsSnapshot).toBe(remote.skins[0].starsSnapshot)
    expect(JSON.parse(readFileSync(join(dir, '.dsh-skin-market/catalog.json'), 'utf8')).generatedAt).toBe(remote.generatedAt)

    const offline = new CatalogStore(dir, { fetcher: async () => { throw new Error('offline') } })
    expect(offline.snapshot()).toMatchObject({ source: 'cache', catalog: { generatedAt: remote.generatedAt } })
    expect((await offline.refresh(true)).source).toBe('cache')
  })

  it('keeps the bundled catalog in local development mode without requesting remote data', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, json: async () => { throw new Error('remote should not be called') } }))
    const store = new CatalogStore(tempDir('skin-catalog-local-'), {
      fetcher,
      preferBundled: true,
    })

    const snapshot = await store.refresh(true)
    expect(snapshot.source).toBe('bundled')
    expect(snapshot.catalog).toEqual(loadCatalog())
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects stale or structurally conflicting remote catalogs', async () => {
    const bundled = loadCatalog()
    const stale = { ...structuredClone(bundled), generatedAt: '2020-01-01T00:00:00.000Z' }
    const staleStore = new CatalogStore(tempDir('skin-catalog-stale-'), {
      fetcher: async () => ({ ok: true, status: 200, json: async () => stale }),
    })
    const result = await staleStore.refresh(true)
    expect(result.source).toBe('bundled')
    expect(result.error).toContain('older')

    const duplicate = structuredClone(bundled)
    duplicate.skins.push(structuredClone(duplicate.skins[0]))
    expect(() => validateCatalog(duplicate)).toThrow('duplicate id')
  })

  it('requires npm metadata to match the reviewed package and repository', () => {
    const catalog = loadCatalog()
    const invalid = structuredClone(catalog)
    invalid.skins[0]!.install.npm = {
      name: 'wrong-package',
      version: invalid.skins[0]!.install.version,
      integrity: 'sha512-abc',
      repository: invalid.skins[0]!.repo,
      gitHead: invalid.skins[0]!.install.commit,
    }
    expect(() => validateCatalog(invalid)).toThrow('invalid npm package name')
  })

  it.each(['missing', 'short', 'mismatch'])('rejects an npm source whose gitHead is %s', variant => {
    const catalog = loadCatalog()
    const skin = catalog.skins[0]!
    const npm: Record<string, unknown> = {
      name: skin.package, version: skin.install.version, integrity: 'sha512-abc', repository: skin.repo, gitHead: skin.install.commit,
    }
    if (variant === 'missing') delete npm.gitHead
    else npm.gitHead = variant === 'short' ? skin.install.commit.slice(0, 7) : '0'.repeat(40)

    expect(() => validateCatalog({ ...catalog, skins: [{ ...skin, install: { ...skin.install, npm } }] })).toThrow(/gitHead/)
  })

  it('accepts an npm source tied to the complete reviewed GitHub commit', () => {
    // Momentum is orthogonal here; keep the fixture focused on npm metadata.
    const { heat: _heat, ...catalog } = loadCatalog()
    const skin = catalog.skins[0]!
    const npm = { name: skin.package, version: skin.install.version, integrity: 'sha512-abc', repository: skin.repo, gitHead: skin.install.commit }
    const reviewed = { ...catalog, skins: [{ ...skin, install: { ...skin.install, npm } }] }

    expect(validateCatalog(reviewed)).toEqual(reviewed)
  })
})
