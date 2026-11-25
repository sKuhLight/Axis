import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyWorkbenchDocument, selectActiveDock, type TabStackDockNode } from '../../core';
import { createWorkbenchController, type WorkbenchController } from '../controller.svelte';
import type { DockDropGeometry } from '../dockDropTarget';
import {
  DRAG_CANCELLED_TOAST,
  beginDockDropSession,
  commitPanelTabDrop,
  type DockDropCommitResult,
  type DockDropSessionDeps
} from '../panelDrag';

// The session only needs `window` as an event bus (dragSession), so a bare
// EventTarget stands in (node environment, no DOM). Measuring, the post-lift
// tick, toasts and the viewport are injected.
beforeEach(() => {
  vi.stubGlobal('window', new EventTarget());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * An event bus that lets a listener's exception reach the dispatcher (a real
 * EventTarget reports it as an uncaught error instead), so a rethrow is observable.
 */
class ThrowingBus {
  #listeners = new Map<string, Set<(event: Event) => void>>();
  addEventListener(type: string, listener: (event: Event) => void) {
    if (!this.#listeners.has(type)) this.#listeners.set(type, new Set());
    this.#listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: (event: Event) => void) {
    this.#listeners.get(type)?.delete(listener);
  }
  dispatchEvent(event: Event): boolean {
    for (const listener of [...(this.#listeners.get(event.type) ?? [])]) listener(event);
    return !event.defaultPrevented;
  }
}

const fire = (type: 'pointermove' | 'pointerup' | 'pointercancel', x = 0, y = 0) =>
  window.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { clientX: x, clientY: y }));
const escape = () => window.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' }));
const down = (x = 0, y = 0): PointerEvent => ({ button: 0, clientX: x, clientY: y, preventDefault: vi.fn() }) as unknown as PointerEvent;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Grid in main, editor in bottom (the drag source). */
function setup(): { controller: WorkbenchController; stackId: string } {
  const controller = createWorkbenchController(createEmptyWorkbenchDocument({ profileId: 'profile.t', layoutId: 'layout.t' }));
  controller.setEditMode(true);
  controller.dispatch({ type: 'panel.add', panel: { id: 'grid', type: 't', title: 'Signal Grid' }, region: 'main' });
  controller.dispatch({ type: 'panel.add', panel: { id: 'editor', type: 't', title: 'Block Editor' }, region: 'bottom' });
  const stackId = (selectActiveDock(controller.document)!.root.main as TabStackDockNode).id;
  return { controller, stackId };
}

/** A geometry with the grid stack over (100..900, 100..700) inside a 1000×800 workspace. */
const geometryFor = (stackId: string): DockDropGeometry => ({
  workspace: { left: 0, top: 0, width: 1000, height: 800 },
  stacks: [
    { stackId, activePanelId: 'grid', rect: { left: 100, top: 100, width: 800, height: 600 }, region: 'main', collapsed: false, headerRect: null, title: 'Signal Grid' }
  ],
  emptyRegions: [],
  pages: [],
  occupiedRegions: ['main']
});

function deps(stackId: string, overrides: Partial<DockDropSessionDeps> = {}) {
  const toast = vi.fn();
  const collect = vi.fn(() => geometryFor(stackId));
  const d: DockDropSessionDeps = {
    collect,
    afterRender: () => Promise.resolve(),
    toast,
    viewport: () => ({ width: 1440, height: 900 }),
    ...overrides
  };
  return { d, toast, collect };
}

function start(controller: WorkbenchController, d: DockDropSessionDeps, commit: (t: unknown) => DockDropCommitResult, lift = true) {
  beginDockDropSession(
    { controller, event: down(0, 0), draggedPanelId: 'editor', panelLabel: 'Block Editor', lift, pages: true, commit: commit as never },
    d
  );
}

describe('beginDockDropSession', () => {
  it('lifts on activation, measures only after the lifted render, then publishes the overlay', async () => {
    const { controller, stackId } = setup();
    const { d, collect } = deps(stackId);
    start(controller, d, () => true);
    fire('pointermove', 850, 400);
    expect(controller.liftedPanelId).toBe('editor');
    // Not measured yet: the lifted DOM has not rendered.
    expect(collect).not.toHaveBeenCalled();
    expect(controller.drag?.kind === 'panel' && controller.drag.dock).toBeUndefined();
    await flush();
    expect(collect).toHaveBeenCalled();
    const drag = controller.drag;
    expect(drag?.kind).toBe('panel');
    if (drag?.kind === 'panel') {
      expect(drag.dock?.target).toMatchObject({ kind: 'zone', zone: 'right' });
      expect(drag.dock?.card.hint).toBe('Split right of Signal Grid');
    }
  });

  it('one drop = one commit; the drag and the lift are cleared; no toast', async () => {
    const { controller, stackId } = setup();
    const { d, toast } = deps(stackId);
    const commit = vi.fn(() => true as const);
    start(controller, d, commit);
    fire('pointermove', 850, 400);
    await flush();
    fire('pointerup', 850, 400);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0]).toEqual([{ kind: 'zone', stackId, targetPanelId: 'grid', region: 'main', zone: 'right', small: false }]);
    expect(controller.drag).toBeNull();
    expect(controller.liftedPanelId).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });

  it('releasing over no target cancels with a toast, without committing', async () => {
    const { controller, stackId } = setup();
    const { d, toast } = deps(stackId);
    const commit = vi.fn(() => true as const);
    start(controller, d, commit);
    fire('pointermove', 50, 50);
    await flush();
    fire('pointerup', 950, 750); // inside the workspace, past the stack, short of the 24px edge strips: no target
    expect(commit).not.toHaveBeenCalled();
    expect(controller.drag).toBeNull();
    expect(toast).toHaveBeenCalledWith({ text: DRAG_CANCELLED_TOAST });
  });

  it('a refused commit (reducer error) clears the drag but does not say "Drag cancelled"', async () => {
    const { controller, stackId } = setup();
    const { d, toast } = deps(stackId);
    start(controller, d, () => 'refused');
    fire('pointermove', 850, 400);
    await flush();
    fire('pointerup', 850, 400);
    expect(controller.drag).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });

  it('Escape cancels with a toast; pointercancel cancels silently', async () => {
    const a = setup();
    const da = deps(a.stackId);
    start(a.controller, da.d, () => true);
    fire('pointermove', 850, 400);
    await flush();
    escape();
    expect(a.controller.drag).toBeNull();
    expect(a.controller.liftedPanelId).toBeNull();
    expect(da.toast).toHaveBeenCalledWith({ text: DRAG_CANCELLED_TOAST });
    fire('pointerup', 850, 400); // listeners are gone

    const b = setup();
    const db = deps(b.stackId);
    start(b.controller, db.d, () => true);
    fire('pointermove', 850, 400);
    await flush();
    fire('pointercancel');
    expect(b.controller.drag).toBeNull();
    expect(db.toast).not.toHaveBeenCalled();
  });

  it('a commit that throws still clears the drag and the lift, and rethrows', async () => {
    vi.stubGlobal('window', new ThrowingBus());
    const { controller, stackId } = setup();
    const { d, toast } = deps(stackId);
    start(controller, d, () => {
      throw new Error('boom');
    });
    fire('pointermove', 850, 400);
    await flush();
    expect(() => fire('pointerup', 850, 400)).toThrow('boom');
    expect(controller.drag).toBeNull();
    expect(controller.liftedPanelId).toBeNull();
    expect(toast).not.toHaveBeenCalled();
  });

  it('measuring that throws on release still clears the drag and the lift', async () => {
    vi.stubGlobal('window', new ThrowingBus());
    const { controller, stackId } = setup();
    let fail = false;
    const { d } = deps(stackId, {
      collect: () => {
        if (fail) throw new Error('measure');
        return geometryFor(stackId);
      }
    });
    start(controller, d, () => true);
    fire('pointermove', 850, 400);
    await flush();
    fail = true;
    expect(() => fire('pointerup', 850, 400)).toThrow('measure');
    expect(controller.drag).toBeNull();
    expect(controller.liftedPanelId).toBeNull();
  });

  it('aborts when the drag is cleared from outside (leaving edit mode): no publish, no drop', async () => {
    const { controller, stackId } = setup();
    const { d, toast } = deps(stackId);
    const commit = vi.fn(() => true as const);
    start(controller, d, commit);
    fire('pointermove', 850, 400);
    await flush();
    controller.toggleEditMode(); // clears drag + lift
    fire('pointermove', 860, 400);
    expect(controller.drag).toBeNull();
    fire('pointerup', 860, 400);
    expect(commit).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('a template drag does not lift, measures at once and restores a maximized panel', () => {
    const { controller, stackId } = setup();
    controller.setMaximizedPanel('grid');
    const { d, collect } = deps(stackId);
    start(controller, d, () => true, false);
    fire('pointermove', 850, 400);
    expect(controller.liftedPanelId).toBeNull();
    expect(controller.maximizedPanelId).toBeNull();
    expect(collect).toHaveBeenCalled();
  });

  it('a press that never moves is a tap (no drag, no commit)', () => {
    const { controller, stackId } = setup();
    const { d } = deps(stackId);
    const commit = vi.fn(() => true as const);
    const onTap = vi.fn();
    beginDockDropSession({ controller, event: down(), draggedPanelId: 'editor', panelLabel: 'x', lift: true, pages: false, onTap, commit }, d);
    fire('pointerup', 1, 1);
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
    expect(controller.liftedPanelId).toBeNull();
  });
});

describe('commitPanelTabDrop', () => {
  it('dispatches one panel.move, toasts a page drop, and reports a refused move', () => {
    const { controller, stackId } = setup();
    const toast = vi.fn();
    expect(commitPanelTabDrop(controller, 'editor', 'Block Editor', { kind: 'zone', stackId, targetPanelId: 'grid', region: 'main', zone: 'right', small: false }, toast)).toBe(true);
    expect(controller.canUndoLayout).toBe(true);
    expect(toast).not.toHaveBeenCalled();

    controller.addPage({ id: 'page.two', label: 'Two' });
    controller.activatePage(controller.pages[0].id);
    expect(commitPanelTabDrop(controller, 'editor', 'Block Editor', { kind: 'page', pageId: 'page.two', accepts: true }, toast)).toBe(true);
    expect(toast).toHaveBeenCalledWith({ text: 'Moved Block Editor to Two' });

    expect(commitPanelTabDrop(controller, 'grid', 'Signal Grid', { kind: 'page', pageId: 'page.nope', accepts: true }, toast)).toBe('refused');
    expect(controller.lastResult?.error?.code).toBe('missing-page');
    expect(commitPanelTabDrop(controller, 'grid', 'Signal Grid', { kind: 'page', pageId: 'page.two', accepts: false }, toast)).toBe(false);
  });
});
