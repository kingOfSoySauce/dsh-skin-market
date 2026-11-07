import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';
import { pnpmLockfile, readDependencies, restoreFile, restoreManifest, snapshotFile } from './profile.js';
const DEFAULT_PROBE_TIMEOUT_MS = 15_000;
const DEFAULT_CONCURRENCY = 6;
const DEFAULT_INSTALL_TIMEOUT_MS = 30 * 60 * 1000;
const MARKET_PACKAGE = 'dsh-skin-market';
const GITHUB_SPEC = /^github:([^#]+)#([0-9a-f]{40})(?:&path:(\/?[A-Za-z0-9._/-]+))?$/i;
export function resolveRepairProfileDir(profile, options = {}) {
    if (options.profileDir !== undefined && options.profileDir !== '')
        return options.profileDir;
    const home = options.dshHome ?? process.env.DSH_HOME ?? join(homedir(), '.dsh');
    return join(home, 'profiles', profile);
}
export function parseGitDependency(packageName, spec) {
    const match = GITHUB_SPEC.exec(spec.trim());
    if (match === null)
        return null;
    return {
        packageName,
        spec: spec.trim(),
        repository: match[1],
        commit: match[2].toLowerCase(),
        ...(match[3] === undefined ? {} : { subpath: match[3] }),
        url: `https://codeload.github.com/${match[1]}/tar.gz/${match[2].toLowerCase()}`,
    };
}
export function extractGitDependencies(dependencies) {
    return Object.entries(dependencies).flatMap(([packageName, spec]) => {
        const dependency = parseGitDependency(packageName, spec);
        return dependency === null ? [] : [dependency];
    });
}
/** Specifiers recorded in pnpm-lock.yaml's root importer, if the lockfile can be read. */
export function readLockfileSpecifiers(profileDir) {
    const file = pnpmLockfile(profileDir);
    if (!existsSync(file))
        return null;
    try {
        const lock = parse(readFileSync(file, 'utf8'));
        if (typeof lock !== 'object' || lock === null)
            return null;
        const importers = lock.importers;
        if (typeof importers !== 'object' || importers === null)
            return null;
        const root = importers['.'] ?? Object.values(importers)[0];
        if (typeof root !== 'object' || root === null)
            return null;
        const dependencies = root.dependencies;
        if (typeof dependencies !== 'object' || dependencies === null)
            return {};
        const specifiers = {};
        for (const [name, entry] of Object.entries(dependencies)) {
            if (typeof entry !== 'object' || entry === null)
                continue;
            const specifier = entry.specifier;
            if (typeof specifier === 'string')
                specifiers[name] = specifier;
        }
        return specifiers;
    }
    catch {
        return null;
    }
}
/** Every root dependency whose manifest specifier does not match the lockfile. */
export function inspectLockfileDrift(profileDir) {
    const manifest = readDependencies(profileDir);
    const specifiers = readLockfileSpecifiers(profileDir);
    if (specifiers === null)
        return [];
    const names = new Set([...Object.keys(manifest), ...Object.keys(specifiers)]);
    const drift = [];
    for (const name of [...names].sort()) {
        const manifestSpec = Object.hasOwn(manifest, name) ? manifest[name] : null;
        const lockfileSpec = Object.hasOwn(specifiers, name) ? specifiers[name] : null;
        if (manifestSpec === lockfileSpec)
            continue;
        drift.push({ packageName: name, manifestSpec, lockfileSpec });
    }
    return drift;
}
function installedMarketVersion(profileDir) {
    try {
        const manifest = JSON.parse(readFileSync(join(profileDir, 'node_modules', MARKET_PACKAGE, 'package.json'), 'utf8'));
        return typeof manifest.version === 'string' ? manifest.version : null;
    }
    catch {
        return null;
    }
}
function materializedDependencies(profileDir, dependencies) {
    return Object.keys(dependencies).filter(name => existsSync(join(profileDir, 'node_modules', name, 'package.json')));
}
function pnpmPackageManager(profileDir) {
    try {
        const modules = JSON.parse(readFileSync(join(profileDir, 'node_modules', '.modules.yaml'), 'utf8'));
        return typeof modules.packageManager === 'string' ? modules.packageManager : null;
    }
    catch {
        return null;
    }
}
async function probe(url, fetchImpl, timeoutMs) {
    try {
        const response = await fetchImpl(url, { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs) });
        if (response.status === 200 || response.status === 204 || response.status === 302)
            return { status: 'reachable', httpStatus: response.status };
        if (response.status === 404 || response.status === 410)
            return { status: 'missing', httpStatus: response.status };
        return { status: 'unknown', httpStatus: response.status };
    }
    catch (error) {
        return {
            status: 'unknown',
            ...(error instanceof Error && error.name === 'TimeoutError' ? { error: 'timeout' } : {}),
            ...(error instanceof Error && error.name !== 'TimeoutError' ? { error: error.message } : {}),
        };
    }
}
async function probeAll(dependencies, options) {
    const probes = new Map();
    let next = 0;
    const worker = async () => {
        while (next < dependencies.length) {
            const dependency = dependencies[next++];
            probes.set(dependency.packageName, await probe(dependency.url, options.fetchImpl, options.timeoutMs));
        }
    };
    await Promise.all(Array.from({ length: Math.min(options.concurrency, dependencies.length) }, worker));
    return probes;
}
export async function inspectProfileRepair(profileDir, options = {}) {
    const manifestFile = join(profileDir, 'package.json');
    if (!existsSync(manifestFile))
        throw new Error(`profile manifest not found: ${manifestFile}`);
    const dependencies = readDependencies(profileDir);
    const gitDependencies = extractGitDependencies(dependencies);
    const probes = await probeAll(gitDependencies, {
        fetchImpl: options.fetchImpl ?? ((url, init) => fetch(url, init)),
        timeoutMs: options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
        concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
    });
    const states = gitDependencies.map(dependency => ({ ...dependency, probe: probes.get(dependency.packageName) ?? { status: 'unknown' } }));
    return {
        profileDir,
        manifestFile,
        lockfileFile: pnpmLockfile(profileDir),
        dependencies: Object.keys(dependencies).length,
        gitDependencies: gitDependencies.length,
        install: {
            packageName: MARKET_PACKAGE,
            declaredSpec: Object.hasOwn(dependencies, MARKET_PACKAGE) ? dependencies[MARKET_PACKAGE] : null,
            installedVersion: installedMarketVersion(profileDir),
        },
        pnpmPackageManager: pnpmPackageManager(profileDir),
        nodeModulesPresent: existsSync(join(profileDir, 'node_modules')),
        materialized: materializedDependencies(profileDir, dependencies),
        reachable: states.filter(state => state.probe.status === 'reachable').length,
        unreachable: states.filter(state => state.probe.status === 'missing'),
        unknown: states.filter(state => state.probe.status === 'unknown'),
        drift: inspectLockfileDrift(profileDir),
    };
}
const GITHUB_INSTALL_TARGET = /^github:[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+#[0-9a-f]{40}(?:&path:\/?[A-Za-z0-9._/-]+)?$/i;
const NPM_EXACT_TARGET = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
export function normalizeMigrationTarget(value) {
    const target = value.trim();
    return GITHUB_INSTALL_TARGET.test(target) || NPM_EXACT_TARGET.test(target) ? target : null;
}
function npmTargetVersion(target) {
    const match = /@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/.exec(target);
    return match?.[1] ?? null;
}
/** pnpm package.json values are versions, npm: aliases, or github: specs. A reviewed `name@version` target is not itself a legal specifier. */
function migrationManifestSpec(packageName, target) {
    const version = npmTargetVersion(target);
    if (version === null)
        return target;
    const name = target.slice(0, target.length - version.length - 1);
    return name === packageName ? version : `npm:${target}`;
}
export function planProfileRepair(inspection, options = {}) {
    const keep = [...new Set(options.keep ?? [])];
    const migrate = [];
    for (const [packageName, value] of Object.entries(options.migrate ?? {})) {
        const dependency = inspection.unreachable.find(item => item.packageName === packageName);
        if (dependency === undefined)
            throw new Error(`--migrate ${packageName}: not an unreachable dependency in this profile`);
        if (keep.includes(packageName))
            throw new Error(`--migrate ${packageName}: cannot both keep and migrate the same dependency`);
        const target = normalizeMigrationTarget(value);
        if (target === null)
            throw new Error(`--migrate ${packageName}: target must be a full pinned github:owner/repo#<40-hex commit> or an exact name@version`);
        migrate.push({ packageName, target });
    }
    const migrated = new Set(migrate.map(item => item.packageName));
    const remove = inspection.unreachable.filter(dependency => !keep.includes(dependency.packageName) && !migrated.has(dependency.packageName));
    const kept = inspection.unreachable.filter(dependency => keep.includes(dependency.packageName)).map(dependency => dependency.packageName);
    const runInstall = remove.length > 0 || migrate.length > 0 || (options.reconcile === true && inspection.drift.length > 0);
    const plan = {
        remove,
        migrate,
        keep: kept,
        ignoredUnknown: inspection.unknown.map(dependency => dependency.packageName),
        runInstall,
    };
    if (!runInstall) {
        plan.reason = kept.length > 0 && inspection.unknown.length === 0 && inspection.drift.length === 0
            ? 'kept-unreachable-only'
            : inspection.unknown.length > 0
                ? 'unknown-sources-only'
                : inspection.drift.length > 0 ? 'lockfile-drift-only' : 'nothing-to-repair';
    }
    return plan;
}
function detectIndent(text) {
    const match = /\n([ \t]+)"/.exec(text);
    return match?.[1] ?? '  ';
}
function writeManifest(profileDir, dependencies) {
    const file = join(profileDir, 'package.json');
    const text = readFileSync(file, 'utf8');
    const manifest = JSON.parse(text);
    manifest.dependencies = dependencies;
    writeFileSync(file, `${JSON.stringify(manifest, null, detectIndent(text))}\n`);
}
export function defaultRepairRunner(pnpmCommand = 'pnpm') {
    return (args, options) => new Promise(resolvePromise => {
        const child = spawn(pnpmCommand, [...args], { cwd: options.cwd, stdio: 'inherit', env: process.env });
        const timer = setTimeout(() => {
            child.kill('SIGTERM');
            setTimeout(() => child.kill('SIGKILL'), 5_000).unref?.();
        }, options.timeoutMs);
        timer.unref?.();
        child.on('error', () => {
            clearTimeout(timer);
            resolvePromise({ exitCode: null });
        });
        child.on('close', exitCode => {
            clearTimeout(timer);
            resolvePromise({ exitCode });
        });
    });
}
const INSTALL_ARGS = ['install', '--no-frozen-lockfile', '--prefer-offline'];
function writeBackup(profileDir, inspection, plan, options) {
    const stamp = (options.now ?? new Date()).toISOString().replace(/[:.]/g, '-');
    const dir = join(options.backupsRoot ?? join(profileDir, '.dsh-skin-market', 'backups'), `repair-${stamp}`);
    mkdirSync(dir, { recursive: true });
    const manifest = snapshotFile(join(profileDir, 'package.json'));
    const lockfile = snapshotFile(pnpmLockfile(profileDir));
    if (manifest.existed)
        writeFileSync(join(dir, 'package.json'), manifest.contents);
    if (lockfile.existed)
        writeFileSync(join(dir, 'pnpm-lock.yaml'), lockfile.contents);
    writeFileSync(join(dir, 'repair.json'), `${JSON.stringify({
        createdAt: new Date().toISOString(),
        profileDir,
        remove: plan.remove.map(({ packageName, spec, repository, commit }) => ({ packageName, spec, repository, commit })),
        migrate: plan.migrate,
        keep: plan.keep,
        driftBefore: inspection.drift,
        marketVersionBefore: inspection.install.installedVersion,
        pnpmPackageManager: inspection.pnpmPackageManager,
    }, null, 2)}\n`);
    return { dir, manifest, lockfile };
}
function restoreBackup(profileDir, backup) {
    restoreManifest(profileDir, backup.manifest);
    restoreFile(pnpmLockfile(profileDir), backup.lockfile);
}
function verifyRepair(profileDir, before, plan) {
    const problems = [];
    const dependencies = readDependencies(profileDir);
    for (const dependency of plan.remove) {
        if (Object.hasOwn(dependencies, dependency.packageName))
            problems.push(`${dependency.packageName} is still declared in package.json`);
    }
    for (const migration of plan.migrate) {
        const spec = migrationManifestSpec(migration.packageName, migration.target);
        if (dependencies[migration.packageName] !== spec)
            problems.push(`${migration.packageName} was not migrated to ${spec}`);
        if (!existsSync(join(profileDir, 'node_modules', migration.packageName, 'package.json'))) {
            problems.push(`migrated dependency ${migration.packageName} is missing from node_modules`);
            continue;
        }
        const version = npmTargetVersion(migration.target);
        if (version !== null) {
            try {
                const installed = JSON.parse(readFileSync(join(profileDir, 'node_modules', migration.packageName, 'package.json'), 'utf8'));
                if (installed.version !== version)
                    problems.push(`migrated dependency ${migration.packageName} is ${String(installed.version)} instead of ${version}`);
            }
            catch {
                problems.push(`migrated dependency ${migration.packageName} has an unreadable package.json`);
            }
        }
    }
    const drift = inspectLockfileDrift(profileDir);
    if (drift.length > 0) {
        problems.push(`package.json and pnpm-lock.yaml still disagree for: ${drift.map(entry => entry.packageName).join(', ')}`);
    }
    if (before.nodeModulesPresent) {
        const removed = new Set(plan.remove.map(dependency => dependency.packageName));
        for (const packageName of before.materialized) {
            if (removed.has(packageName))
                continue;
            if (!existsSync(join(profileDir, 'node_modules', packageName, 'package.json'))) {
                problems.push(`installed dependency ${packageName} is missing from node_modules`);
            }
        }
        const marketVersion = installedMarketVersion(profileDir);
        if (before.install.installedVersion !== null && marketVersion !== before.install.installedVersion) {
            problems.push(`dsh-skin-market changed from ${before.install.installedVersion} to ${marketVersion ?? 'nothing'}`);
        }
    }
    return { ok: problems.length === 0, problems };
}
export async function applyProfileRepair(profileDir, inspection, plan, options = {}) {
    const removed = plan.remove.map(dependency => dependency.packageName);
    const migrated = plan.migrate.map(migration => ({ ...migration }));
    if (!plan.runInstall)
        return { status: 'noop', removed: [], migrated: [], kept: plan.keep };
    const runner = options.runner ?? defaultRepairRunner();
    const timeoutMs = options.timeoutMs ?? DEFAULT_INSTALL_TIMEOUT_MS;
    let backup;
    try {
        backup = writeBackup(profileDir, inspection, plan, options);
    }
    catch (error) {
        return { status: 'failed', removed, migrated, kept: plan.keep, stage: 'backup', error: error instanceof Error ? error.message : String(error) };
    }
    try {
        if (plan.remove.length > 0 || plan.migrate.length > 0) {
            const dependencies = readDependencies(profileDir);
            for (const dependency of plan.remove)
                delete dependencies[dependency.packageName];
            for (const migration of plan.migrate)
                dependencies[migration.packageName] = migrationManifestSpec(migration.packageName, migration.target);
            writeManifest(profileDir, dependencies);
        }
    }
    catch (error) {
        restoreBackup(profileDir, backup);
        return { status: 'failed', backupDir: backup.dir, removed, migrated, kept: plan.keep, stage: 'manifest', error: error instanceof Error ? error.message : String(error) };
    }
    const result = await runner(INSTALL_ARGS, { cwd: profileDir, timeoutMs });
    if (result.exitCode !== 0) {
        restoreBackup(profileDir, backup);
        await runner(['install', '--frozen-lockfile', '--prefer-offline'], { cwd: profileDir, timeoutMs }).catch(() => undefined);
        return {
            status: 'failed',
            backupDir: backup.dir,
            removed,
            migrated,
            kept: plan.keep,
            stage: 'install',
            error: result.timedOut === true
                ? 'pnpm install timed out; the pre-repair package.json and pnpm-lock.yaml were restored'
                : `pnpm install exited ${String(result.exitCode)}; the pre-repair package.json and pnpm-lock.yaml were restored`,
        };
    }
    const verify = verifyRepair(profileDir, inspection, plan);
    if (!verify.ok) {
        restoreBackup(profileDir, backup);
        await runner(['install', '--frozen-lockfile', '--prefer-offline'], { cwd: profileDir, timeoutMs }).catch(() => undefined);
        return { status: 'failed', backupDir: backup.dir, removed, migrated, kept: plan.keep, stage: 'verify', verify, error: verify.problems.join('; ') };
    }
    return { status: 'applied', backupDir: backup.dir, removed, migrated, kept: plan.keep, verify };
}
export async function rollbackProfileRepair(profileDir, backupDir, options = {}) {
    try {
        const manifest = snapshotFile(join(backupDir, 'package.json'));
        const lockfile = snapshotFile(join(backupDir, 'pnpm-lock.yaml'));
        if (!manifest.existed)
            throw new Error(`backup has no package.json: ${backupDir}`);
        restoreManifest(profileDir, manifest);
        restoreFile(pnpmLockfile(profileDir), lockfile);
    }
    catch (error) {
        return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
    const runner = options.runner ?? defaultRepairRunner();
    const result = await runner(['install', '--frozen-lockfile', '--prefer-offline'], { cwd: profileDir, timeoutMs: options.timeoutMs ?? DEFAULT_INSTALL_TIMEOUT_MS });
    if (result.exitCode === 0)
        return { status: 'rolled-back' };
    return { status: 'restored-needs-install', error: `package.json and pnpm-lock.yaml were restored, but pnpm install exited ${String(result.exitCode)}` };
}
export function formatInspection(inspection) {
    const lines = [];
    lines.push(`profile: ${inspection.profileDir}`);
    lines.push(`dependencies: ${inspection.dependencies} (git: ${inspection.gitDependencies}, reachable: ${inspection.reachable}, missing: ${inspection.unreachable.length}, unknown: ${inspection.unknown.length})`);
    lines.push(`dsh-skin-market: installed ${inspection.install.installedVersion ?? 'unknown'} · declared ${inspection.install.declaredSpec ?? 'missing'}${inspection.pnpmPackageManager === null ? '' : ` · profile pnpm ${inspection.pnpmPackageManager}`}`);
    if (inspection.unreachable.length > 0) {
        lines.push('');
        lines.push('unreachable installed dependencies (these block every pnpm operation in this profile):');
        for (const dependency of inspection.unreachable)
            lines.push(`- ${dependency.packageName} <- ${dependency.repository}#${dependency.commit.slice(0, 12)} (HTTP ${dependency.probe.httpStatus ?? '404'})`);
    }
    if (inspection.unknown.length > 0) {
        lines.push('');
        lines.push('sources that did not answer a definitive 404 (not removed automatically; review these):');
        for (const dependency of inspection.unknown)
            lines.push(`- ${dependency.packageName} <- ${dependency.repository} (${dependency.probe.error ?? `HTTP ${String(dependency.probe.httpStatus)}`})`);
    }
    if (inspection.drift.length > 0) {
        lines.push('');
        lines.push('package.json / pnpm-lock.yaml disagreement:');
        for (const entry of inspection.drift) {
            lines.push(`- ${entry.packageName}`);
            lines.push(`    package.json: ${entry.manifestSpec ?? '(absent)'}`);
            lines.push(`    pnpm-lock:    ${entry.lockfileSpec ?? '(absent)'}`);
        }
    }
    return lines.join('\n');
}
export function formatPlan(plan) {
    const lines = [];
    if (plan.remove.length === 0 && !plan.runInstall) {
        lines.push('plan: nothing to repair');
        if (plan.reason === 'kept-unreachable-only')
            lines.push('the unreachable dependencies are kept by explicit request');
        if (plan.reason === 'unknown-sources-only')
            lines.push('some sources are unknown; run again when the network is available before deciding');
        if (plan.reason === 'lockfile-drift-only')
            lines.push('only a lockfile drift was found; keep the dead dependencies out of scope, or pass --reconcile to repair it with pnpm');
        return lines.join('\n');
    }
    lines.push('plan:');
    if (plan.remove.length > 0) {
        lines.push(`- remove ${plan.remove.length} unreachable dependency(ies): ${plan.remove.map(dependency => dependency.packageName).join(', ')}`);
    }
    if (plan.migrate.length > 0) {
        lines.push(`- migrate ${plan.migrate.length} dependency(ies): ${plan.migrate.map(migration => `${migration.packageName} -> ${migration.target}`).join(', ')}`);
    }
    if (plan.keep.length > 0)
        lines.push(`- keep (explicitly requested): ${plan.keep.join(', ')}`);
    if (plan.ignoredUnknown.length > 0)
        lines.push(`- leave unknown sources untouched: ${plan.ignoredUnknown.join(', ')}`);
    if (plan.runInstall)
        lines.push('- run: pnpm install --no-frozen-lockfile --prefer-offline');
    return lines.join('\n');
}
