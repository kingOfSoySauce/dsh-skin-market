import type { Operation } from './types.ts'

interface FetchProgress { size?: number; downloaded: number }

function nonnegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** Retain structured progress only; package/script output stays out of operation state. */
export class PnpmProgressTracker {
  private buffer = ''
  private readonly fetches = new Map<string, FetchProgress>()
  private samples: Array<{ at: number; bytes: number }> = []

  push(chunk: string, operation: Operation): void {
    if (chunk.length === 0) return
    const now = Date.now()
    operation.lastOutputAt = new Date(now).toISOString()
    const lastSample = this.samples.at(-1)
    if (lastSample !== undefined && now - lastSample.at >= 5000) delete operation.bytesPerSecond
    this.buffer += chunk
    const lines = this.buffer.split(/\r?\n/)
    this.buffer = lines.pop() ?? ''
    for (const line of lines) this.consume(line, operation)
  }

  private stage(operation: Operation, stage: NonNullable<Operation['pnpmStage']>): void {
    operation.pnpmStage = stage
    if (stage !== 'downloading') delete operation.bytesPerSecond
  }

  private consume(line: string, operation: Operation): void {
    let value: unknown
    try { value = JSON.parse(line) as unknown } catch { return }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return
    const event = value as Record<string, unknown>
    if (event.name === 'pnpm:stage') {
      if (event.stage === 'resolution_started') this.stage(operation, 'resolving')
      else if (event.stage === 'resolution_done') this.stage(operation, 'downloading')
      else if (event.stage === 'importing_started' || event.stage === 'importing_done') this.stage(operation, 'linking')
      return
    }
    if (event.name === 'pnpm:lifecycle') {
      this.stage(operation, 'building')
      return
    }
    if (event.name === 'pnpm:stats' && (event.added !== undefined || event.removed !== undefined)) {
      this.stage(operation, 'linking')
      return
    }
    if (event.name === 'pnpm:progress') {
      if (event.status === 'resolved' && operation.pnpmStage === undefined) this.stage(operation, 'resolving')
      else if (event.status === 'fetched' || event.status === 'found_in_store') this.stage(operation, 'downloading')
      else if (event.status === 'imported') this.stage(operation, 'linking')
    }
    if (event.name === 'pnpm:fetching-progress') this.stage(operation, 'downloading')
    const packageId = typeof event.packageId === 'string' ? event.packageId : undefined
    if (packageId === undefined) return
    if (event.name === 'pnpm:fetching-progress' && event.status === 'started') {
      const size = nonnegativeNumber(event.size) ? event.size : undefined
      this.fetches.set(packageId, { size, downloaded: 0 })
      this.publish(operation)
    } else if (event.name === 'pnpm:fetching-progress' && event.status === 'in_progress' && nonnegativeNumber(event.downloaded)) {
      const current = this.fetches.get(packageId) ?? { downloaded: 0 }
      current.downloaded = Math.max(current.downloaded, event.downloaded)
      this.fetches.set(packageId, current)
      this.publish(operation)
    } else if (event.name === 'pnpm:progress' && event.status === 'fetched') {
      const current = this.fetches.get(packageId)
      if (current?.size !== undefined) current.downloaded = current.size
      this.publish(operation)
    }
  }

  private publish(operation: Operation): void {
    if (this.fetches.size === 0) return
    const fetches = [...this.fetches.values()]
    const downloaded = fetches.reduce((sum, item) => sum + Math.min(item.downloaded, item.size ?? item.downloaded), 0)
    if (downloaded > 0) operation.downloadedBytes = downloaded
    else delete operation.downloadedBytes
    if (fetches.every(item => item.size !== undefined)) operation.totalBytes = fetches.reduce((sum, item) => sum + item.size!, 0)
    else delete operation.totalBytes
    const now = Date.now()
    this.samples.push({ at: now, bytes: downloaded })
    this.samples = this.samples.filter(sample => now - sample.at <= 5000)
    const first = this.samples[0]
    const last = this.samples.at(-1)
    if (first !== undefined && last !== undefined && last.at > first.at && last.bytes > first.bytes) {
      operation.bytesPerSecond = Math.round((last.bytes - first.bytes) * 1000 / (last.at - first.at))
    } else delete operation.bytesPerSecond
  }
}
