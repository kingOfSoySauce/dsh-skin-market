import type { CatalogDisplayCopy, CatalogFile, LocalizedSkinCopy, NpmInstallSource, SkinEntry } from './types.ts'

type WireSkinEntry = Omit<SkinEntry, 'install'> & { install: Omit<SkinEntry['install'], 'npm'> }

/** Shared with older clients: their install fields keep the original GitHub target. */
export interface CatalogWireFile extends Omit<CatalogFile, 'skins'> {
  skins: WireSkinEntry[]
  npmSources?: Record<string, NpmInstallSource>
}

const npmFields = ['name', 'version', 'integrity', 'repository', 'gitHead'] as const
const heatFields = ['ageDays', 'starsPerDay', 'starGrowthPerDay', 'commitsPerDay', 'pullsPerDay', 'issuesPerDay', 'score', 'asOf'] as const
const heatRates = ['starsPerDay', 'starGrowthPerDay', 'commitsPerDay', 'pullsPerDay', 'issuesPerDay', 'score'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function localizedText(value: unknown, id: string, field: 'name' | 'description'): { zh?: string; en?: string } {
  if (!isRecord(value)) throw new Error(`invalid display ${field} for ${id}: must be an object`)
  if (Object.keys(value).some(key => key !== 'zh' && key !== 'en')) throw new Error(`invalid display ${field} for ${id}: unexpected locale`)
  for (const [locale, text] of Object.entries(value)) {
    if (typeof text !== 'string' || text.trim() === '') throw new Error(`invalid display ${field} for ${id}.${locale}`)
  }
  if (Object.keys(value).length === 0) throw new Error(`invalid display ${field} for ${id}: must not be empty`)
  return {
    ...(typeof value.zh === 'string' ? { zh: value.zh } : {}),
    ...(typeof value.en === 'string' ? { en: value.en } : {}),
  }
}

function localizedSkinCopy(value: unknown, id: string): LocalizedSkinCopy {
  if (!isRecord(value)) throw new Error(`invalid display copy for ${id}: must be an object`)
  if (Object.keys(value).some(key => !['name', 'description', 'descriptionPolicy'].includes(key))) throw new Error(`invalid display copy for ${id}: unexpected field`)
  const name = value.name === undefined ? undefined : localizedText(value.name, id, 'name')
  const description = value.description === undefined ? undefined : localizedText(value.description, id, 'description')
  const descriptionPolicy = value.descriptionPolicy
  if (descriptionPolicy !== undefined && descriptionPolicy !== 'show' && descriptionPolicy !== 'omit') {
    throw new Error(`invalid display description policy for ${id}`)
  }
  if (descriptionPolicy === 'omit' && description !== undefined) throw new Error(`invalid omitted display description for ${id}`)
  if (descriptionPolicy === 'show' && description === undefined) throw new Error(`missing display description for ${id}`)
  return {
    ...(name === undefined ? {} : { name }),
    ...(description === undefined ? {} : { description }),
    ...(descriptionPolicy === undefined ? {} : { descriptionPolicy }),
  }
}

function displayCopySource(value: unknown, _ids: Set<unknown>): CatalogDisplayCopy {
  if (!isRecord(value) || !isRecord(value.skins)) throw new Error('catalog displayCopy must contain a skins object')
  if (Object.keys(value).some(key => key !== 'skins')) throw new Error('catalog displayCopy has an unexpected field')
  const skins: Record<string, LocalizedSkinCopy> = {}
  for (const [id, copy] of Object.entries(value.skins)) {
    skins[id] = localizedSkinCopy(copy, id)
  }
  return { skins }
}

/** Unknown envelope fields are shared with older clients, but a heat entry we
 * do read must be complete: ranking on a half-understood score is worse than
 * falling back to stars. */
function heatSource(value: unknown, id: string) {
  if (!isRecord(value)) throw new Error(`invalid heat for ${id}: must be an object`)
  if (Object.keys(value).some(key => !heatFields.includes(key as typeof heatFields[number]))) {
    throw new Error(`invalid heat for ${id}: unexpected field`)
  }
  const ageDays = value.ageDays
  if (typeof ageDays !== 'number' || !Number.isInteger(ageDays) || ageDays < 1) throw new Error(`invalid heat ageDays for ${id}`)
  for (const field of heatRates) {
    const rate = value[field]
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) throw new Error(`invalid heat ${field} for ${id}`)
  }
  if (typeof value.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.asOf)) throw new Error(`invalid heat asOf for ${id}`)
  return {
    ageDays,
    starsPerDay: value.starsPerDay as number,
    starGrowthPerDay: value.starGrowthPerDay as number,
    commitsPerDay: value.commitsPerDay as number,
    pullsPerDay: value.pullsPerDay as number,
    issuesPerDay: value.issuesPerDay as number,
    score: value.score as number,
    asOf: value.asOf,
  }
}

