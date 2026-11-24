// LFO waveforms for the read-only graph tiles.
//
// Computes: one value in [−1, 1] of a textbook LFO shape at a phase p (sine, triangle, square, saw up / down,
// sample-and-hold random, log / exp bent triangles, trapezoid, an RC "astable" charge/discharge wave), an optional
// level quantiser (stepped LFO), a one-pole low-pass (high-cut smoothing) and a whole trace over a few cycles with an
// optional phase-shifted right channel.
//
// Own math, no editor-derived constants. Shapes are the textbook ones; the one-pole low-pass is the standard
// exponential smoother y += α(x − y) with α = 1 − e^{−2π·fc·dt}; the random source is an own integer hash.
//
// Assumptions:
//   - skew s splits the cycle into a rising limb [0, s) and a falling limb [s, 1) for triangle, sine, log, exp,
//     trapezoid and astable (s = 0.5 → symmetric); duty only affects the square;
//   - sine is skewed as a half-cosine per limb; trapezoid is the triangle doubled and clipped (flat tops half the
//     cycle); log / exp bend the triangle with LFO_CURVE_K; astable uses RC limbs with time constant LFO_ASTABLE_TAU
//     (a fraction of the limb length), each limb normalised to reach its end exactly;
//   - random is a sample-and-hold: one value per cycle, derived only from (seed, cycle index), where the cycle index
//     is `opts.cycle + floor(p)` so an unwrapped phase walks through successive cycles;
//   - the trace's right channel leads the left by `phaseDeg/360` of a cycle: r(p) = l(p + phaseDeg/360);
//   - the high-cut runs with LFO_HICUT_PREROLL_CYCLES of pre-roll so the drawn start is settled, and is skipped when
//     the cutoff is at least LFO_HICUT_SKIP_RATIO × the LFO rate (it would not visibly change the shape).
//
// Pure — no DOM, no Svelte (lfo.test.ts).

export type LfoShape = 'sine' | 'triangle' | 'square' | 'sawUp' | 'sawDown' | 'random' | 'log' | 'exp' | 'trapezoid' | 'astable';

export const LFO_SHAPES: readonly LfoShape[] = [
  'sine',
  'triangle',
  'square',
  'sawUp',
  'sawDown',
  'random',
  'log',
  'exp',
  'trapezoid',
  'astable'
];

// ── constants ────────────────────────────────────────────────────────────────────────────────────

/** Illustrative (ours): curvature of the log / exp bends (larger = more bent). */
export const LFO_CURVE_K = 4;
/** Illustrative (ours): RC time constant of the astable limbs, as a fraction of the limb length. */
export const LFO_ASTABLE_TAU = 0.3;
/** Default skew / duty: a symmetric wave. */
export const LFO_DEFAULT_SKEW = 0.5;
export const LFO_DEFAULT_DUTY = 0.5;
/** Illustrative (ours): skew / duty are clamped to [MIN, MAX] so no limb collapses to zero length. */
export const LFO_SHAPE_PARAM_MIN = 0.01;
export const LFO_SHAPE_PARAM_MAX = 0.99;
/** Illustrative (ours): cycles drawn by `lfoTrace` when the spec does not say. */
export const LFO_TRACE_CYCLES = 2;
/** Illustrative (ours): cycles of pre-roll fed through the high-cut so the drawn start is settled. */
export const LFO_HICUT_PREROLL_CYCLES = 2;
/** Illustrative (ours): the high-cut is skipped when its cutoff is at least this many times the LFO rate. */
export const LFO_HICUT_SKIP_RATIO = 50;
/** Illustrative (ours): upper bound on pre-roll samples, so a pathological spec cannot allocate without limit. */
export const LFO_MAX_PREROLL_SAMPLES = 100000;

// ── labels ───────────────────────────────────────────────────────────────────────────────────────

const SHAPE_BY_KEY: Readonly<Record<string, LfoShape>> = {
  SINE: 'sine',
  TRIANGLE: 'triangle',
  SQUARE: 'square',
  SAWUP: 'sawUp',
  SAWDOWN: 'sawDown',
  RANDOM: 'random',
  LOG: 'log',
  EXP: 'exp',
  TRAPEZOID: 'trapezoid',
  ASTABLE: 'astable'
};

