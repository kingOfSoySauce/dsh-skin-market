import { commandError } from './commands.js';
import { readDependencies } from './profile.js';
export class PnpmCommandError extends Error {
    failure;
    result;
    constructor(failure, result) {
        super(failure.message);
        this.failure = failure;
        this.result = result;
        this.name = 'PnpmCommandError';
    }
}
const RELEASE_AGE_OVERRIDE = '--config.minimumReleaseAge=0';
const FETCH_TIMEOUT_MS = 10 * 60 * 1000;
function outputOf(result) {
    return `${result.stdout}\n${result.stderr}`.trim();
}
function extractBuildKey(output) {
    const match = output.match(/(?:^|[\s'"`])((?:@[^\s/]+\/)?[^\s'"`]+@https?:\/\/[^\s'"`]+)(?=$|[\s'"`])/m);
    return match?.[1]?.replace(/:+$/, '');
}
function packageNameFromBuildKey(key) {
    if (key === undefined)
        return undefined;
    const separator = key.indexOf('@https://') >= 0 ? key.indexOf('@https://') : key.indexOf('@http://');
    if (separator <= 0)
        return undefined;
    return key.slice(0, separator);
}
function packageNameFromVersionedSpecifier(specifier) {
    const value = specifier.trim().replace(/^["']+|["'}\].,;]+$/g, '');
    if (value === '')
        return undefined;
    const separator = value.startsWith('@')
        ? value.indexOf('@', value.indexOf('/') + 1)
        : value.lastIndexOf('@');
    const packageName = separator > 0 ? value.slice(0, separator) : value;
    return /^(?:@[A-Za-z0-9._~-]+\/)?[A-Za-z0-9._~-]+$/.test(packageName) ? packageName : undefined;
}
function ignoredBuildKeys(output) {
    const match = output.match(/Ignored build scripts:\s*([^\r\n]+)/i);
    if (match?.[1] === undefined)
        return [];
    return [...new Set(match[1].split(',').map(packageNameFromVersionedSpecifier).filter((value) => value !== undefined))];
}
function packageNameFromFetch404(output) {
    const match = output.match(/\bGET\s+(https?:\/\/[^\s]+):\s*(?:Not Found|404)/i);
    if (match?.[1] === undefined)
        return undefined;
    try {
        const url = new URL(match[1]);
        const name = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
        return name === '' ? undefined : name;
    }
    catch {
        return undefined;
    }
}
export function classifyPnpmFailure(result) {
    if (result.aborted)
        return { kind: 'command', message: '操作已取消' };
    const output = outputOf(result);
    const ignoredKeys = ignoredBuildKeys(output);
    if (ignoredKeys.length > 0 || /ERR_PNPM_IGNORED_BUILDS/i.test(output)) {
        const packageName = ignoredKeys[0];
        return {
            kind: 'build-approval',
            message: packageName === undefined
                ? '依赖包含被 pnpm 阻止的构建脚本；请批准精确构建项后重试'
                : `依赖 ${packageName}${ignoredKeys.length > 1 ? ` 等 ${ignoredKeys.length} 个依赖` : ''} 包含被 pnpm 阻止的构建脚本；请批准后重试`,
            packageName,
            buildKey: packageName,
            ...(ignoredKeys.length === 0 ? {} : { buildKeys: ignoredKeys }),
        };
    }
    if (/ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED|needs to execute build scripts.*not in allowBuilds/i.test(output)) {
        const buildKey = extractBuildKey(output);
        return {
            kind: 'build-approval',
            message: 'GitHub 插件包含被 pnpm 阻止的构建脚本；请批准精确构建项后重试',
            packageName: packageNameFromBuildKey(buildKey),
            buildKey,
            ...(buildKey === undefined ? {} : { buildKeys: [buildKey] }),
        };
    }
    if (/minimumReleaseAge cutoff|within the minimumReleaseAge cutoff|verifyLockfileResolutions|ERR_PNPM.*RELEASE.*AGE/i.test(output)) {
        return {
            kind: 'release-age',
            message: '依赖仍受 pnpm 新包保护；已自动临时放宽并重试一次，请稍后再试',
        };
    }
    if (/\[23\].*aborted due to timeout|TimeoutError: The operation was aborted due to timeout|fetch timeout|ETIMEDOUT/i.test(output) || result.timedOut) {
        return {
            kind: 'fetch-timeout',
            message: commandError(result),
        };
    }
    if (/UND_ERR_DESTROYED|fetch failed|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket hang up|network request failed|network failed/i.test(output)) {
        return {
            kind: 'network',
            message: '插件下载遇到临时网络错误；已自动重试一次，请检查网络后重试',
        };
    }
    if (/ERR_PNPM_FETCH_404/i.test(output)) {
        const packageName = packageNameFromFetch404(output);
        return {
            kind: 'fetch-404',
            message: packageName === undefined
                ? '有依赖无法从 npm registry 找到；请检查依赖声明、registry 权限或之前失败操作留下的幽灵依赖'
                : `依赖 ${packageName} 无法从 npm registry 找到；它可能是未发布的宿主依赖、私有包或之前失败操作留下的幽灵依赖`,
            packageName,
        };
    }
    if (output.includes('ERR_PNPM_ADDING_TO_ROOT')) {
        return { kind: 'adding-to-root', message: 'pnpm 拒绝在 workspace 根目录安装；市场已识别为兼容性问题，请重试' };
    }
    if (/--workspace-root may only be used inside a workspace/i.test(output)) {
        return { kind: 'not-a-workspace', message: '当前 profile 不是 pnpm workspace，却传入了 -w；市场已识别为兼容性问题，请重试' };
    }
    if (/ERR_PNPM_UNEXPECTED_STORE|Unexpected store location/i.test(output)) {
        return {
            kind: 'unexpected-store',
            message: '当前 profile 的 node_modules 由另一代 pnpm store 链接（常见于本机同时装了 pnpm 10 和 11）。请用 node_modules/.modules.yaml 记录的同一版 pnpm 再操作，或用现在的 pnpm 重建该 profile 的 node_modules。不要在 DSH 源码仓库目录里看 pnpm 版本来判断。',
        };
    }
    return { kind: 'command', message: commandError(result) };
}
function withReleaseAgeOverride(args) {
    const commandIndex = args.findIndex(arg => arg === 'add' || arg === 'remove' || arg === 'install');
    if (commandIndex < 0)
        return [...args, RELEASE_AGE_OVERRIDE];
    return [...args.slice(0, commandIndex + 1), RELEASE_AGE_OVERRIDE, ...args.slice(commandIndex + 1)];
}
const AUTO_INSTALL_PEERS_OFF = '--config.auto-install-peers=false';
function withCommandOption(args, option) {
    const commandIndex = args.findIndex(arg => arg === 'add' || arg === 'remove' || arg === 'install');
    if (commandIndex < 0)
        return [...args, option];
    return [...args.slice(0, commandIndex + 1), option, ...args.slice(commandIndex + 1)];
}
function explicitDirectory(args) {
    const index = args.indexOf('--dir');
    const directory = index >= 0 ? args[index + 1] : undefined;
    return directory === undefined || directory.startsWith('-') ? undefined : directory;
}
function shouldDisablePeerAutoinstall(args, failure, profileDir) {
    if (args[0] !== 'add' && args[0] !== 'remove')
        return false;
    if (args.includes(AUTO_INSTALL_PEERS_OFF))
        return false;
    if (failure.packageName === undefined || !failure.packageName.startsWith('@deepseek-ai/'))
        return false;
    const directory = explicitDirectory(args) ?? profileDir;
    if (directory === undefined)
        return false;
    return !Object.hasOwn(readDependencies(directory), failure.packageName);
}
function isAutomaticallyRecoverable(kind) {
    return kind === 'release-age' || kind === 'network' || kind === 'fetch-timeout';
}
export async function runPnpmWithRecovery(args, options) {
    const result = await options.attempt(args);
    if (result.exitCode === 0 && !result.timedOut && result.aborted !== true)
        return;
    const failure = classifyPnpmFailure(result);
    const disablePeerAutoinstall = shouldDisablePeerAutoinstall(args, failure, options.profileDir);
    if (!disablePeerAutoinstall && !isAutomaticallyRecoverable(failure.kind))
        throw new PnpmCommandError(failure, result);
    options.onRetry?.(disablePeerAutoinstall ? { ...failure, recovery: 'disable-peer-autoinstall' } : failure);
    const retryArgs = disablePeerAutoinstall
        ? withCommandOption(args, AUTO_INSTALL_PEERS_OFF)
        : failure.kind === 'release-age' ? withReleaseAgeOverride(args) : args;
    const retryOptions = failure.kind === 'fetch-timeout'
        ? { env: { pnpm_config_fetch_timeout: String(FETCH_TIMEOUT_MS) } }
        : undefined;
    const retryResult = await options.attempt(retryArgs, retryOptions);
    if (retryResult.exitCode === 0 && !retryResult.timedOut && retryResult.aborted !== true)
        return;
    throw new PnpmCommandError(classifyPnpmFailure(retryResult), retryResult);
}
/** Return only structured, non-secret pnpm failure metadata for copied logs. */
export function failureDiagnostic(result) {
    const codes = [...new Set(`${result.stdout}\n${result.stderr}`.match(/\bERR_PNPM_[A-Z0-9_]+\b/g) ?? [])];
    return [
        `exitCode=${result.exitCode ?? 'null'}`,
        `timedOut=${result.timedOut}`,
        `aborted=${result.aborted === true}`,
        ...(codes.length === 0 ? [] : [`codes=${codes.slice(0, 4).join(',')}`]),
    ].join(' ');
}
