import { describe, expect, it } from 'vitest'
import { localizedSkinDescription, localizedSkinNameRecord } from '../src/localized-copy.ts'

describe('localized skin description fallback', () => {
  it('uses the approved translation for the selected locale', () => {
    const copy = { description: { en: 'A natural English description.' } }
    expect(localizedSkinDescription('作者原文', copy, 'en')).toBe('A natural English description.')
  })

  it('keeps the source description when a translation is unavailable', () => {
    const copy = { description: { en: 'A natural English description.' } }
    expect(localizedSkinDescription('作者原文', copy, 'zh')).toBe('作者原文')
    expect(localizedSkinDescription('作者原文', undefined, 'en')).toBe('作者原文')
  })

  it('omits a description explicitly marked as unsuitable', () => {
    expect(localizedSkinDescription('错误来源', { descriptionPolicy: 'omit' }, 'zh')).toBeUndefined()
  })

  it('merges approved display names over the source names', () => {
    expect(localizedSkinNameRecord({ zh: 'dsh-theme', en: 'dsh-theme' }, { name: { zh: '落雪音乐', en: 'Luoxue Music' } })).toEqual({ zh: '落雪音乐', en: 'Luoxue Music' })
    expect(localizedSkinNameRecord({ zh: '中文名', en: 'English name' }, { name: { en: 'Reviewed name' } })).toEqual({ zh: '中文名', en: 'Reviewed name' })
  })
})