// Hold-to-drag pin of a Block Editor control: which workbench drop target sits under the pointer.
//
// A still ~380 ms hold on a control (mouse / pen) arms a pointer drag; the overlay that follows the
// pointer is inert, so `elementFromPoint` reaches the real drop zones underneath — a custom panel body,
// a panel-stack tab bar, or the empty edge of the dock workspace. The decisions are pure (edge band,
// move tolerance); `resolvePinTarget` only adds the DOM lookups (pinDrag.test.ts covers the pure part).

import { isDockRegionId, type DockRegionId } from '../workbench/core/schema';
import { fullRegionHighlightRect, widgetDropIndex } from '../workbench/svelte/drag';

/** Hold time before a press becomes a pin drag. */
export const PIN_HOLD_MS = 380;
/** Movement (px, per axis) before the hold fires that cancels it (the press is a value adjust then). */
export const PIN_MOVE_CANCEL = 6;
/** Fraction of the workspace near each edge that counts as "dock at this edge". */
export const PIN_EDGE_BAND = 0.18;

export type PinRect = { left: number; top: number; width: number; height: number };
export type PinTarget =
  | { kind: 'panel'; panelId: string; rect: PinRect; label: string }
  | { kind: 'edge'; region: DockRegionId; rect: PinRect; label: string }
  | { kind: 'tab'; tabStackId: string; region?: DockRegionId; index: number; rect: PinRect; label: string };

/** True once the pointer left the hold tolerance on either axis. */
export function exceedsPinHold(x0: number, y0: number, x: number, y: number, tol: number = PIN_MOVE_CANCEL): boolean {
  return Math.abs(x - x0) > tol || Math.abs(y - y0) > tol;
}

/** Dock edge for a point inside the workspace rectangle, or null in the middle. Left/right win over
 *  top/bottom in the corners (same order as before). */
export function edgeRegionAt(x: number, y: number, rect: PinRect, band: number = PIN_EDGE_BAND): DockRegionId | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const nx = (x - rect.left) / rect.width;
  const ny = (y - rect.top) / rect.height;
  if (nx < band) return 'left';
  if (nx > 1 - band) return 'right';
  if (ny < band) return 'top';
  if (ny > 1 - band) return 'bottom';
  return null;
}

const rectOf = (el: Element): PinRect => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** The drop target under (x,y): 1. a custom panel body (collect into that panel), 2. a panel-stack tab
 *  bar (new "Controls" tab at that spot), 3. an empty dock edge (new panel in that region). */
export function resolvePinTarget(x: number, y: number): PinTarget | null {
  if (typeof document === 'undefined') return null;
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!el) return null;
  const panelBody = el.closest<HTMLElement>('.custom-panel');
  if (panelBody) {
    const panelId = panelBody.closest<HTMLElement>('[data-panel]')?.dataset.panel;
    if (panelId) return { kind: 'panel', panelId, rect: rectOf(panelBody), label: 'Add to panel' };
  }
  const head = el.closest<HTMLElement>('.aw-pane-head');
  if (head) {
    const stack = head.closest<HTMLElement>('[data-tabstack]');
    const tabStackId = stack?.dataset.tabstack;
    if (tabStackId) {
      const region = stack?.dataset.region;
      const tabs = Array.from(head.querySelectorAll<HTMLElement>('.aw-pane-tab')).map((t) => t.getBoundingClientRect());
      return {
        kind: 'tab',
        tabStackId,
        region: region && isDockRegionId(region) ? region : undefined,
        index: widgetDropIndex({ x, y: 0 }, tabs, 'horizontal'),
        rect: rectOf(head),
        label: 'New tab'
      };
    }
  }
  const ws = el.closest<HTMLElement>('.aw-workspace');
  if (ws) {
    const r = rectOf(ws);
    const region = edgeRegionAt(x, y, r);
    if (region) return { kind: 'edge', region, rect: fullRegionHighlightRect(region) ?? r, label: `New panel · ${region}` };
  }
  return null;
}
