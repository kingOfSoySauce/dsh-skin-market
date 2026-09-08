import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { SquaresFourIcon, UploadSimpleIcon, XIcon } from '@phosphor-icons/react'
import { MarkGithubIcon, StarIcon } from '@primer/octicons-react'
import {
  Button,
  IconChevronLeftOutline14,
  IconChevronDownOutline14,
  IconCopyOutline16,
  IconDownloadOutline16,
  IconLoadingOutline16,
  IconRefreshOutline16,
  IconSearchOutline16,
  IconTrashOutline16,
  Input,
  Modal,
  Pill,
} from '@deepseek-ai/dsh-client-ui-primitives'
import css from './SkinMarket.module.css'
import './media-hover.module.css'
import { compareCatalogOrder, getCatalogListScreenshot, getCatalogScreenshotUrls, hasCatalogPreview, usesMarketScreenshots } from '../catalog-order.ts'
import { generatedMediaFor, generatedMediaManifestUrl, generatedMediaUrl, parseGeneratedMediaManifest, previewSourceCandidates, setGeneratedMediaSources } from '../media-preview.ts'
import { useLazyMedia } from '../media-visibility.ts'
import { browserCatalogCache, type CatalogCache } from './catalog-cache.ts'
import { CLI_INSTALL_WARNING, createSkinInstallCommand, createSkinInstallPrompt, createSubmissionPrompt, REGISTRY_REPOSITORY } from './submission.ts'
import { switchClientSkin, type ClientSkinRuntime } from './index.ts'
import { displayTitle, githubRepoLabel } from '../display-title.ts'
import { assessCompatibility, type CompatibilityAssessment } from '../compatibility.ts'
import { matchesCatalogSearch } from '../catalog-search.ts'
import type { CatalogSkin, DshRuntime, InstalledClientPlugin, MarketHostKind, Operation, RuntimeSkin } from './types.ts'

export interface SkinMarketSectionProps {
  t: (key: string) => string
  clientRuntime?: ClientSkinRuntime
  catalogCache?: CatalogCache
}

type MutationKind = 'install' | 'activate' | 'deactivate' | 'pin' | 'unpin' | 'update' | 'uninstall'

interface CatalogResponse {
  skins: CatalogSkin[]
}

interface ListScrollAnchor { skinId: string | null; offset: number; scrollTop: number }
type RestartTarget = { kind: 'skin'; skinId: string } | { kind: 'market-update' }

interface PendingRestartNotice {
  target: RestartTarget
  startedAt: string
  title: string
}

export function captureListScroll(list: HTMLElement | null): ListScrollAnchor | null {
  if (list === null) return null
  const listTop = list.getBoundingClientRect().top
  const card = [...list.querySelectorAll<HTMLElement>('[data-skin-id]')].find(item => item.getBoundingClientRect().bottom > listTop)
  return { skinId: card?.dataset.skinId ?? null, offset: card === undefined ? 0 : card.getBoundingClientRect().top - listTop, scrollTop: list.scrollTop }
}

export function restoreListScroll(list: HTMLElement | null, anchor: ListScrollAnchor | null): void {
  if (list === null || anchor === null) return
  const card = anchor.skinId === null ? undefined : [...list.querySelectorAll<HTMLElement>('[data-skin-id]')].find(item => item.dataset.skinId === anchor.skinId)
  if (card === undefined) list.scrollTop = anchor.scrollTop
  else list.scrollTop += card.getBoundingClientRect().top - list.getBoundingClientRect().top - anchor.offset
}

interface MarketStateResponse {
  hostKind?: MarketHostKind
  runtime?: DshRuntime
  skins: RuntimeSkin[]
  operation?: Operation | null
  marketUpdateOperation?: MarketUpdateOperation | null
  installedClientPlugins?: InstalledClientPlugin[]
  runningAgentCount?: number
  marketUpdateRestartRequired?: boolean
}

interface MarketUpdateStatus {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
}

interface MarketUpdateOperation {
  id: string
  phase: 'queued' | 'checking' | 'downloading' | 'installing' | 'cancelling' | 'cancelled' | 'done' | 'failed'
  message?: string
  status?: MarketUpdateStatus
  cancelable?: boolean
  downloadedBytes?: number
  totalBytes?: number
  bytesPerSecond?: number
  failure?: Operation['failure']
  startedAt: string
  finishedAt?: string
}

const phases: Record<Operation['phase'], string> = {
  queued: '正在排队', resolving: '正在解析版本', downloading: '正在下载', installing: '正在写入插件', validating: '正在验证', activating: '正在切换', cancelling: '正在取消', cancelled: '已取消', done: '完成', failed: '操作失败',
}

function elapsedLabel(startedAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000))
  if (seconds < 60) return `${seconds} 秒`
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
}

function byteLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

interface ProgressMetadata {
  downloadedBytes?: number
  totalBytes?: number
  bytesPerSecond?: number
  step?: string
  stepStartedAt?: string
  attempt?: number
  lastOutputAt?: string
  pnpmStage?: Operation['pnpmStage']
}

const pnpmStages: Record<NonNullable<Operation['pnpmStage']>, string> = {
  resolving: '解析依赖', downloading: '下载依赖', linking: '链接依赖', building: '运行构建',
}

function operationMeta(operation: ProgressMetadata, now: number): string[] {
  const details: string[] = []
  if (operation.step !== undefined) details.push(operation.step)
  if (operation.attempt !== undefined) details.push(`第 ${operation.attempt} 次尝试`)
  if (operation.pnpmStage !== undefined) details.push(pnpmStages[operation.pnpmStage])
  if (operation.downloadedBytes !== undefined && operation.totalBytes !== undefined) {
    details.push(`${byteLabel(operation.downloadedBytes)} / ${byteLabel(operation.totalBytes)}`)
  } else if (operation.downloadedBytes !== undefined) {
    details.push(`已下载 ${byteLabel(operation.downloadedBytes)}`)
  }
  const outputAge = operation.lastOutputAt === undefined ? undefined : now - Date.parse(operation.lastOutputAt)
  if (operation.bytesPerSecond !== undefined && operation.bytesPerSecond > 0 && (outputAge === undefined || outputAge < 5000)) {
    details.push(`${byteLabel(operation.bytesPerSecond)}/s`)
  }
  return details
}

function recoveryActionLabel(action: 'retry' | 'approve-build' | undefined): string | undefined {
  if (action === 'approve-build') return '批准构建并重试'
  if (action === 'retry') return '重试'
  return undefined
}

const mutationLabels: Record<MutationKind, string> = {
  install: '安装中', activate: '使用中', deactivate: '停用中', pin: '设置常驻中', unpin: '取消常驻中', update: '更新中', uninstall: '卸载中',
}

const marketOperationTitles: Record<MarketUpdateOperation['phase'], string> = {
  queued: '正在排队更新皮肤市场', checking: '正在检查皮肤市场更新', downloading: '正在下载皮肤市场', installing: '正在写入皮肤市场', cancelling: '正在取消皮肤市场更新', cancelled: '皮肤市场更新已取消', done: '皮肤市场更新完成', failed: '皮肤市场更新失败',
}

interface OperationBannerProps {
  title: string
  startedAt: string
  metadata?: string[]
  progress?: ProgressMetadata
  message?: string
  cancelable?: boolean
  terminal?: boolean
  failed?: boolean
  operationId?: string
  copyingLog?: boolean
  copiedLog?: boolean
  className?: string
  onCancel?: () => void
  onCopyLog?: () => void
  onDismiss?: () => void
  action?: ReactNode
}

function OperationBanner({ title, startedAt, metadata = [], progress, message, cancelable = false, terminal = false, failed = false, operationId, copyingLog = false, copiedLog = false, className, onCancel, onCopyLog, onDismiss, action }: OperationBannerProps) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (terminal) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt, terminal])
  const outputStartedAt = progress?.stepStartedAt ?? (progress?.step === undefined ? undefined : startedAt)
  const lastOutputTime = Math.max(...[progress?.lastOutputAt, outputStartedAt]
    .filter((value): value is string => value !== undefined)
    .map(value => Date.parse(value)))
  const silentFor = Number.isFinite(lastOutputTime) ? now - lastOutputTime : 0
  const details = [...new Set([
    ...metadata,
    ...(progress === undefined ? [] : operationMeta(progress, now)),
    ...(!terminal || failed ? [`已用时 ${elapsedLabel(startedAt, now)}`] : []),
    ...(!terminal && silentFor >= 30_000 ? [`已 ${elapsedLabel(new Date(lastOutputTime).toISOString(), now)}未有输出，可复制日志查看`] : []),
  ].filter(item => item !== ''))]
  const normalize = (value: string) => value.replace(/\s+/g, '')
  const normalizedMessage = message === undefined ? '' : normalize(message)
  const messageText = message !== undefined
    && message !== title
    && normalizedMessage !== ''
    && ![title, ...details].some(item => {
      const normalizedItem = normalize(item)
      return normalizedItem === normalizedMessage || normalizedItem.includes(normalizedMessage) || normalizedMessage.includes(normalizedItem)
    })
    ? message
    : undefined
  return <div className={`${css.operation}${className === undefined ? '' : ` ${className}`}`} role="status" aria-live="polite" data-terminal={terminal ? 'true' : undefined} data-failed={failed ? 'true' : undefined}>
    {terminal ? <IconRefreshOutline16 size={16} /> : <IconLoadingOutline16 size={16} />}
    <strong>{title}</strong>
    <span className={css.operationMeta}>{details.map(item => <small key={item}>· {item}</small>)}</span>
    {messageText !== undefined && <span className={css.operationMessage} title={messageText}>· {messageText}</span>}
    <span className={css.operationActions}>
      {cancelable && onCancel !== undefined && <Button className={css.operationCancel} variant="outline" size="sm" onClick={onCancel}>取消</Button>}
      {(!terminal || failed) && onCopyLog !== undefined && operationId !== undefined && <Button className={css.operationCopyLog} variant="outline" size="sm" icon={<IconCopyOutline16 />} disabled={copyingLog} onClick={onCopyLog}>{copiedLog ? '日志已复制' : copyingLog ? '复制中…' : '复制日志'}</Button>}
      {action}
      {onDismiss !== undefined && <Button className={css.operationDismiss} variant="ghost" size="sm" icon={<XIcon size={14} />} aria-label="关闭提示" title="关闭提示" onClick={onDismiss} />}
    </span>
  </div>
}

const RELOAD_PARAM = 'dsh-skin-reload'
const ACTIVATION_WARNING_KEY = 'dsh-skin-market:activation-warning-accepted'
const RESET_HELP_URL = `${REGISTRY_REPOSITORY}#页面异常时重置皮肤`

function ResetHelpLink() {
  return <a href={RESET_HELP_URL} target="_blank" rel="noreferrer">页面异常时重置皮肤</a>
}

