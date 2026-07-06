import type { NavigationEntryState, NavigationMode } from '../core';

export function canMoveNavigationEntry(entry: NavigationEntryState): boolean {
  return !entry.locked && (!entry.fixedSlot || entry.fixedSlot === 'none');
}

export function canHideNavigationEntry(entry: NavigationEntryState): boolean {
  return canMoveNavigationEntry(entry);
}

export function navigationEntryIndex(entries: NavigationEntryState[], entryId: string): number {
  return entries.findIndex((entry) => entry.id === entryId);
}

/**
 * V14c — the shell's rail render rule (design 01-shell §9): "Rail is visible when
 * navMode==='side' OR rail-zone widgets exist OR edit mode." In `bottom` mode the
 * nav moves to the bottom bar, so the rail must not render *for nav* — it renders
 * only when it still carries a rail-zone widget (e.g. the connection status) or
 * while editing. Pure so it can be unit-tested independently of the component.
 */
export function shouldRenderRail(input: {
  mode: NavigationMode;
  hasRailWidgets: boolean;
  editMode: boolean;
}): boolean {
  return input.mode === 'side' || input.hasRailWidgets || input.editMode;
}

/** The nav itself only lives in the rail in `side` mode (else it's in the bottom bar). */
export function shouldRenderRailNav(mode: NavigationMode): boolean {
  return mode === 'side';
}
