import { createPluginCliRunner, desktopRunner } from './commands.js';
import { normalizeOfficialRegistryPlan, officialDesktopRunner } from './official-desktop.js';
import { resolveProfileDir } from './profile.js';
import { mountRoutes } from './routes.js';
import { createCliRestartScheduler } from './restart.js';
import { detectDshRuntime } from './runtime.js';
export const name = 'dsh-skin-market';
function argvProfile() {
    const index = process.argv.indexOf('--profile');
    return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : undefined;
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
function hostPnpmInvocationOf(context) {
    const published = context?.packageManager;
    if (published === null || typeof published !== 'object' || Array.isArray(published))
        return undefined;
    const { command, args, env } = published;
    if (typeof command !== 'string' || command.trim() === '')
        return undefined;
    if (args !== undefined && (!Array.isArray(args) || args.some(arg => typeof arg !== 'string')))
        return undefined;
    if (env !== undefined && (env === null || typeof env !== 'object' || Array.isArray(env)))
        return undefined;
    const merged = {};
    for (const [key, value] of Object.entries((env ?? {}))) {
        if (typeof value === 'string')
            merged[key] = value;
    }
    return { command: command.trim(), args: [...(args ?? [])], env: merged };
}
export function apply(ctx, config) {
    // Agent coordination is optional.  The official Electron Desktop does not
    // expose the Web Agent registry in every generation, while the market only
    // needs it when a Web/Host restart is explicitly requested.
    ctx.inject(['webServer', 'loader'], hostContext => {
        const host = hostContext;
        const localServices = hostContext;
        const readService = (name) => {
            const rootValue = ctx.get(name);
            if (rootValue !== undefined)
                return rootValue;
            return localServices.get?.(name);
        };
        const desktopProfiles = readService('desktopProfiles');
        const profileContext = readService('profileContext');
        const contextName = typeof profileContext?.name === 'string' ? profileContext.name.trim() : '';
        const contextDir = typeof profileContext?.dir === 'string' ? profileContext.dir.trim() : '';
        const configurationOverride = {
            home: typeof profileContext?.home === 'string' ? profileContext.home : undefined,
            patchPath: typeof profileContext?.patchPath === 'string' ? profileContext.patchPath : undefined,
            // Unknown overlay metadata is deliberately unsupported by automatic repair.
            overlays: Array.isArray(profileContext?.overlays) && profileContext.overlays.every(value => typeof value === 'string')
                ? profileContext.overlays : ['unknown-host-overlays'],
        };
        const configuredProfile = typeof config?.profile === 'string' ? config.profile.trim() : undefined;
        const launchedProfile = contextName !== '' ? contextName : argvProfile();
        const agents = readService('agents');
        const runtime = detectDshRuntime();
        const connection = () => readService('connection');
        const initialPluginManager = readService('pluginManager');
        const registryPlan = typeof initialPluginManager?.registries === 'function'
            ? async () => {
                const manager = readService('pluginManager');
                if (typeof manager?.registries !== 'function')
                    return undefined;
                try {
                    return normalizeOfficialRegistryPlan(await manager.registries());
                }
                catch {
                    return undefined;
                }
            }
            : undefined;
        const officialDesktop = desktopProfiles === undefined && (configuredProfile?.toLowerCase() === 'desktop'
            || (configuredProfile === undefined && launchedProfile?.toLowerCase() === 'desktop'));
        // Official Electron Desktop owns its profile through profileContext and
        // pluginManager; its CLI rejects `--profile desktop`. Resolve this branch
        // before the ordinary CLI fallback so actions mutate the visible profile.
        if (officialDesktop) {
            const profile = 'desktop';
            // An official Desktop generation may not expose profileContext.dir until
            // after startup. Never fall back to the Web profile in that case: the
            // canonical Desktop directory is the explicit profile name's directory.
            const profileDir = contextDir !== '' ? contextDir : resolveProfileDir(profile);
            const runner = officialDesktopRunner(() => readService('pluginManager'), runtime, hostContext, {
                profileDir,
                packageManager: () => hostPnpmInvocationOf(profileContext),
            });
            host.effect(() => mountRoutes(host, { profile, profileDir, runner, hostKind: 'desktop', runtime, agents: undefined, connection, configurationOverride }), 'dsh-skin-market: official Desktop routes');
            return;
        }
        if (desktopProfiles === undefined) {
            const profile = configuredProfile ?? launchedProfile ?? 'web';
            const profileDir = configuredProfile === undefined && contextDir !== '' ? contextDir : resolveProfileDir(profile);
            const appExit = readService('appExit');
            const restart = appExit === undefined ? undefined : createCliRestartScheduler(appExit);
            host.effect(() => mountRoutes(host, { profile, profileDir, runner: createPluginCliRunner(registryPlan), hostKind: 'dsh', runtime, restart, agents, connection, configurationOverride }), 'dsh-skin-market: routes');
            return;
        }
        hostContext.inject(['desktopPnpm'], desktopContext => {
            const current = desktopProfiles.current;
            const service = desktopContext.desktopPnpm;
            const desktopHost = desktopContext;
            desktopHost.effect(() => mountRoutes(host, { profile: current.name, profileDir: current.dir, runner: desktopRunner(service, current.dir), hostKind: 'desktop', runtime, agents, connection }), 'dsh-skin-market: desktop routes');
        });
    });
}
export { mountRoutes } from './routes.js';
export { SkinLifecycle } from './lifecycle.js';
