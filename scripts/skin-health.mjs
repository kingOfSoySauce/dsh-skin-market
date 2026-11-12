const screenshotSuggestion = '建议在 README 中加入至少一张仓库内的真实界面截图，并让图片路径随仓库一起版本化，方便用户预览和市场稳定展示。'
const compatibilitySuggestion = '建议在 README 或 package.json 中明确声明支持的 DSH 版本范围（Web 与官方 Desktop，例如 >=0.1.0-rc.6、>=0.2.0-rc.1 或兼容区间），方便用户在安装前确认环境。'
const installationSuggestion = '建议补全稳定的 package 名称、dsh.client Web 声明（Web 与官方 Desktop 共用）、row ID 和已构建客户端入口，以符合 dsh 插件要求并获得更顺畅的一键安装体验。'
const installCommandSuggestion = '建议在 README 中补充可复制的 DSH 安装命令，方便用户直接使用。'
const topicSuggestion = '建议为仓库添加 dsh-plugin Topic，方便用户和 DSH 皮肤市场发现它。'

function exportedPath(value) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return value.default ?? value.import ?? null
  return null
}

export function clientEntryPath(pkg) {
  return exportedPath(pkg?.exports?.['./client'])
}

export function inspectSkinHealth({ pkg, rowId, readmeScreenshotCount, compatibility, clientEntryPresent, readmeHasInstallCommand, hasDshPluginTopic }) {
  const checks = {
    readmeScreenshots: readmeScreenshotCount > 0 ? 'pass' : 'improve',
    compatibility: compatibility ? 'pass' : 'improve',
    installation: pkg?.name && pkg?.version && pkg?.dsh?.client?.platform === 'web' && rowId && clientEntryPresent ? 'pass' : 'improve',
    installCommand: readmeHasInstallCommand ? 'pass' : 'improve',
    topic: hasDshPluginTopic ? 'pass' : 'improve',
  }
  const suggestions = []
  if (checks.readmeScreenshots === 'improve') suggestions.push(screenshotSuggestion)
  if (checks.compatibility === 'improve') suggestions.push(compatibilitySuggestion)
  if (checks.installation === 'improve') suggestions.push(installationSuggestion)
  if (checks.installCommand === 'improve') suggestions.push(installCommandSuggestion)
  if (checks.topic === 'improve') suggestions.push(topicSuggestion)
  return {
    status: suggestions.length === 0 ? 'healthy' : 'improvements',
    checks,
    suggestions,
  }
}
