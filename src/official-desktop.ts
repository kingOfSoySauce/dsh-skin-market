import { randomUUID } from 'node:crypto'
import { hostPnpmRunner, type CommandOptions, type CommandResult, type HostPnpmInvocation, type PluginInstallRequest, type PluginRunner } from './commands.ts'
import { MarketMessageError, type OperationMessageKey, type OperationMessageParams } from './operation-message.ts'
import { compareVersions } from './semver.ts'
import { officialOperationFailure } from './official-failure.ts'
import { normalizeRegistryBase, registryPlanFromSnapshot } from './registry-plan.ts'
import type { DshRuntime } from './types.ts'

/** Structural Host service contract; no Electron or generated Client proxy dependency. */
export interface OfficialPluginManagerLike {
  installBundle(spec: string, options?: Record<string, unknown>): Promise<unknown>
  /** DSH 0.2.x replaces an installed bundle in place, restoring it when the target fails. */
  updateBundle?(name: string, version: string, options?: Record<string, unknown>): Promise<unknown>
  removeBundle(name: string): Promise<unknown>
  /** DSH 0.2.1 exposes the configured registry and its ordered fallbacks. */
  registries?(): Promise<unknown>
  cancelInstall?(requestId: string): Promise<unknown>
  waitForInstall?(requestId: string): Promise<unknown>
  setBundleEnabled?(name: string, enabled: boolean): Promise<unknown>
  setPluginEnabled?(entryId: string, enabled: boolean): Promise<unknown>
  inspect?(spec: string, optionsOrSignal?: unknown, signal?: AbortSignal): Promise<unknown>
  listBundles?(): Promise<unknown>
  listPlugins?(): Promise<unknown>
}

export interface OfficialManagementError {
  code?: string
  message?: string
  diagnostic?: string
  incompatible?: unknown[]
  [key: string]: unknown
}

export type OfficialApplication = 'applied' | 'restart-required' | 'overridden' | 'failed' | 'cancelled'
export type OfficialRestartReason = 'no-hmr' | 'package-moved' | 'host-module' | 'unmanaged-plugin' | 'module-comparison'
interface OfficialManagementFields {
  changed?: boolean
  /** The change is saved but waits for restart; this does not prohibit later enablement changes. */
  restartReason?: OfficialRestartReason
  stage?: string
  target?: string
  enabled?: boolean
  error?: OfficialManagementError
  warnings?: string[]
  pendingBuilds?: string[]
  approvedBuilds?: string[]
  bundle?: string
  version?: string
  registries?: Array<string | null>
  failedAt?: string
  packageResult?: { exitCode?: number; output?: string; kind?: string; [key: string]: unknown }
  requestId?: string
  /** A lost result could not be recovered. This must never trigger an implicit repeat installation. */
  cancelRequested?: boolean
  cancellationStatus?: string
  [key: string]: unknown
}
export type OfficialManagementResult = OfficialManagementFields & (
  | { indeterminate?: false; application?: OfficialApplication }
  | { indeterminate: true; application: 'unknown' }
)

