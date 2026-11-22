/**
 * Pure drop-target logic for panel drags (tab drags and library drag-outs).
 *
 * The DOM glue (`panelDrag.ts`) measures the LIFTED dock — the dragged panel is
 * already out of the rendered layout — into a {@link DockDropGeometry}; this
 * module then decides, from rects alone:
 *
 *   - what the pointer is over ({@link dockDropTargetAt}),
 *   - the command a drop there dispatches ({@link dockDropCommand}),
 *   - the exact rect the panel will occupy afterwards ({@link landingRect}),
 *     derived from the same reducer semantics, so the highlighted shape IS the
 *     result.
 *
 * All rects are client (visual) px. Constants that describe rendered CSS sizes
 * (region defaults, borders, the split handle) are CSS px and are scaled by
 * `geometry.zoom` (visual / layout) before they meet a measured rect.
 */
import type { DockAxis, DockLayout, DockRegionId, DockTarget, WorkbenchCommand } from '../core';
import { rectContainsPointer, widgetDropIndex, type WorkbenchPointer, type WorkbenchRect } from './drag';
import {
  COLLAPSED_STRIP_PX,
  DEFAULT_BAND_REGION_PX,
  DEFAULT_SIDE_REGION_PX,
  REGION_BORDER_PX,
  SPLIT_HANDLE_PX,
  collapsedNodeExtent,
  isDockNodeCollapsed,
  layoutDockTree,
  stackCollapsedIn
} from './dockLayout';

/** Width (px) of the strip just inside each workspace edge that docks to that edge. */
export const EDGE_STRIP = 24;
/** Inset (px) of the five drop zones inside a stack; the rim counts as the nearest band. */
export const ZONE_INSET = 8;
/** Gap (px) between the zone bands. */
export const ZONE_GAP = 6;
/** Share of the inner stack height/width taken by the top/bottom and left/right bands. */
export const ZONE_BAND = 0.25;
/** A stack narrower than this (px) only offers "Add as tab". */
export const SMALL_STACK_WIDTH = 200;
/** A stack shorter than this (px) only offers "Add as tab". */
export const SMALL_STACK_HEIGHT = 150;
// Region sizes / borders live with the layout mirror (dockLayout.ts); re-exported here.
export { DEFAULT_BAND_REGION_PX, DEFAULT_SIDE_REGION_PX, REGION_BORDER_PX } from './dockLayout';

export type DockZone = 'top' | 'left' | 'center' | 'right' | 'bottom';
export const DOCK_ZONES: readonly DockZone[] = ['top', 'left', 'center', 'right', 'bottom'];

/** One rendered tab stack, measured. */
export interface DockStackSlot {
  stackId: string;
  activePanelId: string;
  rect: WorkbenchRect;
  region: DockRegionId;
  /** The active panel is collapsed: the stack renders as a strip. */
  collapsed: boolean;
  /** The tab bar (header). A pointer over it inserts a tab at a precise index. */
  headerRect?: WorkbenchRect | null;
  /** The rendered tab pills, in order (tab-index insert). */
  tabRects?: WorkbenchRect[];
  /** Title of the active panel (target descriptions). */
  title?: string;
  /** Collapsed stacks: the rect the stack takes once a drop expands it. */
  expandedRect?: WorkbenchRect;
  /**
   * Stacking layer: where stacks overlap (a mobile dock drawer over the inline
   * dock), the highest layer under the pointer wins. 0 when omitted.
   */
  layer?: number;
}

export interface DockEmptyRegion {
  region: DockRegionId;
  rect: WorkbenchRect;
}

export interface DockNavPageTarget {
  pageId: string;
  rect: WorkbenchRect;
  isCurrent: boolean;
  label?: string;
}

