import { normalizeGitHubRepository, REGISTRY_REPOSITORY } from './submission.ts'
import { defaultTranslator, type MessageKey, type Translator } from './i18n.ts'
import type { CatalogSkin, MarketHostKind, Operation } from './types.ts'

export const MARKET_MANUAL_UPDATE_URL = `${REGISTRY_REPOSITORY}#manual-update`
export const MARKET_INSTALL_TROUBLESHOOT_URL = `${REGISTRY_REPOSITORY}#install-troubleshooting`
export const MARKET_CONFIG_OVERRIDE_URL = `${REGISTRY_REPOSITORY}#configuration-override`
export const MARKET_RELEASE_WAIT_URL = `${REGISTRY_REPOSITORY}#release-wait`
export const MARKET_REPORT_URL = `${REGISTRY_REPOSITORY}/issues/new`

export interface FailureHelpLink {
  href: string
  label: string
}

export interface InterceptNotice {
  title: string
  what: string
  why: string
  links: FailureHelpLink[]
  /** One line per known install conflict. The summary stays in what/why. */
  details?: string[]
  copySpec?: string
}

export interface FailureHelpSubject {
  source: 'skin' | 'market-update'
  failureKind?: NonNullable<Operation['failure']>['kind']
  failureCode?: string
  message?: string
  skin?: Pick<CatalogSkin, 'repo' | 'subpath' | 'install'> | null
}

type FailureExplanation = { problem: MessageKey; next: MessageKey }

type OperationLabelKey =
  | 'common.install'
  | 'common.activate'
  | 'common.deactivate'
  | 'common.pin'
  | 'common.unpin'
  | 'common.updateAction'
  | 'common.switchToNpm'
  | 'common.uninstall'

const operationLabelKeys: Record<Operation['kind'], OperationLabelKey> = {
  install: 'common.install',
  activate: 'common.activate',
  deactivate: 'common.deactivate',
  pin: 'common.pin',
  unpin: 'common.unpin',
  update: 'common.updateAction',
  migrate: 'common.switchToNpm',
  uninstall: 'common.uninstall',
}

function operationLabel(kind: Operation['kind'], t: Translator): string {
  return t(operationLabelKeys[kind])
}

function terminalDiagnostic(kind: FailureHelpSubject['failureKind'], message: string): string {
  if (kind !== undefined && kind !== 'command') return ''
  const plain = message.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
  const terminal = [...plain.matchAll(/\bERR_[A-Z0-9_]+\b|\b(?:[A-Za-z]+)?Error(?: \[[^\]\r\n]+\])?:[^\r\n]*/g)].at(-1)
  return plain.slice(terminal?.index ?? 0)
}

function hasRecoveryFailure(message: string): boolean {
  return /恢复.{0,12}(?:未完成|失败)|原有版本不一致|未能确认.{0,12}恢复|恢复后.{0,24}未还原/.test(message)
}

const MISSING_BUNDLE_PATCH = /bundle patch is missing:\s*(\S+)/
const CONFLICT_DIAGNOSTIC = '发现插件安装冲突'
const METADATA_MISMATCH = '目录元数据与包实际声明不一致'

/**
 * Plain messages that must stay in the diagnostic dialog. Retrying the install
 * cannot finish these operations, so the install panel and the manual panel
 * cannot help.
 */
export function blocksInstallRecovery(message: string): boolean {
  const raw = message.trim()
  return raw !== ''
    && (hasRecoveryFailure(raw)
      || MISSING_BUNDLE_PATCH.test(raw)
      || raw.includes(CONFLICT_DIAGNOSTIC)
      || raw.includes(METADATA_MISMATCH))
}

function hasMissingArtifact(message: string): boolean {
  return /未物化|declared executable artifact missing|(?:package manifest|client export) missing|no executable artifact/i.test(message)
}

