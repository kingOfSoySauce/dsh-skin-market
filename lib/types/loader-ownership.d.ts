export interface LoaderIdentity {
    id?: string;
    name?: string;
    packageName?: string;
}
/**
 * Return only loader rows introduced by `insert` operations.
 * Top-level patch operations can be overrides or other Cordis instructions;
 * treating their id as package ownership is the source of the old false
 * conflict reports.
 */
export declare function parseInsertedLoaderRows(value: unknown, packageName?: string, rows?: LoaderIdentity[]): LoaderIdentity[];
/**
 * A loader registration is identified by `id` alone. `name` is the plugin that
 * implements the row, so several rows can legitimately share it: a skin's
 * inserted preset and the installed official plugin both load
 * `@deepseek-ai/dsh-agent-preset` under different ids. Comparing names turned
 * that shared implementation into a false install conflict.
 */
export declare function loaderIdentifiers(identity: LoaderIdentity): string[];
export declare function sharedLoaderIdentifiers(left: LoaderIdentity, right: LoaderIdentity): string[];
export declare function primaryLoaderCandidates(rows: readonly LoaderIdentity[], packageName: string): LoaderIdentity[];
