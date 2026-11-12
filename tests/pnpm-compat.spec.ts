import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { pluginArgsFor } from '../src/pnpm-compat.ts'
import { cleanupTempDirs, tempDir } from './fixtures/temp.ts'

afterEach(cleanupTempDirs)

describe('pnpm workspace compatibility', () => {
  it('adds -w only for add/remove at a workspace root', () => {
    const dir = tempDir('skin-pnpm-compat-')
    writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - .\n')

    expect(pluginArgsFor(dir, ['add', 'skin'])).toEqual(['add', '-w', 'skin'])
    expect(pluginArgsFor(dir, ['remove', 'skin'])).toEqual(['remove', '-w', 'skin'])
    expect(pluginArgsFor(dir, ['add', '-w', 'skin'])).toEqual(['add', '-w', 'skin'])
    expect(pluginArgsFor(dir, ['install'])).toEqual(['install'])
  })

  it('does not inherit the profile workspace into a --dir temporary project', () => {
    const profile = tempDir('skin-pnpm-profile-')
    const temp = tempDir('skin-pnpm-temp-')
    writeFileSync(join(profile, 'pnpm-workspace.yaml'), 'packages:\n  - .\n')
    mkdirSync(temp, { recursive: true })

    expect(pluginArgsFor(profile, ['add', 'skin', '--dir', temp])).toEqual(['add', 'skin', '--dir', temp])
  })
})
