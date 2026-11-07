import { describe, expect, it } from 'vitest'
import { curveFor, downsample, parseStarCurves, sparklineGeometry } from '../src/star-curves.ts'

describe('star curves', () => {
  it('keeps the newest value when thinning a long series', () => {
    const values = Array.from({ length: 200 }, (_, index) => index)
    const thin = downsample(values, 12)
    expect(thin).toHaveLength(12)
    expect(thin.at(-1)).toBe(199)
    expect(thin[0]).toBe(0)
  })

  it('draws a smooth path that starts and ends on real points', () => {
    const geometry = sparklineGeometry([0, 0, 1, 1, 2, 30], 100, 40)
    expect(geometry).toBeDefined()
    const { d, end } = geometry!
    expect(d.startsWith('M3 ')).toBe(true)
    expect(d).toContain('C')
    expect(end.x).toBeCloseTo(97, 1)
    expect(end.y).toBeLessThan(6)
  })

  it('does not dip outside the plot box on a flat series', () => {
    const { d } = sparklineGeometry([5, 5, 5, 5], 40, 20)!
    const ys = [...d.matchAll(/[-\d.]+ ([-\d.]+)/g)].map(match => Number(match[1]))
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...ys)).toBeLessThanOrEqual(20)
  })

  it('ignores malformed curves instead of throwing', () => {
    expect(parseStarCurves(null)).toEqual({})
    expect(parseStarCurves({ repos: { 'a/b': { from: 'x', stars: [1, 2] } } })).toEqual({})
    expect(parseStarCurves({ repos: { 'a/b': { from: 1, stars: [1] } } })).toEqual({})
    const curves = parseStarCurves({ repos: { 'a/b': { from: 1, stars: [0, 3, 9] } } })
    expect(curveFor(curves, 'https://github.com/a/b/')).toEqual([0, 3, 9])
  })
})
