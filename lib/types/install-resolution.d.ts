import type { SkinCompanion, SkinEntry } from './types.ts';
export { npmInstallTarget, preferredInstallTarget } from './install-source.ts';
export interface GithubTargetParts {
    repository: string;
    commit: string;
    subpath?: string;
}
/** Repo-relative directory for pnpm's `#path:` / `&path:/` selectors. */
export declare function validSubpath(subpath: string): boolean;
export declare function normalizeGithubSubpath(subpath: string): string;
/** pnpm git subdirectory selector. Leading slash is required; see pnpm PR #7487. */
export declare function githubPathQuery(subpath: string): string;
export declare function githubInstallTarget(repository: string, commit: string, subpath?: string): string;
export declare function parseGithubTarget(target: string): GithubTargetParts | null;
export declare function companionAsSkin(skin: SkinEntry, companion: SkinCompanion): SkinEntry;
export declare function isNpmInstallTarget(skin: SkinEntry, target: string): boolean;
export declare function repositoryIdentity(value: unknown): string | null;
/** Validate the provenance fields before trusting a catalog's npm alternative. */
export declare function reviewedNpmSourceError(skin: SkinEntry): string | null;
/** Ordinary updates retain the source family recorded in the live profile. */
export declare function updateInstallTarget(skin: SkinEntry, currentSpec: string | undefined): string;
/**
 * Inspect a root GitHub package fetched into a temporary profile. A package
 * collection is only retargeted when exactly one child is the reviewed DSH
 * package; ambiguous collections remain a catalog error instead of guessing.
 */
export declare function discoverMonorepoTarget(directory: string, skin: SkinEntry, target: string): string | null;
