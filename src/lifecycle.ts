import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir, totalmem } from 'node:os'
import { join } from 'node:path'
import { buildApprovalKeyForTarget, effectiveBuildApprovalKey } from './build-approval.ts'
import { assessCompatibility, compatibilityContext } from './compatibility.ts'
import { persistCompatibilityPatch, planCompatibilityPatch } from './compatibility-adapter.ts'
import type { CommandOptions, CommandResult, PluginInstallRequest, PluginRunner } from './commands.ts'
import { loadCatalog } from './catalog.ts'
import { inspectLockfileDrift } from './repair.ts'
import { desktopGithubInstallPlan, desktopInstallPlan } from './desktop-install.ts'
import { companionAsSkin, discoverMonorepoTarget, isNpmInstallTarget, npmInstallTarget, preferredInstallTarget, reviewedNpmSourceError, updateInstallTarget } from './install-resolution.ts'
import { sharedLoaderIdentifiers } from './loader-ownership.ts'
import { classifyPnpmFailure, failureDiagnostic, PnpmCommandError, runPnpmWithRecovery, type PnpmFailure } from './pnpm-recovery.ts'
import { pluginArgsFor } from './pnpm-compat.ts'
import { PnpmProgressTracker } from './pnpm-progress.ts'
import { normalizeRegistryPlan } from './registry-plan.ts'
import { officialFailureDiagnostic, officialOperationFailure, manualInstallInstruction } from './official-failure.ts'
import { applyConfigurationOverride, applyConfigurationOverrides, inspectConfigurationOverride, inspectConfigurationOverrides, rollbackConfigurationOverride, type ConfigurationOverrideOptions, type ConfigurationOverrideTarget } from './configuration-override.ts'
import type { ConfigurationOverrideBatchPlan } from './configuration-override-types.ts'
import { allowReleaseAgeVersion, parseReleaseAgeTarget, repairReleaseAgeExcludes, type ReleaseAgeTarget } from './release-age.ts'
import { cleanOrphanedStore } from './store.ts'
import { logEvent, sanitizeLogText } from './log.ts'
import { compareVersions, isVersionRange, satisfiesVersionRange } from './semver.ts'
import {
  companionNeedsInstall,
  ensureBuildAllowed,
  ensureSkinRegistration,
  hasLoaderOverride,
  reviewedInstalledSpecMatches,
  npmSourceMigration,
  cleanupCompatibilityPatchFiles,
  detachCompatibilityPatches,
  pnpmLockfile,
  pnpmWorkspaceFile,
  profilePatchFile,
  readDependencies,
  readMarketState,
  readProfileBundles,
  assertNoLoaderConflicts,
  assertNoKnownLoaderConflicts,
  installedLoaderIdentities,
  InstallConflictError,
  LoaderMetadataError,
  compatibilityPatchFile,
  marketStateFile,
  packageManifest,
  packageLoaderIdentities,
  packageLoaderOwnershipAt,
  verifiedDesktopLegacyPackages,
  desktopLegacyReplacementEnabled,
  patchedDependenciesNeedSync,
  removeSkinRegistration,
  restoreFile,
  setManagedLoaderOverride,
  restoreManifest,
  runtimeState,
  snapshotFile,
  snapshotInstalledArtifact,
  compareInstalledArtifact,
  inspectSkinArtifactRisk,
  isSkinArtifactRiskAcknowledged,
  acknowledgeSkinArtifactRisk,
  installedSkinSourceMatches,
  validateInstalledSkin,
  validateNpmArtifact,
  validateDesktopArtifact,
  isGithubArtifactSpec,
  githubArtifactSourceMatches,
  writeMarketState,
  type FileSnapshot,
  type LoaderIdentity,
  type InstalledArtifactSnapshot,
} from './profile.ts'
import { messageFields, writeOperationMessage, writeOperationStep, type OperationMessageKey, type OperationMessageParams } from './operation-message.ts'
import type { DesktopInstallCapability, DshRuntime, InstallConflict, LoaderEntry, ManualFollowUp, MarketHostKind, Operation, OperationFailure, OperationKind, OperationRetryAction, PersistedMarketState, SelectionOperationKind, SkinArtifactRisk, SkinEntry, SkinRuntimeState } from './types.ts'

export interface LifecycleHost {
  loader: { entries(): Iterable<LoaderEntry> }
  on?(event: string, callback: (fiber: { entry?: { options?: { name?: string; id?: string } } }) => void): () => void
}

export interface LifecycleOptions {
  profile: string
  profileDir: string
  runner: PluginRunner
  hostKind?: MarketHostKind
  runtime?: DshRuntime
  /** Shared by all preparation/install attempts; recovery has its own budget. */
  operationTimeoutMs?: number
  recoveryTimeoutMs?: number
  lifecycleWaitMs?: number
  configurationOverride?: ConfigurationOverrideOptions
}

/** A row id is a routing key, not proof that the market owns that plugin. */
function matchesLoaderIdentity(options: { id?: string; name?: string }, identity: LoaderIdentity): boolean {
  return identity.name !== undefined && options.name === identity.name
    && (identity.id === undefined || options.id === identity.id)
}

const OPERATION_TIMEOUT_MS = 15 * 60 * 1000
const RECOVERY_TIMEOUT_MS = 60_000
const DESKTOP_PARALLEL_DOWNLOADS = 2
const CONSTRAINED_PARALLEL_DOWNLOADS = 1
const LOW_MEMORY_BYTES = 3 * 1024 ** 3

function isConstrainedHost(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  memoryBytes: number = totalmem(),
): boolean {
  if (platform === 'android') return true
  if ((env.ANDROID_ROOT ?? '').trim() !== '' || (env.ANDROID_DATA ?? '').trim() !== '') return true
  return memoryBytes > 0 && memoryBytes < LOW_MEMORY_BYTES
}

/** Isolated temp-dir prefetches may overlap; live profile pnpm stays serial. */
export function maxParallelDownloads(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  memoryBytes: number = totalmem(),
): number {
  return isConstrainedHost(platform, env, memoryBytes) ? CONSTRAINED_PARALLEL_DOWNLOADS : DESKTOP_PARALLEL_DOWNLOADS
}

function isTerminalPhase(phase: Operation['phase']): boolean {
  return phase === 'done' || phase === 'failed' || phase === 'cancelled'
}

function removePrefetchDirectory(directory: string): void {
  try {
    rmSync(directory, { recursive: true, force: true })
  } catch {
    // Windows and some Android filesystems can keep a handle on node_modules
    // until the pnpm child has fully released it. Leave the directory; tmp
    // cleanup is best-effort and must not fail a completed download.
  }
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }

class ManagedOperationError extends Error {
  constructor(readonly result: CommandResult, message: string, readonly targetSkinId?: string, readonly manualSpec?: string, readonly manualFollowUp?: ManualFollowUp) { super(message) }
}

interface ConfigurationRepairApproval { failedId: string; context: string; binding: string }

function isSelectionOperation(kind: OperationKind): kind is SelectionOperationKind {
  return kind === 'activate' || kind === 'deactivate' || kind === 'pin' || kind === 'unpin'
}

class ArtifactRiskError extends Error {
  constructor(readonly risk: SkinArtifactRisk) { super(risk.warnings.join('；')) }
}

interface OperationMessageValue {
  message: string
  key?: OperationMessageKey
  params?: OperationMessageParams
}

function recoveryMessage(failure: PnpmFailure): OperationMessageValue {
  if (failure.recovery === 'disable-peer-autoinstall') return { message: '检测到宿主提供但 npm 未发布的 peer，正在关闭 peer 自动安装并重试', key: 'common.recoveryPeerAutoinstall' }
  if (failure.kind === 'release-age') return { message: '检测到新包保护，正在临时放宽本次命令并重试', key: 'common.recoveryReleaseAge' }
  if (failure.kind === 'fetch-timeout') return { message: '当前步骤超时，正在剩余安装时间内重试一次', key: 'common.recoveryTimeout' }
  if (failure.kind === 'network') return { message: '检测到临时网络错误，正在自动重试', key: 'common.recoveryNetwork' }
  return { message: failure.message }
}

interface ProfileInstallSnapshot {
  manifest: FileSnapshot
  profilePatch: FileSnapshot
  marketState: FileSnapshot
  workspace: FileSnapshot
  lockfile: FileSnapshot
  compatibility: FileSnapshot
  artifact: InstalledArtifactSnapshot
}

function snapshotInstallFiles(profileDir: string, packageName: string, version: string): ProfileInstallSnapshot {
  return {
    manifest: snapshotFile(join(profileDir, 'package.json')),
    profilePatch: snapshotFile(profilePatchFile(profileDir)),
    marketState: snapshotFile(marketStateFile(profileDir)),
    workspace: snapshotFile(pnpmWorkspaceFile(profileDir)),
    lockfile: snapshotFile(pnpmLockfile(profileDir)),
    compatibility: snapshotFile(compatibilityPatchFile(profileDir, packageName, version)),
    artifact: snapshotInstalledArtifact(profileDir, packageName),
  }
}

function restoreProfileInstallFiles(profileDir: string, packageName: string, version: string, snapshot: ProfileInstallSnapshot): void {
  restoreManifest(profileDir, snapshot.manifest)
  restoreFile(profilePatchFile(profileDir), snapshot.profilePatch)
  restoreFile(marketStateFile(profileDir), snapshot.marketState)
  restoreFile(pnpmWorkspaceFile(profileDir), snapshot.workspace)
  restoreFile(pnpmLockfile(profileDir), snapshot.lockfile)
  restoreFile(compatibilityPatchFile(profileDir, packageName, version), snapshot.compatibility)
}

export function desktopInstallError(capability: DesktopInstallCapability | undefined): string {
  if (capability?.mode === 'manual-only') {
    return `Desktop 当前不支持该皮肤的一键安装（${capability.reason}），请查看仓库安装说明`
  }
  return 'Desktop 当前仅支持已验证 npm 精确版本的一键安装，请查看仓库安装说明'
}

interface PrefetchedPackage {
  target: string
  loaderRows: LoaderIdentity[]
  packageRows: LoaderIdentity[]
  hasBundle: boolean
}

interface ReleaseAgeApproval {
  target: ReleaseAgeTarget
  context: string
  failedId?: string
}

function managedArtifactUnchanged(profileDir: string, baseline: InstalledArtifactSnapshot): boolean {
  if (baseline.ok) return compareInstalledArtifact(profileDir, baseline).ok
  // A first installation has no previous build to restore. It is safe to
  // repeat only while it still has neither a dependency nor an artifact.
  return baseline.spec === null && baseline.name === null && baseline.version === null
    && JSON.stringify(snapshotInstalledArtifact(profileDir, baseline.packageName)) === JSON.stringify(baseline)
}

function installedArtifactHash(profileDir: string, packageName: string): string | undefined {
  const artifact = snapshotInstalledArtifact(profileDir, packageName)
  return artifact.ok ? createHash('sha256').update(JSON.stringify(artifact)).digest('hex') : undefined
}

function pinnedSkinIds(state: PersistedMarketState): string[] {
  return [...new Set((state.pinnedSkinIds ?? []).filter(id => typeof id === 'string'))]
}

function baseEnabledSkinIds(state: PersistedMarketState, installedSkinIds: readonly string[] = []): Set<string> {
  const disabled = new Set(state.disabledSkinIds)
  const enabled = new Set([...(state.activeSkinId === null ? [] : [state.activeSkinId]), ...pinnedSkinIds(state)])
  const hasSelection = state.activeSkinId !== null || (state.pinnedSkinIds?.length ?? 0) > 0 || state.disabledSkinIds.length > 0
  if (hasSelection) for (const id of installedSkinIds) if (!disabled.has(id)) enabled.add(id)
  return enabled
}

function isWebClientPackage(profileDir: string, packageName: string): boolean {
  const manifest = packageManifest(profileDir, packageName)
  if (manifest === null || typeof manifest.dsh !== 'object' || manifest.dsh === null || Array.isArray(manifest.dsh)) return false
  const client = (manifest.dsh as Record<string, unknown>).client
  if (typeof client !== 'object' || client === null || Array.isArray(client)) return false
  return (client as Record<string, unknown>).platform === 'web'
}

function recordActivity(state: PersistedMarketState, skinId: string, kind: 'installedAt' | 'updatedAt' | 'usedAt', at: string): void {
  state.activity = { ...state.activity, [skinId]: { ...state.activity?.[skinId], [kind]: at } }
}

// Keep this in an .npmrc file instead of passing `--config.fetchTimeout` on
// the CLI. pnpm 11 currently leaves the dotted CLI value as a string, while
// its retry timer requires a number and throws ERR_INVALID_ARG_TYPE.
// The prefetch project only downloads and inspects the plugin; it must not
// resolve host-provided peer packages from the public npm registry.
const PNPM_FETCH_CONFIG = 'fetch-timeout=600000\nauto-install-peers=false\n'

export class SkinLifecycle {
  readonly operations = new Map<string, Operation>()
  private profileChain: Promise<void> = Promise.resolve()
  private profileLockOwner: string | null = null
  private profileOperation?: Operation
  private downloadAvailable = maxParallelDownloads()
  private readonly downloadWaiters: Array<() => void> = []
  private readonly abortControllers = new Map<string, AbortController>()
  private readonly pendingBuildKeys = new Map<string, string[]>()
  private readonly failedReleaseAgeApprovals = new Map<string, ReleaseAgeApproval>()
  private readonly pendingReleaseAgeApprovals = new Map<string, ReleaseAgeApproval>()
  private readonly artifactContexts = new Map<string, string>()
  private readonly sourceMigrationContexts = new Map<string, { context: string; reviewed: string }>()
  private readonly failedArtifactContexts = new Map<string, { context: string; skinId: string; kind: 'activate' | 'pin' }>()
  private readonly compatibilityContexts = new Map<string, string>()
  private readonly deadlines = new Map<string, number>()
  private readonly deadlineTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly operationCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly expired = new Set<string>()
  private readonly profileMutations = new Map<string, number>()
  private readonly recoveryErrors = new Map<string, string>()
  private readonly partialManagedArtifacts = new Set<string>()
  private readonly desktopManagedAttempts = new Set<string>()
  private readonly desktopRecoveryBaselines = new Map<string, { snapshot: ProfileInstallSnapshot; mutationsBefore: number }>()
  private readonly executions = new Map<string, Promise<void>>()
  private catalogEntries: SkinEntry[]
  private skinById: Map<string, SkinEntry>
  private disposeEvent?: () => void
  private disposed = false
  private readonly pendingLifecycle = new Set<Promise<unknown>>()
  private startupReplay?: Promise<void>
  private unresolvedManager = false
  private readonly unverifiedRestartSkinIds = new Set<string>()
  private readonly componentUndo = new Map<string, Map<string, { skin: SkinEntry; entryId: string; enabled: boolean }>>()
  private readonly bundleUndo = new Map<string, Map<string, { skin: SkinEntry; enabled: boolean; binding: string }>>()
  private readonly legacyBundleUndo = new Map<string, Map<string, { skin: SkinEntry; packages: string[]; binding: string }>>()
  private readonly pendingConfigurationRepairs = new Map<string, ConfigurationRepairApproval>()
  private readonly failedConfigurationBindings = new Map<string, string>()
  private readonly pendingSelectionConfigurations = new Map<string, string>()
  private readonly registryPlanCache = new Map<string, string[] | undefined>()

  get waitingReason(): string | undefined {
    if (this.unresolvedManager) return '宿主未返回可确认的操作结果，请重新打开宿主后核对插件状态'
    if (this.pendingLifecycle.size > 0) return '插件仍在完成启停，结果尚未确认；暂时不能继续修改此 profile'
    return undefined
  }

  constructor(private readonly host: LifecycleHost, private readonly options: LifecycleOptions, catalog = loadCatalog().skins) {
    this.catalogEntries = catalog
    this.skinById = new Map(catalog.map(skin => [skin.id, skin]))
  }

  get catalog(): SkinEntry[] { return this.catalogEntries }

  private get hostKind(): MarketHostKind { return this.options.hostKind ?? this.options.runner.hostKind ?? 'dsh' }
  private get management() { return this.options.runner.management }

  private installedSkins(dependencies = readDependencies(this.options.profileDir)): SkinEntry[] {
    return this.catalogEntries.filter(skin => dependencies[skin.package] !== undefined
      && installedSkinSourceMatches(this.options.profileDir, skin))
  }

  private enabledSkinIds(state: PersistedMarketState): Set<string> {
    const installed = this.installedSkins().map(skin => skin.id)
    return baseEnabledSkinIds(state, installed)
  }

  private async registryPlanFor(operation?: Operation): Promise<readonly string[] | undefined> {
    const key = operation?.id ?? '__background__'
    if (this.registryPlanCache.has(key)) return this.registryPlanCache.get(key)
    const provider = this.options.runner.registryPlan ?? this.management?.registries
    if (provider === undefined) {
      this.registryPlanCache.set(key, undefined)
      return undefined
    }
    try {
      const plan = normalizeRegistryPlan(await provider())
      this.registryPlanCache.set(key, plan)
      return plan
    } catch {
      // The host remains authoritative for its own package-manager defaults;
      // a failed optional snapshot must not make an otherwise usable install
      // guess a public mirror.
      this.registryPlanCache.set(key, undefined)
      return undefined
    }
  }

  private assertSkinLoaderConflicts(skin: SkinEntry, rows?: readonly LoaderIdentity[]): void {
    assertNoLoaderConflicts(this.options.profileDir, skin, rows, this.management === undefined ? {} : { hostKind: 'desktop' })
  }

  private legacyBinding(skin: SkinEntry, packages: readonly string[]): string {
    const dependencies = readDependencies(this.options.profileDir)
    return JSON.stringify({ skinId: skin.id, packages: packages.map(name => ({ name, spec: dependencies[name], artifact: snapshotInstalledArtifact(this.options.profileDir, name) })) })
  }

  private bundleBinding(skin: SkinEntry): string {
    return JSON.stringify({ package: skin.package, rowId: skin.rowId,
      manifest: packageManifest(this.options.profileDir, skin.package),
      artifact: snapshotInstalledArtifact(this.options.profileDir, skin.package) })
  }

  /** Undo only native bundle changes made by this operation, using their actual prior choices. */
  private async restoreNativeBundles(operation: Operation, apply = true): Promise<void> {
    const changes = [...this.bundleUndo.get(operation.id)?.values() ?? []]
    if (changes.length === 0 || this.management === undefined) return
    const inventory = await this.awaitLifecycle(this.management.listBundles())
    if (!Array.isArray(inventory)) throw new Error('无法确认回退时的组合包清单')
    for (const { skin, binding } of changes) {
      const matches = inventory.filter(bundle => bundle?.name === skin.package)
      if (binding !== this.bundleBinding(skin) || matches.length !== 1 || matches[0].error !== undefined
        || matches[0].readOnlyReason !== undefined || typeof matches[0].enabled !== 'boolean'
        || matches[0].enabled !== readProfileBundles(this.options.profileDir).includes(skin.package)) {
        throw new Error('组合包安装身份或启用状态已变化，无法自动恢复，请在官方插件页核对状态')
      }
    }
    if (!apply) return
    // Withdraw the rejected target before restoring any formerly selected skin.
    for (const { skin, enabled, binding } of changes.sort((left, right) => Number(left.enabled) - Number(right.enabled))) {
      if (binding !== this.bundleBinding(skin)) throw new Error('组合包安装身份已变化，已停止自动恢复')
      if (readProfileBundles(this.options.profileDir).includes(skin.package) === enabled) continue
      this.acceptManagement(await this.awaitLifecycle(this.management.setBundleEnabled(skin.package, enabled)), operation, skin)
      if (readProfileBundles(this.options.profileDir).includes(skin.package) !== enabled) throw new Error('组合包启用选择恢复未完成，请在官方插件页核对状态')
    }
  }

  /** Inventory is authoritative for whether a reviewed old bundle can be withdrawn. */
  private async inspectLegacyBundles(skin: SkinEntry): Promise<Array<{ name: string; enabled: boolean }>> {
    if (this.management === undefined) return []
    const names = verifiedDesktopLegacyPackages(this.options.profileDir, skin)
    if (names.length === 0) return []
    const binding = this.legacyBinding(skin, names)
    const inventory = await this.awaitLifecycle(this.management.listBundles())
    if (!Array.isArray(inventory)) throw new Error('无法核对旧版皮肤组合包，请在官方插件页检查状态')
    const selected = new Set(readProfileBundles(this.options.profileDir))
    const bundles = names.map(name => {
      const matches = inventory.filter(bundle => bundle?.name === name)
      const bundle = matches.length === 1 ? matches[0] : undefined
      const rows = bundle?.rows
      if (bundle === undefined || bundle.error !== undefined || bundle.readOnlyReason !== undefined
        || typeof bundle.enabled !== 'boolean' || bundle.enabled !== selected.has(name)
        || !Array.isArray(rows) || rows.length !== 1 || rows[0]?.rowId !== skin.rowId || rows[0]?.moduleName !== name
        || rows[0]?.readOnlyReason !== undefined
        || bundle.overrides !== undefined && (!Array.isArray(bundle.overrides) || bundle.overrides.length !== 0)) {
        throw new Error('无法确认可安全切换的唯一旧版皮肤组合包，请在官方插件页检查状态')
      }
      return { name, enabled: bundle.enabled as boolean }
    })
    if (selected.has(skin.package) && bundles.some(bundle => bundle.enabled)) throw new Error('新旧皮肤组合包同时被选中，请先在官方插件页核对状态')
    if (binding !== this.legacyBinding(skin, names)
      || JSON.stringify(names) !== JSON.stringify(verifiedDesktopLegacyPackages(this.options.profileDir, skin))) {
      throw new Error('旧版皮肤安装身份已变化，请刷新后重试')
    }
    return bundles
  }

  private async withdrawLegacyBundles(skin: SkinEntry, operation?: Operation): Promise<void> {
    if (this.management === undefined) return
    this.assertSkinLoaderConflicts(skin)
    const bundles = await this.inspectLegacyBundles(skin)
    if (bundles.length === 0) return
    this.assertRuntimeLoaderConflicts(skin, packageLoaderIdentities(this.options.profileDir, skin.package), bundles.map(bundle => bundle.name))
    const selected = bundles.filter(bundle => bundle.enabled).map(bundle => bundle.name)
    if (selected.length === 0) return
    if (readProfileBundles(this.options.profileDir).includes(skin.package)) throw new Error('新旧皮肤组合包同时被选中，请先在官方插件页核对状态')
    if (operation === undefined) throw new Error('无法记录旧版皮肤切换，请刷新后重试')
    const undo = this.legacyBundleUndo.get(operation.id) ?? new Map()
    // Failed native operations can still have saved changes. Record before the call.
    if (!undo.has(skin.id)) undo.set(skin.id, { skin, packages: selected, binding: this.legacyBinding(skin, selected) })
    this.legacyBundleUndo.set(operation.id, undo)
    for (const name of selected) {
      this.acceptManagement(await this.awaitLifecycle(this.management.setBundleEnabled(name, false)), operation, skin)
      if (readProfileBundles(this.options.profileDir).includes(name)) throw new Error('旧版皮肤停用结果未生效，已停止切换')
    }
    logEvent('info', 'legacy-skin-switch', `已撤下旧版组合包：${selected.join('、')}；保留安装文件`, operation.id)
  }

