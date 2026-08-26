import { describe, it, expect } from 'vitest';
import {
  AXIS_DENSITIES,
  DENSITIES,
  DEFAULT_DENSITY,
  densityTileMax,
  densityTokens,
  readDensity,
  type DensityScale
} from './density';

const FIELDS = Object.keys(AXIS_DENSITIES.comfortable) as (keyof DensityScale)[];

describe('density scales', () => {
  it('defines every level named in DENSITIES', () => {
    for (const d of DENSITIES) expect(AXIS_DENSITIES[d]).toBeDefined();
    expect(Object.keys(AXIS_DENSITIES).sort()).toEqual([...DENSITIES].sort());
  });

  it('ships compact as the default', () => {
    expect(DEFAULT_DENSITY).toBe('compact');
  });

  // The whole point of the scale is that it tightens uniformly — one field growing while the rest shrink
  // is what makes a density system look accidental. Order follows DENSITIES (loosest first).
  it('shrinks every field monotonically from comfortable to tight', () => {
    for (const field of FIELDS) {
      for (let i = 1; i < DENSITIES.length; i++) {
        const looser = AXIS_DENSITIES[DENSITIES[i - 1]][field];
        const tighter = AXIS_DENSITIES[DENSITIES[i]][field];
        expect(tighter, `${field}: ${DENSITIES[i]} must be < ${DENSITIES[i - 1]}`).toBeLessThan(looser);
      }
    }
  });

  it('keeps every field positive', () => {
    for (const d of DENSITIES) for (const field of FIELDS) expect(AXIS_DENSITIES[d][field]).toBeGreaterThan(0);
  });
});

describe('readDensity', () => {
  it('accepts the three levels and falls back to the default', () => {
    expect(readDensity('comfortable')).toBe('comfortable');
    expect(readDensity('compact')).toBe('compact');
    expect(readDensity('tight')).toBe('tight');
    for (const bad of [undefined, null, '', 'cosy', 42, {}]) expect(readDensity(bad)).toBe(DEFAULT_DENSITY);
  });
});

describe('densityTokens', () => {
  it('emits one px-suffixed custom property per scale field, un-prefixed', () => {
    const tokens = densityTokens('compact');
    expect(Object.keys(tokens)).toHaveLength(FIELDS.length);
    for (const [name, value] of Object.entries(tokens)) {
      expect(name.startsWith('--'), `${name} must not carry the -- prefix`).toBe(false);
      expect(name.startsWith('d-')).toBe(true);
      expect(value).toMatch(/^[\d.]+px$/);
    }
  });

  it('reflects the level it was asked for', () => {
    expect(densityTokens('comfortable')['d-ctl-h']).toBe('44px');
    expect(densityTokens('compact')['d-ctl-h']).toBe('36px');
    expect(densityTokens('tight')['d-ctl-h']).toBe('30px');
  });

  it('falls back to the default level for an unknown value', () => {
    expect(densityTokens('nonsense' as never)).toEqual(densityTokens(DEFAULT_DENSITY));
  });
});

describe('densityTileMax', () => {
  it('returns the board cell cap for each level', () => {
    expect(densityTileMax('comfortable')).toBe(132);
    expect(densityTileMax('compact')).toBe(104);
    expect(densityTileMax('tight')).toBe(88);
  });

  // The bug this cap exists to prevent: a wide pane inflated cells to 171px (a 133px dial).
  it('caps well below the 171px cell that motivated it', () => {
    for (const d of DENSITIES) expect(densityTileMax(d)).toBeLessThan(171);
  });
});
