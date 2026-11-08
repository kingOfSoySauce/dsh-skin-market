import { DAY_MS } from './heat.mjs'

/**
 * Extend the shipped star curve to the reading the catalog shows today.
 *
 * `data/star-curves.json` is an export of each repository's stargazer timeline:
 * GitHub hands out the star timestamp for every user, so the daily values are
 * exact. The market's own `starsSnapshot` readings are coarser: each one is a
 * single number scraped from the repository API on some day, and a recording
 * can be wrong or attributed to the wrong day. When both sources cover the same
 * day they therefore disagree, and letting a snapshot override the curve turned
 * a smooth climb into a sawtooth (a repository that never lost stars appeared
 * to drop dozens of them). The curve keeps its own days; the catalog reading
 * only owns the endpoint, so the chart and the card always show the same number.
 *
 * Curves for repositories that appeared after the export cannot be recovered
 * (the GitHub stargazer list now requires repository administration). Those
 * repositories are drawn from the recorded snapshots alone, and only when the
 * snapshots are monotone enough to be a star total at all; otherwise the panel
 * goes without a chart instead of showing invented drops.
 */

/** Longest series kept per repository; the sparkline downsamples to 48 points. */
export const CURVE_WINDOW_DAYS = 120

/** A slip this large is a bad reading, not an unstar. */
function toleratedDrop(previous) {
  return Math.max(2, previous * 0.05)
}

function readCurve(curve, today) {
  const points = []
  if (!Number.isInteger(curve?.from) || !Array.isArray(curve.stars)) return points
  curve.stars.forEach((stars, index) => {
    const day = curve.from + index
    if (day > today || !Number.isInteger(stars) || stars < 0) return
    points.push({ day, stars })
  })
  return points
}

function readSamples(samples, today) {
  const byDay = new Map()
  for (const sample of Array.isArray(samples) ? samples : []) {
    if (!Array.isArray(sample) || sample.length < 2) continue
    const [day, stars] = sample
    const observedAt = Number.isFinite(sample[2]) ? sample[2] : day * DAY_MS
    if (!Number.isInteger(day) || day > today || !Number.isInteger(stars) || stars < 0) continue
    const existing = byDay.get(day)
    if (existing === undefined || observedAt >= existing.observedAt) byDay.set(day, { day, stars, observedAt })
  }
  return [...byDay.values()].sort((left, right) => left.day - right.day)
}

/** Star totals only move, they do not jump back and forth. */
function isCumulative(points) {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1].stars
    if (points[index].stars < previous - toleratedDrop(previous)) return false
  }
  return true
}

/**
 * Build one cumulative daily series.
 *
 * @param {object} input
 * @param {{ from: number, stars: number[] } | undefined} input.curve exported timeline, if any
 * @param {number[][]} [input.samples] `[day, stars, observedAt]` catalog observations
 * @param {{ day: number, stars: number, observedAt?: number } | undefined} input.snapshot catalog reading
 * @param {number} input.today day number used to reject future readings
 * @param {number} [input.windowDays]
 * @returns {{ from: number, stars: number[] } | undefined} series, or undefined when it cannot be drawn honestly
 */
export function buildCurveSeries({ curve, samples = [], snapshot, today, windowDays = CURVE_WINDOW_DAYS }) {
  if (!Number.isInteger(today)) throw new Error('today must be a day number')
  const snapshotPoint = Number.isInteger(snapshot?.day) && Number.isInteger(snapshot?.stars) && snapshot.stars >= 0
    ? { day: Math.min(snapshot.day, today), stars: snapshot.stars }
    : undefined

  const exported = readCurve(curve, today)
  let points
  if (exported.length > 0) {
    points = exported
  } else {
    points = readSamples(samples, today)
    if (snapshotPoint !== undefined) points = points.filter(point => point.day < snapshotPoint.day).concat(snapshotPoint)
    if (points.length < 2 || !isCumulative(points)) return undefined
  }
  // The catalog reading is the headline number, so it is also the last point.
  // A stale card ends the chart earlier instead of leaving a fresher tail.
  if (snapshotPoint !== undefined) {
    points = points.filter(point => point.day < snapshotPoint.day).concat(snapshotPoint)
  }
  points.sort((left, right) => left.day - right.day)
  if (points.length < 2) return undefined

  const from = points[0].day
  const end = points[points.length - 1].day
  const values = []
  let current
  let cursor = 0
  for (let day = from; day <= end; day += 1) {
    // Missing days repeat the last known total: the series only records days we
    // have a reading for, and a straight line would invent stars in between.
    if (cursor < points.length && points[cursor].day === day) {
      current = points[cursor].stars
      cursor += 1
    }
    values.push(current)
  }

  if (values.length < 2) return undefined
  if (values.length > windowDays) {
    const drop = values.length - windowDays
    return { from: from + drop, stars: values.slice(drop) }
  }
  return { from, stars: values }
}
