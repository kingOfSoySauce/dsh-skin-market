import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, Check, Copy, DownloadSimpleIcon, GithubLogo, MagnifyingGlass, Moon, Sun, Translate, X } from '@phosphor-icons/react'
import { StarFillIcon, StarIcon } from '@primer/octicons-react'
import { CatalogLoadError, fetchLiveCatalog, fetchLiveCatalogWithFallback, REMOTE_CATALOG_URL, REMOTE_STAR_CURVES_URL } from './catalog.ts'
import { curveDayLabel, curveEntry, parseStarCurves, sparklineGeometry } from '../src/star-curves.ts'
import { comparePublicCatalogOrder, shouldRenderPublicPreview } from './catalog-order.ts'
import type { CatalogSort } from '../src/catalog-order.ts'
import { getCatalogListScreenshot, getCatalogScreenshotUrls, usesMarketScreenshots } from '../src/catalog-order.ts'
import { generatedMediaFor, generatedMediaManifestUrl, generatedMediaUrl, hasGeneratedMediaBase, parseGeneratedMediaManifest, previewSourceCandidates, setGeneratedMediaSources } from '../src/media-preview.ts'
import { useLazyMedia } from '../src/media-visibility.ts'
import type { CatalogSkin } from '../src/client/types.ts'
import { MARKET_CLI_COMMAND, MARKET_DESKTOP_INPUT, MARKET_PUBLIC_URL, MARKET_REPOSITORY, marketPrompt, skinDesktopInput, skinPrompt, skinWebCommandGroups } from './prompts.ts'
import type { InstallCommandGroup } from '../src/client/submission.ts'
import { githubRepoLabel } from '../src/display-title.ts'
import { localizedSkinDescription } from '../src/localized-copy.ts'
import { matchesCatalogSearch } from '../src/catalog-search.ts'
import { SitePreferencesProvider, useSitePreferences, type SiteTheme } from './preferences.tsx'
import { localizedSkinName, type MessageKey, type SiteLanguage, type SiteTranslator } from './messages.ts'
import { liveStars, withLiveReading, type LiveStarLoader, type LiveStarReading } from './live-stars.ts'
import './site.css'
import '../src/client/media-hover.module.css'

interface Skin extends CatalogSkin {
  featuredRank: number
  starsSnapshot: number
  updatedAt: string
}

function starTime(value: number, language: SiteLanguage): string {
  return new Date(value).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function starsTitle(skin: Skin, live: LiveStarReading | undefined, t: SiteTranslator, language: SiteLanguage): string | undefined {
  if (live !== undefined) return t('skin.starsLive', { date: starTime(live.observedAt, language) })
  const snapshotAt = Date.parse(skin.starsUpdatedAt)
  return Number.isFinite(snapshotAt) ? t('skin.starsSnapshot', { date: starTime(snapshotAt, language) }) : undefined
}

const GALLERY_INTERVAL_MS = 5600
const FEED_COMPACT_EXIT_OFFSET = 16
const CATALOG_SORTS: readonly CatalogSort[] = ['heat', 'stars', 'latest']
const CATALOG_SORT_MESSAGE_KEYS: Record<CatalogSort, MessageKey> = { heat: 'sort.heat', stars: 'sort.stars', latest: 'sort.latest' }
const MARKET_CATEGORIES = ['skin', 'pet', 'player', 'splash'] as const
type MarketCategory = typeof MARKET_CATEGORIES[number]
const MARKET_CATEGORY_MESSAGE_KEYS: Record<MarketCategory, MessageKey> = { skin: 'category.skin', pet: 'category.pet', player: 'category.player', splash: 'category.splash' }
const LANGUAGE_OPTIONS: readonly { value: SiteLanguage; label: MessageKey }[] = [
  { value: 'zh', label: 'preferences.language.zh' },
  { value: 'en', label: 'preferences.language.en' },
]
const THEME_OPTIONS: readonly { value: SiteTheme; label: MessageKey; description?: MessageKey }[] = [
  { value: 'auto', label: 'preferences.theme.auto', description: 'preferences.theme.description.auto' },
  { value: 'light', label: 'preferences.theme.light' },
  { value: 'dark', label: 'preferences.theme.dark' },
]

function marketCategory(skin: { category?: string }): MarketCategory {
  return skin.category === 'pet' || skin.category === 'player' || skin.category === 'splash' ? skin.category : 'skin'
}


function StarSpark({ values, from, live, title, language }: { values: number[] | undefined; from: number | undefined; live?: LiveStarReading; title?: string; language: string }) {
  const VIEW_W = 1000
  const VIEW_H = 100
  const LABEL = 10
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const series = useMemo(
    () => values === undefined || from === undefined ? undefined : withLiveReading(values, from, live),
    [values, from, live],
  )
  const geometry = useMemo(
    () => series === undefined ? undefined : sparklineGeometry(series, VIEW_W - LABEL, VIEW_H),
    [series],
  )
  const [hovered, setHovered] = useState<number | null>(null)
  if (geometry === undefined || series === undefined) return null
  const current = series[series.length - 1]
  const active = hovered === null ? undefined : geometry.points[hovered]
  const activeValue = active === undefined ? undefined : Math.round(active.value)
  // The fill stops at the last sample, straight down to the baseline.
  const area = `${geometry.d} L${geometry.end.x} ${VIEW_H} L${geometry.points[0].x} ${VIEW_H} Z`
  return <figure className="skin-spark">
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`stars 从 ${series[0]} 涨到 ${current}`}
      onMouseMove={event => {
        const rect = event.currentTarget.getBoundingClientRect()
        const x = ((event.clientX - rect.left) / rect.width) * VIEW_W
        let best = 0
        for (let index = 1; index < geometry.points.length; index += 1) {
          if (Math.abs(geometry.points[index].x - x) < Math.abs(geometry.points[best].x - x)) best = index
        }
        setHovered(best)
      }}
      onMouseLeave={() => setHovered(null)}
    >
      <defs>
        <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="skin-spark-fill-top" />
          <stop offset="78%" className="skin-spark-fill-mid" />
          <stop offset="100%" className="skin-spark-fill-end" />
        </linearGradient>
      </defs>
      <path className="skin-spark-area" d={area} fill={`url(#${uid}-fill)`} />
      <path className="skin-spark-line" d={geometry.d} vectorEffect="non-scaling-stroke" />
    </svg>
    <span
      className="skin-spark-end"
      style={{ left: `${(geometry.end.x / VIEW_W) * 100}%`, top: `${(geometry.end.y / VIEW_H) * 100}%` }}
      title={title}
    >{current}<StarFillIcon size={12} aria-hidden="true" /></span>
    {active !== undefined && from !== undefined && activeValue !== undefined && <span
      className="skin-spark-tip"
      style={{ left: `${(active.x / VIEW_W) * 100}%`, top: `${(active.y / VIEW_H) * 100}%` }}
    >{curveDayLabel(from, geometry.dayOf(active.ratio), language)} · {activeValue}</span>}
  </figure>
}

