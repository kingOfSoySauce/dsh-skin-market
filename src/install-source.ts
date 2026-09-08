/** Shared by the host, embedded market, and public site. Keep browser-safe. */
export interface InstallSourceSkin {
  install: { target: string; npm?: { name: string; version: string } }
}

export function npmInstallTarget(skin: InstallSourceSkin): string | null {
  const npm = skin.install.npm
  return npm === undefined ? null : `${npm.name}@${npm.version}`
}

export function preferredInstallTarget(skin: InstallSourceSkin): string {
  return npmInstallTarget(skin) ?? skin.install.target
}
