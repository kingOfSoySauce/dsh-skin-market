#!/usr/bin/env node
/**
 * 清理 site/public/skin-screenshots 下不再被引用的旧 pin 截图目录。
 *
 * 判定规则（只有同时满足才可删除）：
 *   1) 目录路径 site/public/skin-screenshots/<owner>/<40hex>/ 未被 data/catalog.json
 *      中任何字符串引用（对 catalog 做全量字符串扫描，覆盖 listScreenshot /
 *      marketScreenshots / screenshots / media.list / media.screenshots 等字段）；
 *   2) 该 40hex commit（以及相对路径 skin-screenshots/<owner>/<40hex>）未被任何
 *      tracked 文本文件引用（git grep -I -F，二进制文件跳过）。
 *
 * 默认 dry-run；--apply 才真正删除。删除是 worktree 变更，不执行 git add / commit。
 *
 * 用法：
 *   node scripts/prune-unreferenced-screenshots.mjs                      # dry-run
 *   node scripts/prune-unreferenced-screenshots.mjs --apply              # 执行删除
 *   node scripts/prune-unreferenced-screenshots.mjs --apply --report docs/asset-prune-2026-11-14.md
 *   node scripts/prune-unreferenced-screenshots.mjs --verify             # 校验 catalog 引用完整性
 *   node scripts/prune-unreferenced-screenshots.mjs --dry-run --report docs/asset-prune-2026-11-14.md
 *
 * 可选参数：
 *   --apply                 真正删除（默认 dry-run）
 *   --report <path>         生成/刷新 Markdown 报告（相对仓库根目录）
 *   --note <text>           追加一条报告备注（可重复）
 *   --ignore-commit-refs    放宽门禁：仅保留"目录路径被 tracked 文本引用"的目录，
 *                           忽略仅被 commit hash 引用的目录。默认关闭；使用前需明确批准。
 *   --catalog <path>        自定义 catalog 路径（默认 data/catalog.json）
 *   --root <dir>            自定义截图根目录（默认 site/public/skin-screenshots）
 *   --verify                只校验 catalog 中 skin-screenshots 引用在磁盘存在
 */

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const SHA_RE = /^[0-9a-f]{40}$/
const SCREENSHOTS_SEGMENT = 'skin-screenshots'
const SKIN_SCREENSHOTS_ROOT = 'site/public/skin-screenshots'
const ANSI = process.stdout.isTTY && process.env.NO_COLOR === undefined
const c = {
  bold: (s) => (ANSI ? `\u001b[1m${s}\u001b[0m` : s),
  dim: (s) => (ANSI ? `\u001b[2m${s}\u001b[0m` : s),
  red: (s) => (ANSI ? `\u001b[31m${s}\u001b[0m` : s),
  yellow: (s) => (ANSI ? `\u001b[33m${s}\u001b[0m` : s),
  green: (s) => (ANSI ? `\u001b[32m${s}\u001b[0m` : s),
}

function fail(message) {
  console.error(c.red(`[prune] 错误：${message}`))
  process.exit(2)
}

function git(args, { allowStatus = [0] } = {}) {
  const result = spawnSync('git', args, {
    cwd: GIT_TOP,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  if (result.error) fail(`执行 git ${args.join(' ')} 失败：${result.error.message}`)
  if (!allowStatus.includes(result.status)) {
    fail(`git ${args.join(' ')} 退出码 ${result.status}：${(result.stderr || '').trim()}`)
  }
  return result
}

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const options = {
    apply: false,
    verify: false,
    ignoreCommitRefs: false,
    catalog: 'data/catalog.json',
    root: SKIN_SCREENSHOTS_ROOT,
    report: null,
    notes: [],
    help: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    switch (arg) {
      case '--apply':
        options.apply = true
        break
      case '--diff':
      case '--dry-run':
        options.apply = false
        break
      case '--verify':
        options.verify = true
        break
      case '--ignore-commit-refs':
        options.ignoreCommitRefs = true
        break
      case '--catalog':
        i += 1
        if (argv[i] === undefined) fail('--catalog 需要一个路径参数')
        options.catalog = argv[i]
        break
      case '--root':
        i += 1
        if (argv[i] === undefined) fail('--root 需要一个路径参数')
        options.root = argv[i]
        break
      case '--report':
        i += 1
        if (argv[i] === undefined) fail('--report 需要一个路径参数')
        options.report = argv[i]
        break
      case '--note':
        i += 1
        if (argv[i] === undefined) fail('--note 需要一段文本')
        options.notes.push(argv[i])
        break
      case '--help':
      case '-h':
        options.help = true
        break
      default:
        fail(`未知参数 ${arg}（--help 查看用法）`)
    }
  }
  return options
}

function printHelp() {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n/, ''))
}

