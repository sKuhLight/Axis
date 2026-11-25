// Filter / EQ / wah magnitude responses for the read-only graph tiles.
//
// Computes: |H(jΩ)|² of textbook analog (s-domain) second-order filter sections (low-pass, high-pass, band-pass,
// notch, peaking, low / high shelf, tilt, all-pass), a whole response in dB over a frequency list (optionally 4th order
// and with extra low-cut / high-cut sections), a log-spaced frequency grid, and an idealised wah sweep.
//
// Own math, no editor-derived constants. The sections are the analog prototypes of R. Bristow-Johnson's public
// "Cookbook formulae for audio EQ biquad filter coefficients" with Ω = f/f0, A = 10^(G/40) and
// D = (1 − Ω²)² + (Ω/Q)². The analog prototype is drawn directly (no bilinear-transform warping near Nyquist).
//
// Assumptions:
//   - 4th order = the same second-order section twice (|H|² squared) for the pass / stop types only (low-pass,
//     high-pass, band-pass, notch); a peaking / shelf / tilt section stays second order (its order selects the
//     slope of a cut, and doubling a boost would claim twice the gain);
//   - low cut / high cut are 2nd-order Butterworth high-pass / low-pass sections (Q = 1/√2, 12 dB/oct);
//   - tilt = low shelf at −G/2 times high shelf at +G/2, both at the same f0 (0 dB at f0, ±G/2 at the extremes);
//   - band-pass is the constant-0-dB-peak form; responses are floored at RESPONSE_FLOOR_DB (a notch at exactly f0
//     would otherwise be −Infinity);
//   - combs, 'Null' and envelope / auto / touch wahs have no static response here → 'unsupported' (NaN; the caller
//     shows a note);
//   - wah: the sweep is a log-frequency taper between Start and Stop (the device's taper parameter semantics are
//     unknown and not modelled); the filter is an idealised resonant band-pass with its peak normalised to 0 dB.
//
// Pure — no DOM, no Svelte (response.test.ts).

export type FilterType =
  | 'lowpass'
  | 'highpass'
  | 'bandpass'
  | 'notch'
  | 'peaking'
  | 'lowshelf'
  | 'highshelf'
  | 'tilt'
  | 'allpass'
  | 'unsupported';

// ── constants ────────────────────────────────────────────────────────────────────────────────────

/** Butterworth Q (textbook): maximally flat second-order section; also the fallback for a missing / invalid Q. */
export const BUTTERWORTH_Q = Math.SQRT1_2;
/** Illustrative (ours): lowest dB any response returns (keeps a notch at exactly f0 off −Infinity). */
export const RESPONSE_FLOOR_DB = -120;
/** Illustrative (ours): lowest Q the wah band-pass is drawn with. */
export const WAH_Q_MIN = 0.5;

// ── labels ───────────────────────────────────────────────────────────────────────────────────────

const TYPE_BY_KEY: Readonly<Record<string, FilterType>> = {
  lowpass: 'lowpass',
  lpf: 'lowpass',
  highpass: 'highpass',
  hpf: 'highpass',
  bandpass: 'bandpass',
  bpf: 'bandpass',
  notch: 'notch',
  bandstop: 'notch',
  peaking: 'peaking',
  peak: 'peaking',
  lowshelf: 'lowshelf',
  highshelf: 'highshelf',
  tilt: 'tilt',
  tilteq: 'tilt',
  allpass: 'allpass'
};

/**
 * Block / filter type name → FilterType ('Low-Pass', 'LOWPASS', 'Low Pass', 'Low-Shelf 2', 'Tilt EQ', 'All-Pass', …).
 * Matching ignores case, spaces, hyphens and digits; anything else (combs, 'Null', wahs, …) → 'unsupported'.
 */
export function typeFromLabel(label: string | null | undefined): FilterType {
  if (typeof label !== 'string') return 'unsupported';
  const key = label.toLowerCase().replace(/[^a-z]/g, '');
  return Object.prototype.hasOwnProperty.call(TYPE_BY_KEY, key) ? TYPE_BY_KEY[key]! : 'unsupported';
}

// ── sections ─────────────────────────────────────────────────────────────────────────────────────

/** |H(jΩ)|² of the RBJ analog low shelf H(s) = A·(s² + (√A/Q)s + A)/(A·s² + (√A/Q)s + 1). */
function lowShelfMagSq(w: number, q: number, gainDb: number): number {
  const A = 10 ** (gainDb / 40);
  const w2 = w * w;
  const mid = (A * w2) / (q * q); // ((√A/Q)·Ω)²
  return (A * A * ((A - w2) ** 2 + mid)) / ((1 - A * w2) ** 2 + mid);
}

/** |H(jΩ)|² of the RBJ analog high shelf H(s) = A·(A·s² + (√A/Q)s + 1)/(s² + (√A/Q)s + A). */
function highShelfMagSq(w: number, q: number, gainDb: number): number {
  const A = 10 ** (gainDb / 40);
  const w2 = w * w;
  const mid = (A * w2) / (q * q);
  return (A * A * ((1 - A * w2) ** 2 + mid)) / ((A - w2) ** 2 + mid);
}

