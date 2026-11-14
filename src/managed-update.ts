import type { SkinEntry } from './types.ts'
import { isNpmDependencySpec, parseGithubTarget, reviewedNpmSourceError } from './install-resolution.ts'
import { githubArtifactSourceMatches } from './profile.ts'
import { compareVersions, parseVersion } from './semver.ts'

/** The exact target the official Host replaces an installed skin with. */
export interface ManagedUpdateTarget {
  /** `registry` asks the Host for the exact npm version; `git` hands it a pinned Git spec. */
  kind: 'registry' | 'git'
  version: string
  /** The pinned Git spec, only for `git`. */
  spec?: string
}

/**
 * The version to offer when the resolved target is strictly newer than what is installed.
 * A missing or unreadable installed version keeps the official update path out of reach.
 */
function newerVersion(target: string | undefined, installed: string | null | undefined): string | undefined {
  if (target === undefined || installed === null || installed === undefined) return undefined
  if (parseVersion(target) === null || parseVersion(installed) === null) return undefined
  return compareVersions(target, installed) > 0 ? target : undefined
}

/**
 * The official `pluginManager.updateBundle` target for an installed skin, or undefined when the
 * saved spec is a form the Host cannot replace in place: a local path or link, a registry alias,
 * an unpinned or foreign Git copy, an unreviewed npm source, or no strictly newer semver version.
 * The caller still decides whether the installed package is a bundle and whether the operation
 * may run; this helper only reads catalog metadata and the profile's saved spec.
 * @param skin - the catalog entry, with its resolved `install` fields.
 * @param currentSpec - the profile's saved dependency spec for the package.
 * @param installedVersion - the installed package manifest version.
 */
export function managedUpdateTarget(skin: SkinEntry, currentSpec: string | undefined, installedVersion: string | null | undefined): ManagedUpdateTarget | undefined {
  if (currentSpec === undefined || currentSpec === '') return undefined
  const version = newerVersion(skin.install.version, installedVersion)
  if (version === undefined) return undefined
  // A Git copy updates only to another commit of the reviewed repository directory.
  if (parseGithubTarget(currentSpec) !== null) {
    if (!githubArtifactSourceMatches(skin, currentSpec)) return undefined
    if (parseGithubTarget(skin.install.target) === null) return undefined
    return { kind: 'git', version, spec: skin.install.target }
  }
  // A registry copy updates only through the reviewed npm source under the package's own name.
  if (isNpmDependencySpec(currentSpec, skin.package) && skin.install.npm !== undefined && reviewedNpmSourceError(skin) === null) {
    return { kind: 'registry', version }
  }
  return undefined
}
