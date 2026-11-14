import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isVersionRange, parseVersion, satisfiesVersionRange } from './version-range.mjs'

export const INSTALL_POLICY_PATH = 'data/install-policies.json'
const POLICY_FIELDS = ['schema', 'mode', 'package', 'range', 'resolved']
const RESOLVED_FIELDS = ['version', 'commit', 'integrity', 'gitHead', 'observedAt']

function isRecord(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function assertKeys(value, allowed, label) {
  const unexpected = Object.keys(value).filter(key => !allowed.includes(key))
  if (unexpected.length > 0) throw new Error(`${label}: unexpected field ${unexpected.join(', ')}`)
}

/**
 * Validate one release observation.
 *
 * The catalog builder is stricter than the runtime decoder on purpose: bad
 * policy data must fail the build instead of shipping and silently degrading
 * on users' machines.
 */
export function validateInstallPolicy(value, skin) {
  if (!isRecord(value)) throw new Error(`install policy for ${skin.id} must be an object`)
  assertKeys(value, POLICY_FIELDS, `install policy for ${skin.id}`)
  if (value.schema !== 'install-policy-v1') throw new Error(`install policy for ${skin.id} has an unsupported schema`)
  if (value.mode !== 'npm' && value.mode !== 'github') throw new Error(`install policy for ${skin.id} has an unsupported mode`)
  if (typeof value.package !== 'string' || value.package !== skin.package) {
    throw new Error(`install policy for ${skin.id} must reference package ${skin.package}`)
  }
  if (value.range !== undefined) {
    if (typeof value.range !== 'string' || value.range.trim() === 'unverified' || !isVersionRange(value.range)) {
      throw new Error(`install policy for ${skin.id} has an invalid range`)
    }
  }
  const resolved = value.resolved
  if (!isRecord(resolved)) throw new Error(`install policy for ${skin.id} is missing its resolved artifact`)
  assertKeys(resolved, RESOLVED_FIELDS, `install policy resolved artifact for ${skin.id}`)
  if (typeof resolved.version !== 'string' || parseVersion(resolved.version) === null) {
    throw new Error(`install policy for ${skin.id} has an invalid version`)
  }
  if (typeof resolved.commit !== 'string' || !/^[0-9a-f]{40}$/.test(resolved.commit)) {
    throw new Error(`install policy for ${skin.id} has an invalid commit`)
  }
  if (typeof resolved.observedAt !== 'string' || !Number.isFinite(Date.parse(resolved.observedAt))) {
    throw new Error(`install policy for ${skin.id} has an invalid observedAt`)
  }
  if (resolved.gitHead !== undefined
    && (typeof resolved.gitHead !== 'string' || resolved.gitHead.toLowerCase() !== resolved.commit)) {
    throw new Error(`install policy for ${skin.id} has a gitHead that does not match its commit`)
  }
  if (resolved.integrity !== undefined
    && (typeof resolved.integrity !== 'string' || !/^sha(1|256|384|512)-[A-Za-z0-9+/]+={0,2}$/.test(resolved.integrity))) {
    throw new Error(`install policy for ${skin.id} has an invalid integrity`)
  }
  if (value.mode === 'npm' && resolved.integrity === undefined) {
    throw new Error(`install policy for ${skin.id} is npm but has no integrity`)
  }
  if (value.range !== undefined && !satisfiesVersionRange(resolved.version, value.range)) {
    throw new Error(`install policy for ${skin.id} resolves a version outside its range`)
  }
  return {
    schema: 'install-policy-v1',
    mode: value.mode,
    package: value.package,
    ...(value.range === undefined ? {} : { range: value.range }),
    resolved: {
      version: resolved.version,
      commit: resolved.commit,
      ...(resolved.integrity === undefined ? {} : { integrity: resolved.integrity }),
      ...(resolved.gitHead === undefined ? {} : { gitHead: resolved.gitHead }),
      observedAt: resolved.observedAt,
    },
  }
}

/** Validate the optional release-observation file; absent means "use v1 pins only". */
export function validateInstallPolicies(value, skins) {
  if (!isRecord(value)) throw new Error('install policies must be an object')
  assertKeys(value, ['schemaVersion', 'generatedAt', 'policies'], 'install policies')
  if (value.schemaVersion !== 1) throw new Error('unsupported install policies schema version')
  if (typeof value.generatedAt !== 'string' || !Number.isFinite(Date.parse(value.generatedAt))) {
    throw new Error('install policies generatedAt is invalid')
  }
  if (!isRecord(value.policies)) throw new Error('install policies must contain a policies object')
  const byId = new Map(skins.map(skin => [skin.id, skin]))
  const policies = {}
  for (const [id, policy] of Object.entries(value.policies)) {
    const skin = byId.get(id)
    if (skin === undefined) throw new Error(`install policy references unknown skin: ${id}`)
    policies[id] = validateInstallPolicy(policy, skin)
  }
  return Object.fromEntries(Object.entries(policies).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0))
}

export async function loadInstallPolicies(root, skins) {
  const file = join(root, INSTALL_POLICY_PATH)
  if (!existsSync(file)) return undefined
  let parsed
  try {
    parsed = JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    throw new Error(`${INSTALL_POLICY_PATH}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return validateInstallPolicies(parsed, skins)
}
