import { loadCatalog } from './catalog.ts'
import { companionAsSkin } from './install-resolution.ts'
import {
  ensureSkinRegistration,
  manifestFile,
  marketStateFile,
  profilePatchFile,
  readDependencies,
  readMarketState,
  restoreFile,
  snapshotFile,
  installedSkinSourceMatches,
  writeMarketState,
} from './profile.ts'
import type { SkinEntry } from './types.ts'

export interface ResetResult {
  disabledSkinIds: string[]
  disabledPackages: string[]
}

export function resetManagedSkins(profileDir: string, catalog: SkinEntry[] = loadCatalog().skins): ResetResult {
  const manifestSnapshot = snapshotFile(manifestFile(profileDir))
  const patchSnapshot = snapshotFile(profilePatchFile(profileDir))
  const stateSnapshot = snapshotFile(marketStateFile(profileDir))
  const dependencies = readDependencies(profileDir)
  const installed = catalog.filter(skin => dependencies[skin.package] !== undefined
    && installedSkinSourceMatches(profileDir, skin))

  try {
    const state = readMarketState(profileDir)
    for (const skin of installed) ensureSkinRegistration(profileDir, skin, true)
    const seenCompanions = new Set<string>()
    for (const skin of catalog) {
      for (const companion of skin.install.companions ?? []) {
        if (dependencies[skin.package] !== undefined && installedSkinSourceMatches(profileDir, skin)
          && dependencies[companion.package] !== undefined) {
          const linked = state.managedCompanions?.[companion.package]
          if (linked === undefined) {
            state.managedCompanions = {
              ...state.managedCompanions,
              [companion.package]: { ownerSkinIds: [skin.id], installedByMarket: false },
            }
          } else if (!linked.ownerSkinIds.includes(skin.id)) {
            linked.ownerSkinIds.push(skin.id)
          }
        }
        if (seenCompanions.has(companion.package) || dependencies[companion.package] === undefined || state.managedCompanions?.[companion.package] === undefined) continue
        seenCompanions.add(companion.package)
        ensureSkinRegistration(profileDir, companionAsSkin(skin, companion), true)
      }
    }
    state.activeSkinId = null
    state.pinnedSkinIds = []
    state.disabledSkinIds = [...new Set([...state.disabledSkinIds, ...installed.map(skin => skin.id)])]
    writeMarketState(profileDir, state)
    return {
      disabledSkinIds: installed.map(skin => skin.id),
      disabledPackages: installed.map(skin => skin.package),
    }
  } catch (error) {
    restoreFile(manifestFile(profileDir), manifestSnapshot)
    restoreFile(profilePatchFile(profileDir), patchSnapshot)
    restoreFile(marketStateFile(profileDir), stateSnapshot)
    throw error
  }
}