/** Waveform label ('SINE', 'Saw Up', 'saw-down', …) → shape, or null when unknown. */
export function lfoShapeFromLabel(label: string | null | undefined): LfoShape | null {
  if (typeof label !== 'string') return null;
  const key = label.toUpperCase().replace(/[\s_-]+/g, '');
  return Object.prototype.hasOwnProperty.call(SHAPE_BY_KEY, key) ? SHAPE_BY_KEY[key]! : null;
}

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

const shapeParam = (v: number | undefined, dflt: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, LFO_SHAPE_PARAM_MIN, LFO_SHAPE_PARAM_MAX) : dflt;

/** Fractional part in [0, 1); non-finite → 0. */
const wrap = (p: number): number => {
  if (!Number.isFinite(p)) return 0;
  const w = p - Math.floor(p);
  return w >= 1 ? 0 : w;
};

/** Skewed triangle: −1 at 0, +1 at s, −1 at 1. */
const tri = (p: number, s: number): number => (p < s ? -1 + (2 * p) / s : 1 - (2 * (p - s)) / (1 - s));

/**
 * Own 32-bit integer hash of (seed, cycle) → [0, 1); no Math.random. The key combines seed and cycle with the public
 * golden-ratio (0x9e3779b1) and MurmurHash3 (0x85ebca6b) multipliers plus an arbitrary own offset (0x632be5ab), then
 * runs a public-domain xorshift-multiply finaliser ("lowbias32", 0x7feb352d / 0x846ca68b). These are hash-mixing
 * constants only — they shape no audio behaviour beyond "some well-spread value per cycle".
 */
