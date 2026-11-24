// ADSR envelope shape for the read-only graph tiles.
//
// Computes: the classic four-segment envelope (attack 0 → 1, decay 1 → sustain level, sustain held flat for a set
// time, release level → 0) sampled per segment, with straight-line or exponential limbs, plus the segment boundaries.
//
// Own math, no editor-derived constants. Exponential limbs are the textbook RC-style curves 1 − e^{−k·u} (rising) and
// e^{−k·u} (falling), normalised so every segment lands exactly on its target.
//
// Assumptions:
//   - the sustain segment's duration is the hold time at the sustain level (the envelope is drawn as if the note were
//     released after it);
//   - an unknown / missing curve label is drawn exponential;
//   - curvature of the exponential limbs is the illustrative ADSR_EXP_K;
//   - negative / NaN times are 0; a non-finite sustain level is 1; the level is clamped to 0..1.
//
// Pure — no DOM, no Svelte (adsr.test.ts).

/** Illustrative (ours): curvature of the exponential limbs (larger = more bent). */
export const ADSR_EXP_K = 4;
/** Illustrative (ours): default number of intervals each segment is sampled with. */
export const ADSR_SAMPLES_PER_SEGMENT = 24;

export type AdsrCurve = 'exponential' | 'linear';

export interface AdsrSpec {
  attackMs: number;
  decayMs: number;
  /** the hold time at the sustain level */
  sustainMs: number;
  releaseMs: number;
  /** sustain level 0..1 */
  level01: number;
  curve: AdsrCurve;
}

export type AdsrSegmentName = 'attack' | 'decay' | 'sustain' | 'release';

export interface AdsrSegment {
  name: AdsrSegmentName;
  t0: number;
  t1: number;
}

/** Curve label → 'linear' when it says LIN…, otherwise 'exponential' (also for unknown / missing labels). */
export function adsrCurveFromLabel(label: string | null | undefined): AdsrCurve {
  if (typeof label !== 'string') return 'exponential';
  return label.trim().toUpperCase().startsWith('LIN') ? 'linear' : 'exponential';
}

const ms = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Normalised limb progress g(u), u ∈ [0, 1] → [0, 1] with g(0) = 0 and g(1) = 1. Exponential: (1 − e^{−ku})/(1 − e^{−k}).
 * A rising limb is from + (to − from)·g(u); a falling limb written the same way equals to + (from − to)·h(u) with the
 * normalised decay h(u) = (e^{−ku} − e^{−k})/(1 − e^{−k}) = 1 − g(u), so one progress function serves both directions.
 */
function limb(u: number, curve: AdsrCurve): number {
  if (curve === 'linear') return u;
  return (1 - Math.exp(-ADSR_EXP_K * u)) / (1 - Math.exp(-ADSR_EXP_K));
}

/**
 * Sampled envelope: t in ms, v in 0..1. Each segment is sampled at `samplesPerSegment` intervals (so
 * `samplesPerSegment + 1` points, sharing the join point with the previous segment); a zero-length segment adds only
 * its end point (a vertical jump). Every segment ends exactly on its target value.
 */
export function adsrTrace(
  spec: AdsrSpec,
  samplesPerSegment = ADSR_SAMPLES_PER_SEGMENT
): { t: number[]; v: number[]; segments: AdsrSegment[] } {
  const per =
    Number.isFinite(samplesPerSegment) && samplesPerSegment >= 1 ? Math.floor(samplesPerSegment) : ADSR_SAMPLES_PER_SEGMENT;
  const level = Number.isFinite(spec.level01) ? Math.min(Math.max(spec.level01, 0), 1) : 1;
  const curve: AdsrCurve = spec.curve === 'linear' ? 'linear' : 'exponential';
  const plan: { name: AdsrSegmentName; dur: number; from: number; to: number }[] = [
    { name: 'attack', dur: ms(spec.attackMs), from: 0, to: 1 },
    { name: 'decay', dur: ms(spec.decayMs), from: 1, to: level },
    { name: 'sustain', dur: ms(spec.sustainMs), from: level, to: level },
    { name: 'release', dur: ms(spec.releaseMs), from: level, to: 0 }
  ];
  const t: number[] = [0];
  const v: number[] = [0];
  const segments: AdsrSegment[] = [];
  let t0 = 0;
  for (const seg of plan) {
    const t1 = t0 + seg.dur;
    segments.push({ name: seg.name, t0, t1 });
    const steps = seg.dur > 0 && seg.from !== seg.to ? per : 1;
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      t.push(i === steps ? t1 : t0 + seg.dur * u);
      v.push(i === steps ? seg.to : seg.from + (seg.to - seg.from) * limb(u, curve));
    }
    t0 = t1;
  }
  return { t, v, segments };
}
