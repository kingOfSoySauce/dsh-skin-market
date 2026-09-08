import type { Operation } from './types.ts';
/** Retain structured progress only; package/script output stays out of operation state. */
export declare class PnpmProgressTracker {
    private buffer;
    private readonly fetches;
    private samples;
    push(chunk: string, operation: Operation): void;
    private stage;
    private consume;
    private publish;
}
