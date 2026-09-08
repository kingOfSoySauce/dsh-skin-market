import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { npmInstallTarget } from './install-source.js';
export { npmInstallTarget, preferredInstallTarget } from './install-source.js';
/** Repo-relative directory for pnpm's `#path:` / `&path:/` selectors. */
export function validSubpath(subpath) {
    if (!/^[A-Za-z0-9_./-]+$/.test(subpath))
        return false;
    return !subpath.split('/').some(seg => seg === '' || seg === '.' || seg === '..');
}
export function normalizeGithubSubpath(subpath) {
    const normalized = subpath.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '');
    if (!validSubpath(normalized))
        throw new Error(`invalid github subpath: ${subpath}`);
    return normalized;
}
/** pnpm git subdirectory selector. Leading slash is required; see pnpm PR #7487. */
export function githubPathQuery(subpath) {
    return `&path:/${normalizeGithubSubpath(subpath)}`;
}
export function githubInstallTarget(repository, commit, subpath) {
    return `github:${repository}#${commit}${subpath === undefined ? '' : githubPathQuery(subpath)}`;
}
export function parseGithubTarget(target) {
    const match = /^github:([^#]+)#([0-9a-f]{40})(?:&path:\/?([A-Za-z0-9._/-]+))?$/i.exec(target);
    if (match === null)
        return null;
    const raw = match[3];
    if (raw === undefined) {
        return { repository: match[1], commit: match[2].toLowerCase() };
    }
    try {
        return { repository: match[1], commit: match[2].toLowerCase(), subpath: normalizeGithubSubpath(raw) };
    }
    catch {
        return null;
    }
}
export function companionAsSkin(skin, companion) {
    const parts = parseGithubTarget(companion.target);
    return {
        ...skin,
        ...(parts === null ? {} : { repo: `https://github.com/${parts.repository}` }),
        package: companion.package,
        rowId: companion.rowId,
        ...(parts?.subpath === undefined ? { subpath: undefined } : { subpath: parts.subpath }),
        install: {
            target: companion.target,
            version: companion.version,
            commit: companion.commit,
        },
    };
}
export function isNpmInstallTarget(skin, target) {
    return npmInstallTarget(skin) === target;
}
function readManifest(file) {
    try {
        return JSON.parse(readFileSync(file, 'utf8'));
    }
    catch {
        return null;
    }
}
function isDirectoryLike(path) {
    try {
        return statSync(path).isDirectory();
    }
    catch {
        return false;
    }
}
function hasDshClient(manifest) {
    return typeof manifest?.dsh?.client === 'object' && manifest.dsh.client !== null;
}
function packageRoots(nodeModules) {
    if (!existsSync(nodeModules))
        return [];
    const roots = [];
    for (const entry of readdirSync(nodeModules, { withFileTypes: true })) {
        if ((!entry.isDirectory() && !entry.isSymbolicLink()) || entry.name === '.bin' || entry.name === '.pnpm')
            continue;
        if (entry.name.startsWith('@')) {
            const scopeDir = join(nodeModules, entry.name);
            for (const child of readdirSync(scopeDir, { withFileTypes: true })) {
                if ((child.isDirectory() || child.isSymbolicLink()) && isDirectoryLike(join(scopeDir, child.name)))
                    roots.push(join(scopeDir, child.name));
            }
        }
        else if (isDirectoryLike(join(nodeModules, entry.name)))
            roots.push(join(nodeModules, entry.name));
    }
    return roots;
}
function findCandidates(root, skin, candidates, depth = 0) {
    if (depth > 8)
        return;
    const manifest = readManifest(join(root, 'package.json'));
    if (typeof manifest?.name === 'string' && manifest.name === skin.package && hasDshClient(manifest)) {
        candidates.push(root);
    }
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === '.git')
            continue;
        findCandidates(join(root, entry.name), skin, candidates, depth + 1);
    }
}
/**
 * Inspect a root GitHub package fetched into a temporary profile. A package
 * collection is only retargeted when exactly one child is the reviewed DSH
 * package; ambiguous collections remain a catalog error instead of guessing.
 */
export function discoverMonorepoTarget(directory, skin, target) {
    const parts = parseGithubTarget(target);
    if (parts === null || parts.subpath !== undefined)
        return null;
    const nodeModules = join(directory, 'node_modules');
    const roots = packageRoots(nodeModules);
    if (roots.length === 0)
        return null;
    const candidates = [];
    for (const root of roots) {
        const rootManifest = readManifest(join(root, 'package.json'));
        if (typeof rootManifest?.name === 'string' && rootManifest.name === skin.package && hasDshClient(rootManifest))
            return null;
        findCandidates(root, skin, candidates);
    }
    const unique = [...new Set(candidates)];
    if (unique.length === 0)
        throw new Error(`GitHub 仓库 ${parts.repository} 未找到可加载的 ${skin.package} 子包，请检查目录中的 package/path 配置`);
    if (unique.length > 1) {
        const paths = unique.map(candidate => relative(roots[0], candidate).split(sep).join('/')).join(', ');
        throw new Error(`GitHub 仓库 ${parts.repository} 找到多个 ${skin.package} 子包（${paths}），请在目录中明确 subpath`);
    }
    const root = roots.find(candidate => unique[0] === candidate || unique[0].startsWith(`${candidate}${sep}`));
    if (root === undefined)
        throw new Error(`无法确定 ${skin.package} 的 monorepo 根目录`);
    const subpath = relative(root, unique[0]).split(sep).join('/');
    if (subpath === '' || subpath.startsWith('../'))
        throw new Error(`无法确定 ${skin.package} 的 monorepo 子路径`);
    return githubInstallTarget(parts.repository, parts.commit, subpath);
}
