import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadCatalog } from '../src/catalog.ts'
import type { CommandOptions, CommandResult, PluginRunner } from '../src/commands.ts'
import { SkinLifecycle } from '../src/lifecycle.ts'
import { atomicWriteJson, atomicWriteText, ensurePatchedDependency, profilePatchFile, readDependencies } from '../src/profile.ts'
import * as profile from '../src/profile.ts'
import type { Operation, SkinEntry } from '../src/types.ts'

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'skin-install-safety-'))
  atomicWriteJson(join(dir, 'package.json'), { dependencies: {} })
  const skin: SkinEntry = { ...loadCatalog().skins[0], id: 'test.npm-skin', package: 'test-npm-skin', rowId: 'test-npm-skin', repo: 'https://github.com/example/skin',
    review: { installation: 'verified', preview: 'verified', compatibility: 'verified' },
    install: { target: `github:example/skin#${'a'.repeat(40)}`, version: '1.0.0', commit: 'a'.repeat(40) } }
  return { dir, skin }
}

const ok = (): CommandResult => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false })

function materialize(dir: string, skin: SkinEntry, integrity?: string): void {
  const pkgDir = join(dir, 'node_modules', skin.package)
  mkdirSync(pkgDir, { recursive: true })
  atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.npm ? skin.install.version : skin.install.target } })
  atomicWriteJson(join(pkgDir, 'package.json'), { name: skin.package, version: skin.install.version, repository: skin.repo, dsh: { client: { platform: 'web' } } })
  if (integrity) atomicWriteText(join(dir, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\npackages:\n  '${skin.package}@${skin.install.version}':\n    resolution:\n      integrity: ${integrity}\n`)
}

async function until(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !predicate(); i++) await new Promise(resolve => setTimeout(resolve, 1))
  expect(predicate()).toBe(true)
}

describe('installation boundaries', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('rejects a mismatched npm artifact before any live install or recovery', async () => {
    const { dir, skin } = fixture()
    skin.install.npm = { name: skin.package, version: '1.0.0', integrity: 'sha512-reviewed', repository: skin.repo, gitHead: skin.install.commit }
    const before = readFileSync(join(dir, 'package.json'), 'utf8')
    const calls: readonly string[][] = []
    const runner: PluginRunner = async (_profile, args) => {
      ;(calls as string[][]).push([...args])
      expect(args).toContain('--dir')
      expect(args).toContain('--ignore-scripts')
      expect(args).toContain('--config.auto-install-peers=false')
      expect(args).toContain('--save-exact')
      materialize(args[args.indexOf('--dir') + 1]!, skin, 'sha512-unreviewed')
      return ok()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])
    const operation = lifecycle.begin('install', skin.id)
    await until(() => operation.phase === 'failed')
    expect(operation.message).toContain('integrity mismatch')
    expect(calls).toHaveLength(1)
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(before)
  })

  it('shares the total budget across retries and cancels without a live-profile repair', async () => {
    vi.useFakeTimers()
    const { dir, skin } = fixture()
    const budgets: number[] = []
    const runner: PluginRunner = async (_profile, args, options) => {
      expect(args).toContain('--dir')
      budgets.push(options!.timeoutMs!)
      if (budgets.length === 1) {
        await new Promise(resolve => setTimeout(resolve, 60))
        return { ...ok(), exitCode: null, timedOut: true }
      }
      return await new Promise(resolve => options!.signal!.addEventListener('abort', () => resolve({ ...ok(), exitCode: null, aborted: true }), { once: true }))
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner, operationTimeoutMs: 100 }, [skin])
    const operation = lifecycle.begin('install', skin.id)
    await vi.advanceTimersByTimeAsync(100)
    expect(budgets).toEqual([100, 40])
    expect(operation).toMatchObject({ phase: 'failed', failure: { action: 'retry' } })
    expect(operation.message).toContain('总时限')
    expect(lifecycle.currentOperation()).toBeNull()
    expect(readDependencies(dir)).toEqual({})
  })

  it('keeps the operation locked until one bounded recovery finishes and reports incomplete recovery', async () => {
    const { dir, skin } = fixture()
    const before = readFileSync(join(dir, 'package.json'), 'utf8')
    let finishRecovery: ((result: CommandResult) => void) | undefined
    let recoveryOptions: CommandOptions | undefined
    let recoveries = 0
    const runner: PluginRunner = async (_profile, args, options) => {
      if (args.includes('--dir')) {
        materialize(args[args.indexOf('--dir') + 1]!, skin)
        return ok()
      }
      if (args[0] === 'add') {
        materialize(dir, skin)
        return { ...ok(), exitCode: 1, stderr: 'network failed' }
      }
      if (args[0] === 'install') {
        recoveries++
        recoveryOptions = options
        expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(before)
        return await new Promise(resolve => { finishRecovery = resolve })
      }
      return ok()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner, recoveryTimeoutMs: 500 }, [skin])
    const operation = lifecycle.begin('install', skin.id)
    await until(() => finishRecovery !== undefined)
    expect(operation).toMatchObject({ phase: 'installing', cancelable: false, step: '恢复原有 profile 依赖' })
    expect(recoveryOptions!.timeoutMs).toBe(500)
    expect(lifecycle.currentOperation()).toBe(operation)
    expect(() => lifecycle.begin('install', skin.id)).toThrow('already running')
    finishRecovery!({ ...ok(), exitCode: null, timedOut: true })
    await until(() => operation.phase === 'failed')
    expect(recoveries).toBe(1)
    expect(operation.message).toContain('依赖恢复未完成')
    expect(operation.message).toContain('网络')
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(before)
  })

  it('uses an independent recovery signal after the total deadline interrupts a live install', async () => {
    vi.useFakeTimers()
    const { dir, skin } = fixture()
    let recoveries = 0
    const runner: PluginRunner = async (_profile, args, options) => {
      if (args.includes('--dir')) {
        materialize(args[args.indexOf('--dir') + 1]!, skin)
        return ok()
      }
      if (args[0] === 'add') {
        materialize(dir, skin)
        return await new Promise(resolve => options!.signal!.addEventListener('abort', () => resolve({ ...ok(), exitCode: null, aborted: true }), { once: true }))
      }
      expect(args[0]).toBe('install')
      expect(options!.signal!.aborted).toBe(false)
      expect(options!.timeoutMs).toBe(50)
      expect(readDependencies(dir)).toEqual({})
      recoveries++
      return ok()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner, operationTimeoutMs: 100, recoveryTimeoutMs: 50 }, [skin])
    const operation: Operation = lifecycle.begin('install', skin.id)
    await vi.advanceTimersByTimeAsync(100)
    expect(operation.phase).toBe('failed')
    expect(operation.message).toContain('总时限')
    expect(recoveries).toBe(1)
    expect(readDependencies(dir)).toEqual({})
  })

  it('rejects an npm prefetch that omitted its exact dependency spec', async () => {
    const { dir, skin } = fixture()
    skin.install.npm = { name: skin.package, version: '1.0.0', integrity: 'sha512-reviewed', repository: skin.repo, gitHead: skin.install.commit }
    const runner = vi.fn<PluginRunner>(async (_profile, args) => {
      const temporary = args[args.indexOf('--dir') + 1]!
      materialize(temporary, skin, 'sha512-reviewed')
      atomicWriteJson(join(temporary, 'package.json'), { dependencies: {} })
      return ok()
    })
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])
    const operation = lifecycle.begin('install', skin.id)
    await until(() => operation.phase === 'failed')
    expect(operation.message).toContain('未记录目录固定版本')
    expect(runner).toHaveBeenCalledTimes(1)
    expect(readDependencies(dir)).toEqual({})
  })

  it.each(['busy', 'host-recovered'])('leaves a failed Desktop managed transaction to its host: %s', async failure => {
    const { dir, skin } = fixture()
    skin.install.desktop = { mode: 'managed', registry: 'npm', packageName: skin.package, packageVersion: skin.install.version }
    const run = vi.fn<PluginRunner>(async () => ok())
    const runner = Object.assign(run, {
      installPlugin: async () => {
        // A concurrent transaction, or the host's own receipt recovery, has
        // established this state after the market took its initial snapshot.
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { 'host-owned-package': '2.0.0' } })
        if (failure === 'busy') throw new Error('another desktop pnpm operation is already running')
        return { ...ok(), exitCode: 1, stderr: 'host restored its managed transaction' }
      },
    })
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner, hostKind: 'desktop' }, [skin])
    const operation = lifecycle.begin('install', skin.id)
    await until(() => operation.phase === 'failed')
    expect(readDependencies(dir)).toEqual({ 'host-owned-package': '2.0.0' })
    expect(run).not.toHaveBeenCalled()
  })

  it('undoes failed market registration against the completed Desktop transaction baseline', async () => {
    const { dir, skin } = fixture()
    skin.install.desktop = { mode: 'managed', registry: 'npm', packageName: skin.package, packageVersion: skin.install.version }
    const run = vi.fn<PluginRunner>(async () => ok())
    const runner = Object.assign(run, {
      installPlugin: async () => {
        materialize(dir, skin)
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.version } })
        return ok()
      },
    })
    vi.spyOn(profile, 'writeMarketState').mockImplementation(() => { throw new Error('market state write failed') })
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner, hostKind: 'desktop' }, [skin])
    const operation = lifecycle.begin('install', skin.id)
    await until(() => operation.phase === 'failed')
    expect(operation.message).toContain('market state write failed')
    expect(readDependencies(dir)).toEqual({ [skin.package]: skin.install.version })
    expect(existsSync(profilePatchFile(dir))).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })

  it.each(['initial', 'final'])('reports a failed %s configuration restore without hiding the original failure or offering retry', async restorePhase => {
    const { dir, skin } = fixture()
    let recoveries = 0
    const runner: PluginRunner = async (_profile, args) => {
      if (args.includes('--dir')) {
        materialize(args[args.indexOf('--dir') + 1]!, skin)
      } else if (args[0] === 'add') {
        materialize(dir, skin)
        if (restorePhase === 'initial') mkdirSync(profilePatchFile(dir), { recursive: true })
        return { ...ok(), exitCode: 1, stderr: 'network failed' }
      } else if (args[0] === 'install') {
        recoveries++
        mkdirSync(profilePatchFile(dir), { recursive: true })
      }
      return ok()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])
    const operation = lifecycle.begin('install', skin.id)
    await until(() => operation.phase === 'failed')
    expect(operation.message).toContain('网络')
    expect(operation.message).toContain('配置恢复未完成')
    expect(operation.message).not.toContain('配置已恢复')
    expect(operation.failure?.kind).toBe('network')
    expect(operation.failure?.action).toBeUndefined()
    expect(recoveries).toBe(restorePhase === 'initial' ? 0 : 1)
  })

  it('retains configuration restore errors after the total deadline', async () => {
    vi.useFakeTimers()
    const { dir, skin } = fixture()
    const runner: PluginRunner = async (_profile, args, options) => {
      if (args.includes('--dir')) {
        materialize(args[args.indexOf('--dir') + 1]!, skin)
        return ok()
      }
      expect(args[0]).toBe('add')
      materialize(dir, skin)
      mkdirSync(profilePatchFile(dir))
      return await new Promise(resolve => options!.signal!.addEventListener('abort', () => resolve({ ...ok(), exitCode: null, aborted: true }), { once: true }))
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner, operationTimeoutMs: 100 }, [skin])
    const operation = lifecycle.begin('install', skin.id)
    await vi.advanceTimersByTimeAsync(100)
    expect(operation.phase).toBe('failed')
    expect(operation.message).toContain('总时限')
    expect(operation.message).toContain('配置恢复未完成')
    expect(operation.failure?.action).toBeUndefined()
  })

  it.each(['lockfile', 'materialization'])('protects the initial %s repair with a snapshot and independent recovery budget', async preparation => {
    vi.useFakeTimers()
    const { dir, skin } = fixture()
    if (preparation === 'lockfile') {
      atomicWriteText(join(dir, 'test.patch'), 'patch contents\n')
      ensurePatchedDependency(dir, skin.package, skin.install.version, 'test.patch')
    } else {
      atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    }
    const before = readFileSync(join(dir, 'package.json'), 'utf8')
    let installs = 0
    const runner: PluginRunner = async (_profile, args, options) => {
      expect(args[0]).toBe('install')
      installs++
      if (installs === 1) {
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { residue: '1.0.0' } })
        return await new Promise(resolve => options!.signal!.addEventListener('abort', () => resolve({ ...ok(), exitCode: null, aborted: true }), { once: true }))
      }
      expect(options!.signal!.aborted).toBe(false)
      expect(options!.timeoutMs).toBe(50)
      expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(before)
      return ok()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner, operationTimeoutMs: 100, recoveryTimeoutMs: 50 }, [skin])
    const operation = lifecycle.begin('install', skin.id)
    await vi.advanceTimersByTimeAsync(100)
    expect(operation.phase).toBe('failed')
    expect(installs).toBe(2)
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(before)
  })
})
