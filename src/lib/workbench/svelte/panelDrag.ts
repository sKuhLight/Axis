/**
 * Panel drag sessions — the DOM glue around the pure dock-drop modules.
 *
 *   tab drag      → {@link startPanelTabDrag}: LIFTS the panel out of the rendered
 *                   dock the moment the drag activates (controller.liftedPanelId →
 *                   `renderedPage`), so its slot collapses and the neighbours fill
 *                   the space; one drop = one `panel.move` = one undo step.
 *   library drag  → {@link beginDockDropSession} via `libraryDrag.startPanelDragOut`
 *                   (nothing to lift: the source is a template).
 *
 * Every pointer move measures the CURRENT (lifted) DOM into a
 * `DockDropGeometry` (the model-derived parts come from the pure
 * `completeDockDropGeometry`), resolves the target with `dockDropTargetAt`, and
 * publishes the overlay model on `controller.drag.dock` for DragLayer.
 * Releasing over no target, or pressing Escape, cancels: nothing was
 * dispatched, so clearing the drag (and with it the lift) restores the layout.
 *
 * The listeners live on `window` (dragSession), so the drag survives the source
 * tab unmounting when its stack is lifted away. The session's collaborators
 * (measuring, the post-lift tick, toasts, the viewport) are injectable, so the
 * state machine is unit-tested without a DOM.
 */
import { tick } from 'svelte';
import { findTabStackById, type DockNode, type DockRegionId, type TabStackDockNode, type WorkbenchPage } from '../core';
import type { WorkbenchController } from './controller.svelte';
import { beginPointerDrag } from './dragSession';
import type { WorkbenchPointer, WorkbenchRect } from './drag';
import {
  completeDockDropGeometry,
  dockDropCommand,
  dockDropTargetAt,
  type DockDropGeometry,
  type DockDropTarget,
  type DockEmptyRegion,
  type DockNavPageTarget,
  type DockStackSlot
} from './dockDropTarget';
import { buildDockDropOverlay } from './dockDropOverlay';
import { stackActivePanelId } from './dockLayout';
import { enqueueToast, type ToastInput } from './toasts';

export const DRAG_CANCELLED_TOAST = 'Drag cancelled';

/** Stacking layers of measured stacks (higher wins where they overlap). */
export const STACK_LAYER_INLINE = 0;
export const STACK_LAYER_DRAWER = 1;
export const STACK_LAYER_MAXIMIZED = 2;

function rectOf(el: Element): WorkbenchRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function visible(rect: WorkbenchRect): boolean {
  return rect.width > 0 && rect.height > 0;
}

function findStack(page: WorkbenchPage | undefined, stackId: string): { stack: TabStackDockNode; region: DockRegionId } | undefined {
  if (!page) return undefined;
  for (const [region, node] of Object.entries(page.dock.root) as [DockRegionId, DockNode | null][]) {
    const stack = findTabStackById(node, stackId);
    if (stack) return { stack, region };
  }
  return undefined;
}

export interface CollectDockDropOptions {
  /** Include nav page targets (`[data-nav-page]`). */
  pages?: boolean;
}

/**
 * Measure the rendered (lifted) dock — every visible tab stack (tab bar, tab
 * pills, stacking layer), region rects and bodies, empty and user-collapsed
 * region strips, nav page entries — and complete it into a
 * {@link DockDropGeometry} with `completeDockDropGeometry`. Returns `null` when
 * the workspace is not rendered.
 */
