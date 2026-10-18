import * as fs from 'node:fs'
import { chmodSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { applyConfigurationOverride, applyConfigurationOverrides, ConfigurationOverrideError, inspectConfigurationOverride, inspectConfigurationOverrides, rollbackConfigurationOverride, type ConfigurationOverrideOptions, type ConfigurationOverrideTarget } from '../src/configuration-override.ts'

const race = vi.hoisted(() => ({ file: '', value: '' }))
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    openSync: (...args: Parameters<typeof actual.openSync>) => {
      const descriptor = actual.openSync(...args)
      if (race.file !== '' && String(args[0]).endsWith('.tmp')) {
        actual.writeFileSync(race.file, race.value)
        race.file = ''
      }
      return descriptor
    },
  }
})

const target: ConfigurationOverrideTarget = { skinId: 'example.skin', packageName: '@example/skin', rowId: 'skin-main', enabled: true }
const homes: string[] = []
function fixture(source?: string): { home: string; file: string; options: ConfigurationOverrideOptions } {
  // homeIdentity requires realpath(home) === resolve(home); macOS tmpdir is under /var → /private/var.
  const home = mkdtempSync(join(realpathSync(tmpdir()), 'dsh-configuration-override-'))
  homes.push(home)
  const file = join(home, 'cordis.patch.yml')
  if (source !== undefined) writeFileSync(file, source)
  return { home, file, options: { home, patchPath: join(home, 'profiles', 'desktop', 'cordis.patch.yml'), overlays: [] } }
}
function approved(source: string, requested = target) {
  const setup = fixture(source)
  const plan = inspectConfigurationOverride(setup.options, requested)
  expect(plan.status).toBe('repairable')
  expect(plan.context).toMatch(/^[a-f0-9]{64}$/)
  return { ...setup, plan }
}

afterEach(() => {
  race.file = ''
  race.value = ''
  vi.restoreAllMocks()
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true })
})

