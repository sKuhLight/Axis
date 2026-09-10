import { describe, expect, it } from 'vitest';
import { TAG_SWATCH_COUNT, claimSwatch, fallbackSwatch, normalizeTagColors, tagSwatchCss } from './tagColors';

describe('tagColors', () => {
  it('claimSwatch yields TAG_SWATCH_COUNT distinct indices for that many tags', () => {
    let assigned: Record<string, number> = {};
    for (let i = 0; i < TAG_SWATCH_COUNT; i++) {
      const tag = `tag${i}`;
      assigned = { ...assigned, [tag]: claimSwatch(assigned, tag) };
    }
    const indices = Object.values(assigned);
    expect(new Set(indices).size).toBe(TAG_SWATCH_COUNT);
  });

  it('the next tag past TAG_SWATCH_COUNT wraps onto a least-used (lowest-index tie) swatch', () => {
    let assigned: Record<string, number> = {};
    for (let i = 0; i < TAG_SWATCH_COUNT; i++) {
      const tag = `tag${i}`;
      assigned = { ...assigned, [tag]: claimSwatch(assigned, tag) };
    }
    // every index used exactly once → least-used ties broken by lowest index → 0
    expect(claimSwatch(assigned, 'oneMore')).toBe(0);
  });

  it('assignment is stable: re-claiming the same tag returns its existing index', () => {
    const assigned = { Lead: 5 };
    expect(claimSwatch(assigned, 'Lead')).toBe(5);
  });

  it('assignment is case-insensitive', () => {
    const assigned = { Lead: 5 };
    expect(claimSwatch(assigned, 'LEAD')).toBe(5);
    expect(claimSwatch(assigned, 'lead')).toBe(5);
  });

  it('tagSwatchCss renders a fixed vivid hex per swatch', () => {
    expect(tagSwatchCss(0)).toBe('#e0503f'); // red
    expect(tagSwatchCss(1)).toBe('#dd8a2e'); // orange
  });

  it('every swatch is mutually distinct', () => {
    const swatches = Array.from({ length: TAG_SWATCH_COUNT }, (_, i) => tagSwatchCss(i));
    // Every swatch resolves to a distinct CSS value — the whole point of trimming the table down
    // from a padded wheel is that no two options look the same.
    expect(new Set(swatches).size).toBe(TAG_SWATCH_COUNT);
  });

  it('fallbackSwatch is deterministic and in range', () => {
    const a = fallbackSwatch('Hendrix');
    const b = fallbackSwatch('Hendrix');
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(TAG_SWATCH_COUNT);
  });

  it('normalizeTagColors rejects junk payloads', () => {
    expect(normalizeTagColors(null)).toEqual({});
    expect(normalizeTagColors(undefined)).toEqual({});
    expect(normalizeTagColors('not an object')).toEqual({});
    expect(normalizeTagColors(['not', 'an', 'object'])).toEqual({});
  });

  it('normalizeTagColors drops non-integer and out-of-range values', () => {
    expect(
      normalizeTagColors({ Lead: 3, Bass: 'oops', Solo: 2.5, Neg: -1, TooHigh: TAG_SWATCH_COUNT })
    ).toEqual({ Lead: 3 });
  });
});
