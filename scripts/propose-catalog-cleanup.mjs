#!/usr/bin/env node
// Turn a source audit into a reviewable catalog cleanup.
//
// For every pinned source the audit reported as missing, classify it:
//   rename     GitHub reports the repository under a new full name and the pinned
//              commit still exists there -> rewrite the entry to the new name.
//   npm-revive the published npm artifact of the exact pinned version still
//              matches the pinned commit -> keep the entry installable via npm.
//   remove     no safe source remains -> remove the entry.
//
// Default is a dry run. `--write` edits registry/skins and regenerates the
// catalog; this script never commits, pushes, or opens a pull request itself.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse, stringify } from 'yaml'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_TIMEOUT_MS = 20_000
const USER_AGENT = 'dsh-skin-market-catalog-audit'

function argument(name) {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  return value === undefined || value.startsWith('--') ? undefined : value
}

function flag(name) {
  return process.argv.includes(name)
}

function normalizeRepository(value) {
  const raw = typeof value === 'string'
    ? value
    : typeof value === 'object' && value !== null && typeof value.url === 'string' ? value.url : null
  if (raw === null) return null
  const normalized = raw.trim().replace(/^git\+/, '').replace(/^github:/, 'https://github.com/').replace(/\.git$/, '').replace(/\/$/, '')
  const match = /^(?:https?:\/\/github\.com\/)([^/\s]+)\/([^/\s]+)$/i.exec(normalized)
  return match === null ? null : `${match[1]}/${match[2]}`.toLowerCase()
}

const CANONICAL_INTEGRITY = /^sha(?:1|256|384|512)-[A-Za-z0-9+/]+={0,2}$/

function integrityBody(integrity) {
  return integrity.slice(integrity.indexOf('-') + 1)
}

function githubHeaders(token) {
  return {
    accept: 'application/vnd.github+json',
    'user-agent': USER_AGENT,
    ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
  }
}

async function getJson(url, fetchImpl, token, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const response = await fetchImpl(url, { headers: githubHeaders(token), redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })
  if (!response.ok) return { status: response.status, json: null }
  try {
    return { status: response.status, json: await response.json() }
  } catch {
    return { status: response.status, json: null }
  }
}

async function headOk(url, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    const response = await fetchImpl(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })
    return response.status === 200 || response.status === 204 || response.status === 302
  } catch {
    return false
  }
}

async function resolveGithubRepository(repository, fetchImpl, token) {
  const response = await getJson(`https://api.github.com/repos/${repository}`, fetchImpl, token)
  if (response.json === null || typeof response.json.full_name !== 'string') return null
  return response.json.full_name
}

