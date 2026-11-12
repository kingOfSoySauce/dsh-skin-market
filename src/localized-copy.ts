import type { LocalizedSkinCopy } from './types.ts'

export type CatalogLocale = 'zh' | 'en'

export function localizedSkinDescription(source: string, copy: LocalizedSkinCopy | undefined, locale: CatalogLocale): string | undefined {
  if (copy?.descriptionPolicy === 'omit') return undefined
  const localized = copy?.description?.[locale]
  return typeof localized === 'string' && localized.trim() !== '' ? localized : source
}

export function localizedSkinNameRecord(source: { zh: string; en: string }, copy: LocalizedSkinCopy | undefined): { zh: string; en: string } {
  return {
    zh: typeof copy?.name?.zh === 'string' && copy.name.zh.trim() !== '' ? copy.name.zh : source.zh,
    en: typeof copy?.name?.en === 'string' && copy.name.en.trim() !== '' ? copy.name.en : source.en,
  }
}
