const npmFields = ['name', 'version', 'integrity', 'repository', 'gitHead'];
function isRecord(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function npmSource(value, skin) {
    if (!isRecord(value))
        throw new Error(`invalid npm source for ${skin.id}: must be an object`);
    if (Object.keys(value).some(key => !npmFields.includes(key))) {
        throw new Error(`invalid npm source for ${skin.id}: unexpected field`);
    }
    for (const field of npmFields) {
        if (typeof value[field] !== 'string' || value[field].length === 0) {
            throw new Error(`invalid npm ${field} for ${skin.id}`);
        }
    }
    const source = value;
    if (!/^sha(1|256|384|512)-[A-Za-z0-9+/=]+$/.test(source.integrity))
        throw new Error(`invalid npm integrity for ${skin.id}`);
    if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(source.repository))
        throw new Error(`invalid npm repository for ${skin.id}`);
    if (source.name !== skin.package)
        throw new Error(`invalid npm package name for ${skin.id}`);
    if (source.version !== skin.install.version)
        throw new Error(`invalid npm package version for ${skin.id}`);
    if (typeof skin.repo !== 'string' || source.repository.replace(/\/$/, '') !== skin.repo.replace(/\/$/, '')) {
        throw new Error(`invalid npm repository for ${skin.id}`);
    }
    if (!/^[0-9a-f]{40}$/.test(source.gitHead) || typeof skin.install.commit !== 'string' || source.gitHead !== skin.install.commit.toLowerCase()) {
        throw new Error(`invalid npm gitHead for ${skin.id}`);
    }
    return { name: source.name, version: source.version, integrity: source.integrity, repository: source.repository, gitHead: source.gitHead };
}
/**
 * Expand the backwards-compatible wire format without mutating its input.
 * This validates the envelope and all npm metadata; callers still validate the
 * complete skin entries with their existing schema validator afterwards.
 * No Node imports: the website uses the same metadata checks as the plugin.
 */
export function decodeCatalogWire(value) {
    if (!isRecord(value))
        throw new Error('catalog must be an object');
    if (value.schemaVersion !== 1)
        throw new Error('unsupported catalog schema version');
    if (typeof value.generatedAt !== 'string' || !Number.isFinite(Date.parse(value.generatedAt)))
        throw new Error('catalog generatedAt is invalid');
    if (!Array.isArray(value.skins) || value.skins.length > 5000)
        throw new Error('catalog skins must be an array of at most 5000 entries');
    const { npmSources, ...catalog } = value;
    if (Object.hasOwn(value, 'npmSources') && !isRecord(npmSources))
        throw new Error('catalog npmSources must be an object');
    const sources = npmSources;
    const ids = new Set(value.skins.map(skin => isRecord(skin) ? skin.id : undefined));
    for (const id of Object.keys(sources ?? {})) {
        if (!ids.has(id))
            throw new Error(`npm source references unknown skin: ${id}`);
    }
    const skins = value.skins.map(candidate => {
        if (!isRecord(candidate) || !isRecord(candidate.install))
            throw new Error('invalid skin entry: install must be an object');
        const skin = candidate;
        const inline = Object.hasOwn(skin.install, 'npm') ? npmSource(skin.install.npm, skin) : undefined;
        const mapped = sources !== undefined && Object.hasOwn(sources, skin.id) ? npmSource(sources[skin.id], skin) : undefined;
        if (inline !== undefined && mapped !== undefined && npmFields.some(field => inline[field] !== mapped[field])) {
            throw new Error(`conflicting npm sources for ${skin.id}`);
        }
        const npm = mapped ?? inline;
        return { ...skin, install: { ...skin.install, ...(npm === undefined ? {} : { npm }) } };
    });
    return { ...catalog, skins };
}
/** Always serialize npm metadata outside skins[].install, including shared caches. */
export function encodeCatalogWire(catalog) {
    const runtime = decodeCatalogWire(catalog);
    const sources = [];
    const skins = runtime.skins.map(skin => {
        const { npm, ...install } = skin.install;
        if (npm !== undefined)
            sources.push([skin.id, { ...npm }]);
        return { ...skin, install };
    });
    return { ...runtime, skins, ...(sources.length === 0 ? {} : { npmSources: Object.fromEntries(sources) }) };
}
