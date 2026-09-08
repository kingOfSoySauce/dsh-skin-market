export function npmInstallTarget(skin) {
    const npm = skin.install.npm;
    return npm === undefined ? null : `${npm.name}@${npm.version}`;
}
export function preferredInstallTarget(skin) {
    return npmInstallTarget(skin) ?? skin.install.target;
}
