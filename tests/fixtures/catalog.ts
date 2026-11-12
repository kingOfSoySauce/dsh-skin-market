import { loadCatalog } from '../../src/catalog.ts'
import type { SkinEntry } from '../../src/types.ts'

/**
 * The catalog row the lifecycle and profile specs use as their generic web skin.
 * Pinned by id: admitting new skins or changing featured ranks used to silently
 * change what these fixtures exercised. If the pinned entry leaves the catalog,
 * fail loudly and pick a replacement here instead of drifting to `skins[0]`.
 */
export const FIXTURE_SKIN_ID = '1608kiy.dsh.external.dsh.music'

export function catalogFixtureSkin(): SkinEntry {
  const skin = loadCatalog().skins.find(item => item.id === FIXTURE_SKIN_ID)
  if (skin === undefined) {
    throw new Error(`fixture skin ${FIXTURE_SKIN_ID} is missing from the catalog; pin another reviewed row in tests/fixtures/catalog.ts`)
  }
  return structuredClone(skin)
}
