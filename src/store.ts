import { readdirSync, rmSync, type Dirent } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { CommandOptions, PluginRunner } from './commands.ts'
import { logEvent } from './log.ts'

const ORPHAN_TMP_RE = /^_tmp_(\d+)_/

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Remove only pnpm staging dirs whose owning process is no longer alive. */
export function cleanOrphanedStoreTmp(storePath: string): string[] {
  const tmpPath = join(storePath, 'tmp')
  let entries: Dirent[]
  try {
    entries = readdirSync(tmpPath, { withFileTypes: true })
  } catch {
    return []
  }

  const removed: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const match = ORPHAN_TMP_RE.exec(entry.name)
    if (match === null || pidAlive(Number(match[1]))) continue
    try {
      rmSync(join(tmpPath, entry.name), { recursive: true, force: true })
      removed.push(entry.name)
    } catch {
      // A locked directory is left for a later failed operation to retry.
    }
  }
  return removed
}

/** Resolve the active pnpm store and reclaim safe orphan staging dirs. */
export async function cleanOrphanedStore(run: PluginRunner, profile: string, operationId?: string, options?: CommandOptions): Promise<string[]> {
  let result
  try {
    result = await run(profile, ['store', 'path'], options)
  } catch {
    return []
  }
  if (result.exitCode !== 0 || result.aborted === true || result.timedOut) return []
  const storePath = result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean).at(-1) ?? ''
  if (!isAbsolute(storePath)) return []
  const removed = cleanOrphanedStoreTmp(storePath)
  if (removed.length > 0) {
    logEvent('info', 'store-cleanup', `removed ${removed.length} orphaned pnpm staging directory(s): ${removed.slice(0, 3).join(', ')}${removed.length > 3 ? ', …' : ''}`, operationId)
  }
  return removed
}
