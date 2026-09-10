import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { resolveProfileDir } from './profile.js';
export function normalizedEnvironment(options) {
    if (options?.env === undefined)
        return undefined;
    const env = { ...options.env };
    // pnpm 11 reads numeric config values from pnpm_config_* snake-case vars.
    // Keep accepting the earlier npm-style key so older callers get the fix too.
    const legacyFetchTimeout = env['npm_config-fetch-timeout'];
    if (env.pnpm_config_fetch_timeout === undefined && legacyFetchTimeout !== undefined)
        env.pnpm_config_fetch_timeout = legacyFetchTimeout;
    return env;
}
const PLUGIN_COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
export const winCmdShim = process.platform === 'win32';
/**
 * Bilingual guidance when `&path:` installs cannot start pnpm with shell:false.
 * Common on Windows when PATH only has a `pnpm.cmd` shim.
 */
export const PNPM_DIRECT_SPAWN_ENOENT_HINT = '无法以 shell:false 启动真实 pnpm（常见原因：PATH 上只有 pnpm.cmd，而含 &path: 的安装不能再走 cmd 二次解析）。请确保存在 pnpm.exe、Corepack 激活的 pnpm，或可用 `node` 直接运行的 pnpm.cjs；可执行 `corepack enable pnpm` / 重装 pnpm 后重试。 / Could not spawn a real pnpm binary with shell:false (often PATH only has pnpm.cmd). Ensure pnpm.exe, Corepack-enabled pnpm, or node+pnpm.cjs is available — then retry (`corepack enable pnpm` or reinstall pnpm).';
/**
 * Directories that commonly hold pnpm when GUI/desktop launches omit shell PATH
 * (same spirit as dsh-market toolSearchDirs).
 */
export function toolSearchDirs(platform = process.platform, env = process.env, home = homedir(), nodeDir = dirname(process.execPath)) {
    const dirs = [];
    const pnpmHome = (env.PNPM_HOME ?? '').trim();
    if (pnpmHome !== '')
        dirs.push(pnpmHome);
    if (platform === 'win32') {
        const local = (env.LOCALAPPDATA ?? '').trim();
        const roaming = (env.APPDATA ?? '').trim();
        if (local !== '')
            dirs.push(join(local, 'pnpm'));
        if (roaming !== '')
            dirs.push(join(roaming, 'npm'));
    }
    else {
        dirs.push('/opt/homebrew/bin', '/usr/local/bin', join(home, '.local', 'bin'));
        dirs.push(join(home, 'Library', 'pnpm'), join(home, '.local', 'share', 'pnpm'));
    }
    dirs.push(nodeDir);
    return [...new Set(dirs.filter(dir => dir.trim() !== ''))];
}
function pathEntries(env, platform) {
    const separator = platform === 'win32' ? ';' : ':';
    return (env.PATH ?? '').split(separator).filter(Boolean);
}
/**
 * Resolve a real pnpm entrypoint for `shell: false` spawns (`&path:` installs).
 * Prefer `pnpm.exe`, then `node` + absolute `pnpm.cjs` / Corepack script.
 * Never returns a `.cmd`/`.bat` shim — those need the quoted cmd bridge and
 * would reintroduce `&` truncation. Falls back to bare `pnpm` (may ENOENT on
 * Windows when only a shim exists; callers map that to PNPM_DIRECT_SPAWN_ENOENT_HINT).
 */
