import type { DockLayout, DockNode, DockRegionId, WorkbenchPage } from './schema';
import { normalizeRatios } from './invariants';

/**
 * Shared dock-tree removal. The reducer (`panel.move` / `panel.close` / …) and
 * the drag preview's "lift" (the dragged panel taken out of the rendered dock
 * the moment a panel drag activates) both go through this one implementation,
 * so the space the preview frees up is exactly the space the reducer frees up.
 */

export interface RemovePanelOptions {
  /**
   * Keep a split that drops to a single child instead of replacing it with that
   * child. The geometry is identical (a one-child split renders its child at
   * 100%, with no handle), but the surviving subtree keeps its node ids, so the
   * renderer does not remount the neighbours of a lifted panel when the drag
   * starts or is cancelled. The reducer never sets this: committed documents
   * always collapse single-child splits.
   */
  preserveSplits?: boolean;
  /**
   * Keep a stack's `activePanelId` pointing at the removed panel when that was
   * the active tab (render-only, like `preserveSplits`). The stack is then
   * "held": the renderer shows its remaining tabs but mounts none of them, so
   * lifting the active tab of a multi-tab stack does not mount a neighbour
   * panel for the duration of the drag. Never used by the reducer.
   */
  holdActive?: boolean;
}

export interface RemovePanelResult {
  node: DockNode | null;
  removed: boolean;
}

/**
 * Remove `panelId` from a dock subtree without mutating it (changed branches
 * are shallow-copied, untouched branches are shared). An emptied tab stack is
 * dropped; a split losing children renormalizes its ratios; a split left with
 * one child collapses into that child (unless `preserveSplits`); an emptied
 * split is dropped.
 */
export function removePanelFromNode(node: DockNode | null, panelId: string, options: RemovePanelOptions = {}): RemovePanelResult {
  if (!node) return { node, removed: false };
  if (node.kind === 'tabs') {
    if (!node.panelIds.includes(panelId)) return { node, removed: false };
    const panelIds = node.panelIds.filter((id) => id !== panelId);
    if (panelIds.length === 0) return { node: null, removed: true };
    return {
      removed: true,
      node: {
        ...node,
        panelIds,
        activePanelId: panelIds.includes(node.activePanelId) || options.holdActive ? node.activePanelId : panelIds[0]
      }
    };
  }

  let removed = false;
  const children = node.children
    .map((child) => {
      const result = removePanelFromNode(child, panelId, options);
      removed = removed || result.removed;
      return result.node;
    })
    .filter((child): child is DockNode => !!child);
  if (!removed) return { node, removed: false };
  if (children.length === 0) return { node: null, removed: true };
  if (children.length === 1 && !options.preserveSplits) return { node: children[0], removed: true };
  return {
    removed: true,
    node: {
      ...node,
      children,
      ratio: normalizeRatios(node.ratio, children.length)
    }
  };
}

/** Mutating variant used by the reducer on its working clone: strips the panel from every region root. */
export function removePanelFromDock(dock: DockLayout, panelId: string): boolean {
  let removed = false;
  for (const region of Object.keys(dock.root) as DockRegionId[]) {
    const result = removePanelFromNode(dock.root[region], panelId);
    dock.root[region] = result.node;
    removed = removed || result.removed;
  }
  return removed;
}

/**
 * A copy of `dock` with `panelId` removed from every region root — the dock as
 * it looks while that panel is "lifted" by a drag. Pure: the input is never
 * mutated, and an absent panel returns the input unchanged (same identity).
 */
export function liftPanelFromDock(dock: DockLayout, panelId: string, options: RemovePanelOptions = {}): DockLayout {
  let removed = false;
  const root = { ...dock.root };
  for (const region of Object.keys(root) as DockRegionId[]) {
    const result = removePanelFromNode(root[region], panelId, options);
    if (result.removed) {
      root[region] = result.node;
      removed = true;
    }
  }
  return removed ? { ...dock, root } : dock;
}

/** Page-level {@link liftPanelFromDock}: the page with the panel lifted out of its dock. */
export function liftPanelFromPage(page: WorkbenchPage, panelId: string, options: RemovePanelOptions = {}): WorkbenchPage {
  const dock = liftPanelFromDock(page.dock, panelId, options);
  return dock === page.dock ? page : { ...page, dock };
}

/** A stack whose active tab was lifted away (`holdActive`): it shows no panel. */
export function isHeldTabStack(stack: { panelIds: string[]; activePanelId: string }): boolean {
  return stack.panelIds.length > 0 && !stack.panelIds.includes(stack.activePanelId);
}

/**
 * Replace every split with exactly one child by that child (recursively) — the
 * normal form the reducer's removal produces. Lets tests (and callers) compare a
 * `preserveSplits` lift with the committed shape.
 */
export function collapseSingleChildSplits(node: DockNode | null): DockNode | null {
  if (!node || node.kind === 'tabs') return node;
  const children = node.children.map((child) => collapseSingleChildSplits(child)).filter((child): child is DockNode => !!child);
  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return { ...node, children };
}