function hasMissingModule(message: string): boolean {
  return /Cannot find (?:package|module)|ERR_MODULE_NOT_FOUND|ERR_PACKAGE_PATH_NOT_EXPORTED/i.test(message)
}

function diagnosticRepairTopic(diagnostic: string): string | null {
  if (hasMissingArtifact(diagnostic) || hasMissingModule(diagnostic)) return 'incomplete-install'
  for (const [pattern, topic] of [
    [/ERR_PNPM_UNEXPECTED_STORE/, 'unexpected-store'], [/ERR_PNPM_OUTDATED_LOCKFILE/, 'lockfile-outdated'],
    [/ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY/, 'lockfile-broken'], [/ERR_PNPM_FETCH_404/, 'fetch-404'],
    [/\bENOSPC\b/, 'disk-full'], [/\b(?:EACCES|EPERM)\b/, 'permission'],
    [/\b(?:ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN)\b/, 'network'], [/\bETIMEDOUT\b/, 'fetch-timeout'],
  ] as const) if (pattern.test(diagnostic)) return topic
  return null
}

const hostExplanations: Record<string, FailureExplanation> = {
  'stop-profile': { problem: 'failure.stopProfileProblem', next: 'failure.stopProfileNext' },
  'bundle-in-use': { problem: 'failure.bundleInUseProblem', next: 'failure.bundleInUseNext' },
  'unknown-plugin': { problem: 'failure.unknownPluginProblem', next: 'failure.unknownPluginNext' },
  unaddressable: { problem: 'failure.unaddressableProblem', next: 'failure.unaddressableNext' },
  'management-required': { problem: 'failure.managementProblem', next: 'failure.managementNext' },
  'not-removable': { problem: 'failure.notRemovableProblem', next: 'failure.notRemovableNext' },
  'stale-approval': { problem: 'failure.staleApprovalProblem', next: 'failure.staleApprovalNext' },
  'invalid-spec': { problem: 'failure.invalidSpecProblem', next: 'failure.invalidSpecNext' },
  'ambiguous-install': { problem: 'failure.ambiguousInstallProblem', next: 'failure.ambiguousInstallNext' },
  'not-bundle': { problem: 'failure.notBundleProblem', next: 'failure.notBundleNext' },
}

function contextExplanation(code: string | undefined, message: string, t: Translator): FailureExplanation | undefined {
  if (/same-origin|来源检查|origin-required/i.test(`${code ?? ''} ${message}`)) {
    return { problem: 'failure.sourceCheckProblem', next: 'failure.sourceCheckNext' }
  }
  if (/unauthorized|forbidden|authentication/i.test(code ?? '') || /请先登录当前 DSH 宿主|请求未通过宿主验证/.test(message)) {
    return { problem: 'failure.authorizationProblem', next: 'failure.authorizationNext' }
  }
  if (/indeterminate|unknown-result|unresolved|结果.{0,8}(?:未知|尚未确认|未确认)|等待宿主确认/i.test(`${code ?? ''} ${message}`)) {
    return { problem: 'failure.hostResultProblem', next: 'failure.hostResultNext' }
  }
  return code === undefined ? undefined : hostExplanations[code]
}

function sourceMigrationExplanation(message: string): FailureExplanation | undefined {
  if (/本地安装来源或市场版本已变化|本地安装需先确认/.test(message)) {
    return { problem: 'failure.sourceReplacementProblem', next: 'failure.sourceReplacementNext' }
  }
  if (/更新来源在(?:下载或排队|下载|排队|安装准备)期间发生变化/.test(message)) {
    return { problem: 'failure.sourceChangedProblem', next: 'failure.sourceChangedNext' }
  }
  if (/本地或自定义安装来源，无法自动更新/.test(message)) {
    return { problem: 'failure.localSourceProblem', next: 'failure.localSourceNext' }
  }
  return undefined
}

