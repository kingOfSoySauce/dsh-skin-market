import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PnpmCommandError, failureDiagnostic, runPnpmWithRecovery } from './pnpm-recovery.js';
import { pluginArgsFor } from './pnpm-compat.js';
import { logEvent } from './log.js';
import { officialFailureDiagnostic, officialOperationFailure, ManualInstallRequired } from './official-failure.js';
import { allowReleaseAgeVersion, isReleaseAgeExcluded, parseReleaseAgeTarget, readMinimumReleaseAgeMs, repairReleaseAgeExcludes } from './release-age.js';
import { compareInstalledArtifact, manifestFile, packageManifest, pnpmLockfile, readDependencies, readProfileBundles, resolveProfileDir, restoreFile, snapshotFile, snapshotInstalledArtifact, validateNpmArtifact } from './profile.js';
import { compareVersions, parseVersion } from './semver.js';
import { marketFetch, marketNetworkMode } from './market-fetch.js';
import { normalizeRegistryBase } from './registry-plan.js';
import { writeOperationMessage } from './operation-message.js';
export const MARKET_NPM_PACKAGE = 'dsh-skin-market';
export const MARKET_NPM_REGISTRY = 'https://registry.npmjs.org';
export const MARKET_NPM_METADATA_URL = `${MARKET_NPM_REGISTRY}/${MARKET_NPM_PACKAGE}`;
const PNPM_FETCH_TIMEOUT_MS = 10 * 60 * 1000;
const RECOVERY_TIMEOUT_MS = 60_000;
class MarketMetadataError extends Error {
    kind;
    attempts;
    constructor(message, kind, attempts) {
        super(message);
        this.kind = kind;
        this.attempts = attempts;
        this.name = 'MarketMetadataError';
    }
}
function sameRelease(left, right) {
    return ['registry', 'version', 'gitHead', 'tarball', 'integrity'].every(key => left[key] === right[key]);
}
function causeSummary(error) {
    if (error instanceof Error) {
        const cause = error.cause;
        const code = cause !== null && typeof cause === 'object' && typeof cause.code === 'string'
            ? cause.code : undefined;
        return [error.name, code, error.message].filter(Boolean).join(': ');
    }
    return String(error);
}
function hostOf(registry) {
    try {
        return new URL(registry).host;
    }
    catch {
        return registry;
    }
}
function failureMessageKey(kind) {
    if (kind === 'network')
        return 'failure.networkProblem';
    if (kind === 'fetch-timeout')
        return 'failure.timeoutProblem';
    if (kind === 'fetch-404')
        return 'failure.fetch404Problem';
    if (kind === 'no-matching-version')
        return 'failure.versionProblem';
    if (kind === 'integrity')
        return 'failure.integrityProblem';
    if (kind === 'release-age')
        return 'failure.releaseAgeProblem';
    if (kind === 'build-approval')
        return 'failure.buildProblem';
    return 'failure.commandProblem';
}
class MarketProgressTracker {
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
function readPackageVersion() {
    const packageFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    const value = JSON.parse(readFileSync(packageFile, 'utf8'));
    if (typeof value.version !== 'string')
        throw new Error('皮肤市场 package.json 缺少版本号');
    return value.version;
}
// A package manager may replace this package on disk while this module is
// still serving requests. Capture once so a route remount cannot claim the
// replacement is the code currently running in the Host.
const LOADED_MARKET_VERSION = readPackageVersion();
export function packageVersion() { return LOADED_MARKET_VERSION; }
export { compareVersions } from './semver.js';
function metadataFailureKind(error) {
    const summary = causeSummary(error).toLowerCase();
    return /timeout|timed out|abort|etimedout|und_err_connect_timeout/.test(summary) ? 'fetch-timeout' : 'network';
}
function retryableStatus(status) {
    return status === 408 || status === 425 || status === 429 || status >= 500;
}
function verifiedPublishedAt(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/u.test(value))
        return undefined;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 19) === value.slice(0, 19) ? value : undefined;
}
function releaseFromPackument(value, registry) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new Error('npm 未返回对象格式的市场 metadata');
    const packument = value;
    const tags = packument['dist-tags'];
    const latestVersion = tags !== null && typeof tags === 'object' && !Array.isArray(tags)
        ? tags.latest : undefined;
    if (typeof latestVersion !== 'string' || parseVersion(latestVersion) === null)
        return 'no-matching-version';
    const versions = packument.versions;
    if (versions === null || typeof versions !== 'object' || Array.isArray(versions))
        throw new Error('npm 未返回有效的市场版本列表');
    const releaseValue = versions[latestVersion];
    if (releaseValue === null || typeof releaseValue !== 'object' || Array.isArray(releaseValue))
        return 'no-matching-version';
    const releaseRecord = releaseValue;
    const gitHead = releaseRecord.gitHead;
    const dist = releaseRecord.dist;
    const tarball = dist !== null && typeof dist === 'object' && !Array.isArray(dist) ? dist.tarball : undefined;
    const integrity = dist !== null && typeof dist === 'object' && !Array.isArray(dist) ? dist.integrity : undefined;
    const time = packument.time;
    const publishedAt = time !== null && typeof time === 'object' && !Array.isArray(time)
        ? time[latestVersion] : undefined;
    if (releaseRecord.name !== undefined && releaseRecord.name !== MARKET_NPM_PACKAGE)
        throw new Error('npm 市场构件包名不一致');
    if (releaseRecord.version !== latestVersion)
        throw new Error('npm 市场构件版本不一致');
    if (typeof gitHead !== 'string' || !/^[0-9a-f]{40}$/i.test(gitHead))
        throw new Error('npm 市场构件缺少可验证的 gitHead');
    if (typeof tarball !== 'string')
        throw new Error('npm 市场构件缺少 tarball');
    const tarballUrl = new URL(tarball);
    const registryUrl = new URL(registry);
    if (tarballUrl.protocol !== registryUrl.protocol || tarballUrl.host !== registryUrl.host) {
        throw new Error(`npm 市场构件 tarball host 与 registry 不一致（${hostOf(registry)}）`);
    }
    if (integrity !== undefined && (typeof integrity !== 'string' || !/^[A-Za-z0-9_-]+-[A-Za-z0-9+/=_-]+$/u.test(integrity))) {
        throw new Error('npm 市场构件完整性 metadata 不合法');
    }
    return {
        registry,
        version: latestVersion,
        gitHead: gitHead.toLowerCase(),
        tarball,
        ...(typeof integrity === 'string' ? { integrity } : {}),
        ...(typeof publishedAt === 'string' && verifiedPublishedAt(publishedAt) !== undefined ? { publishedAt } : {}),
    };
}
async function fetchMarketRelease(registries, fetcher) {
    const attempts = [];
    let lastKind = 'network';
    for (const registry of registries) {
        const url = `${registry}/${MARKET_NPM_PACKAGE}`;
        let response;
        try {
            response = await fetcher(url, {
                headers: { accept: 'application/json', 'user-agent': `dsh-skin-market/${packageVersion()}` },
                signal: AbortSignal.timeout(10_000),
            });
        }
        catch (error) {
            lastKind = metadataFailureKind(error);
            attempts.push({ registry: hostOf(registry), outcome: lastKind, cause: causeSummary(error) });
            continue;
        }
        if (response.status === 404) {
            lastKind = 'fetch-404';
            attempts.push({ registry: hostOf(registry), outcome: 'http-404' });
            continue;
        }
        if (!response.ok) {
            lastKind = retryableStatus(response.status) ? 'network' : 'command';
            attempts.push({ registry: hostOf(registry), outcome: `http-${String(response.status)}` });
            if (retryableStatus(response.status))
                continue;
            throw new MarketMetadataError(`npm 版本检查失败（${hostOf(registry)} HTTP ${String(response.status)}）`, lastKind, attempts);
        }
        let value;
        try {
            value = await response.json();
        }
        catch (error) {
            attempts.push({ registry: hostOf(registry), outcome: 'invalid-json', cause: causeSummary(error) });
            throw new MarketMetadataError(`npm ${hostOf(registry)} 返回的市场 metadata 无法解析`, 'command', attempts);
        }
        let release;
        try {
            release = releaseFromPackument(value, registry);
        }
        catch (error) {
            attempts.push({ registry: hostOf(registry), outcome: 'invalid-metadata', cause: causeSummary(error) });
            throw new MarketMetadataError(error instanceof Error ? error.message : String(error), 'command', attempts);
        }
        if (release === 'no-matching-version') {
            lastKind = 'no-matching-version';
            attempts.push({ registry: hostOf(registry), outcome: 'no-matching-version' });
            continue;
        }
        attempts.push({ registry: hostOf(registry), outcome: 'ok' });
        return { release, attempts };
    }
    const detail = attempts.map(attempt => `${attempt.registry}=${attempt.outcome}`).join(', ');
    throw new MarketMetadataError(`所有配置的 npm 安装源均未返回可验证的市场版本（${detail}）`, lastKind, attempts);
}
export function createMarketUpdater(profile, runner, options = {}) {
    const fetchLatest = options.fetch ?? marketFetch;
    const loadedVersion = options.currentVersion ?? packageVersion();
    let installedVersion = loadedVersion;
    const cacheMs = options.cacheMs ?? 5 * 60 * 1000;
    let cached = null;
    let latestRelease = null;
    let updating = false;
    let restartRequired = false;
    let activeOperation = null;
    let disposed = false;
    let cachedRegistryKey = null;
    let lastRegistryAttempts = [];
    const checkedReleases = new WeakMap();
    const operations = new Map();
    const abortControllers = new Map();
    const updatePromises = new Map();
    const releaseAgeApprovals = new Map();
    const pendingApprovals = new Map();
    const profileDir = options.profileDir ?? resolveProfileDir(profile);
    const cancellationAvailable = () => runner.management === undefined || runner.management.capabilities().cancel.available;
    const resolveRegistryPlan = async () => {
        let supplied;
        try {
            supplied = options.registryPlan === undefined
                ? await runner.registryPlan?.()
                : await options.registryPlan();
        }
        catch {
            supplied = undefined;
        }
        const normalized = (supplied ?? [])
            .map(normalizeRegistryBase)
            .filter((item) => item !== null);
        return normalized.length === 0 ? [MARKET_NPM_REGISTRY] : [...new Set(normalized)];
    };
    const releaseAgeHold = (release) => {
        if (runner.hostKind !== 'desktop' || isReleaseAgeExcluded(profileDir, MARKET_NPM_PACKAGE, release.version))
            return null;
        const windowMs = readMinimumReleaseAgeMs(profileDir);
        if (windowMs === null)
            return null;
        const published = release.publishedAt === undefined ? Number.NaN : Date.parse(release.publishedAt);
        if (!Number.isFinite(published))
            return { reason: `无法验证 ${release.version} 的发布时间，暂不提供更新按钮。` };
        const until = published + windowMs;
        return until > Date.now() ? {
            until: new Date(until).toISOString(),
            reason: `新版本 ${release.version} 仍在 Desktop 的供应链安全观察期内，预计 ${new Date(until).toLocaleString('zh-CN')} 后可更新。`,
        } : null;
    };
    const releaseStatus = (release) => {
        const upgrade = compareVersions(release.version, installedVersion) > 0;
        const held = upgrade ? releaseAgeHold(release) : null;
        const next = {
            currentVersion: installedVersion, loadedVersion, latestVersion: release.version,
            updateAvailable: upgrade && held === null,
            ...(held === null ? {} : {
                ...(held.until === undefined ? {} : { updateAvailableAt: held.until }),
                updateBlockedReason: held.reason,
                updateBlockedReasonKey: 'failure.releaseAgeWait',
            }),
        };
        checkedReleases.set(next, release);
        return next;
    };
    const reconcileInstalledVersion = () => {
        // Do not inspect a package while its own transaction may be swapping it.
        // The transaction's stricter release validation remains authoritative.
        if (updating)
            return;
        // Read only the public dependency manifest; verify the installed npm artifact.
        const dependency = readDependencies(profileDir)[MARKET_NPM_PACKAGE];
        if (typeof dependency !== 'string' || dependency.trim() === '')
            return;
        const version = packageManifest(profileDir, MARKET_NPM_PACKAGE)?.version;
        if (typeof version !== 'string' || parseVersion(version) === null)
            return;
        const source = latestRelease?.version === version
            ? { name: MARKET_NPM_PACKAGE, ...latestRelease }
            : { name: MARKET_NPM_PACKAGE, version };
        if (!validateNpmArtifact(profileDir, source).ok)
            return;
        installedVersion = version;
        restartRequired = installedVersion !== loadedVersion;
        if (cached !== null)
            cached.status = releaseStatus(cached.release);
    };
    const setOperation = (operation, patch) => {
        Object.assign(operation, patch);
        if ('message' in patch)
            writeOperationMessage(operation, patch.message, patch.messageKey, patch.messageParams);
        else if ('messageKey' in patch)
            writeOperationMessage(operation, operation.message, patch.messageKey, patch.messageParams);
        operation.cancelable = patch.cancelable !== false && cancellationAvailable() && !['done', 'failed', 'cancelled', 'cancelling', 'waiting'].includes(operation.phase);
        if (operation.phase === 'done' || operation.phase === 'failed' || operation.phase === 'cancelled') {
            operation.finishedAt = new Date().toISOString();
            if (activeOperation === operation.id)
                activeOperation = null;
        }
    };
    const updateTarget = async (operation, controller) => {
        let baseline;
        let metadata;
        let mutationStarted = false;
        let lastResult;
        let targetRelease;
        let fallbackRelease = cached !== null
            && Date.now() - cached.checkedAt <= cacheMs
            && compareVersions(cached.release.version, installedVersion) > 0
            ? cached.release : undefined;
        let managedArtifactMismatch = false;
        const approval = pendingApprovals.get(operation.id);
        const managerOwned = runner.management !== undefined;
        const recover = async () => {
            if (!mutationStarted || baseline === undefined)
                return undefined;
            if (managerOwned) {
                if (compareInstalledArtifact(profileDir, baseline).ok)
                    return undefined;
                managedArtifactMismatch = true;
                return '官方 Desktop 的实际市场构件或锁文件解析与更新前状态不一致，不能确认取消或失败已恢复；请在应用插件管理器核验';
            }
            if (metadata === undefined)
                return undefined;
            const restore = () => {
                restoreFile(manifestFile(profileDir), metadata.manifest);
                restoreFile(pnpmLockfile(profileDir), metadata.lockfile);
            };
            try {
                restore();
                if (compareInstalledArtifact(profileDir, baseline).ok)
                    return undefined;
                setOperation(operation, { phase: 'installing', cancelable: false, message: '正在恢复更新前的皮肤市场', messageKey: 'common.marketOperationRestoring' });
                const recovery = await runner(profile, pluginArgsFor(profileDir, ['install', '--prefer-offline', '--reporter=ndjson']), {
                    timeoutMs: RECOVERY_TIMEOUT_MS,
                    signal: AbortSignal.timeout(RECOVERY_TIMEOUT_MS),
                });
                restore();
                if (recovery.exitCode !== 0 || recovery.timedOut || recovery.aborted || !compareInstalledArtifact(profileDir, baseline).ok) {
                    return '原有配置已恢复，但更新前的皮肤市场构件未能验证恢复；请完全退出 DSH 后修复依赖';
                }
                return undefined;
            }
            catch {
                try {
                    restore();
                }
                catch { /* report the uncertain recovery without replacing its cause */ }
                return '更新前的配置或皮肤市场构件未能验证恢复；请完全退出 DSH 后修复依赖';
            }
        };
        try {
            setOperation(operation, { phase: 'checking', message: '正在检查皮肤市场版本', messageKey: 'common.marketOperationChecking' });
            const before = await status(true);
            operation.status = before;
            if (approval !== undefined && (!sameRelease(approval.release, checkedReleases.get(before) ?? { registry: '', version: '', gitHead: '', tarball: '' }))) {
                throw new Error('待批准的更新版本已变化，请重新更新并核对提示。');
            }
            if (!before.updateAvailable) {
                if (before.updateBlockedReason !== undefined) {
                    operation.failure = { kind: 'release-age', message: before.updateBlockedReason, messageKey: before.updateBlockedReasonKey ?? 'failure.releaseAgeWait', messageParams: before.updateBlockedReasonParams };
                    setOperation(operation, { phase: 'failed', message: before.updateBlockedReason, messageKey: before.updateBlockedReasonKey ?? 'failure.releaseAgeWait', messageParams: before.updateBlockedReasonParams, status: before });
                }
                else {
                    setOperation(operation, { phase: 'done', message: '已经是最新版本', messageKey: 'common.marketAlreadyLatest', status: before });
                }
                return;
            }
            const checkedRelease = checkedReleases.get(before);
            const currentRelease = latestRelease;
            if (checkedRelease === undefined || checkedRelease.version !== before.latestVersion || currentRelease === null
                || !sameRelease(currentRelease, checkedRelease)) {
                const message = '版本检查结果已变化，请重新检查后再更新。';
                operation.failure = { kind: 'command', message, messageKey: 'common.marketCheckChanged' };
                setOperation(operation, { phase: 'failed', message, messageKey: 'common.marketCheckChanged', status: before });
                return;
            }
            // Freeze the checked source and integrity across concurrent metadata requests.
            targetRelease = Object.freeze({ ...checkedRelease });
            fallbackRelease = targetRelease;
            const assertApprovalCurrent = () => {
                if (approval === undefined)
                    return;
                const failed = operations.get(approval.failedId);
                const target = failed?.failure?.releaseAgeTarget;
                if (failed?.phase !== 'failed' || failed.failure !== approval.failure || failed.failure.action !== 'approve-release-age'
                    || target?.packageName !== approval.target.packageName || target.version !== approval.target.version
                    || latestRelease === null || targetRelease === undefined || !sameRelease(approval.release, targetRelease) || !sameRelease(latestRelease, targetRelease)) {
                    throw new Error('待批准的更新或精确版本已变化，请重新更新并核对提示。');
                }
                if (controller.signal.aborted)
                    throw new Error('更新已取消');
            };
            assertApprovalCurrent();
            baseline = snapshotInstalledArtifact(profileDir, MARKET_NPM_PACKAGE);
            if (!baseline.ok && !managerOwned)
                throw new Error('更新前的皮肤市场构件无法验证，请先修复安装后再更新');
            if (!managerOwned)
                metadata = { manifest: snapshotFile(manifestFile(profileDir)), lockfile: snapshotFile(pnpmLockfile(profileDir)) };
            const tracker = new MarketProgressTracker();
            const report = (chunk) => {
                if (operation.phase !== 'downloading' && operation.phase !== 'installing')
                    return;
                tracker.push(chunk, operation);
                if (chunk.trim() !== '')
                    setOperation(operation, {
                        message: operation.phase === 'downloading' ? '正在下载皮肤市场更新包' : '正在写入皮肤市场更新',
                        messageKey: operation.phase === 'downloading' ? 'common.marketOperationDownloading' : 'common.marketOperationInstalling',
                    });
            };
            const run = async (args) => {
                await runner.ensurePnpm?.({ signal: controller.signal });
                const effectiveArgs = pluginArgsFor(profileDir, args);
                if (managerOwned) {
                    if (controller.signal.aborted)
                        throw new Error('更新已取消');
                    assertApprovalCurrent();
                    repairReleaseAgeExcludes(profileDir);
                    if (approval !== undefined) {
                        allowReleaseAgeVersion(profileDir, approval.target);
                        releaseAgeApprovals.delete(approval.failedId);
                        logEvent('info', 'market-update-release-age-approved', `${approval.target.packageName}@${approval.target.version}`, operation.id);
                    }
                    assertApprovalCurrent();
                    lastResult = await runner(profile, args, { signal: controller.signal, onStdout: report, onStderr: report });
                    // A failed pnpm policy check can leave the new package materialized
                    // while Desktop restores the old manifest. Repairing the rule named
                    // by that settled refusal allows the same exact install to converge.
                    if (!controller.signal.aborted && !lastResult.aborted && !lastResult.timedOut
                        && lastResult.management?.application === 'failed') {
                        const repaired = repairReleaseAgeExcludes(profileDir);
                        const failure = officialOperationFailure(lastResult);
                        const blocked = failure?.releaseAgeTarget;
                        const exactBlocked = blocked === undefined ? undefined : parseReleaseAgeTarget(blocked.packageName, blocked.version);
                        const knownAgeRepair = failure?.kind === 'release-age' && exactBlocked !== undefined && repaired.includes(exactBlocked.packageName);
                        const restored = baseline !== undefined && compareInstalledArtifact(profileDir, baseline).ok;
                        if (repaired.length > 0 && (restored || knownAgeRepair)) {
                            assertApprovalCurrent();
                            logEvent('info', 'market-update-release-age-repair', '已合并重复的精确版本规则，正在重试市场更新', operation.id);
                            lastResult = await runner(profile, args, { signal: controller.signal, onStdout: report, onStderr: report });
                        }
                    }
                    const managed = lastResult.management;
                    const manualSpec = targetRelease === undefined ? MARKET_NPM_PACKAGE : `${MARKET_NPM_PACKAGE}@${targetRelease.version}`;
                    // HMR Desktop refuses installBundle when the package name is already
                    // a dependency. The host's own page tells users to uninstall, then
                    // install the new version. Do that once, then put the market back
                    // in the saved bundle selection.
                    if (managed?.application === 'failed' && managed.error?.code === 'already-installed') {
                        const selected = readProfileBundles(profileDir).includes(MARKET_NPM_PACKAGE);
                        const restoreRemovedMarket = async () => {
                            if (baseline?.ok !== true || baseline.version === null)
                                return '更新前的市场版本无法验证，不能安全回滚';
                            if (compareInstalledArtifact(profileDir, baseline).ok)
                                return undefined;
                            const restoreSignal = AbortSignal.timeout(RECOVERY_TIMEOUT_MS);
                            setOperation(operation, { phase: 'installing', cancelable: false, message: '正在恢复更新前的皮肤市场', messageKey: 'common.marketOperationRestoring' });
                            const restored = await runner(profile, ['add', `${MARKET_NPM_PACKAGE}@${baseline.version}`, '--reporter=ndjson'], {
                                signal: restoreSignal, onStdout: report, onStderr: report,
                            });
                            if (restored.management?.indeterminate === true || restored.management?.application === 'failed'
                                || restored.management?.application === 'cancelled' || restored.exitCode !== 0 && restored.exitCode !== null) {
                                return '旧版市场恢复安装失败';
                            }
                            if (selected && runner.management !== undefined) {
                                const enabled = await runner.management.setBundleEnabled(MARKET_NPM_PACKAGE, true, { signal: restoreSignal });
                                if (enabled.management?.indeterminate === true || enabled.management?.application === 'failed'
                                    || enabled.management?.application === 'cancelled' || enabled.exitCode !== 0 && enabled.exitCode !== null) {
                                    return '旧版市场已恢复，但未能恢复原来的启用状态';
                                }
                            }
                            return compareInstalledArtifact(profileDir, baseline).ok ? undefined : '旧版市场恢复后未通过构件校验';
                        };
                        logEvent('info', 'market-update-replace', '官方 Desktop 不允许覆盖已安装的市场包，改为卸载后安装新版', operation.id);
                        const removed = await runner(profile, ['remove', MARKET_NPM_PACKAGE], { signal: controller.signal });
                        if (removed.management?.application === 'failed' || removed.management?.application === 'cancelled' || removed.exitCode !== 0 && removed.exitCode !== null) {
                            lastResult = removed;
                            const reason = officialOperationFailure(removed)?.message ?? '官方 Desktop 未能卸载当前皮肤市场，无法安装新版';
                            if (removed.management?.indeterminate === true)
                                throw new ManualInstallRequired(manualSpec, `${reason}；卸载结果未确认，暂不继续修改 profile`);
                            const restoreError = await restoreRemovedMarket();
                            throw new ManualInstallRequired(manualSpec, restoreError === undefined ? `${reason}；已恢复更新前的皮肤市场` : `${reason}；${restoreError}`);
                        }
                        lastResult = await runner(profile, args, { signal: controller.signal, onStdout: report, onStderr: report });
                        if (lastResult.management?.application === 'failed' || lastResult.management?.application === 'cancelled'
                            || lastResult.management?.indeterminate === true || lastResult.exitCode !== 0 && lastResult.exitCode !== null) {
                            const reason = officialOperationFailure(lastResult)?.message ?? '官方 Desktop 未能安装新版皮肤市场';
                            if (lastResult.management?.indeterminate === true)
                                throw new ManualInstallRequired(manualSpec, `${reason}；安装结果未确认，暂不继续修改 profile`);
                            const restoreError = await restoreRemovedMarket();
                            throw new ManualInstallRequired(manualSpec, restoreError === undefined
                                ? `${reason}；已恢复更新前的皮肤市场，请等待新版本通过安全观察期后再更新`
                                : `${reason}；${restoreError}`);
                        }
                        if (selected && lastResult.exitCode === 0 && runner.management !== undefined) {
                            const restored = await runner.management.setBundleEnabled(MARKET_NPM_PACKAGE, true, { signal: controller.signal });
                            if (restored.management?.application === 'failed' || restored.exitCode !== 0 && restored.exitCode !== null) {
                                lastResult = restored;
                                throw new ManualInstallRequired(manualSpec, '新版已安装，但未能恢复皮肤市场的启用选择');
                            }
                        }
                    }
                    const settled = lastResult.management;
                    if (settled?.indeterminate === true || settled?.application === 'failed' || settled?.application === 'cancelled') {
                        throw new Error(officialOperationFailure(lastResult)?.message ?? '官方 Desktop 未完成市场更新');
                    }
                    if (settled?.application === 'applied' || settled?.application === 'restart-required' || settled?.application === 'overridden')
                        return;
                    throw new Error('官方 Desktop 未返回可确认的市场更新结果');
                }
                try {
                    await runPnpmWithRecovery(effectiveArgs, {
                        profileDir,
                        attempt: async (attemptArgs, attemptOptions) => {
                            lastResult = await runner(profile, attemptArgs, {
                                signal: controller.signal,
                                // Keep self-update on the same 10 minute network budget as ordinary
                                // skin installs without writing persistent profile configuration.
                                env: { pnpm_config_fetch_timeout: String(PNPM_FETCH_TIMEOUT_MS), ...attemptOptions?.env },
                                onStdout: report,
                                onStderr: report,
                            });
                            return lastResult;
                        },
                        onRetry: failure => {
                            const next = recoveryMessage(failure);
                            setOperation(operation, { message: next.message, messageKey: next.key });
                        },
                    });
                }
                catch (error) {
                    if (error instanceof PnpmCommandError) {
                        logEvent('error', 'market-update-pnpm', `kind=${error.failure.kind}${error.failure.packageName === undefined ? '' : ` package=${error.failure.packageName}`} ${failureDiagnostic(error.result)}`, operation.id);
                    }
                    throw error;
                }
            };
            // Resolve this version online. `--prefer-offline` would reuse a stale
            // packument that still lacks the latest we just read from npm.
            setOperation(operation, { phase: 'downloading', message: '正在下载皮肤市场更新包', messageKey: 'common.marketOperationDownloading' });
            mutationStarted = true;
            await run(['add', `${MARKET_NPM_PACKAGE}@${targetRelease.version}`, '--reporter=ndjson']);
            const materialized = validateNpmArtifact(profileDir, { name: MARKET_NPM_PACKAGE, ...targetRelease });
            if (!materialized.ok || materialized.version === undefined) {
                throw new Error(`市场更新未通过构件校验，不能确认更新成功：${materialized.reason ?? '未物化预期版本或可加载入口'}`);
            }
            // A managed transaction that completed remains authoritative even when
            // cancellation arrived too late. Web cancellation still restores its
            // frozen pre-operation state before returning a cancelled result.
            if (controller.signal.aborted && !managerOwned)
                throw new Error('更新已取消');
            installedVersion = materialized.version;
            restartRequired = true;
            const next = releaseStatus(targetRelease);
            cached = { checkedAt: Date.now(), status: next, release: targetRelease };
            setOperation(operation, {
                phase: 'done',
                ...(lastResult?.management?.application === undefined ? {} : { application: lastResult.management.application }),
                restartRequired: true,
                integrityVerified: materialized.integrityVerified,
                messageKey: 'common.marketUpdatedRestart',
                message: lastResult?.management?.application === 'overridden'
                    ? '更新包版本已验证，但启用状态被其他配置覆盖；请在设置 → 插件核验，重启后仍可能未启用'
                    : '更新完成，重启 DSH 后生效',
                status: next,
            });
        }
        catch (error) {
            if (lastResult?.management?.application !== undefined)
                operation.application = lastResult.management.application;
            if (managerOwned && lastResult?.management?.indeterminate === true) {
                setOperation(operation, { phase: 'waiting', application: 'unknown', message: '官方 Desktop 的市场更新结果尚未确认；请等待或重新启动应用后核验，期间不会再修改插件', messageKey: 'common.marketOperationWaiting' });
                return;
            }
            const recoveryError = await recover();
            const cancelled = managerOwned ? lastResult?.management?.application === 'cancelled' : controller.signal.aborted;
            if (cancelled && recoveryError === undefined)
                setOperation(operation, { phase: 'cancelled', message: '更新已取消', messageKey: 'common.marketOperationCancelled' });
            else {
                const officialFailure = managerOwned && lastResult?.management?.application === 'failed' ? officialOperationFailure(lastResult) : undefined;
                if (error instanceof ManualInstallRequired) {
                    operation.failure = {
                        ...(officialFailure ?? { kind: 'command', message: error.message }),
                        code: officialFailure?.code ?? 'already-installed',
                        message: error.message,
                        manualSpec: error.manualSpec,
                    };
                    logEvent('error', 'market-update-manual', error.message, operation.id);
                }
                else if (officialFailure !== undefined) {
                    const blocked = officialFailure.releaseAgeTarget;
                    const target = blocked === undefined ? undefined : parseReleaseAgeTarget(blocked.packageName, blocked.version);
                    operation.failure = officialFailure.kind === 'release-age' && target !== undefined && targetRelease !== undefined
                        && !controller.signal.aborted && !lastResult?.aborted && !lastResult?.timedOut
                        ? { ...officialFailure, releaseAgeTarget: target, action: 'approve-release-age' } : officialFailure;
                    logEvent('error', 'market-update-official', `kind=${officialFailure.kind} ${officialFailureDiagnostic(lastResult)}`, operation.id);
                }
                else if (error instanceof MarketMetadataError) {
                    operation.failure = {
                        kind: error.kind,
                        message: error.message,
                        messageKey: failureMessageKey(error.kind),
                        ...(error.kind === 'network' || error.kind === 'fetch-timeout' || error.kind === 'fetch-404' || error.kind === 'no-matching-version'
                            ? { action: 'retry' } : {}),
                    };
                    logEvent('error', 'market-update-registry', `network=${marketNetworkMode()} attempts=${error.attempts.map(attempt => `${attempt.registry}=${attempt.outcome}`).join(',')} cause=${error.attempts.at(-1)?.cause ?? 'none'}`, operation.id);
                }
                else if (error instanceof PnpmCommandError) {
                    const failure = error.failure;
                    const action = failure.kind === 'network' || failure.kind === 'fetch-timeout' ? 'retry' : undefined;
                    operation.failure = {
                        kind: failure.kind,
                        message: failure.message,
                        messageKey: failure.messageKey ?? failureMessageKey(failure.kind),
                        messageParams: failure.messageParams,
                        ...(failure.packageName === undefined ? {} : { packageName: failure.packageName }),
                        ...(action === undefined ? {} : { action }),
                    };
                }
                if (officialFailure === undefined && !(error instanceof PnpmCommandError))
                    logEvent('error', 'market-update', error instanceof Error ? error.message : String(error), operation.id);
                let recoveryMessage = recoveryError;
                if (recoveryError !== undefined) {
                    // A settled, exact age refusal can occur after materialization and
                    // partial rollback. Explicit approval may finish this same release;
                    // it never grants permission to continue an unknown transaction.
                    const canFinishKnownAge = managedArtifactMismatch && operation.failure?.kind === 'release-age'
                        && operation.failure.action === 'approve-release-age';
                    if (canFinishKnownAge) {
                        recoveryMessage = '安装文件已部分写入，可允许此精确版本后继续完成更新。';
                        operation.failure = { ...operation.failure, message: `${operation.failure.message}；${recoveryMessage}` };
                    }
                    else {
                        operation.failure = officialFailure === undefined
                            ? { kind: 'command', message: error instanceof ManualInstallRequired ? `${error.message}；${recoveryError}` : recoveryError, ...(operation.failure?.manualSpec === undefined ? {} : { manualSpec: operation.failure.manualSpec, code: 'already-installed' }) }
                            : { ...officialFailure, message: `${error instanceof ManualInstallRequired ? error.message : officialFailure.message}；${recoveryError}`, ...(operation.failure?.manualSpec === undefined ? {} : { manualSpec: operation.failure.manualSpec }) };
                        delete operation.failure.action;
                    }
                    logEvent('error', 'market-update-recovery', recoveryError, operation.id);
                }
                const verifiedFallback = fallbackRelease !== undefined && latestRelease === fallbackRelease
                    && compareVersions(fallbackRelease.version, installedVersion) > 0
                    ? `${MARKET_NPM_PACKAGE}@${fallbackRelease.version}` : undefined;
                if (verifiedFallback !== undefined && operation.failure !== undefined && operation.failure.fallbackSpec === undefined) {
                    operation.failure = { ...operation.failure, fallbackSpec: verifiedFallback };
                }
                const blocked = operation.failure?.releaseAgeTarget;
                const target = blocked === undefined ? undefined : parseReleaseAgeTarget(blocked.packageName, blocked.version);
                if (operation.failure?.action === 'approve-release-age' && target !== undefined && targetRelease !== undefined) {
                    releaseAgeApprovals.set(operation.id, { failedId: operation.id, failure: operation.failure, release: targetRelease, target: Object.freeze({ ...target }) });
                }
                const managedFailure = lastResult?.management?.application === 'failed' && controller.signal.aborted
                    ? '官方 Desktop 返回市场更新失败；取消请求没有替代管理器的最终结果，请查看插件管理器诊断'
                    : undefined;
                const cause = managedFailure ?? (error instanceof Error ? error.message : String(error));
                setOperation(operation, { phase: 'failed', message: recoveryMessage === undefined ? cause : managerOwned ? `${cause}；${recoveryMessage}` : recoveryMessage });
            }
        }
        finally {
            abortControllers.delete(operation.id);
            pendingApprovals.delete(operation.id);
            updating = operation.phase === 'waiting';
        }
    };
    const status = async (force = false) => {
        reconcileInstalledVersion();
        // Keep the legacy single-registry path synchronous until the first fetch;
        // this preserves the updater's concurrency contract for injected fetchers.
        // Official Desktop/provider-backed paths are asynchronous by design.
        const registryProvider = options.registryPlan ?? runner.registryPlan;
        const registries = registryProvider === undefined ? [MARKET_NPM_REGISTRY] : await resolveRegistryPlan();
        const registryKey = registries.join('\n');
        if (cached !== null && cachedRegistryKey !== null && cachedRegistryKey !== registryKey) {
            cached = null;
            latestRelease = null;
        }
        if (!force && cached !== null && Date.now() - cached.checkedAt < cacheMs) {
            cached.status = releaseStatus(cached.release);
            return cached.status;
        }
        let result;
        try {
            result = await fetchMarketRelease(registries, fetchLatest);
        }
        catch (error) {
            if (error instanceof MarketMetadataError)
                lastRegistryAttempts = [...error.attempts];
            throw error;
        }
        lastRegistryAttempts = result.attempts;
        const release = result.release;
        const next = releaseStatus(release);
        latestRelease = release;
        cachedRegistryKey = registryKey;
        cached = { checkedAt: Date.now(), status: next, release };
        return next;
    };
    const startUpdate = (approval) => {
        if (disposed)
            throw new Error('皮肤市场更新器已停止');
        if (activeOperation !== null)
            return operations.get(activeOperation);
        reconcileInstalledVersion();
        const operation = { id: randomUUID(), phase: 'queued', cancelable: cancellationAvailable(), startedAt: new Date().toISOString() };
        operations.set(operation.id, operation);
        activeOperation = operation.id;
        updating = true;
        const controller = new AbortController();
        abortControllers.set(operation.id, controller);
        if (approval !== undefined)
            pendingApprovals.set(operation.id, approval);
        const updatePromise = updateTarget(operation, controller);
        updatePromises.set(operation.id, updatePromise);
        void updatePromise.then(() => { updatePromises.delete(operation.id); }, () => { updatePromises.delete(operation.id); });
        const timer = setTimeout(() => {
            if (activeOperation !== operation.id) {
                operations.delete(operation.id);
                releaseAgeApprovals.delete(operation.id);
            }
        }, 30 * 60 * 1000);
        timer.unref?.();
        return operation;
    };
    return {
        status,
        get restartRequired() { reconcileInstalledVersion(); return restartRequired; },
        get restartNoticeId() { reconcileInstalledVersion(); return restartRequired ? `market-${loadedVersion}-${installedVersion}` : undefined; },
        async update() {
            if (updating)
                throw new Error('皮肤市场正在更新');
            const operation = startUpdate();
            while (operation.phase !== 'done' && operation.phase !== 'failed' && operation.phase !== 'cancelled' && operation.phase !== 'waiting') {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            if (operation.phase !== 'done' || operation.status === undefined)
                throw new Error(operation.message ?? '皮肤市场更新失败');
            return operation.status;
        },
        startUpdate: () => startUpdate(),
        operation(id) { return operations.get(id) ?? null; },
        currentOperation() { return activeOperation === null ? null : operations.get(activeOperation) ?? null; },
        cancel(id) {
            const operation = operations.get(id);
            if (operation === undefined)
                throw new Error('更新任务不存在');
            if (operation.cancelable !== true)
                return operation;
            if (!cancellationAvailable()) {
                operation.cancelable = false;
                return operation;
            }
            setOperation(operation, { phase: 'cancelling', message: '正在取消皮肤市场更新', messageKey: 'common.marketOperationCancelling' });
            abortControllers.get(id)?.abort();
            return operation;
        },
        retry(id, action = 'retry') {
            const failed = operations.get(id);
            if (failed === undefined || failed.phase !== 'failed' || failed.failure?.action !== action)
                throw new Error('更新任务不可重试');
            if (action === 'approve-release-age') {
                const approval = releaseAgeApprovals.get(id);
                if (approval === undefined || failed.failure !== approval.failure)
                    throw new Error('更新任务不可重试');
                if (activeOperation !== null)
                    throw new Error('皮肤市场正在更新');
                return startUpdate(approval);
            }
            return startUpdate();
        },
        async dispose() {
            disposed = true;
            for (const id of abortControllers.keys()) {
                const operation = operations.get(id);
                if (operation?.cancelable === true) {
                    setOperation(operation, { phase: 'cancelling', message: '正在停止皮肤市场更新', messageKey: 'common.marketOperationCancelling' });
                }
                abortControllers.get(id)?.abort();
            }
            await Promise.all([...updatePromises.values()]);
        },
    };
}
function recoveryMessage(failure) {
    if (failure.recovery === 'disable-peer-autoinstall')
        return { message: '检测到宿主提供但 npm 未发布的 peer，正在关闭 peer 自动安装并重试', key: 'common.recoveryPeerAutoinstall' };
    if (failure.kind === 'release-age')
        return { message: '检测到新包保护，正在临时放宽本次更新并重试', key: 'common.recoveryReleaseAge' };
    if (failure.kind === 'fetch-timeout')
        return { message: '下载超时，正在延长 pnpm 下载等待时间并重试', key: 'common.recoveryTimeout' };
    if (failure.kind === 'network')
        return { message: '检测到临时网络错误，正在自动重试', key: 'common.recoveryNetwork' };
    return { message: failure.message };
}
