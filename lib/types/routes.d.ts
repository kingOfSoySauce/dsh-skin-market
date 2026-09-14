import type { IncomingMessage, ServerResponse } from 'node:http';
import { CatalogStore } from './catalog.ts';
import { SkinLifecycle, type LifecycleHost } from './lifecycle.ts';
import type { PluginRunner } from './commands.ts';
import type { DshRuntime, MarketHostKind, Operation } from './types.ts';
import type { RestartScheduler } from './restart.ts';
import { type MarketUpdater } from './self-update.ts';
export interface WebServerService {
    register(route: {
        kind: 'exact' | 'prefix';
        path: string;
        handler(request: IncomingMessage, response: ServerResponse): void | Promise<void>;
    }): () => void;
}
export interface AgentLike {
    status: 'idle' | 'running';
    whenIdle(): Promise<void>;
}
export interface AgentRegistryLike {
    list(): AgentLike[];
}
export interface SkinMarketHost extends LifecycleHost {
    webServer: WebServerService;
    agents: AgentRegistryLike;
}
export interface RouteOptions {
    profile: string;
    profileDir: string;
    runner: PluginRunner;
    hostKind?: MarketHostKind;
    runtime?: DshRuntime;
    restart?: RestartScheduler;
    catalogStore?: CatalogStore;
    marketUpdater?: MarketUpdater;
}
export declare function canRestartSkin(state: ReturnType<SkinLifecycle['states']>[number] | undefined): boolean;
export declare function runningAgentCount(host: Pick<SkinMarketHost, 'agents'>): number;
export declare function restartBlockingOperations(operations: readonly Operation[]): Operation[];
export declare function assertRestartClearOfSkinOperations(operations: readonly Operation[], marketUpdate?: {
    phase: string;
} | null): void;
export declare function waitForRestartSafety(host: Pick<SkinMarketHost, 'agents'>): Promise<void>;
export declare function mountRoutes(host: SkinMarketHost, options: RouteOptions): () => void;