export interface DockDropGeometry {
  workspace: WorkbenchRect;
  stacks: DockStackSlot[];
  emptyRegions: DockEmptyRegion[];
  /**
   * Strips of OCCUPIED regions the user collapsed (`region.collapse`): an edge
   * target for that region (the drop expands it).
   */
  collapsedRegions?: DockEmptyRegion[];
  pages: DockNavPageTarget[];
  /** Regions that hold panels in the (lifted) model — an edge drop there splits at the outer side. */
  occupiedRegions?: DockRegionId[];
  /** Outer rects of the rendered regions (left/right bound the top/bottom bands). */
  regionRects?: Partial<Record<DockRegionId, WorkbenchRect>>;
  /** Content rects (inside the border) of occupied regions — what a region split halves. */
  regionContentRects?: Partial<Record<DockRegionId, WorkbenchRect>>;
  /**
   * Occupied regions whose whole tree is collapsed (strips only), with the
   * strips' extent along the region axis (visual px). An edge drop there gives
   * the new stack everything but that extent (+ handle) of the region's content.
   */
  regionCollapsedExtents?: Partial<Record<DockRegionId, number>>;
  /** Stored region sizes (CSS px), when set. */
  regionSizes?: Partial<Record<DockRegionId, number | undefined>>;
  /** Effective CSS zoom (visual / layout px); 1 when unzoomed. */
  zoom?: number;
}

export type DockDropTarget =
  | { kind: 'zone'; stackId: string; targetPanelId: string; region: DockRegionId; zone: DockZone; small: boolean }
  | { kind: 'tab'; stackId: string; targetPanelId: string; region: DockRegionId; index: number }
  | { kind: 'edge'; region: DockRegionId; empty: boolean }
  | { kind: 'page'; pageId: string; accepts: boolean };

export interface DockDropTargetOptions {
  /** Nav page targets are considered (tab drags; library drag-outs skip them). */
  pages?: boolean;
}

/** The five zone rects of a stack (prototype `_zoneRects`): 8px inset, 25% bands, 6px gaps. */
export function zoneRects(rect: WorkbenchRect): Record<DockZone, WorkbenchRect> {
  const ix = rect.left + ZONE_INSET;
  const iy = rect.top + ZONE_INSET;
  const iw = Math.max(0, rect.width - 2 * ZONE_INSET);
  const ih = Math.max(0, rect.height - 2 * ZONE_INSET);
  const bw = iw * ZONE_BAND;
  const bh = ih * ZONE_BAND;
  const midY = iy + bh + ZONE_GAP;
  const midH = Math.max(0, ih - 2 * bh - 2 * ZONE_GAP);
  return {
    top: { left: ix, top: iy, width: iw, height: bh },
    bottom: { left: ix, top: iy + ih - bh, width: iw, height: bh },
    left: { left: ix, top: midY, width: bw, height: midH },
    right: { left: ix + iw - bw, top: midY, width: bw, height: midH },
    center: { left: ix + bw + ZONE_GAP, top: midY, width: Math.max(0, iw - 2 * bw - 2 * ZONE_GAP), height: midH }
  };
}

/**
 * The zone under a pointer that is inside `rect`. Same geometry as the drawn
 * zones; the inset rim counts as the nearest band, the gaps as the centre.
 */
export function zoneAt(rect: WorkbenchRect, pointer: WorkbenchPointer): DockZone {
  const z = zoneRects(rect);
  if (pointer.y < z.top.top + z.top.height) return 'top';
  if (pointer.y >= z.bottom.top) return 'bottom';
  if (pointer.x < z.center.left) return 'left';
  if (pointer.x > z.center.left + z.center.width) return 'right';
  return 'center';
}

/** True when a stack only offers "Add as tab" (collapsed strip, or too small for five zones). */
export function isSmallStack(slot: Pick<DockStackSlot, 'rect' | 'collapsed'>): boolean {
  return slot.collapsed || slot.rect.width < SMALL_STACK_WIDTH || slot.rect.height < SMALL_STACK_HEIGHT;
}

function regionIsEmpty(geometry: DockDropGeometry, region: DockRegionId): boolean {
  if (geometry.occupiedRegions) return !geometry.occupiedRegions.includes(region);
  return !geometry.stacks.some((slot) => slot.region === region);
}

/**
 * The stack under `pointer` that is on top: the highest `layer` wins (a dock
 * drawer's stack over the inline stack behind it), ties go to the first in
 * order. A stack still showing the dragged panel is skipped.
 */
export function topmostStackAt(stacks: DockStackSlot[], pointer: WorkbenchPointer, draggedPanelId?: string): DockStackSlot | undefined {
  let best: DockStackSlot | undefined;
  for (const slot of stacks) {
    if (draggedPanelId && slot.activePanelId === draggedPanelId) continue;
    if (!rectContainsPointer(slot.rect, pointer)) continue;
    if (!best || (slot.layer ?? 0) > (best.layer ?? 0)) best = slot;
  }
  return best;
}