function failureExplanation(kind: FailureHelpSubject['failureKind'], message: string, code: string | undefined, t: Translator): { problem: string; next: string } {
  const render = (copy: FailureExplanation): { problem: string; next: string } => ({ problem: t(copy.problem), next: t(copy.next) })
  const context = contextExplanation(code, message, t)
  if (context !== undefined) return render(context)
  if (hasRecoveryFailure(message)) return render({ problem: 'failure.recoveryProblem', next: 'failure.recoveryNext' })
  const diagnostic = terminalDiagnostic(kind, message)
  const migration = kind === undefined || kind === 'command' ? sourceMigrationExplanation(diagnostic) : undefined
  if (migration !== undefined) return render(migration)
  if (kind === 'release-age' || /minimumReleaseAge|ERR_PNPM[^\s]*RELEASE[^\s]*AGE|新包保护/i.test(diagnostic)) {
    return render({ problem: 'failure.releaseAgeProblem', next: 'failure.releaseAgeWait' })
  }
  if (kind === 'disk-full' || /\bENOSPC\b/.test(diagnostic)) return render({ problem: 'failure.diskProblem', next: 'failure.diskNext' })
  if (kind === 'permission' || /\b(?:EACCES|EPERM)\b/.test(diagnostic)) return render({ problem: 'failure.permissionProblem', next: 'failure.permissionNext' })
  if (kind === 'network' || /\b(?:ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN)\b/.test(diagnostic)) return render({ problem: 'failure.networkProblem', next: 'failure.networkNext' })
  if (kind === 'fetch-timeout' || /\bETIMEDOUT\b/.test(diagnostic)) return render({ problem: 'failure.timeoutProblem', next: 'failure.timeoutNext' })
  if (kind === 'existing-source-unreachable') return render({ problem: 'failure.existingSourceProblem', next: 'failure.existingSourceNext' })
  if (kind === 'fetch-404' || /ERR_PNPM_FETCH_404/.test(diagnostic)) return render({ problem: 'failure.fetch404Problem', next: 'failure.fetch404Next' })
  if (kind === 'no-matching-version') return render({ problem: 'failure.versionProblem', next: 'failure.versionNext' })
  if (kind === 'pnpm-missing') return render({ problem: 'failure.pnpmProblem', next: 'failure.pnpmNext' })
  if (kind === 'build-approval') return render({ problem: 'failure.buildProblem', next: 'failure.buildNext' })
  if (kind === 'unexpected-store' || /ERR_PNPM_UNEXPECTED_STORE/.test(diagnostic)) return render({ problem: 'failure.storeProblem', next: 'failure.storeNext' })
  if (kind === 'lockfile-outdated' || /ERR_PNPM_OUTDATED_LOCKFILE/.test(diagnostic)) return render({ problem: 'failure.lockfileProblem', next: 'failure.lockfileNext' })
  if (kind === 'lockfile-broken' || /ERR_PNPM_LOCKFILE_MISSING_DEPENDENCY/.test(diagnostic)) return render({ problem: 'failure.lockfileBrokenProblem', next: 'failure.lockfileBrokenNext' })
  if (kind === 'adding-to-root' || kind === 'not-a-workspace') return render({ problem: 'failure.commandProblem', next: 'failure.commandNext' })
  if (kind === 'script-timeout') return render({ problem: 'failure.scriptProblem', next: 'failure.scriptNext' })
  if (kind === 'integrity' || /完整性|integrity mismatch|ERR_PNPM_TARBALL_INTEGRITY/i.test(diagnostic)) return render({ problem: 'failure.integrityProblem', next: 'failure.integrityNext' })
  if (hasMissingArtifact(diagnostic)) return render({ problem: 'failure.missingArtifactProblem', next: 'failure.missingArtifactNext' })
  if (hasMissingModule(diagnostic)) return render({ problem: 'failure.missingModuleProblem', next: 'failure.missingModuleNext' })
  return render({ problem: 'failure.genericProblem', next: 'failure.genericNext' })
}

