import { commandError, type CommandResult } from './commands.ts'
import { readDependencies } from './profile.ts'
import { normalizeRegistryPlan } from './registry-plan.ts'
import type { OperationMessageKey, OperationMessageParams } from './operation-message.ts'

export type PnpmFailureKind = 'release-age' | 'network' | 'fetch-timeout' | 'build-approval' | 'fetch-404' | 'existing-source-unreachable' | 'no-matching-version' | 'integrity' | 'adding-to-root' | 'not-a-workspace' | 'unexpected-store' | 'lockfile-outdated' | 'lockfile-broken' | 'script-timeout' | 'command'

export interface PnpmFailure {
  kind: PnpmFailureKind
  message: string
  messageKey?: OperationMessageKey
  messageParams?: OperationMessageParams
  packageName?: string
  buildKey?: string
  buildKeys?: string[]
  recovery?: 'disable-peer-autoinstall'
}

export class PnpmCommandError extends Error {
  constructor(readonly failure: PnpmFailure, readonly result: CommandResult) {
    super(failure.message)
    this.name = 'PnpmCommandError'
  }
}

export interface PnpmAttemptOptions {
  env?: NodeJS.ProcessEnv
}

export interface PnpmRecoveryOptions {
  attempt: (args: readonly string[], options?: PnpmAttemptOptions) => Promise<CommandResult>
  onRetry?: (failure: PnpmFailure) => void
  profileDir?: string
  /** Ordered host-provided registries. Undefined means keep pnpm's own config. */
  registryPlan?: readonly string[]
}

const RELEASE_AGE_OVERRIDE = '--config.minimumReleaseAge=0'
const FETCH_TIMEOUT_MS = 10 * 60 * 1000

function outputOf(result: CommandResult): string {
  return `${result.stdout}\n${result.stderr}`.trim()
}

function extractBuildKey(output: string): string | undefined {
  const match = output.match(/(?:^|[\s'"`])((?:@[^\s/]+\/)?[^\s'"`]+@https?:\/\/[^\s'"`]+)(?=$|[\s'"`])/m)
  return match?.[1]?.replace(/:+$/, '')
}

function packageNameFromBuildKey(key: string | undefined): string | undefined {
  if (key === undefined) return undefined
  const separator = key.indexOf('@https://') >= 0 ? key.indexOf('@https://') : key.indexOf('@http://')
  if (separator <= 0) return undefined
  return key.slice(0, separator)
}

