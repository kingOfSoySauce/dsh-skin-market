import { createHash, randomUUID } from 'node:crypto'
import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync, type BigIntStats } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { isAlias, isMap, isScalar, isSeq, parseDocument, visit, type Scalar, type YAMLMap } from 'yaml'
import { CORDIS_JS_TAG, cordisYamlOptions } from './cordis-yaml.ts'
import type { ConfigurationOverrideBatchPlan, ConfigurationOverridePlan } from './configuration-override-types.ts'
import type { OperationMessageKey } from './operation-message.ts'
export type { ConfigurationOverrideBatchPlan, ConfigurationOverridePlan } from './configuration-override-types.ts'

/** These locations and overlay facts must come from the running Host, never an HTTP request. */
export interface ConfigurationOverrideOptions {
  home?: string
  patchPath?: string
  overlays?: readonly string[]
}

export interface ConfigurationOverrideTarget {
  skinId: string
  packageName: string
  rowId: string
  enabled: boolean
}

type FailureCode = 'unavailable' | 'unsafe' | 'changed' | 'write-failed' | 'invalid-target'
const REASONS: Record<FailureCode, string> = {
  unavailable: '无法确认可安全修改的共享配置，请检查当前宿主和配置权限。',
  unsafe: '共享配置的规则较复杂，无法只修改目标开关，请手动处理。',
  changed: '目标或配置已变化，请重新检查后确认。',
  'write-failed': '无法保存配置修复，请检查配置目录的写入权限。',
  'invalid-target': '无法确认目标组件和本次启停方向，请重新操作。',
}
const REASON_KEYS: Record<FailureCode, OperationMessageKey> = {
  unavailable: 'failure.configUnavailable',
  unsafe: 'failure.configUnsafe',
  changed: 'failure.configChanged',
  'write-failed': 'failure.configWriteFailed',
  'invalid-target': 'failure.configInvalidTarget',
}

export class ConfigurationOverrideError extends Error {
  constructor(public readonly code: FailureCode) {
    super(REASONS[code])
    this.name = 'ConfigurationOverrideError'
  }
}

interface FileIdentity { value: string; mode: number }
interface Source {
  file: string
  home: string
  homeIdentity: string
  contents: string
  identity: FileIdentity
}
interface Prepared { source: Source; contents: string; plan: ConfigurationOverridePlan }
interface PreparedBatch { source: Source; contents: string; plan: ConfigurationOverrideBatchPlan }
type SourceResult = Source
  | { status: 'blocked'; reason: string; reasonKey: OperationMessageKey }
  | { status: 'none'; file: string; reason: string; reasonKey?: OperationMessageKey }

/** Opaque receipt: original configuration bytes stay in this module, outside API responses and logs. */
export interface ConfigurationOverrideReceipt { readonly backupPath: string }
interface ReceiptState { before: Source; after: Source; backup: Source; rolledBack: boolean }
const receipts = new WeakMap<ConfigurationOverrideReceipt, ReceiptState>()
const MAX_BYTES = 1024 * 1024
const IDENTIFIER = /^[A-Za-z0-9_./:@-]+$/

function validTarget(target: ConfigurationOverrideTarget): boolean {
  return target !== null && typeof target === 'object' && typeof target.enabled === 'boolean'
    && [target.skinId, target.packageName, target.rowId].every(value => typeof value === 'string'
      && value.length > 0 && value.length <= 512 && IDENTIFIER.test(value))
}

function basePlan(target: ConfigurationOverrideTarget): Pick<ConfigurationOverridePlan, 'rowId' | 'desiredEnabled' | 'sharedAcrossProfiles'> {
  return { rowId: target?.rowId ?? '', desiredEnabled: target?.enabled === true, sharedAcrossProfiles: true }
}

function homeIdentity(home: string): string {
  const stat = lstatSync(home, { bigint: true })
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o222n) === 0n
    || realpathSync(home) !== resolve(home)) throw new ConfigurationOverrideError('unavailable')
  return `${stat.dev}:${stat.ino}`
}