const BRAND_MARK = 'M222.4 55.9L172.7 39.3L169.7 39.2L164.4 42.4L158.3 56.1L150.2 64.9L143.4 69.1L135.9 71.7L124.0 72.3L112.6 69.1L105.8 64.9L97.7 56.1L91.6 42.4L88.7 40.0L85.1 39.0L32.6 56.2L26.4 60.3L22.4 66.6L21.2 73.9L25.8 101.6L27.6 105.4L30.5 107.7L34.1 108.6L66.6 108.7L66.7 200.4L68.1 205.9L71.9 211.6L77.7 215.5L84.7 216.9L172.5 216.9L178.2 215.6L184.1 211.7L187.5 206.9L189.3 200.1L189.4 108.7L222.5 108.6L226.0 107.4L229.0 104.5L230.2 101.6L234.5 76.0L234.6 70.7L233.6 66.6L231.0 61.9L227.2 58.3L222.4 55.9Z'

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 256 256" role="img" aria-label="DSH 皮肤市场">
      <path d={BRAND_MARK} fill="none" stroke="currentColor" strokeWidth="18.4" strokeLinejoin="round" />
    </svg>
  )
}

function terminalMessageKey(key: string): MessageKey | undefined {
  if (key === 'posix') return 'install.terminal.posix'
  if (key === 'powershell') return 'install.terminal.powershell'
  if (key === 'cmd') return 'install.terminal.cmd'
  return undefined
}

