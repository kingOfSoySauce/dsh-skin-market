import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { SkinCompanion, SkinEntry } from './types.ts'
import { npmInstallTarget } from './install-source.ts'
export { npmInstallTarget, preferredInstallTarget } from './install-source.ts'

interface PackageManifest {
  name?: unknown
  dsh?: { client?: unknown }
}

export interface GithubTargetParts {
  repository: string
  commit: string
  subpath?: string
}

/** Repo-relative directory for pnpm's `#path:` / `&path:/` selectors. */
export function validSubpath(subpath: string): boolean {
  if (!/^[A-Za-z0-9_./-]+$/.test(subpath)) return false
  return !subpath.split('/').some(seg => seg === '' || seg === '.' || seg === '..')
}

export function normalizeGithubSubpath(subpath: string): string {
  const normalized = subpath.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
  if (!validSubpath(normalized)) throw new Error(`invalid github subpath: ${subpath}`)
  return normalized
}

/** pnpm git subdirectory selector. Leading slash is required; see pnpm PR #7487. */
export function githubPathQuery(subpath: string): string {
  return `&path:/${normalizeGithubSubpath(subpath)}`
}

export function githubInstallTarget(repository: string, commit: string, subpath?: string): string {
  return `github:${repository}#${commit}${subpath === undefined ? '' : githubPathQuery(subpath)}`
}