// ---------------------------------------------------------------------------
// catalog 引用收集
// ---------------------------------------------------------------------------
function collectCatalogRefs(catalog) {
  const strings = new Set()
  const visit = (value) => {
    if (typeof value === 'string') {
      if (value.includes(`${SCREENSHOTS_SEGMENT}/`)) strings.add(value)
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    if (value !== null && typeof value === 'object') {
      for (const key of Object.keys(value)) visit(value[key])
    }
  }
  visit(catalog)

  const dirs = new Map() // relDir(posix) -> { owner, sha, absDir }
  const files = new Map() // absFilePath -> { relDir, url }
  const unparsed = []
  for (const value of strings) {
    const idx = value.indexOf(`${SCREENSHOTS_SEGMENT}/`)
    const rest = value.slice(idx + SCREENSHOTS_SEGMENT.length + 1)
    const segments = rest.split('/')
    const owner = segments[0]
    const sha = segments[1] ?? ''
    if (owner === '' || !SHA_RE.test(sha)) {
      unparsed.push(value)
      continue
    }
    const relDir = `${SCREENSHOTS_SEGMENT}/${owner}/${sha}`
    const absDir = join(rootAbs, owner, sha)
    dirs.set(relDir, { owner, sha, absDir })
    const fileSegments = segments.slice(2).filter((segment) => segment !== '')
    if (fileSegments.length > 0) {
      files.set(join(absDir, ...fileSegments), { relDir, url: value })
    }
  }
  return { strings, dirs, files, unparsed }
}

// ---------------------------------------------------------------------------
// 磁盘扫描 / 度量
// ---------------------------------------------------------------------------
function scanCommitDirs(absRoot) {
  const dirs = []
  const skipped = []
  if (!existsSync(absRoot)) fail(`截图根目录不存在：${absRoot}`)
  for (const ownerEntry of readdirSync(absRoot, { withFileTypes: true })) {
    if (!ownerEntry.isDirectory()) {
      skipped.push({ rel: ownerEntry.name, why: 'owner 层存在非目录条目' })
      continue
    }
    const ownerAbs = join(absRoot, ownerEntry.name)
    for (const commitEntry of readdirSync(ownerAbs, { withFileTypes: true })) {
      const rel = `${ownerEntry.name}/${commitEntry.name}`
      if (!commitEntry.isDirectory()) {
        skipped.push({ rel, why: 'commit 层存在非目录条目' })
        continue
      }
      if (!SHA_RE.test(commitEntry.name)) {
        skipped.push({ rel, why: '目录名不是 40 位 commit hash，跳过' })
        continue
      }
      dirs.push({
        rel,
        owner: ownerEntry.name,
        sha: commitEntry.name,
        abs: join(ownerAbs, commitEntry.name),
        relDir: `${SCREENSHOTS_SEGMENT}/${rel}`,
      })
    }
  }
  dirs.sort((a, b) => a.rel.localeCompare(b.rel))
  return { dirs, skipped }
}

function measureDir(absDir) {
  let files = 0
  let bytes = 0
  let unsafe = null
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const entryAbs = join(dir, entry.name)
      if (entry.isDirectory()) walk(entryAbs)
      else if (entry.isFile()) {
        files += 1
        bytes += statSync(entryAbs).size
      } else if (unsafe === null) {
        unsafe = `包含非普通文件（符号链接等）：${relative(REPO_ROOT, entryAbs)}`
      }
    }
  }
  walk(absDir)
  return { files, bytes, unsafe }
}

function measureAll(dirs) {
  const total = { dirs: 0, files: 0, bytes: 0 }
  for (const dir of dirs) {
    const stat = measureDir(dir.abs)
    total.dirs += 1
    total.files += stat.files
    total.bytes += stat.bytes
  }
  return total
}

