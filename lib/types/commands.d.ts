export interface CommandResult {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    aborted?: boolean;
}
export interface CommandOptions {
    signal?: AbortSignal;
    env?: NodeJS.ProcessEnv;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
    /**
     * Recovery record for a profile-mutating `add`. Desktop hosts reject
     * `plugin add` through the plain plugin runner ("plugin add must use the
     * recoverable install boundary"); when present, the desktop runner routes
     * the add through runPluginInstall with this record.
     */
    installRecovery?: InstallRecoveryRecord;
}
export interface InstallRecoveryRecord {
    packageName: string;
    packageVersion: string;
    receiptId: string;
}
export type PluginRunner = (profile: string, args: readonly string[], options?: CommandOptions) => Promise<CommandResult>;
export declare function normalizedEnvironment(options?: CommandOptions): NodeJS.ProcessEnv | undefined;
export declare const winCmdShim: boolean;
/** Quote one argv token before passing it through cmd.exe. */
export declare function quoteCmdArg(arg: string): string;
/** Build the command line used by the explicit Windows cmd.exe bridge. */
export declare function cmdCommandLine(argv: readonly string[]): string;
export declare const runPluginCli: PluginRunner;
interface DesktopOperationHandle {
    stdout: NodeJS.ReadableStream;
    stderr: NodeJS.ReadableStream;
    done: Promise<{
        exitCode: number | null;
    }>;
}
export interface DesktopPnpmLike {
    runPlugin(args: readonly string[], invokingDir: string, signal?: AbortSignal, env?: NodeJS.ProcessEnv): DesktopOperationHandle;
    /** Packaged pnpm in the active profile; present on desktop hosts that gate `plugin add`. */
    run?(args: readonly string[], signal?: AbortSignal): DesktopOperationHandle;
    /** Recoverable install boundary: WAL-snapshots the profile around one `add`. */
    runPluginInstall?(args: readonly string[], invokingDir: string, recovery: InstallRecoveryRecord, signal?: AbortSignal): Promise<DesktopOperationHandle>;
}
export declare function desktopRunner(service: DesktopPnpmLike, profileDir: string): PluginRunner;
export declare function commandError(result: CommandResult): string;
export {};
