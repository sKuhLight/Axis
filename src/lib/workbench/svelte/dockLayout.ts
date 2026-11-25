/**
 * Pure dock geometry that mirrors how DockRegion / DockNode lay a dock tree out
 * with CSS flexbox — so code that has to know a size BEFORE it is rendered (the
 * landing rect of a drop onto a collapsed stack, the collapsed-strip extents)
 * agrees with what the browser will draw.
 *
 * Collapse model: a tab stack whose ACTIVE panel is collapsed renders as a slim
 * strip, `COLLAPSED_STRIP_PX` thick along the axis of its parent split; a split whose
 * children are all collapsed is itself collapsed (it takes a fixed extent in its
 * own parent). Expanded siblings share the space that is left, by ratio.
 */
import {
  isHeldTabStack,
  normalizeRatios,
  type DockAxis,
  type DockLayout,
  type DockNode,
  type DockRegionId,
  type SplitDockNode,
  type TabStackDockNode
} from '../core';
import type { WorkbenchRect } from './drag';

/** Thickness of a collapsed stack's strip along its split axis (CSS px). */
export const COLLAPSED_STRIP_PX = 36;
/** Thickness of the SplitHandle between two split children (CSS px). */
export const SPLIT_HANDLE_PX = 4;
/** Default width (CSS px) of a left/right region without a stored size (DockRegion CSS). */
export const DEFAULT_SIDE_REGION_PX = 320;
/** Default height (CSS px) of a top/bottom region without a stored size (DockRegion CSS). */
export const DEFAULT_BAND_REGION_PX = 240;
/** The 1px inner border DockRegion draws on side regions (towards the centre). */
export const REGION_BORDER_PX = 1;
/** Edit mode: width of an empty left/right region strip, height of an empty top/bottom strip (CSS px). */
export const EMPTY_SIDE_STRIP_PX = 44;
export const EMPTY_BAND_STRIP_PX = 48;
/** A user-collapsed region (`region.collapse`): DockRegion's 32×32 strip (CSS px). */
export const COLLAPSED_REGION_PX = 32;

export type StackCollapsedFn = (stack: TabStackDockNode) => boolean;

/** The panel a stack shows (its `activePanelId`, or the first tab when that is stale). */
export function stackActivePanelId(stack: TabStackDockNode): string | undefined {
  return stack.panelIds.includes(stack.activePanelId) ? stack.activePanelId : stack.panelIds[0];
}

/**
 * "Is this stack a collapsed strip?" for a panel map: its active panel is
 * collapsed. A held stack (its active tab lifted by a drag) is judged by its
 * FIRST remaining tab — the panel the reducer activates once the dragged one
 * has left — so the lifted layout already has the shape the drop will produce
 * (a strip when that tab is collapsed).
 */
export function stackCollapsedIn(panels: Record<string, { collapsed?: boolean } | undefined>): StackCollapsedFn {
  return (stack) => {
    const id = isHeldTabStack(stack) ? stack.panelIds[0] : stackActivePanelId(stack);
    return !!id && panels[id]?.collapsed === true;
  };
}

export interface DockLayoutMetrics {
  /** Collapsed strip thickness (defaults to {@link COLLAPSED_STRIP_PX}). */
  strip?: number;
  /** Split handle thickness (defaults to {@link SPLIT_HANDLE_PX}). */
  handle?: number;
}

function metrics(m: DockLayoutMetrics = {}): { strip: number; handle: number } {
  return { strip: m.strip ?? COLLAPSED_STRIP_PX, handle: m.handle ?? SPLIT_HANDLE_PX };
}

/** True when the node renders as strips only: a collapsed stack, or a split of collapsed nodes. */
export function isDockNodeCollapsed(node: DockNode | null, isStackCollapsed: StackCollapsedFn): boolean {
  if (!node) return false;
  if (node.kind === 'tabs') return isStackCollapsed(node);
  return node.children.length > 0 && node.children.every((child) => isDockNodeCollapsed(child, isStackCollapsed));
}

/**
 * Fixed extent (px) a COLLAPSED node occupies along `along`: a strip for a
 * stack; for a split, the sum of its children (+ handles) when it runs along the
 * same axis, else the largest child.
 */
export function collapsedNodeExtent(node: DockNode, along: DockAxis, isStackCollapsed: StackCollapsedFn, m: DockLayoutMetrics = {}): number {
  const { strip, handle } = metrics(m);
  if (node.kind === 'tabs') return strip;
  const extents = node.children.map((child) => collapsedNodeExtent(child, along, isStackCollapsed, m));
  if (!extents.length) return 0;
  if (node.axis === along) return extents.reduce((sum, value) => sum + value, 0) + handle * (extents.length - 1);
  return Math.max(...extents);
}

