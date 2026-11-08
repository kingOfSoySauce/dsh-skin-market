/** Machine reasons that mean "npm is unavailable", not "the GitHub pin is unsafe". */
const GITHUB_FALLBACK_REASONS = new Set([
    'npm-package-not-found',
    'npm-package-deprecated',
    'npm-registry-unavailable',
    'npm-repository-mismatch',
    'npm-version-mismatch',
    'npm-version-not-stable',
    'npm-source-unverified',
]);
const PUBLICATION_HOOKS = new Set(['prepack', 'postpack', 'prepublishOnly']);
/** Curator prose and known-defect reasons stay manual; npm fallback codes may use GitHub. */
function allowsGithubFallback(skin) {
    const capability = skin.install.desktop;
    const reason = capability?.mode === 'manual-only' ? capability.reason : undefined;
    if (reason === undefined || reason === '')
        return true;
    if (GITHUB_FALLBACK_REASONS.has(reason))
        return true;
    if (!reason.startsWith('npm-lifecycle-scripts:'))
        return false;
    const hooks = reason.slice('npm-lifecycle-scripts:'.length).split(',');
    return hooks.length > 0 && hooks.every((hook) => PUBLICATION_HOOKS.has(hook));
}
/** Browser-safe policy shared by the market UI and the Host lifecycle. */
export function desktopInstallPlan(skin, official, allowUnverified = false) {
    const capability = skin.install.desktop;
    if (capability?.mode === 'managed') {
        if (capability.packageName !== skin.package || capability.packageVersion !== skin.install.version) {
            return { kind: 'manual', reason: 'Desktop 安装元数据与皮肤固定版本不一致' };
        }
        return { kind: 'npm', target: `${capability.packageName}@${capability.packageVersion}` };
    }
    if (!official)
        return { kind: 'manual', reason: capability?.reason ?? '当前桌面宿主仅支持已验证的 npm 安装包' };
    return desktopGithubInstallPlan(skin, allowUnverified);
}
/** Also used when updating an existing GitHub source, even if npm is now available. */
export function desktopGithubInstallPlan(skin, allowUnverified = false) {
    if (skin.review?.installation !== 'verified' && (!allowUnverified || !allowsGithubFallback(skin))) {
        return { kind: 'manual', reason: 'GitHub 安装来源尚未通过市场核验' };
    }
    if ((skin.install.companions?.length ?? 0) > 0)
        return { kind: 'manual', reason: '此皮肤需要一起安装伴随插件' };
    if (skin.install.allowBuild !== undefined)
        return { kind: 'manual', reason: '此皮肤需要按仓库说明批准 GitHub 构建项' };
    const repository = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/.exec(skin.repo)?.[1];
    const { commit } = skin.install;
    const path = skin.subpath;
    if (repository === undefined || repository.split('/').some(part => part === '.' || part === '..') || !/^[0-9a-f]{40}$/.test(commit)
        || path !== undefined && (!/^[A-Za-z0-9_./-]+$/.test(path) || path.split('/').some(part => part === '' || part === '.' || part === '..'))) {
        return { kind: 'manual', reason: 'GitHub 安装目标缺少有效的固定 commit 或子目录' };
    }
    const target = `github:${repository}#${commit}${path === undefined ? '' : `&path:/${path}`}`;
    if (skin.install.target !== target)
        return { kind: 'manual', reason: 'GitHub 安装目标与市场固定仓库、commit 或子目录不一致' };
    return { kind: 'github', target };
}
/** Present only when the market may offer a warned GitHub install. */
export function desktopInstallationWarning(skin, official) {
    if (!official || skin.review?.installation === 'verified')
        return undefined;
    return desktopInstallPlan(skin, official, true).kind === 'github' ? 'GitHub 安装来源尚未通过市场核验' : undefined;
}
