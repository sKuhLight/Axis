import { describe, expect, it } from 'vitest';
import { fmtValue, withUnit, type DispRange } from './format';

// A ranged param whose linear taper lands exactly on `value` at norm 0.5 (min/max straddle it).
// Lets each case declare the device-true value + unit token it should render.
function at(value: number, unit?: string): DispRange {
  return { min: value - 100, max: value + 100, norm: 0.5, unit };
}

describe('withUnit', () => {
  it('single-spaces normal tokens and keeps their casing verbatim', () => {
    expect(withUnit('4', 'dB')).toBe('4 dB');
    expect(withUnit('12', 'dB/OCT')).toBe('12 dB/OCT');
    expect(withUnit('4', 'dBu')).toBe('4 dBu');
    expect(withUnit('-10', 'dBV')).toBe('-10 dBV');
    expect(withUnit('0.5', 'SECONDS')).toBe('0.5 SECONDS');
    expect(withUnit('128', 'SAMPLES')).toBe('128 SAMPLES');
    expect(withUnit('470', 'Hz')).toBe('470 Hz');
  });

  it('attaches % with no space (device convention)', () => {
    expect(withUnit('63', '%')).toBe('63%');
  });

  it('returns just the number when the unit is empty or absent — never a trailing space or undefined', () => {
    expect(withUnit('5', undefined)).toBe('5');
    expect(withUnit('5', '')).toBe('5');
    expect(withUnit('5')).toBe('5');
  });
});

describe('fmtValue', () => {
  it('renders each device-true unit token as number + single space + verbatim token', () => {
    expect(fmtValue(at(4, 'dB'))).toBe('4 dB');
    expect(fmtValue(at(12, 'dB/OCT'))).toBe('12 dB/OCT');
    expect(fmtValue(at(4, 'dBu'))).toBe('4 dBu');
    expect(fmtValue(at(-10, 'dBV'))).toBe('-10 dBV');
    expect(fmtValue(at(0.5, 'SECONDS'))).toBe('0.5 SECONDS');
    expect(fmtValue(at(128, 'SAMPLES'))).toBe('128 SAMPLES');
  });

  it('does not invent conversions for the new tokens (SECONDS stays SECONDS)', () => {
    expect(fmtValue(at(0.5, 'SECONDS'))).toContain('SECONDS');
    expect(fmtValue(at(0.5, 'SECONDS'))).not.toContain('ms');
  });

  it('keeps the % special-case (no space) working', () => {
    expect(fmtValue(at(63, '%'))).toBe('63%');
  });

  it('keeps Hz below 1000 as Hz but compacts >= 1000 to kHz', () => {
    expect(fmtValue(at(470, 'Hz'))).toBe('470 Hz');
    expect(fmtValue(at(12000, 'Hz'))).toBe('12 kHz');
    expect(fmtValue(at(4700, 'Hz'))).toBe('4.7 kHz');
  });

  it('renders just the number for the no-unit case (ranged or coarse)', () => {
    expect(fmtValue(at(5, undefined))).toBe('5');
    // coarse knob: no min/max → value used directly, no unit
    expect(fmtValue({ value: 42 })).toBe('42');
  });

  it('never emits a double space or the literal "undefined"', () => {
    const samples: DispRange[] = [
      at(4, 'dB'),
      at(12, 'dB/OCT'),
      at(4, 'dBu'),
      at(-10, 'dBV'),
      at(0.5, 'SECONDS'),
      at(128, 'SAMPLES'),
      at(470, 'Hz'),
      at(12000, 'Hz'),
      at(63, '%'),
      at(5, undefined),
      { value: 42 }
    ];
    for (const p of samples) {
      const s = fmtValue(p);
      expect(s).not.toMatch(/ {2}/);
      expect(s).not.toContain('undefined');
    }
  });
});