export function collectDockDropGeometry(controller: WorkbenchController, options: CollectDockDropOptions = {}): DockDropGeometry | null {
  if (typeof document === 'undefined') return null;
  const workspaceEl = document.querySelector<HTMLElement>('.aw-workspace');
  if (!workspaceEl) return null;
  const workspace = rectOf(workspaceEl);
  if (!visible(workspace)) return null;
  const zoom = workspaceEl.offsetWidth > 0 ? workspace.width / workspaceEl.offsetWidth : 1;
  const page = controller.renderedPage;
  const layout = controller.activeLayout;
  if (!page) return null;
  const panels = layout?.panels ?? {};

  const regionRects: Partial<Record<DockRegionId, WorkbenchRect>> = {};
  const regionContentRects: Partial<Record<DockRegionId, WorkbenchRect>> = {};
  const emptyRegions: DockEmptyRegion[] = [];
  const collapsedRegions: DockEmptyRegion[] = [];
  for (const el of Array.from(workspaceEl.querySelectorAll<HTMLElement>('.aw-region[data-region]:not(.overlay)'))) {
    const region = el.dataset.region as DockRegionId;
    const rect = rectOf(el);
    if (!visible(rect)) continue;
    regionRects[region] = rect;
    const body = el.querySelector<HTMLElement>(':scope > .aw-region-body');
    if (body) regionContentRects[region] = rectOf(body);
    if (el.classList.contains('empty')) emptyRegions.push({ region, rect });
    else if (el.classList.contains('collapsed')) collapsedRegions.push({ region, rect });
  }

  const stacks: DockStackSlot[] = [];
  for (const el of Array.from(workspaceEl.querySelectorAll<HTMLElement>('[data-tabstack]'))) {
    const rect = rectOf(el);
    if (!visible(rect)) continue;
    const found = findStack(page, el.dataset.tabstack ?? '');
    if (!found) continue;
    const { stack, region } = found;
    // A held stack (its active tab lifted) targets its first remaining tab.
    const activePanelId = stackActivePanelId(stack) ?? stack.activePanelId;
    const panel = panels[activePanelId];
    const head = el.querySelector<HTMLElement>('.aw-pane-head');
    stacks.push({
      stackId: stack.id,
      activePanelId,
      rect,
      region,
      collapsed: el.dataset.collapsed === 'true',
      headerRect: head ? rectOf(head) : null,
      tabRects: Array.from(el.querySelectorAll<HTMLElement>('.aw-pane-tab')).map(rectOf),
      title: panel?.title ?? panel?.type ?? activePanelId,
      layer:
        el.dataset.maximized === 'true'
          ? STACK_LAYER_MAXIMIZED
          : el.closest('.aw-mobile-dock-drawer')
            ? STACK_LAYER_DRAWER
            : STACK_LAYER_INLINE
    });
  }

  const pages: DockNavPageTarget[] = [];
  if (options.pages) {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-nav-page]'))) {
      const pageId = el.dataset.navPage;
      if (!pageId || !layout?.pages[pageId]) continue;
      const rect = rectOf(el);
      // Off-screen entries (the phone nav sheet while closed) are not targets.
      if (!visible(rect) || rect.left + rect.width <= 0 || rect.top + rect.height <= 0 || rect.left >= viewport.width || rect.top >= viewport.height) continue;
      pages.push({ pageId, rect, isCurrent: pageId === layout.activePageId, label: layout.pages[pageId].label });
    }
  }

  return completeDockDropGeometry({
    dock: page.dock,
    panels,
    measured: { workspace, stacks, emptyRegions, collapsedRegions, pages, regionRects, regionContentRects, zoom }
  });
}

/**
 * What a commit did: `true` dispatched, `false` nothing to do (the drag
 * counts as cancelled), `'refused'` the reducer rejected it — its error is on
 * `controller.lastResult`, which the edit bar shows as its error chip, so no
 * "Drag cancelled" toast covers it.
 */
export type DockDropCommitResult = boolean | 'refused';

export interface DockDropSessionOptions {
  controller: WorkbenchController;
  event: PointerEvent;
  /** The dragged panel id (a sentinel for library templates). */
  draggedPanelId: string;
  /** Display name for the pointer card / landing label. */
  panelLabel: string;
  /** Lift the panel out of the rendered dock while dragging (tab drags). */
  lift: boolean;
  /** Nav page entries are drop targets. */
  pages: boolean;
  /** Fired once when the drag crosses the threshold (e.g. collapse a drawer). */
  onActivate?: () => void;
  /** A press that never became a drag. */
  onTap?: (event: PointerEvent) => void;
  /** May the press become a drag once past the threshold (`dragSession.ts` `shouldActivate`)? */
  shouldActivate?: (from: WorkbenchPointer, to: WorkbenchPointer) => boolean;
  /** Commit a drop on `target` (dispatch). */
  commit: (target: DockDropTarget) => DockDropCommitResult;
}

/** The session's collaborators (injectable for tests). */
export interface DockDropSessionDeps {
  collect: (controller: WorkbenchController, options: CollectDockDropOptions) => DockDropGeometry | null;
  /** Resolves once the lifted dock has rendered. */
  afterRender: () => Promise<unknown>;
  toast: (input: ToastInput) => unknown;
  viewport: () => { width: number; height: number };
}

const DEFAULT_DEPS: DockDropSessionDeps = {
  collect: collectDockDropGeometry,
  afterRender: () => tick(),
  toast: enqueueToast,
  viewport: () => ({ width: window.innerWidth, height: window.innerHeight })
};

/**
 * Begin a pointer session that drags a panel over the dock with zone / edge /
 * page targets. State machine:
 *   - activate: lift (tab drags) — measuring waits for the lifted DOM — or, for
 *     a template drag, restore a maximized panel;
 *   - move: measure, resolve, publish the overlay (once published, a drag that
 *     was cleared from outside — leaving edit mode — aborts the session);
 *   - release: commit the target; ALWAYS clear the drag and the lift (even when
 *     resolving or committing throws, which is rethrown); "Drag cancelled" when
 *     nothing was committed (not when the reducer refused it);
 *   - Escape: clear + "Drag cancelled"; pointercancel: clear silently.
 */
