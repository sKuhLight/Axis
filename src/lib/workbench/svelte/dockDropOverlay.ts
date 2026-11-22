/**
 * Pure model of the panel-drag overlay (DockDropOverlay.svelte renders it).
 *
 * Design rules (ported from the layout-editor prototype):
 *   - ONE highlighted shape: the landing rect (where the panel will be), with
 *     its label + the panel name centred inside.
 *   - On the hovered stack, the four other zones stay as faint dashed boxes,
 *     CLIPPED to the area the landing shape leaves free ({@link rectMinus}); a
 *     zone the landing shape fully covers keeps only its label (on its own chip)
 *     when that fits inside the shape, clear of the active label.
 *   - Four thin edge bars along the workspace; the active edge is replaced by
 *     its landing shape.
 *   - A pointer card (panel name + what the drop does) trails the pointer and
 *     never covers the active label or a zone label ({@link ghostPosition}).
 *
 * All rects are client (visual) px; CSS-px sizes are scaled by the geometry's
 * zoom so the renderer only has to divide by it.
 */
import type { DockRegionId } from '../core';
import type { WorkbenchPointer, WorkbenchRect } from './drag';
import {
  zoneRects,
  landingRect,
  type DockDropGeometry,
  type DockDropTarget,
  type DockZone
} from './dockDropTarget';

/** Pointer card size (CSS px). */
export const DOCK_CARD_WIDTH = 248;
export const DOCK_CARD_HEIGHT = 52;
/** Edge bars: thickness, inset from the workspace edge, gap from the corners (CSS px). */
export const EDGE_BAR_THICKNESS = 8;
export const EDGE_BAR_INSET = 4;
export const EDGE_BAR_END = 22;
/** Smallest clipped zone remnant still drawn (px). */
const MIN_REMNANT_WIDTH = 24;
const MIN_REMNANT_HEIGHT = 20;
const VIEWPORT_MARGIN = 8;

export const DOCK_ZONE_LABELS: Record<DockZone, { long: string; short: string }> = {
  top: { long: 'Split top', short: 'Top' },
  left: { long: 'Split left', short: 'Left' },
  center: { long: 'Add as tab', short: 'Tab' },
  right: { long: 'Split right', short: 'Right' },
  bottom: { long: 'Split bottom', short: 'Bottom' }
};

export interface DockOverlayLanding {
  rect: WorkbenchRect;
  /** Stable key of the active target (`left` … `center`, `tab`, `edge-left` …). */
  key: string;
  label: string;
  /** The panel name under the label ('' when it does not fit). */
  sub: string;
  /** The label chip box (centred in `rect`). */
  labelRect: WorkbenchRect;
}

export interface DockOverlayZoneLabel {
  id: DockZone;
  text: string;
  rect: WorkbenchRect;
  /** Fully covered zone: the label sits on its own chip above the landing fill. */
  over: boolean;
}

export interface DockDropOverlayModel {
  target: DockDropTarget | null;
  landing: DockOverlayLanding | null;
  zones: { id: DockZone; rect: WorkbenchRect }[];
  zoneLabels: DockOverlayZoneLabel[];
  edgeBars: { id: DockRegionId; rect: WorkbenchRect }[];
  page: { pageId: string; rect: WorkbenchRect; accepts: boolean } | null;
  /** Tab-bar insert: a thin caret at the insertion index. */
  caret: WorkbenchRect | null;
  card: { rect: WorkbenchRect; title: string; hint: string };
  /** Nothing accepts a drop here (release cancels). */
  invalid: boolean;
}

export function rectsOverlap(a: WorkbenchRect | null | undefined, b: WorkbenchRect | null | undefined): boolean {
  return !!(a && b && a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top);
}

export function inflateRect(rect: WorkbenchRect, by: number): WorkbenchRect {
  return { left: rect.left - by, top: rect.top - by, width: rect.width + 2 * by, height: rect.height + 2 * by };
}

function rectInside(inner: WorkbenchRect, outer: WorkbenchRect, margin = 0): boolean {
  return (
    inner.left >= outer.left + margin &&
    inner.top >= outer.top + margin &&
    inner.left + inner.width <= outer.left + outer.width - margin &&
    inner.top + inner.height <= outer.top + outer.height - margin
  );
}

