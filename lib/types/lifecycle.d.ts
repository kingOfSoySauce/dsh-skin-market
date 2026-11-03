import type { PluginRunner } from './commands.ts';
import { type ConfigurationOverrideOptions } from './configuration-override.ts';
import type { ConfigurationOverrideBatchPlan } from './configuration-override-types.ts';
import { type ReleaseAgeTarget } from './release-age.ts';
import type { DesktopInstallCapability, DshRuntime, LoaderEntry, MarketHostKind, Operation, OperationKind, OperationRetryAction, SelectionOperationKind, SkinEntry, SkinRuntimeState } from './types.ts';
export interface LifecycleHost {
    loader: {
        entries(): Iterable<LoaderEntry>;
    };
    on?(event: string, callback: (fiber: {
        entry?: {
            options?: {
                name?: string;
                id?: string;
            };
        };
    }) => void): () => void;
}
export interface LifecycleOptions {
    profile: string;
    profileDir: string;
    runner: PluginRunner;
    hostKind?: MarketHostKind;
    runtime?: DshRuntime;
    /** Shared by all preparation/install attempts; recovery has its own budget. */
    operationTimeoutMs?: number;
    recoveryTimeoutMs?: number;
    lifecycleWaitMs?: number;
    configurationOverride?: ConfigurationOverrideOptions;
}
/** Isolated temp-dir prefetches may overlap; live profile pnpm stays serial. */
export declare function maxParallelDownloads(platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv, memoryBytes?: number): number;
interface ConfigurationRepairApproval {
    failedId: string;
    context: string;
    binding: string;
}
export declare function desktopInstallError(capability: DesktopInstallCapability | undefined): string;
interface ReleaseAgeApproval {
    target: ReleaseAgeTarget;
    context: string;
    failedId?: string;
}
export declare class SkinLifecycle {
    private readonly host;
    private readonly options;
    readonly operations: Map<string, Operation>;
    private profileChain;
    private profileLockOwner;
    private profileOperation?;
    private downloadAvailable;
    private readonly downloadWaiters;
    private readonly abortControllers;
    private readonly pendingBuildKeys;
    private readonly failedReleaseAgeApprovals;
    private readonly pendingReleaseAgeApprovals;
    private readonly artifactContexts;
    private readonly sourceMigrationContexts;
    private readonly failedArtifactContexts;
    private readonly compatibilityContexts;
    private readonly deadlines;
    private readonly deadlineTimers;
    private readonly operationCleanupTimers;
    private readonly expired;
    private readonly profileMutations;
    private readonly recoveryErrors;
    private readonly partialManagedArtifacts;
    private readonly desktopManagedAttempts;
    private readonly desktopRecoveryBaselines;
    private readonly executions;
    private catalogEntries;
    private skinById;
    private disposeEvent?;
    private disposed;
    private readonly pendingLifecycle;
    private startupReplay?;
    private unresolvedManager;
    private readonly unverifiedRestartSkinIds;
    private readonly componentUndo;
    private readonly bundleUndo;
    private readonly legacyBundleUndo;
    private readonly pendingConfigurationRepairs;
    private readonly failedConfigurationBindings;
    private readonly pendingSelectionConfigurations;
    private readonly registryPlanCache;
    get waitingReason(): string | undefined;
    constructor(host: LifecycleHost, options: LifecycleOptions, catalog?: SkinEntry[]);
    get catalog(): SkinEntry[];
    private get hostKind();
    private get management();
    private installedSkins;
    private enabledSkinIds;
    private registryPlanFor;
    private assertSkinLoaderConflicts;
    private legacyBinding;
    private bundleBinding;
    /** Undo only native bundle changes made by this operation, using their actual prior choices. */
    private restoreNativeBundles;
    /** Inventory is authoritative for whether a reviewed old bundle can be withdrawn. */
    private inspectLegacyBundles;
    private withdrawLegacyBundles;
    /** Called after the ordinary selection rollback, so replay cannot re-enable the target. */
    private restoreLegacyBundles;
    private configurationTarget;
    private configurationBinding;
    private describeConfigurationOverride;
    /** Derive the same main-component directions as the ordinary selection transition. */
    private selectionTargets;
    private selectionBinding;
    private selectionContextLocked;
    private selectionPlanLocked;
    /** Background preflight is read-only and never creates a visible Operation. */
    selectionPlan(kind: SelectionOperationKind, skinId: string, preservedOverride?: readonly string[]): Promise<ConfigurationOverrideBatchPlan>;
    private releaseAgeContext;
    private repairReleaseAgePolicy;
    private applyReleaseAgeApproval;
    /** Called only for package transactions while holding the profile queue. */
    private managedPackageCall;
    private shouldTryNextRegistry;
    /** Retry only confirmed, pre-application package failures on the host's next registry. */
    private managedInstallWithRegistryRecovery;
    /** HMR Desktop rejects installBundle for a dependency that already exists. */
    private replaceInstalledDesktopPackage;
    private acceptManagement;
    private awaitLifecycle;
    private recordRestart;
    /** Clear a Web receipt after the browser loader has confirmed the skin live. */
    clearWebRestartReceipt(skinId: string): Promise<void>;
    private recordSelectionRestart;
    get restartNoticeId(): string | undefined;
    /** Resolve only the curated main component, using both official inventories. */
    private officialComponent;
    private registerSkin;
    private get runtime();
    private assertCompatibilityContext;
    /** Revalidate the shown artifact inside the profile queue before changing selection. */
    private assertArtifactUseApproved;
    private assertPreservedSkinApproved;
    private assertLegacyOfficialPeers;
    private applyCompatibility;
    private syncPnpmMetadata;
    private applyPendingBuildApprovals;
    private prefetchBuildApprovals;
    private preparePrefetchDirectory;
    private repairMaterializedPackage;
    replaceCatalog(catalog: SkinEntry[]): Promise<void>;
    start(): void;
    dispose(): Promise<void>;
    skin(id: string): SkinEntry;
    private entriesFor;
    private setEntryDisabled;
    private setLoaderDisabled;
    private claimManagedLoaders;
    private releaseManagedLoaders;
    private syncManagedLoaders;
    private reconcileDisabledSkinIds;
    private selectionHostStatus;
    private selectionClientTargets;
    private selectionArtifactHash;
    replay(repairComponents?: boolean, startup?: boolean): Promise<void>;
    private replayLocked;
    states(): SkinRuntimeState[];
    /** Official inventory separates a saved toggle from actual fiber health. */
    runtimeStates(skipStartupReplay?: boolean): Promise<SkinRuntimeState[]>;
    private inspectRuntimeStates;
    private describeRestartVerification;
    private liveOperations;
    currentOperations(): Operation[];
    currentOperation(): Operation | null;
    begin(kind: OperationKind, skinId: string, approvedBuildKeys?: readonly string[] | string, acknowledgeCompatibility?: boolean, acknowledgedContext?: string, releaseAgeApproval?: ReleaseAgeApproval, artifactContext?: string, configurationRepair?: ConfigurationRepairApproval, selectionConfigurationContext?: string, sourceContext?: string, preservedSkinIds?: readonly string[], preservedSkinApprovals?: Record<string, {
        compatibilityContext: string;
        artifactContext?: string;
    }>, selectionContext?: string): Operation;
    retry(id: string, action: OperationRetryAction, acknowledgeCompatibility?: boolean, acknowledgedContext?: string, acknowledgedArtifactContext?: string, configurationContext?: string): Operation;
    private update;
    cancel(id: string): Operation;
    private withProfileLock;
    private withDownloadSlot;
    private execute;
    private run;
    private remainingTime;
    private checkDeadline;
    private startCommand;
    /** Restore metadata first, then reconcile dependencies once within a separate budget. */
    private recoverProfile;
    private prepareProfile;
    private assertNpmMigration;
    private replacementReview;
    private replacementTarget;
    private assertReplacementArtifact;
    /** An ordinary Desktop update must retain the installed source family. */
    private desktopUpdateTarget;
    private installPackage;
    private installCompanions;
    private claimManagedCompanion;
    private companionOwnersEnabled;
    private syncInstalledCompanions;
    private companionStillNeeded;
    private uninstallUnusedCompanions;
    private assertRuntimeLoaderConflicts;
    private prefetch;
    private install;
    private installIntoProfile;
    private selectionSnapshot;
    private rollbackSelection;
    private retainSavedOfficialSelection;
    private activate;
    private activateLocked;
    private deactivate;
    private deactivateLocked;
    private pin;
    private pinLocked;
    private unpin;
    private unpinLocked;
    private updateSkin;
    private uninstall;
    private uninstallLocked;
}
export {};
