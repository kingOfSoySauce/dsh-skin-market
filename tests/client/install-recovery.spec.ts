import { describe, expect, it } from 'vitest'
import { recoveryRoute } from '../../src/client/install-recovery.ts'

describe('install recovery route', () => {
  it('keeps decisions and specific uninstall failures on the existing dialog', () => {
    expect(recoveryRoute({ phase: 'failed', kind: 'install', failure: { kind: 'network', action: 'retry' } })).toBe('install')
    expect(recoveryRoute({ phase: 'failed', kind: 'update', failure: { kind: 'release-age', action: 'approve-release-age' } })).toBe('decision')
    expect(recoveryRoute({ phase: 'failed', kind: 'activate', failure: { kind: 'configuration-override', action: 'repair-configuration' } })).toBe('decision')
    expect(recoveryRoute({ phase: 'failed', kind: 'uninstall', failure: { kind: 'unexpected-store' } })).toBe('decision')
    expect(recoveryRoute({ phase: 'failed', kind: 'update', failure: { kind: 'unexpected-store' } })).toBe('decision')
    expect(recoveryRoute({ phase: 'failed', kind: 'install' })).toBe('decision')
    expect(recoveryRoute({ phase: 'failed', kind: 'install', failure: { kind: 'release-age' } })).toBe('decision')
    expect(recoveryRoute({ phase: 'failed', kind: 'uninstall', failure: { kind: 'command', code: 'stop-profile' } })).toBe('decision')
  })

  it('sends an ordinary Host failure to the install flow before the diagnostic dialog', () => {
    for (const kind of ['install', 'update', 'migrate'] as const) {
      expect(recoveryRoute({ phase: 'failed', kind, hasPinnedTarget: true })).toBe('install')
      // Without a verified target the market cannot prefill the panel.
      expect(recoveryRoute({ phase: 'failed', kind })).toBe('decision')
      expect(recoveryRoute({ phase: 'failed', kind, hasPinnedTarget: true, diagnosticOnly: true })).toBe('decision')
      expect(recoveryRoute({ phase: 'failed', kind, hasPinnedTarget: true, clientFailure: true })).toBe('decision')
    }
    expect(recoveryRoute({ phase: 'failed', kind: 'uninstall', hasPinnedTarget: true })).toBe('uninstall')
    expect(recoveryRoute({ phase: 'failed', kind: 'uninstall', diagnosticOnly: true })).toBe('decision')
    expect(recoveryRoute({ phase: 'failed', kind: 'activate', hasPinnedTarget: true })).toBe('decision')
  })

  it('splits a known manual follow-up from an ordinary uninstall', () => {
    expect(recoveryRoute({ phase: 'failed', kind: 'update', failure: { manualFollowUp: 'uninstall-then-add' } })).toBe('replace')
    expect(recoveryRoute({ phase: 'failed', kind: 'update', failure: { manualFollowUp: 'install' } })).toBe('install')
    expect(recoveryRoute({ phase: 'failed', kind: 'update', failure: { manualFollowUp: 'enable' } })).toBe('enable')
    expect(recoveryRoute({ phase: 'failed', kind: 'update', failure: { manualFollowUp: 'check' } })).toBe('check')
    expect(recoveryRoute({ phase: 'failed', kind: 'uninstall', failure: { kind: 'command' } })).toBe('uninstall')
    expect(recoveryRoute({ phase: 'waiting', kind: 'install' })).toBe('ignore')
  })
})