describe('trusted shared configuration override plans', () => {
  it('removes only a rich target disabled field and keeps exact unrelated bytes', () => {
    const source = '# shared preferences\n- id: other\n  disabled: true\n# target reason\n- id: skin-main # identity\n  name: "@example/skin"\n  disabled: true # keep this explanation\n  config:\n    privateMarker: synthetic-private-marker\n    nested: [a, b]\n# footer\n'
    const { file, options, plan } = approved(source)
    expect(plan).toMatchObject({ source: 'home', file, rowId: target.rowId, previousDisabled: true, desiredEnabled: true, sharedAcrossProfiles: true })
    expect(JSON.stringify(plan)).not.toContain('privateMarker')
    expect(JSON.stringify(plan)).not.toContain('synthetic-private-marker')
    const { receipt } = applyConfigurationOverride(options, target, plan.context!)
    expect(readFileSync(file, 'utf8')).toBe(source.replace('  disabled: true # keep this explanation\n', '# keep this explanation\n'))
    expect(readFileSync(receipt.backupPath, 'utf8')).toBe(source)
    expect(lstatSync(receipt.backupPath).mode & 0o777).toBe(0o600)
    expect(JSON.stringify(receipt)).not.toContain('synthetic-private-marker')
    expect(inspectConfigurationOverride(options, target).status).toBe('none')
    rollbackConfigurationOverride(receipt)
    expect(readFileSync(file, 'utf8')).toBe(source)
    expect(() => rollbackConfigurationOverride(receipt)).toThrow(ConfigurationOverrideError)
  })

  it('preserves plugin config identifiers without treating them as Loader identities', () => {
    const source = '- id: skin-main\n  disabled: true\n  config:\n    entity: { id: 123 }\n    display: { id: skin-main }\n'
    const { file, options, plan } = approved(source)
    applyConfigurationOverride(options, target, plan.context!)
    expect(readFileSync(file, 'utf8')).toBe(source.replace('  disabled: true\n', ''))
  })

  it('removes a pure toggle while preserving adjacent, internal, and inline comments', () => {
    const source = '# file header\n- id: other\n  disabled: true\n# before target\n- id: skin-main # keep identity note\n  # inside target\n  disabled: true # keep disabled note\n# after target\n- id: final\n  config: { value: 1 }\n'
    const { file, options, plan } = approved(source)
    applyConfigurationOverride(options, target, plan.context!)
    expect(readFileSync(file, 'utf8')).toBe('# file header\n- id: other\n  disabled: true\n# before target\n# keep identity note\n  # inside target\n# keep disabled note\n# after target\n- id: final\n  config: { value: 1 }\n')
    expect(parse(readFileSync(file, 'utf8'))).toEqual([{ id: 'other', disabled: true }, { id: 'final', config: { value: 1 } }])
  })

  it('keeps a valid empty sequence when removing the only row and preserves CRLF', () => {
    const { file, options, plan } = approved('# header\r\n- id: skin-main\r\n  disabled: true # reason\r\n# footer\r\n')
    applyConfigurationOverride(options, target, plan.context!)
    expect(readFileSync(file, 'utf8')).toBe('# header\r\n# reason\r\n# footer\r\n[]\r\n')
    expect(parse(readFileSync(file, 'utf8'))).toEqual([])
  })

  it('repairs a forced enabled override when the user wants to deactivate', () => {
    const requested = { ...target, enabled: false }
    const { file, options, plan } = approved('- id: skin-main\n  name: "@example/skin"\n  disabled: false\n  config:\n    accent: blue\n', requested)
    expect(plan.previousDisabled).toBe(false)
    expect(plan.desiredEnabled).toBe(false)
    applyConfigurationOverride(options, requested, plan.context!)
    expect(parse(readFileSync(file, 'utf8'))).toEqual([{ id: 'skin-main', name: '@example/skin', config: { accent: 'blue' } }])
  })

  it('promotes the next key when disabled is the first field of a rich row', () => {
    const { file, options, plan } = approved('- disabled: true # reason\n  # next key\n  id: skin-main\n  name: "@example/skin"\n  config: { color: blue }\n')
    applyConfigurationOverride(options, target, plan.context!)
    expect(readFileSync(file, 'utf8')).toBe('# reason\n  # next key\n- id: skin-main\n  name: "@example/skin"\n  config: { color: blue }\n')
    expect(parse(readFileSync(file, 'utf8'))).toEqual([{ id: 'skin-main', name: '@example/skin', config: { color: 'blue' } }])
  })

  it.each([
    '[]\n',
    '- id: other\n  disabled: true\n',
    '- id: skin-main\n  config: { color: blue }\n',
    '- id: skin-main\n  disabled: false\n',
    '- insert:\n    - id: other\n      name: unrelated-plugin\n',
  ])('does not manufacture a repair for %j', source => {
    const { file, options, home } = fixture(source)
    expect(inspectConfigurationOverride(options, target).status).toBe('none')
    expect(() => applyConfigurationOverride(options, target, 'a'.repeat(64))).toThrow(ConfigurationOverrideError)
    expect(readFileSync(file, 'utf8')).toBe(source)
    expect(readdirSync(home)).toEqual(['cordis.patch.yml'])
  })

  it.each([
    '- id: skin-main\n  disabled: true\n- id: skin-main\n  disabled: true\n',
    '- id: skin-main\n  name: other-package\n  disabled: true\n',
    '- id: skin-main\n  name: ["@example/skin"]\n  disabled: true\n',
    '- id: skin-main\n  disabled: "true"\n',
    '- id: skin-main\n  disabled: !!js process.exit(1)\n',
    '- id: !!js chooseId()\n  disabled: true\n',
    '- id: "${dynamicId}"\n  disabled: true\n',
    '- id: skin-main\n  disabled: true\n  disabled: false\n',
    '- id: &identity skin-main\n  disabled: true\n',
    '- id: other\n  config: &shared { value: 1 }\n- id: skin-main\n  disabled: true\n  config: *shared\n',
    '- id: skin-main\n  <<: { disabled: true }\n',
    '- insert:\n    - id: skin-main\n      name: "@example/skin"\n      disabled: true\n',
    '- id: skin-main\n  insert: []\n  disabled: true\n',
    '- id: group\n  group: true\n  config:\n    - id: skin-main\n      disabled: true\n',
    '- id: skin-main\n  group: true\n  disabled: true\n',
    '- unknown: true\n- id: skin-main\n  disabled: true\n',
    '- insert: true\n- id: skin-main\n  disabled: true\n',
    '[{id: skin-main, disabled: true}]\n',
    '- {id: skin-main, disabled: true}\n',
    '- id: skin-main\n  disabled: true\n...\n',
    '- id: skin-main\n  disabled: true\n---\n[]\n',
    '- id: skin-main\n  disabled: [unterminated\n',
    'id: skin-main\ndisabled: true\n',
  ])('blocks ambiguous or executable configuration without changing bytes: %j', source => {
    const { file, options, home } = fixture(source)
    const plan = inspectConfigurationOverride(options, target)
    expect(plan.status).toBe('blocked')
    expect(plan.context).toBeUndefined()
    expect(plan.reason).not.toContain('process.exit')
    expect(readFileSync(file, 'utf8')).toBe(source)
    expect(readdirSync(home)).toEqual(['cordis.patch.yml'])
  })

  it('requires Host-provided absolute home and no launch overlay', () => {
    const { file, options } = fixture('- id: skin-main\n  disabled: true\n')
    for (const change of [{ home: undefined }, { home: '' }, { home: '.' }, { overlays: ['startup-patch'] }, { patchPath: file }]) {
      expect(inspectConfigurationOverride({ ...options, ...change }, target).status).toBe('blocked')
    }
    expect(readFileSync(file, 'utf8')).toContain('disabled: true')
  })

  it('reports an absent home patch without creating a file', () => {
    const { file, options, home } = fixture()
    expect(inspectConfigurationOverride(options, target).status).toBe('none')
    expect(existsSync(file)).toBe(false)
    expect(readdirSync(home)).toEqual([])
  })

  it('blocks read-only files and symlinked file or home paths', () => {
    const { file, options, home } = fixture('- id: skin-main\n  disabled: true\n')
    chmodSync(file, 0o444)
    expect(inspectConfigurationOverride(options, target).status).toBe('blocked')
    chmodSync(file, 0o600)
    const linked = join(home, 'actual.yml')
    fs.renameSync(file, linked)
    symlinkSync(linked, file)
    expect(inspectConfigurationOverride(options, target).status).toBe('blocked')
    const alias = join(fixture().home, 'alias')
    symlinkSync(home, alias)
    expect(inspectConfigurationOverride({ home: alias }, target).status).toBe('blocked')
    expect(readFileSync(linked, 'utf8')).toContain('disabled: true')
  })

  it('blocks a shared directory with no write permissions', () => {
    const { file, options, home } = fixture('- id: skin-main\n  disabled: true\n')
    chmodSync(home, 0o500)
    try {
      expect(inspectConfigurationOverride(options, target).status).toBe('blocked')
      expect(readFileSync(file, 'utf8')).toContain('disabled: true')
    } finally { chmodSync(home, 0o700) }
  })

  it('preserves the existing file mode and keeps backups private', () => {
    const { file, options, plan } = approved('- id: skin-main\n  disabled: true\n')
    chmodSync(file, 0o640)
    const fresh = inspectConfigurationOverride(options, target)
    expect(fresh.context).not.toBe(plan.context)
    const { receipt } = applyConfigurationOverride(options, target, fresh.context!)
    expect(lstatSync(file).mode & 0o777).toBe(0o640)
    expect(lstatSync(receipt.backupPath).mode & 0o777).toBe(0o600)
    rollbackConfigurationOverride(receipt)
    expect(lstatSync(file).mode & 0o777).toBe(0o640)
  })

  it('binds approval to the target, direction, exact file bytes, and trusted source', () => {
    const setup = approved('- id: skin-main\n  disabled: true\n')
    const duplicate = fixture('- id: skin-main\n  disabled: true\n')
    expect(() => applyConfigurationOverride(setup.options, { ...target, enabled: false }, setup.plan.context!)).toThrow(ConfigurationOverrideError)
    expect(() => applyConfigurationOverride(setup.options, { ...target, skinId: 'another.skin' }, setup.plan.context!)).toThrow(ConfigurationOverrideError)
    expect(() => applyConfigurationOverride(duplicate.options, target, setup.plan.context!)).toThrow(ConfigurationOverrideError)
    writeFileSync(setup.file, '# changed\n- id: skin-main\n  disabled: true\n')
    expect(() => applyConfigurationOverride(setup.options, target, setup.plan.context!)).toThrow(ConfigurationOverrideError)
    expect(readFileSync(setup.file, 'utf8')).toContain('# changed')
    expect(readdirSync(setup.home)).toEqual(['cordis.patch.yml'])
  })

  it('refuses a concurrent edit during the atomic save and cleans its temporary file', () => {
    const { file, options, plan, home } = approved('- id: skin-main\n  disabled: true\n')
    race.file = file
    race.value = '# someone else\n- id: skin-main\n  disabled: true\n'
    expect(() => applyConfigurationOverride(options, target, plan.context!)).toThrow(ConfigurationOverrideError)
    expect(readFileSync(file, 'utf8')).toContain('# someone else')
    expect(readdirSync(home)).toEqual(['cordis.patch.yml'])
  })

  it('refuses rollback when another writer changed the repaired file or backup', () => {
    const first = approved('- id: skin-main\n  disabled: true\n')
    const applied = applyConfigurationOverride(first.options, target, first.plan.context!)
    writeFileSync(first.file, '# external change\n[]\n')
    expect(() => rollbackConfigurationOverride(applied.receipt)).toThrow(ConfigurationOverrideError)
    expect(readFileSync(first.file, 'utf8')).toBe('# external change\n[]\n')
    const second = approved('- id: skin-main\n  disabled: true\n')
    const another = applyConfigurationOverride(second.options, target, second.plan.context!)
    writeFileSync(another.receipt.backupPath, '[]\n')
    expect(() => rollbackConfigurationOverride(another.receipt)).toThrow(ConfigurationOverrideError)
    expect(readFileSync(second.file, 'utf8')).toBe('[]\n')
  })

  it('rejects forged receipts and malformed targets without exposing configuration', () => {
    expect(() => rollbackConfigurationOverride({ backupPath: '/private/tmp/untrusted' })).toThrow(ConfigurationOverrideError)
    const { options } = fixture('- id: skin-main\n  disabled: true\n')
    expect(inspectConfigurationOverride(options, { ...target, rowId: '../unexpected\nrow' }).status).toBe('blocked')
    expect(() => applyConfigurationOverride(options, target, '')).toThrow(ConfigurationOverrideError)
  })
})

