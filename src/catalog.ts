import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Ajv from 'ajv/dist/2020.js'
import { decodeCatalogWire, encodeCatalogWire } from './catalog-wire.ts'
import { githubInstallTarget, parseGithubTarget } from './install-resolution.ts'
import { atomicWriteJson } from './profile.ts'
import { isVersionRange } from './semver.ts'
import type { CatalogFile, CatalogSkin, SkinEntry } from './types.ts'

export const REMOTE_CATALOG_URL = 'https://raw.githubusercontent.com/kingOfSoySauce/dsh-skin-market/main/data/catalog.json'
export const CATALOG_REFRESH_INTERVAL_MS = 5 * 60 * 1000
export const LOCAL_CATALOG_ENV = 'DSH_SKIN_MARKET_LOCAL_CATALOG'

const schema = JSON.parse(readFileSync(new URL('../registry/skin.schema.json', import.meta.url), 'utf8')) as object
const validateSkin = new Ajv({ allErrors: true, strict: false, validateFormats: false }).compile(schema)

export function loadCatalog(): CatalogFile {
  const file = new URL('../data/catalog.json', import.meta.url)
  return validateCatalog(JSON.parse(readFileSync(file, 'utf8')))
}

export function validateCatalog(value: unknown): CatalogFile {
  const candidate = decodeCatalogWire(value)

  const ids = new Set<string>()
  const packages = new Set<string>()
  const rows = new Set<string>()
  for (const skin of candidate.skins) {
    if (!validateSkin(skin)) {
      const details = (validateSkin.errors ?? []).map(error => `${error.instancePath || '/'} ${error.message}`).join('; ')
      throw new Error(`invalid skin entry: ${details}`)
    }
    const entry = skin as SkinEntry
    if (!isVersionRange(entry.compatibility.dsh)) throw new Error(`invalid DSH compatibility range for ${entry.id}`)
    for (const adapter of entry.compatibility.adapters ?? []) {
      if (!isVersionRange(adapter.when)) throw new Error(`invalid compatibility adapter range for ${entry.id}: ${adapter.id}`)
    }
    const repo = entry.repo.replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '')
    const expected = githubInstallTarget(repo, entry.install.commit, entry.subpath)
    if (entry.install.target !== expected) throw new Error(`invalid pinned install target for ${entry.id}`)
    for (const companion of entry.install.companions ?? []) {
      const parts = parseGithubTarget(companion.target)
      if (parts === null) throw new Error(`invalid companion target for ${entry.id}: ${companion.package}`)
      if (parts.commit !== companion.commit) throw new Error(`invalid companion commit for ${entry.id}: ${companion.package}`)
      if (companion.target !== githubInstallTarget(parts.repository, companion.commit, parts.subpath)) {
        throw new Error(`invalid companion path for ${entry.id}: ${companion.package}`)
      }
    }
    if ((entry.install.companions?.length ?? 0) > 0 && entry.install.desktop?.mode === 'managed') {
      throw new Error(`desktop managed install cannot install companions for ${entry.id}`)
    }
    if (entry.subpath !== undefined && entry.install.allowBuild !== undefined && !entry.install.allowBuild.endsWith(`#path:${entry.subpath}`)) {
      throw new Error(`invalid allowBuild path for ${entry.id}; expected #path:${entry.subpath}`)
    }
    for (const [label, key, set] of [
      ['id', entry.id, ids],
      ['package', entry.package, packages],
      ['rowId', entry.rowId, rows],
    ] as const) {
      if (set.has(key)) throw new Error(`duplicate ${label}: ${key}`)
      set.add(key)
    }
  }
  return candidate as CatalogFile
}

export type CatalogSource = 'remote' | 'cache' | 'bundled'

export interface CatalogSnapshot {
  catalog: CatalogFile
  source: CatalogSource
  lastCheckedAt: string | null
  error?: string
}

interface FetchResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

export interface CatalogStoreOptions {
  remoteUrl?: string
  /** Keep the bundled registry for local plugin development; never call the remote catalog. */
  preferBundled?: boolean
  refreshIntervalMs?: number
  fetcher?: (url: string, init: RequestInit) => Promise<FetchResponse>
  now?: () => number
}

function cacheFile(profileDir: string): string { return join(profileDir, '.dsh-skin-market', 'catalog.json') }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }

export class CatalogStore {
  private current: CatalogFile
  private source: CatalogSource = 'bundled'
  private checkedAt = 0
  private error?: string
  private refreshing?: Promise<CatalogSnapshot>
  private readonly remoteUrl: string
  private readonly preferBundled: boolean
  private readonly refreshIntervalMs: number
  private readonly fetcher: (url: string, init: RequestInit) => Promise<FetchResponse>
  private readonly now: () => number

