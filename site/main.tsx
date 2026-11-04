import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Ref } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, Check, Copy, DownloadSimpleIcon, GithubLogo, MagnifyingGlass, X } from '@phosphor-icons/react'
import { StarIcon } from '@primer/octicons-react'
import { fetchLiveCatalog, fetchLiveCatalogWithFallback, REMOTE_CATALOG_URL } from './catalog.ts'
import { comparePublicCatalogOrder, shouldRenderPublicPreview } from './catalog-order.ts'
import type { CatalogSort } from '../src/catalog-order.ts'
import { getCatalogListScreenshot, getCatalogScreenshotUrls, usesMarketScreenshots } from '../src/catalog-order.ts'
import { generatedMediaFor, generatedMediaManifestUrl, generatedMediaUrl, hasGeneratedMediaBase, parseGeneratedMediaManifest, previewSourceCandidates, setGeneratedMediaSources } from '../src/media-preview.ts'
import { useLazyMedia } from '../src/media-visibility.ts'
import type { CatalogSkin } from '../src/client/types.ts'
import { MARKET_CLI_COMMAND, MARKET_DESKTOP_INPUT, MARKET_PROMPT, MARKET_PUBLIC_URL, MARKET_REPOSITORY, skinDesktopInput, skinPrompt, skinWebCommandGroups } from './prompts.ts'
import type { InstallCommandGroup } from '../src/client/submission.ts'
import { displayTitle, githubRepoLabel } from '../src/display-title.ts'
import { matchesCatalogSearch } from '../src/catalog-search.ts'
import './site.css'
import '../src/client/media-hover.module.css'

interface Skin extends CatalogSkin {
  featuredRank: number
  starsSnapshot: number
  updatedAt: string
}

const GALLERY_INTERVAL_MS = 5600
const FEED_COMPACT_EXIT_OFFSET = 16
const CATALOG_SORTS: readonly CatalogSort[] = ['heat', 'stars', 'latest']
const CATALOG_SORT_LABELS: Record<CatalogSort, string> = { heat: '热度', stars: 'Stars', latest: '最新' }
const MARKET_CATEGORIES = ['skin', 'pet', 'player', 'splash'] as const
type MarketCategory = typeof MARKET_CATEGORIES[number]
const MARKET_CATEGORY_LABELS: Record<MarketCategory, string> = { skin: '皮肤', pet: '桌宠', player: '播放器', splash: '启动动画' }

function marketCategory(skin: { category?: string }): MarketCategory {
  return skin.category === 'pet' || skin.category === 'player' || skin.category === 'splash' ? skin.category : 'skin'
}

function CatalogSortOptions({ value, onChange }: { value: CatalogSort; onChange: (value: CatalogSort) => void }) {
  return <div className="sort-options" role="group" aria-label="排序方式">
    {CATALOG_SORTS.map(sort => <button key={sort} type="button" className="sort-option" aria-pressed={value === sort} onClick={() => onChange(sort)}>{CATALOG_SORT_LABELS[sort]}</button>)}
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
  return <div className="feed-section-title" ref={placeholderRef} data-header-discover={placeholderRef === undefined ? '' : undefined} data-docked={docked ? 'true' : undefined} aria-hidden={docked ? true : undefined}>
    <div className="discover-heading">
      <div className="filter-options" role="group" aria-label="分类">
        {MARKET_CATEGORIES.map(category => <button key={category} type="button" className="sort-option" aria-pressed={enabledCategories.has(category)} onClick={() => onToggleCategory(category)}>{MARKET_CATEGORY_LABELS[category]}</button>)}
      </div>
    </div>
    <CatalogSortOptions value={sort} onChange={onSort} />
  </div>
}

function CatalogCard({ skin, onOpen, onInstall }: { skin: Skin; onOpen: () => void; onInstall: () => void }) {
  const repoLabel = githubRepoLabel(skin.repo)
  const title = skin.name.zh
  const manualOnly = skin.review?.installation === 'manual-only'
  return <article className="feed-card">
    <button className="feed-card-open dsh-skin-media-hover" aria-label={`${title} 界面预览`} onClick={onOpen}>
      <span className="feed-card-media"><PreviewMedia skin={skin} src={getCatalogListScreenshot(skin)} fallbackSources={getCatalogScreenshotUrls(skin)} alt={`${skin.name.zh} 界面预览`} kind="card" loading="lazy" /></span>
      <span className="feed-card-copy">
        <span className="feed-card-title"><strong title={title}>{title}</strong><span className="feed-card-stats"><StarIcon size={12} /> {skin.starsSnapshot}</span></span>
        <span className="feed-card-description" title={skin.description}>{displayTitle(skin.description)}</span>
      </span>
    </button>
    <div className="feed-card-footer">
      <small title={repoLabel}>{repoLabel}</small>
      <button className="button outline card-install" onClick={onInstall}>{manualOnly ? '需手动安装' : '安装'}</button>
    </div>
  </article>
}

