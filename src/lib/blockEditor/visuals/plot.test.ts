import { describe, it, expect } from 'vitest';
import { areaPathFrom, fmtDb, fmtHz, fmtMs, fmtSec, linMap, logMap, logTicks, niceTicks, pathFrom } from './plot';

describe('linMap / logMap', () => {
  it('maps linearly, including inverted ranges', () => {
    expect(linMap(5, 0, 10, 0, 100)).toBe(50);
    expect(linMap(0, -60, 0, 200, 0)).toBe(0);
    expect(linMap(-60, -60, 0, 200, 0)).toBe(200);
    expect(linMap(15, 0, 10, 0, 100)).toBe(150);
    expect(linMap(3, 2, 2, 7, 9)).toBe(7);
    expect(linMap(NaN, 0, 10, 4, 100)).toBe(4);
  });

  it('maps log10, with non-positive values pinned to r0', () => {
    expect(logMap(20, 20, 20000, 0, 300)).toBe(0);
    expect(logMap(20000, 20, 20000, 0, 300)).toBeCloseTo(300, 9);
    expect(logMap(632.455532, 20, 20000, 0, 300)).toBeCloseTo(150, 4);
    expect(logMap(0, 20, 20000, 10, 300)).toBe(10);
    expect(logMap(-5, 20, 20000, 10, 300)).toBe(10);
    expect(logMap(100, 0, 20000, 10, 300)).toBe(10);
  });
});

describe('pathFrom / areaPathFrom', () => {
  it('builds an M/L path rounded to 2 decimals', () => {
    expect(pathFrom([0, 10.123, 20], [5, 6.789, -0.001])).toBe('M0 5 L10.12 6.79 L20 0');
  });

  it('breaks the line at non-finite points', () => {
    expect(pathFrom([0, 1, 2, 3, 4], [0, 1, NaN, 3, 4])).toBe('M0 0 L1 1 M3 3 L4 4');
    expect(pathFrom([0, 1, 2], [NaN, 1, Infinity])).toBe('M1 1');
  });

  it('is empty for no points and uses the shorter array', () => {
    expect(pathFrom([], [])).toBe('');
    expect(pathFrom([NaN], [1])).toBe('');
    expect(pathFrom([0, 1, 2], [0, 1])).toBe('M0 0 L1 1');
  });

  it('closes an area under each finite run', () => {
    expect(areaPathFrom([0, 10, 20], [5, 2, 8], 100)).toBe('M0 100 L0 5 L10 2 L20 8 L20 100 Z');
    expect(areaPathFrom([0, 1, 2, 3], [1, 2, NaN, 4], 10)).toBe('M0 10 L0 1 L1 2 L1 10 Z M3 10 L3 4 L3 10 Z');
    expect(areaPathFrom([], [], 10)).toBe('');
    expect(areaPathFrom([0, 1], [0, 1], NaN)).toBe('');
  });
});

describe('niceTicks', () => {
  it('picks 1/2/5 steps', () => {
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(-60, 0, 6)).toEqual([-60, -50, -40, -30, -20, -10, 0]);
    expect(niceTicks(-72, 26, 5)).toEqual([-60, -40, -20, 0, 20]);
    expect(niceTicks(0, 1, 4)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceTicks(0, 2.65, 5)).toEqual([0, 0.5, 1, 1.5, 2, 2.5]);
    expect(niceTicks(0.1, 0.35, 5)).toEqual([0.1, 0.15, 0.2, 0.25, 0.3, 0.35]);
  });

  it('handles reversed, empty and invalid ranges', () => {
    expect(niceTicks(10, 0, 5)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(niceTicks(3, 3, 5)).toEqual([3]);
    expect(niceTicks(NaN, 3, 5)).toEqual([]);
    expect(niceTicks(0, 10, 0)).toEqual([0, 2, 4, 6, 8, 10]);
  });
});

describe('logTicks', () => {
  it('lists 1/2/5 marks per decade within the range (inclusive)', () => {
    expect(logTicks(20, 20000)).toEqual([20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]);
    expect(logTicks(30, 9000)).toEqual([50, 100, 200, 500, 1000, 2000, 5000]);
    expect(logTicks(0.1, 1)).toEqual([0.1, 0.2, 0.5, 1]);
    expect(logTicks(0, 100)).toEqual([]);
  });
});

describe('formatters', () => {
  it('fmtHz', () => {
    expect(fmtHz(20)).toBe('20');
    expect(fmtHz(450)).toBe('450');
    expect(fmtHz(1000)).toBe('1k');
    expect(fmtHz(1200)).toBe('1.2k');
    expect(fmtHz(10000)).toBe('10k');
    expect(fmtHz(20000)).toBe('20k');
    expect(fmtHz(2.5)).toBe('2.5');
    expect(fmtHz(999.7)).toBe('1k');
    expect(fmtHz(NaN)).toBe('—');
  });

  it('fmtDb uses a real minus sign', () => {
    expect(fmtDb(2)).toBe('+2 dB');
    expect(fmtDb(-18)).toBe('−18 dB');
    expect(fmtDb(-3.0103)).toBe('−3 dB');
    expect(fmtDb(2.5)).toBe('+2.5 dB');
    expect(fmtDb(0)).toBe('0 dB');
    expect(fmtDb(-0.01)).toBe('0 dB');
    expect(fmtDb(6, false)).toBe('6 dB');
    expect(fmtDb(-6, false)).toBe('−6 dB');
    expect(fmtDb(-Infinity)).toBe('−∞ dB');
    expect(fmtDb(NaN)).toBe('—');
  });

  it('fmtSec / fmtMs', () => {
    expect(fmtSec(2.5)).toBe('2.5 s');
    expect(fmtSec(0.25)).toBe('250 ms');
    expect(fmtSec(1)).toBe('1 s');
    expect(fmtSec(12.4)).toBe('12 s');
    expect(fmtSec(0.9996)).toBe('1 s');
    expect(fmtSec(0)).toBe('0 ms');
    expect(fmtMs(250)).toBe('250 ms');
    expect(fmtMs(2.5)).toBe('2.5 ms');
    expect(fmtMs(1500)).toBe('1500 ms');
    expect(fmtMs(NaN)).toBe('—');
  });
});