  constructor(private readonly profileDir: string, options: CatalogStoreOptions = {}) {
    const bundled = loadCatalog()
    this.current = bundled
    this.remoteUrl = options.remoteUrl ?? REMOTE_CATALOG_URL
    this.preferBundled = options.preferBundled ?? process.env[LOCAL_CATALOG_ENV] === '1'
    this.refreshIntervalMs = options.refreshIntervalMs ?? CATALOG_REFRESH_INTERVAL_MS
    this.fetcher = options.fetcher ?? ((url, init) => fetch(url, init))
    this.now = options.now ?? Date.now

    const file = cacheFile(profileDir)
    if (!this.preferBundled && existsSync(file)) {
      try {
        const cached = validateCatalog(JSON.parse(readFileSync(file, 'utf8')))
        if (Date.parse(cached.generatedAt) >= Date.parse(bundled.generatedAt)) {
          this.current = cached
          this.source = 'cache'
        }
      } catch (error) {
        this.error = `cached catalog rejected: ${errorMessage(error)}`
      }
    }
  }

  snapshot(): CatalogSnapshot {
    return {
      catalog: this.current,
      source: this.source,
      lastCheckedAt: this.checkedAt === 0 ? null : new Date(this.checkedAt).toISOString(),
      ...(this.error ? { error: this.error } : {}),
    }
  }

  async refresh(force = false): Promise<CatalogSnapshot> {
    if (this.preferBundled) return this.snapshot()
    if (!force && this.checkedAt !== 0 && this.now() - this.checkedAt < this.refreshIntervalMs) return this.snapshot()
    if (this.refreshing !== undefined) return this.refreshing
    this.refreshing = this.fetchRemote()
    try { return await this.refreshing } finally { this.refreshing = undefined }
  }

  private async fetchRemote(): Promise<CatalogSnapshot> {
    this.checkedAt = this.now()
    try {
      const response = await this.fetcher(this.remoteUrl, {
        headers: { accept: 'application/json', 'user-agent': 'dsh-skin-market/remote-catalog' },
        signal: AbortSignal.timeout(12_000),
      })
      if (!response.ok) throw new Error(`remote catalog returned HTTP ${response.status}`)
      const remote = validateCatalog(await response.json())
      const remoteTime = Date.parse(remote.generatedAt)
      const currentTime = Date.parse(this.current.generatedAt)
      if (remoteTime < currentTime) throw new Error('remote catalog is older than the accepted catalog')
      if (remoteTime === currentTime && JSON.stringify(remote.skins) !== JSON.stringify(this.current.skins)) {
        throw new Error('remote catalog changed without a new generatedAt timestamp')
      }
      this.current = remote
      this.source = 'remote'
      this.error = undefined
      atomicWriteJson(cacheFile(this.profileDir), encodeCatalogWire(remote))
    } catch (error) {
      this.error = errorMessage(error)
    }
    return this.snapshot()
  }
}

export function repositorySlug(repo: string): string {
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/?$/.exec(repo)
  if (match === null) throw new Error(`invalid GitHub repository: ${repo}`)
  return match[1]
}

export function recommend(current: SkinEntry, catalog: SkinEntry[], stars: ReadonlyMap<string, number>): string[] {
  const score = (candidate: SkinEntry): number => {
    const sharedTags = candidate.tags.filter(tag => current.tags.includes(tag)).length
    const sharedModes = candidate.modes.filter(mode => current.modes.includes(mode)).length
    const recent = Date.now() - Date.parse(candidate.releaseUpdatedAt) <= 30 * 86400000 ? 1 : 0
    return sharedTags * 4 + sharedModes * 2 + Math.log1p(stars.get(candidate.id) ?? candidate.starsSnapshot) + recent - candidate.featuredRank / 100
  }
  return catalog.filter(item => item.id !== current.id).sort((a, b) => score(b) - score(a)).slice(0, 4).map(item => item.id)
}

export async function catalogWithStars(_profileDir: string, catalog = loadCatalog()): Promise<CatalogSkin[]> {
  const starMap = new Map(catalog.skins.map(skin => [skin.id, skin.starsSnapshot]))
  return catalog.skins.map(skin => ({
    ...skin,
    githubStars: skin.starsSnapshot,
    starsStale: false,
    recommendations: recommend(skin, catalog.skins, starMap),
  }))
}
