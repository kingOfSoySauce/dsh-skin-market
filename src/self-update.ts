import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PluginRunner } from './commands.ts'
import { PnpmCommandError, failureDiagnostic, runPnpmWithRecovery, type PnpmFailure } from './pnpm-recovery.ts'
import { pluginArgsFor } from './pnpm-compat.ts'
import { cleanOrphanedStore } from './store.ts'
import { logEvent } from './log.ts'
import { resolveProfileDir } from './profile.ts'
import { compareVersions, parseVersion } from './semver.ts'
import type { OperationFailure } from './types.ts'

export const MARKET_NPM_PACKAGE = 'dsh-skin-market'
export const MARKET_NPM_METADATA_URL = `https://registry.npmjs.org/${MARKET_NPM_PACKAGE}`
const PNPM_FETCH_TIMEOUT_MS = 10 * 60 * 1000

export interface MarketUpdateStatus {
  currentVersion: string
  latestVersion: string
  updateAvailable: boolean
}

export type MarketUpdatePhase = 'queued' | 'checking' | 'downloading' | 'installing' | 'cancelling' | 'cancelled' | 'done' | 'failed'

export interface MarketUpdateOperation {
  id: string
  phase: MarketUpdatePhase
  message?: string
  status?: MarketUpdateStatus
  cancelable?: boolean
  downloadedBytes?: number
  totalBytes?: number
  bytesPerSecond?: number
  failure?: OperationFailure
  startedAt: string
  finishedAt?: string
}

interface FetchProgress { size?: number; downloaded: number }

interface MarketRelease {
  version: string
  gitHead: string
  tarball: string
}

class MarketProgressTracker {
  private buffer = ''
  private readonly fetches = new Map<string, FetchProgress>()
  private readonly unknownSizes = new Set<string>()
  private samples: Array<{ at: number; bytes: number }> = []

  push(chunk: string, operation: MarketUpdateOperation): void {
    this.buffer += chunk
    const lines = this.buffer.split(/\r?\n/)
    this.buffer = lines.pop() ?? ''
    for (const line of lines) this.consume(line, operation)
  }

  private consume(line: string, operation: MarketUpdateOperation): void {
    let event: Record<string, unknown>
    try { event = JSON.parse(line) as Record<string, unknown> } catch { return }
    const packageId = typeof event.packageId === 'string' ? event.packageId : undefined
    if (packageId === undefined) return
    if (event.name === 'pnpm:fetching-progress' && event.status === 'started') {
      const size = typeof event.size === 'number' && Number.isFinite(event.size) ? event.size : undefined
      this.fetches.set(packageId, { size, downloaded: 0 })
      if (size === undefined) this.unknownSizes.add(packageId)
      this.publish(operation)
      return
    }
    if (event.name === 'pnpm:fetching-progress' && event.status === 'in_progress' && typeof event.downloaded === 'number') {
      const current = this.fetches.get(packageId) ?? { downloaded: 0 }
      current.downloaded = Math.max(current.downloaded, event.downloaded)
      this.fetches.set(packageId, current)
      this.publish(operation)
      return
    }
    if (event.name === 'pnpm:progress' && event.status === 'fetched') {
      const current = this.fetches.get(packageId)
      if (current?.size !== undefined) current.downloaded = current.size
      this.publish(operation)
    }
  }

  private publish(operation: MarketUpdateOperation): void {
    if (this.fetches.size === 0) return
    const totalKnown = this.unknownSizes.size === 0
    const total = [...this.fetches.values()].reduce((sum, item) => sum + (item.size ?? 0), 0)
    const downloaded = [...this.fetches.values()].reduce((sum, item) => sum + Math.min(item.downloaded, item.size ?? item.downloaded), 0)
    if (downloaded > 0) operation.downloadedBytes = downloaded
    else delete operation.downloadedBytes
    if (totalKnown) operation.totalBytes = total
    else delete operation.totalBytes
    const now = Date.now()
    this.samples.push({ at: now, bytes: downloaded })
    this.samples = this.samples.filter(sample => now - sample.at <= 5000)
    const first = this.samples[0]
    const last = this.samples.at(-1)
    if (first !== undefined && last !== undefined && last.at > first.at && last.bytes > first.bytes) {
      operation.bytesPerSecond = Math.round((last.bytes - first.bytes) * 1000 / (last.at - first.at))
    }
  }
}

export interface MarketUpdater {
  status(force?: boolean): Promise<MarketUpdateStatus>
  update(): Promise<MarketUpdateStatus>
  startUpdate(): MarketUpdateOperation
  operation(id: string): MarketUpdateOperation | null
  currentOperation(): MarketUpdateOperation | null
  cancel(id: string): MarketUpdateOperation
  retry(id: string): MarketUpdateOperation
  readonly restartRequired: boolean
}