/** Check whether a registry version can stand in for the pinned artifact. */
async function verifyNpmArtifact(source, skin, fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const name = skin.package
  const version = skin.install?.version
  const commit = typeof skin.install?.commit === 'string' ? skin.install.commit.toLowerCase() : null
  if (typeof name !== 'string' || typeof version !== 'string' || commit === null || !/^[0-9a-f]{40}$/.test(commit)) return null
  const registry = await getJson(`https://registry.npmjs.org/${encodeURIComponent(name)}`, fetchImpl, undefined, timeoutMs)
  if (registry.json === null || typeof registry.json !== 'object') return null
  const versionInfo = registry.json.versions?.[version]
  if (typeof versionInfo !== 'object' || versionInfo === null) return null
  const gitHead = typeof versionInfo.gitHead === 'string' ? versionInfo.gitHead.toLowerCase() : null
  if (gitHead !== commit) return null
  if (normalizeRepository(versionInfo.repository ?? registry.json.repository) !== normalizeRepository(skin.repo)) return null
  const integrity = versionInfo.dist?.integrity
  const tarball = versionInfo.dist?.tarball
  if (typeof integrity !== 'string' || !CANONICAL_INTEGRITY.test(integrity) || typeof tarball !== 'string') return null
  const tarballResponse = await fetchImpl(tarball, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) })
  if (!tarballResponse.ok) return null
  const bytes = Buffer.from(await tarballResponse.arrayBuffer())
  const digest = createHash('sha512').update(bytes).digest('base64')
  if (digest !== integrityBody(integrity)) return null
  const directory = mkdtempSync(join(tmpdir(), 'dsh-npm-verify-'))
  try {
    const tarballFile = join(directory, 'package.tgz')
    writeFileSync(tarballFile, bytes)
    const manifest = JSON.parse(execFileSync('tar', ['-xOzf', tarballFile, 'package/package.json'], { encoding: 'utf8' }))
    if (manifest.name !== name || manifest.version !== version) return null
    const patch = execFileSync('tar', ['-tzf', tarballFile], { encoding: 'utf8' }).includes('package/cordis.patch.yml')
    if (!patch) return null
    return { name, version, integrity, repository: skin.repo, gitHead: commit }
  } catch {
    return null
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

function sourceWithCommit(entry) {
  const match = /(?:#|\/tar\.gz\/)([0-9a-f]{40})(?:$|[#&/])/.exec(entry.url)
  return match?.[1]?.toLowerCase() ?? null
}

/**
 * @param report audit JSON (`missing` entries with `repository`, `url`, `ids`)
 * @param catalog parsed data/catalog.json
 */
export async function classifyCleanup(report, catalog, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch
  const token = options.token ?? process.env.GITHUB_TOKEN
  const skins = new Map((Array.isArray(catalog.skins) ? catalog.skins : []).map(skin => [skin.id, skin]))
  // The wire catalog keeps npm metadata outside skins[].install; merge it so an
  // already-revived entry is not written again on every daily run.
  const npmSources = typeof catalog.npmSources === 'object' && catalog.npmSources !== null ? catalog.npmSources : {}
  const actions = []
  const review = []
  const missing = Array.isArray(report.missing) ? report.missing : []
  for (const source of missing) {
    if (source.kind !== 'github') {
      review.push({ source, reason: 'non-github source missing; review manually' })
      continue
    }
    const newRepository = await resolveGithubRepository(source.repository, fetchImpl, token)
    const renamed = newRepository !== null && newRepository.toLowerCase() !== source.repository.toLowerCase()
    const commit = sourceWithCommit(source)
    if (renamed && commit !== null && await headOk(`https://codeload.github.com/${newRepository}/tar.gz/${commit}`, fetchImpl)) {
      actions.push({ kind: 'rename', source, newRepository })
      continue
    }
    const ids = Array.isArray(source.ids) ? source.ids : []
    const resolved = []
    for (const id of ids) {
      const skin = skins.get(id)
      if (skin === undefined) continue
      const npm = await verifyNpmArtifact(source, skin, fetchImpl)
      resolved.push({ id, skin, npm })
    }
    const pending = []
    for (const item of resolved) {
      if (item.npm === null) {
        pending.push({ kind: 'remove', source, id: item.id, reason: renamed ? 'repository renamed but the pinned commit is gone' : 'repository is gone and no verified npm artifact matches the pinned commit' })
        continue
      }
      const existing = item.skin.install?.npm ?? npmSources[item.id]
      const already = typeof existing === 'object' && existing !== null
        && existing.name === item.npm.name && existing.version === item.npm.version
        && existing.integrity === item.npm.integrity && existing.gitHead === item.npm.gitHead
        && normalizeRepository(existing.repository) === normalizeRepository(item.npm.repository)
      if (already) {
        review.push({ source, reason: `${item.id} already uses a verified npm source; the GitHub target stays missing, so keep this entry pinned to npm` })
        continue
      }
      pending.push({ kind: 'npm-revive', source, id: item.id, npm: item.npm })
    }
    if (pending.length > 0) {
      for (const action of pending) actions.push(action)
      continue
    }
    if (resolved.length === 0) review.push({ source, reason: 'source is missing but no current catalog entry references it' })
  }
  return { actions, review }
}

export function registryFilesById(registryDir) {
  const files = new Map()
  for (const name of readdirSync(registryDir)) {
    if (!name.endsWith('.yml')) continue
    const file = join(registryDir, name)
    const match = /^id:\s*(\S+)\s*$/m.exec(readFileSync(file, 'utf8'))
    if (match !== null) files.set(match[1], file)
  }
  return files
}

function replaceRepositoryReferences(value, oldRepository, newRepository) {
  if (typeof value === 'string') {
    return value
      .replaceAll(`github.com/${oldRepository}`, `github.com/${newRepository}`)
      .replaceAll(`raw.githubusercontent.com/${oldRepository}`, `raw.githubusercontent.com/${newRepository}`)
      .replaceAll(`codeload.github.com/${oldRepository}`, `codeload.github.com/${newRepository}`)
  }
  if (Array.isArray(value)) return value.map(item => replaceRepositoryReferences(item, oldRepository, newRepository))
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceRepositoryReferences(item, oldRepository, newRepository)]))
  }
  return value
}

