import type { CatalogSort } from '../src/catalog-order.ts'

/** Market categories the page can filter by, in canonical URL/display order. */
export const SITE_VIEW_CATEGORIES = ['skin', 'pet', 'player', 'splash'] as const
export type SiteViewCategory = typeof SITE_VIEW_CATEGORIES[number]

export interface SiteViewState {
  query: string
  sort: CatalogSort
  categories: readonly SiteViewCategory[]
}

export const DEFAULT_SITE_VIEW: SiteViewState = Object.freeze({
  query: '',
  sort: 'heat',
  categories: Object.freeze(['skin', 'splash'] as const),
})

const CATALOG_SORTS: readonly CatalogSort[] = ['heat', 'stars', 'latest']

function isSiteViewCategory(value: string): value is SiteViewCategory {
  return (SITE_VIEW_CATEGORIES as readonly string[]).includes(value)
}

/** Drop unknown values and duplicates, then keep the canonical category order. */
function canonicalCategories(values: Iterable<string>): SiteViewCategory[] {
  const present = new Set<string>()
  for (const value of values) present.add(value.trim())
  return SITE_VIEW_CATEGORIES.filter(category => present.has(category))
}

function isDefaultCategorySet(categories: readonly SiteViewCategory[]): boolean {
  if (categories.length !== DEFAULT_SITE_VIEW.categories.length) return false
  const present = new Set(categories)
  return DEFAULT_SITE_VIEW.categories.every(category => present.has(category))
}

function readSort(value: string | null): CatalogSort {
  return (CATALOG_SORTS as readonly string[]).includes(value ?? '') ? value as CatalogSort : 'heat'
}

function readCategories(value: string | null): readonly SiteViewCategory[] {
  if (value === null) return DEFAULT_SITE_VIEW.categories
  // An explicit empty set has to stay distinguishable from "no cat param".
  if (value.trim() === 'none') return []
  const categories = canonicalCategories(value.split(','))
  return categories.length > 0 ? categories : DEFAULT_SITE_VIEW.categories
}

/** Parse shareable view state from a location search string ("", "?q=..."). */
export function readSiteView(search: string): SiteViewState {
  const params = new URLSearchParams(search)
  const query = params.get('q')
  return {
    query: query ?? DEFAULT_SITE_VIEW.query,
    sort: readSort(params.get('sort')),
    categories: readCategories(params.get('cat')),
  }
}

/**
 * Serialize the view into a location search string, keeping every parameter
 * this module does not own (dsh-media and future debug flags). Defaults are
 * omitted so a fresh page keeps a clean URL.
 */
export function writeSiteView(search: string, view: SiteViewState): string {
  const params = new URLSearchParams(search)
  if (view.query === '') params.delete('q')
  else params.set('q', view.query)
  if (view.sort === 'heat') params.delete('sort')
  else params.set('sort', view.sort)
  const categories = canonicalCategories(view.categories)
  if (isDefaultCategorySet(categories)) params.delete('cat')
  else if (categories.length === 0) params.set('cat', 'none')
  else params.set('cat', categories.join(','))
  const serialized = params.toString()
  return serialized === '' ? '' : `?${serialized}`
}