function isEnvironmentFailure(kind: FailureHelpSubject['failureKind']): boolean {
  return kind === 'unexpected-store' || kind === 'fetch-404' || kind === 'existing-source-unreachable' || kind === 'no-matching-version' || kind === 'network'
    || kind === 'fetch-timeout' || kind === 'script-timeout' || kind === 'lockfile-outdated' || kind === 'lockfile-broken'
    || kind === 'disk-full' || kind === 'permission' || kind === 'pnpm-missing'
}

export interface FailureRepairPromptOptions {
  operation: Operation
  skin?: CatalogSkin | null
  hostKind: MarketHostKind
  runtimeVersion?: string | null
  /** Pass the sanitized diagnostic export, never raw config or process output. */
  diagnosticLog?: string
  /** Optional host-bound translator; defaults to the registered Chinese catalog. */
  t?: Translator
  /** Recovery panels still need a prompt when the failure has no narrower repair topic. */
  allowGeneric?: boolean
}

const localRepairGuidance: Record<string, MessageKey> = {
  'configuration-override': 'failure.repair.configuration',
  'unexpected-store': 'failure.repair.unexpectedStore',
  'lockfile-outdated': 'failure.repair.lockfileOutdated',
  'lockfile-broken': 'failure.repair.lockfileBroken',
  'pnpm-missing': 'failure.repair.pnpmMissing',
  'disk-full': 'failure.repair.diskFull',
  permission: 'failure.repair.permission',
  network: 'failure.repair.network',
  'fetch-timeout': 'failure.repair.timeout',
  'fetch-404': 'failure.repair.fetch404',
  'existing-source-unreachable': 'failure.repair.existingSource',
  'no-matching-version': 'failure.repair.version',
  'script-timeout': 'failure.repair.script',
  'incomplete-install': 'failure.repair.incomplete',
  recovery: 'failure.repair.recovery',
}

function repairTopic(operation: Operation, t: Translator): string | null {
  const failure = operation.failure
  const message = failure?.message ?? operation.message ?? ''
  const code = failure?.code
  if (failure?.action === 'approve-build' || failure?.action === 'approve-release-age' || failure?.action === 'approve-artifact'
    || contextExplanation(code, message, t) !== undefined
    || /same-origin|unauthorized|forbidden|authentication|indeterminate|unknown-result|unresolved|结果.{0,8}(?:未知|尚未确认|未确认)|等待宿主确认/i.test(`${code ?? ''} ${message}`)
    || failure?.kind === 'integrity' || failure?.kind === 'compatibility') return null
  if (hasRecoveryFailure(message)) return 'recovery'
  if (operation.application === 'overridden' || failure?.kind === 'configuration-override') return 'configuration-override'
  if (failure !== undefined && isEnvironmentFailure(failure.kind)) return failure.kind
  return diagnosticRepairTopic(terminalDiagnostic(failure?.kind, message))
}

