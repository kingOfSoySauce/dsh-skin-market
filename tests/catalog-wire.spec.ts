import assert from 'node:assert/strict'
import { test } from 'vitest'
import { buildCatalogWire } from '../scripts/catalog-wire.mjs'

const firstTime = '2026-09-08T00:00:00.000Z'
const nextTime = '2026-09-08T01:00:00.000Z'
const source = {
  name: '@owner/theme',
  version: '1.2.3',
  integrity: 'sha512-YWJj',
  repository: 'https://github.com/owner/theme',
  gitHead: 'a'.repeat(40),
}

function skin(id = 'owner.theme', npm = source, featuredRank = 10) {
  return {
    id, featuredRank,
    package: source.name,
    repo: source.repository,
    install: {
      target: `github:owner/theme#${source.gitHead}`,
      commit: source.gitHead,
      version: source.version,
      allowBuild: '@owner/theme',
      desktop: { mode: 'manual', note: 'Use the Web client' },
      companions: [{ package: 'companion', target: `github:owner/companion#${source.gitHead}`, commit: source.gitHead }],
      ...(npm === null ? {} : { npm }),
    },
  }
}

test('keeps GitHub install fields intact and places all npm metadata outside skins', () => {
  const entries = [skin(), skin('other.theme', null)]
  const snapshot = structuredClone(entries)
  const catalog = buildCatalogWire(entries, { generatedAt: firstTime })
  assert.equal(catalog.schemaVersion, 1)
  assert.deepEqual(catalog.npmSources, { 'owner.theme': source })
  for (const row of catalog.skins) {
    assert.equal(Object.hasOwn(row.install, 'npm'), false)
    const expected = { ...entries.find(entry => entry.id === row.id).install }
    delete expected.npm
    assert.deepEqual(row.install, expected)
  }
  assert.equal(JSON.stringify(catalog.skins).includes(source.integrity), false)
  assert.deepEqual(entries, snapshot)
})

test('sorts skins by rank then id and npm sources by id independent of input order', () => {
  const entries = [skin('z.theme'), skin('a.theme'), skin('m.theme', source, 1)]
  const catalog = buildCatalogWire(entries, { generatedAt: firstTime })
  assert.deepEqual(catalog.skins.map(entry => entry.id), ['m.theme', 'a.theme', 'z.theme'])
  assert.deepEqual(Object.keys(catalog.npmSources), ['a.theme', 'm.theme', 'z.theme'])
  assert.equal(JSON.stringify(buildCatalogWire([...entries].reverse(), { generatedAt: firstTime })), JSON.stringify(catalog))
})

test('keeps momentum outside skins and invalidates the timestamp when it changes', () => {
  const entries = [skin()]
  const heat = { 'owner.theme': { ageDays: 3, starsPerDay: 2, starGrowthPerDay: 1, commitsPerDay: 0.5, pullsPerDay: 0, issuesPerDay: 0, score: 4.5, asOf: '2026-10-22' } }
  const previous = buildCatalogWire(entries, { generatedAt: firstTime })
  const catalog = buildCatalogWire(entries, { previous, heat, generatedAt: nextTime })
  assert.deepEqual(catalog.heat, heat)
  assert.equal(JSON.stringify(catalog.skins).includes('score'), false)
  assert.equal(catalog.generatedAt, nextTime)
  const stable = buildCatalogWire(entries, { previous: catalog, heat: structuredClone(heat), generatedAt: '2026-09-09T00:00:00.000Z' })
  assert.equal(stable.generatedAt, nextTime)
  assert.equal(JSON.stringify(stable), JSON.stringify(catalog))
})

test('drops heat for ids that are not catalogued', () => {
  const entries = [skin()]
  const validHeat = { ageDays: 3, starsPerDay: 1, starGrowthPerDay: 1, commitsPerDay: 0, pullsPerDay: 0, issuesPerDay: 0, score: 1, asOf: '2026-10-22' }
  const catalog = buildCatalogWire(entries, {
    generatedAt: firstTime,
    heat: { 'owner.theme': validHeat, 'gone.theme': validHeat },
  })
  assert.deepEqual(Object.keys(catalog.heat), ['owner.theme'])
})

test('omits an empty npm source map and keeps a legacy GitHub-only catalog timestamp', () => {
  const entries = [skin('owner.theme', null)]
  const previous = { schemaVersion: 1, generatedAt: firstTime, skins: entries }
  const catalog = buildCatalogWire(entries, { previous, generatedAt: nextTime })
  assert.equal(Object.hasOwn(catalog, 'npmSources'), false)
  assert.deepEqual(catalog, previous)
})

