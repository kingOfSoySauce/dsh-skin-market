function byId(left, right) {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

function canonicalJson(value) {
  return JSON.stringify(value, (_key, item) => item !== null && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
    : item)
}

/**
 * Serialize validated registry entries for both old and new clients.
 * Old clients strictly validate install fields, but allow catalog extensions.
 * Keep npm metadata outside each skin until a new client decodes the catalog.
 */
export function buildCatalogWire(skins, { previous, generatedAt = new Date().toISOString() } = {}) {
  const sortedSkins = [...skins].sort((left, right) => left.featuredRank - right.featuredRank || byId(left, right))
  const npmSources = Object.fromEntries([...skins].sort(byId)
    .filter(skin => skin.install.npm !== undefined)
    .map(skin => [skin.id, { ...skin.install.npm }]))
  const payload = {
    schemaVersion: 1,
    skins: sortedSkins.map(skin => {
      const { npm: _npm, ...install } = skin.install
      return { ...skin, install }
    }),
    ...(Object.keys(npmSources).length > 0 ? { npmSources } : {}),
  }
  // Compare the actual prior wire format. Migrating an inline npm catalog must
  // invalidate caches, and adding/removing/changing npm metadata must do so too.
  const previousPayload = previous && {
    schemaVersion: previous.schemaVersion,
    skins: previous.skins,
    ...(previous.npmSources !== undefined ? { npmSources: previous.npmSources } : {}),
  }
  if (typeof previous?.generatedAt === 'string' && canonicalJson(previousPayload) === canonicalJson(payload)) {
    generatedAt = previous.generatedAt
  }
  return { schemaVersion: payload.schemaVersion, generatedAt, skins: payload.skins, ...(payload.npmSources ? { npmSources } : {}) }
}