describe('atomic shared configuration override batches', () => {
  const oldTarget: ConfigurationOverrideTarget = { skinId: 'old.skin', packageName: '@example/old', rowId: 'old-main', enabled: false }
  const both = [oldTarget, target]
  const source = '# header\n- id: unrelated\n  disabled: true # unrelated\n# old skin\n- id: old-main\n  name: "@example/old"\n  disabled: false # old override\n  config: { accent: blue }\n# new skin\n- id: skin-main # target identity\n  disabled: true # target override\n# footer\n'

  it('inspects one source snapshot and applies both directions in one replacement and backup', () => {
    const { home, file, options } = fixture(source)
    const read = vi.spyOn(fs, 'readFileSync')
    const plan = inspectConfigurationOverrides(options, both)
    expect(read).toHaveBeenCalledTimes(1)
    read.mockRestore()
    expect(plan.status).toBe('repairable')
    expect(plan.context).toMatch(/^[a-f0-9]{64}$/)
    expect(plan.changes).toEqual([
      expect.objectContaining({ skinId: target.skinId, rowId: target.rowId, previousDisabled: true, desiredEnabled: true }),
      expect.objectContaining({ skinId: oldTarget.skinId, rowId: oldTarget.rowId, previousDisabled: false, desiredEnabled: false }),
    ])
    expect(plan.changes.every(change => change.context === undefined)).toBe(true)
    expect(JSON.stringify(plan)).not.toContain('accent')
    const replacement = vi.spyOn(fs, 'renameSync')
    const { receipt } = applyConfigurationOverrides(options, both, plan.context!)
    expect(replacement).toHaveBeenCalledTimes(1)
    expect(readdirSync(home).filter(name => name.endsWith('.backup'))).toEqual([receipt.backupPath.split('/').at(-1)])
    expect(lstatSync(receipt.backupPath).mode & 0o777).toBe(0o600)
    expect(readFileSync(receipt.backupPath, 'utf8')).toBe(source)
    const result = source.replace('  disabled: false # old override\n', '# old override\n')
      .replace('- id: skin-main # target identity\n  disabled: true # target override\n', '# target identity\n# target override\n')
    expect(readFileSync(file, 'utf8')).toBe(result)
    expect(parse(result)).toEqual([{ id: 'unrelated', disabled: true }, { id: 'old-main', name: '@example/old', config: { accent: 'blue' } }])
    rollbackConfigurationOverride(receipt)
    expect(readFileSync(file, 'utf8')).toBe(source)
  })

  it('treats target order as a set without weakening approval binding', () => {
    const { file, options } = fixture(source)
    const first = inspectConfigurationOverrides(options, both)
    const reordered = inspectConfigurationOverrides(options, [...both].reverse())
    expect(first.context).toBe(reordered.context)
    expect(first.changes).toEqual(reordered.changes)
    applyConfigurationOverrides(options, [...both].reverse(), first.context!)
    expect(readFileSync(file, 'utf8')).not.toContain('disabled: false')
    expect(readFileSync(file, 'utf8')).not.toContain('id: skin-main')
  })

  it('keeps no-change targets in the batch binding while exposing only actual removals', () => {
    const { file, options, home } = fixture('- id: skin-main\n  disabled: true\n')
    const plan = inspectConfigurationOverrides(options, both)
    expect(plan.status).toBe('repairable')
    expect(plan.changes).toHaveLength(1)
    expect(plan.changes[0].skinId).toBe(target.skinId)
    expect(() => applyConfigurationOverrides(options, [target], plan.context!)).toThrow(ConfigurationOverrideError)
    expect(readdirSync(home)).toEqual(['cordis.patch.yml'])
    applyConfigurationOverrides(options, both, plan.context!)
    expect(readFileSync(file, 'utf8')).toBe('[]\n')
  })

  it('returns none for empty or unopposed target sets without creating files', () => {
    expect(inspectConfigurationOverrides({}, [])).toEqual({ status: 'none', changes: [], reason: '本次操作没有需要检查的组件。' })
    const missing = fixture()
    expect(inspectConfigurationOverrides(missing.options, both).status).toBe('none')
    expect(readdirSync(missing.home)).toEqual([])
    const existing = fixture('- id: unrelated\n  disabled: true\n')
    expect(inspectConfigurationOverrides(existing.options, both)).toMatchObject({ status: 'none', changes: [] })
    expect(() => applyConfigurationOverrides(existing.options, both, 'a'.repeat(64))).toThrow(ConfigurationOverrideError)
    expect(readFileSync(existing.file, 'utf8')).toBe('- id: unrelated\n  disabled: true\n')
  })

  it.each([
    [target, target],
    [target, { ...target, enabled: false }],
    [target, { ...target, skinId: 'different.skin', packageName: '@example/different' }],
    [target, { ...target, rowId: 'different-row' }],
    [target, { ...oldTarget, rowId: 'bad\nrow' }],
  ])('rejects duplicate, conflicting, or invalid targets as a whole', targets => {
    const { home, file, options } = fixture(source)
    expect(inspectConfigurationOverrides(options, targets)).toMatchObject({ status: 'blocked', changes: [] })
    expect(() => applyConfigurationOverrides(options, targets, 'a'.repeat(64))).toThrow(ConfigurationOverrideError)
    expect(readFileSync(file, 'utf8')).toBe(source)
    expect(readdirSync(home)).toEqual(['cordis.patch.yml'])
  })

  it('does not partially repair when a later target is ambiguous', () => {
    const unsafeSource = '- id: skin-main\n  disabled: true\n- id: old-main\n  name: unexpected-package\n  disabled: false\n'
    const { home, file, options } = fixture(unsafeSource)
    expect(inspectConfigurationOverride(options, target).status).toBe('repairable')
    expect(inspectConfigurationOverrides(options, both)).toMatchObject({ status: 'blocked', changes: [] })
    expect(() => applyConfigurationOverrides(options, both, 'a'.repeat(64))).toThrow(ConfigurationOverrideError)
    expect(readFileSync(file, 'utf8')).toBe(unsafeSource)
    expect(readdirSync(home)).toEqual(['cordis.patch.yml'])
  })

  it('binds every direction, identity, source version, and profile to approval', () => {
    const { home, file, options } = fixture(source)
    const plan = inspectConfigurationOverrides(options, both)
    for (const targets of [
      [target],
      [{ ...oldTarget, enabled: true }, target],
      [{ ...oldTarget, packageName: '@example/other' }, target],
      [{ ...oldTarget, skinId: 'different.skin' }, target],
    ]) expect(() => applyConfigurationOverrides(options, targets, plan.context!)).toThrow(ConfigurationOverrideError)
    expect(() => applyConfigurationOverrides({ ...options, patchPath: join(home, 'profiles', 'web', 'cordis.patch.yml') }, both, plan.context!)).toThrow(ConfigurationOverrideError)
    writeFileSync(file, source + '# changed concurrently\n')
    expect(() => applyConfigurationOverrides(options, both, plan.context!)).toThrow(ConfigurationOverrideError)
    expect(readFileSync(file, 'utf8')).toBe(source + '# changed concurrently\n')
    expect(readdirSync(home)).toEqual(['cordis.patch.yml'])
  })

  it('preserves a valid empty sequence and all CRLF comments after removing every row', () => {
    const { file, options } = fixture('# header\r\n- id: old-main\r\n  disabled: false # old\r\n# middle\r\n- id: skin-main\r\n  disabled: true # new\r\n# footer\r\n')
    const plan = inspectConfigurationOverrides(options, both)
    const { receipt } = applyConfigurationOverrides(options, both, plan.context!)
    expect(readFileSync(file, 'utf8')).toBe('# header\r\n# old\r\n# middle\r\n# new\r\n# footer\r\n[]\r\n')
    expect(parse(readFileSync(file, 'utf8'))).toEqual([])
    rollbackConfigurationOverride(receipt)
    expect(readFileSync(file, 'utf8')).toContain('disabled: false # old\r\n')
    expect(readFileSync(file, 'utf8')).toContain('disabled: true # new\r\n')
  })

  it('refuses concurrent changes without writing any subset or leaving a temporary backup', () => {
    const { home, file, options } = fixture(source)
    const plan = inspectConfigurationOverrides(options, both)
    race.file = file
    race.value = source + '# another writer\n'
    expect(() => applyConfigurationOverrides(options, both, plan.context!)).toThrow(ConfigurationOverrideError)
    expect(readFileSync(file, 'utf8')).toBe(source + '# another writer\n')
    expect(readdirSync(home)).toEqual(['cordis.patch.yml'])
  })

  it('refuses a batch rollback after another writer modified the combined result', () => {
    const { file, options } = fixture(source)
    const plan = inspectConfigurationOverrides(options, both)
    const { receipt } = applyConfigurationOverrides(options, both, plan.context!)
    const otherWriter = readFileSync(file, 'utf8') + '# later writer\n'
    writeFileSync(file, otherWriter)
    expect(() => rollbackConfigurationOverride(receipt)).toThrow(ConfigurationOverrideError)
    expect(readFileSync(file, 'utf8')).toBe(otherWriter)
    expect(readFileSync(receipt.backupPath, 'utf8')).toBe(source)
  })

  it('does not confuse single-target and batch approvals', () => {
    const { home, options } = fixture('- id: skin-main\n  disabled: true\n')
    const single = inspectConfigurationOverride(options, target)
    const batch = inspectConfigurationOverrides(options, [target])
    expect(single.context).not.toBe(batch.context)
    expect(() => applyConfigurationOverrides(options, [target], single.context!)).toThrow(ConfigurationOverrideError)
    expect(() => applyConfigurationOverride(options, target, batch.context!)).toThrow(ConfigurationOverrideError)
    expect(readdirSync(home)).toEqual(['cordis.patch.yml'])
  })
})
