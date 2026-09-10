import { normalizeGitHubRepository, REGISTRY_REPOSITORY } from './submission.ts'
import type { CatalogSkin, Operation } from './types.ts'

export const MARKET_MANUAL_UPDATE_URL = `${REGISTRY_REPOSITORY}#manual-update`
export const MARKET_INSTALL_TROUBLESHOOT_URL = `${REGISTRY_REPOSITORY}#install-troubleshooting`

export interface FailureHelpLink {
  href: string
  label: string
}

export interface InterceptNotice {
  title: string
  what: string
  why: string
  links: FailureHelpLink[]
}

export interface FailureHelpSubject {
  source: 'skin' | 'market-update'
  failureKind?: NonNullable<Operation['failure']>['kind']
  message?: string
  skin?: Pick<CatalogSkin, 'repo' | 'subpath' | 'install'> | null
}

const operationKindLabels: Record<Operation['kind'], string> = {
  install: '安装', activate: '启用', deactivate: '停用', pin: '设置常驻', unpin: '取消常驻', update: '更新', migrate: '换用 npm', uninstall: '卸载',
}

function isDiagnosticDump(text: string): boolean {
  return text.startsWith('# dsh-skin-market')
    || text.includes('[info] operation:')
    || text.includes('[error] operation:')
    || text.split('\n').length > 3
}

function displayMessage(raw: string): string {
  const value = raw.trim()
  return isDiagnosticDump(value) ? '' : value
}

function isPackagingFailure(message: string): boolean {
  return /bundle patch is missing:/i.test(message) || message.includes('目录元数据与包实际声明不一致')
}

function isEnvironmentFailure(kind: FailureHelpSubject['failureKind']): boolean {
  return kind === 'unexpected-store' || kind === 'fetch-404' || kind === 'adding-to-root' || kind === 'not-a-workspace'
}

/** Terminal failures that the market stopped on purpose, not retryable network/build prompts. */
export function isInterceptFailure(operation: { phase?: string; failure?: Operation['failure'] } | null | undefined): boolean {
  if (operation == null || operation.phase !== 'failed') return false
  return operation.failure?.action !== 'retry' && operation.failure?.action !== 'approve-build'
}

export function skinRepositoryBrowseUrl(skin: Pick<CatalogSkin, 'repo' | 'subpath' | 'install'>): string | null {
  const repo = normalizeGitHubRepository(skin.repo)
  if (repo === null) return null
  const commit = skin.install.commit
  if (!/^[0-9a-f]{40}$/i.test(commit)) return repo
  const subpath = (skin.subpath ?? '').replace(/^\/+/, '').replace(/\/+$/, '')
  return subpath === '' ? `${repo}/tree/${commit}` : `${repo}/tree/${commit}/${subpath}`
}

export function failureHelpLinks(options: FailureHelpSubject): FailureHelpLink[] {
  const message = options.message ?? ''
  const skinUrl = options.skin == null ? null : skinRepositoryBrowseUrl(options.skin)
  const skinLink: FailureHelpLink | null = skinUrl === null ? null : { href: skinUrl, label: '打开皮肤仓库' }
  const updateLink: FailureHelpLink = { href: MARKET_MANUAL_UPDATE_URL, label: '查看手动更新' }
  const troubleshootLink: FailureHelpLink = { href: MARKET_INSTALL_TROUBLESHOOT_URL, label: '查看安装排查' }

  if (options.source === 'market-update') {
    return isEnvironmentFailure(options.failureKind) ? [troubleshootLink] : [updateLink]
  }
  if (options.failureKind === 'conflict' || message.includes('发现插件安装冲突')) return []
  if (isEnvironmentFailure(options.failureKind)) return [troubleshootLink]
  if (options.failureKind === 'compatibility' || isPackagingFailure(message)) return skinLink === null ? [] : [skinLink]
  return [skinLink, troubleshootLink].filter((link): link is FailureHelpLink => link !== null)
}

export function interceptNotice(operation: Operation, skinName: string, skin?: FailureHelpSubject['skin']): InterceptNotice {
  const raw = (operation.failure?.message ?? operation.message ?? '').trim()
  const message = displayMessage(raw)
  const kind = operationKindLabels[operation.kind]
  const links = failureHelpLinks({
    source: 'skin',
    failureKind: operation.failure?.kind,
    message: raw,
    skin,
  })
  const missingPatch = /bundle patch is missing:\s*(\S+)/.exec(raw)
  if (missingPatch !== null) {
    return {
      title: '已拦截安装',
      what: `市场已经下载「${skinName}」，但安装包里缺少 DSH 用来注册插件的 ${missingPatch[1]}，所以没有改动你的 profile。`,
      why: '这个皮肤的 package.json 声明了 dsh.bundle.patch，但打包进安装源时没有带上该文件。常见原因是 files 白名单漏了 cordis.patch.yml。这是皮肤仓库的打包问题，不是本机环境损坏；需要作者补上文件后重新发布，才能一键安装。',
      links,
    }
  }
  if (operation.failure?.kind === 'conflict' || message.includes('发现插件安装冲突')) {
    return {
      title: '已拦截安装',
      what: `「${skinName}」没有装上，因为当前 profile 里已有其他皮肤占用了相同的插件入口。`,
      why: message || '请先在皮肤市场停用或卸载冲突的皮肤，然后再试。',
      links,
    }
  }
  if (operation.failure?.kind === 'compatibility') {
    return {
      title: '已拦截安装',
      what: `市场没有继续安装「${skinName}」。`,
      why: message || '当前 DSH 版本不在该皮肤声明的兼容范围内。',
      links,
    }
  }
  if (message.includes('目录元数据与包实际声明不一致')) {
    return {
      title: '已拦截安装',
      what: `市场已经检查「${skinName}」的安装包，发现它和目录记录的插件入口不一致，所以没有写入 profile。`,
      why: message,
      links,
    }
  }
  return {
    title: `${kind}未完成`,
    what: `「${skinName}」的${kind}已停止，市场没有继续修改你的 profile。`,
    why: message || '操作过程中出现错误。可查看下方说明，或复制日志后发给维护者。',
    links,
  }
}

export function marketUpdateNotice(operation: { failure?: Operation['failure']; message?: string }): InterceptNotice {
  const raw = (operation.failure?.message ?? operation.message ?? '').trim()
  const message = displayMessage(raw)
  return {
    title: '皮肤市场更新失败',
    what: '皮肤市场没有完成自更新，当前安装的版本没有改变。',
    why: message || '更新过程中出现错误。可查看手动更新说明，或复制日志后发给维护者。',
    links: failureHelpLinks({ source: 'market-update', failureKind: operation.failure?.kind, message: raw }),
  }
}
