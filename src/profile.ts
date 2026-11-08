import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { isAlias, isMap, isScalar, isSeq, parse, parseDocument, stringify, visit, type Alias, type Document, type Node, type YAMLMap, type YAMLSeq } from 'yaml'
import { effectiveBuildApprovalKey } from './build-approval.ts'
import { cordisYamlOptions } from './cordis-yaml.ts'
import { normalizeGithubSubpath, npmInstallTarget, parseGithubTarget, repositoryIdentity, reviewedNpmSourceError, type GithubTargetParts } from './install-resolution.ts'
import { parseInsertedLoaderRows, primaryLoaderCandidates, sharedLoaderIdentifiers, type LoaderIdentity } from './loader-ownership.ts'
import { compareVersions, isVersionRange, parseVersion, satisfiesVersionRange } from './semver.ts'
import type { InstallConflict, InstalledClientPlugin, ManagedCompanionState, ManagedLoaderState, MarketHostKind, PersistedMarketState, SkinActivity, SkinArtifactRisk, SkinEntry, SkinRuntimeState, SkinSourceMigration } from './types.ts'

export type { LoaderIdentity } from './loader-ownership.ts'

export function resolveProfileDir(profile: string, explicit?: string): string {
  if (explicit !== undefined) return explicit
  const base = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
  return join(base, 'profiles', profile)
}

export function manifestFile(profileDir: string): string { return join(profileDir, 'package.json') }
export function profilePatchFile(profileDir: string): string { return join(profileDir, 'cordis.patch.yml') }
export function pnpmWorkspaceFile(profileDir: string): string { return join(profileDir, 'pnpm-workspace.yaml') }
export function pnpmLockfile(profileDir: string): string { return join(profileDir, 'pnpm-lock.yaml') }
export function marketStateFile(profileDir: string): string { return join(profileDir, '.dsh-skin-market', 'state.json') }

/** Keep only stop markers that still name a skin in the same receipt. */
function normalizedStoppedSkinIds(pending: Record<string, unknown>): string[] {
  if (!Array.isArray(pending.stoppedSkinIds) || !Array.isArray(pending.skinIds)) return []
  const known = new Set(pending.skinIds.filter((id): id is string => typeof id === 'string'))
  return [...new Set(pending.stoppedSkinIds.filter((id): id is string => typeof id === 'string' && known.has(id)))]
}

export function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(readFileSync(file, 'utf8')) as T } catch { return fallback }
}

export function atomicWriteJson(file: string, value: unknown): void {
  atomicWriteText(file, `${JSON.stringify(value, null, 2)}\n`)
}

export function atomicWriteText(file: string, value: string): void {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, value)
  renameSync(temporary, file)
}

export function readMarketState(profileDir: string): PersistedMarketState {
  const fallback: PersistedMarketState = { version: 1, activeSkinId: null, disabledSkinIds: [] }
  const value = readJson<PersistedMarketState>(marketStateFile(profileDir), fallback)
  if (value.version !== 1 || !Array.isArray(value.disabledSkinIds)) return fallback
  if (value.pinnedSkinIds !== undefined && !Array.isArray(value.pinnedSkinIds)) delete value.pinnedSkinIds
  // Current enablement is represented by disabledSkinIds. Ignore fields from
  // the removed temporary-retention model during state migration.
  delete (value as PersistedMarketState & { retainedSkinIds?: unknown }).retainedSkinIds
  delete (value as PersistedMarketState & { suppressedPinnedSkinIds?: unknown }).suppressedPinnedSkinIds
  if (value.activity !== undefined && (typeof value.activity !== 'object' || value.activity === null || Array.isArray(value.activity))) delete value.activity
  if (value.artifactAcknowledgements !== undefined) {
    if (!isRecord(value.artifactAcknowledgements)) delete value.artifactAcknowledgements
    else {
      value.artifactAcknowledgements = Object.fromEntries(Object.entries(value.artifactAcknowledgements)
        .filter(([id, context]) => id.length > 0 && typeof context === 'string' && /^[a-f0-9]{64}$/.test(context)))
      if (Object.keys(value.artifactAcknowledgements).length === 0) delete value.artifactAcknowledgements
    }
  }
  if (value.managedCompanions !== undefined) {
    const normalized = normalizeManagedCompanions(value.managedCompanions)
    if (normalized === undefined) delete value.managedCompanions
    else value.managedCompanions = normalized
  }
  if (value.managedLoaders !== undefined) {
    const normalized = normalizeManagedLoaders(value.managedLoaders)
    if (normalized === undefined) delete value.managedLoaders
    else value.managedLoaders = normalized
  }
  if (value.pendingRestart !== undefined) {
    const pending = value.pendingRestart
    if (!isRecord(pending) || !Number.isInteger(pending.pid) || (pending.pid as number) <= 0
      || !Array.isArray(pending.skinIds) || pending.skinIds.some(id => typeof id !== 'string' || id.length === 0)) {
      delete value.pendingRestart
    } else value.pendingRestart = {
      pid: pending.pid as number, skinIds: [...new Set(pending.skinIds as string[])],
      ...(typeof pending.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(pending.id) ? { id: pending.id } : {}),
      ...(isRecord(pending.inferredInstalls) && Object.entries(pending.inferredInstalls).every(([id, hash]) => pending.skinIds.includes(id) && typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash))
        ? { inferredInstalls: { ...pending.inferredInstalls } as Record<string, string> } : {}),
      // Invalid or mixed provenance stays a hard restart receipt. Never make
      // a first-install artifact requirement dismissible by a browser toggle.
      ...(Array.isArray(pending.selectionChanges) && pending.selectionChanges.length > 0
        && pending.selectionChanges.every(id => typeof id === 'string' && pending.skinIds.includes(id)
          && !(isRecord(pending.inferredInstalls) && id in pending.inferredInstalls))
        ? { selectionChanges: [...new Set(pending.selectionChanges as string[])] } : {}),
      ...(isRecord(pending.selectionArtifacts) && Array.isArray(pending.selectionChanges)
        && Object.entries(pending.selectionArtifacts).every(([id, hash]) => pending.skinIds.includes(id)
          && (pending.selectionChanges as string[]).includes(id) && typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)
          && !(isRecord(pending.inferredInstalls) && id in pending.inferredInstalls))
        ? { selectionArtifacts: { ...pending.selectionArtifacts } as Record<string, string> } : {}),
      // A stop receipt may coexist with an install/update artifact proof: the
      // proof says how to verify the build, the stop says restart is no longer
      // needed once the running instance is confirmed gone.
      ...(normalizedStoppedSkinIds(pending).length > 0 ? { stoppedSkinIds: normalizedStoppedSkinIds(pending) } : {}),
    }
  }
  return value
}