  /** Called after the ordinary selection rollback, so replay cannot re-enable the target. */
  private async restoreLegacyBundles(operation: Operation): Promise<void> {
    const undo = this.legacyBundleUndo.get(operation.id)
    if (undo === undefined || this.management === undefined || this.disposed || this.waitingReason !== undefined) return
    for (const { skin, packages, binding } of [...undo.values()].reverse()) {
      if (binding !== this.legacyBinding(skin, packages)
        || packages.some(name => !verifiedDesktopLegacyPackages(this.options.profileDir, skin).includes(name))) {
        throw new Error('旧版皮肤安装身份已变化，无法自动恢复，请在官方插件页核对状态')
      }
      await this.inspectLegacyBundles(skin)
      if (readProfileBundles(this.options.profileDir).includes(skin.package)) {
        this.acceptManagement(await this.awaitLifecycle(this.management.setBundleEnabled(skin.package, false)), operation, skin)
      }
      if (readProfileBundles(this.options.profileDir).includes(skin.package)) throw new Error('目标皮肤尚未撤下，已停止恢复旧版以避免冲突')
      for (const name of packages) {
        if (!readProfileBundles(this.options.profileDir).includes(name)) {
          this.acceptManagement(await this.awaitLifecycle(this.management.setBundleEnabled(name, true)), operation, skin)
        }
        if (!readProfileBundles(this.options.profileDir).includes(name)) throw new Error('旧版皮肤启用选择恢复未完成，请在官方插件页核对状态')
      }
    }
  }

  private configurationTarget(operation: Operation): ConfigurationOverrideTarget | undefined {
    if (operation.application !== 'overridden' || typeof operation.failure?.desiredEnabled !== 'boolean'
      || !['activate', 'deactivate', 'pin', 'unpin'].includes(operation.kind)) return undefined
    const skin = this.skin(operation.failure.targetSkinId ?? operation.skinId)
    return { skinId: skin.id, packageName: skin.package, rowId: skin.rowId, enabled: operation.failure.desiredEnabled }
  }

  private configurationBinding(operation: Operation): string {
    const target = this.configurationTarget(operation)
    return JSON.stringify({ operation: this.releaseAgeContext(operation), target,
      install: target === undefined ? undefined : this.skin(target.skinId).install,
      artifact: target === undefined ? undefined : snapshotInstalledArtifact(this.options.profileDir, target.packageName) })
  }

  private describeConfigurationOverride(operation: Operation): void {
    const target = this.configurationTarget(operation)
    if (target === undefined || operation.failure === undefined) return
    const plan = inspectConfigurationOverride(this.options.configurationOverride ?? {}, target)
    operation.failure.configurationOverride = plan
    if (plan.status === 'repairable') {
      operation.failure.action = 'repair-configuration'
      this.failedConfigurationBindings.set(operation.id, this.configurationBinding(operation))
    }
  }

  /** Derive the same main-component directions as the ordinary selection transition. */
  private selectionTargets(kind: SelectionOperationKind, skinId: string, preservedOverride?: readonly string[]): ConfigurationOverrideTarget[] {
    const skin = this.skin(skinId)
    const dependencies = readDependencies(this.options.profileDir)
    if (dependencies[skin.package] === undefined || !installedSkinSourceMatches(this.options.profileDir, skin)) return []
    const previous = readMarketState(this.options.profileDir)
    const pinned = preservedOverride === undefined ? pinnedSkinIds(previous) : [...new Set(preservedOverride)]
    let requests: Array<{ skin: SkinEntry; enabled: boolean }>
    if (kind === 'activate') {
      const enabled = new Set([skinId, ...pinned])
      const installed = this.installedSkins(dependencies)
      requests = [...installed.filter(item => !enabled.has(item.id)), ...installed.filter(item => enabled.has(item.id))]
        .map(item => ({ skin: item, enabled: enabled.has(item.id) }))
    } else if (kind === 'unpin' && (previous.activeSkinId === skinId || !pinned.includes(skinId))) {
      requests = []
    } else {
      requests = [{ skin, enabled: kind === 'pin' }]
    }
    return requests.filter(({ skin: item, enabled }) => {
      const manifest = packageManifest(this.options.profileDir, item.package)
      // Disabling a bundle withdraws its rows and returns before component toggling.
      // A HOME force-enable on a withdrawn row does not need to be removed.
      return enabled || (manifest?.dsh as { bundle?: unknown } | undefined)?.bundle === undefined
    }).map(({ skin: item, enabled }) => ({ skinId: item.id, packageName: item.package, rowId: item.rowId, enabled }))
  }

  private selectionBinding(kind: SelectionOperationKind, skinId: string, targets: readonly ConfigurationOverrideTarget[], preservedOverride?: readonly string[]): string {
    const state = readMarketState(this.options.profileDir)
    return JSON.stringify({
      kind, skinId, profile: this.options.profile, profileDir: this.options.profileDir, runtime: this.runtime,
      capabilities: this.management?.capabilities(),
      selection: { activeSkinId: state.activeSkinId, pinnedSkinIds: pinnedSkinIds(state), requestedPreservedSkinIds: preservedOverride === undefined ? undefined : [...new Set(preservedOverride)], disabledSkinIds: state.disabledSkinIds, bundles: readProfileBundles(this.options.profileDir) },
      profilePatch: snapshotFile(profilePatchFile(this.options.profileDir)),
      targets: targets.map(target => {
        const skin = this.skin(target.skinId)
        return { target, install: skin.install, compatibility: skin.compatibility,
          manifest: packageManifest(this.options.profileDir, skin.package), artifact: snapshotInstalledArtifact(this.options.profileDir, skin.package),
          legacy: this.management === undefined ? undefined : this.legacyBinding(skin, verifiedDesktopLegacyPackages(this.options.profileDir, skin)) }
      }),
    })
  }

  private async selectionContextLocked(kind: SelectionOperationKind, skinId: string, preservedOverride?: readonly string[]): Promise<string> {
    const targets = this.selectionTargets(kind, skinId, preservedOverride)
    const binding = this.selectionBinding(kind, skinId, targets, preservedOverride)
    let identities: Array<{ skinId: string; entryId?: string; enabled?: boolean }> = []
    if (this.management !== undefined) {
      try {
        for (const target of targets) {
          const skin = this.skin(target.skinId)
          const manifest = packageManifest(this.options.profileDir, skin.package)
          const component = await this.officialComponent(skin, (manifest?.dsh as { bundle?: unknown } | undefined)?.bundle !== undefined)
          identities.push({ skinId: target.skinId, ...component })
        }
      } catch {
        // The activation path will report the precise manager error. Keep this
        // read-only context usable so old hosts retain their existing preflight.
        identities = []
      }
    }
    return createHash('sha256').update(JSON.stringify({ binding, identities })).digest('hex')
  }

  private async selectionPlanLocked(kind: SelectionOperationKind, skinId: string, preservedOverride?: readonly string[]): Promise<{ plan: ConfigurationOverrideBatchPlan; targets: ConfigurationOverrideTarget[]; editorContext?: string }> {
    this.skin(skinId)
    const targets = this.selectionTargets(kind, skinId, preservedOverride)
    const selectionContext = await this.selectionContextLocked(kind, skinId, preservedOverride)
    if (this.management === undefined) return { targets, plan: { status: 'none', changes: [], reason: '当前宿主使用原有启停流程。', selectionContext } }
    const batch = inspectConfigurationOverrides(this.options.configurationOverride ?? {}, targets)
    if (batch.status !== 'repairable' || batch.context === undefined) return { targets, plan: { ...batch, selectionContext } }
    const binding = this.selectionBinding(kind, skinId, targets, preservedOverride)
    const identities: Array<{ skinId: string; entryId?: string; enabled?: boolean }> = []
    try {
      for (const target of targets) {
        const skin = this.skin(target.skinId)
        const artifact = snapshotInstalledArtifact(this.options.profileDir, skin.package)
        if (!artifact.ok) throw new Error('目标安装文件不完整，请先修复安装后重新操作。')
        this.assertSkinLoaderConflicts(skin)
        const manifest = packageManifest(this.options.profileDir, skin.package)
        const component = await this.officialComponent(skin, (manifest?.dsh as { bundle?: unknown } | undefined)?.bundle !== undefined)
        identities.push({ skinId: target.skinId, ...component })
      }
      if (this.disposed) throw new Error('皮肤市场宿主已停止，配置未修改。')
      if (this.waitingReason !== undefined) throw new Error(this.waitingReason)
      const freshTargets = this.selectionTargets(kind, skinId, preservedOverride)
      const freshBatch = inspectConfigurationOverrides(this.options.configurationOverride ?? {}, freshTargets)
      if (binding !== this.selectionBinding(kind, skinId, freshTargets, preservedOverride) || batch.context !== freshBatch.context) throw new Error('目标或配置已变化，请重新检查后确认。')
    } catch (error) {
      return { targets, plan: { ...batch, status: 'blocked', context: undefined, selectionContext, reason: sanitizeLogText(errorMessage(error)).slice(0, 280) } }
    }
    const context = createHash('sha256').update(JSON.stringify({ configuration: batch.context, binding, identities })).digest('hex')
    return { targets, plan: { ...batch, context, selectionContext }, editorContext: batch.context }
  }

  /** Background preflight is read-only and never creates a visible Operation. */
  async selectionPlan(kind: SelectionOperationKind, skinId: string, preservedOverride?: readonly string[]): Promise<ConfigurationOverrideBatchPlan> {
    if (!isSelectionOperation(kind)) throw new Error('invalid selection operation')
    const inspection: Operation = { id: randomUUID(), kind, skinId, phase: 'validating', startedAt: new Date().toISOString() }
    return await this.withProfileLock(inspection, async () => (await this.selectionPlanLocked(kind, skinId, preservedOverride)).plan)
  }

  private releaseAgeContext(operation: Pick<Operation, 'kind' | 'skinId'>): string {
    const skin = this.skin(operation.skinId)
    return JSON.stringify({ kind: operation.kind, package: skin.package, rowId: skin.rowId, install: skin.install, runtime: this.runtime.version })
  }

  private repairReleaseAgePolicy(operation?: Operation): string[] {
    const repaired = repairReleaseAgeExcludes(this.options.profileDir)
    if (repaired.length > 0) logEvent('info', 'release-age-repair', `已合并已有精确版本例外：${repaired.join(', ')}`, operation?.id)
    return repaired
  }

  private applyReleaseAgeApproval(operation: Operation): void {
    const approval = this.pendingReleaseAgeApprovals.get(operation.id)
    if (approval !== undefined) {
      const failed = approval.failedId === undefined ? undefined : this.operations.get(approval.failedId)
      if (approval.context !== this.releaseAgeContext(operation) || failed?.phase !== 'failed'
        || failed.failure?.action !== 'approve-release-age'
        || failed.failure.releaseAgeTarget?.packageName !== approval.target.packageName
        || failed.failure.releaseAgeTarget.version !== approval.target.version) throw new Error('皮肤安装目标或需要放行的版本已变化，请重新操作后确认')
      allowReleaseAgeVersion(this.options.profileDir, approval.target)
      this.pendingReleaseAgeApprovals.delete(operation.id)
      logEvent('info', 'release-age-approved', `已允许 ${approval.target.packageName}@${approval.target.version}`, operation.id)
    }
  }

  /** Called only for package transactions while holding the profile queue. */
  private async managedPackageCall(attempt: () => Promise<CommandResult>, operation?: Operation, packageName?: string, completePartialInstall = false): Promise<CommandResult> {
    this.checkDeadline(operation)
    this.repairReleaseAgePolicy(operation)
    const baselineName = packageName ?? (operation === undefined ? undefined : this.skin(operation.skinId).package)
    const baseline = baselineName === undefined ? undefined : snapshotInstalledArtifact(this.options.profileDir, baselineName)
    const result = await attempt()
    // A confirmed failed request can have appended a new, shadowed rule.
    // Never repeat a request whose outcome is unknown or was cancelled.
    if (result.management?.application === 'failed'
      && !result.aborted && !result.timedOut && !this.disposed
      && (operation === undefined || this.abortControllers.get(operation.id)?.signal.aborted !== true)) {
      const repaired = this.repairReleaseAgePolicy(operation)
      const failure = officialOperationFailure(result)
      const repairedRefusal = completePartialInstall && failure?.kind === 'release-age' && failure.releaseAgeTarget !== undefined
        && repaired.includes(failure.releaseAgeTarget.packageName)
      // pnpm can materialize the new build before its final policy check
      // fails. Completing that same exact install fixes the known split
      // state; it does not require pretending the old build was restored.
      if (repaired.length > 0 && (repairedRefusal || baseline !== undefined && managedArtifactUnchanged(this.options.profileDir, baseline))) {
        this.checkDeadline(operation)
        if (operation !== undefined) writeOperationMessage(operation, '已修复版本放行规则，正在重试', 'common.recoveryReleaseAgeRepair')
        return await attempt()
      }
    }
    return result
  }

  private shouldTryNextRegistry(result: CommandResult): boolean {
    if (result.aborted === true || result.timedOut || result.management?.indeterminate === true) return false
    if (result.management?.application !== undefined && result.management.application !== 'failed') return false
    const failure = officialOperationFailure(result) ?? classifyPnpmFailure(result)
    return failure.kind === 'network' || failure.kind === 'fetch-timeout' || failure.kind === 'fetch-404'
      || failure.kind === 'integrity' || failure.kind === 'no-matching-version'
  }

  /** Retry only confirmed, pre-application package failures on the host's next registry. */
  private async managedInstallWithRegistryRecovery(
    request: PluginInstallRequest,
    operation: Operation,
    install: (request: PluginInstallRequest) => Promise<CommandResult>,
  ): Promise<CommandResult> {
    const suppliedPlan = await this.registryPlanFor(operation)
    const canPassRegistry = this.management === undefined || this.management.capabilities().registry.available
    const plan = canPassRegistry && suppliedPlan !== undefined && suppliedPlan.length > 0 ? suppliedPlan : [undefined]
    let result: CommandResult | undefined
    for (let index = 0; index < plan.length; index += 1) {
      this.checkDeadline(operation)
      const registry = plan[index]
      const current = registry === undefined ? request : { ...request, registry }
      result = await this.managedPackageCall(() => install(current), operation, request.packageName, true)
      if (result.exitCode === 0 && !result.timedOut && result.aborted !== true
        && result.management?.application !== 'failed') return result
      if (index + 1 >= plan.length || !this.shouldTryNextRegistry(result)) return result
      this.update(operation, operation.phase, `当前安装源失败，正在尝试备用安装源（${index + 2}/${plan.length}）`, 'common.operationFallbackRegistry', { current: index + 2, total: plan.length })
    }
    return result!
  }

  /** HMR Desktop rejects installBundle for a dependency that already exists. */
  private async replaceInstalledDesktopPackage(packageName: string, spec: string, operation: Operation, install: () => Promise<CommandResult>): Promise<CommandResult> {
    const selected = readProfileBundles(this.options.profileDir).includes(packageName)
    const signal = this.abortControllers.get(operation.id)?.signal
    let step: 'remove' | 'install' | 'enable' = 'remove'
    try {
      const removed = await this.options.runner(this.options.profile, ['remove', packageName], { signal })
      this.acceptManagement(removed, operation)
      step = 'install'
      const installed = await install()
      this.acceptManagement(installed, operation)
      step = 'enable'
      if (selected && this.management !== undefined) {
        const restored = await this.management.setBundleEnabled(packageName, true, { signal })
        this.acceptManagement(restored, operation)
      }
      return installed
    } catch (error) {
      if (error instanceof ManagedOperationError) {
        const followUp: ManualFollowUp = step === 'enable' ? 'enable' : step === 'install' ? 'install' : 'uninstall-then-add'
        const message = followUp === 'uninstall-then-add' ? `${error.message} ${manualInstallInstruction(spec)}` : error.message
        throw new ManagedOperationError(error.result, message, error.targetSkinId, spec, followUp)
      }
      throw error
    }
  }

  private acceptManagement(result: CommandResult, operation?: Operation, subject?: SkinEntry): void {
    const managed = result.management
    if (managed?.indeterminate === true) {
      this.unresolvedManager = true
      if (operation !== undefined) this.update(operation, 'waiting', this.waitingReason)
      throw new Error(this.waitingReason)
    }
    if (managed?.application !== undefined && operation !== undefined) {
      // A selection change can involve several native calls. A later applied
      // toggle does not make an earlier restart requirement disappear.
      if (managed.application !== 'applied' || operation.application !== 'restart-required') operation.application = managed.application
      if (managed.application === 'restart-required') operation.restartRequired = true
      if (managed.pendingBuilds !== undefined) this.pendingBuildKeys.set(operation.id, managed.pendingBuilds)
    }
    if (result.exitCode !== 0 || managed?.application === 'overridden') {
      throw new ManagedOperationError(result, officialOperationFailure(result)?.message || result.stderr || result.stdout || '官方插件管理操作未完成', subject?.id)
    }
  }

  private async awaitLifecycle<T>(promise: Promise<T>, operation = this.profileOperation): Promise<T> {
    let delayed = false
    const timer = setTimeout(() => {
      delayed = true
      this.pendingLifecycle.add(promise)
      if (operation !== undefined) this.update(operation, 'waiting', this.waitingReason)
    }, this.options.lifecycleWaitMs ?? 10_000)
    timer.unref?.()
    try {
      const result = await promise
      if (this.disposed) throw new Error('皮肤市场宿主已停止')
      return result
    } finally {
      clearTimeout(timer)
      this.pendingLifecycle.delete(promise)
      if (delayed && operation?.phase === 'waiting' && !this.unresolvedManager && !this.disposed) this.update(operation, 'activating', '宿主启停已结束，正在核对结果', 'common.operationHostApplied')
    }
  }

  private recordRestart(state: PersistedMarketState, skinId: string, required: boolean, removed = false, inferredArtifact?: string): void {
    const previous = state.pendingRestart?.pid === process.pid ? state.pendingRestart : undefined
    const ids = new Set(previous?.skinIds ?? [])
    const inferredInstalls = new Map(Object.entries(previous?.inferredInstalls ?? {}))
    const selectionChanges = new Set(previous?.selectionChanges ?? [])
    const selectionArtifacts = new Map(Object.entries(previous?.selectionArtifacts ?? {}))
    const stoppedSkinIds = new Set(previous?.stoppedSkinIds ?? [])
    if (required) ids.add(skinId)
    else if (removed) ids.delete(skinId)
    // An installation/update or explicit Host result always takes precedence
    // over a browser selection inference, including an older unknown receipt.
    if (required || removed) {
      selectionChanges.delete(skinId)
      selectionArtifacts.delete(skinId)
      stoppedSkinIds.delete(skinId)
    }
    if (!ids.has(skinId) || required && inferredArtifact === undefined) inferredInstalls.delete(skinId)
    else if (required && inferredArtifact !== undefined) inferredInstalls.set(skinId, inferredArtifact)
    state.pendingRestart = ids.size === 0 ? undefined : {
      pid: process.pid, skinIds: [...ids], id: previous?.id ?? randomUUID(),
      ...(inferredInstalls.size > 0 ? { inferredInstalls: Object.fromEntries(inferredInstalls) } : {}),
      ...(selectionChanges.size > 0 ? { selectionChanges: [...selectionChanges] } : {}),
      ...(selectionArtifacts.size > 0 ? { selectionArtifacts: Object.fromEntries(selectionArtifacts) } : {}),
      ...(stoppedSkinIds.size > 0 ? { stoppedSkinIds: [...stoppedSkinIds] } : {}),
    }
  }

  /**
   * Keep the receipt's direction in step with the saved selection. A disabled
   * skin's restart is only needed to stop its running instance; once the page
   * confirms that instance is gone, no restart is required for the appearance.
   */
  private syncRestartIntent(state: PersistedMarketState, skinId: string): void {
    const pending = state.pendingRestart
    if (pending?.pid !== process.pid || !pending.skinIds.includes(skinId)) return
    const stopped = new Set(pending.stoppedSkinIds ?? [])
    if (this.enabledSkinIds(state).has(skinId)) stopped.delete(skinId)
    else stopped.add(skinId)
    const { stoppedSkinIds: _previousStops, ...rest } = pending
    state.pendingRestart = stopped.size > 0 ? { ...rest, stoppedSkinIds: [...stopped] } : rest
  }

  /** Clear a Web receipt after the browser loader has confirmed the skin live or stopped. */
  async clearWebRestartReceipt(skinId: string): Promise<void> {
    if (this.management !== undefined) throw new Error('仅 Web 皮肤可以确认浏览器重启回执')
    this.skin(skinId)
    const operation: Operation = { id: randomUUID(), skinId, kind: 'activate', phase: 'activating', startedAt: new Date().toISOString() }
    await this.withProfileLock(operation, async () => {
      const state = readMarketState(this.options.profileDir)
      const pending = state.pendingRestart
      if (pending === undefined || !pending.skinIds.includes(skinId)) return
      const skinIds = pending.skinIds.filter(id => id !== skinId)
      const selectionChanges = (pending.selectionChanges ?? []).filter(id => id !== skinId)
      const selectionArtifacts = Object.fromEntries(Object.entries(pending.selectionArtifacts ?? {}).filter(([id]) => id !== skinId))
      const inferredInstalls = Object.fromEntries(Object.entries(pending.inferredInstalls ?? {}).filter(([id]) => id !== skinId))
      const stoppedSkinIds = (pending.stoppedSkinIds ?? []).filter(id => id !== skinId)
      state.pendingRestart = skinIds.length === 0 ? undefined : {
        pid: pending.pid, skinIds, id: pending.id,
        ...(Object.keys(inferredInstalls).length > 0 ? { inferredInstalls } : {}),
        ...(selectionChanges.length > 0 ? { selectionChanges } : {}),
        ...(Object.keys(selectionArtifacts).length > 0 ? { selectionArtifacts } : {}),
        ...(stoppedSkinIds.length > 0 ? { stoppedSkinIds } : {}),
      }
      writeMarketState(this.options.profileDir, state)
    })
  }

