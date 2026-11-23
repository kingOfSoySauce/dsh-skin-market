import type { CatalogSort } from '../catalog-order.ts'

/**
 * The two market navigation choices a user makes explicitly survive a remount:
 * the catalog sort order and the home discovery categories. Search text, range
 * filter, pagination and the selected skin stay per-mount so a restored page
 * cannot surprise the next visit.
 */
export const VIEW_PREFERENCES_KEY = 'dsh-skin-market:view-preferences:v1'

export const VIEW_CATEGORIES = ['skin', 'pet', 'player', 'splash'] as const
export type ViewCategory = typeof VIEW_CATEGORIES[number]

export interface MarketViewPreferences {
  sortBy: CatalogSort
  categories: readonly ViewCategory[]
}

type ReadStorage = Pick<Storage, 'getItem'>
type WriteStorage = Pick<Storage, 'setItem'>

const DEFAULT_CATEGORIES: readonly ViewCategory[] = Object.freeze(['skin', 'splash'] as const)
const DEFAULT_VIEW: MarketViewPreferences = { sortBy: 'heat', categories: DEFAULT_CATEGORIES }

/** Frozen because reads return this shared value whenever storage is unusable. */
export const DEFAULT_MARKET_VIEW: MarketViewPreferences = Object.freeze(DEFAULT_VIEW)

/** Storage access itself throws when the host disabled it, so probe defensively. */
function browserStorage(): (ReadStorage & WriteStorage) | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function isViewCategory(value: unknown): value is ViewCategory {
  return typeof value === 'string' && (VIEW_CATEGORIES as readonly string[]).includes(value)
}

function normalizeSortBy(value: unknown): CatalogSort {
  return value === 'stars' || value === 'latest' || value === 'heat' ? value : DEFAULT_MARKET_VIEW.sortBy
}

/**
 * A category field is only trusted when it is a non-empty list of known
 * categories. One unknown item forfeits the whole field; valid selections are
 * deduplicated and rewritten in VIEW_CATEGORIES order so a stored value is
 * stable no matter how the user toggled the buttons.
 */
function normalizeCategories(value: unknown): readonly ViewCategory[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isViewCategory)) return DEFAULT_MARKET_VIEW.categories
  const selected = new Set(value as ViewCategory[])
  return VIEW_CATEGORIES.filter(category => selected.has(category))
}

export function readMarketViewPreferences(storage: ReadStorage | null = browserStorage()): MarketViewPreferences {
  if (storage === null) return DEFAULT_MARKET_VIEW
  let raw: string | null
  try {
    raw = storage.getItem(VIEW_PREFERENCES_KEY)
  } catch {
    return DEFAULT_MARKET_VIEW
  }
  if (raw === null) return DEFAULT_MARKET_VIEW
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return DEFAULT_MARKET_VIEW
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return DEFAULT_MARKET_VIEW
  const candidate = parsed as { sortBy?: unknown; categories?: unknown }
  // Each field falls back on its own so a stale category list cannot discard a
  // perfectly valid sort choice.
  return {
    sortBy: normalizeSortBy(candidate.sortBy),
    categories: normalizeCategories(candidate.categories),
  }
}

export function writeMarketViewPreferences(preferences: MarketViewPreferences, storage: WriteStorage | null = browserStorage()): void {
  if (storage === null) return
  const { categories } = preferences
  // An empty selection is a transient in-memory view: persisting it would leave
  // the next mount with an empty discovery area, so the defaults win instead.
  if (!Array.isArray(categories) || categories.length === 0) return
  const value: MarketViewPreferences = {
    sortBy: normalizeSortBy(preferences.sortBy),
    categories: normalizeCategories(categories),
  }
  try {
    storage.setItem(VIEW_PREFERENCES_KEY, JSON.stringify(value))
  } catch {
    // Disabled or full storage keeps the in-memory choice; never block rendering.
  }
}
