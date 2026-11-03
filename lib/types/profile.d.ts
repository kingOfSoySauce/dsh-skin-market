import { effectiveBuildApprovalKey } from './build-approval.ts';
import { type LoaderIdentity } from './loader-ownership.ts';
import type { InstallConflict, InstalledClientPlugin, MarketHostKind, PersistedMarketState, SkinActivity, SkinArtifactRisk, SkinEntry, SkinRuntimeState, SkinSourceMigration } from './types.ts';
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
export declare function isGithubArtifactSpec(spec: string | null | undefined): boolean;
/** Source identity remains fixed during updates; only the pinned commit may advance. */
export declare function githubArtifactSourceMatches(skin: SkinEntry, spec: string): boolean;
/** Validate both the saved source and its actual GitHub root-importer resolution. */
export declare function validateGithubArtifact(profileDir: string, skin: SkinEntry): {
    ok: boolean;
    version?: string;
    reason?: string;
    integrityVerified: boolean;
};
export interface InstalledArtifactSnapshot {
    packageName: string;
    name: string | null;
    version: string | null;
    spec: string | null;
    ok: boolean;
    reason?: string;
    files: Array<{
        kind: 'host' | 'client' | 'bundle';
        path: string;
        sha256: string;
    }>;
    resolution?: {
        specifier: string;
        version: string;
        integrity: string | null;
        tarball: string | null;
        gitHosted?: boolean;
        path?: string | null;
        gitPackageVersion?: string | null;
    } | null;
}
/** Inspect only this package's declared executable entries; never import code. */
export declare function snapshotInstalledArtifact(profileDir: string, packageName: string): InstalledArtifactSnapshot;
/** Return only risks for a complete, correctly resolved, conflict-free skin artifact. */
export declare function inspectSkinArtifactRisk(profileDir: string, skin: SkinEntry, hostKind?: MarketHostKind): SkinArtifactRisk | undefined;
export declare function isSkinArtifactRiskAcknowledged(profileDir: string, skin: SkinEntry, hostKind?: MarketHostKind): boolean;
/** Recompute immediately before persisting; stale or structurally invalid targets never gain consent. */
export declare function acknowledgeSkinArtifactRisk(profileDir: string, skin: SkinEntry, context: string, hostKind?: MarketHostKind): boolean;
/** Compare recovery to the installed release before the operation, not today's catalog. */
export declare function compareInstalledArtifact(profileDir: string, baseline: InstalledArtifactSnapshot): {
    ok: boolean;
    reason?: string;
    artifact: InstalledArtifactSnapshot;
};
export interface SkinArtifactValidationOptions {
    /** Installation may retain a usable artifact; selecting it still requires exact user consent. */
    allowArtifactRisk?: true;
    hostKind?: MarketHostKind;
}
export declare function validateInstalledSkin(profileDir: string, skin: SkinEntry, options?: SkinArtifactValidationOptions): {
    ok: boolean;
    reason?: string;
    version?: string;
    repairable?: boolean;
};
export declare function installedSpecMatches(skin: SkinEntry, spec: string | null | undefined): boolean;
/** A manager-written npm range is accepted only through its installed resolution. */
export declare function reviewedInstalledSpecMatches(profileDir: string, skin: SkinEntry, spec: string | null | undefined, options?: SkinArtifactValidationOptions): boolean;
export interface NpmArtifactSource {
    name: string;
    version: string;
    integrity?: string;
    gitHead?: string;
    tarball?: string;
}
/** Validate materialized npm entries and the root lock contract without importing code. */
export declare function validateNpmArtifact(profileDir: string, source: NpmArtifactSource): {
    ok: boolean;
    version?: string;
    reason?: string;
    integrityVerified: boolean;
};
/** Validate the installed Desktop source without inventing missing npm provenance. */
export declare function validateDesktopArtifact(profileDir: string, skin: SkinEntry, options?: SkinArtifactValidationOptions): {
    ok: boolean;
    version?: string;
    reason?: string;
    integrityVerified: boolean;
};
/** Explicitly replace a verified local source, or migrate the same reviewed GitHub/npm release. */
export declare function npmSourceMigration(profileDir: string, skin: SkinEntry): SkinSourceMigration | undefined;
/**
 * Package names are not enough to prove that a dependency belongs to a market
 * entry. GitHub installs must stay in the reviewed repository/subpath family;
 * npm and confirmed local replacements use their existing package provenance.
 */
export declare function installedSkinSourceMatches(profileDir: string, skin: SkinEntry): boolean;
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
export declare function installedLoaderIdentities(profileDir: string, excludePackage?: string, excludedRootPackages?: readonly string[]): LoaderIdentity[];
/** Root bundles whose reviewed predecessor can be withdrawn before selection. */
export declare function verifiedDesktopLegacyPackages(profileDir: string, skin: SkinEntry): string[];
/** Whether selecting the replacement alone will enable its sole component on restart. */
export declare function desktopLegacyReplacementEnabled(profileDir: string, skin: SkinEntry): boolean;
export interface LoaderConflictOptions {
    hostKind?: MarketHostKind;
}
export declare function assertLoaderMetadata(profileDir: string, skin: SkinEntry): void;
export declare function assertNoLoaderConflicts(profileDir: string, skin: SkinEntry, incomingRows?: readonly LoaderIdentity[], options?: LoaderConflictOptions): void;
/** Check known incoming identities before replacing an installed artifact. */
export declare function assertNoKnownLoaderConflicts(profileDir: string, skin: SkinEntry, incoming: readonly LoaderIdentity[], options?: LoaderConflictOptions): void;
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
export declare function runtimeState(profileDir: string, skin: SkinEntry, activeSkinId: string | null, loaderLive: boolean, loaderFound: boolean, pinnedSkinIds?: string[], activity?: SkinActivity, hostKind?: MarketHostKind, enabledSkinIds?: string[]): SkinRuntimeState;
