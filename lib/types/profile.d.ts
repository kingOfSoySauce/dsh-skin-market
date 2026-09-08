import { effectiveBuildApprovalKey } from './build-approval.ts';
import { type LoaderIdentity } from './loader-ownership.ts';
import type { InstallConflict, InstalledClientPlugin, PersistedMarketState, SkinActivity, SkinEntry, SkinRuntimeState } from './types.ts';
export type { LoaderIdentity } from './loader-ownership.ts';
export declare function resolveProfileDir(profile: string, explicit?: string): string;
export declare function manifestFile(profileDir: string): string;
export declare function profilePatchFile(profileDir: string): string;
export declare function pnpmWorkspaceFile(profileDir: string): string;
export declare function pnpmLockfile(profileDir: string): string;
export declare function marketStateFile(profileDir: string): string;
export declare function readJson<T>(file: string, fallback: T): T;
export declare function atomicWriteJson(file: string, value: unknown): void;
export declare function atomicWriteText(file: string, value: string): void;
export declare function readMarketState(profileDir: string): PersistedMarketState;
export declare function writeMarketState(profileDir: string, state: PersistedMarketState): void;
export declare function readDependencies(profileDir: string): Record<string, string>;
export declare function readProfileBundles(profileDir: string): string[];
/** Remove legacy market-promoted bundles; normal registration preserves bundle layers. */
export declare function removeProfileBundles(profileDir: string, packageNames: Iterable<string>): void;
export declare function packageDir(profileDir: string, packageName: string): string;
export declare function compatibilityPatchDir(profileDir: string): string;
export declare function compatibilityPatchFile(profileDir: string, packageName: string, version: string): string;
export declare function packageManifest(profileDir: string, packageName: string): Record<string, unknown> | null;
export declare function validateInstalledSkin(profileDir: string, skin: SkinEntry): {
    ok: boolean;
    reason?: string;
    version?: string;
    repairable?: boolean;
};
export declare function installedSpecMatches(skin: SkinEntry, spec: string | null | undefined): boolean;
/** Only offer an explicit migration between the same reviewed GitHub/npm release. */
export declare function npmSourceMigration(profileDir: string, skin: SkinEntry): {
    target: string;
    currentSource: string;
} | undefined;
export declare function companionNeedsInstall(profileDir: string, companion: {
    package: string;
    commit: string;
}): boolean;
export declare function companionsNeedInstall(profileDir: string, skin: SkinEntry): boolean;
export { effectiveBuildApprovalKey };
export interface PackageLoaderOwnership {
    packageName: string;
    hasBundle: boolean;
    rows: LoaderIdentity[];
}
export declare class InstallConflictError extends Error {
    readonly conflicts: InstallConflict[];
    constructor(conflicts: InstallConflict[]);
}
export declare class LoaderMetadataError extends Error {
    constructor(message: string);
}
export declare function packageLoaderOwnershipAt(packageDirectory: string, packageName: string): PackageLoaderOwnership;
export declare function packageLoaderIdentities(profileDir: string, packageName: string): LoaderIdentity[];
export declare function installedLoaderIdentities(profileDir: string, excludePackage?: string): LoaderIdentity[];
export declare function assertLoaderMetadata(profileDir: string, skin: SkinEntry): void;
export declare function assertNoLoaderConflicts(profileDir: string, skin: SkinEntry, incomingRows?: readonly LoaderIdentity[]): void;
/** Whether a profile-level row already targets this loader. */
export declare function hasLoaderOverride(profileDir: string, identity: LoaderIdentity): boolean;
/**
 * Toggle a receipt-owned loader without taking over a user-authored row.
 * The market creates only the minimal `{id, disabled:true}` shape and removes
 * only that exact shape. Any richer row is treated as user-owned and left
 * untouched.
 * @returns true when the market still controls the row and live state may be updated.
 */
export declare function setManagedLoaderOverride(profileDir: string, identity: LoaderIdentity, disabled: boolean): boolean;
export declare function ensureBuildAllowed(profileDir: string, key: string): void;
export declare function ensurePatchedDependency(profileDir: string, packageName: string, version: string, patchFile: string): void;
/**
 * pnpm records patch file hashes in pnpm-lock.yaml, not the configured paths.
 * Keep this check local so an older interrupted market operation can repair
 * its metadata before the next frozen install.
 */
export declare function patchedDependenciesNeedSync(profileDir: string): boolean;
/** Remove a package's patch settings but keep patch files available for rollback. */
export declare function detachCompatibilityPatches(profileDir: string, packageName: string): string[];
export declare function cleanupCompatibilityPatchFiles(files: readonly string[]): void;
export declare function removePatchedDependency(profileDir: string, packageName: string, version: string): void;
export declare function removeCompatibilityPatch(profileDir: string, packageName: string, version: string): void;
export declare function removeCompatibilityPatches(profileDir: string, packageName: string): void;
export declare function ensureSkinRegistration(profileDir: string, skin: SkinEntry, disabled?: boolean): void;
export declare function removeSkinRegistration(profileDir: string, skin: SkinEntry): void;
export declare function installedClientPlugins(profileDir: string, catalog: SkinEntry[]): InstalledClientPlugin[];
export interface FileSnapshot {
    existed: boolean;
    contents: string;
}
export declare function snapshotFile(file: string): FileSnapshot;
export declare function restoreFile(file: string, snapshot: FileSnapshot): void;
export declare function snapshotManifest(profileDir: string): FileSnapshot;
export declare function restoreManifest(profileDir: string, snapshot: FileSnapshot): void;
export declare function runtimeState(profileDir: string, skin: SkinEntry, activeSkinId: string | null, loaderLive: boolean, loaderFound: boolean, pinnedSkinIds?: string[], activity?: SkinActivity): SkinRuntimeState;