function ControlPopover({ width, children }: { width: number; children: ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const [alignment, setAlignment] = useState<'center' | 'start' | 'end'>('center')

  useLayoutEffect(() => {
    const updateAlignment = () => {
      const wrapper = wrapperRef.current
      if (wrapper === null) return
      const rect = wrapper.getBoundingClientRect()
      const centeredLeft = rect.left + (rect.width - width) / 2
      const next = centeredLeft < 8 ? 'start' : centeredLeft + width > window.innerWidth - 8 ? 'end' : 'center'
      setAlignment(current => current === next ? current : next)
    }
    updateAlignment()
    window.addEventListener('resize', updateAlignment)
    return () => window.removeEventListener('resize', updateAlignment)
  }, [width])

  return <div className="control-popover-wrap" ref={wrapperRef} data-popover-align={alignment}>{children}</div>
}

function SitePreferencesControls() {
  const { language, theme, resolvedTheme, t, setLanguage, setTheme } = useSitePreferences()
  const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark'
  const themeIcon = resolvedTheme === 'dark' ? <Sun size={16} weight="regular" aria-hidden="true" /> : <Moon size={16} weight="regular" aria-hidden="true" />
  const selectedTheme = THEME_OPTIONS.find(option => option.value === theme) ?? THEME_OPTIONS[0]!
  return <div className="site-preferences" role="group" aria-label={t('preferences.group')}>
    <ControlPopover width={148}>
      <button
        type="button"
        className="preference-icon-button"
        aria-label={t('preferences.language.label')}
        aria-haspopup="dialog"
        onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
      >
        <Translate size={16} weight="regular" aria-hidden="true" />
      </button>
      <div className="control-popover language-popover" role="dialog" aria-label={t('preferences.language.menu')}>
        <span className="preference-popover-title">{t('preferences.language.menu')}</span>
        <div className="preference-segmented preference-segmented-two" role="group" aria-label={t('preferences.language.menu')}>
          {LANGUAGE_OPTIONS.map(option => <button key={option.value} type="button" aria-pressed={language === option.value} data-selected={language === option.value} onClick={() => setLanguage(option.value)}><span>{t(option.label)}</span></button>)}
        </div>
      </div>
    </ControlPopover>
    <ControlPopover width={220}>
      <button
        type="button"
        className="preference-icon-button"
        data-theme-preference={theme}
        aria-label={t('preferences.theme.label')}
        aria-haspopup="dialog"
        onClick={() => setTheme(nextTheme)}
      >
        {themeIcon}
      </button>
      <div className="control-popover theme-popover" role="dialog" aria-label={t('preferences.theme.menu')}>
        <span className="preference-popover-title">{t('preferences.theme.menu')}</span>
        <div className="preference-segmented preference-segmented-three" role="group" aria-label={t('preferences.theme.menu')}>
          {THEME_OPTIONS.map(option => <button key={option.value} type="button" aria-pressed={theme === option.value} data-selected={theme === option.value} onClick={() => setTheme(option.value)}>{option.value === 'light' ? <Sun size={13} weight="regular" aria-hidden="true" /> : option.value === 'dark' ? <Moon size={13} weight="regular" aria-hidden="true" /> : null}<span>{t(option.label)}</span></button>)}
        </div>
        {selectedTheme.description !== undefined && <p className="preference-description">{t(selectedTheme.description)}</p>}
      </div>
    </ControlPopover>
  </div>
}

function CatalogSortOptions({ value, onChange }: { value: CatalogSort; onChange: (value: CatalogSort) => void }) {
  const { t } = useSitePreferences()
  return <div className="sort-options" role="group" aria-label={t('sort.label')}>
    {CATALOG_SORTS.map(sort => <button key={sort} type="button" className="sort-option" aria-pressed={value === sort} onClick={() => onChange(sort)}>{t(CATALOG_SORT_MESSAGE_KEYS[sort])}</button>)}
  </div>
}

function DiscoverToolbar({ docked = false, placeholderRef, enabledCategories, onToggleCategory, sort, onSort }: {
  docked?: boolean
  placeholderRef?: Ref<HTMLDivElement>
  enabledCategories: ReadonlySet<MarketCategory>
  onToggleCategory: (category: MarketCategory) => void
  sort: CatalogSort
  onSort: (sort: CatalogSort) => void
}) {
  const { t } = useSitePreferences()
  return <div className="feed-section-title" ref={placeholderRef} data-header-discover={placeholderRef === undefined ? '' : undefined} data-docked={docked ? 'true' : undefined} aria-hidden={docked ? true : undefined}>
    <div className="discover-heading">
      <div className="filter-options" role="group" aria-label={t('category.label')}>
        {MARKET_CATEGORIES.map(category => <button key={category} type="button" className="sort-option" aria-pressed={enabledCategories.has(category)} onClick={() => onToggleCategory(category)}>{t(MARKET_CATEGORY_MESSAGE_KEYS[category])}</button>)}
      </div>
    </div>
    <CatalogSortOptions value={sort} onChange={onSort} />
  </div>
}

function CatalogCard({ skin, live, onOpen, onInstall }: { skin: Skin; live?: LiveStarReading; onOpen: () => void; onInstall: () => void }) {
  const { language, t } = useSitePreferences()
  const repoLabel = githubRepoLabel(skin.repo)
  const title = localizedSkinName(skin, language)
  const description = localizedSkinDescription(skin.description, skin.localizedCopy, language)
  const manualOnly = skin.review?.installation === 'manual-only'
  return <article className="feed-card">
    <button className="feed-card-open dsh-skin-media-hover" aria-label={t('skin.preview', { name: title })} onClick={onOpen}>
      <span className="feed-card-media"><PreviewMedia skin={skin} src={getCatalogListScreenshot(skin)} fallbackSources={getCatalogScreenshotUrls(skin)} alt={t('skin.preview', { name: title })} kind="card" loading="lazy" /></span>
      <span className="feed-card-copy">
        <span className="feed-card-title"><strong title={title}>{title}</strong><span className="feed-card-stats" title={starsTitle(skin, live, t, language)}><StarIcon size={12} /> {live?.stars ?? skin.starsSnapshot}</span></span>
        {description !== undefined && <span className="feed-card-description" title={description}>{description}</span>}
      </span>
    </button>
    <div className="feed-card-footer">
      <small title={repoLabel}>{repoLabel}</small>
      <button className="button outline card-install" onClick={onInstall}>{manualOnly ? t('skin.manualInstall') : t('skin.install')}</button>
    </div>
  </article>
}

function FeedHeader({ searchSlotRef }: { searchSlotRef?: Ref<HTMLDivElement> }) {
  return <div className="feed-search-slot" ref={searchSlotRef} aria-hidden="true" />
}

function GalleryPreloads({ skin, screenshots }: { skin: Skin; screenshots: string[] }) {
  return <>{screenshots.map((source, index) => {
    const media = generatedMediaFor(skin, source, 'gallery')
    return media === undefined ? null : <link key={`${source}:${index}`} rel="preload" as="image" href={generatedMediaUrl(media.full)} />
  })}</>
}

function SearchBox({ query, onQueryChange, style }: { query: string; onQueryChange: (value: string) => void; style?: CSSProperties }) {
  const { t } = useSitePreferences()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const clear = () => {
    onQueryChange('')
    inputRef.current?.focus()
  }
  return <div className="search site-search" style={style}><MagnifyingGlass size={18} /><input ref={inputRef} value={query} onChange={event => onQueryChange(event.currentTarget.value)} placeholder={t('search.label')} aria-label={t('search.label')} />{query.length > 0 && <button type="button" className="search-clear" aria-label={t('search.clear')} title={t('search.clear')} onMouseDown={event => event.preventDefault()} onClick={clear}><X size={16} aria-hidden="true" /></button>}</div>
}

export function App({ skins, curves = {}, liveStarLoader }: { skins: Skin[]; curves?: Record<string, { from: number; stars: number[] }>; liveStarLoader?: LiveStarLoader }) {
  const { language, t } = useSitePreferences()
  const [selectedId, setSelectedId] = useState(skins[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<CatalogSort>('heat')
  const [enabledCategories, setEnabledCategories] = useState<ReadonlySet<MarketCategory>>(() => new Set<MarketCategory>(['skin', 'splash']))
  const [discoverDocked, setDiscoverDocked] = useState(false)
  const discoverDockedRef = useRef(false)
  const discoverTitleRef = useRef<HTMLDivElement | null>(null)
  const syncDiscoverDockRef = useRef<() => void>(() => {})
  const [shot, setShot] = useState(0)
  const [galleryPaused, setGalleryPaused] = useState(false)
  const [carouselEpoch, setCarouselEpoch] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [visibleCount, setVisibleCount] = useState(24)
  const [feedCompact, setFeedCompact] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [installDialog, setInstallDialog] = useState<'market' | 'skin' | null>(null)
  const detailRef = useRef<HTMLElement | null>(null)
  const feedSearchSlotRef = useRef<HTMLDivElement | null>(null)
  const pageShellRef = useRef<HTMLDivElement | null>(null)
  const topbarRef = useRef<HTMLElement | null>(null)
  const brandRef = useRef<HTMLAnchorElement | null>(null)
  const topActionsRef = useRef<HTMLElement | null>(null)
  const [searchStyle, setSearchStyle] = useState<CSSProperties | undefined>(undefined)
  const [liveStarsBySkin, setLiveStarsBySkin] = useState<Record<string, LiveStarReading>>({})

  const selected = skins.find(item => item.id === selectedId) ?? skins[0]
  const selectedName = selected === undefined ? '' : localizedSkinName(selected, language)
  const selectedDescription = selected === undefined ? undefined : localizedSkinDescription(selected.description, selected.localizedCopy, language)
  const selectedScreenshots = selected === undefined ? [] : getCatalogScreenshotUrls(selected)
  // A repository without a usable timeline still needs its number: the chart is
  // the only other place the panel shows it.
  const selectedCurve = selected === undefined ? undefined : curveEntry(curves, selected.repo)
  const shotCount = selectedScreenshots.length
  const filtered = useMemo(() => skins
    .filter(skin => matchesCatalogSearch(skin, query) && enabledCategories.has(marketCategory(skin)))
    .sort((a, b) => comparePublicCatalogOrder(a, b, sort)), [enabledCategories, query, sort])
  const visibleSkins = filtered.slice(0, visibleCount)

  const recommendations = selected === undefined
    ? []
    : skins.filter(item => item.id !== selected.id && item.review?.compatibility === 'verified')
      .sort((a, b) => {
        const aMatch = a.tags.filter(tag => selected.tags.includes(tag)).length
        const bMatch = b.tags.filter(tag => selected.tags.includes(tag)).length
        return bMatch - aMatch || b.starsSnapshot - a.starsSnapshot
      }).slice(0, 4)

  // The grid keeps the catalog snapshot, which is what sorting and first paint
  // use. Opening a detail asks GitHub for the current count instead of waiting
  // for the next catalog build; the loader caches and backs off on rate limits,
  // and a failed request leaves the snapshot number in place.
  useEffect(() => {
    const active = selected
    if (liveStarLoader === undefined || !detailOpen || active === undefined) return
    let disposed = false
    void liveStarLoader.load(active.repo).then(reading => {
      if (disposed || reading === undefined) return
      setLiveStarsBySkin(current => {
        const prior = current[active.id]
        if (prior !== undefined && prior.observedAt === reading.observedAt && prior.stars === reading.stars) return current
        return { ...current, [active.id]: reading }
      })
    })
    return () => { disposed = true }
  }, [detailOpen, liveStarLoader, selected?.id, selected?.repo])

  const select = (id: string) => {
    setSelectedId(id)
    setShot(0)
    setDetailOpen(true)
  }

  useEffect(() => { setVisibleCount(24) }, [enabledCategories, query, sort])
  useLayoutEffect(() => { syncDiscoverDockRef.current() })
  useEffect(() => {
    const update = () => syncDiscoverDockRef.current()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  useEffect(() => {
    const updateFeedHeader = () => {
      const slotTop = feedSearchSlotRef.current?.getBoundingClientRect().top
      if (slotTop === undefined) return
      const headerTop = slotTop - (window.matchMedia('(max-width: 820px)').matches ? 18 : 22)
      setFeedCompact(current => current
        ? headerTop <= FEED_COMPACT_EXIT_OFFSET
        : headerTop <= 0)
    }
    updateFeedHeader()
    window.addEventListener('scroll', updateFeedHeader, { passive: true })
    return () => window.removeEventListener('scroll', updateFeedHeader)
  }, [])

  const updateSearchGeometry = useCallback(() => {
    const shell = pageShellRef.current
    const slot = feedSearchSlotRef.current
    const topbar = topbarRef.current
    const brand = brandRef.current
    const actions = topActionsRef.current
    if (shell === null || slot === null || topbar === null || brand === null || actions === null) return
    const shellRect = shell.getBoundingClientRect()
    const slotRect = slot.getBoundingClientRect()
    if (!feedCompact) {
      setSearchStyle({ position: 'absolute', zIndex: 1, visibility: 'visible', top: slotRect.top - shellRect.top, left: slotRect.left - shellRect.left, width: slotRect.width })
      return
    }
    const row = topbar.querySelector('.topbar-main') ?? topbar
    const rowRect = row.getBoundingClientRect()
    const brandRect = brand.getBoundingClientRect()
    const actionsRect = actions.getBoundingClientRect()
    const gap = window.matchMedia('(max-width: 820px)').matches ? 10 : 24
    const availableLeft = brandRect.right + gap
    const availableRight = actionsRect.left - gap
    const width = Math.max(0, Math.min(520, availableRight - availableLeft))
    setSearchStyle({ position: 'fixed', zIndex: 21, visibility: 'visible', top: rowRect.top + (rowRect.height - 38) / 2, left: availableRight - width, width, height: 38 })
  }, [feedCompact, language])

  useLayoutEffect(() => {
    updateSearchGeometry()
    window.addEventListener('resize', updateSearchGeometry)
    return () => window.removeEventListener('resize', updateSearchGeometry)
  }, [updateSearchGeometry])

  useLayoutEffect(() => {
    if (detailRef.current !== null) detailRef.current.scrollTop = 0
  }, [selectedId])

  useEffect(() => {
    const loadMore = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 720) {
        setVisibleCount(current => Math.min(filtered.length, current + 24))
      }
    }
    window.addEventListener('scroll', loadMore, { passive: true })
    return () => window.removeEventListener('scroll', loadMore)
  }, [filtered.length])

  useEffect(() => {
    if (!detailOpen) return
    const handleGalleryKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (lightboxOpen) {
          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation()
          setLightboxOpen(false)
        } else setDetailOpen(false)
        return
      }
      if (!lightboxOpen || shotCount < 2) return
      if (event.key === 'ArrowLeft') setShot(current => (current - 1 + shotCount) % shotCount)
      if (event.key === 'ArrowRight') setShot(current => (current + 1) % shotCount)
    }
    window.addEventListener('keydown', handleGalleryKeys, true)
    return () => window.removeEventListener('keydown', handleGalleryKeys, true)
  }, [detailOpen, lightboxOpen, shotCount])

  useEffect(() => {
    const reduceMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!detailOpen || galleryPaused || lightboxOpen || shotCount < 2 || reduceMotion) return
    const timer = window.setTimeout(() => setShot(current => (current + 1) % shotCount), GALLERY_INTERVAL_MS)
    return () => window.clearTimeout(timer)
  }, [carouselEpoch, detailOpen, galleryPaused, lightboxOpen, selected?.id, shot, shotCount])

  useEffect(() => {
    setGalleryPaused(false)
    setLightboxOpen(false)
    setCarouselEpoch(current => current + 1)
  }, [selected?.id])

  const setCarouselPaused = (paused: boolean) => {
    setGalleryPaused(paused)
    setCarouselEpoch(current => current + 1)
  }

  const moveShot = (direction: -1 | 1) => {
    if (shotCount > 1) setShot(current => (current + direction + shotCount) % shotCount)
  }

  const copyPrompt = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(key)
    window.setTimeout(() => setCopied(current => current === key ? null : current), 1800)
  }

  const toggleCategory = (category: MarketCategory) => setEnabledCategories(current => {
    const next = new Set(current)
    if (next.has(category)) next.delete(category)
    else next.add(category)
    return next
  })
  syncDiscoverDockRef.current = () => {
    const title = discoverTitleRef.current
    const header = topbarRef.current
    if (title === null || header === null) return
    const titleRect = title.getBoundingClientRect()
    if (titleRect.height === 0) return
    const shouldDock = titleRect.top <= header.getBoundingClientRect().bottom + 0.5
    if (shouldDock !== discoverDockedRef.current) {
      discoverDockedRef.current = shouldDock
      setDiscoverDocked(shouldDock)
    }
  }

  if (selected === undefined) return <main className="empty-page">{t('catalog.empty')}</main>

  const verified = selected.review?.compatibility !== 'unverified'

  return <div className="page-shell" ref={pageShellRef} data-detail={detailOpen ? 'open' : 'closed'}>
    {detailOpen && <GalleryPreloads skin={selected} screenshots={selectedScreenshots} />}
    <header className="topbar" ref={topbarRef}>
      <div className="topbar-main">
        <a className="brand" ref={brandRef} href={import.meta.env.BASE_URL}>
          <BrandMark />
          <span><strong>{t('site.brand')}</strong><small>dsh-skin-market</small></span>
        </a>
        <nav className="top-actions" ref={topActionsRef} aria-label={t('site.platformActions')}>
          <SitePreferencesControls />
          <ControlPopover width={72}>
            <a className="icon-action-button" href={MARKET_REPOSITORY} target="_blank" rel="noreferrer" aria-label={t('site.github')}><GithubLogo size={17} aria-hidden="true" /></a>
            <div className="control-popover github-popover" role="tooltip">{t('preferences.github.description')}</div>
          </ControlPopover>
          <button className="button outline market-install-button" onClick={() => { setCopied(null); setInstallDialog('market') }}><DownloadSimpleIcon size={17} /><span>{t('site.installMarket')}</span></button>
          <a className="qr-share" href={MARKET_PUBLIC_URL} target="_blank" rel="noreferrer" aria-label={t('site.qr.open')}>
            <span><strong>{t('site.qr.open')}</strong></span>
            <img src={`${import.meta.env.BASE_URL}market-qr.svg`} alt={t('site.qr.alt')} />
          </a>
        </nav>
      </div>
      {discoverDocked && <DiscoverToolbar enabledCategories={enabledCategories} onToggleCategory={toggleCategory} sort={sort} onSort={setSort} />}
    </header>

    <main className="feed-page">
      <FeedHeader searchSlotRef={feedSearchSlotRef} />
      <section className="feed-content" aria-label={t('catalog.section')}>
        <DiscoverToolbar docked={discoverDocked} placeholderRef={discoverTitleRef} enabledCategories={enabledCategories} onToggleCategory={toggleCategory} sort={sort} onSort={setSort} />
        {visibleSkins.length > 0 ? <div className="skin-grid">
          {visibleSkins.map(skin => <CatalogCard key={skin.id} skin={skin} live={liveStarsBySkin[skin.id]} onOpen={() => select(skin.id)} onInstall={() => { setSelectedId(skin.id); setShot(0); setCopied(null); setInstallDialog('skin') }} />)}
        </div> : <p className="no-results feed-empty">{t('catalog.noResults')}</p>}
        {visibleCount < filtered.length && <div className="feed-loading" aria-hidden="true"><span /><span /></div>}
      </section>
    </main>

    <SearchBox query={query} onQueryChange={setQuery} style={searchStyle} />

    {detailOpen && <div className="browser-overlay" role="presentation">
      <button className="browser-mask" aria-hidden="true" tabIndex={-1} onClick={() => setDetailOpen(false)} />
      <section className="browser-panel" role="dialog" aria-modal="true" aria-label={t('skin.details')}>
        <header className="browser-titlebar"><span><strong>{t('skin.details')}</strong></span><button className="button outline" aria-label={t('skin.closeDetails')} title={t('skin.closeDetails')} onClick={() => setDetailOpen(false)}><X size={15} /></button></header>
        <section className="detail" ref={detailRef} aria-label={t('skin.detailsContent')}>
        <button className="mobile-back" onClick={() => setDetailOpen(false)}><ArrowLeft size={16} /> {t('skin.backToDiscover')}</button>
        <header className="skin-head">
          <div className="avatar"><PreviewMedia key={`${selected.id}:${getCatalogListScreenshot(selected) ?? 'missing'}:avatar`} skin={selected} src={getCatalogListScreenshot(selected)} alt="" kind="avatar" /></div>
          <div className="skin-title-copy">
            <h2 title={selectedName}>{selectedName}</h2>
            <div className="repo-row">
              <button className="button primary" onClick={() => { setCopied(null); setInstallDialog('skin') }}>{t('skin.installThis')}</button>
              <a className="repo-line" href={selected.repo} target="_blank" rel="noreferrer"><GithubLogo size={13} aria-hidden="true" /><span>{githubRepoLabel(selected.repo)}</span></a>
            </div>
            {selectedDescription !== undefined && <p className="skin-description" title={selectedDescription}>{selectedDescription}</p>}
            <div className="meta"><span>{t('skin.version', { version: selected.install.version })}</span><span>{t('skin.dshVersion', { version: selected.compatibility.dsh })}</span><span className={verified ? 'verified' : 'unverified'}>{verified ? t('skin.compatibilityVerified') : t('skin.compatibilityPending')}</span>{selectedCurve === undefined && <span className="skin-stars" title={starsTitle(selected, liveStarsBySkin[selected.id], t, language)}><StarFillIcon size={11} aria-hidden="true" /> {liveStarsBySkin[selected.id]?.stars ?? selected.starsSnapshot}</span>}</div>
          </div>
          <StarSpark values={selectedCurve?.stars} from={selectedCurve?.from} live={liveStarsBySkin[selected.id]} title={starsTitle(selected, liveStarsBySkin[selected.id], t, language)} language={language} />
        </header>

        {usesMarketScreenshots(selected) && <p className="notice">{t('skin.marketScreenshotNotice')}</p>}

        <div className="gallery-group" data-paused={galleryPaused ? 'true' : 'false'} onMouseEnter={() => setCarouselPaused(true)} onMouseLeave={() => setCarouselPaused(false)} onFocusCapture={() => setCarouselPaused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setCarouselPaused(false) }}>
          <div className="gallery">
            <button className="gallery-open dsh-skin-media-hover" aria-label={t('gallery.fullscreen', { name: selectedName, index: shot + 1 })} onClick={() => setLightboxOpen(true)}>
              <PreviewMedia key={`${selected.id}:${selectedScreenshots[shot] ?? 'missing'}:gallery`} skin={selected} src={selectedScreenshots[shot]} alt={t('gallery.preview', { name: selectedName })} kind="gallery" />
            </button>
            {shotCount > 1 && <><button className="gallery-nav gallery-prev" aria-label={t('gallery.previous')} onClick={() => moveShot(-1)}><ArrowLeft size={18} /></button><button className="gallery-nav gallery-next" aria-label={t('gallery.next')} onClick={() => moveShot(1)}><ArrowLeft size={18} /></button></>}
          </div>
          {selectedScreenshots.length > 1 && <div className="thumbs" aria-label={t('gallery.selection')}>{selectedScreenshots.map((image, index) => <button className="dsh-skin-media-hover" key={image} data-selected={index === shot} onClick={() => { setShot(index); setCarouselEpoch(current => current + 1) }}><PreviewMedia skin={selected} src={image} alt={t('gallery.viewShot', { index: index + 1 })} kind="thumbnail" loading="lazy" />{index === shot && <span className="thumb-progress" key={`${selected.id}:${shot}:${carouselEpoch}`} aria-hidden="true" />}</button>)}</div>}
        </div>

        <div className="information">
          <article><h3>{t('info.about')}</h3>{selectedDescription !== undefined && <p>{selectedDescription}</p>}<div className="tags">{selected.tags.map(tag => <span key={tag}>{tag}</span>)}</div></article>
          <dl><div><dt>{t('info.license')}</dt><dd>{selected.license.code}</dd></div><div><dt>{t('info.modes')}</dt><dd>{selected.modes.join(' / ')}</dd></div><div><dt>{t('info.platform')}</dt><dd>{selected.compatibility.platform.join(' / ')}</dd></div></dl>
        </div>

        {recommendations.length > 0 && <section className="recommendations"><h3>{t('info.recommendations')}</h3><div>{recommendations.map(skin => <CatalogCard key={skin.id} skin={skin} live={liveStarsBySkin[skin.id]} onOpen={() => { setSelectedId(skin.id); setShot(0) }} onInstall={() => { setSelectedId(skin.id); setShot(0); setCopied(null); setInstallDialog('skin') }} />)}</div></section>}
        </section>
      </section>
    </div>}

    {lightboxOpen && <section className="lightbox" role="dialog" aria-modal="true" aria-label={t('gallery.fullscreenLabel', { name: selectedName })}>
      <button className="lightbox-close" aria-label={t('gallery.close')} onClick={() => setLightboxOpen(false)}><X size={20} /></button>
      {selectedScreenshots.length > 1 && <button className="lightbox-nav lightbox-prev" aria-label={t('gallery.previous')} onClick={() => moveShot(-1)}><ArrowLeft size={26} /></button>}
      <button className="lightbox-stage" aria-label={t('gallery.exit')} onClick={() => setLightboxOpen(false)}><PreviewMedia key={`${selected.id}:${selectedScreenshots[shot] ?? 'missing'}:lightbox`} skin={selected} src={selectedScreenshots[shot]} alt={t('gallery.fullscreen', { name: selectedName, index: shot + 1 })} kind="gallery" /></button>
      {selectedScreenshots.length > 1 && <button className="lightbox-nav lightbox-next" aria-label={t('gallery.next')} onClick={() => moveShot(1)}><ArrowLeft size={26} /></button>}
      {selectedScreenshots.length > 1 && <div className="lightbox-thumbs" aria-label={t('gallery.selection')}>{selectedScreenshots.map((image, index) => <button className="dsh-skin-media-hover" key={image} data-selected={index === shot} aria-label={t('gallery.viewShot', { index: index + 1 })} onClick={() => setShot(index)}><PreviewMedia skin={selected} src={image} alt="" kind="thumbnail" loading="lazy" /></button>)}</div>}
    </section>}

    {installDialog !== null && <div className="install-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setInstallDialog(null) }}>
      <section className="install-dialog" role="dialog" aria-modal="true" aria-labelledby="install-dialog-title">
        <header><div><h2 id="install-dialog-title">{installDialog === 'market' ? t('install.marketTitle') : t('install.skinTitle', { name: selectedName })}</h2><p>{t('install.chooseOne')}</p></div><button aria-label={t('install.close')} onClick={() => setInstallDialog(null)}><X size={18} /></button></header>
        <div className="install-method-grid" data-single={installDialog === 'market' ? 'true' : 'false'}>
          {installDialog === 'skin' && <InstallGroup title={t('install.skinSection')} prompt={skinPrompt(selected, language)} desktopInput={skinDesktopInput(selected)} commandGroups={skinWebCommandGroups(selected)} copyKey="skin" copied={copied} onCopy={copyPrompt} note={t('install.skinNote')} />}
          <InstallGroup title={installDialog === 'skin' ? t('install.marketSection') : undefined} prompt={marketPrompt(language)} desktopInput={MARKET_DESKTOP_INPUT} command={MARKET_CLI_COMMAND} copyKey="market" copied={copied} onCopy={copyPrompt} note={t('install.marketNote')} />
        </div>
      </section>
    </div>}

    <div className="toast" data-visible={copied !== null}>{copied !== null && <><Check size={16} /> {t('toast.copied')}</>}</div>
  </div>
}

