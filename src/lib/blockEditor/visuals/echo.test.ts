import { describe, it, expect } from 'vitest';
import { ECHO_FLOOR_DB, ECHO_MAX_AMP, ECHO_MAX_TAPS, echoTaps, routingFromLabel } from './echo';

const floorLin = 10 ** (ECHO_FLOOR_DB / 20);

describe('routingFromLabel', () => {
  it('maps the four routings and everything else to other', () => {
    expect(routingFromLabel('MONO')).toBe('mono');
    expect(routingFromLabel('STEREO')).toBe('stereo');
    expect(routingFromLabel('PING-PONG')).toBe('pingpong');
    expect(routingFromLabel('Ping Pong')).toBe('pingpong');
    expect(routingFromLabel('DUAL')).toBe('dual');
    for (const l of ['REVERSE', 'SWEEP', 'TAPE', 'SURROUND', '', null, undefined, 'constructor']) {
      expect(routingFromLabel(l)).toBe('other');
    }
  });
});

describe('echoTaps', () => {
  it('decays geometrically to the floor', () => {
    const { taps, infinite, simplified } = echoTaps({ timeMs: 250, feedbackPct: 50, routing: 'mono' });
    expect(infinite).toBe(false);
    expect(simplified).toBe(false);
    expect(taps).toHaveLength(10); // 0.5^9 ≥ 0.001 > 0.5^10
    taps.forEach((tap, i) => {
      expect(tap.t).toBeCloseTo(0.25 * (i + 1), 12);
      expect(tap.amp).toBeCloseTo(0.5 ** i, 12);
      expect(tap.ch).toBe('C');
    });
    expect(Math.abs(taps[taps.length - 1]!.amp)).toBeGreaterThanOrEqual(floorLin);
    expect(Math.abs(taps[taps.length - 1]!.amp * 0.5)).toBeLessThan(floorLin);
  });

  it('master scales the loop gain', () => {
    const { taps } = echoTaps({ timeMs: 100, feedbackPct: 50, masterPct: 50, routing: 'mono' });
    expect(taps[1]!.amp).toBeCloseTo(0.25, 12);
  });

  it('caps at ECHO_MAX_TAPS and flags infinite feedback', () => {
    const r = echoTaps({ timeMs: 100, feedbackPct: 100, routing: 'mono' });
    expect(r.taps).toHaveLength(ECHO_MAX_TAPS);
    expect(r.infinite).toBe(true);
    expect(r.taps.every((t) => t.amp === 1)).toBe(true);
    const boosted = echoTaps({ timeMs: 100, feedbackPct: 80, masterPct: 150, routing: 'mono' });
    expect(boosted.infinite).toBe(true);
    expect(boosted.taps).toHaveLength(ECHO_MAX_TAPS);
  });

  it('alternates the sign with negative feedback', () => {
    const { taps } = echoTaps({ timeMs: 100, feedbackPct: -50, routing: 'mono' });
    expect(taps.slice(0, 4).map((t) => t.amp)).toEqual([1, -0.5, 0.25, -0.125]);
  });

  it('ping-pong alternates L, R, L, …', () => {
    const { taps } = echoTaps({ timeMs: 100, feedbackPct: 50, routing: 'pingpong' });
    expect(taps.slice(0, 5).map((t) => t.ch)).toEqual(['L', 'R', 'L', 'R', 'L']);
  });

  it('stereo runs the R line at T·ratio/100', () => {
    const { taps } = echoTaps({ timeMs: 200, feedbackPct: 0, routing: 'stereo', ratioPct: 150 });
    expect(taps).toEqual([
      { t: 0.2, amp: 1, ch: 'L' },
      { t: expect.closeTo(0.3, 12), amp: 1, ch: 'R' }
    ]);
    const same = echoTaps({ timeMs: 200, feedbackPct: 0, routing: 'stereo' }).taps;
    expect(same.map((t) => [t.t, t.ch])).toEqual([
      [0.2, 'L'],
      [0.2, 'R']
    ]);
  });

  it('dual lines are independent, with R falling back to the L values', () => {
    const { taps, infinite } = echoTaps({ timeMs: 100, feedbackPct: 0, routing: 'dual', timeRMs: 150, feedbackRPct: 100 });
    const left = taps.filter((t) => t.ch === 'L');
    const right = taps.filter((t) => t.ch === 'R');
    expect(left).toHaveLength(1);
    expect(right).toHaveLength(ECHO_MAX_TAPS);
    expect(right[1]!.t).toBeCloseTo(0.3, 12);
    expect(infinite).toBe(true);
    for (let i = 1; i < taps.length; i++) expect(taps[i]!.t).toBeGreaterThanOrEqual(taps[i - 1]!.t);
    const fallback = echoTaps({ timeMs: 100, feedbackPct: 50, routing: 'dual' }).taps;
    expect(fallback.filter((t) => t.ch === 'L').map((t) => t.amp)).toEqual(fallback.filter((t) => t.ch === 'R').map((t) => t.amp));
  });

  it("'other' is drawn mono and flagged simplified", () => {
    const r = echoTaps({ timeMs: 100, feedbackPct: 30, routing: 'other' });
    expect(r.simplified).toBe(true);
    expect(r.taps.every((t) => t.ch === 'C')).toBe(true);
    expect(r.taps.length).toBeGreaterThan(1);
  });

  it('draws nothing for an unusable time', () => {
    expect(echoTaps({ timeMs: 0, feedbackPct: 100, routing: 'mono' })).toEqual({ taps: [], simplified: false, infinite: false });
    expect(echoTaps({ timeMs: NaN, feedbackPct: 50, routing: 'mono' }).taps).toEqual([]);
  });
});

describe('echoTaps — growth cap (review fix)', () => {
  it('a loop gain above 1 never draws a tap louder than the first echo, keeps alternating signs, flags infinite', () => {
    const res = echoTaps({ timeMs: 100, feedbackPct: -100, masterPct: 200, routing: 'mono' });
    expect(res.infinite).toBe(true);
    expect(res.taps.length).toBe(ECHO_MAX_TAPS);
    for (const tap of res.taps) expect(Math.abs(tap.amp)).toBeLessThanOrEqual(ECHO_MAX_AMP);
    expect(Math.sign(res.taps[1]!.amp)).toBe(-Math.sign(res.taps[2]!.amp));
  });
});
