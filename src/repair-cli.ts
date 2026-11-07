#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import {
  applyProfileRepair,
  defaultRepairRunner,
  formatInspection,
  formatPlan,
  inspectProfileRepair,
  planProfileRepair,
  resolveRepairProfileDir,
  rollbackProfileRepair,
  type RepairInspection,
} from './repair.ts'

function valueAfter(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  return value === undefined || value.startsWith('--') ? undefined : value
}

function valuesAfter(name: string): string[] {
  const values: string[] = []
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) continue
    const value = process.argv[index + 1]
    if (value !== undefined && !value.startsWith('--')) values.push(value)
  }
  return values
}

function flag(name: string): boolean {
  return process.argv.includes(name)
}

function fail(message: string, code = 1): never {
  console.error(message)
  process.exit(code)
}

function printHelp(): void {
  console.log([
    'Usage: dsh-skin-market-repair [options]',
    '',
    'Diagnose (default, read-only) or repair a DSH profile that can no longer run pnpm',
    'because an installed dependency\u2019s upstream repository/commit is gone.',
    '',
    'Options:',
    '  --profile <name>        DSH profile name (default: web)',
    '  --profile-dir <path>    Profile directory; overrides --profile/--dsh-home',
    '  --dsh-home <path>       DSH home containing profiles/ (default: $DSH_HOME or ~/.dsh)',
    '  --keep <package>        Keep an unreachable dependency instead of removing it (repeatable)',
    '  --migrate <pkg>=<target> Replace an unreachable dependency with a reviewed pinned target',
    '                          (github:owner/repo#<40-hex commit> or exact name@version)',
    '  --reconcile             Also repair package.json/pnpm-lock.yaml drift with pnpm',
    '  --json                  Print the diagnosis and plan as JSON',
    '  --apply                 Apply the plan; requires --yes and --i-have-stopped-dsh',
    '  --yes                   Confirm the removal list without an interactive prompt',
    '  --i-have-stopped-dsh    Confirm the DSH instance using this profile is fully stopped',
    '  --pnpm <path>           pnpm executable to use (default: pnpm on PATH)',
    '  --allow-pnpm-mismatch   Continue even when the profile was installed by another pnpm version',
    '  --timeout <ms>          pnpm install timeout (default: 30 min)',
    '  --rollback <backupDir>  Restore package.json/pnpm-lock.yaml from a previous repair backup',
    '  -h, --help              Show this help',
    '',
    'The repair never touches .env, credentials, or the running DSH process. Back up and stop DSH first.',
  ].join('\n'))
}

function pnpmVersion(command: string): string | null {
  try {
    return execFileSync(command, ['--version'], { encoding: 'utf8', timeout: 15_000 }).trim().split(/\r?\n/).at(-1) ?? null
  } catch {
    return null
  }
}

function profileMarketVersion(profileDir: string): string | null {
  try {
    const manifest = JSON.parse(readFileSync(`${profileDir}/node_modules/dsh-skin-market/package.json`, 'utf8')) as { version?: unknown }
    return typeof manifest.version === 'string' ? manifest.version : null
  } catch {
    return null
  }
}

function printDiagnosis(inspection: RepairInspection, plan: ReturnType<typeof planProfileRepair>): void {
  console.log(formatInspection(inspection))
  console.log('')
  console.log(formatPlan(plan))
}

