import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadCatalog } from '../src/catalog.ts'
import { loadInstallPolicies, validateInstallPolicies } from '../scripts/install-policies.mjs'

const bundled = loadCatalog()
const skin = bundled.skins.find(entry => entry.install.npm !== undefined && (entry.install.companions?.length ?? 0) === 0)!
const observedAt = '2026-11-14T00:00:00.000Z'
const commit = 'b'.repeat(40)

function policy(overrides = {}) {
  return {
    schema: 'install-policy-v1',
    mode: 'npm',
    package: skin.package,
    resolved: { version: '0.0.1', commit, integrity: 'sha512-ZGVm', gitHead: commit, observedAt },
    ...overrides,
  }
}

function file(policies = { [skin.id]: policy() }) {
  return { schemaVersion: 1, generatedAt: observedAt, policies }
}

describe('build-side install policy validation', () => {
  it('accepts a complete release-observation file and sorts ids', () => {
    const other = { ...skin, id: 'a.other' }
    const sorted = validateInstallPolicies(file({
      [skin.id]: policy(),
      'a.other': { ...policy(), package: other.package },
    }), [...bundled.skins, other])
    expect(Object.keys(sorted)).toEqual(['a.other', skin.id])
  })

  it('accepts an omitted range but rejects one that excludes the resolved version', () => {
    expect(() => validateInstallPolicies(file(), bundled.skins)).not.toThrow()
    expect(() => validateInstallPolicies(file({ [skin.id]: policy({ range: '^9.0.0' }) }), bundled.skins)).toThrow('outside its range')
  })

  it.each([
    ['unknown skin', () => file({ 'missing.skin': policy() }), 'unknown skin'],
    ['missing integrity', () => file({ [skin.id]: policy({ resolved: { version: '0.0.1', commit, gitHead: commit, observedAt } }) }), 'no integrity'],
    ['bad commit', () => file({ [skin.id]: policy({ resolved: { version: '0.0.1', commit: 'abc', integrity: 'sha512-ZGVm', observedAt } }) }), 'invalid commit'],
    ['bad version', () => file({ [skin.id]: policy({ resolved: { version: 'latest', commit, integrity: 'sha512-ZGVm', observedAt } }) }), 'invalid version'],
    ['gitHead mismatch', () => file({ [skin.id]: policy({ resolved: { version: '0.0.1', commit, integrity: 'sha512-ZGVm', gitHead: 'c'.repeat(40), observedAt } }) }), 'gitHead'],
    ['unexpected field', () => file({ [skin.id]: { ...policy(), extra: true } }), 'unexpected field'],
    ['package mismatch', () => file({ [skin.id]: policy({ package: 'other' }) }), 'must reference package'],
  ])('rejects %s', (_label, makeFile, message) => {
    expect(() => validateInstallPolicies(makeFile(), bundled.skins)).toThrow(message)
  })

  it('rejects a malformed envelope', () => {
    expect(() => validateInstallPolicies([], bundled.skins)).toThrow('must be an object')
    expect(() => validateInstallPolicies({ schemaVersion: 2, generatedAt: observedAt, policies: {} }, bundled.skins)).toThrow('schema version')
    expect(() => validateInstallPolicies({ schemaVersion: 1, generatedAt: 'nope', policies: {} }, bundled.skins)).toThrow('generatedAt')
  })

  it('treats a missing policy file as "use v1 pins only"', async () => {
    const root = mkdtempSync(join(tmpdir(), 'skin-policies-none-'))
    await expect(loadInstallPolicies(root, bundled.skins)).resolves.toBeUndefined()
  })

  it('loads and validates a present policy file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'skin-policies-'))
    writeFileSync(join(root, 'package.json'), '{}')
    const { mkdirSync } = await import('node:fs')
    mkdirSync(join(root, 'data'))
    writeFileSync(join(root, 'data/install-policies.json'), JSON.stringify(file()))
    await expect(loadInstallPolicies(root, bundled.skins)).resolves.toEqual({ [skin.id]: policy() })
  })
})
