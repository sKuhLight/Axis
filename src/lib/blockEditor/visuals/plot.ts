// Plot helpers for the read-only graph tiles: scale mapping, SVG path strings, axis ticks and tick-label formatters.
//
// Computes: linear and log10 value → pixel maps, an SVG polyline path (broken at non-finite points) and a closed area
// path under it, "nice" 1/2/5 linear ticks, 1/2/5-per-decade frequency ticks, and compact labels for Hz, dB, s, ms.
//
// Own math, no editor-derived constants. Nice ticks use the common 1/2/5 step rounding (thresholds 1.5 / 3 / 7, as in
// Heckbert's "Nice numbers for graph labels", Graphics Gems 1990).
//
// Assumptions:
//   - path coordinates are rounded to 2 decimals (sub-pixel enough for SVG, keeps strings short);
//   - log ticks are kept when fmin ≤ tick ≤ fmax (inclusive; for 20 Hz..20 kHz that includes the 20k edge tick);
//   - labels use a real minus sign (U+2212); a value that cannot be formatted shows NO_VALUE ('—').
//
// Pure — no DOM, no Svelte (plot.test.ts).

import { NO_VALUE } from './tempo';

const MINUS = '−';

// ── scales ───────────────────────────────────────────────────────────────────────────────────────

/** Linear map of v from [d0, d1] to [r0, r1]. A zero-width domain or a non-finite input → r0. */
export function linMap(v: number, d0: number, d1: number, r0: number, r1: number): number {
  if (!Number.isFinite(v) || !Number.isFinite(d0) || !Number.isFinite(d1) || d0 === d1) return r0;
  return r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}

/** Log10 map of v from [d0, d1] to [r0, r1]. Non-positive / non-finite v or domain → r0. */
export function logMap(v: number, d0: number, d1: number, r0: number, r1: number): number {
  if (!(v > 0) || !(d0 > 0) || !(d1 > 0) || !Number.isFinite(v) || !Number.isFinite(d0) || !Number.isFinite(d1)) return r0;
  return linMap(Math.log10(v), Math.log10(d0), Math.log10(d1), r0, r1);
}

// ── paths ────────────────────────────────────────────────────────────────────────────────────────

/** Round to 2 decimals for path output (−0 prints as 0). */
const r2 = (v: number): string => String(Math.round(v * 100) / 100 + 0);

/** Runs of consecutive points where both coordinates are finite. */
function finiteRuns(xs: readonly number[], ys: readonly number[]): [number, number][][] {
  const runs: [number, number][][] = [];
  let cur: [number, number][] = [];
  const n = Math.min(xs.length, ys.length);
  for (let i = 0; i < n; i++) {
    const x = xs[i]!;
    const y = ys[i]!;
    if (Number.isFinite(x) && Number.isFinite(y)) cur.push([x, y]);
    else if (cur.length) {
      runs.push(cur);
      cur = [];
    }
  }
  if (cur.length) runs.push(cur);
  return runs;
}