function centeredBox(rect: WorkbenchRect, width: number, height: number): WorkbenchRect {
  return { left: rect.left + rect.width / 2 - width / 2, top: rect.top + rect.height / 2 - height / 2, width, height };
}

/**
 * `zone` minus `cover` (prototype `_minus`): the zone itself when they are
 * disjoint, else the largest free strip left beside the cover, or `null` when
 * no strip of at least 24×20 px remains.
 */
export function rectMinus(zone: WorkbenchRect, cover: WorkbenchRect): WorkbenchRect | null {
  if (!rectsOverlap(zone, cover)) return zone;
  const zr = zone.left + zone.width;
  const zb = zone.top + zone.height;
  const cr = cover.left + cover.width;
  const cb = cover.top + cover.height;
  const candidates: WorkbenchRect[] = [];
  if (cover.left > zone.left) candidates.push({ left: zone.left, top: zone.top, width: cover.left - zone.left, height: zone.height });
  if (cr < zr) candidates.push({ left: cr, top: zone.top, width: zr - cr, height: zone.height });
  if (cover.top > zone.top) candidates.push({ left: zone.left, top: zone.top, width: zone.width, height: cover.top - zone.top });
  if (cb < zb) candidates.push({ left: zone.left, top: cb, width: zone.width, height: zb - cb });
  let best: WorkbenchRect | null = null;
  for (const candidate of candidates) {
    if (candidate.width < MIN_REMNANT_WIDTH || candidate.height < MIN_REMNANT_HEIGHT) continue;
    if (!best || candidate.width * candidate.height > best.width * best.height) best = candidate;
  }
  return best;
}

/**
 * Where the pointer card goes (prototype `_ghostPos`): below-right of the
 * pointer first, then the other three corners, then spots beside the active
 * label. A spot must fit the viewport (8px margin), keep the pointer itself
 * uncovered, and avoid every rect in `avoid`; a second pass only avoids
 * `active`. Falls back to below-right, clamped into the viewport.
 */
export function ghostPosition(
  pointer: WorkbenchPointer,
  size: { width: number; height: number },
  avoid: WorkbenchRect[],
  active: WorkbenchRect | null,
  viewport: { width: number; height: number }
): { left: number; top: number } {
  const { width: gw, height: gh } = size;
  const { x: px, y: py } = pointer;
  const candidates: [number, number][] = [
    [px + 18, py + 22],
    [px + 18, py - 22 - gh],
    [px - 18 - gw, py + 22],
    [px - 18 - gw, py - 22 - gh]
  ];
  if (active) {
    candidates.push(
      [px + 18, active.top + active.height + 6],
      [px + 18, active.top - gh - 6],
      [active.left + active.width + 6, py + 22],
      [active.left - gw - 6, py + 22]
    );
  }
  const fits = (x: number, y: number) =>
    x >= VIEWPORT_MARGIN && y >= VIEWPORT_MARGIN && x + gw <= viewport.width - VIEWPORT_MARGIN && y + gh <= viewport.height - VIEWPORT_MARGIN;
  const clearOfPointer = (x: number, y: number) => !(px >= x - 6 && px <= x + gw + 6 && py >= y - 6 && py <= y + gh + 6);
  const hitsAny = (x: number, y: number, list: WorkbenchRect[]) => list.some((rect) => rectsOverlap({ left: x, top: y, width: gw, height: gh }, rect));
  for (const list of [avoid, active ? [active] : []]) {
    for (const [x, y] of candidates) {
      if (fits(x, y) && clearOfPointer(x, y) && !hitsAny(x, y, list)) return { left: x, top: y };
    }
  }
  return {
    left: Math.max(VIEWPORT_MARGIN, Math.min(px + 18, viewport.width - gw - VIEWPORT_MARGIN)),
    top: Math.max(VIEWPORT_MARGIN, Math.min(py + 22, viewport.height - gh - VIEWPORT_MARGIN))
  };
}

