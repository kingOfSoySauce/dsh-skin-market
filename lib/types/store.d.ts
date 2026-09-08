import type { CommandOptions, PluginRunner } from './commands.ts';
/** Remove only pnpm staging dirs whose owning process is no longer alive. */
export declare function cleanOrphanedStoreTmp(storePath: string): string[];
/** Resolve the active pnpm store and reclaim safe orphan staging dirs. */
export declare function cleanOrphanedStore(run: PluginRunner, profile: string, operationId?: string, options?: CommandOptions): Promise<string[]>;
