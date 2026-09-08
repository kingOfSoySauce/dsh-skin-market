import type { PluginRunner } from './commands.ts';
import type { DesktopInstallCapability, DshRuntime, LoaderEntry, MarketHostKind, Operation, OperationKind, SkinEntry, SkinRuntimeState } from './types.ts';
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
}
export declare function desktopInstallError(capability: DesktopInstallCapability | undefined): string;
export declare class SkinLifecycle {
    private readonly host;
    private readonly options;
    readonly operations: Map<string, Operation>;
    private activeOperation;
    private readonly abortControllers;
    private readonly pendingBuildKeys;
    private readonly deadlines;
    private readonly deadlineTimers;
    private readonly expired;
    private readonly profileMutations;
    private readonly recoveryErrors;
    private readonly desktopManagedAttempts;
    private readonly desktopRecoveryBaselines;
    private catalogEntries;
    private skinById;
    private disposeEvent?;
    constructor(host: LifecycleHost, options: LifecycleOptions, catalog?: SkinEntry[]);
    get catalog(): SkinEntry[];
    private get hostKind();
    private get runtime();
    private applyCompatibility;
    private syncPnpmMetadata;
    private applyPendingBuildApprovals;
    private prefetchBuildApprovals;
    private preparePrefetchDirectory;
    private repairMaterializedPackage;
    replaceCatalog(catalog: SkinEntry[]): Promise<void>;
    start(): void;
    dispose(): void;
    skin(id: string): SkinEntry;
    private entriesFor;
    private setEntryDisabled;
    private setLoaderDisabled;
    private claimManagedLoaders;
    private releaseManagedLoaders;
    private syncManagedLoaders;
    private reconcileDisabledSkinIds;
    private requiresRestartForTransition;
    replay(): Promise<void>;
    states(): SkinRuntimeState[];
    currentOperation(): Operation | null;
    begin(kind: OperationKind, skinId: string, approvedBuildKeys?: readonly string[] | string): Operation;
    retry(id: string, action: 'retry' | 'approve-build'): Operation;
    private update;
    cancel(id: string): Operation;
    private execute;
    private run;
    private remainingTime;
    private checkDeadline;
    private startCommand;
    /** Restore metadata first, then reconcile dependencies once within a separate budget. */
    private recoverProfile;
    private prepareProfile;
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
    private activate;
    private deactivate;
    private pin;
    private unpin;
    private updateSkin;
    private uninstall;
}