export interface OfficialInstallProgress {
  requestId: string
  phase: 'installing' | 'cancelling' | 'applying'
  attempt?: { registry: string | null; index: number; total: number }
}
export interface OfficialManagementEvents {
  on(event: string, callback: (payload: unknown) => void): (() => void) | void
}
export interface OfficialCapability {
  available: boolean
  reason?: string
  reasonKey?: OperationMessageKey
  reasonParams?: OperationMessageParams
}
export interface OfficialManagementCapabilities {
  install: OfficialCapability
  /** The install-based update path (`installBundle`) this market used before updateBundle was available. */
  update: OfficialCapability
  /** The official `pluginManager.updateBundle`: one Host transaction with its own rollback. */
  managedUpdate: OfficialCapability
  enable: OfficialCapability
  disable: OfficialCapability
  remove: OfficialCapability
  cancel: OfficialCapability
  wait: OfficialCapability
  buildApprovals: OfficialCapability
  registry: OfficialCapability
  saveExact: OfficialCapability
}
export interface OfficialInspectionOptions { registry?: string | null; signal?: AbortSignal }
/** The steps the Host announces while it replaces an installed bundle. */
export type ManagedUpdateStep = 'checking' | 'removing' | 'installing' | 'restoring'
/** One official in-place update: the exact target the Host replaces and how to follow its progress. */
export interface ManagedUpdateOptions extends CommandOptions {
  requestId: string
  /** The Git spec pinned to a full commit of the installed repository directory; required for Git copies. */
  spec?: string
  /** The registry asked first, or null for pnpm's own configuration. */
  registry?: string | null
}
export interface OfficialManagementAdapter {
  /** Newly installed code on these Hosts may need restart; saving enablement is still supported. */
  readonly installRequiresRestart: boolean
  capabilities(): OfficialManagementCapabilities
  setBundleEnabled(name: string, enabled: boolean, options?: CommandOptions): Promise<CommandResult>
  setPluginEnabled(entryId: string, enabled: boolean, options?: CommandOptions): Promise<CommandResult>
  inspect(spec: string, options?: OfficialInspectionOptions): Promise<unknown>
  /** Replace an installed bundle with a strictly newer version through the Host's own transaction. */
  updateBundle?(name: string, version: string, options: ManagedUpdateOptions): Promise<CommandResult>
  listBundles(): Promise<unknown>
  listPlugins(): Promise<unknown>
  /** Ordered registry bases supplied by the official host, when available. */
  registries?(): Promise<string[] | undefined>
}

/**
 * Convert the official manager's registry snapshot into a safe ordered plan.
 * `registry: null` means "whatever pnpm resolves"; in that case `resolved`
 * becomes the first candidate. A resolved private override must not fall
 * through to public registries that could leak the package name.
 */
export function normalizeOfficialRegistryPlan(value: unknown): string[] | undefined {
  return registryPlanFromSnapshot(value)
}

const CORE_VERSION = '0.1.6-alpha.2'
const RECOVERY_VERSION = '0.1.7-alpha.1'
const RESOLUTION_REFRESH_VERSION = '0.2.1-alpha.1'
const EXACT_VERSION = '0.2.1-alpha.2'
// Snapshots below this floor stay exact: those releases changed the call shape.
// This floor and every newer version reuse the audited 0.2.1-rc.1 contract while
// the methods are still present. A host error, not a missing tag, is the backstop.
const STABLE_CONTRACT_VERSION = '0.2.1-rc.1'
const AUDITED_VERSIONS = new Set([
  CORE_VERSION, '0.1.7-alpha.1', '0.1.7-alpha.2', '0.1.7-rc.1', '0.1.7-rc.2',
  '0.2.0-rc.1', '0.2.0-rc.2', '0.2.1-alpha.1', EXACT_VERSION, '0.2.1-alpha.3', STABLE_CONTRACT_VERSION,
])
function recognizedHostVersion(version: string | null): boolean {
  return version !== null && (AUDITED_VERSIONS.has(version) || compareVersions(version, STABLE_CONTRACT_VERSION) >= 0)
}
type RecordLike = Record<string, unknown>

