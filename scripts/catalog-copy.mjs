/**
 * Structural validation for `data/catalog-copy.json`.
 *
 * The file is maintainer-authored display-copy input, not a community registry
 * file: `registry/skins/*.yml` stays the compatibility source and the copy
 * file only holds the approved Chinese/English display text. Validation here is
 * deliberately structural — it checks shape, known keys, policy consistency and
 * that every id still exists in the registry. Copy quality is reviewed in the
 * private ops pipeline and is not judged by the public build.
 */
export const CATALOG_COPY_PATH = 'data/catalog-copy.json'

/** Authoring keys the private review pipeline may store for an entry. */
export const AUTHORING_KEYS = ['name', 'description', 'descriptionPolicy', 'source', 'override', 'nameSource']

/** Keys an author may add/change for their own entry in a community PR. */
export const AUTHOR_EDITABLE_COPY_KEYS = ['name', 'description', 'descriptionPolicy']

/**
 * `show` and `omit` are the runtime policies. `curate` is an authoring review
 * state that the wire catalog projects to `show`; the public build must keep
 * accepting it because approved entries still carry it.
 */
export const DESCRIPTION_POLICIES = ['show', 'curate', 'omit']

/** Policies a community author may write; `curate` is maintainer-only. */
export const AUTHOR_COPY_POLICIES = ['show', 'omit']

const NAME_KEYS = ['zh', 'en']
const SOURCE_KEYS = ['kind', 'hash', 'approvedAt']

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unknownKeys(value, allowed) {
  return Object.keys(value).filter(key => !allowed.includes(key))
}

function normalizeRegistryIds(registryIds) {
  if (registryIds === undefined || registryIds === null) throw new TypeError(`${CATALOG_COPY_PATH} 校验需要调用方传入 registry id 集合`)
  return registryIds instanceof Set ? registryIds : new Set(registryIds)
}

function validateLocalizedPair(label, value, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${label} 必须是同时包含 zh 和 en 的对象`)
    return false
  }
  const extras = unknownKeys(value, NAME_KEYS)
  if (extras.length) errors.push(`${label} 只允许 zh 和 en 两个键，发现：${extras.join('、')}`)
  let ok = true
  for (const side of NAME_KEYS) {
    if (typeof value[side] !== 'string' || value[side].trim() === '') {
      errors.push(`${label}.${side} 必须是非空字符串`)
      ok = false
    }
  }
  return ok
}

function validateEntry(id, entry, registryIds, { allowUnknownIds = false } = {}) {
  const errors = []
  const prefix = `${CATALOG_COPY_PATH} ${id}`
  if (!isPlainObject(entry)) {
    errors.push(`${prefix}: 条目必须是对象`)
    return errors
  }
  if (!allowUnknownIds && !registryIds.has(id)) errors.push(`${prefix}: 在 registry/skins 中找不到这个 id，请先收录条目再写展示文案`)
  for (const key of unknownKeys(entry, AUTHORING_KEYS)) {
    errors.push(`${prefix}: 未知键 ${key}；只允许 ${AUTHORING_KEYS.join('、')}`)
  }
  validateLocalizedPair(`${prefix}: name`, entry.name, errors)

  if (!Object.hasOwn(entry, 'descriptionPolicy')) {
    errors.push(`${prefix}: 缺少 descriptionPolicy（允许 ${DESCRIPTION_POLICIES.join('、')}）`)
  } else if (!DESCRIPTION_POLICIES.includes(entry.descriptionPolicy)) {
    errors.push(`${prefix}: descriptionPolicy 必须是 ${DESCRIPTION_POLICIES.join('、')}，实际是 ${String(entry.descriptionPolicy)}`)
  } else if (entry.descriptionPolicy === 'omit') {
    if (Object.hasOwn(entry, 'description')) errors.push(`${prefix}: descriptionPolicy=omit 时不能保留 description`)
  } else if (!validateLocalizedPair(`${prefix}: description`, entry.description, errors)) {
    errors.push(`${prefix}: descriptionPolicy=${entry.descriptionPolicy} 时必须提供双语 description.zh 和 description.en`)
  }

  if (Object.hasOwn(entry, 'source')) {
    if (!isPlainObject(entry.source)) {
      errors.push(`${prefix}: source 必须是对象`)
    } else {
      for (const key of unknownKeys(entry.source, SOURCE_KEYS)) errors.push(`${prefix}: source 未知键 ${key}；只允许 ${SOURCE_KEYS.join('、')}`)
      for (const key of SOURCE_KEYS) {
        if (entry.source[key] !== undefined && (typeof entry.source[key] !== 'string' || entry.source[key].trim() === '')) {
          errors.push(`${prefix}: source.${key} 必须是非空字符串`)
        }
      }
    }
  }
  if (Object.hasOwn(entry, 'override') && typeof entry.override !== 'boolean') errors.push(`${prefix}: override 必须是布尔值`)
  if (Object.hasOwn(entry, 'nameSource') && (typeof entry.nameSource !== 'string' || entry.nameSource.trim() === '')) {
    errors.push(`${prefix}: nameSource 必须是非空字符串`)
  }
  return errors
}

/**
 * Validate one `data/catalog-copy.json` entry. `registryIds` must contain the
 * ids currently present in `registry/skins` so orphan copy entries fail the
 * build instead of silently disappearing from the wire catalog.
 *
 * @returns {string[]} Chinese, actionable errors (empty when valid).
 */
export function validateCatalogCopyEntry(id, entry, registryIds, options = {}) {
  return validateEntry(String(id), entry, normalizeRegistryIds(registryIds), options)
}

/**
 * Validate the whole file. Every id must exist in the registry; unknown keys,
 * missing bilingual text and show/omit inconsistencies are rejected.
 *
 * @returns {string[]} Chinese, actionable errors (empty when valid).
 */
export function validateCatalogCopy(copy, registryIds, options = {}) {
  const ids = normalizeRegistryIds(registryIds)
  if (!isPlainObject(copy)) return [`${CATALOG_COPY_PATH} 顶层必须是对象`]
  if (!isPlainObject(copy.skins)) return [`${CATALOG_COPY_PATH} 必须包含 skins 对象`]
  const errors = []
  for (const [id, entry] of Object.entries(copy.skins)) errors.push(...validateEntry(id, entry, ids, options))
  return errors
}

/** Throw one aggregated, readable error when the display-copy file is invalid. */
export function assertCatalogCopy(copy, registryIds, options = {}) {
  const errors = validateCatalogCopy(copy, registryIds, options)
  if (errors.length === 0) return
  throw new Error(`${CATALOG_COPY_PATH} 校验失败（${errors.length} 项）：\n- ${errors.join('\n- ')}`)
}