  private recordSelectionRestart(previous: PersistedMarketState, next: PersistedMarketState, skin: SkinEntry, operation: Operation): void {
    if (this.management !== undefined || operation.restartRequired === true) {
      this.recordRestart(next, skin.id, operation.restartRequired === true, false,
        operation.application !== 'restart-required' ? previous.pendingRestart?.inferredInstalls?.[skin.id] : undefined)
      return
    }
    const pending = next.pendingRestart?.pid === process.pid ? next.pendingRestart : undefined
    const ids = new Set(pending?.skinIds ?? [])
    const selectionChanges = new Set(pending?.selectionChanges ?? [])
    const selectionArtifacts = new Map(Object.entries(pending?.selectionArtifacts ?? {}))
    // An external plugin-page/CLI replacement may have left an old live
    // fiber. A later selection must not rebind that receipt to the new bytes.
    for (const id of selectionChanges) {
      const artifact = this.selectionArtifactHash(next, id)
      if (artifact !== undefined && artifact === selectionArtifacts.get(id)) continue
      selectionChanges.delete(id)
      selectionArtifacts.delete(id)
    }
    let changed = false
    const before = this.enabledSkinIds(previous), after = this.enabledSkinIds(next)
    const dependencies = readDependencies(this.options.profileDir)
    const beforeTargets = this.selectionClientTargets(previous), afterTargets = this.selectionClientTargets(next)

    const targetSelection = (targets: NonNullable<SkinRuntimeState['selectionClientTargets']>) => JSON.stringify(
      [...targets].sort((left, right) => left.package.localeCompare(right.package)),
    )
    // The browser change may belong to a companion or managed bundle row.
    // Include Host-only participants too: disabling the old browser module
    // can require restart while the new target has no browser entry itself.
    const browserChanged = beforeTargets === undefined || afterTargets === undefined
      || targetSelection(beforeTargets) !== targetSelection(afterTargets)
    for (const id of new Set([...before, ...after])) {
      if (!browserChanged || before.has(id) === after.has(id)) continue
      const item = this.skinById.get(id)
      if (item === undefined || dependencies[item.package] === undefined || !installedSkinSourceMatches(this.options.profileDir, item)) continue
      if (ids.has(id) && !selectionChanges.has(id)) continue
      ids.add(id)
      const artifact = this.selectionArtifactHash(next, id)
      if (artifact !== undefined) {
        selectionChanges.add(id)
        selectionArtifacts.set(id, artifact)
        changed = true
      }
    }
    if (ids.size > 0) next.pendingRestart = {
      pid: process.pid, skinIds: [...ids], id: changed && [...ids].every(id => selectionChanges.has(id)) ? randomUUID() : pending?.id ?? randomUUID(),
      ...(pending?.inferredInstalls === undefined ? {} : { inferredInstalls: pending.inferredInstalls }),
      ...(selectionChanges.size > 0 ? { selectionChanges: [...selectionChanges] } : {}),
      ...(selectionArtifacts.size > 0 ? { selectionArtifacts: Object.fromEntries(selectionArtifacts) } : {}),
      ...(pending?.stoppedSkinIds === undefined ? {} : { stoppedSkinIds: pending.stoppedSkinIds }),
    }
    // This flag remains reserved for actual installation/Host requirements;
    // selection inferences are verified independently in each browser tab.
    if (ids.has(skin.id) && !selectionChanges.has(skin.id)) operation.restartRequired = true
  }

  get restartNoticeId(): string | undefined {
    const pending = readMarketState(this.options.profileDir).pendingRestart
    return pending?.pid === process.pid ? pending.id ?? `legacy-${pending.pid}` : undefined
  }

  /** Resolve only the curated main component, using both official inventories. */
  private async officialComponent(skin: SkinEntry, bundled: boolean, allowLegacyRestart = false): Promise<{ entryId: string; enabled: boolean } | undefined> {
    const management = this.management!
    let entryId: string | undefined
    if (bundled) {
      const bundles = await management.listBundles()
      const matches = Array.isArray(bundles) ? bundles.filter(bundle => bundle?.name === skin.package) : []
      if (matches.length !== 1 || matches[0].error !== undefined) throw new Error('无法确认目标皮肤组合包，请在官方插件页检查加载错误')
      const rows = Array.isArray(matches[0].rows) ? matches[0].rows.filter((row: Record<string, unknown>) => row.rowId === skin.rowId && row.moduleName === skin.package) : []
      if (rows.length !== 1) throw new Error('目标皮肤主组件不唯一，已停止自动启用，请使用官方插件页')
      entryId = typeof rows[0].entryId === 'string' ? rows[0].entryId : undefined
      // A startup-only manager may save a bundle before its row exists. There
      // is no legitimate entry identity to pass to setPluginEnabled yet.
      if (entryId === undefined) return undefined
    }
    const plugins = await management.listPlugins()
    const matches = Array.isArray(plugins) ? plugins.filter(row => row?.patchId === skin.rowId && row.moduleName === skin.package && typeof row.entryId === 'string') : []
    if (matches.length === 0 && entryId !== undefined && allowLegacyRestart && Array.isArray(plugins)
      && desktopLegacyReplacementEnabled(this.options.profileDir, skin)) {
      const aliases = verifiedDesktopLegacyPackages(this.options.profileDir, skin)
      const selected = new Set(readProfileBundles(this.options.profileDir))
      const stale = plugins.filter(row => row?.entryId === entryId && aliases.includes(row.moduleName) && row.readOnlyReason === 'unaddressable')
      const oldLoaders = [...this.host.loader.entries()].filter(entry => entry.options.id === skin.rowId && stale.some(row => row.moduleName === entry.options.name))
      const overrides = this.options.configurationOverride
      if (selected.has(skin.package) && aliases.every(name => !selected.has(name)) && stale.length === 1 && oldLoaders.length === 1
        && Array.isArray(overrides?.overlays) && overrides.overlays.length === 0
        && inspectConfigurationOverride(overrides, { skinId: skin.id, packageName: skin.package, rowId: skin.rowId, enabled: true }).status === 'none') {
        // rc.2 still exposes the old runtime entryId for the new row. It is
        // unaddressable; never send it to setPluginEnabled for the new package.
        return undefined
      }
    }
    if (matches.length !== 1 || (entryId !== undefined && matches[0].entryId !== entryId) || matches[0].readOnlyReason !== undefined || typeof matches[0].enabled !== 'boolean') throw new Error('无法确认可修改的唯一皮肤主组件，请使用官方插件页')
    return { entryId: matches[0].entryId, enabled: matches[0].enabled }
  }

  private async registerSkin(skin: SkinEntry, disabled = true, repairComponent = true): Promise<boolean> {
    if (this.management === undefined) {
      if (readDependencies(this.options.profileDir)[skin.package] === undefined) return false
      this.assertSkinLoaderConflicts(skin)
      this.assertRuntimeLoaderConflicts(skin, [{ id: skin.rowId, name: skin.package, packageName: skin.package }])
      ensureSkinRegistration(this.options.profileDir, skin, disabled)
      return false
    }
    let restartRequired = false
    const manifest = packageManifest(this.options.profileDir, skin.package)
    if (!disabled) this.assertLegacyOfficialPeers(manifest)
    const operation = this.profileOperation
    const pendingLegacyRestart = !disabled && verifiedDesktopLegacyPackages(this.options.profileDir, skin).length > 0
      ? readMarketState(this.options.profileDir).pendingRestart : undefined
    if (operation !== undefined && pendingLegacyRestart?.pid === process.pid && pendingLegacyRestart.skinIds.includes(skin.id)) operation.restartRequired = true
    if (!disabled) await this.withdrawLegacyBundles(skin, operation)
    const bundled = manifest !== null && typeof manifest.dsh === 'object' && manifest.dsh !== null && (manifest.dsh as Record<string, unknown>).bundle !== undefined
    if (bundled) {
      const selected = readProfileBundles(this.options.profileDir).includes(skin.package)
      if (selected !== !disabled) {
        if (operation !== undefined) {
          const undo = this.bundleUndo.get(operation.id) ?? new Map()
          if (!undo.has(skin.package)) undo.set(skin.package, { skin, enabled: selected, binding: this.bundleBinding(skin) })
          this.bundleUndo.set(operation.id, undo)
        }
        const result = await this.awaitLifecycle(this.management.setBundleEnabled(skin.package, !disabled))
        this.acceptManagement(result, operation, skin)
        restartRequired = result.management?.application === 'restart-required'
      }
      if (disabled || !repairComponent) return restartRequired
    } else if (operation === undefined || !repairComponent) return false
    const component = await this.officialComponent(skin, bundled, operation?.restartRequired === true)
    if (component === undefined) {
      if (restartRequired || operation?.restartRequired === true) return true
      throw new Error('目标皮肤组件尚未加载，请在官方插件页检查加载错误')
    }
    if (component.enabled === !disabled) return restartRequired || operation?.restartRequired === true
    if (operation !== undefined) {
      const undo = this.componentUndo.get(operation.id) ?? new Map()
      if (!undo.has(skin.id)) undo.set(skin.id, { skin, entryId: component.entryId, enabled: component.enabled })
      this.componentUndo.set(operation.id, undo)
    }
    const result = await this.awaitLifecycle(this.management.setPluginEnabled(component.entryId, !disabled))
    this.acceptManagement(result, operation, skin)
    restartRequired ||= result.management?.application === 'restart-required'
    const confirmed = await this.officialComponent(skin, bundled)
    if (confirmed?.enabled !== !disabled && !restartRequired && operation?.restartRequired !== true) throw new Error('皮肤主组件启用结果未生效，请在官方插件页检查覆盖配置')
    return restartRequired
  }

  private get runtime(): DshRuntime {
    return this.options.runtime ?? { version: null, capabilities: [], source: 'unknown' }
  }

  private assertCompatibilityContext(operation: Operation, skin: SkinEntry): void {
    const context = this.compatibilityContexts.get(operation.id)
    if (context !== undefined && context !== compatibilityContext(skin, this.runtime)) throw new Error('皮肤版本、兼容范围或 DSH 版本已变化，请重新确认兼容性提示')
  }

  /** Revalidate the shown artifact inside the profile queue before changing selection. */
  private assertArtifactUseApproved(operation: Operation, skin: SkinEntry, artifactContextOverride?: string): void {
    const artifact = snapshotInstalledArtifact(this.options.profileDir, skin.package)
    if (!artifact.ok) throw new Error(artifact.reason)
    if (!installedSkinSourceMatches(this.options.profileDir, skin)) {
      throw new Error(`installed package ${skin.package} does not match the market source; the market will not manage this package`)
    }
    this.assertSkinLoaderConflicts(skin)
    if (this.management === undefined) this.assertRuntimeLoaderConflicts(skin, [{ id: skin.rowId, name: skin.package, packageName: skin.package }])
    const context = artifactContextOverride ?? this.artifactContexts.get(operation.id)
    const risk = inspectSkinArtifactRisk(this.options.profileDir, skin, this.hostKind)
    if (context !== undefined) {
      if (risk?.context !== context || !acknowledgeSkinArtifactRisk(this.options.profileDir, skin, context, this.hostKind)) {
        throw new Error('需要确认的安装构件或目录已变化，请重新操作后确认')
      }
    } else if (risk !== undefined && !isSkinArtifactRiskAcknowledged(this.options.profileDir, skin, this.hostKind)) {
      throw new ArtifactRiskError(risk)
    }
    // Preserve local loader-only activation, while checking client manifests
    // and current managed Desktop importers independently of risk detection.
    const manifest = packageManifest(this.options.profileDir, skin.package)
    if (risk !== undefined || (manifest?.dsh as { client?: unknown } | undefined)?.client !== undefined) {
      const validation = validateInstalledSkin(this.options.profileDir, skin, { hostKind: this.hostKind })
      if (!validation.ok) throw new Error(validation.reason)
    }
    if (this.hostKind === 'desktop' && (skin.install.desktop?.mode === 'managed' || isGithubArtifactSpec(artifact.spec)) && artifact.version === skin.install.version) {
      const validation = validateDesktopArtifact(this.options.profileDir, skin)
      if (!validation.ok) throw new Error(validation.reason)
    }
  }

  private assertPreservedSkinApproved(operation: Operation, skin: SkinEntry): void {
    const approval = operation.preservedSkinApprovals?.[skin.id]
    if (approval === undefined || approval.compatibilityContext !== compatibilityContext(skin, this.runtime)) {
      throw new Error(`皮肤「${skin.name.zh}」的兼容性或选择状态已变化，请重新确认`)
    }
    this.assertArtifactUseApproved(operation, skin, approval.artifactContext)
  }

  private assertLegacyOfficialPeers(manifest: Record<string, unknown> | null): void {
    if (this.management === undefined || this.runtime.version === null || compareVersions(this.runtime.version, '0.1.7-rc.1') >= 0) return
    const peers = manifest?.peerDependencies
    if (peers === undefined) return
    if (peers === null || typeof peers !== 'object' || Array.isArray(peers)) throw new Error('插件 peerDependencies 无效，旧版官方宿主无法核验兼容性')
    for (const [name, value] of Object.entries(peers)) {
      if (name !== '@deepseek-ai/dsh' && !name.startsWith('@deepseek-ai/dsh-')) continue
      if (typeof value !== 'string' || value.trim() === '') throw new Error(`插件 ${name} 的兼容范围无效`)
      const range = value.trim()
      if (['workspace:^', 'workspace:~', 'workspace:*', '*', 'x', 'X'].includes(range)) continue
      const canonicalNumbers = range.split(/[\s|]+/).filter(Boolean).every(term => {
        const raw = term.replace(/^[><=^~]+/, '').split('+')[0]!
        const [core, ...suffix] = raw.split('-')
        return !core!.split('.').some(part => /^0\d+$/.test(part)) && !suffix.join('-').split('.').some(part => /^0\d+$/.test(part))
      })
      if (!canonicalNumbers || !isVersionRange(range) || !satisfiesVersionRange(this.runtime.version, range)) throw new Error(`旧版官方宿主不能确认 ${name} ${range} 与 DSH ${this.runtime.version} 兼容，请使用维护者声明兼容的版本`)
    }
  }

  private async applyCompatibility(skin: SkinEntry, operation: Operation): Promise<void> {
    const plan = planCompatibilityPatch(this.options.profileDir, skin, this.runtime)
    if (plan === null || plan.adapterIds.length === 0) return
    if (this.management !== undefined) throw new Error('当前官方 Desktop 的插件事务不能由市场改写兼容补丁，请使用适合当前宿主的插件版本')
    persistCompatibilityPatch(this.options.profileDir, plan)
    await this.syncPnpmMetadata(operation, `正在应用兼容适配：${plan.adapterIds.join('、')}`)
  }

  private async syncPnpmMetadata(operation: Operation, message = '正在同步 pnpm 锁文件'): Promise<void> {
    if (this.management !== undefined) return
    if (!patchedDependenciesNeedSync(this.options.profileDir)) return
    this.update(operation, 'installing', message)
    await this.run(['install', '--no-frozen-lockfile'], operation)
    if (patchedDependenciesNeedSync(this.options.profileDir)) {
      throw new Error('pnpm patchedDependencies 未能与锁文件同步，已停止本次操作以保护 profile')
    }
  }

  private applyPendingBuildApprovals(operation: Operation): void {
    if (this.hostKind === 'desktop') return
    for (const key of this.pendingBuildKeys.get(operation.id) ?? []) ensureBuildAllowed(this.options.profileDir, key)
  }

  private prefetchBuildApprovals(skin: SkinEntry, operation: Operation, target: string): string[] {
    if (isNpmInstallTarget(skin, target)) return []
    const reviewed = buildApprovalKeyForTarget(skin, target) ?? effectiveBuildApprovalKey(skin)
    return [...new Set([
      ...(this.pendingBuildKeys.get(operation.id) ?? []),
      ...(reviewed === undefined ? [] : [reviewed]),
    ])]
  }

  private preparePrefetchDirectory(directory: string, buildKeys: readonly string[]): void {
    writeFileSync(join(directory, 'package.json'), '{"private":true}\n', 'utf8')
    writeFileSync(join(directory, '.npmrc'), PNPM_FETCH_CONFIG, 'utf8')
    if (buildKeys.length === 0) return
    writeFileSync(join(directory, 'pnpm-workspace.yaml'), 'packages:\n  - .\n', 'utf8')
    for (const key of buildKeys) ensureBuildAllowed(directory, key)
  }

  private async repairMaterializedPackage(skin: SkinEntry, operation: Operation): Promise<void> {
    const drift = inspectLockfileDrift(this.options.profileDir)
    if (drift.length > 0) {
      throw new Error(`profile 的 package.json 与 pnpm-lock.yaml 已不一致（${drift.slice(0, 3).map(entry => entry.packageName).join('、')}${drift.length > 3 ? ' 等' : ''}）；已停止修复，请先在外部终端修复 profile 后再试`)
    }
    this.update(operation, 'installing', `正在修复已记录但未物化的皮肤依赖：${skin.package}`, 'common.operationRepairingRecordedDependency', { package: skin.package })
    await this.run(['install'], operation)
  }

  async replaceCatalog(catalog: SkinEntry[]): Promise<void> {
    this.catalogEntries = catalog
    this.skinById = new Map(catalog.map(skin => [skin.id, skin]))
    await this.replay()
  }

