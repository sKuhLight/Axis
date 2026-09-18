// Context-menu item building for the docked preset browser rows (§4.4 of
// docs/workbench-dc-parity/06-preset-browser.md). Pure logic: given an entry's shape + the live
// capabilities (rename allowed?) + the current multi-select count, it returns the
// design's menu actions THAT HAVE REAL BACKING in the workbench today.
//
// Deliberately scoped to backed actions (task rule "no fantasy items"):
//   - load        → runtime.loadEntry            (device slots — switch the device to the stored preset)
//   - audition    → runtime.auditionEntry        (entries NOT on the device: imported files + local folder)
//   - saveToDevice → runtime.saveEntryToDevice   (imported files + local folder — pick a destination slot)
//   - favorite    → library.toggleFav            (toggles; label flips on entry.fav)
//   - rename      → editor.renameStoredPreset    (device slots, gated on canRenamePresets)
//   - tags        → library.addTag/removeTag     (any entry)
// The design's Duplicate / Convert / Export-to-disk / Delete-everywhere are NOT emitted here — they are
// "Coming soon" or monolith-only flows with no workbench backing yet (see report/deferrals).
import type { WorkbenchMenuItem } from '../../workbench/svelte/contextMenu';

export type AxisPbMenuActionId =
  | 'load'
  | 'audition'
  | 'saveToDevice'
  | 'favorite'
  | 'rename'
  | 'clear'
  | 'tags'
  | 'crossConvert'
  | 'openConverter'
  | 'deleteConverted';

// The subset of an entry the menu builder needs (keeps it decoupled from the full summary type).
export interface AxisPbMenuEntry {
  id: string;
  /** Is this a real device slot (source 'device' with a slot number ≥ 0)? Device rows get
   *  "Switch to Preset" + rename; non-device rows get "Audition". */
  deviceSlot: boolean;
  fav: boolean;
  /** A saved cross-device conversion (source 'converted') — gets its own reduced menu. */
  converted?: boolean;
  /** A cleared/empty device slot — gets only a "Switch to Preset" action. */
  empty?: boolean;
}

export interface AxisPbMenuCaps {
  /** editor.canRenamePresets — device can rename+store a slot. */
  canRename: boolean;
  /** deviceSession.canDeepScan — gen-3 devices whose scaffold/blank preset the server can serve. */
  canClear: boolean;
}

export interface AxisPbMenuAction {
  id: AxisPbMenuActionId;
  label: string;
  hint?: string;
  danger?: boolean;
  separatorBefore?: boolean;
}

// Build the ordered action list (pre-render form) for one row's context menu (§4.4 single-row menu).
export function buildAxisPbMenuActions(entry: AxisPbMenuEntry, caps: AxisPbMenuCaps): AxisPbMenuAction[] {
  // Cleared/empty slots are not real entries: every other action (audition/rename/tags/favorite/
  // crossConvert) would no-op or ghost-tag a non-entry, so they collapse to a single switch action.
  if (entry.empty) {
    return [{ id: 'load', label: 'Switch to Preset', hint: '↵' }];
  }
  // Saved cross-device conversions are NOT device slots — they get their own reduced menu: re-open in the
  // converter, favorite, delete. (A true ".syx export" action is wired in the codec-authoring task — it
  // needs a codec endpoint, so it is deliberately omitted here rather than shipped as a no-op.)
  if (entry.converted) {
    return [
      { id: 'openConverter', label: 'Open in converter', hint: '↵' },
      { id: 'favorite', label: entry.fav ? 'Remove from favorites' : 'Add to favorites', separatorBefore: true },
      { id: 'tags', label: 'Tags…' },
      { id: 'deleteConverted', label: 'Delete', danger: true, separatorBefore: true }
    ];
  }
  const actions: AxisPbMenuAction[] = [];
  if (entry.deviceSlot) {
    // Already on the device: the primary action navigates to the stored preset.
    actions.push({ id: 'load', label: 'Switch to Preset', hint: '↵' });
    if (caps.canRename) actions.push({ id: 'rename', label: 'Rename & save…' });
    // Clear resets the stored slot to the blank `<EMPTY>` preset (empty grid + name). Gen-3 only:
    // the server's blank scaffold is a deep-dump feature, so a non-gen-3 device never shows it.
    if (caps.canClear) actions.push({ id: 'clear', label: 'Clear preset', danger: true, separatorBefore: true });
  } else {
    // Not on the device (imported file / local folder): trial-load into the edit buffer.
    actions.push({ id: 'audition', label: 'Audition', hint: '↵' });
    // …or choose a destination slot and store it directly (no need to audition first).
    actions.push({ id: 'saveToDevice', label: 'Save to device…' });
  }
  // Cross-device converter (M4): available for every entry — the flow reads the row's .syx and opens the
  // convert dialog seeded with it. Not gated on caps (the converter is best-effort + offline).
  actions.push({ id: 'crossConvert', label: 'Convert to another device…', separatorBefore: true });
  actions.push({
    id: 'favorite',
    label: entry.fav ? 'Remove from favorites' : 'Add to favorites',
    separatorBefore: true
  });
  actions.push({ id: 'tags', label: 'Tags…' });
  return actions;
}

// Adapt the pre-render actions into the generic ContextMenu's item shape, wiring each `run` to the
// supplied dispatcher (the Svelte panel owns the side-effecting handlers).
export function toWorkbenchMenuItems(
  actions: AxisPbMenuAction[],
  dispatch: (id: AxisPbMenuActionId) => void
): WorkbenchMenuItem[] {
  return actions.map((action) => ({
    id: action.id,
    label: action.label,
    hint: action.hint,
    danger: action.danger,
    separatorBefore: action.separatorBefore,
    run: () => dispatch(action.id)
  }));
}