function statIdentity(stat: BigIntStats): FileIdentity {
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n || stat.size > BigInt(MAX_BYTES)) throw new ConfigurationOverrideError('unavailable')
  const mode = Number(stat.mode & 0o777n)
  if ((mode & 0o222) === 0) throw new ConfigurationOverrideError('unavailable')
  return { value: `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}:${mode}`, mode }
}

function fileIdentity(file: string): FileIdentity { return statIdentity(lstatSync(file, { bigint: true })) }

function readSource(file: string, home: string): Source {
  let descriptor: number | undefined
  try {
    const directoryIdentity = homeIdentity(home)
    const identity = fileIdentity(file)
    // Read the verified inode, refusing a symlink swap before opening it.
    descriptor = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    if (statIdentity(fstatSync(descriptor, { bigint: true })).value !== identity.value) throw new ConfigurationOverrideError('changed')
    const contents = readFileSync(descriptor, 'utf8')
    if (fileIdentity(file).value !== identity.value || homeIdentity(home) !== directoryIdentity) throw new ConfigurationOverrideError('changed')
    return { file, home, homeIdentity: directoryIdentity, identity, contents }
  } catch (error) {
    if (error instanceof ConfigurationOverrideError || (error as NodeJS.ErrnoException).code === 'ENOENT') throw error
    throw new ConfigurationOverrideError('unavailable')
  } finally {
    if (descriptor !== undefined) { try { closeSync(descriptor) } catch {} }
  }
}

function unchanged(source: Source): void {
  try {
    const current = readSource(source.file, source.home)
    if (current.homeIdentity !== source.homeIdentity || current.identity.value !== source.identity.value
      || current.contents !== source.contents) throw new ConfigurationOverrideError('changed')
  } catch (error) {
    if (error instanceof ConfigurationOverrideError && error.code === 'changed') throw error
    throw new ConfigurationOverrideError('changed')
  }
}

function parseSafe(contents: string) {
  const document = parseDocument(contents, { keepSourceTokens: true, uniqueKeys: true, ...cordisYamlOptions() })
  if (document.errors.length > 0 || document.warnings.length > 0 || !isSeq(document.contents)
    || document.directives?.docEnd === true || document.contents.flow === true && document.contents.items.length > 0) throw new ConfigurationOverrideError('unsafe')
  let unsafe = false
  visit(document, (_key, node) => {
    const tagged = node !== null && typeof node === 'object' && 'tag' in node && node.tag !== undefined
    const allowedCordisExpression = isScalar(node) && node.tag === CORDIS_JS_TAG && typeof node.value === 'string'
    if (isAlias(node) || tagged && !allowedCordisExpression || node !== null && typeof node === 'object'
      && 'anchor' in node && node.anchor !== undefined) unsafe = true
    if (isMap(node)) {
      if (node.items.some(pair => !isScalar(pair.key) || typeof pair.key.value !== 'string' || pair.key.value === '<<')) unsafe = true
    }
  })
  if (unsafe || document.contents.items.some(item => !isMap(item))) throw new ConfigurationOverrideError('unsafe')
  for (const item of document.contents.items as YAMLMap[]) {
    const id = keyValue(item, 'id')
    const insert = keyValue(item, 'insert')
    if (id === undefined && insert === undefined || insert !== undefined && !isSeq(insert)) throw new ConfigurationOverrideError('unsafe')
    structuralRows(item)
  }
  return { document, sequence: document.contents }
}

function keyValue(row: YAMLMap, key: string): unknown { return row.items.find(pair => isScalar(pair.key) && pair.key.value === key)?.value }
function literal(row: YAMLMap, key: string): unknown {
  const value = keyValue(row, key)
  return isScalar(value) ? value.value : undefined
}

/** Config objects belong to the plugin; only insertions and explicit groups contain Loader rows. */
function structuralRows(row: YAMLMap): YAMLMap[] {
  const id = keyValue(row, 'id')
  if (id !== undefined && (!isScalar(id) || typeof id.value !== 'string' || !IDENTIFIER.test(id.value))) throw new ConfigurationOverrideError('unsafe')
  const result = [row]
  const children = [keyValue(row, 'insert'), ...(literal(row, 'group') === true ? [keyValue(row, 'config')] : [])]
  for (const child of children) {
    if (child === undefined) continue
    if (!isSeq(child) || child.items.some(item => !isMap(item))) throw new ConfigurationOverrideError('unsafe')
    for (const item of child.items as YAMLMap[]) result.push(...structuralRows(item))
  }
  return result
}

