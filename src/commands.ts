import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { resolveProfileDir } from './profile.ts'
import type { MarketHostKind } from './types.ts'

export interface CommandResult {
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  aborted?: boolean
}

export interface CommandOptions {
  signal?: AbortSignal
  /** Remaining command budget; provisioning shares it across all setup steps. */
  timeoutMs?: number
  env?: NodeJS.ProcessEnv
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
}

export type CommandExecutor = (file: string, args: readonly string[], options?: CommandOptions) => Promise<CommandResult>

export interface PluginInstallRequest {
  packageName: string
  packageVersion: string
  receiptId: string
  pnpmOptions?: readonly string[]
}

export interface PluginRunner {
  (profile: string, args: readonly string[], options?: CommandOptions): Promise<CommandResult>
  hostKind?: MarketHostKind
  ensurePnpm?: (options?: CommandOptions) => Promise<void>
  installPlugin?: (profile: string, request: PluginInstallRequest, options?: CommandOptions) => Promise<CommandResult>
}
export function normalizedEnvironment(options?: CommandOptions): NodeJS.ProcessEnv | undefined {
  if (options?.env === undefined) return undefined
  const env = { ...options.env }
  // pnpm 11 reads numeric config values from pnpm_config_* snake-case vars.
  // Keep accepting the earlier npm-style key so older callers get the fix too.
  const legacyFetchTimeout = env['npm_config-fetch-timeout']
  if (env.pnpm_config_fetch_timeout === undefined && legacyFetchTimeout !== undefined) env.pnpm_config_fetch_timeout = legacyFetchTimeout
  return env
}

const PLUGIN_COMMAND_TIMEOUT_MS = 10 * 60 * 1000
export const winCmdShim = process.platform === 'win32'

function dshInvocation(): { file: string; prefix: string[]; cwd?: string; viaShell: boolean } {
  const entry = process.argv[1]
  if (entry !== undefined && /[\\/](?:bin\.(?:js|ts)|dsh)$/.test(entry)) {
    const absolute = resolve(entry)
    return { file: process.execPath, prefix: [...process.execArgv, absolute], cwd: dirname(absolute), viaShell: false }
  }
  return { file: 'dsh', prefix: [], viaShell: winCmdShim }
}

export interface PluginProcess {
  file: string
  argv: string[]
  cwd?: string
  viaShell: boolean
}

/**
 * Choose how to run a profile plugin command.
 *
 * Specs with `&path:` cannot go through `dsh plugin` on Windows: DSH forwards
 * to pnpm with `shell: true`, and cmd.exe splits on `&`. Same policy as
 * dsh-market's TARGET_RE (reject `&` at the dsh boundary); here we keep the
 * pinned `#commit&path:/` form and spawn pnpm ourselves.
 */
export function pluginProcess(profile: string, args: readonly string[]): PluginProcess {
  if (args.some(arg => arg.includes('&'))) {
    const profileDir = resolveProfileDir(profile)
    return {
      file: 'pnpm',
      argv: args.includes('--dir') ? [...args] : [...args, '--dir', profileDir],
      cwd: profileDir,
      viaShell: winCmdShim,
    }
  }
  const invocation = dshInvocation()
  return {
    file: invocation.file,
    argv: [...invocation.prefix, 'plugin', '--profile', profile, ...args],
    cwd: invocation.cwd,
    viaShell: invocation.viaShell,
  }
}