function FeedHeader({ headerRef, searchSlotRef }: { headerRef?: Ref<HTMLElement>; searchSlotRef?: Ref<HTMLDivElement> }) {
  return <header className="feed-header" ref={headerRef}>
    <div className="feed-search-slot" ref={searchSlotRef} aria-hidden="true" />
  </header>
}

function GalleryPreloads({ skin, screenshots }: { skin: Skin; screenshots: string[] }) {
  return <>{screenshots.map((source, index) => {
    const media = generatedMediaFor(skin, source, 'gallery')
    return media === undefined ? null : <link key={`${source}:${index}`} rel="preload" as="image" href={generatedMediaUrl(media.full)} />
  })}</>
}

function SearchBox({ query, onQueryChange, style }: { query: string; onQueryChange: (value: string) => void; style?: CSSProperties }) {
  return <label className="search site-search" style={style}><MagnifyingGlass size={18} /><input value={query} onChange={event => onQueryChange(event.currentTarget.value)} placeholder="搜索皮肤、作者或标签" aria-label="搜索皮肤、作者或标签" /></label>
}

export function App({ skins }: { skins: Skin[] }) {
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
  const feedHeaderRef = useRef<HTMLElement | null>(null)
  const feedSearchSlotRef = useRef<HTMLDivElement | null>(null)
  const pageShellRef = useRef<HTMLDivElement | null>(null)
  const topbarRef = useRef<HTMLElement | null>(null)
  const brandRef = useRef<HTMLAnchorElement | null>(null)
  const topActionsRef = useRef<HTMLElement | null>(null)
  const [searchStyle, setSearchStyle] = useState<CSSProperties | undefined>(undefined)

  const selected = skins.find(item => item.id === selectedId) ?? skins[0]
  const selectedScreenshots = selected === undefined ? [] : getCatalogScreenshotUrls(selected)
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
      const headerTop = feedHeaderRef.current?.getBoundingClientRect().top
      if (headerTop === undefined) return
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
  }, [feedCompact])

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

  if (selected === undefined) return <main className="empty-page">目录暂时为空</main>

  const verified = selected.review?.compatibility !== 'unverified'

  return <div className="page-shell" ref={pageShellRef} data-detail={detailOpen ? 'open' : 'closed'}>
    {detailOpen && <GalleryPreloads skin={selected} screenshots={selectedScreenshots} />}
    <header className="topbar" ref={topbarRef}>
      <div className="topbar-main">
        <a className="brand" ref={brandRef} href={import.meta.env.BASE_URL}>
          <span className="brand-mark">DSH</span>
          <span><strong>皮肤市场</strong><small>dsh-skin-market</small></span>
        </a>
        <nav className="top-actions" ref={topActionsRef} aria-label="平台操作">
          <a className="button outline" href={MARKET_REPOSITORY} target="_blank" rel="noreferrer"><GithubLogo size={17} /> GitHub</a>
          <button className="button outline" onClick={() => { setCopied(null); setInstallDialog('market') }}><DownloadSimpleIcon size={17} /> 安装皮肤市场</button>
          <a className="qr-share" href={MARKET_PUBLIC_URL} target="_blank" rel="noreferrer" aria-label="扫描二维码打开 DSH 皮肤市场">
            <span><strong>扫码打开本页</strong></span>
            <img src={`${import.meta.env.BASE_URL}market-qr.svg`} alt="DSH 皮肤市场二维码" />
          </a>
        </nav>
      </div>
      {discoverDocked && <DiscoverToolbar enabledCategories={enabledCategories} onToggleCategory={toggleCategory} sort={sort} onSort={setSort} />}
    </header>

    <main className="feed-page">
      <FeedHeader headerRef={feedHeaderRef} searchSlotRef={feedSearchSlotRef} />
      <section className="feed-content" aria-label="皮肤目录">
        <DiscoverToolbar docked={discoverDocked} placeholderRef={discoverTitleRef} enabledCategories={enabledCategories} onToggleCategory={toggleCategory} sort={sort} onSort={setSort} />
        {visibleSkins.length > 0 ? <div className="skin-grid">
          {visibleSkins.map(skin => <CatalogCard key={skin.id} skin={skin} onOpen={() => select(skin.id)} onInstall={() => { setSelectedId(skin.id); setShot(0); setCopied(null); setInstallDialog('skin') }} />)}
        </div> : <p className="no-results feed-empty">没有匹配的皮肤</p>}
        {visibleCount < filtered.length && <div className="feed-loading" aria-hidden="true"><span /><span /></div>}
      </section>
    </main>

    <SearchBox query={query} onQueryChange={setQuery} style={searchStyle} />

    {detailOpen && <div className="browser-overlay" role="presentation">
      <button className="browser-mask" aria-hidden="true" tabIndex={-1} onClick={() => setDetailOpen(false)} />
      <section className="browser-panel" role="dialog" aria-modal="true" aria-label="皮肤详情">
        <header className="browser-titlebar"><span><strong>皮肤详情</strong><small>{githubRepoLabel(selected.repo)}</small></span><button className="button outline" aria-label="关闭详情" title="关闭详情" onClick={() => setDetailOpen(false)}><X size={15} /></button></header>
        <section className="detail" ref={detailRef} aria-label="皮肤详情内容">
        <button className="mobile-back" onClick={() => setDetailOpen(false)}><ArrowLeft size={16} /> 返回发现</button>
        <header className="skin-head">
          <div className="avatar"><PreviewMedia key={`${selected.id}:${getCatalogListScreenshot(selected) ?? 'missing'}:avatar`} skin={selected} src={getCatalogListScreenshot(selected)} alt="" kind="avatar" /></div>
          <div className="skin-title"><div><h2>{selected.name.zh}</h2><p className="skin-description" title={selected.description}>{displayTitle(selected.description)}</p><p className="repo-id">{githubRepoLabel(selected.repo)}</p></div><div className="meta"><span>版本 {selected.install.version}</span><span>DSH {selected.compatibility.dsh}</span><span className={verified ? 'verified' : 'unverified'}>{verified ? '兼容已验证' : '兼容待验证'}</span></div></div>
        </header>

        <div className="detail-actions">
          <button className="button primary" onClick={() => { setCopied(null); setInstallDialog('skin') }}>安装这个皮肤</button>
          <a className="button outline repo-button" href={selected.repo} target="_blank" rel="noreferrer"><GithubLogo size={17} /><span>{selected.repo.replace('https://', '')}</span></a>
          <span className="detail-stars"><StarIcon size={16} /> {selected.starsSnapshot}</span>
        </div>

        {!verified && <p className="notice">兼容性待验证，安装前请先确认。</p>}
        {selected.review?.preview === 'repository-card' && !(selected.marketScreenshots?.length) && <p className="notice">该仓库暂无可识别的皮肤截图，页面使用本地占位卡，不会加载 GitHub 仓库图片。</p>}
        {usesMarketScreenshots(selected) && <p className="notice">当前展示的是市场在隔离 DSH 中实机补录的截图；仓库尚无可识别的界面截图。</p>}

        <div className="gallery-group" data-paused={galleryPaused ? 'true' : 'false'} onMouseEnter={() => setCarouselPaused(true)} onMouseLeave={() => setCarouselPaused(false)} onFocusCapture={() => setCarouselPaused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setCarouselPaused(false) }}>
          <div className="gallery">
            <button className="gallery-open dsh-skin-media-hover" aria-label={`全屏查看 ${selected.name.zh} 截图 ${shot + 1}`} onClick={() => setLightboxOpen(true)}>
              <PreviewMedia key={`${selected.id}:${selectedScreenshots[shot] ?? 'missing'}:gallery`} skin={selected} src={selectedScreenshots[shot]} alt={`${selected.name.zh} 界面预览`} kind="gallery" />
            </button>
            {shotCount > 1 && <><button className="gallery-nav gallery-prev" aria-label="上一张截图" onClick={() => moveShot(-1)}><ArrowLeft size={18} /></button><button className="gallery-nav gallery-next" aria-label="下一张截图" onClick={() => moveShot(1)}><ArrowLeft size={18} /></button></>}
          </div>
          {selectedScreenshots.length > 1 && <div className="thumbs" aria-label="截图选择">{selectedScreenshots.map((image, index) => <button className="dsh-skin-media-hover" key={image} data-selected={index === shot} onClick={() => { setShot(index); setCarouselEpoch(current => current + 1) }}><PreviewMedia skin={selected} src={image} alt={`${selected.name.zh} 截图 ${index + 1}`} kind="thumbnail" loading="lazy" />{index === shot && <span className="thumb-progress" key={`${selected.id}:${shot}:${carouselEpoch}`} aria-hidden="true" />}</button>)}</div>}
        </div>

        <div className="information">
          <article><h3>关于此皮肤</h3><p>{selected.description}</p><div className="tags">{selected.tags.map(tag => <span key={tag}>{tag}</span>)}</div>{selected.health && <div className="health"><h3>仓库健康</h3><p>{selected.health.status === 'healthy' ? 'README 展示、兼容声明和一键安装准备均符合要求。' : selected.health.suggestions.join(' ')}</p></div>}</article>
          <dl><div><dt>许可证</dt><dd>{selected.license.code}</dd></div><div><dt>模式</dt><dd>{selected.modes.join(' / ')}</dd></div><div><dt>平台</dt><dd>{selected.compatibility.platform.join(' / ')}</dd></div></dl>
        </div>

        {recommendations.length > 0 && <section className="recommendations"><h3>更多推荐</h3><div>{recommendations.map(skin => <CatalogCard key={skin.id} skin={skin} onOpen={() => { setSelectedId(skin.id); setShot(0) }} onInstall={() => { setSelectedId(skin.id); setShot(0); setCopied(null); setInstallDialog('skin') }} />)}</div></section>}
        </section>
      </section>
    </div>}

    {lightboxOpen && <section className="lightbox" role="dialog" aria-modal="true" aria-label={`${selected.name.zh} 全屏截图查看`}>
      <button className="lightbox-close" aria-label="关闭全屏查看" onClick={() => setLightboxOpen(false)}><X size={20} /></button>
      {selectedScreenshots.length > 1 && <button className="lightbox-nav lightbox-prev" aria-label="上一张截图" onClick={() => moveShot(-1)}><ArrowLeft size={26} /></button>}
      <button className="lightbox-stage" aria-label="退出全屏查看" onClick={() => setLightboxOpen(false)}><PreviewMedia key={`${selected.id}:${selectedScreenshots[shot] ?? 'missing'}:lightbox`} skin={selected} src={selectedScreenshots[shot]} alt={`${selected.name.zh} 全屏截图 ${shot + 1}`} kind="gallery" /></button>
      {selectedScreenshots.length > 1 && <button className="lightbox-nav lightbox-next" aria-label="下一张截图" onClick={() => moveShot(1)}><ArrowLeft size={26} /></button>}
      {selectedScreenshots.length > 1 && <div className="lightbox-thumbs" aria-label="全屏截图选择">{selectedScreenshots.map((image, index) => <button className="dsh-skin-media-hover" key={image} data-selected={index === shot} aria-label={`查看截图 ${index + 1}`} onClick={() => setShot(index)}><PreviewMedia skin={selected} src={image} alt="" kind="thumbnail" loading="lazy" /></button>)}</div>}
    </section>}

    {installDialog !== null && <div className="install-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setInstallDialog(null) }}>
      <section className="install-dialog" role="dialog" aria-modal="true" aria-labelledby="install-dialog-title">
        <header><div><h2 id="install-dialog-title">{installDialog === 'market' ? '安装皮肤市场' : `安装 ${selected.name.zh}`}</h2><p>任选一种方式，不用全部执行。</p></div><button aria-label="关闭" onClick={() => setInstallDialog(null)}><X size={18} /></button></header>
        <div className="install-method-grid" data-single={installDialog === 'market' ? 'true' : 'false'}>
          {installDialog === 'skin' && <InstallGroup title="安装这个皮肤" prompt={skinPrompt(selected)} desktopInput={skinDesktopInput(selected)} commandGroups={skinWebCommandGroups(selected)} copyKey="skin" copied={copied} onCopy={copyPrompt} note="先检查已启用的皮肤，避免样式冲突。" />}
          <InstallGroup title={installDialog === 'skin' ? '通过皮肤市场安装' : undefined} prompt={MARKET_PROMPT} desktopInput={MARKET_DESKTOP_INPUT} command={MARKET_CLI_COMMAND} copyKey="market" copied={copied} onCopy={copyPrompt} note="装好市场后，在 DSH 内安装具体皮肤。" />
        </div>
      </section>
    </div>}

    <div className="toast" data-visible={copied !== null}>{copied !== null && <><Check size={16} /> 已复制</>}</div>
  </div>
}

