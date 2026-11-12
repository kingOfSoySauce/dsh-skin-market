import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { resolveProfileDir } from './profile.ts'
import type { MarketHostKind } from './types.ts'
import type { OfficialInstallProgress, OfficialManagementAdapter, OfficialManagementResult } from './official-desktop.ts'
import { normalizeRegistryBase, registryPlanFromSnapshot, type RegistryPlanProvider } from './registry-plan.ts'
import { MarketMessageError } from './operation-message.ts'

export interface CommandResult {
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  aborted?: boolean
  management?: OfficialManagementResult
}

export interface CommandOptions {
  signal?: AbortSignal
  /** Remaining command budget; provisioning shares it across all setup steps. */
  timeoutMs?: number
  env?: NodeJS.ProcessEnv
  onStdout?: (chunk: string) => void
  onStderr?: (chunk: string) => void
  onManagementState?: (state: OfficialInstallProgress) => void
}

export type CommandExecutor = (file: string, args: readonly string[], options?: CommandOptions) => Promise<CommandResult>

export interface PluginInstallRequest {
  packageName: string
  packageVersion: string
  /** A reviewed pinned source; only the official manager accepts non-npm specs. */
  spec?: string
  receiptId: string
  pnpmOptions?: readonly string[]
  /** Exact pending package names explicitly approved by the user. */
  approvedBuilds?: readonly string[]
  registry?: string | null
  saveExact?: boolean
}

/** The launcher-published pnpm executable and environment for one profile. */
export interface HostPnpmInvocation {
  command: string
  args?: readonly string[]
  env?: Readonly<Record<string, string>>
}

