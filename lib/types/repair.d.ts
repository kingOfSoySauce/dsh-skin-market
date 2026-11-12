/**
 * External profile repair for a DSH profile that can no longer run any pnpm
 * operation. The market itself cannot repair such a profile from inside DSH:
 * every add/remove/install re-resolves the whole manifest, and one unreachable
 * git dependency blocks those operations. This module is deliberately separate
 * from the in-DSH lifecycle: it edits the profile only while DSH is stopped,
 * backs up every file it touches, and verifies the result with pnpm itself.
 */
export interface GitDependency {
    packageName: string;
    spec: string;
    repository: string;
    commit: string;
    subpath?: string;
    url: string;
}
export type SourceProbeStatus = 'reachable' | 'missing' | 'unknown';
export interface SourceProbe {
    status: SourceProbeStatus;
    httpStatus?: number;
    error?: string;
}
export interface GitDependencyState extends GitDependency {
    probe: SourceProbe;
}
export interface LockfileDriftEntry {
    packageName: string;
    manifestSpec: string | null;
    lockfileSpec: string | null;
}
export interface ProfileInstallState {
    packageName: string;
    declaredSpec: string | null;
    installedVersion: string | null;
}
export interface RepairInspection {
    profileDir: string;
    manifestFile: string;
    lockfileFile: string;
    dependencies: number;
    gitDependencies: number;
    install: ProfileInstallState;
    pnpmPackageManager: string | null;
    nodeModulesPresent: boolean;
    materialized: string[];
    reachable: number;
    unreachable: GitDependencyState[];
    unknown: GitDependencyState[];
    drift: LockfileDriftEntry[];
}
export interface RepairMigration {
    packageName: string;
    target: string;
}
export interface RepairPlan {
    remove: GitDependency[];
    migrate: RepairMigration[];
    keep: string[];
    ignoredUnknown: string[];
    runInstall: boolean;
    /** Set when there is something to repair but the caller did not opt in. */
    reason?: 'nothing-to-repair' | 'unknown-sources-only' | 'kept-unreachable-only' | 'lockfile-drift-only';
}
export interface RepairRunnerOptions {
    cwd: string;
    timeoutMs: number;
}
export interface RepairRunnerResult {
    exitCode: number | null;
    timedOut?: boolean;
}
export type RepairRunner = (args: readonly string[], options: RepairRunnerOptions) => Promise<RepairRunnerResult>;
export interface RepairApplyOptions {
    runner?: RepairRunner;
    timeoutMs?: number;
    now?: Date;
    backupsRoot?: string;
}
export interface RepairVerifyResult {
    ok: boolean;
    problems: string[];
}
export interface RepairApplyResult {
    status: 'applied' | 'noop' | 'failed';
    backupDir?: string;
    removed: string[];
    migrated: Array<{
        packageName: string;
        target: string;
    }>;
    kept: string[];
    verify?: RepairVerifyResult;
    stage?: 'backup' | 'manifest' | 'install' | 'verify' | 'restore';
    error?: string;
}
export interface RepairRollbackResult {
    status: 'rolled-back' | 'restored-needs-install' | 'failed';
    error?: string;
}
export type ProbeFetch = (url: string, init: {
    method: 'HEAD';
    signal?: AbortSignal;
}) => Promise<{
    status: number;
}>;
export declare function resolveRepairProfileDir(profile: string, options?: {
    profileDir?: string;
    dshHome?: string;
}): string;
export declare function parseGitDependency(packageName: string, spec: string): GitDependency | null;
export declare function extractGitDependencies(dependencies: Record<string, string>): GitDependency[];
/** Specifiers recorded in pnpm-lock.yaml's root importer, if the lockfile can be read. */
export declare function readLockfileSpecifiers(profileDir: string): Record<string, string> | null;
/** Every root dependency whose manifest specifier does not match the lockfile. */
export declare function inspectLockfileDrift(profileDir: string): LockfileDriftEntry[];
export interface InspectRepairOptions {
    fetchImpl?: ProbeFetch;
    timeoutMs?: number;
    concurrency?: number;
}
export declare function inspectProfileRepair(profileDir: string, options?: InspectRepairOptions): Promise<RepairInspection>;
export interface PlanRepairOptions {
    keep?: readonly string[];
    reconcile?: boolean;
    /** Replace an unreachable dependency's spec with a reviewed target instead of removing it. */
    migrate?: Readonly<Record<string, string>>;
}
export declare function normalizeMigrationTarget(value: string): string | null;
export declare function planProfileRepair(inspection: RepairInspection, options?: PlanRepairOptions): RepairPlan;
export declare function defaultRepairRunner(pnpmCommand?: string): RepairRunner;
export declare function applyProfileRepair(profileDir: string, inspection: RepairInspection, plan: RepairPlan, options?: RepairApplyOptions): Promise<RepairApplyResult>;
export declare function rollbackProfileRepair(profileDir: string, backupDir: string, options?: RepairApplyOptions): Promise<RepairRollbackResult>;
export declare function formatInspection(inspection: RepairInspection): string;
export declare function formatPlan(plan: RepairPlan): string;
