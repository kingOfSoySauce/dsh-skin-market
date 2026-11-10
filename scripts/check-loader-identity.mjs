#!/usr/bin/env node
/**
 * Check that every registry entry's `rowId` is the loader row the pinned
 * package actually declares.
 *
 * The market refuses activation when the catalog row id differs from the row in
 * the installed package's `cordis.patch.yml` ("市场目录元数据与包实际声明不一致"),
 * and a wrong value looks perfectly valid to the schema check. Fetch the pinned
 * patch here so a submission fails in review rather than for the user.
 *
 * Network failures are warnings, not failures: an unreachable or private
 * repository must not block an otherwise correct submission.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { primaryLoaderIdFromPatch } from './loader-rows.mjs'

const REGISTRY = 'registry/skins'

function arg(name) {
  const prefix = `--${name}=`
  const found = process.argv.find(argument => argument.startsWith(prefix))
  if (found !== undefined) return found.slice(prefix.length)
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

function changedFiles(base, head) {
  const output = execFileSync('git', ['diff', '--name-only', base, head, '--', REGISTRY], { encoding: 'utf8' })
  return output.split('\n').map(line => line.trim()).filter(line => line.endsWith('.yml'))
}

function allFiles() {
  return readdirSync(REGISTRY).filter(name => name.endsWith('.yml')).sort().map(name => join(REGISTRY, name))
}

/** raw.githubusercontent URL for a pinned tree, honouring a monorepo subpath. */
export function patchUrl(value) {
  const repository = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/?$/.exec(value.repo ?? '')?.[1]
  const commit = value.install?.commit
  if (repository === undefined || typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit)) return null
  const subpath = value.subpath === undefined ? '' : `${String(value.subpath).replace(/^\/+|\/+$/g, '')}/`
  return `https://raw.githubusercontent.com/${repository}/${commit}/${subpath}cordis.patch.yml`
}

async function fetchPatch(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (response.status === 404) return { status: 'missing' }
    if (!response.ok) return { status: 'unavailable', detail: `HTTP ${response.status}` }
    return { status: 'ok', text: await response.text() }
  } catch (error) {
    return { status: 'unavailable', detail: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * @param {{ file: string, value: Record<string, any> }[]} entries
 * @param {{ fetchPatch?: (url: string) => Promise<{status: string, text?: string, detail?: string}> }} options
 */
export async function checkLoaderIdentity(entries, options = {}) {
  const load = options.fetchPatch ?? fetchPatch
  const failures = []
  const warnings = []
  let checked = 0
  for (const entry of entries) {
    const value = entry.value ?? {}
    const url = patchUrl(value)
    if (url === null) {
      warnings.push(`${entry.file}: 缺少可用的 repo 或 40 位 commit，跳过核验`)
      continue
    }
    const patch = await load(url)
    if (patch.status !== 'ok') {
      warnings.push(`${entry.file}: 无法读取 pinned patch（${patch.detail ?? patch.status}），跳过核验`)
      continue
    }
    const primary = primaryLoaderIdFromPatch(patch.text, value.package)
    if (primary.id === null) {
      // A repository without a bundle patch is checked by other gates; a patch
      // that exists but names another id is a packaging bug worth stopping on.
      if (primary.reason?.startsWith('bundle patch has no loader')) {
        warnings.push(`${entry.file}: ${primary.reason}，跳过 rowId 核验`)
        continue
      }
      failures.push(`${entry.file}: ${primary.reason}；目录 rowId=${value.rowId}`)
      continue
    }
    checked += 1
    if (primary.id !== value.rowId) {
      failures.push(`${entry.file}: 目录 rowId=${value.rowId}，pinned patch 的主 loader id=${primary.id}（package=${value.package}）`)
    }
  }
  return { checked, failures, warnings }
}

/**
 * Read the registry entries behind a changed-path list. Paths that no longer
 * exist are deleted entries: they have no row to verify, and reading them back
 * would throw ENOENT and fail an unrelated submission.
 * @param {string[]} paths
 */
export function readEntries(paths) {
  return paths
    .filter(file => existsSync(file))
    .map(file => ({ file, value: parse(readFileSync(file, 'utf8')) }))
}

async function main() {
  const base = arg('base')
  const head = arg('head')
  const files = arg('files')
  let paths
  if (files !== undefined) paths = files.split(',').map(file => file.trim()).filter(Boolean)
  else if (base !== undefined && head !== undefined) paths = changedFiles(base, head)
  else if (process.argv.includes('--all')) paths = allFiles()
  else paths = changedFiles('HEAD', 'HEAD') // nothing changed locally: no-op
  const entries = readEntries(paths)
  const result = await checkLoaderIdentity(entries)
  for (const warning of result.warnings) console.warn(`warning: ${warning}`)
  if (result.failures.length > 0) {
    for (const failure of result.failures) console.error(`error: ${failure}`)
    console.error(`\nloader row id mismatch: ${result.failures.length} of ${entries.length} entries.`)
    console.error('Set rowId to the id of the row in cordis.patch.yml whose name equals package.')
    process.exit(1)
  }
  console.log(`loader row id check passed: ${result.checked} verified, ${result.warnings.length} skipped`)
}

if (process.argv[1]?.endsWith('check-loader-identity.mjs')) await main()
