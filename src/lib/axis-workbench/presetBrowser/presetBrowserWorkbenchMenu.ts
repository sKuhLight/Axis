// Context-menu item building for the docked preset browser rows (§4.4 of
// docs/workbench-dc-parity/06-preset-browser.md). Pure logic: given an entry's shape + the live
// capabilities (rename allowed? cloud signed in?) + the current multi-select count, it returns the
// design's menu actions THAT HAVE REAL BACKING in the workbench today.
//
// Deliberately scoped to backed actions (task rule "no fantasy items"):
//   - load        → runtime.loadEntry            (all entries; "Load from cloud" for cloud-only rows)
//   - audition    → runtime.auditionEntry        (device slots only)
//   - favorite    → library.toggleFav            (toggles; label flips on entry.fav)
//   - rename      → editor.renameStoredPreset    (device slots, gated on canRenamePresets)
//   - cloudUpload → editor.backupPreset+cloudSync (signed in; "Back up"/"Upload"/"Re-upload" by sync state)
//   - cloudDownload → runtime cloud-version load  (signed in; outdated/cloudOnly rows)
// The design's Duplicate / Convert / Export-to-disk / Delete-everywhere are NOT emitted here — they are
// "Coming soon" or monolith-only flows with no workbench backing yet (see report/deferrals).
import type { WorkbenchMenuItem } from '../../workbench/svelte/contextMenu';

export type AxisPbMenuActionId =
  | 'load'
  | 'audition'
  | 'favorite'
  | 'rename'
  | 'cloudUpload'
  | 'cloudDownload';

// The subset of an entry the menu builder needs (keeps it decoupled from the full summary type).
export interface AxisPbMenuEntry {
  id: string;
  /** True for a synthesized cloud-only row (host id starts with `cloud:`). */
  cloudOnly: boolean;
  /** Is this a real device slot (source 'device' with a slot number ≥ 0)? Gates audition + rename. */
  deviceSlot: boolean;
  fav: boolean;
  /** Resolved cloud sync state — decides the cloud action label/direction. */
  syncState: string;
}

export interface AxisPbMenuCaps {
  /** editor.canRenamePresets — device can rename+store a slot. */
  canRename: boolean;
  /** cloud enabled AND signed in — gates the cloud up/down actions. */
  cloudOn: boolean;
}

export interface AxisPbMenuAction {
  id: AxisPbMenuActionId;
  label: string;
  hint?: string;
  danger?: boolean;
  separatorBefore?: boolean;
}

// The cloud action (label + direction) for a single entry by its sync state (§4.4 sync-state action).
function cloudActionFor(entry: AxisPbMenuEntry): AxisPbMenuAction | null {
  switch (entry.syncState) {
    case 'modified':
      return { id: 'cloudUpload', label: 'Upload changes', separatorBefore: true };
    case 'outdated':
      return { id: 'cloudDownload', label: 'Update from cloud', separatorBefore: true };
    case 'cloudOnly':
      return { id: 'cloudDownload', label: 'Download to device', separatorBefore: true };
    case 'deviceOnly':
    case 'unknown':
      return { id: 'cloudUpload', label: 'Back up to cloud', separatorBefore: true };
    case 'synced':
      return { id: 'cloudUpload', label: 'Re-upload to cloud', separatorBefore: true };
    default:
      return null;
  }
}

// Build the ordered action list (pre-render form) for one row's context menu (§4.4 single-row menu).
export function buildAxisPbMenuActions(entry: AxisPbMenuEntry, caps: AxisPbMenuCaps): AxisPbMenuAction[] {
  const actions: AxisPbMenuAction[] = [
    { id: 'load', label: entry.cloudOnly ? 'Load from cloud' : 'Load preset', hint: '↵' }
  ];
  if (entry.deviceSlot && !entry.cloudOnly) {
    actions.push({ id: 'audition', label: 'Audition (edit buffer)' });
    if (caps.canRename) actions.push({ id: 'rename', label: 'Rename & save…' });
  }
  actions.push({
    id: 'favorite',
    label: entry.fav ? 'Remove from favorites' : 'Add to favorites',
    separatorBefore: true
  });
  if (caps.cloudOn) {
    const cloud = cloudActionFor(entry);
    if (cloud) actions.push(cloud);
  }
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
