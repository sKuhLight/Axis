import { describe, it, expect } from 'vitest';
import { divisionSeconds, formatHz, formatPeriod, lfoRateHz, parseDivision, TEMPO_UNKNOWN_NOTE } from './tempo';

describe('parseDivision', () => {
  it('reads plain divisions as fractions of a whole note', () => {
    expect(parseDivision('1/4')).toBe(0.25);
    expect(parseDivision('1/16')).toBe(1 / 16);
    expect(parseDivision('1')).toBe(1);
    expect(parseDivision('2')).toBe(2);
    expect(parseDivision('3')).toBe(3);
    expect(parseDivision('4')).toBe(4);
    expect(parseDivision('4/3')).toBeCloseTo(4 / 3, 12);
    expect(parseDivision('5/4')).toBe(1.25);
    expect(parseDivision('5/64')).toBe(5 / 64);
  });

  it('applies DOT (×1.5) and TRIP (×2/3)', () => {
    expect(parseDivision('1/8 DOT')).toBe(0.1875);
    expect(parseDivision('1/4 TRIP')).toBeCloseTo(1 / 6, 12);
    expect(parseDivision('1/64 TRIP')).toBeCloseTo(1 / 96, 12);
    expect(parseDivision('1 TRIP')).toBeCloseTo(2 / 3, 12);
    expect(parseDivision('1 DOT')).toBe(1.5);
    expect(parseDivision('1/8 dot')).toBe(0.1875);
  });

  it('takes the leading fraction and ignores an alias in parentheses', () => {
    expect(parseDivision('10/64 (5/32)')).toBe(10 / 64);
  });

  it('returns null for NONE / empty / garbage / non-positive', () => {
    expect(parseDivision('NONE ')).toBeNull();
    expect(parseDivision('NONE')).toBeNull();
    expect(parseDivision('')).toBeNull();
    expect(parseDivision('   ')).toBeNull();
    expect(parseDivision(null)).toBeNull();
    expect(parseDivision(undefined)).toBeNull();
    expect(parseDivision('DOT')).toBeNull();
    expect(parseDivision('0')).toBeNull();
    expect(parseDivision('0/4')).toBeNull();
    expect(parseDivision('1/0')).toBeNull();
  });
});

describe('divisionSeconds', () => {
  it('is 4·d·60/bpm', () => {
    expect(divisionSeconds('1/4', 120)).toBe(0.5);
    expect(divisionSeconds('1', 60)).toBe(4);
    expect(divisionSeconds('1/8 DOT', 120)).toBeCloseTo(0.375, 12);
  });

  it('is null without a division or a usable tempo', () => {
    expect(divisionSeconds('NONE ', 120)).toBeNull();
    expect(divisionSeconds('1/4', 0)).toBeNull();
    expect(divisionSeconds('1/4', -10)).toBeNull();
    expect(divisionSeconds('1/4', NaN)).toBeNull();
    expect(divisionSeconds('1/4', Infinity)).toBeNull();
  });
});

describe('lfoRateHz', () => {
  it('syncs to tempo: 1/4 at 90 bpm is exactly 1.5 Hz', () => {
    expect(lfoRateHz(3, '1/4', 90, true)).toEqual({ hz: 1.5, synced: true });
  });

  it('falls back to the Rate value (with a note) when the tempo is unknown', () => {
    expect(lfoRateHz(2, '1/4', 120, false)).toEqual({ hz: 2, synced: false, note: TEMPO_UNKNOWN_NOTE });
    expect(lfoRateHz(2, '1/4', 0, true)).toEqual({ hz: 2, synced: false, note: TEMPO_UNKNOWN_NOTE });
    expect(TEMPO_UNKNOWN_NOTE).toBe('tempo unknown — drawn at the Rate value');
  });

  it('uses the free rate without a division', () => {
    expect(lfoRateHz(0.25, 'NONE ', 120, true)).toEqual({ hz: 0.25, synced: false });
    expect(lfoRateHz(4, null, 0, false)).toEqual({ hz: 4, synced: false });
  });

  it('is null when nothing usable is left', () => {
    expect(lfoRateHz(0, 'NONE ', 120, true)).toBeNull();
    expect(lfoRateHz(null, undefined, 120, true)).toBeNull();
    expect(lfoRateHz(-1, '1/4', 0, false)).toBeNull();
    expect(lfoRateHz(NaN, '1/4', 120, false)).toBeNull();
  });
});

describe('formatHz / formatPeriod', () => {
  it('formats Hz by magnitude', () => {
    expect(formatHz(2)).toBe('2.0 Hz');
    expect(formatHz(0.25)).toBe('0.25 Hz');
    expect(formatHz(12)).toBe('12 Hz');
    expect(formatHz(1.5)).toBe('1.5 Hz');
    expect(formatHz(0.05)).toBe('0.050 Hz');
    expect(formatHz(9.96)).toBe('10 Hz');
    expect(formatHz(NaN)).toBe('—');
  });

  it('formats periods: ms below 1 s, seconds from 1 s', () => {
    expect(formatPeriod(2 / 3)).toBe('667 ms');
    expect(formatPeriod(0.5)).toBe('500 ms');
    expect(formatPeriod(0.0025)).toBe('2.5 ms');
    expect(formatPeriod(2)).toBe('2.0 s');
    expect(formatPeriod(1.5)).toBe('1.5 s');
    expect(formatPeriod(12)).toBe('12 s');
    expect(formatPeriod(0.9996)).toBe('1.0 s');
    expect(formatPeriod(-1)).toBe('—');
  });
});
