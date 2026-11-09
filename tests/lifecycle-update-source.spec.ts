import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadCatalog } from '../src/catalog.ts'
import type { PluginRunner } from '../src/commands.ts'
import { SkinLifecycle } from '../src/lifecycle.ts'
import { atomicWriteJson, atomicWriteText, packageManifest, readDependencies, readMarketState, writeMarketState } from '../src/profile.ts'
import type { SkinEntry } from '../src/types.ts'
import { operationWaiter } from './fixtures/operations.ts'

const temporaryDirectories: string[] = []

function materialize(directory: string, skin: SkinEntry, spec: string, version: string): void {
  atomicWriteJson(join(directory, 'package.json'), { dependencies: { [skin.package]: spec } })
  atomicWriteJson(join(directory, 'node_modules', ...skin.package.split('/'), 'package.json'), {
    name: skin.package, version, repository: skin.repo, dsh: { client: { platform: 'web' } },
  })
  atomicWriteText(join(directory, 'pnpm-lock.yaml'), `lockfileVersion: '9.0'\npackages:\n  '${skin.package}@${version}':\n    resolution:\n      integrity: ${skin.install.npm!.integrity}\n`)
}

const finished = operationWaiter({ intervalMs: 1, message: 'operation did not finish' })

describe('Web update source concurrency', () => {
  afterEach(() => { for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

  it.each(['link:../custom-skin', 'file:/tmp/custom-skin.tgz', '0.8.0'])('preserves a source changed to %s during download before writing the profile', async changedSpec => {
    const directory = mkdtempSync(join(tmpdir(), 'skin-update-source-'))
    temporaryDirectories.push(directory)
    const commit = 'a'.repeat(40)
    const skin: SkinEntry = {
      ...loadCatalog().skins[0]!, id: 'update-source.skin', package: '@example/update-source-skin', rowId: 'update-source-skin',
      repo: 'https://github.com/example/update-source-skin', subpath: undefined,
      review: { installation: 'verified', preview: 'verified', compatibility: 'verified' },
      install: {
        target: `github:example/update-source-skin#${commit}`, version: '1.0.0', commit,
        npm: { name: '@example/update-source-skin', version: '1.0.0', repository: 'https://github.com/example/update-source-skin', gitHead: commit, integrity: 'sha512-reviewed' },
      },
    }
    materialize(directory, skin, '0.9.0', '0.9.0')
    atomicWriteText(join(directory, 'pnpm-workspace.yaml'), 'onlyBuiltDependencies: []\n')
    writeMarketState(directory, { version: 1, activeSkinId: skin.id, disabledSkinIds: [], pinnedSkinIds: [skin.id] })

    let releaseDownload!: () => void
    let downloadStarted!: () => void
    const downloadHeld = new Promise<void>(resolve => { releaseDownload = resolve })
    const downloading = new Promise<void>(resolve => { downloadStarted = resolve })
    const calls: string[][] = []
    const runner: PluginRunner = async (_profile, args) => {
      calls.push([...args])
      const prefetch = args.includes('--dir')
      const targetDirectory = prefetch ? args[args.indexOf('--dir') + 1]! : directory
      materialize(targetDirectory, skin, skin.install.version, skin.install.version)
      if (prefetch) {
        downloadStarted()
        await downloadHeld
      }
      return { exitCode: 0, stdout: '', stderr: '', timedOut: false }
    }
    const lifecycle = new SkinLifecycle({ loader: { entries: () => [] } }, { profile: 'test', profileDir: directory, runner }, [skin])
    const operation = lifecycle.begin('update', skin.id)
    await downloading
    materialize(directory, skin, changedSpec, '0.8.0')
    const files = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']
    const before = files.map(file => readFileSync(join(directory, file), 'utf8'))
    const previousState = readMarketState(directory)
    const previousManifest = packageManifest(directory, skin.package)
    releaseDownload()

    expect((await finished(operation)).phase).toBe('failed')
    expect(operation.message).toContain('更新来源在下载或排队期间发生变化')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain('--dir')
    expect(readDependencies(directory)[skin.package]).toBe(changedSpec)
    expect(files.map(file => readFileSync(join(directory, file), 'utf8'))).toEqual(before)
    expect(readMarketState(directory)).toEqual(previousState)
    expect(packageManifest(directory, skin.package)).toEqual(previousManifest)
  })
})
