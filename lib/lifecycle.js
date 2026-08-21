import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commandError } from './commands.js';
import { loadCatalog } from './catalog.js';
import { ensureBuildAllowed, ensureSkinRegistration, pnpmLockfile, pnpmWorkspaceFile, profilePatchFile, readDependencies, readMarketState, readProfileBundles, removeSkinRegistration, restoreFile, restoreManifest, runtimeState, snapshotFile, snapshotManifest, validateInstalledSkin, writeMarketState, } from './profile.js';
function errorMessage(error) { return error instanceof Error ? error.message : String(error); }
class PnpmProgressTracker {
    buffer = '';
    fetches = new Map();
    unknownSizes = new Set();
    samples = [];
    push(chunk, operation) {
        this.buffer += chunk;
        const lines = this.buffer.split(/\r?\n/);
        this.buffer = lines.pop() ?? '';
        for (const line of lines)
            this.consume(line, operation);
    }
    consume(line, operation) {
        let event;
        try {
            event = JSON.parse(line);
        }
        catch {
            return;
        }
        const packageId = typeof event.packageId === 'string' ? event.packageId : undefined;
        if (packageId === undefined)
            return;
        if (event.name === 'pnpm:fetching-progress' && event.status === 'started') {
            const size = typeof event.size === 'number' && Number.isFinite(event.size) ? event.size : undefined;
            this.fetches.set(packageId, { size, downloaded: 0 });
            if (size === undefined)
                this.unknownSizes.add(packageId);
            this.publish(operation);
            return;
        }
        if (event.name === 'pnpm:fetching-progress' && event.status === 'in_progress' && typeof event.downloaded === 'number') {
            const current = this.fetches.get(packageId) ?? { downloaded: 0 };
            current.downloaded = Math.max(current.downloaded, event.downloaded);
            this.fetches.set(packageId, current);
            this.publish(operation);
            return;
        }
        if (event.name === 'pnpm:progress' && event.status === 'fetched') {
            const current = this.fetches.get(packageId);
            if (current?.size !== undefined)
                current.downloaded = current.size;
            this.publish(operation);
        }
    }
    publish(operation) {
        if (this.fetches.size === 0)
            return;
        const totalKnown = this.unknownSizes.size === 0;
        const total = [...this.fetches.values()].reduce((sum, item) => sum + (item.size ?? 0), 0);
        const downloaded = [...this.fetches.values()].reduce((sum, item) => sum + Math.min(item.downloaded, item.size ?? item.downloaded), 0);
        if (downloaded > 0)
            operation.downloadedBytes = downloaded;
        else
            delete operation.downloadedBytes;
        if (totalKnown)
            operation.totalBytes = total;
        else
            delete operation.totalBytes;
        const now = Date.now();
        this.samples.push({ at: now, bytes: downloaded });
        this.samples = this.samples.filter(sample => now - sample.at <= 5000);
        const first = this.samples[0];
        const last = this.samples.at(-1);
        if (first !== undefined && last !== undefined && last.at > first.at && last.bytes > first.bytes) {
            operation.bytesPerSecond = Math.round((last.bytes - first.bytes) * 1000 / (last.at - first.at));
        }
    }
}
function pinnedSkinIds(state) {
    return [...new Set((state.pinnedSkinIds ?? []).filter(id => typeof id === 'string'))];
}
function enabledSkinIds(state) {
    return new Set([...(state.activeSkinId === null ? [] : [state.activeSkinId]), ...pinnedSkinIds(state)]);
}
function recordActivity(state, skinId, kind, at) {
    state.activity = { ...state.activity, [skinId]: { ...state.activity?.[skinId], [kind]: at } };
}
// Keep this in an .npmrc file instead of passing `--config.fetchTimeout` on
// the CLI. pnpm 11 currently leaves the dotted CLI value as a string, while
// its retry timer requires a number and throws ERR_INVALID_ARG_TYPE.
const PNPM_FETCH_CONFIG = 'fetch-timeout=600000\n';
export class SkinLifecycle {
    host;
    options;
    operations = new Map();
    activeOperation = null;
    abortControllers = new Map();
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
        const entries = this.entriesFor(skin);
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
    reconcileDisabledSkinIds(state) {
        const enabled = enabledSkinIds(state);
        state.disabledSkinIds = this.catalog.filter(skin => !enabled.has(skin.id)).map(skin => skin.id);
    }
    async replay() {
        const state = readMarketState(this.options.profileDir);
        const dependencies = readDependencies(this.options.profileDir);
        const installed = this.catalog.filter(skin => dependencies[skin.package] !== undefined);
        const rootBundles = new Set(readProfileBundles(this.options.profileDir));
        // A complete skin bundle remains in dsh.profile.bundles even when the
        // market manages its disabled state. Only adopt an explicitly bundled
        // skin when it has not already been marked as market-managed.
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
    }
    states() {
        const state = readMarketState(this.options.profileDir);
        return this.catalog.map(skin => {
            const entries = this.entriesFor(skin);
            return runtimeState(this.options.profileDir, skin, state.activeSkinId, entries.some(entry => entry.fiber !== undefined), entries.length > 0, pinnedSkinIds(state), state.activity?.[skin.id]);
        });
    }
    currentOperation() {
        return this.activeOperation === null ? null : this.operations.get(this.activeOperation) ?? null;
    }
    begin(kind, skinId) {
        const skin = this.skin(skinId);
        if ((kind === 'install' || kind === 'update') && skin.review?.installation === 'manual-only') {
            throw new Error('该皮肤尚未满足市场自动安装所需信息，请查看仓库安装说明');
        }
        if (this.activeOperation !== null)
            throw new Error('another skin operation is already running');
        const operation = {
            id: randomUUID(), kind, skinId, phase: 'queued', startedAt: new Date().toISOString(),
            cancelable: kind === 'install' || kind === 'update',
        };
        this.operations.set(operation.id, operation);
        this.abortControllers.set(operation.id, new AbortController());
        this.activeOperation = operation.id;
        void this.execute(operation);
        return operation;
    }
    update(operation, phase, message) {
        operation.phase = phase;
        operation.message = message;
        operation.cancelable = (operation.kind === 'install' || operation.kind === 'update')
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
            else if (operation.kind === 'update')
                await this.updateSkin(operation);
            else
                await this.uninstall(operation);
            this.update(operation, 'done', operation.message);
        }
        catch (error) {
            if (this.abortControllers.get(operation.id)?.signal.aborted === true)
                this.update(operation, 'cancelled', '操作已取消');
            else
                this.update(operation, 'failed', errorMessage(error));
        }
        finally {
            this.activeOperation = null;
            this.abortControllers.delete(operation.id);
            const timer = setTimeout(() => this.operations.delete(operation.id), 30 * 60 * 1000);
            timer.unref?.();
        }
    }
    async run(args, operation, extra) {
        const controller = operation === undefined ? undefined : this.abortControllers.get(operation.id);
        if (controller?.signal.aborted === true)
            throw new Error('操作已取消');
        const tracker = operation === undefined ? undefined : new PnpmProgressTracker();
        const commandArgs = tracker === undefined || args.some(arg => arg.startsWith('--reporter')) ? args : [...args, '--reporter=ndjson'];
        const result = await this.options.runner(this.options.profile, commandArgs, {
            signal: controller?.signal,
            onStdout: chunk => tracker?.push(chunk, operation),
            onStderr: chunk => tracker?.push(chunk, operation),
            ...extra,
        });
        if (result.exitCode !== 0 || result.timedOut)
            throw new Error(commandError(result));
    }
    async prefetch(target, operation) {
        // Resolve and download into an unwatched temporary project first. pnpm's
        // content-addressed store makes the real profile add reuse these files.
        // This prevents a large GitHub download from modifying the live profile
        // early and causing DSH Web to reload before the operation can finish.
        const directory = mkdtempSync(join(tmpdir(), 'dsh-skin-market-download-'));
        writeFileSync(join(directory, 'package.json'), '{"private":true}\n', 'utf8');
        writeFileSync(join(directory, '.npmrc'), PNPM_FETCH_CONFIG, 'utf8');
        try {
            await this.run(['add', target, '--dir', directory, '--ignore-scripts'], operation);
        }
        finally {
            rmSync(directory, { recursive: true, force: true });
        }
    }
    async install(operation) {
        const skin = this.skin(operation.skinId);
        if (readDependencies(this.options.profileDir)[skin.package] !== undefined) {
            const validation = validateInstalledSkin(this.options.profileDir, skin);
            if (!validation.ok)
                throw new Error(validation.reason);
            const state = readMarketState(this.options.profileDir);
            ensureSkinRegistration(this.options.profileDir, skin, !enabledSkinIds(state).has(skin.id));
            this.reconcileDisabledSkinIds(state);
            writeMarketState(this.options.profileDir, state);
            operation.message = 'skin was already installed; market state reconciled';
            return;
        }
        const snapshot = snapshotManifest(this.options.profileDir);
        const patchSnapshot = snapshotFile(profilePatchFile(this.options.profileDir));
        const workspaceSnapshot = snapshotFile(pnpmWorkspaceFile(this.options.profileDir));
        const lockfileSnapshot = snapshotFile(pnpmLockfile(this.options.profileDir));
        const restoreInstallFiles = () => {
            restoreManifest(this.options.profileDir, snapshot);
            restoreFile(profilePatchFile(this.options.profileDir), patchSnapshot);
            restoreFile(pnpmWorkspaceFile(this.options.profileDir), workspaceSnapshot);
            restoreFile(pnpmLockfile(this.options.profileDir), lockfileSnapshot);
        };
        this.update(operation, 'resolving');
        try {
            this.update(operation, 'downloading');
            await this.prefetch(skin.install.target, operation);
            this.update(operation, 'installing');
            if (skin.install.allowBuild !== undefined)
                ensureBuildAllowed(this.options.profileDir, skin.install.allowBuild);
            // Desktop hosts require profile-mutating adds to cross the recoverable
            // install boundary; attach the recovery record so the desktop runner can
            // route through runPluginInstall.
            await this.run(['add', skin.install.target, '--prefer-offline'], operation, {
                installRecovery: { packageName: skin.package, packageVersion: skin.install.version, receiptId: randomUUID() },
            });
            this.update(operation, 'validating');
            const validation = validateInstalledSkin(this.options.profileDir, skin);
            if (!validation.ok)
                throw new Error(validation.reason);
            ensureSkinRegistration(this.options.profileDir, skin);
            const state = readMarketState(this.options.profileDir);
            state.activeSkinId = state.activeSkinId === skin.id ? null : state.activeSkinId;
            if (!state.disabledSkinIds.includes(skin.id))
                state.disabledSkinIds.push(skin.id);
            recordActivity(state, skin.id, 'installedAt', operation.startedAt);
            writeMarketState(this.options.profileDir, state);
            operation.message = 'installed; choose Use to activate';
        }
        catch (error) {
            restoreInstallFiles();
            if (this.abortControllers.get(operation.id)?.signal.aborted !== true) {
                try {
                    await this.run(['install']);
                }
                catch { /* retain the original failure */ }
            }
            // The repair install may rewrite pnpm-lock.yaml while it restores node_modules.
            // Keep the profile metadata byte-for-byte identical to its pre-operation state.
            restoreInstallFiles();
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
        const enabled = enabledSkinIds(next);
        try {
            for (const item of this.catalog) {
                if (!enabled.has(item.id))
                    await this.setEntryDisabled(item, true);
            }
            for (const item of this.catalog) {
                if (enabled.has(item.id) && readDependencies(this.options.profileDir)[item.package] !== undefined) {
                    ensureSkinRegistration(this.options.profileDir, item, false);
                }
            }
            writeMarketState(this.options.profileDir, next);
            const active = await this.setEntryDisabled(skin, false);
            operation.message = active.found && active.live ? 'skin is active' : 'activation saved; restart DSH to load this skin';
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
        const state = readMarketState(this.options.profileDir);
        ensureSkinRegistration(this.options.profileDir, skin, true);
        await this.setEntryDisabled(skin, true);
        if (state.activeSkinId === skin.id)
            state.activeSkinId = null;
        state.pinnedSkinIds = pinnedSkinIds(state).filter(id => id !== skin.id);
        this.reconcileDisabledSkinIds(state);
        writeMarketState(this.options.profileDir, state);
        operation.message = enabledSkinIds(state).size === 0 ? 'DSH default appearance restored; package kept installed' : 'skin disabled; other enabled skins were kept active';
    }
    async pin(operation) {
        const skin = this.skin(operation.skinId);
        const previous = readMarketState(this.options.profileDir);
        if (readDependencies(this.options.profileDir)[skin.package] === undefined)
            throw new Error('install the skin before pinning it');
        this.update(operation, 'activating');
        const next = { ...previous, pinnedSkinIds: [...new Set([...pinnedSkinIds(previous), skin.id])] };
        this.reconcileDisabledSkinIds(next);
        try {
            ensureSkinRegistration(this.options.profileDir, skin, false);
            writeMarketState(this.options.profileDir, next);
            const active = await this.setEntryDisabled(skin, false);
            operation.message = active.found && active.live ? 'skin is pinned and active' : 'pin saved; restart DSH to load this skin';
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
        try {
            if (next.activeSkinId !== skin.id) {
                ensureSkinRegistration(this.options.profileDir, skin, true);
                await this.setEntryDisabled(skin, true);
            }
            writeMarketState(this.options.profileDir, next);
            operation.message = next.activeSkinId === skin.id ? 'skin is no longer pinned and remains the current skin' : 'skin is no longer pinned and was disabled';
        }
        catch (error) {
            writeMarketState(this.options.profileDir, previous);
            await this.replay();
            throw error;
        }
    }
    async updateSkin(operation) {
        const skin = this.skin(operation.skinId);
        const previousState = readMarketState(this.options.profileDir);
        const wasActive = enabledSkinIds(previousState).has(skin.id);
        const snapshot = snapshotManifest(this.options.profileDir);
        const patchSnapshot = snapshotFile(profilePatchFile(this.options.profileDir));
        const workspaceSnapshot = snapshotFile(pnpmWorkspaceFile(this.options.profileDir));
        const lockfileSnapshot = snapshotFile(pnpmLockfile(this.options.profileDir));
        const restoreInstallFiles = () => {
            restoreManifest(this.options.profileDir, snapshot);
            restoreFile(profilePatchFile(this.options.profileDir), patchSnapshot);
            restoreFile(pnpmWorkspaceFile(this.options.profileDir), workspaceSnapshot);
            restoreFile(pnpmLockfile(this.options.profileDir), lockfileSnapshot);
        };
        this.update(operation, 'resolving');
        try {
            this.update(operation, 'downloading');
            await this.prefetch(skin.install.target, operation);
            this.update(operation, 'installing');
            if (skin.install.allowBuild !== undefined)
                ensureBuildAllowed(this.options.profileDir, skin.install.allowBuild);
            // Desktop hosts require profile-mutating adds to cross the recoverable
            // install boundary; attach the recovery record so the desktop runner can
            // route through runPluginInstall.
            await this.run(['add', skin.install.target, '--prefer-offline'], operation, {
                installRecovery: { packageName: skin.package, packageVersion: skin.install.version, receiptId: randomUUID() },
            });
            this.update(operation, 'validating');
            const validation = validateInstalledSkin(this.options.profileDir, skin);
            if (!validation.ok || validation.version !== skin.install.version)
                throw new Error(validation.reason ?? 'installed version did not change to the reviewed version');
            ensureSkinRegistration(this.options.profileDir, skin, !wasActive);
            await this.setEntryDisabled(skin, !wasActive);
            const nextState = readMarketState(this.options.profileDir);
            recordActivity(nextState, skin.id, 'updatedAt', operation.startedAt);
            writeMarketState(this.options.profileDir, nextState);
            operation.message = wasActive ? 'updated and kept active' : 'updated and kept inactive';
        }
        catch (error) {
            restoreInstallFiles();
            if (this.abortControllers.get(operation.id)?.signal.aborted !== true) {
                try {
                    await this.run(['install']);
                }
                catch { /* retain original failure */ }
            }
            // The repair install may rewrite pnpm-lock.yaml while it restores node_modules.
            // Keep the profile metadata byte-for-byte identical to its pre-operation state.
            restoreInstallFiles();
            throw error;
        }
    }
    async uninstall(operation) {
        const skin = this.skin(operation.skinId);
        if (readDependencies(this.options.profileDir)[skin.package] === undefined)
            throw new Error('skin is not installed');
        const state = readMarketState(this.options.profileDir);
        if (enabledSkinIds(state).has(skin.id))
            await this.deactivate(operation);
        this.update(operation, 'downloading');
        await this.run(['remove', skin.package]);
        removeSkinRegistration(this.options.profileDir, skin);
        const next = readMarketState(this.options.profileDir);
        next.disabledSkinIds = next.disabledSkinIds.filter(id => id !== skin.id);
        next.pinnedSkinIds = pinnedSkinIds(next).filter(id => id !== skin.id);
        if (next.activeSkinId === skin.id)
            next.activeSkinId = null;
        if (next.activity !== undefined)
            delete next.activity[skin.id];
        writeMarketState(this.options.profileDir, next);
        operation.message = 'skin uninstalled';
    }
}
