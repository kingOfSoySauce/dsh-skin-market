import type { MarketHostKind } from './types.ts';
import type { OfficialInstallProgress, OfficialManagementAdapter, OfficialManagementResult } from './official-desktop.ts';
import { type RegistryPlanProvider } from './registry-plan.ts';
export interface CommandResult {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    aborted?: boolean;
    management?: OfficialManagementResult;
}
export interface CommandOptions {
    signal?: AbortSignal;
    /** Remaining command budget; provisioning shares it across all setup steps. */
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
    onManagementState?: (state: OfficialInstallProgress) => void;
}
export type CommandExecutor = (file: string, args: readonly string[], options?: CommandOptions) => Promise<CommandResult>;
export interface PluginInstallRequest {
    packageName: string;
    packageVersion: string;
    /** A reviewed pinned source; only the official manager accepts non-npm specs. */
    spec?: string;
    receiptId: string;
    pnpmOptions?: readonly string[];
    /** Exact pending package names explicitly approved by the user. */
    approvedBuilds?: readonly string[];
    registry?: string | null;
    saveExact?: boolean;
}
/** The launcher-published pnpm executable and environment for one profile. */
export interface HostPnpmInvocation {
    command: string;
    args?: readonly string[];
    env?: Readonly<Record<string, string>>;
}
export interface PluginRunner {
    (profile: string, args: readonly string[], options?: CommandOptions): Promise<CommandResult>;
    hostKind?: MarketHostKind;
    ensurePnpm?: (options?: CommandOptions) => Promise<void>;
    installPlugin?: (profile: string, request: PluginInstallRequest, options?: CommandOptions) => Promise<CommandResult>;
    management?: OfficialManagementAdapter;
    /**
     * Run the host's own pnpm against the profile without going through the
     * plugin manager. Official Desktop refuses to re-add an installed package
     * (HMR), and its managed remove-then-install unloads this plugin before the
     * install step can run, so a self-update has to overlay the package here.
     */
    hostPnpm?: (args: readonly string[], options?: CommandOptions) => Promise<CommandResult>;
    /** Ordered registry bases supplied by the host for package operations. */
    registryPlan?: RegistryPlanProvider;
}
export declare function normalizedEnvironment(options?: CommandOptions): NodeJS.ProcessEnv | undefined;
export declare const winCmdShim: boolean;
/**
 * Bilingual guidance when `&path:` installs cannot start pnpm with shell:false.
 * Common on Windows when PATH only has a `pnpm.cmd` shim.
 */
export declare const PNPM_DIRECT_SPAWN_ENOENT_HINT = "\u65E0\u6CD5\u4EE5 shell:false \u542F\u52A8\u771F\u5B9E pnpm\uFF08\u5E38\u89C1\u539F\u56E0\uFF1APATH \u4E0A\u53EA\u6709 pnpm.cmd\uFF0C\u800C\u542B &path: \u7684\u5B89\u88C5\u4E0D\u80FD\u518D\u8D70 cmd \u4E8C\u6B21\u89E3\u6790\uFF09\u3002\u8BF7\u786E\u4FDD\u5B58\u5728 pnpm.exe\u3001Corepack \u6FC0\u6D3B\u7684 pnpm\uFF0C\u6216\u53EF\u7528 `node` \u76F4\u63A5\u8FD0\u884C\u7684 pnpm.cjs\uFF1B\u53EF\u6267\u884C `corepack enable pnpm` / \u91CD\u88C5 pnpm \u540E\u91CD\u8BD5\u3002 / Could not spawn a real pnpm binary with shell:false (often PATH only has pnpm.cmd). Ensure pnpm.exe, Corepack-enabled pnpm, or node+pnpm.cjs is available \u2014 then retry (`corepack enable pnpm` or reinstall pnpm).";
/**
 * Directories that commonly hold pnpm when GUI/desktop launches omit shell PATH
 * (same spirit as dsh-market toolSearchDirs).
 */
export declare function toolSearchDirs(platform?: string, env?: NodeJS.ProcessEnv, home?: string, nodeDir?: string): string[];
/**
 * Windows `process.env` is case-insensitive (`Path` === `PATH`); spreading it
 * into a plain object is not. Prefer the last existing casing so a later write
 * wins, and default to `Path` on Windows when the key is absent.
 */
