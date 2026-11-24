// Delay echo taps for the read-only graph tiles.
//
// Computes: the impulse response of an idealised feedback delay as a list of discrete taps (time, signed amplitude,
// channel) for mono, stereo, ping-pong and dual routings, stopping once the echoes fall below a floor.
//
// Own math, no editor-derived constants. A feedback delay line of time T and loop gain f repeats an impulse at n·T
// with amplitude f^(n−1) (first echo = 1); a negative loop gain alternates the sign. That geometric series is the
// textbook comb-filter impulse response.
//
// Assumptions:
//   - loop gain f = feedback/100 · master/100 (the master level is taken to scale the repeats, default 100 %);
//     feedback is clamped to −100..100 %, master to 0..200 %;
//   - stereo: the R line runs at T·ratio/100 (ratio default 100 %) with the same feedback;
//   - dual: L uses time / feedback, R uses timeR / feedbackR, each falling back to the L value when missing;
//   - ping-pong: one line whose repeats alternate L, R, L, … starting on L;
//   - any other routing (reverse, sweep, tape, surround, …) is drawn as a plain mono line and flagged `simplified`;
//   - taps stop below ECHO_FLOOR_DB or after ECHO_MAX_TAPS per delay line; `infinite` = |f| ≥ 1 on any line;
//   - filtering, modulation, ducking and diffusion in the repeats are not modelled.
//
// Pure — no DOM, no Svelte (echo.test.ts).

export type EchoRouting = 'mono' | 'stereo' | 'pingpong' | 'dual' | 'other';

/** Illustrative (ours): echoes quieter than this, relative to the first echo, are not drawn (the RT60-style −60 dB). */
export const ECHO_FLOOR_DB = -60;
/** Illustrative (ours): at most this many taps per delay line (bounds a runaway / infinite feedback). */
export const ECHO_MAX_TAPS = 64;

const ROUTING_BY_KEY: Readonly<Record<string, EchoRouting>> = {
  MONO: 'mono',
  STEREO: 'stereo',
  PINGPONG: 'pingpong',
  DUAL: 'dual'
};

/** Delay-mode label → routing ('MONO', 'STEREO', 'PING-PONG', 'DUAL'); anything else → 'other'. */
export function routingFromLabel(label: string | null | undefined): EchoRouting {
  if (typeof label !== 'string') return 'other';
  const key = label.toUpperCase().replace(/[^A-Z]/g, '');
  return Object.prototype.hasOwnProperty.call(ROUTING_BY_KEY, key) ? ROUTING_BY_KEY[key]! : 'other';
}

export interface EchoSpec {
  timeMs: number;
  /** −100..100 */
  feedbackPct: number;
  /** 0..200, default 100 */
  masterPct?: number;
  routing: EchoRouting;
  /** stereo: R time = T·ratio/100 (assumption) */
  ratioPct?: number | null;
  timeRMs?: number | null;
  /** dual */
  feedbackRPct?: number | null;
}

export interface EchoTap {
  /** seconds */
  t: number;
  /** signed, first echo = 1 */
  amp: number;
  ch: 'L' | 'R' | 'C';
}

const num = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Illustrative (ours): the largest |amplitude| a tap is drawn with (the first echo's level). A loop gain
 *  above 1 (master feedback over 100 %) would grow without bound; the train is drawn at this ceiling and
 *  flagged `infinite` instead — a real unit limits / saturates, which is not modelled. */
export const ECHO_MAX_AMP = 1;

/** One delay line: taps at n·T with amplitude f^(n−1) until below the floor or ECHO_MAX_TAPS; the
 *  magnitude never exceeds ECHO_MAX_AMP (the sign is kept). */
function line(timeSec: number, gain: number, channel: (n: number) => EchoTap['ch']): EchoTap[] {
  const taps: EchoTap[] = [];
  if (!(timeSec > 0) || !Number.isFinite(timeSec)) return taps;
  const floor = 10 ** (ECHO_FLOOR_DB / 20);
  let amp = 1;
  for (let n = 1; n <= ECHO_MAX_TAPS; n++) {
    if (Math.abs(amp) < floor) break;
    taps.push({ t: n * timeSec, amp, ch: channel(n) });
    amp *= gain;
    if (Math.abs(amp) > ECHO_MAX_AMP) amp = Math.sign(amp) * ECHO_MAX_AMP;
  }
  return taps;
}

/** Echo taps sorted by time (ties keep L before R). `infinite` when any line's |loop gain| ≥ 1. */
export function echoTaps(spec: EchoSpec): { taps: EchoTap[]; simplified: boolean; infinite: boolean } {
  const master = clamp(num(spec.masterPct) ?? 100, 0, 200) / 100;
  const feedL = clamp(num(spec.feedbackPct) ?? 0, -100, 100) / 100;
  const tL = (num(spec.timeMs) ?? 0) / 1000;
  const fL = feedL * master;
  let taps: EchoTap[];
  let gains: number[];
  switch (spec.routing) {
    case 'pingpong':
      taps = line(tL, fL, (n) => (n % 2 === 1 ? 'L' : 'R'));
      gains = [fL];
      break;
    case 'stereo': {
      const ratio = num(spec.ratioPct);
      const tR = tL * ((ratio !== null && ratio > 0 ? ratio : 100) / 100);
      taps = [...line(tL, fL, () => 'L'), ...line(tR, fL, () => 'R')];
      gains = [fL];
      break;
    }
    case 'dual': {
      const tRms = num(spec.timeRMs);
      const tR = tRms !== null && tRms > 0 ? tRms / 1000 : tL;
      const fbR = num(spec.feedbackRPct);
      const fR = (fbR !== null ? clamp(fbR, -100, 100) / 100 : feedL) * master;
      taps = [...line(tL, fL, () => 'L'), ...line(tR, fR, () => 'R')];
      gains = [fL, fR];
      break;
    }
    default:
      taps = line(tL, fL, () => 'C');
      gains = [fL];
  }
  taps.sort((a, b) => a.t - b.t);
  return {
    taps,
    simplified: spec.routing !== 'mono' && spec.routing !== 'stereo' && spec.routing !== 'pingpong' && spec.routing !== 'dual',
    infinite: taps.length > 0 && gains.some((g) => Math.abs(g) >= 1)
  };
}