test('repeated builds round-trip through JSON without changing generatedAt or output bytes', () => {
  const entries = [skin()]
  const previous = buildCatalogWire(entries, { generatedAt: firstTime })
  const next = buildCatalogWire(entries, { previous: JSON.parse(JSON.stringify(previous)), generatedAt: nextTime })
  assert.equal(JSON.stringify(next), JSON.stringify(previous))
})

for (const operation of ['add', 'remove', 'change']) {
  test(`npm metadata-only ${operation} updates generatedAt while skins stay unchanged`, () => {
    const entries = [skin('owner.theme', operation === 'add' ? null : source)]
    const previous = buildCatalogWire(entries, { generatedAt: firstTime })
    const nextEntries = [skin('owner.theme', operation === 'remove' ? null : operation === 'change' ? { ...source, integrity: 'sha512-ZGVm' } : source)]
    const next = buildCatalogWire(nextEntries, { previous, generatedAt: nextTime })
    assert.equal(next.generatedAt, nextTime)
    assert.deepEqual(next.skins, previous.skins)
    assert.notDeepEqual(next.npmSources, previous.npmSources)
  })
}

test('migrates old inline npm output, invalidates its timestamp, then becomes stable', () => {
  const entries = [skin()]
  const previous = { schemaVersion: 1, generatedAt: firstTime, skins: entries }
  const next = buildCatalogWire(entries, { previous, generatedAt: nextTime })
  assert.equal(next.generatedAt, nextTime)
  assert.equal(Object.hasOwn(next.skins[0].install, 'npm'), false)
  assert.deepEqual(next.npmSources, { 'owner.theme': source })
  assert.deepEqual(buildCatalogWire(entries, { previous: next, generatedAt: '2026-09-08T02:00:00.000Z' }), next)
})

test('ignores object property order when deciding whether metadata has changed', () => {
  const entries = [skin()]
  const previous = buildCatalogWire(entries, { generatedAt: firstTime })
  previous.npmSources['owner.theme'] = Object.fromEntries(Object.entries(source).reverse())
  const next = buildCatalogWire(entries, { previous, generatedAt: nextTime })
  assert.equal(next.generatedAt, firstTime)
})

test('normalizes a historical empty npmSources map once and invalidates its timestamp', () => {
  const entries = [skin('owner.theme', null)]
  const previous = { ...buildCatalogWire(entries, { generatedAt: firstTime }), npmSources: {} }
  const next = buildCatalogWire(entries, { previous, generatedAt: nextTime })
  assert.equal(next.generatedAt, nextTime)
  assert.equal(Object.hasOwn(next, 'npmSources'), false)
})

test('keeps localized display copy outside closed skin entries and invalidates its timestamp', () => {
  const entries = [skin()]
  const displayCopy = { skins: { 'owner.theme': { description: { en: 'A translated description.' } } } }
  const previous = buildCatalogWire(entries, { generatedAt: firstTime })
  const next = buildCatalogWire(entries, { previous, displayCopy, generatedAt: nextTime })
  assert.deepEqual(next.displayCopy, displayCopy)
  assert.equal(next.generatedAt, nextTime)
  assert.equal(Object.hasOwn(next.skins[0], 'description'), false)
  const stable = buildCatalogWire(entries, { previous: next, displayCopy: structuredClone(displayCopy), generatedAt: '2026-09-08T02:00:00.000Z' })
  assert.equal(stable.generatedAt, nextTime)
  assert.deepEqual(stable, next)
})

test('keeps localized display names and explicit description omission in the envelope', () => {
  const entries = [skin(), skin('other.theme', null)]
  const displayCopy = {
    skins: {
      'owner.theme': {
        name: { zh: '落雪音乐', en: 'Luoxue Music' },
        description: { zh: '中文描述', en: 'English description.' },
        descriptionPolicy: 'show',
      },
      'other.theme': {
        name: { zh: 'Claude Code', en: 'Claude Code' },
        descriptionPolicy: 'omit',
      },
    },
  }
  const catalog = buildCatalogWire(entries, { displayCopy, generatedAt: firstTime })
  assert.deepEqual(catalog.displayCopy, displayCopy)
  assert.equal(Object.hasOwn(catalog.skins[0], 'name'), false)
  assert.equal(Object.hasOwn(catalog.skins[0], 'description'), false)
})
