#!/usr/bin/env node
// Probe the pinned sources a published catalog installs from.
// Read-only: this script only issues HEAD requests and never writes the catalog.
// A dead source cannot be installed by anyone, so CI should fail on it.
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_CATALOG = resolve(root, 'data/catalog.json')
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_CONCURRENCY = 8

function argument(name) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  return value === undefined || value.startsWith('--') ? undefined : value
}

function flag(name) {
  return process.argv.includes(name)
}

const catalogPath = resolve(argument('--catalog') ?? DEFAULT_CATALOG)
const timeoutMs = Number(argument('--timeout') ?? DEFAULT_TIMEOUT_MS)
const concurrency = Math.max(1, Math.min(32, Number(argument('--concurrency') ?? DEFAULT_CONCURRENCY)))
const jsonOutput = flag('--json')
const markdownOutput = flag('--markdown')

function githubSource(target) {
  const match = /^github:([^#]+)#([0-9a-f]{40})(?:&path:\/?[A-Za-z0-9._/-]+)?$/i.exec(target)
  if (match === null) return null
  return {
    kind: 'github',
    repository: `${match[1]}`,
    url: `https://codeload.github.com/${match[1]}/tar.gz/${match[2]}`,
  }
}

function npmSource(source) {
  if (typeof source?.name !== 'string' || typeof source?.version !== 'string') return null
  const base = source.name.startsWith('@') ? source.name.slice(source.name.indexOf('/') + 1) : source.name
  return {
    kind: 'npm',
    repository: source.name,
    url: `https://registry.npmjs.org/${source.name}/-/${base}-${source.version}.tgz`,
  }
}

function collectSources(catalog) {
  const sources = new Map()
  const add = (source, skinId) => {
    if (source === null) return
    const existing = sources.get(source.url)
    if (existing === undefined) sources.set(source.url, { ...source, ids: new Set([skinId]) })
    else existing.ids.add(skinId)
  }
  for (const skin of Array.isArray(catalog.skins) ? catalog.skins : []) {
    if (typeof skin?.id !== 'string' || typeof skin?.install !== 'object' || skin.install === null) continue
    add(githubSource(skin.install.target ?? ''), skin.id)
    for (const companion of Array.isArray(skin.install.companions) ? skin.install.companions : []) {
      add(githubSource(companion?.target ?? ''), skin.id)
    }
  }
  for (const [id, source] of Object.entries(catalog.npmSources ?? {})) add(npmSource(source), id)
  return [...sources.values()].sort((left, right) => left.url.localeCompare(right.url))
}

async function probe(source) {
  try {
    const response = await fetch(source.url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (response.status === 200 || response.status === 204 || response.status === 302) {
      return { ...source, status: 'reachable', httpStatus: response.status }
    }
    if (response.status === 404 || response.status === 410) {
      return { ...source, status: 'missing', httpStatus: response.status }
    }
    return { ...source, status: 'unknown', httpStatus: response.status }
  } catch (error) {
    return { ...source, status: 'unknown', error: error instanceof Error ? error.message : String(error) }
  }
}

async function pooled(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  const run = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await worker(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run))
  return results
}

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
const sources = collectSources(catalog)
const results = await pooled(sources, concurrency, probe)
const missing = results.filter(result => result.status === 'missing')
const unknown = results.filter(result => result.status === 'unknown')
const byKind = kind => results.filter(result => result.kind === kind)

const report = {
  catalog: catalogPath.replace(`${root}/`, ''),
  generatedAt: typeof catalog.generatedAt === 'string' ? catalog.generatedAt : null,
  checked: results.length,
  reachable: results.length - missing.length - unknown.length,
  missing: missing.map(({ url, kind, repository, ids, httpStatus }) => ({ url, kind, repository, ids: [...ids].sort(), httpStatus })),
  unknown: unknown.map(({ url, kind, repository, ids, httpStatus, error }) => ({ url, kind, repository, ids: [...ids].sort(), ...(httpStatus === undefined ? {} : { httpStatus }), ...(error === undefined ? {} : { error }) })),
  totals: {
    github: byKind('github').length,
    npm: byKind('npm').length,
  },
}

if (jsonOutput) {
  console.log(JSON.stringify(report, null, 2))
} else {
  const lines = []
  lines.push(`checked ${report.checked} source(s) (github ${report.totals.github}, npm ${report.totals.npm})`)
  lines.push(`reachable ${report.reachable}, missing ${report.missing.length}, unknown ${report.unknown.length}`)
  if (report.missing.length > 0) {
    lines.push('')
    lines.push('MISSING sources (these entries cannot be installed):')
    for (const item of report.missing) lines.push(`- [${item.kind}] ${item.repository} -> ${item.ids.join(', ')} (HTTP ${item.httpStatus})`)
  }
  if (report.unknown.length > 0) {
    lines.push('')
    lines.push('UNKNOWN sources (network or server did not answer a definitive 404; review manually):')
    for (const item of report.unknown) lines.push(`- [${item.kind}] ${item.repository} -> ${item.ids.join(', ')}${item.httpStatus === undefined ? '' : ` (HTTP ${item.httpStatus})`}${item.error === undefined ? '' : ` (${item.error})`}`)
  }
  if (report.missing.length === 0 && report.unknown.length === 0) lines.push('all pinned install sources answered; nothing to clean up.')
  console.log(lines.join('\n'))
  if (markdownOutput) {
    console.log('')
    console.log('| kind | repository | skins | status |')
    console.log('| --- | --- | --- | --- |')
    for (const item of [...report.missing, ...report.unknown]) {
      console.log(`| ${item.kind} | ${item.repository} | ${item.ids.join('<br>')} | ${item.httpStatus ?? 'network error'} |`)
    }
  }
}

if (flag('--fail-on-dead') && report.missing.length > 0) process.exitCode = 1
