// Hold-to-drag pin of a Block Editor control: which workbench drop target sits under the pointer.
//
// A still ~380 ms hold on a control (mouse / pen) arms a pointer drag; the overlay that follows the
// pointer is inert, so `elementFromPoint` reaches the real drop zones underneath — a custom panel body,
// a panel-stack tab bar, or the empty edge of the dock workspace. A press on a tile's ⚡ starts the same
// drag after a few px of movement (no hold); a click on it pins to the default target. The decisions are
// pure (edge band, move tolerances, action arguments, tab index); `resolvePinTarget` / `editorTabTarget`
// only add the DOM lookups (pinDrag.test.ts covers the pure part).

import { isDockRegionId, type DockRegionId } from '../workbench/core/schema';
import { fullRegionHighlightRect, widgetDropIndex } from '../workbench/svelte/drag';

/** Hold time before a press becomes a pin drag. */
export const PIN_HOLD_MS = 380;
/** Movement (px, per axis) before the hold fires that cancels it (the press is a value adjust then). */
export const PIN_MOVE_CANCEL = 6;
/** Movement (px, per axis) that turns a press on a tile's ⚡ into a pin drag right away (no hold); less is
 *  a click (pin to the default target). */
export const PIN_PRESS_DRAG = 3;
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

/** Arguments of the workbench pin action (`axis.pinSelectedParameters`) for one control. Without a
 *  target — a click on ⚡ — this is the default the arrange ⌖ of the previous editor used: a NEW custom
 *  panel named after the control, docked on the right. A custom panel target appends the control there. */
export function pinActionArgs(c: { id: number; label: string }, target?: { panelId: string | null } | null): { paramId: number; title: string; panelId?: string } {
  return { paramId: c.id, title: c.label, ...(target?.panelId ? { panelId: target.panelId } : {}) };
}

/** A new "Controls" tab in a panel stack (`index` = position in its tabs). */
export interface PinTabTarget {
  tabStackId: string;
  region?: DockRegionId;
  index: number;
}

/** Arguments of the parameter-source drop action for a tab-bar or dock-edge target (a pin drag released
 *  there, or the control menu's "New tab"). */
export function edgeDropArgs(serializedSource: string, target: PinTabTarget | { region: DockRegionId }): Record<string, string | number> {
  if ('tabStackId' in target) {
    return { source: serializedSource, tabStackId: target.tabStackId, index: target.index, ...(target.region ? { region: target.region } : {}) };
  }
  return { source: serializedSource, region: target.region };
}

/** Index right after `panelId` in a stack's tabs (the end when it is not there). */
export function tabIndexAfter(panelIds: readonly string[], panelId: string | undefined): number {
  const i = panelId ? panelIds.indexOf(panelId) : -1;
  return i >= 0 ? i + 1 : panelIds.length;
}

/** "New tab" beside the editor: the panel stack an editor element sits in, with the new tab placed right
 *  after the editor's own tab. Null outside a workbench tab stack (monolith, phone sheet). */
export function editorTabTarget(el: Element | null): PinTabTarget | null {
  const stack = el?.closest<HTMLElement>('[data-tabstack]');
  const tabStackId = stack?.dataset.tabstack;
  if (!stack || !tabStackId) return null;
  const panelId = el?.closest<HTMLElement>('[data-panel]')?.dataset.panel;
  const tabs = Array.from(stack.querySelectorAll<HTMLElement>('[data-panel-tab]')).map((t) => t.dataset.panelTab ?? '');
  const region = stack.dataset.region;
  return { tabStackId, region: region && isDockRegionId(region) ? region : undefined, index: tabIndexAfter(tabs, panelId) };
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
