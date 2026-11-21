// Pure helpers for a one-row tab bar that collapses the tabs which don't fit into a "⋯" overflow menu
// (the Axis settings dialog). The component measures the DOM (ResizeObserver) and feeds plain numbers in;
// everything decided here is arithmetic, so it is unit-testable without a browser.

export interface TabOverflow {
  /** How many LEADING tabs stay in the bar; the rest go into the ⋯ menu, in their normal order. */
  visible: number;
  /** Whether the ⋯ button is needed (at least one tab is hidden). */
  hasMore: boolean;
}

const px = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

/**
 * Decide how many leading tabs fit on one row.
 *
 * @param widths     natural width of each tab, in order (px)
 * @param available  width the row can use (px)
 * @param moreWidth  width of the ⋯ button (px) — only reserved when something overflows
 * @param gap        flex gap between neighbouring items (px)
 *
 * - Everything fits (no ⋯ needed): `{ visible: n, hasMore: false }` — the ⋯ button is never shown "just in case".
 * - Otherwise the largest leading run that fits TOGETHER WITH the ⋯ button (and the gap in front of it) stays;
 *   `visible` can be 0 when not even one tab fits next to the button.
 * - No usable width (0, negative, NaN): nothing fits, so every tab is reachable through the ⋯ menu.
 */
export function computeTabOverflow(widths: readonly number[], available: number, moreWidth: number, gap = 0): TabOverflow {
  const n = widths.length;
  if (n === 0) return { visible: 0, hasMore: false };
  const g = px(gap);
  const room = Number.isFinite(available) ? available : 0;
  if (room <= 0) return { visible: 0, hasMore: true };

  let total = g * (n - 1);
  for (const w of widths) total += px(w);
  if (total <= room) return { visible: n, hasMore: false };

  // k tabs + the ⋯ button occupy: Σ widths[0..k) + k gaps (k-1 between tabs, 1 before ⋯) + ⋯ — for k = 0 just the button.
  const more = px(moreWidth);
  let visible = 0;
  let used = 0;
  for (let k = 1; k < n; k++) {
    used += px(widths[k - 1]);
    if (used + g * k + more > room) break;
    visible = k;
  }
  return { visible, hasMore: true };
}

export interface TabSplit<T> {
  shown: T[];
  hidden: T[];
  /** The active tab sits in the overflow — the ⋯ button must show the active state. */
  activeHidden: boolean;
}

/** Split `tabs` into the leading `visible` ones and the overflow, and say whether the active tab is in the overflow. */
export function splitTabs<T extends { id: string }>(tabs: readonly T[], visible: number, activeId: string): TabSplit<T> {
  const cut = Math.max(0, Math.min(tabs.length, Math.floor(Number.isFinite(visible) ? visible : tabs.length)));
  const shown = tabs.slice(0, cut);
  const hidden = tabs.slice(cut);
  return { shown, hidden, activeHidden: hidden.some((t) => t.id === activeId) };
}

/** Next focus index inside the menu for ArrowUp/ArrowDown (`delta` ±1), wrapping at both ends; -1 when empty. */
export function nextMenuIndex(current: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return delta === 1 ? 0 : count - 1;
  return (current + delta + count) % count;
}

/**
 * Convert a width read from `getBoundingClientRect()` into LAYOUT px.
 *
 * The UI-scale setting puts a CSS `zoom` on <html>. On Chromium 128+ `getBoundingClientRect()` then reports zoomed
 * (visual) px while `offsetWidth`, `clientWidth` and computed styles stay in layout px, so mixing them overestimates
 * the room by the zoom factor. `zoom` is the effective zoom (visual width / layout width of a reference element —
 * `effectiveZoom()` in workbench/svelte/contextMenu); 1 means "no zoom", and a nonsensical zoom (0, NaN, negative)
 * is treated as 1 instead of dividing by it.
 */
export function toLayoutPx(visual: number, zoom: number): number {
  return Number.isFinite(zoom) && zoom > 0 ? visual / zoom : visual;
}

export interface MenuAnchorPlacement {
  x: number;
  y: number;
  /** Which side of the anchor the menu opens on. */
  side: 'below' | 'above';
}

/**
 * Where a menu opens relative to its anchor button, in the SAME coordinate space as the anchor rect / viewport /
 * menu size (visual px): right edges aligned, `gap` between the anchor and the menu.
 *
 * - Below the anchor when the whole menu fits there (`margin` kept to the viewport edge).
 * - Otherwise ABOVE the anchor (menu bottom = anchor top - gap) when it fits there — e.g. the ⋯ of a bottom sheet,
 *   where the viewport bottom would otherwise clamp the menu on top of the tab bar and the button itself.
 * - Neither fits: below; the caller's viewport clamp (`resolveMenuPlacement`) then pins it on screen.
 *
 * Feed the result through `resolveMenuPlacement` to clamp it and convert it to the layout px a `position: fixed`
 * menu needs under the UI-scale zoom.
 */
export function menuAnchorPlacement(
  anchor: { top: number; right: number; bottom: number },
  menu: { width: number; height: number },
  viewport: { height: number },
  gap: number,
  margin = 8
): MenuAnchorPlacement {
  const x = anchor.right - menu.width;
  const below = anchor.bottom + gap;
  const fitsBelow = below + menu.height <= viewport.height - margin;
  const above = anchor.top - gap - menu.height;
  if (!fitsBelow && above >= margin) return { x, y: above, side: 'above' };
  return { x, y: below, side: 'below' };
}
