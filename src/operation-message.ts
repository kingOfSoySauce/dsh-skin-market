export type OperationMessageKey =
  | 'common.stepDownloadInspect'
  | 'common.stepRemoveDependency'
  | 'common.stepSyncProfile'
  | 'common.stepInstallProfile'
  | 'common.stepRestoreProfile'
  | 'common.recoveryPeerAutoinstall'
  | 'common.recoveryReleaseAge'
  | 'common.recoveryTimeout'
  | 'common.recoveryNetwork'
  | 'common.recoveryReleaseAgeRepair'
  | 'common.operationWaitingOther'
  | 'common.operationWaitingWrite'
  | 'common.operationHostApplied'
  | 'common.operationHostUpdateStarting'
  | 'common.operationHostUpdateChecking'
  | 'common.operationHostUpdateRemoving'
  | 'common.operationHostUpdateInstalling'
  | 'common.operationHostUpdateRestoring'
  | 'common.operationHostUpdateFallback'
  | 'common.operationRestoringDependencies'
  | 'common.operationApplyingCompatibility'
  | 'common.operationSyncingLockfile'
  | 'common.operationCancelCleanup'
  | 'common.operationWaitingDownloadSlot'
  | 'common.operationHostStopped'
  | 'common.cancelled'
  | 'common.operationRepairingRecordedDependency'
  | 'common.operationFallbackRegistry'
  | 'common.operationTimeoutEnding'
  | 'common.operationInstallPackageRepairedDesktop'
  | 'common.operationInstallPackageRepairedDsh'
  | 'common.operationInstallPackageVerifiedDesktop'
  | 'common.operationInstallPackageVerifiedDsh'
  | 'common.operationInstallReconciled'
  | 'common.operationInstallReady'
  | 'common.operationSelectionSavedRestartDesktop'
  | 'common.operationActivationSavedRestart'
  | 'common.operationActive'
  | 'common.operationActivationNotRunning'
  | 'common.operationExternalReconciled'
  | 'common.operationDisabledRestart'
  | 'common.operationDefaultAppearanceRestored'
  | 'common.operationDisabledKept'
  | 'common.operationPinSavedRestart'
  | 'common.operationPinnedActive'
  | 'common.operationPinNotRunning'
  | 'common.operationUnpinRestart'
  | 'common.operationUnpinCurrent'
  | 'common.operationUnpinDisabled'
  | 'common.operationNeedsUseConfirmation'
  | 'common.operationNpmMigrationActiveRestart'
  | 'common.operationMarketMigrationActiveRestart'
  | 'common.operationNpmMigrationInactive'
  | 'common.operationMarketMigrationInactive'
  | 'common.operationUpdateVerifiedRestart'
  | 'common.operationUpdatedActive'
  | 'common.operationUpdatedInactive'
  | 'common.operationUninstalled'
  | 'common.marketOperationChecking'
  | 'common.marketOperationDownloading'
  | 'common.marketOperationInstalling'
  | 'common.marketOperationWaiting'
  | 'common.marketOperationCancelling'
  | 'common.marketOperationCancelled'
  | 'common.marketUpdatedRestart'
  | 'common.marketOperationRestoring'
  | 'common.marketAlreadyLatest'
  | 'common.marketCheckChanged'
  | 'common.operationResultUnknown'
  | 'common.operationResultPending'
  | 'common.skinOperationsBusy'
  | 'common.dshComponentDisabled'
  | 'common.dshComponentRestartFailed'
  | 'common.dshComponentWaiting'
  | 'common.dshComponentLoading'
  | 'common.dshComponentFailed'
  | 'common.dshComponentUnknown'
  | 'common.dshComponentNotLoaded'
  | 'server.requestNotAdmitted'
  | 'server.loginRequired'
  | 'server.marketUpdateStopped'
  | 'server.marketUpdateNotRetryable'
  | 'server.sameOriginRequired'
  | 'server.invalidRequest'
  | 'server.marketUpdateBusy'
  | 'server.marketUpdateWaiting'
  | 'server.skinOperationsBusy'
  | 'server.operationNotFound'
  | 'server.marketUpdateOperationNotFound'
  | 'server.desktopRestartReceiptUnsupported'
  | 'server.restartTargetRequired'
  | 'server.restartUnavailable'
  | 'server.directLoopbackRequired'
  | 'server.marketUpdateRestartMissing'
  | 'server.skinRestartSelectionRequired'
  | 'server.restartBlockedByOperations'
  | 'server.restartBlockedByMarketUpdate'
  | 'server.agentRunning'
  | 'server.agentStarted'
  | 'failure.scriptProblem'
  | 'failure.lockfileProblem'
  | 'failure.lockfileBrokenProblem'
  | 'failure.buildProblem'
  | 'failure.releaseAgeProblem'
  | 'failure.timeoutProblem'
  | 'failure.networkProblem'
  | 'failure.fetch404Problem'
  | 'failure.existingSourceProblem'
  | 'failure.versionProblem'
  | 'failure.integrityProblem'
  | 'failure.storeProblem'
  | 'failure.commandProblem'
  | 'failure.diskProblem'
  | 'failure.permissionProblem'
  | 'failure.pnpmProblem'
  | 'failure.releaseAgeWait'
  | 'failure.conflict'
  | 'failure.compatibility'
  | 'failure.managementProblem'
  | 'failure.unknownPluginProblem'
  | 'failure.unaddressableProblem'
  | 'failure.invalidSpecProblem'
  | 'failure.ambiguousInstallProblem'
  | 'failure.notBundleProblem'
  | 'failure.marketUpdateFailed'
  | 'failure.hostUpdateVersionProblem'
  | 'failure.hostUpdateArtifactProblem'
  | 'failure.hostStoppedProblem'
  | 'failure.hostUnsupportedProblem'
  | 'failure.compatibilityChangedProblem'
  | 'failure.compatibilityConfirmProblem'
  | 'failure.artifactConsentScopeProblem'
  | 'failure.desktopManualProblem'
  | 'failure.retryUnsupportedProblem'
  | 'failure.repairTargetChangedProblem'
  | 'failure.releaseAgeTargetChangedProblem'
  | 'failure.artifactTargetChangedProblem'
  | 'failure.buildApprovalMissingProblem'
  | 'failure.cancelUnavailableProblem'
  | 'failure.hostPluginManagerMissing'
  | 'failure.hostVersionUnknown'
  | 'failure.hostVersionUnsupported'
  | 'failure.hostCapabilityMissing'
  | 'failure.hostRegistryUnsupported'
  | 'failure.hostSaveExactUnsupported'
  | 'failure.desktopInstallMetadataProblem'
  | 'failure.githubSourceUnverified'
  | 'failure.desktopCompanionsRequired'
  | 'failure.desktopBuildApprovalRequired'
  | 'failure.githubTargetInvalid'
  | 'failure.githubTargetMismatch'
  | 'failure.desktopNpmOnly'
  | 'failure.nativePanelUnavailable'
  | 'failure.nativePanelListUnavailable'
  | 'failure.nativePanelBusy'
  | 'failure.nativePanelMissingSource'
  | 'common.nativePanelOpening'
  | 'failure.configHostOverlays'
  | 'failure.configHomeUntrusted'
  | 'failure.configPathOverlap'
  | 'failure.configUnavailable'
  | 'failure.configUnsafe'
  | 'failure.configChanged'
  | 'failure.configWriteFailed'
  | 'failure.configInvalidTarget'
  | 'failure.updateSourceChangedProblem'
  | 'failure.npmMigrationDesktopProblem'
  | 'failure.migrationReviewChangedProblem'
  | 'failure.npmMigrationUnavailableProblem'
  | 'failure.localMigrationConsentProblem'
  | 'failure.npmTargetChangedProblem'
  | 'failure.npmArtifactVerifyProblem'
  | 'failure.skinNotInstalledProblem'
  | 'failure.githubSourceMismatchProblem'
  | 'failure.githubHostUnsupportedProblem'
  | 'failure.customSourceUpdateProblem'
  | 'failure.desktopTargetMismatchProblem'
  | 'failure.desktopInstallServiceMissing'
  | 'failure.npmMigrationTargetChangedProblem'
  | 'failure.prefetchNpmVersionMissingProblem'
  | 'failure.prefetchNpmVersionMismatchProblem'
  | 'failure.updateSourceLocalProblem'
  | 'failure.hostPnpmMissing'
  | 'failure.updateSourceQueuedProblem'
  | 'failure.npmMigrationQueuedProblem'
  | 'failure.updateSourceDownloadQueuedProblem'
  | 'failure.notRemovableProblem'
  | 'failure.stopProfileProblem'
  | 'failure.bundleInUseProblem'
  | 'failure.staleApprovalProblem'
  | 'failure.operationStateProblem'
  | 'failure.overrideDisabled'
  | 'failure.overrideEnabled'
  | 'failure.overrideGeneric'

