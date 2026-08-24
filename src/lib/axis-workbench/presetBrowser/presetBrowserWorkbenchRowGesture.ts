// Row gestures resolve to an intent, never straight to a device call. A plain click SELECTS —
// browsing must not be destructive, so you can inspect a preset's detail pane without committing
// to it. Loading is the deliberate gesture (double click / Enter / context menu), matching
// docs/workbench-dc-parity/06-preset-browser.md §4.3 ("Click → selected:n, anchorN:n", Load preset
// in the context menu under hint ↵) and the monolith's PresetBrowser.svelte row button.
//
// This lives in its own module rather than inline in the panel because .svelte components are never
// unit-mounted here (axis-workbench/CLAUDE.md), and the plain-click branch has silently flipped to
// "load" once already — the test beside this file is the guard against that happening again.
export type AxisPbRowIntent = 'mark' | 'markRange' | 'select' | 'load';

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

// Double click always loads, INCLUDING on renameable device slots. It used to branch to the inline
// rename there, which meant the one gesture that should commit a preset did something else entirely
// on exactly the rows you most often want to load. Rename is reachable from the row context menu.
// `canRename` is taken as an argument precisely so that branch stays pinned as removed.
export function axisPbRowDoubleClickIntent(_caps: { canRename: boolean }): AxisPbRowIntent {
  return 'load';
}
