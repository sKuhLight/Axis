import { describe, it, expect } from 'vitest';
import { buildParams, buildEnums } from './convertParams';
import type { ConverterParam } from './types';

// The converter attaches display metadata to a mapped param when a real per-device catalog covers it.
function p(extra: Partial<ConverterParam> & { nativeName: string; value: number }): ConverterParam {
  return extra as ConverterParam;
}

describe('convertParams.buildParams', () => {
  it('builds a real knob from IR range metadata (min/max/unit/log + normalized)', () => {
    const params = [
      p({ nativeName: 'bass', value: 7, min: 0, max: 10, normalized: 0.7 }),
      p({ nativeName: 'hicut', value: 8000, min: 200, max: 20000, unit: 'Hz', log: true }),
    ];
    const out = buildParams(params);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 0, name: 'bass', value: 7, min: 0, max: 10, norm: 0.7 });
    // hicut has no `normalized`, so norm is computed from value+range (log taper).
    expect(out[1]).toMatchObject({ id: 1, name: 'hicut', min: 200, max: 20000, unit: 'Hz', log: true });
    expect(out[1].norm).toBeGreaterThan(0);
    expect(out[1].norm).toBeLessThanOrEqual(1);
  });

  it('degrades to a coarse knob (no min/max/norm) when the converter had no catalog data', () => {
    const out = buildParams([p({ nativeName: 'mystery', value: 42 })]);
    expect(out[0]).toMatchObject({ id: 0, name: 'mystery', value: 42 });
    expect(out[0].min).toBeUndefined();
    expect(out[0].max).toBeUndefined();
    expect(out[0].norm).toBeUndefined();
  });

  it('excludes enum params (they render as dropdowns), keeping index-aligned ids', () => {
    const params = [
      p({ nativeName: 'level', value: 5, min: 0, max: 10 }),
      p({ nativeName: 'mode', value: 1, enumOptions: ['A', 'B'] }),
      p({ nativeName: 'depth', value: 3, min: 0, max: 10 }),
    ];
    const out = buildParams(params);
    expect(out.map((x) => x.name)).toEqual(['level', 'depth']);
    // ids stay the ORIGINAL array indices so setParam maps back correctly.
    expect(out.map((x) => x.id)).toEqual([0, 2]);
  });
});

describe('convertParams.buildEnums', () => {
  it('builds a dropdown from ordered enumOptions (index = ordinal), id = array index', () => {
    const params = [
      p({ nativeName: 'level', value: 5, min: 0, max: 10 }),
      p({ nativeName: 'mode', value: 1, enumOptions: ['Off', 'Low', 'High'] }),
    ];
    const out = buildEnums(params);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 1, name: 'mode', value: 1 });
    expect(out[0].options).toEqual([
      { value: 0, label: 'Off' },
      { value: 1, label: 'Low' },
      { value: 2, label: 'High' },
    ]);
  });

  it('is empty when no param carries enum options', () => {
    expect(buildEnums([p({ nativeName: 'level', value: 5, min: 0, max: 10 })])).toEqual([]);
  });
});