interface Line { start: number; end: number; prefix: string; comment: string; newline: string }
/** Only single-line scalar pairs are edited. No YAML serialization or expression evaluation occurs. */
function pairLine(contents: string, key: Scalar, value: Scalar): Line {
  if (key.range == null || value.range == null || key.range[0] > value.range[0]) throw new ConfigurationOverrideError('unsafe')
  const start = contents.lastIndexOf('\n', key.range[0] - 1) + 1
  const newlineIndex = contents.indexOf('\n', value.range[1])
  const end = newlineIndex < 0 ? contents.length : newlineIndex + 1
  const prefix = contents.slice(start, key.range[0])
  const suffix = contents.slice(value.range[1], end)
  if (/[\r\n]/.test(contents.slice(key.range[0], value.range[1])) || !/^[ \t]*(?:#[^\r\n]*)?(?:\r?\n)?$/.test(suffix)) throw new ConfigurationOverrideError('unsafe')
  return { start, end, prefix, comment: /#[^\r\n]*/.exec(suffix)?.[0] ?? '', newline: suffix.endsWith('\r\n') ? '\r\n' : suffix.endsWith('\n') ? '\n' : '' }
}

function removeDisabled(contents: string, row: YAMLMap, soleRow: boolean): string {
  if (row.flow === true || row.range == null) throw new ConfigurationOverrideError('unsafe')
  const disabledIndex = row.items.findIndex(pair => isScalar(pair.key) && pair.key.value === 'disabled')
  const pair = row.items[disabledIndex]
  if (pair === undefined || !isScalar(pair.key) || !isScalar(pair.value)) throw new ConfigurationOverrideError('unsafe')
  const line = pairLine(contents, pair.key, pair.value)
  const rowStart = contents.lastIndexOf('\n', row.range[0] - 1) + 1
  const rowPrefix = contents.slice(rowStart, row.range[0])
  const indentation = /^([ \t]*)-[ \t]+$/.exec(rowPrefix)?.[1]
  if (indentation === undefined) throw new ConfigurationOverrideError('unsafe')
  const pureToggle = row.items.length === 2 && row.items.some(item => isScalar(item.key) && item.key.value === 'id')
  const edits: Array<{ start: number; end: number; value: string }> = []
  if (pureToggle) {
    for (const item of row.items) {
      if (!isScalar(item.key) || !isScalar(item.value)) throw new ConfigurationOverrideError('unsafe')
      const current = pairLine(contents, item.key, item.value)
      if (!/^[ \t]*(?:-[ \t]+)?$/.test(current.prefix)) throw new ConfigurationOverrideError('unsafe')
      edits.push({ start: current.start, end: current.end, value: current.comment === '' ? '' : `${indentation}${current.comment}${current.newline}` })
    }
  } else {
    if (!/^[ \t]*(?:-[ \t]+)?$/.test(line.prefix)) throw new ConfigurationOverrideError('unsafe')
    edits.push({ start: line.start, end: line.end, value: line.comment === '' ? '' : `${indentation}${line.comment}${line.newline}` })
    // Removing the first pair must move its list marker to the next surviving pair.
    if (disabledIndex === 0) {
      const next = row.items[1]
      if (next === undefined || !isScalar(next.key) || next.key.range == null) throw new ConfigurationOverrideError('unsafe')
      const nextStart = contents.lastIndexOf('\n', next.key.range[0] - 1) + 1
      if (nextStart < line.end || !/^[ \t]+$/.test(contents.slice(nextStart, next.key.range[0]))) throw new ConfigurationOverrideError('unsafe')
      edits.push({ start: nextStart, end: next.key.range[0], value: `${indentation}- ` })
    }
  }
  let result = contents
  let previous = contents.length
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    if (edit.end > previous) throw new ConfigurationOverrideError('unsafe')
    result = result.slice(0, edit.start) + edit.value + result.slice(edit.end)
    previous = edit.start
  }
  if (pureToggle && soleRow) {
    const newline = contents.includes('\r\n') ? '\r\n' : '\n'
    result += `${result.length > 0 && !result.endsWith('\n') ? newline : ''}[]${newline}`
  }
  parseSafe(result)
  return result
}

function trustedSource(options: ConfigurationOverrideOptions): SourceResult {
  if (options.overlays !== undefined && (!Array.isArray(options.overlays) || options.overlays.length > 0)) return { status: 'blocked', reason: '当前宿主含启动覆盖，无法只通过共享配置确认修复结果。', reasonKey: 'failure.configHostOverlays' }
  if (typeof options.home !== 'string' || options.home.trim() === '' || !isAbsolute(options.home)) return { status: 'blocked', reason: '宿主未提供可信的共享配置位置。', reasonKey: 'failure.configHomeUntrusted' }
  const home = resolve(options.home)
  const file = join(home, 'cordis.patch.yml')
  if (options.patchPath !== undefined && resolve(options.patchPath) === file) return { status: 'blocked', reason: '宿主的共享配置与当前配置位置重合，无法确认配置层级。', reasonKey: 'failure.configPathOverlap' }
  try { return readSource(file, home) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      try { homeIdentity(home) } catch { throw new ConfigurationOverrideError('unavailable') }
      return { status: 'none', file, reason: '共享配置中未找到目标开关覆盖。' }
    }
    throw error
  }
}

function prepareTarget(options: ConfigurationOverrideOptions, target: ConfigurationOverrideTarget, source: Source, rows = parseSafe(source.contents).sequence.items as YAMLMap[]): Prepared | ConfigurationOverridePlan {
  const base = basePlan(target)
  const file = source.file
  const matches = rows.filter(row => literal(row, 'id') === target.rowId)
  let nestedTarget = false
  for (const row of rows) if (structuralRows(row).some(node => node !== row && literal(node, 'id') === target.rowId)) nestedTarget = true
  if (matches.length > 1 || nestedTarget) throw new ConfigurationOverrideError('unsafe')
  const row = matches[0]
  if (row === undefined) return { ...base, status: 'none', source: 'home', file, reason: '共享配置中未找到目标开关覆盖。' }
  const name = keyValue(row, 'name')
  if (keyValue(row, 'insert') !== undefined || keyValue(row, 'group') !== undefined
    || name !== undefined && (!isScalar(name) || name.value !== target.packageName)) throw new ConfigurationOverrideError('unsafe')
  const disabled = keyValue(row, 'disabled')
  if (disabled === undefined) return { ...base, status: 'none', source: 'home', file, reason: '共享配置未覆盖目标的启停开关。' }
  if (!isScalar(disabled) || typeof disabled.value !== 'boolean') throw new ConfigurationOverrideError('unsafe')
  if (disabled.value === !target.enabled) return { ...base, status: 'none', source: 'home', file, previousDisabled: disabled.value, reason: '共享配置中的目标开关与本次操作一致。' }
  const contents = removeDisabled(source.contents, row, rows.length === 1)
  const context = createHash('sha256').update(JSON.stringify({ target, file, patchPath: options.patchPath, homeIdentity: source.homeIdentity, identity: source.identity.value, contents: source.contents })).digest('hex')
  return { source, contents, plan: { ...base, status: 'repairable', context, source: 'home', file, previousDisabled: disabled.value, reason: '可移除目标组件的共享开关覆盖；这项设置由同一 DSH home 下的所有配置共用。' } }
}

function prepare(options: ConfigurationOverrideOptions, target: ConfigurationOverrideTarget): Prepared | ConfigurationOverridePlan {
  if (!validTarget(target)) throw new ConfigurationOverrideError('invalid-target')
  const source = trustedSource(options)
  if ('status' in source) return { ...basePlan(target), ...source, ...(source.status === 'none' ? { source: 'home' as const } : {}) }
  return prepareTarget(options, target, source)
}

function canonicalTargets(targets: readonly ConfigurationOverrideTarget[]): ConfigurationOverrideTarget[] {
  if (!Array.isArray(targets) || targets.length > 512 || targets.some(target => !validTarget(target))) throw new ConfigurationOverrideError('invalid-target')
  const skins = new Set<string>()
  const rows = new Set<string>()
  for (const target of targets) {
    // A row cannot be removed once on behalf of two different logical targets or directions.
    if (skins.has(target.skinId) || rows.has(target.rowId)) throw new ConfigurationOverrideError('invalid-target')
    skins.add(target.skinId)
    rows.add(target.rowId)
  }
  return targets.map(({ skinId, packageName, rowId, enabled }) => ({ skinId, packageName, rowId, enabled }))
    .sort((left, right) => JSON.stringify(left) < JSON.stringify(right) ? -1 : 1)
}

function prepareBatch(options: ConfigurationOverrideOptions, targets: readonly ConfigurationOverrideTarget[]): PreparedBatch | ConfigurationOverrideBatchPlan {
  const canonical = canonicalTargets(targets)
  if (canonical.length === 0) return { status: 'none', changes: [], reason: '本次操作没有需要检查的组件。' }
  const source = trustedSource(options)
  if ('status' in source) return {
    status: source.status, changes: [], reason: source.reason,
    ...(source.reasonKey === undefined ? {} : { reasonKey: source.reasonKey }),
  }
  const rows = parseSafe(source.contents).sequence.items as YAMLMap[]
  const changes: ConfigurationOverrideBatchPlan['changes'] = []
  for (const target of canonical) {
    const result = prepareTarget(options, target, source, rows)
    const plan = 'plan' in result ? result.plan : result
    if (plan.status === 'blocked') return {
      status: 'blocked', changes: [], reason: plan.reason,
      ...(plan.reasonKey === undefined ? {} : { reasonKey: plan.reasonKey }),
      ...(plan.reasonParams === undefined ? {} : { reasonParams: plan.reasonParams }),
    }
    if (plan.status === 'repairable') {
      const { context: _singleTargetContext, ...projection } = plan
      changes.push({ ...projection, skinId: target.skinId })
    }
  }
  if (changes.length === 0) return { status: 'none', changes: [], reason: '共享配置没有阻止本次操作的组件开关覆盖。' }
  // All targets were inspected against the original snapshot. Combine edits in memory only;
  // no disk changes or intermediate backups occur until the whole batch is approved.
  let contents = source.contents
  for (const change of changes) {
    const target = canonical.find(target => target.skinId === change.skinId)!
    const result = prepareTarget(options, target, { ...source, contents })
    if (!('plan' in result)) throw new ConfigurationOverrideError('unsafe')
    contents = result.contents
  }
  const context = createHash('sha256').update(JSON.stringify({ targets: canonical, file: source.file,
    patchPath: options.patchPath, homeIdentity: source.homeIdentity, identity: source.identity.value, contents: source.contents })).digest('hex')
  return { source, contents, plan: { status: 'repairable', context, changes, reason: '可一次移除本次操作涉及的共享开关覆盖；同一 DSH home 下的所有配置共用这些设置。' } }
}

/** Returns bounded metadata only; configuration contents never leave the editor. */
export function inspectConfigurationOverride(options: ConfigurationOverrideOptions, target: ConfigurationOverrideTarget): ConfigurationOverridePlan {
  try {
    const result = prepare(options, target)
    return 'plan' in result ? result.plan : result
  } catch (error) {
    const failure = error instanceof ConfigurationOverrideError ? error : undefined
    return {
      ...basePlan(target), status: 'blocked',
      reason: failure?.message ?? REASONS.unavailable,
      reasonKey: failure === undefined ? REASON_KEYS.unavailable : REASON_KEYS[failure.code],
    }
  }
}

/** Inspect every target from one source snapshot. A blocked target blocks the whole batch. */
export function inspectConfigurationOverrides(options: ConfigurationOverrideOptions, targets: readonly ConfigurationOverrideTarget[]): ConfigurationOverrideBatchPlan {
  try {
    const result = prepareBatch(options, targets)
    return 'plan' in result ? result.plan : result
  } catch (error) {
    const failure = error instanceof ConfigurationOverrideError ? error : undefined
    return {
      status: 'blocked', changes: [],
      reason: failure?.message ?? REASONS.unavailable,
      reasonKey: failure === undefined ? REASON_KEYS.unavailable : REASON_KEYS[failure.code],
    }
  }
}

function save(source: Source, contents: string, onReplaced?: () => void): Source {
  const temporary = `${source.file}.${process.pid}.${randomUUID()}.tmp`
  let descriptor: number | undefined
  try {
    unchanged(source)
    descriptor = openSync(temporary, 'wx', source.identity.mode)
    fchmodSync(descriptor, source.identity.mode)
    writeFileSync(descriptor, contents, 'utf8')
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    unchanged(source)
    renameSync(temporary, source.file)
    onReplaced?.()
    const after = readSource(source.file, source.home)
    if (after.contents !== contents || after.identity.mode !== source.identity.mode) throw new ConfigurationOverrideError('changed')
    return after
  } catch (error) {
    if (error instanceof ConfigurationOverrideError) throw error
    throw new ConfigurationOverrideError('write-failed')
  } finally {
    if (descriptor !== undefined) { try { closeSync(descriptor) } catch {} }
    try { unlinkSync(temporary) } catch {}
  }
}

/** Only a fresh, explicitly approved plan may edit the one trusted home file. */
function applyPrepared<Plan extends ConfigurationOverridePlan | ConfigurationOverrideBatchPlan>(prepared: { source: Source; contents: string; plan: Plan }): { plan: Plan; receipt: ConfigurationOverrideReceipt } {
  const backupPath = join(dirname(prepared.source.file), `.dsh-skin-market-configuration-override-${randomUUID()}.backup`)
  let descriptor: number | undefined
  let backup: Source | undefined
  let saved = false
  let replaced = false
  try {
    unchanged(prepared.source)
    descriptor = openSync(backupPath, 'wx', 0o600)
    fchmodSync(descriptor, 0o600)
    writeFileSync(descriptor, prepared.source.contents, 'utf8')
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    backup = readSource(backupPath, prepared.source.home)
    unchanged(prepared.source)
    const after = save(prepared.source, prepared.contents, () => { replaced = true })
    saved = true
    const receipt = Object.freeze({ backupPath })
    receipts.set(receipt, { before: prepared.source, after, backup, rolledBack: false })
    return { plan: prepared.plan, receipt }
  } catch (error) {
    if (error instanceof ConfigurationOverrideError) throw error
    throw new ConfigurationOverrideError('write-failed')
  } finally {
    if (descriptor !== undefined) { try { closeSync(descriptor) } catch {} }
    if (!saved) {
      // Keep a durable backup if replacement happened but a concurrent edit prevented verification.
      if (!replaced) { try { unlinkSync(backupPath) } catch {} }
    }
  }
}

/** Only a fresh, explicitly approved plan may edit the one trusted home file. */
export function applyConfigurationOverride(options: ConfigurationOverrideOptions, target: ConfigurationOverrideTarget, context: string): { plan: ConfigurationOverridePlan; receipt: ConfigurationOverrideReceipt } {
  const prepared = prepare(options, target)
  if (!('plan' in prepared) || prepared.plan.context !== context || !/^[a-f0-9]{64}$/.test(context)) throw new ConfigurationOverrideError('changed')
  return applyPrepared(prepared)
}

/** Apply all approved removals in one atomic replacement, with one backup and receipt. */
export function applyConfigurationOverrides(options: ConfigurationOverrideOptions, targets: readonly ConfigurationOverrideTarget[], context: string): { plan: ConfigurationOverrideBatchPlan; receipt: ConfigurationOverrideReceipt } {
  const prepared = prepareBatch(options, targets)
  if (!('plan' in prepared) || prepared.plan.context !== context || !/^[a-f0-9]{64}$/.test(context)) throw new ConfigurationOverrideError('changed')
  return applyPrepared(prepared)
}

/** Refuses to overwrite any changes made after this repair. Backups remain available locally. */
export function rollbackConfigurationOverride(receipt: ConfigurationOverrideReceipt): void {
  const state = receipts.get(receipt)
  if (state === undefined || state.rolledBack) throw new ConfigurationOverrideError('changed')
  unchanged(state.backup)
  unchanged(state.after)
  save(state.after, state.before.contents)
  state.rolledBack = true
}