  start(): void {
    if (this.disposed) return
    this.startupReplay = (async () => {
      try {
        await this.replay(true, true)
      } catch (error) {
        logEvent('error', 'startup-replay', errorMessage(error))
      }
    })()
    // The official manager owns native-page changes. Do not interpret a new
    // Host fiber as a request to restore the market's older selection.
    if (this.management !== undefined) return
    this.disposeEvent = this.host.on?.('internal/plugin', fiber => {
      if (this.disposed || this.profileLockOwner !== null || this.waitingReason !== undefined) return
      const name = fiber.entry?.options?.name
      const id = fiber.entry?.options?.id
      const dependencies = readDependencies(this.options.profileDir)
      const skin = this.catalog.find(item => dependencies[item.package] !== undefined
        && installedSkinSourceMatches(this.options.profileDir, item)
        && matchesLoaderIdentity({ id, name }, { id: item.rowId, name: item.package }))
      if (skin === undefined) return
      const state = readMarketState(this.options.profileDir)
      const shouldDisable = !this.enabledSkinIds(state).has(skin.id)
      void this.setEntryDisabled(skin, shouldDisable).catch(error => logEvent('error', 'loader-replay', errorMessage(error)))
    })
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    this.disposeEvent?.()
    this.disposeEvent = undefined
    for (const controller of this.abortControllers.values()) controller.abort()
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      Promise.allSettled([...this.executions.values()]),
      new Promise<void>(resolve => { timer = setTimeout(resolve, this.options.lifecycleWaitMs ?? 10_000) }),
    ])
    if (timer !== undefined) clearTimeout(timer)
    for (const timer of this.deadlineTimers.values()) clearTimeout(timer)
    for (const timer of this.operationCleanupTimers.values()) clearTimeout(timer)
    this.deadlineTimers.clear()
    this.operationCleanupTimers.clear()
    this.operations.clear()
    this.pendingBuildKeys.clear()
    this.failedReleaseAgeApprovals.clear()
    this.pendingReleaseAgeApprovals.clear()
    this.pendingConfigurationRepairs.clear()
    this.failedConfigurationBindings.clear()
    this.pendingSelectionConfigurations.clear()
    this.artifactContexts.clear()
    this.sourceMigrationContexts.clear()
    this.failedArtifactContexts.clear()
    this.compatibilityContexts.clear()
    this.deadlines.clear()
    this.expired.clear()
    this.profileMutations.clear()
    this.recoveryErrors.clear()
    this.partialManagedArtifacts.clear()
    this.desktopManagedAttempts.clear()
    this.desktopRecoveryBaselines.clear()
    this.abortControllers.clear()
    this.executions.clear()
    this.legacyBundleUndo.clear()
    this.bundleUndo.clear()
  }

  skin(id: string): SkinEntry {
    const skin = this.skinById.get(id)
    if (skin === undefined) throw new Error('skin is not in the curated registry')
    return skin
  }

  private entriesFor(skin: SkinEntry): LoaderEntry[] {
    return [...this.host.loader.entries()].filter(entry => matchesLoaderIdentity(entry.options, { id: skin.rowId, name: skin.package }))
  }

  private async setEntryDisabled(skin: SkinEntry, disabled: boolean): Promise<{ found: boolean; live: boolean }> {
    if (this.management !== undefined) {
      const entries = this.entriesFor(skin)
      return { found: entries.length > 0, live: entries.some(entry => entry.fiber !== undefined && entry.options.disabled !== true) }
    }
    if (readDependencies(this.options.profileDir)[skin.package] === undefined) return { found: false, live: false }
    return await this.setLoaderDisabled({ id: skin.rowId, name: skin.package }, disabled)
  }

  private async setLoaderDisabled(identity: LoaderIdentity, disabled: boolean): Promise<{ found: boolean; live: boolean }> {
    const entries = [...this.host.loader.entries()].filter(entry => matchesLoaderIdentity(entry.options, identity))
    for (const entry of entries) {
      // Do not rewrite an already-correct loader state during startup. The
      // DSH client module registry builds its browser boot graph while loader
      // entries are becoming live; an unnecessary disabled -> enabled cycle
      // can make an active skin disappear from that graph until the next
      // restart.
      const currentlyDisabled = entry.options.disabled === true
      if (currentlyDisabled === disabled) continue
      if (this.disposed) throw new Error('皮肤市场宿主已停止')
      await this.awaitLifecycle(entry.update({ disabled: disabled ? true : null }, false, true))
    }
    return { found: entries.length > 0, live: entries.some(entry => entry.fiber !== undefined) }
  }

  private claimManagedLoaders(
    state: PersistedMarketState,
    skin: SkinEntry,
    incomingRows: readonly LoaderIdentity[],
    beforeRows: readonly LoaderIdentity[],
  ): void {
    for (const identity of incomingRows) {
      if (identity.id === undefined) continue
      if (identity.id === skin.rowId && identity.name === skin.package) continue
      const existing = state.managedLoaders?.[identity.id]
      if (existing !== undefined) {
        if (sharedLoaderIdentifiers(existing, identity).length === 0) continue
        if (!existing.ownerSkinIds.includes(skin.id)) existing.ownerSkinIds.push(skin.id)
        continue
      }
      if (beforeRows.some(row => sharedLoaderIdentifiers(row, identity).length > 0)) continue
      if (hasLoaderOverride(this.options.profileDir, identity)) continue
      state.managedLoaders = {
        ...state.managedLoaders,
        [identity.id]: {
          id: identity.id,
          ...(identity.name === undefined ? {} : { name: identity.name }),
          ...(identity.packageName === undefined ? {} : { packageName: identity.packageName }),
          ownerSkinIds: [skin.id],
        },
      }
    }
  }

  private releaseManagedLoaders(state: PersistedMarketState, skinId: string): void {
    for (const [key, identity] of Object.entries(state.managedLoaders ?? {})) {
      if (!identity.ownerSkinIds.includes(skinId)) continue
      identity.ownerSkinIds = identity.ownerSkinIds.filter(ownerSkinId => ownerSkinId !== skinId)
      if (identity.ownerSkinIds.length > 0) continue
      if (this.management === undefined) setManagedLoaderOverride(this.options.profileDir, identity, false)
      delete state.managedLoaders?.[key]
    }
    if (state.managedLoaders !== undefined && Object.keys(state.managedLoaders).length === 0) delete state.managedLoaders
  }

  private async syncManagedLoaders(state: PersistedMarketState, live: boolean): Promise<void> {
    if (this.management !== undefined) return
    const enabled = this.enabledSkinIds(state)
    for (const identity of Object.values(state.managedLoaders ?? {})) {
      const disabled = !identity.ownerSkinIds.some(ownerSkinId => enabled.has(ownerSkinId))
      // Disabled bundle skins are removed from dsh.profile.bundles, so their
      // child rows no longer exist at boot. Persisting child disable rows here
      // would create orphan overrides; receipts are needed only for live sync.
      const controlled = setManagedLoaderOverride(this.options.profileDir, identity, false)
      if (live && controlled) await this.setLoaderDisabled(identity, disabled)
    }
  }

  private reconcileDisabledSkinIds(state: PersistedMarketState, enabled = this.enabledSkinIds(state)): void {
    state.disabledSkinIds = this.catalog.filter(skin => !enabled.has(skin.id)).map(skin => skin.id)
  }

  private selectionHostStatus(state: PersistedMarketState): NonNullable<SkinRuntimeState['selectionHostStatus']> {
    if (this.management !== undefined) return 'unavailable'
    const enabled = this.enabledSkinIds(state)
    const dependencies = readDependencies(this.options.profileDir)
    type Status = NonNullable<SkinRuntimeState['selectionHostStatus']>
    const priority: Record<Status, number> = { applied: 0, 'restart-required': 1, switching: 2, unavailable: 3 }
    let status: Status = 'applied'
    const inspect = (entries: LoaderEntry[], expected: boolean): Status => {
      if (entries.length === 0) return expected ? 'restart-required' : 'applied'
      if (entries.length !== 1) return 'unavailable'
      const entry = entries[0]
      const phase = typeof entry.fiber === 'object' && entry.fiber !== null
        ? (entry.fiber as { state?: unknown }).state : undefined
      if (entry.fiber === undefined) return !expected && entry.options.disabled === true ? 'applied' : 'restart-required'
      // FAILED and unrecognised fibers require diagnostics, never a claim
      // that restarting is certain to repair initialization or identity.
      if (phase === 3 || ![0, 1, 2, 4, 5].includes(phase as number)) return 'unavailable'
      if (expected) {
        if (entry.options.disabled === true) return 'restart-required'
        if (phase === 0 || phase === 1 || phase === 5) return 'switching'
        return phase === 2 ? 'applied' : 'restart-required'
      }
      // Entry.disable() does not await disposal. Even PENDING fibers can own
      // effects, so wait until their effects have actually drained.
      if (phase === 0 || phase === 1 || phase === 5 || entry.options.disabled === true && phase === 2) return 'switching'
      return entry.options.disabled === true && phase === 4 ? 'applied' : 'restart-required'
    }
    const include = (entries: LoaderEntry[], expected: boolean): void => {
      const incoming = inspect(entries, expected)
      if (priority[incoming] > priority[status]) status = incoming
    }
    for (const skin of this.installedSkins(dependencies)) {
      include(this.entriesFor(skin), enabled.has(skin.id))
    }
    const companions = new Set<string>()
    for (const skin of this.catalog) for (const companion of skin.install.companions ?? []) {
      if (companions.has(companion.package) || dependencies[companion.package] === undefined || state.managedCompanions?.[companion.package] === undefined) continue
      companions.add(companion.package)
      include(this.entriesFor(companionAsSkin(skin, companion)), this.companionOwnersEnabled(companion.package, state, enabled))
    }
    const entries = [...this.host.loader.entries()]
    for (const identity of Object.values(state.managedLoaders ?? {})) {
      const matches = entries.filter(entry => matchesLoaderIdentity(entry.options, identity))
      include(matches, identity.ownerSkinIds.some(id => enabled.has(id)))
    }
    return status
  }

  private selectionClientTargets(state: PersistedMarketState): SkinRuntimeState['selectionClientTargets'] {
    const enabled = this.enabledSkinIds(state)
    const dependencies = readDependencies(this.options.profileDir)
    const targets = new Map<string, boolean>()
    const validPackage = (name: string): boolean => /^(?:@[A-Za-z0-9._~-]+\/)?[A-Za-z0-9_~][A-Za-z0-9._~-]*$/.test(name)
    const add = (packageName: string, active: boolean): boolean => {
      if (!validPackage(packageName)) return false
      const manifest = packageManifest(this.options.profileDir, packageName)
      if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) return false
      if (manifest.dsh !== undefined && (typeof manifest.dsh !== 'object' || manifest.dsh === null || Array.isArray(manifest.dsh))) return false
      const client = (manifest.dsh as { client?: unknown } | undefined)?.client
      if (client !== undefined && (typeof client !== 'object' || client === null || Array.isArray(client))) return false
      if (!isWebClientPackage(this.options.profileDir, packageName)) return true
      if (typeof manifest.name !== 'string' || !validPackage(manifest.name)) return false
      targets.set(manifest.name, active || targets.get(manifest.name) === true)
      return true
    }
    for (const skin of this.installedSkins(dependencies)) {
      if (!add(skin.package, enabled.has(skin.id))) return undefined
    }
    const companions = new Set<string>()
    for (const skin of this.catalog) for (const companion of skin.install.companions ?? []) {
      if (companions.has(companion.package) || dependencies[companion.package] === undefined || state.managedCompanions?.[companion.package] === undefined) continue
      companions.add(companion.package)
      if (!add(companion.package, this.companionOwnersEnabled(companion.package, state, enabled))) return undefined
    }
    for (const identity of Object.values(state.managedLoaders ?? {})) {
      // A bundle may insert another package or an export of its own package.
      // Unknown legacy row ownership cannot prove a complete browser graph.
      const name = identity.name
      let packageName = name !== undefined && validPackage(name) && packageManifest(this.options.profileDir, name) !== null ? name : undefined
      if (packageName === undefined && identity.packageName !== undefined
        && (name === undefined || name === identity.packageName || name.startsWith(`${identity.packageName}/`))) packageName = identity.packageName
      if (packageName === undefined || !add(packageName, identity.ownerSkinIds.some(id => enabled.has(id)))) return undefined
    }
    return [...targets].map(([packageName, active]) => ({ package: packageName, active }))
  }

  private selectionArtifactHash(state: PersistedMarketState, skinId: string): string | undefined {
    const skin = this.skinById.get(skinId)
    if (skin === undefined) return undefined
    const packages = new Set([skin.package])
    for (const [packageName, companion] of Object.entries(state.managedCompanions ?? {})) {
      if (companion.ownerSkinIds.includes(skinId)) packages.add(packageName)
    }
    const validPackage = (name: string): boolean => /^(?:@[A-Za-z0-9._~-]+\/)?[A-Za-z0-9_~][A-Za-z0-9._~-]*$/.test(name)
    for (const identity of Object.values(state.managedLoaders ?? {})) {
      if (!identity.ownerSkinIds.includes(skinId)) continue
      const name = identity.name
      let packageName = name !== undefined && validPackage(name) && packageManifest(this.options.profileDir, name) !== null ? name : undefined
      if (packageName === undefined && identity.packageName !== undefined
        && (name === undefined || name === identity.packageName || name.startsWith(`${identity.packageName}/`))) packageName = identity.packageName
      if (packageName === undefined) return undefined
      packages.add(packageName)
    }
    const artifacts: Array<[string, string]> = []
    for (const packageName of [...packages].sort()) {
      const artifact = installedArtifactHash(this.options.profileDir, packageName)
      if (artifact === undefined) return undefined
      artifacts.push([packageName, artifact])
    }
    // Selection flags deliberately do not enter this identity. Unrelated
    // installed skins likewise cannot turn a successful toggle into restart.
    return createHash('sha256').update(JSON.stringify(artifacts)).digest('hex')
  }

  async replay(repairComponents = true, startup = false): Promise<void> {
    if (this.disposed || this.waitingReason !== undefined) return
    // Startup reconciliation writes the same profile as explicit actions.
    // Keep its inventory reads and follow-up writes in that same queue.
    const replay: Operation = { id: randomUUID(), skinId: '', kind: 'activate', phase: 'activating', startedAt: new Date().toISOString() }
    await this.withProfileLock(replay, () => this.replayLocked(repairComponents, startup))
  }

  private async replayLocked(repairComponents = true, startup = false): Promise<void> {
    if (this.disposed || this.waitingReason !== undefined) return
    if (this.management !== undefined) {
      try { this.repairReleaseAgePolicy() }
      catch (error) { logEvent('warn', 'release-age-repair', errorMessage(error)) }
    }
    const state = readMarketState(this.options.profileDir)
    const preserveNativeSelection = this.management !== undefined
    // A fresh host process must verify and consume receipts from the previous
    // process even when the restart scheduler reused its PID. Ordinary catalog
    // replay in the same process must not consume a live operation's receipt.
    const previousRestart = startup || state.pendingRestart?.pid !== process.pid ? state.pendingRestart : undefined
    const dependencies = readDependencies(this.options.profileDir)
    const installed = this.installedSkins(dependencies)
    const rootBundles = new Set(readProfileBundles(this.options.profileDir))
    // An explicitly bundled skin that has not yet been recorded as managed
    // is treated as active. Managed inactive bundles are removed below.
    const installedIds = new Set(installed.map(skin => skin.id))
    const normalizedActive = state.activeSkinId !== null && installedIds.has(state.activeSkinId) ? state.activeSkinId : null
    const normalizedPinned = pinnedSkinIds(state).filter(id => installedIds.has(id))
    const stateChanged = state.activeSkinId !== normalizedActive
      || JSON.stringify(state.pinnedSkinIds ?? []) !== JSON.stringify(normalizedPinned)
    state.activeSkinId = normalizedActive
    state.pinnedSkinIds = normalizedPinned
    const manuallyActive = !preserveNativeSelection && state.activeSkinId === null
      ? installed.filter(skin => rootBundles.has(skin.package) && !state.disabledSkinIds.includes(skin.id) && !normalizedPinned.includes(skin.id)).at(-1)
      : undefined
    if (manuallyActive !== undefined) {
      state.activeSkinId = manuallyActive.id
    }
    const previousDisabled = JSON.stringify(state.disabledSkinIds)
    if (!preserveNativeSelection) this.reconcileDisabledSkinIds(state)
    if (!preserveNativeSelection && (stateChanged || manuallyActive !== undefined || previousDisabled !== JSON.stringify(state.disabledSkinIds))) {
      writeMarketState(this.options.profileDir, state)
    }
    const enabled = this.enabledSkinIds(state)
    if (previousRestart !== undefined) {
      const runtime = this.management === undefined ? [] : await this.runtimeStates(true)
      const unresolved = previousRestart.skinIds.filter(id => enabled.has(id) && runtime.some(item => item.skinId === id && (item.activation === 'unavailable' || item.activation === 'switching')))
      for (const id of previousRestart.skinIds) {
        if (unresolved.includes(id)) this.unverifiedRestartSkinIds.add(id)
        else this.unverifiedRestartSkinIds.delete(id)
      }
      // Keep failed verification as an old-process receipt, not a new restart
      // request. Reopening the market or restarting again must not reissue the
      // same profile write when higher-priority configuration still wins.
      state.pendingRestart = unresolved.length === 0 ? undefined : { ...previousRestart, skinIds: unresolved }
      writeMarketState(this.options.profileDir, state)
    }
    // Native bundle/component choices are already persisted by the official
    // manager. Startup and catalog refresh only verify restart receipts; only
    // an explicit failed market action may restore its saved selection.
    if (preserveNativeSelection) return
    // Replay also restores failed transitions. Remove the rejected selection
    // before re-enabling the original one so two ordinary skins never overlap.
    let restartChanged = false
    for (const skin of [...installed.filter(skin => !enabled.has(skin.id)), ...installed.filter(skin => enabled.has(skin.id))]) {
      if (this.unverifiedRestartSkinIds.has(skin.id)) continue
      if (await this.registerSkin(skin, !enabled.has(skin.id), repairComponents)) {
        this.recordRestart(state, skin.id, true)
        restartChanged = true
      }
    }
    // On startup, preserve the active entry's initial loader state. Toggling
    // it off and back on here races the client-module registry, which builds
    // the browser boot graph while loader entries are becoming live. Only
    // reconcile installed non-active entries; the active entry's profile
    // override was already written above and should be loaded directly.
    for (const skin of installed) {
      await this.setEntryDisabled(skin, !enabled.has(skin.id))
    }
    await this.syncManagedLoaders(state, true)
    const previousCompanions = JSON.stringify(state.managedCompanions)
    await this.syncInstalledCompanions(state, true)
    if (restartChanged || previousCompanions !== JSON.stringify(state.managedCompanions)) writeMarketState(this.options.profileDir, state)
  }

  states(): SkinRuntimeState[] {
    const state = readMarketState(this.options.profileDir)
    const pending = state.pendingRestart?.pid === process.pid ? state.pendingRestart : undefined
    const selectionChanges = this.management === undefined ? (pending?.selectionChanges ?? []).filter(id => {
      const artifact = this.selectionArtifactHash(state, id)
      return artifact !== undefined && artifact === pending?.selectionArtifacts?.[id]
    }) : []
    const selectionHostStatus = this.management === undefined ? this.selectionHostStatus(state) : undefined
    const selectionHostApplied = selectionHostStatus === undefined ? undefined : selectionHostStatus === 'applied'
    const selectionClientTargets = this.management === undefined ? this.selectionClientTargets(state) : undefined
    const enabled = this.enabledSkinIds(state)
    return this.catalog.map(skin => {
      const entries = this.entriesFor(skin)
      const runtime = runtimeState(this.options.profileDir, skin, state.activeSkinId, entries.some(entry => entry.fiber !== undefined && entry.options.disabled !== true), entries.length > 0, pinnedSkinIds(state), state.activity?.[skin.id], this.hostKind, [...enabled])
      if (runtime.installation === 'installed' && isWebClientPackage(this.options.profileDir, skin.package)) runtime.clientModule = true
      const sourceMigration = this.hostKind === 'desktop' ? undefined : npmSourceMigration(this.options.profileDir, skin)
      const restartPending = state.pendingRestart?.pid === process.pid && state.pendingRestart.skinIds.includes(skin.id)
      const restartOnlyToStop = restartPending && !enabled.has(skin.id) && state.pendingRestart?.stoppedSkinIds?.includes(skin.id) === true
      return { ...runtime, ...(runtime.installation === 'installed' && this.management === undefined ? { selectionHostApplied, selectionHostStatus,
        ...(selectionClientTargets === undefined ? {} : { selectionClientTargets }) } : {}), ...(!restartPending && enabled.has(skin.id) && entries.length > 0 && entries.every(entry => entry.options.disabled === true) ? { activation: 'unavailable' as const, error: '皮肤组件已关闭；请点击使用以自动启用，或在官方插件页检查覆盖配置', errorKey: 'common.dshComponentDisabled' as const } : {}), ...(!restartPending && enabled.has(skin.id) && this.unverifiedRestartSkinIds.has(skin.id) ? { activation: 'unavailable' as const, error: '重启后皮肤仍未生效，请在官方插件页检查组件开关、加载错误或更高优先级的覆盖配置', errorKey: 'common.dshComponentRestartFailed' as const } : {}), ...(restartPending ? { activation: 'restart-required' as const, error: undefined,
        ...(restartOnlyToStop ? { restartOnlyToStop: true as const } : {}),
        ...(selectionChanges.includes(skin.id) ? { restartSource: 'selection' as const } : {}) } : {}), ...(sourceMigration === undefined ? {} : { sourceMigration }) }
    })
  }

  /** Official inventory separates a saved toggle from actual fiber health. */
  async runtimeStates(skipStartupReplay = false): Promise<SkinRuntimeState[]> {
    if (!skipStartupReplay && this.startupReplay !== undefined) await this.startupReplay
    const pending = readMarketState(this.options.profileDir).pendingRestart
    if (this.management !== undefined && pending?.pid === process.pid && Object.keys(pending.inferredInstalls ?? {}).length > 0
      && this.profileLockOwner === null && this.waitingReason === undefined) {
      // Refresh can observe a first installation finishing asynchronously.
      // Serialize receipt cleanup with installs and selection writes.
      const verification: Operation = { id: randomUUID(), skinId: '', kind: 'activate', phase: 'activating', startedAt: new Date().toISOString() }
      return await this.withProfileLock(verification, () => this.inspectRuntimeStates(true))
    }
    return await this.inspectRuntimeStates()
  }

  private async inspectRuntimeStates(reconcileInferred = false): Promise<SkinRuntimeState[]> {
    const current = this.states()
    const management = this.management
    if (management === undefined) return current
    const saved = readMarketState(this.options.profileDir)
    const inferredInstalls = reconcileInferred && saved.pendingRestart?.pid === process.pid ? saved.pendingRestart.inferredInstalls ?? {} : {}
    const inferredIds = new Set(Object.keys(inferredInstalls))
    const inspect = current.filter(state => state.installation === 'installed')
    if (inspect.length === 0) return current
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const inspectInventory = async () => {
        const inventory = await management.listPlugins()
        if (!Array.isArray(inventory)) throw new Error('宿主插件清单格式无效')
        let bundlesPromise: Promise<unknown> | undefined
        const bundleFor = async (name: string): Promise<Record<string, unknown> | undefined> => {
          const bundles = await (bundlesPromise ??= management.listBundles())
          if (!Array.isArray(bundles)) throw new Error('宿主组合包清单格式无效')
          const matches = bundles.filter(item => item?.name === name)
          return matches.length === 1 ? matches[0] : undefined
        }
        return await Promise.all(current.map(async state => {
          if (!inspect.includes(state)) return state
          // A running old fiber cannot discharge the Host's explicit restart
          // requirement for an update or another unverified replacement.
          if (state.activation === 'restart-required' && !inferredIds.has(state.skinId)) return state
          const skin = this.skin(state.skinId)
          let matches = inventory.filter(row => row?.patchId === skin.rowId && row.moduleName === skin.package && typeof row.entryId === 'string')
          let bundle: Record<string, unknown> | undefined
          // Read-only rows may deliberately omit patchId. Bundle declaration
          // can still identify them for diagnostics; it does not grant writes.
          if (matches.length === 0) {
            bundle = await bundleFor(skin.package)
            const rows = Array.isArray(bundle?.rows) ? bundle.rows.filter((row: Record<string, unknown>) => row.rowId === skin.rowId && row.moduleName === skin.package && typeof row.entryId === 'string') : []
            if (rows.length === 1) matches = inventory.filter(row => row?.entryId === rows[0].entryId && row.moduleName === skin.package)
          }
          if (matches.length === 0 && state.activation === 'inactive' && !state.primary && !state.pinned && bundle?.enabled !== true) {
            return { ...state, activation: 'inactive' as const, error: undefined }
          }
          if (matches.length !== 1) return { ...state, activation: 'unavailable' as const, error: '无法确认唯一的皮肤主组件，请在官方插件页检查加载状态', errorKey: 'common.dshComponentUnknown' as const }
          const row = matches[0]
          if (row.enabled === false) {
            bundle ??= await bundleFor(skin.package)
            return state.activation === 'inactive' && !state.primary && !state.pinned && bundle?.enabled !== true
              ? { ...state, activation: 'inactive' as const, error: undefined }
              : { ...state, activation: 'unavailable' as const, error: '皮肤组件已关闭；请点击使用以自动启用，或在官方插件页检查覆盖配置', errorKey: 'common.dshComponentDisabled' as const }
          }
          if (row.enabled !== true) return { ...state, activation: 'unavailable' as const, error: '宿主未提供可确认的组件启用状态，请在官方插件页核对', errorKey: 'common.dshComponentUnknown' as const }
          if (row.fiberPhase === 'active') return { ...state, activation: 'active' as const, error: undefined }
          if (row.fiberPhase === 'loading' || row.fiberPhase === 'pending') return { ...state, activation: 'switching' as const, error: row.fiberPhase === 'loading' ? '皮肤组件正在加载，请稍候' : '皮肤组件正在等待所需服务，请在官方插件页查看详情', errorKey: row.fiberPhase === 'loading' ? 'common.dshComponentLoading' as const : 'common.dshComponentWaiting' as const }
          return { ...state, activation: 'unavailable' as const, error: row.fiberPhase === 'failed' ? '皮肤组件加载失败，请在官方插件页查看错误详情' : row.fiberPhase === null ? '皮肤组件已启用但尚未运行，请在官方插件页查看加载状态' : '宿主未提供可确认的组件运行状态，请在官方插件页核对', errorKey: row.fiberPhase === 'failed' ? 'common.dshComponentFailed' as const : row.fiberPhase === null ? 'common.dshComponentNotLoaded' as const : 'common.dshComponentUnknown' as const }
        }))
      }
      // This read holds the selection queue only to clean up receipts. A
      // stalled Host must not block later writes or let a late read clear a
      // newer restart requirement after that queue has been released.
      const inspected = await Promise.race([
        inspectInventory(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('宿主插件清单读取超时')), this.options.lifecycleWaitMs ?? 10_000) }),
      ])
      const confirmed = new Set(inspected.filter(state => inferredIds.has(state.skinId) && state.activation === 'active'
        // The official plugin page can replace a package outside our queue.
        // A live old fiber must not discharge a different installed build.
        && installedArtifactHash(this.options.profileDir, this.skin(state.skinId).package) === inferredInstalls[state.skinId]).map(state => state.skinId))
      if (confirmed.size > 0 && saved.pendingRestart !== undefined) {
        const pending = saved.pendingRestart
        const skinIds = pending.skinIds.filter(id => !confirmed.has(id))
        const remainingInstalls = Object.fromEntries(Object.entries(pending.inferredInstalls ?? {}).filter(([id]) => !confirmed.has(id)))
        saved.pendingRestart = skinIds.length === 0 ? undefined : {
          pid: pending.pid, skinIds, id: pending.id,
          ...(Object.keys(remainingInstalls).length > 0 ? { inferredInstalls: remainingInstalls } : {}),
        }
        writeMarketState(this.options.profileDir, saved)
      }
      return inspected.map((state, index) => this.describeRestartVerification(inferredIds.has(state.skinId) && !confirmed.has(state.skinId) ? current[index] : state))
    } catch (error) {
      return current.map(state => inspect.includes(state) && state.activation !== 'restart-required' && !inferredIds.has(state.skinId) ? { ...state, activation: 'unavailable' as const, error: `${this.unverifiedRestartSkinIds.has(state.skinId) ? '重启后皮肤仍未生效：' : ''}无法核对皮肤组件运行状态：${errorMessage(error)}`, errorKey: 'common.dshComponentUnknown' as const } : state)
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }

  private describeRestartVerification(state: SkinRuntimeState): SkinRuntimeState {
    if (state.activation === 'active') this.unverifiedRestartSkinIds.delete(state.skinId)
    if (!this.unverifiedRestartSkinIds.has(state.skinId) || state.activation === 'restart-required') return state
    return { ...state, error: `重启后皮肤仍未生效：${state.error ?? '请在官方插件页检查组件开关、加载错误或更高优先级的覆盖配置'}`, errorKey: 'common.dshComponentRestartFailed' }
  }

  private liveOperations(): Operation[] {
    return [...this.operations.values()].filter(operation => !isTerminalPhase(operation.phase))
  }

  currentOperations(): Operation[] {
    return this.liveOperations()
  }

  currentOperation(): Operation | null {
    const live = this.liveOperations()
    if (live.length === 0) return null
    const rank = (operation: Operation): number => {
      if (operation.phase === 'installing' || operation.phase === 'validating' || operation.phase === 'activating' || operation.phase === 'cancelling') return 0
      if (operation.phase === 'downloading' || operation.phase === 'resolving') return 1
      return 2
    }
    return [...live].sort((left, right) => rank(left) - rank(right) || Date.parse(left.startedAt) - Date.parse(right.startedAt))[0] ?? null
  }

  begin(kind: OperationKind, skinId: string, approvedBuildKeys?: readonly string[] | string, acknowledgeCompatibility = false, acknowledgedContext?: string, releaseAgeApproval?: ReleaseAgeApproval, artifactContext?: string, configurationRepair?: ConfigurationRepairApproval, selectionConfigurationContext?: string, sourceContext?: string, preservedSkinIds?: readonly string[], preservedSkinApprovals?: Record<string, { compatibilityContext: string; artifactContext?: string }>, selectionContext?: string): Operation {
    if (this.disposed) throw new Error('皮肤市场宿主已停止，不能开始新的操作')
    if (this.waitingReason !== undefined) throw new Error(this.waitingReason)
    if (selectionConfigurationContext !== undefined && (!isSelectionOperation(kind) || !/^[a-f0-9]{64}$/.test(selectionConfigurationContext) || configurationRepair !== undefined)) throw new Error('invalid configuration context')
    if (sourceContext !== undefined && (kind !== 'migrate' || sourceContext.length !== 64 || !/^[a-f0-9]{64}$/.test(sourceContext))) throw new Error('invalid source context')
    if (preservedSkinIds !== undefined && (kind !== 'activate' || preservedSkinIds.length > 512
      || preservedSkinIds.some(id => typeof id !== 'string' || id.length === 0 || id.length > 128))) throw new Error('invalid preserved skin ids')
    if (preservedSkinApprovals !== undefined && (kind !== 'activate' || Object.keys(preservedSkinApprovals).length > 512
      || Object.entries(preservedSkinApprovals).some(([id, approval]) => id.length === 0 || id.length > 128 || approval === undefined || typeof approval.compatibilityContext !== 'string' || approval.compatibilityContext.length === 0 || approval.compatibilityContext.length > 4096 || approval.artifactContext !== undefined && (approval.artifactContext.length === 0 || approval.artifactContext.length > 4096)))) throw new Error('invalid preserved skin approvals')
    if ((preservedSkinIds === undefined) !== (preservedSkinApprovals === undefined)) throw new Error('preserved skin approvals required')
    if (preservedSkinIds !== undefined && selectionContext === undefined) throw new Error('selection context required')
    if (selectionContext !== undefined && (kind !== 'activate' || !/^[a-f0-9]{64}$/.test(selectionContext))) throw new Error('invalid selection context')
    const action = kind === 'install' ? 'install' : kind === 'update' || kind === 'migrate' ? 'update' : kind === 'activate' || kind === 'pin' ? 'enable' : kind === 'uninstall' ? 'remove' : 'disable'
    const capability = this.management?.capabilities()[action]
    if (capability?.available === false) throw new Error(capability.reason ?? '当前宿主不支持此操作，请使用官方插件页')
    const skin = this.skin(skinId)
    if (kind === 'activate' || kind === 'pin') {
      if (acknowledgeCompatibility === true && acknowledgedContext !== compatibilityContext(skin, this.runtime)) throw new Error('皮肤版本、兼容范围或 DSH 版本已变化，请重新确认兼容性提示')
      const assessment = assessCompatibility(skin, this.runtime)
      if (this.management !== undefined && assessment.decision === 'incompatible' && acknowledgeCompatibility !== true) throw new Error(`${assessment.reason}；请在兼容性提示中确认后继续`)
    }
    if (artifactContext !== undefined && kind !== 'activate' && kind !== 'pin') throw new Error('安装构件确认仅适用于使用或常驻操作')
    if (kind === 'install' || kind === 'update' || kind === 'migrate') {
      if (this.hostKind === 'desktop') {
        const plan = desktopInstallPlan(skin, this.management !== undefined)
        if (plan.kind === 'manual') throw new Error(`Desktop 当前不支持该皮肤的一键安装（${plan.reason}），请使用官方添加插件面板`)
      }
      if (this.hostKind !== 'desktop' && skin.review?.installation === 'manual-only') {
        throw new Error('该皮肤尚未满足市场自动安装所需信息，请查看仓库安装说明')
      }
    }
    if (kind === 'migrate') this.assertNpmMigration(skin, sourceContext)
    if (this.liveOperations().some(operation => operation.skinId === skinId)) {
      throw new Error('another operation is already running for this skin')
    }
    const operation: Operation = {
      id: randomUUID(), kind, skinId, phase: 'queued', startedAt: new Date().toISOString(),
      ...(preservedSkinIds === undefined ? {} : { preservedSkinIds: [...new Set(preservedSkinIds)] }),
      ...(preservedSkinApprovals === undefined ? {} : { preservedSkinApprovals: Object.fromEntries(Object.entries(preservedSkinApprovals).map(([id, approval]) => [id, { ...approval }])) }),
      ...(selectionContext === undefined ? {} : { selectionContext }),
      cancelable: (kind === 'install' || kind === 'update' || kind === 'migrate') && this.management?.capabilities().cancel.available !== false,
    }
    this.operations.set(operation.id, operation)
    if (sourceContext !== undefined) this.sourceMigrationContexts.set(operation.id, { context: sourceContext, reviewed: this.replacementReview(skin) })
    if (selectionConfigurationContext !== undefined) this.pendingSelectionConfigurations.set(operation.id, selectionConfigurationContext)
    if (configurationRepair !== undefined) this.pendingConfigurationRepairs.set(operation.id, configurationRepair)
    if (releaseAgeApproval !== undefined) this.pendingReleaseAgeApprovals.set(operation.id, releaseAgeApproval)
    if ((kind === 'activate' || kind === 'pin') && acknowledgeCompatibility === true && acknowledgedContext !== undefined) this.compatibilityContexts.set(operation.id, acknowledgedContext)
    if (artifactContext !== undefined) this.artifactContexts.set(operation.id, artifactContext)
    this.abortControllers.set(operation.id, new AbortController())
    if (kind === 'install' || kind === 'update' || kind === 'migrate') {
      const timeoutMs = this.options.operationTimeoutMs ?? OPERATION_TIMEOUT_MS
      this.deadlines.set(operation.id, Date.now() + timeoutMs)
      const timer = setTimeout(() => {
        this.expired.add(operation.id)
        operation.cancelable = false
        writeOperationMessage(operation, '已达到安装总时限，正在结束当前步骤', 'common.operationTimeoutEnding')
        this.abortControllers.get(operation.id)?.abort()
      }, timeoutMs)
      timer.unref?.()
      this.deadlineTimers.set(operation.id, timer)
    }
    const buildKeys = typeof approvedBuildKeys === 'string' ? [approvedBuildKeys] : approvedBuildKeys
    if (buildKeys !== undefined && buildKeys.length > 0) this.pendingBuildKeys.set(operation.id, [...new Set(buildKeys)])
    logEvent('info', 'operation', `${kind} ${skin.package}`, operation.id)
    const execution = this.execute(operation)
    this.executions.set(operation.id, execution)
    void execution.finally(() => {
      if (this.executions.get(operation.id) === execution) this.executions.delete(operation.id)
      this.componentUndo.delete(operation.id)
      this.bundleUndo.delete(operation.id)
      this.legacyBundleUndo.delete(operation.id)
    }).catch(() => undefined)
    return operation
  }

  retry(id: string, action: OperationRetryAction, acknowledgeCompatibility = false, acknowledgedContext?: string, acknowledgedArtifactContext?: string, configurationContext?: string): Operation {
    const failed = this.operations.get(id)
    if (failed === undefined || failed.phase !== 'failed') throw new Error('operation is not retryable')
    if (failed.failure?.action !== action) throw new Error('该操作不支持此恢复动作')
    let releaseAgeApproval: ReleaseAgeApproval | undefined
    let configurationRepair: ConfigurationRepairApproval | undefined
    if (action === 'repair-configuration') {
      const plan = failed.failure.configurationOverride
      const binding = this.failedConfigurationBindings.get(id)
      if (plan?.status !== 'repairable' || typeof configurationContext !== 'string' || configurationContext !== plan.context
        || this.configurationTarget(failed) === undefined || binding !== this.configurationBinding(failed)) throw new Error('配置修复目标已变化，请重新检查后确认')
      configurationRepair = { failedId: id, context: configurationContext, binding }
    }
    let artifactContext = acknowledgedArtifactContext
    if (action === 'approve-release-age') {
      const approved = this.failedReleaseAgeApprovals.get(id)
      const target = failed.failure.releaseAgeTarget
      if (approved === undefined || target === undefined
        || target.packageName !== approved.target.packageName || target.version !== approved.target.version
        || approved.context !== this.releaseAgeContext(failed)) throw new Error('需要放行的版本或安装目标已变化，请重新操作后确认')
      releaseAgeApproval = { target: { ...approved.target }, context: approved.context, failedId: id }
    }
    if (action === 'approve-artifact') {
      const approved = this.failedArtifactContexts.get(id)
      if (approved === undefined || approved.context !== failed.failure.artifactRisk?.context
        || approved.kind !== failed.kind || approved.skinId !== failed.skinId
        || acknowledgedArtifactContext !== undefined && acknowledgedArtifactContext !== approved.context) throw new Error('需要确认的安装构件已变化，请重新操作后确认')
      artifactContext = approved.context
    }
    const approvedBuildKeys = action === 'approve-build' ? this.pendingBuildKeys.get(id) : undefined
    if (action === 'approve-build' && (approvedBuildKeys === undefined || approvedBuildKeys.length === 0)) throw new Error('未找到需要批准的精确构建项')
    return this.begin(failed.kind, failed.skinId, approvedBuildKeys, acknowledgeCompatibility, acknowledgedContext, releaseAgeApproval, artifactContext, configurationRepair, undefined, this.sourceMigrationContexts.get(id)?.context, failed.preservedSkinIds, failed.preservedSkinApprovals, failed.selectionContext)
  }

  private update(operation: Operation, phase: Operation['phase'], message?: string, messageKey?: OperationMessageKey, messageParams?: OperationMessageParams): void {
    operation.phase = phase
    writeOperationMessage(operation, message, messageKey, messageParams)
    operation.cancelable = (operation.kind === 'install' || operation.kind === 'update' || operation.kind === 'migrate')
      && (phase === 'queued' || phase === 'resolving' || phase === 'downloading')
      && this.management?.capabilities().cancel.available !== false
    if (phase === 'done' || phase === 'failed' || phase === 'cancelled') operation.finishedAt = new Date().toISOString()
  }

  cancel(id: string): Operation {
    const operation = this.operations.get(id)
    if (operation === undefined) throw new Error('operation not found')
    if (operation.phase === 'done' || operation.phase === 'failed' || operation.phase === 'cancelled') return operation
    if (operation.cancelable !== true) throw new Error('当前阶段无法安全取消，请等待操作完成')
    this.update(operation, 'cancelling', '正在取消并清理临时文件', 'common.operationCancelCleanup')
    this.abortControllers.get(id)?.abort()
    return operation
  }

  private async withProfileLock<T>(operation: Operation, fn: () => Promise<T>): Promise<T> {
    if (this.profileLockOwner === operation.id) return await fn()
    this.checkDeadline(operation)
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    const previous = this.profileChain
    this.profileChain = previous.then(() => held, () => held)
    try {
      await previous
      if (this.disposed) throw new Error('皮肤市场宿主已停止')
      if (this.waitingReason !== undefined) throw new Error(this.waitingReason)
      this.checkDeadline(operation)
      if (operation.phase === 'queued' || operation.phase === 'resolving' || operation.phase === 'downloading') {
        writeOperationMessage(operation,
          operation.phase === 'queued' ? '正在等待其他皮肤操作完成' : '下载完成，正在等待写入',
          operation.phase === 'queued' ? 'common.operationWaitingOther' : 'common.operationWaitingWrite')
      }
      this.profileLockOwner = operation.id
      this.profileOperation = operation
      this.applyReleaseAgeApproval(operation)
      const approval = this.pendingConfigurationRepairs.get(operation.id)
      this.pendingConfigurationRepairs.delete(operation.id)
      let repair: ReturnType<typeof applyConfigurationOverride> | ReturnType<typeof applyConfigurationOverrides> | undefined
      const selectionContext = this.pendingSelectionConfigurations.get(operation.id)
      this.pendingSelectionConfigurations.delete(operation.id)
      if (selectionContext !== undefined) {
        if (!isSelectionOperation(operation.kind)) throw new Error('invalid selection operation')
        const prepared = await this.selectionPlanLocked(operation.kind, operation.skinId, operation.preservedSkinIds)
        if (this.disposed) throw new Error('皮肤市场宿主已停止，配置未修改')
        if (this.waitingReason !== undefined) throw new Error(this.waitingReason)
        this.checkDeadline(operation)
        if (prepared.plan.status !== 'repairable' || prepared.plan.context !== selectionContext || prepared.editorContext === undefined) throw new Error('启停目标或配置已变化，请重新检查后确认')
        for (const change of prepared.plan.changes) {
          const skin = this.skin(change.skinId)
          if (change.desiredEnabled) {
            if (skin.id === operation.skinId) {
              this.assertCompatibilityContext(operation, skin)
              this.assertArtifactUseApproved(operation, skin)
            } else {
              this.assertPreservedSkinApproved(operation, skin)
            }
          }
        }
        repair = applyConfigurationOverrides(this.options.configurationOverride ?? {}, prepared.targets, prepared.editorContext)
        logEvent('info', 'configuration-override-repair', `已移除 ${prepared.plan.changes.length} 项共享启停覆盖；备份 ${repair.receipt.backupPath}`, operation.id)
      }
      if (approval !== undefined) {
        const failed = this.operations.get(approval.failedId)
        if (failed?.phase !== 'failed' || failed.failure?.action !== 'repair-configuration'
          || failed.skinId !== operation.skinId || failed.kind !== operation.kind
          || approval.binding !== this.configurationBinding(failed)) throw new Error('配置修复目标已变化，请重新检查后确认')
        const target = this.configurationTarget(failed)!
        const skin = this.skin(target.skinId)
        const artifact = snapshotInstalledArtifact(this.options.profileDir, skin.package)
        if (!artifact.ok) throw new Error('目标安装文件已变化，请先核对安装结果后重新操作')
        this.assertSkinLoaderConflicts(skin)
        // Removing a HOME disable can itself wake HMR before the normal retry.
        // Validate the actual bytes and use consent before editing that layer.
        if (target.enabled) {
          if (skin.id !== operation.skinId) throw new Error('目标启用状态已变化，请重新操作后核对')
          this.assertCompatibilityContext(operation, skin)
          this.assertArtifactUseApproved(operation, skin)
        }
        const manifest = packageManifest(this.options.profileDir, skin.package)
        if (this.management === undefined || manifest?.name !== skin.package) throw new Error('无法确认可修改的唯一皮肤组件，请先在官方插件页核对')
        // A deselected bundle can have a unique declared row without a live entry yet.
        // The ordinary retry will load it and verify its effective enabled state.
        await this.officialComponent(skin, (manifest.dsh as { bundle?: unknown } | undefined)?.bundle !== undefined)
        if (this.disposed) throw new Error('皮肤市场宿主已停止，配置未修改')
        if (this.waitingReason !== undefined) throw new Error(this.waitingReason)
        this.checkDeadline(operation)
        if (approval.binding !== this.configurationBinding(failed)) throw new Error('目标安装文件已变化，请重新检查后确认')
        repair = applyConfigurationOverride(this.options.configurationOverride ?? {}, target, approval.context)
        // Consume the displayed approval before any Host call; replay requires a new diagnosis.
        delete failed.failure.action
        this.failedConfigurationBindings.delete(failed.id)
        logEvent('info', 'configuration-override-repair', `已移除 ${target.rowId} 的共享启停覆盖；备份 ${repair.receipt.backupPath}`, operation.id)
      }
      try {
        return await fn()
      } catch (error) {
        if (repair !== undefined) {
          if (this.disposed || this.waitingReason !== undefined) {
            logEvent('warn', 'configuration-override-unconfirmed', '覆盖项已修改，但宿主结果未知；保留备份，停止继续修改', operation.id)
          } else {
            try {
              rollbackConfigurationOverride(repair.receipt)
              logEvent('info', 'configuration-override-rollback', '本次操作失败，已还原共享覆盖', operation.id)
            } catch {
              this.recoveryErrors.set(operation.id, '共享配置恢复未完成；配置可能已被其他程序修改，请核对备份后再操作')
            }
          }
        }
        try {
          await this.restoreLegacyBundles(operation)
        } catch (restoreError) {
          this.recoveryErrors.set(operation.id, '旧版皮肤启停选择恢复未完成，请先在官方插件页核对实际状态')
          logEvent('error', 'legacy-skin-rollback', errorMessage(restoreError), operation.id)
        }
        throw error
      }
    } finally {
      if (this.profileLockOwner === operation.id) {
        this.profileLockOwner = null
        this.profileOperation = undefined
        if (!this.operations.has(operation.id)) this.legacyBundleUndo.delete(operation.id)
      }
      release()
    }
  }

  private async withDownloadSlot<T>(operation: Operation, fn: () => Promise<T>): Promise<T> {
    this.checkDeadline(operation)
    if (this.downloadAvailable === 0) {
      this.update(operation, 'queued', '正在等待下载名额', 'common.operationWaitingDownloadSlot')
      await new Promise<void>((resolve, reject) => {
        const controller = this.abortControllers.get(operation.id)
        const waiter = (): void => {
          controller?.signal.removeEventListener('abort', onAbort)
          resolve()
        }
        const onAbort = (): void => {
          const index = this.downloadWaiters.indexOf(waiter)
          if (index >= 0) this.downloadWaiters.splice(index, 1)
          reject(new Error('操作已取消'))
        }
        this.downloadWaiters.push(waiter)
        controller?.signal.addEventListener('abort', onAbort, { once: true })
        if (controller?.signal.aborted === true) onAbort()
      })
    } else {
      this.downloadAvailable -= 1
    }
    try {
      this.checkDeadline(operation)
      return await fn()
    } finally {
      const next = this.downloadWaiters.shift()
      if (next !== undefined) next()
      else this.downloadAvailable += 1
    }
  }

  private async execute(operation: Operation): Promise<void> {
    try {
      if (operation.kind === 'install') await this.install(operation)
      else if (operation.kind === 'activate') await this.activate(operation)
      else if (operation.kind === 'deactivate') await this.deactivate(operation)
      else if (operation.kind === 'pin') await this.pin(operation)
      else if (operation.kind === 'unpin') await this.unpin(operation)
      else if (operation.kind === 'update' || operation.kind === 'migrate') await this.updateSkin(operation)
      else await this.uninstall(operation)
      this.update(operation, 'done', operation.message, operation.messageKey, operation.messageParams)
    } catch (error) {
      if (this.disposed) {
        if (this.abortControllers.get(operation.id)?.signal.aborted && operation.application === undefined && this.management === undefined) this.update(operation, 'cancelled', '宿主已停止，操作已结束', 'common.operationHostStopped')
        return
      }
      if (this.unresolvedManager) {
        this.update(operation, 'waiting', this.waitingReason)
        return
      }
      if (error instanceof ManagedOperationError) {
        const managed = error.result.management
        if (managed?.indeterminate !== true && managed?.application !== undefined) operation.application = managed.application
        operation.failure = officialOperationFailure(error.result, this.management?.capabilities().buildApprovals.available)
        if (operation.failure !== undefined && error.targetSkinId !== undefined) operation.failure.targetSkinId = error.targetSkinId
        if (error.manualSpec !== undefined) {
          operation.failure = {
            ...(operation.failure ?? { kind: 'command', message: error.message }),
            message: error.message,
            manualSpec: error.manualSpec,
            ...(error.manualFollowUp === undefined ? {} : { manualFollowUp: error.manualFollowUp }),
            code: operation.failure?.code ?? 'already-installed',
          }
        }
        this.describeConfigurationOverride(operation)
        if (operation.failure?.buildKeys?.length) this.pendingBuildKeys.set(operation.id, operation.failure.buildKeys)
      }
      if (this.expired.has(operation.id)) {
        const message = `安装已达到总时限，已停止继续重试${this.recoveryErrors.has(operation.id) ? `；${this.recoveryErrors.get(operation.id)}` : ''}`
        operation.failure = { kind: 'command', message, messageKey: 'failure.timeoutProblem', ...(this.recoveryErrors.has(operation.id) ? {} : { action: 'retry' as const }) }
        logEvent('error', 'operation-timeout', message, operation.id)
        this.update(operation, 'failed', message, 'failure.timeoutProblem')
      } else if ((operation.application === 'cancelled' || operation.application === undefined && this.abortControllers.get(operation.id)?.signal.aborted === true) && !this.recoveryErrors.has(operation.id)) this.update(operation, 'cancelled', '操作已取消', 'common.cancelled')
      else {
        if (error instanceof PnpmCommandError) {
          const failure = error.failure
          const buildKeys = failure.buildKeys ?? (failure.buildKey === undefined ? [] : [failure.buildKey])
          const action = failure.kind === 'network' || failure.kind === 'fetch-timeout'
            ? 'retry'
            : failure.kind === 'build-approval' && buildKeys.length > 0 && this.hostKind !== 'desktop'
              ? 'approve-build'
              : undefined
          const operationFailure: OperationFailure = {
            kind: failure.kind,
            message: failure.message,
            ...(failure.messageKey === undefined ? {} : { messageKey: failure.messageKey }),
            ...(failure.messageParams === undefined ? {} : { messageParams: failure.messageParams }),
            ...(failure.packageName === undefined ? {} : { packageName: failure.packageName }),
            ...(failure.unreachableSource === undefined ? {} : { unreachableSource: failure.unreachableSource }),
            ...(buildKeys.length === 0 ? {} : { buildKeys }),
            ...(action === undefined ? {} : { action }),
          }
          operation.failure = operationFailure
          if (buildKeys.length > 0) this.pendingBuildKeys.set(operation.id, buildKeys)
        }
        if (error instanceof InstallConflictError) {
          operation.failure = { kind: 'conflict', message: error.message, messageKey: 'failure.conflict', conflicts: error.conflicts }
        }
        if (error instanceof ArtifactRiskError && (operation.kind === 'activate' || operation.kind === 'pin')
          && this.abortControllers.get(operation.id)?.signal.aborted !== true) {
          const risk = inspectSkinArtifactRisk(this.options.profileDir, this.skin(operation.skinId), this.hostKind)
          if (risk?.context === error.risk.context && !isSkinArtifactRiskAcknowledged(this.options.profileDir, this.skin(operation.skinId), this.hostKind)) {
            operation.failure = { kind: 'integrity', message: error.message, messageKey: 'failure.integrityProblem', packageName: risk.packageName, artifactRisk: risk, action: 'approve-artifact' }
            this.failedArtifactContexts.set(operation.id, { context: risk.context, skinId: operation.skinId, kind: operation.kind })
          }
        }
        logEvent(
          'error',
          error instanceof PnpmCommandError ? 'pnpm' : 'operation',
          error instanceof PnpmCommandError
            ? `kind=${error.failure.kind}${error.failure.packageName === undefined ? '' : ` package=${error.failure.packageName}`} ${failureDiagnostic(error.result)}`
            : error instanceof ManagedOperationError ? officialFailureDiagnostic(error.result) : errorMessage(error),
          operation.id,
        )
        const recoveryError = this.recoveryErrors.get(operation.id)
        const ageTarget = operation.failure?.releaseAgeTarget
        const exactAgeTarget = ageTarget === undefined ? undefined : parseReleaseAgeTarget(ageTarget.packageName, ageTarget.version)
        const canCompletePartial = this.partialManagedArtifacts.has(operation.id) && ['install', 'update', 'migrate'].includes(operation.kind)
        const canApproveAge = (recoveryError === undefined || canCompletePartial) && this.management !== undefined && operation.application === 'failed'
          && operation.failure?.kind === 'release-age' && exactAgeTarget !== undefined
          && error instanceof ManagedOperationError && !error.result.aborted && !error.result.timedOut
          && this.abortControllers.get(operation.id)?.signal.aborted !== true
          && ['install', 'update', 'migrate', 'uninstall'].includes(operation.kind)
        if (canApproveAge && operation.failure !== undefined && exactAgeTarget !== undefined) {
          operation.failure.action = 'approve-release-age'
          this.failedReleaseAgeApprovals.set(operation.id, { target: { ...exactAgeTarget }, context: this.releaseAgeContext(operation) })
        }
        if (recoveryError !== undefined && operation.failure !== undefined) {
          logEvent('warn', 'operation-recovery', recoveryError, operation.id)
          if (!canApproveAge) {
            delete operation.failure.action
            operation.failure.message += `；${recoveryError}`
          }
        }
        const operationFields = operation.failure === undefined ? messageFields(error) : { messageKey: operation.failure.messageKey, messageParams: operation.failure.messageParams }
        this.update(operation, 'failed', `${errorMessage(error)}${recoveryError === undefined ? '' : `；${recoveryError}`}`, operationFields.messageKey, operationFields.messageParams)
      }
    } finally {
      clearTimeout(this.deadlineTimers.get(operation.id))
      this.deadlineTimers.delete(operation.id)
      this.deadlines.delete(operation.id)
      this.expired.delete(operation.id)
      this.profileMutations.delete(operation.id)
      this.recoveryErrors.delete(operation.id)
      this.partialManagedArtifacts.delete(operation.id)
      this.desktopManagedAttempts.delete(operation.id)
      this.desktopRecoveryBaselines.delete(operation.id)
      this.pendingReleaseAgeApprovals.delete(operation.id)
      this.pendingConfigurationRepairs.delete(operation.id)
      this.pendingSelectionConfigurations.delete(operation.id)
      this.abortControllers.delete(operation.id)
      this.compatibilityContexts.delete(operation.id)
      this.artifactContexts.delete(operation.id)
      if (this.disposed || operation.phase === 'waiting') return
      const timer = setTimeout(() => {
        this.operationCleanupTimers.delete(operation.id)
        this.operations.delete(operation.id)
        this.sourceMigrationContexts.delete(operation.id)
        this.pendingBuildKeys.delete(operation.id)
        this.failedReleaseAgeApprovals.delete(operation.id)
        this.failedArtifactContexts.delete(operation.id)
        this.failedConfigurationBindings.delete(operation.id)
      }, 30 * 60 * 1000)
      timer.unref?.()
      this.operationCleanupTimers.set(operation.id, timer)
    }
  }

  private async run(args: readonly string[], operation?: Operation): Promise<void> {
    if (this.management !== undefined) {
      this.checkDeadline(operation)
      const result = await this.managedPackageCall(async () => {
        const pending = this.options.runner(this.options.profile, args, {
          signal: operation === undefined ? undefined : this.abortControllers.get(operation.id)?.signal,
          timeoutMs: this.remainingTime(operation),
        })
        return await (args[0] === 'remove' ? this.awaitLifecycle(pending, operation) : pending)
      }, operation, args[0] === 'remove' ? args[1] : undefined, args[0] === 'add')
      this.acceptManagement(result, operation)
      return
    }
    this.checkDeadline(operation)
    const controller = operation === undefined ? undefined : this.abortControllers.get(operation.id)
    if (controller?.signal.aborted === true) throw new Error('操作已取消')
    const ensurePnpm = this.options.runner.ensurePnpm
    if (ensurePnpm !== undefined) await ensurePnpm({ signal: controller?.signal, timeoutMs: this.remainingTime(operation) })
    const effectiveArgs = pluginArgsFor(this.options.profileDir, args)
    const registryPlan = this.options.runner.registryPlan === undefined
      ? undefined : await this.registryPlanFor(operation)
    let attempt = 0
    try {
      await runPnpmWithRecovery(effectiveArgs, {
        profileDir: this.options.profileDir,
        registryPlan,
        attempt: async (attemptArgs, attemptOptions) => {
          this.checkDeadline(operation)
          const tracker = operation === undefined ? undefined : new PnpmProgressTracker()
          const commandArgs = tracker === undefined || attemptArgs.some(arg => arg.startsWith('--reporter')) ? attemptArgs : [...attemptArgs, '--reporter=ndjson']
          this.startCommand(operation, attemptArgs, ++attempt)
          const result = await this.options.runner(this.options.profile, commandArgs, {
            signal: controller?.signal,
            timeoutMs: Math.min(10 * 60 * 1000, this.remainingTime(operation) ?? 10 * 60 * 1000),
            env: { pnpm_config_fetch_timeout: String(10 * 60 * 1000), ...attemptOptions?.env },
            onStdout: chunk => tracker?.push(chunk, operation!),
            onStderr: chunk => tracker?.push(chunk, operation!),
          })
          if (operation !== undefined) logEvent('info', 'command-finished', `attempt=${attempt} ${failureDiagnostic(result)}`, operation.id)
          return result
        },
        onRetry: failure => {
          if (operation !== undefined) {
            const next = recoveryMessage(failure)
            this.update(operation, operation.phase, next.message, next.key, next.params)
          }
        },
      })
    } catch (error) {
      if (controller === undefined || controller.signal.aborted === false) {
        await cleanOrphanedStore(this.options.runner, this.options.profile, operation?.id, { signal: controller?.signal, timeoutMs: Math.min(5000, this.remainingTime(operation) ?? 5000) })
      }
      throw error
    }
  }

  private remainingTime(operation?: Operation): number | undefined {
    const deadline = operation === undefined ? undefined : this.deadlines.get(operation.id)
    return deadline === undefined ? undefined : Math.max(0, deadline - Date.now())
  }

  private checkDeadline(operation?: Operation): void {
    if (operation !== undefined && this.remainingTime(operation) === 0) {
      this.expired.add(operation.id)
      this.abortControllers.get(operation.id)?.abort()
      throw new Error('安装已达到总时限')
    }
    if (operation !== undefined && this.abortControllers.get(operation.id)?.signal.aborted === true) throw new Error('操作已取消')
  }

  private startCommand(operation: Operation | undefined, args: readonly string[], attempt: number, tracksMutation = true): void {
    if (operation === undefined) return
    const directoryIndex = args.indexOf('--dir')
    const temporary = directoryIndex >= 0 && args[directoryIndex + 1] !== this.options.profileDir
    const verb = args.find(arg => arg === 'add' || arg === 'install' || arg === 'remove')
    if (tracksMutation && !temporary && verb !== undefined) this.profileMutations.set(operation.id, (this.profileMutations.get(operation.id) ?? 0) + 1)
    const step = temporary ? '下载并检查安装包' : verb === 'remove' ? '移除插件依赖' : verb === 'install' ? '同步 profile 依赖' : '安装到 profile'
    const stepKey: OperationMessageKey = temporary ? 'common.stepDownloadInspect' : verb === 'remove' ? 'common.stepRemoveDependency' : verb === 'install' ? 'common.stepSyncProfile' : 'common.stepInstallProfile'
    writeOperationStep(operation, step, stepKey)
    operation.attempt = attempt
    operation.stepStartedAt = new Date().toISOString()
    delete operation.lastOutputAt
    delete operation.pnpmStage
    delete operation.downloadedBytes
    delete operation.totalBytes
    delete operation.bytesPerSecond
    logEvent('info', 'command-started', `${operation.step} attempt=${attempt}`, operation.id)
  }

  /** Restore metadata first, then reconcile dependencies once within a separate budget. */
  private async recoverProfile(skin: SkinEntry, operation: Operation, snapshot: ProfileInstallSnapshot, mutationsBefore: number): Promise<void> {
    if (this.disposed || this.waitingReason !== undefined) return
    if (this.management !== undefined) {
      restoreFile(marketStateFile(this.options.profileDir), snapshot.marketState)
      if (!managedArtifactUnchanged(this.options.profileDir, snapshot.artifact)) {
        this.recoveryErrors.set(operation.id, '官方管理操作后构件与原有版本不一致，请在官方插件页核对实际状态')
        this.partialManagedArtifacts.add(operation.id)
      }
      return
    }
    clearTimeout(this.deadlineTimers.get(operation.id))
    if (this.desktopManagedAttempts.has(operation.id)) {
      // The host owns failed managed installs, including refusal before start.
      // Only undo market work performed after a successful host transaction.
      const baseline = this.desktopRecoveryBaselines.get(operation.id)
      if (baseline === undefined) return
      snapshot = baseline.snapshot
      mutationsBefore = baseline.mutationsBefore
    }
    const restore = (): boolean => {
      try {
        restoreProfileInstallFiles(this.options.profileDir, skin.package, skin.install.version, snapshot)
        return true
      } catch (error) {
        this.recoveryErrors.set(operation.id, '原有配置恢复未完成；请复制日志并修复 profile 后再操作')
        logEvent('error', 'recovery-configuration', errorMessage(error), operation.id)
        return false
      }
    }
    if (!restore()) return
    if ((this.profileMutations.get(operation.id) ?? 0) <= mutationsBefore) return
    // pnpm cannot reconcile a lockfile that was already inconsistent before this
    // operation; the market sets CI=true for every child process, which makes a
    // plain `pnpm install` a frozen install and fails with a misleading
    // OUTDATED_LOCKFILE before any dependency is restored. Report the drift as a
    // pre-existing profile problem instead of blaming this operation.
    const drift = inspectLockfileDrift(this.options.profileDir)
    if (drift.length > 0) {
      const detail = drift.slice(0, 3).map(entry => `${entry.packageName}: package.json=${entry.manifestSpec ?? '(absent)'} lockfile=${entry.lockfileSpec ?? '(absent)'}`).join('; ')
      const message = `安装前 profile 的 package.json 与 pnpm-lock.yaml 已不一致（${detail}${drift.length > 3 ? `；另有 ${drift.length - 3} 处` : ''}）；本次操作未完成，未重新安装依赖。请先在外部终端修复 profile 后再试。`
      this.recoveryErrors.set(operation.id, message)
      logEvent('warn', 'recovery-pre-existing-drift', detail, operation.id)
      return
    }
    this.update(operation, 'installing', '安装未完成，正在恢复原有依赖')
    writeOperationStep(operation, '恢复原有 profile 依赖', 'common.stepRestoreProfile')
    operation.attempt = 1
    operation.stepStartedAt = new Date().toISOString()
    delete operation.lastOutputAt
    delete operation.pnpmStage
    delete operation.bytesPerSecond
    delete operation.totalBytes
    delete operation.downloadedBytes
    const timeoutMs = this.options.recoveryTimeoutMs ?? RECOVERY_TIMEOUT_MS
    const tracker = new PnpmProgressTracker()
    logEvent('info', 'recovery-started', 'restoring previous dependencies (one attempt)', operation.id)
    try {
      const options: CommandOptions = {
        timeoutMs,
        signal: AbortSignal.timeout(timeoutMs),
        onStdout: chunk => tracker.push(chunk, operation),
        onStderr: chunk => tracker.push(chunk, operation),
      }
      const result = await this.options.runner(this.options.profile, ['install', '--prefer-offline', '--reporter=ndjson'], options)
      if (snapshot.artifact.spec !== null && !compareInstalledArtifact(this.options.profileDir, snapshot.artifact).ok) throw new Error('恢复后原有包的版本或声明入口未还原')
      logEvent('info', 'recovery-finished', failureDiagnostic(result), operation.id)
      if (result.exitCode !== 0 || result.timedOut || result.aborted) throw new Error('recovery did not complete')
    } catch (error) {
      this.recoveryErrors.set(operation.id, '原有配置已恢复，但依赖恢复未完成；请复制日志后修复 profile 依赖')
      logEvent('error', 'recovery-dependencies', errorMessage(error), operation.id)
    } finally {
      // pnpm may rewrite the lockfile even during a failed recovery.
      restore()
    }
  }

  private async prepareProfile(skin: SkinEntry, operation: Operation, prepare: () => Promise<void>, expectedSpec?: string): Promise<void> {
    const snapshot = snapshotInstallFiles(this.options.profileDir, skin.package, skin.install.version)
    const mutationsBefore = this.profileMutations.get(operation.id) ?? 0
    try {
      await prepare()
    } catch (error) {
      if (expectedSpec !== undefined && readDependencies(this.options.profileDir)[skin.package] !== expectedSpec) throw new Error('更新来源在安装准备期间发生变化，请刷新后重试')
      await this.recoverProfile(skin, operation, snapshot, mutationsBefore)
      throw error
    }
  }

  private assertNpmMigration(skin: SkinEntry, sourceContext?: string): NonNullable<ReturnType<typeof npmSourceMigration>> {
    if (this.hostKind === 'desktop') throw new Error('Desktop 暂不支持换用 npm')
    const migration = npmSourceMigration(this.options.profileDir, this.skin(skin.id))
    if (sourceContext !== undefined && (migration?.kind !== 'local' || migration.context !== sourceContext)) {
      throw new Error('本地安装来源或市场版本已变化，请重新确认替换')
    }
    if (migration === undefined) throw new Error('当前安装与已核验的 npm 来源不对应，无法换用 npm；请刷新目录并先更新 GitHub 版本')
    if (migration.kind === 'local' && sourceContext === undefined) throw new Error('本地安装需先确认替换为市场版本')
    return migration
  }

  private replacementReview(skin: SkinEntry): string {
    return JSON.stringify([skin.id, skin.package, skin.repo, skin.rowId, skin.subpath, skin.install, skin.review, skin.compatibility])
  }

  private replacementTarget(skin: SkinEntry, operation: Operation): string | undefined {
    const consent = this.sourceMigrationContexts.get(operation.id)
    if (consent === undefined) return undefined
    const current = this.skin(skin.id)
    if (consent.reviewed !== this.replacementReview(current) || consent.reviewed !== this.replacementReview(skin)
      || reviewedNpmSourceError(current) !== null) throw new Error('本地安装来源或市场版本已变化，请重新确认替换')
    return npmInstallTarget(current)!
  }

  private assertReplacementArtifact(directory: string, skin: SkinEntry, operation: Operation): void {
    if (this.replacementTarget(skin, operation) === undefined) return
    const source = skin.install.npm
    if (reviewedNpmSourceError(skin) !== null || source === undefined) throw new Error('市场 npm 安装目标已变化，请重新确认替换')
    const validation = validateNpmArtifact(directory, source)
    if (!validation.ok) throw new Error(validation.reason ?? '市场 npm 安装包未通过核验')
    const risk = inspectSkinArtifactRisk(directory, skin, 'dsh')
    if (risk !== undefined) throw new Error(risk.warnings[0] ?? '市场 npm 安装包未通过核验')
  }

  /** An ordinary Desktop update must retain the installed source family. */
  private desktopUpdateTarget(skin: SkinEntry): string {
    const current = readDependencies(this.options.profileDir)[skin.package]
    if (current === undefined) throw new Error('请先安装皮肤，再执行更新')
    if (/^github:/i.test(current) || /^(?:git\+)?(?:https?|git):\/\/github\.com\//i.test(current)
      || /^https:\/\/codeload\.github\.com\//i.test(current) || /^(?:ssh:\/\/)?git@github\.com[:/]/i.test(current)) {
      if (!githubArtifactSourceMatches(skin, current)) throw new Error('当前 GitHub 仓库或子目录与市场来源不同，无法自动换源；请按原安装方式更新')
      const plan = desktopGithubInstallPlan(skin)
      if (this.management === undefined || plan.kind !== 'github') throw new Error(`当前 GitHub 来源无法自动更新；${plan.kind === 'manual' ? plan.reason : '此宿主不支持 GitHub 安装'}，请按原安装方式更新`)
      return plan.target
    }
    const plan = desktopInstallPlan(skin, this.management !== undefined)
    const npm = current.startsWith(`npm:${skin.package}@`) ? current.slice(`npm:${skin.package}@`.length)
      : current.startsWith(`${skin.package}@`) ? current.slice(`${skin.package}@`.length) : current
    if (plan.kind === 'npm' && (isVersionRange(npm) && npm !== 'unverified' || /^[A-Za-z][A-Za-z0-9._-]*$/.test(npm))) return plan.target
    throw new Error('当前皮肤使用本地、自定义或无法继续核验的安装来源，无法自动换源；请按原安装方式更新')
  }

  private async installPackage(skin: SkinEntry, operation: Operation, state: PersistedMarketState, target?: string, prefetched?: PrefetchedPackage): Promise<void> {
    if (this.hostKind === 'desktop') {
      this.desktopManagedAttempts.add(operation.id)
      const current = readDependencies(this.options.profileDir)[skin.package]
      // A repair or update of GitHub code cannot silently switch to a newly
      // published npm alternative. Only the official transaction accepts Git.
      const selectedTarget = target ?? (current === undefined ? undefined : this.desktopUpdateTarget(skin))
      const githubTarget = selectedTarget === skin.install.target
      const plan = githubTarget && this.management !== undefined ? desktopGithubInstallPlan(skin) : desktopInstallPlan(skin, this.management !== undefined)
      if (plan.kind === 'manual') throw new Error(`Desktop 当前不支持该皮肤的一键安装（${plan.reason}），请使用官方添加插件面板`)
      if (selectedTarget !== undefined && plan.target !== selectedTarget) throw new Error('Desktop 安装目标与已核验来源不一致')
      // The native transaction materializes packages before we can inspect
      // their full bundle. Reject an already-known main loader collision
      // first; keep the actual artifact's metadata and full-row checks below.
      const knownRows = [{ id: skin.rowId, name: skin.package, packageName: skin.package }]
      assertNoKnownLoaderConflicts(this.options.profileDir, skin, knownRows, this.management === undefined ? {} : { hostKind: 'desktop' })
      const legacyBundles = await this.inspectLegacyBundles(skin)
      this.assertRuntimeLoaderConflicts(skin, knownRows, legacyBundles.map(bundle => bundle.name))
      const installPlugin = this.options.runner.installPlugin
      if (installPlugin === undefined) throw new Error('当前 Desktop 未提供受支持的插件安装服务')
      this.update(operation, 'installing')
      const controller = this.abortControllers.get(operation.id)
      const tracker = new PnpmProgressTracker()
      const request: PluginInstallRequest = {
        packageName: skin.package,
        packageVersion: skin.install.version,
        ...(plan.kind === 'github' ? { spec: plan.target } : {}),
        receiptId: randomUUID(),
        pnpmOptions: ['--prefer-offline', '--reporter=ndjson'],
        approvedBuilds: this.pendingBuildKeys.get(operation.id),
      }
      if (this.management !== undefined) {
        operation.cancelable = this.management.capabilities().cancel.available
        const result = await this.managedInstallWithRegistryRecovery(request, operation, currentRequest => installPlugin(this.options.profile, { ...currentRequest, receiptId: randomUUID() }, {
          signal: controller?.signal,
          timeoutMs: this.remainingTime(operation),
          onStdout: chunk => tracker.push(chunk, operation),
          onStderr: chunk => tracker.push(chunk, operation),
          onManagementState: progress => {
            if (progress.phase === 'applying') {
              this.update(operation, 'validating', '下载已完成，正在由宿主应用插件')
            } else if (progress.phase === 'installing') operation.cancelable = this.management?.capabilities().cancel.available === true
          },
        }))
        const replaced = current !== undefined && result.management?.application === 'failed' && result.management.error?.code === 'already-installed'
          ? await this.replaceInstalledDesktopPackage(skin.package, plan.target, operation, () => this.managedInstallWithRegistryRecovery(request, operation, currentRequest => installPlugin(this.options.profile, { ...currentRequest, receiptId: randomUUID() }, {
            signal: controller?.signal,
            timeoutMs: this.remainingTime(operation),
            onStdout: chunk => tracker.push(chunk, operation),
            onStderr: chunk => tracker.push(chunk, operation),
          })))
          : result
        this.acceptManagement(replaced, operation)
        if (replaced.management?.version !== undefined && replaced.management.version !== skin.install.version) throw new Error('官方宿主安装的版本与已核验目标不一致')
        const artifact = validateDesktopArtifact(this.options.profileDir, skin, { allowArtifactRisk: true })
        if (!artifact.ok) throw new Error(artifact.reason ?? '官方宿主安装构件未通过核验')
        this.assertLegacyOfficialPeers(packageManifest(this.options.profileDir, skin.package))
        if (this.management.installRequiresRestart) operation.restartRequired = true
        return
      }
      const registryPlan = this.options.runner.registryPlan === undefined
        ? undefined : await this.registryPlanFor(operation)
      await runPnpmWithRecovery(request.pnpmOptions ?? [], {
        registryPlan,
        attempt: (pnpmOptions) => {
          this.checkDeadline(operation)
          this.startCommand(operation, ['add'], (operation.attempt ?? 0) + 1, false)
          return installPlugin(this.options.profile, { ...request, pnpmOptions }, {
          signal: controller?.signal,
          timeoutMs: Math.min(10 * 60 * 1000, this.remainingTime(operation) ?? 10 * 60 * 1000),
          onStdout: chunk => tracker.push(chunk, operation),
          onStderr: chunk => tracker.push(chunk, operation),
          })
        },
        onRetry: failure => {
          const next = recoveryMessage(failure)
          this.update(operation, operation.phase, next.message, next.key, next.params)
        },
      })
      this.desktopRecoveryBaselines.set(operation.id, {
        snapshot: snapshotInstallFiles(this.options.profileDir, skin.package, skin.install.version),
        mutationsBefore: this.profileMutations.get(operation.id) ?? 0,
      })
      return
    }

    const beforeRows = installedLoaderIdentities(this.options.profileDir)
    const resolved = prefetched ?? await this.prefetch(skin, operation, target)
    // The complete local consent was checked under the profile lock before
    // preparation. Our own lockfile/patch repairs may now have changed that
    // snapshot; only recheck the reviewed target here.
    const migrationTarget = this.sourceMigrationContexts.has(operation.id)
      ? this.replacementTarget(skin, operation)
      : operation.kind === 'migrate' ? this.assertNpmMigration(skin).target : undefined
    if (operation.kind === 'migrate' && migrationTarget !== resolved.target) {
      throw new Error('npm 换源目标在下载期间发生变化，请刷新后重试')
    }
    this.assertSkinLoaderConflicts(skin, resolved.loaderRows)
    this.assertRuntimeLoaderConflicts(skin, resolved.loaderRows)
    this.update(operation, 'installing')
    const buildApprovalKey = isNpmInstallTarget(skin, resolved.target) ? undefined : buildApprovalKeyForTarget(skin, resolved.target) ?? effectiveBuildApprovalKey(skin)
    if (buildApprovalKey !== undefined) ensureBuildAllowed(this.options.profileDir, buildApprovalKey)
    // A source migration replaces only this skin. Companion
    // upgrades remain part of the separate ordinary Update operation.
    if (operation.kind !== 'migrate') await this.installCompanions(skin, operation, state)
    await this.run(['add', resolved.target, '--prefer-offline', ...(isNpmInstallTarget(skin, resolved.target) ? ['--save-exact'] : [])], operation)
    const liveValidation = validateInstalledSkin(this.options.profileDir, skin, { allowArtifactRisk: true, hostKind: this.hostKind })
    if (!liveValidation.ok) throw new Error(liveValidation.reason)
    this.assertReplacementArtifact(this.options.profileDir, skin, operation)
    this.claimManagedLoaders(state, skin, resolved.loaderRows, beforeRows)
    // Browser imports can still refer to the previous package bytes. Only
    // selection changes may be confirmed from an already active fiber.
    if (isWebClientPackage(this.options.profileDir, skin.package)) operation.restartRequired = true
  }

  private async installCompanions(skin: SkinEntry, operation: Operation, state: PersistedMarketState): Promise<void> {
    if (this.management !== undefined) return
    const enabled = this.enabledSkinIds(state)
    for (const companion of skin.install.companions ?? []) {
      const existingSpec = readDependencies(this.options.profileDir)[companion.package]
      const linked = state.managedCompanions?.[companion.package]
      if (existingSpec === undefined || (linked?.installedByMarket === true && companionNeedsInstall(this.options.profileDir, companion))) {
        await this.run(['add', companion.target, '--prefer-offline'], operation)
        // Same identity guard as the main skin: exit 0 + truncated `&path:` can
        // materialize the monorepo root under a different dep key. Refuse before
        // claiming market ownership / registration.
        const companionValidation = validateInstalledSkin(this.options.profileDir, companionAsSkin(skin, companion), { hostKind: this.hostKind })
        if (!companionValidation.ok) throw new Error(companionValidation.reason)
        if (isWebClientPackage(this.options.profileDir, companion.package)) operation.restartRequired = true
        this.claimManagedCompanion(state, companion.package, skin.id, true)
      } else if (linked !== undefined) {
        // An existing ownership receipt grants activation linkage, while its
        // installedByMarket bit continues to govern delete/update rights.
        this.claimManagedCompanion(state, companion.package, skin.id, linked.installedByMarket)
      } else {
        // A package that predates this market install belongs to the user.
        // Do not acquire enable/disable or delete rights over it.
        continue
      }
      await this.registerSkin(
        companionAsSkin(skin, companion),
        !this.companionOwnersEnabled(companion.package, state, enabled),
      )
    }
  }

  private claimManagedCompanion(state: PersistedMarketState, packageName: string, ownerSkinId: string, installedByMarket: boolean): void {
    const current = state.managedCompanions?.[packageName]
    if (current === undefined) {
      state.managedCompanions = {
        ...state.managedCompanions,
        [packageName]: { ownerSkinIds: [ownerSkinId], installedByMarket },
      }
      return
    }
    if (!current.ownerSkinIds.includes(ownerSkinId)) current.ownerSkinIds.push(ownerSkinId)
    if (installedByMarket) current.installedByMarket = true
  }

  private companionOwnersEnabled(packageName: string, state: PersistedMarketState, enabled: Set<string>): boolean {
    return state.managedCompanions?.[packageName]?.ownerSkinIds.some(ownerSkinId => enabled.has(ownerSkinId)) ?? false
  }

  private async syncInstalledCompanions(state: PersistedMarketState, live: boolean): Promise<void> {
    const enabled = this.enabledSkinIds(state)
    const seen = new Set<string>()
    const dependencies = readDependencies(this.options.profileDir)
    for (const item of this.catalog) {
      if (dependencies[item.package] === undefined || !installedSkinSourceMatches(this.options.profileDir, item)) continue
      for (const companion of item.install.companions ?? []) {
        if (seen.has(companion.package) || dependencies[companion.package] === undefined || state.managedCompanions?.[companion.package] === undefined) continue
        seen.add(companion.package)
        const entry = companionAsSkin(item, companion)
        const disabled = !this.companionOwnersEnabled(companion.package, state, enabled)
        await this.registerSkin( entry, disabled)
        if (live) await this.setEntryDisabled(entry, disabled)
      }
    }
  }

  private companionStillNeeded(packageName: string, exceptSkinId: string, state: PersistedMarketState): boolean {
    return state.managedCompanions?.[packageName]?.ownerSkinIds.some(ownerSkinId => ownerSkinId !== exceptSkinId) ?? false
  }

  private async uninstallUnusedCompanions(skin: SkinEntry, operation: Operation, state: PersistedMarketState): Promise<void> {
    for (const companion of skin.install.companions ?? []) {
      const managed = state.managedCompanions?.[companion.package]
      if (managed === undefined) continue
      if (this.companionStillNeeded(companion.package, skin.id, state)) {
        managed.ownerSkinIds = managed.ownerSkinIds.filter(ownerSkinId => ownerSkinId !== skin.id)
        continue
      }
      if (managed.installedByMarket && readDependencies(this.options.profileDir)[companion.package] !== undefined) {
        await this.run(['remove', companion.package], operation)
        if (this.management === undefined) removeSkinRegistration(this.options.profileDir, companionAsSkin(skin, companion))
      } else if (readDependencies(this.options.profileDir)[companion.package] !== undefined) {
        // Activation-linked but user-owned companions survive the last owner
        // and return to their independent enabled state.
        const entry = companionAsSkin(skin, companion)
        await this.registerSkin( entry, false)
        await this.setEntryDisabled(entry, false)
      }
      delete state.managedCompanions?.[companion.package]
    }
    if (state.managedCompanions !== undefined && Object.keys(state.managedCompanions).length === 0) delete state.managedCompanions
  }

  private assertRuntimeLoaderConflicts(skin: SkinEntry, loaderRows: readonly LoaderIdentity[], legacyPackages: readonly string[] = []): void {
    const incoming = loaderRows.length > 0
      ? loaderRows
      : [{ id: skin.rowId, name: skin.package, packageName: skin.package }]
    const conflicts: InstallConflict[] = []
    for (const entry of this.host.loader.entries()) {
      const id = entry.options.id
      const name = entry.options.name
      const existing = { id, name, packageName: name }
      for (const incomingRow of incoming) {
        const identifiers = sharedLoaderIdentifiers(incomingRow, existing)
        if (identifiers.length === 0) continue
        const currentSkinEntry = incomingRow.packageName === skin.package
          && incomingRow.id === skin.rowId
          && id === skin.rowId
          && name === skin.package
        if (incomingRow.packageName === existing.packageName || currentSkinEntry
          || id === skin.rowId && name !== undefined && legacyPackages.includes(name)) continue
        conflicts.push({
          kind: 'loader' as const,
          incoming: incomingRow.packageName ?? incomingRow.name ?? skin.package,
          existing: name ?? id ?? 'unknown loader',
          identifiers,
        })
      }
    }
    const unique = conflicts.filter((conflict, index) => conflicts.findIndex(item => JSON.stringify(item) === JSON.stringify(conflict)) === index)
    if (unique.length > 0) throw new InstallConflictError(unique)
  }

  private async prefetch(skin: SkinEntry, operation: Operation, selectedTarget?: string): Promise<PrefetchedPackage> {
    // Resolve and download into an unwatched temporary project first. pnpm's
    // content-addressed store makes the real profile add reuse these files.
    // This prevents a large GitHub download from modifying the live profile
    // early and causing DSH Web to reload before the operation can finish.
    let target = selectedTarget ?? preferredInstallTarget(skin)
    if (isNpmInstallTarget(skin, target)) {
      const sourceError = reviewedNpmSourceError(skin)
      if (sourceError !== null) throw new Error(sourceError)
    }
    let directory = mkdtempSync(join(tmpdir(), 'dsh-skin-market-download-'))
    try {
      this.preparePrefetchDirectory(directory, this.prefetchBuildApprovals(skin, operation, target))
      await this.run(['add', target, '--dir', directory, '--ignore-scripts', '--config.auto-install-peers=false', ...(isNpmInstallTarget(skin, target) ? ['--save-exact'] : [])], operation)
      const redirected = discoverMonorepoTarget(directory, skin, target)
      if (redirected !== null) {
        target = redirected
        removePrefetchDirectory(directory)
        directory = mkdtempSync(join(tmpdir(), 'dsh-skin-market-download-'))
        this.preparePrefetchDirectory(directory, this.prefetchBuildApprovals(skin, operation, target))
        await this.run(['add', target, '--dir', directory, '--ignore-scripts', '--config.auto-install-peers=false'], operation)
      }
      // Exit 0 alone is not success: a truncated `&path:` target installs the
      // repo root under a different dependency key. Refuse before live profile add.
      const validation = validateInstalledSkin(directory, skin, { allowArtifactRisk: true, hostKind: this.hostKind })
      if (!validation.ok) throw new Error(validation.reason)
      this.assertReplacementArtifact(directory, skin, operation)
      if (isNpmInstallTarget(skin, target)) {
        if (readDependencies(directory)[skin.package] !== skin.install.npm?.version) {
          throw new Error('下载的 npm 依赖未记录目录固定版本，已停止安装')
        }
        if (validation.version !== skin.install.version) throw new Error('下载的 npm 包版本与目录固定版本不一致')
      }
      const packageDirectory = join(directory, 'node_modules', ...skin.package.split('/'))
      const packageRows = packageLoaderOwnershipAt(packageDirectory, skin.package)
      if (packageRows.hasBundle) {
        const primaryRows = packageRows.rows.filter(row => row.name === skin.package)
        if (primaryRows.length === 0) {
          throw new LoaderMetadataError(`${skin.package} 的 bundle patch 没有 name=${skin.package} 的主 loader；目录 rowId=${skin.rowId}`)
        }
        if (primaryRows.length > 1) {
          throw new LoaderMetadataError(`${skin.package} 的 bundle patch 声明了多个主 loader：${primaryRows.map(row => row.id ?? '(缺少 id)').join('、')}`)
        }
        if (primaryRows[0].id !== skin.rowId) {
          throw new LoaderMetadataError(`${skin.package} 的目录 rowId=${skin.rowId}，实际主 loader id=${primaryRows[0].id ?? '(缺少 id)'}`)
        }
      }
      return {
        target,
        packageRows: packageRows.rows,
        hasBundle: packageRows.hasBundle,
        loaderRows: installedLoaderIdentities(directory),
      }
    } finally {
      removePrefetchDirectory(directory)
    }
  }

  private async install(operation: Operation): Promise<void> {
    const skin = this.skin(operation.skinId)
    this.applyPendingBuildApprovals(operation)
    let prefetched: PrefetchedPackage | undefined
    if (this.hostKind !== 'desktop' && readDependencies(this.options.profileDir)[skin.package] === undefined) {
      prefetched = await this.withDownloadSlot(operation, async () => {
        this.update(operation, 'resolving')
        this.update(operation, 'downloading')
        return await this.prefetch(skin, operation)
      })
    }
    await this.withProfileLock(operation, () => this.installIntoProfile(operation, skin, prefetched))
  }

  private async installIntoProfile(operation: Operation, skin: SkinEntry, prefetched?: PrefetchedPackage): Promise<void> {
    this.assertCompatibilityContext(operation, skin)
    if (this.hostKind !== 'desktop') {
      await this.prepareProfile(skin, operation, () => this.syncPnpmMetadata(operation, '正在修复 profile 的 pnpm 锁文件'))
    }
    const existingSpec = readDependencies(this.options.profileDir)[skin.package]
    if (existingSpec !== undefined) {
      const sourceMatches = installedSkinSourceMatches(this.options.profileDir, skin)
      if (!sourceMatches && this.hostKind === 'desktop') {
        // Preserve the established source-family diagnostic, but do this before
        // any repair path can ask the official manager to replace the package.
        this.desktopUpdateTarget(skin)
      }
      if (!sourceMatches) {
        throw new Error(`installed package ${skin.package} does not match the reviewed source/version; use Update to replace it with ${skin.install.target}`)
      }
      let validation = validateInstalledSkin(this.options.profileDir, skin, { allowArtifactRisk: true, hostKind: this.hostKind })
      if (!validation.ok && validation.repairable === true) {
        await this.prepareProfile(skin, operation, async () => {
          if (this.hostKind === 'desktop') await this.installPackage(skin, operation, readMarketState(this.options.profileDir))
          else await this.repairMaterializedPackage(skin, operation)
          validation = validateInstalledSkin(this.options.profileDir, skin, { allowArtifactRisk: true, hostKind: this.hostKind })
          if (!validation.ok) throw new Error(validation.reason)
        })
      }
      if (!validation.ok) throw new Error(validation.reason)
      if (this.hostKind === 'desktop') {
        const artifact = validateDesktopArtifact(this.options.profileDir, skin, { allowArtifactRisk: true })
        if (!artifact.ok) throw new Error(artifact.reason)
      }
      if (!reviewedInstalledSpecMatches(this.options.profileDir, skin, existingSpec, { allowArtifactRisk: true, hostKind: this.hostKind })) {
        throw new Error(`installed package ${skin.package} does not match the reviewed source/version; use Update to replace it with ${skin.install.target}`)
      }
      const snapshot = snapshotInstallFiles(this.options.profileDir, skin.package, skin.install.version)
      const mutationsBefore = this.profileMutations.get(operation.id) ?? 0
      const state = readMarketState(this.options.profileDir)
      try {
        await this.installCompanions(skin, operation, state)
        await this.applyCompatibility(skin, operation)
        validation = validateInstalledSkin(this.options.profileDir, skin, { allowArtifactRisk: true, hostKind: this.hostKind })
        if (!validation.ok) throw new Error(validation.reason)
        await this.registerSkin( skin, !this.enabledSkinIds(state).has(skin.id))
        this.reconcileDisabledSkinIds(state)
        this.recordRestart(state, skin.id, operation.restartRequired === true)
        writeMarketState(this.options.profileDir, state)
        if (operation.restartRequired) {
          writeOperationMessage(operation,
            this.hostKind === 'desktop' ? '安装构件已修复；请手动重启 Desktop App 完成应用' : '安装构件已修复；请重启 DSH 完成应用',
            this.hostKind === 'desktop' ? 'common.operationInstallPackageRepairedDesktop' : 'common.operationInstallPackageRepairedDsh')
        } else writeOperationMessage(operation, 'skin was already installed; market state reconciled', 'common.operationInstallReconciled')
        return
      } catch (error) {
        await this.recoverProfile(skin, operation, snapshot, mutationsBefore)
        throw error
      }
    }
    const snapshot = snapshotInstallFiles(this.options.profileDir, skin.package, skin.install.version)
    const mutationsBefore = this.profileMutations.get(operation.id) ?? 0
    const detachedPatchFiles = this.hostKind === 'desktop' ? [] : detachCompatibilityPatches(this.options.profileDir, skin.package)
    if (prefetched === undefined) this.update(operation, 'resolving')
    try {
      if (this.hostKind !== 'desktop') await this.syncPnpmMetadata(operation, '正在清理旧的兼容适配')
      if (prefetched === undefined) this.update(operation, 'downloading')
      const state = readMarketState(this.options.profileDir)
      await this.installPackage(skin, operation, state, undefined, prefetched)
      await this.applyCompatibility(skin, operation)
      this.update(operation, 'validating')
      const validation = validateInstalledSkin(this.options.profileDir, skin, { allowArtifactRisk: true, hostKind: this.hostKind })
      if (!validation.ok) throw new Error(validation.reason)
      if (!reviewedInstalledSpecMatches(this.options.profileDir, skin, readDependencies(this.options.profileDir)[skin.package], { allowArtifactRisk: true, hostKind: this.hostKind })) {
        throw new Error(`installed package ${skin.package} does not match the reviewed source/version ${skin.install.target}`)
      }
      this.assertSkinLoaderConflicts(skin)
      await this.registerSkin( skin)
      state.activeSkinId = state.activeSkinId === skin.id ? null : state.activeSkinId
      if (!state.disabledSkinIds.includes(skin.id)) state.disabledSkinIds.push(skin.id)
      recordActivity(state, skin.id, 'installedAt', operation.startedAt)
      await this.syncManagedLoaders(state, false)
      // An old Host's successful first install may still hot-load on Use.
      // Replacements and explicit native restart results cannot be verified
      // from an active fiber, which could still contain the previous code.
      const inferredRestart = this.management?.installRequiresRestart === true && operation.application === 'applied'
        && snapshot.artifact.name === null && snapshot.artifact.version === null
        && (skin.install.companions?.length ?? 0) === 0
        && !state.pendingRestart?.skinIds.includes(skin.id)
      this.recordRestart(state, skin.id, operation.restartRequired === true, false,
        inferredRestart ? installedArtifactHash(this.options.profileDir, skin.package) : undefined)
      writeMarketState(this.options.profileDir, state)
      cleanupCompatibilityPatchFiles(detachedPatchFiles.filter(file => file !== compatibilityPatchFile(this.options.profileDir, skin.package, skin.install.version)))
      if (operation.restartRequired) {
        writeOperationMessage(operation,
          this.hostKind === 'desktop' ? '安装构件已验证；请手动重启 Desktop App 完成应用' : '安装构件已验证；请重启 DSH 完成应用',
          this.hostKind === 'desktop' ? 'common.operationInstallPackageVerifiedDesktop' : 'common.operationInstallPackageVerifiedDsh')
      } else writeOperationMessage(operation, 'installed; choose Use to activate', 'common.operationInstallReady')
    } catch (error) {
      await this.recoverProfile(skin, operation, snapshot, mutationsBefore)
      throw error
    }
  }

  private selectionSnapshot(): { manifest: FileSnapshot; patch: FileSnapshot } {
    return { manifest: snapshotFile(join(this.options.profileDir, 'package.json')), patch: snapshotFile(profilePatchFile(this.options.profileDir)) }
  }

  private async rollbackSelection(previous: PersistedMarketState, snapshot: { manifest: FileSnapshot; patch: FileSnapshot }): Promise<void> {
    if (this.disposed || this.waitingReason !== undefined) return
    const operation = this.profileLockOwner === null ? undefined : this.operations.get(this.profileLockOwner)
    try {
      if (this.management === undefined) {
        restoreManifest(this.options.profileDir, snapshot.manifest)
        restoreFile(profilePatchFile(this.options.profileDir), snapshot.patch)
      }
      if (this.management !== undefined && operation !== undefined) {
        await this.restoreNativeBundles(operation, false)
        for (const { skin, enabled } of this.componentUndo.get(operation.id)?.values() ?? []) {
          const manifest = packageManifest(this.options.profileDir, skin.package)
          const bundled = (manifest?.dsh as { bundle?: unknown } | undefined)?.bundle !== undefined
          const component = await this.officialComponent(skin, bundled)
          if (component === undefined) throw new Error('回退时皮肤主组件身份已变化，请在官方插件页核对状态')
          if (component.enabled !== enabled) this.acceptManagement(await this.awaitLifecycle(this.management.setPluginEnabled(component.entryId, enabled)), operation, skin)
        }
        await this.restoreNativeBundles(operation)
      }
      writeMarketState(this.options.profileDir, previous)
      if (this.management === undefined) await this.replayLocked(false)
      if (this.management !== undefined && operation?.restartRequired === true) {
        // Rollback restores the saved selection, but a native no-HMR result
        // cannot confirm that the currently loaded appearance was restored.
        const restored = readMarketState(this.options.profileDir)
        for (const skinId of new Set([...this.enabledSkinIds(restored), operation.skinId])) this.recordRestart(restored, skinId, true)
        writeMarketState(this.options.profileDir, restored)
      }
    } catch (error) {
      if (operation !== undefined && this.waitingReason === undefined) this.recoveryErrors.set(operation.id, '原有启停选择恢复未完成，请先核对实际状态后再操作')
      throw error
    }
  }

  private async retainSavedOfficialSelection(error: unknown, operation: Operation, previous: PersistedMarketState, next: PersistedMarketState, skin: SkinEntry): Promise<boolean> {
    const pending = previous.pendingRestart
    if (!this.management?.installRequiresRestart || pending?.pid !== process.pid || !pending.skinIds.includes(skin.id)
      || !(error instanceof ManagedOperationError)) return false
    const managed = error.result.management
    // The old Host can save its selection, then fail while importing the new
    // module into the current process. Only its exact, single-target import
    // diagnostic qualifies; initialization failures and unknown results do not.
    const diagnostic = managed?.error?.diagnostic
    const componentEntry = this.componentUndo.get(operation.id)?.get(skin.id)?.entryId
    const componentTarget = componentEntry !== undefined && managed?.target === componentEntry
    const expected = `dsh: warning: 1 entry did not activate\n${skin.rowId} (${skin.package}): failed to import`
    if (managed?.indeterminate === true || managed?.application !== 'failed' || managed.stage !== 'enable'
      || (managed.target !== skin.package && !componentTarget) || managed.enabled !== true || managed.error?.code !== 'operation-error'
      || typeof diagnostic !== 'string' || diagnostic.trim().replaceAll('\r\n', '\n') !== expected) return false
    const dependencies = readDependencies(this.options.profileDir)
    const validation = validateInstalledSkin(this.options.profileDir, skin, { hostKind: this.hostKind })
    const artifact = validateDesktopArtifact(this.options.profileDir, skin)
    if (!validation.ok || !artifact.ok || !reviewedInstalledSpecMatches(this.options.profileDir, skin, dependencies[skin.package], { hostKind: this.hostKind })) return false
    const enabled = this.enabledSkinIds(next)
    const selected = new Set(readProfileBundles(this.options.profileDir))
    for (const item of this.catalog) {
      if (dependencies[item.package] === undefined) continue
      const manifest = packageManifest(this.options.profileDir, item.package)
      const bundle = (manifest?.dsh as { bundle?: unknown } | undefined)?.bundle
      if (bundle === undefined || selected.has(item.package) !== enabled.has(item.id)) return false
      for (const companion of item.install.companions ?? []) {
        if (dependencies[companion.package] === undefined || next.managedCompanions?.[companion.package] === undefined) continue
        if (selected.has(companion.package) !== this.companionOwnersEnabled(companion.package, next, enabled)) return false
      }
    }
    try {
      let component = await this.officialComponent(skin, true)
      if (component === undefined || componentTarget && component.entryId !== componentEntry) return false
      if (!component.enabled) {
        if (componentTarget) return false
        // A bundle may save its layer and then fail importing it. Its old
        // explicit component override still has to be enabled before asking
        // the user to restart; selecting the bundle alone cannot do that.
        const undo = this.componentUndo.get(operation.id) ?? new Map()
        if (!undo.has(skin.id)) undo.set(skin.id, { skin, entryId: component.entryId, enabled: component.enabled })
        this.componentUndo.set(operation.id, undo)
        const result = await this.awaitLifecycle(this.management.setPluginEnabled(component.entryId, true))
        const componentResult = result.management
        if (componentResult?.indeterminate === true) this.acceptManagement(result, operation)
        const sameImportFailure = componentResult?.application === 'failed' && componentResult.stage === 'enable'
          && componentResult.target === component.entryId && componentResult.enabled === true && componentResult.error?.code === 'operation-error'
          && typeof componentResult.error.diagnostic === 'string' && componentResult.error.diagnostic.trim().replaceAll('\r\n', '\n') === expected
        if (!sameImportFailure) this.acceptManagement(result, operation)
        component = await this.officialComponent(skin, true)
      }
      if (!component?.enabled) return false
    } catch (error) {
      if (this.unresolvedManager) throw error
      return false
    }
    operation.application = 'restart-required'
    operation.restartRequired = true
    this.recordRestart(next, skin.id, true)
    writeMarketState(this.options.profileDir, next)
    writeOperationMessage(operation, `启停选择已保存，目标当前未加载；请手动重启 Desktop App\n${diagnostic}`, 'common.operationSelectionSavedRestartDesktop', { diagnostic })
    logEvent('warn', 'selection-saved-restart-required', diagnostic, operation.id)
    return true
  }

  private async activate(operation: Operation): Promise<void> {
    await this.withProfileLock(operation, () => this.activateLocked(operation))
  }

  private async activateLocked(operation: Operation): Promise<void> {
    const skin = this.skin(operation.skinId)
    this.assertCompatibilityContext(operation, skin)
    if (readDependencies(this.options.profileDir)[skin.package] === undefined) throw new Error('install the skin before using it')
    this.assertArtifactUseApproved(operation, skin)
    await this.inspectLegacyBundles(skin)
    this.update(operation, 'activating')
    const previous = readMarketState(this.options.profileDir)
    if (this.management !== undefined && previous.pendingRestart?.pid === process.pid && previous.pendingRestart.skinIds.includes(skin.id)) {
      operation.restartRequired = true
    }
    const selection = this.selectionSnapshot()
    const requestedPreserved = operation.preservedSkinIds
    const preserved = requestedPreserved === undefined ? pinnedSkinIds(previous) : [...new Set(requestedPreserved)]
    if (operation.selectionContext !== undefined) {
      const currentContext = await this.selectionContextLocked('activate', skin.id, requestedPreserved)
      if (currentContext !== operation.selectionContext) throw new Error('保留选择已变化，请重新确认')
    }
    if (requestedPreserved !== undefined) {
      const dependencies = readDependencies(this.options.profileDir)
      const invalid = preserved.find(id => id === skin.id || !this.skinById.has(id) || dependencies[this.skin(id).package] === undefined)
      if (invalid !== undefined) throw new Error(`无法保留未安装或不存在的皮肤：${invalid}`)
      const approvals = operation.preservedSkinApprovals ?? {}
      if (preserved.length !== Object.keys(approvals).length || preserved.some(id => approvals[id] === undefined)) throw new Error('保留选择已变化，请重新确认')
      for (const id of preserved) this.assertPreservedSkinApproved(operation, this.skin(id))
    }
    const persistentPinned = pinnedSkinIds(previous)
    const nextPinned = requestedPreserved === undefined ? persistentPinned : persistentPinned.filter(id => preserved.includes(id))
    const next: PersistedMarketState = { ...previous, version: 1, activeSkinId: skin.id, pinnedSkinIds: nextPinned }
    recordActivity(next, skin.id, 'usedAt', operation.startedAt)
    this.reconcileDisabledSkinIds(next, new Set([skin.id, ...preserved]))
    const enabled = this.enabledSkinIds(next)
    const dependencies = readDependencies(this.options.profileDir)
    const installed = this.installedSkins(dependencies)
    try {
      // Disable the previous ordinary skin before enabling the target. Pinned
      // skins remain part of the enabled union throughout this transition.
      for (const item of installed) {
        if (!enabled.has(item.id)) await this.registerSkin(item, true)
      }
      for (const item of installed) {
        if (enabled.has(item.id)) await this.registerSkin(item, false)
      }
      await this.syncInstalledCompanions(next, true)
      let active: { found: boolean; live: boolean } | undefined
      for (const item of installed) {
        if (!enabled.has(item.id)) await this.setEntryDisabled(item, true)
      }
      for (const item of installed) {
        if (enabled.has(item.id)) {
          await this.setEntryDisabled(item, false)
        }
      }
      active = await this.setEntryDisabled(skin, false)
      await this.syncManagedLoaders(next, true)
      this.recordSelectionRestart(previous, next, skin, operation)
      this.syncRestartIntent(next, skin.id)
      writeMarketState(this.options.profileDir, next)
      if (next.pendingRestart?.inferredInstalls?.[skin.id] !== undefined) {
        await this.inspectRuntimeStates(true)
        operation.restartRequired = readMarketState(this.options.profileDir).pendingRestart?.skinIds.includes(skin.id) === true
      }
      if (operation.restartRequired === true) writeOperationMessage(operation, 'activation saved; restart DSH to load this skin', 'common.operationActivationSavedRestart')
      else if (active?.found && active.live) writeOperationMessage(operation, 'skin is active', 'common.operationActive')
      else writeOperationMessage(operation, '启用设置已保存，但皮肤组件尚未运行；请在官方插件页检查加载状态', 'common.operationActivationNotRunning')
    } catch (error) {
      if (await this.retainSavedOfficialSelection(error, operation, previous, next, skin)) return
      await this.rollbackSelection(previous, selection)
      throw error
    }
  }

  private async deactivate(operation: Operation): Promise<void> {
    await this.withProfileLock(operation, () => this.deactivateLocked(operation))
  }

  private async deactivateLocked(operation: Operation): Promise<void> {
    const skin = this.skin(operation.skinId)
    if (!installedSkinSourceMatches(this.options.profileDir, skin)) {
      this.update(operation, 'activating')
      const state = readMarketState(this.options.profileDir)
      state.activeSkinId = state.activeSkinId === skin.id ? null : state.activeSkinId
      state.pinnedSkinIds = pinnedSkinIds(state).filter(id => id !== skin.id)
      this.recordRestart(state, skin.id, false, true)
      this.releaseManagedLoaders(state, skin.id)
      this.reconcileDisabledSkinIds(state)
      writeMarketState(this.options.profileDir, state)
      writeOperationMessage(operation, '市场记录已清理；检测到同名但不同来源的外部插件，未修改该插件', 'common.operationExternalReconciled')
      return
    }
    this.update(operation, 'activating')
    const previous = readMarketState(this.options.profileDir)
    const selection = this.selectionSnapshot()
    const state = { ...previous, pinnedSkinIds: pinnedSkinIds(previous) }
    state.activeSkinId = state.activeSkinId === skin.id ? null : state.activeSkinId
    state.pinnedSkinIds = state.pinnedSkinIds.filter(id => id !== skin.id)
    const enabled = this.enabledSkinIds(previous)
    enabled.delete(skin.id)
    this.reconcileDisabledSkinIds(state, enabled)
    try {
      await this.registerSkin( skin, true)
      await this.setEntryDisabled(skin, true)
      await this.syncInstalledCompanions(state, true)
      await this.syncManagedLoaders(state, true)
      this.recordSelectionRestart(previous, state, skin, operation)
      this.syncRestartIntent(state, skin.id)
      writeMarketState(this.options.profileDir, state)
      if (operation.restartRequired === true) writeOperationMessage(operation, 'skin disabled; restart DSH to apply the change', 'common.operationDisabledRestart')
      else if (this.enabledSkinIds(state).size === 0) writeOperationMessage(operation, 'DSH default appearance restored; package kept installed', 'common.operationDefaultAppearanceRestored')
      else writeOperationMessage(operation, 'skin disabled; other enabled skins were kept active', 'common.operationDisabledKept')
    } catch (error) {
      await this.rollbackSelection(previous, selection)
      throw error
    }
  }

  private async pin(operation: Operation): Promise<void> {
    await this.withProfileLock(operation, () => this.pinLocked(operation))
  }

  private async pinLocked(operation: Operation): Promise<void> {
    const skin = this.skin(operation.skinId)
    this.assertCompatibilityContext(operation, skin)
    if (readDependencies(this.options.profileDir)[skin.package] === undefined) throw new Error('install the skin before pinning it')
    this.assertArtifactUseApproved(operation, skin)
    await this.inspectLegacyBundles(skin)
    const previous = readMarketState(this.options.profileDir)
    if (this.management !== undefined && previous.pendingRestart?.pid === process.pid && previous.pendingRestart.skinIds.includes(skin.id)) {
      operation.restartRequired = true
    }
    const selection = this.selectionSnapshot()
    this.update(operation, 'activating')
    const next: PersistedMarketState = { ...previous, pinnedSkinIds: [...new Set([...pinnedSkinIds(previous), skin.id])] }
    const enabled = this.enabledSkinIds(previous)
    enabled.add(skin.id)
    this.reconcileDisabledSkinIds(next, enabled)
    try {
      await this.registerSkin( skin, false)
      await this.syncInstalledCompanions(next, true)
      await this.syncManagedLoaders(next, true)
      const active = await this.setEntryDisabled(skin, false)
      this.recordSelectionRestart(previous, next, skin, operation)
      this.syncRestartIntent(next, skin.id)
      writeMarketState(this.options.profileDir, next)
      if (next.pendingRestart?.inferredInstalls?.[skin.id] !== undefined) {
        await this.inspectRuntimeStates(true)
        operation.restartRequired = readMarketState(this.options.profileDir).pendingRestart?.skinIds.includes(skin.id) === true
      }
      if (operation.restartRequired === true) writeOperationMessage(operation, 'pin saved; restart DSH to load this skin', 'common.operationPinSavedRestart')
      else if (active.found && active.live) writeOperationMessage(operation, 'skin is pinned and active', 'common.operationPinnedActive')
      else writeOperationMessage(operation, '常驻设置已保存，但皮肤组件尚未运行；请在官方插件页检查状态', 'common.operationPinNotRunning')
    } catch (error) {
      if (await this.retainSavedOfficialSelection(error, operation, previous, next, skin)) return
      await this.rollbackSelection(previous, selection)
      throw error
    }
  }

  private async unpin(operation: Operation): Promise<void> {
    await this.withProfileLock(operation, () => this.unpinLocked(operation))
  }

  private async unpinLocked(operation: Operation): Promise<void> {
    const skin = this.skin(operation.skinId)
    const previous = readMarketState(this.options.profileDir)
    const selection = this.selectionSnapshot()
    if (!pinnedSkinIds(previous).includes(skin.id)) throw new Error('skin is not pinned')
    this.update(operation, 'activating')
    const next: PersistedMarketState = { ...previous, pinnedSkinIds: pinnedSkinIds(previous).filter(id => id !== skin.id) }
    const enabled = this.enabledSkinIds(previous)
    if (next.activeSkinId !== skin.id) enabled.delete(skin.id)
    this.reconcileDisabledSkinIds(next, enabled)
    try {
      if (next.activeSkinId !== skin.id) {
        await this.registerSkin( skin, true)
        await this.setEntryDisabled(skin, true)
      }
      await this.syncInstalledCompanions(next, true)
      await this.syncManagedLoaders(next, true)
      this.recordSelectionRestart(previous, next, skin, operation)
      this.syncRestartIntent(next, skin.id)
      writeMarketState(this.options.profileDir, next)
      if (operation.restartRequired === true) writeOperationMessage(operation, 'skin is no longer pinned; restart DSH to apply the change', 'common.operationUnpinRestart')
      else if (next.activeSkinId === skin.id) writeOperationMessage(operation, 'skin is no longer pinned and remains the current skin', 'common.operationUnpinCurrent')
      else writeOperationMessage(operation, 'skin is no longer pinned and was disabled', 'common.operationUnpinDisabled')
    } catch (error) {
      await this.rollbackSelection(previous, selection)
      throw error
    }
  }

  private async updateSkin(operation: Operation): Promise<void> {
    const skin = this.skin(operation.skinId)
    const sourceContext = this.sourceMigrationContexts.get(operation.id)?.context
    const originalSpec = readDependencies(this.options.profileDir)[skin.package]
    const target = this.hostKind === 'desktop' ? this.desktopUpdateTarget(skin) : operation.kind === 'migrate'
      ? this.assertNpmMigration(skin, sourceContext).target
      : updateInstallTarget(skin, originalSpec)
    this.applyPendingBuildApprovals(operation)
    let prefetched: PrefetchedPackage | undefined
    if (this.hostKind !== 'desktop') {
      prefetched = await this.withDownloadSlot(operation, async () => {
        this.update(operation, 'resolving')
        this.update(operation, 'downloading')
        return await this.prefetch(skin, operation, target)
      })
      if (operation.kind === 'migrate' && this.assertNpmMigration(skin, sourceContext).target !== prefetched.target) {
        throw new Error('npm 换源目标在下载期间发生变化，请刷新后重试')
      }
    }
    await this.withProfileLock(operation, async () => {
      this.assertCompatibilityContext(operation, skin)
      if (this.hostKind === 'desktop' && this.desktopUpdateTarget(skin) !== target) throw new Error('Desktop 更新来源在排队期间发生变化，请刷新后重试')
      if (this.hostKind !== 'desktop') {
        if (operation.kind === 'migrate' && this.assertNpmMigration(skin, sourceContext).target !== target) throw new Error('npm 换源目标在排队期间发生变化，请刷新后重试')
        if (readDependencies(this.options.profileDir)[skin.package] !== originalSpec) throw new Error('更新来源在下载或排队期间发生变化，请刷新后重试')
        await this.prepareProfile(skin, operation, () => this.syncPnpmMetadata(operation, '正在修复 profile 的 pnpm 锁文件'), originalSpec)
        if (readDependencies(this.options.profileDir)[skin.package] !== originalSpec) throw new Error('更新来源在安装准备期间发生变化，请刷新后重试')
      }
      const previousState = readMarketState(this.options.profileDir)
      let wasActive = this.enabledSkinIds(previousState).has(skin.id)
      let repairUpdatedComponent = true
      if (this.management !== undefined) {
        const manifest = packageManifest(this.options.profileDir, skin.package)
        const bundled = (manifest?.dsh as { bundle?: unknown } | undefined)?.bundle !== undefined
        const selected = bundled && readProfileBundles(this.options.profileDir).includes(skin.package)
        // A deselected bundle has no effective component to preserve. Its old
        // declaration may itself be what this package update needs to repair.
        const component = bundled && !selected ? undefined : await this.officialComponent(skin, bundled)
        // Preserve the native saved choice even while its client awaits a restart.
        wasActive = bundled ? selected
          : component?.enabled === true
        repairUpdatedComponent = component?.enabled !== false
      }
      const snapshot = snapshotInstallFiles(this.options.profileDir, skin.package, skin.install.version)
      const mutationsBefore = this.profileMutations.get(operation.id) ?? 0
      const detachedPatchFiles = this.hostKind === 'desktop' ? [] : detachCompatibilityPatches(this.options.profileDir, skin.package)
      if (prefetched === undefined) this.update(operation, 'resolving')
      let installationStarted = false
      try {
        if (this.hostKind !== 'desktop') await this.syncPnpmMetadata(operation, '正在清理旧的兼容适配')
        if (this.hostKind !== 'desktop' && readDependencies(this.options.profileDir)[skin.package] !== originalSpec) throw new Error('更新来源在安装准备期间发生变化，请刷新后重试')
        if (prefetched === undefined) this.update(operation, 'downloading')
        installationStarted = true
        await this.installPackage(skin, operation, previousState, target, prefetched)
        await this.applyCompatibility(skin, operation)
        this.update(operation, 'validating')
        const validation = validateInstalledSkin(this.options.profileDir, skin, { allowArtifactRisk: true, hostKind: this.hostKind })
        if (!validation.ok) throw new Error(validation.reason)
        this.assertReplacementArtifact(this.options.profileDir, skin, operation)
        if (validation.version !== skin.install.version || !reviewedInstalledSpecMatches(this.options.profileDir, skin, readDependencies(this.options.profileDir)[skin.package], { allowArtifactRisk: true, hostKind: this.hostKind })) {
          throw new Error(`installed package did not change to the reviewed source/version ${skin.install.target}`)
        }
        if (operation.kind === 'migrate' && readDependencies(this.options.profileDir)[skin.package] !== skin.install.npm?.version) {
          throw new Error('npm 换源后未保存精确版本，已停止并恢复原有安装')
        }
        this.assertSkinLoaderConflicts(skin)
        const risk = inspectSkinArtifactRisk(this.options.profileDir, skin, this.hostKind)
        const artifactNeedsConfirmation = risk !== undefined && !isSkinArtifactRiskAcknowledged(this.options.profileDir, skin, this.hostKind)
        const compatibilityNeedsConfirmation = this.management !== undefined && assessCompatibility(skin, this.runtime).decision === 'incompatible'
        const needsUseConfirmation = artifactNeedsConfirmation || compatibilityNeedsConfirmation
        if (needsUseConfirmation) {
          const enabled = this.enabledSkinIds(previousState)
          enabled.delete(skin.id)
          previousState.activeSkinId = previousState.activeSkinId === skin.id ? null : previousState.activeSkinId
          previousState.pinnedSkinIds = pinnedSkinIds(previousState).filter(id => id !== skin.id)
          this.reconcileDisabledSkinIds(previousState, enabled)
        }
        await this.registerSkin( skin, !wasActive || needsUseConfirmation, repairUpdatedComponent)
        await this.syncInstalledCompanions(previousState, false)
        await this.setEntryDisabled(skin, !wasActive || needsUseConfirmation)
        await this.syncManagedLoaders(previousState, false)
        const nextState = previousState
        recordActivity(nextState, skin.id, 'updatedAt', operation.startedAt)
        this.recordRestart(nextState, skin.id, operation.restartRequired === true)
        writeMarketState(this.options.profileDir, nextState)
        cleanupCompatibilityPatchFiles(detachedPatchFiles.filter(file => file !== compatibilityPatchFile(this.options.profileDir, skin.package, skin.install.version)))
        const migrationLabel = sourceContext === undefined ? '已换用 npm' : '已替换为市场版本'
        if (needsUseConfirmation) writeOperationMessage(operation, '安装构件已更新；使用或常驻前请确认当前版本提示', 'common.operationNeedsUseConfirmation')
        else if (operation.kind === 'migrate') {
          if (wasActive) writeOperationMessage(operation, `${migrationLabel}并保留启用状态；重启 DSH 后生效`, sourceContext === undefined ? 'common.operationNpmMigrationActiveRestart' : 'common.operationMarketMigrationActiveRestart')
          else writeOperationMessage(operation, `${migrationLabel}并保留停用状态`, sourceContext === undefined ? 'common.operationNpmMigrationInactive' : 'common.operationMarketMigrationInactive')
        } else if (operation.restartRequired) writeOperationMessage(operation, '更新已验证，原启停状态已保留；重启宿主后加载新版本', 'common.operationUpdateVerifiedRestart')
        else if (wasActive) writeOperationMessage(operation, 'updated and kept active', 'common.operationUpdatedActive')
        else writeOperationMessage(operation, 'updated and kept inactive', 'common.operationUpdatedInactive')
      } catch (error) {
        // Before our add starts, a new source belongs to another writer. Do
        // not restore the old manifest over that newer choice.
        if (!installationStarted && this.hostKind !== 'desktop' && readDependencies(this.options.profileDir)[skin.package] !== originalSpec) {
          throw new Error('更新来源在安装准备期间发生变化，请刷新后重试')
        }
        await this.recoverProfile(skin, operation, snapshot, mutationsBefore)
        throw error
      }
    })
  }

  private async uninstall(operation: Operation): Promise<void> {
    await this.withProfileLock(operation, () => this.uninstallLocked(operation))
  }

  private async uninstallLocked(operation: Operation): Promise<void> {
    const skin = this.skin(operation.skinId)
    if (readDependencies(this.options.profileDir)[skin.package] === undefined) throw new Error('skin is not installed')
    if (!installedSkinSourceMatches(this.options.profileDir, skin)) {
      throw new Error(`installed package ${skin.package} does not match the market source; uninstall is blocked to protect the external package`)
    }
    const snapshot = snapshotInstallFiles(this.options.profileDir, skin.package, skin.install.version)
    const mutationsBefore = this.profileMutations.get(operation.id) ?? 0
    const loaderRowsBefore = installedLoaderIdentities(this.options.profileDir)
    let detachedPatchFiles: string[] = []
    try {
      // pnpm rejects removing a dependency while that same dependency remains
      // in patchedDependencies. Detach both workspace and lockfile metadata
      // before the remove command; the snapshot restores them on failure.
      detachedPatchFiles = this.management === undefined ? detachCompatibilityPatches(this.options.profileDir, skin.package) : []
      const state = readMarketState(this.options.profileDir)
      if (this.management === undefined && this.enabledSkinIds(state).has(skin.id)) await this.deactivate(operation)
      this.update(operation, 'installing')
      await this.run(['remove', skin.package], operation)
      await this.syncPnpmMetadata(operation, '正在清理兼容适配并同步 pnpm 锁文件')
      // A legacy install may predate managed-loader receipts. After pnpm has
      // removed the package, rows that disappeared from the actual installed
      // graph are safe to disable in this process: they cannot return on the
      // next boot, while a pre-existing/shared loader still appears in the
      // remaining graph and is deliberately left alone.
      const remainingLoaderRows = installedLoaderIdentities(this.options.profileDir)
      const staleLiveRows = loaderRowsBefore.filter(row =>
        !remainingLoaderRows.some(remaining => sharedLoaderIdentifiers(row, remaining).length > 0),
      )
      if (this.management === undefined) for (const row of staleLiveRows) await this.setLoaderDisabled(row, true)
      if (this.management === undefined) removeSkinRegistration(this.options.profileDir, skin)
      const next = readMarketState(this.options.profileDir)
      await this.uninstallUnusedCompanions(skin, operation, next)
      next.disabledSkinIds = next.disabledSkinIds.filter(id => id !== skin.id)
      next.pinnedSkinIds = pinnedSkinIds(next).filter(id => id !== skin.id)
      if (next.activeSkinId === skin.id) next.activeSkinId = null
      if (next.activity !== undefined) delete next.activity[skin.id]
      if (next.artifactAcknowledgements !== undefined) {
        delete next.artifactAcknowledgements[skin.id]
        if (Object.keys(next.artifactAcknowledgements).length === 0) delete next.artifactAcknowledgements
      }
      this.recordRestart(next, skin.id, operation.restartRequired === true, true)
      this.releaseManagedLoaders(next, skin.id)
      await this.syncManagedLoaders(next, false)
      writeMarketState(this.options.profileDir, next)
      cleanupCompatibilityPatchFiles(detachedPatchFiles)
      writeOperationMessage(operation, 'skin uninstalled', 'common.operationUninstalled')
    } catch (error) {
      await this.recoverProfile(skin, operation, snapshot, mutationsBefore)
      throw error
    }
  }
}