/** SVG path 'M x y L x y …' (2 decimals). A non-finite point breaks the line; the next finite point starts a new M. */
export function pathFrom(xs: readonly number[], ys: readonly number[]): string {
  return finiteRuns(xs, ys)
    .map((run) => run.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${r2(x)} ${r2(y)}`).join(' '))
    .join(' ');
}

/** Closed fill path between the line and y = baseY: one closed polygon per finite run. Empty / invalid base → ''. */
export function areaPathFrom(xs: readonly number[], ys: readonly number[], baseY: number): string {
  if (!Number.isFinite(baseY)) return '';
  const b = r2(baseY);
  return finiteRuns(xs, ys)
    .map((run) => {
      const first = run[0]!;
      const last = run[run.length - 1]!;
      const line = run.map(([x, y]) => `L${r2(x)} ${r2(y)}`).join(' ');
      return `M${r2(first[0])} ${b} ${line} L${r2(last[0])} ${b} Z`;
    })
    .join(' ');
}

// ── ticks ────────────────────────────────────────────────────────────────────────────────────────

/** Illustrative (ours): hard cap on generated ticks (guards a degenerate range / count). */
export const MAX_TICKS = 1000;
/** Illustrative (ours): tick count `niceTicks` aims for when `approxCount` is unusable. */
export const DEFAULT_TICK_COUNT = 5;

/** Ticks at a "nice" 1/2/5 × 10^k step covering [min, max] (about `approxCount` of them). */
export function niceTicks(min: number, max: number, approxCount: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  if (lo === hi) return [lo];
  const count = Number.isFinite(approxCount) && approxCount >= 1 ? approxCount : DEFAULT_TICK_COUNT;
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const decimals = Math.min(20, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
  const first = Math.ceil(lo / step - 1e-9);
  const last = Math.floor(hi / step + 1e-9);
  const out: number[] = [];
  for (let k = first; k <= last && out.length < MAX_TICKS; k++) out.push(Number((k * step).toFixed(decimals)) + 0);
  return out;
}

/** Frequency ticks at 1, 2, 5 × 10^k within [fmin, fmax] (20, 50, 100, 200, 500, 1k, … for an audio axis). */
export function logTicks(fmin: number, fmax: number): number[] {
  if (!(fmin > 0) || !(fmax > 0) || !Number.isFinite(fmin) || !Number.isFinite(fmax)) return [];
  const lo = Math.min(fmin, fmax);
  const hi = Math.max(fmin, fmax);
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)) && out.length < MAX_TICKS; e++) {
    for (const m of [1, 2, 5]) {
      const v = Number((m * 10 ** e).toPrecision(12));
      if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) out.push(v);
    }
  }
  return out;
}

// ── formatters ───────────────────────────────────────────────────────────────────────────────────

/** v with up to `d` decimals, trailing zeros dropped (2.50 → '2.5', 1.0 → '1'). */
const trim = (v: number, d: number): string => String(Number(v.toFixed(d)) + 0);

/** Frequency tick label without unit: '20', '450', '1k', '1.2k', '10k'. */
export function fmtHz(f: number): string {
  if (!Number.isFinite(f)) return NO_VALUE;
  const a = Math.abs(f);
  const sign = f < 0 ? MINUS : '';
  if (a >= 999.5) {
    const k = a / 1000;
    return `${sign}${k >= 9.95 ? Math.round(k) : trim(k, 1)}k`;
  }
  return `${sign}${a >= 9.5 ? Math.round(a) : trim(a, 1)}`;
}

/** dB label: '+2 dB', '−18 dB', '0 dB', '+2.5 dB' (one decimal below 10 dB, whole dB above). */
export function fmtDb(db: number, signed = true): string {
  if (Number.isNaN(db)) return NO_VALUE;
  if (db === Infinity) return `${signed ? '+' : ''}∞ dB`;
  if (db === -Infinity) return `${MINUS}∞ dB`;
  const a = Math.abs(db);
  const body = a >= 9.95 ? String(Math.round(a)) : trim(a, 1);
  if (body === '0') return '0 dB';
  return `${db < 0 ? MINUS : signed ? '+' : ''}${body} dB`;
}

/** Milliseconds label: '2.5 ms' below 10 ms, whole ms above ('250 ms', '1500 ms'). */
export function fmtMs(ms: number): string {
  if (!Number.isFinite(ms)) return NO_VALUE;
  if (ms < 0) return `${MINUS}${fmtMs(-ms)}`;
  return ms < 9.95 ? `${trim(ms, 1)} ms` : `${Math.round(ms)} ms`;
}

/** Seconds label: below 1 s as ms ('250 ms'), then '2.5 s' (one decimal, trimmed) below 10 s, whole seconds above. */
export function fmtSec(s: number): string {
  if (!Number.isFinite(s)) return NO_VALUE;
  if (s < 0) return `${MINUS}${fmtSec(-s)}`;
  if (Math.round(s * 1000) < 1000) return fmtMs(s * 1000);
  return s < 9.95 ? `${trim(s, 1)} s` : `${Math.round(s)} s`;
}
