import { decodeCatalogWire } from '../src/catalog-wire.ts'
import { localizedSkinNameRecord } from '../src/localized-copy.ts'
import type { SkinHeat } from '../src/types.ts'

interface CatalogResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

type CatalogFetcher = (url: string, init: RequestInit) => Promise<CatalogResponse>

export const REMOTE_CATALOG_URL = 'https://raw.githubusercontent.com/kingOfSoySauce/dsh-skin-market/main/data/catalog.json'
export const REMOTE_STAR_CURVES_URL = 'https://raw.githubusercontent.com/kingOfSoySauce/dsh-skin-market/main/data/star-curves.json'

export type CatalogLoadErrorCode = 'request' | 'invalidResponse' | 'unsupportedVersion' | 'missingSkins'

export class CatalogLoadError extends Error {
  readonly code: CatalogLoadErrorCode
  readonly status?: number

  constructor(code: CatalogLoadErrorCode, status?: number) {
    super(code)
    this.name = 'CatalogLoadError'
    this.code = code
    this.status = status
  }
}

export async function fetchLiveCatalog<T>(url: string, fetcher: CatalogFetcher = fetch): Promise<T[]> {
  const response = await fetcher(url, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new CatalogLoadError('request', response.status)
  let value: unknown
  try {
    value = await response.json()
  } catch {
    throw new CatalogLoadError('invalidResponse')
  }
  if (typeof value !== 'object' || value === null) throw new CatalogLoadError('invalidResponse')
  const catalog = value as { schemaVersion?: unknown; skins?: unknown }
  if (catalog.schemaVersion !== 1) throw new CatalogLoadError('unsupportedVersion')
  if (!Array.isArray(catalog.skins)) throw new CatalogLoadError('missingSkins')
  let decoded: ReturnType<typeof decodeCatalogWire>
  try {
    decoded = decodeCatalogWire(value)
  } catch {
    throw new CatalogLoadError('invalidResponse')
  }
  // Momentum rides beside skins[], outside the per-skin schema shared with
  // installed clients. Attach it for the page's sorting and badges.
  for (const skin of decoded.skins) {
    const heat = decoded.heat?.[skin.id]
    if (heat !== undefined) (skin as typeof skin & { heat?: SkinHeat }).heat = heat
    const localizedCopy = decoded.displayCopy?.skins[skin.id]
    if (localizedCopy !== undefined) {
      ;(skin as typeof skin & { localizedCopy?: typeof localizedCopy }).localizedCopy = localizedCopy
      skin.name = localizedSkinNameRecord(skin.name, localizedCopy)
    }
  }
  return decoded.skins as T[]
}

export async function fetchLiveCatalogWithFallback<T>(remoteUrl: string, fallbackUrl: string, fetcher: CatalogFetcher = fetch): Promise<T[]> {
  try {
    return await fetchLiveCatalog<T>(remoteUrl, fetcher)
  } catch (remoteError) {
    try {
      return await fetchLiveCatalog<T>(fallbackUrl, fetcher)
    } catch {
      throw remoteError
    }
  }
}
