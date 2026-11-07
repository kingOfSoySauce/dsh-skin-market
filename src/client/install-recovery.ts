import type { ManualFollowUp } from '../types.ts'

const DECISION_ACTIONS = new Set(['approve-build', 'approve-release-age', 'approve-artifact', 'repair-configuration'])
const DECISION_KINDS = new Set(['conflict', 'compatibility', 'configuration-override', 'existing-source-unreachable', 'build-approval', 'release-age', 'unexpected-store', 'adding-to-root', 'not-a-workspace', 'lockfile-outdated', 'lockfile-broken', 'script-timeout', 'pnpm-missing', 'disk-full', 'permission', 'integrity'])
const SPECIAL_UNINSTALL_CODES = new Set(['stop-profile', 'bundle-in-use', 'not-removable', 'unaddressable', 'management-required'])

export type RecoveryRoute = 'ignore' | 'decision' | 'enable' | 'uninstall' | 'check' | 'replace' | 'install'

export function recoveryRoute(operation: {
  phase: string
  kind: string
  failure?: { kind?: string; action?: string; code?: string; manualFollowUp?: ManualFollowUp }
}): RecoveryRoute {
  if (operation.phase !== 'failed') return 'ignore'
  const failure = operation.failure
  if (failure === undefined) return 'decision'
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
