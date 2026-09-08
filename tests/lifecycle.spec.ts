import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { SkinLifecycle } from '../src/lifecycle.ts'
import { atomicWriteJson, atomicWriteText, compatibilityPatchFile, ensurePatchedDependency, patchedDependenciesNeedSync, pnpmWorkspaceFile, profilePatchFile, readDependencies, readMarketState, writeMarketState } from '../src/profile.ts'
import type { CommandResult, PluginInstallRequest, PluginRunner } from '../src/commands.ts'
import type { LoaderEntry, Operation } from '../src/types.ts'

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'skin-lifecycle-'))
  atomicWriteJson(join(dir, 'package.json'), { dependencies: {} })
  return dir
}

async function finished(operation: Operation): Promise<Operation> {
  for (let index = 0; index < 200; index++) {
    if (operation.phase === 'done' || operation.phase === 'failed' || operation.phase === 'cancelled') return operation
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('operation did not finish')
}

function success(): CommandResult { return { exitCode: 0, stdout: '', stderr: '', timedOut: false } }

function firstInstallable(lifecycle: SkinLifecycle) {
  // These generic lifecycle runners materialize GitHub targets. Tests of npm
  // installation attach explicit npm metadata and verify that separate path.
  const skin = lifecycle.catalog.find(item => item.review?.installation !== 'manual-only' && item.install.npm === undefined)
  if (skin === undefined) throw new Error('fixture catalog has no GitHub-only installable skin')
  return skin
}

function anotherInstallable(lifecycle: SkinLifecycle, excludedId: string) {
  const skin = lifecycle.catalog.find(item => item.id !== excludedId && item.review?.installation !== 'manual-only' && item.install.npm === undefined)
  if (skin === undefined) throw new Error('fixture catalog has only one GitHub-only installable skin')
  return skin
}

function writeBundlePackage(dir: string, skin: { package: string; rowId: string; install: { version: string } }): void {
  const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
  mkdirSync(packageDir, { recursive: true })
  atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: skin.install.version, dsh: { bundle: { patch: './cordis.patch.yml' }, client: {} } })
  atomicWriteText(join(packageDir, 'cordis.patch.yml'), `- insert:\n    - id: ${skin.rowId}\n      name: ${JSON.stringify(skin.package)}\n`)
}

function writeBundleRows(dir: string, skin: { package: string; install: { version: string } }, rows: Array<{ id: string; name: string }>): void {
  const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
  mkdirSync(packageDir, { recursive: true })
  atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: skin.install.version, dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } } })
  atomicWriteText(join(packageDir, 'cordis.patch.yml'), `- insert:\n${rows.map(row => `    - id: ${row.id}\n      name: ${JSON.stringify(row.name)}`).join('\n')}\n`)
}

function syncPatchLockfile(dir: string): void {
  const workspace = parse(readFileSync(pnpmWorkspaceFile(dir), 'utf8')) as { patchedDependencies?: Record<string, unknown> }
  const patchedDependencies = Object.fromEntries(Object.entries(workspace.patchedDependencies ?? {}).flatMap(([key, value]) => {
    if (typeof value !== 'string') return []
    const patchFile = join(dir, value)
    const hash = createHash('sha256').update(readFileSync(patchFile, 'utf8').replace(/\r\n/g, '\n')).digest('hex')
    return [[key, hash]]
  }))
  atomicWriteText(join(dir, 'pnpm-lock.yaml'), stringify({
    lockfileVersion: '9.0',
    ...(Object.keys(patchedDependencies).length === 0 ? {} : { patchedDependencies }),
  }, { lineWidth: 0 }))
}

