import { describe, expect, it } from 'vitest';
import {
  isDevicePreset,
  resolvePresetLoadAction
} from '../presetBrowser/presetBrowserWorkbenchLoadAction';

describe('resolvePresetLoadAction', () => {
  it('a saved conversion re-opens the converter', () => {
    expect(resolvePresetLoadAction({ converted: true, empty: false, number: 3 })).toEqual({ kind: 'openConverter' });
  });

  it('converted wins over empty (a converted entry is never also an empty slot, but the branch order matters)', () => {
    expect(resolvePresetLoadAction({ converted: true, empty: true, number: 3 })).toEqual({ kind: 'openConverter' });
  });

  it('an empty device slot loads the slot number, defaulting to 0 when number is missing', () => {
    expect(resolvePresetLoadAction({ converted: false, empty: true, number: 5 })).toEqual({
      kind: 'loadEmptySlot',
      number: 5
    });
    expect(resolvePresetLoadAction({ converted: false, empty: true, number: null })).toEqual({
      kind: 'loadEmptySlot',
      number: 0
    });
  });

  it('a real entry goes through the runtime load path', () => {
    expect(resolvePresetLoadAction({ converted: false, empty: false, number: 12 })).toEqual({ kind: 'runtimeLoad' });
  });
});

describe('isDevicePreset', () => {
  it('is true only for a device source with a real slot number', () => {
    expect(isDevicePreset({ sourceId: 'device', number: 4 })).toBe(true);
    expect(isDevicePreset({ sourceId: 'device', number: 0 })).toBe(true);
  });

  it('rejects disk presets and slot-less device rows', () => {
    expect(isDevicePreset({ sourceId: 'file', number: 0 })).toBe(false);
    expect(isDevicePreset({ sourceId: 'local', number: 0 })).toBe(false);
    expect(isDevicePreset({ sourceId: 'converted', number: 4 })).toBe(false);
    expect(isDevicePreset({ sourceId: 'device', number: null })).toBe(false);
    expect(isDevicePreset({ sourceId: 'device', number: -1 })).toBe(false);
  });
});
