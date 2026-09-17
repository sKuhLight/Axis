import { describe, expect, it } from 'vitest';
import {
  axisPbRowClickIntent,
  axisPbRowDoubleClickIntent
} from '../presetBrowser/presetBrowserWorkbenchRowGesture';

describe('preset row gestures', () => {
  // The regression guard. Commit 32de674 made a plain click load the preset onto the device, so
  // scanning the list fired a real slot switch / edit-buffer replacement on every click. Browsing
  // must stay non-destructive: a plain click only selects.
  it('a plain click selects, never loads', () => {
    expect(axisPbRowClickIntent({})).toBe('select');
    expect(axisPbRowClickIntent({ metaKey: false, ctrlKey: false, shiftKey: false })).toBe('select');
  });

  it('cmd-click marks', () => {
    expect(axisPbRowClickIntent({ metaKey: true })).toBe('mark');
  });

  it('ctrl-click marks (non-mac)', () => {
    expect(axisPbRowClickIntent({ ctrlKey: true })).toBe('mark');
  });

  it('shift-click marks a range', () => {
    expect(axisPbRowClickIntent({ shiftKey: true })).toBe('markRange');
  });

  it('cmd+shift-click marks rather than range-marks', () => {
    expect(axisPbRowClickIntent({ metaKey: true, shiftKey: true })).toBe('mark');
    expect(axisPbRowClickIntent({ ctrlKey: true, shiftKey: true })).toBe('mark');
  });

  it('a double click on a device preset loads', () => {
    expect(axisPbRowDoubleClickIntent({ deviceSlot: true })).toBe('load');
  });

  // Disk presets (imported file / local folder) are AUDITIONED — a double-click tries them in the
  // edit buffer without occupying a slot, so it can never overwrite a stored preset.
  it('a double click on a disk preset auditions', () => {
    expect(axisPbRowDoubleClickIntent({ deviceSlot: false })).toBe('audition');
  });

  // A saved conversion has no loadable bytes — its only action is re-opening in the converter.
  it('a double click on a saved conversion is a no-op', () => {
    expect(axisPbRowDoubleClickIntent({ deviceSlot: false, converted: true })).toBe('none');
  });
});