function CompatibilityWarningNote({ assessment }: { assessment: CompatibilityAssessment }) {
  return <p className={css.notice} role="note">{assessment.reason}。仍可继续使用；若页面异常，请查看 <ResetHelpLink />。</p>
}
export const CATALOG_BATCH_SIZE = 20
const GALLERY_INTERVAL_MS = 5600
const HOME_COMPACT_ENTER_SCROLL = 72
const HOME_COMPACT_EXIT_SCROLL = 16

export function restartReloadUrl(href: string, instanceId: string): string {
  const url = new URL(href)
  url.searchParams.set(RELOAD_PARAM, instanceId)
  return url.toString()
}

export function restoreMarketStyleOrder(root: ParentNode = document, marker = css.filterPill): void {
  for (const style of root.querySelectorAll<HTMLStyleElement>('style')) {
    const ownsMarketCss = style.dataset.plugin === 'dsh-skin-market'
      || style.textContent?.includes(`.${marker}`) === true
    if (ownsMarketCss) style.parentNode?.appendChild(style)
  }
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  let body: T & { error?: string }
  try {
    body = await response.json() as T & { error?: string }
  } catch {
    throw new Error(response.ok
      ? '皮肤市场服务未返回有效数据，请确认 Host 插件已经更新'
      : `皮肤市场请求失败（HTTP ${response.status}）`)
  }
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`)
  return body
}

function runtimeFor(states: RuntimeSkin[], id: string): RuntimeSkin {
  return states.find(item => item.skinId === id) ?? {
    skinId: id, installation: 'missing', activation: 'inactive', primary: false, pinned: false, installedVersion: null, installedAt: null, lastOperatedAt: null, updateAvailable: false,
  }
}

function statusLabel(state: RuntimeSkin): string {
  if (state.installation === 'broken') return '安装异常'
  if (state.pinned && state.activation === 'active') return '常驻'
  if (state.activation === 'active') return '正在使用'
  if (state.activation === 'restart-required') return '需要重启'
  if (state.installation === 'installed') return '已安装'
  return '未安装'
}

function compactStatusLabel(state: RuntimeSkin): string {
  if (state.pinned && state.activation === 'active') return '常驻'
  if (state.activation === 'active') return '使用中'
  if (state.activation === 'restart-required') return '待重启'
  if (state.installation === 'broken') return '安装异常'
  if (state.installation === 'installed') return '已安装'
  return '未安装'
}

function StatusLabel({ active = false, children }: { active?: boolean; children: ReactNode }) {
  return <span className={css.statusLabel} data-active={active ? 'true' : undefined}>{children}</span>
}

function installCompatibility(skin: CatalogSkin, hostKind: MarketHostKind, runtime: DshRuntime | null): CompatibilityAssessment | null {
  if (hostKind !== 'dsh') return null
  if (runtime === null) return {
    decision: 'unknown',
    reason: '无法读取当前 DSH 版本，安装结果需自行确认',
    adapterIds: [],
  }
  return assessCompatibility(skin, runtime)
}

function advisoryCompatibility(skin: CatalogSkin, hostKind: MarketHostKind, runtime: DshRuntime | null): CompatibilityAssessment | null {
  const assessment = installCompatibility(skin, hostKind, runtime)
  return assessment?.decision === 'incompatible' || assessment?.decision === 'unknown' ? assessment : null
}

function displayDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '未知' : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date)
}

/**
 * `screenshots` can contain a GitHub repository card for entries that have no
 * usable preview. Market-supplemented screenshots are real previews even if
 * the upstream entry still carries the repository-card marker.
 */
export function hasSkinPreview(skin: Pick<CatalogSkin, 'review' | 'marketScreenshots' | 'listScreenshot' | 'screenshots'>): boolean {
  return hasCatalogPreview(skin)
}

export function compareSkinOrder(a: CatalogSkin, b: CatalogSkin, sortBy: 'stars' | 'latest'): number {
  return compareCatalogOrder(a, b, sortBy, skin => skin.githubStars, skin => skin.releaseUpdatedAt)
}

export function compareInstalledSkinOrder(a: CatalogSkin, b: CatalogSkin, states: RuntimeSkin[]): number {
  const aState = runtimeFor(states, a.id)
  const bState = runtimeFor(states, b.id)
  const priority = (state: RuntimeSkin) => state.primary === true ? 0 : state.pinned === true ? 1 : 2
  const priorityDifference = priority(aState) - priority(bState)
  if (priorityDifference !== 0) return priorityDifference
  const aTime = Date.parse(aState.lastOperatedAt ?? aState.installedAt ?? '')
  const bTime = Date.parse(bState.lastOperatedAt ?? bState.installedAt ?? '')
  const recentDifference = (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0)
  return recentDifference || a.name.zh.localeCompare(b.name.zh, 'zh-CN') || a.id.localeCompare(b.id)
}

interface PreviewMediaProps {
  skin: CatalogSkin
  src?: string
  fallbackSources?: readonly string[]
  alt: string
  kind: 'list' | 'avatar' | 'hero' | 'thumbnail' | 'recommendation'
  loading?: 'eager' | 'lazy'
}

function PreviewMedia({ skin, src, fallbackSources, alt, kind, loading }: PreviewMediaProps) {
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
  const placeholder = !hasCatalogPreview(skin) || activeSrc === undefined || failed
  if (placeholder) return <div className={css.previewPlaceholder} data-preview-kind={kind} role="img" aria-label={`${skin.name.zh} 暂无界面截图`}><MarkGithubIcon aria-hidden="true" /><strong>{skin.author}</strong><small>暂无界面截图</small></div>
  if (!lazyMedia.visible) return <span ref={lazyMedia.ref} className={css.mediaLazyPlaceholder} role="img" aria-label={alt} />
  const media = generatedMediaFor(skin, activeSrc, kind)
  if (media === undefined) return <img src={activeSrc} alt={alt} loading={loading} decoding="async" onLoad={event => { event.currentTarget.dataset.loaded = 'true' }} onError={tryNextSource} />
  const showFull = kind === 'hero'
  if (showFull) {
    if (fullFailed) return <img src={activeSrc} alt={alt} loading={loading} decoding="async" onError={tryNextSource} />
    return <img src={generatedMediaUrl(media.full)} alt={alt} loading={loading === 'lazy' ? 'lazy' : 'eager'} decoding="async" onError={() => setFullFailed(true)} />
  }
  const imageSource = previewFailed ? activeSrc : generatedMediaUrl(media.preview)
  return <img src={imageSource} alt={alt} loading={loading} decoding="async" onLoad={event => { event.currentTarget.dataset.loaded = 'true' }} onError={() => { if (previewFailed) tryNextSource(); else setPreviewFailed(true) }} />
}

function GalleryPreloads({ skin, screenshots }: { skin: CatalogSkin; screenshots: string[] }) {
  return <>{screenshots.map((source, index) => {
    const media = generatedMediaFor(skin, source, 'hero')
    return media === undefined ? null : <link key={`${source}:${index}`} rel="preload" as="image" href={generatedMediaUrl(media.full)} />
  })}</>
}

const healthLabels = {
  readmeScreenshots: 'README 截图',
  compatibility: '兼容版本',
  installation: '市场安装就绪',
  installCommand: '安装命令',
  topic: 'dsh-plugin Topic',
} as const

export function SkinMarketSection({ t, clientRuntime, catalogCache = browserCatalogCache }: SkinMarketSectionProps) {
  const [skins, setSkins] = useState<CatalogSkin[]>([])
  const [states, setStates] = useState<RuntimeSkin[]>([])
  const [hostKind, setHostKind] = useState<MarketHostKind>('dsh')
  const [runtime, setRuntime] = useState<DshRuntime | null>(null)
  const [installedClientPlugins, setInstalledClientPlugins] = useState<InstalledClientPlugin[]>([])
  const [loading, setLoading] = useState(true)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string>('')
  const [query, setQuery] = useState('')
  const [homeQuery, setHomeQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'installed'>('all')
  const [sortBy, setSortBy] = useState<'stars' | 'latest'>('stars')
  const [visibleCount, setVisibleCount] = useState(CATALOG_BATCH_SIZE)
  const [homeVisibleCount, setHomeVisibleCount] = useState(CATALOG_BATCH_SIZE)
  const [installedSlots, setInstalledSlots] = useState(5)
  const [shotIndex, setShotIndex] = useState(0)
  const [galleryPaused, setGalleryPaused] = useState(false)
  const [carouselEpoch, setCarouselEpoch] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [busy, setBusy] = useState<Operation | null>(null)
  const [mutation, setMutation] = useState<{ skinId: string; kind: MutationKind } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmUninstall, setConfirmUninstall] = useState(false)
  const [confirmPin, setConfirmPin] = useState(false)
  const [activationWarningAccepted, setActivationWarningAccepted] = useState(() => {
    try { return window.localStorage.getItem(ACTIVATION_WARNING_KEY) === 'true' } catch { return false }
  })
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [runningAgents, setRunningAgents] = useState<number | null>(null)
  const [restartCheckFinished, setRestartCheckFinished] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [browserOpen, setBrowserOpen] = useState(false)
  const [browserOrigin, setBrowserOrigin] = useState<'discover' | 'installed'>('discover')
  const [showSubmission, setShowSubmission] = useState(false)
  const [submissionCopied, setSubmissionCopied] = useState(false)
  const [showInstallOptions, setShowInstallOptions] = useState(false)
  const [installCopied, setInstallCopied] = useState<string | null>(null)
  const [marketUpdate, setMarketUpdate] = useState<MarketUpdateStatus | null>(null)
  const [marketOperation, setMarketOperation] = useState<MarketUpdateOperation | null>(null)
  const [copyingLogId, setCopyingLogId] = useState<string | null>(null)
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null)
  const [dismissedBuildApprovalId, setDismissedBuildApprovalId] = useState<string | null>(null)
  const [marketUpdating, setMarketUpdating] = useState(false)
  const [restartTarget, setRestartTarget] = useState<RestartTarget | null>(null)
  const [pendingRestart, setPendingRestart] = useState<PendingRestartNotice | null>(null)
  const [compatibilityNotice, setCompatibilityNotice] = useState<{ skin: CatalogSkin; assessment: CompatibilityAssessment } | null>(null)
  const [compatibilityWarning, setCompatibilityWarning] = useState<CompatibilityAssessment | null>(null)
  const [homeCompact, setHomeCompact] = useState(false)
  const skinListRef = useRef<HTMLDivElement | null>(null)
  const homeRef = useRef<HTMLDivElement | null>(null)
  const thumbnailStripRef = useRef<HTMLDivElement | null>(null)
  const detailRef = useRef<HTMLElement | null>(null)
  const pendingScrollAnchor = useRef<ListScrollAnchor | null>(null)
  const thumbnailScrollRequest = useRef(false)
  const marketUpdatePolls = useRef(new Set<string>())
  const dismissedMarketOperationIds = useRef(new Set<string>())
  const pendingInstallActivation = useRef<string | null>(null)
  const skinsRef = useRef<CatalogSkin[]>([])
  const selectedIdRef = useRef('')
  const userSelectedRef = useRef(false)

  const buildApprovalOperation = busy !== null
    && busy.phase === 'failed'
    && busy.failure?.action === 'approve-build'
    && busy.id !== dismissedBuildApprovalId
    ? busy
    : null

  const acceptCatalog = useCallback((incoming: CatalogSkin[], runtimeStates: RuntimeSkin[] = []) => {
    pendingScrollAnchor.current = captureListScroll(skinListRef.current)
    const nextSkins = [...incoming]
    const selectedBeforeRefresh = selectedIdRef.current
    if (selectedBeforeRefresh !== '' && !nextSkins.some(skin => skin.id === selectedBeforeRefresh)) {
      const selectedSkin = skinsRef.current.find(skin => skin.id === selectedBeforeRefresh)
      if (selectedSkin !== undefined) nextSkins.push(selectedSkin)
    }
    skinsRef.current = nextSkins
    setSkins(nextSkins)
    setSelectedId(value => {
      const active = runtimeStates.find(item => item.primary) ?? runtimeStates.find(item => item.activation === 'active')
      const activeId = active !== undefined && nextSkins.some(skin => skin.id === active.skinId) ? active.skinId : null
      const next = !userSelectedRef.current && activeId !== null
        ? activeId
        : value !== '' && nextSkins.some(skin => skin.id === value)
          ? value
          : nextSkins[0]?.id ?? ''
      selectedIdRef.current = next
      return next
    })
  }, [])

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setLoading(true)
      if (skinsRef.current.length === 0) setCatalogLoading(true)
    }
    try {
      const catalogRequest = json<CatalogResponse>('/dsh-skin-market/catalog').then(catalog => {
        if (showLoading) setCatalogLoading(false)
        return catalog
      })
      const stateRequest = json<MarketStateResponse>('/dsh-skin-market/state').then(state => {
        if (showLoading) setLoading(false)
        return state
      })
      const [catalog, state] = await Promise.all([catalogRequest, stateRequest])
      acceptCatalog(catalog.skins, state.skins)
      void catalogCache.write(catalog.skins).catch(() => undefined)
      setStates(state.skins)
      setHostKind(state.hostKind ?? 'dsh')
      setRuntime(state.runtime ?? null)
      setBusy(current => current?.phase === 'failed' && state.operation == null ? current : state.operation ?? null)
      if ('marketUpdateOperation' in state) {
        const operation = state.marketUpdateOperation !== null && state.marketUpdateOperation !== undefined && !dismissedMarketOperationIds.current.has(state.marketUpdateOperation.id)
          ? state.marketUpdateOperation
          : null
        setMarketOperation(current => current?.phase === 'failed' && operation === null ? current : operation)
        setMarketUpdating(operation?.phase !== undefined
          && !['done', 'failed', 'cancelled'].includes(operation.phase))
      }
      setInstalledClientPlugins(state.installedClientPlugins ?? [])
      setRunningAgents(typeof state.runningAgentCount === 'number' && Number.isInteger(state.runningAgentCount) ? state.runningAgentCount : null)
      if (state.marketUpdateRestartRequired === true) {
        // Updating the market package can cause DSH to remount this client
        // entry. Keep the restart prompt recoverable from Host state instead
        // of relying on the previous React tree's local state.
        setRestartTarget({ kind: 'market-update' })
        setRestartCheckFinished(true)
        setCompatibilityWarning(null)
        setConfirmRestart(true)
      }
    } finally {
      if (showLoading) {
        setLoading(false)
        setCatalogLoading(false)
      }
    }
  }, [acceptCatalog, catalogCache])

  const openRestartConfirm = useCallback(async (skinId?: string, kind: RestartTarget['kind'] = 'skin', advisory: CompatibilityAssessment | null = null) => {
    setError(null)
    setRunningAgents(null)
    setRestartCheckFinished(false)
    setRestartTarget(kind === 'market-update' ? { kind } : { kind, skinId: skinId ?? selectedIdRef.current })
    setCompatibilityWarning(advisory)
    setConfirmRestart(true)
    try {
      const state = await json<MarketStateResponse>('/dsh-skin-market/state', { cache: 'no-store' })
      setRunningAgents(typeof state.runningAgentCount === 'number' && Number.isInteger(state.runningAgentCount) ? state.runningAgentCount : null)
      setRestartCheckFinished(true)
    } catch (reason) {
      setRestartCheckFinished(true)
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [])

  const waitForMarketUpdate = useCallback(async (operationId: string) => {
    if (marketUpdatePolls.current.has(operationId)) return
    marketUpdatePolls.current.add(operationId)
    try {
      for (;;) {
        const operation = await json<MarketUpdateOperation>(`/dsh-skin-market/market-update/operations/${operationId}`)
        setMarketOperation(operation)
        if (operation.phase === 'done') {
          setMarketUpdating(false)
          if (operation.status !== undefined) setMarketUpdate(operation.status)
          setMarketOperation(null)
          setPendingRestart({ target: { kind: 'market-update' }, title: '皮肤市场已更新，待重启生效', startedAt: operation.finishedAt ?? new Date().toISOString() })
          await openRestartConfirm(undefined, 'market-update')
          return
        }
        if (operation.phase === 'failed' || operation.phase === 'cancelled') {
          setMarketUpdating(false)
          setError(null)
          return
        }
        await new Promise(resolve => setTimeout(resolve, 600))
      }
    } catch (reason) {
      setMarketUpdating(false)
      const message = reason instanceof Error ? reason.message : String(reason)
      setMarketOperation(current => current === null
        ? { id: `market-update-failed-${Date.now()}`, phase: 'failed', message, startedAt: new Date().toISOString() }
        : { ...current, phase: 'failed', cancelable: false, message })
      setError(null)
    } finally {
      marketUpdatePolls.current.delete(operationId)
    }
  }, [openRestartConfirm])

  const checkMarketUpdate = useCallback(async () => {
    try {
      const status = await json<MarketUpdateStatus & { operation?: MarketUpdateOperation | null }>('/dsh-skin-market/market-update')
      if (typeof status.updateAvailable === 'boolean' && typeof status.currentVersion === 'string' && typeof status.latestVersion === 'string') {
        setMarketUpdate(status)
      }
      if (status.operation !== undefined) {
        const operation = status.operation !== null && !dismissedMarketOperationIds.current.has(status.operation.id) ? status.operation : null
        setMarketOperation(current => current?.phase === 'failed' && operation === null ? current : operation)
        setMarketUpdating(operation !== null && !['done', 'failed', 'cancelled'].includes(operation.phase))
        if (operation !== null && !['done', 'failed', 'cancelled'].includes(operation.phase)) void waitForMarketUpdate(operation.id)
      }
    } catch { /* update availability must never disturb catalog browsing */ }
  }, [waitForMarketUpdate])

  const updateMarket = useCallback(async () => {
    setError(null)
    setMarketUpdating(true)
    try {
      const result = await json<{ operationId?: string; currentVersion?: string; latestVersion?: string; updateAvailable?: boolean }>('/dsh-skin-market/market-update', { method: 'POST' })
      if (typeof result.operationId === 'string') {
        setMarketOperation({ id: result.operationId, phase: 'queued', cancelable: true, startedAt: new Date().toISOString() })
        void waitForMarketUpdate(result.operationId)
      } else if (typeof result.currentVersion === 'string' && typeof result.latestVersion === 'string' && typeof result.updateAvailable === 'boolean') {
        const status = result as MarketUpdateStatus
        setMarketUpdate(status)
        setMarketUpdating(false)
        setPendingRestart({ target: { kind: 'market-update' }, title: '皮肤市场已更新，待重启生效', startedAt: new Date().toISOString() })
        await openRestartConfirm(undefined, 'market-update')
      } else throw new Error('皮肤市场服务未返回有效的更新任务')
    } catch (reason) {
      setMarketUpdating(false)
      const message = reason instanceof Error ? reason.message : String(reason)
      setMarketOperation(current => current === null
        ? { id: `market-update-failed-${Date.now()}`, phase: 'failed', message, startedAt: new Date().toISOString() }
        : { ...current, phase: 'failed', cancelable: false, message })
      setError(null)
    }
  }, [openRestartConfirm, waitForMarketUpdate])

  useEffect(() => {
    let disposed = false
    void (async () => {
      const cached = await catalogCache.read()
      if (disposed) return
      if (cached !== null && cached.length > 0) {
        acceptCatalog(cached)
        setCatalogLoading(false)
      }
      await refresh(true).catch(reason => setError(reason instanceof Error ? reason.message : String(reason)))
    })()
    return () => { disposed = true }
  }, [acceptCatalog, catalogCache, refresh])
  useEffect(() => {
    const controller = new AbortController()
    setGeneratedMediaSources([])
    void fetch(generatedMediaManifestUrl(), { cache: 'no-store', signal: controller.signal })
      .then(async response => response.ok ? parseGeneratedMediaManifest(await response.json()) : undefined)
      .then(sources => setGeneratedMediaSources(sources))
      .catch(() => setGeneratedMediaSources(undefined))
    return () => controller.abort()
  }, [])
  useEffect(() => { void checkMarketUpdate() }, [checkMarketUpdate])
  useEffect(() => {
    if (marketOperation === null || ['done', 'failed', 'cancelled'].includes(marketOperation.phase)) return
    void waitForMarketUpdate(marketOperation.id)
  }, [marketOperation?.id, marketOperation?.phase, waitForMarketUpdate])
  useEffect(() => {
    const timer = window.setInterval(() => {
      refresh(false).catch(() => undefined)
      void checkMarketUpdate()
    }, 5 * 60 * 1000)
    const refreshOnFocus = () => {
      refresh(false).catch(() => undefined)
      void checkMarketUpdate()
    }
    window.addEventListener('focus', refreshOnFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshOnFocus)
    }
  }, [checkMarketUpdate, refresh])
  useLayoutEffect(() => {
    restoreListScroll(skinListRef.current, pendingScrollAnchor.current)
    pendingScrollAnchor.current = null
  }, [skins])
  useLayoutEffect(() => {
    if (detailRef.current !== null) detailRef.current.scrollTop = 0
  }, [selectedId])
  useEffect(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has(RELOAD_PARAM)) return
    url.searchParams.delete(RELOAD_PARAM)
    window.history.replaceState(window.history.state, '', url)
  }, [])
  useLayoutEffect(() => {
    const home = homeRef.current
    if (home === null || typeof ResizeObserver === 'undefined') return
    const updateSlots = () => {
      const width = home.clientWidth
      setInstalledSlots(width < 560 ? 2 : width < 820 ? 3 : width < 1080 ? 4 : 5)
    }
    updateSlots()
    const observer = new ResizeObserver(updateSlots)
    observer.observe(home)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const style = document.createElement('style')
    style.dataset.dshSkinMarketWide = 'true'
    style.textContent = '@media (min-width: 960px){[role="dialog"]:has([data-dsh-skin-market]){width:min(1280px,calc(100vw - 48px));height:min(860px,calc(100vh - 48px))}}'
    document.head.appendChild(style)
    return () => style.remove()
  }, [])
  const selected = skins.find(skin => skin.id === selectedId) ?? skins[0]
  const selectedScreenshots = selected === undefined ? [] : getCatalogScreenshotUrls(selected)
  const shotCount = selectedScreenshots.length
  const state = selected === undefined ? null : runtimeFor(states, selected.id)
  const compatibilityUnverified = selected?.review?.compatibility === 'unverified'
  const isManualOnly = (skin: CatalogSkin): boolean => hostKind === 'desktop'
    ? skin.install.desktop?.mode !== 'managed'
    : skin.review?.installation === 'manual-only'
  const manualOnly = selected !== undefined && isManualOnly(selected)
  const desktopManualReason = hostKind === 'desktop' && selected?.install.desktop?.mode === 'manual-only'
    ? selected.install.desktop.reason
    : undefined
  const manualInstallNotice = hostKind === 'desktop'
    ? desktopManualReason === undefined
      ? 'Desktop 当前仅支持已验证 npm 精确版本的一键安装；此皮肤请按仓库说明手动安装。'
      : `Desktop 暂不支持一键安装：${desktopManualReason}。请按仓库说明手动安装。`
    : '该皮肤暂不支持市场直接安装，请复制提示词交给 Agent 处理。'
  const manualHealthNotice = hostKind === 'desktop'
    ? manualInstallNotice
    : '该仓库距离市场的一键安装规范还差少量信息；可参考右侧仓库健康建议完善，当前请按维护者说明安装。'
  const autoInstallable = !manualOnly
  const filtered = useMemo(() => skins.filter(skin => {
    if (!matchesCatalogSearch(skin, query)) return false
    if (filter === 'installed') return runtimeFor(states, skin.id).installation !== 'missing'
    return true
  }).sort((a, b) => filter === 'installed' ? compareInstalledSkinOrder(a, b, states) : compareSkinOrder(a, b, sortBy)), [skins, states, filter, query, sortBy])
  const visibleSkins = useMemo(() => {
    const visible = filtered.slice(0, visibleCount)
    const selectedSkin = filtered.find(skin => skin.id === selectedId)
    if (selectedSkin !== undefined && !visible.some(skin => skin.id === selectedSkin.id)) visible.push(selectedSkin)
    return visible
  }, [filtered, selectedId, visibleCount])

  const installedSkins = useMemo(() => skins
    .filter(skin => runtimeFor(states, skin.id).installation !== 'missing')
    .sort((a, b) => compareInstalledSkinOrder(a, b, states)), [skins, states])
  const discoverySkins = useMemo(() => skins
    .filter(skin => matchesCatalogSearch(skin, homeQuery))
    .sort((a, b) => compareSkinOrder(a, b, sortBy)), [homeQuery, skins, sortBy])
  const visibleDiscoverySkins = useMemo(() => discoverySkins.slice(0, homeVisibleCount), [discoverySkins, homeVisibleCount])
  const installedRowSkins = installedSkins.length > installedSlots ? installedSkins.slice(0, Math.max(1, installedSlots - 1)) : installedSkins
  const installedOverflow = installedSkins.length > installedRowSkins.length

  useEffect(() => {
    const isNarrow = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 959px)').matches
    const reduceMotion = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!browserOpen || (!showDetail && isNarrow) || galleryPaused || lightboxOpen || shotCount < 2 || reduceMotion) return
    const timer = window.setTimeout(() => {
      thumbnailScrollRequest.current = true
      setShotIndex(current => (current + 1) % shotCount)
    }, GALLERY_INTERVAL_MS)
    return () => window.clearTimeout(timer)
  }, [browserOpen, carouselEpoch, galleryPaused, lightboxOpen, selected?.id, shotCount, shotIndex, showDetail])

  useEffect(() => {
    if (!thumbnailScrollRequest.current) return
    thumbnailScrollRequest.current = false
    const selectedThumbnail = thumbnailStripRef.current?.querySelector<HTMLElement>('[data-selected="true"]')
    selectedThumbnail?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [selected?.id, shotIndex])

  useEffect(() => {
    thumbnailScrollRequest.current = false
    if (!browserOpen) return
    const thumbnailStrip = thumbnailStripRef.current
    if (thumbnailStrip !== null) thumbnailStrip.scrollLeft = 0
  }, [browserOpen, selected?.id])

  useEffect(() => {
    setGalleryPaused(false)
    setLightboxOpen(false)
    setCarouselEpoch(current => current + 1)
  }, [selected?.id])

  useEffect(() => {
    if (!lightboxOpen) return
    const handleLightboxKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation()
        setLightboxOpen(false)
        return
      }
      if (shotCount < 2) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        thumbnailScrollRequest.current = true
        setShotIndex(current => event.key === 'ArrowLeft' ? (current - 1 + shotCount) % shotCount : (current + 1) % shotCount)
      }
    }
    window.addEventListener('keydown', handleLightboxKeys, true)
    return () => window.removeEventListener('keydown', handleLightboxKeys, true)
  }, [lightboxOpen, shotCount])

  const setCarouselPausedState = (paused: boolean) => {
    setGalleryPaused(paused)
    setCarouselEpoch(current => current + 1)
  }

  const moveShot = (direction: -1 | 1) => {
    if (shotCount > 1) {
      thumbnailScrollRequest.current = true
      setShotIndex(current => (current + direction + shotCount) % shotCount)
    }
  }

  useEffect(() => { setVisibleCount(CATALOG_BATCH_SIZE) }, [filter, query, sortBy])
  useEffect(() => { setHomeVisibleCount(CATALOG_BATCH_SIZE) }, [homeQuery, sortBy])

  const copyOperationLog = useCallback(async (operationId: string) => {
    setCopyingLogId(operationId)
    setError(null)
    try {
      const response = await fetch(`/dsh-skin-market/logs?operationId=${encodeURIComponent(operationId)}`, { cache: 'no-store' })
      if (!response.ok) throw new Error(`日志导出失败（HTTP ${response.status}）`)
      const text = await response.text()
      if (!navigator.clipboard?.writeText) throw new Error('当前页面没有可用的剪贴板权限')
      await navigator.clipboard.writeText(text)
      setCopiedLogId(operationId)
      window.setTimeout(() => setCopiedLogId(current => current === operationId ? null : current), 2400)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setCopyingLogId(current => current === operationId ? null : current)
    }
  }, [])

  const cancelOperation = useCallback(async () => {
    if (busy === null || busy.id === 'pending' || busy.cancelable !== true) return
    const operationId = busy.id
    setError(null)
    setBusy(current => current?.id === operationId ? { ...current, phase: 'cancelling', cancelable: false } : current)
    try {
      await json<Operation>(`/dsh-skin-market/operations/${operationId}/cancel`, { method: 'POST' })
    } catch (reason) {
      await refresh().catch(() => undefined)
      const message = reason instanceof Error ? reason.message : String(reason)
      setBusy(current => current?.id === operationId
        ? { ...current, phase: 'failed', cancelable: false, message }
        : { ...busy, phase: 'failed', cancelable: false, message })
      setError(null)
    }
  }, [busy, refresh])

  const cancelMarketUpdate = useCallback(async () => {
    const operation = marketOperation
    if (operation === null || operation.cancelable !== true) return
    setMarketOperation(current => current?.id === operation.id ? { ...current, phase: 'cancelling', cancelable: false, message: '正在取消皮肤市场更新' } : current)
    try {
      const cancelled = await json<MarketUpdateOperation>(`/dsh-skin-market/market-update/operations/${operation.id}/cancel`, { method: 'POST' })
      setMarketOperation(cancelled)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      setMarketOperation(current => current?.id === operation.id ? { ...current, phase: 'failed', cancelable: false, message } : current)
      setError(null)
    }
  }, [marketOperation])

  const retryMarketUpdate = useCallback(async () => {
    const operation = marketOperation
    if (operation === null || operation.failure?.action !== 'retry') return
    setMarketUpdating(true)
    try {
      const result = await json<{ operationId: string }>(`/dsh-skin-market/market-update/operations/${operation.id}/retry`, { method: 'POST' })
      setMarketOperation({ id: result.operationId, phase: 'queued', cancelable: true, startedAt: new Date().toISOString() })
      void waitForMarketUpdate(result.operationId)
    } catch (reason) {
      setMarketUpdating(false)
      const message = reason instanceof Error ? reason.message : String(reason)
      setMarketOperation(current => current?.id === operation.id ? { ...current, phase: 'failed', cancelable: false, message } : current)
      setError(null)
    }
  }, [marketOperation, waitForMarketUpdate])

  const runForSkin = useCallback(async (skinId: string, kind: MutationKind, existingOperationId?: string) => {
    const target = skins.find(skin => skin.id === skinId)
    if (target === undefined) return false
    const targetState = runtimeFor(states, target.id)
    setError(null)
    setMutation({ skinId: target.id, kind })
    if (existingOperationId === undefined) setBusy({ id: 'pending', kind, skinId: target.id, phase: 'queued', startedAt: new Date().toISOString() })
    try {
      const operationId = existingOperationId ?? (await json<{ operationId: string }>(`/dsh-skin-market/${kind}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ skinId: target.id }),
      })).operationId
      for (;;) {
        const operation = await json<Operation>(`/dsh-skin-market/operations/${operationId}`)
        setBusy(operation)
        if (operation.phase === 'done') {
          setBusy(null)
          // Updating a skin that is already in use replaces its package on
          // disk, but the loaded client module still belongs to the old
          // package. Reuse the existing restart confirmation flow so the
          // reviewed version is loaded by a fresh DSH process.
          let needsRestart = kind === 'update'
            && (targetState.activation === 'active' || targetState.activation === 'restart-required')
          if (kind === 'deactivate' || kind === 'uninstall') {
            await clientRuntime?.setActive(target.package, false)
          } else if (kind === 'unpin' && targetState.primary !== true) {
            await clientRuntime?.setActive(target.package, false)
          } else if (kind === 'pin' && clientRuntime !== undefined) {
            needsRestart = !(await clientRuntime.setActive(target.package, true))
            restoreMarketStyleOrder()
          } else if (kind === 'activate' && clientRuntime !== undefined) {
            const pinnedPackages = states
              .filter(item => item.pinned)
              .map(item => skins.find(skin => skin.id === item.skinId)?.package)
              .filter((packageName): packageName is string => packageName !== undefined)
            needsRestart = !(await switchClientSkin(clientRuntime, skins.map(skin => skin.package), target.package, pinnedPackages))
            restoreMarketStyleOrder()
          }
          const advisory = kind === 'activate' ? advisoryCompatibility(target, hostKind, runtime) : null
          await refresh()
          if (needsRestart) {
            setStates(value => value.map(item => item.skinId === target.id
              ? { ...item, activation: 'restart-required' }
              : item))
            setPendingRestart({ target: { kind: 'skin', skinId: target.id }, title: `${target.name.zh} ${kind === 'update' ? '已更新' : '已完成操作'}，待重启生效`, startedAt: new Date().toISOString() })
            await openRestartConfirm(target.id, 'skin', advisory)
          } else if (advisory !== null) {
            setCompatibilityWarning(advisory)
          }
          return true
        }
        if (operation.phase === 'cancelled') {
          setBusy(null)
          await refresh()
          return false
        }
        if (operation.phase === 'failed') {
          if (operation.failure?.kind === 'compatibility') {
            setBusy(null)
            setCompatibilityNotice({ skin: target, assessment: { decision: 'incompatible', reason: operation.failure.message, adapterIds: [] } })
            await refresh().catch(() => undefined)
            return false
          }
          // Keep terminal operation failures in the shared banner so the
          // actionable error is visible where the progress was shown.
          await refresh().catch(() => undefined)
          setBusy(operation)
          setError(null)
          return false
        }
        await new Promise(resolve => setTimeout(resolve, 600))
      }
    } catch (reason) {
      await refresh().catch(() => undefined)
      const message = reason instanceof Error ? reason.message : String(reason)
      setBusy(current => current === null || current.id === 'pending'
        ? { id: `skin-operation-failed-${Date.now()}`, kind, skinId: target.id, phase: 'failed', startedAt: new Date().toISOString(), message }
        : { ...current, phase: 'failed', cancelable: false, message })
      setError(null)
      return false
    } finally {
      setMutation(null)
    }
  }, [clientRuntime, hostKind, openRestartConfirm, refresh, runtime, skins, states])

  const activateSkin = useCallback((skinId: string) => {
    pendingInstallActivation.current = null
    try { window.localStorage.setItem(ACTIVATION_WARNING_KEY, 'true') } catch { /* storage may be unavailable */ }
    setActivationWarningAccepted(true)
    void runForSkin(skinId, 'activate')
  }, [runForSkin])

  const retrySkinOperation = useCallback(async () => {
    const operation = busy
    const action = operation?.failure?.action
    if (operation === null || operation === undefined || action === undefined) return
    try {
      const result = await json<{ operationId: string }>(`/dsh-skin-market/operations/${operation.id}/retry`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
      })
      const retried = await runForSkin(operation.skinId, operation.kind, result.operationId)
      if (retried && operation.kind === 'install' && pendingInstallActivation.current === operation.skinId) activateSkin(operation.skinId)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      setBusy(current => current?.id === operation.id ? { ...current, message } : current)
      setError(null)
    }
  }, [activateSkin, busy, runForSkin])

  const approveBuildAndRetry = useCallback(() => {
    if (buildApprovalOperation === null) return
    setDismissedBuildApprovalId(buildApprovalOperation.id)
    void retrySkinOperation()
  }, [buildApprovalOperation, retrySkinOperation])

  const run = useCallback(async (kind: MutationKind) => selected === undefined ? false : runForSkin(selected.id, kind), [runForSkin, selected])

  const activateSelected = useCallback(() => {
    if (selected === undefined) return
    activateSkin(selected.id)
  }, [activateSkin, selected])

  const installAndActivate = useCallback(async () => {
    if (selected === undefined) return
    pendingInstallActivation.current = selected.id
    if (await runForSkin(selected.id, 'install')) activateSkin(selected.id)
  }, [activateSkin, runForSkin, selected])

  const installAndActivateSkin = useCallback(async (skinId: string) => {
    pendingInstallActivation.current = skinId
    if (await runForSkin(skinId, 'install')) activateSkin(skinId)
  }, [activateSkin, runForSkin])

  const restartNow = useCallback(async () => {
    const target = restartTarget ?? { kind: 'skin' as const, skinId: selectedIdRef.current }
    if (target.kind === 'skin' && target.skinId === '') return
    setRestarting(true)
    setError(null)
    try {
      const accepted = await json<{ instanceId: string }>('/dsh-skin-market/restart', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(target.kind === 'market-update' ? { reason: 'market-update' } : { skinId: target.skinId }),
      })
      const deadline = Date.now() + 90_000
      while (Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 500))
        try {
          const next = await json<{ instanceId: string }>('/dsh-skin-market/state', { cache: 'no-store' })
          if (next.instanceId !== accepted.instanceId) {
            window.location.replace(restartReloadUrl(window.location.href, next.instanceId))
            return
          }
        } catch { /* the old process is releasing its port */ }
      }
      throw new Error('DeepSeek Harness 重启超时，请手动刷新页面')
    } catch (reason) {
      setConfirmRestart(false)
      setCompatibilityWarning(null)
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setRestarting(false)
    }
  }, [restartTarget])

  const chooseSkin = (id: string) => { userSelectedRef.current = true; selectedIdRef.current = id; setSelectedId(id); setShotIndex(0); setLightboxOpen(false); setError(null); setInstallCopied(null); setShowInstallOptions(false) }
  const select = (id: string) => { chooseSkin(id); setShowDetail(true) }
  const openBrowser = (id: string, origin: 'discover' | 'installed') => {
    chooseSkin(id)
    setBrowserOrigin(origin)
    setFilter(origin === 'installed' ? 'installed' : 'all')
    setQuery('')
    setShowDetail(origin === 'discover')
    setBrowserOpen(true)
  }
  const openInstalledBrowser = (id?: string) => {
    const target = id ?? installedSkins.find(skin => runtimeFor(states, skin.id).activation === 'active')?.id ?? installedSkins[0]?.id
    if (target !== undefined) openBrowser(target, 'installed')
  }
  const closeBrowser = () => { setLightboxOpen(false); setBrowserOpen(false); setShowDetail(false) }
  const openCardInstall = (skin: CatalogSkin) => {
    if (isManualOnly(skin)) {
      chooseSkin(skin.id)
      setInstallCopied(null)
      setShowInstallOptions(true)
      return
    }
    void installAndActivateSkin(skin.id)
  }
  const activateCard = (skinId: string) => {
    try { window.localStorage.setItem(ACTIVATION_WARNING_KEY, 'true') } catch { /* storage may be unavailable */ }
    setActivationWarningAccepted(true)
    void runForSkin(skinId, 'activate')
  }
  const recommendations = selected?.recommendations.map(id => skins.find(skin => skin.id === id)).filter((skin): skin is CatalogSkin => skin !== undefined) ?? []
  const submissionPrompt = createSubmissionPrompt()
  const copySubmissionPrompt = async () => {
    await navigator.clipboard.writeText(submissionPrompt)
    setSubmissionCopied(true)
  }
  const copyInstallOption = async (method: 'prompt' | 'command') => {
    if (selected === undefined) return
    await navigator.clipboard.writeText(method === 'prompt' ? createSkinInstallPrompt(selected) : createSkinInstallCommand(selected))
    setInstallCopied(`${selected.id}:${method}`)
  }
  const renderHomeCard = (skin: CatalogSkin, location: 'installed' | 'discover') => {
    const itemState = runtimeFor(states, skin.id)
    const cardMutation = mutation?.skinId === skin.id ? mutation : null
    const needsInstall = itemState.installation === 'missing' || itemState.installation === 'broken'
    const actionCount = cardMutation !== null || needsInstall
      ? 1
      : itemState.installation === 'installed'
        ? Number(itemState.activation === 'inactive' || itemState.activation === 'active') + Number(itemState.updateAvailable && !isManualOnly(skin))
        : 0
    const stateText = itemState.installation === 'broken'
      ? '安装异常'
      : itemState.activation === 'active'
        ? compactStatusLabel(itemState)
        : itemState.activation === 'restart-required'
          ? '待重启'
          : itemState.installation === 'installed'
            ? '已安装'
            : null
    const open = () => location === 'installed' ? openInstalledBrowser(skin.id) : openBrowser(skin.id, 'discover')
    return <article className={css.homeCard} data-active={itemState.activation === 'active' ? 'true' : undefined} data-actions={actionCount} key={`${location}:${skin.id}`}>
      <Button variant="ghost" className={`${css.homeCardOpen} dsh-skin-media-hover`} aria-current={itemState.activation === 'active' ? 'true' : undefined} aria-label={location === 'installed' ? `${skin.name.zh} 已安装卡片` : `${skin.name.zh} 界面预览`} onClick={open}>
        <span className={css.homeCardMedia}><PreviewMedia skin={skin} src={getCatalogListScreenshot(skin)} fallbackSources={getCatalogScreenshotUrls(skin)} alt={`${skin.name.zh} 界面预览`} kind="recommendation" loading="lazy" /></span>
        <span className={css.homeCardCopy}>
          <span className={css.homeCardTitleRow}><strong title={skin.name.zh}>{skin.name.zh}</strong>{location === 'discover' && <span className={css.feedMeta}><StarIcon size={12} aria-hidden="true" /> {skin.githubStars}</span>}</span>
          <span className={css.homeCardDescription} title={skin.description}>{displayTitle(skin.description)}</span>
        </span>
      </Button>
      <div className={css.homeCardFooter}>
        <span className={css.homeCardRepo} title={githubRepoLabel(skin.repo)}>{githubRepoLabel(skin.repo)}</span>
        {stateText !== null && <StatusLabel active={itemState.activation === 'active'}>{stateText}</StatusLabel>}
        {actionCount > 0 && <div className={css.cardInlineActions} role="group" aria-label={`${skin.name.zh} 操作`}>
          {cardMutation !== null ? <span className={css.cardActionProgress}><IconLoadingOutline16 />{mutationLabels[cardMutation.kind]}</span> : <>
            {needsInstall && <Button className={css.cardAction} variant="outline" size="sm" disabled={mutation !== null} title={isManualOnly(skin) ? '复制安装提示词' : '安装并使用当前皮肤'} onClick={() => openCardInstall(skin)}>{isManualOnly(skin) ? '需手动安装' : '安装并使用'}</Button>}
            {itemState.installation === 'installed' && itemState.activation === 'inactive' && <Button className={css.cardAction} variant="outline" size="sm" disabled={mutation !== null} onClick={() => activateCard(skin.id)}>使用</Button>}
            {itemState.installation === 'installed' && itemState.activation === 'active' && <Button className={css.cardAction} variant="outline" size="sm" disabled={mutation !== null} onClick={() => { void runForSkin(skin.id, 'deactivate') }}>停用</Button>}
            {itemState.installation === 'installed' && itemState.updateAvailable && !isManualOnly(skin) && <Button className={css.cardAction} variant="outline" size="sm" disabled={mutation !== null} onClick={() => { void runForSkin(skin.id, 'update') }}>更新</Button>}
          </>}
        </div>}
      </div>
    </article>
  }

  const renderSkinOperationBanner = (className?: string) => busy === null ? null : <OperationBanner
    operationId={busy.id}
    copyingLog={copyingLogId === busy.id}
    copiedLog={copiedLogId === busy.id}
    className={className}
    title={`${phases[busy.phase]}“${skins.find(skin => skin.id === busy.skinId)?.name.zh ?? busy.skinId}”`}
    startedAt={busy.startedAt}
    progress={busy}
    message={busy.message}
    terminal={busy.phase === 'done' || busy.phase === 'failed' || busy.phase === 'cancelled'}
    failed={busy.phase === 'failed'}
    cancelable={busy.cancelable === true}
    onCancel={() => { void cancelOperation() }}
    onCopyLog={() => { void copyOperationLog(busy.id) }}
    action={busy.failure?.action === 'approve-build'
      ? <Button variant="outline" size="sm" onClick={() => setDismissedBuildApprovalId(null)}>查看批准说明</Button>
      : recoveryActionLabel(busy.failure?.action) === undefined
        ? undefined
        : <Button variant="outline" size="sm" onClick={() => { void retrySkinOperation() }}>{recoveryActionLabel(busy.failure?.action)}</Button>}
    onDismiss={busy.phase === 'failed' || busy.phase === 'cancelled' || busy.phase === 'done' ? () => setBusy(null) : undefined}
  />

  const renderMarketOperationBanner = (className?: string) => marketOperation === null || (marketOperation.phase === 'done' && pendingRestart !== null) ? null : <OperationBanner
    operationId={marketOperation.id}
    copyingLog={copyingLogId === marketOperation.id}
    copiedLog={copiedLogId === marketOperation.id}
    className={className}
    title={marketOperationTitles[marketOperation.phase]}
    startedAt={marketOperation.startedAt}
    progress={marketOperation}
    message={marketOperation.message}
    terminal={marketOperation.phase === 'done' || marketOperation.phase === 'failed' || marketOperation.phase === 'cancelled'}
    failed={marketOperation.phase === 'failed'}
    cancelable={marketOperation.cancelable === true}
    onCancel={() => { void cancelMarketUpdate() }}
    onCopyLog={() => { void copyOperationLog(marketOperation.id) }}
    action={recoveryActionLabel(marketOperation.failure?.action) === undefined ? undefined : <Button variant="outline" size="sm" onClick={() => { void retryMarketUpdate() }}>{recoveryActionLabel(marketOperation.failure?.action)}</Button>}
    onDismiss={marketOperation.phase === 'failed' || marketOperation.phase === 'cancelled' || marketOperation.phase === 'done' ? () => { dismissedMarketOperationIds.current.add(marketOperation.id); setMarketOperation(null) } : undefined}
  />

  const renderPendingRestartBanner = (className?: string) => pendingRestart === null ? null : <OperationBanner
    className={className}
    title={pendingRestart.title}
    startedAt={pendingRestart.startedAt}
    metadata={[]}
    terminal
    action={<Button variant="outline" size="sm" onClick={() => void openRestartConfirm(pendingRestart.target.kind === 'skin' ? pendingRestart.target.skinId : undefined, pendingRestart.target.kind)}>重启</Button>}
    onDismiss={() => setPendingRestart(null)}
  />
  const marketUpdateActive = marketOperation !== null && !['done', 'failed', 'cancelled'].includes(marketOperation.phase)

  return (
    <section className={css.root} data-dsh-skin-market data-detail={showDetail ? 'open' : 'closed'} data-browser-open={browserOpen ? 'true' : 'false'}>
      {browserOpen && selected !== undefined && <GalleryPreloads skin={selected} screenshots={selectedScreenshots} />}
      <main className={css.home} hidden={browserOpen}>
        <header className={css.homeHeader} data-compact={homeCompact ? 'true' : undefined}>
          <div className={css.homeTitleRow}>
            <div><h2>{t('title')}</h2><p>{skins.length} 款社区皮肤</p></div>
            <div className={css.homeActions}>
              {marketUpdate?.updateAvailable === true && <Button
                className={`${css.marketUpdateButton} ${css.homeUpdateAction}`}
                variant="outline"
                size="sm"
                icon={marketUpdating ? <IconLoadingOutline16 /> : <IconDownloadOutline16 />}
                aria-label={`更新皮肤市场到 ${marketUpdate.latestVersion}`}
                title={`发现新版本 ${marketUpdate.latestVersion}`}
                disabled={marketUpdating || marketUpdateActive || busy !== null}
                data-updating={marketUpdating || marketUpdateActive ? 'true' : undefined}
                onClick={() => { void updateMarket() }}
              ><span className={css.marketUpdateLabel}>{marketUpdating ? '更新中' : '更新'}</span></Button>}
              <Button className={css.homeGithubAction} variant="outline" size="sm" icon={<MarkGithubIcon size={15} aria-hidden="true" />} aria-label="打开 GitHub 仓库" title="打开 GitHub 仓库" onClick={() => window.open(REGISTRY_REPOSITORY, '_blank', 'noopener,noreferrer')}><span className={css.homeGithubLabel}>GitHub</span></Button>
              <Button className={css.homeSubmitAction} variant="outline" size="sm" icon={<UploadSimpleIcon size={15} aria-hidden="true" />} onClick={() => { setShowSubmission(true); setSubmissionCopied(false) }}>提交皮肤</Button>
            </div>
          </div>
          <Input className={css.homeSearch} value={homeQuery} onChange={event => setHomeQuery(event.currentTarget.value)} icon={<IconSearchOutline16 />} placeholder={t('search')} aria-label={t('search')} />
          <div className={css.homeSearchPlaceholder} aria-hidden="true" />
          {renderSkinOperationBanner(css.homeOperation)}
          {renderMarketOperationBanner(css.homeOperation)}
          {renderPendingRestartBanner(css.homeOperation)}
        </header>

        <div className={css.homeContent} ref={homeRef} onScroll={event => {
          const home = event.currentTarget
          setHomeCompact(current => current
            ? home.scrollTop > HOME_COMPACT_EXIT_SCROLL
            : home.scrollTop > HOME_COMPACT_ENTER_SCROLL)
          if (discoverySkins.length > homeVisibleCount && home.scrollHeight - home.scrollTop - home.clientHeight < 560) {
            setHomeVisibleCount(value => Math.min(discoverySkins.length, value + CATALOG_BATCH_SIZE))
          }
        }}>
          {homeQuery.trim() === '' && (loading || installedSkins.length > 0) && <section className={css.homeSection} aria-labelledby="installed-skins-title">
            <div className={css.homeSectionTitle}><h3 id="installed-skins-title">已安装</h3><span>正在使用、常驻优先，其余按最近操作排序</span></div>
            {loading ? <div className={css.installedRow} style={{ '--installed-columns': installedSlots } as CSSProperties} role="status" aria-label="正在加载已安装皮肤"><span className={css.srOnly}>正在加载已安装皮肤…</span>{Array.from({ length: installedSlots }, (_, index) => <article className={css.installedSkeletonCard} key={index} aria-hidden="true"><span /><span><i /><i /></span></article>)}</div> : <div className={css.installedRow} style={{ '--installed-columns': installedSlots } as CSSProperties}>
              {installedRowSkins.map(skin => renderHomeCard(skin, 'installed'))}
              {installedOverflow && <Button variant="ghost" className={`${css.homeCard} ${css.installedMoreCard}`} onClick={() => openInstalledBrowser()}><SquaresFourIcon size={24} aria-hidden="true" /><strong>查看全部已安装</strong></Button>}
            </div>}
          </section>}

          <section className={css.homeSection} aria-labelledby="discover-skins-title">
            <div className={css.homeSectionTitle}>
              <h3 id="discover-skins-title">{homeQuery.trim() === '' ? '发现更多' : '搜索结果'}</h3>
              <Button className={css.sortButton} variant="ghost" size="sm" onClick={() => setSortBy(value => value === 'stars' ? 'latest' : 'stars')}>{sortBy === 'stars' ? 'Stars' : '最新'} <IconChevronDownOutline14 /></Button>
            </div>
            {catalogLoading && skins.length === 0 ? <div className={css.homeLoading}><IconLoadingOutline16 /> 正在加载皮肤…</div> : visibleDiscoverySkins.length > 0 ? <div className={css.discoveryGrid}>
              {visibleDiscoverySkins.map(skin => renderHomeCard(skin, 'discover'))}
            </div> : <p className={css.empty}>没有匹配的皮肤</p>}
            {error !== null && !browserOpen && <div className={css.homeError} role="alert">{error}</div>}
            {!catalogLoading && homeVisibleCount < discoverySkins.length && <div className={css.homeLoadMore} aria-hidden="true"><span /><span /></div>}
          </section>
        </div>
      </main>

      <Modal open={browserOpen} onClose={closeBrowser} title="皮肤详情" closeLabel="关闭" className={css.browserModal} contentClassName={css.browserContent}>
      <section className={css.browser} data-detail={showDetail ? 'open' : 'closed'} aria-label="皮肤详情">
        <div className={css.browserPanel}>
      <aside className={css.catalog} aria-label={t('catalog')}>
        <div className={css.catalogHeader}>
          <Input value={query} onChange={event => setQuery(event.currentTarget.value)} icon={<IconSearchOutline16 />} placeholder={t('search')} aria-label={t('search')} />
          <div className={css.filterBar}>
            <div className={css.filters}>
              <Pill className={css.filterPill} active={filter === 'all'} aria-pressed={filter === 'all'} onClick={() => { setFilter('all'); setSortBy('stars') }}>全部</Pill>
              <Pill className={css.filterPill} active={filter === 'installed'} aria-pressed={filter === 'installed'} onClick={() => setFilter('installed')}>已安装</Pill>
            </div>
            <Button className={css.sortButton} variant="ghost" size="sm" onClick={() => setSortBy(value => value === 'stars' ? 'latest' : 'stars')}>
              {sortBy === 'stars' ? 'Stars' : '最新'} <IconChevronDownOutline14 />
            </Button>
          </div>
        </div>
        <div className={css.skinList} ref={skinListRef} onScroll={event => {
          const list = event.currentTarget
          if (filtered.length > visibleCount && list.scrollHeight - list.scrollTop - list.clientHeight < 320) {
            setVisibleCount(value => Math.min(filtered.length, value + CATALOG_BATCH_SIZE))
          }
        }}>
          {catalogLoading && skins.length === 0 ? <div className={css.listSkeleton} role="status" aria-label="正在加载皮肤列表"><span className={css.srOnly}>正在加载皮肤列表…</span>{Array.from({ length: 8 }, (_, index) => <div className={css.skeletonCard} key={index} aria-hidden="true"><span /><span><i /><i /></span><i /></div>)}</div> : visibleSkins.map(skin => {
            const itemState = runtimeFor(states, skin.id)
            const mutationLabel = mutation?.skinId === skin.id ? mutationLabels[mutation.kind] : null
            return <Button key={skin.id} variant="ghost" className={css.skinCard} data-skin-id={skin.id} data-selected={skin.id === selected?.id} aria-current={skin.id === selected?.id ? 'true' : undefined} onClick={() => select(skin.id)}>
              <span className={`${css.skinCardPreview} dsh-skin-media-hover`}><PreviewMedia key={`${skin.id}:${getCatalogListScreenshot(skin) ?? 'missing'}:list`} skin={skin} src={getCatalogListScreenshot(skin)} fallbackSources={getCatalogScreenshotUrls(skin)} alt={`${skin.name.zh} 界面预览`} kind="list" loading="lazy" /></span>
              <span className={css.skinCardBody}>
                <span className={css.cardTitle}>{skin.name.zh}</span>
                <span className={css.cardDescription} title={skin.description}>{displayTitle(skin.description)}</span>
                <span className={css.cardMetaLine}>
                  <span className={css.cardMeta} title={githubRepoLabel(skin.repo)}>{githubRepoLabel(skin.repo)}</span>
                  <span className={css.cardStars} title={`GitHub Stars 快照，更新于 ${displayDate(skin.starsUpdatedAt)}`}><StarIcon size={12} aria-hidden="true" /> {skin.githubStars}</span>
                </span>
              </span>
              <StatusLabel active={mutationLabel === null && itemState.activation === 'active'}>{mutationLabel ?? (itemState.activation === 'active' ? compactStatusLabel(itemState) : itemState.updateAvailable && !isManualOnly(skin) ? '可更新' : compactStatusLabel(itemState))}</StatusLabel>
            </Button>
          })}
          {!catalogLoading && visibleCount < filtered.length && <div className={css.loadMoreHint} aria-hidden="true"><span /><span /></div>}
          {!catalogLoading && filtered.length === 0 && <p className={css.empty}>没有匹配的皮肤</p>}
          {!loading && filter === 'installed' && installedClientPlugins.map(plugin => <div className={`${css.skinCard} ${css.externalPlugin}`} key={plugin.package}>
            <span className={css.skinCardBody}>
              <span className={css.cardTitle}>{plugin.package}</span>
              <span className={css.cardMetaLine}>市场外客户端插件 · {plugin.version ?? '版本未知'} · {plugin.registered ? `已注册 ${plugin.rowIds.join(', ')}` : '尚未发现 loader 注册项'}</span>
            </span>
            <StatusLabel>市场外</StatusLabel>
          </div>)}
          {!loading && browserOpen && selected === undefined && error !== null && <div className={css.error} role="alert">{error}</div>}
        </div>
      </aside>

      <main className={css.detail} ref={detailRef} aria-label="皮肤详情内容">
        {loading ? <div className={css.detailSkeleton} role="status" aria-label="正在加载皮肤详情"><p className={css.srOnly}>正在加载皮肤详情…</p><div><span /><i /></div><span /><span /><span /></div> : selected !== undefined && state !== null ? <>
          <Button className={css.mobileBack} variant="outline" size="sm" icon={<IconChevronLeftOutline14 />} onClick={() => browserOrigin === 'discover' ? closeBrowser() : setShowDetail(false)}>{browserOrigin === 'discover' ? '返回发现' : '返回列表'}</Button>
          <header className={css.detailHeader}>
            <div className={css.skinAvatar}><PreviewMedia key={`${selected.id}:${getCatalogListScreenshot(selected) ?? 'missing'}:avatar`} skin={selected} src={getCatalogListScreenshot(selected)} alt="" kind="avatar" /></div>
            <div className={css.titleBlock}>
              <h2>{selected.name.zh}</h2>
              <p className={css.description} title={selected.description}>{displayTitle(selected.description)}</p>
              <p className={css.author}>{githubRepoLabel(selected.repo)}</p>
              <p className={css.version}>版本 {selected.install.version}<span aria-hidden="true"> · </span>{compatibilityUnverified ? 'DSH 兼容性待验证' : `兼容 DSH ${selected.compatibility.dsh}`}{runtime?.version !== undefined && runtime.version !== null && <><span aria-hidden="true"> · </span>当前 DSH {runtime.version}</>}<StatusLabel active={state.activation === 'active'}>{statusLabel(state)}</StatusLabel></p>
            </div>
          </header>

          <div className={css.actionRow}>
              {state.installation === 'missing' && <>
                {autoInstallable && <Button variant="primary" size="sm" icon={<IconDownloadOutline16 />} disabled={busy !== null} onClick={() => void installAndActivate()}>安装并使用</Button>}
                {autoInstallable && <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void run('install')}>仅安装</Button>}
                {autoInstallable && <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => { setInstallCopied(null); setShowInstallOptions(true) }}>其他安装方式</Button>}
                {manualOnly && <Button variant="outline" size="sm" icon={<MarkGithubIcon size={16} />} disabled={busy !== null} title="前往 GitHub 查看维护者提供的手动安装方式" onClick={() => window.open(selected.repo, '_blank', 'noopener,noreferrer')}>查看安装说明</Button>}
              </>}
              {state.installation === 'installed' && state.activation === 'inactive' && <Button variant="primary" size="sm" disabled={busy !== null} onClick={activateSelected}>使用</Button>}
              {state.installation === 'installed' && state.activation === 'inactive' && <Button className={css.pinAction} variant="outline" size="sm" aria-pressed="false" title="在不替换当前主皮肤的情况下启用并常驻，适合宠物、音效等可叠加插件；多个皮肤可能发生冲突" disabled={busy !== null} onClick={() => setConfirmPin(true)}>常驻使用</Button>}
              {state.activation === 'restart-required' && <Button variant="primary" size="sm" disabled={busy !== null} onClick={() => void openRestartConfirm()}>重启以应用</Button>}
              {state.activation === 'active' && <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void run('deactivate')}>停用</Button>}
              {state.activation === 'active' && <Button className={css.pinAction} variant="outline" size="sm" aria-pressed={state.pinned === true} title={state.pinned ? '取消后，如果它不是当前主皮肤，将立即停用；以后切换皮肤时也不会再保留' : '切换其他皮肤时仍保持启用，适合宠物、音效等可叠加插件；多个皮肤可能发生冲突'} disabled={busy !== null} onClick={() => state.pinned ? void run('unpin') : setConfirmPin(true)}>{state.pinned ? '取消常驻' : '常驻使用'}</Button>}
              {state.activation === 'restart-required' && state.pinned && <Button className={css.pinAction} variant="outline" size="sm" aria-pressed="true" title="取消常驻并撤销待重启的启用状态" disabled={busy !== null} onClick={() => void run('unpin')}>取消常驻</Button>}
              {state.updateAvailable && !manualOnly && <Button variant={state.activation === 'active' && !state.pinned ? 'primary' : 'outline'} size="sm" icon={<IconRefreshOutline16 />} disabled={busy !== null} onClick={() => void run('update')}>更新</Button>}
              {state.installation !== 'missing' && <Button className={css.iconOnlyButton} variant="outline" size="sm" icon={<IconTrashOutline16 />} aria-label="卸载" title="卸载" disabled={busy !== null} onClick={() => setConfirmUninstall(true)} />}
              <span className={css.actionDivider} aria-hidden="true" />
              <span className={css.repoMeta}>
                <span className={css.stars} title={`GitHub Stars 快照，更新于 ${displayDate(selected.starsUpdatedAt)}`}><StarIcon size={16} aria-hidden="true" /> {selected.githubStars}</span>
                <a className={css.repoLink} href={selected.repo} target="_blank" rel="noreferrer" title={selected.repo}><MarkGithubIcon size={16} aria-hidden="true" /><span>{selected.repo.replace('https://', '')}</span></a>
              </span>
          </div>

          {state.installation === 'installed' && state.activation === 'inactive' && !activationWarningAccepted && <p className={css.notice} role="note">首次启用提示：请先在设置 → 插件中停用其他皮肤、主题和外观插件，避免全局样式冲突。点击“使用”即表示已确认。</p>}
          {(selected.install.companions?.length ?? 0) > 0 && <p className={css.notice} role="note">使用该皮肤时会加载细节定制面板；停用或换到其他皮肤后会从设置页撤掉，不会当成一张独立皮肤。</p>}

          {renderSkinOperationBanner()}
          {renderMarketOperationBanner()}
          {renderPendingRestartBanner()}
          {error !== null && <div className={css.error} role="alert">{error}</div>}

          <div className={css.galleryGroup} data-paused={galleryPaused ? 'true' : 'false'} onMouseEnter={() => setCarouselPausedState(true)} onMouseLeave={() => setCarouselPausedState(false)} onFocusCapture={() => setCarouselPausedState(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setCarouselPausedState(false) }}>
            <div className={css.hero}>
              <button className={`${css.heroOpen} dsh-skin-media-hover`} aria-label={`全屏查看 ${selected.name.zh} 截图 ${shotIndex + 1}`} onClick={() => setLightboxOpen(true)}>
                <PreviewMedia key={`${selected.id}:${selectedScreenshots[shotIndex] ?? 'missing'}:hero`} skin={selected} src={selectedScreenshots[shotIndex]} alt={`${selected.name.zh} 大图预览`} kind="hero" />
              </button>
              {shotCount > 1 && <><Button className={`${css.heroNav} ${css.heroPrev}`} variant="ghost" icon={<IconChevronLeftOutline14 size={18} />} aria-label="上一张截图" onClick={() => moveShot(-1)} /><Button className={`${css.heroNav} ${css.heroNext}`} variant="ghost" icon={<IconChevronLeftOutline14 size={18} />} aria-label="下一张截图" onClick={() => moveShot(1)} /></>}
            </div>
            {selectedScreenshots.length > 1 && <div className={css.thumbnails} ref={thumbnailStripRef} aria-label="截图选择">
              {selectedScreenshots.map((shot, index) => <span className={css.thumbnailFrame} key={shot}><Button className="dsh-skin-media-hover" variant="ghost" data-selected={index === shotIndex} onClick={() => { setShotIndex(index); setCarouselEpoch(current => current + 1) }}><PreviewMedia skin={selected} src={shot} alt={`${selected.name.zh} 截图 ${index + 1}`} kind="thumbnail" loading="lazy" /></Button>{index === shotIndex && <span className={css.thumbnailProgress} key={`${selected.id}:${shotIndex}:${carouselEpoch}`} aria-hidden="true" />}</span>)}
            </div>}
          </div>

          <div className={css.aboutGrid}>
            <article><h3>关于此皮肤</h3><p>{selected.description}</p><div className={css.tags}>{selected.tags.map(tag => <Pill key={tag}>{tag}</Pill>)}</div><dl className={css.metadata}><div><dt>许可证</dt><dd>{selected.license.code}</dd></div><div><dt>代码商业使用</dt><dd>{selected.license.commercialUse ? '许可证允许' : '未获授权'}</dd></div><div><dt>模式</dt><dd>{selected.modes.join(' / ')}</dd></div></dl>{manualOnly && <p className={css.notice}>{manualHealthNotice}</p>}{selected.review?.preview === 'repository-card' && !(selected.marketScreenshots?.length) && <p className={css.notice}>该仓库暂无可识别的皮肤截图，市场使用本地占位卡，不会加载 GitHub 仓库图片。</p>}{usesMarketScreenshots(selected) && <p className={css.notice}>当前展示的是市场在隔离 DSH 中实机补录的截图；仓库尚无可识别的界面截图。</p>}{selected.license.notice && <p className={css.notice}>{selected.license.notice}</p>}</article>
            <aside className={css.changelog}><h3>仓库健康</h3>{selected.health ? <><ol className={css.healthList}>{Object.entries(selected.health.checks).map(([key, value]) => <li key={key}><strong>{healthLabels[key as keyof typeof healthLabels]}</strong><span data-health={value}>{value === 'pass' ? '符合要求' : '建议完善'}</span></li>)}</ol>{selected.health.suggestions.map(suggestion => <p className={css.healthSuggestion} key={suggestion}>{suggestion}</p>)}</> : <p className={css.healthSuggestion}>等待下一次仓库健康扫描。</p>}<h3 className={css.collectionTitle}>收录信息</h3><ol><li><strong>{selected.install.version}</strong><span>版本快照更新于 {displayDate(selected.releaseUpdatedAt)}</span></li><li><strong>Stars</strong><span>{selected.githubStars}，更新于 {displayDate(selected.starsUpdatedAt)}</span></li><li><strong>兼容</strong><span>{compatibilityUnverified ? '等待维护者声明 DSH 兼容范围' : `支持 DSH ${selected.compatibility.dsh}`}</span></li></ol><a href={selected.repo} target="_blank" rel="noreferrer">查看仓库详情</a></aside>
          </div>

          <section className={css.recommendations}><h3>更多推荐</h3><div>{recommendations.map(skin => renderHomeCard(skin, 'discover'))}</div></section>
        </> : <div className={css.loading}>暂无可展示的皮肤详情</div>}
      </main>
        </div>
      </section>
      </Modal>

      {lightboxOpen && selected !== undefined && createPortal(<section className={css.lightbox} role="dialog" aria-modal="true" aria-label={`${selected.name.zh} 全屏截图查看`}>
        <Button className={css.lightboxClose} variant="ghost" icon={<XIcon size={20} />} aria-label="关闭全屏查看" onClick={() => setLightboxOpen(false)} />
        {shotCount > 1 && <Button className={`${css.lightboxNav} ${css.lightboxPrev}`} variant="ghost" icon={<IconChevronLeftOutline14 size={26} />} aria-label="上一张截图" onClick={() => moveShot(-1)} />}
        <button className={css.lightboxStage} aria-label="退出全屏查看" onClick={() => setLightboxOpen(false)}><PreviewMedia key={`${selected.id}:${selectedScreenshots[shotIndex] ?? 'missing'}:lightbox`} skin={selected} src={selectedScreenshots[shotIndex]} alt={`${selected.name.zh} 全屏截图 ${shotIndex + 1}`} kind="hero" /></button>
        {shotCount > 1 && <Button className={`${css.lightboxNav} ${css.lightboxNext}`} variant="ghost" icon={<IconChevronLeftOutline14 size={26} />} aria-label="下一张截图" onClick={() => moveShot(1)} />}
        {shotCount > 1 && <div className={css.lightboxThumbnails} aria-label="全屏截图选择">{selectedScreenshots.map((shot, index) => <Button className="dsh-skin-media-hover" variant="ghost" key={shot} data-selected={index === shotIndex} aria-label={`查看截图 ${index + 1}`} onClick={() => setShotIndex(index)}><PreviewMedia skin={selected} src={shot} alt="" kind="thumbnail" loading="lazy" /></Button>)}</div>}
      </section>, document.body)}

      <Modal
        open={buildApprovalOperation !== null}
        onClose={() => setDismissedBuildApprovalId(buildApprovalOperation?.id ?? null)}
        title="需要批准构建脚本"
        closeLabel="关闭"
        description={buildApprovalOperation?.failure?.message ?? ''}
        footer={<><Button variant="outline" size="sm" onClick={() => setDismissedBuildApprovalId(buildApprovalOperation?.id ?? null)}>稍后</Button><Button variant="primary" size="sm" onClick={approveBuildAndRetry}>批准并重试</Button></>}
      >
        <p className={css.notice}>pnpm 默认阻止依赖执行安装构建脚本。确认后只批准这次报错中列出的精确构建项，不会开启全局构建脚本。</p>
        {buildApprovalOperation?.failure?.packageName !== undefined && <p className={css.notice}>涉及依赖：<code>{buildApprovalOperation.failure.packageName}</code></p>}
      </Modal>
      <Modal open={confirmUninstall} onClose={() => setConfirmUninstall(false)} title="卸载皮肤" closeLabel="关闭" description={state?.activation === 'active' ? '当前皮肤会先停用并恢复 DSH 默认外观，然后删除安装包。' : '将从当前 DSH profile 删除这个皮肤安装包。'} footer={<><Button variant="outline" size="sm" onClick={() => setConfirmUninstall(false)}>取消</Button><Button variant="primary" size="sm" onClick={() => { setConfirmUninstall(false); void run('uninstall') }}>确认卸载</Button></>} />
      <Modal open={confirmPin} onClose={() => setConfirmPin(false)} title="常驻使用此皮肤" closeLabel="关闭" description="开启后，切换其他皮肤时不会自动停用此皮肤。适合宠物、音效等可叠加插件；多个皮肤可能同时修改样式、页面结构或功能，相关冲突风险由用户自行承担。" footer={<><Button variant="outline" size="sm" onClick={() => setConfirmPin(false)}>取消</Button><Button variant="primary" size="sm" onClick={() => { setConfirmPin(false); void run('pin') }}>确认常驻</Button></>}><p className={css.pinWarning}>如果发生冲突或页面无法操作，请停止 DSH，然后查看 <ResetHelpLink /> 中的修复命令。</p></Modal>
      <Modal
        open={compatibilityNotice !== null}
        onClose={() => setCompatibilityNotice(null)}
        title="已拦截安装"
        closeLabel="关闭"
        description={compatibilityNotice === null ? '' : `${compatibilityNotice.skin.name.zh}：${compatibilityNotice.assessment.reason}`}
        footer={<Button variant="primary" size="sm" onClick={() => setCompatibilityNotice(null)}>知道了</Button>}
      >
        <p className={css.notice}>仍可稍后重试安装。若页面异常，请查看 <ResetHelpLink />。</p>
      </Modal>
      <Modal
        open={showInstallOptions}
        onClose={() => setShowInstallOptions(false)}
        title={`安装 ${selected?.name.zh ?? '皮肤'}`}
        closeLabel="关闭"
        description={manualOnly ? '需要按仓库说明完成安装。' : '任选一种，不用都执行。'}
        footer={manualOnly ? <><Button variant="outline" size="sm" onClick={() => setShowInstallOptions(false)}>取消</Button><Button variant="primary" size="sm" onClick={() => void copyInstallOption('prompt')}>{installCopied === `${selected?.id}:prompt` ? '提示词已复制' : '复制提示词'}</Button></> : <Button variant="outline" size="sm" onClick={() => setShowInstallOptions(false)}>关闭</Button>}
      >
        <div className={css.installOptions}>
          <div><strong>提示词</strong><span className={css.copyCapsule}><code title={selected === undefined ? '' : createSkinInstallPrompt(selected)}>{selected === undefined ? '' : createSkinInstallPrompt(selected)}</code><Button className={css.copyCapsuleButton} variant="outline" size="sm" icon={<IconCopyOutline16 />} aria-label={installCopied === `${selected?.id}:prompt` ? '提示词已复制' : '复制提示词'} title="复制提示词" onClick={() => void copyInstallOption('prompt')} /></span></div>
          {manualOnly && <div className={css.manualInstallGuide}><strong>按仓库说明完成安装</strong><p>市场不提供这款皮肤的一键安装命令。复制提示词，让 Agent 先检查仓库，再按维护者说明完成安装。</p>{selected !== undefined && <a href={selected.repo} target="_blank" rel="noreferrer"><MarkGithubIcon size={15} aria-hidden="true" />打开 GitHub 仓库</a>}</div>}
          {!manualOnly && <div><strong>命令</strong><span className={css.copyCapsule}><code title={selected === undefined ? '' : createSkinInstallCommand(selected)}>{selected === undefined ? '' : createSkinInstallCommand(selected)}</code><Button className={css.copyCapsuleButton} variant="outline" size="sm" icon={<IconCopyOutline16 />} aria-label={installCopied === `${selected?.id}:command` ? '命令已复制' : '复制命令'} title="复制命令" onClick={() => void copyInstallOption('command')} /></span><small>{CLI_INSTALL_WARNING}</small></div>}
        </div>
      </Modal>
      <Modal
        open={confirmRestart || compatibilityWarning !== null}
        onClose={() => { if (!restarting) { setConfirmRestart(false); setCompatibilityWarning(null) } }}
        title={confirmRestart ? (restartTarget?.kind === 'market-update' ? '需要重启 DSH 应用皮肤市场更新' : '需要重启 DSH 应用此皮肤') : '兼容性提示'}
        closeLabel="关闭"
        description={confirmRestart
          ? (restarting ? '正在重新启动 DSH，请稍候…' : runningAgents === null && !restartCheckFinished ? '正在检查是否有 Agent 运行。状态确认前不能重启。' : runningAgents === null ? '当前 Host 尚未加载安全检查。请确认没有 Agent 正在运行、重要内容已保存；你可以继续完成这一次升级重启。新版本加载后会自动检测 Agent 状态。' : runningAgents > 0 ? `检测到 ${runningAgents} 个 Agent 正在运行，现在不能重启。请等待任务完全结束后再试，否则可能中断任务并导致会话历史无法加载。` : restartTarget?.kind === 'market-update' ? `Agent 状态检查已通过。但重启仍会关闭所有会话连接；即使回复已经停止显示，也请确认重要内容已保存，且没有即将开始的新任务。皮肤市场新版本 ${marketUpdate?.latestVersion ?? ''} 将在重启后生效。` : 'Agent 状态检查已通过。但重启仍会关闭所有会话连接；即使回复已经停止显示，也请确认重要内容已保存，且没有即将开始的新任务。')
          : undefined}
        footer={confirmRestart
          ? <><Button variant="outline" size="sm" disabled={restarting} onClick={() => { setConfirmRestart(false); setCompatibilityWarning(null) }}>稍后</Button><Button variant="primary" size="sm" disabled={restarting || (runningAgents === null && !restartCheckFinished) || (runningAgents ?? 0) > 0} onClick={() => void restartNow()}>{restarting ? '正在重启…' : runningAgents === null && !restartCheckFinished ? '正在检查…' : runningAgents === null ? '我已确认无任务，仍然重启' : runningAgents > 0 ? '有任务运行中' : '确认无任务，立即重启'}</Button></>
          : <Button variant="primary" size="sm" onClick={() => setCompatibilityWarning(null)}>知道了</Button>}
      >
        {compatibilityWarning !== null && <CompatibilityWarningNote assessment={compatibilityWarning} />}
      </Modal>
      <Modal
        open={showSubmission}
        onClose={() => setShowSubmission(false)}
        title="提交你的皮肤"
        closeLabel="关闭"
        description="复制下面的提示词交给你的 Agent，它会确认皮肤仓库、完成检查并准备市场 PR。"
        footer={<><Button variant="outline" size="sm" onClick={() => setShowSubmission(false)}>关闭</Button><Button variant="primary" size="sm" onClick={() => void copySubmissionPrompt()}>{submissionCopied ? '已复制' : '复制提示词'}</Button></>}
      >
        <div className={css.submission}>
          <textarea aria-label="Agent 投稿提示词" readOnly value={submissionPrompt} rows={16} />
          <small>提示词不会授权 Agent 安装皮肤到你的 DSH，也不会把 Topic 收录等同于安全审核。</small>
        </div>
      </Modal>
    </section>
  )
}
