/**
 * Format a DSH plugin install command for cmd.exe, PowerShell, and POSIX
 * shells. Single quotes are literal characters in cmd.exe, while double
 * quotes protect the `&path:` separator in the copied command.
 */
export function quoteInstallTarget(target: string): string {
  if (/[\u0000\r\n"]/.test(target)) throw new Error('install target contains unsupported command characters')
  return `"${target}"`
}

export function createDshPluginAddCommand(target: string, profile = 'web'): string {
  return `dsh plugin --profile ${profile} add ${quoteInstallTarget(target)}`
}

/** Copied `&path:` installs: POSIX and PowerShell profile dirs; `$DSH_HOME` is not a cmd/PowerShell variable. */
export function createInstallCommand(target: string, profile = 'web'): string {
  if (!target.includes('&')) {
    const exactNpm = /^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+@\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/.test(target)
    return `${createDshPluginAddCommand(target, profile)}${exactNpm ? ' --save-exact' : ''}`
  }
  const quoted = quoteInstallTarget(target)
  return [
    `pnpm add ${quoted} --dir "$HOME/.dsh/profiles/${profile}"`,
    `pnpm add ${quoted} --dir "$env:USERPROFILE\\.dsh\\profiles\\${profile}"`,
  ].join('\n')
}
