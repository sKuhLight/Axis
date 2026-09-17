// Row gestures resolve to an intent, never straight to a device call. A plain click SELECTS —
// browsing must not be destructive, so you can inspect a preset's detail pane without committing
// to it. Loading is the deliberate gesture (double click / Enter / context menu), matching
// docs/workbench-dc-parity/06-preset-browser.md §4.3 ("Click → selected:n, anchorN:n", Load preset
// in the context menu under hint ↵) and the monolith's PresetBrowser.svelte row button.
//
// Double click resolves by ROW KIND: a device slot switches the device to it; a disk preset
// (imported file / local folder) is AUDITIONED — tried in the edit buffer without occupying a slot;
// a saved conversion is a no-op (its bytes aren't loadable, it re-opens in the converter).
//
// This lives in its own module rather than inline in the panel because .svelte components are never
// unit-mounted here (axis-workbench/CLAUDE.md), and the plain-click branch has silently flipped to
// "load" once already — the test beside this file is the guard against that happening again.
export type AxisPbRowIntent = 'mark' | 'markRange' | 'select' | 'load' | 'audition' | 'none';

/** The subset of MouseEvent this decision reads — so callers can test it without a DOM. */
export interface AxisPbRowGestureModifiers {
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
}

export function axisPbRowClickIntent(mod: AxisPbRowGestureModifiers): AxisPbRowIntent {
  // Mark wins over range: cmd+shift is a mark toggle, not a range mark.
  if (mod.metaKey || mod.ctrlKey) return 'mark';
  if (mod.shiftKey) return 'markRange';
  return 'select';
}

/** The row shape a double-click resolves against. `deviceSlot` = a real stored slot; `converted` = a
 *  saved cross-device conversion doc (not loadable bytes). Anything else is an imported file / local
 *  folder preset. */
export interface AxisPbRowDoubleClickTarget {
  deviceSlot: boolean;
  converted?: boolean;
}

// Device slot → load (switch the device to it). Disk preset (imported file / local folder) → audition
// (non-destructive: it fills the edit buffer but occupies no slot, so a stray double-click can't
// overwrite anything). Saved conversion → no-op. See ../test/presetBrowserWorkbenchRowGesture.test.ts.
export function axisPbRowDoubleClickIntent(target: AxisPbRowDoubleClickTarget): AxisPbRowIntent {
  if (target.deviceSlot) return 'load';
  if (target.converted) return 'none';
  return 'audition';
}
