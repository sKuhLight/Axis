/**
 * Click-to-place session — the DOM glue around the pure `placement.ts`.
 *
 * A card picked in the Add palette starts a session: every valid spot lights
 * up (`controller.placement`, drawn by PlacementLayer) and the pointer HOVERS
 * like a drag without a pressed button — the same target logic as a drag
 * (`dockDropTargetAt` + `buildDockDropOverlay` for panels, the widget zone
 * insert for widgets, navigation gaps for pages) publishes `controller.drag`
 * with `placement: true`, so DragLayer / WidgetZone preview exactly where it
 * lands. The click is the drop; Escape (or a click on nothing) cancels.
 *
 * Keyboard: Tab / Shift+Tab across the spots, arrows pick a stack zone / the
 * widget insert position / the neighbouring nav gap, Enter places.
 *
 * Listeners live on `window` in the CAPTURE phase so the press that places
 * never reaches the element under it (a tab, a widget, a nav entry). The edit
 * bar (and the bottom bar's Customize toggle) keep working: a press on them
 * ends the placement and goes through.
 *
 * A placement is a CLICK — press and release without moving: it commits on the
 * release, so a touch swipe that scrolls (or a mouse press that wanders off)
 * places nothing. The second press of a double-click on the card that started
 * the placement is ignored. The click / contextmenu the browser sends after a
 * placing press are swallowed until that click arrives (at most 400 ms, and
 * only near the press — the next real click elsewhere, e.g. Undo, goes through).
 */
import { tick } from 'svelte';
import { widgetZoneLabel } from '../core';
import type { WorkbenchController } from './controller.svelte';
import { DRAG_THRESHOLD, pointerDistance, type InsertLine, type WorkbenchPointer, type WorkbenchRect } from './drag';
import { dockDropTargetAt, landingRect, type DockDropGeometry, type DockDropTarget } from './dockDropTarget';
import { buildDockDropOverlay } from './dockDropOverlay';
import { measureZoneUnits, resolveWidgetDrop, zoneInsertLine, zoneUnitEls } from './libraryDrag';
import { collectDockDropGeometry, type DockDropCommitResult } from './panelDrag';
import {
  PLACEMENT_CANCELLED_TOAST,
  applyPlacementKey,
  navGapAt,
  navOrientation,
  navPlacementSpots,
  panelPlacementSpots,
  placementKeyAction,
  rectCenter,
  spotDockTarget,
  spotIdForDockTarget,
  widgetPlacementSpots,
  type PlacementKind,
  type PlacementSpot,
  type WorkbenchPlacementState
} from './placement';
import { enqueueToast } from './toasts';
import { zoneWidgetOrderIndex } from './widgetDrop';

/** A panel / widget id no live item holds: the thing being placed does not exist yet. */
const PLACEMENT_SENTINEL = '__aw-place__';

/** Presses here go through (and end the placement): the edit bar, menus, toasts, the Customize toggle. */
export const PLACEMENT_PASS_THROUGH = '[data-editbar], .aw-context-menu, .aw-toasts, .aw-bottom-customize';
/** A press that moves further than this (px) before its release is a gesture (a scroll), not a click. */
const PRESS_SLOP_PX: Record<string, number> = { mouse: DRAG_THRESHOLD, pen: 8, touch: 12 };
/** The second press of a double-click on the picked card: within this long … */
const PICK_ECHO_MS = 300;
/** … and this close (px) to the pick. */
const PICK_ECHO_PX = 6;
/** The browser's click after a placing press is swallowed for at most this long … */
const CLICK_GUARD_MS = 400;
/** … and only this close (px) to the press (a synthesized touch click may be a little off). */
const CLICK_GUARD_SLOP_PX = 16;

/** How a session ended: placed (or refused), cancelled, or ended from outside (an edit-bar press, leaving edit mode). */
export type PlacementEndReason = 'commit' | 'cancel' | 'pass';

