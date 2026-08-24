import { AXIS_PAGE_GRID, AXIS_PAGE_PRESET_BROWSER } from '../axisWorkbenchPages';

// This decision lives in its own module rather than inline in AxisWorkbenchWidget.svelte because
// Vitest runs in the node environment with no DOM, and .svelte components are never unit-mounted
// here (axis-workbench/CLAUDE.md) — so anything worth covering with a test gets pulled out into a
// plain function. Same shape as presetBrowser/presetBrowserWorkbenchRowGesture.ts.
export interface AxisPresetWidgetTarget {
  pageId: string;
  title: string;
}

/**
 * One function returns both the destination page id and the tooltip naming it, rather than two
 * separate lookups, so the click target and the text describing it can never drift apart.
 *
 * Grid is the only page where the widget still means "find me a preset" (→ Preset Browser); every
 * other page — including an unknown or missing page id — falls back to Grid, matching the seed
 * `activePageId` (buildAxisSeedPages) so an unset/unrecognized page is a safe default, not a dead end.
 */
export function resolvePresetWidgetTarget(activePageId: string | null | undefined): AxisPresetWidgetTarget {
  return activePageId === AXIS_PAGE_GRID
    ? { pageId: AXIS_PAGE_PRESET_BROWSER, title: 'Find a preset' }
    : { pageId: AXIS_PAGE_GRID, title: 'Go to Grid' };
}
