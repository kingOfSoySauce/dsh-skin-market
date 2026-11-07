/**
 * The official rc.2 / alpha.3 Plugins page injects its controller face into the
 * winning `main` registration. This is a guarded adapter to that UI face, not
 * an installation API: the user still submits the official install dialog.
 */
export interface DesktopPluginPanel {
  available(): boolean
  open(spec: string, handoff?: DesktopInstallHandoff, options?: { navigateOnResume?: boolean }): Promise<DesktopPluginPanelResult>
  observe?(listener: () => void): () => void
  takeActivationIntent?(): DesktopActivationIntent | null
  restoreActivationIntent?(intent: DesktopActivationIntent): void
  /** Remember that this failed operation was handed to the install panel. */
  noteRecovery?(operationId: string, status: RecoveryStatus): void
  recoveryStatus?(operationId: string): RecoveryStatus | null
  forgetRecovery?(operationId: string): void
  takeManualRecovery?(): ManualRecovery | null
  restoreManualRecovery?(recovery: ManualRecovery): void
  dispose?(): void
}

export interface DesktopInstallHandoff { skinId: string; packageName: string; operationId?: string; companions?: boolean }
export interface DesktopActivationIntent extends DesktopInstallHandoff { spec: string; requestId: string }
export interface ManualRecovery { operationId?: string; skinId: string; packageName: string; spec: string; companions?: boolean }
export type RecoveryStatus = 'started' | 'opened' | 'blocked' | 'manual'

export type DesktopPluginPanelResult =
  | { ok: true; kind: 'prefilled' | 'resumed' }
  | { ok: false; reason: string }

export interface DesktopPluginPanelContext {
  /** Cordis permits optional service reads through get(), without hard injection. */
  get?: (name: string) => unknown
  layout?: { selectPanel(panelId: string): void }
  slots: { entriesOfSlot?: (slot: string) => readonly unknown[] }
}

interface ManagerSnapshot {
  status: string
  refreshStatus?: unknown
  highlight?: unknown
  notice?: unknown
  packages?: readonly unknown[]
  install: {
    phase: string; open: boolean; spec: string; requestId?: unknown; enabling?: boolean
    subject?: { name?: string } | null; installed?: string | null
  }
}

interface ManagerStore {
  getSnapshot(): unknown
  subscribe(listener: () => void): () => void
}

interface ManagerFace {
  ensure(): void
  openInstall(): void
  editInstallSpec(spec: string): void
  hooks: { pluginManager: ManagerStore }
}

interface PanelLayout { selectPanel(panelId: string): void }
interface PanelTarget { entry: object; face: ManagerFace; layout: PanelLayout }

interface HandoffReceipt extends DesktopInstallHandoff {
  spec: string
  target: PanelTarget
  requestId?: string
  installed: boolean
  retryAllowed: boolean
  enabling: boolean
  highlightBeforeEnable?: unknown
  noticeBeforeEnable?: unknown
  completed: boolean
  packagesAtCompletion?: readonly unknown[]
  lastOutcome?: string
}

const ACTIVE_PHASES = new Set(['checking', 'starting', 'running', 'installing', 'cancelling', 'applying', 'unconfirmed', 'indeterminate'])
const EDITABLE_PHASES = new Set(['idle', 'unknown', 'done', 'failed'])
const UNAVAILABLE = '暂时无法打开 DSH 添加插件面板，请重试。'
const CHANGED = 'DSH 插件面板刚刚重新加载，请重试。'
const LOAD_FAILED = 'DSH 插件列表暂时未能加载，请稍后重试。'
const BUSY = '原生添加插件面板仍在处理另一项任务，请先在插件页确认其状态。'

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

function getLayout(ctx: DesktopPluginPanelContext): PanelLayout | undefined {
  // `layout` is optional for old hosts, so it is deliberately absent from the
  // market's required inject list. Reading ctx.layout directly throws on a real
  // Cordis plugin context even when another plugin provides that service.
  const value: unknown = typeof ctx.get === 'function' ? ctx.get('layout') : ctx.layout
  return typeof object(value)?.selectPanel === 'function' ? value as PanelLayout : undefined
}

