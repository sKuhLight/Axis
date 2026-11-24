// Static transfer curves for compressors and gates / expanders, for the read-only graph tiles.
//
// Computes: output level (dB) against input level (dB) for a soft-knee downward compressor and a soft-knee downward
// expander / gate with an optional range floor, a dry/wet mix blend of two levels, a sensible plotting window around
// the threshold range and a whole sampled curve.
//
// Own math, no editor-derived constants. The compressor is the textbook soft-knee gain computer of Giannoulis,
// Massberg & Reiss, "Digital Dynamic Range Compressor Design — A Tutorial and Analysis" (JAES 2012); the expander is
// its mirror image below the threshold. The mix blend adds the two signals as coherent amplitudes.
//
// Assumptions:
//   - knee labels map to the illustrative widths in KNEE_DB; a missing / unknown knee is drawn as MODEL_KNEE and
//     flagged `assumed`;
//   - compressor: a ratio ≤ 1 / NaN is drawn as identity; a ratio of +Infinity is a brick-wall limiter (slope 0);
//   - gate: a type with a range but no ratio is drawn with GATE_RATIO_NO_RATIO (a hard gate); with an infinite ratio
//     the knee is ignored (hard); the range is a depth — its sign is ignored and it is always applied as attenuation
//     (output never below input − |range|); everything is floored at GATE_FLOOR_DB so no −Infinity reaches a plot;
//   - the mix blend treats wet and dry as phase-coherent (in-phase) copies of the same signal;
//   - static curve only — attack / release / look-ahead are not modelled.
//
// Pure — no DOM, no Svelte (dynamics.test.ts).

// ── constants ────────────────────────────────────────────────────────────────────────────────────

/** Illustrative (ours): knee widths in dB for the knee-type labels. */
export const KNEE_DB = { HARD: 0, 'MED-HARD': 3, MEDIUM: 6, 'MED-SOFT': 12, SOFT: 18 } as const;
export type KneeLabel = keyof typeof KNEE_DB;
/** Illustrative (ours): knee drawn when the knee type is missing or unknown. */
export const MODEL_KNEE: KneeLabel = 'MEDIUM';
/**
 * Illustrative (ours): ratio used for a gate type that exposes a range but no ratio — an ideal (infinitely steep) gate:
 * below the threshold the output drops straight to input + range.
 */
export const GATE_RATIO_NO_RATIO = Infinity;
/** Illustrative (ours): lowest level any curve returns, so a closed gate never yields −Infinity. */
export const GATE_FLOOR_DB = -200;
/** Illustrative (ours): the plot window reaches this far below the lowest threshold … */
export const DYNAMICS_WINDOW_BELOW_DB = 12;
/** Illustrative (ours): … and this far above max(highest threshold, 0 dB). */
export const DYNAMICS_WINDOW_ABOVE_DB = 6;
/** Illustrative (ours): window used when the threshold range is not usable. */
export const DYNAMICS_WINDOW_FALLBACK: readonly [number, number] = [-72, 26];

// ── knee ─────────────────────────────────────────────────────────────────────────────────────────

const KNEE_BY_KEY: Readonly<Record<string, KneeLabel>> = {
  HARD: 'HARD',
  MEDHARD: 'MED-HARD',
  MEDIUMHARD: 'MED-HARD',
  MEDIUM: 'MEDIUM',
  MED: 'MEDIUM',
  MEDSOFT: 'MED-SOFT',
  MEDIUMSOFT: 'MED-SOFT',
  SOFT: 'SOFT'
};

/** Knee label → width in dB. Missing / unknown → MODEL_KNEE with `assumed: true`. */
export function kneeWidth(label: string | null | undefined): { width: number; label: string; assumed: boolean } {
  const key = typeof label === 'string' ? label.toUpperCase().replace(/[^A-Z]/g, '') : '';
  if (Object.prototype.hasOwnProperty.call(KNEE_BY_KEY, key)) {
    const k = KNEE_BY_KEY[key]!;
    return { width: KNEE_DB[k], label: k, assumed: false };
  }
  return { width: KNEE_DB[MODEL_KNEE], label: MODEL_KNEE, assumed: true };
}

// ── curves ───────────────────────────────────────────────────────────────────────────────────────

const kneeOf = (w: number): number => (Number.isFinite(w) && w > 0 ? w : 0);
const floorDb = (y: number): number => (Number.isNaN(y) ? y : Math.max(y, GATE_FLOOR_DB));

/**
 * Soft-knee compressor (Giannoulis/Massberg/Reiss): below the knee y = x; inside it
 * y = x + (1/R − 1)(x − T + W/2)²/(2W); above it y = T + (x − T)/R. W = 0 is a hard knee.
 */