export function packageVersion(): string {
  const packageFile = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
  const value = JSON.parse(readFileSync(packageFile, 'utf8')) as { version?: unknown }
  if (typeof value.version !== 'string') throw new Error('皮肤市场 package.json 缺少版本号')
  return value.version
}

export { compareVersions } from './semver.ts'

export function createMarketUpdater(
  profile: string,
  runner: PluginRunner,
  options: { currentVersion?: string; fetch?: typeof fetch; cacheMs?: number } = {},
): MarketUpdater {
  const fetchLatest = options.fetch ?? fetch
  let installedVersion = options.currentVersion ?? packageVersion()
  const cacheMs = options.cacheMs ?? 5 * 60 * 1000
  let cached: { checkedAt: number; status: MarketUpdateStatus; release: MarketRelease } | null = null
  let latestRelease: MarketRelease | null = null
  let updating = false
  let restartRequired = false
  let activeOperation: string | null = null
  const operations = new Map<string, MarketUpdateOperation>()
  const abortControllers = new Map<string, AbortController>()

  const setOperation = (operation: MarketUpdateOperation, patch: Partial<MarketUpdateOperation>): void => {
    Object.assign(operation, patch)
    operation.cancelable = !['done', 'failed', 'cancelled', 'cancelling'].includes(operation.phase)
    if (operation.phase === 'done' || operation.phase === 'failed' || operation.phase === 'cancelled') {
      operation.finishedAt = new Date().toISOString()
      if (activeOperation === operation.id) activeOperation = null
    }
  }

  const updateTarget = async (operation: MarketUpdateOperation, controller: AbortController): Promise<void> => {
    try {
      setOperation(operation, { phase: 'checking', message: '正在检查皮肤市场版本' })
      const before = await status(true)
      operation.status = before
      if (!before.updateAvailable) {
        setOperation(operation, { phase: 'done', message: '已经是最新版本', status: before })
        return
      }

      const tracker = new MarketProgressTracker()
      const report = (chunk: string): void => {
        if (operation.phase !== 'downloading' && operation.phase !== 'installing') return
        tracker.push(chunk, operation)
        if (chunk.trim() !== '') operation.message = operation.phase === 'downloading' ? '正在下载皮肤市场更新包' : '正在写入皮肤市场更新'
      }
      const run = async (args: readonly string[]) => {
        await runner.ensurePnpm?.({ signal: controller.signal })
        const profileDir = resolveProfileDir(profile)
        const effectiveArgs = pluginArgsFor(profileDir, args)
        try {
          await runPnpmWithRecovery(effectiveArgs, {
            profileDir,
            attempt: (attemptArgs, attemptOptions) => runner(profile, attemptArgs, {
              signal: controller.signal,
              // Keep self-update on the same 10 minute network budget as ordinary
              // skin installs without writing a persistent .npmrc into the user's
              // profile. The update target is the immutable npm package version,
              // so repository-only assets such as market screenshots are not
              // included in the downloaded package.
              env: { pnpm_config_fetch_timeout: String(PNPM_FETCH_TIMEOUT_MS), ...attemptOptions?.env },
              onStdout: report,
              onStderr: report,
            }),
            onRetry: failure => setOperation(operation, { message: recoveryMessage(failure) }),
          })
        } catch (error) {
          if (!controller.signal.aborted) await cleanOrphanedStore(runner, profile, operation.id)
          if (error instanceof PnpmCommandError) {
            logEvent('error', 'market-update-pnpm', `kind=${error.failure.kind}${error.failure.packageName === undefined ? '' : ` package=${error.failure.packageName}`} ${failureDiagnostic(error.result)}`, operation.id)
          }
          throw error
        }
      }

      // Resolve this version online. `--prefer-offline` would reuse a stale
      // packument that still lacks the latest we just read from npm.
      setOperation(operation, { phase: 'downloading', message: '正在下载皮肤市场更新包' })
      if (latestRelease === null) throw new Error('npm 未返回可验证的市场构件')
      await run(['add', `${MARKET_NPM_PACKAGE}@${latestRelease.version}`, '--reporter=ndjson'])

      installedVersion = before.latestVersion
      restartRequired = true
      const next = { currentVersion: installedVersion, latestVersion: installedVersion, updateAvailable: false }
      cached = { checkedAt: Date.now(), status: next, release: latestRelease }
      setOperation(operation, { phase: 'done', message: '更新完成，重启 DSH 后生效', status: next })
    } catch (error) {
      if (controller.signal.aborted) setOperation(operation, { phase: 'cancelled', message: '更新已取消' })
      else {
        if (error instanceof PnpmCommandError) {
          const failure = error.failure
          const action = failure.kind === 'network' || failure.kind === 'fetch-timeout' ? 'retry' : undefined
          operation.failure = {
            kind: failure.kind,
            message: failure.message,
            ...(failure.packageName === undefined ? {} : { packageName: failure.packageName }),
            ...(action === undefined ? {} : { action }),
          }
        }
        if (!(error instanceof PnpmCommandError)) logEvent('error', 'market-update', error instanceof Error ? error.message : String(error), operation.id)
        setOperation(operation, { phase: 'failed', message: error instanceof Error ? error.message : String(error) })
      }
    } finally {
      abortControllers.delete(operation.id)
      updating = false
    }
  }

  const status = async (force = false): Promise<MarketUpdateStatus> => {
    if (!force && cached !== null && Date.now() - cached.checkedAt < cacheMs) return cached.status
    const requestOptions = {
      headers: { accept: 'application/json', 'user-agent': `dsh-skin-market/${installedVersion}` },
      signal: AbortSignal.timeout(10_000),
    }
    const response = await fetchLatest(MARKET_NPM_METADATA_URL, requestOptions)
    if (!response.ok) throw new Error(`npm 版本检查失败（HTTP ${response.status}）`)
    const value = await response.json() as {
      'dist-tags'?: unknown
      versions?: unknown
    }
    const tags = value['dist-tags']
    const latestVersion = tags !== null && typeof tags === 'object' ? (tags as Record<string, unknown>).latest : undefined
    if (typeof latestVersion !== 'string' || parseVersion(latestVersion) === null) throw new Error('npm 未返回有效的市场 latest 版本')
    const versions = value.versions
    if (versions === null || typeof versions !== 'object') throw new Error('npm 未返回有效的市场版本列表')
    const releaseValue = (versions as Record<string, unknown>)[latestVersion]
    if (releaseValue === null || typeof releaseValue !== 'object') throw new Error('npm 未返回有效的市场 latest 构件')
    const releaseRecord = releaseValue as Record<string, unknown>
    const gitHead = releaseRecord.gitHead
    const dist = releaseRecord.dist
    const tarball = dist !== null && typeof dist === 'object' ? (dist as Record<string, unknown>).tarball : undefined
    if (typeof gitHead !== 'string' || !/^[0-9a-f]{40}$/i.test(gitHead) || typeof tarball !== 'string' || !tarball.startsWith('https://registry.npmjs.org/')) {
      throw new Error('npm 市场构件缺少可验证的版本来源或下载地址')
    }
    const release: MarketRelease = { version: latestVersion, gitHead: gitHead.toLowerCase(), tarball }
    const next = { currentVersion: installedVersion, latestVersion: release.version, updateAvailable: compareVersions(release.version, installedVersion) > 0 }
    latestRelease = release
    cached = { checkedAt: Date.now(), status: next, release }
    return next
  }

  const startUpdate = (): MarketUpdateOperation => {
    if (activeOperation !== null) return operations.get(activeOperation)!
    const operation: MarketUpdateOperation = { id: randomUUID(), phase: 'queued', cancelable: true, startedAt: new Date().toISOString() }
    operations.set(operation.id, operation)
    activeOperation = operation.id
    updating = true
    const controller = new AbortController()
    abortControllers.set(operation.id, controller)
    void updateTarget(operation, controller)
    const timer = setTimeout(() => operations.delete(operation.id), 30 * 60 * 1000)
    timer.unref?.()
    return operation
  }

  return {
    status,
    get restartRequired() { return restartRequired },
    async update() {
      if (updating) throw new Error('皮肤市场正在更新')
      const operation = startUpdate()
      while (operation.phase !== 'done' && operation.phase !== 'failed' && operation.phase !== 'cancelled') {
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      if (operation.phase !== 'done' || operation.status === undefined) throw new Error(operation.message ?? '皮肤市场更新失败')
      return operation.status
    },
    startUpdate,
    operation(id) { return operations.get(id) ?? null },
    currentOperation() { return activeOperation === null ? null : operations.get(activeOperation) ?? null },
    cancel(id) {
      const operation = operations.get(id)
      if (operation === undefined) throw new Error('更新任务不存在')
      if (operation.cancelable !== true) return operation
      setOperation(operation, { phase: 'cancelling', message: '正在取消皮肤市场更新' })
      abortControllers.get(id)?.abort()
      return operation
    },
    retry(id) {
      const failed = operations.get(id)
      if (failed === undefined || failed.phase !== 'failed' || failed.failure?.action !== 'retry') throw new Error('更新任务不可重试')
      return startUpdate()
    },
  }
}

function recoveryMessage(failure: PnpmFailure): string {
  if (failure.recovery === 'disable-peer-autoinstall') return '检测到宿主提供但 npm 未发布的 peer，正在关闭 peer 自动安装并重试'
  if (failure.kind === 'release-age') return '检测到新包保护，正在临时放宽本次更新并重试'
  if (failure.kind === 'fetch-timeout') return '下载超时，正在延长 pnpm 下载等待时间并重试'
  if (failure.kind === 'network') return '检测到临时网络错误，正在自动重试'
  return failure.message
}
