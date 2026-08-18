import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { parse, stringify } from 'yaml';
export function resolveProfileDir(profile, explicit) {
    if (explicit !== undefined)
        return explicit;
    const base = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh');
    return join(base, 'profiles', profile);
}
export function manifestFile(profileDir) { return join(profileDir, 'package.json'); }
export function profilePatchFile(profileDir) { return join(profileDir, 'cordis.patch.yml'); }
export function pnpmWorkspaceFile(profileDir) { return join(profileDir, 'pnpm-workspace.yaml'); }
export function marketStateFile(profileDir) { return join(profileDir, '.dsh-skin-market', 'state.json'); }
export function readJson(file, fallback) {
    try {
        return JSON.parse(readFileSync(file, 'utf8'));
    }
    catch {
        return fallback;
    }
}
export function atomicWriteJson(file, value) {
    atomicWriteText(file, `${JSON.stringify(value, null, 2)}\n`);
}
export function atomicWriteText(file, value) {
    mkdirSync(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, value);
    renameSync(temporary, file);
}
export function readMarketState(profileDir) {
    const fallback = { version: 1, activeSkinId: null, disabledSkinIds: [] };
    const value = readJson(marketStateFile(profileDir), fallback);
    if (value.version !== 1 || !Array.isArray(value.disabledSkinIds))
        return fallback;
    return value;
}
export function writeMarketState(profileDir, state) {
    atomicWriteJson(marketStateFile(profileDir), state);
}
export function readDependencies(profileDir) {
    return readJson(manifestFile(profileDir), {}).dependencies ?? {};
}
export function readProfileBundles(profileDir) {
    const bundles = readJson(manifestFile(profileDir), {}).dsh?.profile?.bundles;
    return Array.isArray(bundles) ? bundles : [];
}
/** Remove legacy market-promoted bundles; normal registration preserves bundle layers. */
export function removeProfileBundles(profileDir, packageNames) {
    const file = manifestFile(profileDir);
    const manifest = readJson(file, {});
    const bundles = manifest.dsh?.profile?.bundles;
    if (!Array.isArray(bundles))
        return;
    const removed = new Set(packageNames);
    const next = bundles.filter(name => !removed.has(name));
    if (next.length === bundles.length)
        return;
    manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles: next } };
    atomicWriteJson(file, manifest);
}
function packageDir(profileDir, packageName) {
    return join(profileDir, 'node_modules', ...packageName.split('/'));
}
function packageInstalledAt(profileDir, packageName) {
    try {
        return statSync(join(packageDir(profileDir, packageName), 'package.json')).mtime.toISOString();
    }
    catch {
        return null;
    }
}
export function packageManifest(profileDir, packageName) {
    const file = join(packageDir(profileDir, packageName), 'package.json');
    if (!existsSync(file))
        return null;
    return readJson(file, null);
}
export function validateInstalledSkin(profileDir, skin) {
    const manifest = packageManifest(profileDir, skin.package);
    if (manifest === null)
        return { ok: false, reason: 'package manifest missing' };
    const dsh = manifest.dsh;
    if (dsh?.client === undefined)
        return { ok: false, reason: 'dsh client manifest missing' };
    const version = typeof manifest.version === 'string' ? manifest.version : undefined;
    return { ok: true, version };
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function patchOperations(profileDir) {
    const file = profilePatchFile(profileDir);
    if (!existsSync(file))
        return [];
    const value = parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(value))
        throw new Error('profile cordis.patch.yml must contain a YAML sequence');
    return value;
}
function writePatchOperations(profileDir, operations) {
    atomicWriteText(profilePatchFile(profileDir), stringify(operations, { lineWidth: 0 }));
}
function bundlePatchOperations(profileDir, packageName) {
    const manifest = packageManifest(profileDir, packageName);
    const dsh = isRecord(manifest?.dsh) ? manifest.dsh : undefined;
    if (dsh?.bundle === undefined)
        return null;
    if (!isRecord(dsh.bundle) || typeof dsh.bundle.patch !== 'string') {
        throw new Error(`${packageName} declares dsh.bundle without a valid patch path`);
    }
    const file = resolve(packageDir(profileDir, packageName), dsh.bundle.patch);
    if (!existsSync(file))
        throw new Error(`${packageName} bundle patch is missing: ${dsh.bundle.patch}`);
    const value = parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(value))
        throw new Error(`${packageName} cordis.patch.yml must contain a YAML sequence`);
    return value;
}
function registrationMatches(row, skin) {
    return row.id === skin.rowId || row.name === skin.package;
}
function assertRegistrationMatches(row, skin) {
    if (row.id !== skin.rowId || row.name !== skin.package) {
        throw new Error(`loader registration conflicts with ${String(row.id ?? row.name)}`);
    }
}
function declaredBundleRows(value, skin, rows = []) {
    if (!isRecord(value))
        return rows;
    const row = value;
    if (registrationMatches(row, skin))
        rows.push(row);
    if (Array.isArray(value.insert)) {
        for (const child of value.insert)
            declaredBundleRows(child, skin, rows);
    }
    return rows;
}
function removeInsertedRows(values, skin) {
    return values.flatMap(value => {
        if (!isRecord(value))
            return [value];
        const row = value;
        if (registrationMatches(row, skin)) {
            assertRegistrationMatches(row, skin);
            return [];
        }
        if (Array.isArray(value.insert))
            value.insert = removeInsertedRows(value.insert, skin);
        return [value];
    });
}
function removeProfileInsertedRows(operations, skin) {
    for (const operation of operations) {
        if (Array.isArray(operation.insert))
            operation.insert = removeInsertedRows(operation.insert, skin);
    }
}
function removeEmptyInsertOperations(operations) {
    const next = operations.filter(operation => !Array.isArray(operation.insert) || operation.insert.length > 0);
    operations.splice(0, operations.length, ...next);
}
function ensureInsertedRow(operations, skin, disabled) {
    let found = false;
    const retain = (values) => values.flatMap(value => {
        if (!isRecord(value))
            return [value];
        const row = value;
        if (registrationMatches(row, skin)) {
            assertRegistrationMatches(row, skin);
            if (found)
                return [];
            found = true;
            if (disabled)
                row.disabled = true;
            else
                delete row.disabled;
            return [row];
        }
        if (Array.isArray(value.insert))
            value.insert = retain(value.insert);
        return [value];
    });
    for (const operation of operations) {
        if (Array.isArray(operation.insert))
            operation.insert = retain(operation.insert);
    }
    if (!found) {
        const operation = operations.find(item => Array.isArray(item.insert));
        if (operation !== undefined)
            operation.insert.push({ id: skin.rowId, name: skin.package, ...(disabled ? { disabled: true } : {}) });
        else
            operations.push({ insert: [{ id: skin.rowId, name: skin.package, ...(disabled ? { disabled: true } : {}) }] });
    }
}
function removeProfileOverrides(operations, skin) {
    const next = operations.filter(operation => {
        if (!isRecord(operation) || operation.id !== skin.rowId)
            return true;
        if (operation.name !== undefined && operation.name !== skin.package) {
            throw new Error(`loader registration conflicts with ${String(operation.id ?? operation.name)}`);
        }
        return false;
    });
    operations.splice(0, operations.length, ...next);
}
function ensureProfileOverride(operations, skin, disabled) {
    let found = false;
    const next = operations.filter(operation => {
        if (!isRecord(operation) || operation.id !== skin.rowId)
            return true;
        if (operation.name !== undefined && operation.name !== skin.package) {
            throw new Error(`loader registration conflicts with ${String(operation.id ?? operation.name)}`);
        }
        if (found)
            return false;
        found = true;
        if (disabled)
            operation.disabled = true;
        else
            delete operation.disabled;
        return disabled || Object.keys(operation).some(key => key !== 'id' && key !== 'name');
    });
    operations.splice(0, operations.length, ...next);
    if (!found && disabled)
        operations.push({ id: skin.rowId, disabled: true });
}
function ensureProfileBundle(profileDir, packageName) {
    const file = manifestFile(profileDir);
    const manifest = readJson(file, {});
    const bundles = manifest.dsh?.profile?.bundles;
    if (Array.isArray(bundles) && bundles.includes(packageName))
        return;
    manifest.dsh = {
        ...manifest.dsh,
        profile: { ...manifest.dsh?.profile, bundles: [...(Array.isArray(bundles) ? bundles : []), packageName] },
    };
    atomicWriteJson(file, manifest);
}
export function ensureBuildAllowed(profileDir, key) {
    const file = pnpmWorkspaceFile(profileDir);
    const parsed = existsSync(file) ? parse(readFileSync(file, 'utf8')) : {};
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        throw new Error('profile pnpm-workspace.yaml must contain a YAML mapping');
    const workspace = parsed;
    const allowBuilds = typeof workspace.allowBuilds === 'object' && workspace.allowBuilds !== null && !Array.isArray(workspace.allowBuilds)
        ? workspace.allowBuilds
        : {};
    allowBuilds[key] = true;
    workspace.allowBuilds = allowBuilds;
    atomicWriteText(file, stringify(workspace, { lineWidth: 0 }));
}
export function ensureSkinRegistration(profileDir, skin, disabled = true) {
    const bundle = bundlePatchOperations(profileDir, skin.package);
    const operations = patchOperations(profileDir);
    const selfDeclared = bundle !== null && bundle.some(operation => declaredBundleRows(operation, skin).length > 0);
    if (selfDeclared) {
        // The bundle owns the loader row. The profile layer only overrides it.
        removeProfileInsertedRows(operations, skin);
        removeEmptyInsertOperations(operations);
        ensureProfileOverride(operations, skin, disabled);
    }
    else {
        // Client-only plugins, and bundles that do not declare this row, need a
        // profile-level insert. Remove stale overrides from older market versions.
        removeProfileOverrides(operations, skin);
        ensureInsertedRow(operations, skin, disabled);
    }
    writePatchOperations(profileDir, operations);
    if (bundle !== null)
        ensureProfileBundle(profileDir, skin.package);
    else
        removeProfileBundles(profileDir, [skin.package]);
}
export function removeSkinRegistration(profileDir, skin) {
    const file = profilePatchFile(profileDir);
    if (!existsSync(file))
        return;
    const operations = patchOperations(profileDir);
    removeProfileInsertedRows(operations, skin);
    removeEmptyInsertOperations(operations);
    removeProfileOverrides(operations, skin);
    writePatchOperations(profileDir, operations);
}
export function installedClientPlugins(profileDir, catalog) {
    const catalogPackages = new Set(catalog.map(skin => skin.package));
    const rows = patchOperations(profileDir)
        .flatMap(operation => operation.insert ?? [])
        .filter((value) => typeof value === 'object' && value !== null);
    return Object.entries(readDependencies(profileDir)).flatMap(([packageName, spec]) => {
        if (catalogPackages.has(packageName) || packageName === 'dsh-skin-market')
            return [];
        const manifest = packageManifest(profileDir, packageName);
        const dsh = manifest?.dsh;
        if (dsh?.client === undefined)
            return [];
        const matchingRows = rows.filter(row => row.name === packageName);
        return [{
                package: packageName,
                version: typeof manifest?.version === 'string' ? manifest.version : null,
                spec,
                rowIds: matchingRows.flatMap(row => typeof row.id === 'string' ? [row.id] : []),
                registered: matchingRows.length > 0,
            }];
    }).sort((a, b) => a.package.localeCompare(b.package));
}
export function snapshotFile(file) {
    return existsSync(file) ? { existed: true, contents: readFileSync(file, 'utf8') } : { existed: false, contents: '' };
}
export function restoreFile(file, snapshot) {
    if (snapshot.existed)
        writeFileSync(file, snapshot.contents);
    else if (existsSync(file))
        unlinkSync(file);
}
export function snapshotManifest(profileDir) { return snapshotFile(manifestFile(profileDir)); }
export function restoreManifest(profileDir, snapshot) { restoreFile(manifestFile(profileDir), snapshot); }
export function runtimeState(profileDir, skin, activeSkinId, loaderLive, loaderFound) {
    const dependencies = readDependencies(profileDir);
    const spec = dependencies[skin.package] ?? null;
    if (spec === null) {
        return { skinId: skin.id, installation: 'missing', activation: 'inactive', installedVersion: null, installedSpec: null, installedAt: null, updateAvailable: false };
    }
    const installedAt = packageInstalledAt(profileDir, skin.package);
    const validation = validateInstalledSkin(profileDir, skin);
    if (!validation.ok) {
        return { skinId: skin.id, installation: 'broken', activation: 'inactive', installedVersion: null, installedSpec: spec, installedAt, updateAvailable: false, error: validation.reason };
    }
    const active = activeSkinId === skin.id;
    const activation = active ? (loaderFound ? (loaderLive ? 'active' : 'restart-required') : 'restart-required') : 'inactive';
    const updateAvailable = validation.version !== skin.install.version || !spec.includes(skin.install.commit);
    return {
        skinId: skin.id,
        installation: 'installed',
        activation,
        installedVersion: validation.version ?? null,
        installedSpec: spec,
        installedAt,
        updateAvailable,
    };
}
