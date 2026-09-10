import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { cmdCommandLine, commandError, createPnpmProvisioner, desktopRunner, normalizedEnvironment, pluginProcess, PNPM_DIRECT_SPAWN_ENOENT_HINT, quoteCmdArg, resolvePnpmForDirectSpawn, toolSearchDirs, type CommandResult, type DesktopPnpmLike } from '../src/commands.ts'

describe('Windows command shim quoting', () => {
  it('quotes cmd metacharacters as one argument', () => {
    const target = 'github:owner/repo#' + 'a'.repeat(40) + '&path:/sub'
    expect(quoteCmdArg(target)).toBe(`"${target}"`)
    expect(cmdCommandLine(['dsh', 'plugin', '--profile', 'web', 'add', target]))
      .toContain(`"${target}"`)
  })

  it('runs git subdirectory specs through pnpm instead of dsh plugin', () => {
    const target = 'github:owner/repo#' + 'a'.repeat(40) + '&path:/maid-atelier'
    const process = pluginProcess('web', ['add', target, '--prefer-offline'])
    expect(process.file).toBe('pnpm')
    expect(process.viaShell).toBe(false)
    expect(process.directPnpm).toBe(true)
    expect(process.argv).toEqual(['add', target, '--prefer-offline', '--dir', process.cwd])
    expect(process.argv.filter(arg => arg.includes('&'))).toEqual([target])
    const ordinary = pluginProcess('web', ['add', 'dskin@1.0.0'])
    expect(ordinary.argv).toContain('plugin')
    expect(ordinary.directPnpm).toBeUndefined()
  })

  it('resolves pnpm.exe or node+pnpm.cjs for Windows direct spawns', () => {
    const root = join('/tmp', 'dsh-pnpm-resolve-fixture')
    rmSync(root, { recursive: true, force: true })
    mkdirSync(join(root, 'pnpm-home'), { recursive: true })
    writeFileSync(join(root, 'pnpm-home', 'pnpm.exe'), '')
    expect(resolvePnpmForDirectSpawn({
      platform: 'win32',
      env: { PNPM_HOME: join(root, 'pnpm-home'), PATH: '', LOCALAPPDATA: '', APPDATA: '' },
      home: root,
      execPath: join(root, 'node.exe'),
    })).toEqual({ file: join(root, 'pnpm-home', 'pnpm.exe'), prefix: [] })

    rmSync(root, { recursive: true, force: true })
    mkdirSync(join(root, 'node_modules', 'pnpm', 'bin'), { recursive: true })
    const cjs = join(root, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
    writeFileSync(cjs, '')
    const execPath = join(root, 'node.exe')
    expect(resolvePnpmForDirectSpawn({
      platform: 'win32',
      env: { PATH: root, PNPM_HOME: '', LOCALAPPDATA: '', APPDATA: '' },
      home: root,
      execPath,
    })).toEqual({ file: execPath, prefix: [cjs] })

    // .cmd alone must not be chosen for shell:false
    rmSync(root, { recursive: true, force: true })
    mkdirSync(join(root, 'npm'), { recursive: true })
    writeFileSync(join(root, 'npm', 'pnpm.cmd'), '')
    expect(resolvePnpmForDirectSpawn({
      platform: 'win32',
      env: { PATH: join(root, 'npm'), PNPM_HOME: '', LOCALAPPDATA: '', APPDATA: '' },
      home: root,
      execPath: join(root, 'node.exe'),
    })).toEqual({ file: 'pnpm', prefix: [] })
    rmSync(root, { recursive: true, force: true })
  })

  it('lists Windows pnpm search dirs including PNPM_HOME', () => {
    const local = 'C:/Users/x/AppData/Local'
    const roaming = 'C:/Users/x/AppData/Roaming'
    expect(toolSearchDirs('win32', {
      PNPM_HOME: 'D:/pnpm',
      LOCALAPPDATA: local,
      APPDATA: roaming,
    }, 'C:/Users/x', 'C:/nodejs')).toEqual([
      'D:/pnpm',
      join(local, 'pnpm'),
      join(roaming, 'npm'),
      'C:/nodejs',
    ])
  })

  it('quotes spaces and embedded double quotes without changing plain tokens', () => {
    expect(quoteCmdArg('C:\\Program Files\\DSH\\runtime.tgz')).toBe('"C:\\Program Files\\DSH\\runtime.tgz"')
    expect(quoteCmdArg('plain-token')).toBe('plain-token')
    expect(quoteCmdArg('value"with"quotes')).toBe('"value""with""quotes"')
  })
})

describe('plugin command errors', () => {
  it('normalizes the pnpm 11 fetch timeout environment key', () => {
    expect(normalizedEnvironment({ env: { 'npm_config-fetch-timeout': '600000' } }))
      .toMatchObject({ pnpm_config_fetch_timeout: '600000' })
  })

  it('keeps a GitHub fetch timeout from being hidden by generic build advice', () => {
    const message = commandError({
      exitCode: 1,
      timedOut: false,
      stdout: '[23] The operation was aborted due to timeout\nTimeoutError: The operation was aborted due to timeout',
      stderr: 'dsh: git-hosted plugins build on install via their prepare script, which pnpm blocks until allowed',
    })

    expect(message).toBe('GitHub 插件下载超时；安装包较大或当前网络较慢，请检查网络后重试')
  })

  it('explains the platform command limit in the timeout error', () => {
    expect(commandError({ exitCode: null, timedOut: true, stdout: '', stderr: '' }))
      .toBe('插件命令执行超时，已停止；请复制日志查看失败步骤')
  })

  it('maps direct pnpm spawn ENOENT to actionable bilingual guidance', () => {
    expect(commandError({
      exitCode: null,
      timedOut: false,
      stdout: '',
      stderr: 'spawn pnpm ENOENT',
    })).toBe(PNPM_DIRECT_SPAWN_ENOENT_HINT)
    expect(commandError({
      exitCode: null,
      timedOut: false,
      stdout: '',
      stderr: PNPM_DIRECT_SPAWN_ENOENT_HINT,
    })).toBe(PNPM_DIRECT_SPAWN_ENOENT_HINT)
  })
})

describe('pnpm provisioning', () => {
  const ok = (): CommandResult => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false })
  const missing = (): CommandResult => ({ exitCode: 1, stdout: '', stderr: 'not found', timedOut: false })

  it('uses Corepack before falling back to npm global installation', async () => {
    const calls: Array<{ file: string; args: readonly string[] }> = []
    const provision = createPnpmProvisioner(async (file, args) => {
      calls.push({ file, args })
      if (file === 'pnpm') return calls.filter(call => call.file === 'pnpm').length === 3 ? ok() : missing()
      if (file === 'corepack') return missing()
      if (file === 'npm' && args[0] === 'install') return ok()
      if (file === 'npm' && args[0] === 'prefix') return { ...ok(), stdout: '/tmp/npm-global\n' }
      return missing()
    })

    await provision()
    await provision()

    expect(calls.map(call => [call.file, ...call.args])).toEqual([
      ['pnpm', '--version'],
      ['corepack', 'enable', 'pnpm'],
      ['pnpm', '--version'],
      ['npm', 'install', '--global', 'pnpm'],
      ['npm', 'prefix', '--global'],
      ['pnpm', '--version'],
    ])
    expect(calls.at(-1)).toBeDefined()
  })

  it('reports a clear error when neither Corepack nor npm can provide pnpm', async () => {
    const provision = createPnpmProvisioner(async () => missing())
    await expect(provision()).rejects.toThrow('未找到 pnpm，已尝试 Corepack 和 npm 自动安装')
  })

  it('stops provisioning when cancellation arrives during a failed probe', async () => {
    const controller = new AbortController()
    const execute = vi.fn(async () => {
      controller.abort()
      return missing()
    })
    await expect(createPnpmProvisioner(execute)({ signal: controller.signal })).rejects.toThrow('操作已取消')
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('shares one explicit budget across provisioning steps', async () => {
    let now = 10_000
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
    const budgets: Array<number | undefined> = []
    try {
      const provision = createPnpmProvisioner(async (_file, _args, options) => {
        budgets.push(options?.timeoutMs)
        now += 40
        return missing()
      })
      await expect(provision({ timeoutMs: 100 })).rejects.toThrow('pnpm 准备超时')
      expect(budgets).toEqual([100, 60, 20])
    } finally {
      clock.mockRestore()
    }
  })
})

describe('Desktop pnpm adapter', () => {
  it('uses installPlugin with an exact recovery request for managed installs', async () => {
    const calls: { run: unknown[]; install: unknown[] } = { run: [], install: [] }
    const handle = () => ({
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      done: Promise.resolve({ exitCode: 0, signal: null }),
      cancel: () => undefined,
    })
    const service: DesktopPnpmLike = {
      runPlugin: (...args) => { calls.run.push(args); return handle() },
      installPlugin: async request => { calls.install.push(request); return handle() },
    }
    const runner = desktopRunner(service, '/profiles/web')

    const result = await runner.installPlugin?.('web', {
      packageName: '@example/skin',
      packageVersion: '1.2.3',
      receiptId: 'receipt-1',
      pnpmOptions: ['--prefer-offline', '--reporter=ndjson'],
    })

    expect(runner.hostKind).toBe('desktop')
    expect(result).toMatchObject({ exitCode: 0, timedOut: false })
    expect(calls.run).toEqual([])
    expect(calls.install).toEqual([{
      pnpmOptions: ['--prefer-offline', '--reporter=ndjson'],
      invokingDir: '/profiles/web',
      recovery: { packageName: '@example/skin', packageVersion: '1.2.3', receiptId: 'receipt-1' },
      signal: expect.any(AbortSignal),
    }])
  })

  it.each(['run', 'install'])('honors the %s timeout and waits for the host to finish cancelling', async mode => {
    vi.useFakeTimers()
    try {
      let finish!: (value: { exitCode: number | null; signal: NodeJS.Signals | null }) => void
      const done = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(resolve => { finish = resolve })
      const cancel = vi.fn()
      const handle = { stdout: new PassThrough(), stderr: new PassThrough(), done, cancel }
      const runner = desktopRunner({ runPlugin: () => handle, installPlugin: async () => handle }, '/profiles/web')
      const result = mode === 'run'
        ? runner('web', ['install'], { timeoutMs: 50 })
        : runner.installPlugin!('web', { packageName: 'example-skin', packageVersion: '1.0.0', receiptId: 'test' }, { timeoutMs: 50 })
      const completed = vi.fn()
      void result.then(completed)
      await vi.advanceTimersByTimeAsync(50)
      expect(cancel).toHaveBeenCalledTimes(1)
      expect(completed).not.toHaveBeenCalled()
      finish({ exitCode: null, signal: 'SIGTERM' })
      await expect(result).resolves.toMatchObject({ timedOut: true, aborted: false })
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not start Desktop operations after cancellation or budget exhaustion', async () => {
    const start = vi.fn()
    const runner = desktopRunner({ runPlugin: start, installPlugin: start }, '/profiles/web')
    await expect(runner('web', ['install'], { signal: AbortSignal.abort() })).resolves.toMatchObject({ aborted: true })
    await expect(runner.installPlugin!('web', { packageName: 'example-skin', packageVersion: '1.0.0', receiptId: 'test' }, { timeoutMs: 0 })).resolves.toMatchObject({ timedOut: true })
    expect(start).not.toHaveBeenCalled()
  })

  it('contains a host cancellation exception and still waits for done', async () => {
    vi.useFakeTimers()
    try {
      let finish!: (value: { exitCode: number | null; signal: NodeJS.Signals | null }) => void
      const done = new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(resolve => { finish = resolve })
      const handle = {
        stdout: new PassThrough(), stderr: new PassThrough(), done,
        cancel: () => { throw new Error('private host error details') },
      }
      const runner = desktopRunner({ runPlugin: () => handle, installPlugin: async () => handle }, '/profiles/web')
      const result = runner('web', ['install'], { timeoutMs: 50 })
      const completed = vi.fn()
      void result.then(completed)
      await vi.advanceTimersByTimeAsync(50)
      expect(completed).not.toHaveBeenCalled()
      finish({ exitCode: null, signal: 'SIGTERM' })
      const outcome = await result
      expect(outcome.timedOut).toBe(true)
      expect(outcome.stderr).toContain('取消请求失败')
      expect(outcome.stderr).not.toContain('private host error details')
    } finally {
      vi.useRealTimers()
    }
  })
})