export function resolvePnpmForDirectSpawn(options) {
    const platform = options?.platform ?? process.platform;
    const env = options?.env ?? process.env;
    const home = options?.home ?? homedir();
    const execPath = options?.execPath ?? process.execPath;
    const search = [...toolSearchDirs(platform, env, home, dirname(execPath)), ...pathEntries(env, platform)];
    if (platform === 'win32') {
        for (const dir of search) {
            const exe = join(dir, 'pnpm.exe');
            if (existsSync(exe))
                return { file: exe, prefix: [] };
        }
    }
    else {
        for (const dir of search) {
            const bin = join(dir, 'pnpm');
            if (existsSync(bin))
                return { file: bin, prefix: [] };
        }
    }
    const scriptRelatives = [
        'pnpm.cjs',
        join('bin', 'pnpm.cjs'),
        join('node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
        join('node_modules', 'corepack', 'dist', 'pnpm.js'),
        join('node_modules', 'corepack', 'dist', 'pnpm.cjs'),
    ];
    for (const dir of search) {
        for (const relative of scriptRelatives) {
            const script = join(dir, relative);
            if (existsSync(script))
                return { file: execPath, prefix: [script] };
        }
    }
    return { file: 'pnpm', prefix: [] };
}
function isSpawnEnoent(error) {
    return error.code === 'ENOENT' || /ENOENT/i.test(error.message ?? '');
}
function dshInvocation() {
    const entry = process.argv[1];
    if (entry !== undefined && /[\\/](?:bin\.(?:js|ts)|dsh)$/.test(entry)) {
        const absolute = resolve(entry);
        return { file: process.execPath, prefix: [...process.execArgv, absolute], cwd: dirname(absolute), viaShell: false };
    }
    return { file: 'dsh', prefix: [], viaShell: winCmdShim };
}
/**
 * Choose how to run a profile plugin command.
 *
 * Specs with `&path:` cannot go through `dsh plugin` on Windows: DSH forwards
 * to pnpm with `shell: true`, and cmd.exe splits on `&`. Same policy as
 * dsh-market's TARGET_RE (reject `&` at the dsh boundary); here we keep the
 * pinned `#commit&path:/` form and spawn pnpm ourselves.
 */
export function pluginProcess(profile, args) {
    if (args.some(arg => arg.includes('&'))) {
        const profileDir = resolveProfileDir(profile);
        // Keep `&path:` as one argv element. Do not re-enter cmd.exe: a second
        // parse can truncate left-of-`&` and pnpm still exits 0 with the repo
        // root package. Resolve pnpm.exe or node→pnpm.cjs; bare pnpm.cmd is not
        // enough for shell:false. Non-`&` / provisioning still use the quoted
        // cmd bridge for .cmd shims via ensurePnpmAvailable / dshInvocation.
        // Windows cannot spawn pnpm.cmd with shell:false; resolve pnpm.exe /
        // node+pnpm.cjs. Unix can spawn the PATH `pnpm` script directly.
        const pnpm = process.platform === 'win32' ? resolvePnpmForDirectSpawn() : { file: 'pnpm', prefix: [] };
        const pluginArgs = args.includes('--dir') ? [...args] : [...args, '--dir', profileDir];
        return {
            file: pnpm.file,
            argv: [...pnpm.prefix, ...pluginArgs],
            cwd: profileDir,
            viaShell: false,
            directPnpm: true,
        };
    }
    const invocation = dshInvocation();
    return {
        file: invocation.file,
        argv: [...invocation.prefix, 'plugin', '--profile', profile, ...args],
        cwd: invocation.cwd,
        viaShell: invocation.viaShell,
    };
}
/** Characters that cmd.exe reinterprets when it reparses a command line. */
const CMD_METACHARS = /[\s"&|<>^()%!]/;
/** Quote one argv token before passing it through cmd.exe. */
export function quoteCmdArg(arg) {
    if (!CMD_METACHARS.test(arg))
        return arg;
    return `"${arg.replace(/"/g, '""')}"`;
}
/** Build the command line used by the explicit Windows cmd.exe bridge. */
export function cmdCommandLine(argv) {
    return argv.map(quoteCmdArg).join(' ');
}
/**
 * Start a command without Node's shell:true + argv re-serialization. Windows
 * command shims still need cmd.exe, so use an explicit, quoted /c boundary.
 */
function spawnShim(file, args, options) {
    const { viaShell = false, ...spawnOptions } = options;
    if (!viaShell || process.platform !== 'win32') {
        return spawn(file, [...args], { ...spawnOptions, shell: false });
    }
    const commandLine = cmdCommandLine([file, ...args]);
    return spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${commandLine}"`], {
        ...spawnOptions,
        shell: false,
        windowsVerbatimArguments: true,
    });
}
const PROVISION_COMMAND_TIMEOUT_MS = 120_000;
function commandTimeout(options, fallback) {
    const value = options?.timeoutMs;
    return value === undefined || !Number.isFinite(value) ? fallback : Math.max(0, value);
}
function stoppedBeforeStart(options) {
    const aborted = options?.signal?.aborted === true;
    const timedOut = options?.timeoutMs !== undefined && options.timeoutMs <= 0;
    if (!aborted && !timedOut)
        return undefined;
    return { exitCode: null, stdout: '', stderr: '', timedOut: !aborted && timedOut, aborted };
}
function commandEnvironment(options) {
    const env = { ...process.env, ...normalizedEnvironment(options), CI: 'true' };
    const separator = process.platform === 'win32' ? ';' : ':';
    const parts = (env.PATH ?? '').split(separator).filter(Boolean);
    for (const value of toolSearchDirs()) {
        if (value !== '' && !parts.includes(value))
            parts.push(value);
    }
    env.PATH = parts.join(separator);
    return env;
}
function runProcess(invocation, defaultTimeoutMs, options) {
    const stopped = stoppedBeforeStart(options);
    if (stopped !== undefined)
        return Promise.resolve(stopped);
    return new Promise(resolvePromise => {
        const child = spawnShim(invocation.file, invocation.argv, {
            cwd: invocation.cwd,
            env: commandEnvironment(options),
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: process.platform !== 'win32',
            viaShell: invocation.viaShell,
        });
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        let aborted = false;
        let closed = false;
        let forceTimer;
        const kill = (signal) => {
            if (closed)
                return;
            const killChild = () => {
                if (closed)
                    return;
                try {
                    child.kill(signal);
                }
                catch { /* already gone */ }
            };
            if (process.platform === 'win32' && child.pid !== undefined) {
                let fellBack = false;
                const fallback = () => {
                    if (fellBack)
                        return;
                    fellBack = true;
                    killChild();
                };
                try {
                    const cleanup = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
                    cleanup.once('error', fallback);
                    cleanup.once('close', code => { if (code !== 0)
                        fallback(); });
                }
                catch {
                    fallback();
                }
                return;
            }
            // A wrapper may have exited while its descendants still hold our pipes.
            // Keep signalling its process group until close confirms the run is over.
            try {
                if (child.pid === undefined)
                    killChild();
                else
                    process.kill(-child.pid, signal);
            }
            catch {
                killChild();
            }
        };
        child.stdout?.on('data', chunk => { const value = String(chunk); stdout += value; options?.onStdout?.(value); });
        child.stderr?.on('data', chunk => { const value = String(chunk); stderr += value; options?.onStderr?.(value); });
        const abort = () => {
            if (aborted || closed)
                return;
            aborted = true;
            kill('SIGTERM');
            forceTimer = setTimeout(() => kill('SIGKILL'), 3000);
            forceTimer.unref?.();
        };
        options?.signal?.addEventListener('abort', abort, { once: true });
        if (options?.signal?.aborted === true)
            abort();
        const timer = setTimeout(() => { timedOut = true; kill('SIGKILL'); }, commandTimeout(options, defaultTimeoutMs));
        child.on('error', error => {
            const err = error;
            if (invocation.directPnpm === true && isSpawnEnoent(err))
                stderr += PNPM_DIRECT_SPAWN_ENOENT_HINT;
            else
                stderr += err.message;
        });
        child.on('close', exitCode => {
            closed = true;
            clearTimeout(timer);
            if (forceTimer !== undefined)
                clearTimeout(forceTimer);
            options?.signal?.removeEventListener('abort', abort);
            resolvePromise({ exitCode, stdout, stderr, timedOut, aborted });
        });
    });
}
const runCommand = (file, args, options) => runProcess({ file, argv: [...args], viaShell: winCmdShim }, PROVISION_COMMAND_TIMEOUT_MS, options);
function addPath(env, directory) {
    if (directory === '')
        return env;
    const separator = process.platform === 'win32' ? ';' : ':';
    const parts = (env.PATH ?? '').split(separator).filter(Boolean);
    if (!parts.includes(directory))
        parts.unshift(directory);
    return { ...env, PATH: parts.join(separator) };
}
function commandOutput(result) {
    return `${result.stdout}\n${result.stderr}`.trim().slice(-800);
}
export function createPnpmProvisioner(execute = runCommand) {
    let ready = null;
    return async (options) => {
        if (options?.signal?.aborted === true)
            throw new Error('操作已取消');
        if (ready !== null)
            return ready;
        ready = (async () => {
            let env = commandEnvironment(options);
            const deadline = options?.timeoutMs === undefined ? undefined : Date.now() + commandTimeout(options, PROVISION_COMMAND_TIMEOUT_MS);
            const step = async (file, args) => {
                if (options?.signal?.aborted === true)
                    throw new Error('操作已取消');
                const remaining = deadline === undefined ? undefined : deadline - Date.now();
                if (remaining !== undefined && remaining <= 0)
                    throw new Error('pnpm 准备超时，已停止；请检查工具环境后重试');
                const result = await execute(file, args, {
                    ...options,
                    env,
                    ...(remaining === undefined ? {} : { timeoutMs: Math.min(PROVISION_COMMAND_TIMEOUT_MS, remaining) }),
                });
                if (result.aborted === true || Boolean(options?.signal?.aborted))
                    throw new Error('操作已取消');
                if (result.timedOut)
                    throw new Error('pnpm 准备超时，已停止；请检查工具环境后重试');
                return result;
            };
            const probe = () => step('pnpm', ['--version']);
            if ((await probe()).exitCode === 0)
                return;
            const corepack = await step('corepack', ['enable', 'pnpm']);
            if ((await probe()).exitCode === 0)
                return;
            const npmInstall = await step('npm', ['install', '--global', 'pnpm']);
            const prefix = await step('npm', ['prefix', '--global']);
            if (prefix.exitCode === 0) {
                const globalPrefix = prefix.stdout.trim().split(/\r?\n/).at(-1)?.trim() ?? '';
                env = addPath(env, process.platform === 'win32' ? globalPrefix : join(globalPrefix, 'bin'));
            }
            if ((await probe()).exitCode === 0)
                return;
            const details = [commandOutput(corepack), commandOutput(npmInstall), commandOutput(prefix)]
                .filter(Boolean)
                .join('\n');
            throw new Error(`未找到 pnpm，已尝试 Corepack 和 npm 自动安装；请先安装 Node.js/npm 后重试${details ? `\n${details}` : ''}`);
        })();
        try {
            await ready;
        }
        catch (error) {
            ready = null;
            throw error;
        }
    };
}
export const ensurePnpmAvailable = createPnpmProvisioner();
export const runPluginCli = (profile, args, options) => runProcess(pluginProcess(profile, args), PLUGIN_COMMAND_TIMEOUT_MS, options);
runPluginCli.ensurePnpm = ensurePnpmAvailable;
async function collectDesktopOperation(operation, signal, timeoutSignal, options) {
    let stdout = '';
    let stderr = '';
    operation.stdout.on('data', chunk => {
        const value = String(chunk);
        stdout += value;
        options?.onStdout?.(value);
    });
    operation.stderr.on('data', chunk => {
        const value = String(chunk);
        stderr += value;
        options?.onStderr?.(value);
    });
    const cancel = () => {
        try {
            operation.cancel();
        }
        catch {
            // An AbortSignal listener must not throw into the host's event loop.
            // Keep waiting for done; a failed cancellation is not a stopped process.
            stderr += '\nDesktop 取消请求失败；正在等待宿主操作结束';
        }
    };
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted)
        cancel();
    try {
        const result = await operation.done;
        return {
            exitCode: result.signal === null ? result.exitCode : null,
            stdout,
            stderr,
            timedOut: timeoutSignal.aborted,
            aborted: options?.signal?.aborted === true,
        };
    }
    catch (error) {
        stderr += error instanceof Error ? error.message : String(error);
        return {
            exitCode: null,
            stdout,
            stderr,
            timedOut: timeoutSignal.aborted,
            aborted: options?.signal?.aborted === true,
        };
    }
    finally {
        signal.removeEventListener('abort', cancel);
    }
}
async function runDesktopOperation(start, options) {
    const stopped = stoppedBeforeStart(options);
    if (stopped !== undefined)
        return stopped;
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), commandTimeout(options, PLUGIN_COMMAND_TIMEOUT_MS));
    const signal = options?.signal === undefined ? timeout.signal : AbortSignal.any([options.signal, timeout.signal]);
    try {
        const operation = await start(signal);
        return await collectDesktopOperation(operation, signal, timeout.signal, options);
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * Desktop host runner. Managed npm installs stay on the host `installPlugin`
 * / `runPlugin` path and must not be rewritten through `pluginProcess`.
 * GitHub `&path:` one-click harden (direct pnpm + shell:false) applies to the
 * DSH/web `runPluginCli` path; Desktop skins that need `&path:` are typically
 * `manual-only` / not Desktop-managed.
 */
export function desktopRunner(service, profileDir) {
    const runner = (_profile, args, options) => runDesktopOperation(signal => service.runPlugin(args, profileDir, signal), options);
    runner.hostKind = 'desktop';
    runner.installPlugin = (_profile, request, options) => runDesktopOperation(signal => service.installPlugin({
        pnpmOptions: request.pnpmOptions,
        invokingDir: profileDir,
        recovery: {
            packageName: request.packageName,
            packageVersion: request.packageVersion,
            receiptId: request.receiptId,
        },
        signal,
    }), options);
    return runner;
}
export function commandError(result) {
    if (result.aborted)
        return '操作已取消';
    if (result.timedOut)
        return '插件命令执行超时，已停止；请复制日志查看失败步骤';
    const output = `${result.stdout}\n${result.stderr}`.trim();
    if (/\[23\].*aborted due to timeout|TimeoutError: The operation was aborted due to timeout/is.test(output)) {
        return 'GitHub 插件下载超时；安装包较大或当前网络较慢，请检查网络后重试';
    }
    // Direct `&path:` pnpm spawn: surface actionable guidance instead of raw Node ENOENT.
    if (output.includes(PNPM_DIRECT_SPAWN_ENOENT_HINT) || /spawn\s+\S*pnpm\S*.*ENOENT/i.test(output)) {
        return PNPM_DIRECT_SPAWN_ENOENT_HINT;
    }
    return (output || `plugin command exited ${String(result.exitCode)}`).slice(-1600);
}
