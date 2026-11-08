// Record daily GitHub star samples for the public market.
//
// `data/catalog.json` carries a single star snapshot per skin, so the market
// cannot tell a 300-star repository that gained nothing from one that grew
// quickly. This script keeps the daily repository series and each skin's first
// market-observed day in `data/star-history.json`. Retention is storage only;
// scoring uses the skin's own age.
//
// The registry YAML is not the only reading: the private heat step writes a
// fresher snapshot straight into `data/catalog.json` for every skin, and it does
// not rewrite every entry file. Recording both keeps a repository whose file was
// not refreshed from showing the same number for months.
//
// Usage:
//   node scripts/record-stars.mjs --history=<path>  # merge dated observations into a state file
//   node scripts/record-stars.mjs --backfill   # merge git history once
//
// The catalog builder reads the file; clients never see it directly.
import { execFile } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { parse } from 'yaml'
import { DAY_MS, dayNumber, repoSlug } from './heat.mjs'
import { earliestObservedDay, latestCatalogSnapshots, latestRepositorySnapshots, mergeStarSamples, parseStarHistoryLog } from './star-history.mjs'

const run = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const registryDir = join(root, 'registry/skins')
const historyPath = resolve(process.argv.find(argument => argument.startsWith('--history='))?.slice('--history='.length)
  ?? join(root, 'data/star-history.json'))
const HISTORY_DAYS = 730 // storage retention only; scoring uses each skin's age
const backfill = process.argv.includes('--backfill')
const today = dayNumber(new Date())

async function readHistory() {
  try {
    const parsed = JSON.parse(await readFile(historyPath, 'utf8'))
    if (parsed?.schemaVersion !== 1 && parsed?.schemaVersion !== 2 || typeof parsed.repos !== 'object' || parsed.repos === null) throw new Error('unsupported star history')
    return { ...parsed, skins: parsed.skins ?? {} }
  } catch (error) {
    if (error?.code === 'ENOENT') return { schemaVersion: 2, repos: {}, skins: {} }
    throw error
  }
}

async function catalogSnapshots() {
  try {
    const catalog = JSON.parse(await readFile(join(root, 'data/catalog.json'), 'utf8'))
    return latestCatalogSnapshots(catalog?.skins)
  } catch (error) {
    if (error?.code === 'ENOENT') return new Map()
    throw error
  }
}

async function currentSnapshots() {
  const files = (await readdir(registryDir)).filter(file => file.endsWith('.yml')).sort()
  const entries = []
  for (const file of files) {
    const skin = parse(await readFile(join(registryDir, file), 'utf8'))
    entries.push({ skin, file })
  }
  return latestRepositorySnapshots(entries)
}

async function gitBackfill() {
  const files = (await readdir(registryDir)).filter(file => file.endsWith('.yml')).sort()
  const history = new Map()
  const skinDays = new Map()
  for (const file of files) {
    const skin = parse(await readFile(join(registryDir, file), 'utf8'))
    const slug = typeof skin.repo === 'string' ? repoSlug(skin.repo) : ''
    if (slug === '') continue
    let log = ''
    try {
      log = (await run('git', ['-C', root, 'log', '--format=C%atC', '-p', '--', `registry/skins/${file}`], { maxBuffer: 32 * 1024 * 1024 })).stdout
    } catch {
      continue
    }
    const observations = parseStarHistoryLog(log, today, HISTORY_DAYS)
    if (observations.length === 0) continue
    history.set(slug, mergeStarSamples(history.get(slug) ?? [], observations, today, HISTORY_DAYS))
    const firstSeenDay = observations[0][0]
    skinDays.set(skin.id, earliestObservedDay(skinDays.get(skin.id), firstSeenDay))
  }
  return { history, skinDays }
}

const history = await readHistory()
const repos = history.repos
const skins = history.skins
const canonical = value => JSON.stringify(Object.keys(value ?? {}).sort().map(key => [key, value[key]]))
const baseline = `${canonical(repos)}|${canonical(skins)}`
const recordedAt = history.generatedAt

if (backfill) {
  const seeded = await gitBackfill()
  for (const [slug, samples] of seeded.history) {
    repos[slug] = mergeStarSamples(repos[slug] ?? [], samples, today, HISTORY_DAYS)
  }
  for (const [skinId, firstSeenDay] of seeded.skinDays) skins[skinId] = earliestObservedDay(skins[skinId], firstSeenDay)
  console.log(`backfilled ${seeded.history.size} repositories from git history`)
}

const current = await currentSnapshots()
for (const skinId of current.skinIds) {
  // A new registry entry gets a market-observed age on its first daily sample.
  if (!Number.isInteger(skins[skinId])) skins[skinId] = today
}
for (const [slug, sample] of current.snapshots) {
  // Keep the actual observation time and preserve a later same-day observation.
  repos[slug] = mergeStarSamples(repos[slug] ?? [], [sample], today, HISTORY_DAYS)
}
// The heat step's catalog reading can be fresher than the entry file. Without
// it the public series keeps one value for months and the chart draws a plateau
// that never existed.
const recorded = await catalogSnapshots()
for (const [slug, sample] of recorded) {
  repos[slug] = mergeStarSamples(repos[slug] ?? [], [sample], today, HISTORY_DAYS)
}

for (const slug of Object.keys(repos)) {
  if (repos[slug].length === 0) delete repos[slug]
}

const repoLines = Object.keys(repos).sort().map(slug => `    ${JSON.stringify(slug)}: ${JSON.stringify(repos[slug])}`)
const skinLines = Object.keys(skins).sort().map(id => `    ${JSON.stringify(id)}: ${skins[id]}`)
const unchanged = baseline === `${canonical(repos)}|${canonical(skins)}`
const generatedAt = unchanged && typeof recordedAt === 'string' ? recordedAt : new Date(today * DAY_MS).toISOString()
const contents = `{\n  "schemaVersion": 2,\n  "generatedAt": ${JSON.stringify(generatedAt)},\n  "retentionDays": ${HISTORY_DAYS},\n  "repos": {\n${repoLines.join(',\n')}\n  },\n  "skins": {\n${skinLines.join(',\n')}\n  }\n}\n`
await writeFile(historyPath, contents)
console.log(`recorded ${current.snapshots.size} registry and ${recorded.size} catalog readings (${Object.keys(repos).length} repositories tracked) and ${current.skinIds.size} skin ages in ${historyPath}`)