/** How one split child is sized: a fixed px extent (collapsed) or a share of the free space. */
export interface SplitChildFlex {
  /** Fixed extent along the split axis, or `null` for a flexible child. */
  fixedPx: number | null;
  /** Flexible children: share of the free space in percent (0 for fixed children). */
  basisPercent: number;
}

/**
 * Effective flex sizing of a split's children given their collapsed state and
 * ratios. Collapsed children get a fixed extent; the others split the remaining
 * space by their ratios, renormalized over the expanded children only (so the
 * siblings of a collapsed child take the freed space). With no expanded child
 * every entry is fixed.
 */
export function splitChildFlex(split: SplitDockNode, isStackCollapsed: StackCollapsedFn, m: DockLayoutMetrics = {}): SplitChildFlex[] {
  const ratios = normalizeRatios(split.ratio, split.children.length);
  const fixed = split.children.map((child) =>
    isDockNodeCollapsed(child, isStackCollapsed) ? collapsedNodeExtent(child, split.axis, isStackCollapsed, m) : null
  );
  const flexibleTotal = ratios.reduce((sum, ratio, index) => (fixed[index] == null ? sum + ratio : sum), 0);
  const flexibleCount = fixed.filter((value) => value == null).length;
  return fixed.map((fixedPx, index) => ({
    fixedPx,
    basisPercent: fixedPx != null ? 0 : flexibleTotal > 0 ? (ratios[index] / flexibleTotal) * 100 : 100 / Math.max(1, flexibleCount)
  }));
}

/**
 * Pixel sizes of split children along the split axis for a container of
 * `totalPx`: handles and fixed extents come off first, flexible children share
 * what is left by `basisPercent` (never below zero).
 */
export function splitChildSizes(totalPx: number, flex: SplitChildFlex[], m: DockLayoutMetrics = {}): number[] {
  const { handle } = metrics(m);
  const fixedTotal = flex.reduce((sum, child) => sum + (child.fixedPx ?? 0), 0);
  const free = Math.max(0, totalPx - handle * Math.max(0, flex.length - 1) - fixedTotal);
  return flex.map((child) => (child.fixedPx != null ? child.fixedPx : (child.basisPercent / 100) * free));
}

/** CSS `flex` shorthand value for a split child (consumed by DockNode). */
export function splitChildFlexCss(child: SplitChildFlex): string {
  return child.fixedPx != null ? `0 0 ${child.fixedPx}px` : `1 1 ${child.basisPercent}%`;
}

/**
 * Rects of every tab stack in `node` laid out inside `rect`, mirroring
 * DockNode's flexbox (handles between all children, collapsed children fixed).
 * Keyed by tab-stack id.
 */
export function layoutDockTree(
  node: DockNode | null,
  rect: WorkbenchRect,
  isStackCollapsed: StackCollapsedFn,
  m: DockLayoutMetrics = {},
  out: Map<string, WorkbenchRect> = new Map()
): Map<string, WorkbenchRect> {
  if (!node) return out;
  if (node.kind === 'tabs') {
    out.set(node.id, { ...rect });
    return out;
  }
  const { handle } = metrics(m);
  const horizontal = node.axis === 'horizontal';
  const sizes = splitChildSizes(horizontal ? rect.width : rect.height, splitChildFlex(node, isStackCollapsed, m), m);
  let cursor = horizontal ? rect.left : rect.top;
  node.children.forEach((child, index) => {
    const size = sizes[index];
    const childRect = horizontal
      ? { left: cursor, top: rect.top, width: size, height: rect.height }
      : { left: rect.left, top: cursor, width: rect.width, height: size };
    layoutDockTree(child, childRect, isStackCollapsed, m, out);
    cursor += size + handle;
  });
  return out;
}

export interface DockWorkspaceLayout {
  /** Outer rect of every region (edit mode renders all five). */
  regionRects: Partial<Record<DockRegionId, WorkbenchRect>>;
  /** Region bodies (where the dock tree lays out) of occupied, not user-collapsed regions. */
  regionContentRects: Partial<Record<DockRegionId, WorkbenchRect>>;
  /** Empty regions (strips, or the main placeholder). */
  emptyRegions: { region: DockRegionId; rect: WorkbenchRect }[];
  /** Occupied regions the user collapsed (their 32px strip). */
  collapsedRegions: { region: DockRegionId; rect: WorkbenchRect }[];
  /** Every rendered tab stack. */
  stacks: Map<string, { rect: WorkbenchRect; region: DockRegionId; collapsed: boolean }>;
}

