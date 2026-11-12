import type { Context } from '@deepseek-ai/cordis'
import { createPluginCliRunner, desktopRunner, type DesktopPnpmLike, type HostPnpmInvocation } from './commands.ts'
import { normalizeOfficialRegistryPlan, officialDesktopRunner, type OfficialPluginManagerLike, type OfficialManagementEvents } from './official-desktop.ts'
import { resolveProfileDir } from './profile.ts'
import { mountRoutes, type SkinMarketHost } from './routes.ts'
import { createCliRestartScheduler } from './restart.ts'
import { detectDshRuntime } from './runtime.ts'
import type { HostConnectionLike } from './http.ts'

export const name = 'dsh-skin-market'
export interface Config { profile?: string }

interface DesktopProfilesLike { current: { name: string; dir: string } }
interface ProfileContextLike { name?: unknown; dir?: unknown; home?: unknown; patchPath?: unknown; overlays?: unknown; packageManager?: unknown }
interface EffectHost extends SkinMarketHost {
  effect(callback: () => (() => void | Promise<void>), label: string): void
}

interface LocalServiceReader {
  get?(name: string): unknown
}

function argvProfile(): string | undefined {
  const index = process.argv.indexOf('--profile')
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : undefined
}

/**
 * The pnpm the launcher published for this profile, if any.
 *
 * Official Desktop runs package operations through its bundled pnpm under
 * Electron's node; that invocation is the only thing that can replace the
 * market's own files without the plugin manager unloading it first. Every
 * field is checked, and one bad field discards the whole invocation rather
 * than half of it.
 */
function hostPnpmInvocationOf(context: ProfileContextLike | undefined): HostPnpmInvocation | undefined {
  const published = context?.packageManager
  if (published === null || typeof published !== 'object' || Array.isArray(published)) return undefined
  const { command, args, env } = published as { command?: unknown; args?: unknown; env?: unknown }
  if (typeof command !== 'string' || command.trim() === '') return undefined
  if (args !== undefined && (!Array.isArray(args) || args.some(arg => typeof arg !== 'string'))) return undefined
  if (env !== undefined && (env === null || typeof env !== 'object' || Array.isArray(env))) return undefined
  const merged: Record<string, string> = {}
  for (const [key, value] of Object.entries((env ?? {}) as Record<string, unknown>)) {
    if (typeof value === 'string') merged[key] = value
  }
  return { command: command.trim(), args: [...(args ?? []) as string[]], env: merged }
}

export function apply(ctx: Context, config?: Config): void {
  // Agent coordination is optional.  The official Electron Desktop does not
  // expose the Web Agent registry in every generation, while the market only
  // needs it when a Web/Host restart is explicitly requested.
  ctx.inject(['webServer', 'loader'], hostContext => {
    const host = hostContext as unknown as EffectHost
    const localServices = hostContext as unknown as LocalServiceReader
    const readService = (name: string): unknown => {
      const rootValue = ctx.get(name)
      if (rootValue !== undefined) return rootValue
      return localServices.get?.(name)
    }
    const desktopProfiles = readService('desktopProfiles') as DesktopProfilesLike | undefined
    const profileContext = readService('profileContext') as ProfileContextLike | undefined
    const contextName = typeof profileContext?.name === 'string' ? profileContext.name.trim() : ''
    const contextDir = typeof profileContext?.dir === 'string' ? profileContext.dir.trim() : ''
    const configurationOverride = {
      home: typeof profileContext?.home === 'string' ? profileContext.home : undefined,
      patchPath: typeof profileContext?.patchPath === 'string' ? profileContext.patchPath : undefined,
      // Unknown overlay metadata is deliberately unsupported by automatic repair.
      overlays: Array.isArray(profileContext?.overlays) && profileContext.overlays.every(value => typeof value === 'string')
        ? profileContext.overlays as string[] : ['unknown-host-overlays'],
    }
    const configuredProfile = typeof config?.profile === 'string' ? config.profile.trim() : undefined
    const launchedProfile = contextName !== '' ? contextName : argvProfile()
    const agents = readService('agents') as SkinMarketHost['agents']
    const runtime = detectDshRuntime()
    const connection = (): HostConnectionLike | undefined => readService('connection') as HostConnectionLike | undefined
    const initialPluginManager = readService('pluginManager') as OfficialPluginManagerLike | undefined
    const registryPlan = typeof initialPluginManager?.registries === 'function'
      ? async () => {
        const manager = readService('pluginManager') as OfficialPluginManagerLike | undefined
        if (typeof manager?.registries !== 'function') return undefined
        try { return normalizeOfficialRegistryPlan(await manager.registries()) } catch { return undefined }
      }
      : undefined
    const officialDesktop = desktopProfiles === undefined && (configuredProfile?.toLowerCase() === 'desktop'
      || (configuredProfile === undefined && launchedProfile?.toLowerCase() === 'desktop'))
    // Official Electron Desktop owns its profile through profileContext and
    // pluginManager; its CLI rejects `--profile desktop`. Resolve this branch
    // before the ordinary CLI fallback so actions mutate the visible profile.
    if (officialDesktop) {
      const profile = 'desktop'
      // An official Desktop generation may not expose profileContext.dir until
      // after startup. Never fall back to the Web profile in that case: the
      // canonical Desktop directory is the explicit profile name's directory.
      const profileDir = contextDir !== '' ? contextDir : resolveProfileDir(profile)
      const runner = officialDesktopRunner(() => (readService('pluginManager') as OfficialPluginManagerLike | undefined), runtime, hostContext as unknown as OfficialManagementEvents, {
        profileDir,
        packageManager: () => hostPnpmInvocationOf(profileContext),
      })
      host.effect(
        () => mountRoutes(host, { profile, profileDir, runner, hostKind: 'desktop', runtime, agents: undefined, connection, configurationOverride }),
        'dsh-skin-market: official Desktop routes',
      )
      return
    }
    if (desktopProfiles === undefined) {
      const profile = configuredProfile ?? launchedProfile ?? 'web'
      const profileDir = configuredProfile === undefined && contextDir !== '' ? contextDir : resolveProfileDir(profile)
      const appExit = readService('appExit') as ((code: number) => void) | undefined
      const restart = appExit === undefined ? undefined : createCliRestartScheduler(appExit)
      host.effect(() => mountRoutes(host, { profile, profileDir, runner: createPluginCliRunner(registryPlan), hostKind: 'dsh', runtime, restart, agents, connection, configurationOverride }), 'dsh-skin-market: routes')
      return
    }
    hostContext.inject(['desktopPnpm'], desktopContext => {
      const current = desktopProfiles.current
      const service = (desktopContext as unknown as { desktopPnpm: DesktopPnpmLike }).desktopPnpm
      const desktopHost = desktopContext as unknown as EffectHost
      desktopHost.effect(
        () => mountRoutes(host, { profile: current.name, profileDir: current.dir, runner: desktopRunner(service, current.dir), hostKind: 'desktop', runtime, agents, connection }),
        'dsh-skin-market: desktop routes',
      )
    })
  })
}

export { mountRoutes } from './routes.ts'
export { SkinLifecycle } from './lifecycle.ts'