/** Estimated chip widths (CSS px) for the active label (13px mono) and the panel name (11px UI). */
export function landingLabelWidth(text: string): number {
  return text.length * 7.9 + 26;
}
export function landingSubWidth(text: string): number {
  return text.length * 6.4 + 26;
}
/** Zone label chip width (12px mono). */
export function zoneLabelWidth(text: string): number {
  return landingLabelWidth(text) - 4;
}
const ZONE_LABEL_HEIGHT = 24;

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Long + short landing label for a target. */
export function landingLabelFor(target: DockDropTarget): { long: string; short: string; key: string } {
  switch (target.kind) {
    case 'zone':
      return { ...DOCK_ZONE_LABELS[target.zone], key: target.zone };
    case 'tab':
      return { ...DOCK_ZONE_LABELS.center, key: 'tab' };
    case 'edge':
      return target.region === 'main'
        ? { long: 'Place here', short: 'Place', key: 'edge-main' }
        : { long: `Dock ${target.region}`, short: capitalize(target.region), key: `edge-${target.region}` };
    case 'page':
      return { long: 'Move to page', short: 'Page', key: `page-${target.pageId}` };
  }
}

/** What a drop on `target` does, for the pointer card. */
export function describeDockDropTarget(target: DockDropTarget | null, geometry: Pick<DockDropGeometry, 'stacks' | 'pages'>): string {
  if (!target) return 'Release here to cancel · layout stays as it was';
  if (target.kind === 'page') {
    if (!target.accepts) return 'Already on this page';
    const label = geometry.pages.find((page) => page.pageId === target.pageId)?.label ?? target.pageId;
    return `Move to page ${label}`;
  }
  if (target.kind === 'edge') {
    if (target.region === 'main') return 'Place in the main region';
    return `Dock ${target.region} · ${target.empty ? 'new region' : 'outer edge'}`;
  }
  const title = geometry.stacks.find((slot) => slot.stackId === target.stackId)?.title ?? 'panel';
  if (target.kind === 'tab' || target.zone === 'center') return `Add as tab to ${title}`;
  return `Split ${target.zone} of ${title}`;
}

export interface DockDropOverlayInput {
  pointer: WorkbenchPointer;
  geometry: DockDropGeometry;
  target: DockDropTarget | null;
  panelLabel: string;
  viewport: { width: number; height: number };
}

