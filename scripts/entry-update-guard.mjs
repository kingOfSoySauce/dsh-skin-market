#!/usr/bin/env node
/**
 * Community entry-update guard.
 *
 * A community PR may either add one thin registry entry or update one entry it
 * already owns, plus that entry's own display copy in data/catalog-copy.json.
 * Merging the PR is the review, so this guard keeps the machine-owned parts of
 * an existing entry immutable and rejects anything the documented contract in
 * registry/submission-contract.json does not allow.
 *
 * The diff is computed from the PR merge-base, not from the base branch tip: a
 * branch created before main moved must not inherit unrelated main-side changes
 * (notably data/catalog.json) as if the PR had made them.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from 'yaml'
import { THIN_SUBMISSION_KEYS } from './hydrate-submission.mjs'
import { isVersionRange } from './version-range.mjs'
import { loadContract } from './submission-contract.mjs'
import { resolveScreenshotRef } from './screenshot-refs.mjs'
import {
  AUTHOR_COPY_POLICIES,
  AUTHOR_EDITABLE_COPY_KEYS,
  CATALOG_COPY_PATH,
  validateCatalogCopy,
} from './catalog-copy.mjs'

export const CATALOG_PATH = 'data/catalog.json'
export const COPY_PATH = CATALOG_COPY_PATH
export const REGISTRY_FILE_PATTERN = /^registry\/skins\/[^/]+\.yml$/
const REGISTRY_DIRECTORY = 'registry/skins'
const SCREENSHOT_REF_PATTERN = /^(https:\/\/|skin-screenshots\/)/
const CATEGORIES = ['skin', 'pet', 'player', 'splash']
const MODES = ['light', 'dark']
const COPY_METADATA_KEYS = ['source', 'override', 'nameSource']

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function has(object, key) {
  return isPlainObject(object) && Object.hasOwn(object, key)
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (isPlainObject(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalJson(value[key])]))
  return value
}

/** Structural comparison: key order is irrelevant, array order is not. */
export function deepEqual(left, right) {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right))
}

/**
 * Classify the PR's own changed files against the community rules.
 *
 * Allowed set: exactly one registry/skins/*.yml, optionally plus
 * data/catalog-copy.json. data/catalog.json is generated and always rejected.
 */
export function classifyChangedFiles(changedFiles = []) {
  const files = [...new Set(changedFiles.map(file => String(file).trim()).filter(Boolean))]
  const registryFiles = files.filter(file => REGISTRY_FILE_PATTERN.test(file))
  const nestedRegistry = files.filter(file => file.startsWith(`${REGISTRY_DIRECTORY}/`) && !REGISTRY_FILE_PATTERN.test(file))
  const copyChanged = files.includes(COPY_PATH)
  const catalogChanged = files.includes(CATALOG_PATH)
  const errors = []
  if (catalogChanged) errors.push(`${CATALOG_PATH} 是生成文件，社区 PR 不能修改；合并后由维护者重建目录。`)
  if (nestedRegistry.length > 0) errors.push(`${REGISTRY_DIRECTORY} 下只允许一个直接放置的 .yml 文件：${nestedRegistry.join('、')}`)
  const otherFiles = files.filter(file => file !== CATALOG_PATH && file !== COPY_PATH && !file.startsWith(`${REGISTRY_DIRECTORY}/`))
  if (otherFiles.length > 0) errors.push(`社区 PR 只允许一个 registry/skins/*.yml${copyChanged ? ' 和自己的 data/catalog-copy.json' : ''}，不允许修改：${otherFiles.join('、')}`)
  if (registryFiles.length === 0) errors.push('没有找到 registry/skins/*.yml 变更；社区 PR 必须更新恰好一个条目文件。')
  else if (registryFiles.length > 1) errors.push(`社区 PR 只能修改一个 registry/skins/*.yml，实际改了 ${registryFiles.length} 个：${registryFiles.join('、')}`)
  return { files, registryFiles, copyChanged, catalogChanged, errors }
}

