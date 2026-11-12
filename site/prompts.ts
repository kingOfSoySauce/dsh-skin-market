import { createDshPluginAddCommand, createInstallCommand } from '../src/install-command.ts'
import type { InstallCommandContext } from '../src/install-command.ts'
import { effectiveBuildApprovalKey } from '../src/build-approval.ts'
import { createSkinInstallCommandGroups, type InstallCommandGroup } from '../src/client/submission.ts'
import { desktopInstallPlan } from '../src/desktop-install.ts'
import { preferredInstallTarget } from '../src/install-source.ts'
import type { CatalogSkin, MarketHostKind } from '../src/client/types.ts'
import { translate, type MessageKey, type MessageParamsFor, type SiteLanguage } from './messages.ts'

export const MARKET_REPOSITORY = 'https://github.com/kingOfSoySauce/dsh-skin-market'
export const MARKET_PUBLIC_URL = 'https://kingofsoysauce.github.io/dsh-skin-market/'
export const MARKET_DESKTOP_INPUT = 'dsh-skin-market'
export const MARKET_WEB_COMMAND = createDshPluginAddCommand(MARKET_DESKTOP_INPUT)
export const MARKET_CLI_COMMAND = MARKET_WEB_COMMAND
function promptMessage<Key extends MessageKey>(locale: SiteLanguage, key: Key, params?: MessageParamsFor<Key>): string {
  return translate(locale, key, params)
}

export function marketPrompt(locale: SiteLanguage = 'zh'): string {
  return promptMessage(locale, 'prompt.market', {
    webCommand: MARKET_WEB_COMMAND,
    desktopInput: MARKET_DESKTOP_INPUT,
    repository: MARKET_REPOSITORY,
  })
}

export const MARKET_PROMPT = marketPrompt('zh')

export function skinPrompt(skin: CatalogSkin, locale: SiteLanguage = 'zh', hostKind?: MarketHostKind, context?: InstallCommandContext): string {
  const target = preferredInstallTarget(skin)
  const buildApprovalKey = skin.install.npm === undefined ? effectiveBuildApprovalKey(skin) : undefined
  const buildApproval = buildApprovalKey === undefined
    ? ''
    : promptMessage(locale, 'prompt.skin.buildApproval', { key: buildApprovalKey })
  const companions = skin.install.companions ?? []
  const companionLines = companions.length === 0
    ? ''
    : `\n${companions.map(companion => promptMessage(locale, 'prompt.skin.companion', companion)).join('\n')}`
  const targets = [...new Set([target, ...companions.map(companion => companion.target)])]
  const renderCommands = (shell: InstallCommandContext['shell']) => {
    try { return targets.map(targetValue => createInstallCommand(targetValue, context?.profile ?? 'web', { ...context, shell })).join('\n') }
    catch { return promptMessage(locale, 'prompt.skin.terminalFallback') }
  }
  const command = context?.cliAvailable === false
    ? promptMessage(locale, 'prompt.skin.cliUnavailable')
    : context?.shell !== undefined ? renderCommands(context.shell)
      : targets.some(targetValue => targetValue.includes('&'))
        ? promptMessage(locale, 'prompt.skin.commandsForTerminals', {
          posix: renderCommands('posix'),
          powershell: renderCommands('powershell'),
          cmd: renderCommands('cmd'),
        })
        : renderCommands('posix')
  const packages = [skin.package, ...companions.map(companion => companion.package)].join(promptMessage(locale, 'prompt.listSeparator'))
  const rowIds = [skin.rowId ?? skin.package, ...companions.map(companion => companion.rowId)].join(promptMessage(locale, 'prompt.listSeparator'))
  const metadata = promptMessage(locale, 'prompt.skin.metadata', {
    repo: skin.repo,
    target,
    package: skin.package,
    rowId: skin.rowId ?? skin.package,
    companions: companionLines,
    version: skin.install.version,
    commit: skin.install.commit,
  })
  const compatibility = skin.review?.compatibility !== 'unverified' ? '' : promptMessage(locale, 'prompt.skin.reviewWarning')
  const conflict = promptMessage(locale, 'prompt.skin.conflict', { packages })
  const desktopManual = desktopInstallPlan(skin, true).kind === 'manual'
  const desktopSteps = desktopManual
    ? promptMessage(locale, 'prompt.skin.desktop.manual', {
      conflict,
      targets: targets.map(targetValue => `- ${targetValue}`).join('\n'),
    })
    : promptMessage(locale, 'prompt.skin.desktop.managed', { conflict })
  const desktop = promptMessage(locale, 'prompt.skin.desktop', { steps: desktopSteps })
  const web = promptMessage(locale, 'prompt.skin.web', {
    conflict,
    buildApproval,
    command,
    packages,
    rowIds,
  })
  const workflow = hostKind === 'desktop'
    ? desktop
    : hostKind === 'dsh'
      ? web
      : promptMessage(locale, 'prompt.skin.workflow', { desktop, web })
  const hostInstruction = hostKind === 'desktop' ? promptMessage(locale, 'prompt.skin.intro.desktop') : ''
  return `${promptMessage(locale, 'prompt.skin.intro', { hostInstruction })}\n\n${metadata}\n${compatibility}\n${workflow}${promptMessage(locale, 'prompt.skin.footer')}`
}

export function skinDesktopInput(skin: CatalogSkin): string {
  return desktopInstallPlan(skin, true).kind === 'npm' ? skin.package : skinCopyTarget(skin)
}

function skinCopyTarget(skin: CatalogSkin): string {
  const target = skin.install.npm?.name ?? skin.install.target
  return /^((?:@[a-z0-9._-]+\/)?[a-z0-9._-]+)(?:@[^/]+)?$/i.exec(target)?.[1] ?? target
}

export function skinWebCommand(skin: CatalogSkin): string | undefined {
  const target = skinCopyTarget(skin)
  return target.includes('&') ? undefined : skinCommand(target)
}

export function skinWebCommandGroups(skin: CatalogSkin): InstallCommandGroup[] {
  return createSkinInstallCommandGroups(skin, {}, skinCopyTarget(skin))
}

export function skinCommand(installTarget: string): string {
  return createInstallCommand(installTarget)
}
