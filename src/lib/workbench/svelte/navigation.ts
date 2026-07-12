import type { NavigationEntryState, NavigationMode, WorkbenchCommand, WorkbenchLayout } from '../core';

export function canMoveNavigationEntry(entry: NavigationEntryState): boolean {
  return !entry.locked && (!entry.fixedSlot || entry.fixedSlot === 'none');
}

/** True when the entry is bound to a page (triggering it activates that page). */
export function isPageNavigationEntry(entry: NavigationEntryState): boolean {
  return typeof entry.pageId === 'string' && entry.pageId.length > 0;
}

/**
 * The command a navigation entry dispatches when triggered, or `null` when the
 * entry is action-backed (the app's registered nav action runs instead). Page
 * entries always resolve to `page.activate` — the binding wins over any target.
 */
export function navigationEntryCommand(entry: NavigationEntryState): WorkbenchCommand | null {
  if (isPageNavigationEntry(entry)) return { type: 'page.activate', pageId: entry.pageId! };
  return null;
}

/**
 * Active-state for a page-bound entry: its page is the layout's active page.
 * Non-page entries return `null` (defer to the app's navigation-state provider).
 */
export function pageNavigationEntryActive(entry: NavigationEntryState, layout: WorkbenchLayout | undefined): boolean | null {
  if (!isPageNavigationEntry(entry)) return null;
  return !!layout && layout.activePageId === entry.pageId;
}

/** Page entries can be deleted unless theirs is the last page of the layout. */
export function canDeleteNavigationPage(layout: WorkbenchLayout | undefined): boolean {
  return !!layout && Object.keys(layout.pages ?? {}).length > 1;
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
