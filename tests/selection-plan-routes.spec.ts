import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CatalogStore } from '../src/catalog.ts'
import { SkinLifecycle } from '../src/lifecycle.ts'
import { mountRoutes, type WebServerService } from '../src/routes.ts'
import type { MarketUpdater } from '../src/self-update.ts'

const fixtures: Array<{ directory: string; dispose: () => unknown }> = []
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    await fixture.dispose()
    rmSync(fixture.directory, { recursive: true, force: true })
  }
  vi.restoreAllMocks()
})

function fixture() {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'selection-plan-route-'))
  const routes: Array<Parameters<WebServerService['register']>[0]> = []
  const plan = { status: 'repairable' as const, context: 'a'.repeat(64), changes: [], reason: 'fixture' }
  vi.spyOn(SkinLifecycle.prototype, 'start').mockImplementation(() => undefined)
  const inspect = vi.spyOn(SkinLifecycle.prototype, 'selectionPlan').mockResolvedValue(plan)
  const begin = vi.spyOn(SkinLifecycle.prototype, 'begin').mockImplementation((kind, skinId) => ({
    id: 'selection-operation', kind, skinId, phase: 'queued', startedAt: '2026-10-16T00:00:00Z',
  }))
  const runner = vi.fn(async () => ({ exitCode: 0, stdout: '', stderr: '', timedOut: false }))
  const dispose = mountRoutes({ loader: { entries: () => [] }, webServer: { register: route => { routes.push(route); return () => undefined } } }, {
    profile: 'desktop', profileDir: directory, runner, hostKind: 'desktop',
    catalogStore: { snapshot: () => ({ catalog: { schemaVersion: 1, generatedAt: '', skins: [] } }) } as unknown as CatalogStore,
    marketUpdater: { currentOperation: () => null, dispose: async () => undefined } as unknown as MarketUpdater,
  })
  fixtures.push({ directory, dispose })
  const request = async (path: string, body: Record<string, unknown>, origin = 'http://127.0.0.1:3080', method = 'POST') => {
    const route = routes.find(route => route.path === path)!
    const incoming = Readable.from([JSON.stringify(body)]) as IncomingMessage
    Object.assign(incoming, { method, url: path, headers: { 'content-type': 'application/json', origin, host: '127.0.0.1:3080' } })
    const response = { writeHead: vi.fn(), end: vi.fn() }
    await route.handler(incoming, response as unknown as ServerResponse)
    return { status: response.writeHead.mock.calls.at(-1)?.[0], value: JSON.parse(response.end.mock.calls.at(-1)?.[0] ?? 'null') }
  }
  return { plan, inspect, begin, runner, request, directory }
}

describe('selection plan HTTP surface', () => {
  it('returns only the read-only plan without starting a mutation', async () => {
    const host = fixture()
    expect(await host.request('/dsh-skin-market/selection-plan', { kind: 'activate', skinId: 'fixture' })).toEqual({ status: 200, value: host.plan })
    expect(host.inspect).toHaveBeenCalledWith('activate', 'fixture')
    expect(host.begin).not.toHaveBeenCalled()
    expect(host.runner).not.toHaveBeenCalled()
  })

  it('rejects untrusted origins, non-selection operations and client-selected paths', async () => {
    const host = fixture()
    expect((await host.request('/dsh-skin-market/selection-plan', { kind: 'activate', skinId: 'fixture' }, 'https://untrusted.example')).status).toBe(403)
    expect((await host.request('/dsh-skin-market/selection-plan', { kind: 'install', skinId: 'fixture' })).status).toBe(409)
    expect((await host.request('/dsh-skin-market/selection-plan', { kind: 'activate', skinId: 'fixture', home: join(host.directory, 'client-chosen') })).status).toBe(409)
    expect(host.inspect).not.toHaveBeenCalled()
    expect(host.begin).not.toHaveBeenCalled()
  })

  it('forwards the displayed context only to selection begin calls', async () => {
    const host = fixture()
    const body = { skinId: 'fixture', configurationContext: host.plan.context }
    expect((await host.request('/dsh-skin-market/activate', body)).status).toBe(202)
    expect(host.begin).toHaveBeenCalledWith('activate', 'fixture', undefined, false, undefined, undefined, undefined, undefined, host.plan.context)
    host.begin.mockClear()
    expect((await host.request('/dsh-skin-market/install', body)).status).toBe(409)
    expect(host.begin).not.toHaveBeenCalled()
  })
})