function findTarget(ctx: DesktopPluginPanelContext): PanelTarget | undefined {
  const layout = getLayout(ctx)
  if (!layout || typeof ctx.slots.entriesOfSlot !== 'function') return undefined
  const entry = ctx.slots.entriesOfSlot('main').find(value => object(object(value)?.options)?.key === 'plugins')
  const stored = object(entry)
  if (typeof stored?.inject !== 'function') return undefined
  const value: unknown = stored.inject()
  const face = object(value), hooks = object(face?.hooks), store = object(hooks?.pluginManager)
  if (typeof face?.ensure !== 'function' || typeof face.openInstall !== 'function' || typeof face.editInstallSpec !== 'function'
    || typeof store?.getSnapshot !== 'function' || typeof store.subscribe !== 'function') return undefined
  return { entry: stored, face: value as ManagerFace, layout }
}

function snapshot(face: ManagerFace): ManagerSnapshot | undefined {
  const state = object(face.hooks.pluginManager.getSnapshot()), install = object(state?.install)
  if (typeof state?.status !== 'string' || typeof install?.phase !== 'string'
    || typeof install.open !== 'boolean' || typeof install.spec !== 'string') return undefined
  return {
    status: state.status, refreshStatus: state.refreshStatus, highlight: state.highlight, notice: state.notice,
    packages: Array.isArray(state.packages) ? state.packages : undefined,
    install: install as ManagerSnapshot['install'],
  }
}

/** Wait for the Host-owned inventory read without polling or installing anything. */
function waitUntilLoaded(store: ManagerStore, timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise(resolve => {
    let dispose: (() => void) | undefined
    let finished = false
    const timer = setTimeout(() => finish(false), timeoutMs)
    const finish = (ready: boolean): void => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', aborted)
      try { dispose?.() } catch { /* Disposal must not leave the UI action pending. */ }
      resolve(ready)
    }
    const aborted = (): void => finish(false)
    const check = (): void => {
      try {
        const status = object(store.getSnapshot())?.status
        if (status === 'ready') finish(true)
        else if (status !== 'idle' && status !== 'loading') finish(false)
      } catch { finish(false) }
    }
    try {
      if (signal?.aborted) { finish(false); return }
      signal?.addEventListener('abort', aborted, { once: true })
      dispose = store.subscribe(check)
      if (finished) dispose()
      else check()
    } catch { finish(false) }
  })
}

/**
 * Preserve active work. In these official versions `openInstall` resets a
 * request without an id, so a visible `checking` dialog must be left as-is.
 */
function resume(face: ManagerFace, state: ManagerSnapshot, requestedSpec: string): DesktopPluginPanelResult | undefined {
  const install = state.install
  if (install.phase === 'idle' && install.open && install.spec.trim() !== '' && install.spec.trim() !== requestedSpec) {
    return { ok: true, kind: 'resumed' }
  }
  if (!ACTIVE_PHASES.has(install.phase) && !install.enabling && EDITABLE_PHASES.has(install.phase)) return undefined
  if (install.open) return { ok: true, kind: 'resumed' }
  if (typeof install.requestId === 'string' && install.requestId !== '' && install.phase !== 'checking') {
    face.openInstall()
    return snapshot(face)?.install.open ? { ok: true, kind: 'resumed' } : { ok: false, reason: BUSY }
  }
  return { ok: false, reason: BUSY }
}