/** Characters that cmd.exe reinterprets when it reparses a command line. */
const CMD_METACHARS = /[\s"&|<>^()%!]/

/** Quote one argv token before passing it through cmd.exe. */
export function quoteCmdArg(arg: string): string {
  if (!CMD_METACHARS.test(arg)) return arg
  return `"${arg.replace(/"/g, '""')}"`
}

/** Build the command line used by the explicit Windows cmd.exe bridge. */
export function cmdCommandLine(argv: readonly string[]): string {
  return argv.map(quoteCmdArg).join(' ')
}

type SpawnShimOptions = SpawnOptions & { viaShell?: boolean }

/**
 * Start a command without Node's shell:true + argv re-serialization. Windows
 * command shims still need cmd.exe, so use an explicit, quoted /c boundary.
 */
function spawnShim(file: string, args: readonly string[], options: SpawnShimOptions): ChildProcess {
  const { viaShell = false, ...spawnOptions } = options
  if (!viaShell || process.platform !== 'win32') {
    return spawn(file, [...args], { ...spawnOptions, shell: false })
  }
  const commandLine = cmdCommandLine([file, ...args])
  return spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${commandLine}"`], {
    ...spawnOptions,
    shell: false,
    windowsVerbatimArguments: true,
  })
}

const PROVISION_COMMAND_TIMEOUT_MS = 120_000

function commandTimeout(options: CommandOptions | undefined, fallback: number): number {
  const value = options?.timeoutMs
  return value === undefined || !Number.isFinite(value) ? fallback : Math.max(0, value)
}

function stoppedBeforeStart(options?: CommandOptions): CommandResult | undefined {
  const aborted = options?.signal?.aborted === true
  const timedOut = options?.timeoutMs !== undefined && options.timeoutMs <= 0
  if (!aborted && !timedOut) return undefined
  return { exitCode: null, stdout: '', stderr: '', timedOut: !aborted && timedOut, aborted }
}

function commandEnvironment(options?: CommandOptions): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...normalizedEnvironment(options), CI: 'true' }
  if (process.platform !== 'win32') {
    const parts = (env.PATH ?? '').split(':').filter(Boolean)
    for (const value of ['/opt/homebrew/bin', '/usr/local/bin', join(process.env.HOME ?? '', '.local', 'bin')]) {
      if (value !== '' && !parts.includes(value)) parts.push(value)
    }
    env.PATH = parts.join(':')
  }
  return env
}

function runProcess(invocation: PluginProcess, defaultTimeoutMs: number, options?: CommandOptions): Promise<CommandResult> {
  const stopped = stoppedBeforeStart(options)
  if (stopped !== undefined) return Promise.resolve(stopped)
  return new Promise(resolvePromise => {
    const child = spawnShim(invocation.file, invocation.argv, {
      cwd: invocation.cwd,
      env: commandEnvironment(options),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      viaShell: invocation.viaShell,
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let aborted = false
    let closed = false
    let forceTimer: ReturnType<typeof setTimeout> | undefined
    const kill = (signal: NodeJS.Signals): void => {
      if (closed) return
      const killChild = (): void => {
        if (closed) return
        try { child.kill(signal) } catch { /* already gone */ }
      }
      if (process.platform === 'win32' && child.pid !== undefined) {
        let fellBack = false
        const fallback = (): void => {
          if (fellBack) return
          fellBack = true
          killChild()
        }
        try {
          const cleanup = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true })
          cleanup.once('error', fallback)
          cleanup.once('close', code => { if (code !== 0) fallback() })
        } catch { fallback() }
        return
      }
      // A wrapper may have exited while its descendants still hold our pipes.
      // Keep signalling its process group until close confirms the run is over.
      try {
        if (child.pid === undefined) killChild()
        else process.kill(-child.pid, signal)
      } catch { killChild() }
    }
    child.stdout?.on('data', chunk => { const value = String(chunk); stdout += value; options?.onStdout?.(value) })
    child.stderr?.on('data', chunk => { const value = String(chunk); stderr += value; options?.onStderr?.(value) })
    const abort = (): void => {
      if (aborted || closed) return
      aborted = true
      kill('SIGTERM')
      forceTimer = setTimeout(() => kill('SIGKILL'), 3000)
      forceTimer.unref?.()
    }
    options?.signal?.addEventListener('abort', abort, { once: true })
    if (options?.signal?.aborted === true) abort()
    const timer = setTimeout(() => { timedOut = true; kill('SIGKILL') }, commandTimeout(options, defaultTimeoutMs))
    child.on('error', error => { stderr += error.message })
    child.on('close', exitCode => {
      closed = true
      clearTimeout(timer)
      if (forceTimer !== undefined) clearTimeout(forceTimer)
      options?.signal?.removeEventListener('abort', abort)
      resolvePromise({ exitCode, stdout, stderr, timedOut, aborted })
    })
  })
}