/**
 * Resolve the drop target under `pointer`. Priority: nav pages (when enabled),
 * the topmost stack's tab bar (tab at index — stacks along a workspace edge
 * have their header inside the edge strip, and a precise tab insert beats
 * docking), the 24px edge strips (left, right, top, bottom), the topmost stack
 * (collapsed/small → "Add as tab"; else the five zones), empty region strips,
 * user-collapsed region strips.
 */
export function dockDropTargetAt(
  pointer: WorkbenchPointer,
  geometry: DockDropGeometry,
  draggedPanelId: string,
  options: DockDropTargetOptions = {}
): DockDropTarget | null {
  if (options.pages !== false) {
    for (const page of geometry.pages) {
      if (rectContainsPointer(page.rect, pointer)) return { kind: 'page', pageId: page.pageId, accepts: !page.isCurrent };
    }
  }

  const ws = geometry.workspace;
  if (!rectContainsPointer(ws, pointer)) return null;
  const lx = pointer.x - ws.left;
  const ly = pointer.y - ws.top;
  const edge = (region: DockRegionId): DockDropTarget => ({ kind: 'edge', region, empty: regionIsEmpty(geometry, region) });
  const slot = topmostStackAt(geometry.stacks, pointer, draggedPanelId);
  const base = slot ? { stackId: slot.stackId, targetPanelId: slot.activePanelId, region: slot.region } : null;
  if (slot && base && !slot.collapsed && slot.headerRect && rectContainsPointer(slot.headerRect, pointer)) {
    return { kind: 'tab', ...base, index: widgetDropIndex(pointer, slot.tabRects ?? [], 'horizontal') };
  }

  if (lx < EDGE_STRIP) return edge('left');
  if (lx > ws.width - EDGE_STRIP) return edge('right');
  if (ly < EDGE_STRIP) return edge('top');
  if (ly > ws.height - EDGE_STRIP) return edge('bottom');

  if (slot && base) {
    if (isSmallStack(slot)) return { kind: 'zone', ...base, zone: 'center', small: true };
    return { kind: 'zone', ...base, zone: zoneAt(slot.rect, pointer), small: false };
  }

  for (const empty of geometry.emptyRegions) {
    if (rectContainsPointer(empty.rect, pointer)) return edge(empty.region);
  }
  for (const collapsed of geometry.collapsedRegions ?? []) {
    if (rectContainsPointer(collapsed.rect, pointer)) return edge(collapsed.region);
  }
  return null;
}

/** Outer side of an edge split: left/top insert before, right/bottom after. */
function edgeSplit(region: DockRegionId): { axis: DockAxis; position: 'before' | 'after' } | null {
  switch (region) {
    case 'left':
      return { axis: 'horizontal', position: 'before' };
    case 'right':
      return { axis: 'horizontal', position: 'after' };
    case 'top':
      return { axis: 'vertical', position: 'before' };
    case 'bottom':
      return { axis: 'vertical', position: 'after' };
    default:
      return null;
  }
}

/** The zone → split mapping: left/right split horizontally, top/bottom vertically. */
export function zoneSplit(zone: Exclude<DockZone, 'center'>): { axis: DockAxis; position: 'before' | 'after' } {
  return {
    axis: zone === 'left' || zone === 'right' ? 'horizontal' : 'vertical',
    position: zone === 'left' || zone === 'top' ? 'before' : 'after'
  };
}

/**
 * The reducer {@link DockTarget} a drop target maps to (on the active page), or
 * `null` for a page target (which needs `panel.move`'s `pageId`).
 */
export function dockTargetFor(target: DockDropTarget): DockTarget | null {
  switch (target.kind) {
    case 'zone':
      if (target.zone === 'center') return { kind: 'tab', tabStackId: target.stackId };
      return { kind: 'split', targetPanelId: target.targetPanelId, ...zoneSplit(target.zone) };
    case 'tab':
      return { kind: 'tab', tabStackId: target.stackId, index: target.index };
    case 'edge': {
      const split = target.empty ? null : edgeSplit(target.region);
      return split ? { kind: 'split', region: target.region, ...split } : { kind: 'region', region: target.region };
    }
    case 'page':
      return null;
  }
}