/** |H(jΩ)|² of one analog second-order section at Ω = f/f0. Invalid Ω → NaN; invalid Q → Butterworth Q. */
export function sectionMagSq(type: FilterType, omega: number, q: number, gainDb: number): number {
  if (!Number.isFinite(omega) || omega < 0) return NaN;
  const Q = Number.isFinite(q) && q > 0 ? q : BUTTERWORTH_Q;
  const G = Number.isFinite(gainDb) ? gainDb : 0;
  const w2 = omega * omega;
  const re2 = (1 - w2) ** 2;
  const D = re2 + (omega / Q) ** 2;
  switch (type) {
    case 'lowpass':
      return 1 / D;
    case 'highpass':
      return (w2 * w2) / D;
    case 'bandpass':
      return (omega / Q) ** 2 / D;
    case 'notch':
      return re2 / D;
    case 'peaking': {
      const A = 10 ** (G / 40);
      return (re2 + ((omega * A) / Q) ** 2) / (re2 + (omega / (A * Q)) ** 2);
    }
    case 'lowshelf':
      return lowShelfMagSq(omega, Q, G);
    case 'highshelf':
      return highShelfMagSq(omega, Q, G);
    case 'tilt':
      return lowShelfMagSq(omega, Q, -G / 2) * highShelfMagSq(omega, Q, G / 2);
    case 'allpass':
      return 1;
    default:
      return NaN;
  }
}

const toDb = (magSq: number): number => {
  if (Number.isNaN(magSq)) return NaN;
  return magSq > 0 ? Math.max(10 * Math.log10(magSq), RESPONSE_FLOOR_DB) : RESPONSE_FLOOR_DB;
};

const positive = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

// ── responses ────────────────────────────────────────────────────────────────────────────────────

export interface FilterSpec {
  type: FilterType;
  freq: number;
  q: number;
  gainDb?: number;
  order?: 2 | 4;
  lowCut?: number | null;
  highCut?: number | null;
}

/** Response in dB at each frequency. 'unsupported' / invalid f0 → all NaN; an invalid frequency → NaN at that point. */
/** Types a 4th order squares (pass / stop responses); the others ignore `order`. */
export const FOURTH_ORDER_TYPES: ReadonlySet<FilterType> = new Set<FilterType>(['lowpass', 'highpass', 'bandpass', 'notch']);

export function filterResponse(spec: FilterSpec, freqs: readonly number[]): number[] {
  const f0 = positive(spec.freq);
  if (spec.type === 'unsupported' || f0 === null) return freqs.map(() => NaN);
  const gain = typeof spec.gainDb === 'number' && Number.isFinite(spec.gainDb) ? spec.gainDb : 0;
  const lc = positive(spec.lowCut);
  const hc = positive(spec.highCut);
  return freqs.map((f) => {
    if (!Number.isFinite(f) || f <= 0) return NaN;
    let m = sectionMagSq(spec.type, f / f0, spec.q, gain);
    if (spec.order === 4 && FOURTH_ORDER_TYPES.has(spec.type)) m *= m;
    if (lc !== null) m *= sectionMagSq('highpass', f / lc, BUTTERWORTH_Q, 0);
    if (hc !== null) m *= sectionMagSq('lowpass', f / hc, BUTTERWORTH_Q, 0);
    return toDb(m);
  });
}

/** `n` log-spaced frequencies from fmin to fmax (both ends exact). n < 1 → []; invalid bounds → 20 Hz / 20 kHz. */
export function logFreqs(n: number, fmin = 20, fmax = 20000): number[] {
  const count = Number.isFinite(n) ? Math.floor(n) : 0;
  if (count < 1) return [];
  const lo = positive(fmin) ?? 20;
  const hi = positive(fmax) ?? 20000;
  if (count === 1) return [lo];
  const ratio = Math.log(hi / lo);
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(i === 0 ? lo : i === count - 1 ? hi : lo * Math.exp((ratio * i) / (count - 1)));
  return out;
}

// ── wah ──────────────────────────────────────────────────────────────────────────────────────────

/** Wah centre frequency for a control position c ∈ [0, 1]: fStart·(fStop/fStart)^c (log taper). Invalid → NaN. */
export function wahFreq(fStart: number, fStop: number, control01: number): number {
  const a = positive(fStart);
  const b = positive(fStop);
  if (a === null || b === null) return NaN;
  const c = Number.isFinite(control01) ? Math.min(Math.max(control01, 0), 1) : 0;
  if (c === 0) return a;
  if (c === 1) return b;
  return a * (b / a) ** c;
}

/**
 * Idealised wah: a resonant band-pass (peak normalised to 0 dB, Q ≥ WAH_Q_MIN) at the current control position (`now`),
 * at control 0 (`min`, centred on fStart) and at control 1 (`max`, centred on fStop). dB per frequency.
 */
export function wahResponse(
  spec: { fStart: number; fStop: number; q: number; control01: number },
  freqs: readonly number[]
): { now: number[]; min: number[]; max: number[] } {
  const q = Math.max(Number.isFinite(spec.q) ? spec.q : WAH_Q_MIN, WAH_Q_MIN);
  const at = (c: number): number[] => {
    const fc = wahFreq(spec.fStart, spec.fStop, c);
    if (!Number.isFinite(fc)) return freqs.map(() => NaN);
    return freqs.map((f) => (Number.isFinite(f) && f > 0 ? toDb(sectionMagSq('bandpass', f / fc, q, 0)) : NaN));
  };
  return { now: at(spec.control01), min: at(0), max: at(1) };
}