function asRecord(value: unknown): RecordLike | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as RecordLike : undefined
}
function unwrapResult(value: unknown): unknown {
  const record = asRecord(value)
  return record?.ok === true && Object.hasOwn(record, 'value') ? record.value : value
}
function readManagerResult(value: unknown): unknown {
  if (asRecord(value)?.ok === false) throw new Error(resultText(value))
  return unwrapResult(value)
}
function resultText(value: unknown): string {
  const record = asRecord(value)
  const error = record?.error
  if (typeof error === 'string' && error.trim() !== '') return error
  const errorRecord = asRecord(error)
  if (typeof errorRecord?.message === 'string' && errorRecord.message.trim() !== '') return errorRecord.message
  const details = [errorRecord?.diagnostic, errorRecord?.code]
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
  if (details.length > 0) return details.join(': ')
  const packageResult = asRecord(record?.packageResult)
  if (typeof packageResult?.output === 'string' && packageResult.output.trim() !== '') return packageResult.output
  if (typeof packageResult?.message === 'string' && packageResult.message.trim() !== '') return packageResult.message
  try { return JSON.stringify(value) ?? String(value) } catch { return String(value) }
}
function managerResult(value: unknown, requestId?: string, strict = false): CommandResult {
  value = unwrapResult(value)
  const record = asRecord(value)
  const application = record?.application
  if (strict && (record === undefined || application === undefined && record.ok !== false)) {
    return unknownResult(new Error('官方宿主未返回可确认的管理结果'), requestId)
  }
  const normalized: RecordLike = { ...record, ...(requestId === undefined ? {} : { requestId }) }
  delete normalized.indeterminate
  if (typeof normalized.error === 'string') normalized.error = { message: normalized.error }
  if (application !== undefined && !['applied', 'restart-required', 'overridden', 'failed', 'cancelled'].includes(String(application))) {
    normalized.reportedApplication = application
    normalized.application = 'failed'
  }
  const management = normalized as OfficialManagementResult
  // The independently observed Host result outranks package-manager diagnostics.
  const failed = application !== undefined
    ? application !== 'applied' && application !== 'restart-required' && application !== 'overridden'
    : record?.ok === false || record?.success === false || record?.changed === 'failed'
      || asRecord(record?.packageResult)?.exitCode !== undefined && asRecord(record?.packageResult)?.exitCode !== 0
  const output = resultText(value)
  const result: CommandResult = {
    exitCode: failed ? 1 : 0, stdout: failed ? '' : output, stderr: failed ? output : '',
    timedOut: false, aborted: application === 'cancelled', management,
  }
  const failure = officialOperationFailure(result)
  if (failed && failure !== undefined) result.stderr = failure.message
  return result
}
/** Flatten the Host's PluginUpdateResult so the ChangeResult mapper reads its install answer. */
function flattenUpdateResult(value: unknown): unknown {
  const unwrapped = unwrapResult(value)
  const record = asRecord(unwrapped)
  if (record === undefined) return unwrapped
  const result = asRecord(record.result)
  if (result === undefined) return record
  return {
    ...result,
    ...(record.from === undefined ? {} : { from: record.from }),
    ...(record.to === undefined ? {} : { to: record.to }),
    ...(record.step === undefined ? {} : { step: record.step }),
    ...(asRecord(record.restore) === undefined ? {} : { restore: record.restore }),
  }
}
function managerError(error: unknown, _options?: CommandOptions): CommandResult {
  return {
    exitCode: null, stdout: '', stderr: error instanceof Error ? error.message : String(error),
    timedOut: false, aborted: false,
  }
}
function unknownResult(error: unknown, requestId?: string, cancellationStatus?: string): CommandResult {
  // Keep carrier diagnostics structured: generic pnpm recovery must not repeat an unconfirmed mutation.
  return {
    exitCode: 1, stdout: '', stderr: '官方管理结果未确认；请刷新状态后核对，不能自动重复操作', timedOut: false, aborted: false,
    management: {
      application: 'unknown', indeterminate: true, ...(requestId === undefined ? {} : { requestId }),
      error: { code: 'result-unconfirmed', diagnostic: error instanceof Error ? error.message : String(error) },
      ...(cancellationStatus === undefined ? {} : { cancellationStatus }),
    },
  }
}
interface CallRecovery {
  requestId: string
  cancel?(): Promise<unknown>
  wait?: () => Promise<unknown>
}
async function callManager(operation: () => Promise<unknown>, options?: CommandOptions, recovery?: CallRecovery, strict = false): Promise<CommandResult> {
  const aborted = options?.signal?.aborted === true
  const timedOutBeforeStart = options?.timeoutMs !== undefined && options.timeoutMs <= 0
  if (aborted || timedOutBeforeStart) return { exitCode: null, stdout: '', stderr: '', timedOut: !aborted && timedOutBeforeStart, aborted }
  let deadlineRequested = false
  let cancellation: Promise<unknown> | undefined
  let cancellationStatus: string | undefined
  let cancelRequested = false
  const requestCancel = (): void => {
    if (cancelRequested || recovery?.cancel === undefined) return
    cancelRequested = true
    try {
      cancellation = Promise.resolve(recovery.cancel()).then(value => {
        const status = asRecord(unwrapResult(value))?.status
        if (typeof status === 'string') cancellationStatus = status
        return value
      }, () => undefined)
    } catch { /* Original result or recovery remains authoritative. */ }
  }
  options?.signal?.addEventListener('abort', requestCancel, { once: true })
  const timer = recovery?.cancel === undefined || options?.timeoutMs === undefined ? undefined : setTimeout(() => {
    deadlineRequested = true
    requestCancel()
  }, Math.max(0, options.timeoutMs))
  try {
    let value: unknown
    try {
      value = await operation()
      // Generated Client calls resolve carrier failures rather than reject;
      // they provide no authoritative Host mutation result to accept.
      if (strict && asRecord(value)?.ok === false && asRecord(value)?.application === undefined) throw new Error(resultText(value))
    } catch (error) {
      if (recovery === undefined) return strict ? unknownResult(error) : managerError(error)
      if (recovery.wait !== undefined) {
        try { value = await recovery.wait() } catch (waitError) { return unknownResult(waitError, recovery.requestId, cancellationStatus) }
      }
      if (value === undefined || value === null) return unknownResult(error, recovery.requestId, cancellationStatus)
      if (strict && asRecord(value)?.ok === false && asRecord(value)?.application === undefined) return unknownResult(new Error(resultText(value)), recovery.requestId, cancellationStatus)
    }
    if (cancellation !== undefined) await cancellation
    const result = managerResult(value, recovery?.requestId, strict)
    const confirmedCancelled = result.management?.application === 'cancelled'
    if (result.management !== undefined && cancelRequested) {
      result.management.cancelRequested = true
      if (cancellationStatus !== undefined) result.management.cancellationStatus = cancellationStatus
    }
    // An abort during applying cannot overturn success or a required restart.
    result.aborted = confirmedCancelled
    result.timedOut = confirmedCancelled && deadlineRequested
    return result
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    options?.signal?.removeEventListener('abort', requestCancel)
  }
}
function capability(available: boolean, reason: string, reasonKey?: OperationMessageKey, reasonParams?: OperationMessageParams): OfficialCapability {
  return available
    ? { available: true }
    : { available: false, reason, ...(reasonKey === undefined ? {} : { reasonKey }), ...(reasonParams === undefined ? {} : { reasonParams }) }
}
function subscribeProgress(events: OfficialManagementEvents | undefined, requestId: string, options?: CommandOptions): () => void {
  if (events === undefined) return () => undefined
  const disposers: Array<() => void> = []
  try {
    const log = events.on('plugin-manager/install-log', value => {
      const chunk = asRecord(value)
      if (chunk?.requestId !== requestId || typeof chunk.text !== 'string') return
      if (chunk.stream === 'stderr') options?.onStderr?.(chunk.text)
      else if (chunk.stream === 'stdout') options?.onStdout?.(chunk.text)
    })
    if (log !== undefined) disposers.push(log)
    const state = events.on('plugin-manager/install-state', value => {
      const record = asRecord(value)
      if (record?.requestId !== requestId || !['installing', 'cancelling', 'applying'].includes(String(record.phase))) return
      options?.onManagementState?.(record as unknown as OfficialInstallProgress)
    })
    if (state !== undefined) disposers.push(state)
  } catch (error) {
    for (const dispose of disposers) dispose()
    throw error
  }
  return () => { for (const dispose of disposers) dispose() }
}
const UPDATE_STEPS: readonly ManagedUpdateStep[] = ['checking', 'removing', 'installing', 'restoring']
/** Follow the Host's update steps for one request; unrelated request ids are ignored. */
function subscribeUpdateProgress(events: OfficialManagementEvents | undefined, requestId: string, options?: CommandOptions): () => void {
  if (events === undefined || options?.onUpdateStep === undefined) return () => undefined
  let dispose: (() => void) | void = undefined
  try {
    dispose = events.on('plugin-manager/update-state', value => {
      const record = asRecord(value)
      if (record?.requestId !== requestId) return
      const step = record.step
      if (typeof step !== 'string' || !UPDATE_STEPS.includes(step as ManagedUpdateStep)) return
      options.onUpdateStep!(step as ManagedUpdateStep)
    })
  } catch (error) {
    if (dispose !== undefined) dispose()
    throw error
  }
  return () => { if (dispose !== undefined) dispose() }
}

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/
/**
 * pnpm 11 records a git- or tarball-hosted package's `allowBuilds` key as
 * `name@<source URL>`; a monorepo subdirectory can add `#path:...` and keep
 * spaces there. The Host still checks that an approved key is pending, carries
 * no credential and is not a wildcard, so the market only has to reject names
 * that are clearly not one of its exact keys.
 */