export function compCurve(x: number, T: number, R: number, W: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(T)) return x;
  // R ≤ 1 / NaN / −Infinity → identity; +Infinity → limiter (1/R = 0).
  const inv = R === Infinity ? 0 : Number.isFinite(R) && R > 1 ? 1 / R : 1;
  const w = kneeOf(W);
  const d2 = 2 * (x - T);
  if (d2 < -w) return x;
  if (w > 0 && Math.abs(d2) <= w) return x + ((inv - 1) * (x - T + w / 2) ** 2) / (2 * w);
  return T + (x - T) * inv;
}

/**
 * Soft-knee downward expander / gate: above the knee y = x; inside it y = x − (R − 1)(T + W/2 − x)²/(2W); below it
 * y = T + R(x − T); then never lower than x − |range| (when range is finite) and never lower than GATE_FLOOR_DB.
 * R = Infinity is a hard gate (knee ignored).
 */
export function gateCurve(x: number, T: number, R: number, W: number, rangeDb?: number | null): number {
  if (!Number.isFinite(x) || !Number.isFinite(T)) return x;
  const r = R === Infinity ? Infinity : Number.isFinite(R) && R > 1 ? R : 1;
  const w = r === Infinity ? 0 : kneeOf(W);
  let y: number;
  if (x >= T + w / 2) y = x;
  else if (w > 0 && Math.abs(x - T) < w / 2) y = x - ((r - 1) * (T + w / 2 - x) ** 2) / (2 * w);
  else y = r === Infinity ? -Infinity : T + r * (x - T);
  if (typeof rangeDb === 'number' && Number.isFinite(rangeDb)) y = Math.max(y, x - Math.abs(rangeDb));
  return floorDb(y);
}

/** Coherent dry/wet blend in dB: 20·log10(m·10^(wet/20) + (1 − m)·10^(dry/20)); m ≤ 0 → dry, m ≥ 1 → wet. */
export function mixBlend(wetDb: number, dryDb: number, mix01: number): number {
  if (!Number.isFinite(mix01)) return wetDb;
  if (mix01 <= 0) return dryDb;
  if (mix01 >= 1) return wetDb;
  const lin = mix01 * 10 ** (wetDb / 20) + (1 - mix01) * 10 ** (dryDb / 20);
  return floorDb(20 * Math.log10(lin));
}

/** Plot window [thrMin − 12, max(thrMax, 0) + 6] dB; DYNAMICS_WINDOW_FALLBACK for unusable input. */
export function dynamicsWindow(thrMin: number, thrMax: number): [number, number] {
  if (!Number.isFinite(thrMin) || !Number.isFinite(thrMax)) return [DYNAMICS_WINDOW_FALLBACK[0], DYNAMICS_WINDOW_FALLBACK[1]];
  const lo = Math.min(thrMin, thrMax);
  const hi = Math.max(thrMin, thrMax);
  return [lo - DYNAMICS_WINDOW_BELOW_DB, Math.max(hi, 0) + DYNAMICS_WINDOW_ABOVE_DB];
}

// ── trace ────────────────────────────────────────────────────────────────────────────────────────

export interface DynamicsSpec {
  mode: 'compressor' | 'gate';
  threshold: number;
  ratio: number;
  kneeDb: number;
  levelDb?: number;
  mix01?: number;
  rangeDb?: number | null;
}

/**
 * Sampled transfer curve: x evenly over the window (inclusive ends); y = curve → mix blend (when mix01 < 1) → + level.
 * Fewer than two samples → empty arrays; an unusable window → DYNAMICS_WINDOW_FALLBACK.
 */
export function dynamicsTrace(spec: DynamicsSpec, window: [number, number], samples: number): { x: number[]; y: number[] } {
  const n = Number.isFinite(samples) ? Math.floor(samples) : 0;
  if (n < 2) return { x: [], y: [] };
  const ok = Array.isArray(window) && Number.isFinite(window[0]) && Number.isFinite(window[1]) && window[0] !== window[1];
  const [w0, w1] = ok ? window : DYNAMICS_WINDOW_FALLBACK;
  const level = typeof spec.levelDb === 'number' && Number.isFinite(spec.levelDb) ? spec.levelDb : 0;
  const mix = typeof spec.mix01 === 'number' && Number.isFinite(spec.mix01) && spec.mix01 < 1 ? spec.mix01 : null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = i === n - 1 ? w1 : w0 + ((w1 - w0) * i) / (n - 1);
    let y =
      spec.mode === 'gate'
        ? gateCurve(x, spec.threshold, spec.ratio, spec.kneeDb, spec.rangeDb)
        : compCurve(x, spec.threshold, spec.ratio, spec.kneeDb);
    if (mix !== null) y = mixBlend(y, x, mix);
    xs.push(x);
    ys.push(y + level);
  }
  return { x: xs, y: ys };
}
