import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parse, stringify } from 'yaml'
import type { InstalledClientPlugin, PersistedMarketState, SkinEntry, SkinRuntimeState } from './types.ts'

export function resolveProfileDir(profile: string, explicit?: string): string {
  if (explicit !== undefined) return explicit
  const base = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
  return join(base, 'profiles', profile)
}

export function manifestFile(profileDir: string): string { return join(profileDir, 'package.json') }
export function profilePatchFile(profileDir: string): string { return join(profileDir, 'cordis.patch.yml') }
export function pnpmWorkspaceFile(profileDir: string): string { return join(profileDir, 'pnpm-workspace.yaml') }
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
  return value
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

function packageDir(profileDir: string, packageName: string): string {
  return join(profileDir, 'node_modules', ...packageName.split('/'))
}

function packageInstalledAt(profileDir: string, packageName: string): string | null {
  try { return statSync(join(packageDir(profileDir, packageName), 'package.json')).mtime.toISOString() } catch { return null }
}

export function packageManifest(profileDir: string, packageName: string): Record<string, unknown> | null {
  const file = join(packageDir(profileDir, packageName), 'package.json')
  if (!existsSync(file)) return null
  return readJson<Record<string, unknown> | null>(file, null)
}

export function validateInstalledSkin(profileDir: string, skin: SkinEntry): { ok: boolean; reason?: string; version?: string } {
  const manifest = packageManifest(profileDir, skin.package)
  if (manifest === null) return { ok: false, reason: 'package manifest missing' }
  const dsh = manifest.dsh as { client?: unknown } | undefined
  if (dsh?.client === undefined) return { ok: false, reason: 'dsh client manifest missing' }
  const version = typeof manifest.version === 'string' ? manifest.version : undefined
  return { ok: true, version }
}

interface PatchOperation { insert?: unknown[]; [key: string]: unknown }
interface PatchRow { id?: unknown; name?: unknown; disabled?: unknown; [key: string]: unknown }

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

function bundlePatchOperations(profileDir: string, packageName: string): PatchOperation[] | null {
  const manifest = packageManifest(profileDir, packageName)
  const dsh = isRecord(manifest?.dsh) ? manifest.dsh : undefined
  if (dsh?.bundle === undefined) return null
  if (!isRecord(dsh.bundle) || typeof dsh.bundle.patch !== 'string') {
    throw new Error(`${packageName} declares dsh.bundle without a valid patch path`)
  }
  const file = resolve(packageDir(profileDir, packageName), dsh.bundle.patch)
  if (!existsSync(file)) throw new Error(`${packageName} bundle patch is missing: ${dsh.bundle.patch}`)
  const value = parse(readFileSync(file, 'utf8')) as unknown
  if (!Array.isArray(value)) throw new Error(`${packageName} cordis.patch.yml must contain a YAML sequence`)
  return value as PatchOperation[]
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

export function ensureSkinRegistration(profileDir: string, skin: SkinEntry, disabled = true): void {
  const bundle = bundlePatchOperations(profileDir, skin.package)
  const operations = patchOperations(profileDir)
  const selfDeclared = bundle !== null && bundle.some(operation => declaredBundleRows(operation, skin).length > 0)
  if (selfDeclared) {
    // The bundle owns the loader row. The profile layer only overrides it.
    removeProfileInsertedRows(operations, skin)
    removeEmptyInsertOperations(operations)
    ensureProfileOverride(operations, skin, disabled)
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

export function runtimeState(profileDir: string, skin: SkinEntry, activeSkinId: string | null, loaderLive: boolean, loaderFound: boolean): SkinRuntimeState {
  const dependencies = readDependencies(profileDir)
  const spec = dependencies[skin.package] ?? null
  if (spec === null) {
    return { skinId: skin.id, installation: 'missing', activation: 'inactive', installedVersion: null, installedSpec: null, installedAt: null, updateAvailable: false }
  }
  const installedAt = packageInstalledAt(profileDir, skin.package)
  const validation = validateInstalledSkin(profileDir, skin)
  if (!validation.ok) {
    return { skinId: skin.id, installation: 'broken', activation: 'inactive', installedVersion: null, installedSpec: spec, installedAt, updateAvailable: false, error: validation.reason }
  }
  const active = activeSkinId === skin.id
  const activation = active ? (loaderFound ? (loaderLive ? 'active' : 'restart-required') : 'restart-required') : 'inactive'
  const updateAvailable = validation.version !== skin.install.version || !spec.includes(skin.install.commit)
  return {
    skinId: skin.id,
    installation: 'installed',
    activation,
    installedVersion: validation.version ?? null,
    installedSpec: spec,
    installedAt,
    updateAvailable,
  }
}
