import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import {
  applyProfileRepair,
  inspectLockfileDrift,
  inspectProfileRepair,
  parseGitDependency,
  planProfileRepair,
  rollbackProfileRepair,
  type RepairInspection,
  type RepairRunner,
} from '../src/repair.ts'

const ALIVE_COMMIT = 'a'.repeat(40)
const DEAD_COMMIT = 'b'.repeat(40)
const MARKET_SPEC = 'file:/tmp/reviewed/dsh-skin-market-0.1.75.tgz'

interface Fixture {
  dir: string
  manifest: string
  lockfile: string
}

function writeManifest(dir: string, extra: Record<string, string> = {}): void {
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'dsh-skin-market'] } },
    dependencies: {
      'alive-skin': `github:owner/alive#${ALIVE_COMMIT}`,
      'dead-skin': `github:owner/dead#${DEAD_COMMIT}`,
      'dsh-skin-market': MARKET_SPEC,
      ...extra,
    },
  }, null, 2)}\n`)
}

function writeLockfile(dir: string, options: { driftMarket?: boolean } = {}): void {
  const marketSpec = options.driftMarket === true ? 'file:/tmp/old/dsh-skin-market-0.1.74.tgz' : MARKET_SPEC
  const lock = {
    lockfileVersion: '9.0',
    importers: {
      '.': {
        dependencies: {
          'alive-skin': { specifier: `github:owner/alive#${ALIVE_COMMIT}`, version: `https://codeload.github.com/owner/alive/tar.gz/${ALIVE_COMMIT}` },
          'dead-skin': { specifier: `github:owner/dead#${DEAD_COMMIT}`, version: `https://codeload.github.com/owner/dead/tar.gz/${DEAD_COMMIT}` },
          'dsh-skin-market': { specifier: marketSpec, version: 'file:../../../tmp/reviewed/dsh-skin-market-0.1.75.tgz' },
        },
      },
    },
  }
  writeFileSync(join(dir, 'pnpm-lock.yaml'), stringifyYaml(lock))
}

function materialize(dir: string, dependencies = ['alive-skin', 'dead-skin', 'dsh-skin-market']): void {
  for (const name of dependencies) {
    const packageDir = join(dir, 'node_modules', name)
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name, version: name === 'dsh-skin-market' ? '0.1.75' : '1.0.0' }))
  }
  writeFileSync(join(dir, 'node_modules', '.modules.yaml'), JSON.stringify({ packageManager: 'pnpm@11.22.0' }))
}

function fixture(options: { driftMarket?: boolean } = {}): Fixture {
  const dir = mkdtempSync(join(tmpdir(), 'skin-repair-'))
  writeManifest(dir)
  writeLockfile(dir, options)
  materialize(dir)
  return { dir, manifest: readFileSync(join(dir, 'package.json'), 'utf8'), lockfile: readFileSync(join(dir, 'pnpm-lock.yaml'), 'utf8') }
}

function fakeFetch(statuses: Record<string, number>) {
  return async (url: string): Promise<{ status: number }> => {
    for (const [needle, status] of Object.entries(statuses)) {
      if (url.includes(needle)) return { status }
    }
    return { status: 404 }
  }
}

const noDeadSources = fakeFetch({ 'owner/alive': 200 })

/** Mimic pnpm's non-frozen reconcile: the lockfile importer follows the manifest. */
function reconcileFixture(dir: string): void {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
  const lock = parseYaml(readFileSync(join(dir, 'pnpm-lock.yaml'), 'utf8')) as { importers: { '.': { dependencies: Record<string, { specifier: string }> } } }
  const dependencies = lock.importers['.'].dependencies
  for (const [name, spec] of Object.entries(manifest.dependencies)) {
    dependencies[name] = { ...(dependencies[name] ?? {}), specifier: spec }
  }
  for (const name of Object.keys(dependencies)) {
    if (!Object.hasOwn(manifest.dependencies, name)) delete dependencies[name]
  }
  writeFileSync(join(dir, 'pnpm-lock.yaml'), stringifyYaml(lock))
  materialize(dir, Object.keys(manifest.dependencies))
  for (const [name, spec] of Object.entries(manifest.dependencies)) {
    const version = installedVersionFromSpec(spec)
    if (version !== undefined) writeFileSync(join(dir, 'node_modules', name, 'package.json'), JSON.stringify({ name, version }))
  }
}

function installedVersionFromSpec(spec: string): string | undefined {
  const source = spec.startsWith('npm:') ? spec.slice(4) : spec
  const pinned = /^(?:@[^@/]+\/)?[^@]+@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/.exec(source)
  if (pinned !== null) return pinned[1]
  if (/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(source)) return source
  return undefined
}

function readDependenciesForTest(dir: string): Record<string, string> {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> }
  return manifest.dependencies ?? {}
}

function successfulRunner(record: { calls: string[][] } = { calls: [] }): RepairRunner {
  return async (args, options) => {
    record.calls.push([...args])
    reconcileFixture(options.cwd)
    return { exitCode: 0 }
  }
}

