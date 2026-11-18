import { describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { hydrateSkinSubmission, isThinSubmission } from '../scripts/hydrate-submission.mjs'
import { latestRepositorySnapshots, mergeStarSamples } from '../scripts/star-history.mjs'
import { buildHeatMap, dayNumber } from '../scripts/heat.mjs'
import { buildCatalogWire } from '../scripts/catalog-wire.mjs'
import { validateCatalog } from '../src/catalog.ts'
import { decodeCatalogWire } from '../src/catalog-wire.ts'
import type { SkinEntry } from '../src/types.ts'

describe('hydrated registry star pipeline', () => {
  it('samples a new thin submission before publishing heat without changing reviewed install metadata', async () => {
    const commit = 'a'.repeat(40)
    const repo = 'https://github.com/fixture/theme-packs'
    const raw = `https://raw.githubusercontent.com/fixture/theme-packs/${commit}`
    const observedAt = '2026-10-24T06:30:00.000Z'
    const builtAt = '2026-10-24T20:00:00.000Z'
    const today = dayNumber(builtAt)
    const draft = parse(`\ufeffurl: ${repo}\nsubpath: packages/ocean\ndescription: 海洋主题\n`)
    expect(isThinSubmission(draft)).toBe(true)
    const files: Record<string, string> = {
      'package.json': JSON.stringify({
        name: '@fixture/ocean', version: '1.2.3', license: 'MIT',
        dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
        exports: { './client': './dist/client.js' },
      }),
      'cordis.patch.yml': '- insert:\n    - id: ocean-skin\n      name: "@fixture/ocean"\n',
      'README.md': 'DSH 0.1.0-rc.6\n![home](screenshots/home.png)\n`dsh plugin add @fixture/ocean`\n',
      'LICENSE': 'MIT License',
      'screenshots.json': JSON.stringify(['screenshots/settings.png']),
      'dist/client.js': 'export {}',
    }
    const fetchText = vi.fn(async (url: string) => {
      if (url === 'https://api.github.com/repos/fixture/theme-packs') {
        return { default_branch: 'main', stargazers_count: 8, topics: ['dsh-plugin'] }
      }
      const path = url.startsWith(`${raw}/packages/ocean/`) ? url.slice(`${raw}/packages/ocean/`.length) : ''
      if (!(path in files)) throw new Error(`Unexpected fixture request: ${url}`)
      return files[path]
    })
    const hydrated = await hydrateSkinSubmission(draft, { fetchText, sha: commit, now: observedAt }) as SkinEntry
    expect(hydrated.starsUpdatedAt).toBe(observedAt)

    // A previously reviewed npm sibling shares repository Stars, but its older
    // snapshot and alphabetically later file must not replace the new reading.
    const existing: SkinEntry = {
      ...structuredClone(hydrated), id: 'fixture.existing', package: '@fixture/existing', rowId: 'existing-skin',
      subpath: 'packages/existing', starsSnapshot: 7, starsUpdatedAt: '2026-10-23T12:00:00.000Z',
      screenshots: [`${raw}/packages/existing/screenshots/home.png`],
      install: {
        target: `github:fixture/theme-packs#${commit}&path:/packages/existing`, version: '1.2.3', commit,
        npm: { name: '@fixture/existing', version: '1.2.3', repository: repo, gitHead: commit, integrity: `sha512-${Buffer.alloc(64, 1).toString('base64')}` },
      },
    }
    const entries = [{ file: 'a-new-ocean.yml', skin: hydrated }, { file: 'z-existing.yml', skin: existing }]
    const original = structuredClone(entries)
    type History = { repos: Record<string, number[][]>; skins: Record<string, number> }
    const initial: History = { repos: { 'fixture/theme-packs': [[today - 2, 2]] }, skins: { [existing.id]: today - 2 } }
    const publish = (previousHistory: History, at: string, previous?: ReturnType<typeof buildCatalogWire>) => {
      const day = dayNumber(at)
      const history = structuredClone(previousHistory)
      const observations = latestRepositorySnapshots(entries)
      for (const id of observations.skinIds) if (!Number.isInteger(history.skins[id])) history.skins[id] = day
      for (const [slug, sample] of observations.snapshots) {
        history.repos[slug] = mergeStarSamples(history.repos[slug] ?? [], [sample], day, 730)
      }
      const skins = entries.map(entry => entry.skin)
      const heat = buildHeatMap({ skins, history, today: day })
      const wire = buildCatalogWire(skins, { heat, previous, generatedAt: at })
      return { history, wire, catalog: validateCatalog(wire) }
    }

    const first = publish(initial, builtAt)
    expect(first.history.skins).toEqual({ [existing.id]: today - 2, [hydrated.id]: today })
    expect(first.history.repos['fixture/theme-packs']?.at(-1)).toEqual([today, 8, Date.parse(observedAt)])
    expect(first.wire.heat[hydrated.id]).toMatchObject({ ageDays: 1, starsPerDay: 8, starGrowthPerDay: 0, asOf: '2026-10-24' })
    expect(first.wire.skins).toHaveLength(2)
    expect(first.wire.skins.every((skin: SkinEntry) => !Object.hasOwn(skin.install, 'npm') && !Object.hasOwn(skin, 'heat'))).toBe(true)
    expect(first.wire.npmSources).toEqual({ [existing.id]: existing.install.npm })
    expect(decodeCatalogWire(first.wire)).toEqual(first.catalog)
    expect(first.catalog.skins.find(skin => skin.id === existing.id)).toEqual(existing)
    expect(first.catalog.skins.find(skin => skin.id === hydrated.id)).toMatchObject({
      subpath: 'packages/ocean', starsUpdatedAt: observedAt,
      install: { target: `github:fixture/theme-packs#${commit}&path:/packages/ocean`, commit, version: '1.2.3' },
      // Repository-relative screenshot sources resolve against the default
      // branch, not the reviewed install commit.
      screenshots: [
        'https://raw.githubusercontent.com/fixture/theme-packs/HEAD/packages/ocean/screenshots/settings.png',
        'https://raw.githubusercontent.com/fixture/theme-packs/HEAD/packages/ocean/screenshots/home.png',
      ],
    })

    const repeated = publish(first.history, '2026-10-24T21:00:00.000Z', first.wire)
    expect(repeated.history).toEqual(first.history)
    expect(JSON.stringify(repeated.wire)).toBe(JSON.stringify(first.wire))
    const nextDay = publish(repeated.history, '2026-10-25T20:00:00.000Z', repeated.wire)
    expect(nextDay.history).toEqual(first.history)
    expect(nextDay.wire.heat[hydrated.id]).toMatchObject({ ageDays: 2, starGrowthPerDay: 0, asOf: '2026-10-25' })
    expect(nextDay.catalog.skins).toEqual(first.catalog.skins)
    expect(entries).toEqual(original)
  })
})
