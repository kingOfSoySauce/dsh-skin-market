import { createInstallCommand, type InstallCommandContext } from '../install-command.ts'
import { effectiveBuildApprovalKey } from '../build-approval.ts'
import { manualInstallTarget, preferredInstallTarget } from '../install-source.ts'
import { desktopInstallPlan } from '../desktop-install.ts'
import { defaultTranslator, type Translator } from './i18n.ts'
import type { CatalogSkin, MarketHostKind } from './types.ts'

export const REGISTRY_REPOSITORY = 'https://github.com/kingOfSoySauce/dsh-skin-market'
export const CLI_INSTALL_WARNING = defaultTranslator('submission.cliWarning')

export function normalizeGitHubRepository(value: string): string | null {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null
    const parts = url.pathname.replace(/\.git$/, '').split('/').filter(Boolean)
    if (parts.length !== 2) return null
    return `https://github.com/${parts[0]}/${parts[1]}`
  } catch {
    return null
  }
}

export function createSkinInstallPrompt(skin: CatalogSkin, hostKind?: MarketHostKind, context?: InstallCommandContext, t: Translator = defaultTranslator): string {
  const target = preferredInstallTarget(skin)
  const buildApprovalKey = skin.install.npm === undefined ? effectiveBuildApprovalKey(skin) : undefined
  const buildApproval = buildApprovalKey === undefined
    ? ''
    : t('submission.install.buildApproval', { buildKey: buildApprovalKey })
  const companions = skin.install.companions ?? []
  const companionLines = companions.length === 0
    ? ''
    : `\n${companions.map(companion => t('submission.install.companion', {
      package: companion.package,
      rowId: companion.rowId,
      target: companion.target,
    })).join('\n')}`
  const targets = [...new Set([target, ...companions.map(companion => companion.target)])]
  const renderCommands = (shell: InstallCommandContext['shell']) => {
    try { return targets.map(target => createInstallCommand(target, context?.profile ?? 'web', { ...context, shell })).join('\n') }
    catch { return t('submission.install.cannotRepresentPath') }
  }
  const command = context?.cliAvailable === false
    ? t('submission.install.noCliPath')
    : context?.shell !== undefined ? renderCommands(context.shell)
      : targets.some(target => target.includes('&'))
        ? t('submission.install.terminalInstruction', {
          posix: renderCommands('posix'),
          powershell: renderCommands('powershell'),
          cmd: renderCommands('cmd'),
        })
        : renderCommands('posix')
  const packages = [skin.package, ...companions.map(companion => companion.package)].join('、')
  const rowIds = [skin.rowId ?? skin.package, ...companions.map(companion => companion.rowId)].join('、')
  const metadata = t('submission.install.metadata', {
    repo: skin.repo,
    target,
    package: skin.package,
    rowId: skin.rowId ?? skin.package,
    companions: companionLines,
    version: skin.install.version,
    commit: skin.install.commit,
  })
  const compatibility = skin.review?.compatibility !== 'unverified'
    ? ''
    : t('submission.install.compatibility')
  const conflictCheck = t('submission.install.conflictCheck', { packages })
  const desktopManual = desktopInstallPlan(skin, true).kind === 'manual'
  const desktopSteps = desktopManual
    ? t('submission.install.desktopManual', {
      conflictCheck,
      targets: targets.map(target => `- ${target}`).join('\n'),
    })
    : t('submission.install.desktopAuto', { conflictCheck })
  const desktop = t('submission.install.desktop', { desktopSteps })
  const web = t('submission.install.web', {
    conflictCheck,
    buildApproval,
    command,
    packages,
    rowIds,
  })
  const workflow = hostKind === 'desktop'
    ? desktop
    : hostKind === 'dsh'
      ? web
      : t('submission.install.workflow', { desktop, web })
  return t('submission.install.prefix', {
    desktopIntro: hostKind === 'desktop' ? t('submission.install.desktopIntro') : '',
    metadata,
    compatibility,
    workflow,
  })
}

export interface InstallCopyEntry { key: string; label: string; value: string }
export interface InstallCommandGroup { key: string; label: string; commands: InstallCopyEntry[] }

export function createSkinInstallInputs(skin: CatalogSkin, t: Translator = defaultTranslator): InstallCopyEntry[] {
  return [{ key: 'keyword', label: t('common.packageName'), value: manualInstallTarget(skin) }]
}

export function createSkinInstallCommands(skin: CatalogSkin, context: InstallCommandContext = {}, target = manualInstallTarget(skin), t: Translator = defaultTranslator): InstallCopyEntry[] {
  const inputs = createSkinInstallInputs(skin, t).map(entry => ({ ...entry, value: target }))
  if (context.cliAvailable === false && inputs.some(entry => !entry.value.includes('&'))) return []
  try {
    return inputs.map(entry => ({
      key: entry.key.replace('keyword', 'command'),
      label: entry.label === t('common.packageName') ? t('common.command') : entry.label,
      value: createInstallCommand(entry.value, context.profile ?? 'web', context),
    }))
  } catch { return [] }
}

/** List the primary command for each applicable terminal. */
export function createSkinInstallCommandGroups(skin: CatalogSkin, context: InstallCommandContext = {}, target = manualInstallTarget(skin), t: Translator = defaultTranslator): InstallCommandGroup[] {
  const terminalSpecific = target.includes('&') || context.dshHome !== undefined
  const shells = context.shell !== undefined ? [context.shell] : terminalSpecific ? ['posix', 'powershell', 'cmd'] as const : ['posix'] as const
  const labels = { posix: 'macOS / Linux', powershell: 'Windows PowerShell', cmd: 'Windows CMD' }
  return shells.flatMap(shell => {
    const commands = createSkinInstallCommands(skin, { ...context, shell }, target, t)
    return commands.length === 0 ? [] : [{ key: shell, label: terminalSpecific ? labels[shell] : '', commands }]
  })
}

/** A single primary command. Companion installation stays in the Agent prompt. */
export function createSkinInstallCommand(skin: CatalogSkin, context: InstallCommandContext = {}, t: Translator = defaultTranslator): string {
  return createSkinInstallCommands(skin, context, manualInstallTarget(skin), t)[0]?.value ?? ''
}

/**
 * The spec users can paste into the official Desktop plugin page.
 *
 * Desktop accepts both npm and Git specs. A manual-only monorepo entry often
 * has no published npm package, so its package name would just fail the same
 * lookup that caused the manual fallback in the first place.
 */
export function createSkinInstallSearchKeyword(skin: CatalogSkin): string {
  return manualInstallTarget(skin)
}