function existingEntryUpdate(contract) {
  const update = contract?.existingEntryUpdate
  if (!isPlainObject(update)) throw new Error('submission contract 缺少 existingEntryUpdate 规则，无法校验社区更新')
  return update
}

function allowedRegistryFields(contract) {
  return existingEntryUpdate(contract).updateFields.filter(field => field !== COPY_PATH && field !== 'compatibility.dsh')
}

/** Human-readable list of the fields a community author may change. */
export function allowedFieldsText(contract) {
  return existingEntryUpdate(contract).updateFields.join('、')
}

function resolvedScreenshotPool(skin) {
  const values = []
  for (const list of [skin?.screenshots, skin?.marketScreenshots]) {
    if (!Array.isArray(list)) continue
    for (const value of list) if (typeof value === 'string') values.push(value)
  }
  return new Set(values.map(value => resolveScreenshotRef(value)))
}

function validateDisplayFields(skin, push, { complete = true } = {}) {
  const name = skin?.name
  if (name === undefined) {
    if (complete) push('name 必须同时包含 zh 和 en')
  } else if (!isPlainObject(name)) {
    push('name 必须是同时包含 zh 和 en 的对象')
  } else {
    for (const side of ['zh', 'en']) if (typeof name[side] !== 'string' || name[side].trim() === '') push(`name.${side} 必须是非空字符串`)
    const extras = Object.keys(name).filter(key => key !== 'zh' && key !== 'en')
    if (extras.length > 0) push(`name 只允许 zh 和 en，不能包含：${extras.join('、')}`)
  }
  if (complete || skin?.author !== undefined) {
    if (typeof skin.author !== 'string' || skin.author.trim() === '') push('author 必须是非空字符串')
  }
  if (complete || skin?.description !== undefined) {
    if (typeof skin.description !== 'string' || skin.description.trim() === '') push('description 必须是非空字符串')
  }
  if (skin?.category !== undefined && !CATEGORIES.includes(skin.category)) push('category 只能是 skin、pet、player 或 splash')
  if (complete || skin?.tags !== undefined) {
    const tags = skin?.tags
    if (!Array.isArray(tags) || tags.length === 0) push('tags 必须是非空字符串数组')
    else if (tags.some(tag => typeof tag !== 'string' || tag.trim() === '')) push('tags 必须是非空字符串数组')
    else if (new Set(tags).size !== tags.length) push('tags 不能重复')
  }
  if (complete || skin?.modes !== undefined) {
    const modes = skin?.modes
    if (!Array.isArray(modes) || modes.length === 0) push('modes 必须是 light、dark 的非空子集')
    else if (modes.some(mode => !MODES.includes(mode))) push('modes 只能是 light 或 dark')
    else if (new Set(modes).size !== modes.length) push('modes 不能重复')
  }
  if (complete || skin?.screenshots !== undefined) {
    const screenshots = skin?.screenshots
    if (!Array.isArray(screenshots)) push('screenshots 必须是图片地址数组')
    else {
      if (screenshots.length > 8) push('screenshots 最多 8 张')
      for (const [index, value] of screenshots.entries()) {
        if (typeof value !== 'string' || !SCREENSHOT_REF_PATTERN.test(value)) push(`screenshots[${index}] 必须是 https:// 或 skin-screenshots/ 开头的图片地址`)
      }
    }
  }
  if (skin?.marketScreenshots !== undefined) {
    const market = skin.marketScreenshots
    if (!Array.isArray(market) || market.length < 1 || market.length > 3) push('marketScreenshots 必须是 1 到 3 个图片地址')
    else {
      if (new Set(market).size !== market.length) push('marketScreenshots 不能重复')
      for (const [index, value] of market.entries()) {
        if (typeof value !== 'string' || !SCREENSHOT_REF_PATTERN.test(value)) push(`marketScreenshots[${index}] 必须是 https:// 或 skin-screenshots/ 开头的图片地址`)
      }
    }
  }
  if (skin?.listScreenshot !== undefined && (typeof skin.listScreenshot !== 'string' || !SCREENSHOT_REF_PATTERN.test(skin.listScreenshot))) {
    push('listScreenshot 必须是 https:// 或 skin-screenshots/ 开头的图片地址')
  }
}