export interface PlacementSessionOptions {
  controller: WorkbenchController;
  kind: PlacementKind;
  /** What is placed (status line, landing label). */
  label: string;
  /** Pointer position of the pick (mouse / touch); absent = keyboard pick: the first spot is focused. */
  pointer?: WorkbenchPointer | null;
  /** Widget insert slot size. */
  size?: { width: number; height: number };
  commitPanel?: (target: DockDropTarget) => DockDropCommitResult;
  /** `index` is the WIDGET-order index in the zone (all its current widgets counted). */
  commitWidget?: (drop: { zone: string; index: number }) => DockDropCommitResult;
  /**
   * The navigation gap by its on-screen neighbours (`before`: the entry right
   * after it, `after`: the one right before it); null = the end.
   */
  commitPage?: (gap: { before?: string; after?: string } | null) => DockDropCommitResult;
  /** The session ended (its state already cleared). */
  onEnd?: (reason: PlacementEndReason) => void;
  /** Clock (ms; tests). */
  now?: () => number;
}

function rectOf(el: Element): WorkbenchRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function onScreen(rect: WorkbenchRect): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.left + rect.width > 0 &&
    rect.top + rect.height > 0 &&
    rect.left < window.innerWidth &&
    rect.top < window.innerHeight
  );
}

function intersects(a: WorkbenchRect, b: WorkbenchRect): boolean {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}

interface Measured {
  spots: PlacementSpot[];
  geometry?: DockDropGeometry | null;
  nav?: WorkbenchRect | null;
}

/** The visible widget zones (floating / hidden excluded) with their unit counts. */
function measureWidgetZones(controller: WorkbenchController): PlacementSpot[] {
  const layout = controller.activeLayout;
  const zones = Array.from(document.querySelectorAll<HTMLElement>('.aw-root [data-zone]'))
    .filter((el) => {
      const zone = el.dataset.zone;
      return !!zone && zone !== 'floating' && zone !== 'hidden' && onScreen(rectOf(el));
    })
    .map((el) => ({ zone: el.dataset.zone!, rect: rectOf(el), units: zoneUnitEls(el).length, label: widgetZoneLabel(layout, el.dataset.zone!) }));
  return widgetPlacementSpots(zones);
}

/**
 * The visible navigation (rail or bottom bar) and its gap spots: the entries on
 * screen (inside the viewport and the navigation's own box — scrolled-away ones
 * are left out) with their ids; the orientation follows the measured layout.
 */
function measureNav(): { spots: PlacementSpot[]; nav: WorkbenchRect | null } {
  const navEl = Array.from(document.querySelectorAll<HTMLElement>('.aw-root [data-aw-nav]')).find((el) => onScreen(rectOf(el)));
  if (!navEl) return { spots: [], nav: null };
  const nav = rectOf(navEl);
  const entries = Array.from(navEl.querySelectorAll<HTMLElement>('[data-nav-entry]'))
    .map((el) => ({ id: el.dataset.navEntry ?? '', rect: rectOf(el) }))
    .filter((entry) => !!entry.id && onScreen(entry.rect) && intersects(entry.rect, nav));
  const orientation = navOrientation(
    entries.map((entry) => entry.rect),
    nav
  );
  return { spots: navPlacementSpots(entries, nav, orientation), nav };
}

