import { type CommandResult } from './commands.ts';
import type { OperationMessageKey, OperationMessageParams } from './operation-message.ts';
export type PnpmFailureKind = 'release-age' | 'network' | 'fetch-timeout' | 'build-approval' | 'fetch-404' | 'existing-source-unreachable' | 'no-matching-version' | 'integrity' | 'adding-to-root' | 'not-a-workspace' | 'unexpected-store' | 'lockfile-outdated' | 'lockfile-broken' | 'script-timeout' | 'command';
export interface PnpmFailure {
    kind: PnpmFailureKind;
    message: string;
    messageKey?: OperationMessageKey;
    messageParams?: OperationMessageParams;
    packageName?: string;
    buildKey?: string;
    buildKeys?: string[];
    recovery?: 'disable-peer-autoinstall';
}
export declare class PnpmCommandError extends Error {
    readonly failure: PnpmFailure;
    readonly result: CommandResult;
    constructor(failure: PnpmFailure, result: CommandResult);
}
export interface PnpmAttemptOptions {
    env?: NodeJS.ProcessEnv;
}
export interface PnpmRecoveryOptions {
    attempt: (args: readonly string[], options?: PnpmAttemptOptions) => Promise<CommandResult>;
    onRetry?: (failure: PnpmFailure) => void;
    profileDir?: string;
    /** Ordered host-provided registries. Undefined means keep pnpm's own config. */
    registryPlan?: readonly string[];
}
export declare function classifyPnpmFailure(result: CommandResult): PnpmFailure;
/** Add one ephemeral registry without touching the profile's persistent config. */
export declare function withRegistry(args: readonly string[], registry: string): string[];
export declare function runPnpmWithRecovery(args: readonly string[], options: PnpmRecoveryOptions): Promise<void>;
/** Return only structured, non-secret pnpm failure metadata for copied logs. */
export declare function failureDiagnostic(result: CommandResult): string;