async function main(): Promise<void> {
  if (flag('--help') || flag('-h')) {
    printHelp()
    return
  }
  const profile = valueAfter('--profile') ?? 'web'
  const profileDir = resolveRepairProfileDir(profile, { profileDir: valueAfter('--profile-dir'), dshHome: valueAfter('--dsh-home') })
  const pnpmCommand = valueAfter('--pnpm') ?? 'pnpm'
  const timeoutMs = Number(valueAfter('--timeout') ?? 30 * 60 * 1000)
  const rollbackDir = valueAfter('--rollback')

  if (rollbackDir !== undefined) {
    if (!flag('--yes') || !flag('--i-have-stopped-dsh')) fail('Refusing to roll back: pass --yes and --i-have-stopped-dsh, and fully stop DSH first.', 2)
    const result = await rollbackProfileRepair(profileDir, rollbackDir, { timeoutMs, runner: defaultRepairRunner(pnpmCommand) })
    if (result.status === 'rolled-back') {
      console.log(`restored ${profileDir} from ${rollbackDir}`)
      console.log('start DSH normally and verify the page version and the saved enable/disable selection.')
      return
    }
    fail(`rollback ${result.status}: ${result.error ?? 'unknown error'}`, 1)
  }

  const migrations: Record<string, string> = {}
  for (const value of valuesAfter('--migrate')) {
    const separator = value.indexOf('=')
    if (separator <= 0 || separator === value.length - 1) fail(`invalid --migrate value: ${value} (expected package=target)`, 2)
    migrations[value.slice(0, separator)] = value.slice(separator + 1)
  }
  const inspection = await inspectProfileRepair(profileDir)
  let plan
  try {
    plan = planProfileRepair(inspection, { keep: valuesAfter('--keep'), reconcile: flag('--reconcile'), migrate: migrations })
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), 2)
  }

  if (flag('--json')) {
    console.log(JSON.stringify({ inspection, plan }, null, 2))
  } else {
    printDiagnosis(inspection, plan)
  }

  if (!flag('--apply')) {
    if (plan.runInstall) {
      console.error('')
      console.error('Read-only diagnosis. To repair: fully stop the DSH instance that uses this profile, then rerun with --apply --yes --i-have-stopped-dsh.')
    }
    return
  }

  if (!flag('--yes') || !flag('--i-have-stopped-dsh')) {
    fail('Refusing to edit the profile: --apply requires --yes and --i-have-stopped-dsh. Fully stop DSH first.', 2)
  }
  if (!plan.runInstall) {
    console.log('nothing to repair; no files were changed.')
    return
  }

  const expectedPnpm = inspection.pnpmPackageManager
  const currentPnpm = pnpmVersion(pnpmCommand)
  if (expectedPnpm !== null && currentPnpm !== null) {
    const expectedVersion = expectedPnpm.includes('@') ? expectedPnpm.slice(expectedPnpm.lastIndexOf('@') + 1) : expectedPnpm
    const major = (value: string): string => value.split('.')[0] ?? ''
    if (expectedVersion !== currentPnpm && !flag('--allow-pnpm-mismatch')) {
      fail([
        `This profile was installed with ${expectedPnpm}, but ${pnpmCommand} reports ${currentPnpm}.`,
        'Use the same pnpm generation (pass --pnpm /path/to/pnpm), or pass --allow-pnpm-mismatch after reviewing the risk.',
      ].join('\n'), 2)
    }
  }

  console.log('')
  console.log('applying repair (package.json and pnpm-lock.yaml are backed up first)...')
  const result = await applyProfileRepair(profileDir, inspection, plan, { timeoutMs, runner: defaultRepairRunner(pnpmCommand) })
  if (result.status === 'noop') {
    console.log('nothing to repair; no files were changed.')
    return
  }
  if (result.status === 'failed') {
    fail([
      `repair failed at ${result.stage ?? 'unknown'} stage: ${result.error ?? 'unknown error'}`,
      ...(result.backupDir === undefined ? [] : [`backup: ${result.backupDir}`, `rollback: dsh-skin-market-repair --profile ${profile} --rollback ${result.backupDir} --yes --i-have-stopped-dsh`]),
    ].join('\n'), 1)
  }
  console.log('')
  console.log(`repaired ${profileDir}`)
  if (result.removed.length > 0) console.log(`removed: ${result.removed.join(', ')}`)
  if (result.migrated.length > 0) console.log(`migrated: ${result.migrated.map(item => `${item.packageName} -> ${item.target}`).join(', ')}`)
  if (result.kept.length > 0) console.log(`kept: ${result.kept.join(', ')}`)
  if (result.backupDir !== undefined) console.log(`backup: ${result.backupDir}`)
  console.log(`dsh-skin-market stays installed at ${profileMarketVersion(profileDir) ?? 'unknown version'}; skins that used the removed packages are gone, other selections are unchanged.`)
  console.log('next: start DSH normally, verify the page version and the saved enable/disable selection, then retry the original install/update in the market.')
}

main().catch(error => {
  fail(`repair failed: ${error instanceof Error ? error.message : String(error)}`, 1)
})
