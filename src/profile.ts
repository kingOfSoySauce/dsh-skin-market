import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { parse, stringify } from 'yaml'
import { effectiveBuildApprovalKey } from './build-approval.ts'
import { npmInstallTarget, parseGithubTarget, repositoryIdentity, reviewedNpmSourceError } from './install-resolution.ts'
import { parseInsertedLoaderRows, primaryLoaderCandidates, sharedLoaderIdentifiers, type LoaderIdentity } from './loader-ownership.ts'
import type { InstallConflict, InstalledClientPlugin, ManagedCompanionState, ManagedLoaderState, PersistedMarketState, SkinActivity, SkinEntry, SkinRuntimeState } from './types.ts'

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
  if (value.activity !== undefined && (typeof value.activity !== 'object' || value.activity === null || Array.isArray(value.activity))) delete value.activity
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

function npmLockfileIntegrity(profileDir: string, packageName: string, version: string): string | null {
  const file = pnpmLockfile(profileDir)
  if (!existsSync(file)) return null
  let value: unknown
  try { value = parse(readFileSync(file, 'utf8')) as unknown } catch { return null }
  if (!isRecord(value) || !isRecord(value.packages)) return null
  const packages = value.packages as Record<string, unknown>
  const prefix = `${packageName}@${version}`
  for (const [key, entry] of Object.entries(packages)) {
    if (!(key === prefix || key.startsWith(`${prefix}(`) || key.startsWith(`/${prefix}/`))) continue
    if (!isRecord(entry) || !isRecord(entry.resolution) || typeof entry.resolution.integrity !== 'string') continue
    return entry.resolution.integrity
  }
  return null
}

function exactNpmSpecMatches(spec: string | null | undefined, packageName: string, version: string): boolean {
  return spec === version || spec === `${packageName}@${version}` || spec === `npm:${packageName}@${version}`
}