function InstallOption({ label, value, copied, onCopy, copyLabel = label, input = false }: { label: string; value: string; copied: boolean; onCopy: () => void; copyLabel?: string; input?: boolean }) {
  const { t } = useSitePreferences()
  return <div className="install-option"><strong>{label}</strong><div className="copy-capsule">{input ? <input aria-label={copyLabel} title={value} value={value} readOnly onFocus={event => event.currentTarget.select()} /> : <code title={value}>{value}</code>}<button aria-label={t(copied ? 'install.copied' : 'install.copy', { label: copyLabel })} title={copied ? t('install.copiedTitle') : t('install.copyTitle')} onClick={onCopy}>{copied ? <Check size={16} /> : <Copy size={16} />}</button></div></div>
}

function InstallGroup({ title, prompt, desktopInput, command, commandGroups, copyKey, copied, onCopy, note }: { title?: string; prompt: string; desktopInput: string; command?: string; commandGroups?: InstallCommandGroup[]; copyKey: string; copied: string | null; onCopy: (key: string, value: string) => Promise<void>; note?: string }) {
  const { t } = useSitePreferences()
  const groupName = copyKey === 'skin' ? t('install.skinSection') : t('install.marketTitle')
  const groups = commandGroups ?? (command === undefined ? [] : [{ key: 'common', label: '', commands: [{ key: 'command', label: t('install.command'), value: command }] }])
  const simpleCommand = groups.length === 1 && groups[0]!.label === '' && groups[0]!.commands.length === 1 ? groups[0]!.commands[0] : undefined
  return <section className="install-group" aria-label={groupName}>
    {title && <h3>{title}</h3>}
    <InstallOption label={t('install.desktop')} value={desktopInput} copyLabel={t('install.copyDesktop', { group: groupName })} input copied={copied === `${copyKey}:keyword`} onCopy={() => void onCopy(`${copyKey}:keyword`, desktopInput)} />
    {simpleCommand !== undefined
      ? <InstallOption label={t('install.command')} value={simpleCommand.value} copyLabel={t('install.copyCommand', { group: groupName })} copied={copied === `${copyKey}:command`} onCopy={() => void onCopy(`${copyKey}:command`, simpleCommand.value)} />
      : groups.length > 0 ? groups.map(group => group.commands.map(entry => {
        const key = `${copyKey}:command:${group.key}:${entry.key}`
        const terminalKey = terminalMessageKey(group.key)
        const terminal = terminalKey === undefined ? group.label || t('install.command') : t(terminalKey)
        const copyLabel = group.label === '' ? t('install.copyCommand', { group: groupName }) : t('install.copyTerminal', { group: groupName, terminal })
        return <InstallOption key={key} label={terminal} value={entry.value} copyLabel={copyLabel} copied={copied === key} onCopy={() => void onCopy(key, entry.value)} />
      })) : <div className="install-option"><strong>{t('install.command')}</strong><div className="copy-capsule install-command-hint"><code title={t('install.manualCommandHint')}>{t('install.manualCommandHint')}</code></div></div>}
    <InstallOption label={t('install.prompt')} value={prompt} copyLabel={t('install.copyPrompt', { group: groupName })} copied={copied === `${copyKey}:prompt`} onCopy={() => void onCopy(`${copyKey}:prompt`, prompt)} />
    {note && <p className="install-note">{note}</p>}
  </section>
}