function npmSource(value: unknown, skin: SkinEntry): NpmInstallSource {
  if (!isRecord(value)) throw new Error(`invalid npm source for ${skin.id}: must be an object`)
  if (Object.keys(value).some(key => !npmFields.includes(key as typeof npmFields[number]))) {
    throw new Error(`invalid npm source for ${skin.id}: unexpected field`)
  }
  for (const field of npmFields) {
    if (typeof value[field] !== 'string' || value[field].length === 0) {
      throw new Error(`invalid npm ${field} for ${skin.id}`)
    }
  }
  const source = value as unknown as NpmInstallSource
  if (!/^sha(1|256|384|512)-[A-Za-z0-9+/=]+$/.test(source.integrity)) throw new Error(`invalid npm integrity for ${skin.id}`)
  if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(source.repository)) throw new Error(`invalid npm repository for ${skin.id}`)
  if (source.name !== skin.package) throw new Error(`invalid npm package name for ${skin.id}`)
  if (source.version !== skin.install.version) throw new Error(`invalid npm package version for ${skin.id}`)
  if (typeof skin.repo !== 'string' || source.repository.replace(/\/$/, '') !== skin.repo.replace(/\/$/, '')) {
    throw new Error(`invalid npm repository for ${skin.id}`)
  }
  if (!/^[0-9a-f]{40}$/.test(source.gitHead) || typeof skin.install.commit !== 'string' || source.gitHead !== skin.install.commit.toLowerCase()) {
    throw new Error(`invalid npm gitHead for ${skin.id}`)
  }
  return { name: source.name, version: source.version, integrity: source.integrity, repository: source.repository, gitHead: source.gitHead }
}

/**
 * Expand the backwards-compatible wire format without mutating its input.
 * This validates the envelope and all npm metadata; callers still validate the
 * complete skin entries with their existing schema validator afterwards.
 * No Node imports: the website uses the same metadata checks as the plugin.
 */
export function decodeCatalogWire(value: unknown): CatalogFile {
  if (!isRecord(value)) throw new Error('catalog must be an object')
  if (value.schemaVersion !== 1) throw new Error('unsupported catalog schema version')
  if (typeof value.generatedAt !== 'string' || !Number.isFinite(Date.parse(value.generatedAt))) throw new Error('catalog generatedAt is invalid')
  if (!Array.isArray(value.skins) || value.skins.length > 5000) throw new Error('catalog skins must be an array of at most 5000 entries')

  const { npmSources, heat, displayCopy, ...catalog } = value
  if (Object.hasOwn(value, 'npmSources') && !isRecord(npmSources)) throw new Error('catalog npmSources must be an object')
  const sources = npmSources as Record<string, unknown> | undefined
  const ids = new Set(value.skins.map(skin => isRecord(skin) ? skin.id : undefined))
  const localizedCopy = Object.hasOwn(value, 'displayCopy') ? displayCopySource(displayCopy, ids) : undefined
  for (const id of Object.keys(sources ?? {})) {
    if (!ids.has(id)) throw new Error(`npm source references unknown skin: ${id}`)
  }
  if (Object.hasOwn(value, 'heat') && !isRecord(heat)) throw new Error('catalog heat must be an object')
  // Entries are filtered against the published skins (a sliced or partially
  // published catalog can carry strays); a score we do read must be complete.
  const heatEntries = Object.entries((heat ?? {}) as Record<string, unknown>)
    .filter(([id]) => ids.has(id))
    .map(([id, entry]) => [id, heatSource(entry, id)] as const)

  const skins = value.skins.map(candidate => {
    if (!isRecord(candidate) || !isRecord(candidate.install)) throw new Error('invalid skin entry: install must be an object')
    const skin = candidate as unknown as SkinEntry
    const inline = Object.hasOwn(skin.install, 'npm') ? npmSource(skin.install.npm, skin) : undefined
    const mapped = sources !== undefined && Object.hasOwn(sources, skin.id) ? npmSource(sources[skin.id], skin) : undefined
    if (inline !== undefined && mapped !== undefined && npmFields.some(field => inline[field] !== mapped[field])) {
      throw new Error(`conflicting npm sources for ${skin.id}`)
    }
    const npm = mapped ?? inline
    return { ...skin, install: { ...skin.install, ...(npm === undefined ? {} : { npm }) } }
  })
  return {
    ...catalog,
    skins,
    ...(localizedCopy === undefined ? {} : { displayCopy: localizedCopy }),
    ...(heatEntries.length === 0 ? {} : { heat: Object.fromEntries(heatEntries) }),
  } as CatalogFile
}

/** Always serialize npm metadata outside skins[].install, including shared caches. */
export function encodeCatalogWire(catalog: CatalogFile): CatalogWireFile {
  const runtime = decodeCatalogWire(catalog)
  const sources: Array<[string, NpmInstallSource]> = []
  const skins = runtime.skins.map(skin => {
    const { npm, ...install } = skin.install
    if (npm !== undefined) sources.push([skin.id, { ...npm }])
    return { ...skin, install }
  })
  return { ...runtime, skins, ...(sources.length === 0 ? {} : { npmSources: Object.fromEntries(sources) }) }
}