const runCommand: CommandExecutor = (file, args, options) => runProcess(
  { file, argv: [...args], viaShell: winCmdShim }, PROVISION_COMMAND_TIMEOUT_MS, options,
)

function addPath(env: NodeJS.ProcessEnv, directory: string): NodeJS.ProcessEnv {
  if (directory === '') return env
  const separator = process.platform === 'win32' ? ';' : ':'
  const parts = (env.PATH ?? '').split(separator).filter(Boolean)
  if (!parts.includes(directory)) parts.unshift(directory)
  return { ...env, PATH: parts.join(separator) }
}

function commandOutput(result: CommandResult): string {
  return `${result.stdout}\n${result.stderr}`.trim().slice(-800)
}

export function createPnpmProvisioner(execute: CommandExecutor = runCommand): (options?: CommandOptions) => Promise<void> {
  let ready: Promise<void> | null = null
  return async (options?: CommandOptions): Promise<void> => {
    if (options?.signal?.aborted === true) throw new Error('操作已取消')
    if (ready !== null) return ready
    ready = (async () => {
      let env = commandEnvironment(options)
      const deadline = options?.timeoutMs === undefined ? undefined : Date.now() + commandTimeout(options, PROVISION_COMMAND_TIMEOUT_MS)
      const step = async (file: string, args: readonly string[]): Promise<CommandResult> => {
        if (options?.signal?.aborted === true) throw new Error('操作已取消')
        const remaining = deadline === undefined ? undefined : deadline - Date.now()
        if (remaining !== undefined && remaining <= 0) throw new Error('pnpm 准备超时，已停止；请检查工具环境后重试')
        const result = await execute(file, args, {
          ...options,
          env,
          ...(remaining === undefined ? {} : { timeoutMs: Math.min(PROVISION_COMMAND_TIMEOUT_MS, remaining) }),
        })
        if (result.aborted === true || Boolean(options?.signal?.aborted)) throw new Error('操作已取消')
        if (result.timedOut) throw new Error('pnpm 准备超时，已停止；请检查工具环境后重试')
        return result
      }
      const probe = (): Promise<CommandResult> => step('pnpm', ['--version'])
      if ((await probe()).exitCode === 0) return

      const corepack = await step('corepack', ['enable', 'pnpm'])
      if ((await probe()).exitCode === 0) return

      const npmInstall = await step('npm', ['install', '--global', 'pnpm'])
      const prefix = await step('npm', ['prefix', '--global'])
      if (prefix.exitCode === 0) {
        const globalPrefix = prefix.stdout.trim().split(/\r?\n/).at(-1)?.trim() ?? ''
        env = addPath(env, process.platform === 'win32' ? globalPrefix : join(globalPrefix, 'bin'))
      }
      if ((await probe()).exitCode === 0) return

      const details = [commandOutput(corepack), commandOutput(npmInstall), commandOutput(prefix)]
        .filter(Boolean)
        .join('\n')
      throw new Error(`未找到 pnpm，已尝试 Corepack 和 npm 自动安装；请先安装 Node.js/npm 后重试${details ? `\n${details}` : ''}`)
    })()
    try {
      await ready
    } catch (error) {
      ready = null
      throw error
    }
  }
}

export const ensurePnpmAvailable = createPnpmProvisioner()

export const runPluginCli: PluginRunner = (profile, args, options) => runProcess(
  pluginProcess(profile, args), PLUGIN_COMMAND_TIMEOUT_MS, options,
)
runPluginCli.ensurePnpm = ensurePnpmAvailable

