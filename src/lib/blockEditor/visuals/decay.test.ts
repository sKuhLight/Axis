import { describe, it, expect } from 'vitest';
import { DECAY_FALLBACK_WINDOW_SEC, DECAY_FLOOR_DB, decayDbAt, decayTrace, decayWindow } from './decay';

describe('decayWindow', () => {
  it('is pre-delay + 1.2·RT60 (seconds)', () => {
    expect(decayWindow(2, 250)).toBeCloseTo(2.65, 12);
    expect(decayWindow(1, 0)).toBeCloseTo(1.2, 12);
  });

  it('falls back when nothing gives a span', () => {
    expect(decayWindow(0, 0)).toBe(DECAY_FALLBACK_WINDOW_SEC);
    expect(decayWindow(NaN, NaN)).toBe(DECAY_FALLBACK_WINDOW_SEC);
    expect(decayWindow(-3, 100)).toBeCloseTo(0.1, 12);
  });
});

describe('decayDbAt', () => {
  it('is 0 dB at the pre-delay and exactly −60 dB one RT60 later', () => {
    expect(DECAY_FLOOR_DB).toBe(-60);
    expect(decayDbAt(0.25, 2, 250)).toBe(0);
    expect(decayDbAt(2.25, 2, 250)).toBe(-60);
    expect(decayDbAt(1.25, 2, 250)).toBe(-30);
  });

  it('sits on the floor before the pre-delay and after the decay', () => {
    expect(decayDbAt(0, 2, 250)).toBe(-60);
    expect(decayDbAt(0.2499, 2, 250)).toBe(-60);
    expect(decayDbAt(5, 2, 250)).toBe(-60);
  });

  it('draws the floor for an unusable RT60', () => {
    expect(decayDbAt(0.5, 0, 0)).toBe(-60);
    expect(decayDbAt(0.5, NaN, 0)).toBe(-60);
  });
});

describe('decayTrace', () => {
  it('starts at 0 dB without pre-delay and reaches the floor at RT60', () => {
    const { t, db } = decayTrace(1, 0, 13); // window 1.2 s → 0.1 s steps
    expect(t).toHaveLength(13);
    expect(t[0]).toBe(0);
    expect(t[12]).toBeCloseTo(1.2, 12);
    expect(db[0]).toBe(0);
    expect(db[5]).toBeCloseTo(-30, 9);
    expect(db[10]).toBeCloseTo(-60, 9);
    expect(db[12]).toBe(-60);
  });

  it('is flat on the floor before the pre-delay, then steps up to 0 dB', () => {
    const { t, db } = decayTrace(2, 250, 54); // window 2.65 s → 0.05 s steps
    const before = t.map((ti, i) => [ti, db[i]!] as const).filter(([ti]) => ti < 0.25);
    expect(before.length).toBeGreaterThan(0);
    for (const [, v] of before) expect(v).toBe(-60);
    const k = t.indexOf(0.25);
    expect(db[k]).toBe(-60);
    expect(t[k + 1]).toBe(0.25);
    expect(db[k + 1]).toBe(0);
    for (let i = 1; i < t.length; i++) expect(t[i]!).toBeGreaterThanOrEqual(t[i - 1]!);
    for (let i = k + 2; i < db.length; i++) expect(db[i]!).toBeLessThanOrEqual(db[i - 1]!);
  });

  it('degrades on a bad sample count', () => {
    expect(decayTrace(1, 0, 1)).toEqual({ t: [], db: [] });
  });
});
