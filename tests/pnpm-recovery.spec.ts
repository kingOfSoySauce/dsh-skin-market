import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { classifyPnpmFailure, failureDiagnostic, PnpmCommandError, runPnpmWithRecovery } from '../src/pnpm-recovery.ts'
import type { CommandResult } from '../src/commands.ts'

function failed(output: string): CommandResult {
  return { exitCode: 1, stdout: '', stderr: output, timedOut: false }
}

function success(): CommandResult {
  return { exitCode: 0, stdout: '', stderr: '', timedOut: false }
}

describe('pnpm recovery', () => {
  it('retries a release-age failure with a command-scoped override', async () => {
    const calls: Array<{ args: readonly string[]; env?: NodeJS.ProcessEnv }> = []
    await runPnpmWithRecovery(['add', '@example/skin@1.0.0'], {
      attempt: async (args, options) => {
        calls.push({ args, env: options?.env })
        return calls.length === 1
          ? failed('@example/skin@1.0.0 was published within the minimumReleaseAge cutoff')
          : success()
      },
    })

    expect(calls).toHaveLength(2)
    expect(calls[0]?.args).toEqual(['add', '@example/skin@1.0.0'])
    expect(calls[1]?.args).toEqual(['add', '--config.minimumReleaseAge=0', '@example/skin@1.0.0'])
    expect(calls[1]?.env).toBeUndefined()
  })

  it('retries transient network failures with the original arguments', async () => {
    const attempts: Array<readonly string[]> = []
    await runPnpmWithRecovery(['remove', '@example/skin'], {
      attempt: async args => {
        attempts.push(args)
        return attempts.length === 1 ? failed('TypeError: fetch failed\ncause: UND_ERR_DESTROYED') : success()
      },
    })

    expect(attempts).toEqual([['remove', '@example/skin'], ['remove', '@example/skin']])
  })

  it('classifies a build block and extracts only the exact approval key', () => {
    const failure = classifyPnpmFailure(failed([
      'ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED',
      '@linxin666/dsh-web-ui-all@https://codeload.github.com/springbrand-lab/dsh-skin-universe/tar.gz/29fa777bdd8c9f7d93700c56c11a96a32634d967#path:packages/dsh-web-ui-all needs to execute build scripts but is not in allowBuilds',
    ].join('\n')))

    expect(failure).toMatchObject({
      kind: 'build-approval',
      packageName: '@linxin666/dsh-web-ui-all',
      buildKey: '@linxin666/dsh-web-ui-all@https://codeload.github.com/springbrand-lab/dsh-skin-universe/tar.gz/29fa777bdd8c9f7d93700c56c11a96a32634d967#path:packages/dsh-web-ui-all',
    })

    const punctuated = classifyPnpmFailure(failed([
      'ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED',
      '@captain1275/dsh-client-ui-skin-aurora@https://codeload.github.com/CAPTAIN1275/dsh-ui-web/tar.gz/251119cedac66dbd31ca8ce6cb112369b60b359b#path:/packages/skins/aurora: build scripts are not in allowBuilds',
    ].join('\n')))
    expect(punctuated.buildKey).toBe('@captain1275/dsh-client-ui-skin-aurora@https://codeload.github.com/CAPTAIN1275/dsh-ui-web/tar.gz/251119cedac66dbd31ca8ce6cb112369b60b359b#path:/packages/skins/aurora')
  })

  it('keeps raw pnpm output and embedded credentials out of diagnostics', () => {
    const diagnostic = failureDiagnostic(failed('ERR_PNPM_FETCH_404 GET https://user:secret@registry.example/pkg'))
    expect(diagnostic).toContain('ERR_PNPM_FETCH_404')
    expect(diagnostic).not.toContain('user')
    expect(diagnostic).not.toContain('secret')
    expect(diagnostic).not.toContain('registry.example')
  })

  it('classifies pnpm ignored builds and normalizes exact package approval keys', () => {
    const failure = classifyPnpmFailure(failed([
      'ERR_PNPM_IGNORED_BUILDS',
      'Ignored build scripts: node-pty@1.1.0, @example/native-addon@2.0.0.',
      'Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.',
    ].join('\n')))

    expect(failure).toMatchObject({
      kind: 'build-approval',
      packageName: 'node-pty',
      buildKey: 'node-pty',
      buildKeys: ['node-pty', '@example/native-addon'],
    })

    const malformed = classifyPnpmFailure(failed('ERR_PNPM_IGNORED_BUILDS\nIgnored build scripts: "code":"ERR_PNPM_IGNORED_BUILDS"'))
    expect(malformed).toMatchObject({ kind: 'build-approval' })
    expect(malformed.buildKeys).toBeUndefined()
    expect(malformed.buildKey).toBeUndefined()
  })

  it('does not let the generic DSH build hint hide a timeout', () => {
    const failure = classifyPnpmFailure({
      exitCode: 1,
      timedOut: false,
      stdout: '[23] The operation was aborted due to timeout',
      stderr: 'dsh: git-hosted plugins build on install via their prepare script, which pnpm blocks until allowed',
    })

    expect(failure.kind).toBe('fetch-timeout')
  })

  it('extracts the missing scoped package from a pnpm 404', () => {
    const failure = classifyPnpmFailure(failed([
      '[ERR_PNPM_FETCH_404] GET https://registry.npmjs.org/@deepseek-ai%2Fdsh-compact: Not Found - 404',
      'This error happened while installing a direct dependency of /tmp/profile',
    ].join('\n')))

    expect(failure).toMatchObject({
      kind: 'fetch-404',
      packageName: '@deepseek-ai/dsh-compact',
    })
  })

  it('retries an unrequested host peer with peer auto-install disabled', async () => {
    const profileDir = mkdtempSync(join(tmpdir(), 'pnpm-recovery-host-peer-'))
    mkdirSync(profileDir, { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ dependencies: { 'installed-plugin': '1.0.0' } }))
    const calls: Array<readonly string[]> = []
    await runPnpmWithRecovery(['add', 'new-plugin'], {
      profileDir,
      attempt: async args => {
        calls.push(args)
        return calls.length === 1
          ? failed('[ERR_PNPM_FETCH_404] GET https://registry.npmjs.org/@deepseek-ai%2Fdsh-compact: Not Found - 404')
          : success()
      },
    })

    expect(calls).toEqual([
      ['add', 'new-plugin'],
      ['add', '--config.auto-install-peers=false', 'new-plugin'],
    ])
  })

  it('does not hide a direct profile dependency behind the peer recovery', async () => {
    const profileDir = mkdtempSync(join(tmpdir(), 'pnpm-recovery-direct-'))
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ dependencies: { '@deepseek-ai/dsh-compact': '^0.0.1-rc.1' } }))

    await expect(runPnpmWithRecovery(['add', 'new-plugin'], {
      profileDir,
      attempt: async () => failed('[ERR_PNPM_FETCH_404] GET https://registry.npmjs.org/@deepseek-ai%2Fdsh-compact: Not Found - 404'),
    })).rejects.toMatchObject({
      name: 'PnpmCommandError',
      failure: { kind: 'fetch-404', packageName: '@deepseek-ai/dsh-compact' },
    } satisfies Partial<PnpmCommandError>)
  })

  it('exposes a typed failure after the automatic recovery is exhausted', async () => {
    await expect(runPnpmWithRecovery(['add', 'new-package'], {
      attempt: async () => failed('published within the minimumReleaseAge cutoff'),
    })).rejects.toMatchObject({
      name: 'PnpmCommandError',
      failure: { kind: 'release-age' },
    } satisfies Partial<PnpmCommandError>)
  })

  it('classifies a pnpm store generation mismatch and does not auto-retry it', async () => {
    const failure = classifyPnpmFailure(failed([
      'ERR_PNPM_UNEXPECTED_STORE',
      'Unexpected store location',
      'The dependencies at C:\\Users\\user\\.dsh\\profiles\\web\\node_modules are currently linked from the store at C:\\Users\\user\\AppData\\Local\\pnpm\\store\\v11',
    ].join('\n')))
    expect(failure.kind).toBe('unexpected-store')
    expect(failure.message).toContain('另一代 pnpm store')
    expect(failure.message).toContain('.modules.yaml')

    const attempts: Array<readonly string[]> = []
    await expect(runPnpmWithRecovery(['add', 'dsh-skin-market@0.1.50'], {
      attempt: async args => {
        attempts.push(args)
        return failed('ERR_PNPM_UNEXPECTED_STORE\nUnexpected store location')
      },
    })).rejects.toMatchObject({
      name: 'PnpmCommandError',
      failure: { kind: 'unexpected-store' },
    } satisfies Partial<PnpmCommandError>)
    expect(attempts).toEqual([['add', 'dsh-skin-market@0.1.50']])
  })
})
