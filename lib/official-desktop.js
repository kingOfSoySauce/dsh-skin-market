import { randomUUID } from 'node:crypto';
import { compareVersions } from './semver.js';
import { officialOperationFailure } from './official-failure.js';
import { normalizeRegistryBase, registryPlanFromSnapshot } from './registry-plan.js';
/**
 * Convert the official manager's registry snapshot into a safe ordered plan.
 * `registry: null` means "whatever pnpm resolves"; in that case `resolved`
 * becomes the first candidate. A resolved private override must not fall
 * through to public registries that could leak the package name.
 */
export function normalizeOfficialRegistryPlan(value) {
    return registryPlanFromSnapshot(value);
}
const CORE_VERSION = '0.1.6-alpha.2';
const RECOVERY_VERSION = '0.1.7-alpha.1';
const RESOLUTION_REFRESH_VERSION = '0.2.1-alpha.1';
const EXACT_VERSION = '0.2.1-alpha.2';
// Snapshots below this floor stay exact: those releases changed the call shape.
// This floor and every newer version reuse the audited 0.2.1-rc.1 contract while
// the methods are still present. A host error, not a missing tag, is the backstop.
const STABLE_CONTRACT_VERSION = '0.2.1-rc.1';
const AUDITED_VERSIONS = new Set([
    CORE_VERSION, '0.1.7-alpha.1', '0.1.7-alpha.2', '0.1.7-rc.1', '0.1.7-rc.2',
    '0.2.0-rc.1', '0.2.0-rc.2', '0.2.1-alpha.1', EXACT_VERSION, '0.2.1-alpha.3', STABLE_CONTRACT_VERSION,
]);
function recognizedHostVersion(version) {
    return version !== null && (AUDITED_VERSIONS.has(version) || compareVersions(version, STABLE_CONTRACT_VERSION) >= 0);
}
function asRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}
function unwrapResult(value) {
    const record = asRecord(value);
    return record?.ok === true && Object.hasOwn(record, 'value') ? record.value : value;
}
function readManagerResult(value) {
    if (asRecord(value)?.ok === false)
        throw new Error(resultText(value));
    return unwrapResult(value);
}
function resultText(value) {
    const record = asRecord(value);
    const error = record?.error;
    if (typeof error === 'string' && error.trim() !== '')
        return error;
    const errorRecord = asRecord(error);
    if (typeof errorRecord?.message === 'string' && errorRecord.message.trim() !== '')
        return errorRecord.message;
    const details = [errorRecord?.diagnostic, errorRecord?.code]
        .filter((part) => typeof part === 'string' && part.trim() !== '');
    if (details.length > 0)
        return details.join(': ');
    const packageResult = asRecord(record?.packageResult);
    if (typeof packageResult?.output === 'string' && packageResult.output.trim() !== '')
        return packageResult.output;
    if (typeof packageResult?.message === 'string' && packageResult.message.trim() !== '')
        return packageResult.message;
    try {
        return JSON.stringify(value) ?? String(value);
    }
    catch {
        return String(value);
    }
}
function managerResult(value, requestId, strict = false) {
    value = unwrapResult(value);
    const record = asRecord(value);
    const application = record?.application;
    if (strict && (record === undefined || application === undefined && record.ok !== false)) {
        return unknownResult(new Error('官方宿主未返回可确认的管理结果'), requestId);
    }
    const normalized = { ...record, ...(requestId === undefined ? {} : { requestId }) };
    delete normalized.indeterminate;
    if (typeof normalized.error === 'string')
        normalized.error = { message: normalized.error };
    if (application !== undefined && !['applied', 'restart-required', 'overridden', 'failed', 'cancelled'].includes(String(application))) {
        normalized.reportedApplication = application;
        normalized.application = 'failed';
    }
    const management = normalized;
    // The independently observed Host result outranks package-manager diagnostics.
    const failed = application !== undefined
        ? application !== 'applied' && application !== 'restart-required' && application !== 'overridden'
        : record?.ok === false || record?.success === false || record?.changed === 'failed'
            || asRecord(record?.packageResult)?.exitCode !== undefined && asRecord(record?.packageResult)?.exitCode !== 0;
    const output = resultText(value);
    const result = {
        exitCode: failed ? 1 : 0, stdout: failed ? '' : output, stderr: failed ? output : '',
        timedOut: false, aborted: application === 'cancelled', management,
    };
    const failure = officialOperationFailure(result);
    if (failed && failure !== undefined)
        result.stderr = failure.message;
    return result;
}
function managerError(error, _options) {
    return {
        exitCode: null, stdout: '', stderr: error instanceof Error ? error.message : String(error),
        timedOut: false, aborted: false,
    };
}
function unknownResult(error, requestId, cancellationStatus) {
    // Keep carrier diagnostics structured: generic pnpm recovery must not repeat an unconfirmed mutation.
    return {
        exitCode: 1, stdout: '', stderr: '官方管理结果未确认；请刷新状态后核对，不能自动重复操作', timedOut: false, aborted: false,
        management: {
            application: 'unknown', indeterminate: true, ...(requestId === undefined ? {} : { requestId }),
            error: { code: 'result-unconfirmed', diagnostic: error instanceof Error ? error.message : String(error) },
            ...(cancellationStatus === undefined ? {} : { cancellationStatus }),
        },
    };
}
async function callManager(operation, options, recovery, strict = false) {
    const aborted = options?.signal?.aborted === true;
    const timedOutBeforeStart = options?.timeoutMs !== undefined && options.timeoutMs <= 0;
    if (aborted || timedOutBeforeStart)
        return { exitCode: null, stdout: '', stderr: '', timedOut: !aborted && timedOutBeforeStart, aborted };
    let deadlineRequested = false;
    let cancellation;
    let cancellationStatus;
    let cancelRequested = false;
    const requestCancel = () => {
        if (cancelRequested || recovery?.cancel === undefined)
            return;
        cancelRequested = true;
        try {
            cancellation = Promise.resolve(recovery.cancel()).then(value => {
                const status = asRecord(unwrapResult(value))?.status;
                if (typeof status === 'string')
                    cancellationStatus = status;
                return value;
            }, () => undefined);
        }
        catch { /* Original result or recovery remains authoritative. */ }
    };
    options?.signal?.addEventListener('abort', requestCancel, { once: true });
    const timer = recovery?.cancel === undefined || options?.timeoutMs === undefined ? undefined : setTimeout(() => {
        deadlineRequested = true;
        requestCancel();
    }, Math.max(0, options.timeoutMs));
    try {
        let value;
        try {
            value = await operation();
            // Generated Client calls resolve carrier failures rather than reject;
            // they provide no authoritative Host mutation result to accept.
            if (strict && asRecord(value)?.ok === false && asRecord(value)?.application === undefined)
                throw new Error(resultText(value));
        }
        catch (error) {
            if (recovery === undefined)
                return strict ? unknownResult(error) : managerError(error);
            if (recovery.wait !== undefined) {
                try {
                    value = await recovery.wait();
                }
                catch (waitError) {
                    return unknownResult(waitError, recovery.requestId, cancellationStatus);
                }
            }
            if (value === undefined || value === null)
                return unknownResult(error, recovery.requestId, cancellationStatus);
            if (strict && asRecord(value)?.ok === false && asRecord(value)?.application === undefined)
                return unknownResult(new Error(resultText(value)), recovery.requestId, cancellationStatus);
        }
        if (cancellation !== undefined)
            await cancellation;
        const result = managerResult(value, recovery?.requestId, strict);
        const confirmedCancelled = result.management?.application === 'cancelled';
        if (result.management !== undefined && cancelRequested) {
            result.management.cancelRequested = true;
            if (cancellationStatus !== undefined)
                result.management.cancellationStatus = cancellationStatus;
        }
        // An abort during applying cannot overturn success or a required restart.
        result.aborted = confirmedCancelled;
        result.timedOut = confirmedCancelled && deadlineRequested;
        return result;
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
        options?.signal?.removeEventListener('abort', requestCancel);
    }
}
function capability(available, reason) {
    return available ? { available: true } : { available: false, reason };
}
function subscribeProgress(events, requestId, options) {
    if (events === undefined)
        return () => undefined;
    const disposers = [];
    try {
        const log = events.on('plugin-manager/install-log', value => {
            const chunk = asRecord(value);
            if (chunk?.requestId !== requestId || typeof chunk.text !== 'string')
                return;
            if (chunk.stream === 'stderr')
                options?.onStderr?.(chunk.text);
            else if (chunk.stream === 'stdout')
                options?.onStdout?.(chunk.text);
        });
        if (log !== undefined)
            disposers.push(log);
        const state = events.on('plugin-manager/install-state', value => {
            const record = asRecord(value);
            if (record?.requestId !== requestId || !['installing', 'cancelling', 'applying'].includes(String(record.phase)))
                return;
            options?.onManagementState?.(record);
        });
        if (state !== undefined)
            disposers.push(state);
    }
    catch (error) {
        for (const dispose of disposers)
            dispose();
        throw error;
    }
    return () => { for (const dispose of disposers)
        dispose(); };
}
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
/**
 * pnpm 11 records a git- or tarball-hosted package's `allowBuilds` key as
 * `name@<source URL>`; a monorepo subdirectory can add `#path:...` and keep
 * spaces there. The Host still checks that an approved key is pending, carries
 * no credential and is not a wildcard, so the market only has to reject names
 * that are clearly not one of its exact keys.
 */
