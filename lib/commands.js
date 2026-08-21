import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
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
function dshInvocation() {
    const entry = process.argv[1];
    if (entry !== undefined && /[\\/](?:bin\.(?:js|ts)|dsh)$/.test(entry)) {
        const absolute = resolve(entry);
        return { file: process.execPath, prefix: [...process.execArgv, absolute], cwd: dirname(absolute), viaShell: false };
    }
    return { file: 'dsh', prefix: [], viaShell: winCmdShim };
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
export const runPluginCli = (profile, args, options) => new Promise(resolvePromise => {
    const invocation = dshInvocation();
    const env = { ...process.env, ...normalizedEnvironment(options), CI: 'true' };
    if (process.platform !== 'win32') {
        const parts = (env.PATH ?? '').split(':').filter(Boolean);
        for (const value of ['/opt/homebrew/bin', '/usr/local/bin', join(process.env.HOME ?? '', '.local', 'bin')]) {
            if (value !== '' && !parts.includes(value))
                parts.push(value);
        }
        env.PATH = parts.join(':');
    }
    const child = spawnShim(invocation.file, [...invocation.prefix, 'plugin', '--profile', profile, ...args], {
        cwd: invocation.cwd,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        viaShell: invocation.viaShell,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = options?.signal?.aborted === true;
    const kill = (signal) => {
        if (child.pid === undefined || child.exitCode !== null)
            return;
        try {
            if (process.platform === 'win32')
                child.kill(signal);
            else
                process.kill(-child.pid, signal);
        }
        catch { /* the process may have exited between the checks */ }
    };
    child.stdout?.on('data', chunk => {
        const value = String(chunk);
        stdout += value;
        options?.onStdout?.(value);
    });
    child.stderr?.on('data', chunk => {
        const value = String(chunk);
        stderr += value;
        options?.onStderr?.(value);
    });
    const abort = () => {
        aborted = true;
        kill('SIGTERM');
        const forceTimer = setTimeout(() => kill('SIGKILL'), 3000);
        forceTimer.unref?.();
    };
    options?.signal?.addEventListener('abort', abort, { once: true });
    if (aborted)
        abort();
    const timer = setTimeout(() => { timedOut = true; kill('SIGKILL'); }, PLUGIN_COMMAND_TIMEOUT_MS);
    child.on('error', error => { stderr += error.message; });
    child.on('close', exitCode => {
        clearTimeout(timer);
        options?.signal?.removeEventListener('abort', abort);
        resolvePromise({ exitCode, stdout, stderr, timedOut, aborted });
    });
});
export function desktopRunner(service, profileDir) {
    return async (_profile, args, options) => {
        const timeout = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; timeout.abort(); }, PLUGIN_COMMAND_TIMEOUT_MS);
        const signal = options?.signal === undefined ? timeout.signal : AbortSignal.any([options.signal, timeout.signal]);
        // Desktop hosts reject `plugin add` through runPlugin: profile-mutating
        // installs must cross the recoverable install boundary. Adds that carry
        // an installRecovery record use runPluginInstall; adds redirected into a
        // temporary directory (prefetch) never touch the profile, so they run
        // through the packaged pnpm directly.
        let operation;
        if (args[0] === 'add' && options?.installRecovery !== undefined && typeof service.runPluginInstall === 'function') {
            operation = await service.runPluginInstall(args, profileDir, options.installRecovery, signal);
        }
        else if (args[0] === 'add' && args.includes('--dir') && typeof service.run === 'function') {
            operation = service.run(args, signal);
        }
        else {
            operation = service.runPlugin(args, profileDir, signal, normalizedEnvironment(options));
        }
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
        try {
            const result = await operation.done;
            return { exitCode: result.exitCode, stdout, stderr, timedOut, aborted: options?.signal?.aborted === true };
        }
        finally {
            clearTimeout(timer);
        }
    };
}
export function commandError(result) {
    if (result.aborted)
        return '操作已取消';
    if (result.timedOut)
        return '插件安装超过 10 分钟，已停止；请检查网络后重试';
    const output = `${result.stdout}\n${result.stderr}`.trim();
    if (/\[23\].*aborted due to timeout|TimeoutError: The operation was aborted due to timeout/is.test(output)) {
        return 'GitHub 插件下载超时；安装包较大或当前网络较慢，请检查网络后重试';
    }
    return (output || `plugin command exited ${String(result.exitCode)}`).slice(-1600);
}