export function renameEntry(entry, oldRepository, newRepository) {
  const next = replaceRepositoryReferences(entry, oldRepository, newRepository)
  next.repo = `https://github.com/${newRepository}`
  if (typeof next.install?.target === 'string') {
    next.install.target = next.install.target.replace(`github:${oldRepository}#`, `github:${newRepository}#`)
  }
  if (next.install?.npm !== undefined) next.install.npm.repository = `https://github.com/${newRepository}`
  return next
}

export function applyCatalogCleanup(actions, options = {}) {
  const registryDir = options.registryDir ?? join(root, 'registry/skins')
  const write = options.write === true
  const files = registryFilesById(registryDir)
  const result = { removed: [], revived: [], renamed: [], skipped: [] }
  for (const action of actions) {
    const file = files.get(action.id ?? action.source?.ids?.[0])
    if (action.kind === 'rename') {
      const ids = action.source?.ids ?? []
      for (const id of ids) {
        const entryFile = files.get(id)
        if (entryFile === undefined) { result.skipped.push({ id, reason: 'registry file not found' }); continue }
        const entry = parse(readFileSync(entryFile, 'utf8'))
        const next = renameEntry(entry, action.source.repository, action.newRepository)
        if (write) writeFileSync(entryFile, stringify(next, { lineWidth: 0 }))
        result.renamed.push({ id, from: action.source.repository, to: action.newRepository })
      }
      continue
    }
    if (file === undefined) { result.skipped.push({ id: action.id, reason: 'registry file not found' }); continue }
    if (action.kind === 'remove') {
      if (write) rmSync(file, { force: true })
      result.removed.push({ id: action.id })
      continue
    }
    if (action.kind === 'npm-revive') {
      const entry = parse(readFileSync(file, 'utf8'))
      entry.install = { ...entry.install, npm: action.npm }
      if (write) writeFileSync(file, stringify(entry, { lineWidth: 0 }))
      result.revived.push({ id: action.id, npm: action.npm.name, version: action.npm.version })
    }
  }
  if (write && (result.removed.length > 0 || result.revived.length > 0 || result.renamed.length > 0)) {
    const run = options.runRegistry ?? (() => execFileSync('npm', ['run', 'registry'], { cwd: root, stdio: 'inherit' }))
    run()
  }
  return result
}

export function renderMarkdown(result, classified) {
  const lines = []
  const stamp = new Date().toISOString()
  lines.push(`## Catalog install-source audit (${stamp.slice(0, 10)})`)
  lines.push('')
  lines.push('| action | skin | source | evidence |')
  lines.push('| --- | --- | --- | --- |')
  for (const action of classified.actions) {
    if (action.kind === 'rename') {
      lines.push(`| rename | ${(action.source.ids ?? []).join(', ')} | ${action.source.repository} | GitHub redirects to \`${action.newRepository}\`; pinned commit still exists there |`)
    } else if (action.kind === 'npm-revive') {
      lines.push(`| npm revive | ${action.id} | ${action.source.repository} | npm \`${action.npm.name}@${action.npm.version}\` matches the pinned commit and tarball integrity |`)
    } else {
      lines.push(`| remove | ${action.id} | ${action.source.repository} | ${action.reason} |`)
    }
  }
  if (classified.review.length > 0) {
    lines.push('')
    lines.push('### Needs maintainer review')
    for (const item of classified.review) lines.push(`- ${item.source.repository}: ${item.reason}`)
  }
  lines.push('')
  lines.push(`applied: removed ${result.removed.length}, revived ${result.revived.length}, renamed ${result.renamed.length}, skipped ${result.skipped.length}`)
  return lines.join('\n')
}

async function main() {
  const reportPath = argument('--report') ?? '/tmp/audit.json'
  const report = JSON.parse(readFileSync(resolve(reportPath), 'utf8'))
  const catalog = JSON.parse(readFileSync(join(root, 'data/catalog.json'), 'utf8'))
  const classified = await classifyCleanup(report, catalog)
  const json = flag('--json')
  const write = flag('--write')
  const result = write
    ? applyCatalogCleanup(classified.actions, { write: true })
    : applyCatalogCleanup(classified.actions, { write: false })
  if (json) console.log(JSON.stringify({ classified, result }, null, 2))
  else console.log(renderMarkdown(result, classified))
  if (classified.actions.length === 0) process.exitCode = 0
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
