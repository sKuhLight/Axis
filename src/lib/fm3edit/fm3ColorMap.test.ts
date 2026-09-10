import { describe, expect, it } from 'vitest';
import { mapFm3Color } from './fm3ColorMap';

describe('fm3ColorMap', () => {
  it('maps all 6 confirmed FM3-Edit hex colors to their name + Axis swatch', () => {
    expect(mapFm3Color('#febcbc')).toEqual({ name: 'Red', swatchIndex: 0 });
    expect(mapFm3Color('#ffd086')).toEqual({ name: 'Orange', swatchIndex: 1 });
    expect(mapFm3Color('#fff58a')).toEqual({ name: 'Yellow', swatchIndex: 3 });
    expect(mapFm3Color('#d7f184')).toEqual({ name: 'Green', swatchIndex: 4 });
    expect(mapFm3Color('#bee0fb')).toEqual({ name: 'Blue', swatchIndex: 6 });
    expect(mapFm3Color('#f1d0fb')).toEqual({ name: 'Purple', swatchIndex: 7 });
  });

  it('is case-insensitive on the hex string', () => {
    expect(mapFm3Color('#FEBCBC')).toEqual({ name: 'Red', swatchIndex: 0 });
  });

  it('falls back to the nearest hue for an unknown color instead of doing nothing', () => {
    // pure red (#ff0000) should land nearest the pastel Red (#febcbc) by hue, not a random swatch
    const result = mapFm3Color('#ff0000');
    expect(result.name).toBe('Red');
  });

  it('nearest-hue fallback picks green over red for a saturated green', () => {
    expect(mapFm3Color('#00ff00').name).toBe('Green');
  });

  it('nearest-hue fallback picks blue for a saturated blue, not purple', () => {
    expect(mapFm3Color('#0000ff').name).toBe('Blue');
  });
});
