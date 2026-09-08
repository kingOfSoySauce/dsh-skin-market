import type { CatalogFile, NpmInstallSource, SkinEntry } from './types.ts';
type WireSkinEntry = Omit<SkinEntry, 'install'> & {
    install: Omit<SkinEntry['install'], 'npm'>;
};
/** Shared with older clients: their install fields keep the original GitHub target. */
export interface CatalogWireFile extends Omit<CatalogFile, 'skins'> {
    skins: WireSkinEntry[];
    npmSources?: Record<string, NpmInstallSource>;
}
/**
 * Expand the backwards-compatible wire format without mutating its input.
 * This validates the envelope and all npm metadata; callers still validate the
 * complete skin entries with their existing schema validator afterwards.
 * No Node imports: the website uses the same metadata checks as the plugin.
 */
export declare function decodeCatalogWire(value: unknown): CatalogFile;
/** Always serialize npm metadata outside skins[].install, including shared caches. */
export declare function encodeCatalogWire(catalog: CatalogFile): CatalogWireFile;
export {};