function normalizeManagedCompanions(value: unknown): Record<string, ManagedCompanionState> | undefined {
  if (!isRecord(value)) return undefined
  const normalized: Record<string, ManagedCompanionState> = {}
  for (const [packageName, entry] of Object.entries(value)) {
    if (packageName.length === 0) continue
    if (!isRecord(entry) || !Array.isArray(entry.ownerSkinIds)) continue
    const ownerSkinIds = [...new Set(entry.ownerSkinIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    if (ownerSkinIds.length > 0) normalized[packageName] = {
      ownerSkinIds,
      // Missing provenance never grants delete rights. This keeps older or
      // partially written state conservative during migration.
      installedByMarket: typeof entry.installedByMarket === 'boolean' ? entry.installedByMarket : false,
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

function normalizeManagedLoaders(value: unknown): Record<string, ManagedLoaderState> | undefined {
  if (!isRecord(value)) return undefined
  const normalized: Record<string, ManagedLoaderState> = {}
  for (const entry of Object.values(value)) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id.length === 0 || !Array.isArray(entry.ownerSkinIds)) continue
    const ownerSkinIds = [...new Set(entry.ownerSkinIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
    if (ownerSkinIds.length === 0) continue
    normalized[entry.id] = {
      id: entry.id,
      ...(typeof entry.name === 'string' && entry.name.length > 0 ? { name: entry.name } : {}),
      ...(typeof entry.packageName === 'string' && entry.packageName.length > 0 ? { packageName: entry.packageName } : {}),
      ownerSkinIds,
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

export function writeMarketState(profileDir: string, state: PersistedMarketState): void {
  atomicWriteJson(marketStateFile(profileDir), state)
}

interface ProfileManifest {
  dependencies?: Record<string, string>
  dsh?: { profile?: { bundles?: string[] }; bundle?: { patch?: unknown } }
}

export function readDependencies(profileDir: string): Record<string, string> {
  return readJson<ProfileManifest>(manifestFile(profileDir), {}).dependencies ?? {}
}

export function readProfileBundles(profileDir: string): string[] {
  const bundles = readJson<ProfileManifest>(manifestFile(profileDir), {}).dsh?.profile?.bundles
  return Array.isArray(bundles) ? bundles : []
}

/** Remove legacy market-promoted bundles; normal registration preserves bundle layers. */
export function removeProfileBundles(profileDir: string, packageNames: Iterable<string>): void {
  const file = manifestFile(profileDir)
  const manifest = readJson<ProfileManifest>(file, {})
  const bundles = manifest.dsh?.profile?.bundles
  if (!Array.isArray(bundles)) return
  const removed = new Set(packageNames)
  const next = bundles.filter(name => !removed.has(name))
  if (next.length === bundles.length) return
  manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles: next } }
  atomicWriteJson(file, manifest)
}

export function packageDir(profileDir: string, packageName: string): string {
  return join(profileDir, 'node_modules', ...packageName.split('/'))
}

export function compatibilityPatchDir(profileDir: string): string {
  return join(profileDir, '.dsh-skin-market', 'patches')
}

export function compatibilityPatchFile(profileDir: string, packageName: string, version: string): string {
  const safeName = `${packageName}@${version}`.replace(/[^A-Za-z0-9._-]+/g, '_')
  return join(compatibilityPatchDir(profileDir), `${safeName}.patch`)
}

function packageInstalledAt(profileDir: string, packageName: string): string | null {
  try { return statSync(join(packageDir(profileDir, packageName), 'package.json')).mtime.toISOString() } catch { return null }
}

export function packageManifest(profileDir: string, packageName: string): Record<string, unknown> | null {
  const file = join(packageDir(profileDir, packageName), 'package.json')
  if (!existsSync(file)) return null
  return readJson<Record<string, unknown> | null>(file, null)
}

function npmLockfileResolution(profileDir: string, packageName: string, version: string): { integrity: string | null; tarball: string | null } | null {
  const file = pnpmLockfile(profileDir)
  if (!existsSync(file)) return null
  let value: unknown
  try { value = parse(readFileSync(file, 'utf8')) as unknown } catch { return null }
  if (!isRecord(value) || !isRecord(value.packages)) return null
  const packages = value.packages as Record<string, unknown>
  const prefix = `${packageName}@${version}`
  for (const [key, entry] of Object.entries(packages)) {
    if (!(key === prefix || key === `/${prefix}` || key.startsWith(`${prefix}(`) || key.startsWith(`/${prefix}(`) || key.startsWith(`/${prefix}/`))) continue
    if (!isRecord(entry) || !isRecord(entry.resolution)) continue
    return {
      integrity: typeof entry.resolution.integrity === 'string' ? entry.resolution.integrity : null,
      tarball: typeof entry.resolution.tarball === 'string' ? entry.resolution.tarball : null,
    }
  }
  return null
}

function npmLockfileIntegrity(profileDir: string, packageName: string, version: string): string | null {
  return npmLockfileResolution(profileDir, packageName, version)?.integrity ?? null
}

function exactNpmSpecMatches(spec: string | null | undefined, packageName: string, version: string): boolean {
  return spec === version || spec === `${packageName}@${version}` || spec === `npm:${packageName}@${version}`
}

function npmRange(spec: string | undefined, packageName: string): string | null {
  if (spec === undefined) return null
  const range = spec.startsWith(`npm:${packageName}@`) ? spec.slice(`npm:${packageName}@`.length)
    : spec.startsWith(`${packageName}@`) ? spec.slice(`${packageName}@`.length) : spec
  return isVersionRange(range) && range !== 'unverified' ? range : null
}

function npmImporterResolution(profileDir: string, packageName: string): { specifier: string; version: string } | null {
  let lock: unknown
  try { lock = parse(readFileSync(pnpmLockfile(profileDir), 'utf8')) as unknown } catch { return null }
  if (!isRecord(lock) || !isRecord(lock.importers) || !isRecord(lock.importers['.'])) return null
  const importer = lock.importers['.']
  const dependency = isRecord(importer.dependencies) ? importer.dependencies[packageName] : undefined
  if (!isRecord(dependency) || typeof dependency.specifier !== 'string' || typeof dependency.version !== 'string') return null
  return { specifier: dependency.specifier, version: dependency.version }
}

/** Every accepted npm source must resolve through its matching root importer. */
function npmImporterMatches(profileDir: string, packageName: string, spec: string, version: string): boolean {
  const importer = npmImporterResolution(profileDir, packageName)
  if (importer === null || importer.specifier !== spec) return false
  const resolved = importer.version.replace(/\(.*$/, '')
  return exactNpmSpecMatches(resolved, packageName, version)
}

/** pnpm's GitHub archive references include a separate, immutable path selector. */
function githubArchiveSource(source: string): GithubTargetParts | null {
  const match = /^https:\/\/codeload\.github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/tar\.gz\/([0-9a-f]{40})(?:#path:(\/?[A-Za-z0-9_./-]+))?$/i.exec(source)
  if (match === null) return null
  try {
    return { repository: match[1]!, commit: match[2]!.toLowerCase(), ...(match[3] === undefined ? {} : { subpath: normalizeGithubSubpath(match[3]) }) }
  } catch { return null }
}

export function isGithubArtifactSpec(spec: string | null | undefined): boolean {
  return typeof spec === 'string' && (parseGithubTarget(spec) !== null || githubArchiveSource(spec) !== null)
}

function sameGithubSource(left: GithubTargetParts | null, right: GithubTargetParts | null): boolean {
  return left !== null && right !== null && left.repository.toLowerCase() === right.repository.toLowerCase()
    && left.commit === right.commit && left.subpath === right.subpath
}

/** Source identity remains fixed during updates; only the pinned commit may advance. */
export function githubArtifactSourceMatches(skin: SkinEntry, spec: string): boolean {
  const current = parseGithubTarget(spec) ?? githubArchiveSource(spec)
  const expected = parseGithubTarget(skin.install.target)
  return current !== null && expected !== null && current.repository.toLowerCase() === expected.repository.toLowerCase()
    && current.subpath === expected.subpath
}

interface GithubLockfileResolution {
  gitHosted: boolean
  path: string | null
  tarball: string | null
  integrity: string | null
  gitPackageVersion: string | null
}

function githubLockfileResolution(profileDir: string, packageName: string, version: string): GithubLockfileResolution | null {
  let lock: unknown
  try { lock = parse(readFileSync(pnpmLockfile(profileDir), 'utf8')) as unknown } catch { return null }
  if (!isRecord(lock) || !isRecord(lock.packages)) return null
  const resolved = version.replace(/\(.*$/, '')
  const key = `${packageName}@${resolved}`
  const entry = lock.packages[key] ?? lock.packages[`/${key}`]
  if (!isRecord(entry) || !isRecord(entry.resolution)) return null
  return {
    gitHosted: entry.resolution.gitHosted === true,
    path: typeof entry.resolution.path === 'string' ? entry.resolution.path : null,
    tarball: typeof entry.resolution.tarball === 'string' ? entry.resolution.tarball : null,
    integrity: typeof entry.resolution.integrity === 'string' ? entry.resolution.integrity : null,
    gitPackageVersion: typeof entry.version === 'string' ? entry.version : null,
  }
}

/** Validate both the saved source and its actual GitHub root-importer resolution. */
export function validateGithubArtifact(profileDir: string, skin: SkinEntry): { ok: boolean; version?: string; reason?: string; integrityVerified: boolean } {
  const failure = (reason: string) => ({ ok: false, reason, integrityVerified: false })
  const expected = parseGithubTarget(skin.install.target)
  if (expected === null || expected.commit !== skin.install.commit.toLowerCase()
    || expected.repository.toLowerCase() !== repositoryIdentity(skin.repo) || expected.subpath !== skin.subpath) {
    return failure('GitHub 安装来源与市场固定仓库、commit 或子目录不一致')
  }
  const spec = readDependencies(profileDir)[skin.package]
  if (spec === undefined || !sameGithubSource(parseGithubTarget(spec) ?? githubArchiveSource(spec), expected)) {
    return failure('GitHub 已安装来源与市场固定仓库、commit 或子目录不一致')
  }
  const importer = npmImporterResolution(profileDir, skin.package)
  if (importer === null || importer.specifier !== spec
    || !sameGithubSource(githubArchiveSource(importer.version.replace(/\(.*$/, '')), expected)) {
    return failure('GitHub 锁文件 root importer 未解析到固定仓库、commit 和子目录')
  }
  const resolution = githubLockfileResolution(profileDir, skin.package, importer.version)
  let path: string | undefined
  try { path = resolution?.path === null || resolution?.path === undefined ? undefined : normalizeGithubSubpath(resolution.path) } catch {
    return failure('GitHub 锁文件构件子目录无效')
  }
  const archive = resolution?.tarball === null || resolution?.tarball === undefined ? null : githubArchiveSource(resolution.tarball)
  if (resolution === null || !resolution.gitHosted || archive?.subpath !== undefined
    || !sameGithubSource(archive === null ? null : { ...archive, subpath: expected.subpath }, expected)
    || path !== expected.subpath || resolution.gitPackageVersion !== skin.install.version) {
    return failure('GitHub 锁文件构件未匹配固定仓库、commit、子目录和版本')
  }
  const artifact = snapshotInstalledArtifact(profileDir, skin.package)
  if (!artifact.ok || artifact.name !== skin.package || artifact.version !== skin.install.version) {
    return failure('GitHub 未物化预期包版本或声明的可加载入口')
  }
  const validation = validateInstalledSkin(profileDir, skin, { hostKind: 'desktop' })
  if (!validation.ok) return failure(validation.reason ?? 'GitHub 安装构件未通过核验')
  return { ok: true, version: skin.install.version, integrityVerified: false }
}

function validateInstalledNpmSource(profileDir: string, skin: SkinEntry, manifest: Record<string, unknown>): string | null {
  const npm = skin.install.npm
  if (npm === undefined) return null
  // A newly reviewed npm alternative does not change the provenance of an
  // existing GitHub install. Older npm versions also remain updateable; the
  // current artifact's integrity cannot validate a different release.
  const spec = readDependencies(profileDir)[skin.package]
  const exact = exactNpmSpecMatches(spec, npm.name, npm.version)
  const range = npmRange(spec, npm.name)
  if (!exact && range === null) return null
  if (!exact && typeof manifest.version === 'string' && exactNpmSpecMatches(spec, npm.name, manifest.version)) return null
  if (!exact) {
    if (typeof manifest.version !== 'string' || !satisfiesVersionRange(manifest.version, range!)) {
      return `installed npm package ${skin.package} version mismatch; the materialized version does not satisfy its declared source`
    }
    if (!npmImporterMatches(profileDir, skin.package, spec!, manifest.version)) {
      return `installed npm package ${skin.package} lockfile importer mismatch; the declared source is not resolved to its materialized version`
    }
    // The current reviewed SRI cannot validate an older release, but a range
    // resolving to the reviewed release must never bypass that validation.
    if (manifest.version !== npm.version) return null
  }
  const sourceError = reviewedNpmSourceError(skin)
  if (sourceError !== null) return sourceError
  if (manifest.version !== npm.version) {
    return `installed npm package ${skin.package} version mismatch; expected ${npm.version}, found ${String(manifest.version)}`
  }
  const repository = repositoryIdentity(manifest.repository)
  const expectedRepository = repositoryIdentity(npm.repository)
  if (repository === null || repository !== expectedRepository) {
    return `installed npm package ${skin.package} repository mismatch; expected ${npm.repository}`
  }
  // gitHead is registry metadata and may be absent from the packed manifest.
  // If the archive does carry it, it must agree with the reviewed commit too.
  if (manifest.gitHead !== undefined && (typeof manifest.gitHead !== 'string' || manifest.gitHead.toLowerCase() !== npm.gitHead.toLowerCase())) {
    return `installed npm package ${skin.package} gitHead mismatch; expected ${npm.gitHead}`
  }
  const integrity = npmLockfileIntegrity(profileDir, npm.name, npm.version)
  if (integrity !== npm.integrity) {
    return `installed npm package ${skin.package} integrity mismatch; expected the reviewed npm artifact`
  }
  return null
}

export interface InstalledArtifactSnapshot {
  packageName: string
  name: string | null
  version: string | null
  spec: string | null
  ok: boolean
  reason?: string
  files: Array<{ kind: 'host' | 'client' | 'bundle'; path: string; sha256: string }>
  resolution?: { specifier: string; version: string; integrity: string | null; tarball: string | null; gitHosted?: boolean; path?: string | null; gitPackageVersion?: string | null } | null
}

function runtimeExport(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(runtimeExport).find((target): target is string => target !== null) ?? null
  if (!isRecord(value)) return null
  for (const condition of ['node', 'import', 'default', 'require']) {
    const target = runtimeExport(value[condition])
    if (target !== null) return target
  }
  return null
}

/** Inspect only this package's declared executable entries; never import code. */
export function snapshotInstalledArtifact(profileDir: string, packageName: string): InstalledArtifactSnapshot {
  const snapshot: InstalledArtifactSnapshot = { packageName, name: null, version: null, spec: readDependencies(profileDir)[packageName] ?? null, ok: false, files: [] }
  if (!/^(?:@[A-Za-z0-9._~-]+\/)?[A-Za-z0-9._~-]+$/.test(packageName)) {
    snapshot.reason = 'invalid package name'
    return snapshot
  }
  const manifest = packageManifest(profileDir, packageName)
  snapshot.name = typeof manifest?.name === 'string' ? manifest.name : null
  snapshot.version = typeof manifest?.version === 'string' ? manifest.version : null
  if (manifest === null || snapshot.name !== packageName || snapshot.version === null) {
    snapshot.reason = `installed artifact metadata missing or mismatched for ${packageName}`
    return snapshot
  }
  const importer = npmImporterResolution(profileDir, packageName)
  snapshot.resolution = importer === null ? null : { ...importer, integrity: null, tarball: null,
    ...npmLockfileResolution(profileDir, packageName, snapshot.version),
    ...(isGithubArtifactSpec(snapshot.spec) ? githubLockfileResolution(profileDir, packageName, importer.version) : null),
  }
  const directory = resolve(packageDir(profileDir, packageName))
  const add = (kind: 'host' | 'client' | 'bundle', target: string): void => {
    const file = resolve(directory, target)
    // Declared files stay inside the package; secret-shaped targets are never
    // read even when a malformed package declares one as an executable entry.
    if (!file.startsWith(`${directory}${sep}`) || target.split(/[\\/]/).some(part => part === '.env' || part.startsWith('.env.'))) {
      throw new Error(`unsafe ${kind} entry declared by ${packageName}`)
    }
    const physicalDirectory = realpathSync(directory)
    const physicalFile = realpathSync(file)
    if (!physicalFile.startsWith(`${physicalDirectory}${sep}`)
      || physicalFile.split(/[\\/]/).some(part => part === '.env' || part.startsWith('.env.'))
      || !statSync(file).isFile()) throw new Error(`${kind} entry missing for ${packageName}`)
    const sha256 = createHash('sha256').update(readFileSync(file)).digest('hex')
    if (!snapshot.files.some(entry => entry.kind === kind && entry.path === target)) snapshot.files.push({ kind, path: target, sha256 })
  }
  try {
    const exports = manifest.exports
    const host = runtimeExport(isRecord(exports) && Object.keys(exports).some(key => key.startsWith('.')) ? exports['.'] : exports)
      ?? (typeof manifest.main === 'string' ? manifest.main : null)
    if (host !== null) add('host', host)
    const dsh = isRecord(manifest.dsh) ? manifest.dsh : undefined
    if (isRecord(dsh?.client)) {
      const client = runtimeExport(isRecord(exports) ? exports['./client'] : undefined)
      if (client === null) throw new Error(`client export missing for ${packageName}`)
      add('client', client)
    }
    if (isRecord(dsh?.bundle)) {
      const patches = dsh.bundle.patch
      const targets = typeof patches === 'string' ? [patches] : Array.isArray(patches) && patches.every(path => typeof path === 'string') ? patches : null
      if (targets === null) throw new Error(`bundle patch declaration invalid for ${packageName}`)
      for (const target of targets) {
        add('bundle', target)
        if (!Array.isArray(parse(readFileSync(resolve(directory, target), 'utf8'), cordisYamlOptions()))) throw new Error(`bundle patch invalid for ${packageName}`)
      }
    }
    if (snapshot.files.length === 0) throw new Error(`no executable artifact declared by ${packageName}`)
    snapshot.ok = true
  } catch {
    // Do not surface filesystem diagnostics or package-provided paths here.
    snapshot.reason = `declared executable artifact missing or invalid for ${packageName}`
  }
  return snapshot
}

function npmSkinSpec(profileDir: string, skin: SkinEntry): boolean {
  const spec = readDependencies(profileDir)[skin.package]
  if (exactNpmSpecMatches(spec, skin.package, skin.install.version)) return true
  const range = npmRange(spec, skin.package)
  return range !== null && satisfiesVersionRange(skin.install.version, range)
}

/** Metadata uncertainty can be acknowledged; package identity and loadability cannot. */
function skinArtifactWarnings(profileDir: string, skin: SkinEntry, hostKind: MarketHostKind): string[] {
  if (!npmSkinSpec(profileDir, skin)) return []
  const warnings: string[] = []
  const npm = skin.install.npm
  const desktop = hostKind === 'desktop' ? skin.install.desktop : undefined
  const resolution = npmLockfileResolution(profileDir, skin.package, skin.install.version)
  const integrity = resolution?.integrity ?? null
  const sources = [
    ...(desktop?.mode === 'managed' && desktop.integrity !== undefined ? [{ label: 'Desktop', integrity: desktop.integrity }] : []),
    ...(npm === undefined ? [] : [{ label: 'npm', integrity: npm.integrity }]),
  ]
  for (const source of sources) {
    if (integrity !== source.integrity) warnings.push(integrity === null
      ? `${source.label} 安装包缺少可与市场审查记录比对的 SRI，无法确认与已审查构件一致`
      : `${source.label} npm 包完整性与已核验的 SRI 不一致`)
  }
  if (desktop?.mode === 'managed' && desktop.integrity !== undefined && npm !== undefined
    && desktop.packageName === npm.name && desktop.packageVersion === npm.version && desktop.integrity !== npm.integrity) {
    warnings.push('市场 Desktop 与 npm 对同一包版本记录了不同的 SRI，审查元数据存在冲突')
  }
  if (npm !== undefined) {
    const sourceError = reviewedNpmSourceError(skin)
    if (sourceError !== null) warnings.push(sourceError)
    const manifest = packageManifest(profileDir, skin.package)
    if (repositoryIdentity(manifest?.repository) !== repositoryIdentity(npm.repository) || repositoryIdentity(manifest?.repository) === null) {
      warnings.push('安装包 repository 与市场审查仓库不一致或缺失')
    }
    if (manifest?.gitHead !== undefined && (typeof manifest.gitHead !== 'string' || typeof npm.gitHead !== 'string' || manifest.gitHead.toLowerCase() !== npm.gitHead.toLowerCase())) {
      warnings.push('安装包 gitHead 与市场审查 commit 不一致')
    }
  }
  return [...new Set(warnings)]
}

function stableArtifactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableArtifactValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableArtifactValue(value[key])]))
}

/** Return only risks for a complete, correctly resolved, conflict-free skin artifact. */
export function inspectSkinArtifactRisk(profileDir: string, skin: SkinEntry, hostKind: MarketHostKind = 'dsh'): SkinArtifactRisk | undefined {
  const warnings = skinArtifactWarnings(profileDir, skin, hostKind)
  if (warnings.length === 0) return undefined
  const artifact = snapshotInstalledArtifact(profileDir, skin.package)
  if (!artifact.ok || artifact.name !== skin.package || artifact.version !== skin.install.version || !npmSkinSpec(profileDir, skin)) return undefined
  if (artifact.spec === null || !npmImporterMatches(profileDir, skin.package, artifact.spec, skin.install.version)) return undefined
  const npm = skin.install.npm
  const desktop = hostKind === 'desktop' ? skin.install.desktop : undefined
  if (npm === undefined && desktop?.mode !== 'managed') return undefined
  if (npm !== undefined && (npm.name !== skin.package || npm.version !== skin.install.version)) return undefined
  if (desktop?.mode === 'managed' && (desktop.packageName !== skin.package || desktop.packageVersion !== skin.install.version)) return undefined
  const manifest = packageManifest(profileDir, skin.package)
  const dsh = isRecord(manifest?.dsh) ? manifest.dsh : undefined
  if (!isRecord(dsh?.client) || (dsh.client.platform !== undefined && dsh.client.platform !== 'web')) return undefined
  try {
    bundlePatchOperations(profileDir, skin.package)
    assertNoLoaderConflicts(profileDir, skin, undefined, { hostKind })
  } catch { return undefined }
  // The receipt covers the host's reviewed targets, actual manifest metadata, lock
  // resolution and declared executable bytes. It is never a version exemption.
  const { desktop: desktopTarget, ...webInstall } = skin.install
  const context = createHash('sha256').update(JSON.stringify(stableArtifactValue({
    contract: 'skin-artifact-risk-v1',
    hostKind,
    reviewed: { id: skin.id, package: skin.package, rowId: skin.rowId, repo: skin.repo, subpath: skin.subpath,
      install: hostKind === 'desktop' ? { ...webInstall, desktop: desktopTarget } : webInstall,
      compatibility: skin.compatibility },
    artifact, manifest, warnings,
  }))).digest('hex')
  return { context, packageName: skin.package, version: skin.install.version, warnings }
}

function artifactRiskAcknowledged(profileDir: string, skin: SkinEntry, risk: SkinArtifactRisk | undefined): boolean {
  return risk !== undefined && readMarketState(profileDir).artifactAcknowledgements?.[skin.id] === risk.context
}

export function isSkinArtifactRiskAcknowledged(profileDir: string, skin: SkinEntry, hostKind: MarketHostKind = 'dsh'): boolean {
  return artifactRiskAcknowledged(profileDir, skin, inspectSkinArtifactRisk(profileDir, skin, hostKind))
}

/** Recompute immediately before persisting; stale or structurally invalid targets never gain consent. */
export function acknowledgeSkinArtifactRisk(profileDir: string, skin: SkinEntry, context: string, hostKind: MarketHostKind = 'dsh'): boolean {
  const risk = inspectSkinArtifactRisk(profileDir, skin, hostKind)
  if (risk === undefined || risk.context !== context) return false
  const state = readMarketState(profileDir)
  state.artifactAcknowledgements = { ...state.artifactAcknowledgements, [skin.id]: risk.context }
  writeMarketState(profileDir, state)
  return true
}

/** Compare recovery to the installed release before the operation, not today's catalog. */
export function compareInstalledArtifact(profileDir: string, baseline: InstalledArtifactSnapshot): { ok: boolean; reason?: string; artifact: InstalledArtifactSnapshot } {
  const artifact = snapshotInstalledArtifact(profileDir, baseline.packageName)
  if (!baseline.ok) return { ok: false, reason: 'the pre-operation artifact was not verifiable', artifact }
  if (!artifact.ok) return { ok: false, reason: artifact.reason, artifact }
  if (artifact.name !== baseline.name || artifact.version !== baseline.version || artifact.spec !== baseline.spec) {
    return { ok: false, reason: 'the recovered package identity or source differs from the pre-operation artifact', artifact }
  }
  if (JSON.stringify(artifact.resolution) !== JSON.stringify(baseline.resolution)) {
    return { ok: false, reason: 'the recovered lockfile resolution differs from the pre-operation artifact', artifact }
  }
  if (JSON.stringify(artifact.files) !== JSON.stringify(baseline.files)) {
    return { ok: false, reason: 'the recovered executable entries differ from the pre-operation artifact', artifact }
  }
  return { ok: true, artifact }
}

/** Hint when a GitHub subdirectory install may have lost `&path:` in shell/cmd. */
function pathSelectorTruncationHint(skin: SkinEntry): string {
  if (!skin.install.target.includes('&path:')) return ''
  return '。检测到含 &path: 的子目录选择器在安装过程中可能被截断（argv 不完整），因而装上了仓库根包而非目录子包；请确认 pnpm 以真实二进制、shell:false 收到完整目标后重试'
}

export interface SkinArtifactValidationOptions {
  /** Installation may retain a usable artifact; selecting it still requires exact user consent. */
  allowArtifactRisk?: true
  hostKind?: MarketHostKind
}

export function validateInstalledSkin(profileDir: string, skin: SkinEntry, options: SkinArtifactValidationOptions = {}): { ok: boolean; reason?: string; version?: string; repairable?: boolean } {
  const hint = pathSelectorTruncationHint(skin)
  const manifest = packageManifest(profileDir, skin.package)
  if (manifest === null) return {
    ok: false,
    repairable: true,
    reason: `installed package manifest missing for ${skin.package}; the plugin command returned without materializing the reviewed package${hint}`,
  }
  const manifestName = typeof manifest.name === 'string' ? manifest.name : undefined
  if (manifestName === undefined) return { ok: false, reason: `installed package name missing; expected ${skin.package}${hint}` }
  if (manifestName !== skin.package) return {
    ok: false,
    reason: `installed package name mismatch; expected ${skin.package}, found ${manifestName}${hint}`,
  }
  const version = typeof manifest.version === 'string' ? manifest.version : undefined
  if (version === undefined) return { ok: false, reason: `installed package version missing for ${skin.package}` }
  const dsh = isRecord(manifest.dsh) ? manifest.dsh : undefined
  const client = dsh !== undefined && isRecord(dsh.client) ? dsh.client : undefined
  if (client === undefined) return { ok: false, reason: `dsh client manifest missing in ${skin.package}` }
  if (client.platform !== undefined && client.platform !== 'web') return {
    ok: false,
    reason: `installed package ${skin.package} is not a web client (platform: ${String(client.platform)})`,
  }
  try {
    // Validate bundle metadata and its patch before writing profile overrides.
    // Client-only packages legitimately return null here.
    bundlePatchOperations(profileDir, skin.package)
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
  const npmError = validateInstalledNpmSource(profileDir, skin, manifest)
  const warnings = skinArtifactWarnings(profileDir, skin, options.hostKind ?? 'dsh')
  if (npmError !== null || warnings.length > 0) {
    const risk = inspectSkinArtifactRisk(profileDir, skin, options.hostKind)
    if (!(risk !== undefined && options.allowArtifactRisk === true) && !artifactRiskAcknowledged(profileDir, skin, risk)) return { ok: false, reason: npmError ?? warnings[0] }
  }
  return { ok: true, version }
}

export function installedSpecMatches(skin: SkinEntry, spec: string | null | undefined): boolean {
  if (typeof spec !== 'string' || spec.length === 0) return false
  if (spec.includes(skin.install.commit)) return true
  const npm = skin.install.npm
  if (npm !== undefined && exactNpmSpecMatches(spec, npm.name, npm.version)) return true
  const desktop = skin.install.desktop
  return desktop?.mode === 'managed' && exactNpmSpecMatches(spec, desktop.packageName, desktop.packageVersion)
}

/** A manager-written npm range is accepted only through its installed resolution. */
export function reviewedInstalledSpecMatches(profileDir: string, skin: SkinEntry, spec: string | null | undefined, options: SkinArtifactValidationOptions = {}): boolean {
  if (options.hostKind === 'desktop' && isGithubArtifactSpec(spec)) {
    return readDependencies(profileDir)[skin.package] === spec && validateGithubArtifact(profileDir, skin).ok
  }
  if (installedSpecMatches(skin, spec)) {
    return !npmSkinSpec(profileDir, skin) || validateInstalledSkin(profileDir, skin, options).ok
  }
  if (typeof spec !== 'string' || readDependencies(profileDir)[skin.package] !== spec) return false
  const manifest = packageManifest(profileDir, skin.package)
  const npm = skin.install.npm
  if (manifest?.name === skin.package && npm !== undefined && manifest.version === npm.version && npmRange(spec, npm.name) !== null) {
    return npmImporterMatches(profileDir, skin.package, spec, npm.version) && validateInstalledSkin(profileDir, skin, options).ok
  }
  return skin.install.desktop?.mode === 'managed' && validateDesktopArtifact(profileDir, skin, options).ok
}

export interface NpmArtifactSource {
  name: string
  version: string
  integrity?: string
  gitHead?: string
  tarball?: string
}

/** Validate materialized npm entries and the root lock contract without importing code. */
export function validateNpmArtifact(profileDir: string, source: NpmArtifactSource): { ok: boolean; version?: string; reason?: string; integrityVerified: boolean } {
  const failure = (reason: string) => ({ ok: false, reason, integrityVerified: false })
  const artifact = snapshotInstalledArtifact(profileDir, source.name)
  if (!artifact.ok || artifact.name !== source.name || artifact.version !== source.version) {
    return failure('npm 未物化预期包版本或声明的可加载入口')
  }
  const spec = artifact.spec
  if (!exactNpmSpecMatches(spec, source.name, source.version)) {
    const range = npmRange(spec ?? undefined, source.name)
    if (range === null || !satisfiesVersionRange(source.version, range)) {
      return failure('npm 包来源与预期包版本不一致')
    }
  }
  if (spec === null || !npmImporterMatches(profileDir, source.name, spec, source.version)) {
    return failure('npm 包来源与锁文件 root importer 实际解析版本不一致')
  }
  const resolution = npmLockfileResolution(profileDir, source.name, source.version)
  if (source.integrity !== undefined && resolution?.integrity !== source.integrity) {
    return failure('npm 包完整性与已核验的 SRI 不一致')
  }
  if (source.tarball !== undefined && resolution?.tarball !== null && resolution?.tarball !== undefined && resolution.tarball !== source.tarball) {
    return failure('npm 锁文件下载地址与已核验构件不一致')
  }
  const manifest = packageManifest(profileDir, source.name)
  if (source.gitHead !== undefined && manifest?.gitHead !== undefined
    && (typeof manifest.gitHead !== 'string' || manifest.gitHead.toLowerCase() !== source.gitHead.toLowerCase())) {
    return failure('npm 包 gitHead 与已核验构件不一致')
  }
  return { ok: true, version: source.version, integrityVerified: source.integrity !== undefined }
}

/** Validate the installed Desktop source without inventing missing npm provenance. */
export function validateDesktopArtifact(profileDir: string, skin: SkinEntry, options: SkinArtifactValidationOptions = {}): { ok: boolean; version?: string; reason?: string; integrityVerified: boolean } {
  if (isGithubArtifactSpec(readDependencies(profileDir)[skin.package])) return validateGithubArtifact(profileDir, skin)
  const capability = skin.install.desktop
  if (capability?.mode !== 'managed' || capability.packageName !== skin.package || capability.packageVersion !== skin.install.version) {
    return { ok: false, reason: 'Desktop 安装元数据与市场固定包或版本不一致', integrityVerified: false }
  }
  const validation = validateNpmArtifact(profileDir, { name: capability.packageName, version: capability.packageVersion, ...(capability.integrity === undefined ? {} : { integrity: capability.integrity }) })
  const warnings = skinArtifactWarnings(profileDir, skin, 'desktop')
  if (!validation.ok || warnings.length > 0) {
    const risk = inspectSkinArtifactRisk(profileDir, skin, 'desktop')
    if (risk !== undefined && (options.allowArtifactRisk === true || artifactRiskAcknowledged(profileDir, skin, risk))) return { ok: true, version: capability.packageVersion, integrityVerified: false }
    if (validation.ok && warnings.length > 0) return { ok: false, reason: warnings[0], integrityVerified: false }
  }
  return validation
}

function isLocalMigrationSource(source: string): boolean {
  const prefixed = /^(?:file|link):(.+)$/.exec(source)
  if (prefixed !== null) return prefixed[1].trim().length > 0 && !/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(prefixed[1])
  return /^(?:\/(?!\/)|\.\.?[\\/]|~[\\/]|[A-Za-z]:[\\/])/.test(source)
}

function comparableMigrationVersion(version: string): boolean {
  const parsed = parseVersion(version)
  if (parsed === null || version.trim() !== version || !parsed.core.every(Number.isSafeInteger)) return false
  if (!version.split(/[+-]/, 1)[0].split('.').every(part => /^(?:0|[1-9]\d*)$/.test(part))) return false
  if (parsed.prerelease.some(part => part === '' || /^\d+$/.test(part) && (!/^(?:0|[1-9]\d*)$/.test(part) || !Number.isSafeInteger(Number(part))))) return false
  return version.split('+')[1]?.split('.').every(part => part !== '') !== false
}

function localNpmSourceMigration(profileDir: string, skin: SkinEntry, currentSource: string): SkinSourceMigration | undefined {
  if (skin.review?.installation !== 'verified' || (skin.install.companions?.length ?? 0) > 0) return undefined
  const manifest = packageManifest(profileDir, skin.package)
  const repository = repositoryIdentity(skin.repo)
  if (manifest?.name !== skin.package || repository === null || repositoryIdentity(manifest.repository) !== repository) return undefined
  const artifact = snapshotInstalledArtifact(profileDir, skin.package)
  if (!artifact.ok || artifact.spec !== currentSource || artifact.version === null
    || !comparableMigrationVersion(artifact.version) || !comparableMigrationVersion(skin.install.version)) return undefined
  const validation = validateInstalledSkin(profileDir, skin)
  if (!validation.ok) return undefined
  try {
    assertNoLoaderConflicts(profileDir, skin)
    const lockfile = pnpmLockfile(profileDir)
    const lockfileHash = existsSync(lockfile) ? createHash('sha256').update(readFileSync(lockfile)).digest('hex') : null
    const context = createHash('sha256').update(JSON.stringify(stableArtifactValue({
      contract: 'local-skin-source-migration-v1',
      artifact, manifest, lockfileHash,
      reviewed: { id: skin.id, package: skin.package, repo: skin.repo, rowId: skin.rowId, subpath: skin.subpath, install: skin.install, review: skin.review, compatibility: skin.compatibility },
    }))).digest('hex')
    return {
      target: npmInstallTarget(skin)!, currentSource, kind: 'local', currentVersion: artifact.version,
      targetVersion: skin.install.version, context, downgrade: compareVersions(skin.install.version, artifact.version) < 0,
    }
  } catch { return undefined }
}

/** Explicitly replace a verified local source, or migrate the same reviewed GitHub/npm release. */
export function npmSourceMigration(profileDir: string, skin: SkinEntry): SkinSourceMigration | undefined {
  if (skin.review?.installation === 'manual-only' || reviewedNpmSourceError(skin) !== null) return undefined
  const currentSource = readDependencies(profileDir)[skin.package]
  if (currentSource === undefined) return undefined
  if (isLocalMigrationSource(currentSource)) return localNpmSourceMigration(profileDir, skin, currentSource)
  const current = parseGithubTarget(currentSource)
  const reviewed = parseGithubTarget(skin.install.target)
  if (current === null || reviewed === null
    || current.repository.toLowerCase() !== reviewed.repository.toLowerCase()
    || current.repository.toLowerCase() !== repositoryIdentity(skin.repo)
    || current.commit !== reviewed.commit || current.commit !== skin.install.commit.toLowerCase()
    || current.subpath !== reviewed.subpath || current.subpath !== skin.subpath) return undefined
  const validation = validateInstalledSkin(profileDir, skin)
  if (!validation.ok || validation.version !== skin.install.npm?.version) return undefined
  return { target: npmInstallTarget(skin)!, currentSource }
}

/**
 * Package names are not enough to prove that a dependency belongs to a market
 * entry. GitHub installs must stay in the reviewed repository/subpath family;
 * npm and confirmed local replacements use their existing package provenance.
 */
export function installedSkinSourceMatches(profileDir: string, skin: SkinEntry): boolean {
  const spec = readDependencies(profileDir)[skin.package]
  if (typeof spec !== 'string' || spec.trim() === '') return false
  if (isGithubArtifactSpec(spec)) return githubArtifactSourceMatches(skin, spec)
  // Keep synthetic/legacy GitHub specs usable in migration paths even when a
  // fixture or old profile has a non-40-character placeholder commit. Real
  // immutable specs take the stricter branch above.
  if (/^github:/i.test(spec)) {
    const repository = /^github:([^#&]+)/i.exec(spec)?.[1]
    const expected = /^github:([^#&]+)/i.exec(skin.install.target)?.[1]?.toLowerCase() ?? repositoryIdentity(skin.repo)
    return repository !== undefined && expected !== null && repository.toLowerCase() === expected
  }
  if (isLocalMigrationSource(spec)) {
    const manifest = packageManifest(profileDir, skin.package)
    const repository = repositoryIdentity(skin.repo)
    return manifest?.name === skin.package && repository !== null && repositoryIdentity(manifest.repository) === repository
  }
  if (npmRange(spec, skin.package) !== null) {
    // An npm dependency spec identifies the package-level source family. Keep
    // broken materialized artifacts visible for repair; validateInstalledSkin
    // remains responsible for version, repository, integrity and loader checks
    // before any package is used or updated.
    if (skin.install.npm !== undefined) return true
    return reviewedInstalledSpecMatches(profileDir, skin, spec, { allowArtifactRisk: true })
  }
  return npmSourceMigration(profileDir, skin) !== undefined
}

export function companionNeedsInstall(profileDir: string, companion: { package: string; commit: string }): boolean {
  const spec = readDependencies(profileDir)[companion.package]
  return typeof spec !== 'string' || !spec.includes(companion.commit)
}

export function companionsNeedInstall(profileDir: string, skin: SkinEntry): boolean {
  const dependencies = readDependencies(profileDir)
  const state = readMarketState(profileDir)
  return (skin.install.companions ?? []).some(companion => {
    // A package that predates market provenance is external. It must not make
    // the parent look updateable when the market cannot safely update it.
    if (dependencies[companion.package] !== undefined && state.managedCompanions?.[companion.package] === undefined) return false
    return companionNeedsInstall(profileDir, companion)
  })
}

export { effectiveBuildApprovalKey }

interface PatchOperation { insert?: unknown[]; [key: string]: unknown }
interface PatchRow { id?: unknown; name?: unknown; disabled?: unknown; [key: string]: unknown }

export interface PackageLoaderOwnership {
  packageName: string
  hasBundle: boolean
  rows: LoaderIdentity[]
}

export class InstallConflictError extends Error {
  constructor(readonly conflicts: InstallConflict[]) {
    super(`发现插件安装冲突：${conflicts.map(conflict => `${conflict.kind} ${conflict.incoming} 与 ${conflict.existing} 冲突（loader: ${conflict.identifiers.join('、')}）`).join('；')}`)
    this.name = 'InstallConflictError'
  }
}

export class LoaderMetadataError extends Error {
  constructor(message: string) {
    super(`市场目录元数据与包实际声明不一致：${message}`)
    this.name = 'LoaderMetadataError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function patchOperations(profileDir: string): PatchOperation[] {
  const file = profilePatchFile(profileDir)
  if (!existsSync(file)) return []
  const value = parse(readFileSync(file, 'utf8'), cordisYamlOptions()) as unknown
  if (!Array.isArray(value)) throw new Error('profile cordis.patch.yml must contain a YAML sequence')
  return value as PatchOperation[]
}

interface ProfilePatch {
  document: Document
  operations: YAMLSeq
  original: string | null
  aliases: Map<Alias, Node | undefined>
}

function unsafeProfilePatch(): never {
  throw new Error('profile cordis.patch.yml contains a dynamic or shared loader structure; edit the target manually')
}

/** Loader identity must be literal. Plugin configuration remains opaque. */
function patchRow(value: unknown): YAMLMap {
  if (!isMap(value) || value.tag !== undefined) return unsafeProfilePatch()
  for (const pair of value.items) {
    if (!isScalar(pair.key) || typeof pair.key.value !== 'string'
      || pair.key.tag !== undefined || pair.key.value === '<<') return unsafeProfilePatch()
  }
  for (const key of ['id', 'name']) {
    const field = value.get(key, true)
    if (field !== undefined && (!isScalar(field) || typeof field.value !== 'string'
      || field.tag !== undefined && field.tag !== 'tag:yaml.org,2002:str')) return unsafeProfilePatch()
  }
  return value
}

function insertedRows(row: YAMLMap): YAMLSeq | undefined {
  const insert = row.get('insert', true)
  if (insert === undefined) return undefined
  if (!isSeq(insert) || insert.tag !== undefined) return unsafeProfilePatch()
  return insert
}

function editablePatch(profileDir: string): ProfilePatch {
  const file = profilePatchFile(profileDir)
  const exists = existsSync(file)
  const document = parseDocument(exists ? readFileSync(file, 'utf8') : '[]\n', { keepSourceTokens: true, ...cordisYamlOptions() })
  if (document.errors.length > 0 || document.warnings.length > 0 || !isSeq(document.contents)
    || document.contents.tag !== undefined || document.contents.anchor !== undefined) return unsafeProfilePatch()
  const validateRows = (sequence: YAMLSeq): void => {
    for (const value of sequence.items) {
      const children = insertedRows(patchRow(value))
      if (children !== undefined) validateRows(children)
    }
  }
  validateRows(document.contents)
  const aliases = new Map<Alias, Node | undefined>()
  visit(document, (_key, node) => { if (isAlias(node)) aliases.set(node, node.resolve(document)) })
  return { document, operations: document.contents, original: exists ? document.toString({ lineWidth: 0 }) : null, aliases }
}

/** Keep the original nodes: converting through JS would erase !!js, comments and anchors. */
function writePatchOperations(profileDir: string, patch: ProfilePatch): void {
  // Duplicate anchor names are legal. A retained alias must still resolve to the
  // same node, not silently fall back to an earlier same-named anchor after removal.
  visit(patch.document, (_key, node) => {
    if (isAlias(node) && node.resolve(patch.document) !== patch.aliases.get(node)) unsafeProfilePatch()
  })
  const contents = patch.document.toString({ lineWidth: 0 })
  if (contents !== patch.original) atomicWriteText(profilePatchFile(profileDir), contents)
}

function assertWritablePatchRow(row: YAMLMap): void {
  const disabled = row.get('disabled', true)
  if (row.anchor !== undefined || disabled !== undefined && (!isScalar(disabled)
    || typeof disabled.value !== 'boolean' || disabled.anchor !== undefined
    || disabled.tag !== undefined && disabled.tag !== 'tag:yaml.org,2002:bool')) unsafeProfilePatch()
}

function packageManifestAt(packageDirectory: string): Record<string, unknown> | null {
  return readJson<Record<string, unknown> | null>(join(packageDirectory, 'package.json'), null)
}

function packageDependencyNames(manifest: Record<string, unknown>): string[] {
  const names = new Set<string>()
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    const dependencies = manifest[field]
    if (!isRecord(dependencies)) continue
    for (const name of Object.keys(dependencies)) names.add(name)
  }
  return [...names]
}

function packageDirectoryFor(profileDir: string, parentDirectory: string, packageName: string): string {
  const nested = join(parentDirectory, 'node_modules', ...packageName.split('/'))
  return existsSync(join(nested, 'package.json')) ? nested : packageDir(profileDir, packageName)
}

export function packageLoaderOwnershipAt(packageDirectory: string, packageName: string): PackageLoaderOwnership {
  const bundle = bundlePatchOperationsAt(packageDirectory, packageName)
  return {
    packageName,
    hasBundle: bundle !== null,
    rows: bundle === null ? [] : bundle.flatMap(operation => parseInsertedLoaderRows(operation, packageName)),
  }
}

export function packageLoaderIdentities(profileDir: string, packageName: string): LoaderIdentity[] {
  return packageLoaderOwnershipAt(packageDir(profileDir, packageName), packageName).rows
}

function collectInstalledPackageLoaderIdentities(profileDir: string, packageName: string, seen: Set<string>, rows: LoaderIdentity[], parentDirectory?: string): void {
  if (seen.has(packageName)) return
  seen.add(packageName)
  const directory = parentDirectory === undefined ? packageDir(profileDir, packageName) : packageDirectoryFor(profileDir, parentDirectory, packageName)
  const manifest = packageManifestAt(directory)
  if (manifest === null) return
  rows.push(...packageLoaderOwnershipAt(directory, packageName).rows)
  for (const dependency of packageDependencyNames(manifest)) {
    collectInstalledPackageLoaderIdentities(profileDir, dependency, seen, rows, directory)
  }
}

export function installedLoaderIdentities(profileDir: string, excludePackage?: string, excludedRootPackages: readonly string[] = []): LoaderIdentity[] {
  const rows = patchOperations(profileDir).flatMap(operation => parseInsertedLoaderRows(operation))
  const seen = new Set<string>()
  for (const packageName of Object.keys(readDependencies(profileDir))) {
    // Withdrawing a root bundle does not remove rows introduced through a
    // different dependency or through the user's profile patch.
    if (packageName === excludePackage || excludedRootPackages.includes(packageName)) continue
    collectInstalledPackageLoaderIdentities(profileDir, packageName, seen, rows)
  }
  return rows
}

const REVIEWED_DESKTOP_LEGACY_PACKAGES = [{
  skinId: 'king-of-soy-sauce.liang-intensity',
  packageName: '@leon___/dsh-client-liang-intensity-skin',
  repository: 'kingofsoysauce/dsh-liang-skin',
  rowId: 'liang-intensity-skin',
  legacyPackage: 'dsh-client-liang-intensity-skin',
}] as const

function singleSkinBundleRow(directory: string, packageName: string, rowId: string): Record<string, unknown> | null {
  const operations = bundlePatchOperationsAt(directory, packageName)
  if (operations?.length !== 1) return null
  const operation = operations[0]
  if (!isRecord(operation) || Object.keys(operation).some(key => key !== 'insert')
    || !Array.isArray(operation.insert) || operation.insert.length !== 1) return null
  const row = operation.insert[0]
  // Withdrawing this bundle must affect this skin alone. Its own config
  // and enabled flag are retained, but global patches and nested rows are
  // outside the reviewed package-rename contract.
  return isRecord(row) && row.id === rowId && row.name === packageName
    && Object.keys(row).every(key => ['id', 'name', 'config', 'disabled'].includes(key))
    && (row.disabled === undefined || typeof row.disabled === 'boolean') ? row : null
}

/** Root bundles whose reviewed predecessor can be withdrawn before selection. */
export function verifiedDesktopLegacyPackages(profileDir: string, skin: SkinEntry): string[] {
  const dependencies = readDependencies(profileDir)
  return REVIEWED_DESKTOP_LEGACY_PACKAGES.filter(alias => {
    if (skin.id !== alias.skinId || skin.package !== alias.packageName || skin.rowId !== alias.rowId
      || repositoryIdentity(skin.repo) !== alias.repository || dependencies[alias.legacyPackage] === undefined) return false
    const directory = packageDir(profileDir, alias.legacyPackage)
    const manifest = packageManifestAt(directory)
    if (manifest?.name !== alias.legacyPackage || repositoryIdentity(manifest.repository) !== alias.repository) return false
    try {
      return singleSkinBundleRow(directory, alias.legacyPackage, alias.rowId) !== null
    } catch { return false }
  }).map(alias => alias.legacyPackage)
}

/** Whether selecting the replacement alone will enable its sole component on restart. */
export function desktopLegacyReplacementEnabled(profileDir: string, skin: SkinEntry): boolean {
  if (verifiedDesktopLegacyPackages(profileDir, skin).length === 0) return false
  const directory = packageDir(profileDir, skin.package)
  if (packageManifestAt(directory)?.name !== skin.package) return false
  try {
    const row = singleSkinBundleRow(directory, skin.package, skin.rowId)
    const profileCollision = (value: unknown): boolean => {
      if (Array.isArray(value)) return value.some(profileCollision)
      if (!isRecord(value)) return false
      const identity = { id: typeof value.id === 'string' ? value.id : undefined, name: typeof value.name === 'string' ? value.name : undefined }
      if (sharedLoaderIdentifiers(identity, { id: skin.rowId, name: skin.package }).length > 0) return true
      // `config` contains loader rows only for a group. Ordinary plugin
      // configuration is opaque even when it has fields named id or name.
      return profileCollision(value.insert) || value.group === true && profileCollision(value.config)
    }
    return row !== null && row.disabled !== true && !profileCollision(patchOperations(profileDir))
  } catch { return false }
}

export interface LoaderConflictOptions { hostKind?: MarketHostKind }

function packageLoaderMetadata(profileDir: string, skin: SkinEntry): PackageLoaderOwnership {
  return packageLoaderOwnershipAt(packageDir(profileDir, skin.package), skin.package)
}

export function assertLoaderMetadata(profileDir: string, skin: SkinEntry): void {
  const ownership = packageLoaderMetadata(profileDir, skin)
  if (!ownership.hasBundle) return
  const candidates = primaryLoaderCandidates(ownership.rows, skin.package)
  if (candidates.length === 0) {
    throw new LoaderMetadataError(`${skin.package} 的 bundle patch 没有 name=${skin.package} 的主 loader；目录 rowId=${skin.rowId}`)
  }
  if (candidates.length > 1) {
    throw new LoaderMetadataError(`${skin.package} 的 bundle patch 声明了多个主 loader：${candidates.map(row => row.id ?? '(缺少 id)').join('、')}`)
  }
  const actualId = candidates[0].id
  if (actualId === undefined) {
    throw new LoaderMetadataError(`${skin.package} 的主 loader 缺少 id；目录 rowId=${skin.rowId}`)
  }
  if (actualId !== skin.rowId) {
    throw new LoaderMetadataError(`${skin.package} 的目录 rowId=${skin.rowId}，实际主 loader id=${actualId}`)
  }
}

export function assertNoLoaderConflicts(profileDir: string, skin: SkinEntry, incomingRows?: readonly LoaderIdentity[], options: LoaderConflictOptions = {}): void {
  assertLoaderMetadata(profileDir, skin)
  const ownership = packageLoaderMetadata(profileDir, skin)
  const incoming = incomingRows === undefined ? packageLoaderIdentities(profileDir, skin.package) : [...incomingRows]
  if (incoming.length === 0 && !ownership.hasBundle) {
    incoming.push({ id: skin.rowId, name: skin.package, packageName: skin.package })
  }
  assertNoKnownLoaderConflicts(profileDir, skin, incoming, options)
}

/** Check known incoming identities before replacing an installed artifact. */
export function assertNoKnownLoaderConflicts(profileDir: string, skin: SkinEntry, incoming: readonly LoaderIdentity[], options: LoaderConflictOptions = {}): void {
  const legacyPackages = options.hostKind === 'desktop' ? verifiedDesktopLegacyPackages(profileDir, skin) : []
  const existing = installedLoaderIdentities(profileDir, skin.package, legacyPackages)
  const conflicts: InstallConflict[] = []
  for (const incomingRow of incoming) {
    for (const existingRow of existing) {
      const identifiers = sharedLoaderIdentifiers(incomingRow, existingRow)
      if (identifiers.length === 0) continue
      if (incomingRow.packageName !== undefined && incomingRow.packageName === existingRow.packageName) continue
      if (existingRow.packageName === undefined && incomingRow.packageName === skin.package && existingRow.id === skin.rowId) continue
      conflicts.push({
        kind: 'loader',
        incoming: incomingRow.packageName ?? incomingRow.name ?? skin.package,
        existing: existingRow.packageName ?? existingRow.name ?? existingRow.id ?? 'unknown loader',
        identifiers,
      })
    }
  }
  const unique = conflicts.filter((conflict, index) => conflicts.findIndex(item => JSON.stringify(item) === JSON.stringify(conflict)) === index)
  if (unique.length > 0) throw new InstallConflictError(unique)
}

function bundlePatchOperationsAt(packageDirectory: string, packageName: string): PatchOperation[] | null {
  const manifest = packageManifestAt(packageDirectory)
  const dsh = isRecord(manifest?.dsh) ? manifest.dsh : undefined
  if (dsh?.bundle === undefined) return null
  const declaration = isRecord(dsh.bundle) ? dsh.bundle.patch : undefined
  const targets = typeof declaration === 'string' ? [declaration]
    : Array.isArray(declaration) && declaration.every(path => typeof path === 'string') ? declaration : null
  if (targets === null) {
    throw new Error(`${packageName} declares dsh.bundle without a valid patch path`)
  }
  const directory = resolve(packageDirectory)
  return targets.flatMap(target => {
    const file = resolve(directory, target)
    if (!file.startsWith(`${directory}${sep}`) || target.split(/[\\/]/).some(part => part === '.env' || part.startsWith('.env.'))) {
      throw new Error(`${packageName} bundle patch path is unsafe`)
    }
    if (!existsSync(file)) throw new Error(`${packageName} bundle patch is missing: ${target}`)
    const physicalFile = realpathSync(file)
    if (!physicalFile.startsWith(`${realpathSync(directory)}${sep}`)
      || physicalFile.split(/[\\/]/).some(part => part === '.env' || part.startsWith('.env.'))) throw new Error(`${packageName} bundle patch path is unsafe`)
    const value = parse(readFileSync(file, 'utf8'), cordisYamlOptions()) as unknown
    if (!Array.isArray(value)) throw new Error(`${packageName} cordis.patch.yml must contain a YAML sequence`)
    return value as PatchOperation[]
  })
}

function bundlePatchOperations(profileDir: string, packageName: string): PatchOperation[] | null {
  return bundlePatchOperationsAt(packageDir(profileDir, packageName), packageName)
}

function registrationMatches(row: PatchRow, skin: SkinEntry): boolean {
  return row.id === skin.rowId || row.name === skin.package
}

function assertRegistrationMatches(row: PatchRow, skin: SkinEntry): void {
  if (row.id !== skin.rowId || row.name !== skin.package) {
    throw new Error(`loader registration conflicts with ${String(row.id ?? row.name)}`)
  }
}

function declaredBundleRows(value: unknown, skin: SkinEntry, rows: PatchRow[] = []): PatchRow[] {
  if (!isRecord(value)) return rows
  const row = value as PatchRow
  if (registrationMatches(row, skin)) rows.push(row)
  if (Array.isArray(value.insert)) {
    for (const child of value.insert) declaredBundleRows(child, skin, rows)
  }
  return rows
}

function patchRegistration(row: YAMLMap): PatchRow {
  return { id: row.get('id'), name: row.get('name') }
}

function removeInsertedRows(sequence: YAMLSeq, skin: SkinEntry, shared = false): void {
  shared ||= sequence.anchor !== undefined
  sequence.items = sequence.items.filter(value => {
    const row = patchRow(value)
    if (registrationMatches(patchRegistration(row), skin)) {
      assertRegistrationMatches(patchRegistration(row), skin)
      if (shared) unsafeProfilePatch()
      assertWritablePatchRow(row)
      return false
    }
    const children = insertedRows(row)
    if (children !== undefined) removeInsertedRows(children, skin, shared || row.anchor !== undefined)
    return true
  })
}

function removeProfileInsertedRows(operations: YAMLSeq, skin: SkinEntry): void {
  for (const operation of operations.items) {
    const row = patchRow(operation)
    const children = insertedRows(row)
    if (children !== undefined) removeInsertedRows(children, skin, row.anchor !== undefined)
  }
}

function removeEmptyInsertOperations(operations: YAMLSeq): void {
  operations.items = operations.items.filter(operation => {
    const row = patchRow(operation)
    const children = insertedRows(row)
    // A rich operation can carry unrelated overrides even after its last insert is removed.
    return children === undefined || children.items.length > 0 || row.items.length > 1
      || row.anchor !== undefined || children.anchor !== undefined
  })
}

function ensureInsertedRow(patch: ProfilePatch, skin: SkinEntry, disabled: boolean): void {
  let found = false
  const retain = (sequence: YAMLSeq, shared = false): void => {
    shared ||= sequence.anchor !== undefined
    sequence.items = sequence.items.filter(value => {
      const row = patchRow(value)
      if (registrationMatches(patchRegistration(row), skin)) {
        assertRegistrationMatches(patchRegistration(row), skin)
        if (shared) unsafeProfilePatch()
        assertWritablePatchRow(row)
        if (found) return false
        found = true
        if (disabled) row.set('disabled', true)
        else row.delete('disabled')
        return true
      }
      const children = insertedRows(row)
      if (children !== undefined) retain(children, shared || row.anchor !== undefined)
      return true
    })
  }

  for (const operation of patch.operations.items) {
    const row = patchRow(operation)
    const children = insertedRows(row)
    if (children !== undefined) retain(children, row.anchor !== undefined)
  }
  if (!found) {
    const insert = patch.operations.items.map(patchRow).filter(row => row.anchor === undefined)
      .map(insertedRows).find(value => value !== undefined && value.anchor === undefined)
    const row = { id: skin.rowId, name: skin.package, ...(disabled ? { disabled: true } : {}) }
    if (insert !== undefined) insert.items.push(patch.document.createNode(row))
    else patch.operations.items.push(patch.document.createNode({ insert: [row] }))
  }
}

function removeProfileOverrides(operations: YAMLSeq, skin: SkinEntry): void {
  operations.items = operations.items.filter(value => {
    const row = patchRow(value)
    if (row.get('id') !== skin.rowId) return true
    if (row.has('name') && row.get('name') !== skin.package) {
      throw new Error(`loader registration conflicts with ${String(row.get('id') ?? row.get('name'))}`)
    }
    assertWritablePatchRow(row)
    return false
  })
}

function ensureProfileOverride(patch: ProfilePatch, skin: SkinEntry, disabled: boolean): void {
  let found = false
  patch.operations.items = patch.operations.items.filter(value => {
    const row = patchRow(value)
    if (row.get('id') !== skin.rowId) return true
    if (row.has('name') && row.get('name') !== skin.package) {
      throw new Error(`loader registration conflicts with ${String(row.get('id') ?? row.get('name'))}`)
    }
    assertWritablePatchRow(row)
    if (found) return false
    found = true
    if (disabled) row.set('disabled', true)
    else row.delete('disabled')
    return disabled || row.items.some(pair => isScalar(pair.key) && pair.key.value !== 'id' && pair.key.value !== 'name')
  })
  if (!found && disabled) patch.operations.items.push(patch.document.createNode({ id: skin.rowId, disabled: true }))
}

/** Whether a profile-level row already targets this loader. */
export function hasLoaderOverride(profileDir: string, identity: LoaderIdentity): boolean {
  if (identity.id === undefined) return false
  return patchOperations(profileDir).some(operation =>
    isRecord(operation) && operation.id === identity.id && !Array.isArray(operation.insert),
  )
}

/**
 * Toggle a receipt-owned loader without taking over a user-authored row.
 * The market creates only the minimal `{id, disabled:true}` shape and removes
 * only that exact shape. Any richer row is treated as user-owned and left
 * untouched.
 * @returns true when the market still controls the row and live state may be updated.
 */
export function setManagedLoaderOverride(profileDir: string, identity: LoaderIdentity, disabled: boolean): boolean {
  if (identity.id === undefined) return false
  const patch = editablePatch(profileDir)
  const matching = patch.operations.items.map(patchRow).filter(row => row.get('id') === identity.id && !row.has('insert'))
  if (matching.length > 1) return false
  const existing = matching[0]
  if (existing !== undefined) {
    const keys = existing.items.map(pair => isScalar(pair.key) ? pair.key.value : undefined).sort()
    const flag = existing.get('disabled', true)
    const marketOwned = keys.length === 2 && keys[0] === 'disabled' && keys[1] === 'id'
      && isScalar(flag) && flag.value === true && flag.tag === undefined && flag.anchor === undefined && existing.anchor === undefined
    if (!marketOwned) return false
    if (disabled) return true
    patch.operations.items = patch.operations.items.filter(operation => operation !== existing)
    writePatchOperations(profileDir, patch)
    return true
  }
  if (!disabled) return true
  patch.operations.items.push(patch.document.createNode({ id: identity.id, disabled: true }))
  writePatchOperations(profileDir, patch)
  return true
}

function ensureProfileBundle(profileDir: string, packageName: string): void {
  const file = manifestFile(profileDir)
  const manifest = readJson<ProfileManifest>(file, {})
  const bundles = manifest.dsh?.profile?.bundles
  if (Array.isArray(bundles) && bundles.includes(packageName)) return
  manifest.dsh = {
    ...manifest.dsh,
    profile: { ...manifest.dsh?.profile, bundles: [...(Array.isArray(bundles) ? bundles : []), packageName] },
  }
  atomicWriteJson(file, manifest)
}

export function ensureBuildAllowed(profileDir: string, key: string): void {
  const file = pnpmWorkspaceFile(profileDir)
  const parsed = existsSync(file) ? parse(readFileSync(file, 'utf8')) as unknown : {}
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('profile pnpm-workspace.yaml must contain a YAML mapping')
  const workspace = parsed as Record<string, unknown>
  const allowBuilds = typeof workspace.allowBuilds === 'object' && workspace.allowBuilds !== null && !Array.isArray(workspace.allowBuilds)
    ? workspace.allowBuilds as Record<string, unknown>
    : {}
  allowBuilds[key] = true
  workspace.allowBuilds = allowBuilds
  atomicWriteText(file, stringify(workspace, { lineWidth: 0 }))
}

export function ensurePatchedDependency(profileDir: string, packageName: string, version: string, patchFile: string): void {
  const file = pnpmWorkspaceFile(profileDir)
  const parsed = existsSync(file) ? parse(readFileSync(file, 'utf8')) as unknown : {}
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('profile pnpm-workspace.yaml must contain a YAML mapping')
  const workspace = parsed as Record<string, unknown>
  const patchedDependencies = typeof workspace.patchedDependencies === 'object' && workspace.patchedDependencies !== null && !Array.isArray(workspace.patchedDependencies)
    ? workspace.patchedDependencies as Record<string, unknown>
    : {}
  patchedDependencies[`${packageName}@${version}`] = patchFile
  workspace.patchedDependencies = patchedDependencies
  atomicWriteText(file, stringify(workspace, { lineWidth: 0 }))
}

function patchedDependencyMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {}
  const result: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') result[key] = entry
    else if (isRecord(entry) && typeof entry.hash === 'string') result[key] = entry.hash
  }
  return result
}

function normalizedPatchedDependencyMap(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
}

function patchHash(file: string): string | null {
  try {
    const contents = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
    return createHash('sha256').update(contents).digest('hex')
  } catch {
    return null
  }
}

/**
 * pnpm records patch file hashes in pnpm-lock.yaml, not the configured paths.
 * Keep this check local so an older interrupted market operation can repair
 * its metadata before the next frozen install.
 */
export function patchedDependenciesNeedSync(profileDir: string): boolean {
  const workspace = existsSync(pnpmWorkspaceFile(profileDir))
    ? parse(readFileSync(pnpmWorkspaceFile(profileDir), 'utf8')) as unknown
    : {}
  const lockfile = existsSync(pnpmLockfile(profileDir))
    ? parse(readFileSync(pnpmLockfile(profileDir), 'utf8')) as unknown
    : {}
  const configured = isRecord(workspace) ? patchedDependencyMap(workspace.patchedDependencies) : {}
  const recorded = isRecord(lockfile) ? patchedDependencyMap(lockfile.patchedDependencies) : {}
  const expected = Object.fromEntries(Object.entries(configured).map(([key, relativeFile]) => {
    const hash = patchHash(resolve(profileDir, relativeFile))
    return [key, hash ?? '']
  }))
  return JSON.stringify(normalizedPatchedDependencyMap(expected)) !== JSON.stringify(normalizedPatchedDependencyMap(recorded))
}

/** Remove a package's patch settings but keep patch files available for rollback. */
export function detachCompatibilityPatches(profileDir: string, packageName: string): string[] {
  const retainedFiles: string[] = []
  const prefix = packageName + '@'
  const patchRoot = resolve(compatibilityPatchDir(profileDir))
  const workspaceFile = pnpmWorkspaceFile(profileDir)
  for (const value of removePatchedDependencyEntries(workspaceFile, key => key.startsWith(prefix))) {
    if (typeof value !== 'string') continue
    const patchFile = resolve(profileDir, value)
    if (patchFile.startsWith(patchRoot + sep) && existsSync(patchFile)) retainedFiles.push(patchFile)
  }
  // pnpm keeps a hash-only copy in pnpm-lock.yaml. Leaving that copy behind
  // after the workspace entry is detached makes the next install fail with
  // ERR_PNPM_UNUSED_PATCH before pnpm can clean its own lockfile.
  removePatchedDependencyEntries(pnpmLockfile(profileDir), key => key.startsWith(prefix))
  return retainedFiles
}

function removePatchedDependencyEntries(file: string, matches: (key: string) => boolean): unknown[] {
  if (!existsSync(file)) return []
  const parsed = parse(readFileSync(file, 'utf8')) as unknown
  if (!isRecord(parsed) || !isRecord(parsed.patchedDependencies)) return []
  const next = { ...parsed.patchedDependencies }
  const removed: unknown[] = []
  let changed = false
  for (const [key, value] of Object.entries(parsed.patchedDependencies)) {
    if (!matches(key)) continue
    delete next[key]
    removed.push(value)
    changed = true
  }
  if (!changed) return []
  if (Object.keys(next).length === 0) delete parsed.patchedDependencies
  else parsed.patchedDependencies = next
  atomicWriteText(file, stringify(parsed, { lineWidth: 0 }))
  return removed
}

export function cleanupCompatibilityPatchFiles(files: readonly string[]): void {
  for (const file of files) if (existsSync(file)) unlinkSync(file)
}

export function removePatchedDependency(profileDir: string, packageName: string, version: string): void {
  const key = `${packageName}@${version}`
  removePatchedDependencyEntries(pnpmWorkspaceFile(profileDir), candidate => candidate === key)
  removePatchedDependencyEntries(pnpmLockfile(profileDir), candidate => candidate === key)
}

export function removeCompatibilityPatch(profileDir: string, packageName: string, version: string): void {
  removePatchedDependency(profileDir, packageName, version)
  const file = compatibilityPatchFile(profileDir, packageName, version)
  if (existsSync(file)) unlinkSync(file)
}

export function removeCompatibilityPatches(profileDir: string, packageName: string): void {
  cleanupCompatibilityPatchFiles(detachCompatibilityPatches(profileDir, packageName))
}

export function ensureSkinRegistration(profileDir: string, skin: SkinEntry, disabled = true): void {
  const bundle = bundlePatchOperations(profileDir, skin.package)
  const patch = editablePatch(profileDir)
  const operations = patch.operations
  const selfDeclared = bundle !== null && bundle.some(operation => declaredBundleRows(operation, skin).length > 0)
  if (bundle !== null && disabled) {
    // Disabling only the skin's primary row leaves every other insert/config
    // operation in its bundle patch active. Remove the entire bundle from the
    // composition stack instead, and remove now-orphaned primary rows. The
    // dependency remains installed and enabling adds the bundle back.
    removeProfileInsertedRows(operations, skin)
    removeEmptyInsertOperations(operations)
    removeProfileOverrides(operations, skin)
    writePatchOperations(profileDir, patch)
    removeProfileBundles(profileDir, [skin.package])
    return
  }
  if (selfDeclared) {
    // The enabled bundle owns the loader row; no profile override is needed.
    removeProfileInsertedRows(operations, skin)
    removeEmptyInsertOperations(operations)
    ensureProfileOverride(patch, skin, false)
  } else {
    // Client-only plugins, and bundles that do not declare this row, need a
    // profile-level insert. Remove stale overrides from older market versions.
    removeProfileOverrides(operations, skin)
    ensureInsertedRow(patch, skin, disabled)
  }
  writePatchOperations(profileDir, patch)
  if (bundle !== null) ensureProfileBundle(profileDir, skin.package)
  else removeProfileBundles(profileDir, [skin.package])
}

export function removeSkinRegistration(profileDir: string, skin: SkinEntry): void {
  const file = profilePatchFile(profileDir)
  if (!existsSync(file)) return
  const patch = editablePatch(profileDir)
  const operations = patch.operations
  removeProfileInsertedRows(operations, skin)
  removeEmptyInsertOperations(operations)
  removeProfileOverrides(operations, skin)
  writePatchOperations(profileDir, patch)
}

export function installedClientPlugins(profileDir: string, catalog: SkinEntry[]): InstalledClientPlugin[] {
  const catalogPackages = new Set(catalog.map(skin => skin.package))
  const rows = patchOperations(profileDir)
    .flatMap(operation => operation.insert ?? [])
    .filter((value): value is PatchRow => typeof value === 'object' && value !== null)
  return Object.entries(readDependencies(profileDir)).flatMap(([packageName, spec]) => {
    if (catalogPackages.has(packageName) || packageName === 'dsh-skin-market') return []
    const manifest = packageManifest(profileDir, packageName)
    const dsh = manifest?.dsh as { client?: unknown } | undefined
    if (dsh?.client === undefined) return []
    const matchingRows = rows.filter(row => row.name === packageName)
    return [{
      package: packageName,
      version: typeof manifest?.version === 'string' ? manifest.version : null,
      spec,
      rowIds: matchingRows.flatMap(row => typeof row.id === 'string' ? [row.id] : []),
      registered: matchingRows.length > 0,
    }]
  }).sort((a, b) => a.package.localeCompare(b.package))
}

export interface FileSnapshot { existed: boolean; contents: string }

export function snapshotFile(file: string): FileSnapshot {
  return existsSync(file) ? { existed: true, contents: readFileSync(file, 'utf8') } : { existed: false, contents: '' }
}

export function restoreFile(file: string, snapshot: FileSnapshot): void {
  if (snapshot.existed) writeFileSync(file, snapshot.contents)
  else if (existsSync(file)) unlinkSync(file)
}

export function snapshotManifest(profileDir: string): FileSnapshot { return snapshotFile(manifestFile(profileDir)) }
export function restoreManifest(profileDir: string, snapshot: FileSnapshot): void { restoreFile(manifestFile(profileDir), snapshot) }

function latestOperationAt(installedAt: string | null, activity?: SkinActivity): string | null {
  const timestamps = [installedAt, activity?.installedAt, activity?.updatedAt, activity?.usedAt]
    .filter((value): value is string => value !== undefined && value !== null && Number.isFinite(Date.parse(value)))
  return timestamps.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null
}

export function runtimeState(profileDir: string, skin: SkinEntry, activeSkinId: string | null, loaderLive: boolean, loaderFound: boolean, pinnedSkinIds: string[] = [], activity?: SkinActivity, hostKind: MarketHostKind = 'dsh', enabledSkinIds?: string[]): SkinRuntimeState {
  const dependencies = readDependencies(profileDir)
  const spec = dependencies[skin.package] ?? null
  if (spec === null) {
    return { skinId: skin.id, installation: 'missing', activation: 'inactive', primary: false, pinned: false, installedVersion: null, installedSpec: null, installedAt: null, lastOperatedAt: null, updateAvailable: false }
  }
  const installedAt = packageInstalledAt(profileDir, skin.package)
  const lastOperatedAt = latestOperationAt(installedAt, activity)
  if (!installedSkinSourceMatches(profileDir, skin)) {
    return {
      skinId: skin.id,
      installation: 'broken',
      activation: 'inactive',
      primary: false,
      pinned: false,
      installedVersion: null,
      installedSpec: spec,
      installedAt,
      lastOperatedAt,
      updateAvailable: false,
      error: '已安装包来源与该市场条目不一致；市场不会管理这个插件。',
    }
  }
  const primary = activeSkinId === skin.id
  const pinned = pinnedSkinIds.includes(skin.id)
  const validation = validateInstalledSkin(profileDir, skin, { allowArtifactRisk: true, hostKind })
  if (!validation.ok) {
    return { skinId: skin.id, installation: 'broken', activation: 'inactive', primary, pinned, installedVersion: null, installedSpec: spec, installedAt, lastOperatedAt, updateAvailable: false, error: validation.reason }
  }
  const selected = primary || (enabledSkinIds === undefined ? pinned : enabledSkinIds.includes(skin.id))
  const activation = selected ? (loaderFound && loaderLive ? 'active' : 'unavailable') : 'inactive'
  const pinnedSpecMatches = reviewedInstalledSpecMatches(profileDir, skin, spec, { allowArtifactRisk: true, hostKind })
  const updateAvailable = validation.version !== skin.install.version || !pinnedSpecMatches || companionsNeedInstall(profileDir, skin)
  const artifactRisk = inspectSkinArtifactRisk(profileDir, skin, hostKind)
  return {
    skinId: skin.id,
    installation: 'installed',
    activation,
    primary,
    pinned,

    installedVersion: validation.version ?? null,
    installedSpec: spec,
    installedAt,
    lastOperatedAt,
    updateAvailable,
    ...(artifactRisk !== undefined && !artifactRiskAcknowledged(profileDir, skin, artifactRisk) ? { artifactRisk } : {}),
    ...(activation === 'unavailable' ? {
      error: loaderFound
        ? '皮肤已选中，但组件尚未运行，尚未生效。'
        : '皮肤已选中，但未找到组件，尚未生效。请尝试修复安装。',
    } : {}),
  }
}
