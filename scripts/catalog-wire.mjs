function byId(left, right) {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

function canonicalJson(value) {
  return JSON.stringify(value, (_key, item) => item !== null && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
    : item)
}

function displayCopyEntry(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  const entry = {}
  for (const key of ['name', 'description', 'descriptionPolicy']) {
    if (Object.hasOwn(value, key)) entry[key] = value[key]
  }
  // `curate` is an authoring/review decision. Runtime clients only need the
  // resulting display behavior, so project an approved curated description
  // to the wire-level `show` policy instead of leaking the internal state.
  if (entry.descriptionPolicy === 'curate') entry.descriptionPolicy = 'show'
  return entry
}

/**
 * Serialize validated registry entries for both old and new clients.
 * Old clients strictly validate install fields, but allow catalog extensions.
 * Keep npm metadata outside each skin until a new client decodes the catalog.
 */
export function buildCatalogWire(skins, { previous, heat, displayCopy, generatedAt = new Date().toISOString() } = {}) {
  const sortedSkins = [...skins].sort((left, right) => left.featuredRank - right.featuredRank || byId(left, right))
  const npmSources = Object.fromEntries([...skins].sort(byId)
    .filter(skin => skin.install.npm !== undefined)
    .map(skin => [skin.id, { ...skin.install.npm }]))
  // Momentum lives beside skins[], never inside an entry: published clients
  // validate each skin with a closed schema, while unknown envelope fields are
  // ignored by older versions. Same compatibility rule as npmSources.
  const known = new Set(skins.map(skin => skin.id))
  const heatSources = heat === undefined || heat === null
    ? undefined
    : Object.fromEntries(Object.entries(heat).filter(([id]) => known.has(id)).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)))
  const displayCopySources = displayCopy?.skins === undefined ? undefined : {
    skins: Object.fromEntries(Object.entries(displayCopy.skins)
      .filter(([id]) => known.has(id))
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([id, copy]) => [id, displayCopyEntry(copy)])),
  }
  const payload = {
    schemaVersion: 1,
    skins: sortedSkins.map(skin => {
      const { npm: _npm, ...install } = skin.install
      return { ...skin, install }
    }),
    ...(Object.keys(npmSources).length > 0 ? { npmSources } : {}),
    ...(heatSources !== undefined && Object.keys(heatSources).length > 0 ? { heat: heatSources } : {}),
    ...(displayCopySources !== undefined && Object.keys(displayCopySources.skins).length > 0 ? { displayCopy: displayCopySources } : {}),
  }
  // Compare the actual prior wire format. Migrating an inline npm catalog must
  // invalidate caches, and adding/removing/changing npm metadata must do so too.
  const previousPayload = previous && {
    schemaVersion: previous.schemaVersion,
    skins: previous.skins,
    ...(previous.npmSources !== undefined ? { npmSources: previous.npmSources } : {}),
    ...(previous.heat !== undefined ? { heat: previous.heat } : {}),
    ...(previous.displayCopy !== undefined ? { displayCopy: previous.displayCopy } : {}),
  }
  if (typeof previous?.generatedAt === 'string' && canonicalJson(previousPayload) === canonicalJson(payload)) {
    generatedAt = previous.generatedAt
  }
  return {
    schemaVersion: payload.schemaVersion,
    generatedAt,
    skins: payload.skins,
    ...(payload.npmSources ? { npmSources: payload.npmSources } : {}),
    ...(payload.heat ? { heat: payload.heat } : {}),
    ...(payload.displayCopy ? { displayCopy: payload.displayCopy } : {}),
  }
}