export function parseGithubTarget(target: string): GithubTargetParts | null {
  const match = /^github:([^#]+)#([0-9a-f]{40})(?:&path:\/?([A-Za-z0-9._/-]+))?$/i.exec(target)
  if (match === null) return null
  const raw = match[3]
  if (raw === undefined) {
    return { repository: match[1], commit: match[2].toLowerCase() }
  }
  try {
    return { repository: match[1], commit: match[2].toLowerCase(), subpath: normalizeGithubSubpath(raw) }
  } catch {
    return null
  }
}

export function companionAsSkin(skin: SkinEntry, companion: SkinCompanion): SkinEntry {
  const parts = parseGithubTarget(companion.target)
  return {
    ...skin,
    ...(parts === null ? {} : { repo: `https://github.com/${parts.repository}` }),
    package: companion.package,
    rowId: companion.rowId,
    ...(parts?.subpath === undefined ? { subpath: undefined } : { subpath: parts.subpath }),
    install: {
      target: companion.target,
      version: companion.version,
      commit: companion.commit,
    },
  }
}

export function isNpmInstallTarget(skin: SkinEntry, target: string): boolean {
  return npmInstallTarget(skin) === target
}

export function repositoryIdentity(value: unknown): string | null {
  const raw = typeof value === 'string'
    ? value
    : typeof value === 'object' && value !== null && 'url' in value && typeof value.url === 'string' ? value.url : null
  if (raw === null) return null
  const normalized = raw.trim().replace(/^git\+/, '').replace(/^github:/, 'https://github.com/')
  const match = /^(?:(?:https?|git):\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([^/\s]+)\/([^/#?\s]+?)(?:\.git)?\/?$/i.exec(normalized)
  return match === null ? null : `${match[1]}/${match[2]}`.toLowerCase()
}

/** Validate the provenance fields before trusting a catalog's npm alternative. */
export function reviewedNpmSourceError(skin: SkinEntry): string | null {
  const npm = skin.install.npm
  if (npm === undefined) return '尚无已核验的 npm 安装来源'
  if (npm.name !== skin.package) return 'npm 包名与目录皮肤不一致'
  if (npm.version !== skin.install.version) return 'npm 版本与目录固定版本不一致'
  if (!/^[0-9a-f]{40}$/i.test(npm.gitHead) || npm.gitHead.toLowerCase() !== skin.install.commit.toLowerCase()) return 'npm gitHead 与目录固定 commit 不一致'
  const repository = repositoryIdentity(npm.repository)
  if (repository === null || repository !== repositoryIdentity(skin.repo)) return 'npm repository 与目录仓库不一致'
  if (!/^sha(?:1|256|384|512)-[A-Za-z0-9+/]+={0,2}$/.test(npm.integrity)) return 'npm integrity 缺失或格式无效'
  return null
}

function isNpmDependencySpec(spec: string, packageName: string): boolean {
  let version = spec
  for (const prefix of [`npm:${packageName}@`, `${packageName}@`]) {
    if (version.startsWith(prefix)) { version = version.slice(prefix.length); break }
  }
  // Registry versions, ranges and dist tags; URL, local and other aliases are
  // intentionally excluded so Update cannot silently replace their source.
  return /^(?:[~^<>=*v\d][\dA-Za-z.*+~^<>=|\s-]*|[A-Za-z][A-Za-z0-9._-]*)$/.test(version)
}

/** Ordinary updates retain the source family recorded in the live profile. */
export function updateInstallTarget(skin: SkinEntry, currentSpec: string | undefined): string {
  if (currentSpec === undefined) throw new Error('请先安装皮肤，再执行更新')
  if (/^github:/i.test(currentSpec)
    || /^(?:git\+)?(?:https?|git):\/\/github\.com\//i.test(currentSpec)
    || /^https:\/\/codeload\.github\.com\//i.test(currentSpec)
    || /^(?:ssh:\/\/)?git@github\.com[:/]/i.test(currentSpec)) return skin.install.target
  if (isNpmDependencySpec(currentSpec, skin.package)) {
    const error = reviewedNpmSourceError(skin)
    if (error !== null) throw new Error(`无法继续从 npm 更新：${error}`)
    return npmInstallTarget(skin)!
  }
  throw new Error('当前皮肤使用本地或自定义安装来源，无法自动更新；请按原安装方式更新')
}

function readManifest(file: string): PackageManifest | null {
  try { return JSON.parse(readFileSync(file, 'utf8')) as PackageManifest } catch { return null }
}

function isDirectoryLike(path: string): boolean {
  try { return statSync(path).isDirectory() } catch { return false }
}

function hasDshClient(manifest: PackageManifest | null): boolean {
  return typeof manifest?.dsh?.client === 'object' && manifest.dsh.client !== null
}

function packageRoots(nodeModules: string): string[] {
  if (!existsSync(nodeModules)) return []
  const roots: string[] = []
  for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
    if ((!entry.isDirectory() && !entry.isSymbolicLink()) || entry.name === '.bin' || entry.name === '.pnpm') continue
    if (entry.name.startsWith('@')) {
      const scopeDir = join(nodeModules, entry.name)
      for (const child of readdirSync(scopeDir, { withFileTypes: true })) {
        if ((child.isDirectory() || child.isSymbolicLink()) && isDirectoryLike(join(scopeDir, child.name))) roots.push(join(scopeDir, child.name))
      }
    } else if (isDirectoryLike(join(nodeModules, entry.name))) roots.push(join(nodeModules, entry.name))
  }
  return roots
}

function findCandidates(root: string, skin: SkinEntry, candidates: string[], depth = 0): void {
  if (depth > 8) return
  const manifest = readManifest(join(root, 'package.json'))
  if (typeof manifest?.name === 'string' && manifest.name === skin.package && hasDshClient(manifest)) {
    candidates.push(root)
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === '.git') continue
    findCandidates(join(root, entry.name), skin, candidates, depth + 1)
  }
}

/**
 * Inspect a root GitHub package fetched into a temporary profile. A package
 * collection is only retargeted when exactly one child is the reviewed DSH
 * package; ambiguous collections remain a catalog error instead of guessing.
 */
export function discoverMonorepoTarget(directory: string, skin: SkinEntry, target: string): string | null {
  const parts = parseGithubTarget(target)
  if (parts === null || parts.subpath !== undefined) return null
  const nodeModules = join(directory, 'node_modules')
  const roots = packageRoots(nodeModules)
  if (roots.length === 0) return null

  const candidates: string[] = []
  for (const root of roots) {
    const rootManifest = readManifest(join(root, 'package.json'))
    if (typeof rootManifest?.name === 'string' && rootManifest.name === skin.package && hasDshClient(rootManifest)) return null
    findCandidates(root, skin, candidates)
  }
  const unique = [...new Set(candidates)]
  if (unique.length === 0) throw new Error(`GitHub 仓库 ${parts.repository} 未找到可加载的 ${skin.package} 子包，请检查目录中的 package/path 配置`)
  if (unique.length > 1) {
    const paths = unique.map(candidate => relative(roots[0]!, candidate).split(sep).join('/')).join(', ')
    throw new Error(`GitHub 仓库 ${parts.repository} 找到多个 ${skin.package} 子包（${paths}），请在目录中明确 subpath`)
  }
  const root = roots.find(candidate => unique[0] === candidate || unique[0]!.startsWith(`${candidate}${sep}`))
  if (root === undefined) throw new Error(`无法确定 ${skin.package} 的 monorepo 根目录`)
  const subpath = relative(root, unique[0]!).split(sep).join('/')
  if (subpath === '' || subpath.startsWith('../')) throw new Error(`无法确定 ${skin.package} 的 monorepo 子路径`)
  return githubInstallTarget(parts.repository, parts.commit, subpath)
}
