import { AXIS_PAGE_GRID } from '../axisWorkbenchPages';

// This decision lives in its own module rather than inline in AxisWorkbenchWidget.svelte because
// Vitest runs in the node environment with no DOM, and .svelte components are never unit-mounted
// here (axis-workbench/CLAUDE.md) — so anything worth covering with a test gets pulled out into a
// plain function. Same shape as presetBrowser/presetBrowserWorkbenchRowGesture.ts.
export type AxisPresetWidgetAction =
  | { type: 'openPresetSearch'; title: string }
  | { type: 'navigate'; pageId: string; title: string };

/**
 * One function returns both the click behavior and the tooltip naming it, rather than two
 * separate lookups, so the click target and the text describing it can never drift apart.
 *
 * Grid is the only page where the widget still means "find me a preset" — it opens the slim,
 * non-destructive preset search overlay (AxisPresetBrowserSearchOverlay.svelte) in place, rather
 * than navigating to the full Preset Browser page and tearing down the Grid panel. Every other
 * page — including an unknown or missing page id — falls back to navigating to Grid, matching the
 * seed `activePageId` (buildAxisSeedPages) so an unset/unrecognized page is a safe default, not a
 * dead end.
 */
export function resolvePresetWidgetTarget(activePageId: string | null | undefined): AxisPresetWidgetAction {
  return activePageId === AXIS_PAGE_GRID
    ? { type: 'openPresetSearch', title: 'Find a preset' }
    : { type: 'navigate', pageId: AXIS_PAGE_GRID, title: 'Go to Grid' };
}
