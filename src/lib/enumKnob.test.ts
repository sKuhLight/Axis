import { describe, expect, it } from 'vitest';
import type { EnumParam } from './types';
import { enumKnobLabel, enumKnobNorm, enumKnobValueAt } from './enumKnob';

const quantize = (value: number): EnumParam => ({
  id: 23,
  name: 'Quantize',
  value,
  options: [
    { value: 0, label: 'OFF' },
    ...Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 2) })),
  ],
});

describe('enum knob mapping', () => {
  it('places OFF at the first position and 32 at the upper bound', () => {
    expect(enumKnobNorm(quantize(0))).toBe(0);
    expect(enumKnobLabel(quantize(0))).toBe('OFF');
    expect(enumKnobNorm(quantize(31))).toBe(1);
    expect(enumKnobLabel(quantize(31))).toBe('32');
  });

  it('changes values only when the continuous position crosses a threshold', () => {
    const param = quantize(0);
    expect(enumKnobValueAt(param, 0.01)).toBe(0);
    expect(enumKnobValueAt(param, 0.02)).toBe(1);
    expect(enumKnobValueAt(param, 0.5)).toBe(16);
  });

  it('clamps positions outside the knob sweep', () => {
    expect(enumKnobValueAt(quantize(0), -1)).toBe(0);
    expect(enumKnobValueAt(quantize(0), 2)).toBe(31);
  });
});