/** The one command a panel drop dispatches, or `null` when the target refuses it. */
export function dockDropCommand(panelId: string, target: DockDropTarget): WorkbenchCommand | null {
  if (target.kind === 'page') {
    return target.accepts ? { type: 'panel.move', panelId, to: { kind: 'region', region: 'main' }, pageId: target.pageId } : null;
  }
  const to = dockTargetFor(target);
  return to ? { type: 'panel.move', panelId, to } : null;
}

/** Split `rect` in two along `axis` (with the handle between) and return the requested half. */
export function splitHalf(rect: WorkbenchRect, axis: DockAxis, position: 'before' | 'after', handle = SPLIT_HANDLE_PX): WorkbenchRect {
  if (axis === 'horizontal') {
    const width = Math.max(0, (rect.width - handle) / 2);
    return { left: position === 'before' ? rect.left : rect.left + width + handle, top: rect.top, width, height: rect.height };
  }
  const height = Math.max(0, (rect.height - handle) / 2);
  return { left: rect.left, top: position === 'before' ? rect.top : rect.top + height + handle, width: rect.width, height };
}

/**
 * The band an EMPTY region takes once a panel lands in it: left/right run the
 * full workspace height at their stored (or default) width; top/bottom span the
 * centre column between the current left and right regions at their stored (or
 * default) height; main keeps its rendered rect. Side bands lose the 1px inner
 * border DockRegion draws, so this is the panel's (tab stack's) rect.
 */
export function regionBandRect(region: DockRegionId, geometry: DockDropGeometry): WorkbenchRect {
  const ws = geometry.workspace;
  const zoom = geometry.zoom && geometry.zoom > 0 ? geometry.zoom : 1;
  const border = REGION_BORDER_PX * zoom;
  const stored = geometry.regionSizes?.[region];
  if (region === 'left' || region === 'right') {
    const size = (stored && stored > 0 ? stored : DEFAULT_SIDE_REGION_PX) * zoom;
    const width = Math.max(0, size - border);
    return { left: region === 'left' ? ws.left : ws.left + ws.width - size + border, top: ws.top, width, height: ws.height };
  }
  if (region === 'top' || region === 'bottom') {
    const size = (stored && stored > 0 ? stored : DEFAULT_BAND_REGION_PX) * zoom;
    const height = Math.max(0, size - border);
    const left = geometry.regionRects?.left;
    const right = geometry.regionRects?.right;
    const x0 = left ? left.left + left.width : ws.left;
    const x1 = right ? right.left : ws.left + ws.width;
    return { left: x0, top: region === 'top' ? ws.top : ws.top + ws.height - size + border, width: Math.max(0, x1 - x0), height };
  }
  const main = geometry.emptyRegions.find((empty) => empty.region === 'main')?.rect ?? geometry.regionRects?.main ?? ws;
  return { ...main };
}

/**
 * The exact rect the panel occupies after dropping on `target`: the matching
 * half of the target stack for a split (the reducer splits 50/50), the whole
 * stack for a tab (a collapsed stack expands), an empty region's resulting band,
 * the outer half of an occupied region for an edge drop. `null` for page targets
 * (the nav entry highlights instead) and unknown stacks.
 */
export function landingRect(target: DockDropTarget | null, geometry: DockDropGeometry): WorkbenchRect | null {
  if (!target || target.kind === 'page') return null;
  const zoom = geometry.zoom && geometry.zoom > 0 ? geometry.zoom : 1;
  const handle = SPLIT_HANDLE_PX * zoom;
  if (target.kind === 'zone' || target.kind === 'tab') {
    const slot = geometry.stacks.find((candidate) => candidate.stackId === target.stackId);
    if (!slot) return null;
    if (target.kind === 'tab' || target.zone === 'center') return { ...(slot.collapsed ? slot.expandedRect ?? slot.rect : slot.rect) };
    const { axis, position } = zoneSplit(target.zone);
    return splitHalf(slot.rect, axis, position, handle);
  }
  if (target.empty) return regionBandRect(target.region, geometry);
  const split = edgeSplit(target.region);
  const content = geometry.regionContentRects?.[target.region] ?? geometry.regionRects?.[target.region];
  if (!content) return null;
  if (!split) return { ...content };
  const collapsedExtent = geometry.regionCollapsedExtents?.[target.region];
  if (collapsedExtent == null) return splitHalf(content, split.axis, split.position, handle);
  // The region root is strips only: the new stack takes all but the strip (+ handle).
  if (split.axis === 'horizontal') {
    const width = Math.max(0, content.width - collapsedExtent - handle);
    return { left: split.position === 'before' ? content.left : content.left + content.width - width, top: content.top, width, height: content.height };
  }
  const height = Math.max(0, content.height - collapsedExtent - handle);
  return { left: content.left, top: split.position === 'before' ? content.top : content.top + content.height - height, width: content.width, height };
}