function packageNameFromVersionedSpecifier(specifier: string): string | undefined {
  const value = specifier.trim().replace(/^["']+|["'}\].,;]+$/g, '')
  if (value === '') return undefined
  const separator = value.startsWith('@')
    ? value.indexOf('@', value.indexOf('/') + 1)
    : value.lastIndexOf('@')
  const packageName = separator > 0 ? value.slice(0, separator) : value
  return /^(?:@[A-Za-z0-9._~-]+\/)?[A-Za-z0-9._~-]+$/.test(packageName) ? packageName : undefined
}

function ignoredBuildKeys(output: string): string[] {
  const match = output.match(/Ignored build scripts:\s*([^\r\n]+)/i)
  if (match?.[1] === undefined) return []
  return [...new Set(match[1].split(',').map(packageNameFromVersionedSpecifier).filter((value): value is string => value !== undefined))]
}

function packageNameFromFetch404(output: string): string | undefined {
  const match = output.match(/\bGET\s+(https?:\/\/[^\s]+):\s*(?:Not Found|404)/i)
  if (match?.[1] === undefined) return undefined
  try {
    const url = new URL(match[1])
    const name = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
    return name === '' ? undefined : name
  } catch {
    return undefined
  }
}

/**
 * A `fetch-404` for a git tarball can be caused by a dependency this profile
 * already installed, not by the package being installed now. pnpm resolves
 * every git dependency on add/install, so such a leftover blocks the whole
 * operation. Name that dependency so the person can repair the profile.
 */
function existingDependencyForFetchFailure(output: string, profileDir: string): { packageName: string; repository: string; commit: string } | null {
  const match = /GET\s+https?:\/\/codeload\.github\.com\/([^/\s"'`]+)\/([^/\s"'`]+)\/tar\.gz\/([0-9a-f]{40})/i.exec(output)
  if (match === null) return null
  const repository = `${match[1]}/${match[2]}`
  const commit = match[3]!.toLowerCase()
  const dependencies = readDependencies(profileDir)
  for (const [packageName, spec] of Object.entries(dependencies)) {
    const parsed = /^github:([^#]+)#([0-9a-f]{40})(?:&path:[^\s]+)?$/i.exec(spec.trim())
    if (parsed === null) continue
    if (parsed[1]!.toLowerCase() !== repository.toLowerCase()) continue
    if (parsed[2]!.toLowerCase() !== commit) continue
    return { packageName, repository: parsed[1]!, commit }
  }
  return null
}

function withExistingSourceContext(failure: PnpmFailure, result: CommandResult, profileDir?: string): PnpmFailure {
  if (failure.kind !== 'fetch-404' || profileDir === undefined) return failure
  const existing = existingDependencyForFetchFailure(outputOf(result), profileDir)
  if (existing === null) return failure
  return {
    kind: 'existing-source-unreachable',
    message: `已安装的依赖 ${existing.packageName} 的上游仓库 ${existing.repository}#${existing.commit.slice(0, 12)} 已不可访问（404）。pnpm 每次安装都会重新解析它，所以本次操作无法继续；请先在外部终端修复 profile（迁移到可用来源或移除该插件）后再试。`,
    messageKey: 'failure.existingSourceProblem',
    packageName: existing.packageName,
  }
}

export function classifyPnpmFailure(result: CommandResult): PnpmFailure {
  if (result.aborted) return { kind: 'command', message: '操作已取消', messageKey: 'common.cancelled' }

  const output = outputOf(result)
  const stalled = /printed nothing for (\d+)ms and was terminated/.exec(output)
  if (stalled !== null) {
    const scripts = [...output.matchAll(/node_modules[\\/]((?:@[^\\/\s]+[\\/])?[^\\/\s]+) (?:pre|post)?install[:$]/g)]
    const packageName = scripts.at(-1)?.[1]?.replace(/\\/g, '/')
    const minutes = Math.max(1, Math.round(Number(stalled[1]) / 60000))
    return { kind: 'script-timeout', ...(packageName === undefined ? {} : { packageName }), message: `${packageName === undefined ? '安装步骤' : `依赖 ${packageName} 的安装脚本`} ${minutes} 分钟没有输出，被宿主终止；请检查脚本与下载连接后重试。此结果不证明文件尚未改变。`, messageKey: 'failure.scriptProblem' }
  }
  if (output.includes('ERR_PNPM_OUTDATED_LOCKFILE')) {
    return { kind: 'lockfile-outdated', message: 'profile 的 pnpm-lock.yaml 与 package.json 不一致，pnpm 已拒绝此次操作；请备份锁文件并在该 profile 中对齐声明后重试，不要删除整个锁文件。', messageKey: 'failure.lockfileProblem' }
  }
  if (output.includes('ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY') || /Broken lockfile/i.test(output)) {
    return { kind: 'lockfile-broken', message: 'profile 的 pnpm-lock.yaml 缺少其引用的依赖条目，pnpm 已拒绝此次操作；请备份锁文件并修复缺失记录后重试，不要删除整个锁文件或直接替换其他插件版本。', messageKey: 'failure.lockfileBrokenProblem' }
  }
  const ignoredKeys = ignoredBuildKeys(output)
  if (ignoredKeys.length > 0 || /ERR_PNPM_IGNORED_BUILDS/i.test(output)) {
    const packageName = ignoredKeys[0]
    return {
      kind: 'build-approval',
      message: packageName === undefined
        ? '依赖包含被 pnpm 阻止的构建脚本；请批准精确构建项后重试'
        : `依赖 ${packageName}${ignoredKeys.length > 1 ? ` 等 ${ignoredKeys.length} 个依赖` : ''} 包含被 pnpm 阻止的构建脚本；请批准后重试`,
      messageKey: 'failure.buildProblem',
      packageName,
      buildKey: packageName,
      ...(ignoredKeys.length === 0 ? {} : { buildKeys: ignoredKeys }),
    }
  }

  if (/ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED|needs to execute build scripts.*not in allowBuilds/i.test(output)) {
    const buildKey = extractBuildKey(output)
    return {
      kind: 'build-approval',
      message: 'GitHub 插件包含被 pnpm 阻止的构建脚本；请批准精确构建项后重试',
      messageKey: 'failure.buildProblem',
      packageName: packageNameFromBuildKey(buildKey),
      buildKey,
      ...(buildKey === undefined ? {} : { buildKeys: [buildKey] }),
    }
  }

  if (/minimumReleaseAge cutoff|within the minimumReleaseAge cutoff|verifyLockfileResolutions|ERR_PNPM.*RELEASE.*AGE/i.test(output)) {
    return {
      kind: 'release-age',
      message: '依赖仍受 pnpm 新包保护；已自动临时放宽并重试一次，请稍后再试',
      messageKey: 'failure.releaseAgeProblem',
    }
  }

  if (/\[23\].*aborted due to timeout|TimeoutError: The operation was aborted due to timeout|fetch timeout|ETIMEDOUT/i.test(output) || result.timedOut) {
    return {
      kind: 'fetch-timeout',
      message: commandError(result),
      messageKey: 'failure.timeoutProblem',
    }
  }

  if (/UND_ERR_DESTROYED|fetch failed|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket hang up|network request failed|network failed/i.test(output)) {
    return {
      kind: 'network',
      message: '插件下载遇到临时网络错误；已自动重试一次，请检查网络后重试',
      messageKey: 'failure.networkProblem',
    }
  }

  if (/ERR_PNPM_FETCH_404/i.test(output)) {
    const packageName = packageNameFromFetch404(output)
    return {
      kind: 'fetch-404',
      message: packageName === undefined
        ? '有依赖无法从 npm registry 找到；请检查依赖声明、registry 权限或之前失败操作留下的幽灵依赖'
        : `依赖 ${packageName} 无法从 npm registry 找到；它可能是未发布的宿主依赖、私有包或之前失败操作留下的幽灵依赖`,
      messageKey: 'failure.fetch404Problem',
      packageName,
    }
  }

  if (/ERR_PNPM_NO_MATCHING_VERSION|No matching version found|No matching version/i.test(output)) {
    return { kind: 'no-matching-version', message: '安装源没有所需的精确版本；请检查其他配置的安装源', messageKey: 'failure.versionProblem' }
  }

  if (/ERR_PNPM_TARBALL_INTEGRITY|integrity checksum failed|integrity.*mismatch/i.test(output)) {
    return { kind: 'integrity', message: '安装源返回的包完整性校验失败；请检查其他配置的安装源', messageKey: 'failure.integrityProblem' }
  }

  if (output.includes('ERR_PNPM_ADDING_TO_ROOT')) {
    return { kind: 'adding-to-root', message: 'pnpm 拒绝在 workspace 根目录安装；市场已识别为兼容性问题，请重试', messageKey: 'failure.commandProblem' }
  }

  if (/--workspace-root may only be used inside a workspace/i.test(output)) {
    return { kind: 'not-a-workspace', message: '当前 profile 不是 pnpm workspace，却传入了 -w；市场已识别为兼容性问题，请重试', messageKey: 'failure.commandProblem' }
  }

  if (/ERR_PNPM_UNEXPECTED_STORE|Unexpected store location/i.test(output)) {
    return {
      kind: 'unexpected-store',
      message: '当前 profile 的 node_modules 由另一代 pnpm store 链接（常见于本机同时装了 pnpm 10 和 11）。请用 node_modules/.modules.yaml 记录的同一版 pnpm 再操作，或用现在的 pnpm 重建该 profile 的 node_modules。不要在 DSH 源码仓库目录里看 pnpm 版本来判断。',
      messageKey: 'failure.storeProblem',
    }
  }

  return { kind: 'command', message: commandError(result), messageKey: 'failure.commandProblem' }
}

function withReleaseAgeOverride(args: readonly string[]): string[] {
  const commandIndex = args.findIndex(arg => arg === 'add' || arg === 'remove' || arg === 'install')
  if (commandIndex < 0) return [...args, RELEASE_AGE_OVERRIDE]
  return [...args.slice(0, commandIndex + 1), RELEASE_AGE_OVERRIDE, ...args.slice(commandIndex + 1)]
}

const AUTO_INSTALL_PEERS_OFF = '--config.auto-install-peers=false'

function withCommandOption(args: readonly string[], option: string): string[] {
  const commandIndex = args.findIndex(arg => arg === 'add' || arg === 'remove' || arg === 'install')
  if (commandIndex < 0) return [...args, option]
  return [...args.slice(0, commandIndex + 1), option, ...args.slice(commandIndex + 1)]
}

function isRegistryCommand(args: readonly string[]): boolean {
  if (args[0] === 'add' || args[0] === 'install') return true
  // Legacy Desktop installPlugin receives only pnpm flags; the host adds the
  // verb and exact target around them, so registry fallback must cover this
  // option-only shape as well.
  return args.length > 0 && args.every(argument => argument.startsWith('-'))
}

/** Add one ephemeral registry without touching the profile's persistent config. */
export function withRegistry(args: readonly string[], registry: string): string[] {
  if (!isRegistryCommand(args)) return [...args]
  const filtered: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--registry') {
      index += 1
      continue
    }
    if (argument.startsWith('--registry=')) continue
    filtered.push(argument)
  }
  return withCommandOption(filtered, `--registry=${registry}`)
}

function registryRetryable(failure: PnpmFailure): boolean {
  return failure.kind === 'network' || failure.kind === 'fetch-timeout' || failure.kind === 'fetch-404'
    || failure.kind === 'no-matching-version' || failure.kind === 'integrity'
}

function explicitDirectory(args: readonly string[]): string | undefined {
  const index = args.indexOf('--dir')
  const directory = index >= 0 ? args[index + 1] : undefined
  return directory === undefined || directory.startsWith('-') ? undefined : directory
}

function shouldDisablePeerAutoinstall(args: readonly string[], failure: PnpmFailure, profileDir?: string): boolean {
  if (args[0] !== 'add' && args[0] !== 'remove') return false
  if (args.includes(AUTO_INSTALL_PEERS_OFF)) return false
  if (failure.packageName === undefined || !failure.packageName.startsWith('@deepseek-ai/')) return false
  const directory = explicitDirectory(args) ?? profileDir
  if (directory === undefined) return false
  return !Object.hasOwn(readDependencies(directory), failure.packageName)
}

function isAutomaticallyRecoverable(kind: PnpmFailureKind): boolean {
  return kind === 'release-age' || kind === 'network' || kind === 'fetch-timeout'
}

export async function runPnpmWithRecovery(args: readonly string[], options: PnpmRecoveryOptions): Promise<void> {
  const registryPlan = normalizeRegistryPlan(options.registryPlan)
  let registryIndex = 0
  const attemptArgs = (): readonly string[] => {
    const registry = registryPlan?.[registryIndex]
    return registry === undefined ? args : withRegistry(args, registry)
  }
  let result = await options.attempt(attemptArgs())
  if (result.exitCode === 0 && !result.timedOut && result.aborted !== true) return

  let failure = classifyPnpmFailure(result)
  while (registryPlan !== undefined && registryIndex + 1 < registryPlan.length && registryRetryable(failure)
    && result.aborted !== true && !result.timedOut) {
    registryIndex += 1
    options.onRetry?.(failure)
    result = await options.attempt(attemptArgs())
    if (result.exitCode === 0 && !result.timedOut && result.aborted !== true) return
    failure = classifyPnpmFailure(result)
  }

  const currentArgs = attemptArgs()
  const disablePeerAutoinstall = shouldDisablePeerAutoinstall(currentArgs, failure, options.profileDir)
  if (!disablePeerAutoinstall && !isAutomaticallyRecoverable(failure.kind)) throw new PnpmCommandError(withExistingSourceContext(failure, result, options.profileDir), result)

  options.onRetry?.(disablePeerAutoinstall ? { ...failure, recovery: 'disable-peer-autoinstall' } : failure)
  const retryArgs = disablePeerAutoinstall
    ? withCommandOption(currentArgs, AUTO_INSTALL_PEERS_OFF)
    : failure.kind === 'release-age' ? withReleaseAgeOverride(currentArgs) : currentArgs
  const retryOptions = failure.kind === 'fetch-timeout'
    ? { env: { pnpm_config_fetch_timeout: String(FETCH_TIMEOUT_MS) } }
    : undefined
  const retryResult = await options.attempt(retryArgs, retryOptions)
  if (retryResult.exitCode === 0 && !retryResult.timedOut && retryResult.aborted !== true) return
  const retryFailure = classifyPnpmFailure(retryResult)
  throw new PnpmCommandError(withExistingSourceContext(retryFailure, retryResult, options.profileDir), retryResult)
}

/** Return only structured, non-secret pnpm failure metadata for copied logs. */
export function failureDiagnostic(result: CommandResult): string {
  const codes = [...new Set(`${result.stdout}\n${result.stderr}`.match(/\bERR_PNPM_[A-Z0-9_]+\b/g) ?? [])]
  return [
    `exitCode=${result.exitCode ?? 'null'}`,
    `timedOut=${result.timedOut}`,
    `aborted=${result.aborted === true}`,
    ...(codes.length === 0 ? [] : [`codes=${codes.slice(0, 4).join(',')}`]),
  ].join(' ')
}
