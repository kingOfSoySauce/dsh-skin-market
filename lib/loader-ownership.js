function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function identityFromRecord(value, packageName) {
    const id = typeof value.id === 'string' && value.id.length > 0 ? value.id : undefined;
    const name = typeof value.name === 'string' && value.name.length > 0 ? value.name : undefined;
    if (id === undefined && name === undefined)
        return null;
    return { id, name, packageName: packageName ?? name };
}
/**
 * Return only loader rows introduced by `insert` operations.
 * Top-level patch operations can be overrides or other Cordis instructions;
 * treating their id as package ownership is the source of the old false
 * conflict reports.
 */
export function parseInsertedLoaderRows(value, packageName, rows = []) {
    if (Array.isArray(value)) {
        for (const child of value)
            parseInsertedLoaderRows(child, packageName, rows);
        return rows;
    }
    if (!isRecord(value))
        return rows;
    const record = value;
    if (!Array.isArray(record.insert))
        return rows;
    for (const child of record.insert) {
        if (!isRecord(child))
            continue;
        const identity = identityFromRecord(child, packageName);
        if (identity !== null)
            rows.push(identity);
        parseInsertedLoaderRows(child, packageName, rows);
    }
    return rows;
}
/**
 * A loader registration is identified by `id` alone. `name` is the plugin that
 * implements the row, so several rows can legitimately share it: a skin's
 * inserted preset and the installed official plugin both load
 * `@deepseek-ai/dsh-agent-preset` under different ids. Comparing names turned
 * that shared implementation into a false install conflict.
 */
export function loaderIdentifiers(identity) {
    return identity.id === undefined || identity.id === '' ? [] : [identity.id];
}
export function sharedLoaderIdentifiers(left, right) {
    const rightValues = new Set(loaderIdentifiers(right));
    return [...new Set(loaderIdentifiers(left).filter(value => rightValues.has(value)))];
}
export function primaryLoaderCandidates(rows, packageName) {
    return rows.filter(row => row.name === packageName);
}
