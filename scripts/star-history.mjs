import { DAY_MS, dayNumber, repoSlug } from './heat.mjs'

/** Coalesce dated observations, preferring the observation made latest that day. */
export function mergeStarSamples(target, incoming, today, retentionDays) {
  const byDay = new Map()
  for (const sample of [...(Array.isArray(target) ? target : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    if (!Array.isArray(sample) || sample.length < 2) continue
    const [day, stars, observedAt = day * DAY_MS] = sample
    if (!Number.isInteger(day) || day < today - retentionDays || day > today
      || !Number.isInteger(stars) || stars < 0 || !Number.isFinite(observedAt)) continue
    const existing = byDay.get(day)
    if (existing === undefined || observedAt > existing[2]) byDay.set(day, [day, stars, observedAt])
  }
  return [...byDay.values()].sort((left, right) => left[0] - right[0]).map(([day, stars, observedAt]) => [day, stars, observedAt])
}

export function earliestObservedDay(existing, incoming) {
  const valid = [existing, incoming].filter(Number.isInteger)
  return valid.length === 0 ? undefined : Math.min(...valid)
}

/** Parse `git log --format=C%atC -p` output into chronological star observations. */
export function parseStarHistoryLog(log, today, retentionDays) {
  const observations = []
  let timestamp
  for (const line of String(log).split('\n')) {
    const commit = /^C(\d+)C$/.exec(line)
    if (commit !== null) {
      timestamp = Number(commit[1]) * 1000
      continue
    }
    const added = /^\+starsSnapshot:\s*(\d+)\s*$/.exec(line)
    if (added === null || !Number.isFinite(timestamp)) continue
    const day = dayNumber(timestamp)
    if (day >= today - retentionDays && day <= today) observations.push([day, Number(added[1]), timestamp])
  }
  // Git emits newest commits first. Sorting preserves actual intra-day order.
  return observations.sort((left, right) => left[2] - right[2])
}

/** Choose the newest real registry observation for each repository. */
export function latestRepositorySnapshots(entries) {
  const snapshots = new Map()
  const skinIds = new Set()
  for (const { skin, file } of entries) {
    const slug = typeof skin.repo === 'string' ? repoSlug(skin.repo) : ''
    if (slug === '' || !Number.isInteger(skin.starsSnapshot)) continue
    skinIds.add(skin.id)
    const observedAt = typeof skin.starsUpdatedAt === 'string' ? Date.parse(skin.starsUpdatedAt) : NaN
    if (!Number.isFinite(observedAt)) continue
    const prior = snapshots.get(slug)
    if (prior === undefined || observedAt > prior.observedAt || (observedAt === prior.observedAt && file.localeCompare(prior.file) > 0)) {
      snapshots.set(slug, { day: dayNumber(observedAt), stars: skin.starsSnapshot, observedAt, file })
    }
  }
  return { snapshots: new Map([...snapshots].map(([slug, sample]) => [slug, [sample.day, sample.stars, sample.observedAt]])), skinIds }
}

/** Choose the newest catalog star reading for each repository. */
export function latestCatalogSnapshots(skins) {
  const snapshots = new Map()
  for (const skin of Array.isArray(skins) ? skins : []) {
    const slug = typeof skin?.repo === 'string' && /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/i.test(skin.repo) ? repoSlug(skin.repo) : ''
    const observedAt = Date.parse(skin?.starsUpdatedAt)
    if (slug === '' || !Number.isInteger(skin?.starsSnapshot) || skin.starsSnapshot < 0 || !Number.isFinite(observedAt)) continue
    const prior = snapshots.get(slug)
    if (prior === undefined || observedAt > prior.observedAt) {
      snapshots.set(slug, { day: dayNumber(observedAt), stars: skin.starsSnapshot, observedAt })
    }
  }
  return new Map([...snapshots].map(([slug, sample]) => [slug, [sample.day, sample.stars, sample.observedAt]]))
}
