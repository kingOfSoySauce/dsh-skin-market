import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadCatalog } from '../src/catalog.ts'
import { apply } from '../src/index.ts'
import type { LoaderEntry } from '../src/types.ts'
import type { HostConnectionLike } from '../src/http.ts'
import { cleanupTempDirs, tempDir } from './fixtures/temp.ts'

afterEach(cleanupTempDirs)

describe('official Desktop entrypoint', () => {
  it('uses the Desktop route for explicit profile=desktop without profileContext.dir and fails closed without pluginManager', async () => {
    const profileRoot = tempDir('dsh-skin-market-index-')
    const previousHome = process.env.DSH_HOME
    process.env.DSH_HOME = profileRoot
    let cleanup: (() => void | Promise<void>) | undefined
    try {
      const desktopDir = join(profileRoot, 'profiles', 'desktop')
      mkdirSync(desktopDir, { recursive: true })
      const handlers = new Map<string, (request: any, response: any) => void | Promise<void>>()
      const webServer = {
        register(route: { path: string; handler: (request: any, response: any) => void | Promise<void> }) {
          handlers.set(route.path, route.handler)
          return () => undefined
        },
      }
      const host = {
        webServer,
        loader: { entries: (): Iterable<LoaderEntry> => [] },
        effect(callback: () => (() => void | Promise<void>)) {
          cleanup = callback()
          return cleanup
        },
        // The official runner resolves this lazily. Keeping it absent proves
        // this branch never falls back to the CLI runner.
        get: vi.fn(() => undefined),
      }
      const context = {
        get: vi.fn(() => undefined),
        inject: vi.fn((_dependencies: readonly string[], callback: (value: unknown) => unknown) => callback(host)),
      } as unknown as Context

      apply(context, { profile: 'desktop' })

      const stateResponse = { writeHead: vi.fn(), end: vi.fn() }
      await handlers.get('/dsh-skin-market/state')?.({ method: 'GET', headers: {} }, stateResponse)
      const state = JSON.parse(stateResponse.end.mock.calls.at(-1)?.[0] as string) as { hostKind: string; runningAgentCount: number; management: { capabilities: { install: { available: boolean; reason: string } } } }
      expect(state.hostKind).toBe('desktop')
      expect(state.runningAgentCount).toBe(0)
      expect(state.management.capabilities.install).toMatchObject({ available: false, reason: expect.stringContaining('pluginManager') })
      // Automatic Desktop verification preserves native choices without creating selection state.
      expect(existsSync(join(desktopDir, '.dsh-skin-market', 'state.json'))).toBe(false)
      expect(existsSync(join(profileRoot, 'profiles', 'web', '.dsh-skin-market', 'state.json'))).toBe(false)

      const managed = loadCatalog().skins.find(skin => skin.install.desktop?.mode === 'managed')
      expect(managed).toBeDefined()
      const operationResponse = { writeHead: vi.fn(), end: vi.fn() }
      const request = Readable.from([JSON.stringify({ skinId: managed!.id })])
      Object.assign(request, { method: 'POST', headers: { 'content-type': 'application/json' } })
      await handlers.get('/dsh-skin-market/install')?.(request, operationResponse)
      expect(operationResponse.end).toHaveBeenCalled()

      expect(operationResponse.writeHead.mock.calls.at(-1)?.[0]).toBe(409)
      expect(JSON.parse(operationResponse.end.mock.calls.at(-1)?.[0] as string)).toEqual({ error: expect.stringContaining('pluginManager') })
      const afterResponse = { writeHead: vi.fn(), end: vi.fn() }
      await handlers.get('/dsh-skin-market/state')?.({ method: 'GET', headers: {} }, afterResponse)
      expect(JSON.parse(afterResponse.end.mock.calls.at(-1)?.[0] as string).operations).toEqual([])
      expect(existsSync(join(desktopDir, 'package.json'))).toBe(false)
      expect(host.get).toHaveBeenCalledWith('pluginManager')
    } finally {
      await cleanup?.()
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
      rmSync(profileRoot, { recursive: true, force: true })
    }
  })

  it.each(['web', 'desktop'] as const)('preserves the actual %s profile and re-reads a host admission service that appears after startup', async profile => {
    const profileRoot = tempDir('dsh-market-host-entry-')
    const previousHome = process.env.DSH_HOME
    process.env.DSH_HOME = profileRoot
    const profileDir = join(profileRoot, 'profiles', profile)
    const handlers = new Map<string, (request: any, response: any) => void | Promise<void>>()
    const installBundle = vi.fn()
    const removeBundle = vi.fn()
    const values: Record<string, unknown> = {
      profileContext: { name: profile, dir: profileDir },
      pluginManager: { installBundle, removeBundle, cancelInstall: vi.fn() },
    }
    let cleanup: (() => void | Promise<void>) | undefined
    const host = {
      webServer: { register(route: { path: string; handler: (request: any, response: any) => void | Promise<void> }) { handlers.set(route.path, route.handler); return () => undefined } },
      loader: { entries: (): Iterable<LoaderEntry> => [] },
      get: (name: string) => values[name],
      effect(callback: () => (() => void | Promise<void>)) { cleanup = callback() },
    }
    const context = {
      get: (name: string) => values[name],
      inject: (_names: readonly string[], callback: (value: unknown) => unknown) => callback(host),
    } as unknown as Context
    const state = async () => {
      const response = { writeHead: vi.fn(), end: vi.fn() }
      await handlers.get('/dsh-skin-market/state')!({ method: 'GET', headers: {} }, response)
      return { status: response.writeHead.mock.calls.at(-1)?.[0], value: JSON.parse(response.end.mock.calls.at(-1)?.[0] as string) }
    }
    try {
      apply(context)
      const initial = await state()
      expect(initial.status).toBe(200)
      expect(initial.value.hostKind).toBe(profile === 'desktop' ? 'desktop' : 'dsh')
      expect(existsSync(join(profileDir, '.dsh-skin-market', 'state.json'))).toBe(profile === 'web')
      expect(existsSync(join(profileRoot, 'profiles', profile === 'desktop' ? 'web' : 'desktop', '.dsh-skin-market', 'state.json'))).toBe(false)

      const requestRejection = vi.fn((): number | undefined => 401)
      values.connection = { requestRejection } satisfies HostConnectionLike
      expect(await state()).toEqual({ status: 401, value: { error: '请先登录当前 DSH 宿主' } })
      requestRejection.mockImplementation(() => undefined)
      expect((await state()).status).toBe(200)
      requestRejection.mockImplementation(() => { throw new Error('admission unavailable') })
      expect(await state()).toEqual({ status: 403, value: { error: '请求未通过宿主验证' } })
      expect(requestRejection).toHaveBeenCalledTimes(3)
      expect(installBundle).not.toHaveBeenCalled()
      expect(removeBundle).not.toHaveBeenCalled()
    } finally {
      await cleanup?.()
      if (previousHome === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previousHome
      rmSync(profileRoot, { recursive: true, force: true })
    }
  })
})
