import type { FloatingRect, WidgetInstance } from './schema';

/**
 * Pure geometry + z-order logic for floating widgets (design 01-shell.md §4/§7:
 * the `float` zone — free-floating chips over the content area with per-widget
 * offsets, `z-index:50`). The generic layer holds no rendering concerns: these
 * helpers take plain numbers and return plain numbers so both the renderer and
 * the tests can drive them without a DOM.
 *
 * Interaction contract:
 * - **Reposition**: drag by the widget's grab surface; the new `{x,y}` is
 *   clamped so a grabbable strip always stays on screen (never lost offscreen).
 * - **Raise**: pointer-down on a floater bumps it above its siblings — a
 *   deterministic `order` bump (max sibling order + 1), so persisted z-order is
 *   stable across reloads.
 * - **Self-heal**: on mount / viewport resize the persisted position is
 *   re-clamped into view, so a floater saved offscreen (e.g. after the window
 *   shrank) reappears.
 */

/** Minimum grabbable portion of a floater that must always stay on screen. */
export const FLOATING_MIN_VISIBLE = 24;

export interface FloatingViewport {
  width: number;
  height: number;
}

export interface FloatingSize {
  width: number;
  height: number;
}

/**
 * Clamp a floating position so at least `minVisible` px of the widget stays
 * within the viewport on every edge — the top edge is additionally kept fully
 * on screen (`y >= 0`) because the drag/grab affordance lives at the top of the
 * chip. Degenerate viewports (0 or negative) pass the position through so a
 * pre-measurement render never snaps a widget to the origin.
 */
export function clampFloatingPosition(
  position: { x: number; y: number },
  size: FloatingSize,
  viewport: FloatingViewport,
  minVisible: number = FLOATING_MIN_VISIBLE
): { x: number; y: number } {
  if (viewport.width <= 0 || viewport.height <= 0) {
    return { x: Math.round(position.x), y: Math.round(position.y) };
  }
  const w = Math.max(0, size.width);
  const h = Math.max(0, size.height);
  const visX = Math.min(minVisible, w || minVisible);
  const visY = Math.min(minVisible, h || minVisible);

  const minX = visX - w;
  const maxX = viewport.width - visX;
  const minY = 0;
  const maxY = viewport.height - visY;

  return {
    x: Math.round(clamp(position.x, minX, Math.max(minX, maxX))),
    y: Math.round(clamp(position.y, minY, Math.max(minY, maxY)))
  };
}

/**
 * Re-clamp a persisted floating rect against the current viewport. Returns the
 * corrected rect, or `null` when the position is already fully in view (so the
 * caller can skip a no-op dispatch). Width/height fall back to `size` when the
 * rect omits them (positions are the persisted minimum; extents are measured).
 */
export function healFloatingRect(
  rect: FloatingRect,
  size: FloatingSize,
  viewport: FloatingViewport,
  minVisible: number = FLOATING_MIN_VISIBLE
): FloatingRect | null {
  const extent: FloatingSize = {
    width: rect.width ?? size.width,
    height: rect.height ?? size.height
  };
  const clamped = clampFloatingPosition({ x: rect.x, y: rect.y }, extent, viewport, minVisible);
  if (clamped.x === Math.round(rect.x) && clamped.y === Math.round(rect.y)) return null;
  return { ...rect, x: clamped.x, y: clamped.y };
}

/**
 * The z-order of floating widgets is their `order` field (higher = on top),
 * deterministic and persisted. This resolves the next order value that raises
 * `widgetId` above every floating sibling. Returns `null` when the widget is
 * already the topmost (no dispatch needed).
 */
export function raiseFloatingOrder(
  widgets: readonly WidgetInstance[],
  widgetId: string,
  zone: string = 'floating'
): number | null {
  const floaters = widgets.filter((w) => w.zone === zone);
  if (floaters.length <= 1) return null;
  const self = floaters.find((w) => w.id === widgetId);
  if (!self) return null;
  const maxOrder = floaters.reduce((max, w) => (w.order > max ? w.order : max), Number.NEGATIVE_INFINITY);
  if (self.order >= maxOrder) return null;
  return maxOrder + 1;
}

/**
 * Deterministic paint order for floating widgets: ascending `order`, ties broken
 * by id. The last entry paints on top. Used by the renderer so the DOM order
 * (and thus stacking) matches the persisted z-order without needing explicit
 * `z-index` per widget.
 */
export function orderedFloatingWidgets(
  widgets: readonly WidgetInstance[],
  zone: string = 'floating'
): WidgetInstance[] {
  return widgets
    .filter((w) => w.zone === zone)
    .slice()
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
