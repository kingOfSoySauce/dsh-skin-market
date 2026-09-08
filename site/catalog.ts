import { decodeCatalogWire } from '../src/catalog-wire.ts'

interface CatalogResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

type CatalogFetcher = (url: string, init: RequestInit) => Promise<CatalogResponse>

export const REMOTE_CATALOG_URL = 'https://raw.githubusercontent.com/kingOfSoySauce/dsh-skin-market/main/data/catalog.json'

export async function fetchLiveCatalog<T>(url: string, fetcher: CatalogFetcher = fetch): Promise<T[]> {
  const response = await fetcher(url, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`目录请求失败（HTTP ${response.status}）`)
  const value = await response.json()
  if (typeof value !== 'object' || value === null) throw new Error('目录响应不是对象')
  const catalog = value as { schemaVersion?: unknown; skins?: unknown }
  if (catalog.schemaVersion !== 1) throw new Error('目录版本不受支持')
  if (!Array.isArray(catalog.skins)) throw new Error('目录缺少皮肤列表')
  return decodeCatalogWire(value).skins as T[]
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