describe('skin lifecycle', () => {
  it('cancels a prefetch without mutating the live profile', async () => {
    const dir = fixture()
    let commandArgs: readonly string[] = []
    const runner: PluginRunner = async (_profile, args, options) => {
      commandArgs = args
      return await new Promise(resolve => {
        options?.signal?.addEventListener('abort', () => resolve({ ...success(), exitCode: null, aborted: true }), { once: true })
      })
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner })
    const skin = firstInstallable(lifecycle)
    const operation = lifecycle.begin('install', skin.id)
    for (let index = 0; index < 100 && operation.phase !== 'downloading'; index++) await new Promise(resolve => setTimeout(resolve, 5))

    expect(operation).toMatchObject({ phase: 'downloading', cancelable: true })
    expect(commandArgs).toContain('--reporter=ndjson')
    const tempDirectory = commandArgs[commandArgs.indexOf('--dir') + 1]
    expect(tempDirectory).toBeTruthy()
    expect(readFileSync(join(tempDirectory!, '.npmrc'), 'utf8')).toContain('auto-install-peers=false')
    lifecycle.cancel(operation.id)

    expect(await finished(operation)).toMatchObject({ phase: 'cancelled', cancelable: false, message: '操作已取消' })
    expect(readDependencies(dir)).toEqual({})
  })

  it('can replace its installable catalog without restarting the market plugin', async () => {
    const dir = fixture()
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const added = { ...lifecycle.catalog[0], id: 'remote.new-skin', package: 'remote-new-skin', rowId: 'remote-new-skin' }

    await lifecycle.replaceCatalog([...lifecycle.catalog, added])

    expect(lifecycle.skin(added.id)).toEqual(added)
    expect(lifecycle.states().some(state => state.skinId === added.id)).toBe(true)
  })

  it('keeps every loader inserted by a bundle in lockstep with its owning skin', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const skin = { ...base, id: 'bundle-owner.skin', package: '@example/bundle-owner', rowId: 'bundle-owner' }
    const rows = [
      { id: 'shared-sidebar', name: 'shared-sidebar' },
      { id: 'editor-settings', name: 'editor-settings' },
      { id: skin.rowId, name: skin.package },
    ]
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    writeBundleRows(dir, skin, rows)
    writeMarketState(dir, {
      version: 1,
      activeSkinId: null,
      disabledSkinIds: [skin.id],
      pinnedSkinIds: [],
      managedLoaders: Object.fromEntries(rows.slice(0, -1).map(row => [row.id, { ...row, packageName: skin.package, ownerSkinIds: [skin.id] }])),
    })
    const updates: string[] = []
    const entries: LoaderEntry[] = rows.map(row => {
      const entry: LoaderEntry = {
        options: { id: row.id, name: row.name },
        fiber: {},
        update: async value => {
          entry.options.disabled = value.disabled
          updates.push(`${row.id}:${String(value.disabled)}`)
        },
      }
      return entry
    })
    const lifecycle = new SkinLifecycle({ loader: { entries: () => entries } }, { profile: 'test', profileDir: dir, runner: async () => success() }, [skin])

    await lifecycle.replay()

    let operations = parse(readFileSync(profilePatchFile(dir), 'utf8')) as Array<{ id?: string; disabled?: boolean }>
    expect(operations).toEqual([])
    expect((JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }).dsh?.profile?.bundles ?? []).not.toContain(skin.package)
    expect(updates).toEqual(expect.arrayContaining(rows.map(row => `${row.id}:true`)))

    updates.length = 0
    writeMarketState(dir, { ...readMarketState(dir), activeSkinId: skin.id, disabledSkinIds: [] })
    await lifecycle.replay()

    operations = parse(readFileSync(profilePatchFile(dir), 'utf8')) as Array<{ id?: string; disabled?: boolean }>
    expect(operations).toEqual([])
    expect((JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }).dsh?.profile?.bundles ?? []).toContain(skin.package)
    expect(updates).toEqual(expect.arrayContaining(rows.map(row => `${row.id}:null`)))
  })

  it('does not adopt bundle child loaders from a legacy install without a receipt', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const skin = { ...base, id: 'legacy-bundle.skin', package: '@example/legacy-bundle', rowId: 'legacy-bundle' }
    const child = { id: 'user-editor', name: 'user-editor' }
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    writeBundleRows(dir, skin, [child, { id: skin.rowId, name: skin.package }])
    writeMarketState(dir, { version: 1, activeSkinId: null, disabledSkinIds: [skin.id], pinnedSkinIds: [] })
    const updates: string[] = []
    const childEntry: LoaderEntry = {
      options: child,
      fiber: {},
      update: async value => { updates.push(String(value.disabled)) },
    }
    const runner: PluginRunner = async (_profile, args) => {
      if (args[0] === 'remove') atomicWriteJson(join(dir, 'package.json'), { dependencies: {} })
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [childEntry] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    await lifecycle.replay()

    const operations = existsSync(profilePatchFile(dir)) ? parse(readFileSync(profilePatchFile(dir), 'utf8')) as Array<{ id?: string }> : []
    expect(operations.some(operation => operation.id === child.id)).toBe(false)
    expect(updates).toEqual([])
    expect(readMarketState(dir).managedLoaders).toBeUndefined()

    expect((await finished(lifecycle.begin('uninstall', skin.id))).phase).toBe('done')
    expect(updates).toEqual(['true'])
    expect(readMarketState(dir).managedLoaders).toBeUndefined()
  })

  it('preserves a user-authored override even for a loader recorded by the market', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const skin = { ...base, id: 'override-owner.skin', package: '@example/override-owner', rowId: 'override-owner' }
    const child = { id: 'editor-settings', name: 'editor-settings' }
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    writeBundleRows(dir, skin, [child, { id: skin.rowId, name: skin.package }])
    atomicWriteText(profilePatchFile(dir), `- id: ${child.id}\n  disabled: false\n  config:\n    theme: user-choice\n`)
    writeMarketState(dir, {
      version: 1,
      activeSkinId: null,
      disabledSkinIds: [skin.id],
      pinnedSkinIds: [],
      managedLoaders: { [child.id]: { ...child, packageName: skin.package, ownerSkinIds: [skin.id] } },
    })
    const updates: string[] = []
    const childEntry: LoaderEntry = {
      options: child,
      fiber: {},
      update: async value => { updates.push(String(value.disabled)) },
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [childEntry] } }, { profile: 'test', profileDir: dir, runner: async () => success() }, [skin])

    await lifecycle.replay()

    expect(readFileSync(profilePatchFile(dir), 'utf8')).toContain('theme: user-choice')
    expect(readFileSync(profilePatchFile(dir), 'utf8')).toContain('disabled: false')
    expect(updates).toEqual([])
  })

  it('records only non-primary loaders introduced by a fresh market install', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const skin = { ...base, id: 'receipt-owner.skin', package: '@example/receipt-owner', rowId: 'receipt-owner' }
    const child = { id: 'receipt-editor', name: 'receipt-editor' }
    const rows = [child, { id: skin.rowId, name: skin.package }]
    const runner: PluginRunner = async (_profile, args) => {
      if (args[0] === 'add' && args.includes('--dir')) {
        const temporary = args[args.indexOf('--dir') + 1]!
        atomicWriteJson(join(temporary, 'package.json'), { private: true, dependencies: { [skin.package]: skin.install.target } })
        writeBundleRows(temporary, skin, rows)
        return success()
      }
      if (args[0] === 'add') {
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
        writeBundleRows(dir, skin, rows)
      }
      if (args[0] === 'remove') atomicWriteJson(join(dir, 'package.json'), { dependencies: {} })
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const operation = await finished(lifecycle.begin('install', skin.id))

    expect(operation.phase).toBe('done')
    expect(readMarketState(dir).managedLoaders).toEqual({
      [child.id]: { ...child, packageName: skin.package, ownerSkinIds: [skin.id] },
    })
    const operations = parse(readFileSync(profilePatchFile(dir), 'utf8')) as Array<{ id?: string; disabled?: boolean }>
    expect(operations).toEqual([])
    expect((JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }).dsh?.profile?.bundles ?? []).not.toContain(skin.package)

    expect((await finished(lifecycle.begin('uninstall', skin.id))).phase).toBe('done')
    expect(readMarketState(dir).managedLoaders).toBeUndefined()
    expect((parse(readFileSync(profilePatchFile(dir), 'utf8')) as Array<{ id?: string }>).some(row => row.id === child.id)).toBe(false)
  })

  it('gates market installation by installation readiness, not compatibility verification', () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = probe.catalog[0]
    const compatibleManual = { ...base, id: 'manual.skin', review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'manual-only' as const } }
    const unverifiedInstallable = { ...base, id: 'installable.skin', review: { compatibility: 'unverified' as const, preview: 'verified' as const, installation: 'verified' as const } }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() }, [compatibleManual, unverifiedInstallable])

    expect(() => lifecycle.begin('install', compatibleManual.id)).toThrow('尚未满足市场自动安装所需信息')
    expect(() => lifecycle.begin('install', unverifiedInstallable.id)).not.toThrow()
  })

  it('uses Desktop installPlugin for managed npm skins and blocks manual-only skins', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = probe.catalog[0]
    const managed = {
      ...base,
      id: 'desktop.managed',
      install: {
        ...base.install,
        desktop: { mode: 'managed' as const, registry: 'npm' as const, packageName: base.package, packageVersion: base.install.version },
      },
    }
    const manual = {
      ...base,
      id: 'desktop.manual',
      install: { ...base.install, desktop: { mode: 'manual-only' as const, reason: 'npm-package-not-found' } },
    }
    const calls: { run: readonly string[][]; install: PluginInstallRequest[] } = { run: [], install: [] }
    const runner: PluginRunner = Object.assign(
      async (_profile: string, args: readonly string[]) => { calls.run.push(args); return success() },
      {
        installPlugin: async (_profile: string, request: PluginInstallRequest) => {
          calls.install.push(request)
          atomicWriteJson(join(dir, 'package.json'), { dependencies: { [managed.package]: `${managed.package}@${managed.install.version}` } })
          writeBundlePackage(dir, managed)
          return success()
        },
      },
    )
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner, hostKind: 'desktop' }, [managed, manual])

    expect(() => lifecycle.begin('install', manual.id)).toThrow('Desktop 当前不支持该皮肤的一键安装')
    const operation = await finished(lifecycle.begin('install', managed.id))

    expect(operation).toMatchObject({ phase: 'done', message: 'installed; choose Use to activate' })
    expect(calls.run).toEqual([])
    expect(calls.install).toHaveLength(1)
    expect(calls.install[0]).toMatchObject({ packageName: managed.package, packageVersion: managed.install.version })
    expect(readDependencies(dir)[managed.package]).toContain(managed.install.version)
  })

  it('repairs a dependency recorded without a materialized package manifest', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const skin = firstInstallable(probe)
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    let repairCalls = 0
    const runner: PluginRunner = async (_profile, args) => {
      if (args[0] === 'install') {
        repairCalls += 1
        writeBundlePackage(dir, skin)
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const operation = await finished(lifecycle.begin('install', skin.id))

    expect(operation).toMatchObject({ phase: 'done', message: 'skin was already installed; market state reconciled' })
    expect(repairCalls).toBe(1)
    expect(lifecycle.states().find(item => item.skinId === skin.id)?.installation).toBe('installed')
  })

  it('repairs a stale compatibility lockfile before installing another skin', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const skin = firstInstallable(probe)
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    writeBundlePackage(dir, skin)
    const patchFile = compatibilityPatchFile(dir, '@example/stale-skin', '1.0.0')
    atomicWriteText(patchFile, 'stale patch\n')
    ensurePatchedDependency(dir, '@example/stale-skin', '1.0.0', '.dsh-skin-market/patches/' + basename(patchFile))
    const calls: Array<readonly string[]> = []
    const runner: PluginRunner = async (_profile, args) => {
      calls.push(args)
      if (args[0] === 'install') syncPatchLockfile(dir)
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const operation = await finished(lifecycle.begin('install', skin.id))

    expect(operation.phase).toBe('done')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('--no-frozen-lockfile')
    expect(patchedDependenciesNeedSync(dir)).toBe(false)
  })

  it('recovers a Desktop managed install by retrying the existing installPlugin request', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = probe.catalog[0]
    const managed = {
      ...base,
      id: 'desktop.recovery',
      install: {
        ...base.install,
        desktop: { mode: 'managed' as const, registry: 'npm' as const, packageName: base.package, packageVersion: base.install.version },
      },
    }
    const calls: PluginInstallRequest[] = []
    const runner: PluginRunner = Object.assign(
      async () => success(),
      {
        installPlugin: async (_profile: string, request: PluginInstallRequest) => {
          calls.push(request)
          return calls.length === 1
            ? { ...success(), exitCode: 1, stderr: 'published within the minimumReleaseAge cutoff' }
            : success()
        },
      },
    )
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner, hostKind: 'desktop' }, [managed])

    const operation = await finished(lifecycle.begin('install', managed.id))

    expect(operation.phase).toBe('failed')
    expect(calls).toHaveLength(2)
    expect(calls[0]?.pnpmOptions).not.toContain('--config.minimumReleaseAge=0')
    expect(calls[1]?.pnpmOptions).toContain('--config.minimumReleaseAge=0')
    expect(calls[0]?.receiptId).toBe(calls[1]?.receiptId)
  })

  it('auto-retries a new-package lockfile failure before mutating the live profile', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = probe.catalog.find(item => item.id === 'wyh66666666.dsh-transparent-ui-plugin')!
    const attempts: Array<readonly string[]> = []
    const runner: PluginRunner = async (_profile, args) => {
      attempts.push(args)
      if (args.includes('--dir')) {
        if (!args.includes('--config.minimumReleaseAge=0')) return { ...success(), exitCode: 1, stderr: 'published within the minimumReleaseAge cutoff' }
        return success()
      }
      if (args[0] === 'add') {
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { [base.package]: base.install.target } })
        const packageDir = join(dir, 'node_modules', ...base.package.split('/'))
        mkdirSync(packageDir, { recursive: true })
        atomicWriteJson(join(packageDir, 'package.json'), { name: base.package, version: base.install.version, dsh: { client: { platform: 'web' } } })
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [base])

    const operation = await finished(lifecycle.begin('install', base.id))

    expect(operation.phase).toBe('done')
    expect(attempts[0]).not.toContain('--config.minimumReleaseAge=0')
    expect(attempts[1]).toContain('--config.minimumReleaseAge=0')
    expect(attempts.find(args => args[0] === 'add' && !args.includes('--dir'))).not.toContain('--config.minimumReleaseAge=0')
  })

  it('pre-approves the exact pnpm build key for a monorepo package', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = probe.catalog.find(item => item.id === 'wyh66666666.dsh-transparent-ui-plugin')!
    const allowBuild = '@linxin666/dsh-web-ui-all@https://codeload.github.com/springbrand-lab/dsh-skin-universe/tar.gz/29fa777bdd8c9f7d93700c56c11a96a32634d967'
    const skin = {
      ...base,
      id: 'monorepo-build.skin',
      subpath: 'packages/dsh-web-ui-all',
      install: {
        ...base.install,
        target: 'github:springbrand-lab/dsh-skin-universe#29fa777bdd8c9f7d93700c56c11a96a32634d967&path:/packages/dsh-web-ui-all',
        commit: '29fa777bdd8c9f7d93700c56c11a96a32634d967',
        allowBuild,
      },
    }
    const runner: PluginRunner = async (_profile, args) => {
      if (args.includes('--dir')) {
        const temporary = args[args.indexOf('--dir') + 1]!
        expect(readFileSync(join(temporary, 'pnpm-workspace.yaml'), 'utf8')).toContain(`${allowBuild}#path:/packages/dsh-web-ui-all`)
      }
      if (args[0] === 'add' && !args.includes('--dir')) {
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
        const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
        mkdirSync(packageDir, { recursive: true })
        atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: skin.install.version, dsh: { client: { platform: 'web' } } })
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    expect((await finished(lifecycle.begin('install', skin.id))).phase).toBe('done')
    expect(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8')).toContain(`${allowBuild}#path:/packages/dsh-web-ui-all`)
  })

  it('applies a generic compatibility adapter during live install', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = probe.catalog[0]
    const commit = '0123456789abcdef0123456789abcdef01234567'
    const skin = {
      ...base,
      id: 'generic-compatible.skin',
      package: '@example/generic-skin',
      rowId: 'generic-skin',
      repo: 'https://github.com/example/generic-skin',
      install: { ...base.install, target: 'github:example/generic-skin#' + commit, version: '1.0.0', commit },
      compatibility: {
        dsh: '^0.1.0-rc.5',
        platform: ['web'],
        adapters: [{ id: 'generic-keyed-slot', kind: 'keyed-slot-id-to-key' as const, when: '>=0.1.0-rc.6 <0.2.0-0', slot: 'settings.plugin.item', key: 'locale' }],
      },
    }
    let compatibilityInstallCalls = 0
    let compatibilityInstallArgs: readonly string[] = []
    const runner: PluginRunner = async (_profile, args) => {
      if (args.includes('--dir')) return success()
      if (args[0] === 'add') {
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
        const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
        mkdirSync(join(packageDir, 'lib'), { recursive: true })
        atomicWriteJson(join(packageDir, 'package.json'), {
          name: skin.package,
          version: skin.install.version,
          exports: { './client': { default: './lib/client.js' } },
          dsh: { client: { platform: 'web' } },
        })
        atomicWriteText(join(packageDir, 'lib/client.js'), [
          'const NS = "settings.generic"',
          'ctx.slots.register({',
          '  name: "settings.plugin.item",',
          '  id: "generic",',
          '  locale: NS,',
          '}, Card)',
        ].join('\n'))
      }
      if (args[0] === 'install') {
        compatibilityInstallCalls += 1
        compatibilityInstallArgs = args
        syncPatchLockfile(dir)
      }
      return success()
    }
    const lifecycle = new SkinLifecycle(
      { loader: { entries: () => [] } },
      {
        profile: 'test',
        profileDir: dir,
        runner,
        runtime: { version: '0.1.1-rc.1', capabilities: ['slot:keyed:settings.plugin.item'], source: 'injected' },
      },
      [skin],
    )

    expect((await finished(lifecycle.begin('install', skin.id))).phase).toBe('done')
    expect(compatibilityInstallCalls).toBe(1)
    expect(compatibilityInstallArgs).toContain('--no-frozen-lockfile')
    expect(patchedDependenciesNeedSync(dir)).toBe(false)
    expect(readFileSync(pnpmWorkspaceFile(dir), 'utf8')).toContain(skin.package + '@' + skin.install.version)
    expect(readFileSync(compatibilityPatchFile(dir, skin.package, skin.install.version), 'utf8')).toContain('+  key: "settings.generic",')
  })

  it('syncs and removes compatibility patch metadata as one uninstall transaction', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const skin = firstInstallable(probe)
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    writeBundlePackage(dir, skin)
    const patchFile = compatibilityPatchFile(dir, skin.package, skin.install.version)
    atomicWriteText(patchFile, 'compatibility patch\n')
    ensurePatchedDependency(dir, skin.package, skin.install.version, '.dsh-skin-market/patches/' + basename(patchFile))
    syncPatchLockfile(dir)
    const installArgs: Array<readonly string[]> = []
    const runner: PluginRunner = async (_profile, args) => {
      installArgs.push(args)
      if (args[0] === 'remove') {
        if (readFileSync(pnpmWorkspaceFile(dir), 'utf8').includes(skin.package + '@' + skin.install.version)) {
          return { ...success(), exitCode: 1, stderr: 'ERR_PNPM_UNUSED_PATCH' }
        }
        atomicWriteJson(join(dir, 'package.json'), { dependencies: {} })
      }
      if (args[0] === 'install') syncPatchLockfile(dir)
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const operation = await finished(lifecycle.begin('uninstall', skin.id))

    expect(operation.phase).toBe('done')
    expect(readDependencies(dir)).toEqual({})
    expect(readFileSync(pnpmWorkspaceFile(dir), 'utf8')).not.toContain(skin.package + '@' + skin.install.version)
    expect(readFileSync(join(dir, 'pnpm-lock.yaml'), 'utf8')).not.toContain('patchedDependencies')
    expect(() => readFileSync(patchFile, 'utf8')).toThrow()
    expect(patchedDependenciesNeedSync(dir)).toBe(false)
    expect(installArgs.filter(args => args[0] === 'install')).toHaveLength(0)
  })

  it('detaches old compatibility patches before updating a package', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = probe.catalog[0]
    const skin = {
      ...base,
      id: 'update-patch.skin',
      package: '@example/update-skin',
      rowId: 'update-skin',
      install: { ...base.install, target: 'github:example/update-skin#newcommit', version: '2.0.0', commit: 'newcommit' },
    }
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: 'github:example/update-skin#oldcommit' } })
    const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
    mkdirSync(packageDir, { recursive: true })
    atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: '1.0.0', dsh: { client: { platform: 'web' } } })
    const oldPatch = compatibilityPatchFile(dir, skin.package, '1.0.0')
    atomicWriteText(oldPatch, 'old compatibility patch\n')
    ensurePatchedDependency(dir, skin.package, '1.0.0', '.dsh-skin-market/patches/' + basename(oldPatch))
    syncPatchLockfile(dir)
    const installArgs: Array<readonly string[]> = []
    const runner: PluginRunner = async (_profile, args) => {
      installArgs.push(args)
      if (args[0] === 'install') syncPatchLockfile(dir)
      if (args[0] === 'add' && !args.includes('--dir')) {
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
        atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: skin.install.version, dsh: { client: { platform: 'web' } } })
      }
      return success()
    }
    const runtimeEntry: LoaderEntry = {
      options: { id: skin.rowId, name: skin.rowId },
      fiber: {},
      update: async value => { runtimeEntry.options.disabled = value.disabled },
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [runtimeEntry] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const operation = await finished(lifecycle.begin('update', skin.id))

    expect(operation.phase).toBe('done')
    expect(readDependencies(dir)[skin.package]).toBe(skin.install.target)
    expect(() => readFileSync(oldPatch, 'utf8')).toThrow()
    expect(readFileSync(pnpmWorkspaceFile(dir), 'utf8')).not.toContain('@example/update-skin@1.0.0')
    expect(readFileSync(join(dir, 'pnpm-lock.yaml'), 'utf8')).not.toContain('@example/update-skin@1.0.0')
    expect(patchedDependenciesNeedSync(dir)).toBe(false)
    expect(installArgs.some(args => args[0] === 'install')).toBe(false)
  })

  it('installs the curated npm source before the GitHub fallback and saves it exactly', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const integrity = 'sha512-abc'
    const skin = {
      ...base,
      id: 'npm-priority.skin',
      install: { ...base.install, npm: { name: base.package, version: base.install.version, integrity, repository: base.repo, gitHead: base.install.commit } },
    }
    const calls: string[][] = []
    const runner: PluginRunner = async (_profile, args) => {
      calls.push([...args])
      if (args[0] === 'add') {
        const targetDir = args.includes('--dir') ? args[args.indexOf('--dir') + 1]! : dir
        atomicWriteJson(join(targetDir, 'package.json'), { dependencies: { [skin.package]: skin.install.version } })
        const packageDir = join(targetDir, 'node_modules', ...skin.package.split('/'))
        mkdirSync(packageDir, { recursive: true })
        atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: skin.install.version, repository: { type: 'git', url: `git+${skin.repo}.git` }, dsh: { client: { platform: 'web' } } })
        atomicWriteText(join(targetDir, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\npackages:\n  '${skin.package}@${skin.install.version}':\n    resolution:\n      integrity: ${integrity}\n`)
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    expect((await finished(lifecycle.begin('install', skin.id))).phase).toBe('done')
    expect(calls.find(args => args[0] === 'add' && args.includes('--dir'))).toContain(`${skin.package}@${skin.install.version}`)
    expect(calls.find(args => args[0] === 'add' && !args.includes('--dir'))).toEqual(['add', `${skin.package}@${skin.install.version}`, '--prefer-offline', '--save-exact', '--reporter=ndjson'])
  })

  it('requires explicit approval for an unknown exact build key and retries with that key', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = probe.catalog.find(item => item.id === 'wyh66666666.dsh-transparent-ui-plugin')!
    const buildKey = '@example/skin@https://codeload.github.com/example/skin/tar.gz/0123456789abcdef0123456789abcdef01234567'
    const skin = { ...base, id: 'build-approval.skin', install: { ...base.install, target: 'github:example/skin#0123456789abcdef0123456789abcdef01234567', commit: '0123456789abcdef0123456789abcdef01234567', allowBuild: undefined } }
    let rejected = false
    const prefetchApprovals: string[] = []
    const runner: PluginRunner = async (_profile, args) => {
      if (args.includes('--dir')) {
        const temporary = args[args.indexOf('--dir') + 1]!
        const workspaceFile = join(temporary, 'pnpm-workspace.yaml')
        if (!existsSync(workspaceFile) || !readFileSync(workspaceFile, 'utf8').includes(buildKey)) {
          rejected = true
          return { ...success(), exitCode: 1, stderr: `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED\n${buildKey} needs to execute build scripts but is not in allowBuilds` }
        }
        prefetchApprovals.push(readFileSync(workspaceFile, 'utf8'))
        return success()
      }
      if (args[0] === 'add' && !rejected) {
        rejected = true
        return { ...success(), exitCode: 1, stderr: `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED\n${buildKey} needs to execute build scripts but is not in allowBuilds` }
      }
      if (args[0] === 'add') {
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
        const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
        mkdirSync(packageDir, { recursive: true })
        atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: skin.install.version, dsh: { client: { platform: 'web' } } })
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const failedOperation = await finished(lifecycle.begin('install', skin.id))
    expect(failedOperation).toMatchObject({ phase: 'failed', failure: { kind: 'build-approval', action: 'approve-build', packageName: '@example/skin' } })

    const retried = await finished(lifecycle.retry(failedOperation.id, 'approve-build'))

    expect(retried.phase).toBe('done')
    expect(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8')).toContain(buildKey)
    expect(prefetchApprovals).toHaveLength(1)
  })

  it('seeds a reviewed exact build key into the temporary prefetch workspace', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const buildKey = '@example/reviewed-skin@https://codeload.github.com/example/reviewed-skin/tar.gz/0123456789abcdef0123456789abcdef01234567'
    const skin = {
      ...base,
      id: 'reviewed-build.skin',
      package: '@example/reviewed-skin',
      rowId: 'reviewed-skin',
      subpath: undefined,
      install: {
        ...base.install,
        target: 'github:example/reviewed-skin#0123456789abcdef0123456789abcdef01234567',
        version: '1.0.0',
        commit: '0123456789abcdef0123456789abcdef01234567',
        allowBuild: buildKey,
      },
    }
    const runner: PluginRunner = async (_profile, args) => {
      if (args.includes('--dir')) {
        const temporary = args[args.indexOf('--dir') + 1]!
        expect(readFileSync(join(temporary, 'pnpm-workspace.yaml'), 'utf8')).toContain(buildKey)
        return success()
      }
      if (args[0] === 'add') {
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
        const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
        mkdirSync(packageDir, { recursive: true })
        atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: skin.install.version, dsh: { client: { platform: 'web' } } })
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const operation = await finished(lifecycle.begin('install', skin.id))

    expect(operation.phase).toBe('done')
    expect(readFileSync(pnpmWorkspaceFile(dir), 'utf8')).toContain(buildKey)
  })

  it('approves transitive pnpm ignored builds and retries the install', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = probe.catalog.find(item => item.review?.installation !== 'manual-only')!
    const skin = { ...base, id: 'ignored-build.skin', install: { ...base.install, allowBuild: undefined } }
    let rejected = false
    const runner: PluginRunner = async (_profile, args) => {
      if (args.includes('--dir')) return success()
      if (args[0] === 'add' && !rejected) {
        rejected = true
        return { ...success(), exitCode: 1, stderr: 'ERR_PNPM_IGNORED_BUILDS\nIgnored build scripts: node-pty@1.1.0' }
      }
      if (args[0] === 'add') {
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
        const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
        mkdirSync(packageDir, { recursive: true })
        atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: skin.install.version, dsh: { client: { platform: 'web' } } })
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const failedOperation = await finished(lifecycle.begin('install', skin.id))
    expect(failedOperation).toMatchObject({ phase: 'failed', failure: { kind: 'build-approval', action: 'approve-build', packageName: 'node-pty' } })

    const retried = await finished(lifecycle.retry(failedOperation.id, 'approve-build'))

    expect(retried.phase).toBe('done')
    expect(parse(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8'))).toMatchObject({ allowBuilds: { 'node-pty': true } })
  })

  it('reconciles an already installed package instead of failing the install action', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const skin = firstInstallable(probe)
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    writeBundlePackage(dir, skin)
    let calls = 0
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => { calls += 1; return success() } })

    const operation = await finished(lifecycle.begin('install', skin.id))
    expect(operation).toMatchObject({ phase: 'done', message: 'skin was already installed; market state reconciled' })
    expect(calls).toBe(0)
    expect(lifecycle.states().find(state => state.skinId === skin.id)?.installation).toBe('installed')
  })

  it('adopts a manually bundled skin as active and can deactivate it without uninstalling', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const skin = probe.catalog[0]
    atomicWriteJson(join(dir, 'package.json'), {
      dependencies: { [skin.package]: skin.install.target },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', skin.package, 'dsh-skin-market'] } },
    })
    writeBundlePackage(dir, skin)
    const entry: LoaderEntry = {
      options: { id: skin.rowId, name: skin.package },
      fiber: {},
      update: async value => {
        entry.options.disabled = value.disabled
        entry.fiber = value.disabled ? undefined : {}
      },
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [entry] } }, { profile: 'test', profileDir: dir, runner: async () => success() })

    await lifecycle.replay()

    expect(readMarketState(dir).activeSkinId).toBe(skin.id)
    expect(lifecycle.states()[0]).toMatchObject({ installation: 'installed', activation: 'active' })
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dsh: { profile: { bundles: string[] } } }
    expect(manifest.dsh.profile.bundles).toEqual(['@deepseek-ai/dsh-base', skin.package, 'dsh-skin-market'])

    expect((await finished(lifecycle.begin('deactivate', skin.id))).phase).toBe('done')
    expect(lifecycle.states().find(state => state.skinId === skin.id)).toMatchObject({ installation: 'installed', activation: 'inactive' })
    expect(readDependencies(dir)[skin.package]).toBeDefined()
  })

  it('installs inactive, activates exclusively, deactivates without removal, and uninstalls', async () => {
    const dir = fixture()
    let lifecycle!: SkinLifecycle
    const entries = new Map<string, LoaderEntry>()
    const updates: string[] = []
    const runner: PluginRunner = async (_profile, args) => {
      const skin = lifecycle.catalog.find(item => args.includes(item.install.target) || args.includes(item.package))
      if (args[0] === 'add' && skin !== undefined) {
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { ...readDependencies(dir), [skin.package]: skin.install.target } })
        writeBundlePackage(dir, skin)
        entries.set(skin.rowId, { options: { id: skin.rowId, name: skin.rowId, disabled: true }, update: async function (value) { updates.push(`${skin.rowId}:${String(value.disabled)}`); this.options.disabled = value.disabled; this.fiber = value.disabled ? undefined : {} } })
      }
      if (args[0] === 'remove' && skin !== undefined) {
        const next = { ...readDependencies(dir) }
        delete next[skin.package]
        atomicWriteJson(join(dir, 'package.json'), { dependencies: next })
        entries.delete(skin.rowId)
      }
      return success()
    }
    lifecycle = new SkinLifecycle({ loader: { entries: () => entries.values() } }, { profile: 'test', profileDir: dir, runner })
    const skin = firstInstallable(lifecycle)

    const install = await finished(lifecycle.begin('install', skin.id))
    expect(install.phase).toBe('done')
    expect(lifecycle.states().find(state => state.skinId === skin.id)).toMatchObject({ installation: 'installed', activation: 'inactive' })
    expect(readMarketState(dir).activity?.[skin.id]?.installedAt).toBe(install.startedAt)
    const activation = await finished(lifecycle.begin('activate', skin.id))
    expect(activation.phase).toBe('done')
    expect(readMarketState(dir).activeSkinId).toBe(skin.id)
    expect(readMarketState(dir).activity?.[skin.id]?.usedAt).toBe(activation.startedAt)
    expect(lifecycle.states().find(state => state.skinId === skin.id)?.activation).toBe('active')

    const second = anotherInstallable(lifecycle, skin.id)
    expect((await finished(lifecycle.begin('install', second.id))).phase).toBe('done')
    updates.length = 0
    expect((await finished(lifecycle.begin('activate', second.id))).phase).toBe('done')
    expect(updates).toEqual([
      `${skin.rowId}:true`,
      `${second.rowId}:null`,
    ])
    expect((await finished(lifecycle.begin('activate', skin.id))).phase).toBe('done')
    expect((await finished(lifecycle.begin('deactivate', skin.id))).phase).toBe('done')
    expect(readDependencies(dir)[skin.package]).toBeDefined()
    expect(readMarketState(dir).activeSkinId).toBeNull()
    await lifecycle.replay()
    expect(readMarketState(dir).activeSkinId).toBeNull()
    expect((await finished(lifecycle.begin('uninstall', skin.id))).phase).toBe('done')
    expect(readDependencies(dir)[skin.package]).toBeUndefined()
  })

  it('keeps pinned skins enabled across switches and replay, then disables a secondary skin when unpinned', async () => {
    const dir = fixture()
    let lifecycle!: SkinLifecycle
    const entries = new Map<string, LoaderEntry>()
    const updates: string[] = []
    const runner: PluginRunner = async (_profile, args) => {
      const skin = lifecycle.catalog.find(item => args.includes(item.install.target) || args.includes(item.package))
      if (args[0] === 'add' && skin !== undefined) {
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { ...readDependencies(dir), [skin.package]: skin.install.target } })
        writeBundlePackage(dir, skin)
        entries.set(skin.rowId, {
          options: { id: skin.rowId, name: skin.rowId, disabled: true },
          update: async function (value) {
            updates.push(`${skin.rowId}:${String(value.disabled)}`)
            this.options.disabled = value.disabled
            this.fiber = value.disabled ? undefined : {}
          },
        })
      }
      return success()
    }
    lifecycle = new SkinLifecycle({ loader: { entries: () => entries.values() } }, { profile: 'test', profileDir: dir, runner })
    const first = firstInstallable(lifecycle)
    const second = anotherInstallable(lifecycle, first.id)

    await finished(lifecycle.begin('install', first.id))
    await finished(lifecycle.begin('activate', first.id))
    await finished(lifecycle.begin('pin', first.id))
    await finished(lifecycle.begin('install', second.id))
    updates.length = 0
    await finished(lifecycle.begin('activate', second.id))

    expect(updates).toEqual([`${second.rowId}:null`])
    expect(readMarketState(dir)).toMatchObject({ activeSkinId: second.id, pinnedSkinIds: [first.id] })
    expect(lifecycle.states().find(state => state.skinId === first.id)).toMatchObject({ activation: 'active', primary: false, pinned: true })
    expect(lifecycle.states().find(state => state.skinId === second.id)).toMatchObject({ activation: 'active', primary: true, pinned: false })

    updates.length = 0
    await lifecycle.replay()
    expect(updates).toEqual([])
    await finished(lifecycle.begin('unpin', first.id))
    expect(updates).toEqual([`${first.rowId}:true`])
    expect(readMarketState(dir).pinnedSkinIds).toEqual([])
    expect(lifecycle.states().find(state => state.skinId === first.id)?.activation).toBe('inactive')
    expect(lifecycle.states().find(state => state.skinId === second.id)?.activation).toBe('active')
  })

  it('keeps the current skin enabled when its pin is removed', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const skin = firstInstallable(probe)
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    writeBundlePackage(dir, skin)
    const entry: LoaderEntry = {
      options: { id: skin.rowId, name: skin.rowId },
      fiber: {},
      update: async value => { entry.options.disabled = value.disabled },
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [entry] } }, { profile: 'test', profileDir: dir, runner: async () => success() })

    await finished(lifecycle.begin('activate', skin.id))
    await finished(lifecycle.begin('pin', skin.id))
    await finished(lifecycle.begin('unpin', skin.id))

    expect(readMarketState(dir)).toMatchObject({ activeSkinId: skin.id, pinnedSkinIds: [] })
    expect(lifecycle.states().find(state => state.skinId === skin.id)).toMatchObject({ activation: 'active', primary: true, pinned: false })
    expect(entry.options.disabled).not.toBe(true)
  })

  it('does not hot-toggle web client skins because DSH reloads the client graph on restart', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const first = firstInstallable(probe)
    const second = anotherInstallable(probe, first.id)
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [first.package]: first.install.target, [second.package]: second.install.target } })
    for (const skin of [first, second]) {
      writeBundlePackage(dir, skin)
      atomicWriteJson(join(dir, 'node_modules', ...skin.package.split('/'), 'package.json'), {
        name: skin.package,
        version: skin.install.version,
        dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
      })
    }
    const updates: string[] = []
    const entries = [first, second].map(skin => {
      const entry: LoaderEntry = {
        options: { id: skin.rowId, name: skin.rowId, disabled: true },
        update: async value => {
          updates.push(`${skin.rowId}:${String(value.disabled)}`)
          entry.options.disabled = value.disabled
          entry.fiber = value.disabled ? undefined : {}
        },
      }
      return entry
    })
    const lifecycle = new SkinLifecycle({ loader: { entries: () => entries } }, { profile: 'test', profileDir: dir, runner: async () => success() })

    expect((await finished(lifecycle.begin('activate', first.id))).phase).toBe('done')
    expect(updates).toEqual([])
    expect(lifecycle.states().find(state => state.skinId === first.id)).toMatchObject({ activation: 'restart-required' })

    expect((await finished(lifecycle.begin('activate', second.id))).phase).toBe('done')
    expect(updates).toEqual([])
    expect(readMarketState(dir).activeSkinId).toBe(second.id)
    expect(lifecycle.states().find(state => state.skinId === second.id)).toMatchObject({ activation: 'restart-required' })
  })

  it('enables an installed inactive skin as pinned without replacing the current primary skin', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const primary = firstInstallable(probe)
    const pinned = anotherInstallable(probe, primary.id)
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [primary.package]: primary.install.target, [pinned.package]: pinned.install.target } })
    writeBundlePackage(dir, primary)
    writeBundlePackage(dir, pinned)
    const entries = [primary, pinned].map(skin => {
      const entry: LoaderEntry = {
        options: { id: skin.rowId, name: skin.rowId, disabled: true },
        update: async value => {
          entry.options.disabled = value.disabled
          entry.fiber = value.disabled ? undefined : {}
        },
      }
      return entry
    })
    const lifecycle = new SkinLifecycle({ loader: { entries: () => entries } }, { profile: 'test', profileDir: dir, runner: async () => success() })

    await finished(lifecycle.begin('activate', primary.id))
    await finished(lifecycle.begin('pin', pinned.id))

    expect(readMarketState(dir)).toMatchObject({ activeSkinId: primary.id, pinnedSkinIds: [pinned.id] })
    expect(lifecycle.states().find(state => state.skinId === primary.id)).toMatchObject({ activation: 'active', primary: true, pinned: false })
    expect(lifecycle.states().find(state => state.skinId === pinned.id)).toMatchObject({ activation: 'active', primary: false, pinned: true })
  })

  it('installs and registers a client-only skin without an upstream bundle patch', async () => {
    const dir = fixture()
    let lifecycle!: SkinLifecycle
    const runner: PluginRunner = async (_profile, args) => {
      const skin = lifecycle.catalog.find(item => args.includes(item.install.target) || args.includes(item.package))
      if (skin === undefined) return success()
      if (args[0] === 'add') {
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { ...readDependencies(dir), [skin.package]: skin.install.target } })
        const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
        mkdirSync(packageDir, { recursive: true })
        atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: skin.install.version, dsh: { client: { platform: 'web' } } })
      }
      if (args[0] === 'remove') {
        const next = { ...readDependencies(dir) }
        delete next[skin.package]
        atomicWriteJson(join(dir, 'package.json'), { dependencies: next })
      }
      return success()
    }
    lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner })
    const skin = lifecycle.catalog.find(item => item.id === 'wyh66666666.dsh-transparent-ui-plugin')!

    expect((await finished(lifecycle.begin('install', skin.id))).phase).toBe('done')
    expect(readFileSync(join(dir, 'cordis.patch.yml'), 'utf8')).toContain(`id: ${skin.rowId}`)
    expect(lifecycle.states().find(item => item.skinId === skin.id)?.installation).toBe('installed')
    expect((await finished(lifecycle.begin('activate', skin.id))).phase).toBe('done')
    expect(lifecycle.states().find(item => item.skinId === skin.id)?.activation).toBe('restart-required')
    expect((await finished(lifecycle.begin('uninstall', skin.id))).phase).toBe('done')
    expect(readFileSync(join(dir, 'cordis.patch.yml'), 'utf8')).not.toContain(`id: ${skin.rowId}`)
  })

  it('does not silently accept a same-name package from a different source', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const skin = probe.catalog.find(item => item.id === 'wyh66666666.dsh-transparent-ui-plugin')!
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: 'github:someone/else#0000000000000000000000000000000000000000' } })
    const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
    mkdirSync(packageDir, { recursive: true })
    atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: skin.install.version, dsh: { client: { platform: 'web' } } })

    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() }, [skin])
    const operation = await finished(lifecycle.begin('install', skin.id))

    expect(operation.phase).toBe('failed')
    expect(operation.message).toContain('does not match the reviewed source/version')
  })

  it('blocks a duplicate loader before touching the live profile', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const skin = firstInstallable(probe)
    atomicWriteText(profilePatchFile(dir), `- insert:\n    - id: ${skin.rowId}\n      name: another-plugin\n`)
    let liveAdd = 0
    const runner: PluginRunner = async (_profile, args) => {
      if (args[0] === 'add' && !args.includes('--dir')) liveAdd += 1
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const operation = await finished(lifecycle.begin('install', skin.id))

    expect(operation).toMatchObject({ phase: 'failed', failure: { kind: 'conflict' } })
    expect(liveAdd).toBe(0)
    expect(readDependencies(dir)).toEqual({})
  })

  it('rejects a catalog row id mismatch from the prefetched immutable bundle', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const skin = { ...base, id: 'metadata-mismatch.skin', rowId: 'better-sidebar' }
    let liveAdd = 0
    const runner: PluginRunner = async (_profile, args) => {
      if (args.includes('--dir')) {
        const temporary = args[args.indexOf('--dir') + 1]!
        atomicWriteJson(join(temporary, 'package.json'), { private: true, dependencies: { [skin.package]: skin.install.target } })
        writeBundlePackage(temporary, { package: skin.package, rowId: 'actual-primary', install: { version: skin.install.version } })
        return success()
      }
      if (args[0] === 'add') liveAdd += 1
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const operation = await finished(lifecycle.begin('install', skin.id))

    expect(operation.phase).toBe('failed')
    expect(operation.message).toContain('市场目录元数据与包实际声明不一致')
    expect(operation.message).toContain('实际主 loader id=actual-primary')
    expect(liveAdd).toBe(0)
  })

  it('restores the original dependency graph once after a post-install loader conflict', async () => {
    const dir = fixture()
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const skin = { ...base, id: 'post-install-conflict.skin', rowId: 'incoming-loader' }
    let liveAdd = 0
    let recoveryCalls = 0
    const runner: PluginRunner = async (_profile, args) => {
      if (args.includes('--dir')) {
        const temporary = args[args.indexOf('--dir') + 1]!
        atomicWriteJson(join(temporary, 'package.json'), { private: true, dependencies: { [skin.package]: skin.install.target } })
        writeBundlePackage(temporary, { package: skin.package, rowId: skin.rowId, install: { version: skin.install.version } })
        return success()
      }
      if (args[0] === 'add') {
        liveAdd += 1
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
        writeBundlePackage(dir, skin)
        atomicWriteText(profilePatchFile(dir), `- insert:\n    - id: ${skin.rowId}\n      name: another-installed-plugin\n`)
        return success()
      }
      if (args[0] === 'install') {
        recoveryCalls += 1
        expect(readDependencies(dir)).toEqual({})
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    const operation = await finished(lifecycle.begin('install', skin.id))

    expect(operation).toMatchObject({ phase: 'failed', failure: { kind: 'conflict' } })
    expect(operation.message).toContain('another-installed-plugin')
    expect(liveAdd).toBe(1)
    expect(recoveryCalls).toBe(1)
    expect(readDependencies(dir)).toEqual({})
    expect(existsSync(profilePatchFile(dir))).toBe(false)
  })

  it('pre-approves an exact build artifact and restores profile metadata after a failed install', async () => {
    const dir = fixture()
    const originalLockfile = 'lockfileVersion: "9.0"\n\nimporters:\n  .: {}\n'
    atomicWriteText(join(dir, 'pnpm-lock.yaml'), originalLockfile)
    let calls = 0
    const runner: PluginRunner = async (_profile, args) => {
      calls += 1
      if (calls === 1) {
        expect(args).not.toContain('--config.fetchTimeout=600000')
        expect(args).toContain('--dir')
        expect(existsSync(join(dir, 'pnpm-workspace.yaml'))).toBe(false)
        return success()
      }
      if (calls === 2) {
        expect(args).toContain('--prefer-offline')
        expect(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8')).toContain('dskin@https://codeload.github.com/dancingmemory/dskin/tar.gz/f24cf34bd21d23845a8b9bdaf3dbf46d01a952ed')
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { ghost: 'broken' } })
        atomicWriteText(join(dir, 'pnpm-lock.yaml'), 'lockfile changed by failed add\n')
        return { ...success(), exitCode: 1, stderr: 'network failed' }
      }
      atomicWriteText(join(dir, 'pnpm-lock.yaml'), 'lockfile changed by repair install\n')
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner })
    const skin = lifecycle.catalog.find(item => item.id === 'dancingmemory.dskin')!
    const operation = await finished(lifecycle.begin('install', skin.id))
    expect(operation.phase).toBe('failed')
    expect(readDependencies(dir)).toEqual({})
    expect(existsSync(join(dir, 'pnpm-workspace.yaml'))).toBe(false)
    expect(readFileSync(join(dir, 'pnpm-lock.yaml'), 'utf8')).toBe(originalLockfile)
  })

  it('installs a shared companion with the skin and removes it only after the last owner is uninstalled', async () => {
    const dir = fixture()
    const commit = 'a'.repeat(40)
    const companion = {
      package: '@dsh-external/dsh-client-ui-skin-deep-whale-manager',
      target: `github:example/repo#${commit}&path:/skin-manager`,
      version: '0.1.0',
      commit,
      rowId: 'ui-skin-deep-whale-manager',
    }
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const one = {
      ...base,
      id: 'companion.one',
      package: 'skin-one',
      rowId: 'skin-one',
      review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'verified' as const },
      install: { target: `github:example/repo#${commit}&path:/one`, version: '1.0.0', commit, companions: [companion] },
    }
    const two = {
      ...one,
      id: 'companion.two',
      package: 'skin-two',
      rowId: 'skin-two',
      install: { ...one.install, target: `github:example/repo#${commit}&path:/two` },
    }
    const runner: PluginRunner = async (_profile, args) => {
      if (args[0] === 'add' && args.includes('--dir')) return success()
      if (args[0] === 'add') {
        const spec = args[1]!
        const dependencies = { ...readDependencies(dir) }
        const added = spec === companion.target
          ? { package: companion.package, rowId: companion.rowId, install: { version: companion.version } }
          : spec === one.install.target ? one : spec === two.install.target ? two : null
        if (added === null) return { ...success(), exitCode: 1, stderr: `unexpected spec ${spec}` }
        dependencies[added.package] = spec
        atomicWriteJson(join(dir, 'package.json'), { dependencies })
        writeBundlePackage(dir, added)
        return success()
      }
      if (args[0] === 'remove') {
        const dependencies = { ...readDependencies(dir) }
        delete dependencies[args[1]!]
        atomicWriteJson(join(dir, 'package.json'), { dependencies })
        return success()
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [one, two])

    expect((await finished(lifecycle.begin('install', one.id))).phase).toBe('done')
    expect(readDependencies(dir)).toMatchObject({ [companion.package]: companion.target, [one.package]: one.install.target })
    expect(readMarketState(dir).managedCompanions).toEqual({ [companion.package]: { ownerSkinIds: [one.id], installedByMarket: true } })

    expect((await finished(lifecycle.begin('install', two.id))).phase).toBe('done')
    expect(readDependencies(dir)[companion.package]).toBe(companion.target)
    expect(readMarketState(dir).managedCompanions).toEqual({ [companion.package]: { ownerSkinIds: [one.id, two.id], installedByMarket: true } })

    expect((await finished(lifecycle.begin('uninstall', one.id))).phase).toBe('done')
    expect(readDependencies(dir)[companion.package]).toBe(companion.target)
    expect(readDependencies(dir)[one.package]).toBeUndefined()
    expect(readMarketState(dir).managedCompanions).toEqual({ [companion.package]: { ownerSkinIds: [two.id], installedByMarket: true } })

    expect((await finished(lifecycle.begin('uninstall', two.id))).phase).toBe('done')
    expect(readDependencies(dir)).toEqual({})
    expect(readMarketState(dir).managedCompanions).toBeUndefined()
  })

  it('installs a missing companion when the parent skin is already installed', async () => {
    const dir = fixture()
    const commit = 'a'.repeat(40)
    const companion = {
      package: '@dsh-external/dsh-client-ui-skin-deep-whale-manager',
      target: `github:example/repo#${commit}&path:/skin-manager`,
      version: '0.1.0',
      commit,
      rowId: 'ui-skin-deep-whale-manager',
    }
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const skin = {
      ...base,
      id: 'companion.existing',
      package: 'skin-one',
      rowId: 'skin-one',
      review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'verified' as const },
      install: { target: `github:example/repo#${commit}&path:/one`, version: '1.0.0', commit, companions: [companion] },
    }
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target } })
    writeBundlePackage(dir, skin)
    const runner: PluginRunner = async (_profile, args) => {
      if (args[0] === 'add' && args[1] === companion.target) {
        const dependencies = { ...readDependencies(dir), [companion.package]: companion.target }
        atomicWriteJson(join(dir, 'package.json'), { dependencies })
        writeBundlePackage(dir, { package: companion.package, rowId: companion.rowId, install: { version: companion.version } })
        return success()
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    expect((await finished(lifecycle.begin('install', skin.id))).phase).toBe('done')
    expect(readDependencies(dir)).toMatchObject({ [skin.package]: skin.install.target, [companion.package]: companion.target })
  })

  it('links but does not remove a companion that was already installed by the user', async () => {
    const dir = fixture()
    const commit = 'a'.repeat(40)
    const companion = {
      package: '@dsh-external/dsh-client-ui-skin-deep-whale-manager',
      target: `github:example/repo#${commit}&path:/skin-manager`,
      version: '0.1.0',
      commit,
      rowId: 'ui-skin-deep-whale-manager',
    }
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const skin = {
      ...base,
      id: 'companion.external-owner',
      package: 'skin-one',
      rowId: 'skin-one',
      review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'verified' as const },
      install: { target: `github:example/repo#${commit}&path:/one`, version: '1.0.0', commit, companions: [companion] },
    }
    atomicWriteJson(join(dir, 'package.json'), {
      dependencies: { [companion.package]: companion.target },
      dsh: { profile: { bundles: [companion.package] } },
    })
    writeBundlePackage(dir, { package: companion.package, rowId: companion.rowId, install: { version: companion.version } })
    const calls: string[][] = []
    const runner: PluginRunner = async (_profile, args) => {
      calls.push([...args])
      if (args[0] === 'add' && args.includes('--dir')) return success()
      if (args[0] === 'add' && args[1] === skin.install.target) {
        atomicWriteJson(join(dir, 'package.json'), {
          dependencies: { ...readDependencies(dir), [skin.package]: skin.install.target },
          dsh: { profile: { bundles: [companion.package] } },
        })
        writeBundlePackage(dir, skin)
      }
      if (args[0] === 'remove' && args[1] === skin.package) {
        const dependencies = { ...readDependencies(dir) }
        delete dependencies[skin.package]
        atomicWriteJson(join(dir, 'package.json'), { dependencies, dsh: { profile: { bundles: [companion.package] } } })
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [skin])

    expect((await finished(lifecycle.begin('install', skin.id))).phase).toBe('done')
    expect(calls.some(args => args[0] === 'add' && args[1] === companion.target)).toBe(false)
    expect(readMarketState(dir).managedCompanions).toBeUndefined()
    expect((JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }).dsh?.profile?.bundles ?? []).toContain(companion.package)

    expect((await finished(lifecycle.begin('uninstall', skin.id))).phase).toBe('done')
    expect(readDependencies(dir)).toEqual({ [companion.package]: companion.target })
    expect(readMarketState(dir).managedCompanions).toBeUndefined()
    expect((JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }).dsh?.profile?.bundles ?? []).toContain(companion.package)
  })

  it('does not acquire enable/disable rights over a pre-ownership companion', async () => {
    const dir = fixture()
    const commit = 'a'.repeat(40)
    const companion = {
      package: 'legacy-companion',
      target: `github:example/companion#${commit}`,
      version: '1.0.0',
      commit,
      rowId: 'legacy-companion',
    }
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const skin = {
      ...base,
      id: 'legacy.owner',
      package: 'legacy-owner',
      rowId: 'legacy-owner',
      install: { target: `github:example/owner#${commit}`, version: '1.0.0', commit, companions: [companion] },
    }
    atomicWriteJson(join(dir, 'package.json'), { dependencies: { [skin.package]: skin.install.target, [companion.package]: companion.target } })
    writeBundlePackage(dir, skin)
    writeBundlePackage(dir, { package: companion.package, rowId: companion.rowId, install: { version: companion.version } })
    const live = { disabled: false }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [{ options: { id: companion.rowId, name: companion.package }, update: async ({ disabled }) => { live.disabled = disabled === true } }] } }, { profile: 'test', profileDir: dir, runner: async () => success() }, [skin])

    await lifecycle.replay()
    expect(readMarketState(dir).managedCompanions).toBeUndefined()
    expect(live.disabled).toBe(false)
  })

  it('activates a receipt-linked companion without granting delete rights', async () => {
    const dir = fixture()
    const commit = 'a'.repeat(40)
    const companion = {
      package: '@dsh-external/dsh-client-ui-skin-deep-whale-manager',
      target: `github:example/whale#${commit}&path:/skin-manager`,
      version: '0.1.0',
      commit,
      rowId: 'ui-skin-deep-whale-manager',
    }
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const skin = {
      ...base,
      id: 'small-tailqwq.orca-link',
      package: '@dsh-external/dsh-client-ui-skin-orca-link',
      rowId: 'ui-skin-orca-link',
      install: { target: `github:example/whale#${commit}&path:/orca-link`, version: '0.1.0', commit, companions: [companion] },
    }
    atomicWriteJson(join(dir, 'package.json'), {
      dependencies: { [skin.package]: skin.install.target, [companion.package]: companion.target },
      dsh: { profile: { bundles: [skin.package, companion.package] } },
    })
    writeBundlePackage(dir, skin)
    writeBundlePackage(dir, { package: companion.package, rowId: companion.rowId, install: { version: companion.version } })
    atomicWriteText(profilePatchFile(dir), `- id: ${companion.rowId}\n  disabled: true\n`)
    writeMarketState(dir, {
      version: 1,
      activeSkinId: skin.id,
      disabledSkinIds: [],
      managedCompanions: { [companion.package]: { ownerSkinIds: [skin.id], installedByMarket: false } },
    })
    const live = { disabled: true }
    const entry: LoaderEntry = {
      options: { id: companion.rowId, name: companion.package, disabled: true },
      fiber: {},
      update: async ({ disabled }) => { live.disabled = disabled === true },
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [entry] } }, { profile: 'test', profileDir: dir, runner: async () => success() }, [skin])

    await lifecycle.replay()

    expect(readMarketState(dir).managedCompanions).toEqual({
      [companion.package]: { ownerSkinIds: [skin.id], installedByMarket: false },
    })
    expect(readFileSync(profilePatchFile(dir), 'utf8')).not.toContain(companion.rowId)
    expect(live.disabled).toBe(false)
    expect((JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }).dsh?.profile?.bundles).toContain(companion.package)
  })

  it('disables a companion in settings until an owning skin is in use', async () => {
    const dir = fixture()
    const commit = 'a'.repeat(40)
    const companion = {
      package: '@dsh-external/dsh-client-ui-skin-deep-whale-manager',
      target: `github:example/repo#${commit}&path:/skin-manager`,
      version: '0.1.0',
      commit,
      rowId: 'ui-skin-deep-whale-manager',
    }
    const probe = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner: async () => success() })
    const base = firstInstallable(probe)
    const owner = {
      ...base,
      id: 'companion.owner',
      package: 'skin-one',
      rowId: 'skin-one',
      review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'verified' as const },
      install: { target: `github:example/repo#${commit}&path:/one`, version: '1.0.0', commit, companions: [companion] },
    }
    const other = {
      ...base,
      id: 'companion.other',
      package: 'skin-two',
      rowId: 'skin-two',
      review: { compatibility: 'verified' as const, preview: 'verified' as const, installation: 'verified' as const },
      install: { target: `github:example/repo#${commit}&path:/two`, version: '1.0.0', commit },
    }
    const runner: PluginRunner = async (_profile, args) => {
      if (args[0] === 'add' && args.includes('--dir')) return success()
      if (args[0] === 'add') {
        const spec = args[1]!
        const added = spec === companion.target
          ? { package: companion.package, rowId: companion.rowId, install: { version: companion.version } }
          : spec === owner.install.target ? owner : spec === other.install.target ? other : null
        if (added === null) return { ...success(), exitCode: 1, stderr: `unexpected spec ${spec}` }
        atomicWriteJson(join(dir, 'package.json'), { dependencies: { ...readDependencies(dir), [added.package]: spec } })
        writeBundlePackage(dir, added)
        return success()
      }
      return success()
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: dir, runner }, [owner, other])

    expect((await finished(lifecycle.begin('install', owner.id))).phase).toBe('done')
    expect((await finished(lifecycle.begin('install', other.id))).phase).toBe('done')
    expect((JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }).dsh?.profile?.bundles ?? []).not.toContain(companion.package)

    expect((await finished(lifecycle.begin('activate', owner.id))).phase).toBe('done')
    expect((JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }).dsh?.profile?.bundles ?? []).toContain(companion.package)

    expect((await finished(lifecycle.begin('activate', other.id))).phase).toBe('done')
    expect((JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }).dsh?.profile?.bundles ?? []).not.toContain(companion.package)
  })
})
