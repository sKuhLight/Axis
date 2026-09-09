// The FM3 Megatap tap pattern: where each tap lands in the delay window and how loud it is.
//
// The block computes its taps in DSP and exposes none of them over MIDI, so every constant here was
// measured as audio off a live FM3 — an impulse through the block, its taps read from the output VU
// meters. Rig, raw captures and per-shape residuals: docs/handoff/megatap-shapes.
import { curvedRamp } from './modulationGraphs';

export interface MegaTapTap {
  /** Delay of this tap from the impulse in ms, excluding predelay. */
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
// slope differs per shape because each one bends a different ramp; all four were fitted per Alpha
// against the hardware and then checked for linearity:
//   tap times (EXP/LOG)   -8.58 / -4.30 / 0 / +4.28 / +8.55 at Alpha 0/25/50/75/100%  -> 17.2
//   INCREASING, UP / DOWN -9.87 / -4.97 / 0 / +5.00 / +10.02                          -> 20.0
//   DECREASING            +8.83 / +4.41 / 0 / -4.46 /  -8.87                          -> 17.7 (mirrored)
//   DOWN / UP             +7.06 / +4.01 / 0 / -4.01 /  -7.66                          -> 16.0 (mirrored)
// Residuals are 1.5-3 ms on a 4000 ms window for the times, and 0.001-0.004 of full scale for the
// levels. Alpha 50% is dead centre for every shape: linear spacing, flat or straight-line levels.
const TIME_CURVATURE = 17.2;
const RISE_CURVATURE = 20.0;
const FALL_CURVATURE = 17.7;
const TROUGH_CURVATURE = 16.0;
// SIGMOID is fitted rather than derived: its per-capture spread tracked Alpha at roughly this slope
// below 50% (-22.5 / -9.6 / -3.2 / 0 measured at Alpha 0 / 25 / 37.5 / 50%) and more weakly above it.
const SIGMOID_SPREAD = 40;

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Deterministic 0..1 hash, the idiom `modulationValue` already uses for its RANDOM staircase. */
function jitter(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Where tap `index` (0-based, of `count`) lands in the delay window, 0..1.
 *
 * EXP/LOG is exact — an exponential bend of the tap index, within a couple of ms of the hardware at
 * every Alpha. The other three are approximations: they crowd taps closer than the output meter can
 * separate over much of the Alpha range, so no capture pinned their law (see the README next to the
 * data). SIGMOID gets the shape it clearly has — spacing that widens toward the middle below Alpha
 * 50% and narrows toward it above, fitted to about 0.03-0.08 of the window against 0.0005 for
 * EXP/LOG — while COSINE and SINE fall back to even spacing, which is what they measure at Alpha
 * 50% and never more than about 0.09 of the window away elsewhere.
 */
export function megaTapTimeValue(shape: string, index: number, count: number, alpha: number): number {
  const n = Math.max(1, count);
  const a = clamp01(alpha);
  const name = shape.trim().toUpperCase();

  if (name === 'SIGMOID') {
    // Spacing bent symmetrically about the middle of the train, then accumulated.
    const gap = (u: number) => Math.exp((a - 0.5) * SIGMOID_SPREAD * (u - 0.5) ** 2);
    let total = 0;
    for (let k = 1; k <= n; k++) total += gap((k - 0.5) / n);
    let acc = 0;
    for (let k = 1; k <= index + 1; k++) acc += gap((k - 0.5) / n);
    return total > 0 ? acc / total : (index + 1) / n;
  }
  if (name === 'COSINE' || name === 'SINE') return (index + 1) / n;

  return curvedRamp((index + 1) / n, (a - 0.5) * TIME_CURVATURE);
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