/** Swallow an event: nothing under it (or after this listener) reacts. */
function swallow(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * Swallow what the browser sends after a press the placement consumed — its
 * pointerup (`pointerId`), the compat mouseup, the click / dblclick /
 * contextmenu — but only near the press, never on the pass-through chrome, and
 * only until the `releaseOn` event arrived or CLICK_GUARD_MS passed. It lives
 * past the session: the click comes after the placement ended.
 */
function guardFollowUps(at: WorkbenchPointer, options: { pointerId?: number; releaseOn?: 'click' | 'dblclick' } = {}): void {
  const types = ['pointerup', 'mouseup', 'click', 'dblclick', 'contextmenu'] as const;
  const releaseOn = options.releaseOn ?? 'click';
  let timer: ReturnType<typeof setTimeout> | null = null;
  const release = () => {
    if (timer != null) clearTimeout(timer);
    timer = null;
    for (const type of types) window.removeEventListener(type, onEvent, true);
  };
  function onEvent(event: Event) {
    if (event.type === 'pointerup') {
      if (options.pointerId != null && (event as PointerEvent).pointerId === options.pointerId) swallow(event);
      return;
    }
    const target = event.target as Element | null;
    if (target?.closest?.(PLACEMENT_PASS_THROUGH)) return;
    const mouse = event as MouseEvent;
    if (Number.isFinite(mouse.clientX) && pointerDistance({ x: mouse.clientX, y: mouse.clientY }, at) > CLICK_GUARD_SLOP_PX) return;
    swallow(event);
    if (event.type === releaseOn) release();
  }
  for (const type of types) window.addEventListener(type, onEvent, true);
  timer = setTimeout(release, CLICK_GUARD_MS);
}

/**
 * Begin click-to-place. Returns a function that ends the session (no toast).
 */
export function beginPlacement(options: PlacementSessionOptions): () => void {
  const { controller, kind, label } = options;
  const now = options.now ?? (() => performance.now());
  let state: WorkbenchPlacementState = { kind, label, spots: [], activeSpotId: null, zone: 'center', insert: null };
  let pointer: WorkbenchPointer | null = options.pointer ?? null;
  let mode: 'pointer' | 'keyboard' = pointer ? 'pointer' : 'keyboard';
  let active = true;
  let measured: Measured = { spots: [] };
  /** The pick (a click on the card): a second press right there is the double-click's, not a placement. */
  const picked = options.pointer ? { ...options.pointer, at: now() } : null;
  /** The press in progress (placement commits on its release, unless it moved). */
  let press: { id: number; at: WorkbenchPointer; slop: number; moved: boolean } | null = null;

  const measure = (): Measured => {
    if (kind === 'panel') {
      const geometry = collectDockDropGeometry(controller, { pages: false });
      return { spots: geometry ? panelPlacementSpots(geometry) : [], geometry };
    }
    if (kind === 'widget') return { spots: measureWidgetZones(controller) };
    return measureNav();
  };

  const activeSpot = (): PlacementSpot | undefined => measured.spots.find((spot) => spot.id === state.activeSpotId);

  /** The panel target: under the pointer, or the keyboard spot + zone. */
  const panelTarget = (at: WorkbenchPointer | null): DockDropTarget | null => {
    const geometry = measured.geometry;
    if (!geometry) return null;
    if (at) return dockDropTargetAt(at, geometry, PLACEMENT_SENTINEL, { pages: false });
    const spot = activeSpot();
    return spot ? spotDockTarget(spot, state.zone) : null;
  };

  /** The widget drop: under the pointer, or the keyboard spot + insert. */
  const widgetDrop = (at: WorkbenchPointer | null): { zone: string; unitIndex: number; widgetIndex: number; line: InsertLine | null } | null => {
    if (at) return resolveWidgetDrop(controller, at.x, at.y);
    const spot = activeSpot();
    if (!spot?.zone) return null;
    const unitIndex = Math.max(0, Math.min(spot.units ?? 0, state.insert ?? spot.units ?? 0));
    const zoneEl = document.querySelector<HTMLElement>(`.aw-root [data-zone="${CSS.escape(spot.zone)}"]`);
    const units = zoneEl ? measureZoneUnits(zoneEl) : null;
    const line = zoneEl && units ? zoneInsertLine(zoneEl, spot.zone, units, unitIndex) : null;
    const widgetIndex = zoneWidgetOrderIndex(controller.document, spot.zone, unitIndex, units ? { units } : {});
    return { zone: spot.zone, unitIndex, widgetIndex, line };
  };

  /** The navigation gap: nearest to the pointer, or the keyboard spot. */
  const navGap = (at: WorkbenchPointer | null): PlacementSpot | null => {
    if (at) return measured.nav ? navGapAt(measured.spots, measured.nav, at) : null;
    return activeSpot() ?? null;
  };

  const publish = () => {
    if (!active) return;
    measured = measure();
    state = { ...state, spots: measured.spots };
    const at = mode === 'pointer' ? pointer : null;
    if (mode === 'keyboard' && state.activeSpotId && !activeSpot()) state = { ...state, activeSpotId: null };

    if (kind === 'panel') {
      const target = panelTarget(at);
      // The pointer picks the stack zone too (label + status line say what lands).
      if (at) state = { ...state, activeSpotId: spotIdForDockTarget(target), zone: target?.kind === 'zone' ? target.zone : 'center' };
      const geometry = measured.geometry;
      const land = target && geometry ? landingRect(target, geometry) : null;
      const cardAt = at ?? (land ? rectCenter(land) : null);
      if (geometry && cardAt) {
        const dock = buildDockDropOverlay({
          pointer: cardAt,
          geometry,
          target,
          panelLabel: label,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          action: 'click'
        });
        controller.setDrag({ kind: 'panel', panelId: PLACEMENT_SENTINEL, startedAt: cardAt, pointer: cardAt, panelLabel: label, targetLabel: dock.card.hint, dock, placement: true });
      } else if (controller.drag) {
        controller.setDrag(null);
      }
    } else if (kind === 'widget') {
      const drop = widgetDrop(at);
      if (at) state = { ...state, activeSpotId: drop ? `zone:${drop.zone}` : null, insert: drop ? drop.unitIndex : null };
      const spot = activeSpot();
      const where = at ?? (spot ? rectCenter(spot.rect) : { x: -1000, y: -1000 });
      controller.setDrag({
        kind: 'widget',
        widgetIds: [PLACEMENT_SENTINEL],
        startedAt: where,
        pointer: where,
        size: options.size ?? { width: 120, height: 38 },
        targetLabel: drop ? widgetZoneLabel(controller.activeLayout, drop.zone) : undefined,
        zoneInsert: drop ? { zone: drop.zone, index: drop.unitIndex } : undefined,
        insertLine: drop?.line ?? undefined,
        placement: true
      });
    } else if (at) {
      state = { ...state, activeSpotId: navGap(at)?.id ?? null };
    }
    controller.setPlacement(state);
  };

  /** Place at the pointer (a click) or on the keyboard spot. */
  const commit = (at: WorkbenchPointer | null): DockDropCommitResult => {
    if (kind === 'panel') {
      const target = panelTarget(at);
      return target && options.commitPanel ? options.commitPanel(target) : false;
    }
    if (kind === 'widget') {
      const drop = widgetDrop(at);
      return drop && options.commitWidget ? options.commitWidget({ zone: drop.zone, index: drop.widgetIndex }) : false;
    }
    const gap = navGap(at);
    return gap && options.commitPage ? options.commitPage({ before: gap.navBefore, after: gap.navAfter }) : false;
  };

  const end = (reason: PlacementEndReason, toastCancelled = false) => {
    if (!active) return;
    active = false;
    teardown();
    if (controller.drag) controller.setDrag(null);
    if (controller.placement) controller.setPlacement(null);
    if (toastCancelled) enqueueToast({ text: PLACEMENT_CANCELLED_TOAST });
    options.onEnd?.(reason);
  };

  /** Measure afresh, place, end: a refusal still ends it (the bar shows the error); nothing placed = cancelled. */
  const place = (at: WorkbenchPointer | null) => {
    measured = measure();
    state = { ...state, spots: measured.spots };
    let outcome: DockDropCommitResult = false;
    try {
      outcome = commit(at);
    } finally {
      end(outcome === false ? 'cancel' : 'commit', outcome === false);
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY };
    mode = 'pointer';
    if (press && event.pointerId === press.id && !press.moved && pointerDistance(pointer, press.at) > press.slop) press.moved = true;
    publish();
  };

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as Element | null;
    // The edit bar (Undo, Done, Add …), menus, toasts and the Customize toggle keep working; placing ends.
    if (target?.closest?.(PLACEMENT_PASS_THROUGH)) {
      end('pass');
      return;
    }
    swallow(event);
    const at = { x: event.clientX, y: event.clientY };
    // The second press of a double-click on the card: not a placement.
    if (picked && now() - picked.at < PICK_ECHO_MS && pointerDistance(at, picked) <= PICK_ECHO_PX) {
      guardFollowUps(at, { pointerId: event.pointerId, releaseOn: 'dblclick' });
      return;
    }
    if (event.button !== 0) {
      guardFollowUps(at, { pointerId: event.pointerId });
      end('cancel', true);
      return;
    }
    press = { id: event.pointerId, at, slop: PRESS_SLOP_PX[event.pointerType] ?? DRAG_THRESHOLD, moved: false };
    pointer = at;
    mode = 'pointer';
    publish();
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!press || event.pointerId !== press.id) return;
    swallow(event);
    const done = press;
    press = null;
    // A press that travelled is a scroll / drag gesture, not a click: keep placing.
    if (done.moved) return;
    const at = { x: event.clientX, y: event.clientY };
    guardFollowUps(at);
    pointer = at;
    mode = 'pointer';
    place(at);
  };

  // The browser took the gesture (a touch scroll): that press places nothing.
  const onPointerCancel = (event: PointerEvent) => {
    if (press && event.pointerId === press.id) press = null;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const action = placementKeyAction(state, event.key, event.shiftKey);
    if (!action) return;
    // Consumed in the capture phase: no other Escape / Enter handler (the app's
    // Escape chain, a focused control) sees the key.
    swallow(event);
    if (action.type === 'cancel') {
      end('cancel', true);
      return;
    }
    if (action.type === 'commit') {
      place(null);
      return;
    }
    state = applyPlacementKey(state, action);
    mode = 'keyboard';
    publish();
  };

  const onResize = () => publish();

  // Leaving edit mode (or anything else clearing the placement) ends the session.
  let started = false;
  const unsubscribe = controller.subscribe((c) => {
    if (!active || !started) return;
    if (!c.editMode || !c.placement) end('pass');
  });

  function teardown() {
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('pointerdown', onPointerDown, true);
    window.removeEventListener('pointerup', onPointerUp, true);
    window.removeEventListener('pointercancel', onPointerCancel, true);
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', onResize);
    unsubscribe();
  }

  window.addEventListener('pointermove', onPointerMove, true);
  window.addEventListener('pointerdown', onPointerDown, true);
  window.addEventListener('pointerup', onPointerUp, true);
  window.addEventListener('pointercancel', onPointerCancel, true);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', onResize);

  // A maximized panel covers the dock: restore it so every spot is reachable.
  if (kind === 'panel' && controller.maximizedPanelId) controller.setMaximizedPanel(null);
  controller.setPlacement(state);
  started = true;

  // Measure once the palette is gone from the DOM.
  void tick().then(() => {
    if (!active) return;
    measured = measure();
    if (kind === 'page' && !measured.spots.length) {
      // No navigation on screen (e.g. the phone sheet is closed): place at the end.
      let outcome: DockDropCommitResult = false;
      try {
        outcome = options.commitPage ? options.commitPage(null) : false;
      } finally {
        end(outcome === false ? 'cancel' : 'commit', outcome === false);
      }
      return;
    }
    state = { ...state, spots: measured.spots };
    if (mode === 'keyboard' && measured.spots.length) {
      const first = measured.spots[0];
      state = { ...state, activeSpotId: first.id, zone: 'center', insert: first.kind === 'zone' ? (first.units ?? 0) : null };
    }
    publish();
  });

  return () => end('pass');
}
