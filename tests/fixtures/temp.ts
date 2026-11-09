import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const directories: string[] = []

/**
 * Create a throwaway directory and remember it for `cleanupTempDirs`.
 * Without the matching afterEach these fixtures accumulate in the OS temp dir
 * (the suite previously left tens of thousands of `skin-*` directories behind).
 */
export function tempDir(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  directories.push(directory)
  return directory
}

export function cleanupTempDirs(): void {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
}
