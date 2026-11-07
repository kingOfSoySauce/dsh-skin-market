/**
 * Star history curves for the detail panel. Pure geometry and parsing only:
 * both the website and the plugin import this file, so it must not touch Node.
 *
 * The chart is a single line with no axes. Values are cumulative star counts,
 * one per UTC day. The last point is the current count.
 */
export const STAR_CURVES_PATH = 'data/star-curves.json';
const MAX_POINTS = 72;
/** Evenly thin a series while always keeping the final value. */
export function downsample(values, maxPoints = MAX_POINTS) {
    if (values.length <= maxPoints)
        return values;
    const last = values.length - 1;
    const picked = [];
    for (let index = 0; index < maxPoints - 1; index += 1) {
        picked.push(values[Math.round((index / (maxPoints - 1)) * last)]);
    }
    picked.push(values[last]);
    return picked;
}
/**
 * Cumulative counts only move in steps, so joined samples read as a staircase.
 * A short centred average rounds the treads into a curve without moving the
 * first or the last value: the endpoint still marks today's real count.
 */
export function soften(values, passes = 3) {
    if (values.length < 5)
        return values;
    let current = values.slice();
    for (let pass = 0; pass < passes; pass += 1) {
        const next = current.slice();
        for (let index = 1; index < current.length - 1; index += 1) {
            next[index] = (current[index - 1] + current[index] * 2 + current[index + 1]) / 4;
        }
        current = next;
    }
    return current;
}
/**
 * Monotone cubic interpolation (Fritsch–Carlson). Star totals never decrease,
 * so the curve must not overshoot between samples: with ordinary splines a
 * flat day followed by a jump produces a visible hump that reads as noise.
 * This construction is smooth and monotone by design, which is what removes
 * the jitter while keeping a real tangent between days.
 */
function monotonePath(xy) {
    const n = xy.length;
    const delta = [];
    for (let index = 0; index < n - 1; index += 1) {
        const dx = xy[index + 1].x - xy[index].x || 1e-6;
        delta.push((xy[index + 1].y - xy[index].y) / dx);
    }
    const slope = new Array(n);
    slope[0] = delta[0];
    slope[n - 1] = delta[n - 2];
    for (let index = 1; index < n - 1; index += 1) {
        slope[index] = delta[index - 1] * delta[index] <= 0 ? 0 : (delta[index - 1] + delta[index]) / 2;
    }
    for (let index = 0; index < n - 1; index += 1) {
        if (delta[index] === 0) {
            slope[index] = 0;
            slope[index + 1] = 0;
            continue;
        }
        const alpha = slope[index] / delta[index];
        const beta = slope[index + 1] / delta[index];
        const magnitude = alpha * alpha + beta * beta;
        if (magnitude > 9) {
            const scale = 3 / Math.sqrt(magnitude);
            slope[index] = scale * alpha * delta[index];
            slope[index + 1] = scale * beta * delta[index];
        }
    }
    let d = `M${round(xy[0].x)} ${round(xy[0].y)}`;
    for (let index = 0; index < n - 1; index += 1) {
        const dx = (xy[index + 1].x - xy[index].x) / 3;
        const c1 = { x: xy[index].x + dx, y: xy[index].y + slope[index] * dx };
        const c2 = { x: xy[index + 1].x - dx, y: xy[index + 1].y - slope[index + 1] * dx };
        d += ` C${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(xy[index + 1].x)} ${round(xy[index + 1].y)}`;
    }
    return d;
}
export function sparklineGeometry(values, width, height, pad = 3) {
    const clean = values.filter(value => Number.isFinite(value));
    if (clean.length < 2 || width <= 0 || height <= 0)
        return undefined;
    const lastIndex = clean.length - 1;
    const points = downsample(soften(clean, 5), 48);
    const low = Math.min(...clean);
    const high = Math.max(...clean);
    const span = high - low || 1;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;
    const xy = points.map((value, index) => ({
        x: pad + (index / (points.length - 1)) * innerW,
        y: pad + innerH - ((value - low) / span) * innerH,
        value,
        ratio: index / (points.length - 1),
    }));
    const d = monotonePath(xy);
    return {
        d,
        end: { x: xy[xy.length - 1].x, y: xy[xy.length - 1].y },
        points: xy.map(point => ({ x: point.x, y: point.y, value: point.value, ratio: point.ratio })),
        dayOf: (ratio) => Math.round(ratio * lastIndex),
    };
}
function round(value) {
    return Math.round(value * 100) / 100;
}
/** Tolerant reader: a malformed or partial file yields no curves, never a throw. */
export function parseStarCurves(value) {
    if (value === null || typeof value !== 'object')
        return {};
    const repos = value.repos;
    if (repos === null || typeof repos !== 'object')
        return {};
    const curves = {};
    for (const [slug, raw] of Object.entries(repos)) {
        if (raw === null || typeof raw !== 'object')
            continue;
        const from = raw.from;
        const stars = raw.stars;
        if (!Number.isInteger(from) || !Array.isArray(stars))
            continue;
        const values = stars.filter(item => Number.isInteger(item) && item >= 0);
        if (values.length < 2)
            continue;
        curves[slug] = { from: from, stars: values };
    }
    return curves;
}
export function curveEntry(curves, repo) {
    const slug = String(repo ?? '').replace(/^https:\/\/github\.com\//i, '').replace(/\/$/, '');
    return curves[slug] ?? curves[slug.toLowerCase()];
}
export function curveFor(curves, repo) {
    return curveEntry(curves, repo)?.stars;
}
/** "11月6日" / "Nov 6" for the hover readout. */
export function curveDayLabel(from, index, language) {
    const date = new Date((from + index) * 86_400_000);
    if (language.startsWith('zh'))
        return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
}