export declare function pathKey(env: NodeJS.ProcessEnv, platform?: string): string;
export declare function pathValue(env: NodeJS.ProcessEnv, platform?: string): string;
export interface PnpmDirectSpawn {
    file: string;
    prefix: string[];
}
/**
 * Resolve a real pnpm entrypoint for `shell: false` spawns (`&path:` installs).
 * Prefer `pnpm.exe`, then `node` + absolute `pnpm.cjs` / Corepack script.
 * Never returns a `.cmd`/`.bat` shim — those need the quoted cmd bridge and
 * would reintroduce `&` truncation. Falls back to bare `pnpm` (may ENOENT on
 * Windows when only a shim exists; callers map that to PNPM_DIRECT_SPAWN_ENOENT_HINT).
 */
export declare function resolvePnpmForDirectSpawn(options?: {
    platform?: string;
    env?: NodeJS.ProcessEnv;
    home?: string;
    execPath?: string;
}): PnpmDirectSpawn;
export interface PluginProcess {
    file: string;
    argv: string[];
    cwd?: string;
    viaShell: boolean;
    /** True when spawning pnpm directly for `&`-bearing argv (shell:false). */
    directPnpm?: boolean;
}
/**
 * Choose how to run a profile plugin command.
 *
 * Specs with `&path:` cannot go through `dsh plugin` on Windows: DSH forwards
 * to pnpm with `shell: true`, and cmd.exe splits on `&`. Same policy as
 * dsh-market's TARGET_RE (reject `&` at the dsh boundary); here we keep the
 * pinned `#commit&path:/` form and spawn pnpm ourselves.
 */
export declare function pluginProcess(profile: string, args: readonly string[]): PluginProcess;
/** Quote one argv token before passing it through cmd.exe. */
export declare function quoteCmdArg(arg: string): string;
/** Build the command line used by the explicit Windows cmd.exe bridge. */
export declare function cmdCommandLine(argv: readonly string[]): string;
export declare function createPnpmProvisioner(execute?: CommandExecutor): (options?: CommandOptions) => Promise<void>;
export declare const ensurePnpmAvailable: (options?: CommandOptions) => Promise<void>;
export declare function createPluginCliRunner(registryPlan?: RegistryPlanProvider): PluginRunner;
/**
 * Run the host-published pnpm in a profile directory.
 *
 * The executable is Electron (or the app's own node) plus a pnpm entry, and
 * its environment is the one the host uses for its own package operations, so
 * it is passed through as published. The callback is read per call because a
 * launcher may publish the invocation after this plugin mounts.
 */
export declare function hostPnpmRunner(invocation: () => HostPnpmInvocation | undefined, cwd: string): NonNullable<PluginRunner['hostPnpm']>;
export declare const runPluginCli: PluginRunner;
interface DesktopOperation {
    stdout: NodeJS.ReadableStream;
    stderr: NodeJS.ReadableStream;
    done: Promise<{
        exitCode: number | null;
        signal: NodeJS.Signals | null;
    }>;
    cancel(): void;
}
export interface DesktopPnpmLike {
    runPlugin(args: readonly string[], invokingDir: string, signal?: AbortSignal): DesktopOperation;
    /** Configured registry and ordered fallbacks, when exposed by the host. */
    registries?(): Promise<unknown>;
    /** Hosts that still book a recovery receipt. Absent on Anywhere Labs Desktop 2.x. */
    installPlugin?(request: {
        pnpmOptions?: readonly string[];
        registry?: string | null;
        invokingDir: string;
        recovery: {
            packageName: string;
            packageVersion: string;
            receiptId: string;
        };
        signal?: AbortSignal;
    }): Promise<DesktopOperation>;
    /**
     * Anywhere Labs narrow install boundary. Optional: other desktop hosts keep
     * `installPlugin` or only `runPlugin`. Accepts `add`, flag options, and one
     * exact `name@version`. No receipt, snapshot, or rollback.
     */
    runExternalMarketPluginInstall?(args: readonly string[], invokingDir: string, signal?: AbortSignal): DesktopOperation;
}
/**
 * Desktop host runner. Managed npm installs use `installPlugin` when the host
 * still provides it. Anywhere Labs Desktop 2.x exposes
 * `runExternalMarketPluginInstall` instead: `add`, the caller's flag options,
 * and one exact `name@version`, with no receipt. Other commands stay on
 * `runPlugin`. Neither path is rewritten through `pluginProcess`.
 * GitHub `&path:` one-click harden (direct pnpm + shell:false) applies to the
 * DSH/web `runPluginCli` path; Desktop skins that need `&path:` are typically
 * `manual-only` / not Desktop-managed.
 */
export declare function desktopRunner(service: DesktopPnpmLike, profileDir: string): PluginRunner;
export declare function commandError(result: CommandResult): string;
export {};
