// Reverb decay envelope for the read-only graph tiles.
//
// Computes: an idealised reverb level-vs-time envelope in dB — silent (at the floor) until the pre-delay, then a
// straight-line exponential decay (linear in dB) reaching −60 dB one RT60 after the pre-delay — plus the time window
// to plot it in.
//
// Own math, no editor-derived constants. RT60 is the textbook definition of reverberation time: the time for the
// level to fall by 60 dB; an exponential amplitude decay is a straight line in dB.
//
// Assumptions:
//   - the reverb's time parameter is taken as RT60;
//   - early reflections, diffusion build-up, modulation and frequency-dependent decay are not modelled;
//   - an unusable RT60 (missing, ≤ 0) draws the whole trace at the floor.
//
// Pure — no DOM, no Svelte (decay.test.ts).

/** The floor of the decay plot: RT60's own −60 dB point. */
export const DECAY_FLOOR_DB = -60;
/** Illustrative (ours): the plot window extends this many RT60s past the pre-delay. */
export const DECAY_WINDOW_FACTOR = 1.2;
/** Illustrative (ours): window used when neither RT60 nor pre-delay give a positive span. */
export const DECAY_FALLBACK_WINDOW_SEC = 1;

const rtOf = (rt60Sec: number): number | null => (Number.isFinite(rt60Sec) && rt60Sec > 0 ? rt60Sec : null);
const pdOf = (predelayMs: number): number => (Number.isFinite(predelayMs) && predelayMs > 0 ? predelayMs / 1000 : 0);

/** Plot window in seconds: pre-delay + 1.2·RT60 (DECAY_FALLBACK_WINDOW_SEC when that is not positive). */
export function decayWindow(rt60Sec: number, predelayMs: number): number {
  const w = pdOf(predelayMs) + DECAY_WINDOW_FACTOR * (rtOf(rt60Sec) ?? 0);
  return w > 0 ? w : DECAY_FALLBACK_WINDOW_SEC;
}

/** Level in dB at time t (seconds): floor before the pre-delay, then −60·(t − pd)/RT60, clamped at the floor. */
export function decayDbAt(t: number, rt60Sec: number, predelayMs: number): number {
  const rt = rtOf(rt60Sec);
  const pd = pdOf(predelayMs);
  if (rt === null || !Number.isFinite(t) || t < pd) return DECAY_FLOOR_DB;
  return Math.max((DECAY_FLOOR_DB * (t - pd)) / rt, DECAY_FLOOR_DB) + 0; // + 0 turns −0 into 0
}

/**
 * `samples` points (inclusive ends) evenly over decayWindow. With a pre-delay and a usable RT60 the onset is drawn as
 * a vertical step: a (pd, floor) point and a (pd, 0 dB) point are inserted (unless a sample already lands on pd), so
 * the trace can hold up to two points more than `samples`. Fewer than two samples → empty arrays.
 */
export function decayTrace(rt60Sec: number, predelayMs: number, samples: number): { t: number[]; db: number[] } {
  const n = Number.isFinite(samples) ? Math.floor(samples) : 0;
  if (n < 2) return { t: [], db: [] };
  const win = decayWindow(rt60Sec, predelayMs);
  const pd = pdOf(predelayMs);
  let step = pd > 0 && rtOf(rt60Sec) !== null && pd <= win;
  const t: number[] = [];
  const db: number[] = [];
  const push = (ti: number, v: number): void => {
    t.push(ti);
    db.push(v);
  };
  for (let i = 0; i < n; i++) {
    const ti = i === n - 1 ? win : (win * i) / (n - 1);
    if (step && ti >= pd) {
      step = false;
      push(pd, DECAY_FLOOR_DB);
      if (ti > pd) push(pd, 0);
    }
    push(ti, decayDbAt(ti, rt60Sec, predelayMs));
  }
  return { t, db };
}
