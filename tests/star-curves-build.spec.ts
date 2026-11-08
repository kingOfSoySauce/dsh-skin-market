import { describe, expect, it } from 'vitest'
import { buildCurveSeries, CURVE_WINDOW_DAYS } from '../scripts/star-curves-merge.mjs'

const TODAY = 20765
const AT = day => day * 86_400_000

describe('star curve merge', () => {
  it('extends the exported curve to the catalog reading and repeats the last value', () => {
    const series = buildCurveSeries({
      curve: { from: 20760, stars: [10, 12, 12, 30] },
      snapshot: { day: 20765, stars: 44 },
      today: TODAY,
    })
    expect(series).toEqual({ from: 20760, stars: [10, 12, 12, 30, 30, 44] })
  })

  it('keeps the exported timeline when a recorded snapshot disagrees', () => {
    // The bloom repository: the curve climbs to 72 while a mid-October snapshot
    // claimed 107 and a later one dropped to 42. Neither may cut a notch.
    const series = buildCurveSeries({
      curve: { from: 20760, stars: [38, 39, 39, 40, 72] },
      samples: [[20761, 107, AT(20761)], [20763, 42, AT(20763)]],
      snapshot: { day: 20765, stars: 100 },
      today: TODAY,
    })
    expect(series?.stars).toEqual([38, 39, 39, 40, 72, 100])
  })

  it('ends on the card value instead of a newer history point', () => {
    const series = buildCurveSeries({
      curve: { from: 20760, stars: [10, 12, 12, 72] },
      samples: [[20766, 139]],
      snapshot: { day: 20765, stars: 100 },
      today: TODAY + 1,
    })
    expect(series).toEqual({ from: 20760, stars: [10, 12, 12, 72, 72, 100] })
  })

  it('keeps the latest observation of a day when there is no curve', () => {
    const series = buildCurveSeries({
      samples: [[20760, 4], [20761, 3, AT(20761) + 3_600_000], [20761, 9, AT(20761) + 7_200_000]],
      snapshot: { day: 20762, stars: 11 },
      today: TODAY,
    })
    expect(series).toEqual({ from: 20760, stars: [4, 9, 11] })
  })

  it('builds a series from history alone when no curve was exported', () => {
    const series = buildCurveSeries({
      samples: [[20760, 4, AT(20760)], [20763, 8, AT(20763)]],
      snapshot: { day: 20765, stars: 12 },
      today: TODAY,
    })
    expect(series).toEqual({ from: 20760, stars: [4, 4, 4, 8, 8, 12] })
  })

  it('refuses to draw history that falls like a star count cannot', () => {
    expect(buildCurveSeries({
      samples: [[20760, 95, AT(20760)], [20763, 42, AT(20763)]],
      snapshot: { day: 20765, stars: 100 },
      today: TODAY,
    })).toBeUndefined()
    // A star or two really can disappear; that is not a broken reading.
    expect(buildCurveSeries({
      samples: [[20760, 6, AT(20760)]],
      snapshot: { day: 20763, stars: 4 },
      today: TODAY,
    })?.stars).toEqual([6, 6, 6, 4])
  })

  it('cannot draw a line from one reading', () => {
    expect(buildCurveSeries({ snapshot: { day: 20765, stars: 3 }, today: TODAY })).toBeUndefined()
    expect(buildCurveSeries({ curve: { from: 20765, stars: [3] }, today: TODAY })).toBeUndefined()
    expect(buildCurveSeries({ samples: [[20765, 3]], today: TODAY })).toBeUndefined()
  })

  it('ignores future readings and caps a long window', () => {
    const long = Array.from({ length: 200 }, (_, index) => index)
    const series = buildCurveSeries({ curve: { from: 20_000, stars: long }, snapshot: { day: 20_400, stars: 2_400 }, today: 20_400 })
    expect(series?.stars).toHaveLength(CURVE_WINDOW_DAYS)
    expect(series?.stars.at(-1)).toBe(2_400)
    expect(series?.from).toBe(20_400 - CURVE_WINDOW_DAYS + 1)

    const future = buildCurveSeries({ samples: [[20770, 9], [20771, 9]], snapshot: { day: 20770, stars: 9 }, today: TODAY })
    expect(future).toBeUndefined()
  })
})
