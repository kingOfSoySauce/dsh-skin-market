import { satisfiesVersionRange } from './semver.js';
import { defaultTranslator } from './client/i18n.js';
const KEYED_SLOT_CAPABILITY_PREFIX = 'slot:keyed:';
// Keep this browser-safe module independent from the host runtime detector.
const LEGACY_KEYED_SETTINGS_RANGE = '>=0.1.0-rc.7 <0.1.6-alpha.2';
/** Bind a one-operation acknowledgement to the package and runtime shown. */
export function compatibilityContext(skin, runtime) {
    const desktop = skin.install.desktop;
    return JSON.stringify([
        skin.id, skin.package, skin.install.version, skin.install.commit, skin.install.target,
        skin.install.npm?.integrity ?? null,
        desktop?.mode === 'managed' ? [desktop.packageName, desktop.packageVersion, desktop.integrity ?? null] : null,
        skin.compatibility.dsh, runtime?.version ?? null,
    ]);
}
function declaredAdapters(skin) {
    return skin.compatibility.adapters ?? [];
}
function sameAdapter(left, right) {
    return left.kind === right.kind
        && left.when === right.when
        && left.slot === right.slot
        && left.key === right.key;
}
export function applicableAdapters(skin, runtime, _legacyIncludeBuiltIns) {
    // Keep the optional argument for existing callers, but never invent source
    // migrations or expand the author's supported versions. Only a reviewed,
    // explicitly declared rule may run within that range.
    if (runtime.version === null || skin.compatibility.dsh === 'unverified' || !satisfiesVersionRange(runtime.version, skin.compatibility.dsh))
        return [];
    const declared = declaredAdapters(skin);
    const uniqueAdapters = declared.filter((adapter, index, all) => all.findIndex(item => sameAdapter(item, adapter)) === index);
    return uniqueAdapters.filter(adapter => satisfiesVersionRange(runtime.version, adapter.when)
        && (adapter.slot !== 'settings.plugin.item' || satisfiesVersionRange(runtime.version, LEGACY_KEYED_SETTINGS_RANGE))
        && runtime.capabilities.includes(`${KEYED_SLOT_CAPABILITY_PREFIX}${adapter.slot}`));
}
export function assessCompatibility(skin, runtime, t = defaultTranslator) {
    if (runtime.version === null)
        return {
            decision: 'unknown',
            reason: t('compatibility.versionUnknown'),
            adapterIds: [],
        };
    const declared = applicableAdapters(skin, runtime, false);
    if (skin.compatibility.dsh === 'unverified')
        return {
            decision: 'unknown',
            reason: t('compatibility.unverified', { version: runtime.version }),
            adapterIds: declared.map(adapter => adapter.id),
        };
    if (declared.length > 0)
        return {
            decision: 'adaptable',
            reason: t('compatibility.adapter', { version: runtime.version }),
            adapterIds: declared.map(adapter => adapter.id),
        };
    if (satisfiesVersionRange(runtime.version, skin.compatibility.dsh))
        return {
            decision: 'compatible',
            reason: t('compatibility.compatible', { version: runtime.version, range: skin.compatibility.dsh }),
            adapterIds: [],
        };
    return {
        decision: 'incompatible',
        reason: t('compatibility.incompatible', { version: runtime.version, range: skin.compatibility.dsh }),
        adapterIds: [],
    };
}
