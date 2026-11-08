// Rebuild the detail-panel star curves from data the market already owns.
//
// The shipped curve is a stargazer-timeline export and cannot be refreshed for
// third-party repositories any more (the GitHub endpoint now requires repository
// administration), so it would otherwise stop at its export day while the card
// keeps moving. This step keeps the exported days and appends the catalog's
// current reading, which makes the chart's end label match the card by
// construction. Repositories that appeared after the export have no timeline;
// they fall back to `data/star-history.json`, and only when those readings are
// consistent enough to be a star total (see star-curves-merge.mjs).
//
// Usage:
//   node scripts/build-star-curves.mjs
//
// Runs as part of `npm run registry`, after the catalog is written.
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dayNumber, repoSlug } from './heat.mjs'
import { buildCurveSeries } from './star-curves-merge.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const catalogPath = join(root, 'data/catalog.json')
const historyPath = join(root, 'data/star-history.json')
const curvesPath = join(root, 'data/star-curves.json')

async function optionalJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
}

function canonical(value) {
  return JSON.stringify(Object.keys(value).sort().map(key => [key, value[key]]))
}

const catalog = await optionalJson(catalogPath)
if (catalog === undefined || !Array.isArray(catalog.skins)) {
  throw new Error('data/catalog.json is missing; run npm run registry')
}
const history = (await optionalJson(historyPath))?.repos ?? {}
const previous = await optionalJson(curvesPath) ?? { schemaVersion: 1, repos: {} }
const today = dayNumber(new Date())

// A repository can back several skins (npm siblings). The newest reading is the
// one the cards show, so it is the one the chart must end on.
const snapshots = new Map()
for (const skin of catalog.skins) {
  if (typeof skin?.repo !== 'string' || !Number.isInteger(skin.starsSnapshot)) continue
  const observedAt = Date.parse(skin.starsUpdatedAt)
  if (!Number.isFinite(observedAt)) continue
  const slug = repoSlug(skin.repo)
  const prior = snapshots.get(slug)
  if (prior === undefined || observedAt > prior.observedAt) {
    snapshots.set(slug, { day: dayNumber(observedAt), stars: skin.starsSnapshot, observedAt })
  }
}

const repos = {}
let added = 0
let extended = 0
for (const slug of [...snapshots.keys()].sort()) {
  const prior = previous.repos?.[slug]
  const series = buildCurveSeries({
    curve: prior,
    samples: history[slug],
    snapshot: snapshots.get(slug),
    today,
  })
  if (series === undefined) continue
  repos[slug] = series
  if (prior === undefined) added += 1
  else if (series.from + series.stars.length > prior.from + prior.stars.length) extended += 1
}

const unchanged = canonical(previous.repos ?? {}) === canonical(repos)
const generatedAt = unchanged && typeof previous.generatedAt === 'string' ? previous.generatedAt : new Date().toISOString()
await writeFile(curvesPath, `${JSON.stringify({ schemaVersion: 1, generatedAt, repos })}\n`)

const dropped = Object.keys(previous.repos ?? {}).length - Object.keys(repos).length
console.log(`built ${Object.keys(repos).length} star curves (${added} new, ${extended} extended${dropped > 0 ? `, ${dropped} stale entries dropped` : ''})${unchanged ? ' — unchanged' : ''}`)
