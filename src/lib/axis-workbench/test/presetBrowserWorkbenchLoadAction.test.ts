import { describe, expect, it } from 'vitest';
import { resolvePresetLoadAction } from '../presetBrowser/presetBrowserWorkbenchLoadAction';

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