function newEntryErrors(head) {
  const errors = []
  const push = message => errors.push(message)
  if (!isPlainObject(head)) {
    push('YAML 必须是对象')
    return errors
  }
  const extras = Object.keys(head).filter(key => !THIN_SUBMISSION_KEYS.includes(key))
  if (extras.length > 0) push(`新条目必须是薄条目，只允许 ${THIN_SUBMISSION_KEYS.join('、')}；不要写 ${extras.join('、')}（package、rowId、install、license、compatibility、commit 由 CI 补）`)
  if (typeof head.url !== 'string' || head.url.trim() === '') push('新条目必须写 url')
  else if (!/^https:\/\/github\.com\/[^/]+\/[^/]+/.test(head.url.trim())) push('url 必须是公开 GitHub 仓库或仓库子目录地址')
  if (head.subpath !== undefined && (typeof head.subpath !== 'string' || head.subpath.trim() === '')) push('subpath 必须是非空字符串')
  validateDisplayFields(head, push, { complete: false })
  return errors
}

function shouldKeepListScreenshot(base, head) {
  if (!has(head, 'listScreenshot')) return
  if (typeof head.listScreenshot !== 'string' || !SCREENSHOT_REF_PATTERN.test(head.listScreenshot)) return
  const cover = resolveScreenshotRef(head.listScreenshot)
  const headPool = resolvedScreenshotPool(head)
  if (headPool.has(cover)) return
  const baseCoverValid = typeof base.listScreenshot === 'string' && resolvedScreenshotPool(base).has(resolveScreenshotRef(base.listScreenshot))
  if (!baseCoverValid && deepEqual(base.listScreenshot, head.listScreenshot)) return
  return `listScreenshot 封面必须引用该条目 screenshots 或 marketScreenshots 里已有的图片地址；${head.listScreenshot} 不在其中`
}

/**
 * Validate an update to an entry that already exists at the merge-base.
 * Machine fields must be byte-identical (deep equal); only the fields listed in
 * registry/submission-contract.json existingEntryUpdate may change.
 */
