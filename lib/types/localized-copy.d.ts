import type { LocalizedSkinCopy } from './types.ts';
export type CatalogLocale = 'zh' | 'en';
export declare function localizedSkinDescription(source: string, copy: LocalizedSkinCopy | undefined, locale: CatalogLocale): string | undefined;
export declare function localizedSkinNameRecord(source: {
    zh: string;
    en: string;
}, copy: LocalizedSkinCopy | undefined): {
    zh: string;
    en: string;
};
