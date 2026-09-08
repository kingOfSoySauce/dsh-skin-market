import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApprovalKeyForTarget, effectiveBuildApprovalKey } from './build-approval.js';
import { assessCompatibility } from './compatibility.js';
import { persistCompatibilityPatch, planCompatibilityPatch } from './compatibility-adapter.js';
import { loadCatalog } from './catalog.js';
import { companionAsSkin, discoverMonorepoTarget, isNpmInstallTarget, preferredInstallTarget, reviewedNpmSourceError, updateInstallTarget } from './install-resolution.js';
import { sharedLoaderIdentifiers } from './loader-ownership.js';
import { failureDiagnostic, PnpmCommandError, runPnpmWithRecovery } from './pnpm-recovery.js';
import { pluginArgsFor } from './pnpm-compat.js';
import { PnpmProgressTracker } from './pnpm-progress.js';
import { cleanOrphanedStore } from './store.js';
import { logEvent } from './log.js';
import { companionNeedsInstall, ensureBuildAllowed, ensureSkinRegistration, hasLoaderOverride, installedSpecMatches, npmSourceMigration, cleanupCompatibilityPatchFiles, detachCompatibilityPatches, pnpmLockfile, pnpmWorkspaceFile, profilePatchFile, readDependencies, readMarketState, readProfileBundles, assertNoLoaderConflicts, installedLoaderIdentities, InstallConflictError, LoaderMetadataError, compatibilityPatchFile, marketStateFile, packageManifest, packageLoaderOwnershipAt, patchedDependenciesNeedSync, removeSkinRegistration, restoreFile, setManagedLoaderOverride, restoreManifest, runtimeState, snapshotFile, validateInstalledSkin, writeMarketState, } from './profile.js';
const OPERATION_TIMEOUT_MS = 15 * 60 * 1000;
const RECOVERY_TIMEOUT_MS = 60_000;
function errorMessage(error) { return error instanceof Error ? error.message : String(error); }
function recoveryMessage(failure) {
    if (failure.recovery === 'disable-peer-autoinstall')
        return '检测到宿主提供但 npm 未发布的 peer，正在关闭 peer 自动安装并重试';
    if (failure.kind === 'release-age')
        return '检测到新包保护，正在临时放宽本次命令并重试';
    if (failure.kind === 'fetch-timeout')
        return '当前步骤超时，正在剩余安装时间内重试一次';
    if (failure.kind === 'network')
        return '检测到临时网络错误，正在自动重试';
    return failure.message;
}
function snapshotInstallFiles(profileDir, packageName, version) {
    return {
        manifest: snapshotFile(join(profileDir, 'package.json')),
        profilePatch: snapshotFile(profilePatchFile(profileDir)),
        marketState: snapshotFile(marketStateFile(profileDir)),
        workspace: snapshotFile(pnpmWorkspaceFile(profileDir)),
        lockfile: snapshotFile(pnpmLockfile(profileDir)),
        compatibility: snapshotFile(compatibilityPatchFile(profileDir, packageName, version)),
    };
}
function restoreProfileInstallFiles(profileDir, packageName, version, snapshot) {
    restoreManifest(profileDir, snapshot.manifest);
    restoreFile(profilePatchFile(profileDir), snapshot.profilePatch);
    restoreFile(marketStateFile(profileDir), snapshot.marketState);
    restoreFile(pnpmWorkspaceFile(profileDir), snapshot.workspace);
    restoreFile(pnpmLockfile(profileDir), snapshot.lockfile);
    restoreFile(compatibilityPatchFile(profileDir, packageName, version), snapshot.compatibility);
}
export function desktopInstallError(capability) {
    if (capability?.mode === 'manual-only') {
        return `Desktop 当前不支持该皮肤的一键安装（${capability.reason}），请查看仓库安装说明`;
    }
    return 'Desktop 当前仅支持已验证 npm 精确版本的一键安装，请查看仓库安装说明';
}
function pinnedSkinIds(state) {
    return [...new Set((state.pinnedSkinIds ?? []).filter(id => typeof id === 'string'))];
}
function enabledSkinIds(state) {
    return new Set([...(state.activeSkinId === null ? [] : [state.activeSkinId]), ...pinnedSkinIds(state)]);
}
function isWebClientPackage(profileDir, packageName) {
    const manifest = packageManifest(profileDir, packageName);
    if (manifest === null || typeof manifest.dsh !== 'object' || manifest.dsh === null || Array.isArray(manifest.dsh))
        return false;
    const client = manifest.dsh.client;
    if (typeof client !== 'object' || client === null || Array.isArray(client))
        return false;
    return client.platform === 'web';
}
function recordActivity(state, skinId, kind, at) {
    state.activity = { ...state.activity, [skinId]: { ...state.activity?.[skinId], [kind]: at } };
}
// Keep this in an .npmrc file instead of passing `--config.fetchTimeout` on
// the CLI. pnpm 11 currently leaves the dotted CLI value as a string, while
// its retry timer requires a number and throws ERR_INVALID_ARG_TYPE.
// The prefetch project only downloads and inspects the plugin; it must not
// resolve host-provided peer packages from the public npm registry.
const PNPM_FETCH_CONFIG = 'fetch-timeout=600000\nauto-install-peers=false\n';
export class SkinLifecycle {
    host;
    options;
    operations = new Map();
    activeOperation = null;
    abortControllers = new Map();
    pendingBuildKeys = new Map();
    deadlines = new Map();
    deadlineTimers = new Map();
    expired = new Set();
    profileMutations = new Map();
    recoveryErrors = new Map();
    desktopManagedAttempts = new Set();
    desktopRecoveryBaselines = new Map();
    catalogEntries;
    skinById;
    disposeEvent;
    constructor(host, options, catalog = loadCatalog().skins) {
        this.host = host;
        this.options = options;
        this.catalogEntries = catalog;
        this.skinById = new Map(catalog.map(skin => [skin.id, skin]));
    }
    get catalog() { return this.catalogEntries; }
    get hostKind() { return this.options.hostKind ?? this.options.runner.hostKind ?? 'dsh'; }
    get runtime() {
        return this.options.runtime ?? { version: null, capabilities: [], source: 'unknown' };
    }
    async applyCompatibility(skin, operation) {
        const plan = planCompatibilityPatch(this.options.profileDir, skin, this.runtime);
        if (plan === null || plan.adapterIds.length === 0)
            return;
        persistCompatibilityPatch(this.options.profileDir, plan);
        await this.syncPnpmMetadata(operation, `正在应用兼容适配：${plan.adapterIds.join('、')}`);
    }
    async syncPnpmMetadata(operation, message = '正在同步 pnpm 锁文件') {
        if (!patchedDependenciesNeedSync(this.options.profileDir))
            return;
        this.update(operation, 'installing', message);
        await this.run(['install', '--no-frozen-lockfile'], operation);
        if (patchedDependenciesNeedSync(this.options.profileDir)) {
            throw new Error('pnpm patchedDependencies 未能与锁文件同步，已停止本次操作以保护 profile');
        }
    }
    applyPendingBuildApprovals(operation) {
        if (this.hostKind === 'desktop')
            return;
        for (const key of this.pendingBuildKeys.get(operation.id) ?? [])
            ensureBuildAllowed(this.options.profileDir, key);
    }
    prefetchBuildApprovals(skin, operation, target) {
        if (isNpmInstallTarget(skin, target))
            return [];
        const reviewed = buildApprovalKeyForTarget(skin, target) ?? effectiveBuildApprovalKey(skin);
        return [...new Set([
                ...(this.pendingBuildKeys.get(operation.id) ?? []),
                ...(reviewed === undefined ? [] : [reviewed]),
            ])];
    }
    preparePrefetchDirectory(directory, buildKeys) {
        writeFileSync(join(directory, 'package.json'), '{"private":true}\n', 'utf8');
        writeFileSync(join(directory, '.npmrc'), PNPM_FETCH_CONFIG, 'utf8');
        if (buildKeys.length === 0)
            return;
        writeFileSync(join(directory, 'pnpm-workspace.yaml'), 'packages:\n  - .\n', 'utf8');
        for (const key of buildKeys)
            ensureBuildAllowed(directory, key);
    }
    async repairMaterializedPackage(skin, operation) {
        this.update(operation, 'installing', `正在修复已记录但未物化的皮肤依赖：${skin.package}`);
        await this.run(['install'], operation);
    }
    async replaceCatalog(catalog) {
        this.catalogEntries = catalog;
        this.skinById = new Map(catalog.map(skin => [skin.id, skin]));
        await this.replay();
    }
    start() {
        void this.replay();
        this.disposeEvent = this.host.on?.('internal/plugin', fiber => {
            const name = fiber.entry?.options?.name;
            const id = fiber.entry?.options?.id;
            const skin = this.catalog.find(item => item.rowId === name || item.rowId === id || item.package === name);
            if (skin === undefined)
                return;
            const state = readMarketState(this.options.profileDir);
            const shouldDisable = !enabledSkinIds(state).has(skin.id);
            void this.setEntryDisabled(skin, shouldDisable);
        });
    }
    dispose() { this.disposeEvent?.(); }
    skin(id) {
        const skin = this.skinById.get(id);
        if (skin === undefined)
            throw new Error('skin is not in the curated registry');
        return skin;
    }
    entriesFor(skin) {
        return [...this.host.loader.entries()].filter(entry => {
            const name = entry.options.name;
            const id = entry.options.id;
            return name === skin.rowId || id === skin.rowId || name === skin.package || id === skin.package;
        });
    }
    async setEntryDisabled(skin, disabled) {
        return await this.setLoaderDisabled({ id: skin.rowId, name: skin.package }, disabled);
    }
    async setLoaderDisabled(identity, disabled) {
        const entries = [...this.host.loader.entries()].filter(entry => (identity.id !== undefined && entry.options.id === identity.id)
            || (identity.name !== undefined && entry.options.name === identity.name));
        for (const entry of entries) {
            // Do not rewrite an already-correct loader state during startup. The
            // DSH client module registry builds its browser boot graph while loader
            // entries are becoming live; an unnecessary disabled -> enabled cycle
            // can make an active skin disappear from that graph until the next
            // restart.
            const currentlyDisabled = entry.options.disabled === true;
            if (currentlyDisabled === disabled)
                continue;
            await entry.update({ disabled: disabled ? true : null }, false, true);
        }
        return { found: entries.length > 0, live: entries.some(entry => entry.fiber !== undefined) };
    }
    claimManagedLoaders(state, skin, incomingRows, beforeRows) {
        for (const identity of incomingRows) {
            if (identity.id === undefined)
                continue;
            if (identity.id === skin.rowId && identity.name === skin.package)
                continue;
            const existing = state.managedLoaders?.[identity.id];
            if (existing !== undefined) {
                if (sharedLoaderIdentifiers(existing, identity).length === 0)
                    continue;
                if (!existing.ownerSkinIds.includes(skin.id))
                    existing.ownerSkinIds.push(skin.id);
                continue;
            }
            if (beforeRows.some(row => sharedLoaderIdentifiers(row, identity).length > 0))
                continue;
            if (hasLoaderOverride(this.options.profileDir, identity))
                continue;
            state.managedLoaders = {
                ...state.managedLoaders,
                [identity.id]: {
                    id: identity.id,
                    ...(identity.name === undefined ? {} : { name: identity.name }),
                    ...(identity.packageName === undefined ? {} : { packageName: identity.packageName }),
                    ownerSkinIds: [skin.id],
                },
            };
        }
    }
    releaseManagedLoaders(state, skinId) {
        for (const [key, identity] of Object.entries(state.managedLoaders ?? {})) {
            if (!identity.ownerSkinIds.includes(skinId))
                continue;
            identity.ownerSkinIds = identity.ownerSkinIds.filter(ownerSkinId => ownerSkinId !== skinId);
            if (identity.ownerSkinIds.length > 0)
                continue;
            setManagedLoaderOverride(this.options.profileDir, identity, false);
            delete state.managedLoaders?.[key];
        }
        if (state.managedLoaders !== undefined && Object.keys(state.managedLoaders).length === 0)
            delete state.managedLoaders;
    }
    async syncManagedLoaders(state, live) {
        const enabled = enabledSkinIds(state);
        for (const identity of Object.values(state.managedLoaders ?? {})) {
            const disabled = !identity.ownerSkinIds.some(ownerSkinId => enabled.has(ownerSkinId));
            // Disabled bundle skins are removed from dsh.profile.bundles, so their
            // child rows no longer exist at boot. Persisting child disable rows here
            // would create orphan overrides; receipts are needed only for live sync.
            const controlled = setManagedLoaderOverride(this.options.profileDir, identity, false);
            if (live && controlled)
                await this.setLoaderDisabled(identity, disabled);
        }
    }
    reconcileDisabledSkinIds(state) {
        const enabled = enabledSkinIds(state);
        state.disabledSkinIds = this.catalog.filter(skin => !enabled.has(skin.id)).map(skin => skin.id);
    }
    requiresRestartForTransition(previous, next) {
        const changed = new Set([...enabledSkinIds(previous), ...enabledSkinIds(next)]);
        const dependencies = readDependencies(this.options.profileDir);
        return [...changed].some(id => {
            const skin = this.skinById.get(id);
            return skin !== undefined && dependencies[skin.package] !== undefined && isWebClientPackage(this.options.profileDir, skin.package);
        });
    }
    async replay() {
        const state = readMarketState(this.options.profileDir);
        const dependencies = readDependencies(this.options.profileDir);
        const installed = this.catalog.filter(skin => dependencies[skin.package] !== undefined);
        const rootBundles = new Set(readProfileBundles(this.options.profileDir));
        // An explicitly bundled skin that has not yet been recorded as managed
        // is treated as active. Managed inactive bundles are removed below.
        const installedIds = new Set(installed.map(skin => skin.id));
        const normalizedPinned = pinnedSkinIds(state).filter(id => installedIds.has(id));
        const stateChanged = JSON.stringify(state.pinnedSkinIds ?? []) !== JSON.stringify(normalizedPinned);
        state.pinnedSkinIds = normalizedPinned;
        const manuallyActive = state.activeSkinId === null
            ? installed.filter(skin => rootBundles.has(skin.package) && !state.disabledSkinIds.includes(skin.id) && !normalizedPinned.includes(skin.id)).at(-1)
            : undefined;
        if (manuallyActive !== undefined) {
            state.activeSkinId = manuallyActive.id;
        }
        const previousDisabled = JSON.stringify(state.disabledSkinIds);
        this.reconcileDisabledSkinIds(state);
        if (stateChanged || manuallyActive !== undefined || previousDisabled !== JSON.stringify(state.disabledSkinIds)) {
            writeMarketState(this.options.profileDir, state);
        }
        const enabled = enabledSkinIds(state);
        for (const skin of installed)
            ensureSkinRegistration(this.options.profileDir, skin, !enabled.has(skin.id));
        // On startup, preserve the active entry's initial loader state. Toggling
        // it off and back on here races the client-module registry, which builds
        // the browser boot graph while loader entries are becoming live. Only
        // reconcile installed non-active entries; the active entry's profile
        // override was already written above and should be loaded directly.
        for (const skin of installed) {
            await this.setEntryDisabled(skin, !enabled.has(skin.id));
        }
        await this.syncManagedLoaders(state, true);
        const previousCompanions = JSON.stringify(state.managedCompanions);
        await this.syncInstalledCompanions(state, true);
        if (previousCompanions !== JSON.stringify(state.managedCompanions))
            writeMarketState(this.options.profileDir, state);
    }
    states() {
        const state = readMarketState(this.options.profileDir);
        return this.catalog.map(skin => {
            const entries = this.entriesFor(skin);
            const runtime = runtimeState(this.options.profileDir, skin, state.activeSkinId, entries.some(entry => entry.fiber !== undefined), entries.length > 0, pinnedSkinIds(state), state.activity?.[skin.id]);
            const sourceMigration = this.hostKind === 'desktop' ? undefined : npmSourceMigration(this.options.profileDir, skin);
            return { ...runtime, ...(sourceMigration === undefined ? {} : { sourceMigration }) };
        });
    }
    currentOperation() {
        return this.activeOperation === null ? null : this.operations.get(this.activeOperation) ?? null;
    }
    begin(kind, skinId, approvedBuildKeys) {
        const skin = this.skin(skinId);
        if (kind === 'install' || kind === 'update' || kind === 'migrate') {
            if (this.hostKind === 'desktop' && skin.install.desktop?.mode !== 'managed') {
                throw new Error(desktopInstallError(skin.install.desktop));
            }
            if (this.hostKind !== 'desktop' && skin.review?.installation === 'manual-only') {
                throw new Error('该皮肤尚未满足市场自动安装所需信息，请查看仓库安装说明');
            }
        }
        if (kind === 'migrate')
            this.assertNpmMigration(skin);
        if (this.activeOperation !== null)
            throw new Error('another skin operation is already running');
        const operation = {
            id: randomUUID(), kind, skinId, phase: 'queued', startedAt: new Date().toISOString(),
            cancelable: kind === 'install' || kind === 'update' || kind === 'migrate',
        };
        this.operations.set(operation.id, operation);
        this.abortControllers.set(operation.id, new AbortController());
        if (kind === 'install' || kind === 'update' || kind === 'migrate') {
            const timeoutMs = this.options.operationTimeoutMs ?? OPERATION_TIMEOUT_MS;
            this.deadlines.set(operation.id, Date.now() + timeoutMs);
            const timer = setTimeout(() => {
                this.expired.add(operation.id);
                operation.cancelable = false;
                operation.message = '已达到安装总时限，正在结束当前步骤';
                this.abortControllers.get(operation.id)?.abort();
            }, timeoutMs);
            timer.unref?.();
            this.deadlineTimers.set(operation.id, timer);
        }
        const buildKeys = typeof approvedBuildKeys === 'string' ? [approvedBuildKeys] : approvedBuildKeys;
        if (buildKeys !== undefined && buildKeys.length > 0)
            this.pendingBuildKeys.set(operation.id, [...new Set(buildKeys)]);
        this.activeOperation = operation.id;
        logEvent('info', 'operation', `${kind} ${skin.package}`, operation.id);
        void this.execute(operation);
        return operation;
    }
    retry(id, action) {
        const failed = this.operations.get(id);
        if (failed === undefined || failed.phase !== 'failed')
            throw new Error('operation is not retryable');
        if (failed.failure?.action !== action)
            throw new Error('该操作不支持此恢复动作');
        const approvedBuildKeys = action === 'approve-build' ? this.pendingBuildKeys.get(id) : undefined;
        if (action === 'approve-build' && (approvedBuildKeys === undefined || approvedBuildKeys.length === 0))
            throw new Error('未找到需要批准的精确构建项');
        return this.begin(failed.kind, failed.skinId, approvedBuildKeys);
    }
    update(operation, phase, message) {
        operation.phase = phase;
        operation.message = message;
        operation.cancelable = (operation.kind === 'install' || operation.kind === 'update' || operation.kind === 'migrate')
            && (phase === 'queued' || phase === 'resolving' || phase === 'downloading');
        if (phase === 'done' || phase === 'failed' || phase === 'cancelled')
            operation.finishedAt = new Date().toISOString();
    }
    cancel(id) {
        const operation = this.operations.get(id);
        if (operation === undefined)
            throw new Error('operation not found');
        if (operation.phase === 'done' || operation.phase === 'failed' || operation.phase === 'cancelled')
            return operation;
        if (operation.cancelable !== true)
            throw new Error('当前阶段无法安全取消，请等待操作完成');
        this.update(operation, 'cancelling', '正在取消并清理临时文件');
        this.abortControllers.get(id)?.abort();
        return operation;
    }
    async execute(operation) {
        try {
            if (operation.kind === 'install')
                await this.install(operation);
            else if (operation.kind === 'activate')
                await this.activate(operation);
            else if (operation.kind === 'deactivate')
                await this.deactivate(operation);
            else if (operation.kind === 'pin')
                await this.pin(operation);
            else if (operation.kind === 'unpin')
                await this.unpin(operation);
            else if (operation.kind === 'update' || operation.kind === 'migrate')
                await this.updateSkin(operation);
            else
                await this.uninstall(operation);
            this.update(operation, 'done', operation.message);
        }
        catch (error) {
            if (this.expired.has(operation.id)) {
                const message = `安装已达到总时限，已停止继续重试${this.recoveryErrors.has(operation.id) ? `；${this.recoveryErrors.get(operation.id)}` : ''}`;
                operation.failure = { kind: 'command', message, ...(this.recoveryErrors.has(operation.id) ? {} : { action: 'retry' }) };
                logEvent('error', 'operation-timeout', message, operation.id);
                this.update(operation, 'failed', message);
            }
            else if (this.abortControllers.get(operation.id)?.signal.aborted === true && !this.recoveryErrors.has(operation.id))
                this.update(operation, 'cancelled', '操作已取消');
            else {
                if (error instanceof PnpmCommandError) {
                    const failure = error.failure;
                    const buildKeys = failure.buildKeys ?? (failure.buildKey === undefined ? [] : [failure.buildKey]);
                    const action = failure.kind === 'network' || failure.kind === 'fetch-timeout'
                        ? 'retry'
                        : failure.kind === 'build-approval' && buildKeys.length > 0 && this.hostKind !== 'desktop'
                            ? 'approve-build'
                            : undefined;
                    const operationFailure = {
                        kind: failure.kind,
                        message: failure.message,
                        ...(failure.packageName === undefined ? {} : { packageName: failure.packageName }),
                        ...(action === undefined ? {} : { action }),
                    };
                    operation.failure = operationFailure;
                    if (buildKeys.length > 0)
                        this.pendingBuildKeys.set(operation.id, buildKeys);
                }
                if (error instanceof InstallConflictError) {
                    operation.failure = { kind: 'conflict', message: error.message, conflicts: error.conflicts };
                }
                if (operation.failure === undefined && (operation.kind === 'install' || operation.kind === 'update' || operation.kind === 'migrate') && assessCompatibility(this.skin(operation.skinId), this.runtime).decision === 'incompatible') {
                    operation.failure = { kind: 'compatibility', message: errorMessage(error) };
                }
                logEvent('error', error instanceof PnpmCommandError ? 'pnpm' : 'operation', error instanceof PnpmCommandError
                    ? `kind=${error.failure.kind}${error.failure.packageName === undefined ? '' : ` package=${error.failure.packageName}`} ${failureDiagnostic(error.result)}`
                    : errorMessage(error), operation.id);
                const recoveryError = this.recoveryErrors.get(operation.id);
                if (recoveryError !== undefined && operation.failure !== undefined)
                    delete operation.failure.action;
                this.update(operation, 'failed', `${errorMessage(error)}${recoveryError === undefined ? '' : `；${recoveryError}`}`);
            }
        }
        finally {
            this.activeOperation = null;
            clearTimeout(this.deadlineTimers.get(operation.id));
            this.deadlineTimers.delete(operation.id);
            this.deadlines.delete(operation.id);
            this.expired.delete(operation.id);
            this.profileMutations.delete(operation.id);
            this.recoveryErrors.delete(operation.id);
            this.desktopManagedAttempts.delete(operation.id);
            this.desktopRecoveryBaselines.delete(operation.id);
            this.abortControllers.delete(operation.id);
            const timer = setTimeout(() => {
                this.operations.delete(operation.id);
                this.pendingBuildKeys.delete(operation.id);
            }, 30 * 60 * 1000);
            timer.unref?.();
        }
    }
    async run(args, operation) {
        this.checkDeadline(operation);
        const controller = operation === undefined ? undefined : this.abortControllers.get(operation.id);
        if (controller?.signal.aborted === true)
            throw new Error('操作已取消');
        const ensurePnpm = this.options.runner.ensurePnpm;
        if (ensurePnpm !== undefined)
            await ensurePnpm({ signal: controller?.signal, timeoutMs: this.remainingTime(operation) });
        const effectiveArgs = pluginArgsFor(this.options.profileDir, args);
        let attempt = 0;
        try {
            await runPnpmWithRecovery(effectiveArgs, {
                profileDir: this.options.profileDir,
                attempt: async (attemptArgs, attemptOptions) => {
                    this.checkDeadline(operation);
                    const tracker = operation === undefined ? undefined : new PnpmProgressTracker();
                    const commandArgs = tracker === undefined || attemptArgs.some(arg => arg.startsWith('--reporter')) ? attemptArgs : [...attemptArgs, '--reporter=ndjson'];
                    this.startCommand(operation, attemptArgs, ++attempt);
                    const result = await this.options.runner(this.options.profile, commandArgs, {
                        signal: controller?.signal,
                        timeoutMs: Math.min(10 * 60 * 1000, this.remainingTime(operation) ?? 10 * 60 * 1000),
                        env: { pnpm_config_fetch_timeout: String(10 * 60 * 1000), ...attemptOptions?.env },
                        onStdout: chunk => tracker?.push(chunk, operation),
                        onStderr: chunk => tracker?.push(chunk, operation),
                    });
                    if (operation !== undefined)
                        logEvent('info', 'command-finished', `attempt=${attempt} ${failureDiagnostic(result)}`, operation.id);
                    return result;
                },
                onRetry: failure => {
                    if (operation !== undefined)
                        this.update(operation, operation.phase, recoveryMessage(failure));
                },
            });
        }
        catch (error) {
            if (controller === undefined || controller.signal.aborted === false) {
                await cleanOrphanedStore(this.options.runner, this.options.profile, operation?.id, { signal: controller?.signal, timeoutMs: Math.min(5000, this.remainingTime(operation) ?? 5000) });
            }
            throw error;
        }
    }
    remainingTime(operation) {
        const deadline = operation === undefined ? undefined : this.deadlines.get(operation.id);
        return deadline === undefined ? undefined : Math.max(0, deadline - Date.now());
    }
    checkDeadline(operation) {
        if (operation !== undefined && this.remainingTime(operation) === 0) {
            this.expired.add(operation.id);
            this.abortControllers.get(operation.id)?.abort();
            throw new Error('安装已达到总时限');
        }
        if (operation !== undefined && this.abortControllers.get(operation.id)?.signal.aborted === true)
            throw new Error('操作已取消');
    }
    startCommand(operation, args, attempt, tracksMutation = true) {
        if (operation === undefined)
            return;
        const directoryIndex = args.indexOf('--dir');
        const temporary = directoryIndex >= 0 && args[directoryIndex + 1] !== this.options.profileDir;
        const verb = args.find(arg => arg === 'add' || arg === 'install' || arg === 'remove');
        if (tracksMutation && !temporary && verb !== undefined)
            this.profileMutations.set(operation.id, (this.profileMutations.get(operation.id) ?? 0) + 1);
        operation.step = temporary ? '下载并检查安装包' : verb === 'remove' ? '移除插件依赖' : verb === 'install' ? '同步 profile 依赖' : '安装到 profile';
        operation.attempt = attempt;
        operation.stepStartedAt = new Date().toISOString();
        delete operation.lastOutputAt;
        delete operation.pnpmStage;
        delete operation.downloadedBytes;
        delete operation.totalBytes;
        delete operation.bytesPerSecond;
        logEvent('info', 'command-started', `${operation.step} attempt=${attempt}`, operation.id);
    }
    /** Restore metadata first, then reconcile dependencies once within a separate budget. */
    async recoverProfile(skin, operation, snapshot, mutationsBefore) {
        clearTimeout(this.deadlineTimers.get(operation.id));
        if (this.desktopManagedAttempts.has(operation.id)) {
            // The host owns failed managed installs, including refusal before start.
            // Only undo market work performed after a successful host transaction.
            const baseline = this.desktopRecoveryBaselines.get(operation.id);
            if (baseline === undefined)
                return;
            snapshot = baseline.snapshot;
            mutationsBefore = baseline.mutationsBefore;
        }
        const restore = () => {
            try {
                restoreProfileInstallFiles(this.options.profileDir, skin.package, skin.install.version, snapshot);
                return true;
            }
            catch (error) {
                this.recoveryErrors.set(operation.id, '原有配置恢复未完成；请复制日志并修复 profile 后再操作');
                logEvent('error', 'recovery-configuration', errorMessage(error), operation.id);
                return false;
            }
        };
        if (!restore())
            return;
        if ((this.profileMutations.get(operation.id) ?? 0) <= mutationsBefore)
            return;
        this.update(operation, 'installing', '安装未完成，正在恢复原有依赖');
        operation.step = '恢复原有 profile 依赖';
        operation.attempt = 1;
        operation.stepStartedAt = new Date().toISOString();
        delete operation.lastOutputAt;
        delete operation.pnpmStage;
        delete operation.bytesPerSecond;
        delete operation.totalBytes;
        delete operation.downloadedBytes;
        const timeoutMs = this.options.recoveryTimeoutMs ?? RECOVERY_TIMEOUT_MS;
        const tracker = new PnpmProgressTracker();
        logEvent('info', 'recovery-started', 'restoring previous dependencies (one attempt)', operation.id);
        try {
            const options = {
                timeoutMs,
                signal: AbortSignal.timeout(timeoutMs),
                onStdout: chunk => tracker.push(chunk, operation),
                onStderr: chunk => tracker.push(chunk, operation),
            };
            const result = await this.options.runner(this.options.profile, ['install', '--prefer-offline', '--reporter=ndjson'], options);
            logEvent('info', 'recovery-finished', failureDiagnostic(result), operation.id);
            if (result.exitCode !== 0 || result.timedOut || result.aborted)
                throw new Error('recovery did not complete');
        }
        catch (error) {
            this.recoveryErrors.set(operation.id, '原有配置已恢复，但依赖恢复未完成；请复制日志后修复 profile 依赖');
            logEvent('error', 'recovery-dependencies', errorMessage(error), operation.id);
        }
        finally {
            // pnpm may rewrite the lockfile even during a failed recovery.
            restore();
        }
    }
    async prepareProfile(skin, operation, prepare) {
        const snapshot = snapshotInstallFiles(this.options.profileDir, skin.package, skin.install.version);
        const mutationsBefore = this.profileMutations.get(operation.id) ?? 0;
        try {
            await prepare();
        }
        catch (error) {
            await this.recoverProfile(skin, operation, snapshot, mutationsBefore);
            throw error;
        }
    }
    assertNpmMigration(skin) {
        if (this.hostKind === 'desktop')
            throw new Error('Desktop 暂不支持换用 npm');
        const migration = npmSourceMigration(this.options.profileDir, skin);
        if (migration === undefined)
            throw new Error('当前安装与已核验的 npm 来源不对应，无法换用 npm；请刷新目录并先更新 GitHub 版本');
        return migration;
    }
    async installPackage(skin, operation, state, target) {
        if (this.hostKind === 'desktop') {
            this.desktopManagedAttempts.add(operation.id);
            const capability = skin.install.desktop;
            if (capability?.mode !== 'managed')
                throw new Error(desktopInstallError(capability));
            if (capability.packageName !== skin.package || capability.packageVersion !== skin.install.version) {
                throw new Error('Desktop 安装元数据与皮肤固定版本不一致，请等待市场重新抓取');
            }
            const installPlugin = this.options.runner.installPlugin;
            if (installPlugin === undefined)
                throw new Error('当前 Desktop 未提供受支持的插件安装服务');
            this.update(operation, 'installing');
            const controller = this.abortControllers.get(operation.id);
            const tracker = new PnpmProgressTracker();
            const request = {
                packageName: capability.packageName,
                packageVersion: capability.packageVersion,
                receiptId: randomUUID(),
                pnpmOptions: ['--prefer-offline', '--reporter=ndjson'],
            };
            await runPnpmWithRecovery(request.pnpmOptions ?? [], {
                attempt: (pnpmOptions) => {
                    this.checkDeadline(operation);
                    this.startCommand(operation, ['add'], (operation.attempt ?? 0) + 1, false);
                    return installPlugin(this.options.profile, { ...request, pnpmOptions }, {
                        signal: controller?.signal,
                        timeoutMs: Math.min(10 * 60 * 1000, this.remainingTime(operation) ?? 10 * 60 * 1000),
                        onStdout: chunk => tracker.push(chunk, operation),
                        onStderr: chunk => tracker.push(chunk, operation),
                    });
                },
                onRetry: failure => this.update(operation, operation.phase, recoveryMessage(failure)),
            });
            this.desktopRecoveryBaselines.set(operation.id, {
                snapshot: snapshotInstallFiles(this.options.profileDir, skin.package, skin.install.version),
                mutationsBefore: this.profileMutations.get(operation.id) ?? 0,
            });
            return;
        }
        const beforeRows = installedLoaderIdentities(this.options.profileDir);
        const prefetched = await this.prefetch(skin, operation, target);
        if (operation.kind === 'migrate' && this.assertNpmMigration(skin).target !== prefetched.target) {
            throw new Error('npm 换源目标在下载期间发生变化，请刷新后重试');
        }
        assertNoLoaderConflicts(this.options.profileDir, skin, prefetched.loaderRows);
        this.assertRuntimeLoaderConflicts(skin, prefetched.loaderRows);
        this.update(operation, 'installing');
        const buildApprovalKey = isNpmInstallTarget(skin, prefetched.target) ? undefined : buildApprovalKeyForTarget(skin, prefetched.target) ?? effectiveBuildApprovalKey(skin);
        if (buildApprovalKey !== undefined)
            ensureBuildAllowed(this.options.profileDir, buildApprovalKey);
        // A source migration replaces this exact skin release only. Companion
        // upgrades remain part of the separate ordinary Update operation.
        if (operation.kind !== 'migrate')
            await this.installCompanions(skin, operation, state);
        await this.run(['add', prefetched.target, '--prefer-offline', ...(isNpmInstallTarget(skin, prefetched.target) ? ['--save-exact'] : [])], operation);
        this.claimManagedLoaders(state, skin, prefetched.loaderRows, beforeRows);
    }
    async installCompanions(skin, operation, state) {
        const enabled = enabledSkinIds(state);
        for (const companion of skin.install.companions ?? []) {
            const existingSpec = readDependencies(this.options.profileDir)[companion.package];
            const linked = state.managedCompanions?.[companion.package];
            if (existingSpec === undefined || (linked?.installedByMarket === true && companionNeedsInstall(this.options.profileDir, companion))) {
                await this.run(['add', companion.target, '--prefer-offline'], operation);
                this.claimManagedCompanion(state, companion.package, skin.id, true);
            }
            else if (linked !== undefined) {
                // An existing ownership receipt grants activation linkage, while its
                // installedByMarket bit continues to govern delete/update rights.
                this.claimManagedCompanion(state, companion.package, skin.id, linked.installedByMarket);
            }
            else {
                // A package that predates this market install belongs to the user.
                // Do not acquire enable/disable or delete rights over it.
                continue;
            }
            ensureSkinRegistration(this.options.profileDir, companionAsSkin(skin, companion), !this.companionOwnersEnabled(companion.package, state, enabled));
        }
    }
    claimManagedCompanion(state, packageName, ownerSkinId, installedByMarket) {
        const current = state.managedCompanions?.[packageName];
        if (current === undefined) {
            state.managedCompanions = {
                ...state.managedCompanions,
                [packageName]: { ownerSkinIds: [ownerSkinId], installedByMarket },
            };
            return;
        }
        if (!current.ownerSkinIds.includes(ownerSkinId))
            current.ownerSkinIds.push(ownerSkinId);
        if (installedByMarket)
            current.installedByMarket = true;
    }
    companionOwnersEnabled(packageName, state, enabled) {
        return state.managedCompanions?.[packageName]?.ownerSkinIds.some(ownerSkinId => enabled.has(ownerSkinId)) ?? false;
    }
    async syncInstalledCompanions(state, live) {
        const enabled = enabledSkinIds(state);
        const seen = new Set();
        const dependencies = readDependencies(this.options.profileDir);
        for (const item of this.catalog) {
            for (const companion of item.install.companions ?? []) {
                if (seen.has(companion.package) || dependencies[companion.package] === undefined || state.managedCompanions?.[companion.package] === undefined)
                    continue;
                seen.add(companion.package);
                const entry = companionAsSkin(item, companion);
                const disabled = !this.companionOwnersEnabled(companion.package, state, enabled);
                ensureSkinRegistration(this.options.profileDir, entry, disabled);
                if (live)
                    await this.setEntryDisabled(entry, disabled);
            }
        }
    }
    companionStillNeeded(packageName, exceptSkinId, state) {
        return state.managedCompanions?.[packageName]?.ownerSkinIds.some(ownerSkinId => ownerSkinId !== exceptSkinId) ?? false;
    }
    async uninstallUnusedCompanions(skin, operation, state) {
        for (const companion of skin.install.companions ?? []) {
            const managed = state.managedCompanions?.[companion.package];
            if (managed === undefined)
                continue;
            if (this.companionStillNeeded(companion.package, skin.id, state)) {
                managed.ownerSkinIds = managed.ownerSkinIds.filter(ownerSkinId => ownerSkinId !== skin.id);
                continue;
            }
            if (managed.installedByMarket && readDependencies(this.options.profileDir)[companion.package] !== undefined) {
                await this.run(['remove', companion.package], operation);
                removeSkinRegistration(this.options.profileDir, companionAsSkin(skin, companion));
            }
            else if (readDependencies(this.options.profileDir)[companion.package] !== undefined) {
                // Activation-linked but user-owned companions survive the last owner
                // and return to their independent enabled state.
                const entry = companionAsSkin(skin, companion);
                ensureSkinRegistration(this.options.profileDir, entry, false);
                await this.setEntryDisabled(entry, false);
            }
            delete state.managedCompanions?.[companion.package];
        }
        if (state.managedCompanions !== undefined && Object.keys(state.managedCompanions).length === 0)
            delete state.managedCompanions;
    }
    assertRuntimeLoaderConflicts(skin, loaderRows) {
        const incoming = loaderRows.length > 0
            ? loaderRows
            : [{ id: skin.rowId, name: skin.package, packageName: skin.package }];
        const conflicts = [];
        for (const entry of this.host.loader.entries()) {
            const id = entry.options.id;
            const name = entry.options.name;
            const existing = { id, name, packageName: name };
            for (const incomingRow of incoming) {
                const identifiers = sharedLoaderIdentifiers(incomingRow, existing);
                if (identifiers.length === 0)
                    continue;
                const currentSkinEntry = incomingRow.packageName === skin.package
                    && incomingRow.id === skin.rowId
                    && id === skin.rowId
                    && (name === undefined || name === skin.rowId || name === skin.package);
                if (incomingRow.packageName === existing.packageName || currentSkinEntry)
                    continue;
                conflicts.push({
                    kind: 'loader',
                    incoming: incomingRow.packageName ?? incomingRow.name ?? skin.package,
                    existing: name ?? id ?? 'unknown loader',
                    identifiers,
                });
            }
        }
        const unique = conflicts.filter((conflict, index) => conflicts.findIndex(item => JSON.stringify(item) === JSON.stringify(conflict)) === index);
        if (unique.length > 0)
            throw new InstallConflictError(unique);
    }
    async prefetch(skin, operation, selectedTarget) {
        // Resolve and download into an unwatched temporary project first. pnpm's
        // content-addressed store makes the real profile add reuse these files.
        // This prevents a large GitHub download from modifying the live profile
        // early and causing DSH Web to reload before the operation can finish.
        let target = selectedTarget ?? preferredInstallTarget(skin);
        if (isNpmInstallTarget(skin, target)) {
            const sourceError = reviewedNpmSourceError(skin);
            if (sourceError !== null)
                throw new Error(sourceError);
        }
        let directory = mkdtempSync(join(tmpdir(), 'dsh-skin-market-download-'));
        try {
            this.preparePrefetchDirectory(directory, this.prefetchBuildApprovals(skin, operation, target));
            await this.run(['add', target, '--dir', directory, '--ignore-scripts', '--config.auto-install-peers=false', ...(isNpmInstallTarget(skin, target) ? ['--save-exact'] : [])], operation);
            const redirected = discoverMonorepoTarget(directory, skin, target);
            if (redirected !== null) {
                target = redirected;
                rmSync(directory, { recursive: true, force: true });
                directory = mkdtempSync(join(tmpdir(), 'dsh-skin-market-download-'));
                this.preparePrefetchDirectory(directory, this.prefetchBuildApprovals(skin, operation, target));
                await this.run(['add', target, '--dir', directory, '--ignore-scripts', '--config.auto-install-peers=false'], operation);
            }
            const packageDirectory = join(directory, 'node_modules', ...skin.package.split('/'));
            if (isNpmInstallTarget(skin, target)) {
                if (readDependencies(directory)[skin.package] !== skin.install.npm?.version) {
                    throw new Error('下载的 npm 依赖未记录目录固定版本，已停止安装');
                }
                const validation = validateInstalledSkin(directory, skin);
                if (!validation.ok)
                    throw new Error(validation.reason);
                if (validation.version !== skin.install.version)
                    throw new Error('下载的 npm 包版本与目录固定版本不一致');
            }
            const packageRows = packageLoaderOwnershipAt(packageDirectory, skin.package);
            if (packageRows.hasBundle) {
                const primaryRows = packageRows.rows.filter(row => row.name === skin.package);
                if (primaryRows.length === 0) {
                    throw new LoaderMetadataError(`${skin.package} 的 bundle patch 没有 name=${skin.package} 的主 loader；目录 rowId=${skin.rowId}`);
                }
                if (primaryRows.length > 1) {
                    throw new LoaderMetadataError(`${skin.package} 的 bundle patch 声明了多个主 loader：${primaryRows.map(row => row.id ?? '(缺少 id)').join('、')}`);
                }
                if (primaryRows[0].id !== skin.rowId) {
                    throw new LoaderMetadataError(`${skin.package} 的目录 rowId=${skin.rowId}，实际主 loader id=${primaryRows[0].id ?? '(缺少 id)'}`);
                }
            }
            return {
                target,
                packageRows: packageRows.rows,
                hasBundle: packageRows.hasBundle,
                loaderRows: installedLoaderIdentities(directory),
            };
        }
        finally {
            rmSync(directory, { recursive: true, force: true });
        }
    }
    async install(operation) {
        const skin = this.skin(operation.skinId);
        this.applyPendingBuildApprovals(operation);
        if (this.hostKind !== 'desktop') {
            await this.prepareProfile(skin, operation, () => this.syncPnpmMetadata(operation, '正在修复 profile 的 pnpm 锁文件'));
        }
        const existingSpec = readDependencies(this.options.profileDir)[skin.package];
        if (existingSpec !== undefined) {
            let validation = validateInstalledSkin(this.options.profileDir, skin);
            if (!validation.ok && validation.repairable === true) {
                await this.prepareProfile(skin, operation, async () => {
                    if (this.hostKind === 'desktop')
                        await this.installPackage(skin, operation, readMarketState(this.options.profileDir));
                    else
                        await this.repairMaterializedPackage(skin, operation);
                    validation = validateInstalledSkin(this.options.profileDir, skin);
                    if (!validation.ok)
                        throw new Error(validation.reason);
                });
            }
            if (!validation.ok)
                throw new Error(validation.reason);
            if (!installedSpecMatches(skin, existingSpec)) {
                throw new Error(`installed package ${skin.package} does not match the reviewed source/version; use Update to replace it with ${skin.install.target}`);
            }
            const snapshot = snapshotInstallFiles(this.options.profileDir, skin.package, skin.install.version);
            const mutationsBefore = this.profileMutations.get(operation.id) ?? 0;
            const state = readMarketState(this.options.profileDir);
            try {
                await this.installCompanions(skin, operation, state);
                await this.applyCompatibility(skin, operation);
                validation = validateInstalledSkin(this.options.profileDir, skin);
                if (!validation.ok)
                    throw new Error(validation.reason);
                ensureSkinRegistration(this.options.profileDir, skin, !enabledSkinIds(state).has(skin.id));
                this.reconcileDisabledSkinIds(state);
                writeMarketState(this.options.profileDir, state);
                operation.message = 'skin was already installed; market state reconciled';
                return;
            }
            catch (error) {
                await this.recoverProfile(skin, operation, snapshot, mutationsBefore);
                throw error;
            }
        }
        const snapshot = snapshotInstallFiles(this.options.profileDir, skin.package, skin.install.version);
        const mutationsBefore = this.profileMutations.get(operation.id) ?? 0;
        const detachedPatchFiles = this.hostKind === 'desktop' ? [] : detachCompatibilityPatches(this.options.profileDir, skin.package);
        this.update(operation, 'resolving');
        try {
            if (this.hostKind !== 'desktop')
                await this.syncPnpmMetadata(operation, '正在清理旧的兼容适配');
            this.update(operation, 'downloading');
            const state = readMarketState(this.options.profileDir);
            await this.installPackage(skin, operation, state);
            await this.applyCompatibility(skin, operation);
            this.update(operation, 'validating');
            const validation = validateInstalledSkin(this.options.profileDir, skin);
            if (!validation.ok)
                throw new Error(validation.reason);
            if (!installedSpecMatches(skin, readDependencies(this.options.profileDir)[skin.package])) {
                throw new Error(`installed package ${skin.package} does not match the reviewed source/version ${skin.install.target}`);
            }
            assertNoLoaderConflicts(this.options.profileDir, skin);
            ensureSkinRegistration(this.options.profileDir, skin);
            state.activeSkinId = state.activeSkinId === skin.id ? null : state.activeSkinId;
            if (!state.disabledSkinIds.includes(skin.id))
                state.disabledSkinIds.push(skin.id);
            recordActivity(state, skin.id, 'installedAt', operation.startedAt);
            await this.syncManagedLoaders(state, false);
            writeMarketState(this.options.profileDir, state);
            cleanupCompatibilityPatchFiles(detachedPatchFiles.filter(file => file !== compatibilityPatchFile(this.options.profileDir, skin.package, skin.install.version)));
            operation.message = 'installed; choose Use to activate';
        }
        catch (error) {
            await this.recoverProfile(skin, operation, snapshot, mutationsBefore);
            throw error;
        }
    }
    async activate(operation) {
        const skin = this.skin(operation.skinId);
        if (readDependencies(this.options.profileDir)[skin.package] === undefined)
            throw new Error('install the skin before using it');
        this.update(operation, 'activating');
        const previous = readMarketState(this.options.profileDir);
        const next = { ...previous, version: 1, activeSkinId: skin.id, pinnedSkinIds: pinnedSkinIds(previous) };
        recordActivity(next, skin.id, 'usedAt', operation.startedAt);
        this.reconcileDisabledSkinIds(next);
        const requiresRestart = this.requiresRestartForTransition(previous, next);
        const enabled = enabledSkinIds(next);
        try {
            for (const item of this.catalog) {
                const installed = readDependencies(this.options.profileDir)[item.package] !== undefined;
                if (installed && enabled.has(item.id)) {
                    ensureSkinRegistration(this.options.profileDir, item, false);
                }
                if (installed && !enabled.has(item.id))
                    ensureSkinRegistration(this.options.profileDir, item, true);
            }
            await this.syncInstalledCompanions(next, !requiresRestart);
            let active;
            if (!requiresRestart) {
                for (const item of this.catalog) {
                    if (!enabled.has(item.id))
                        await this.setEntryDisabled(item, true);
                }
                for (const item of this.catalog) {
                    if (enabled.has(item.id) && readDependencies(this.options.profileDir)[item.package] !== undefined) {
                        await this.setEntryDisabled(item, false);
                    }
                }
                active = await this.setEntryDisabled(skin, false);
            }
            await this.syncManagedLoaders(next, !requiresRestart);
            writeMarketState(this.options.profileDir, next);
            if (requiresRestart) {
                operation.message = 'activation saved; restart DSH to load this skin';
            }
            else {
                operation.message = active?.found && active.live ? 'skin is active' : 'activation saved; restart DSH to load this skin';
            }
        }
        catch (error) {
            writeMarketState(this.options.profileDir, previous);
            await this.replay();
            throw error;
        }
    }
    async deactivate(operation) {
        const skin = this.skin(operation.skinId);
        this.update(operation, 'activating');
        const previous = readMarketState(this.options.profileDir);
        const state = { ...previous, pinnedSkinIds: pinnedSkinIds(previous) };
        state.activeSkinId = state.activeSkinId === skin.id ? null : state.activeSkinId;
        state.pinnedSkinIds = state.pinnedSkinIds.filter(id => id !== skin.id);
        this.reconcileDisabledSkinIds(state);
        const requiresRestart = this.requiresRestartForTransition(previous, state);
        try {
            ensureSkinRegistration(this.options.profileDir, skin, true);
            if (!requiresRestart)
                await this.setEntryDisabled(skin, true);
            await this.syncInstalledCompanions(state, !requiresRestart);
            await this.syncManagedLoaders(state, !requiresRestart);
            writeMarketState(this.options.profileDir, state);
            operation.message = requiresRestart
                ? 'skin disabled; restart DSH to apply the change'
                : enabledSkinIds(state).size === 0 ? 'DSH default appearance restored; package kept installed' : 'skin disabled; other enabled skins were kept active';
        }
        catch (error) {
            writeMarketState(this.options.profileDir, previous);
            await this.replay();
            throw error;
        }
    }
    async pin(operation) {
        const skin = this.skin(operation.skinId);
        const previous = readMarketState(this.options.profileDir);
        if (readDependencies(this.options.profileDir)[skin.package] === undefined)
            throw new Error('install the skin before pinning it');
        this.update(operation, 'activating');
        const next = { ...previous, pinnedSkinIds: [...new Set([...pinnedSkinIds(previous), skin.id])] };
        this.reconcileDisabledSkinIds(next);
        const requiresRestart = this.requiresRestartForTransition(previous, next);
        try {
            ensureSkinRegistration(this.options.profileDir, skin, false);
            await this.syncInstalledCompanions(next, !requiresRestart);
            await this.syncManagedLoaders(next, !requiresRestart);
            writeMarketState(this.options.profileDir, next);
            if (requiresRestart) {
                operation.message = 'pin saved; restart DSH to load this skin';
            }
            else {
                const active = await this.setEntryDisabled(skin, false);
                operation.message = active.found && active.live ? 'skin is pinned and active' : 'pin saved; restart DSH to load this skin';
            }
        }
        catch (error) {
            writeMarketState(this.options.profileDir, previous);
            await this.replay();
            throw error;
        }
    }
    async unpin(operation) {
        const skin = this.skin(operation.skinId);
        const previous = readMarketState(this.options.profileDir);
        if (!pinnedSkinIds(previous).includes(skin.id))
            throw new Error('skin is not pinned');
        this.update(operation, 'activating');
        const next = { ...previous, pinnedSkinIds: pinnedSkinIds(previous).filter(id => id !== skin.id) };
        this.reconcileDisabledSkinIds(next);
        const requiresRestart = this.requiresRestartForTransition(previous, next);
        try {
            if (next.activeSkinId !== skin.id) {
                ensureSkinRegistration(this.options.profileDir, skin, true);
                if (!requiresRestart)
                    await this.setEntryDisabled(skin, true);
            }
            await this.syncInstalledCompanions(next, !requiresRestart);
            await this.syncManagedLoaders(next, !requiresRestart);
            writeMarketState(this.options.profileDir, next);
            operation.message = requiresRestart
                ? 'skin is no longer pinned; restart DSH to apply the change'
                : next.activeSkinId === skin.id ? 'skin is no longer pinned and remains the current skin' : 'skin is no longer pinned and was disabled';
        }
        catch (error) {
            writeMarketState(this.options.profileDir, previous);
            await this.replay();
            throw error;
        }
    }
    async updateSkin(operation) {
        const skin = this.skin(operation.skinId);
        const target = this.hostKind === 'desktop' ? undefined : operation.kind === 'migrate'
            ? this.assertNpmMigration(skin).target
            : updateInstallTarget(skin, readDependencies(this.options.profileDir)[skin.package]);
        this.applyPendingBuildApprovals(operation);
        if (this.hostKind !== 'desktop') {
            await this.prepareProfile(skin, operation, () => this.syncPnpmMetadata(operation, '正在修复 profile 的 pnpm 锁文件'));
        }
        const previousState = readMarketState(this.options.profileDir);
        const wasActive = enabledSkinIds(previousState).has(skin.id);
        const snapshot = snapshotInstallFiles(this.options.profileDir, skin.package, skin.install.version);
        const mutationsBefore = this.profileMutations.get(operation.id) ?? 0;
        const detachedPatchFiles = this.hostKind === 'desktop' ? [] : detachCompatibilityPatches(this.options.profileDir, skin.package);
        this.update(operation, 'resolving');
        try {
            if (this.hostKind !== 'desktop')
                await this.syncPnpmMetadata(operation, '正在清理旧的兼容适配');
            this.update(operation, 'downloading');
            await this.installPackage(skin, operation, previousState, target);
            await this.applyCompatibility(skin, operation);
            this.update(operation, 'validating');
            const validation = validateInstalledSkin(this.options.profileDir, skin);
            if (!validation.ok)
                throw new Error(validation.reason);
            if (validation.version !== skin.install.version || !installedSpecMatches(skin, readDependencies(this.options.profileDir)[skin.package])) {
                throw new Error(`installed package did not change to the reviewed source/version ${skin.install.target}`);
            }
            if (operation.kind === 'migrate' && readDependencies(this.options.profileDir)[skin.package] !== skin.install.npm?.version) {
                throw new Error('npm 换源后未保存精确版本，已停止并恢复原有安装');
            }
            assertNoLoaderConflicts(this.options.profileDir, skin);
            ensureSkinRegistration(this.options.profileDir, skin, !wasActive);
            await this.syncInstalledCompanions(previousState, false);
            await this.setEntryDisabled(skin, !wasActive);
            await this.syncManagedLoaders(previousState, false);
            const nextState = previousState;
            recordActivity(nextState, skin.id, 'updatedAt', operation.startedAt);
            writeMarketState(this.options.profileDir, nextState);
            cleanupCompatibilityPatchFiles(detachedPatchFiles.filter(file => file !== compatibilityPatchFile(this.options.profileDir, skin.package, skin.install.version)));
            operation.message = operation.kind === 'migrate'
                ? wasActive ? '已换用 npm 并保留启用状态；重启 DSH 后生效' : '已换用 npm 并保留停用状态'
                : wasActive ? 'updated and kept active' : 'updated and kept inactive';
        }
        catch (error) {
            await this.recoverProfile(skin, operation, snapshot, mutationsBefore);
            throw error;
        }
    }
    async uninstall(operation) {
        const skin = this.skin(operation.skinId);
        if (readDependencies(this.options.profileDir)[skin.package] === undefined)
            throw new Error('skin is not installed');
        const snapshot = snapshotInstallFiles(this.options.profileDir, skin.package, skin.install.version);
        const mutationsBefore = this.profileMutations.get(operation.id) ?? 0;
        const loaderRowsBefore = installedLoaderIdentities(this.options.profileDir);
        let detachedPatchFiles = [];
        try {
            // pnpm rejects removing a dependency while that same dependency remains
            // in patchedDependencies. Detach both workspace and lockfile metadata
            // before the remove command; the snapshot restores them on failure.
            detachedPatchFiles = detachCompatibilityPatches(this.options.profileDir, skin.package);
            const state = readMarketState(this.options.profileDir);
            if (enabledSkinIds(state).has(skin.id))
                await this.deactivate(operation);
            this.update(operation, 'downloading');
            await this.run(['remove', skin.package], operation);
            await this.syncPnpmMetadata(operation, '正在清理兼容适配并同步 pnpm 锁文件');
            // A legacy install may predate managed-loader receipts. After pnpm has
            // removed the package, rows that disappeared from the actual installed
            // graph are safe to disable in this process: they cannot return on the
            // next boot, while a pre-existing/shared loader still appears in the
            // remaining graph and is deliberately left alone.
            const remainingLoaderRows = installedLoaderIdentities(this.options.profileDir);
            const staleLiveRows = loaderRowsBefore.filter(row => !remainingLoaderRows.some(remaining => sharedLoaderIdentifiers(row, remaining).length > 0));
            for (const row of staleLiveRows)
                await this.setLoaderDisabled(row, true);
            removeSkinRegistration(this.options.profileDir, skin);
            const next = readMarketState(this.options.profileDir);
            await this.uninstallUnusedCompanions(skin, operation, next);
            next.disabledSkinIds = next.disabledSkinIds.filter(id => id !== skin.id);
            next.pinnedSkinIds = pinnedSkinIds(next).filter(id => id !== skin.id);
            if (next.activeSkinId === skin.id)
                next.activeSkinId = null;
            if (next.activity !== undefined)
                delete next.activity[skin.id];
            this.releaseManagedLoaders(next, skin.id);
            await this.syncManagedLoaders(next, false);
            writeMarketState(this.options.profileDir, next);
            cleanupCompatibilityPatchFiles(detachedPatchFiles);
            operation.message = 'skin uninstalled';
        }
        catch (error) {
            await this.recoverProfile(skin, operation, snapshot, mutationsBefore);
            throw error;
        }
    }
}
