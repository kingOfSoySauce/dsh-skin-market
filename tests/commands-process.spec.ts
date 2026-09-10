import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const processBoundary = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node:child_process', () => ({ spawn: processBoundary.spawn }))

function fakeChild() {
  return Object.assign(new EventEmitter(), {
    pid: 4812,
    exitCode: null as number | null,
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: vi.fn(),
  })
}

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
let child: ReturnType<typeof fakeChild>
let cleanup: ReturnType<typeof fakeChild>

function usePlatform(value: string): void {
  Object.defineProperty(process, 'platform', { ...originalPlatform, value })
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  child = fakeChild()
  cleanup = fakeChild()
  processBoundary.spawn.mockReset()
  processBoundary.spawn.mockImplementation((file: string) => file === 'taskkill' ? cleanup : child)
})

afterEach(() => {
  Object.defineProperty(process, 'platform', originalPlatform)
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.resetModules()
})

describe('plugin process termination', () => {
  it('terminates the Windows tree on timeout and waits for the command close', async () => {
    usePlatform('win32')
    const { runPluginCli } = await import('../src/commands.ts')
    const completed = vi.fn()
    const result = runPluginCli('web', ['add', 'example-skin'], { timeoutMs: 50 }).then(value => { completed(value); return value })
    child.stdout.emit('data', 'downloading\n')

    await vi.advanceTimersByTimeAsync(49)
    expect(processBoundary.spawn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    // Inspect only the cleanup call, never assertion-diff inherited env values.
    expect(processBoundary.spawn.mock.calls[1]).toEqual([
      'taskkill', ['/pid', '4812', '/t', '/f'], { stdio: 'ignore', windowsHide: true },
    ])
    cleanup.emit('close', 0)
    await Promise.resolve()
    expect(completed).not.toHaveBeenCalled()
    expect(child.kill).not.toHaveBeenCalled()

    child.emit('close', 1)
    await expect(result).resolves.toMatchObject({ timedOut: true, aborted: false, stdout: 'downloading\n' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['error', 'exit', 'throw'])('falls back safely when Windows taskkill fails via %s', async failure => {
    usePlatform('win32')
    const { runPluginCli } = await import('../src/commands.ts')
    const controller = new AbortController()
    const result = runPluginCli('web', ['add', 'example-skin'], { signal: controller.signal })
    if (failure === 'throw') processBoundary.spawn.mockImplementationOnce(() => { throw new Error('taskkill unavailable') })

    controller.abort()
    if (failure === 'error') {
      cleanup.emit('error', new Error('taskkill unavailable'))
      cleanup.emit('close', -1)
    } else if (failure === 'exit') cleanup.emit('close', 1)
    expect(child.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM')
    child.emit('close', 1)
    await expect(result).resolves.toMatchObject({ timedOut: false, aborted: true })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('kills the POSIX process group even after its wrapper has exited', async () => {
    usePlatform('linux')
    const signal = vi.spyOn(process, 'kill').mockReturnValue(true)
    const { runPluginCli } = await import('../src/commands.ts')
    const controller = new AbortController()
    const completed = vi.fn()
    const result = runPluginCli('web', ['add', 'example-skin'], { signal: controller.signal }).then(value => { completed(); return value })
    // The wrapper exits before a pnpm grandchild releases the inherited pipes.
    child.exitCode = 0
    controller.abort()
    expect(signal).toHaveBeenCalledWith(-4812, 'SIGTERM')
    await vi.advanceTimersByTimeAsync(3000)
    expect(signal).toHaveBeenCalledWith(-4812, 'SIGKILL')
    expect(completed).not.toHaveBeenCalled()

    child.emit('close', 0)
    await expect(result).resolves.toMatchObject({ exitCode: 0, aborted: true })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not start a child for cancelled or exhausted requests', async () => {
    const { runPluginCli } = await import('../src/commands.ts')
    await expect(runPluginCli('web', ['install'], { signal: AbortSignal.abort() })).resolves.toMatchObject({ aborted: true, timedOut: false })
    await expect(runPluginCli('web', ['install'], { timeoutMs: 0 })).resolves.toMatchObject({ aborted: false, timedOut: true })
    expect(processBoundary.spawn).not.toHaveBeenCalled()
  })

  it('applies a provisioning budget without starting fallbacks after timeout', async () => {
    usePlatform('win32')
    const { createPnpmProvisioner } = await import('../src/commands.ts')
    const result = createPnpmProvisioner()({ timeoutMs: 50 })
    const rejected = expect(result).rejects.toThrow('pnpm 准备超时')
    await vi.advanceTimersByTimeAsync(50)
    expect(processBoundary.spawn.mock.calls.map(call => call[0])).toEqual(['cmd.exe', 'taskkill'])
    child.emit('close', 1)
    await rejected
    expect(processBoundary.spawn).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('preserves &path: targets by spawning pnpm without the Windows cmd bridge', async () => {
    usePlatform('win32')
    const { runPluginCli } = await import('../src/commands.ts')
    const target = 'github:owner/repo#' + 'a'.repeat(40) + '&path:/maid-atelier'
    const pending = runPluginCli('web', ['add', target, '--prefer-offline'])
    expect(processBoundary.spawn).toHaveBeenCalledTimes(1)
    const [file, argv, options] = processBoundary.spawn.mock.calls[0]!
    // No pnpm.exe in the fake win32 env → bare name fallback; still shell:false.
    expect(file).toBe('pnpm')
    expect(file).not.toBe('cmd.exe')
    expect(argv).toEqual(expect.arrayContaining([target]))
    expect((argv as string[]).filter(arg => arg.includes('&'))).toEqual([target])
    expect(options).toMatchObject({ shell: false })
    child.emit('close', 0)
    await expect(pending).resolves.toMatchObject({ exitCode: 0, timedOut: false })
  })

  it('keeps non-& installs on the Windows cmd.exe bridge', async () => {
    usePlatform('win32')
    const { runPluginCli } = await import('../src/commands.ts')
    const pending = runPluginCli('web', ['add', 'example-skin@1.0.0'])
    expect(processBoundary.spawn).toHaveBeenCalledTimes(1)
    const [file, argv, options] = processBoundary.spawn.mock.calls[0]!
    expect(file).toBe(process.env.ComSpec ?? 'cmd.exe')
    expect(argv[0]).toBe('/d')
    expect(argv[1]).toBe('/s')
    expect(argv[2]).toBe('/c')
    expect(String(argv[3])).toContain('example-skin@1.0.0')
    expect(String(argv[3])).not.toContain('&path:')
    expect(options).toMatchObject({ shell: false, windowsVerbatimArguments: true })
    child.emit('close', 0)
    await expect(pending).resolves.toMatchObject({ exitCode: 0 })
  })

  it('maps &path: spawn ENOENT to the bilingual pnpm-binary hint', async () => {
    usePlatform('win32')
    const { runPluginCli, PNPM_DIRECT_SPAWN_ENOENT_HINT } = await import('../src/commands.ts')
    const target = 'github:owner/repo#' + 'a'.repeat(40) + '&path:/maid-atelier'
    const pending = runPluginCli('web', ['add', target])
    const err = Object.assign(new Error('spawn pnpm ENOENT'), { code: 'ENOENT' })
    child.emit('error', err)
    child.emit('close', null)
    await expect(pending).resolves.toMatchObject({
      exitCode: null,
      stderr: PNPM_DIRECT_SPAWN_ENOENT_HINT,
    })
  })

  it('spawns resolved pnpm.exe with shell:false when present on win32', async () => {
    usePlatform('win32')
    const { mkdirSync, rmSync, writeFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const root = join(tmpdir(), 'dsh-pnpm-exe-spawn')
    rmSync(root, { recursive: true, force: true })
    mkdirSync(root, { recursive: true })
    const exe = join(root, 'pnpm.exe')
    writeFileSync(exe, '')
    const previous = process.env.PNPM_HOME
    process.env.PNPM_HOME = root
    try {
      vi.resetModules()
      const { runPluginCli } = await import('../src/commands.ts')
      const target = 'github:owner/repo#' + 'b'.repeat(40) + '&path:/sub'
      child = fakeChild()
      processBoundary.spawn.mockImplementation((file: string) => file === 'taskkill' ? cleanup : child)
      const pending = runPluginCli('web', ['add', target])
      const [file, argv, options] = processBoundary.spawn.mock.calls[0]!
      expect(file).toBe(exe)
      expect(file).not.toBe('cmd.exe')
      expect(argv).toEqual(expect.arrayContaining([target]))
      expect(options).toMatchObject({ shell: false })
      child.emit('close', 0)
      await expect(pending).resolves.toMatchObject({ exitCode: 0 })
    } finally {
      if (previous === undefined) delete process.env.PNPM_HOME
      else process.env.PNPM_HOME = previous
      rmSync(root, { recursive: true, force: true })
    }
  })
})