const GIT_BUILD_KEY = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*@(?:git\+)?(?:https?|ssh|git):\/\/\S(?:.*\S)?$/;
/** A registry package name or the exact git/tarball key pnpm reports for one. */
function exactBuildKey(name) {
    if (name === '' || name !== name.trim() || /[\u0000-\u001f\u007f]/.test(name))
        return false;
    return PACKAGE_NAME.test(name) || GIT_BUILD_KEY.test(name);
}
/** One-argument callers retain structural compatibility; added option fields require audited runtime versions. */
export function officialDesktopRunner(getManager, runtime, events) {
    const version = runtime?.version?.trim().replace(/\+.*/, '') ?? null;
    const coreVersion = version === null ? runtime === undefined : recognizedHostVersion(version);
    const versionAtLeast = (minimum) => recognizedHostVersion(version) && compareVersions(version, minimum) >= 0;
    const versionReason = version === null ? '未能识别官方 DSH 版本'
        : `当前皮肤市场尚未适配 DSH ${version}，请更新皮肤市场后重试`;
    const capabilities = () => {
        const manager = getManager();
        const core = coreVersion && manager !== undefined;
        const unavailable = manager === undefined ? '官方宿主未提供 pluginManager' : versionReason;
        const method = (name) => core && typeof manager?.[name] === 'function';
        const cancel = method('cancelInstall');
        const install = method('installBundle');
        const enabled = method('setBundleEnabled') || method('setPluginEnabled');
        return {
            install: capability(install, !core ? unavailable : '官方 pluginManager 未提供安装接口'),
            update: capability(install, !core ? unavailable : '官方 pluginManager 未提供更新接口'),
            enable: capability(enabled, !core ? unavailable : '官方 pluginManager 未提供启用接口'),
            disable: capability(enabled, !core ? unavailable : '官方 pluginManager 未提供停用接口'),
            remove: capability(method('removeBundle'), !core ? unavailable : '官方 pluginManager 未提供卸载接口'),
            cancel: capability(cancel, !core ? unavailable : '官方 pluginManager 未提供取消接口'),
            wait: capability(method('waitForInstall') && (runtime === undefined || versionAtLeast(RECOVERY_VERSION)), !core ? unavailable : '此 DSH 版本未提供安装结果恢复接口'),
            buildApprovals: capability(install, !core ? unavailable : '官方 pluginManager 不支持构建脚本授权'),
            registry: capability(core && versionAtLeast(RECOVERY_VERSION), !core ? unavailable : `安装源选项需要已核验的 DSH ${RECOVERY_VERSION} 或更新版本`),
            saveExact: capability(core && versionAtLeast(EXACT_VERSION), !core ? unavailable : `精确保存依赖需要已核验的 DSH ${EXACT_VERSION} 或更新版本`),
        };
    };
    const requireCapability = (key) => {
        const state = capabilities()[key];
        if (!state.available)
            throw new Error(state.reason);
        return getManager();
    };
    const install = async (spec, requestId, request, options) => {
        try {
            const manager = requireCapability('install');
            const caps = capabilities();
            const installOptions = { enabled: false, requestId };
            if (request.registry !== undefined) {
                if (!caps.registry.available)
                    throw new Error(caps.registry.reason);
                const normalized = request.registry === null ? null : normalizeRegistryBase(request.registry);
                if (request.registry !== null && normalized === null)
                    throw new Error('安装源必须是无凭据的 HTTP(S) 地址');
                installOptions.registry = request.registry;
            }
            if (request.approvedBuilds !== undefined) {
                if (!caps.buildApprovals.available)
                    throw new Error(caps.buildApprovals.reason);
                const names = [...new Set(request.approvedBuilds)];
                if (names.some(name => !exactBuildKey(name)))
                    throw new Error('构建授权只接受官方返回的精确待定项');
                installOptions.approvedBuilds = names;
            }
            if (caps.saveExact.available && request.saveExact !== false)
                installOptions.saveExact = true;
            const unsubscribe = subscribeProgress(events, requestId, options);
            try {
                return await callManager(() => manager.installBundle(spec, installOptions), options, {
                    requestId, ...(caps.cancel.available ? { cancel: () => manager.cancelInstall(requestId) } : {}),
                    ...(caps.wait.available ? { wait: () => manager.waitForInstall(requestId) } : {}),
                }, runtime !== undefined);
            }
            finally {
                unsubscribe();
            }
        }
        catch (error) {
            return managerError(error, options);
        }
    };
    const runner = async (_profile, args, options) => {
        const verb = args[0];
        const target = args.slice(1).find(argument => !argument.startsWith('-'));
        if (verb === 'add') {
            if (target === undefined)
                return managerError(new Error('官方 Desktop add 缺少插件目标'), options);
            return install(target, randomUUID(), {}, options);
        }
        if (verb === 'remove') {
            if (target === undefined)
                return managerError(new Error('官方 Desktop remove 缺少插件名'), options);
            try {
                const manager = requireCapability('remove');
                return await callManager(() => manager.removeBundle(target), options, undefined, runtime !== undefined);
            }
            catch (error) {
                return managerError(error, options);
            }
        }
        return managerError(new Error(`官方 Desktop pluginManager 不支持 ${verb ?? '空命令'}`), options);
    };
    runner.hostKind = 'desktop';
    runner.ensurePnpm = async () => undefined;
    runner.installPlugin = (_profile, request, options) => install(request.spec ?? `${request.packageName}@${request.packageVersion}`, request.receiptId, request, options);
    runner.management = {
        installRequiresRestart: version !== null && AUDITED_VERSIONS.has(version) && !versionAtLeast(RESOLUTION_REFRESH_VERSION),
        capabilities,
        async setBundleEnabled(name, enabled, options) {
            try {
                const manager = requireCapability(enabled ? 'enable' : 'disable');
                if (typeof manager.setBundleEnabled !== 'function')
                    throw new Error('官方 pluginManager 未提供组合包启停接口');
                return await callManager(() => manager.setBundleEnabled(name, enabled), options, undefined, runtime !== undefined);
            }
            catch (error) {
                return managerError(error, options);
            }
        },
        async setPluginEnabled(entryId, enabled, options) {
            try {
                const manager = requireCapability(enabled ? 'enable' : 'disable');
                if (typeof manager.setPluginEnabled !== 'function')
                    throw new Error('官方 pluginManager 未提供插件行启停接口');
                return await callManager(() => manager.setPluginEnabled(entryId, enabled), options, undefined, runtime !== undefined);
            }
            catch (error) {
                return managerError(error, options);
            }
        },
        async inspect(spec, options) {
            const manager = requireCapability('install');
            if (typeof manager.inspect !== 'function')
                throw new Error('官方 pluginManager 未提供安装预检接口');
            if (options?.registry !== undefined && !capabilities().registry.available)
                throw new Error(capabilities().registry.reason);
            return readManagerResult(await (versionAtLeast(RECOVERY_VERSION)
                ? manager.inspect(spec, options?.registry === undefined ? undefined : { registry: options.registry }, options?.signal)
                : manager.inspect(spec, options?.signal)));
        },
        async listBundles() {
            const manager = getManager();
            if (!coreVersion)
                throw new Error(versionReason);
            if (typeof manager?.listBundles !== 'function')
                throw new Error('官方 pluginManager 未提供可用的组合包清单');
            return readManagerResult(await manager.listBundles());
        },
        async listPlugins() {
            const manager = getManager();
            if (!coreVersion)
                throw new Error(versionReason);
            if (typeof manager?.listPlugins !== 'function')
                throw new Error('官方 pluginManager 未提供可用的插件清单');
            return readManagerResult(await manager.listPlugins());
        },
        async registries() {
            const manager = getManager();
            if (!coreVersion || typeof manager?.registries !== 'function')
                return undefined;
            try {
                return normalizeOfficialRegistryPlan(await manager.registries());
            }
            catch {
                return undefined;
            }
        },
    };
    runner.registryPlan = async () => runner.management?.registries?.();
    return runner;
}