export interface PluginRunner {
  (profile: string, args: readonly string[], options?: CommandOptions): Promise<CommandResult>
  hostKind?: MarketHostKind
  ensurePnpm?: (options?: CommandOptions) => Promise<void>
  installPlugin?: (profile: string, request: PluginInstallRequest, options?: CommandOptions) => Promise<CommandResult>
  management?: OfficialManagementAdapter
  /**
   * Run the host's own pnpm against the profile without going through the
   * plugin manager. Official Desktop refuses to re-add an installed package
   * (HMR), and its managed remove-then-install unloads this plugin before the
   * install step can run, so a self-update has to overlay the package here.
   */
  hostPnpm?: (args: readonly string[], options?: CommandOptions) => Promise<CommandResult>
  /** Ordered registry bases supplied by the host for package operations. */
  registryPlan?: RegistryPlanProvider
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

/**
 * Bilingual guidance when `&path:` installs cannot start pnpm with shell:false.
 * Common on Windows when PATH only has a `pnpm.cmd` shim.
 */
export const PNPM_DIRECT_SPAWN_ENOENT_HINT =
  '无法以 shell:false 启动真实 pnpm（常见原因：PATH 上只有 pnpm.cmd，而含 &path: 的安装不能再走 cmd 二次解析）。请确保存在 pnpm.exe、Corepack 激活的 pnpm，或可用 `node` 直接运行的 pnpm.cjs；可执行 `corepack enable pnpm` / 重装 pnpm 后重试。 / Could not spawn a real pnpm binary with shell:false (often PATH only has pnpm.cmd). Ensure pnpm.exe, Corepack-enabled pnpm, or node+pnpm.cjs is available — then retry (`corepack enable pnpm` or reinstall pnpm).'

/**
 * Directories that commonly hold pnpm when GUI/desktop launches omit shell PATH
 * (same spirit as dsh-market toolSearchDirs).
 */
export function toolSearchDirs(
  platform: string = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
  nodeDir: string = dirname(process.execPath),
): string[] {
  const dirs: string[] = []
  const pnpmHome = (env.PNPM_HOME ?? '').trim()
  if (pnpmHome !== '') dirs.push(pnpmHome)
  if (platform === 'win32') {
    const local = (env.LOCALAPPDATA ?? '').trim()
    const roaming = (env.APPDATA ?? '').trim()
    if (local !== '') dirs.push(join(local, 'pnpm'))
    if (roaming !== '') dirs.push(join(roaming, 'npm'))
  } else {
    dirs.push('/opt/homebrew/bin', '/usr/local/bin', join(home, '.local', 'bin'))
    dirs.push(join(home, 'Library', 'pnpm'), join(home, '.local', 'share', 'pnpm'))
  }
  dirs.push(nodeDir)
  return [...new Set(dirs.filter(dir => dir.trim() !== ''))]
}

/**
 * Windows `process.env` is case-insensitive (`Path` === `PATH`); spreading it
 * into a plain object is not. Prefer the last existing casing so a later write
 * wins, and default to `Path` on Windows when the key is absent.
 */
export function pathKey(env: NodeJS.ProcessEnv, platform: string = process.platform): string {
  const existing = Object.keys(env).reverse().find(key => key.toUpperCase() === 'PATH')
  if (existing !== undefined) return existing
  return platform === 'win32' ? 'Path' : 'PATH'
}

export function pathValue(env: NodeJS.ProcessEnv, platform: string = process.platform): string {
  return env[pathKey(env, platform)] ?? ''
}

function assignPath(env: NodeJS.ProcessEnv, value: string, platform: string = process.platform): void {
  const key = pathKey(env, platform)
  for (const existing of Object.keys(env)) {
    if (existing.toUpperCase() === 'PATH' && existing !== key) delete env[existing]
  }
  env[key] = value
}

function pathEntries(env: NodeJS.ProcessEnv, platform: string): string[] {
  const separator = platform === 'win32' ? ';' : ':'
  return pathValue(env, platform).split(separator).filter(Boolean)
}

export interface PnpmDirectSpawn {
  file: string
  prefix: string[]
}

/**
 * Resolve a real pnpm entrypoint for `shell: false` spawns (`&path:` installs).
 * Prefer `pnpm.exe`, then `node` + absolute `pnpm.cjs` / Corepack script.
 * Never returns a `.cmd`/`.bat` shim — those need the quoted cmd bridge and
 * would reintroduce `&` truncation. Falls back to bare `pnpm` (may ENOENT on
 * Windows when only a shim exists; callers map that to PNPM_DIRECT_SPAWN_ENOENT_HINT).
 */
export function resolvePnpmForDirectSpawn(options?: {
  platform?: string
  env?: NodeJS.ProcessEnv
  home?: string
  execPath?: string
}): PnpmDirectSpawn {
  const platform = options?.platform ?? process.platform
  const env = options?.env ?? process.env
  const home = options?.home ?? homedir()
  const execPath = options?.execPath ?? process.execPath
  const search = [...toolSearchDirs(platform, env, home, dirname(execPath)), ...pathEntries(env, platform)]

  if (platform === 'win32') {
    for (const dir of search) {
      const exe = join(dir, 'pnpm.exe')
      if (existsSync(exe)) return { file: exe, prefix: [] }
    }
  } else {
    for (const dir of search) {
      const bin = join(dir, 'pnpm')
      if (existsSync(bin)) return { file: bin, prefix: [] }
    }
  }

  const scriptRelatives = [
    'pnpm.cjs',
    join('bin', 'pnpm.cjs'),
    join('node_modules', 'pnpm', 'bin', 'pnpm.cjs'),
    join('node_modules', 'corepack', 'dist', 'pnpm.js'),
    join('node_modules', 'corepack', 'dist', 'pnpm.cjs'),
  ]
  for (const dir of search) {
    for (const relative of scriptRelatives) {
      const script = join(dir, relative)
      if (existsSync(script)) return { file: execPath, prefix: [script] }
    }
  }

  return { file: 'pnpm', prefix: [] }
}

function isSpawnEnoent(error: NodeJS.ErrnoException): boolean {
  return error.code === 'ENOENT' || /ENOENT/i.test(error.message ?? '')
}

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
  /** True when spawning pnpm directly for `&`-bearing argv (shell:false). */
  directPnpm?: boolean
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
    // Keep `&path:` as one argv element. Do not re-enter cmd.exe: a second
    // parse can truncate left-of-`&` and pnpm still exits 0 with the repo
    // root package. Resolve pnpm.exe or node→pnpm.cjs; bare pnpm.cmd is not
    // enough for shell:false. Non-`&` / provisioning still use the quoted
    // cmd bridge for .cmd shims via ensurePnpmAvailable / dshInvocation.
    // Windows cannot spawn pnpm.cmd with shell:false; resolve pnpm.exe /
    // node+pnpm.cjs. Unix can spawn the PATH `pnpm` script directly.
    const pnpm = process.platform === 'win32' ? resolvePnpmForDirectSpawn() : { file: 'pnpm', prefix: [] as string[] }
    const pluginArgs = args.includes('--dir') ? [...args] : [...args, '--dir', profileDir]
    return {
      file: pnpm.file,
      argv: [...pnpm.prefix, ...pluginArgs],
      cwd: profileDir,
      viaShell: false,
      directPnpm: true,
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
  const separator = process.platform === 'win32' ? ';' : ':'
  const parts = pathValue(env).split(separator).filter(Boolean)
  for (const value of toolSearchDirs()) {
    if (value !== '' && !parts.includes(value)) parts.push(value)
  }
  assignPath(env, parts.join(separator))
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
    child.on('error', error => {
      const err = error as NodeJS.ErrnoException
      if (invocation.directPnpm === true && isSpawnEnoent(err)) stderr += PNPM_DIRECT_SPAWN_ENOENT_HINT
      else stderr += err.message
    })
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
  const parts = pathValue(env).split(separator).filter(Boolean)
  if (!parts.includes(directory)) parts.unshift(directory)
  const next = { ...env }
  assignPath(next, parts.join(separator))
  return next
}

function commandOutput(result: CommandResult): string {
  return `${result.stdout}\n${result.stderr}`.trim().slice(-800)
}

export function createPnpmProvisioner(execute: CommandExecutor = runCommand): (options?: CommandOptions) => Promise<void> {
  let ready: Promise<void> | null = null
  return async (options?: CommandOptions): Promise<void> => {
    if (options?.signal?.aborted === true) throw new MarketMessageError('操作已取消', 'common.cancelled')
    if (ready !== null) return ready
    ready = (async () => {
      let env = commandEnvironment(options)
      const deadline = options?.timeoutMs === undefined ? undefined : Date.now() + commandTimeout(options, PROVISION_COMMAND_TIMEOUT_MS)
      const step = async (file: string, args: readonly string[]): Promise<CommandResult> => {
        if (options?.signal?.aborted === true) throw new MarketMessageError('操作已取消', 'common.cancelled')
        const remaining = deadline === undefined ? undefined : deadline - Date.now()
        if (remaining !== undefined && remaining <= 0) throw new MarketMessageError('pnpm 准备超时，已停止；请检查工具环境后重试', 'failure.timeoutProblem')
        const result = await execute(file, args, {
          ...options,
          env,
          ...(remaining === undefined ? {} : { timeoutMs: Math.min(PROVISION_COMMAND_TIMEOUT_MS, remaining) }),
        })
        if (result.aborted === true || Boolean(options?.signal?.aborted)) throw new MarketMessageError('操作已取消', 'common.cancelled')
        if (result.timedOut) throw new MarketMessageError('pnpm 准备超时，已停止；请检查工具环境后重试', 'failure.timeoutProblem')
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
      throw new MarketMessageError(`未找到 pnpm，已尝试 Corepack 和 npm 自动安装；请先安装 Node.js/npm 后重试${details ? `\n${details}` : ''}`, 'failure.pnpmProblem')
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

export function createPluginCliRunner(registryPlan?: RegistryPlanProvider): PluginRunner {
  const runner: PluginRunner = (profile, args, options) => runProcess(
    pluginProcess(profile, args), PLUGIN_COMMAND_TIMEOUT_MS, options,
  )
  runner.ensurePnpm = ensurePnpmAvailable
  if (registryPlan !== undefined) runner.registryPlan = registryPlan
  return runner
}

/**
 * Run the host-published pnpm in a profile directory.
 *
 * The executable is Electron (or the app's own node) plus a pnpm entry, and
 * its environment is the one the host uses for its own package operations, so
 * it is passed through as published. The callback is read per call because a
 * launcher may publish the invocation after this plugin mounts.
 */
export function hostPnpmRunner(
  invocation: () => HostPnpmInvocation | undefined,
  cwd: string,
): NonNullable<PluginRunner['hostPnpm']> {
  return (args, options) => {
    const host = invocation()
    if (host === undefined || host.command.trim() === '') {
      return Promise.resolve({ exitCode: null, stdout: '', stderr: '当前 DSH 未提供宿主 pnpm', timedOut: false })
    }
    return runProcess({
      file: host.command,
      argv: [...(host.args ?? []), ...args],
      cwd,
      viaShell: process.platform === 'win32' && /\.cmd$/i.test(host.command),
    }, PLUGIN_COMMAND_TIMEOUT_MS, {
      ...options,
      env: { ...host.env, ...options?.env },
    })
  }
}

export const runPluginCli: PluginRunner = createPluginCliRunner()

interface DesktopOperation {
  stdout: NodeJS.ReadableStream
  stderr: NodeJS.ReadableStream
  done: Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>
  cancel(): void
}

export interface DesktopPnpmLike {
  runPlugin(args: readonly string[], invokingDir: string, signal?: AbortSignal): DesktopOperation
  /** Configured registry and ordered fallbacks, when exposed by the host. */
  registries?(): Promise<unknown>
  /** Hosts that still book a recovery receipt. Absent on Anywhere Labs Desktop 2.x. */
  installPlugin?(request: {
    pnpmOptions?: readonly string[]
    registry?: string | null
    invokingDir: string
    recovery: { packageName: string; packageVersion: string; receiptId: string }
    signal?: AbortSignal
  }): Promise<DesktopOperation>
  /**
   * Anywhere Labs narrow install boundary. Optional: other desktop hosts keep
   * `installPlugin` or only `runPlugin`. Accepts `add`, flag options, and one
   * exact `name@version`. No receipt, snapshot, or rollback.
   */
  runExternalMarketPluginInstall?(
    args: readonly string[],
    invokingDir: string,
    signal?: AbortSignal,
  ): DesktopOperation
}

const NPM_PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u
const NPM_EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u
const DESKTOP_NPM_ONLY = '当前桌面宿主仅支持已验证的 npm 安装包'
const DESKTOP_INSTALL_UNAVAILABLE = '当前桌面宿主未提供受支持的插件安装服务'

function externalMarketInstallArgv(request: PluginInstallRequest): readonly string[] | undefined {
  if (!NPM_PACKAGE_NAME.test(request.packageName) || !NPM_EXACT_VERSION.test(request.packageVersion)) return undefined
  const flags = request.pnpmOptions ?? []
  if (flags.some(flag => !flag.startsWith('-') || flag.includes('\0'))) return undefined
  const normalizedRegistry = request.registry === undefined || request.registry === null ? null : normalizeRegistryBase(request.registry)
  if (request.registry !== undefined && request.registry !== null && normalizedRegistry === null) return undefined
  const registry = normalizedRegistry === null ? [] : [`--registry=${normalizedRegistry}`]
  return ['add', ...flags, ...registry, `${request.packageName}@${request.packageVersion}`]
}

function desktopInstallRejected(stderr: string): Promise<CommandResult> {
  return Promise.resolve({ exitCode: 1, stdout: '', stderr, timedOut: false })
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

/**
 * Desktop host runner. Managed npm installs use `installPlugin` when the host
 * still provides it. Anywhere Labs Desktop 2.x exposes
 * `runExternalMarketPluginInstall` instead: `add`, the caller's flag options,
 * and one exact `name@version`, with no receipt. Other commands stay on
 * `runPlugin`. Neither path is rewritten through `pluginProcess`.
 * GitHub `&path:` one-click harden (direct pnpm + shell:false) applies to the
 * DSH/web `runPluginCli` path; Desktop skins that need `&path:` are typically
 * `manual-only` / not Desktop-managed.
 */
export function desktopRunner(service: DesktopPnpmLike, profileDir: string): PluginRunner {
  const runner: PluginRunner = (_profile, args, options) => runDesktopOperation(
    signal => service.runPlugin(args, profileDir, signal),
    options,
  )
  runner.hostKind = 'desktop'
  if (typeof service.registries === 'function') {
    runner.registryPlan = async () => {
      try {
        return registryPlanFromSnapshot(await service.registries!())
      } catch {
        return undefined
      }
    }
  }
  runner.installPlugin = (_profile, request, options) => {
    if (request.spec !== undefined && request.spec !== `${request.packageName}@${request.packageVersion}`) {
      return desktopInstallRejected(DESKTOP_NPM_ONLY)
    }
    if (typeof service.installPlugin === 'function') {
      return runDesktopOperation(
        signal => service.installPlugin!({
          pnpmOptions: request.pnpmOptions,
          registry: request.registry,
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
    }
    const boundary = typeof service.runExternalMarketPluginInstall === 'function'
      ? service.runExternalMarketPluginInstall.bind(service)
      : undefined
    if (typeof boundary !== 'function') return desktopInstallRejected(DESKTOP_INSTALL_UNAVAILABLE)
    const argv = externalMarketInstallArgv(request)
    if (argv === undefined) return desktopInstallRejected(DESKTOP_NPM_ONLY)
    return runDesktopOperation(signal => boundary(argv, profileDir, signal), options)
  }
  return runner
}

export function commandError(result: CommandResult): string {
  if (result.aborted) return '操作已取消'
  if (result.timedOut) return '插件命令执行超时，已停止；请复制日志查看失败步骤'
  const output = `${result.stdout}\n${result.stderr}`.trim()
  if (/\[23\].*aborted due to timeout|TimeoutError: The operation was aborted due to timeout/is.test(output)) {
    return 'GitHub 插件下载超时；安装包较大或当前网络较慢，请检查网络后重试'
  }
  // Direct `&path:` pnpm spawn: surface actionable guidance instead of raw Node ENOENT.
  if (output.includes(PNPM_DIRECT_SPAWN_ENOENT_HINT) || /spawn\s+\S*pnpm\S*.*ENOENT/i.test(output)) {
    return PNPM_DIRECT_SPAWN_ENOENT_HINT
  }
  return (output || `plugin command exited ${String(result.exitCode)}`).slice(-1600)
}