function InstallOption({ label, value, copied, onCopy, copyLabel = label, input = false }: { label: string; value: string; copied: boolean; onCopy: () => void; copyLabel?: string; input?: boolean }) {
  return <div className="install-option"><strong>{label}</strong><div className="copy-capsule">{input ? <input aria-label={copyLabel} title={value} value={value} readOnly onFocus={event => event.currentTarget.select()} /> : <code title={value}>{value}</code>}<button aria-label={`${copied ? '已复制' : '复制'}${copyLabel}`} title={copied ? '已复制' : '复制'} onClick={onCopy}>{copied ? <Check size={16} /> : <Copy size={16} />}</button></div></div>
}

function InstallGroup({ title, prompt, desktopInput, command, commandGroups, copyKey, copied, onCopy, note }: { title?: string; prompt: string; desktopInput: string; command?: string; commandGroups?: InstallCommandGroup[]; copyKey: string; copied: string | null; onCopy: (key: string, value: string) => Promise<void>; note?: string }) {
  const groupName = copyKey === 'skin' ? '安装这个皮肤' : '安装皮肤市场'
  const groups = commandGroups ?? (command === undefined ? [] : [{ key: 'common', label: '', commands: [{ key: 'command', label: '命令', value: command }] }])
  const simpleCommand = groups.length === 1 && groups[0]!.label === '' && groups[0]!.commands.length === 1 ? groups[0]!.commands[0] : undefined
  return <section className="install-group" aria-label={groupName}>
    {title && <h3>{title}</h3>}
    <InstallOption label="桌面版" value={desktopInput} copyLabel={`${groupName}的桌面版插件包名`} input copied={copied === `${copyKey}:keyword`} onCopy={() => void onCopy(`${copyKey}:keyword`, desktopInput)} />
    {simpleCommand !== undefined
      ? <InstallOption label="命令" value={simpleCommand.value} copyLabel={`${groupName}的命令`} copied={copied === `${copyKey}:command`} onCopy={() => void onCopy(`${copyKey}:command`, simpleCommand.value)} />
      : groups.length > 0 ? groups.map(group => group.commands.map(entry => {
        const key = `${copyKey}:command:${group.key}:${entry.key}`
        return <InstallOption key={key} label={group.label || '命令'} value={entry.value} copyLabel={`${groupName}的${group.label || '命令'}`} copied={copied === key} onCopy={() => void onCopy(key, entry.value)} />
      })) : <div className="install-option"><strong>命令</strong><div className="copy-capsule install-command-hint"><code title="此皮肤需按实际环境安装，请复制提示词。">此皮肤需按实际环境安装，请复制提示词。</code></div></div>}
    <InstallOption label="提示词" value={prompt} copyLabel={`${groupName}的提示词`} copied={copied === `${copyKey}:prompt`} onCopy={() => void onCopy(`${copyKey}:prompt`, prompt)} />
    {note && <p className="install-note">{note}</p>}
  </section>
}