// ---------------------------------------------------------------------------
// tracked 文本引用扫描（git grep）
// ---------------------------------------------------------------------------
function findTrackedTextRefs(candidates) {
  const hashHits = new Map() // sha -> Set(file)
  const pathHits = new Map() // skin-screenshots/<owner>/<sha> -> Set(file)
  if (candidates.length === 0) return { hashHits, pathHits }

  const hashPatterns = [...new Set(candidates.map((dir) => dir.sha))]
  const pathPatterns = [...new Set(candidates.map((dir) => dir.relDir))]
  const workDir = mkdtempSync(join(tmpdir(), `dsh-skin-prune-${process.pid}-`))
  const patternFile = join(workDir, 'patterns.txt')
  writeFileSync(patternFile, `${[...hashPatterns, ...pathPatterns].join('\n')}\n`, 'utf8')
  try {
    const result = git(
      ['grep', '-I', '-F', '-o', '-n', '-f', patternFile, '--', '.'],
      { allowStatus: [0, 1] },
    )
    for (const line of (result.stdout ?? '').split('\n')) {
      if (line === '') continue
      const firstSep = line.indexOf(':')
      if (firstSep < 0) continue
      const file = line.slice(0, firstSep)
      const rest = line.slice(firstSep + 1)
      const secondSep = rest.indexOf(':')
      if (secondSep < 0) continue
      const match = rest.slice(secondSep + 1)
      if (SHA_RE.test(match)) {
        if (!hashHits.has(match)) hashHits.set(match, new Set())
        hashHits.get(match).add(file)
      } else if (match.startsWith(`${SCREENSHOTS_SEGMENT}/`)) {
        if (!pathHits.has(match)) pathHits.set(match, new Set())
        pathHits.get(match).add(file)
      }
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
  return { hashHits, pathHits }
}

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------
function fmtBytes(bytes) {
  return `${bytes.toLocaleString('en-US')} B（${(bytes / 1024 / 1024).toFixed(2)} MiB）`
}

function fmtMiB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
}

function relRepo(absPath) {
  return relative(REPO_ROOT, absPath).split(sep).join('/')
}

function renderTable(rows, columns) {
  const head = `| ${columns.map((column) => column.label).join(' | ')} |`
  const divider = `| ${columns.map(() => '---').join(' | ')} |`
  const body = rows.map((row) => `| ${columns.map((column) => column.value(row)).join(' | ')} |`)
  return [head, divider, ...body].join('\n')
}

function attributedFiles(map, key) {
  const files = map.get(key)
  return files === undefined ? [] : [...files].sort()
}

function categoryOfTrackedFile(file) {
  if (file === 'data/catalog.json') return 'catalog'
  if (file === 'site/public/skin-media/v1/manifest.json') return 'manifest'
  if (file.startsWith('registry/')) return 'registry'
  if (file.startsWith('docs/')) return 'docs'
  if (file.startsWith('tests/')) return 'tests'
  return 'other'
}

const CATEGORY_LABELS = {
  catalog: 'catalog.json',
  manifest: 'skin-media manifest',
  registry: 'registry YAML',
  docs: 'docs',
  tests: 'tests',
  other: '其他 tracked 文本',
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
function main() {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    return
  }

  const catalogAbs = resolve(REPO_ROOT, options.catalog)
  rootAbs = resolve(REPO_ROOT, options.root)
  if (!existsSync(catalogAbs)) fail(`catalog 不存在：${relRepo(catalogAbs)}`)
  if (!existsSync(rootAbs)) fail(`截图根目录不存在：${relRepo(rootAbs)}`)
  if (!rootAbs.startsWith(join(REPO_ROOT, 'site/public') + sep)) {
    fail(`截图根目录必须位于 site/public 下，实际为 ${relRepo(rootAbs)}`)
  }
  if (basename(rootAbs) !== SCREENSHOTS_SEGMENT) {
    fail(`截图根目录必须以 ${SCREENSHOTS_SEGMENT} 结尾，实际为 ${relRepo(rootAbs)}`)
  }

  const catalog = JSON.parse(readFileSync(catalogAbs, 'utf8'))
  const refs = collectCatalogRefs(catalog)

  const commandLine = `node scripts/prune-unreferenced-screenshots.mjs ${process.argv.slice(2).join(' ')}`.trim()

  // --verify：只校验引用完整性
  if (options.verify) {
    const missingDirs = [...refs.dirs.entries()].filter(([, dir]) => !existsSync(dir.absDir))
    const missingFiles = [...refs.files.entries()].filter(([absFile]) => !existsSync(absFile))
    console.log(c.bold('[verify] catalog 截图引用完整性'))
    console.log(`  catalog 字符串引用：${refs.strings.size}；解析失败：${refs.unparsed.length}`)
    console.log(`  引用 commit 目录：${refs.dirs.size}；缺失：${missingDirs.length}`)
    console.log(`  引用图片文件：${refs.files.size}；缺失：${missingFiles.length}`)
    if (missingDirs.length > 0) {
      console.log(c.red('缺失目录：'))
      for (const [relDir, dir] of missingDirs) console.log(`  - ${relDir} -> ${relRepo(dir.absDir)}`)
    }
    if (missingFiles.length > 0) {
      console.log(c.red('缺失文件：'))
      for (const [absFile, meta] of missingFiles) console.log(`  - ${relRepo(absFile)}`)
    }
    if (missingDirs.length > 0 || missingFiles.length > 0 || refs.unparsed.length > 0) {
      process.exitCode = 1
    }
    return
  }

  const scan = scanCommitDirs(rootAbs)
  const before = measureAll(scan.dirs)
  const onDiskRelDirs = new Set(scan.dirs.map((dir) => dir.relDir))

  const missingRefDirsBefore = [...refs.dirs.values()].filter((dir) => !existsSync(dir.absDir))
  const missingRefFilesBefore = [...refs.files.keys()].filter((absFile) => !existsSync(absFile))

  const candidates = scan.dirs.filter((dir) => !refs.dirs.has(dir.relDir))
  const candidateMeasure = new Map()
  for (const dir of candidates) candidateMeasure.set(dir.relDir, measureDir(dir.abs))
  const candidateTotals = {
    dirs: candidates.length,
    files: 0,
    bytes: 0,
  }
  for (const stat of candidateMeasure.values()) {
    candidateTotals.files += stat.files
    candidateTotals.bytes += stat.bytes
  }

  console.log(c.bold('[prune] 截图资产清理'))
  console.log(c.dim(`  仓库：${REPO_ROOT}`))
  console.log(`  catalog：${relRepo(catalogAbs)}（字符串引用 ${refs.strings.size} 条，解析失败 ${refs.unparsed.length} 条）`)
  console.log(
    `  tracked 文本引用扫描：git grep -I -F（${candidates.length} 个候选目录的 hash 与相对路径）`,
  )
  console.log(
    `  磁盘 commit 目录：${before.dirs}（文件 ${before.files}，逻辑 ${fmtMiB(before.bytes)}）`,
  )
  console.log(
    `  catalog 引用 commit 目录：${refs.dirs.size}（缺失 ${missingRefDirsBefore.length}）；引用图片：${refs.files.size}（缺失 ${missingRefFilesBefore.length}）`,
  )
  console.log(
    `  catalog 未引用目录：${candidateTotals.dirs}（文件 ${candidateTotals.files}，逻辑 ${fmtMiB(candidateTotals.bytes)}）`,
  )

  if (refs.unparsed.length > 0) {
    console.log(c.yellow(`  警告：${refs.unparsed.length} 条 catalog 字符串无法解析为截图目录（保守起见不参与判定）`))
    for (const value of refs.unparsed.slice(0, 5)) console.log(c.dim(`    - ${value}`))
  }

  const trackedRefs = findTrackedTextRefs(candidates)
  const records = []
  for (const dir of candidates) {
    const stat = candidateMeasure.get(dir.relDir)
    const pathHits = attributedFiles(trackedRefs.pathHits, dir.relDir)
    const hashHits = attributedFiles(trackedRefs.hashHits, dir.sha)
    // path 命中时 hash 必然也出现在路径里；两者取并集
    const protectedByPath = pathHits.length > 0
    const protectedByHash = hashHits.length > 0 || protectedByPath
    records.push({
      ...dir,
      ...stat,
      pathHits,
      hashHits,
      protectedByPath,
      protectedByHash,
    })
  }
  const protectedRecords = records.filter((record) => record.protectedByHash)
  const pathProtected = protectedRecords.filter((record) => record.protectedByPath)
  const hashOnlyProtected = protectedRecords.filter((record) => !record.protectedByPath)
  const protectionCategories = {}
  for (const key of Object.keys(CATEGORY_LABELS)) protectionCategories[key] = 0
  for (const record of protectedRecords) {
    const categories = new Set()
    for (const file of [...record.pathHits, ...record.hashHits]) categories.add(categoryOfTrackedFile(file))
    for (const category of categories) protectionCategories[category] += 1
  }

  const deletable = records.filter((record) => {
    if (record.unsafe !== null) return false
    if (record.protectedByPath) return false
    if (!options.ignoreCommitRefs && record.protectedByHash) return false
    return true
  })
  const relaxedOnly = records.filter(
    (record) => record.unsafe === null && record.protectedByHash && !record.protectedByPath,
  )
  deletable.sort((a, b) => b.bytes - a.bytes || a.rel.localeCompare(b.rel))
  relaxedOnly.sort((a, b) => b.bytes - a.bytes || a.rel.localeCompare(b.rel))

  const deletableTotals = {
    dirs: deletable.length,
    files: deletable.reduce((sum, record) => sum + record.files, 0),
    bytes: deletable.reduce((sum, record) => sum + record.bytes, 0),
  }
  const relaxedTotals = {
    dirs: relaxedOnly.length,
    files: relaxedOnly.reduce((sum, record) => sum + record.files, 0),
    bytes: relaxedOnly.reduce((sum, record) => sum + record.bytes, 0),
  }

  if (protectedRecords.length > 0) {
    console.log(
      `  tracked 文本引用保护：${protectedRecords.length} 个目录（路径引用 ${pathProtected.length}，仅 commit hash 引用 ${hashOnlyProtected.length}${
        options.ignoreCommitRefs ? '，后者按授权放宽删除' : ''
      }）`,
    )
    const parts = Object.entries(protectionCategories)
      .filter(([, count]) => count > 0)
      .map(([category, count]) => `${CATEGORY_LABELS[category]} ${count}`)
    console.log(`  引用来源（按目录计）：${parts.join(' / ')}`)
    if (pathProtected.length > 0) {
      console.log('  真实路径引用（必须保留）：')
      for (const record of [...pathProtected].sort((a, b) => a.rel.localeCompare(b.rel))) {
        const refFiles = [...new Set([...record.pathHits, ...record.hashHits])].sort()
        console.log(c.dim(`    - ${record.rel} <- ${refFiles.join(', ')}`))
      }
    }
  }
  if (scan.skipped.length > 0) {
    console.log(c.yellow(`  跳过 ${scan.skipped.length} 个非常规条目：`))
    for (const skipped of scan.skipped.slice(0, 10)) console.log(c.dim(`    - ${skipped.rel}：${skipped.why}`))
  }
  const unsafeRecords = records.filter((record) => record.unsafe !== null)
  if (unsafeRecords.length > 0) {
    console.log(c.yellow(`  有 ${unsafeRecords.length} 个目录包含非常规文件，保守起见不删除：`))
    for (const record of unsafeRecords.slice(0, 10)) console.log(c.dim(`    - ${record.rel}：${record.unsafe}`))
  }

  console.log(
    c.bold(
      `\n可删除目标（${options.ignoreCommitRefs ? '--ignore-commit-refs 放宽模式' : '严格模式'}）：${deletableTotals.dirs} 个目录 / ${deletableTotals.files} 文件 / ${fmtBytes(deletableTotals.bytes)}`,
    ),
  )
  const top = deletable.slice(0, 20)
  if (top.length > 0) {
    console.log('TOP 20（按逻辑字节降序）：')
    const width = Math.max(...top.map((record) => record.rel.length), 10)
    top.forEach((record, index) => {
      console.log(
        `  ${String(index + 1).padStart(2)}. ${record.rel.padEnd(width)}  ${String(record.files).padStart(3)} 文件  ${fmtBytes(record.bytes)}`,
      )
    })
    console.log(`  合计：${deletableTotals.dirs} 目录 / ${deletableTotals.files} 文件 / ${fmtBytes(deletableTotals.bytes)}`)
  }
  if (relaxedOnly.length > 0 && !options.ignoreCommitRefs) {
    console.log(
      c.yellow(
        `  另有 ${relaxedTotals.dirs} 个目录（${relaxedTotals.files} 文件 / ${fmtBytes(relaxedTotals.bytes)}）仅被 tracked 文本中的 commit hash 引用、目录路径未被引用；本轮按严格规则保留（如需删除需明确批准后使用 --ignore-commit-refs）。`,
      ),
    )
  }

  if (!options.apply) {
    console.log(c.green('\n[dry-run] 未删除任何文件。确认无误后使用 --apply 执行删除。'))
    if (options.report !== null) {
      writeReport(options, {
        mode: 'dry-run',
        ignoreCommitRefs: options.ignoreCommitRefs,
        commandLine,
        catalogAbs,
        refs,
        scan,
        before,
        after: before,
        missingRefDirsBefore,
        missingRefFilesBefore,
        missingRefDirsAfter: missingRefDirsBefore,
        missingRefFilesAfter: missingRefFilesBefore,
        candidates: records,
        deletable,
        deletableTotals,
        protectedRecords,
        pathProtected,
        hashOnlyProtected,
        protectionCategories,
        relaxedOnly,
        relaxedTotals,
        deleted: [],
        removedOwners: [],
        failures: [],
        gitStatus: null,
      })
    }
    return
  }

  // 删除
  console.log(c.bold('\n[apply] 开始删除……'))
  const deleted = []
  const failures = []
  for (const record of deletable) {
    try {
      if (!existsSync(record.abs)) {
        failures.push({ rel: record.rel, reason: '删除前目录已不存在' })
        continue
      }
      rmSync(record.abs, { recursive: true, force: false })
      deleted.push(record)
    } catch (error) {
      failures.push({ rel: record.rel, reason: error.message })
    }
  }
  const removedOwners = []
  const touchedOwners = new Set(deleted.map((record) => record.owner))
  for (const owner of [...touchedOwners].sort()) {
    const ownerAbs = join(rootAbs, owner)
    if (!existsSync(ownerAbs) || !statSync(ownerAbs).isDirectory()) continue
    if (readdirSync(ownerAbs).length === 0) {
      rmdirSync(ownerAbs)
      removedOwners.push(owner)
    }
  }

  const afterScan = scanCommitDirs(rootAbs)
  const after = measureAll(afterScan.dirs)
  const missingRefDirsAfter = [...refs.dirs.values()].filter((dir) => !existsSync(dir.absDir))
  const missingRefFilesAfter = [...refs.files.keys()].filter((absFile) => !existsSync(absFile))
  const gitStatusResult = git(
    ['status', '--short', '--', SKIN_SCREENSHOTS_ROOT],
    { allowStatus: [0, 1] },
  )
  const gitStatusLines = (gitStatusResult.stdout ?? '').split('\n').filter((line) => line !== '')

  const deletedTotals = {
    dirs: deleted.length,
    files: deleted.reduce((sum, record) => sum + record.files, 0),
    bytes: deleted.reduce((sum, record) => sum + record.bytes, 0),
  }

  console.log(c.green(`删除完成：${deletedTotals.dirs} 个目录 / ${deletedTotals.files} 文件 / ${fmtBytes(deletedTotals.bytes)}`))
  if (removedOwners.length > 0) console.log(`同时清理空 owner 目录：${removedOwners.length} 个`)
  if (failures.length > 0) {
    console.log(c.red(`删除失败 ${failures.length} 个：`))
    for (const failure of failures) console.log(c.dim(`  - ${failure.rel}：${failure.reason}`))
  }
  console.log(c.bold('\n[apply] 清理后统计'))
  console.log(`  commit 目录：${after.dirs}（文件 ${after.files}，逻辑 ${fmtMiB(after.bytes)}）`)
  console.log(`  catalog 引用但缺失的目录：${missingRefDirsAfter.length}（应为 0）`)
  console.log(`  catalog 引用但缺失的文件：${missingRefFilesAfter.length}（应为 0）`)
  console.log(`  git status --short ${SKIN_SCREENSHOTS_ROOT}：${gitStatusLines.length} 行`)

  const hasProblem =
    failures.length > 0 || missingRefDirsAfter.length > 0 || missingRefFilesAfter.length > 0
  if (missingRefDirsAfter.length > 0) {
    console.log(c.red('缺失目录：'))
    for (const dir of missingRefDirsAfter) console.log(`  - ${relRepo(dir.absDir)}`)
  }
  if (missingRefFilesAfter.length > 0) {
    console.log(c.red('缺失文件：'))
    for (const absFile of missingRefFilesAfter) console.log(`  - ${relRepo(absFile)}`)
  }

  if (options.report !== null) {
    writeReport(options, {
      mode: 'apply',
      ignoreCommitRefs: options.ignoreCommitRefs,
      commandLine,
      catalogAbs,
      refs,
      scan,
      before,
      after,
      missingRefDirsBefore,
      missingRefFilesBefore,
      missingRefDirsAfter,
      missingRefFilesAfter,
      candidates: records,
      deletable,
      deletableTotals,
      protectedRecords,
      pathProtected,
      hashOnlyProtected,
      protectionCategories,
      relaxedOnly,
      relaxedTotals,
      deleted,
      removedOwners,
      failures,
      gitStatus: gitStatusLines,
    })
  }

  if (hasProblem) process.exitCode = 1
}

// ---------------------------------------------------------------------------
// 报告
// ---------------------------------------------------------------------------
function writeReport(options, context) {
  const reportAbs = resolve(REPO_ROOT, options.report)
  const now = new Date()
  const generatedAt = `${now.toISOString()}（本地 ${now.toString()}）`
  const lines = []
  lines.push('# 截图资产清理报告（2026-11-14）')
  lines.push('')
  lines.push(`- 生成时间：${generatedAt}`)
  lines.push(`- 生成命令：\`${context.commandLine}\``)
  lines.push(`- 模式：${context.mode === 'apply' ? '--apply（已执行删除）' : 'dry-run（未删除）'}`)
  lines.push('')
  lines.push('## 结论')
  lines.push('')
  if (context.mode === 'apply') {
    lines.push(`- 删除 commit 目录：**${context.deleted.length}** 个`)
    lines.push(`- 删除文件：**${context.deleted.reduce((sum, record) => sum + record.files, 0)}** 个`)
    lines.push(`- 释放逻辑字节：**${fmtBytes(context.deleted.reduce((sum, record) => sum + record.bytes, 0))}**`)
    lines.push(`- 清理后 commit 目录：${context.after.dirs} 个（${context.after.files} 文件 / ${fmtMiB(context.after.bytes)}）`)
  } else {
    lines.push(`- 计划删除 commit 目录：${context.deletableTotals.dirs} 个（未执行）`)
    lines.push(`- 计划删除文件：${context.deletableTotals.files} 个（未执行）`)
    lines.push(`- 计划释放逻辑字节：${fmtBytes(context.deletableTotals.bytes)}`)
  }
  lines.push(`- catalog 引用但缺失的目录：**${context.missingRefDirsAfter.length}**（期望 0）`)
  lines.push(`- catalog 引用但缺失的文件：**${context.missingRefFilesAfter.length}**（期望 0）`)
  lines.push('')
  lines.push('## 判定规则')
  lines.push('')
  lines.push('目录只有在以下两个条件同时满足时才可删除：')
  lines.push('')
  lines.push('1. 目录路径 \`site/public/skin-screenshots/<owner>/<40hex>/\` 未被 \`data/catalog.json\` 中任何字符串引用')
  lines.push('   （对 catalog 全量字符串扫描，覆盖 \`listScreenshot\`、\`marketScreenshots\`、\`screenshots\`、\`media.list\`、\`media.screenshots\` 等字段）。')
  lines.push('2. 该 40hex commit 及相对路径 \`skin-screenshots/<owner>/<40hex>\` 未被任何 tracked 文本文件引用')
  lines.push('   （\`git grep -I -F\` 扫描 tracked 文本文件，二进制图片自动跳过）。')
  lines.push('')
  lines.push('## 清理前后统计')
  lines.push('')
  lines.push(
    renderTable(
      [
        { label: 'commit 目录', before: context.before.dirs, after: context.after.dirs },
        { label: '文件', before: context.before.files, after: context.after.files },
        {
          label: '逻辑字节',
          before: fmtBytes(context.before.bytes),
          after: fmtBytes(context.after.bytes),
        },
        {
          label: 'catalog 引用目录',
          before: `${context.refs.dirs.size}（缺失 ${context.missingRefDirsBefore.length}）`,
          after: `${context.refs.dirs.size}（缺失 ${context.missingRefDirsAfter.length}）`,
        },
        {
          label: 'catalog 引用文件',
          before: `${context.refs.files.size}（缺失 ${context.missingRefFilesBefore.length}）`,
          after: `${context.refs.files.size}（缺失 ${context.missingRefFilesAfter.length}）`,
        },
      ].map((row) => ({ row })),
      [
        { label: '指标', value: ({ row }) => row.label },
        { label: '清理前', value: ({ row }) => String(row.before) },
        { label: '清理后', value: ({ row }) => String(row.after) },
      ],
    ),
  )
  lines.push('')
  lines.push(`- 磁盘上 commit 目录总数：${context.before.dirs}；其中 catalog 未引用：${context.candidates.length} 个`)
  lines.push(`- catalog 未引用目录的合计：${context.candidates.reduce((sum, record) => sum + record.files, 0)} 文件 / ${fmtBytes(context.candidates.reduce((sum, record) => sum + record.bytes, 0))}`)
  lines.push(
    context.ignoreCommitRefs
      ? `- tracked 文本引用保护：路径引用 ${context.pathProtected.length} 个目录（保留）；仅 commit hash 引用 ${context.hashOnlyProtected.length} 个目录（按授权放宽删除）`
      : `- tracked 文本引用保护：${context.protectedRecords.length} 个目录（路径引用 ${context.pathProtected.length}，仅 commit hash 引用 ${context.hashOnlyProtected.length}）`,
  )
  lines.push('')

  if (context.deleted.length > 0 || context.deletable.length > 0) {
    const list = context.mode === 'apply' ? context.deleted : context.deletable
    lines.push(`## ${context.mode === 'apply' ? '已删除' : '计划删除'}目标（前 20 个，按逻辑字节降序）`)
    lines.push('')
    lines.push(
      renderTable(
        list
          .slice(0, 20)
          .map((record, index) => ({ index: index + 1, record })),
        [
          { label: '#', value: ({ index }) => String(index) },
          { label: '目录', value: ({ record }) => `\`${record.rel}\`` },
          { label: '文件数', value: ({ record }) => String(record.files) },
          { label: '逻辑字节', value: ({ record }) => fmtBytes(record.bytes) },
        ],
      ),
    )
    lines.push('')
    lines.push(`全部删除目标合计：${context.deletableTotals.dirs} 目录 / ${context.deletableTotals.files} 文件 / ${fmtBytes(context.deletableTotals.bytes)}`)
    lines.push('')
  }

  if (context.protectedRecords.length > 0) {
    if (context.ignoreCommitRefs) {
      lines.push('## 保留的 catalog 未引用目录（相对路径引用保护）')
      lines.push('')
      lines.push(
        `本次按明确授权使用 \`--ignore-commit-refs\`：仅"commit hash 出现在 tracked 文本"不再作为保留条件；` +
          `目录相对路径/其中文件路径被 tracked 文本引用的 ${context.pathProtected.length} 个目录仍然保留。`,
      )
      lines.push('')
      const sortedPaths = [...context.pathProtected].sort((a, b) => b.bytes - a.bytes || a.rel.localeCompare(b.rel))
      if (sortedPaths.length > 0) {
        lines.push(
          renderTable(
            sortedPaths.map((record) => ({ record })),
            [
              { label: '目录', value: ({ record }) => `\`${record.rel}\`` },
              { label: '文件数', value: ({ record }) => String(record.files) },
              { label: '逻辑字节', value: ({ record }) => fmtBytes(record.bytes) },
              {
                label: '真实路径引用来源',
                value: ({ record }) =>
                  [...new Set([...record.pathHits, ...record.hashHits].map(categoryOfTrackedFile))]
                    .map((category) => CATEGORY_LABELS[category] ?? category)
                    .join('、'),
              },
            ],
          ),
        )
        lines.push('')
      }
      lines.push(
        `另有 ${context.hashOnlyProtected.length} 个仅被 commit hash 引用的目录已按授权放宽删除（${context.relaxedTotals.files} 文件 / ${fmtBytes(context.relaxedTotals.bytes)}）。`,
      )
      lines.push('')
    } else {
      lines.push('## 保留的 catalog 未引用目录（tracked 文本引用保护）')
      lines.push('')
      lines.push(
        `共 ${context.protectedRecords.length} 个目录未删除：其中 ${context.pathProtected.length} 个存在相对路径引用，` +
          `${context.hashOnlyProtected.length} 个仅存在 commit hash 引用（catalog 上游图片 URL、skin-media manifest 源 URL、registry pin、docs、tests 等）。`,
      )
      lines.push('')
      const categoryParts = Object.entries(context.protectionCategories ?? {})
        .filter(([, count]) => count > 0)
        .map(([category, count]) => `${CATEGORY_LABELS[category] ?? category} ${count}`)
      if (categoryParts.length > 0) {
        lines.push(`引用来源（按目录计，一个目录可能有多个来源）：${categoryParts.join(' / ')}`)
        lines.push('')
      }
      const sorted = [...context.protectedRecords].sort((a, b) => b.bytes - a.bytes || a.rel.localeCompare(b.rel))
      lines.push(
        renderTable(
          sorted.map((record) => ({ record })),
          [
            { label: '目录', value: ({ record }) => `\`${record.rel}\`` },
            { label: '文件数', value: ({ record }) => String(record.files) },
            { label: '逻辑字节', value: ({ record }) => fmtBytes(record.bytes) },
            { label: '保护原因', value: ({ record }) => (record.protectedByPath ? '相对路径引用' : 'commit hash 引用') },
          ],
        ),
      )
      lines.push('')
      if (context.relaxedOnly.length > 0) {
        lines.push(
          `> 若经明确批准放宽为"仅路径引用保护"，可用 \`--ignore-commit-refs\` 额外删除 ` +
            `${context.relaxedTotals.dirs} 个仅被 commit hash 引用的目录（${context.relaxedTotals.files} 文件 / ${fmtBytes(context.relaxedTotals.bytes)}）。默认严格模式不删除这些目录。`,
        )
        lines.push('')
      }
    }
  }

  lines.push('## 复跑与校验')
  lines.push('')
  lines.push('\`\`\`bash')
  lines.push('node scripts/prune-unreferenced-screenshots.mjs            # dry-run（默认）')
  lines.push('node scripts/prune-unreferenced-screenshots.mjs --apply    # 执行删除（不 git add / commit）')
  lines.push('node scripts/prune-unreferenced-screenshots.mjs --verify   # 校验 catalog 引用完整性')
  lines.push('\`\`\`')
  lines.push('')
  lines.push(`本次校验：catalog 引用文件 ${context.refs.files.size} 个、目录 ${context.refs.dirs.size} 个；缺失文件 ${context.missingRefFilesAfter.length}、缺失目录 ${context.missingRefDirsAfter.length}。`)
  lines.push('')
  if (context.removedOwners.length > 0) {
    lines.push(`删除后顺带清理的空 owner 目录：${context.removedOwners.length} 个。`)
    lines.push('')
  }
  if (context.mode === 'apply' && context.gitStatus !== null) {
    lines.push(`Worktree 变更：\`git status --short ${SKIN_SCREENSHOTS_ROOT}\` 共 ${context.gitStatus.length} 行（删除仅存在于 worktree，未 \`git add\` / 未 commit）。`)
    lines.push('')
  }
  if (context.failures.length > 0) {
    lines.push('## 失败目标')
    lines.push('')
    for (const failure of context.failures) lines.push(`- \`${failure.rel}\`：${failure.reason}`)
    lines.push('')
  }
  if (options.notes.length > 0) {
    lines.push('## 备注')
    lines.push('')
    for (const note of options.notes) lines.push(`- ${note}`)
    lines.push('')
  }

  mkdirSync(dirname(reportAbs), { recursive: true })
  writeFileSync(reportAbs, `${lines.join('\n')}\n`, 'utf8')
  console.log(c.green(`  [report] 已写入 ${relRepo(reportAbs)}`))
}

let GIT_TOP
let rootAbs

// 初始化：确认在 git worktree 内
const top = spawnSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
})
if (top.error || top.status !== 0) fail('当前目录不在 git worktree 内，prune 脚本需要 git grep')
GIT_TOP = resolve((top.stdout ?? '').trim())

main()