/** Build the whole overlay for one pointer position. */
export function buildDockDropOverlay(input: DockDropOverlayInput): DockDropOverlayModel {
  const { pointer, geometry, target, panelLabel, viewport } = input;
  const zoom = geometry.zoom && geometry.zoom > 0 ? geometry.zoom : 1;
  const ws = geometry.workspace;
  const avoid: WorkbenchRect[] = [];
  let active: WorkbenchRect | null = null;

  // Edge bars (the active edge is replaced by its landing shape).
  const t = EDGE_BAR_THICKNESS * zoom;
  const inset = EDGE_BAR_INSET * zoom;
  const end = EDGE_BAR_END * zoom;
  const activeEdge = target?.kind === 'edge' ? target.region : null;
  // Over a nav page the dock edges are irrelevant (and the expanded rail would
  // sit under the left bar): no bars then.
  const allBars: { id: DockRegionId; rect: WorkbenchRect }[] = [
    { id: 'left', rect: { left: ws.left + inset, top: ws.top + end, width: t, height: Math.max(0, ws.height - 2 * end) } },
    { id: 'right', rect: { left: ws.left + ws.width - inset - t, top: ws.top + end, width: t, height: Math.max(0, ws.height - 2 * end) } },
    { id: 'top', rect: { left: ws.left + end, top: ws.top + inset, width: Math.max(0, ws.width - 2 * end), height: t } },
    { id: 'bottom', rect: { left: ws.left + end, top: ws.top + ws.height - inset - t, width: Math.max(0, ws.width - 2 * end), height: t } }
  ];
  const edgeBars = target?.kind === 'page' ? [] : allBars.filter((bar) => bar.id !== activeEdge);

  // Landing shape + its label.
  let landing: DockOverlayLanding | null = null;
  const land = landingRect(target, geometry);
  if (target && land) {
    const names = landingLabelFor(target);
    let label = names.long;
    let sub = panelLabel;
    let w = Math.max(landingLabelWidth(label), landingSubWidth(sub)) * zoom;
    let h = 46 * zoom;
    if (w > land.width - 16 * zoom || h > land.height - 12 * zoom) {
      sub = '';
      h = 28 * zoom;
      w = landingLabelWidth(label) * zoom;
    }
    if (w > land.width - 16 * zoom) {
      label = names.short;
      w = landingLabelWidth(label) * zoom;
    }
    const labelRect = centeredBox(land, w, h);
    landing = { rect: land, key: names.key, label, sub, labelRect };
    active = labelRect;
    avoid.push(labelRect);
  }

  // Five zones on the hovered stack: inactive ones clipped around the landing shape.
  const zones: { id: DockZone; rect: WorkbenchRect }[] = [];
  const zoneLabels: DockOverlayZoneLabel[] = [];
  if (target?.kind === 'zone' && !target.small && landing) {
    const slot = geometry.stacks.find((candidate) => candidate.stackId === target.stackId);
    if (slot) {
      const rects = zoneRects(slot.rect);
      const cover = inflateRect(landing.rect, 6 * zoom);
      const labelH = ZONE_LABEL_HEIGHT * zoom;
      const fits = (box: WorkbenchRect, text: string) => zoneLabelWidth(text) * zoom <= box.width - 8 * zoom && labelH <= box.height - 4 * zoom;
      for (const id of ['top', 'left', 'center', 'right', 'bottom'] as DockZone[]) {
        if (id === target.zone) continue;
        const names = DOCK_ZONE_LABELS[id];
        const remnant = rectMinus(rects[id], cover);
        if (remnant) {
          zones.push({ id, rect: remnant });
          const text = fits(remnant, names.long) ? names.long : fits(remnant, names.short) ? names.short : '';
          if (text) {
            const rect = centeredBox(remnant, zoneLabelWidth(text) * zoom, labelH);
            zoneLabels.push({ id, text, rect, over: false });
            avoid.push(rect);
          }
        } else {
          // Fully covered: label only, on its own chip above the fill, when it
          // stays inside the shape and clear of the active label.
          const rect = centeredBox(rects[id], zoneLabelWidth(names.long) * zoom, labelH);
          if (rectInside(rect, landing.rect, 6 * zoom) && !rectsOverlap(inflateRect(rect, 8 * zoom), landing.labelRect)) {
            zoneLabels.push({ id, text: names.long, rect, over: true });
            avoid.push(rect);
          }
        }
      }
    }
  }

  // Tab-bar insert caret.
  let caret: WorkbenchRect | null = null;
  if (target?.kind === 'tab') {
    const slot = geometry.stacks.find((candidate) => candidate.stackId === target.stackId);
    const tabs = slot?.tabRects ?? [];
    const head = slot?.headerRect;
    if (slot && head) {
      const last = tabs[tabs.length - 1];
      const x = tabs.length === 0 ? head.left + 12 * zoom : target.index < tabs.length ? tabs[target.index].left - 3 * zoom : last.left + last.width + 1 * zoom;
      caret = { left: x, top: head.top + 6 * zoom, width: 2 * zoom, height: Math.max(0, head.height - 12 * zoom) };
    }
  }

  // Nav page highlight.
  let page: DockDropOverlayModel['page'] = null;
  if (target?.kind === 'page') {
    const found = geometry.pages.find((candidate) => candidate.pageId === target.pageId);
    if (found) page = { pageId: found.pageId, rect: found.rect, accepts: target.accepts };
  }

  const hint = describeDockDropTarget(target, geometry);
  const cardSize = { width: DOCK_CARD_WIDTH * zoom, height: DOCK_CARD_HEIGHT * zoom };
  const pad = 8 * zoom;
  const position = ghostPosition(
    pointer,
    cardSize,
    avoid.map((rect) => inflateRect(rect, pad)),
    active ? inflateRect(active, pad) : null,
    viewport
  );

  return {
    target,
    landing,
    zones,
    zoneLabels,
    edgeBars,
    page,
    caret,
    card: { rect: { ...position, ...cardSize }, title: panelLabel, hint },
    invalid: !target || (target.kind === 'page' && !target.accepts)
  };
}
