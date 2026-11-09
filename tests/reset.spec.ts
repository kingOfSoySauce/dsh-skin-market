import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { loadCatalog } from '../src/catalog.ts'
import { companionAsSkin } from '../src/install-resolution.ts'
import { atomicWriteJson, atomicWriteText, profilePatchFile, readMarketState, writeMarketState } from '../src/profile.ts'
import { resetManagedSkins } from '../src/reset.ts'
import { cleanupTempDirs, tempDir } from './fixtures/temp.ts'

afterEach(cleanupTempDirs)

function fixture() { return tempDir('skin-reset-') }

function isolatedSkins(count: number) {
  const skins = loadCatalog().skins
  const packages = new Map<string, number>()
  const rows = new Map<string, number>()
  for (const skin of skins) {
    packages.set(skin.package, (packages.get(skin.package) ?? 0) + 1)
    rows.set(skin.rowId, (rows.get(skin.rowId) ?? 0) + 1)
  }
  const unique = skins.filter(skin => packages.get(skin.package) === 1 && rows.get(skin.rowId) === 1)
  if (unique.length < count) throw new Error(`catalog has ${unique.length} skins with a unique package and row id`)
  return unique.slice(0, count)
}

describe('emergency skin reset', () => {
  it('disables installed market skins without uninstalling their packages', () => {
    const dir = fixture()
    const skins = isolatedSkins(2)
    atomicWriteJson(join(dir, 'package.json'), {
      dependencies: Object.fromEntries(skins.map(skin => [skin.package, skin.install.target])),
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dsh-skin-market', ...skins.map(skin => skin.package)] } },
    })
    for (const skin of skins) {
      const packageDir = join(dir, 'node_modules', ...skin.package.split('/'))
      mkdirSync(packageDir, { recursive: true })
      atomicWriteJson(join(packageDir, 'package.json'), { name: skin.package, version: skin.install.version, dsh: { bundle: { patch: './cordis.patch.yml' }, client: {} } })
      atomicWriteText(join(packageDir, 'cordis.patch.yml'), `- insert:\n    - id: ${skin.rowId}\n      name: ${JSON.stringify(skin.package)}\n`)
    }
    atomicWriteText(profilePatchFile(dir), '- insert:\n    - id: keep\n      name: unrelated-plugin\n')
    writeMarketState(dir, { version: 1, activeSkinId: skins[0].id, disabledSkinIds: [], pinnedSkinIds: [skins[1].id] })

    const result = resetManagedSkins(dir)

    expect(result.disabledPackages).toEqual(skins.map(skin => skin.package))
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dependencies: Record<string, string>; dsh: { profile: { bundles: string[] } } }
    expect(Object.keys(manifest.dependencies)).toEqual(skins.map(skin => skin.package))
    expect(manifest.dsh.profile.bundles).toEqual(['@deepseek-ai/dsh-base', 'dsh-skin-market'])
    const patch = parse(readFileSync(profilePatchFile(dir), 'utf8')) as Array<{ id?: string; disabled?: boolean }>
    expect(patch.filter(operation => skins.some(skin => skin.rowId === operation.id))).toEqual([])
    expect(readMarketState(dir).activeSkinId).toBeNull()
    expect(readMarketState(dir).pinnedSkinIds).toEqual([])
  })

  it('disables market-managed companions during reset', () => {
    const dir = fixture()
    const skin = loadCatalog().skins.find(item => (item.install.companions ?? []).length > 0)!
    const companion = skin.install.companions![0]!
    const companionSkin = companionAsSkin(skin, companion)
    atomicWriteJson(join(dir, 'package.json'), {
      dependencies: { [skin.package]: skin.install.target, [companion.package]: companion.target },
    })
    for (const installed of [skin, companionSkin]) {
      const packageDir = join(dir, 'node_modules', ...installed.package.split('/'))
      mkdirSync(packageDir, { recursive: true })
      atomicWriteJson(join(packageDir, 'package.json'), { name: installed.package, version: installed.install.version, dsh: { bundle: { patch: './cordis.patch.yml' }, client: {} } })
      atomicWriteText(join(packageDir, 'cordis.patch.yml'), `- insert:\n    - id: ${installed.rowId}\n      name: ${JSON.stringify(installed.package)}\n`)
    }
    writeMarketState(dir, {
      version: 1,
      activeSkinId: skin.id,
      disabledSkinIds: [],
      managedCompanions: { [companion.package]: { ownerSkinIds: [skin.id], installedByMarket: true } },
    })

    resetManagedSkins(dir, [skin])

    const patch = parse(readFileSync(profilePatchFile(dir), 'utf8')) as Array<{ id?: string; disabled?: boolean }>
    expect(patch.some(operation => operation.id === companion.rowId)).toBe(false)
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dsh?: { profile?: { bundles?: string[] } } }
    expect(manifest.dsh?.profile?.bundles ?? []).not.toContain(companion.package)
    expect(readMarketState(dir).managedCompanions).toEqual({ [companion.package]: { ownerSkinIds: [skin.id], installedByMarket: true } })
  })

  it('rolls every file back when a registration conflicts', () => {
    const dir = fixture()
    const skin = loadCatalog().skins[0]
    const manifest = JSON.stringify({ dependencies: { [skin.package]: skin.install.target }, dsh: { profile: { bundles: [skin.package] } } }, null, 2) + '\n'
    const patch = `- insert:\n    - id: ${skin.rowId}\n      name: conflicting-package\n`
    atomicWriteText(join(dir, 'package.json'), manifest)
    atomicWriteText(profilePatchFile(dir), patch)

    expect(() => resetManagedSkins(dir)).toThrow('loader registration conflicts')
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(manifest)
    expect(readFileSync(profilePatchFile(dir), 'utf8')).toBe(patch)
  })
})
