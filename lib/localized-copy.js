export function localizedSkinDescription(source, copy, locale) {
    if (copy?.descriptionPolicy === 'omit')
        return undefined;
    const localized = copy?.description?.[locale];
    return typeof localized === 'string' && localized.trim() !== '' ? localized : source;
}
export function localizedSkinNameRecord(source, copy) {
    return {
        zh: typeof copy?.name?.zh === 'string' && copy.name.zh.trim() !== '' ? copy.name.zh : source.zh,
        en: typeof copy?.name?.en === 'string' && copy.name.en.trim() !== '' ? copy.name.en : source.en,
    };
}
