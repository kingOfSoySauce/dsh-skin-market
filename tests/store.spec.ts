import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanOrphanedStoreTmp } from '../src/store.ts'
import { cleanupTempDirs, tempDir } from './fixtures/temp.ts'

afterEach(cleanupTempDirs)

describe('pnpm store cleanup', () => {
  it('removes dead-pid staging dirs and keeps live or unrelated dirs', () => {
    const store = tempDir('skin-pnpm-store-')
    const tmp = join(store, 'tmp')
    mkdirSync(join(tmp, `_tmp_${Number.MAX_SAFE_INTEGER}_dead`), { recursive: true })
    mkdirSync(join(tmp, `_tmp_${process.pid}_live`), { recursive: true })
    mkdirSync(join(tmp, 'not-pnpm-staging'), { recursive: true })
    writeFileSync(join(tmp, 'not-pnpm-staging', 'keep.txt'), 'keep')

    expect(cleanOrphanedStoreTmp(store)).toEqual([`_tmp_${Number.MAX_SAFE_INTEGER}_dead`])
  })
})
