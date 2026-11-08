import type { PluginRunner } from './commands.ts';
import type { OperationFailure } from './types.ts';
import { type OperationMessageFields } from './operation-message.ts';
import type { OfficialApplication } from './official-desktop.ts';
export declare const MARKET_NPM_PACKAGE = "dsh-skin-market";
export declare const MARKET_NPM_REGISTRY = "https://registry.npmjs.org";
export declare const MARKET_NPM_METADATA_URL = "https://registry.npmjs.org/dsh-skin-market";
export interface MarketUpdateStatus {
    currentVersion: string;
    /** Version of the Host module serving this updater, independent of the installed package. */
    loadedVersion?: string;
    /** Newest installable release; older than the registry's latest tag while that tag is inside a release-age hold. */
    latestVersion: string;
    updateAvailable: boolean;
    updateBlockedReason?: string;
    updateBlockedReasonKey?: OperationMessageFields['messageKey'];
    updateBlockedReasonParams?: OperationMessageFields['messageParams'];
    /** Optional legacy status field; release age is handled from actual Desktop failures. */
    updateAvailableAt?: string;
    packageOperationsWarning?: string;
    /** Optional legacy status field, retained for older clients. */
    packageOperationsAvailableAt?: string;
}
export type MarketUpdatePhase = 'queued' | 'checking' | 'downloading' | 'installing' | 'waiting' | 'cancelling' | 'cancelled' | 'done' | 'failed';
export interface MarketUpdateOperation {
    id: string;
    phase: MarketUpdatePhase;
    message?: string;
    messageKey?: OperationMessageFields['messageKey'];
    messageParams?: OperationMessageFields['messageParams'];
    status?: MarketUpdateStatus;
    cancelable?: boolean;
    downloadedBytes?: number;
    totalBytes?: number;
    bytesPerSecond?: number;
    failure?: OperationFailure;
    application?: OfficialApplication | 'unknown';
    restartRequired?: boolean;
    integrityVerified?: boolean;
    startedAt: string;
    finishedAt?: string;
}
export interface MarketUpdater {
    status(force?: boolean): Promise<MarketUpdateStatus>;
    update(): Promise<MarketUpdateStatus>;
    startUpdate(): MarketUpdateOperation;
    operation(id: string): MarketUpdateOperation | null;
    currentOperation(): MarketUpdateOperation | null;
    cancel(id: string): MarketUpdateOperation;
    retry(id: string, action?: 'retry' | 'approve-release-age'): MarketUpdateOperation;
    /** Stop a route mount cleanly, joining any host package-manager request. */
    dispose?(): Promise<void>;
    readonly restartRequired: boolean;
    readonly restartNoticeId?: string;
}
export declare function packageVersion(): string;
export { compareVersions } from './semver.ts';
export declare function createMarketUpdater(profile: string, runner: PluginRunner, options?: {
    currentVersion?: string;
    fetch?: typeof fetch;
    cacheMs?: number;
    profileDir?: string;
    registryPlan?: () => Promise<readonly string[] | undefined>;
}): MarketUpdater;