export function beginDockDropSession(options: DockDropSessionOptions, deps: DockDropSessionDeps = DEFAULT_DEPS): void {
  const { controller, event } = options;
  if (event.button !== 0) return;
  const startedAt: WorkbenchPointer = { x: event.clientX, y: event.clientY };
  let pointer = startedAt;
  // A lift re-renders the dock; measuring has to wait for that DOM.
  let measured = !options.lift;
  let active = false;
  let published = false;
  const aborted = () => published && controller.drag?.kind !== 'panel';

  const resolve = (at: WorkbenchPointer): { geometry: DockDropGeometry | null; target: DockDropTarget | null } => {
    const geometry = deps.collect(controller, { pages: options.pages });
    const target = geometry ? dockDropTargetAt(at, geometry, options.draggedPanelId, { pages: options.pages }) : null;
    return { geometry, target };
  };

  const publish = (at: WorkbenchPointer) => {
    if (aborted()) return;
    pointer = at;
    const { geometry, target } = measured ? resolve(at) : { geometry: null, target: null };
    const dock = geometry
      ? buildDockDropOverlay({ pointer: at, geometry, target, panelLabel: options.panelLabel, viewport: deps.viewport() })
      : undefined;
    controller.setDrag({
      kind: 'panel',
      panelId: options.draggedPanelId,
      startedAt,
      pointer: at,
      panelLabel: options.panelLabel,
      targetLabel: dock?.card.hint,
      dock
    });
    published = true;
  };

  /** End the session: clear the drag (and with it the lift); optionally say it was cancelled. */
  const finish = (toastCancelled: boolean) => {
    active = false;
    controller.setDrag(null);
    if (toastCancelled) deps.toast({ text: DRAG_CANCELLED_TOAST });
  };

  beginPointerDrag({
    event,
    cancelOnEscape: true,
    shouldActivate: options.shouldActivate,
    onActivate: () => {
      active = true;
      options.onActivate?.();
      if (options.lift) {
        controller.setLiftedPanel(options.draggedPanelId);
        void deps.afterRender().then(() => {
          measured = true;
          if (active) publish(pointer);
        });
      } else if (controller.maximizedPanelId) {
        controller.setMaximizedPanel(null);
      }
    },
    onMove: (at) => publish(at),
    onDrop: (at) => {
      if (aborted()) {
        active = false;
        return;
      }
      let outcome: DockDropCommitResult = false;
      let threw = false;
      try {
        const { target } = resolve(at);
        if (target) outcome = options.commit(target);
      } catch (error) {
        threw = true;
        throw error;
      } finally {
        finish(!threw && outcome === false);
      }
    },
    onTap: options.onTap,
    onCancel: (reason) => {
      if (aborted()) {
        active = false;
        return;
      }
      finish(reason === 'escape');
    }
  });
}

export interface PanelTabDragOptions {
  controller: WorkbenchController;
  event: PointerEvent;
  panelId: string;
  /** A press without movement (activates the tab). */
  onTap?: () => void;
}

/** The commit of a tab drag: one `panel.move` (page drops toast where the panel went). */
export function commitPanelTabDrop(controller: WorkbenchController, panelId: string, panelLabel: string, target: DockDropTarget, toast: (input: ToastInput) => unknown = enqueueToast): DockDropCommitResult {
  const command = dockDropCommand(panelId, target);
  if (!command) return false;
  const result = controller.dispatch(command);
  if (!result.success) return 'refused';
  if (target.kind === 'page') {
    const pageLabel = controller.activeLayout?.pages[target.pageId]?.label ?? target.pageId;
    toast({ text: `Moved ${panelLabel} to ${pageLabel}` });
  }
  return true;
}

/** Drag a docked panel by its tab (edit mode): lift, zones/edges/pages, one `panel.move` on drop. */
export function startPanelTabDrag(options: PanelTabDragOptions): void {
  const { controller, event, panelId } = options;
  if (!controller.editMode || event.button !== 0) return;
  const panel = controller.activeLayout?.panels[panelId];
  const panelLabel = panel?.title ?? panel?.type ?? panelId;
  beginDockDropSession({
    controller,
    event,
    draggedPanelId: panelId,
    panelLabel,
    lift: true,
    pages: true,
    onTap: () => options.onTap?.(),
    commit: (target) => commitPanelTabDrop(controller, panelId, panelLabel, target)
  });
}