export type OperationMessageParams = Readonly<Record<string, string | number>>

/** Optional locale metadata added beside the legacy raw message. */
export interface OperationMessageFields {
  messageKey?: OperationMessageKey
  messageParams?: OperationMessageParams
}

/** Optional locale metadata for a command progress step. */
export interface OperationStepFields {
  stepKey?: OperationMessageKey
  stepParams?: OperationMessageParams
}

/** An error that keeps a legacy raw message alongside a translatable key. */
export class MarketMessageError extends Error implements OperationMessageFields {
  readonly messageKey: OperationMessageKey
  readonly messageParams?: OperationMessageParams

  constructor(message: string, key: OperationMessageKey, params?: OperationMessageParams) {
    super(message)
    this.name = 'MarketMessageError'
    this.messageKey = key
    this.messageParams = params
  }
}

export function messageFields(error: unknown): OperationMessageFields {
  if (!(error instanceof Error)) return {}
  const candidate = error as Error & OperationMessageFields
  return candidate.messageKey === undefined
    ? {}
    : { messageKey: candidate.messageKey, ...(candidate.messageParams === undefined ? {} : { messageParams: candidate.messageParams }) }
}

/** Keep the legacy raw value and its optional locale metadata in sync. */
export function writeOperationMessage(
  target: OperationMessageFields & { message?: string },
  message: string | undefined,
  key?: OperationMessageKey,
  params?: OperationMessageParams,
): void {
  target.message = message
  if (key === undefined) {
    delete target.messageKey
    delete target.messageParams
  } else {
    target.messageKey = key
    if (params === undefined) delete target.messageParams
    else target.messageParams = params
  }
}

/** Keep the legacy raw progress step and its optional locale metadata in sync. */
export function writeOperationStep(
  target: OperationStepFields & { step?: string },
  step: string | undefined,
  key?: OperationMessageKey,
  params?: OperationMessageParams,
): void {
  target.step = step
  if (key === undefined) {
    delete target.stepKey
    delete target.stepParams
  } else {
    target.stepKey = key
    if (params === undefined) delete target.stepParams
    else target.stepParams = params
  }
}
