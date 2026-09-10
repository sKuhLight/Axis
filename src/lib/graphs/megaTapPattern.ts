// The FM3 Megatap tap pattern: where each tap lands in the delay window and how loud it is.
//
// The block computes its taps in DSP and exposes none of them over MIDI, so every constant here was
// measured as audio off a live FM3. Levels come from the output VU meters. Tap *times* come from a
// correlation rig instead — white noise through the block with a dry reference beside it, so
// deconvolving one channel out of the other recovers the tap train directly — because the meters
// cannot separate taps closer than ~25 ms and three of the four time shapes crowd well past that.
// Rig, raw captures and per-shape residuals: docs/handoff/megatap-shapes.
import { curvedRamp } from './modulationGraphs';

export interface MegaTapTap {
  /** Delay of this tap from the note in ms, excluding predelay. */
  ms: number;
  /** Level relative to the loudest tap, 0..1. */
  amp: number;
}

export interface MegaTapPatternInput {
  count: number;
  timeMs: number;
  timeShape?: string;
  timeAlpha?: number;
  ampShape?: string;
  ampAlpha?: number;
  timeRandom?: number;
  ampRandom?: number;
}

// Alpha bends a shape through `curvedRamp`, and the curvature it asks for is linear in Alpha. The
// slope differs per shape because each one bends a different ramp; all were fitted per Alpha against
// the hardware and then checked for linearity:
//   tap times (EXP/LOG, SIGMOID)  -10.0 / -5.0 / 0 / +5.0 / +10.0 at Alpha 0/25/50/75/100%  -> 20.0
//   INCREASING, UP / DOWN         -9.87 / -4.97 / 0 / +5.00 / +10.02                        -> 20.0
//   DECREASING                    +8.83 / +4.41 / 0 / -4.46 /  -8.87                        -> 17.7 (mirrored)
//   DOWN / UP                     +7.06 / +4.01 / 0 / -4.01 /  -7.66                        -> 16.0 (mirrored)
// Residuals are under 3 ms on a 3000 ms window for the times, and 0.001-0.004 of full scale for the
// levels. Alpha 50% is dead centre for every shape: linear spacing, flat or straight-line levels.
const TIME_CURVATURE = 20.0;
const RISE_CURVATURE = 20.0;
const FALL_CURVATURE = 17.7;
const TROUGH_CURVATURE = 16.0;
// COSINE and SINE modulate the *spacing* periodically rather than bending it one way. The gap either
// side of Alpha is a full-depth cosine - the gaps run right down to zero - and Alpha sweeps its
// frequency linearly from one cycle across the train to eight.
const PERIODIC_MIN_CYCLES = 1;
const PERIODIC_MAX_CYCLES = 8;

/**
 * Where tap `k` (1-based) samples its curve: k/(N+1).
 *
 * Every time shape uses this, and the train is then renormalized so the last tap lands on the end of
 * the window. It is the only sampling that is symmetric about its own centre - which is what makes
 * the measured trains satisfy p(k) + p(N+1-k) = const - and that still collapses to the measured k/N
 * at Alpha 50%, where the curve is a straight line. Reading it as k/N instead forces the curve's
 * centre to (N+1)/2N, which is the "centre would have to sit at u = 0.62" that the earlier VU-meter
 * analysis hit and could not explain; it was an artifact of the index convention, not the block.
 */
