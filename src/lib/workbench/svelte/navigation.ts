import type { NavigationEntryState } from '../core';

export function canMoveNavigationEntry(entry: NavigationEntryState): boolean {
  return !entry.locked && (!entry.fixedSlot || entry.fixedSlot === 'none');
}

export function canHideNavigationEntry(entry: NavigationEntryState): boolean {
  return canMoveNavigationEntry(entry);
}

export function navigationEntryIndex(entries: NavigationEntryState[], entryId: string): number {
  return entries.findIndex((entry) => entry.id === entryId);
}
