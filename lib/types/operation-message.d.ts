export type OperationMessageKey = 'common.stepDownloadInspect' | 'common.stepRemoveDependency' | 'common.stepSyncProfile' | 'common.stepInstallProfile' | 'common.stepRestoreProfile' | 'common.recoveryPeerAutoinstall' | 'common.recoveryReleaseAge' | 'common.recoveryTimeout' | 'common.recoveryNetwork' | 'common.recoveryReleaseAgeRepair' | 'common.operationWaitingOther' | 'common.operationWaitingWrite' | 'common.operationHostApplied' | 'common.operationCancelCleanup' | 'common.operationWaitingDownloadSlot' | 'common.operationHostStopped' | 'common.cancelled' | 'common.operationRepairingRecordedDependency' | 'common.operationFallbackRegistry' | 'common.operationTimeoutEnding' | 'common.operationInstallPackageRepairedDesktop' | 'common.operationInstallPackageRepairedDsh' | 'common.operationInstallPackageVerifiedDesktop' | 'common.operationInstallPackageVerifiedDsh' | 'common.operationInstallReconciled' | 'common.operationInstallReady' | 'common.operationSelectionSavedRestartDesktop' | 'common.operationActivationSavedRestart' | 'common.operationActive' | 'common.operationActivationNotRunning' | 'common.operationExternalReconciled' | 'common.operationDisabledRestart' | 'common.operationDefaultAppearanceRestored' | 'common.operationDisabledKept' | 'common.operationPinSavedRestart' | 'common.operationPinnedActive' | 'common.operationPinNotRunning' | 'common.operationUnpinRestart' | 'common.operationUnpinCurrent' | 'common.operationUnpinDisabled' | 'common.operationNeedsUseConfirmation' | 'common.operationNpmMigrationActiveRestart' | 'common.operationMarketMigrationActiveRestart' | 'common.operationNpmMigrationInactive' | 'common.operationMarketMigrationInactive' | 'common.operationUpdateVerifiedRestart' | 'common.operationUpdatedActive' | 'common.operationUpdatedInactive' | 'common.operationUninstalled' | 'common.marketOperationChecking' | 'common.marketOperationDownloading' | 'common.marketOperationInstalling' | 'common.marketOperationWaiting' | 'common.marketOperationCancelling' | 'common.marketOperationCancelled' | 'common.marketUpdatedRestart' | 'common.marketOperationRestoring' | 'common.marketAlreadyLatest' | 'common.marketCheckChanged';
export type OperationMessageParams = Readonly<Record<string, string | number>>;
/** Optional locale metadata added beside the legacy raw message. */
export interface OperationMessageFields {
    messageKey?: OperationMessageKey;
    messageParams?: OperationMessageParams;
}
/** Optional locale metadata for a command progress step. */
export interface OperationStepFields {
    stepKey?: OperationMessageKey;
    stepParams?: OperationMessageParams;
}
/** Keep the legacy raw value and its optional locale metadata in sync. */
export declare function writeOperationMessage(target: OperationMessageFields & {
    message?: string;
}, message: string | undefined, key?: OperationMessageKey, params?: OperationMessageParams): void;
/** Keep the legacy raw progress step and its optional locale metadata in sync. */
export declare function writeOperationStep(target: OperationStepFields & {
    step?: string;
}, step: string | undefined, key?: OperationMessageKey, params?: OperationMessageParams): void;