export function existingEntryErrors({ file, base, head, contract } = {}) {
  const errors = []
  const push = message => errors.push(`${file ?? REGISTRY_DIRECTORY}：${message}`)
  if (!isPlainObject(head)) {
    push('YAML 必须是对象')
    return errors
  }
  if (!isPlainObject(base)) {
    push('无法读取 merge-base 中的条目，不能判断哪些字段被修改')
    return errors
  }
  const editable = new Set(allowedRegistryFields(contract))
  const keys = new Set([...Object.keys(base), ...Object.keys(head)])
  for (const key of keys) {
    if (editable.has(key) || key === 'compatibility') continue
    const baseHas = has(base, key)
    const headHas = has(head, key)
    if (!baseHas) {
      push(`不能新增字段 ${key}；已收录条目只能改 ${allowedFieldsText(contract)}`)
      continue
    }
    if (!headHas) {
      push(`不能删除字段 ${key}；已收录条目只能改 ${allowedFieldsText(contract)}`)
      continue
    }
    if (!deepEqual(base[key], head[key])) push(`字段 ${key} 属于 CI 机器字段，社区 PR 不能修改；已收录条目只能改 ${allowedFieldsText(contract)}`)
  }
  const baseCompat = base.compatibility
  const headCompat = head.compatibility
  if (!isPlainObject(headCompat)) {
    push('compatibility 必须是对象')
  } else if (!isPlainObject(baseCompat)) {
    push('无法读取 merge-base 的 compatibility，不能判断兼容字段是否被修改')
  } else {
    for (const key of new Set([...Object.keys(baseCompat), ...Object.keys(headCompat)])) {
      if (key === 'dsh') continue
      if (!deepEqual(baseCompat[key], headCompat[key])) push(`compatibility.${key} 属于 CI 机器字段，不能修改`)
    }
    if (!deepEqual(baseCompat.dsh, headCompat.dsh)) {
      const next = headCompat.dsh
      if (typeof next !== 'string' || next.trim() === '') push('compatibility.dsh 必须是非空的 semver 区间字符串')
      else if (next.trim() === 'unverified') push('compatibility.dsh 不能改回 unverified；请写合法 semver 区间，并在 PR 正文附固定 commit 的证据')
      else if (!isVersionRange(next.trim())) push(`compatibility.dsh 不是合法的 semver 区间：${next}`)
    }
  }
  for (const field of editable) {
    if (has(base, field) && !has(head, field) && field !== 'listScreenshot') push(`不能删除字段 ${field}`)
  }
  validateDisplayFields(head, push)
  const baseMarket = Array.isArray(base.marketScreenshots) ? base.marketScreenshots : null
  const headMarket = Array.isArray(head.marketScreenshots) ? head.marketScreenshots : null
  if (baseMarket !== null || headMarket !== null) {
    if (baseMarket === null || headMarket === null) {
      push('marketScreenshots 只允许重排已有展示图，集合不能变（不能新增或删除整个字段）')
    } else {
      const baseSet = new Set(baseMarket.map(value => resolveScreenshotRef(value)))
      const headSet = new Set(headMarket.map(value => resolveScreenshotRef(value)))
      if (baseSet.size !== headSet.size || [...baseSet].some(value => !headSet.has(value))) {
        push('marketScreenshots 只允许重排已有展示图，不能新增、删除或替换（集合必须保持不变）')
      }
    }
  }
  const coverError = shouldKeepListScreenshot(base, head)
  if (typeof coverError === 'string') push(coverError)
  if (typeof head.id !== 'string' || head.id.trim() === '') push('条目缺少 id')
  return errors
}

/**
 * Validate the optional data/catalog-copy.json change in the same PR.
 * Exactly one id may change and it must be the updated entry's own id. Existing
 * source/override/nameSource review metadata is immutable; new display copy may
 * only add name, description and descriptionPolicy.
 */
export function catalogCopyUpdateErrors({ baseCopy = null, headCopy = null, skinId, registryIds } = {}) {
  const errors = []
  const push = message => errors.push(`${COPY_PATH}：${message}`)
  if (headCopy === null || headCopy === undefined) {
    push('不能删除展示文案文件')
    return errors
  }
  const baseSkins = isPlainObject(baseCopy?.skins) ? baseCopy.skins : {}
  const headSkins = isPlainObject(headCopy?.skins) ? headCopy.skins : null
  if (headSkins === null) {
    push('必须包含 skins 对象')
    return errors
  }
  const effectiveIds = new Set(registryIds ?? [])
  // Display copy for an id whose registry entry was removed earlier is a known
  // legacy state; only newly introduced orphans should fail the PR.
  for (const id of Object.keys(baseSkins)) effectiveIds.add(id)
  for (const error of validateCatalogCopy(headCopy, effectiveIds)) errors.push(error)
  const ids = new Set([...Object.keys(baseSkins), ...Object.keys(headSkins)])
  const changed = [...ids].filter(id => !deepEqual(baseSkins[id], headSkins[id]))
  if (changed.length === 0) push('没有实际展示文案变化；不需要修改这个文件时请还原')
  else if (changed.length > 1) push(`一次只能改一个条目，实际改了：${changed.join('、')}`)
  const target = changed.length === 1 ? changed[0] : null
  if (target === null) return errors
  if (typeof skinId === 'string' && target !== skinId) push(`只能改被更新条目自己的 id（${skinId}），不能改 ${target}`)
  const baseEntry = baseSkins[target]
  const headEntry = headSkins[target]
  if (headEntry === undefined) {
    push(`不能删除条目 ${target} 的展示文案`)
    return errors
  }
  if (baseEntry === undefined) {
    const extras = Object.keys(headEntry).filter(key => !AUTHOR_EDITABLE_COPY_KEYS.includes(key))
    if (extras.length > 0) push(`新增展示文案只允许 ${AUTHOR_EDITABLE_COPY_KEYS.join('、')}，不能写 ${extras.join('、')}`)
    return errors
  }
  for (const key of COPY_METADATA_KEYS) {
    const baseHas = has(baseEntry, key)
    const headHas = has(headEntry, key)
    if (baseHas !== headHas || (baseHas && !deepEqual(baseEntry[key], headEntry[key]))) {
      push(`${key} 属于维护者元数据，作者更新必须保持原样（不能修改、新增或删除）`)
    }
  }
  const changedKeys = [...new Set([...Object.keys(baseEntry), ...Object.keys(headEntry)])].filter(key => !deepEqual(baseEntry[key], headEntry[key]))
  const illegal = changedKeys.filter(key => !AUTHOR_EDITABLE_COPY_KEYS.includes(key) && !COPY_METADATA_KEYS.includes(key))
  if (illegal.length > 0) push(`只能修改 ${AUTHOR_EDITABLE_COPY_KEYS.join('、')}，不能修改 ${illegal.join('、')}`)
  if (!deepEqual(baseEntry.descriptionPolicy, headEntry.descriptionPolicy) && !AUTHOR_COPY_POLICIES.includes(headEntry.descriptionPolicy)) {
    push(`descriptionPolicy 只能改成 ${AUTHOR_COPY_POLICIES.join(' 或 ')}（curate 是维护者审核状态）`)
  }
  return errors
}