export interface DesktopPnpmLike {
  runPlugin(args: readonly string[], invokingDir: string, signal?: AbortSignal): {
    stdout: NodeJS.ReadableStream
    stderr: NodeJS.ReadableStream
    done: Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>
    cancel(): void
  }
  installPlugin(request: {
    pnpmOptions?: readonly string[]
    invokingDir: string
    recovery: { packageName: string; packageVersion: string; receiptId: string }
    signal?: AbortSignal
  }): Promise<{
    stdout: NodeJS.ReadableStream
    stderr: NodeJS.ReadableStream
    done: Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>
    cancel(): void
  }>
}

interface DesktopOperation {
  stdout: NodeJS.ReadableStream
  stderr: NodeJS.ReadableStream
  done: Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>
  cancel(): void
}

async function collectDesktopOperation(
  operation: DesktopOperation,
  signal: AbortSignal,
  timeoutSignal: AbortSignal,
  options?: CommandOptions,
): Promise<CommandResult> {
  let stdout = ''
  let stderr = ''
  operation.stdout.on('data', chunk => {
    const value = String(chunk)
    stdout += value
    options?.onStdout?.(value)
  })
  operation.stderr.on('data', chunk => {
    const value = String(chunk)
    stderr += value
    options?.onStderr?.(value)
  })
  const cancel = (): void => {
    try { operation.cancel() } catch {
      // An AbortSignal listener must not throw into the host's event loop.
      // Keep waiting for done; a failed cancellation is not a stopped process.
      stderr += '\nDesktop 取消请求失败；正在等待宿主操作结束'
    }
  }
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) cancel()
  try {
    const result = await operation.done
    return {
      exitCode: result.signal === null ? result.exitCode : null,
      stdout,
      stderr,
      timedOut: timeoutSignal.aborted,
      aborted: options?.signal?.aborted === true,
    }
  } catch (error) {
    stderr += error instanceof Error ? error.message : String(error)
    return {
      exitCode: null,
      stdout,
      stderr,
      timedOut: timeoutSignal.aborted,
      aborted: options?.signal?.aborted === true,
    }
  } finally {
    signal.removeEventListener('abort', cancel)
  }
}

async function runDesktopOperation(
  start: (signal: AbortSignal) => DesktopOperation | Promise<DesktopOperation>,
  options?: CommandOptions,
): Promise<CommandResult> {
  const stopped = stoppedBeforeStart(options)
  if (stopped !== undefined) return stopped
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), commandTimeout(options, PLUGIN_COMMAND_TIMEOUT_MS))
  const signal = options?.signal === undefined ? timeout.signal : AbortSignal.any([options.signal, timeout.signal])
  try {
    const operation = await start(signal)
    return await collectDesktopOperation(operation, signal, timeout.signal, options)
  } finally {
    clearTimeout(timer)
  }
}

export function desktopRunner(service: DesktopPnpmLike, profileDir: string): PluginRunner {
  const runner: PluginRunner = (_profile, args, options) => runDesktopOperation(
    signal => service.runPlugin(args, profileDir, signal),
    options,
  )
  runner.hostKind = 'desktop'
  runner.installPlugin = (_profile, request, options) => runDesktopOperation(
    signal => service.installPlugin({
      pnpmOptions: request.pnpmOptions,
      invokingDir: profileDir,
      recovery: {
        packageName: request.packageName,
        packageVersion: request.packageVersion,
        receiptId: request.receiptId,
      },
      signal,
    }),
    options,
  )
  return runner
}

export function commandError(result: CommandResult): string {
  if (result.aborted) return '操作已取消'
  if (result.timedOut) return '插件命令执行超时，已停止；请复制日志查看失败步骤'
  const output = `${result.stdout}\n${result.stderr}`.trim()
  if (/\[23\].*aborted due to timeout|TimeoutError: The operation was aborted due to timeout/is.test(output)) {
    return 'GitHub 插件下载超时；安装包较大或当前网络较慢，请检查网络后重试'
  }
  return (output || `plugin command exited ${String(result.exitCode)}`).slice(-1600)
}