export interface CompleteDockDropGeometryInput {
  /** The dock as rendered (the lifted dock during a tab drag). */
  dock: DockLayout;
  /** Panel instances (collapsed flags). */
  panels: Record<string, { collapsed?: boolean } | undefined>;
  /**
   * What was measured: workspace, region rects + content rects, empty / collapsed
   * region strips, stacks (rect, header, tabs, collapsed, layer), pages, zoom.
   */
  measured: DockDropGeometry;
}

/**
 * Turn measured rects into the full geometry the target / landing logic needs,
 * adding what follows from the model rather than the DOM: occupied regions,
 * stored region sizes, and the EXPANDED geometry a drop produces —
 *   - a region the user collapsed, or whose tree is all collapsed strips, grows
 *     back to its band once a panel lands in it (the reducer expands it; the
 *     dropped / moved panel arrives expanded), so its content rect is the band
 *     and, for an all-strips tree, the strips' extent is recorded;
 *   - a collapsed stack gets the rect it takes once a tab drop expands it.
 * Pure: the DOM glue (`panelDrag.ts`) measures, this decides.
 */
export function completeDockDropGeometry(input: CompleteDockDropGeometryInput): DockDropGeometry {
  const { dock, panels, measured } = input;
  const zoom = measured.zoom && measured.zoom > 0 ? measured.zoom : 1;
  const metrics = { strip: COLLAPSED_STRIP_PX * zoom, handle: SPLIT_HANDLE_PX * zoom };
  const isCollapsed = stackCollapsedIn(panels);
  const regions = Object.keys(dock.root) as DockRegionId[];
  const occupiedRegions = regions.filter((region) => !!dock.root[region]);
  const regionSizes: Partial<Record<DockRegionId, number | undefined>> = { ...measured.regionSizes };
  for (const region of Object.keys(dock.regions) as DockRegionId[]) regionSizes[region] = dock.regions[region]?.sizePx;

  const geometry: DockDropGeometry = {
    ...measured,
    occupiedRegions,
    regionSizes,
    regionRects: { ...measured.regionRects },
    regionContentRects: { ...measured.regionContentRects },
    regionCollapsedExtents: { ...measured.regionCollapsedExtents },
    zoom
  };

  const expandedContent: Partial<Record<DockRegionId, WorkbenchRect>> = {};
  for (const region of occupiedRegions) {
    const root = dock.root[region]!;
    const userCollapsed = !!dock.regions[region]?.collapsed;
    const allStrips = isDockNodeCollapsed(root, isCollapsed);
    if (!userCollapsed && !allStrips) {
      expandedContent[region] = geometry.regionContentRects![region];
      continue;
    }
    if (region === 'main') {
      expandedContent[region] = geometry.regionRects!.main;
      continue;
    }
    const band = regionBandRect(region, geometry);
    expandedContent[region] = band;
    geometry.regionContentRects![region] = band;
    if (allStrips) {
      geometry.regionCollapsedExtents![region] = collapsedNodeExtent(root, region === 'left' || region === 'right' ? 'horizontal' : 'vertical', isCollapsed, metrics);
    }
  }

  geometry.stacks = measured.stacks.map((slot) => {
    if (!slot.collapsed) return slot;
    const root = dock.root[slot.region];
    const content = expandedContent[slot.region];
    if (!root || !content) return slot;
    const expanded = layoutDockTree(root, content, (stack) => stack.id !== slot.stackId && isCollapsed(stack), metrics).get(slot.stackId);
    return expanded ? { ...slot, expandedRect: expanded } : slot;
  });
  return geometry;
}
