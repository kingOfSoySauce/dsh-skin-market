/**
 * Star history curves for the detail panel. Pure geometry and parsing only:
 * both the website and the plugin import this file, so it must not touch Node.
 *
 * The chart is a single line with no axes. Values are cumulative star counts,
 * one per UTC day. The last point is the current count.
 */
export declare const STAR_CURVES_PATH = "data/star-curves.json";
/** Each entry is the cumulative star count for consecutive UTC days from `from`. */
export interface StarCurve {
    from: number;
    stars: number[];
}
export interface StarCurvesFile {
    schemaVersion: number;
    generatedAt: string;
    repos: Record<string, StarCurve>;
}
export interface SparkPoint {
    x: number;
    y: number;
    value: number;
    /** Position in the original series, 0..1, so callers can recover the date. */
    ratio: number;
}
export interface SparklineGeometry {
    d: string;
    end: {
        x: number;
        y: number;
    };
    points: SparkPoint[];
    /** Map a point ratio back to an index in the original series. */
    dayOf: (ratio: number) => number;
}
/** Evenly thin a series while always keeping the final value. */
export declare function downsample(values: number[], maxPoints?: number): number[];
/**
 * Cumulative counts only move in steps, so joined samples read as a staircase.
 * A short centred average rounds the treads into a curve without moving the
 * first or the last value: the endpoint still marks today's real count.
 */
export declare function soften(values: number[], passes?: number): number[];
export declare function sparklineGeometry(values: number[], width: number, height: number, pad?: number): SparklineGeometry | undefined;
/** Tolerant reader: a malformed or partial file yields no curves, never a throw. */
export declare function parseStarCurves(value: unknown): Record<string, StarCurve>;
export declare function curveEntry(curves: Record<string, StarCurve>, repo: string): StarCurve | undefined;
export declare function curveFor(curves: Record<string, StarCurve>, repo: string): number[] | undefined;
/** "11月6日" / "Nov 6" for the hover readout. */
export declare function curveDayLabel(from: number, index: number, language: string): string;