function inspectionFor(dir: string, fetchImpl = noDeadSources): Promise<RepairInspection> {
  return inspectProfileRepair(dir, { fetchImpl })
}

describe('repair profile dependency inspection', () => {
  it('parses pinned github specs and ignores other install sources', () => {
    expect(parseGitDependency('skin', `github:owner/repo#${ALIVE_COMMIT}`)).toMatchObject({
      packageName: 'skin', repository: 'owner/repo', commit: ALIVE_COMMIT,
      url: `https://codeload.github.com/owner/repo/tar.gz/${ALIVE_COMMIT}`,
    })
    expect(parseGitDependency('skin', `github:owner/repo#${ALIVE_COMMIT}&path:/packages/a`)).toMatchObject({ subpath: '/packages/a' })
    expect(parseGitDependency('skin', '1.2.3')).toBeNull()
    expect(parseGitDependency('skin', 'github:owner/repo#not-a-commit')).toBeNull()
  })

  it('reports reachable and unreachable installed dependencies', async () => {
    const { dir } = fixture()
    const inspection = await inspectionFor(dir, fakeFetch({ 'owner/alive': 200, 'owner/dead': 404 }))
    expect(inspection.dependencies).toBe(3)
    expect(inspection.gitDependencies).toBe(2)
    expect(inspection.unreachable.map(dependency => dependency.packageName)).toEqual(['dead-skin'])
    expect(inspection.reachable).toBe(1)
    expect(inspection.install.installedVersion).toBe('0.1.75')
    expect(inspection.pnpmPackageManager).toBe('pnpm@11.22.0')
    expect(inspection.materialized).toContain('alive-skin')
  })

  it('does not treat non-404 probe answers as removable', async () => {
    const { dir } = fixture()
    const inspection = await inspectionFor(dir, fakeFetch({ 'owner/alive': 200, 'owner/dead': 500 }))
    expect(inspection.unreachable).toHaveLength(0)
    expect(inspection.unknown.map(dependency => dependency.packageName)).toEqual(['dead-skin'])
    const plan = planProfileRepair(inspection)
    expect(plan.runInstall).toBe(false)
    expect(plan.reason).toBe('unknown-sources-only')
  })

  it('detects package.json and lockfile drift', async () => {
    const { dir } = fixture({ driftMarket: true })
    const drift = inspectLockfileDrift(dir)
    expect(drift).toEqual([{ packageName: 'dsh-skin-market', manifestSpec: MARKET_SPEC, lockfileSpec: 'file:/tmp/old/dsh-skin-market-0.1.74.tgz' }])
  })

  it('plans removal of unreachable dependencies and honours --keep', async () => {
    const { dir } = fixture()
    const inspection = await inspectionFor(dir, fakeFetch({ 'owner/alive': 200, 'owner/dead': 404 }))
    expect(planProfileRepair(inspection).remove.map(dependency => dependency.packageName)).toEqual(['dead-skin'])
    const kept = planProfileRepair(inspection, { keep: ['dead-skin'] })
    expect(kept.remove).toHaveLength(0)
    expect(kept.keep).toEqual(['dead-skin'])
    expect(kept.runInstall).toBe(false)
    const reconciled = planProfileRepair(await inspectionFor(fixture({ driftMarket: true }).dir), { reconcile: true })
    expect(reconciled.runInstall).toBe(true)
  })
})