/**
 * Full decision for one PR from its changed-file list and parsed base/head
 * content. Exported as a pure function so the guard rules can be tested
 * without creating a git repository.
 */
export function inspectEntryUpdate({
  changedFiles = [],
  contract,
  registryIds,
  baseRegistry = null,
  headRegistry = null,
  baseCatalogCopy = null,
  headCatalogCopy = null,
} = {}) {
  const classification = classifyChangedFiles(changedFiles)
  const errors = [...classification.errors]
  const registryFile = classification.registryFiles[0]
  const mode = baseRegistry === null || baseRegistry === undefined ? 'new' : 'update'
  if (registryFile === undefined) return { mode, registryFile, copyChanged: classification.copyChanged, errors }
  if (headRegistry === null || headRegistry === undefined) {
    errors.push(`${registryFile} 在 head 中不存在；社区 PR 只能新增或更新条目，不能删除条目`)
    return { mode, registryFile, copyChanged: classification.copyChanged, errors }
  }
  if (mode === 'new') {
    if (classification.copyChanged) errors.push(`新增条目的 PR 不能修改 ${COPY_PATH}；等条目收录后再单独更新展示文案`)
    errors.push(...newEntryErrors(headRegistry))
  } else {
    errors.push(...existingEntryErrors({ file: registryFile, base: baseRegistry, head: headRegistry, contract }))
    if (classification.copyChanged) {
      errors.push(...catalogCopyUpdateErrors({ baseCopy: baseCatalogCopy, headCopy: headCatalogCopy, skinId: headRegistry?.id, registryIds }))
    }
  }
  return { mode, registryFile, copyChanged: classification.copyChanged, errors }
}

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function gitTry(root, args) {
  try {
    return git(root, args)
  } catch {
    return null
  }
}

function parseYamlText(text, file) {
  let value
  try {
    value = parse(text)
  } catch (error) {
    throw new Error(`${file} 不是合法的 YAML：${error instanceof Error ? error.message : String(error)}`)
  }
  if (!isPlainObject(value)) throw new Error(`${file} 必须是 YAML 对象`)
  return value
}

