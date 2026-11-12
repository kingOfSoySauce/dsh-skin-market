import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createDesktopPluginPanel, type DesktopPluginPanelContext } from '../../src/client/desktop-plugin-panel.ts'

interface Snapshot {
  status: string
  refreshStatus?: string
  highlight?: string | null
  notice?: unknown
  packages?: unknown[]
  install: {
    phase: string; open: boolean; spec: string; requestId?: string; enabling?: boolean
    subject?: { name?: string } | null; installed?: string | null
  }
}

function officialPanel(initial: Partial<Snapshot> = {}) {
  let state: Snapshot = { status: 'ready', install: { phase: 'idle', open: false, spec: '' }, ...initial }
  const listeners = new Set<() => void>()
  const publish = (update: Partial<Snapshot>) => { state = { ...state, ...update }; for (const listener of listeners) listener() }
  const store = {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
  // Match the official registration shape and its important openInstall rule:
  // opening without a request id starts an empty form, even during checking.
  const face = {
    hooks: { pluginManager: store },
    ensure: vi.fn(),
    openInstall: vi.fn(() => publish({ install: state.install.requestId === undefined
      ? { phase: 'idle', open: true, spec: '' }
      : { ...state.install, open: true } })),
    editInstallSpec: vi.fn((spec: string) => publish({ install: { phase: 'idle', open: true, spec } })),
    runInstall: vi.fn(),
  }
  const entry = { options: { key: 'plugins' }, inject: () => face, component: () => null }
  let winners: unknown[] = [entry]
  const ctx = {
    layout: { selectPanel: vi.fn() },
    slots: {
      entriesOfSlot: vi.fn((_name: string) => winners),
      // The adapter must select the winner, not a shadowed raw registration.
      entries: vi.fn(() => [{ options: { key: 'plugins' }, inject: () => { throw new Error('shadowed entry') } }, entry]),
    },
  }
  return { ctx, face, entry, publish, state: () => state, listeners, setWinners: (value: unknown[]) => { winners = value } }
}

afterEach(() => vi.useRealTimers())

describe('official Desktop add-plugin panel bridge', () => {
  it('uses optional layout lookup in a real Cordis plugin with the market’s injection boundary', async () => {
    const panel = officialPanel()
    const root = new Context()
    // DSH provides layout from a sibling plugin, not the root or market fiber.
    // Providing it on the root would incorrectly let the old direct read pass.
    const host = root.plugin({
      apply(ctx: Context) {
        ctx.provide('layout', panel.ctx.layout)
        ctx.provide('slots', panel.ctx.slots)
        ctx.provide('locale', {})
        ctx.provide('loader', {})
      },
    })
    await host.await()
    let marketContext: Context | undefined
    const market = root.plugin({
      inject: ['slots', 'locale', 'loader'],
      apply(ctx: Context) { marketContext = ctx },
    })
    try {
      await market.await()
      const ctx = marketContext as Context & DesktopPluginPanelContext
      // This is the production failure that the earlier plain-object fixture
      // missed: optional chaining cannot prevent this service getter throwing.
      expect(() => ctx.layout?.selectPanel).toThrow('cannot get property "layout" without inject')
      const bridge = createDesktopPluginPanel(ctx)
      expect(bridge.available()).toBe(true)
      await expect(bridge.open('https://github.com/example/skin.git#abc')).resolves.toEqual({ ok: true, kind: 'prefilled' })
      expect(panel.state().install.spec).toBe('https://github.com/example/skin.git#abc')
      expect(panel.ctx.layout.selectPanel).toHaveBeenCalledWith('plugins')
      expect(panel.face.runInstall).not.toHaveBeenCalled()
    } finally {
      await market.dispose()
      await host.dispose()
    }
  })

  it('leaves the market usable when an old Cordis host has no layout provider', async () => {
    const panel = officialPanel()
    const root = new Context()
    const host = root.plugin({ apply(ctx: Context) { ctx.provide('slots', panel.ctx.slots) } })
    await host.await()
    let marketContext: Context | undefined
    const market = root.plugin({ inject: ['slots'], apply(ctx: Context) { marketContext = ctx } })
    try {
      await market.await()
      const bridge = createDesktopPluginPanel(marketContext as Context & DesktopPluginPanelContext)
      expect(bridge.available()).toBe(false)
      await expect(bridge.open('skin')).resolves.toMatchObject({ ok: false })
      expect(panel.face.openInstall).not.toHaveBeenCalled()
    } finally {
      await market.dispose()
      await host.dispose()
    }
  })

  it('uses the winning main entry to open and prefill the existing official form without submitting it', async () => {
    const panel = officialPanel()
    const bridge = createDesktopPluginPanel(panel.ctx)
    expect(bridge.available()).toBe(true)
    await expect(bridge.open('  https://github.com/example/skin.git#abc  ')).resolves.toEqual({ ok: true, kind: 'prefilled' })
    expect(panel.ctx.layout.selectPanel).toHaveBeenCalledWith('plugins')
    expect(panel.ctx.slots.entriesOfSlot).toHaveBeenCalledWith('main')
    expect(panel.ctx.slots.entries).not.toHaveBeenCalled()
    expect(panel.state().install).toMatchObject({ open: true, phase: 'idle', spec: 'https://github.com/example/skin.git#abc' })
    expect(panel.face.runInstall).not.toHaveBeenCalled()
  })

  it('waits for the official inventory to load, then releases its subscription', async () => {
    const panel = officialPanel({ status: 'idle' })
    panel.face.ensure.mockImplementation(() => panel.publish({ status: 'loading' }))
    const opening = createDesktopPluginPanel(panel.ctx).open('skin@1.2.3')
    expect(panel.face.openInstall).not.toHaveBeenCalled()
    expect(panel.ctx.layout.selectPanel).not.toHaveBeenCalled()
    expect(panel.listeners.size).toBe(1)
    panel.publish({ status: 'ready' })
    await expect(opening).resolves.toEqual({ ok: true, kind: 'prefilled' })
    expect(panel.listeners.size).toBe(0)
    expect(panel.ctx.layout.selectPanel).toHaveBeenCalledWith('plugins')
  })

  it('rebinds when a render replaces the controller while the inventory loads', async () => {
    const panel = officialPanel({ status: 'idle' })
    panel.face.ensure.mockImplementation(() => panel.publish({ status: 'loading' }))
    const opening = createDesktopPluginPanel(panel.ctx).open('skin@1.2.3')
    const replacementFace = {
      hooks: panel.face.hooks,
      ensure: vi.fn(),
      openInstall: vi.fn(() => panel.publish({ install: { phase: 'idle', open: true, spec: '' } })),
      editInstallSpec: vi.fn((spec: string) => panel.publish({ install: { phase: 'idle', open: true, spec } })),
      runInstall: vi.fn(),
    }
    panel.setWinners([{ options: { key: 'plugins' }, inject: () => replacementFace, component: () => null }])
    panel.publish({ status: 'ready' })
    await expect(opening).resolves.toEqual({ ok: true, kind: 'prefilled' })
    expect(replacementFace.openInstall).toHaveBeenCalled()
    expect(replacementFace.editInstallSpec).toHaveBeenCalledWith('skin@1.2.3')
    expect(panel.face.editInstallSpec).not.toHaveBeenCalled()
  })

  it.each(['unavailable', 'error'])('returns a usable fallback when the official inventory is %s', async status => {
    const panel = officialPanel({ status })
    await expect(createDesktopPluginPanel(panel.ctx).open('skin')).resolves.toMatchObject({ ok: false, reason: expect.stringContaining('未能加载') })
    expect(panel.face.openInstall).not.toHaveBeenCalled()
    expect(panel.ctx.layout.selectPanel).not.toHaveBeenCalled()
  })

  it('times out an inventory read without retaining a subscription or opening an empty form', async () => {
    vi.useFakeTimers()
    const panel = officialPanel({ status: 'loading' })
    const opening = createDesktopPluginPanel(panel.ctx, { readyTimeoutMs: 100 }).open('skin')
    await vi.advanceTimersByTimeAsync(100)
    await expect(opening).resolves.toMatchObject({ ok: false, reason: expect.stringContaining('未能加载') })
    expect(panel.listeners.size).toBe(0)
    expect(panel.face.openInstall).not.toHaveBeenCalled()
    expect(panel.ctx.layout.selectPanel).not.toHaveBeenCalled()
  })

  it('retains a visible checking operation without invoking the official form-reset method', async () => {
    const install = { phase: 'checking', open: true, spec: 'existing-skin' }
    const panel = officialPanel({ install })
    await expect(createDesktopPluginPanel(panel.ctx).open('new-skin')).resolves.toEqual({ ok: true, kind: 'resumed' })
    expect(panel.state().install).toBe(install)
    expect(panel.face.openInstall).not.toHaveBeenCalled()
    expect(panel.face.editInstallSpec).not.toHaveBeenCalled()
  })

  it.each(['starting', 'running', 'installing', 'cancelling', 'applying', 'unconfirmed', 'indeterminate'])(
    'reopens the existing %s request and keeps its original input', async phase => {
      const panel = officialPanel({ install: { phase, open: false, spec: 'existing-skin', requestId: 'existing-request' } })
      await expect(createDesktopPluginPanel(panel.ctx).open('new-skin')).resolves.toEqual({ ok: true, kind: 'resumed' })
      expect(panel.state().install).toEqual({ phase, open: true, spec: 'existing-skin', requestId: 'existing-request' })
      expect(panel.face.editInstallSpec).not.toHaveBeenCalled()
      expect(panel.face.runInstall).not.toHaveBeenCalled()
    },
  )

  it.each(['checking', 'running', 'future-active-phase'])('does not reset a hidden %s task without an id', async phase => {
    const install = { phase, open: false, spec: 'existing-skin' }
    const panel = officialPanel({ install })
    await expect(createDesktopPluginPanel(panel.ctx).open('new-skin')).resolves.toMatchObject({ ok: false, reason: expect.stringContaining('另一项任务') })
    expect(panel.state().install).toBe(install)
    expect(panel.face.openInstall).not.toHaveBeenCalled()
    expect(panel.face.editInstallSpec).not.toHaveBeenCalled()
  })

  it('keeps the user’s different visible draft', async () => {
    const install = { phase: 'idle', open: true, spec: 'user-entered-skin@2.0.0' }
    const panel = officialPanel({ install })
    await expect(createDesktopPluginPanel(panel.ctx).open('market-skin')).resolves.toEqual({ ok: true, kind: 'resumed' })
    expect(panel.state().install).toBe(install)
    expect(panel.face.openInstall).not.toHaveBeenCalled()
    expect(panel.face.editInstallSpec).not.toHaveBeenCalled()
  })

  it('fills an already open empty form without resetting its registry selection', async () => {
    const panel = officialPanel({ install: { phase: 'idle', open: true, spec: '' } })
    await expect(createDesktopPluginPanel(panel.ctx).open('market-skin')).resolves.toEqual({ ok: true, kind: 'prefilled' })
    expect(panel.face.openInstall).not.toHaveBeenCalled()
    expect(panel.face.editInstallSpec).toHaveBeenCalledWith('market-skin')
  })

  it.each(['done', 'failed', 'unknown'])('starts a new form after the completed %s outcome', async phase => {
    const panel = officialPanel({ install: { phase, open: true, spec: 'previous-skin', requestId: 'settled-request' } })
    await expect(createDesktopPluginPanel(panel.ctx).open('next-skin')).resolves.toEqual({ ok: true, kind: 'prefilled' })
    expect(panel.state().install).toEqual({ phase: 'idle', open: true, spec: 'next-skin' })
    expect(panel.face.runInstall).not.toHaveBeenCalled()
  })

  it('protects a completed installation that is still enabling', async () => {
    const panel = officialPanel({ install: { phase: 'done', open: true, spec: 'previous-skin', enabling: true } })
    await expect(createDesktopPluginPanel(panel.ctx).open('next-skin')).resolves.toEqual({ ok: true, kind: 'resumed' })
    expect(panel.face.openInstall).not.toHaveBeenCalled()
    expect(panel.face.editInstallSpec).not.toHaveBeenCalled()
  })

  it('protects a request that begins while the initial inventory read is pending', async () => {
    const panel = officialPanel({ status: 'loading' })
    const opening = createDesktopPluginPanel(panel.ctx).open('new-skin')
    panel.publish({ status: 'ready', install: { phase: 'running', open: false, spec: 'other-skin', requestId: 'other-request' } })
    await expect(opening).resolves.toEqual({ ok: true, kind: 'resumed' })
    expect(panel.state().install.spec).toBe('other-skin')
    expect(panel.face.editInstallSpec).not.toHaveBeenCalled()
  })

  it('coalesces simultaneous clicks for the same input and rejects a competing input without overriding it', async () => {
    const panel = officialPanel({ status: 'loading' })
    const bridge = createDesktopPluginPanel(panel.ctx)
    const first = bridge.open('first-skin')
    const doubleClick = bridge.open('first-skin')
    expect(doubleClick).toBe(first)
    await expect(bridge.open('different-skin')).resolves.toMatchObject({ ok: false, reason: expect.stringContaining('正在打开') })
    expect(panel.face.ensure).toHaveBeenCalledTimes(1)
    panel.publish({ status: 'ready' })
    await expect(first).resolves.toEqual({ ok: true, kind: 'prefilled' })
    expect(panel.face.editInstallSpec).toHaveBeenCalledExactlyOnceWith('first-skin')
    expect(panel.ctx.layout.selectPanel).toHaveBeenCalledTimes(1)
    // The guard releases after completion; later clicks may open another form.
    panel.publish({ install: { phase: 'done', open: true, spec: 'first-skin' } })
    await expect(bridge.open('later-skin')).resolves.toEqual({ ok: true, kind: 'prefilled' })
  })

  it('continues with a re-created controller wrapper during loading', async () => {
    const panel = officialPanel({ status: 'loading' })
    const opening = createDesktopPluginPanel(panel.ctx).open('skin')
    panel.setWinners([{ ...panel.entry }])
    panel.publish({ status: 'ready' })
    await expect(opening).resolves.toEqual({ ok: true, kind: 'prefilled' })
    expect(panel.face.openInstall).toHaveBeenCalled()
    expect(panel.face.editInstallSpec).toHaveBeenCalledWith('skin')
  })

  it.each([
    { slots: {} },
    { layout: { selectPanel: () => undefined }, slots: {} },
    { layout: { selectPanel: () => undefined }, slots: { entriesOfSlot: () => [{ options: { key: 'plugins', inject: () => ({}) } }] } },
    { layout: { selectPanel: () => undefined }, slots: { entriesOfSlot: () => [{ options: { key: 'plugins' }, inject: () => ({}) }] } },
  ] satisfies DesktopPluginPanelContext[])('degrades safely when the expected registration contract is absent', async ctx => {
    const bridge = createDesktopPluginPanel(ctx)
    expect(bridge.available()).toBe(false)
    await expect(bridge.open('skin')).resolves.toMatchObject({ ok: false, reason: expect.stringContaining('请重试') })
  })

  it('rechecks the winner after the capability probe and catches unexpected host failures', async () => {
    const panel = officialPanel()
    const bridge = createDesktopPluginPanel(panel.ctx)
    expect(bridge.available()).toBe(true)
    panel.setWinners([])
    await expect(bridge.open('skin')).resolves.toMatchObject({ ok: false })
    expect(panel.face.openInstall).not.toHaveBeenCalled()
    panel.setWinners([panel.entry])
    panel.ctx.layout.selectPanel.mockImplementation(() => { throw new Error('host unavailable') })
    await expect(bridge.open('skin')).resolves.toMatchObject({ ok: false })
    expect(panel.state().install.spec).toBe('skin')
    expect(panel.face.runInstall).not.toHaveBeenCalled()
  })
})

describe('native installation handoff tracking', () => {
  const handoff = { skinId: 'market.skin', packageName: 'market-skin' }
  const spec = 'https://github.com/example/skin.git#verified-commit'

  function trackedPanel(withNavigation = true) {
    const panel = officialPanel({ packages: [], highlight: null, refreshStatus: 'idle' })
    const remoteListeners = new Set<() => void>()
    const remote = { $on: vi.fn((_event: string, listener: () => void) => { remoteListeners.add(listener); return () => { remoteListeners.delete(listener) } }) }
    const navigation = { openBundle: vi.fn() }
    const bridge = createDesktopPluginPanel({
      ...panel.ctx,
      get: (name: string) => name === 'layout' ? panel.ctx.layout : name === 'remote' ? remote : name === 'pluginNavigation' && withNavigation ? navigation : undefined,
    })
    const start = (requestId = 'this-request', requestedSpec = spec, inspectedName?: string) => panel.publish({
      install: { phase: 'starting', open: true, spec: requestedSpec, requestId, subject: inspectedName === undefined ? {} : { name: inspectedName } },
    })
    const done = (requestId = 'this-request', installed = handoff.packageName, requestedSpec = spec) => panel.publish({
      install: { phase: 'done', open: true, spec: requestedSpec, requestId, installed, enabling: false },
    })
    const enable = () => panel.publish({ install: { ...panel.state().install, enabling: true } })
    const finish = () => panel.publish({ install: { phase: 'idle', open: false, spec: '' }, highlight: handoff.packageName })
    const inventory = (enabled = true) => panel.publish({
      status: 'ready', packages: [{ name: handoff.packageName, installed: true, enabled, rows: [{ enabled: false, phase: 'failed' }] }],
    })
    return { ...panel, bridge, navigation, remote, remoteListeners, start, done, enable, finish, inventory }
  }

  it('refreshes after an identified install without activating when the user only installs or closes', async () => {
    const panel = trackedPanel()
    const refreshed = vi.fn()
    panel.bridge.observe!(refreshed)
    await panel.bridge.open(spec, handoff)
    panel.start()
    panel.done()
    expect(refreshed).toHaveBeenCalledTimes(1)
    expect(panel.bridge.takeActivationIntent!()).toBeNull()
    panel.publish({ install: { phase: 'idle', open: false, spec: '' } })
    panel.inventory()
    await Promise.resolve()
    expect(panel.bridge.takeActivationIntent!()).toBeNull()
    expect(panel.navigation.openBundle).not.toHaveBeenCalled()
  })

  it('waits for explicit enable, the official completion marker, and fresh enabled bundle inventory', async () => {
    const panel = trackedPanel()
    await panel.bridge.open(spec, handoff)
    panel.start() // Git inspection has no package name until pnpm fetches it.
    panel.done()
    panel.enable()
    expect(panel.bridge.takeActivationIntent!()).toBeNull()
    panel.finish()
    expect(panel.bridge.takeActivationIntent!()).toBeNull()
    panel.inventory()
    expect(panel.bridge.takeActivationIntent!()).toEqual({ ...handoff, spec, requestId: 'this-request' })
    expect(panel.bridge.takeActivationIntent!()).toBeNull()
    await Promise.resolve()
    expect(panel.navigation.openBundle).toHaveBeenCalledExactlyOnceWith('dsh-skin-market')
    expect(panel.face.runInstall).not.toHaveBeenCalled()
  })

  it('retains a confirmed intent across view unmount and a later handoff', async () => {
    const panel = trackedPanel()
    const stopObserving = panel.bridge.observe!(vi.fn())
    await panel.bridge.open(spec, handoff)
    stopObserving() // Navigating to the official page unmounts the market view.
    panel.start()
    panel.done()
    panel.enable()
    panel.finish()
    panel.inventory()
    await panel.bridge.open('other-skin', { skinId: 'other.skin', packageName: 'other-skin' })
    panel.bridge.observe!(vi.fn())
    expect(panel.bridge.takeActivationIntent!()).toEqual({ ...handoff, spec, requestId: 'this-request' })
    expect(panel.bridge.takeActivationIntent!()).toBeNull()
  })

  it('keeps the intent available for a later visit when cross-plugin navigation is absent', async () => {
    const panel = trackedPanel(false)
    await panel.bridge.open(spec, handoff)
    panel.start()
    panel.done()
    panel.enable()
    panel.finish()
    panel.inventory()
    await Promise.resolve()
    expect(panel.navigation.openBundle).not.toHaveBeenCalled()
    expect(panel.bridge.takeActivationIntent!()).toEqual({ ...handoff, spec, requestId: 'this-request' })
  })

  it('restores an unhandled intent once when its market consumer unmounts', async () => {
    const panel = trackedPanel()
    await panel.bridge.open(spec, handoff)
    panel.start()
    panel.done()
    panel.enable()
    panel.finish()
    panel.inventory()
    const intent = panel.bridge.takeActivationIntent!()!
    const refreshed = vi.fn()
    panel.bridge.observe!(refreshed)
    panel.bridge.restoreActivationIntent!(intent)
    panel.bridge.restoreActivationIntent!(intent)
    expect(refreshed).toHaveBeenCalledTimes(1)
    expect(panel.bridge.takeActivationIntent!()).toEqual(intent)
    expect(panel.bridge.takeActivationIntent!()).toBeNull()
    panel.bridge.dispose!()
    panel.bridge.restoreActivationIntent!(intent)
    expect(panel.bridge.takeActivationIntent!()).toBeNull()
  })

  it('does not restore unknown or altered activation identities', async () => {
    const panel = trackedPanel()
    await panel.bridge.open(spec, handoff)
    panel.start()
    panel.done()
    panel.enable()
    panel.finish()
    panel.inventory()
    const intent = panel.bridge.takeActivationIntent!()!
    for (const changed of [{ requestId: 'unknown-request' }, { skinId: 'other.skin' }, { packageName: 'other-package' }, { spec: 'different-spec' }]) {
      panel.bridge.restoreActivationIntent!({ ...intent, ...changed })
      expect(panel.bridge.takeActivationIntent!()).toBeNull()
    }
    panel.bridge.restoreActivationIntent!(intent)
    expect(panel.bridge.takeActivationIntent!()).toEqual(intent)
  })

  it('uses remote changed events only for invalidation, regardless of their operation reason', () => {
    const panel = trackedPanel()
    const refreshed = vi.fn()
    panel.bridge.observe!(refreshed)
    expect(panel.remote.$on).toHaveBeenCalledWith('plugin-manager/changed', expect.any(Function))
    for (const listener of panel.remoteListeners) listener()
    expect(refreshed).toHaveBeenCalledTimes(1)
    expect(panel.bridge.takeActivationIntent!()).toBeNull()
    expect(panel.navigation.openBundle).not.toHaveBeenCalled()
  })

  it('does not turn native refusal into an automatic market retry', async () => {
    const panel = trackedPanel()
    await panel.bridge.open(spec, handoff)
    panel.start()
    panel.done()
    panel.enable()
    panel.publish({ notice: { kind: 'failed', action: 'enable', packageName: handoff.packageName, seq: 7 } })
    panel.finish()
    panel.inventory()
    await Promise.resolve()
    expect(panel.bridge.takeActivationIntent!()).toBeNull()
    expect(panel.navigation.openBundle).not.toHaveBeenCalled()
  })

  it('does not mistake a previously visible failure notice for the new enable result', async () => {
    const panel = trackedPanel()
    panel.publish({ notice: { kind: 'failed', action: 'enable', packageName: handoff.packageName, seq: 1 } })
    await panel.bridge.open(spec, handoff)
    panel.start()
    panel.done()
    panel.enable()
    panel.finish()
    panel.inventory()
    expect(panel.bridge.takeActivationIntent!()?.requestId).toBe('this-request')
  })

  it('does not queue an activation when the fresh bundle is disabled', async () => {
    const panel = trackedPanel()
    await panel.bridge.open(spec, handoff)
    panel.start()
    panel.done()
    panel.enable()
    panel.finish()
    panel.inventory(false)
    expect(panel.bridge.takeActivationIntent!()).toBeNull()
    expect(panel.navigation.openBundle).not.toHaveBeenCalled()
  })

  it('requires an unambiguous package identity in the fresh inventory', async () => {
    const panel = trackedPanel()
    await panel.bridge.open(spec, handoff)
    panel.start()
    panel.done()
    panel.enable()
    panel.finish()
    panel.publish({ packages: [
      { name: handoff.packageName, installed: true, enabled: true },
      { name: handoff.packageName, installed: true, enabled: true },
    ] })
    expect(panel.bridge.takeActivationIntent!()).toBeNull()
  })

  it('waits past a close during enabling instead of treating the cleared dialog as completion', async () => {
    const panel = trackedPanel()
    await panel.bridge.open(spec, handoff)
    panel.start()
    panel.done()
    panel.enable()
    panel.publish({ install: { phase: 'idle', open: false, spec: '' } })
    panel.inventory()
    expect(panel.bridge.takeActivationIntent!()).toBeNull()
    panel.finish()
    panel.inventory()
    expect(panel.bridge.takeActivationIntent!()?.requestId).toBe('this-request')
  })

  it('does not reuse an old same-package highlight as the completion marker', async () => {
    const panel = trackedPanel()
    panel.publish({ highlight: handoff.packageName })
    await panel.bridge.open(spec, handoff)
    panel.start()
    panel.done()
    panel.enable()
    panel.finish()
    panel.inventory()
    expect(panel.bridge.takeActivationIntent!()).toBeNull()
  })

  it.each(['wrong-inspection', 'wrong-installed', 'changed-spec', 'changed-request'])('drops a handoff with %s identity', async mismatch => {
    const panel = trackedPanel()
    await panel.bridge.open(spec, handoff)
    panel.start('this-request', spec, mismatch === 'wrong-inspection' ? 'different-package' : undefined)
    if (mismatch === 'changed-spec') {
      panel.publish({ install: { phase: 'idle', open: true, spec: 'user-edited-spec' } })
      panel.start()
    }
    if (mismatch === 'changed-request') panel.start('unrelated-request')
    panel.done('this-request', mismatch === 'wrong-installed' ? 'different-package' : handoff.packageName)
    panel.enable()
    panel.finish()
    panel.inventory()
    expect(panel.bridge.takeActivationIntent!()).toBeNull()
  })

  it('does not adopt a resumed old native installation', async () => {
    const panel = trackedPanel()
    panel.start()
    await expect(panel.bridge.open(spec, handoff)).resolves.toEqual({ ok: true, kind: 'resumed' })
    panel.done()
    panel.enable()
    panel.finish()
    panel.inventory()
    expect(panel.bridge.takeActivationIntent!()).toBeNull()
  })

  it('records a submitted install failure only after the official dialog closes', async () => {
    const panel = trackedPanel()
    await panel.bridge.open(spec, { ...handoff, operationId: 'install-1' })
    panel.start('failed-request')
    panel.publish({ install: { phase: 'failed', open: true, spec, requestId: 'failed-request' } })
    expect(panel.bridge.takeManualRecovery!()).toBeNull()
    panel.publish({ install: { phase: 'idle', open: false, spec: '' } })
    expect(panel.bridge.takeManualRecovery!()).toEqual({ ...handoff, operationId: 'install-1', spec, companions: undefined })
    expect(panel.bridge.takeManualRecovery!()).toBeNull()
  })

  it('keeps tracking a retry that starts while the official dialog is closed', async () => {
    const panel = trackedPanel()
    await panel.bridge.open(spec, { ...handoff, operationId: 'install-3' })
    panel.start('failed-request')
    panel.publish({ install: { phase: 'failed', open: true, spec, requestId: 'failed-request' } })
    panel.publish({ install: { phase: 'starting', open: false, spec, requestId: 'retried-request' } })
    expect(panel.bridge.takeManualRecovery!()).toBeNull()
    panel.done('retried-request')
    panel.enable()
    panel.finish()
    panel.inventory()
    expect(panel.bridge.takeActivationIntent!()?.requestId).toBe('retried-request')
    expect(panel.bridge.takeManualRecovery!()).toBeNull()
  })

  it('does not record a dialog that was closed before it was submitted', async () => {
    const panel = trackedPanel()
    await panel.bridge.open(spec, { ...handoff, operationId: 'install-2' })
    panel.publish({ install: { phase: 'idle', open: false, spec: '' } })
    expect(panel.bridge.takeManualRecovery!()).toBeNull()
  })

  it('does not navigate away when a recovery open finds an existing install task', async () => {
    const panel = trackedPanel()
    panel.publish({ install: { phase: 'installing', open: true, spec: 'other-spec', requestId: 'busy' } })
    await expect(panel.bridge.open(spec, handoff, { navigateOnResume: false })).resolves.toEqual({ ok: true, kind: 'resumed' })
    expect(panel.ctx.layout.selectPanel).not.toHaveBeenCalled()
  })

  it('can associate an explicitly retried install with its new request id', async () => {
    const panel = trackedPanel()
    await panel.bridge.open(spec, handoff)
    panel.start('failed-request')
    panel.publish({ install: { phase: 'failed', open: true, spec, requestId: 'failed-request' } })
    panel.start('retried-request')
    panel.done('retried-request')
    panel.enable()
    panel.finish()
    panel.inventory()
    expect(panel.bridge.takeActivationIntent!()?.requestId).toBe('retried-request')
  })

  it('does not claim success when native inventory refresh fails', async () => {
    const panel = trackedPanel()
    await panel.bridge.open(spec, handoff)
    panel.start()
    panel.done()
    panel.enable()
    panel.finish()
    panel.publish({ status: 'error' })
    panel.inventory()
    expect(panel.bridge.takeActivationIntent!()).toBeNull()
  })

  it('drops observations when the official controller is replaced', async () => {
    const panel = trackedPanel()
    await panel.bridge.open(spec, handoff)
    panel.start()
    panel.setWinners([{ ...panel.entry }])
    panel.done()
    panel.enable()
    panel.finish()
    panel.inventory()
    expect(panel.bridge.takeActivationIntent!()).toBeNull()
    expect(panel.listeners.size).toBe(0)
  })

  it('cleans up listeners, queued actions and pending readiness on plugin disposal', async () => {
    const panel = trackedPanel()
    panel.bridge.observe!(vi.fn())
    await panel.bridge.open(spec, handoff)
    expect(panel.listeners.size).toBe(1)
    expect(panel.remoteListeners.size).toBe(1)
    panel.start()
    panel.done()
    panel.enable()
    panel.finish()
    panel.inventory()
    panel.bridge.dispose!()
    expect(panel.listeners.size).toBe(0)
    expect(panel.remoteListeners.size).toBe(0)
    expect(panel.bridge.takeActivationIntent!()).toBeNull()
    expect(panel.bridge.available()).toBe(false)
    await Promise.resolve()
    expect(panel.navigation.openBundle).not.toHaveBeenCalled()

    const loading = officialPanel({ status: 'loading' })
    const bridge = createDesktopPluginPanel(loading.ctx)
    const opening = bridge.open(spec, handoff)
    bridge.dispose!()
    await expect(opening).resolves.toMatchObject({ ok: false })
    expect(loading.listeners.size).toBe(0)
  })
})
