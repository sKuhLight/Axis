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

  it('a double click loads', () => {
    expect(axisPbRowDoubleClickIntent({ canRename: false })).toBe('load');
  });

  // Used to open the inline rename instead of loading. Rename moved to the context menu.
  it('a double click on a renameable device slot loads rather than renaming', () => {
    expect(axisPbRowDoubleClickIntent({ canRename: true })).toBe('load');
  });
});