function Site() {
  const { t } = useSitePreferences()
  const [catalog, setCatalog] = useState<{ skins?: Skin[]; error?: unknown }>({})
  const [curves, setCurves] = useState<Record<string, { from: number; stars: number[] }>>({})
  const [mediaReady, setMediaReady] = useState(() => !hasGeneratedMediaBase())

  useEffect(() => {
    const controller = new AbortController()
    let disposed = false
    const fallbackUrl = `${import.meta.env.BASE_URL}catalog.json`
    const useLocalPreviewCatalog = import.meta.env.DEV || new URLSearchParams(window.location.search).get('dsh-media') === '1'
    const fetchCatalog = (input: string, init: RequestInit) => fetch(input, { ...init, signal: controller.signal })
    const catalogRequest = useLocalPreviewCatalog
      ? fetchLiveCatalog<Skin>(fallbackUrl, fetchCatalog)
      : fetchLiveCatalogWithFallback<Skin>(REMOTE_CATALOG_URL, fallbackUrl, fetchCatalog)
    setGeneratedMediaSources([])
    void fetch(generatedMediaManifestUrl(), { cache: 'no-store', signal: controller.signal })
      .then(async response => response.ok ? parseGeneratedMediaManifest(await response.json()) : undefined)
      .then(sources => {
        if (disposed) return
        setGeneratedMediaSources(sources)
        setMediaReady(true)
      })
      .catch(() => {
        if (disposed) return
        setGeneratedMediaSources(undefined)
        setMediaReady(true)
      })
    void catalogRequest
      .then(skins => {
        if (!disposed) setCatalog({ skins })
      })
      .catch(error => {
        if (!disposed && !controller.signal.aborted) setCatalog({ error })
      })
    // Star curves only feed the detail chart. A failure leaves the chart out
    // rather than blocking the page. The card reads the catalog shipped with
    // this build, so the chart reads the curve file shipped with it too: the
    // raw main copy can move ahead while Pages is still deploying, and a chart
    // that ends on tomorrow's count next to yesterday's card is the same bug as
    // a curve frozen at its export day.
    const localCurvesUrl = `${import.meta.env.BASE_URL}star-curves.json`
    const readCurves = async (url: string) => {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal })
      if (!response.ok) return undefined
      return parseStarCurves(await response.json())
    }
    const readFirstCurves = async (urls: string[]) => {
      for (const url of urls) {
        const curves = await readCurves(url).catch(() => undefined)
        if (curves !== undefined && Object.keys(curves).length > 0) return curves
      }
      return undefined
    }
    void readFirstCurves(useLocalPreviewCatalog ? [localCurvesUrl] : [localCurvesUrl, REMOTE_STAR_CURVES_URL])
      .then(curves => {
        if (!disposed && curves !== undefined) setCurves(curves)
      })
    return () => { disposed = true; controller.abort() }
  }, [])

  if (!mediaReady) return <main className="empty-page">{t('catalog.loadingMedia')}</main>
  if (catalog.error !== undefined) {
    if (catalog.error instanceof CatalogLoadError) {
      if (catalog.error.code === 'request') return <main className="empty-page">{t('catalog.error.request', { status: catalog.error.status ?? 0 })}</main>
      if (catalog.error.code === 'invalidResponse') return <main className="empty-page">{t('catalog.error.invalidResponse')}</main>
      if (catalog.error.code === 'unsupportedVersion') return <main className="empty-page">{t('catalog.error.unsupportedVersion')}</main>
      return <main className="empty-page">{t('catalog.error.missingSkins')}</main>
    }
    return <main className="empty-page">{t('catalog.error.generic')}</main>
  }
  if (catalog.skins === undefined) return <main className="empty-page">{t('catalog.loading')}</main>
  return <App skins={catalog.skins} curves={curves} liveStarLoader={liveStars} />
}