function Site() {
  const [catalog, setCatalog] = useState<{ skins?: Skin[]; error?: string }>({})
  const [mediaReady, setMediaReady] = useState(() => !hasGeneratedMediaBase())

  useEffect(() => {
    const controller = new AbortController()
    let disposed = false
    const fallbackUrl = `${import.meta.env.BASE_URL}catalog.json`
    const useLocalPreviewCatalog = import.meta.env.DEV || new URLSearchParams(window.location.search).get('dsh-media') === '1'
    const fetchCatalog = (input: string, init: RequestInit) => fetch(input, { ...init, signal: controller.signal })
    const catalogRequest = useLocalPreviewCatalog
      ? fetchLiveCatalog<Skin>(fallbackUrl, fetchCatalog)
      : fetchLiveCatalogWithFallback<Skin>(fallbackUrl, REMOTE_CATALOG_URL, fetchCatalog)
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
        if (!disposed && !controller.signal.aborted) setCatalog({ error: error instanceof Error ? error.message : String(error) })
      })
    return () => { disposed = true; controller.abort() }
  }, [])

  if (!mediaReady) return <main className="empty-page">正在准备本地图片预览…</main>
  if (catalog.error !== undefined) {
    return <main className="empty-page">目录加载失败：{catalog.error}。请刷新页面重试。</main>
  }
  if (catalog.skins === undefined) return <main className="empty-page">正在加载最新皮肤目录…</main>
  return <App skins={catalog.skins} />
}

function PreviewMedia({ skin, src, fallbackSources, alt, kind, loading }: { skin: Skin; src?: string; fallbackSources?: readonly string[]; alt: string; kind: 'list' | 'avatar' | 'gallery' | 'thumbnail' | 'recommendation' | 'card'; loading?: 'eager' | 'lazy' }) {
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
    return <div className="preview-placeholder" data-preview-kind={kind} role="img" aria-label={`${skin.name.zh} 暂无界面截图`}><GithubLogo size={kind === 'list' ? 16 : 24} aria-hidden="true" /><strong>{skin.author}</strong><small>暂无界面截图</small></div>
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
if (rootElement !== null) createRoot(rootElement).render(<Site />)