function hash01(seed: number, cycle: number): number {
  let h = Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul((cycle | 0) + 0x632be5ab, 0x85ebca6b);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ── shapes ───────────────────────────────────────────────────────────────────────────────────────

export interface LfoValueOpts {
  skew?: number;
  duty?: number;
  seed?: number;
  cycle?: number;
}

/** One LFO value in [−1, 1] at phase p (any real p; wrapped into one cycle). */
export function lfoValue(shape: LfoShape, p: number, opts: LfoValueOpts = {}): number {
  const s = shapeParam(opts.skew, LFO_DEFAULT_SKEW);
  const w = wrap(p);
  switch (shape) {
    case 'triangle':
      return tri(w, s);
    case 'sine':
      return w < s ? -Math.cos((Math.PI * w) / s) : Math.cos((Math.PI * (w - s)) / (1 - s));
    case 'square':
      return w < shapeParam(opts.duty, LFO_DEFAULT_DUTY) ? 1 : -1;
    case 'sawUp':
      return 2 * w - 1;
    case 'sawDown':
      return 1 - 2 * w;
    case 'trapezoid':
      return clamp(2 * tri(w, s), -1, 1);
    case 'log': {
      const u = (tri(w, s) + 1) / 2;
      return (2 * Math.log(1 + LFO_CURVE_K * u)) / Math.log(1 + LFO_CURVE_K) - 1;
    }
    case 'exp': {
      const u = (tri(w, s) + 1) / 2;
      return (2 * (Math.exp(LFO_CURVE_K * u) - 1)) / (Math.exp(LFO_CURVE_K) - 1) - 1;
    }
    case 'astable': {
      const full = 1 - Math.exp(-1 / LFO_ASTABLE_TAU);
      // Rising limb charges 0 → 1, falling limb discharges 1 → 0; both normalised to end exactly on target.
      const y =
        w < s
          ? (1 - Math.exp(-w / s / LFO_ASTABLE_TAU)) / full
          : (Math.exp(-(w - s) / (1 - s) / LFO_ASTABLE_TAU) - Math.exp(-1 / LFO_ASTABLE_TAU)) / full;
      return clamp(2 * y - 1, -1, 1);
    }
    case 'random': {
      const seed = typeof opts.seed === 'number' && Number.isFinite(opts.seed) ? opts.seed : 0;
      const base = typeof opts.cycle === 'number' && Number.isFinite(opts.cycle) ? Math.floor(opts.cycle) : 0;
      const cycle = base + (Number.isFinite(p) ? Math.floor(p) : 0);
      return 2 * hash01(seed, cycle) - 1;
    }
    default:
      return 0;
  }
}

/**
 * Snap v ∈ [−1, 1] to `levels` evenly spaced values including both ends (2 → ±1, 3 → −1/0/1). `levels` < 2 / missing
 * → v unchanged. NaN → 0.
 */
export function quantize(v: number, levels: number | null | undefined): number {
  if (typeof v !== 'number' || Number.isNaN(v)) return 0;
  if (typeof levels !== 'number' || !Number.isFinite(levels) || levels < 2) return v;
  const steps = Math.floor(levels) - 1;
  const idx = Math.round(((clamp(v, -1, 1) + 1) / 2) * steps);
  return -1 + (2 * idx) / steps;
}

/** One-pole low-pass y += α(x − y), α = 1 − e^{−2π·fc·dt}, starting settled on the first sample. Invalid fc/dt → copy. */
export function onePoleLowpass(samples: readonly number[], cutoffHz: number, dt: number): number[] {
  const out = samples.map((x) => (Number.isFinite(x) ? x : 0));
  if (!Number.isFinite(cutoffHz) || cutoffHz <= 0 || !Number.isFinite(dt) || dt <= 0 || out.length === 0) return out;
  const alpha = 1 - Math.exp(-2 * Math.PI * cutoffHz * dt);
  let y = out[0]!;
  for (let i = 0; i < out.length; i++) {
    y += alpha * (out[i]! - y);
    out[i] = y;
  }
  return out;
}

// ── trace ────────────────────────────────────────────────────────────────────────────────────────

export interface LfoTraceSpec {
  shape: LfoShape;
  rateHz: number;
  skew?: number;
  duty?: number;
  quantize?: number | null;
  hicutHz?: number | null;
  /** Cycles drawn; default LFO_TRACE_CYCLES. */
  cycles?: number;
  phaseDeg?: number | null;
  seed?: number;
}

/**
 * `samples` points (inclusive ends) over `cycles` cycles: shape → quantise → high-cut. `r` is the same wave shifted by
 * `phaseDeg/360` of a cycle (r(p) = l(p + offset)) when `phaseDeg` is a finite non-zero number, else null.
 * Fewer than two samples → empty trace.
 */
export function lfoTrace(spec: LfoTraceSpec, samples: number): { l: number[]; r: number[] | null } {
  const n = Number.isFinite(samples) ? Math.floor(samples) : 0;
  const phaseDeg = spec.phaseDeg;
  const offset = typeof phaseDeg === 'number' && Number.isFinite(phaseDeg) && phaseDeg !== 0 ? phaseDeg / 360 : null;
  if (n < 2) return { l: [], r: offset === null ? null : [] };

  const cycles =
    typeof spec.cycles === 'number' && Number.isFinite(spec.cycles) && spec.cycles > 0 ? spec.cycles : LFO_TRACE_CYCLES;
  const step = cycles / (n - 1); // phase step per sample
  const rate = spec.rateHz;
  const hicut = typeof spec.hicutHz === 'number' && Number.isFinite(spec.hicutHz) ? spec.hicutHz : 0;
  const filter = hicut > 0 && Number.isFinite(rate) && rate > 0 && hicut < LFO_HICUT_SKIP_RATIO * rate;
  const pre = filter ? Math.min(Math.ceil(LFO_HICUT_PREROLL_CYCLES / step), LFO_MAX_PREROLL_SAMPLES) : 0;
  const opts: LfoValueOpts = { skew: spec.skew, duty: spec.duty, seed: spec.seed };

  const run = (shift: number): number[] => {
    const raw: number[] = [];
    for (let i = -pre; i < n; i++) raw.push(quantize(lfoValue(spec.shape, i * step + shift, opts), spec.quantize));
    if (!filter) return raw;
    return onePoleLowpass(raw, hicut, step / rate).slice(pre);
  };

  return { l: run(0), r: offset === null ? null : run(offset) };
}