function PreviewMedia({ skin, src, fallbackSources, alt, kind, loading }: { skin: Skin; src?: string; fallbackSources?: readonly string[]; alt: string; kind: 'list' | 'avatar' | 'gallery' | 'thumbnail' | 'recommendation' | 'card'; loading?: 'eager' | 'lazy' }) {
  const { language, t } = useSitePreferences()
  const candidates = previewSourceCandidates(src, fallbackSources)
  const candidateKey = candidates.join('\u0001')
  const [sourceIndex, setSourceIndex] = useState(0)
  const [failed, setFailed] = useState(false)
  const [previewFailed, setPreviewFailed] = useState(false)
  const [fullFailed, setFullFailed] = useState(false)
  const lazyMedia = useLazyMedia(loading)
  useEffect(() => {
    setSourceIndex(0)
    setFailed(false)
    setPreviewFailed(false)
    setFullFailed(false)
  }, [candidateKey])
  const activeIndex = Math.min(sourceIndex, Math.max(0, candidates.length - 1))
  const activeSrc = candidates[activeIndex]
  const tryNextSource = () => {
    if (fallbackSources !== undefined && activeIndex + 1 < candidates.length) {
      setSourceIndex(activeIndex + 1)
      setPreviewFailed(false)
      setFullFailed(false)
    } else setFailed(true)
  }
  if (!shouldRenderPublicPreview(skin, activeSrc, failed)) {
    const name = localizedSkinName(skin, language)
    return <div className="preview-placeholder" data-preview-kind={kind} role="img" aria-label={t('preview.noScreenshot', { name })}><GithubLogo size={kind === 'list' ? 16 : 24} aria-hidden="true" /><strong>{skin.author}</strong><small>{t('preview.noScreenshotShort')}</small></div>
  }
  if (!lazyMedia.visible) return <span ref={lazyMedia.ref} className="media-lazy-placeholder" role="img" aria-label={alt} />
  const media = generatedMediaFor(skin, activeSrc, kind)
  if (media === undefined) return <img src={activeSrc} alt={alt} loading={loading} decoding="async" onError={tryNextSource} />
  const showFull = kind === 'gallery'
  if (showFull) {
    if (fullFailed) return <img src={activeSrc} alt={alt} loading={loading} decoding="async" onError={tryNextSource} />
    return <img src={generatedMediaUrl(media.full)} alt={alt} loading={loading === 'lazy' ? 'lazy' : 'eager'} decoding="async" onError={() => setFullFailed(true)} />
  }
  const imageSource = previewFailed ? activeSrc : generatedMediaUrl(media.preview)
  return <img src={imageSource} alt={alt} loading={loading} decoding="async" onLoad={event => { event.currentTarget.dataset.loaded = 'true' }} onError={() => { if (previewFailed) tryNextSource(); else setPreviewFailed(true) }} />
}

const rootElement = document.getElementById('root')
if (rootElement !== null) createRoot(rootElement).render(<SitePreferencesProvider><Site /></SitePreferencesProvider>)
