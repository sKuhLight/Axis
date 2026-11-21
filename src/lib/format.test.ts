import { describe, expect, it } from 'vitest';
import { catalogUnitSymbol, fmtValue, isUnrangedParam, withUnit, type DispRange } from './format';

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

describe('catalogUnitSymbol', () => {
  it('maps the unitful catalog codes to their display symbols', () => {
    expect(catalogUnitSymbol('percent')).toBe('%');
    expect(catalogUnitSymbol('bipolar_percent')).toBe('%');
    expect(catalogUnitSymbol('semitones')).toBe('st');
    expect(catalogUnitSymbol('db')).toBe('dB');
    expect(catalogUnitSymbol('hz')).toBe('Hz');
    expect(catalogUnitSymbol('khz')).toBe('kHz');
    expect(catalogUnitSymbol('ms')).toBe('ms');
    expect(catalogUnitSymbol('seconds')).toBe('s');
    expect(catalogUnitSymbol('sec')).toBe('s');
    expect(catalogUnitSymbol('ratio')).toBe(':1');
    expect(catalogUnitSymbol('cents')).toBe('ct');
    expect(catalogUnitSymbol('bpm')).toBe('BPM');
    expect(catalogUnitSymbol('degrees')).toBe('°');
    expect(catalogUnitSymbol('deg')).toBe('°');
    expect(catalogUnitSymbol('pf')).toBe('pF');
  });

  it('drops the codes that name no unit', () => {
    for (const code of ['knob_0_10', 'knob_0_20', 'numeric', 'count', 'enum', 'unverified', '']) {
      expect(catalogUnitSymbol(code)).toBe('');
    }
    expect(catalogUnitSymbol(undefined)).toBe('');
    expect(catalogUnitSymbol(null)).toBe('');
  });

  it('is idempotent on symbols and leaves unknown device-true tokens verbatim', () => {
    for (const symbol of ['%', 'st', 'dB', 'Hz', 'kHz', 'ms', 's', ':1', 'ct', 'BPM', '°', 'pF']) {
      expect(catalogUnitSymbol(symbol)).toBe(symbol);
      expect(catalogUnitSymbol(catalogUnitSymbol(symbol))).toBe(symbol);
    }
    // device-true tokens keep their casing; objects' own keys are not unit codes
    for (const token of ['dB/OCT', 'SECONDS', 'SAMPLES', 'dBu', 'dBV', 'constructor', '__proto__', 'toString']) {
      expect(catalogUnitSymbol(token)).toBe(token);
    }
  });

  it('composes with withUnit: % attaches, symbols single-space, no-unit codes give the bare number', () => {
    expect(withUnit('5', catalogUnitSymbol('percent'))).toBe('5%');
    expect(withUnit('5', catalogUnitSymbol('bipolar_percent'))).toBe('5%');
    expect(withUnit('-7', catalogUnitSymbol('semitones'))).toBe('-7 st');
    expect(withUnit('4', catalogUnitSymbol('db'))).toBe('4 dB');
    expect(withUnit('12', catalogUnitSymbol('dB/OCT'))).toBe('12 dB/OCT');
    expect(withUnit('5', catalogUnitSymbol('knob_0_10'))).toBe('5');
    expect(withUnit('5', catalogUnitSymbol('knob_0_20'))).toBe('5');
    expect(withUnit('5', catalogUnitSymbol('numeric'))).toBe('5');
  });
});

describe('isUnrangedParam', () => {
  it('flags a param with no range row (kind absent): its value is the raw 0..65534 model value', () => {
    expect(isUnrangedParam({ value: 32767 })).toBe(true);
    expect(isUnrangedParam({ kind: undefined, value: 32767, raw: 32767 })).toBe(true);
    expect(isUnrangedParam({ kind: null, value: 40000, raw: 40000 })).toBe(true);
  });

  it('flags a 0..0 placeholder range row (float kind, value === raw)', () => {
    expect(isUnrangedParam({ kind: 'float', value: 32767, raw: 32767 })).toBe(true);
  });

  it('keeps a real ranged value: display value differs from the raw model value', () => {
    expect(isUnrangedParam({ kind: 'float', value: 5, raw: 3277 })).toBe(false);
    expect(isUnrangedParam({ kind: 'float', value: -12, raw: 20000 })).toBe(false);
    // no raw to compare against: a ranged kind is trusted
    expect(isUnrangedParam({ kind: 'float', value: 5 })).toBe(false);
    // raw 0 at a range minimum of 0 is a legitimate 0, not a placeholder
    expect(isUnrangedParam({ kind: 'float', value: 0, raw: 0 })).toBe(false);
    // enum rows are never placeholders
    expect(isUnrangedParam({ kind: 'enum', value: 3, raw: 3 })).toBe(false);
  });
});
