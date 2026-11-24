import { describe, it, expect } from 'vitest';
import { adsrCurveFromLabel, adsrTrace, type AdsrSpec } from './adsr';

const base: AdsrSpec = { attackMs: 10, decayMs: 100, sustainMs: 200, releaseMs: 300, level01: 0.5, curve: 'exponential' };

/** Points (t, v) of one segment, inclusive of both ends. */
function segPoints(tr: ReturnType<typeof adsrTrace>, name: string): [number, number][] {
  const seg = tr.segments.find((s) => s.name === name)!;
  const pts: [number, number][] = [];
  tr.t.forEach((t, i) => {
    if (t >= seg.t0 && t <= seg.t1) pts.push([t, tr.v[i]!]);
  });
  return pts;
}

describe('adsrCurveFromLabel', () => {
  it('reads LIN… as linear and defaults to exponential', () => {
    expect(adsrCurveFromLabel('LINEAR')).toBe('linear');
    expect(adsrCurveFromLabel('Lin')).toBe('linear');
    expect(adsrCurveFromLabel('EXPONENTIAL')).toBe('exponential');
    expect(adsrCurveFromLabel('LOG')).toBe('exponential');
    expect(adsrCurveFromLabel(null)).toBe('exponential');
    expect(adsrCurveFromLabel(undefined)).toBe('exponential');
  });
});

describe('adsrTrace', () => {
  it('lays out the segments and the total duration', () => {
    const tr = adsrTrace(base);
    expect(tr.segments).toEqual([
      { name: 'attack', t0: 0, t1: 10 },
      { name: 'decay', t0: 10, t1: 110 },
      { name: 'sustain', t0: 110, t1: 310 },
      { name: 'release', t0: 310, t1: 610 }
    ]);
    expect(tr.t[tr.t.length - 1]).toBe(610);
    expect(tr.t).toHaveLength(tr.v.length);
  });

  it('hits every endpoint exactly (both curves)', () => {
    for (const curve of ['exponential', 'linear'] as const) {
      const tr = adsrTrace({ ...base, curve });
      const val = (t: number): number[] => tr.t.flatMap((ti, i) => (ti === t ? [tr.v[i]!] : []));
      expect(tr.t[0]).toBe(0);
      expect(tr.v[0]).toBe(0);
      expect(val(10)).toEqual([1]);
      expect(val(110)).toEqual([0.5]);
      expect(val(310)).toEqual([0.5]);
      expect(val(610)).toEqual([0]);
    }
  });

  it('segments are monotonic and stay in 0..1', () => {
    for (const curve of ['exponential', 'linear'] as const) {
      const tr = adsrTrace({ ...base, curve });
      const mono = (name: string, dir: 1 | -1 | 0): void => {
        const pts = segPoints(tr, name);
        expect(pts.length).toBeGreaterThan(1);
        for (let i = 1; i < pts.length; i++) {
          const d = pts[i]![1] - pts[i - 1]![1];
          if (dir === 0) expect(d).toBe(0);
          else expect(d * dir).toBeGreaterThanOrEqual(0);
          expect(pts[i]![0]).toBeGreaterThanOrEqual(pts[i - 1]![0]);
        }
      };
      mono('attack', 1);
      mono('decay', -1);
      mono('sustain', 0);
      mono('release', -1);
      for (const v of tr.v) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('linear midpoints sit halfway; exponential limbs bend fast-then-slow', () => {
    const lin = adsrTrace({ ...base, curve: 'linear' }, 24);
    const at = (tr: ReturnType<typeof adsrTrace>, t: number): number => tr.v[tr.t.findIndex((ti) => Math.abs(ti - t) < 1e-9)]!;
    expect(at(lin, 5)).toBeCloseTo(0.5, 12);
    expect(at(lin, 60)).toBeCloseTo(0.75, 12);
    expect(at(lin, 460)).toBeCloseTo(0.25, 12);
    const exp = adsrTrace(base, 24);
    expect(at(exp, 5)).toBeGreaterThan(0.5);
    expect(at(exp, 60)).toBeLessThan(0.75);
    expect(at(exp, 460)).toBeLessThan(0.25);
  });

  it('samplesPerSegment sets the resolution; flat / zero-length segments add only their end point', () => {
    expect(adsrTrace(base, 24).t).toHaveLength(1 + 24 + 24 + 1 + 24);
    expect(adsrTrace(base, 4).t).toHaveLength(1 + 4 + 4 + 1 + 4);
    const instant = adsrTrace({ ...base, attackMs: 0 }, 4);
    expect(instant.t.slice(0, 2)).toEqual([0, 0]);
    expect(instant.v.slice(0, 2)).toEqual([0, 1]);
  });

  it('treats negative / NaN times as 0 and clamps the level', () => {
    const tr = adsrTrace({ attackMs: -5, decayMs: NaN, sustainMs: 50, releaseMs: 100, level01: 2, curve: 'linear' }, 4);
    expect(tr.segments.map((s) => [s.t0, s.t1])).toEqual([
      [0, 0],
      [0, 0],
      [0, 50],
      [50, 150]
    ]);
    expect(Math.max(...tr.v)).toBe(1);
    expect(tr.t.every(Number.isFinite)).toBe(true);
    expect(adsrTrace({ ...base, level01: NaN }).v.every((v) => v >= 0 && v <= 1)).toBe(true);
  });
});
