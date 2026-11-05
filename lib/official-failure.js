import { sanitizeLogText } from './log.js';
import { classifyPnpmFailure } from './pnpm-recovery.js';
import { parseReleaseAgeTarget } from './release-age.js';
const PACKAGE_FAILURES = {
    'pnpm-missing': { kind: 'pnpm-missing', message: 'Desktop 未找到可用的 pnpm，安装没有完成；请检查 Desktop 的包管理器设置。', messageKey: 'failure.pnpmProblem' },
    timeout: { kind: 'fetch-timeout', message: '安装步骤超时，宿主已停止本次操作；请检查下载连接后重试。', messageKey: 'failure.timeoutProblem' },
    'not-found': { kind: 'fetch-404', message: '安装源没有找到所需的包；请检查包是否已发布、安装源及访问权限。', messageKey: 'failure.fetch404Problem' },
    'no-matching-version': { kind: 'no-matching-version', message: '安装源没有所需的精确版本；请检查该版本是否已发布或等待安装源同步。', messageKey: 'failure.versionProblem' },
    network: { kind: 'network', message: '下载时无法连接安装源；请检查网络后重试。', messageKey: 'failure.networkProblem' },
    'disk-full': { kind: 'disk-full', message: '磁盘空间不足，安装没有完成；请释放空间后重试。', messageKey: 'failure.diskProblem' },
    permission: { kind: 'permission', message: 'Desktop 无权写入安装目录或包缓存；请检查相关目录的权限后重试。', messageKey: 'failure.permissionProblem' },
    'build-blocked': { kind: 'build-approval', message: '依赖的构建脚本被阻止；请核对并批准需要运行的精确构建项后重试。', messageKey: 'failure.buildProblem' },
    integrity: { kind: 'integrity', message: '下载包的完整性校验失败，安装没有完成；请检查安装源或包缓存。', messageKey: 'failure.integrityProblem' },
};
const MANAGEMENT_MESSAGES = {
    'incompatible-version': '皮肤声明的依赖版本与当前 Desktop 不兼容；请使用兼容的皮肤或 Desktop 版本。',
    'management-required': '该组件由 Desktop 管理，当前操作不能修改它。',
    unaddressable: 'Desktop 无法唯一定位此组件的启停设置；请在官方插件页核对状态。',
    'unknown-plugin': 'Desktop 没有找到目标组件；请刷新官方插件页后核对。',
    'invalid-spec': 'Desktop 拒绝了该安装地址；请检查皮肤的安装信息。',
    'ambiguous-install': '此次安装无法唯一确定目标包，Desktop 已停止安装。',
    'not-bundle': '安装包未提供可用的 Desktop 组合包声明，不能通过当前接口安装。',
    'not-removable': '该组合包不能通过 Desktop 的卸载接口移除。',
    'stop-profile': '目标组件仍在当前 Desktop 中运行；请手动重启 Desktop App 后再尝试卸载。',
    'bundle-in-use': '目标组合包仍有组件在运行，Desktop 尚未完成停用。',
    'stale-approval': '需要批准的构建项已变化；请重新核对当前待批准项目。',
    'already-installed': '官方 Desktop 不允许在已安装的包上直接安装新版。',
};
const MANAGEMENT_MESSAGE_KEYS = {
    'incompatible-version': 'failure.compatibility',
    'management-required': 'failure.managementProblem',
    unaddressable: 'failure.unaddressableProblem',
    'unknown-plugin': 'failure.unknownPluginProblem',
    'invalid-spec': 'failure.invalidSpecProblem',
    'ambiguous-install': 'failure.ambiguousInstallProblem',
    'not-bundle': 'failure.notBundleProblem',
    'not-removable': 'failure.notRemovableProblem',
    'stop-profile': 'failure.stopProfileProblem',
    'bundle-in-use': 'failure.bundleInUseProblem',
    'stale-approval': 'failure.staleApprovalProblem',
    'already-installed': 'failure.operationStateProblem',
};
export function manualInstallInstruction(spec) {
    return `请在官方插件页先卸载当前包，再添加 ${spec}。`;
}
export class ManualInstallRequired extends Error {
    manualSpec;
    constructor(spec, cause) {
        super(`${cause} ${manualInstallInstruction(spec)}`);
        this.name = 'ManualInstallRequired';
        this.manualSpec = spec;
    }
}
function unclassifiedDiagnosticSummary(diagnostic) {
    const lines = diagnostic.split(/\r?\n/)
        .map(line => sanitizeLogText(line.replace(/\u001b\[[0-9;]*m/g, '')).trim())
        .filter(line => line !== '' && !/^(?:Progress:|\[?WARN\b|at\s|Operation (?:stopped|failed)\b)/i.test(line));
    const errors = lines.filter(line => /\b(?:error|ERR_[A-Z0-9_]+|failed|failure|cannot|unable)\b|失败|无法/i.test(line));
    return (errors.at(-1) ?? lines.at(-1))?.slice(0, 240);
}
function terminalDiagnostic(diagnostic) {
    const text = diagnostic.replace(/\u001b\[[0-9;]*m/g, '');
    const pnpm = [...text.matchAll(/\bERR_PNPM_[A-Z0-9_]+\b/g)].at(-1);
    const error = [...text.matchAll(/^[^\S\r\n]*(?:[A-Za-z]+)?Error(?: \[[^\]\r\n]+\])?:[^\r\n]*/gm)].at(-1);
    if (error !== undefined && (pnpm === undefined || error.index > pnpm.index))
        return { output: text.slice(error.index) };
    return pnpm === undefined ? undefined : { output: text.slice(pnpm.index), pnpmCode: pnpm[0] };
}
/** Classify only a confirmed Host failure. This never retries a management call. */
export function officialOperationFailure(result, canApproveBuilds = false) {
    const managed = result.management;
    if (managed === undefined || managed.indeterminate === true || !['failed', 'overridden'].includes(managed.application ?? ''))
        return undefined;
    const message = typeof managed.error?.message === 'string' ? sanitizeLogText(managed.error.message).trim() : undefined;
    const code = typeof managed.error?.code === 'string' && /^[a-z0-9-]{1,80}$/.test(managed.error.code) ? managed.error.code : undefined;
    if (managed.application === 'overridden')
        return {
            kind: 'configuration-override',
            ...(code === undefined ? {} : { code }),
            ...(typeof managed.enabled === 'boolean' ? { desiredEnabled: managed.enabled } : {}),
            messageKey: managed.enabled === true ? 'failure.overrideDisabled' : 'failure.overrideGeneric',
            message: message || (managed.enabled === true
                ? '目标皮肤被其他设置禁用，请解除禁用后重新使用。'
                : '启停设置被其他配置覆盖，请移除对应强制设置后重试。'),
        };
    if (managed.error?.code === 'incompatible-version' || managed.packageResult?.incompatible instanceof Array && managed.packageResult.incompatible.length > 0) {
        return { kind: 'compatibility', message: message || MANAGEMENT_MESSAGES['incompatible-version'], messageKey: 'failure.compatibility', ...(code === undefined ? {} : { code }) };
    }
    const diagnostic = [managed.error?.diagnostic, managed.packageResult?.output].filter((value) => typeof value === 'string').join('\n');
    const terminal = terminalDiagnostic(diagnostic);
    // pnpm can log a registry warning, recover it, and only then reject the
    // complete lockfile under its supply-chain policy. That terminal refusal
    // explains the failed operation even if an older Host labels it as network.
    if (terminal?.pnpmCode === 'ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION') {
        const blocked = terminal.output.match(/(?:^|failed verification:[ \t]*)[ \t]*(?:[-*][ \t]+)?((?:@[A-Za-z0-9._~-]+\/)?[A-Za-z0-9._~-]+)@([^\s:,]+)\s+was published at\s+\S+,?\s+within (?:the )?minimumReleaseAge cutoff/m);
        const packageName = blocked?.[1];
        const version = blocked?.[2];
        const releaseAgeTarget = packageName === undefined || version === undefined ? undefined : parseReleaseAgeTarget(packageName, version);
        return {
            kind: 'release-age',
            ...(code === undefined ? {} : { code }),
            message: message || `${packageName === undefined ? '锁文件中的依赖' : `${packageName}@${version}`}仍处于 Desktop 的新包保护期，导致本次安装被阻止；请等待保护期结束后重试。`,
            messageKey: 'failure.releaseAgeProblem',
            ...(packageName === undefined ? {} : { packageName }),
            ...(releaseAgeTarget === undefined ? {} : { releaseAgeTarget }),
        };
    }
    const detected = classifyPnpmFailure({ exitCode: 1, stdout: '', stderr: terminal?.output ?? diagnostic, timedOut: false });
    const nativeKind = managed.packageResult?.kind;
    let failure = nativeKind !== undefined && Object.hasOwn(PACKAGE_FAILURES, nativeKind) ? PACKAGE_FAILURES[nativeKind] : undefined;
    // A concrete terminal pnpm error is more precise than a coarse Host kind
    // inferred from the whole output (which can include recovered warnings).
    if (terminal !== undefined && detected.kind !== 'command')
        failure = detected;
    // An unknown Host category also leaves room for recognized non-code diagnostics.
    if (failure === undefined && (nativeKind === undefined || nativeKind === 'unknown') && detected.kind !== 'command')
        failure = detected;
    if (nativeKind === 'timeout' && detected.kind === 'script-timeout')
        failure = detected;
    if (managed.error?.code === 'build-approval-required')
        failure = PACKAGE_FAILURES['build-blocked'];
    const managementCode = managed.error?.code ?? '';
    failure ??= { kind: 'command', message: MANAGEMENT_MESSAGES[managementCode] || unclassifiedDiagnosticSummary(terminal?.output ?? diagnostic) || 'Desktop 未完成此操作；请查看日志中的具体原因。', messageKey: MANAGEMENT_MESSAGE_KEYS[managementCode] ?? 'failure.operationStateProblem' };
    // Generic CLI recovery text can claim an automatic retry. Official Host calls
    // have their own retry policy; describe the observed failure without that claim.
    const failureMessage = failure.kind === 'network' ? PACKAGE_FAILURES.network.message
        : failure.kind === 'fetch-timeout' ? PACKAGE_FAILURES.timeout.message
            : failure.kind === 'release-age' ? '依赖被安装源的新包保护规则阻止；请稍后重试。'
                : failure.message;
    const buildKeys = failure.kind === 'build-approval'
        ? [...new Set((managed.pendingBuilds ?? []).filter(key => typeof key === 'string' && key.trim() !== ''))]
        : [];
    return {
        kind: failure.kind,
        ...(code === undefined ? {} : { code }),
        message: message || failureMessage,
        ...(failure.messageKey === undefined ? {} : { messageKey: failure.messageKey }),
        ...(failure.messageParams === undefined ? {} : { messageParams: failure.messageParams }),
        ...('packageName' in failure && typeof failure.packageName === 'string' ? { packageName: failure.packageName } : {}),
        ...(buildKeys.length === 0 ? {} : { buildKeys }),
        ...(failure.kind === 'network' || failure.kind === 'fetch-timeout' ? { action: 'retry' }
            : failure.kind === 'build-approval' && canApproveBuilds && buildKeys.length > 0 ? { action: 'approve-build' } : {}),
    };
}
/** Diagnostics stay in the existing sanitized log, outside user-facing text. */
export function officialFailureDiagnostic(result) {
    const managed = result.management;
    const diagnostic = [managed?.error?.diagnostic, managed?.packageResult?.output].filter((value) => typeof value === 'string').join('\n');
    const terminal = terminalDiagnostic(diagnostic);
    return [
        `application=${managed?.application ?? 'unreported'} code=${managed?.error?.code ?? 'unreported'} packageKind=${managed?.packageResult?.kind ?? 'unreported'}`,
        managed?.error?.message,
        // Keep the terminal reason before progress output so log size limits do
        // not discard the failure that actually ended the package operation.
        terminal?.output.split('\n')[0],
        typeof managed?.packageResult?.logPath === 'string' ? `logPath=${managed.packageResult.logPath}` : undefined,
        diagnostic,
    ].filter((value) => typeof value === 'string' && value !== '').join('\n');
}
