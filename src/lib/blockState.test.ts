import { describe, expect, it } from 'vitest';
import { formatBypassModeLabel, liveBlockState, parseBlockState, withBypassModeLabels } from './blockState';
import type { EnumParam } from './types';

const SERVED = {
  sceneIgnore: { paramId: 137, value: 1, supported: true },
  bypassMode: {
    paramId: 3,
    value: 0,
    options: [
      { value: 0, label: 'THRU', muting: false },
      { value: 1, label: 'MUTE', muting: true }
    ]
  }
};

describe('parseBlockState', () => {
  it('reads the server tag', () => {
    expect(parseBlockState(SERVED)).toEqual(SERVED);
  });
  it('absent or not an object: undefined (older server / other device)', () => {
    for (const raw of [undefined, null, 'x', 3, []]) expect(parseBlockState(raw)).toBeUndefined();
  });
  it('null members stay null; malformed members read as null', () => {
    expect(parseBlockState({ sceneIgnore: null, bypassMode: null })).toEqual({ sceneIgnore: null, bypassMode: null });
    expect(parseBlockState({})).toEqual({ sceneIgnore: null, bypassMode: null });
    expect(parseBlockState({ sceneIgnore: { paramId: '137', value: 1, supported: true } })!.sceneIgnore).toBeNull();
    expect(parseBlockState({ bypassMode: { paramId: 3, value: 0 } })!.bypassMode).toBeNull(); // no options
    expect(parseBlockState({ bypassMode: { paramId: 3, value: 0, options: [{ value: 0, label: 'THRU' }] } })!.bypassMode).toBeNull(); // one option
  });
  it('`supported` must be a boolean (no default): anything else is a malformed member', () => {
    expect(parseBlockState({ sceneIgnore: { paramId: 6, value: 0, supported: false, reason: 'Needs firmware ≥ 2.03' } })!.sceneIgnore).toEqual({
      paramId: 6,
      value: 0,
      supported: false,
      reason: 'Needs firmware ≥ 2.03'
    });
    for (const supported of [undefined, 'true', 1, null]) {
      expect(parseBlockState({ sceneIgnore: { paramId: 6, value: 0, supported } })!.sceneIgnore, String(supported)).toBeNull();
    }
  });
  it('a read error of the server is kept (and only `true` counts)', () => {
    expect(parseBlockState({ sceneIgnore: null, bypassMode: null, readError: true })).toEqual({ sceneIgnore: null, bypassMode: null, readError: true });
    expect(parseBlockState({ sceneIgnore: null, bypassMode: null, readError: 'yes' })).toEqual({ sceneIgnore: null, bypassMode: null });
  });
  it('options: non-numeric values dropped, a missing label is the ordinal, muting defaults to false', () => {
    const bm = parseBlockState({ bypassMode: { paramId: 3, value: 0, options: [{ value: 0 }, { value: 'x' }, { value: 1, label: 'MUTE', muting: 'yes' }] } })!.bypassMode!;
    expect(bm.options).toEqual([
      { value: 0, label: '0', muting: false },
      { value: 1, label: 'MUTE', muting: false }
    ]);
  });
});

describe('liveBlockState', () => {
  it('values come from the live enums (the board edits the same params)', () => {
    const s = parseBlockState(SERVED)!;
    const live = liveBlockState(s, [
      { id: 137, value: 0 },
      { id: 3, value: 1 }
    ])!;
    expect(live.sceneIgnore!.value).toBe(0);
    expect(live.bypassMode!.value).toBe(1);
    expect(s.sceneIgnore!.value).toBe(1); // the input is not mutated
  });
  it('a tagged param the enums do not list is no control; no state stays null; a read error is kept', () => {
    expect(liveBlockState(parseBlockState(SERVED), [{ id: 3, value: 1 }])).toEqual({ sceneIgnore: null, bypassMode: { ...SERVED.bypassMode, value: 1 } });
    expect(liveBlockState(parseBlockState(SERVED), [])).toEqual({ sceneIgnore: null, bypassMode: null });
    expect(liveBlockState(null, [])).toBeNull();
    expect(liveBlockState(undefined, [])).toBeNull();
    expect(liveBlockState({ sceneIgnore: null, bypassMode: null, readError: true }, [])).toEqual({ sceneIgnore: null, bypassMode: null, readError: true });
  });
});

describe('formatBypassModeLabel / withBypassModeLabels', () => {
  it('device labels title-cased (FX stays), an unnamed mode by its position', () => {
    expect(formatBypassModeLabel('THRU', 0)).toBe('Thru');
    expect(formatBypassModeLabel('MUTE FX IN', 3)).toBe('Mute FX In');
    expect(formatBypassModeLabel('Mute Out', 2)).toBe('Mute Out');
    expect(formatBypassModeLabel(' mute  in ', 4)).toBe('Mute In');
    expect(formatBypassModeLabel('2', 2)).toBe('Mode 3');
    expect(formatBypassModeLabel('', 0)).toBe('Mode 1');
  });
  it('the board shows the tagged Bypass Mode like the header; other enums and the input untouched', () => {
    const enums: EnumParam[] = [
      { id: 3, name: 'Bypass Mode', value: 0, options: [{ value: 0, label: 'THRU' }, { value: 1, label: 'MUTE FX OUT' }, { value: 2, label: '2' }] },
      { id: 10, name: 'Bright', value: 0, options: [{ value: 0, label: 'OFF' }, { value: 1, label: 'ON' }] }
    ];
    const out = withBypassModeLabels(enums, parseBlockState(SERVED));
    expect(out[0]!.options.map((o) => o.label)).toEqual(['Thru', 'Mute FX Out', 'Mode 3']);
    expect(out[1]).toBe(enums[1]);
    expect(enums[0]!.options[0]!.label).toBe('THRU');
    expect(withBypassModeLabels(enums, undefined)).toBe(enums);
    expect(withBypassModeLabels(enums, { sceneIgnore: null, bypassMode: null })).toBe(enums);
  });
});