function parseJsonText(text, file) {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${file} 不是合法的 JSON：${error instanceof Error ? error.message : String(error)}`)
  }
}

function worktreeRegistryIds(root, extraId) {
  const ids = new Set()
  let names = []
  try {
    names = readdirSync(join(root, REGISTRY_DIRECTORY)).filter(name => name.endsWith('.yml'))
  } catch {
    names = []
  }
  for (const name of names) {
    try {
      const skin = parse(readFileSync(join(root, REGISTRY_DIRECTORY, name), 'utf8'))
      if (typeof skin?.id === 'string') ids.add(skin.id)
    } catch {
      // A broken unrelated entry is reported by registry:check; ignore it here.
    }
  }
  if (typeof extraId === 'string') ids.add(extraId)
  return ids
}

function argumentValue(argv, name) {
  const index = argv.indexOf(name)
  return index < 0 ? undefined : argv[index + 1]
}

async function main(argv) {
  const base = argumentValue(argv, '--base') ?? process.env.BASE_SHA
  const head = argumentValue(argv, '--head') ?? process.env.HEAD_SHA
  if (typeof base !== 'string' || base.trim() === '' || typeof head !== 'string' || head.trim() === '') {
    console.error('用法：node scripts/entry-update-guard.mjs --base <base sha> --head <head sha> [--cwd <repo>]')
    console.error('也可以使用 BASE_SHA 和 HEAD_SHA 环境变量。')
    process.exitCode = 2
    return
  }
  const root = resolve(argumentValue(argv, '--cwd') ?? process.cwd())
  let mergeBase
  try {
    mergeBase = git(root, ['merge-base', base.trim(), head.trim()]).trim()
  } catch {
    mergeBase = ''
  }
  if (mergeBase === '') {
    console.error('无法计算 PR 的 merge-base。请确认 checkout 使用 fetch-depth: 0，且 BASE_SHA/HEAD_SHA 是本次 PR 的 base/head commit。')
    process.exitCode = 2
    return
  }
  const changedFiles = git(root, ['diff', '--name-only', '--no-renames', mergeBase, head.trim()])
    .split('\n')
    .map(file => file.trim())
    .filter(Boolean)
  const classification = classifyChangedFiles(changedFiles)
  const contract = await loadContract()
  const registryFile = classification.registryFiles[0]
  let baseRegistry = null
  let headRegistry = null
  let baseCatalogCopy = null
  let headCatalogCopy = null
  try {
    if (registryFile !== undefined) {
      const baseText = gitTry(root, ['show', `${mergeBase}:${registryFile}`])
      const headText = gitTry(root, ['show', `${head.trim()}:${registryFile}`])
      baseRegistry = baseText === null ? null : parseYamlText(baseText, registryFile)
      headRegistry = headText === null ? null : parseYamlText(headText, registryFile)
    }
    if (classification.copyChanged) {
      const baseText = gitTry(root, ['show', `${mergeBase}:${COPY_PATH}`])
      const headText = gitTry(root, ['show', `${head.trim()}:${COPY_PATH}`])
      baseCatalogCopy = baseText === null ? null : parseJsonText(baseText, COPY_PATH)
      headCatalogCopy = headText === null ? null : parseJsonText(headText, COPY_PATH)
    }
  } catch (error) {
    console.error(`错误：${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
    return
  }
  const registryIds = worktreeRegistryIds(root, headRegistry?.id)
  let result
  try {
    result = inspectEntryUpdate({ changedFiles, contract, registryIds, baseRegistry, headRegistry, baseCatalogCopy, headCatalogCopy })
  } catch (error) {
    console.error(`错误：${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
    return
  }
  if (result.errors.length > 0) {
    console.error(`社区 PR 条目更新校验未通过（${result.errors.length} 项）：`)
    for (const error of result.errors) console.error(`  - ${error}`)
    console.error(`允许修改：${allowedFieldsText(contract)}`)
    console.error('新条目只能新增一个薄条目 YAML，并且不能修改 data/catalog-copy.json。')
    process.exitCode = 1
    return
  }
  const kind = result.mode === 'new' ? '新薄条目' : '已收录条目更新'
  console.log(`✓ 社区 PR 校验通过：${kind} ${result.registryFile}${result.copyChanged ? ` + ${COPY_PATH}` : ''}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}