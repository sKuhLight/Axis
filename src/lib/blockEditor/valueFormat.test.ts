import { describe, it, expect } from 'vitest';
import { formatCentre, formatFull, parseTyped, stepFor, stepNorm } from './valueFormat';
import { normFromValue } from '../format';

const dB = { min: -80, max: 20, unit: 'dB' };
const hz = { min: 20, max: 20000, log: true, unit: 'Hz' };
const pct = { min: 0, max: 100, unit: '%' };
const dial = { min: 0, max: 10 };
const unit = { min: 0, max: 1 };

describe('formatCentre', () => {
  it('follows the range for precision', () => {
    expect(formatCentre({ ...dial, norm: 0.7 })).toBe('7.00');
    expect(formatCentre({ ...unit, norm: 1 })).toBe('1.000');
    expect(formatCentre({ ...dB, norm: normFromValue(-14.7, dB) })).toBe('−14.7 dB');
    expect(formatCentre({ ...pct, norm: 0.63 })).toBe('63%');
  });
  it('compacts Hz through format.ts and never shows a negative zero', () => {
    expect(formatCentre({ ...hz, norm: normFromValue(1200, hz) })).toBe('1.2 kHz');
    expect(formatCentre({ ...hz, norm: normFromValue(800, hz) })).toBe('800 Hz');
    expect(formatCentre({ min: -10, max: 10, norm: 0.499999 })).toBe('0.00');
  });
  it('falls back to a 0..10 reading without a range', () => {
    expect(formatCentre({ norm: 0.5 })).toBe('5.00');
  });
  it('keeps the full value for the bubble', () => {
    expect(formatFull({ ...dB, norm: normFromValue(-14.7, dB) })).toBe('-14.7 dB');
  });
});

describe('parseTyped', () => {
  it('accepts comma decimals, true minus and unit suffixes', () => {
    expect(parseTyped(dB, '-3,5 dB')).toBeCloseTo(0.765, 6);
    expect(parseTyped(dB, '−14.7')).toBeCloseTo(0.653, 6);
    expect(parseTyped(pct, '63%')).toBeCloseTo(0.63, 6);
    expect(parseTyped(dial, ' 7 ')).toBeCloseTo(0.7, 6);
  });
  it('reads k / kHz on Hz parameters', () => {
    expect(parseTyped(hz, '1.2k')).toBeCloseTo(normFromValue(1200, hz), 6);
    expect(parseTyped(hz, '1.2 kHz')).toBeCloseTo(normFromValue(1200, hz), 6);
    expect(parseTyped(hz, '800 Hz')).toBeCloseTo(normFromValue(800, hz), 6);
  });
  it('clamps to the range (also for log tapers)', () => {
    expect(parseTyped(dial, '500')).toBe(1);
    expect(parseTyped(hz, '0')).toBe(0);
    expect(parseTyped(dB, '-999')).toBe(0);
  });
  it('reads a number without a range on the 0..10 scale the knob centre shows', () => {
    expect(parseTyped({}, '5')).toBeCloseTo(0.5, 6);
    expect(parseTyped({}, '7.5')).toBeCloseTo(0.75, 6);
    expect(parseTyped({}, '50')).toBe(1);
    expect(parseTyped({}, '-1')).toBe(0);
  });
  it('parses the shown value back to the value it came from (both directions)', () => {
    // display → parse: what the centre shows is what a typed copy of it writes
    for (const r of [{}, dial, unit, dB, pct]) {
      for (const n of [0, 0.25, 0.5, 0.7, 1]) {
        const p = { ...r, norm: n };
        expect(parseTyped(p, formatCentre(p))).toBeCloseTo(n, 2);
      }
    }
    // parse → display: a typed value shows as typed
    expect(formatCentre({ norm: parseTyped({}, '3.5')! })).toBe('3.50');
    expect(formatCentre({ ...dial, norm: parseTyped(dial, '7.5')! })).toBe('7.50');
  });
  it('rejects text that is not a single number', () => {
    expect(parseTyped(dial, '')).toBeNull();
    expect(parseTyped(dial, 'abc')).toBeNull();
    expect(parseTyped(dial, '1.2.3')).toBeNull();
    expect(parseTyped(dial, '1-2')).toBeNull();
  });
  it('rejects exponent notation consistently', () => {
    expect(parseTyped(dial, '1e3')).toBeNull();
    expect(parseTyped(dial, '1E-2')).toBeNull();
    expect(parseTyped(dB, '2e1 dB')).toBeNull();
  });
  it('accepts only the parameter’s own unit (case and spaces ignored)', () => {
    expect(parseTyped(dB, '500 ms')).toBeNull();
    expect(parseTyped(dB, '-3 Hz')).toBeNull();
    expect(parseTyped(dB, '-3 DB')).toBeCloseTo(0.77, 6);
    expect(parseTyped(pct, '63 %')).toBeCloseTo(0.63, 6);
    expect(parseTyped(pct, '63 dB')).toBeNull();
    expect(parseTyped(dial, '7 dB')).toBeNull(); // a unitless dial takes no unit
    expect(parseTyped(hz, '800hz')).toBeCloseTo(normFromValue(800, hz), 6);
    expect(parseTyped(hz, '2 kHz')).toBeCloseTo(normFromValue(2000, hz), 6);
    expect(parseTyped(hz, '2 kilo')).toBeNull();
    expect(parseTyped({ min: 1, max: 20, unit: ':1' }, '4:1')).toBeCloseTo(normFromValue(4, { min: 1, max: 20 }), 6);
  });
});

describe('stepFor / stepNorm', () => {
  it('1 % coarse, 0.1 % fine', () => {
    expect(stepFor(dial, false)).toBe(0.01);
    expect(stepFor(dial, true)).toBe(0.001);
  });
  it('steps and clamps the norm', () => {
    expect(stepNorm({ ...dial, norm: 0.5 }, 1, false)).toBeCloseTo(0.51, 9);
    expect(stepNorm({ ...dial, norm: 0.5 }, -1, true)).toBeCloseTo(0.499, 9);
    expect(stepNorm({ ...dial, norm: 0.995 }, 1, false)).toBe(1);
    expect(stepNorm({ ...dial, norm: 0.002 }, -1, false)).toBe(0);
  });
});