/** A local diagnostic handoff for known, relevant failures; never a promise of repair. */
export function createFailureRepairPrompt(options: FailureRepairPromptOptions): string | null {
  const { operation, skin, hostKind, t = defaultTranslator } = options
  const affectedSkinId = operation.failure?.targetSkinId ?? operation.skinId
  if (operation.phase !== 'failed' || skin == null || skin.id !== affectedSkinId
    || [skin.id, skin.package, skin.rowId].some(value => value.trim() === '')) return null
  const conflictFacts = conflictPromptFacts(operation, skin, t)
  const topic = repairTopic(operation, t) ?? (conflictFacts !== null ? 'conflict' : options.allowGeneric === true ? 'recovery' : null)
  if (topic === null) return null
  const desired = operation.failure?.desiredEnabled
  const goal = desired !== undefined
    ? t(desired ? 'failure.goalDesiredEnable' : 'failure.goalDesiredDisable')
    : affectedSkinId !== operation.skinId ? t('failure.goalAffected')
      : operation.kind === 'pin' ? t('failure.goalPin')
        : operation.kind === 'activate' ? t('failure.goalActivate')
          : operation.kind === 'deactivate' ? t('failure.goalDeactivate')
            : operation.kind === 'unpin' ? t('failure.goalUnpin')
              : operation.kind === 'uninstall' ? t('failure.goalUninstall')
                : t('failure.goalOther', { action: operationLabel(operation.kind, t) })
  const desktop = hostKind === 'desktop'
  const host = desktop ? t('common.hostDesktop') : t('common.hostWeb')
  const hostInstructions = desktop ? t('failure.prompt.hostDesktop') : t('failure.prompt.hostWeb')
  const diagnostic = options.diagnosticLog === undefined || options.diagnosticLog === ''
    ? ''
    : `\n\n${t('failure.prompt.diagnostic', { diagnostic: options.diagnosticLog })}`
  const explanation = conflictFacts ?? t(localRepairGuidance[topic] ?? 'failure.repair.recovery')
  return [
    t('failure.prompt.title'),
    '',
    t('failure.prompt.header', {
      host,
      version: options.runtimeVersion?.trim() || t('common.unknown'),
      action: operationLabel(operation.kind, t),
      kind: operation.kind,
      skinId: operation.skinId,
      skinZh: skin.name.zh,
      skinEn: skin.name.en,
      skinIdValue: skin.id,
      packageName: skin.package,
      rowId: skin.rowId,
      repo: skin.repo,
      catalogVersion: skin.install.version,
      commit: skin.install.commit,
      target: skin.install.target,
      goal,
      topic,
    }),
    '',
    t('failure.prompt.factCheck', { instructions: hostInstructions }),
    '',
    explanation,
    '',
    t('failure.prompt.safety'),
    '',
    t('failure.prompt.globalSettings'),
    '',
    t('failure.prompt.finish') + diagnostic,
  ].join('\n')
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

export function failureHelpLinks(options: FailureHelpSubject, t: Translator = defaultTranslator): FailureHelpLink[] {
  const message = options.message ?? ''
  const diagnostic = terminalDiagnostic(options.failureKind, message)
  const skinUrl = options.skin == null ? null : skinRepositoryBrowseUrl(options.skin)
  const skinLink: FailureHelpLink | null = skinUrl === null ? null : { href: skinUrl, label: t('failure.links.skinRepository') }
  const troubleshootLink: FailureHelpLink = { href: MARKET_INSTALL_TROUBLESHOOT_URL, label: t('failure.links.troubleshooting') }
  const reportLink: FailureHelpLink = { href: MARKET_REPORT_URL, label: t('failure.links.report') }

  if (options.failureKind === 'release-age' || /minimumReleaseAge|ERR_PNPM[^\s]*RELEASE[^\s]*AGE/.test(diagnostic)) return [{ href: MARKET_RELEASE_WAIT_URL, label: t('failure.links.handling') }]
  if (message.includes('目录元数据与包实际声明不一致') || options.failureKind === 'adding-to-root' || options.failureKind === 'not-a-workspace'
    || options.failureCode === 'invalid-spec' || options.failureCode === 'ambiguous-install') return [reportLink]
  if (contextExplanation(options.failureCode, message, t) !== undefined) return []
  if (sourceMigrationExplanation(diagnostic) !== undefined) return []
  if (options.failureKind === 'conflict' || message.includes('发现插件安装冲突')) return []
  if (isEnvironmentFailure(options.failureKind) || hasRecoveryFailure(message) || diagnosticRepairTopic(diagnostic) !== null) {
    return options.source === 'skin' && options.skin != null ? [] : [troubleshootLink]
  }
  if (options.source === 'market-update') return [troubleshootLink]
  if (options.failureKind === 'compatibility' || /bundle patch is missing:/i.test(message)) return skinLink === null ? [] : [skinLink]
  if (options.failureKind === 'integrity' || options.failureKind === 'build-approval') return []
  return [troubleshootLink]
}

export function conflictInstallCopy(conflicts: NonNullable<Operation['failure']>['conflicts'] | undefined, t: Translator = defaultTranslator): { summary?: string; handle?: string } {
  const rows = conflicts ?? []
  const existing = [...new Set(rows.map(conflict => conflict.existing.trim()).filter(name => name !== ''))]
  const identifiers = [...new Set(rows.flatMap(conflict => conflict.identifiers.map(identifier => identifier.trim()).filter(identifier => identifier !== '')))]
  if (existing.length === 0) return {}
  const summary = t('failure.conflictInUse', {
    existing: existing.join('、'),
    identifiers: identifiers.length === 0 ? '' : t('failure.conflictIdentifiers', { identifiers: identifiers.join('、') }),
  })
  return { summary, handle: t('failure.conflictHandle', { existing: existing.join('、') }) }
}

function conflictPromptFacts(operation: Operation, skin: CatalogSkin, t: Translator): string | null {
  if (operation.failure?.kind !== 'conflict') return null
  const described = conflictInstallCopy(operation.failure.conflicts, t)
  if (described.summary === undefined && described.handle === undefined) return null
  return [
    ...(described.summary === undefined ? [] : [described.summary]),
    described.handle ?? t('failure.conflictNext'),
    t('failure.conflictPackage', { packageName: skin.package }),
    t('failure.conflictTarget', { target: skin.install.target }),
  ].join('\n')
}

function manualInstallNotice(title: string, spec: string | undefined, t: Translator): InterceptNotice | undefined {
  const value = spec?.trim()
  if (value === undefined || value === '') return
  return {
    title,
    what: t('failure.autoReplaceIncomplete'),
    why: t('failure.manualReplace', { spec: value }),
    links: [],
    copySpec: value,
  }
}

export interface ExistingSourceStep {
  id: 'manual' | 'command' | 'agent'
  title: string
  body: string
  copy?: string
  copyLabel?: string
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:@=-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`
}

function repairCommand(profile?: string, profileDir?: string): string {
  const tail = '--apply --yes --i-have-stopped-dsh'
  if (profileDir !== undefined && profileDir.trim() !== '') {
    return `npx -y -p dsh-skin-market@latest dsh-skin-market-repair --profile-dir ${shellQuote(profileDir.trim())} ${tail}`
  }
  if (profile !== undefined && profile.trim() !== '') {
    return `npx -y -p dsh-skin-market@latest dsh-skin-market-repair --profile ${shellQuote(profile.trim())} ${tail}`
  }
  return `npx -y -p dsh-skin-market@latest dsh-skin-market-repair --profile <profile> ${tail}`
}

/** Folded recovery choices for a 404 that belongs to an already installed dependency. */
export function existingSourceGuide(options: {
  failure?: Operation['failure']
  actionLabel?: string
  kind?: Operation['kind']
  targetName: string
  targetPackage?: string
  profile?: string
  profileDir?: string
  t?: Translator
}): ExistingSourceStep[] | null {
  const failure = options.failure
  const packageName = failure?.packageName?.trim()
  const source = failure?.unreachableSource
  if (failure?.kind !== 'existing-source-unreachable' || packageName === undefined || packageName === '' || source === undefined) return null
  const t = options.t ?? defaultTranslator
  const action = options.actionLabel ?? (options.kind === undefined ? t('failure.marketUpdateAction') : operationLabel(options.kind, t))
  const profile = options.profile?.trim() || t('failure.existingSourceUnknownProfile')
  const profileDir = options.profileDir?.trim() || t('failure.existingSourceUnknownDir')
  const location = options.profileDir?.trim() ? `${options.profileDir.trim()}/` : t('failure.existingSourceUnknownLocation')
  const command = repairCommand(options.profile, options.profileDir)
  const shared = {
    packageName,
    repository: source.repository,
    commit: source.commit,
    action,
    targetName: options.targetName,
    command,
    profile,
    profileDir,
    location,
    targetPackage: options.targetPackage?.trim() ? t('failure.existingSourceTargetPackage', { package: options.targetPackage.trim() }) : '',
  }
  const prompt = t('failure.existingSourcePrompt', shared)
  return [
    { id: 'manual', title: t('failure.existingSourceStep1Title', { packageName }), body: t('failure.existingSourceStep1', shared) },
    { id: 'command', title: t('failure.existingSourceStep2Title'), body: t('failure.existingSourceStep2', shared), copy: command, copyLabel: t('failure.existingSourceCopyCommand') },
    { id: 'agent', title: t('failure.existingSourceStep3Title'), body: `${t('failure.existingSourceStep3')}\n\n${prompt}`, copy: prompt, copyLabel: t('common.copyPrompt') },
  ]
}

function existingSourceNotice(action: string, name: string, failure: Operation['failure'] | undefined, t: Translator): InterceptNotice | undefined {
  const packageName = failure?.packageName?.trim()
  if (failure?.kind !== 'existing-source-unreachable' || packageName === undefined || packageName === '' || failure.unreachableSource === undefined) return
  return {
    title: t('failure.operation', { action }),
    what: t('failure.existingSourceWhat', { packageName, repository: failure.unreachableSource.repository, commit: failure.unreachableSource.commit.slice(0, 12), action, name }),
    why: t('failure.existingSourceNext'),
    links: [],
  }
}

export function interceptNotice(operation: Operation, skinName: string, skin?: (NonNullable<FailureHelpSubject['skin']> & { package?: string }) | null, t: Translator = defaultTranslator): InterceptNotice {
  const kind = operationLabel(operation.kind, t)
  const blocked = existingSourceNotice(kind, skinName, operation.failure, t)
  if (blocked !== undefined) return blocked
  const manual = manualInstallNotice(t('failure.operation', { action: kind }), operation.failure?.manualSpec, t)
  if (manual !== undefined) return manual
  const raw = (operation.failure?.message ?? operation.message ?? '').trim()
  const links = failureHelpLinks({
    source: 'skin',
    failureKind: operation.failure?.kind,
    failureCode: operation.failure?.code,
    message: raw,
    skin,
  }, t)
  if (operation.failure?.kind === 'release-age' && operation.failure.action === 'approve-release-age' && operation.failure.releaseAgeTarget !== undefined) {
    return {
      title: t('failure.releaseAgeTitle', { action: kind }),
      what: t('failure.releaseAgeWhat', {
        packageName: operation.failure.releaseAgeTarget.packageName,
        version: operation.failure.releaseAgeTarget.version,
      }),
      why: t('failure.releaseAgeNext'),
      links: [],
    }
  }
  if (operation.failure?.kind === 'integrity' && operation.failure.action === 'approve-artifact' && operation.failure.artifactRisk !== undefined) {
    return {
      title: t('failure.artifactApprovalTitle', { action: kind }),
      what: t('failure.artifactApprovalWhat', { name: skinName }),
      why: '',
      links: [],
    }
  }
  if (hasRecoveryFailure(raw)) {
    const explanation = failureExplanation(operation.failure?.kind, raw, operation.failure?.code, t)
    return {
      title: t('failure.operation', { action: kind }),
      what: t('failure.failureWhat', { name: skinName, problem: explanation.problem }),
      why: explanation.next,
      links,
    }
  }
  if (operation.application === 'overridden' || operation.failure?.kind === 'configuration-override') {
    const sameTarget = operation.failure?.targetSkinId === undefined || operation.failure.targetSkinId === operation.skinId
    const enabling = operation.failure?.desiredEnabled
      ?? (sameTarget && (operation.kind === 'activate' || operation.kind === 'pin') ? true : sameTarget && operation.kind === 'deactivate' ? false : undefined)
    const problem = enabling === true ? t('failure.overrideDisabled', { name: skinName })
      : enabling === false ? t('failure.overrideEnabled', { name: skinName })
        : t('failure.overrideGeneric', { name: skinName })
    return {
      title: t('failure.operation', { action: kind }),
      what: problem,
      why: t('failure.overrideNext'),
      links: skin == null ? [{ href: MARKET_CONFIG_OVERRIDE_URL, label: t('failure.links.handling') }] : [],
    }
  }
  const missingPatch = MISSING_BUNDLE_PATCH.exec(raw)
  if (missingPatch !== null) {
    return {
      title: t('failure.installBlocked'),
      what: t('failure.missingFiles', { name: skinName }),
      why: t('failure.missingFilesNext'),
      links,
    }
  }
  if (operation.failure?.kind === 'conflict' || raw.includes(CONFLICT_DIAGNOSTIC)) {
    const described = conflictInstallCopy(operation.failure?.conflicts, t)
    return {
      title: t('failure.installBlocked'),
      what: t('failure.conflict', { name: skinName }),
      why: described.handle ?? t('failure.conflictNext'),
      links,
      ...(described.summary === undefined ? {} : { details: [described.summary] }),
      ...(skin?.package?.trim() ? { copySpec: skin.package } : {}),
    }
  }
  if (operation.failure?.kind === 'compatibility') {
    return {
      title: t('failure.operation', { action: kind }),
      what: t('failure.compatibility', { name: skinName }),
      why: t('failure.compatibilityNext'),
      links,
    }
  }
  if (raw.includes(METADATA_MISMATCH)) {
    return {
      title: t('failure.installBlocked'),
      what: t('failure.metadataMismatch', { name: skinName }),
      why: t('failure.metadataMismatchNext'),
      links,
    }
  }
  const explanation = failureExplanation(operation.failure?.kind, raw, operation.failure?.code, t)
  return {
    title: t('failure.operation', { action: kind }),
    what: t('failure.failureWhat', { name: skinName, problem: explanation.problem }),
    why: explanation.next,
    links,
  }
}

export function marketUpdateNotice(operation: { failure?: Operation['failure']; message?: string }, t: Translator = defaultTranslator): InterceptNotice {
  const blocked = existingSourceNotice(t('failure.marketUpdateAction'), t('market.title'), operation.failure, t)
  if (blocked !== undefined) return blocked
  const manual = manualInstallNotice(t('failure.marketUpdateFailed'), operation.failure?.manualSpec, t)
  if (manual !== undefined) return manual
  const raw = (operation.failure?.message ?? operation.message ?? '').trim()
  const fallbackSpec = operation.failure?.fallbackSpec?.trim()
  if (fallbackSpec !== undefined && fallbackSpec !== '') {
    const explanation = failureExplanation(operation.failure?.kind, raw, operation.failure?.code, t)
    return {
      title: t('failure.marketUpdateFailed'),
      what: explanation.problem,
      why: raw.includes('已打开官方插件页')
        ? raw
        : t('failure.marketFallback', { spec: fallbackSpec }),
      links: [],
      copySpec: fallbackSpec,
    }
  }
  if (operation.failure?.kind === 'release-age' && operation.failure.action === 'approve-release-age' && operation.failure.releaseAgeTarget !== undefined) {
    return {
      title: t('failure.marketUpdateApprovalTitle'),
      what: t('failure.releaseAgeWhat', {
        packageName: operation.failure.releaseAgeTarget.packageName,
        version: operation.failure.releaseAgeTarget.version,
      }),
      why: t('failure.releaseAgeNextUpdate'),
      links: [],
    }
  }
  const explanation = failureExplanation(operation.failure?.kind, raw, operation.failure?.code, t)
  return {
    title: t('failure.marketUpdateFailed'),
    what: explanation.problem,
    why: explanation.next,
    links: failureHelpLinks({ source: 'market-update', failureKind: operation.failure?.kind, failureCode: operation.failure?.code, message: raw }, t),
  }
}