/**
 * The whole EDIT-MODE workspace laid out the way DockWorkspace + DockRegion +
 * DockNode render it: a row of left | centre column (top / main / bottom) |
 * right; side regions at their stored or default size with a 1px inner border;
 * empty side regions as 44/48px strips; a user-collapsed region as DockRegion's
 * 32×32 strip; an all-strips region shrunk to its strips (main pins them to its
 * top). CSS px; a pure mirror for round-trip tests of the landing geometry.
 */
export function layoutDockWorkspace(
  dock: DockLayout,
  panels: Record<string, { collapsed?: boolean } | undefined>,
  workspace: WorkbenchRect,
  m: DockLayoutMetrics = {}
): DockWorkspaceLayout {
  const isCollapsed = stackCollapsedIn(panels);
  const out: DockWorkspaceLayout = { regionRects: {}, regionContentRects: {}, emptyRegions: [], collapsedRegions: [], stacks: new Map() };
  const side = (region: DockRegionId) => region === 'left' || region === 'right';

  // Extent of a region along its own axis, plus its cross size when not full.
  const extentOf = (region: DockRegionId): { size: number; cross: number | null } => {
    const root = dock.root[region];
    const state = dock.regions[region];
    if (!root) return { size: side(region) ? EMPTY_SIDE_STRIP_PX : EMPTY_BAND_STRIP_PX, cross: state?.collapsed ? COLLAPSED_REGION_PX : null };
    if (state?.collapsed) return { size: COLLAPSED_REGION_PX, cross: COLLAPSED_REGION_PX };
    if (isDockNodeCollapsed(root, isCollapsed)) return { size: collapsedNodeExtent(root, side(region) ? 'horizontal' : 'vertical', isCollapsed, m), cross: null };
    return { size: state?.sizePx || (side(region) ? DEFAULT_SIDE_REGION_PX : DEFAULT_BAND_REGION_PX), cross: null };
  };

  const ws = workspace;
  const left = extentOf('left');
  const right = extentOf('right');
  out.regionRects.left = { left: ws.left, top: ws.top, width: left.size, height: left.cross ?? ws.height };
  out.regionRects.right = { left: ws.left + ws.width - right.size, top: ws.top, width: right.size, height: right.cross ?? ws.height };
  const cx = ws.left + left.size;
  const cw = Math.max(0, ws.width - left.size - right.size);
  const top = extentOf('top');
  const bottom = extentOf('bottom');
  out.regionRects.top = { left: cx, top: ws.top, width: top.cross ?? cw, height: top.size };
  out.regionRects.bottom = { left: cx, top: ws.top + ws.height - bottom.size, width: bottom.cross ?? cw, height: bottom.size };
  out.regionRects.main = { left: cx, top: ws.top + top.size, width: cw, height: Math.max(0, ws.height - top.size - bottom.size) };

  for (const region of ['left', 'right', 'top', 'bottom', 'main'] as DockRegionId[]) {
    const rect = out.regionRects[region]!;
    const root = dock.root[region];
    if (!root) {
      out.emptyRegions.push({ region, rect });
      continue;
    }
    if (dock.regions[region]?.collapsed) {
      out.collapsedRegions.push({ region, rect });
      continue;
    }
    const b = region === 'main' ? 0 : REGION_BORDER_PX;
    let content: WorkbenchRect =
      region === 'left'
        ? { left: rect.left, top: rect.top, width: rect.width - b, height: rect.height }
        : region === 'right'
          ? { left: rect.left + b, top: rect.top, width: rect.width - b, height: rect.height }
          : region === 'top'
            ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height - b }
            : region === 'bottom'
              ? { left: rect.left, top: rect.top + b, width: rect.width, height: rect.height - b }
              : { ...rect };
    if (region === 'main' && isDockNodeCollapsed(root, isCollapsed)) {
      content = { ...content, height: collapsedNodeExtent(root, 'vertical', isCollapsed, m) };
    }
    out.regionContentRects[region] = content;
    for (const [id, stackRect] of layoutDockTree(root, content, isCollapsed, m)) {
      out.stacks.set(id, { rect: stackRect, region, collapsed: false });
    }
  }
  // Collapsed flags (needs the tree): a stack is a strip when its active panel is collapsed.
  const mark = (node: DockNode | null) => {
    if (!node) return;
    if (node.kind === 'tabs') {
      const entry = out.stacks.get(node.id);
      if (entry) entry.collapsed = isCollapsed(node);
      return;
    }
    node.children.forEach(mark);
  };
  for (const region of Object.keys(dock.root) as DockRegionId[]) mark(dock.root[region]);
  return out;
}
