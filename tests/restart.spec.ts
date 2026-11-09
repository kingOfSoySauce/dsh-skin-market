import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { createCliRestartScheduler } from '../src/restart.ts'

describe('CLI restart scheduler', () => {
  it('spawns one detached relay and exits only once', () => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() })
    const spawn = vi.fn(() => child)
    const exit = vi.fn()
    const setTimeout = vi.fn((callback: () => void) => {
      callback()
      return { unref: vi.fn() }
    })
    const scheduler = createCliRestartScheduler(exit, {
      execPath: '/node', argv: ['/node', '/dsh', '--profile', 'web', '--port', '8081'], cwd: '/work', env: {}, pid: 123,
      spawn: spawn as never, setTimeout: setTimeout as never,
    })

    scheduler.schedule()
    scheduler.schedule()
    expect(spawn).toHaveBeenCalledTimes(1)
    expect(spawn.mock.calls[0]?.[0]).toBe('/node')
    expect(JSON.stringify(spawn.mock.calls[0]?.[1])).toContain('--port')
    expect(spawn.mock.calls[0]?.[2]).toMatchObject({ cwd: '/work', detached: true, stdio: 'ignore' })
    expect(child.unref).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledOnce()
  })
})