export function createDesktopPluginPanel(ctx: DesktopPluginPanelContext, options: { readyTimeoutMs?: number } = {}): DesktopPluginPanel {
  const lifetime = new AbortController()
  const observers = new Set<() => void>()
  const activationIntents: DesktopActivationIntent[] = []
  const issuedIntents = new Map<string, DesktopActivationIntent>()
  const manualRecoveries: ManualRecovery[] = []
  const recoveryState = new Map<string, RecoveryStatus>()
  let receipt: HandoffReceipt | undefined
  let disposeStore: (() => void) | undefined
  let disposeRemote: (() => void) | undefined
  let navigationGeneration = 0
  let pending: { spec: string; promise: Promise<DesktopPluginPanelResult> } | undefined
  const notify = (): void => {
    if (lifetime.signal.aborted) return
    for (const listener of [...observers]) {
      try { listener() } catch { /* One unavailable view must not stop another. */ }
    }
  }
  const watchRemote = (): void => {
    if (disposeRemote || lifetime.signal.aborted || typeof ctx.get !== 'function') return
    try {
      const remote = object(ctx.get('remote'))
      // This event has a reason only, with no package/request identity. It is
      // an invalidation signal, never evidence of an activation request.
      if (typeof remote?.$on !== 'function') return
      const dispose: unknown = remote.$on('plugin-manager/changed', notify)
      if (typeof dispose === 'function') disposeRemote = dispose as () => void
    } catch { /* Optional on older hosts; native store tracking still works. */ }
  }
  const stopReceipt = (): void => {
    receipt = undefined
    const dispose = disposeStore
    disposeStore = undefined
    try { dispose?.() } catch { /* Already disposed with its official plugin. */ }
  }
  const returnToMarket = (): void => {
    const generation = navigationGeneration
    queueMicrotask(() => {
      if (lifetime.signal.aborted || navigationGeneration !== generation) return
      try {
        const navigation = typeof ctx.get === 'function' ? object(ctx.get('pluginNavigation')) : undefined
        if (typeof navigation?.openBundle === 'function') navigation.openBundle('dsh-skin-market')
      } catch { /* Keep the intent queued for the next ordinary market visit. */ }
      notify()
    })
  }
  const trackSnapshot = (): void => {
    const current = receipt
    if (!current || lifetime.signal.aborted) return
    try {
      const live = findTarget(ctx)
      if (!live || live.entry !== current.target.entry || live.face !== current.target.face) { stopReceipt(); return }
      const state = snapshot(current.target.face)
      if (!state) { stopReceipt(); return }
      const install = state.install
      if (current.enabling) {
        const notice = object(state.notice)
        if (state.notice !== current.noticeBeforeEnable && notice?.kind === 'failed' && notice.action === 'enable'
          && notice.packageName === current.packageName) { stopReceipt(); notify(); return }
        if (current.completed) {
          if (install.phase !== 'idle' || install.open || install.spec !== '' || state.status === 'error') { stopReceipt(); notify(); return }
          // enableInstalled calls load() after its final marker. Require that
          // later inventory snapshot, rather than the pre-RPC package list.
          if (state.packages === current.packagesAtCompletion || state.status !== 'ready' || state.refreshStatus === 'refreshing') return
          const packages = state.packages?.filter(value => object(value)?.name === current.packageName) ?? []
          const pkg = packages.length === 1 ? object(packages[0]) : undefined
          if (pkg?.installed !== true || pkg.enabled !== true) { stopReceipt(); notify(); return }
          if (current.requestId !== undefined && !issuedIntents.has(current.requestId)) {
            const intent = { skinId: current.skinId, packageName: current.packageName, spec: current.spec, requestId: current.requestId }
            issuedIntents.set(current.requestId, intent)
            activationIntents.push(intent)
          }
          stopReceipt()
          notify()
          returnToMarket()
          return
        }
        // closeInstall can also clear the form during enabling. The official
        // callback's final highlight is the completion marker; it is written
        // after both successful and refused RPCs, so it does not mean success.
        if (install.phase === 'idle' && !install.enabling && state.highlight === current.packageName
          && current.highlightBeforeEnable !== current.packageName && current.requestId !== undefined) {
          current.completed = true
          current.packagesAtCompletion = state.packages
          notify()
        } else if (install.spec !== '' && install.spec.trim() !== current.spec) stopReceipt()
        return
      }
      if (install.spec.trim() !== current.spec) {
        const failedClosed = current.lastOutcome === 'failed' && !install.open
        if (failedClosed) enqueueManual(current)
        stopReceipt()
        if (failedClosed) notify()
        return
      }
      if (current.lastOutcome === 'failed' && !install.open) {
        enqueueManual(current)
        stopReceipt()
        notify()
        return
      }
      const inspectedName = object(install.subject)?.name
      // Git/tarball inspection knows only the spec's form. Package identity
      // becomes mandatory when the completed install reports `installed`.
      if (inspectedName !== undefined && inspectedName !== current.packageName) { stopReceipt(); return }
      const requestId = typeof install.requestId === 'string' && install.requestId !== '' ? install.requestId : undefined
      if (requestId !== undefined && ACTIVE_PHASES.has(install.phase) && install.phase !== 'checking') {
        if (current.requestId === undefined || current.retryAllowed) {
          current.requestId = requestId
          current.installed = false
          current.retryAllowed = false
          current.lastOutcome = undefined
        } else if (requestId !== current.requestId) { stopReceipt(); return }
      }
      if (requestId !== current.requestId || requestId === undefined) return
      if (install.phase === 'failed' || install.phase === 'unknown') {
        current.retryAllowed = true
        const outcome = install.phase === 'failed' ? 'failed' : 'unknown'
        if (current.lastOutcome !== outcome) { current.lastOutcome = outcome; notify() }
        if (outcome === 'failed' && !install.open) {
          enqueueManual(current)
          stopReceipt()
          notify()
        }
        return
      }
      if (install.phase !== 'done') return
      if (install.installed !== current.packageName) { stopReceipt(); return }
      dropManual(current.skinId, current.spec)
      if (current.operationId) recoveryState.delete(current.operationId)
      if (!current.installed) { current.installed = true; notify() }
      if (install.enabling === true) {
        current.enabling = true
        current.highlightBeforeEnable = state.highlight
        current.noticeBeforeEnable = state.notice
      }
    } catch { stopReceipt() }
  }
  const enqueueManual = (current: HandoffReceipt): void => {
    const item: ManualRecovery = {
      operationId: current.operationId, skinId: current.skinId, packageName: current.packageName, spec: current.spec, companions: current.companions,
    }
    if (manualRecoveries.some(existing => existing.operationId === item.operationId && existing.skinId === item.skinId && existing.spec === item.spec)) return
    manualRecoveries.push(item)
    if (current.operationId) recoveryState.set(current.operationId, 'manual')
  }
  const dropManual = (skinId: string, spec: string): void => {
    for (let index = manualRecoveries.length - 1; index >= 0; index -= 1) {
      const item = manualRecoveries[index]
      if (item !== undefined && item.skinId === skinId && item.spec === spec) manualRecoveries.splice(index, 1)
    }
  }
  const beginHandoff = (target: PanelTarget, spec: string, handoff: DesktopInstallHandoff | undefined): void => {
    stopReceipt()
    navigationGeneration += 1
    if (!handoff?.skinId.trim() || !handoff.packageName.trim()) return
    receipt = { ...handoff, spec, target, installed: false, retryAllowed: false, enabling: false, completed: false }
    disposeStore = target.face.hooks.pluginManager.subscribe(trackSnapshot)
  }
  const navigate = (result: DesktopPluginPanelResult, layout: PanelLayout, navigateOnResume: boolean): DesktopPluginPanelResult => {
    if (result.ok && (result.kind === 'prefilled' || navigateOnResume)) layout.selectPanel('plugins')
    return result
  }
  const open = async (spec: string, handoff: DesktopInstallHandoff | undefined, navigateOnResume = true): Promise<DesktopPluginPanelResult> => {
    try {
      if (lifetime.signal.aborted) return { ok: false, reason: UNAVAILABLE }
      watchRemote()
      const target = findTarget(ctx)
      if (!target) return { ok: false, reason: UNAVAILABLE }
      let state = snapshot(target.face)
      if (!state) return { ok: false, reason: UNAVAILABLE }
      const active = resume(target.face, state, spec)
      if (active) return navigate(active, target.layout, navigateOnResume)
      target.face.ensure()
      if (!await waitUntilLoaded(target.face.hooks.pluginManager, options.readyTimeoutMs ?? 8_000, lifetime.signal)) {
        return { ok: false, reason: LOAD_FAILED }
      }
      if (lifetime.signal.aborted) return { ok: false, reason: UNAVAILABLE }
      // HMR may replace the controller while its inventory read is pending.
      const current = findTarget(ctx)
      if (!current || current.entry !== target.entry || current.face !== target.face) return { ok: false, reason: CHANGED }
      state = snapshot(current.face)
      if (!state || state.status !== 'ready') return { ok: false, reason: LOAD_FAILED }
      const becameActive = resume(current.face, state, spec)
      if (becameActive) return navigate(becameActive, current.layout, navigateOnResume)
      if (state.install.phase !== 'idle' || !state.install.open) current.face.openInstall()
      const opened = snapshot(current.face)
      if (!opened?.install.open) return { ok: false, reason: UNAVAILABLE }
      // Never overwrite a run that the official face reports after opening.
      if (!EDITABLE_PHASES.has(opened.install.phase) || opened.install.enabling) return navigate({ ok: true, kind: 'resumed' }, current.layout, navigateOnResume)
      current.face.editInstallSpec(spec)
      const filled = snapshot(current.face)
      if (!filled?.install.open || filled.install.spec !== spec) return { ok: false, reason: UNAVAILABLE }
      beginHandoff(current, spec, handoff)
      return navigate({ ok: true, kind: 'prefilled' }, current.layout, navigateOnResume)
    } catch {
      return { ok: false, reason: UNAVAILABLE }
    }
  }
  return {
    available() {
      if (lifetime.signal.aborted) return false
      try {
        const target = findTarget(ctx)
        return target !== undefined && snapshot(target.face) !== undefined
      } catch { return false }
    },
    open(input, handoff, options) {
      const spec = input.trim()
      if (!spec) return Promise.resolve({ ok: false, reason: '此皮肤缺少可用的安装地址。' })
      if (pending) return pending.spec === spec ? pending.promise
        : Promise.resolve({ ok: false, reason: '正在打开原生添加插件面板，请稍后重试。' })
      const promise = open(spec, handoff, options?.navigateOnResume !== false).finally(() => { if (pending?.promise === promise) pending = undefined })
      pending = { spec, promise }
      return promise
    },
    observe(listener) {
      if (lifetime.signal.aborted) return () => undefined
      watchRemote()
      observers.add(listener)
      return () => { observers.delete(listener) }
    },
    takeActivationIntent() {
      const intent = activationIntents.shift()
      return intent === undefined ? null : { ...intent }
    },
    restoreActivationIntent(intent) {
      if (lifetime.signal.aborted || activationIntents.some(value => value.requestId === intent.requestId)) return
      const issued = issuedIntents.get(intent.requestId)
      if (!issued || issued.skinId !== intent.skinId || issued.packageName !== intent.packageName || issued.spec !== intent.spec) return
      activationIntents.unshift(issued)
      notify()
    },
    noteRecovery(operationId, status) {
      if (!operationId || lifetime.signal.aborted) return
      recoveryState.set(operationId, status)
    },
    recoveryStatus(operationId) {
      return recoveryState.get(operationId) ?? null
    },
    forgetRecovery(operationId) {
      recoveryState.delete(operationId)
      for (let index = manualRecoveries.length - 1; index >= 0; index -= 1) {
        if (manualRecoveries[index]?.operationId === operationId) manualRecoveries.splice(index, 1)
      }
    },
    takeManualRecovery() {
      const item = manualRecoveries.shift()
      return item === undefined ? null : { ...item }
    },
    restoreManualRecovery(recovery) {
      if (lifetime.signal.aborted || manualRecoveries.some(item => item.operationId === recovery.operationId && item.skinId === recovery.skinId && item.spec === recovery.spec)) return
      manualRecoveries.unshift({ ...recovery })
      notify()
    },
    dispose() {
      lifetime.abort()
      stopReceipt()
      try { disposeRemote?.() } catch { /* The remote may already be unloaded. */ }
      disposeRemote = undefined
      observers.clear()
      activationIntents.length = 0
      issuedIntents.clear()
      manualRecoveries.length = 0
      recoveryState.clear()
    },
  }
}
