import { afterEach, describe, expect, it, vi } from 'vitest'
import { PnpmProgressTracker } from '../src/pnpm-progress.ts'
import type { Operation } from '../src/types.ts'

function operation(): Operation {
  return { id: 'progress', kind: 'install', skinId: 'example.skin', phase: 'downloading', startedAt: new Date().toISOString() }
}

function line(value: unknown): string { return `${JSON.stringify(value)}\n` }

afterEach(() => vi.useRealTimers())

describe('pnpm progress', () => {
  it.each([
    [{ name: 'pnpm:stage', stage: 'resolution_started' }, 'resolving'],
    [{ name: 'pnpm:stage', stage: 'resolution_done' }, 'downloading'],
    [{ name: 'pnpm:stage', stage: 'importing_started' }, 'linking'],
    [{ name: 'pnpm:stage', stage: 'importing_done' }, 'linking'],
    [{ name: 'pnpm:lifecycle', script: 'private output', wd: '/private/path' }, 'building'],
    [{ name: 'pnpm:stats', added: 1 }, 'linking'],
    [{ name: 'pnpm:progress', status: 'resolved' }, 'resolving'],
    [{ name: 'pnpm:progress', status: 'found_in_store' }, 'downloading'],
    [{ name: 'pnpm:progress', status: 'imported' }, 'linking'],
  ])('reports the stage for %j without requiring a package id', (event, stage) => {
    const current = operation()
    new PnpmProgressTracker().push(line(event), current)
    expect(current.pnpmStage).toBe(stage)
    expect(current.lastOutputAt).toEqual(expect.any(String))
    expect(current.downloadedBytes).toBeUndefined()
    expect(JSON.stringify(current)).not.toContain('private')
  })

  it('handles split records and malformed output without inventing byte progress', () => {
    vi.useFakeTimers()
    const tracker = new PnpmProgressTracker()
    const current = operation()
    tracker.push('', current)
    expect(current.lastOutputAt).toBeUndefined()
    tracker.push('human output\nnull\n[]\n{"name":"pnpm:stage",', current)
    expect(current.lastOutputAt).toBe(new Date().toISOString())
    expect(current.pnpmStage).toBeUndefined()
    tracker.push('"stage":"resolution_started"}\n', current)
    expect(current.pnpmStage).toBe('resolving')
    expect(current.downloadedBytes).toBeUndefined()
    const lastOutputAt = current.lastOutputAt
    vi.advanceTimersByTime(60_000)
    expect(current.lastOutputAt).toBe(lastOutputAt)
    expect(current.bytesPerSecond).toBeUndefined()
  })

  it('reports measured download bytes, leaves unknown totals unset, and expires an old rate on new output', () => {
    vi.useFakeTimers()
    const tracker = new PnpmProgressTracker()
    const current = operation()
    tracker.push(line({ name: 'pnpm:fetching-progress', packageId: 'one', status: 'started', size: 1000 }), current)
    vi.advanceTimersByTime(1000)
    tracker.push(line({ name: 'pnpm:fetching-progress', packageId: 'one', status: 'in_progress', downloaded: 500 }), current)
    expect(current).toMatchObject({ downloadedBytes: 500, totalBytes: 1000, bytesPerSecond: 500, pnpmStage: 'downloading' })
    tracker.push(line({ name: 'pnpm:fetching-progress', packageId: 'two', status: 'in_progress', downloaded: 100 }), current)
    expect(current.downloadedBytes).toBe(600)
    expect(current.totalBytes).toBeUndefined()
    tracker.push(line({ name: 'pnpm:progress', packageId: 'one', status: 'fetched' }), current)
    expect(current.downloadedBytes).toBe(1100)
    vi.advanceTimersByTime(5000)
    tracker.push('still working\n', current)
    expect(current.bytesPerSecond).toBeUndefined()
    expect(current.downloadedBytes).toBe(1100)
  })

  it('clears download speed on a build stage and ignores invalid byte values', () => {
    const tracker = new PnpmProgressTracker()
    const current = { ...operation(), bytesPerSecond: 1024 }
    tracker.push(line({ name: 'pnpm:lifecycle', script: 'build' }), current)
    expect(current.bytesPerSecond).toBeUndefined()
    tracker.push(line({ name: 'pnpm:fetching-progress', packageId: 'one', status: 'started', size: -1 }), current)
    tracker.push(line({ name: 'pnpm:fetching-progress', packageId: 'one', status: 'in_progress', downloaded: -100 }), current)
    expect(current.totalBytes).toBeUndefined()
    expect(current.downloadedBytes).toBeUndefined()
  })
})