const GIT_BUILD_KEY = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*@(?:git\+)?(?:https?|ssh|git):\/\/\S(?:.*\S)?$/

/** A registry package name or the exact git/tarball key pnpm reports for one. */
function exactBuildKey(name: string): boolean {
  if (name === '' || name !== name.trim() || /[\u0000-\u001f\u007f]/.test(name)) return false
  return PACKAGE_NAME.test(name) || GIT_BUILD_KEY.test(name)
}

/** One-argument callers retain structural compatibility; added option fields require audited runtime versions. */
export function officialDesktopRunner(
  getManager: () => OfficialPluginManagerLike | undefined,
  runtime?: DshRuntime,
  events?: OfficialManagementEvents,
  options?: {
    /** The profile this runner mutates; the host pnpm runs with it as cwd. */
    profileDir?: string
    /** Launcher-published pnpm, read lazily because it may appear after mount. */
    packageManager?: () => HostPnpmInvocation | undefined
  },
): PluginRunner {
  const version = runtime?.version?.trim().replace(/\+.*/, '') ?? null
  const coreVersion = version === null ? runtime === undefined : recognizedHostVersion(version)
  const versionAtLeast = (minimum: string): boolean => recognizedHostVersion(version) && compareVersions(version!, minimum) >= 0
  const versionReason = version === null ? '未能识别官方 DSH 版本'
    : `当前皮肤市场尚未适配 DSH ${version}，请更新皮肤市场后重试`
  const versionKey: OperationMessageKey = version === null ? 'failure.hostVersionUnknown' : 'failure.hostVersionUnsupported'
  const versionParams: OperationMessageParams | undefined = version === null ? undefined : { version }
  const capabilities = (): OfficialManagementCapabilities => {
    const manager = getManager()
    const core = coreVersion && manager !== undefined
    const unavailable = manager === undefined ? '官方宿主未提供 pluginManager' : versionReason
    const unavailableKey: OperationMessageKey = manager === undefined ? 'failure.hostPluginManagerMissing'
      : version === null ? 'failure.hostVersionUnknown' : 'failure.hostVersionUnsupported'
    const unavailableParams: OperationMessageParams | undefined = manager === undefined || version === null ? undefined : { version }
    const method = (name: keyof OfficialPluginManagerLike): boolean => core && typeof manager?.[name] === 'function'
    const state = (available: boolean, reason: string, reasonKey: OperationMessageKey, reasonParams?: OperationMessageParams): OfficialCapability => {
      if (available) return { available: true }
      return core
        ? capability(false, reason, reasonKey, reasonParams)
        : capability(false, unavailable, unavailableKey, unavailableParams)
    }
    const cancel = method('cancelInstall')
    const install = method('installBundle')
    const enabled = method('setBundleEnabled') || method('setPluginEnabled')
    return {
      install: state(install, '官方 pluginManager 未提供安装接口', 'failure.hostCapabilityMissing', { capability: 'install' }),
      update: state(install, '官方 pluginManager 未提供更新接口', 'failure.hostCapabilityMissing', { capability: 'update' }),
      managedUpdate: state(method('updateBundle'), '官方 pluginManager 未提供 updateBundle 接口', 'failure.hostCapabilityMissing', { capability: 'updateBundle' }),
      enable: state(enabled, '官方 pluginManager 未提供启用接口', 'failure.hostCapabilityMissing', { capability: 'enable' }),
      disable: state(enabled, '官方 pluginManager 未提供停用接口', 'failure.hostCapabilityMissing', { capability: 'disable' }),
      remove: state(method('removeBundle'), '官方 pluginManager 未提供卸载接口', 'failure.hostCapabilityMissing', { capability: 'remove' }),
      cancel: state(cancel, '官方 pluginManager 未提供取消接口', 'failure.hostCapabilityMissing', { capability: 'cancel' }),
      wait: state(method('waitForInstall') && (runtime === undefined || versionAtLeast(RECOVERY_VERSION)), '此 DSH 版本未提供安装结果恢复接口', 'failure.hostCapabilityMissing', { capability: 'wait' }),
      buildApprovals: state(install, '官方 pluginManager 不支持构建脚本授权', 'failure.hostCapabilityMissing', { capability: 'buildApprovals' }),
      registry: state(core && versionAtLeast(RECOVERY_VERSION), `安装源选项需要已核验的 DSH ${RECOVERY_VERSION} 或更新版本`, 'failure.hostRegistryUnsupported', { version: RECOVERY_VERSION }),
      saveExact: state(core && versionAtLeast(EXACT_VERSION), `精确保存依赖需要已核验的 DSH ${EXACT_VERSION} 或更新版本`, 'failure.hostSaveExactUnsupported', { version: EXACT_VERSION }),
    }
  }
  const versionFailure = (): MarketMessageError => new MarketMessageError(versionReason, versionKey, versionParams)
  const capabilityFailure = (state: OfficialCapability): MarketMessageError =>
    new MarketMessageError(
      state.reason ?? versionReason,
      state.reasonKey ?? versionKey,
      state.reasonKey === undefined ? versionParams : state.reasonParams,
    )
  const requireCapability = (key: keyof OfficialManagementCapabilities): OfficialPluginManagerLike => {
    const state = capabilities()[key]
    if (!state.available) throw capabilityFailure(state)
    return getManager()!
  }
  const install = async (spec: string, requestId: string, request: Partial<PluginInstallRequest>, options?: CommandOptions): Promise<CommandResult> => {
    try {
      const manager = requireCapability('install')
      const caps = capabilities()
      const installOptions: Record<string, unknown> = { enabled: false, requestId }
      if (request.registry !== undefined) {
        if (!caps.registry.available) throw capabilityFailure(caps.registry)
        const normalized = request.registry === null ? null : normalizeRegistryBase(request.registry)
        if (request.registry !== null && normalized === null) throw new Error('安装源必须是无凭据的 HTTP(S) 地址')
        installOptions.registry = request.registry
      }
      if (request.approvedBuilds !== undefined) {
        if (!caps.buildApprovals.available) throw capabilityFailure(caps.buildApprovals)
        const names = [...new Set(request.approvedBuilds)]
        if (names.some(name => !exactBuildKey(name))) throw new Error('构建授权只接受官方返回的精确待定项')
        installOptions.approvedBuilds = names
      }
      if (caps.saveExact.available && request.saveExact !== false) installOptions.saveExact = true
      const unsubscribe = subscribeProgress(events, requestId, options)
      try {
        return await callManager(() => manager.installBundle(spec, installOptions), options, {
          requestId, ...(caps.cancel.available ? { cancel: () => manager.cancelInstall!(requestId) } : {}),
          ...(caps.wait.available ? { wait: () => manager.waitForInstall!(requestId) } : {}),
        }, runtime !== undefined)
      } finally { unsubscribe() }
    } catch (error) { return managerError(error, options) }
  }
  const runner: PluginRunner = async (_profile, args, options) => {
    const verb = args[0]
    const target = args.slice(1).find(argument => !argument.startsWith('-'))
    if (verb === 'add') {
      if (target === undefined) return managerError(new Error('官方 Desktop add 缺少插件目标'), options)
      return install(target, randomUUID(), {}, options)
    }
    if (verb === 'remove') {
      if (target === undefined) return managerError(new Error('官方 Desktop remove 缺少插件名'), options)
      try {
        const manager = requireCapability('remove')
        return await callManager(() => manager.removeBundle(target), options, undefined, runtime !== undefined)
      } catch (error) { return managerError(error, options) }
    }
    return managerError(new Error(`官方 Desktop pluginManager 不支持 ${verb ?? '空命令'}`), options)
  }
  runner.hostKind = 'desktop'
  runner.ensurePnpm = async () => undefined
  runner.installPlugin = (_profile, request, options) => install(request.spec ?? `${request.packageName}@${request.packageVersion}`, request.receiptId, request, options)
  runner.management = {
    installRequiresRestart: version !== null && AUDITED_VERSIONS.has(version) && !versionAtLeast(RESOLUTION_REFRESH_VERSION),
    capabilities,
    async setBundleEnabled(name, enabled, options) {
      try {
        const manager = requireCapability(enabled ? 'enable' : 'disable')
        if (typeof manager.setBundleEnabled !== 'function') throw new Error('官方 pluginManager 未提供组合包启停接口')
        return await callManager(() => manager.setBundleEnabled!(name, enabled), options, undefined, runtime !== undefined)
      } catch (error) { return managerError(error, options) }
    },
    async setPluginEnabled(entryId, enabled, options) {
      try {
        const manager = requireCapability(enabled ? 'enable' : 'disable')
        if (typeof manager.setPluginEnabled !== 'function') throw new Error('官方 pluginManager 未提供插件行启停接口')
        return await callManager(() => manager.setPluginEnabled!(entryId, enabled), options, undefined, runtime !== undefined)
      } catch (error) { return managerError(error, options) }
    },
    async inspect(spec, options) {
      const manager = requireCapability('install')
      if (typeof manager.inspect !== 'function') throw new Error('官方 pluginManager 未提供安装预检接口')
      if (options?.registry !== undefined && !capabilities().registry.available) throw capabilityFailure(capabilities().registry)
      return readManagerResult(await (versionAtLeast(RECOVERY_VERSION)
        ? manager.inspect(spec, options?.registry === undefined ? undefined : { registry: options.registry }, options?.signal)
        : manager.inspect(spec, options?.signal)))
    },
    async updateBundle(name, version, updateOptions) {
      try {
        const manager = requireCapability('managedUpdate')
        const caps = capabilities()
        const requestOptions: Record<string, unknown> = { requestId: updateOptions.requestId }
        if (updateOptions.spec !== undefined) requestOptions.spec = updateOptions.spec
        if (updateOptions.registry !== undefined) {
          if (!caps.registry.available) throw capabilityFailure(caps.registry)
          const normalized = updateOptions.registry === null ? null : normalizeRegistryBase(updateOptions.registry)
          if (updateOptions.registry !== null && normalized === null) throw new Error('安装源必须是无凭据的 HTTP(S) 地址')
          requestOptions.registry = updateOptions.registry
        }
        const unsubscribe = subscribeUpdateProgress(events, updateOptions.requestId, updateOptions)
        try {
          return await callManager(async () => flattenUpdateResult(await manager.updateBundle!(name, version, requestOptions)), updateOptions, {
            requestId: updateOptions.requestId,
            ...(caps.cancel.available ? { cancel: () => manager.cancelInstall!(updateOptions.requestId) } : {}),
            ...(caps.wait.available ? { wait: () => manager.waitForInstall!(updateOptions.requestId) } : {}),
          }, runtime !== undefined)
        } finally { unsubscribe() }
      } catch (error) { return managerError(error, updateOptions) }
    },
    async listBundles() {
      const manager = getManager()
      if (!coreVersion) throw versionFailure()
      if (typeof manager?.listBundles !== 'function') throw new Error('官方 pluginManager 未提供可用的组合包清单')
      return readManagerResult(await manager.listBundles())
    },
    async listPlugins() {
      const manager = getManager()
      if (!coreVersion) throw versionFailure()
      if (typeof manager?.listPlugins !== 'function') throw new Error('官方 pluginManager 未提供可用的插件清单')
      return readManagerResult(await manager.listPlugins())
    },
    async registries() {
      const manager = getManager()
      if (!coreVersion || typeof manager?.registries !== 'function') return undefined
      try {
        return normalizeOfficialRegistryPlan(await manager.registries())
      } catch {
        return undefined
      }
    },
  }
  runner.registryPlan = async () => runner.management?.registries?.()
  if (options?.packageManager !== undefined && options.profileDir !== undefined) {
    runner.hostPnpm = hostPnpmRunner(options.packageManager, options.profileDir)
  }
  return runner
}
