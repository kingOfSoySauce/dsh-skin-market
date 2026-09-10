import { type CommandResult } from './commands.ts';
export type PnpmFailureKind = 'release-age' | 'network' | 'fetch-timeout' | 'build-approval' | 'fetch-404' | 'adding-to-root' | 'not-a-workspace' | 'unexpected-store' | 'command';
export interface PnpmFailure {
    kind: PnpmFailureKind;
    message: string;
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
}
export declare function classifyPnpmFailure(result: CommandResult): PnpmFailure;
export declare function runPnpmWithRecovery(args: readonly string[], options: PnpmRecoveryOptions): Promise<void>;
/** Return only structured, non-secret pnpm failure metadata for copied logs. */
export declare function failureDiagnostic(result: CommandResult): string;
