import type { JsonObject, WorkbenchLayout } from '../core';

/**
 * Shell content-presentation mode (design 01-shell §3 / §11).
 *
 * - `'fixed'` (default): the multi-region dock — every occupied region
 *   (left/right/top/bottom/main) renders inline as its own resizable pane.
 * - `'pages'`: the main content shows the active section's panel **full-bleed**;
 *   the side/top/bottom dock regions are suppressed (their panels reached by nav
 *   / page switching). The top bar + nav + bottom widget bar stay. This is the
 *   production-model port of the design's `showStub`/`showGrid` split
 *   (`showStub = !presetPage && contentMode==="pages" && section!=="grid"`,
 *   `Axis Layout System.dc.html:1412`): one content area at a time, full width,
 *   switched by the nav, instead of the fixed multi-region dock.
 *
 * The design source of truth (`docs/workbench-dc-parity/01-shell.md` §11) states
 * pages mode makes "non-grid sections render as full-page stubs instead of docked
 * panels" — i.e. a single full-bleed content region rather than the docked
 * multi-region layout.
 */
export type WorkbenchContentMode = 'fixed' | 'pages';

/** The design default — an unknown/missing value resolves here (repair-safe). */
export const DEFAULT_CONTENT_MODE: WorkbenchContentMode = 'fixed';

/**
 * Resolve the content mode from a layout's `settings` bag. Repair-safe: any
 * missing bag, missing key, non-string, or unrecognised value resolves to the
 * design default (`'fixed'`) so a corrupt/legacy document can never land the
 * shell in an unknown presentation. Only the exact string `'pages'` selects
 * pages mode.
 */
export function resolveContentMode(settings: JsonObject | null | undefined): WorkbenchContentMode {
  const raw = settings?.contentMode;
  return raw === 'pages' ? 'pages' : DEFAULT_CONTENT_MODE;
}

/**
 * Resolve the content mode for a whole layout (or `undefined`, e.g. before the
 * active layout loads). Convenience wrapper around {@link resolveContentMode}.
 */
export function resolveLayoutContentMode(
  layout: WorkbenchLayout | null | undefined
): WorkbenchContentMode {
  return resolveContentMode(layout?.settings);
}

/**
 * Decide the shell's *effective* content mode for rendering, given the resolved
 * layout mode and whether the shell is in edit (Customize) mode.
 *
 * Edit mode always renders as `'fixed'`: pages mode collapses the shell to a
 * single full-bleed content region, which would make the docked panels
 * unreachable for rearranging. Temporarily behaving as fixed lets the user see
 * and drag every region while customising; leaving edit mode restores pages
 * presentation. (The stored `contentMode` is never mutated — this is purely a
 * render-time decision.)
 */
export function effectiveContentMode(
  mode: WorkbenchContentMode,
  editMode: boolean
): WorkbenchContentMode {
  return editMode ? DEFAULT_CONTENT_MODE : mode;
}

/**
 * Whether the shell should render as a single full-bleed page (`'pages'` and not
 * editing) rather than the fixed multi-region dock. When `true`:
 * - only the main region renders (full-bleed);
 * - side/top/bottom dock regions hide, and so do their mobile openers/indicators
 *   (there is nothing behind them to reach inline);
 * - the top bar, nav (side rail or bottom bar) and bottom widget bar stay.
 */
export function isPagesLayout(mode: WorkbenchContentMode, editMode: boolean): boolean {
  return effectiveContentMode(mode, editMode) === 'pages';
}