const tapU = (index: number, count: number) => (index + 1) / (count + 1);

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Deterministic 0..1 hash, the idiom `modulationValue` already uses for its RANDOM staircase. */
function jitter(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** The gap before tap `k` (1-based) for the two periodic shapes, sampled at the middle of that gap. */
function periodicGap(k: number, count: number, alpha: number, phase: number): number {
  const cycles = PERIODIC_MIN_CYCLES + (PERIODIC_MAX_CYCLES - PERIODIC_MIN_CYCLES) * alpha;
  return 1 + Math.cos((2 * Math.PI * cycles * (k - 0.5)) / (count + 1) + phase);
}

/**
 * Where tap `index` (0-based, of `count`) lands in the delay window, 0..1.
 *
 * All four shapes are measured, not invented. EXP/LOG and SIGMOID are the same exponential bend at
 * the same curvature — EXP/LOG bends the whole train one way, SIGMOID bends each half of it and
 * mirrors them — and both land within 3 ms of the hardware on a 3000 ms window at every Alpha and
 * every tap count. COSINE and SINE instead modulate the spacing: the gap between taps is a
 * full-depth cosine whose frequency Alpha sweeps from one cycle across the train to eight, which
 * reproduces 32-tap trains to about 2 ms.
 *
 * The one soft spot is COSINE/SINE at low tap counts above Alpha 50%, where the block is asking for
 * up to eight cycles across as few as eight taps and the modulation runs past its own Nyquist limit.
 * There the drawing drifts up to about 0.06 of the window; no variation of the sampling convention
 * did better (see the README next to the data).
 */
export function megaTapTimeValue(shape: string, index: number, count: number, alpha: number): number {
  const n = Math.max(1, count);
  const a = clamp01(alpha);
  const name = shape.trim().toUpperCase();
  const last = tapU(n - 1, n);

  if (name === 'COSINE' || name === 'SINE') {
    // Measured as gaps rather than positions: they run from ~0 to ~2x the even spacing, so the pair
    // is a cosine of full depth. COSINE sits a quarter cycle ahead of SINE, which is the only thing
    // that distinguishes them.
    const phase = name === 'COSINE' ? Math.PI / 2 : 0;
    let acc = 0;
    let total = 0;
    for (let k = 1; k <= n; k++) {
      const gap = Math.max(0, periodicGap(k, n, a, phase));
      total += gap;
      if (k <= index + 1) acc += gap;
    }
    return total > 0 ? acc / total : tapU(index, n) / last;
  }

  if (name === 'SIGMOID') {
    // The EXP/LOG bend applied to each half of the train and mirrored, which is the same idiom the
    // UP / DOWN amplitude shape uses. The sign is flipped: below Alpha 50% SIGMOID pushes taps out
    // toward both ends of the window, where EXP/LOG pushes them all toward the finish.
    const s = (0.5 - a) * TIME_CURVATURE;
    const fold = (u: number) => (u <= 0.5 ? 0.5 * curvedRamp(2 * u, s) : 1 - 0.5 * curvedRamp(2 * (1 - u), s));
    const end = fold(last);
    return end > 0 ? fold(tapU(index, n)) / end : tapU(index, n) / last;
  }

  const c = (a - 0.5) * TIME_CURVATURE;
  const end = curvedRamp(last, c);
  return end > 0 ? curvedRamp(tapU(index, n), c) / end : tapU(index, n) / last;
}

/** Level of tap `index` (0-based, of `count`) relative to the loudest tap, 0..1. */
export function megaTapAmpValue(shape: string, index: number, count: number, alpha: number): number {
  const a = clamp01(alpha);
  const n = Math.max(1, count);
  const k = index + 1;
  const u = k / n;
  const name = shape.trim().toUpperCase();

  // The periodic pair sweeps frequency rather than curvature: Alpha 25% is one cycle across the
  // taps, 50% two, 100% four (measured: at Alpha 100% every second tap is silent).
  if (name === 'COSINE') return (1 + Math.cos(2 * Math.PI * 4 * a * u)) / 2;
  if (name === 'SINE') return (1 + Math.sin(2 * Math.PI * 4 * a * u)) / 2;

  if (name === 'INCREASING') return curvedRamp(u, (a - 0.5) * RISE_CURVATURE);
  if (name === 'DECREASING') return curvedRamp((n + 1 - k) / n, (0.5 - a) * FALL_CURVATURE);

  // The two triangles are one half-length ramp and its mirror, so the fold runs over ceil(n/2) taps.
  const half = Math.max(1, Math.ceil(n / 2));
  const leg = Math.min(k, n + 1 - k);
  if (name === 'UP / DOWN' || name === 'UP/DOWN') return curvedRamp(leg / half, (a - 0.5) * RISE_CURVATURE);
  if (name === 'DOWN / UP' || name === 'DOWN/UP') return curvedRamp((half + 1 - leg) / half, (0.5 - a) * TROUGH_CURVATURE);

  // CONSTANT is a constant *slope*, not a constant level: Alpha tilts a straight line end to end
  // across the taps, from rising out of silence (0%) through flat (50%) to falling into it (100%).
  const v = n === 1 ? 1 : index / (n - 1);
  return a <= 0.5 ? 2 * a + (1 - 2 * a) * v : 1 - (2 * a - 1) * v;
}

/** The whole tap train, in tap order. Levels are relative to the loudest tap. */
export function megaTapTaps(input: MegaTapPatternInput): MegaTapTap[] {
  const count = Math.max(1, Math.round(input.count));
  const timeMs = Math.max(0, input.timeMs);
  const timeRandom = input.timeRandom ?? 0;
  const ampRandom = input.ampRandom ?? 0;
  const taps: MegaTapTap[] = [];
  for (let index = 0; index < count; index++) {
    let position = megaTapTimeValue(input.timeShape ?? '', index, count, input.timeAlpha ?? 0.5);
    let amp = megaTapAmpValue(input.ampShape ?? '', index, count, input.ampAlpha ?? 0.5);
    // Randomize nudges each tap rather than scattering it: at 50% the measured taps moved by about
    // half a percent of the window, and the last tap stayed pinned to the end of it.
    if (timeRandom > 0 && index < count - 1) position = clamp01(position + (jitter(index + 1) - 0.5) * 0.02 * timeRandom);
    if (ampRandom > 0) amp = clamp01(amp * (1 - 0.3 * ampRandom * jitter(index + 101)));
    taps.push({ ms: position * timeMs, amp: clamp01(amp) });
  }
  return taps;
}
