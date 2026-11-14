import { githubInstallTarget } from './install-resolution.ts'
import { parseVersion, satisfiesVersionRange } from './semver.ts'
import type { CatalogFile, DesktopInstallCapability, InstallPolicy, NpmInstallSource, SkinEntry } from './types.ts'

/** Opt-in switch for consuming release observations. Default off keeps v1 behavior. */
export const INSTALL_POLICY_ENV = 'DSH_SKIN_MARKET_INSTALL_POLICY'

export function installPolicyEnabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env[INSTALL_POLICY_ENV] === '1'
}

export type InstallPolicySkipReason =
  | 'package-mismatch'
  | 'companions'
  | 'invalid-version'
  | 'invalid-commit'
  | 'range-mismatch'
  | 'invalid-repository'
  | 'missing-npm-source'
  | 'github-policy-with-npm-source'
  | 'missing-integrity'
  | 'managed-requires-npm'

export type InstallPolicyResolution =
  | { skin: SkinEntry; policy: InstallPolicy }
  | { reason: InstallPolicySkipReason }

function repositorySlug(repo: string): string | null {
  const match = /^https:\/\/github\.com\/([^/#]+)\/([^/#]+?)\/?$/.exec(repo.trim())
  return match === null ? null : `${match[1]}/${match[2]}`
}

/**
 * Fold one release observation into a catalog entry.
 *
 * The result is still an exact artifact (version + commit + SRI); this function
 * only decides which exact artifact the v1 entry should describe. Any mismatch
 * skips the policy and leaves the reviewed v1 install fields untouched.
 */
export function resolveSkinInstallPolicy(skin: SkinEntry, policy: InstallPolicy): InstallPolicyResolution {
  if (policy.package !== skin.package) return { reason: 'package-mismatch' }
  if ((skin.install.companions?.length ?? 0) > 0) return { reason: 'companions' }
  const resolved = policy.resolved
  if (parseVersion(resolved.version) === null) return { reason: 'invalid-version' }
  if (!/^[0-9a-f]{40}$/i.test(resolved.commit)) return { reason: 'invalid-commit' }
  if (policy.range !== undefined && !satisfiesVersionRange(resolved.version, policy.range)) {
    return { reason: 'range-mismatch' }
  }
  const repository = repositorySlug(skin.repo)
  if (repository === null) return { reason: 'invalid-repository' }
  const commit = resolved.commit.toLowerCase()

  let npm: NpmInstallSource | undefined = skin.install.npm
  if (policy.mode === 'npm') {
    if (npm === undefined) return { reason: 'missing-npm-source' }
    if (resolved.integrity === undefined) return { reason: 'missing-integrity' }
    npm = {
      name: skin.package,
      version: resolved.version,
      integrity: resolved.integrity,
      repository: npm.repository,
      gitHead: commit,
    }
  } else if (npm !== undefined) {
    // A GitHub policy cannot re-sign an npm tarball we have no observation for.
    return { reason: 'github-policy-with-npm-source' }
  }

  let desktop: DesktopInstallCapability | undefined = skin.install.desktop
  if (desktop?.mode === 'managed') {
    if (policy.mode !== 'npm' || resolved.integrity === undefined) return { reason: 'managed-requires-npm' }
    desktop = { ...desktop, packageVersion: resolved.version, integrity: resolved.integrity }
  }

  const sameReviewedTarget = commit === skin.install.commit.toLowerCase()
  const install: SkinEntry['install'] = {
    target: githubInstallTarget(repository, commit, skin.subpath),
    version: resolved.version,
    commit,
    ...(npm === undefined ? {} : { npm }),
    ...(desktop === undefined ? {} : { desktop }),
    // A build-approval key that names the old reviewed commit must not be
    // silently reused for a different tree; dropping it makes the host ask.
    ...(skin.install.allowBuild === undefined || !sameReviewedTarget ? {} : { allowBuild: skin.install.allowBuild }),
  }
  return { skin: { ...skin, install }, policy }
}

/**
 * Apply every valid release observation. Invalid or inapplicable policies are
 * skipped one by one, so a bad observation can never take the whole catalog
 * (or an individual entry) down; callers keep the reviewed v1 fallback.
 */
export function applyInstallPolicies(catalog: CatalogFile, options: { enabled?: boolean } = {}): CatalogFile {
  if (options.enabled === false) return catalog
  const policies = catalog.installPolicies
  if (policies === undefined || Object.keys(policies).length === 0) return catalog
  let changed = false
  const skins = catalog.skins.map(skin => {
    const policy = policies[skin.id]
    if (policy === undefined) return skin
    const resolution = resolveSkinInstallPolicy(skin, policy)
    if ('reason' in resolution) return skin
    changed = true
    return resolution.skin
  })
  return changed ? { ...catalog, skins } : catalog
}
