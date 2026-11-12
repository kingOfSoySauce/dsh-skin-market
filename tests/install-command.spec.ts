import { afterEach, describe, expect, it } from 'vitest'
import { createDshPluginAddCommand, createInstallCommand, quoteInstallTarget } from '../src/install-command.ts'
import { writeFileSync, chmodSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { getInstallEnvironment } from '../src/install-environment.ts'
import { cleanupTempDirs, tempDir } from './fixtures/temp.ts'

afterEach(cleanupTempDirs)

describe('portable DSH install commands', () => {
  it('uses double quotes for targets containing cmd metacharacters', () => {
    const target = `github:owner/repo#${'a'.repeat(40)}&path:/packages/skin`
    expect(quoteInstallTarget(target)).toBe(`"${target}"`)
    expect(createDshPluginAddCommand(target)).toBe(`dsh plugin --profile web add "${target}"`)
    expect(createInstallCommand(target)).toBe(`pnpm add "${target}" --dir "$HOME/.dsh/profiles/web"`)
    expect(createInstallCommand(target, 'web', { shell: 'powershell' })).toBe(`pnpm add "${target}" --dir "$env:USERPROFILE\\.dsh\\profiles\\web"`)
    expect(createInstallCommand(target, 'web', { shell: 'cmd' })).toBe(`pnpm add "${target}" --dir "%USERPROFILE%\\.dsh\\profiles\\web"`)
  })

  it('keeps npm and root-repo targets on dsh plugin add', () => {
    const target = `github:owner/repo#${'a'.repeat(40)}`
    expect(createInstallCommand(target)).toBe(`dsh plugin --profile web add "${target}"`)
  })

  it('rejects command-breaking target text instead of emitting an unsafe command', () => {
    expect(() => quoteInstallTarget('github:owner/repo\"broken')).toThrow('unsupported command characters')
    expect(() => quoteInstallTarget('github:owner/repo\nnext')).toThrow('unsupported command characters')
    expect(() => quoteInstallTarget('$(touch attacked)')).toThrow('unsupported command characters')
    expect(() => createInstallCommand('skin', 'web', { shell: 'cmd', dshHome: 'C:\\100%home' })).toThrow('safely in CMD')
  })

  it('executes one POSIX install with literal custom directories and no command substitution', () => {
    const directory = tempDir('market-copy-command-')
    const fakeCli = join(directory, 'dsh')
    const fakePnpm = join(directory, 'pnpm')
    const script = `#!${process.execPath}\nprocess.stdout.write(JSON.stringify({ args: process.argv.slice(2), home: process.env.DSH_HOME }))\n`
    writeFileSync(fakeCli, script); chmodSync(fakeCli, 0o755)
    writeFileSync(fakePnpm, script); chmodSync(fakePnpm, 0o755)
    const profileDir = join(directory, "Sam's $HOME $(touch attacked) profile")
    try {
      const environment = { ...process.env, PATH: `${directory}:${process.env.PATH}` }
      const target = `github:owner/repo#${'a'.repeat(40)}&path:/skin`
      const pnpm = spawnSync('/bin/sh', ['-c', createInstallCommand(target, 'work', { profileDir })], { cwd: directory, env: environment, encoding: 'utf8' })
      expect(pnpm.status).toBe(0)
      expect(JSON.parse(pnpm.stdout).args).toEqual(['add', target, '--dir', profileDir])
      const dsh = spawnSync('/bin/sh', ['-c', createInstallCommand('example-skin', 'work', { dshHome: profileDir })], { cwd: directory, env: environment, encoding: 'utf8' })
      expect(dsh.status).toBe(0)
      expect(JSON.parse(dsh.stdout)).toEqual({ args: ['plugin', '--profile', 'work', 'add', 'example-skin'], home: profileDir })
      expect(existsSync(join(directory, 'attacked'))).toBe(false)
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })

  it('quotes actual Windows directories for the selected terminal', () => {
    const target = `github:owner/repo#${'a'.repeat(40)}&path:/skin`
    const profileDir = "C:\\Users\\Sam's $cash\\profiles\\work"
    expect(createInstallCommand(target, 'work', { shell: 'powershell', profileDir })).toBe(`pnpm add "${target}" --dir 'C:\\Users\\Sam''s $cash\\profiles\\work'`)
    expect(createInstallCommand(target, 'work', { shell: 'cmd', profileDir })).toBe(`pnpm add "${target}" --dir "${profileDir}"`)
  })
})

describe('host install environment', () => {
  it('reports actual custom home and profile without guessing from the browser', () => {
    expect(getInstallEnvironment('work', '/srv/custom dsh/profiles/work', 'linux')).toEqual({
      platform: 'linux', profile: 'work', profileDir: '/srv/custom dsh/profiles/work', dshHome: '/srv/custom dsh', cliAvailable: true,
    })
    expect(getInstallEnvironment('work', 'C:\\DSH data\\profiles\\work', 'win32')).toMatchObject({
      platform: 'win32', profile: 'work', dshHome: 'C:\\DSH data', cliAvailable: true,
    })
  })

  it('does not pretend the CLI can address an arbitrary profile directory', () => {
    expect(getInstallEnvironment('work', '/srv/arbitrary-profile', 'linux')).toMatchObject({ cliAvailable: false, profileDir: '/srv/arbitrary-profile' })
    expect(getInstallEnvironment('web', '/home/test/.dsh/profiles/web', 'darwin').dshHome).toBe('/home/test/.dsh')
  })
})
