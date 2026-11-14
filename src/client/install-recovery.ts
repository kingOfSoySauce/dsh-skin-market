import type { ManualFollowUp } from '../types.ts'

const DECISION_ACTIONS = new Set(['approve-build', 'approve-release-age', 'approve-artifact', 'repair-configuration'])
const DECISION_KINDS = new Set(['conflict', 'compatibility', 'configuration-override', 'existing-source-unreachable', 'build-approval', 'release-age', 'unexpected-store', 'adding-to-root', 'not-a-workspace', 'lockfile-outdated', 'lockfile-broken', 'script-timeout', 'pnpm-missing', 'disk-full', 'permission', 'integrity'])
const SPECIAL_UNINSTALL_CODES = new Set(['stop-profile', 'bundle-in-use', 'not-removable', 'unaddressable', 'management-required'])

export type RecoveryRoute = 'ignore' | 'decision' | 'enable' | 'uninstall' | 'check' | 'replace' | 'install'

export interface RecoveryRouteOperation {
  phase: string
  kind: string
  failure?: { kind?: string; action?: string; code?: string; manualFollowUp?: ManualFollowUp }
  /** The market raised this failure itself (a request exception), not the Host's operation. */
  clientFailure?: boolean
  /** Whether the market can prefill a verified target for the official install panel. */
  hasPinnedTarget?: boolean
  /** A plain message that already proves retrying cannot finish the operation. */
  diagnosticOnly?: boolean
}

export function recoveryRoute(operation: RecoveryRouteOperation): RecoveryRoute {
  if (operation.phase !== 'failed') return 'ignore'
  const failure = operation.failure
  if (failure === undefined) {
    // No reason came back from the Host. That is an ordinary failure, so keep
    // trying to finish the operation: official install panel, then the manual
    // panel, and only then the diagnostic dialog. A pinned target is required
    // to hand work to the panel; without one the diagnostic dialog stays.
    if (operation.clientFailure === true || operation.diagnosticOnly === true) return 'decision'
    if (operation.kind === 'uninstall') return 'uninstall'
    if (['install', 'update', 'migrate'].includes(operation.kind) && operation.hasPinnedTarget === true) return 'install'
    return 'decision'
  }
  if (failure?.action !== undefined && DECISION_ACTIONS.has(failure.action)) return 'decision'
  if (failure?.kind !== undefined && DECISION_KINDS.has(failure.kind)) return 'decision'
  if (['activate', 'deactivate', 'pin', 'unpin'].includes(operation.kind)) return 'decision'
  if (operation.kind === 'uninstall') {
    if (failure?.code !== undefined && SPECIAL_UNINSTALL_CODES.has(failure.code)) return 'decision'
    if (failure?.kind !== undefined && failure.kind !== 'command') return 'decision'
    return 'uninstall'
  }
  if (!['install', 'update', 'migrate'].includes(operation.kind)) return 'decision'
  if (failure?.manualFollowUp === 'enable') return 'enable'
  if (failure?.manualFollowUp === 'check') return 'check'
  if (failure?.manualFollowUp === 'uninstall-then-add') return 'replace'
  return 'install'
}