describe('repair profile dependency apply', () => {
  it('removes unreachable dependencies, backs up files, and verifies the result', async () => {
    const { dir } = fixture()
    const inspection = await inspectionFor(dir, fakeFetch({ 'owner/alive': 200, 'owner/dead': 404 }))
    const plan = planProfileRepair(inspection)
    const record = { calls: [] as string[][] }
    const result = await applyProfileRepair(dir, inspection, plan, { runner: successfulRunner(record), now: new Date('2026-11-07T00:00:00.000Z') })
    expect(result).toMatchObject({ status: 'applied', removed: ['dead-skin'] })
    expect(record.calls).toEqual([['install', '--no-frozen-lockfile', '--prefer-offline']])
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
    expect(manifest.dependencies['dead-skin']).toBeUndefined()
    expect(manifest.dependencies['alive-skin']).toBeDefined()
    expect(inspectLockfileDrift(dir)).toEqual([])
    expect(result.backupDir).toBeDefined()
    expect(existsSync(join(result.backupDir!, 'package.json'))).toBe(true)
    expect(existsSync(join(result.backupDir!, 'pnpm-lock.yaml'))).toBe(true)
    const receipt = JSON.parse(readFileSync(join(result.backupDir!, 'repair.json'), 'utf8')) as { remove: Array<{ packageName: string }> }
    expect(receipt.remove.map(entry => entry.packageName)).toEqual(['dead-skin'])
  })

  it('restores package.json and pnpm-lock.yaml when pnpm install fails', async () => {
    const { dir, manifest, lockfile } = fixture()
    const inspection = await inspectionFor(dir, fakeFetch({ 'owner/alive': 200, 'owner/dead': 404 }))
    const plan = planProfileRepair(inspection)
    let attempts = 0
    const result = await applyProfileRepair(dir, inspection, plan, {
      runner: async (_args, options) => {
        attempts += 1
        if (attempts === 1) writeFileSync(join(options.cwd, 'package.json'), '{"changed":true}\n')
        return { exitCode: attempts === 1 ? 1 : 0 }
      },
    })
    expect(result).toMatchObject({ status: 'failed', stage: 'install' })
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(manifest)
    expect(readFileSync(join(dir, 'pnpm-lock.yaml'), 'utf8')).toBe(lockfile)
  })

  it('restores the backed-up files when verification fails', async () => {
    const { dir, manifest, lockfile } = fixture()
    const inspection = await inspectionFor(dir, fakeFetch({ 'owner/alive': 200, 'owner/dead': 404 }))
    const plan = planProfileRepair(inspection)
    const result = await applyProfileRepair(dir, inspection, plan, { runner: async () => ({ exitCode: 0 }) })
    expect(result).toMatchObject({ status: 'failed', stage: 'verify' })
    expect(result.verify?.problems.length).toBeGreaterThan(0)
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(manifest)
    expect(readFileSync(join(dir, 'pnpm-lock.yaml'), 'utf8')).toBe(lockfile)
  })

  it('rolls a successful repair back to the backed-up files', async () => {
    const { dir, manifest, lockfile } = fixture()
    const inspection = await inspectionFor(dir, fakeFetch({ 'owner/alive': 200, 'owner/dead': 404 }))
    const applied = await applyProfileRepair(dir, inspection, planProfileRepair(inspection), { runner: successfulRunner() })
    expect(applied.status).toBe('applied')
    const record = { calls: [] as string[][] }
    const result = await rollbackProfileRepair(dir, applied.backupDir!, { runner: successfulRunner(record) })
    expect(result.status).toBe('rolled-back')
    expect(record.calls).toEqual([['install', '--frozen-lockfile', '--prefer-offline']])
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(manifest)
    expect(readFileSync(join(dir, 'pnpm-lock.yaml'), 'utf8')).toBe(lockfile)
  })

  it('migrates an unreachable dependency to a reviewed target instead of removing it', async () => {
    const { dir } = fixture()
    const inspection = await inspectionFor(dir, fakeFetch({ 'owner/alive': 200, 'owner/dead': 404 }))
    const plan = planProfileRepair(inspection, { migrate: { 'dead-skin': 'dsh-example-skin@1.2.3' } })
    expect(plan.remove).toHaveLength(0)
    expect(plan.migrate).toEqual([{ packageName: 'dead-skin', target: 'dsh-example-skin@1.2.3' }])
    const result = await applyProfileRepair(dir, inspection, plan, { runner: successfulRunner() })
    expect(result).toMatchObject({ status: 'applied', removed: [], migrated: [{ packageName: 'dead-skin', target: 'dsh-example-skin@1.2.3' }] })
    expect(readDependenciesForTest(dir)['dead-skin']).toBe('npm:dsh-example-skin@1.2.3')
    const installed = JSON.parse(readFileSync(join(dir, 'node_modules', 'dead-skin', 'package.json'), 'utf8')) as { version: string }
    expect(installed.version).toBe('1.2.3')
  })

  it('writes a bare exact version when the reviewed npm target keeps the same package name', async () => {
    const { dir } = fixture()
    const inspection = await inspectionFor(dir, fakeFetch({ 'owner/alive': 200, 'owner/dead': 404 }))
    const plan = planProfileRepair(inspection, { migrate: { 'dead-skin': 'dead-skin@2.0.0' } })
    const result = await applyProfileRepair(dir, inspection, plan, { runner: successfulRunner() })
    expect(result.status).toBe('applied')
    expect(readDependenciesForTest(dir)['dead-skin']).toBe('2.0.0')
    const installed = JSON.parse(readFileSync(join(dir, 'node_modules', 'dead-skin', 'package.json'), 'utf8')) as { version: string }
    expect(installed.version).toBe('2.0.0')
  })

  it('rejects migration targets that are not reviewed pinned specs', async () => {
    const { dir } = fixture()
    const inspection = await inspectionFor(dir, fakeFetch({ 'owner/alive': 200, 'owner/dead': 404 }))
    expect(() => planProfileRepair(inspection, { migrate: { 'dead-skin': 'latest' } })).toThrow('target must be a full pinned')
    expect(() => planProfileRepair(inspection, { migrate: { 'alive-skin': 'dsh-example-skin@1.2.3' } })).toThrow('not an unreachable dependency')
  })

  it('is a no-op when only an explicitly kept dependency is unreachable', async () => {
    const { dir, manifest } = fixture()
    const inspection = await inspectionFor(dir, fakeFetch({ 'owner/alive': 200, 'owner/dead': 404 }))
    const result = await applyProfileRepair(dir, inspection, planProfileRepair(inspection, { keep: ['dead-skin'] }), { runner: successfulRunner() })
    expect(result).toEqual({ status: 'noop', removed: [], migrated: [], kept: ['dead-skin'] })
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(manifest)
  })
})