function validateInstalledNpmSource(profileDir: string, skin: SkinEntry, manifest: Record<string, unknown>): string | null {
  const npm = skin.install.npm
  if (npm === undefined) return null
  // A newly reviewed npm alternative does not change the provenance of an
  // existing GitHub install. Older npm versions also remain updateable; the
  // current artifact's integrity cannot validate a different release.
  const spec = readDependencies(profileDir)[skin.package]
  if (!exactNpmSpecMatches(spec, npm.name, npm.version)) return null
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

export function validateInstalledSkin(profileDir: string, skin: SkinEntry): { ok: boolean; reason?: string; version?: string; repairable?: boolean } {
  const manifest = packageManifest(profileDir, skin.package)
  if (manifest === null) return {
    ok: false,
    repairable: true,
    reason: `installed package manifest missing for ${skin.package}; the plugin command returned without materializing the reviewed package`,
  }
  const manifestName = typeof manifest.name === 'string' ? manifest.name : undefined
  if (manifestName === undefined) return { ok: false, reason: `installed package name missing; expected ${skin.package}` }
  if (manifestName !== skin.package) return {
    ok: false,
    reason: `installed package name mismatch; expected ${skin.package}, found ${manifestName}`,
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
  if (npmError !== null) return { ok: false, reason: npmError }
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

/** Only offer an explicit migration between the same reviewed GitHub/npm release. */
export function npmSourceMigration(profileDir: string, skin: SkinEntry): { target: string; currentSource: string } | undefined {
  if (skin.review?.installation === 'manual-only' || reviewedNpmSourceError(skin) !== null) return undefined
  const currentSource = readDependencies(profileDir)[skin.package]
  if (currentSource === undefined) return undefined
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
  const value = parse(readFileSync(file, 'utf8')) as unknown
  if (!Array.isArray(value)) throw new Error('profile cordis.patch.yml must contain a YAML sequence')
  return value as PatchOperation[]
}

function writePatchOperations(profileDir: string, operations: PatchOperation[]): void {
  atomicWriteText(profilePatchFile(profileDir), stringify(operations, { lineWidth: 0 }))
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

export function installedLoaderIdentities(profileDir: string, excludePackage?: string): LoaderIdentity[] {
  const rows = patchOperations(profileDir).flatMap(operation => parseInsertedLoaderRows(operation))
  const seen = new Set<string>()
  for (const packageName of Object.keys(readDependencies(profileDir))) {
    if (packageName === excludePackage) continue
    collectInstalledPackageLoaderIdentities(profileDir, packageName, seen, rows)
  }
  return rows
}

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

export function assertNoLoaderConflicts(profileDir: string, skin: SkinEntry, incomingRows?: readonly LoaderIdentity[]): void {
  assertLoaderMetadata(profileDir, skin)
  const ownership = packageLoaderMetadata(profileDir, skin)
  const incoming = incomingRows === undefined ? packageLoaderIdentities(profileDir, skin.package) : [...incomingRows]
  if (incoming.length === 0 && !ownership.hasBundle) {
    incoming.push({ id: skin.rowId, name: skin.package, packageName: skin.package })
  }
  const existing = installedLoaderIdentities(profileDir, skin.package)
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
  if (!isRecord(dsh.bundle) || typeof dsh.bundle.patch !== 'string') {
    throw new Error(`${packageName} declares dsh.bundle without a valid patch path`)
  }
  const file = resolve(packageDirectory, dsh.bundle.patch)
  if (!existsSync(file)) throw new Error(`${packageName} bundle patch is missing: ${dsh.bundle.patch}`)
  const value = parse(readFileSync(file, 'utf8')) as unknown
  if (!Array.isArray(value)) throw new Error(`${packageName} cordis.patch.yml must contain a YAML sequence`)
  return value as PatchOperation[]
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

function removeInsertedRows(values: unknown[], skin: SkinEntry): unknown[] {
  return values.flatMap(value => {
    if (!isRecord(value)) return [value]
    const row = value as PatchRow
    if (registrationMatches(row, skin)) {
      assertRegistrationMatches(row, skin)
      return []
    }
    if (Array.isArray(value.insert)) value.insert = removeInsertedRows(value.insert, skin)
    return [value]
  })
}

function removeProfileInsertedRows(operations: PatchOperation[], skin: SkinEntry): void {
  for (const operation of operations) {
    if (Array.isArray(operation.insert)) operation.insert = removeInsertedRows(operation.insert, skin)
  }
}

function removeEmptyInsertOperations(operations: PatchOperation[]): void {
  const next = operations.filter(operation => !Array.isArray(operation.insert) || operation.insert.length > 0)
  operations.splice(0, operations.length, ...next)
}

function ensureInsertedRow(operations: PatchOperation[], skin: SkinEntry, disabled: boolean): void {
  let found = false
  const retain = (values: unknown[]): unknown[] => values.flatMap(value => {
    if (!isRecord(value)) return [value]
    const row = value as PatchRow
    if (registrationMatches(row, skin)) {
      assertRegistrationMatches(row, skin)
      if (found) return []
      found = true
      if (disabled) row.disabled = true
      else delete row.disabled
      return [row]
    }
    if (Array.isArray(value.insert)) value.insert = retain(value.insert)
    return [value]
  })

  for (const operation of operations) {
    if (Array.isArray(operation.insert)) operation.insert = retain(operation.insert)
  }
  if (!found) {
    const operation = operations.find(item => Array.isArray(item.insert))
    if (operation !== undefined) operation.insert!.push({ id: skin.rowId, name: skin.package, ...(disabled ? { disabled: true } : {}) })
    else operations.push({ insert: [{ id: skin.rowId, name: skin.package, ...(disabled ? { disabled: true } : {}) }] })
  }
}

function removeProfileOverrides(operations: PatchOperation[], skin: SkinEntry): void {
  const next = operations.filter(operation => {
    if (!isRecord(operation) || operation.id !== skin.rowId) return true
    if (operation.name !== undefined && operation.name !== skin.package) {
      throw new Error(`loader registration conflicts with ${String(operation.id ?? operation.name)}`)
    }
    return false
  })
  operations.splice(0, operations.length, ...next)
}

function ensureProfileOverride(operations: PatchOperation[], skin: SkinEntry, disabled: boolean): void {
  let found = false
  const next = operations.filter(operation => {
    if (!isRecord(operation) || operation.id !== skin.rowId) return true
    if (operation.name !== undefined && operation.name !== skin.package) {
      throw new Error(`loader registration conflicts with ${String(operation.id ?? operation.name)}`)
    }
    if (found) return false
    found = true
    if (disabled) operation.disabled = true
    else delete operation.disabled
    return disabled || Object.keys(operation).some(key => key !== 'id' && key !== 'name')
  })
  operations.splice(0, operations.length, ...next)
  if (!found && disabled) operations.push({ id: skin.rowId, disabled: true })
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
  const operations = patchOperations(profileDir)
  const matching = operations.filter(operation => isRecord(operation) && operation.id === identity.id && !Array.isArray(operation.insert))
  if (matching.length > 1) return false
  const existing = matching[0]
  if (existing !== undefined) {
    const keys = Object.keys(existing).sort()
    const marketOwned = keys.length === 2 && keys[0] === 'disabled' && keys[1] === 'id' && existing.disabled === true
    if (!marketOwned) return false
    if (disabled) return true
    writePatchOperations(profileDir, operations.filter(operation => operation !== existing))
    return true
  }
  if (!disabled) return true
  const next = [...operations, { id: identity.id, disabled: true }]
  writePatchOperations(profileDir, next)
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
  const operations = patchOperations(profileDir)
  const selfDeclared = bundle !== null && bundle.some(operation => declaredBundleRows(operation, skin).length > 0)
  if (bundle !== null && disabled) {
    // Disabling only the skin's primary row leaves every other insert/config
    // operation in its bundle patch active. Remove the entire bundle from the
    // composition stack instead, and remove now-orphaned primary rows. The
    // dependency remains installed and enabling adds the bundle back.
    removeProfileInsertedRows(operations, skin)
    removeEmptyInsertOperations(operations)
    removeProfileOverrides(operations, skin)
    writePatchOperations(profileDir, operations)
    removeProfileBundles(profileDir, [skin.package])
    return
  }
  if (selfDeclared) {
    // The enabled bundle owns the loader row; no profile override is needed.
    removeProfileInsertedRows(operations, skin)
    removeEmptyInsertOperations(operations)
    ensureProfileOverride(operations, skin, false)
  } else {
    // Client-only plugins, and bundles that do not declare this row, need a
    // profile-level insert. Remove stale overrides from older market versions.
    removeProfileOverrides(operations, skin)
    ensureInsertedRow(operations, skin, disabled)
  }
  writePatchOperations(profileDir, operations)
  if (bundle !== null) ensureProfileBundle(profileDir, skin.package)
  else removeProfileBundles(profileDir, [skin.package])
}

export function removeSkinRegistration(profileDir: string, skin: SkinEntry): void {
  const file = profilePatchFile(profileDir)
  if (!existsSync(file)) return
  const operations = patchOperations(profileDir)
  removeProfileInsertedRows(operations, skin)
  removeEmptyInsertOperations(operations)
  removeProfileOverrides(operations, skin)
  writePatchOperations(profileDir, operations)
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

export function runtimeState(profileDir: string, skin: SkinEntry, activeSkinId: string | null, loaderLive: boolean, loaderFound: boolean, pinnedSkinIds: string[] = [], activity?: SkinActivity): SkinRuntimeState {
  const dependencies = readDependencies(profileDir)
  const spec = dependencies[skin.package] ?? null
  const primary = activeSkinId === skin.id
  const pinned = pinnedSkinIds.includes(skin.id)
  if (spec === null) {
    return { skinId: skin.id, installation: 'missing', activation: 'inactive', primary: false, pinned: false, installedVersion: null, installedSpec: null, installedAt: null, lastOperatedAt: null, updateAvailable: false }
  }
  const installedAt = packageInstalledAt(profileDir, skin.package)
  const lastOperatedAt = latestOperationAt(installedAt, activity)
  const validation = validateInstalledSkin(profileDir, skin)
  if (!validation.ok) {
    return { skinId: skin.id, installation: 'broken', activation: 'inactive', primary, pinned, installedVersion: null, installedSpec: spec, installedAt, lastOperatedAt, updateAvailable: false, error: validation.reason }
  }
  const active = primary || pinned
  const activation = active ? (loaderFound ? (loaderLive ? 'active' : 'restart-required') : 'restart-required') : 'inactive'
  const pinnedSpecMatches = installedSpecMatches(skin, spec)
  const updateAvailable = validation.version !== skin.install.version || !pinnedSpecMatches || companionsNeedInstall(profileDir, skin)
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
  }
}
