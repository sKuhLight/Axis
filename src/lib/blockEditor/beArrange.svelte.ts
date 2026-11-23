// Block Editor Arrange: the selection, the pointer gestures (move a tile — also onto another page of the
// strip —, resize it at its corner, drag a control out of the "Add" library) with their teal / red drop
// preview, the keyboard (arrows / Shift+arrows / Delete / Ctrl/⌘+Z / Escape) and the arrange operations —
// also the control menu's View / Size / Move / Remove, in both modes.
//
// Every change runs on the drawn items only (a kept, not drawn control blocks nothing), goes through
// BeState.commit (one save; one undo step while arranging), is Auto-packed when that is on, and keeps the
// active page where it is on screen. Held arrow keys are ONE step: the repeats are previewed and saved
// once when the key is released. The decisions are pure (arrangeModel.ts); this class only does the DOM:
// hit-testing grids under the pointer, window listeners, focus. Created by BeSurface during its
// initialisation; `attach()` installs the listeners (BeSurface calls it from an effect while arranging).

import { effectiveZoom } from '../workbench';
import {
  addDivider,
  addPage as addPageOp,
  closeGaps,
  deletePage,
  duplicatePage,
  locate,
  MAXC,
  movePage,
  moveItem,
  moveToPage,
  removeItem,
  renamePage as renamePageOp,
  resizeItem,
  rotateDivider,
  setDividerLabel,
  setView,
  sizeItem,
  tidy,
  isDivider,
  type BeBoard,
  type BeDividerKind,
  type BeItem,
  type BeOpResult,
  type BeView
} from './boardModel';
import { dropCell, DRAG_START_PX, grabCell, onDrawnItems, resizeBy } from './boardView';
import {
  aimedAtEditor,
  arrangeEscape,
  arrangeKeyAction,
  DIVIDER_NAME,
  growItem,
  isForeignOverlay,
  keepSelection,
  libraryAdd,
  libraryGrab,
  nudgeItem,
  onPage,
  tidyPages,
  UNDO_KEYS
} from './arrangeModel';
import { pageToShowAfterUndo } from './arrangeHistory';
import { ESCAPE_OVERLAYS, isEditableTarget } from './controlMenuInput';
import { itemIdOn } from './findControls';
import type { BeGhost } from './beHost';
import type { BeState } from './beState.svelte';
import type { BeCtl } from './catalog';

export type ArrangeTone = 'ok' | 'info' | 'bad';

/** What the arrange controller needs from the surface around it. */
export interface ArrangeEnv {
  be: BeState;
  /** The editor's root element (grids are hit-tested inside it only). */
  root(): HTMLElement | null;
  /** The editor's floating layer (its menus and the "Add" library live there, outside the root). */
  layer(): HTMLElement | null;
  /** Items drawn right now (dividers, and controls whose key the catalog lists). */
  isDrawn(it: BeItem): boolean;
  ctl(key: string): BeCtl | undefined;
  /** Scroll the board a little while a drag nears its edge. */
  autoScroll(x: number, y: number): void;
  /** Keep the active page where it is on screen across the change that follows. */
  holdPage(): void;
  /** Bring a page into view (it became the current page). */
  showPage(page: string): void;
  /** Make a page the current one without scrolling (a tile on it was selected). */
  setPage(page: string): void;
  /** Give the board the keyboard focus (arrows / Delete then reach Arrange). */
  focusBoard(): void;
  /** Scroll an item of the board into view. */
  reveal(id: string): void;
  toast(text: string, tone: ArrangeTone): void;
  /** Leave Arrange (Escape). */
  leave(): void;
}

type MoveGesture = { kind: 'move'; id: string; fromPage: string; w: number; h: number; grab: { cx: number; cy: number }; sx: number; sy: number; started: boolean };
type LibGesture = { kind: 'lib'; key: string; view: BeView; w: number; h: number; grab: { cx: number; cy: number }; sx: number; sy: number; started: boolean };
type ResizeGesture = { id: string; sx: number; sy: number; ow: number; oh: number; step: number; z: number; before: BeBoard; changed: boolean };
/** A held arrow key: the board before its first press, the board its last repeat showed. */
type KeyStep = { key: string; before: BeBoard; shown: BeBoard; timer: ReturnType<typeof setTimeout> | null };

const OK_TONE = 'ok';
/** A held key's step closes at its release; this is the fallback when the release never arrives (focus
 *  left the window) — longer than the keyboard's delay before it starts repeating. */
const KEY_STEP_IDLE_MS = 1200;

export class BeArrange {
  /** The selected item (its tools are in the arrange bar). */
  sel = $state<string | null>(null);
  /** A running drag: the moved item (null for a library drag) and its drop preview. */
  drag = $state<{ id: string | null; target: BeGhost | null } | null>(null);
  /** The "Add" library is open. */
  libOpen = $state(false);
  /** Bumped when the bar's divider label field should take the focus (a divider was just added). */
  labelFocus = $state(0);
  /** The item being resized at its corner (its w×h shows meanwhile). */
  resizing = $state<string | null>(null);

  #env: ArrangeEnv;
  #g: MoveGesture | LibGesture | null = null;
  #rz: ResizeGesture | null = null;
  #key: KeyStep | null = null;
  /** The pointer that owns the running drag / resize: another finger's moves, release and cancel never
   *  reach it, and its presses start nothing meanwhile. */
  #pid: number | null = null;

  constructor(env: ArrangeEnv) {
    this.#env = env;
  }

  /** A drag or resize is running (the frozen cell stays meanwhile; undo waits). */
  get busy(): boolean {
    return !!this.#g?.started || !!this.#rz;
  }

  /** Back to a fresh state (entering / leaving Arrange, another block). */
  reset(): void {
    this.cancel();
    this.#endKeyStep();
    this.sel = null;
    this.libOpen = false;
  }

  select(id: string | null): void {
    this.sel = id;
  }

  // ── operations ─────────────────────────────────────────────────────────────────────────────────

  /** Commit a result computed on the drawn items: Auto-pack the given pages, one save (+ one undo step
   *  while arranging), the active page kept in place. True when the board changed. */
  commit(r: BeOpResult, tidyOn: readonly string[] = []): boolean {
    this.#endKeyStep();
    const be = this.#env.be;
    const b = be.board;
    if (!r.ok || !b || r.board === b) return false;
    this.#env.holdPage();
    be.commit(be.autoPack && tidyOn.length ? this.#tidy(r.board, tidyOn) : r.board);
    this.sel = keepSelection(be.board, this.sel);
    return true;
  }

  /** Run an item operation on the drawn items and commit it. */
  run<R extends BeOpResult>(op: (d: BeBoard) => R, tidyOn: readonly string[] = []): R | null {
    const b = this.#env.be.board;
    if (!b) return null;
    const r = this.#drawn(b, op);
    this.commit(r, tidyOn);
    return r;
  }

  #drawn<R extends { board: BeBoard; ok: boolean }>(b: BeBoard, op: (d: BeBoard) => R): R {
    return onDrawnItems(b, this.#env.isDrawn, op);
  }
  #tidy(b: BeBoard, pages: readonly string[]): BeBoard {
    return this.#drawn(b, (d) => ({ board: tidyPages(d, pages), ok: true })).board;
  }
  #name(it: BeItem): string {
    return isDivider(it) ? DIVIDER_NAME[it.kind] : (this.#env.ctl(it.key)?.label ?? it.key);
  }
  #page(): string {
    return this.#env.be.board?.page ?? '';
  }

  /** Remove an item (the selection by default) — the bar, Delete / Backspace and the control menu. */
  remove(id: string | null = this.sel): void {
    const b = this.#env.be.board;
    const f = b && id ? locate(b, id) : null;
    if (!f || !id) return;
    const name = this.#name(f.item);
    if (!this.run((d) => removeItem(d, id))?.ok) return;
    if (this.sel === id) this.sel = null;
    // outside Arrange there is no undo (the editor's undo lives in Arrange): the toast says how to get it back
    const back = this.#env.be.editMode ? `${UNDO_KEYS} brings it back` : 'Arrange → Add brings it back';
    this.#env.toast(`Removed ${name} from ${f.page} — ${back}`, 'info');
  }

  view(v: BeView, id: string | null = this.sel): void {
    if (!id) return;
    const r = this.run((d) => setView(d, id, v));
    if (r?.ok && r.moved) this.#env.toast('Moved to the next free spot to fit', 'info');
  }

  size(w: number, h: number, id: string | null = this.sel): void {
    const b = this.#env.be.board;
    const f = b && id ? locate(b, id) : null;
    if (!f || !id) return;
    const r = this.run((d) => sizeItem(d, id, w, h), [f.page]);
    if (r?.ok && r.moved) this.#env.toast('Moved to the nearest free spot to fit', 'info');
  }

  /** The control menu's "Move to page ▸": the first free spot of the other page (a page that already holds
   *  the control refuses it). */
  moveTo(id: string, page: string): void {
    const b = this.#env.be.board;
    const f = b ? locate(b, id) : null;
    if (!f) return;
    const r = this.run((d) => moveToPage(d, id, page), [f.page, page]);
    const name = this.#name(f.item);
    if (r?.ok && r.board !== b) this.#env.toast(`Moved ${name} to ${page}`, 'ok');
    else if (r?.reason === 'duplicate') this.#env.toast(`${name} is already on ${page}`, 'bad');
  }

  /** Set a divider's label (an empty text clears it) — the divider the field was opened for. */
  label(id: string, text: string): boolean {
    if (!id) return false;
    this.run((d) => setDividerLabel(d, id, text));
    return true;
  }

  rotate(): void {
    const id = this.sel;
    if (!id) return;
    const r = this.run((d) => rotateDivider(d, id));
    if (r && !r.ok) this.#env.toast('Not enough room to rotate it here', 'bad');
  }

  /** "+ Divider": a divider at the first free spot of the current page, selected, its label field focused. */
  addDivider(kind: BeDividerKind): void {
    const page = this.#page();
    if (!page) return;
    const r = this.run((d) => addDivider(d, page, kind), [page]);
    if (!r?.ok || !r.id) return;
    this.sel = r.id;
    this.labelFocus++;
    this.#reveal(r.id);
  }

  /** Add a control from the library to the current page: at `at` (a drop) or the first free spot (a
   *  click). A control already there is pointed at instead. The board takes the keys afterwards (arrows /
   *  Delete reach the new selection). */
  add(key: string, at: { x: number; y: number } | null = null, page: string = this.#page()): boolean {
    const c = this.#env.ctl(key);
    const b = this.#env.be.board;
    if (!c || !b || !page) return false;
    const r = this.run((d) => libraryAdd(d, page, { key, view: c.view }, at), [page]);
    if (!r) return false;
    if (!r.ok) {
      if (r.reason === 'duplicate') {
        const there = itemIdOn(b, page, key);
        if (there) {
          this.sel = there;
          this.#reveal(there);
          this.#env.focusBoard();
        }
        this.#env.toast(`${c.label} is already on ${page}`, 'info');
      } else this.#env.toast('No room for that control there', 'bad');
      return false;
    }
    if (r.id) {
      this.sel = r.id;
      this.#reveal(r.id);
    }
    this.#env.focusBoard();
    this.#env.toast(`Added ${c.label} to ${page}`, OK_TONE);
    return true;
  }

  closeGaps(): void {
    const page = this.#page();
    const before = this.#env.be.board;
    if (!page || !before) return;
    this.run((d) => onPage(d, page, closeGaps));
    const changed = this.#env.be.board !== before;
    this.#env.toast(changed ? `Closed the gaps on ${page}` : `No gaps on ${page}`, changed ? OK_TONE : 'info');
  }

  tidyUp(): void {
    const page = this.#page();
    const before = this.#env.be.board;
    if (!page || !before) return;
    this.run((d) => onPage(d, page, tidy));
    const changed = this.#env.be.board !== before;
    this.#env.toast(changed ? `Tidied ${page}` : `${page} is already tidy`, changed ? OK_TONE : 'info');
  }

  /** Undo the last arrange step (saved once). A no-op while a drag or resize runs (it would change the
   *  board under the gesture). When the page the user was on goes away with it (an undone "Add page" /
   *  "Duplicate"), the restored current page comes into view. */
  undo(): void {
    if (this.busy) return;
    this.#endKeyStep();
    const be = this.#env.be;
    if (!be.canUndo) return;
    const was = be.board?.page ?? '';
    this.#env.holdPage();
    be.undo();
    this.sel = keepSelection(be.board, this.sel);
    const show = pageToShowAfterUndo(was, be.board);
    if (show) this.#env.showPage(show);
  }

  // ── pages (the whole board: kept, not drawn controls go along with their page) ──────────────────

  #commitPage(next: BeBoard, show: string | null): void {
    this.#endKeyStep();
    const be = this.#env.be;
    if (next === be.board) return;
    be.commit(next);
    this.sel = keepSelection(be.board, this.sel);
    if (show) this.#env.showPage(show);
  }

  renamePage(from: string, to: string): boolean {
    const b = this.#env.be.board;
    if (!b) return false;
    const r = renamePageOp(b, from, to);
    if (r.ok) {
      this.#commitPage(r.board, null);
      return true;
    }
    if (r.reason === 'duplicate') this.#env.toast(`A page called “${to.trim()}” already exists`, 'bad');
    else if (r.reason === 'invalid') this.#env.toast('A page needs a name', 'bad');
    return false;
  }

  duplicatePage(page: string = this.#page()): void {
    const b = this.#env.be.board;
    if (!b) return;
    const r = duplicatePage(b, page);
    if (!r.page) return;
    this.#commitPage(r.board, r.page);
    this.#env.toast(`Duplicated “${page}”`, OK_TONE);
  }

  movePage(delta: -1 | 1, page: string = this.#page()): void {
    const b = this.#env.be.board;
    if (!b) return;
    this.#commitPage(movePage(b, page, delta), page);
  }

  deletePage(page: string = this.#page()): void {
    const b = this.#env.be.board;
    if (!b) return;
    const r = deletePage(b, page);
    if (!r.ok) {
      if (r.reason === 'last-page') this.#env.toast('The last page stays', 'bad');
      return;
    }
    this.#commitPage(r.board, r.board.page);
    this.#env.toast(`Deleted page “${page}”`, 'info');
  }

  addPage(): void {
    const b = this.#env.be.board;
    if (!b) return;
    const r = addPageOp(b);
    this.#commitPage(r.board, r.page);
  }

  // ── gestures ───────────────────────────────────────────────────────────────────────────────────

  /** Select an item; a tile on another page of the strip makes that page the current one, so the page
   *  tools (Page ▾, Close gaps, Tidy up, + Divider, the library) act where the selection is. */
  #pick(id: string, page: string): void {
    this.sel = id;
    if (page && page !== this.#page()) this.#env.setPage(page);
    this.#env.focusBoard();
  }

  /** Another pointer owns a running gesture. */
  #otherPointer(e: PointerEvent): boolean {
    return (!!this.#g || !!this.#rz) && this.#pid != null && e.pointerId !== this.#pid;
  }

  /** Press on a tile: select it and arm a move. */
  tileDown(e: PointerEvent, item: BeItem, page: string, tile: HTMLElement): void {
    if (!page || e.button !== 0 || this.#otherPointer(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const grid = tile.closest<HTMLElement>('[data-be-grid]');
    if (!grid) return;
    this.#endKeyStep();
    this.#pick(item.id, page);
    const c = Number(grid.dataset.c);
    const g = Number(grid.dataset.g);
    const gr = grid.getBoundingClientRect();
    const z = effectiveZoom(gr.width, grid.offsetWidth);
    this.#g = { kind: 'move', id: item.id, fromPage: page, w: item.w, h: item.h, grab: grabCell(e.clientX, e.clientY, tile.getBoundingClientRect(), z, c + g, item), sx: e.clientX, sy: e.clientY, started: false };
    this.#pid = e.pointerId;
  }

  /** Press on the corner handle of a tile: resize it. */
  resizeDown(e: PointerEvent, id: string, tile: HTMLElement): void {
    if (e.button !== 0 || this.#otherPointer(e)) return;
    this.#endKeyStep();
    const be = this.#env.be;
    const f = be.board ? locate(be.board, id) : null;
    const grid = tile.closest<HTMLElement>('[data-be-grid]');
    if (!f || !grid) return;
    e.preventDefault();
    e.stopPropagation();
    this.#pick(id, f.page);
    const b = be.board;
    if (!b) return;
    const r = grid.getBoundingClientRect();
    this.#rz = { id, sx: e.clientX, sy: e.clientY, ow: f.item.w, oh: f.item.h, step: Number(grid.dataset.c) + Number(grid.dataset.g), z: effectiveZoom(r.width, grid.offsetWidth), before: b, changed: false };
    this.#pid = e.pointerId;
    this.resizing = id;
  }

  /** Press on a library row: a drag past the threshold places the control at an exact spot (the click
   *  that follows a drag is swallowed; a plain click adds at the first free spot). */
  libPress(e: PointerEvent, key: string): void {
    const c = this.#env.ctl(key);
    if (!c || e.button !== 0 || this.#otherPointer(e)) return;
    this.#endKeyStep();
    this.#g = { kind: 'lib', key, view: c.view, w: c.w, h: c.h, grab: libraryGrab(c.w, c.h), sx: e.clientX, sy: e.clientY, started: false };
    this.#pid = e.pointerId;
  }

  /** The drop preview under the pointer: the grid of the editor below it, the cell, and whether the drop
   *  is allowed (inside the page, no collision, not a second copy of a control on a page). */
  #target(px: number, py: number): BeGhost | null {
    const m = this.#g;
    const b = this.#env.be.board;
    const root = this.#env.root();
    if (!m || !b || !root || typeof document === 'undefined') return null;
    let grid: HTMLElement | null = null;
    for (const el of document.elementsFromPoint(px, py)) {
      const g = el.closest<HTMLElement>('[data-be-grid]');
      if (g && root.contains(g)) {
        grid = g;
        break;
      }
    }
    if (!grid) return null;
    const d = grid.dataset;
    const page = d.page ?? '';
    const r = grid.getBoundingClientRect();
    const hit = { left: r.left, top: r.top, zoom: effectiveZoom(r.width, grid.offsetWidth), c: Number(d.c), g: Number(d.g), cols: Number(d.cols), rows: Number(d.rows) };
    const { x, y } = dropCell(px, py, hit, m, m.grab);
    const valid =
      m.kind === 'move'
        ? this.#drawn(b, (dd) => moveItem(dd, m.id, page, x, y)).ok
        : this.#drawn(b, (dd) => libraryAdd(dd, page, { key: m.key, view: m.view }, { x, y }, () => '~probe')).ok;
    return { page, x, y, w: m.w, h: m.h, valid };
  }

  #onMove = (e: PointerEvent): void => {
    if (this.#pid != null && e.pointerId !== this.#pid) return; // another finger
    const m = this.#g;
    if (m) {
      if (!m.started) {
        if (Math.abs(e.clientX - m.sx) + Math.abs(e.clientY - m.sy) < DRAG_START_PX) return;
        m.started = true;
      }
      e.preventDefault();
      this.drag = { id: m.kind === 'move' ? m.id : null, target: this.#target(e.clientX, e.clientY) };
      this.#env.autoScroll(e.clientX, e.clientY);
      return;
    }
    const rz = this.#rz;
    if (rz) {
      e.preventDefault();
      const be = this.#env.be;
      const b = be.board;
      const f = b && locate(b, rz.id);
      if (!b || !f) return;
      const s = resizeBy({ w: rz.ow, h: rz.oh }, e.clientX - rz.sx, e.clientY - rz.sy, rz.step, rz.z);
      const id = rz.id;
      const r = this.#drawn(b, (d) => resizeItem(d, id, Math.min(s.w, MAXC - f.item.x), s.h));
      if (r.ok && r.board !== b) {
        be.preview(r.board);
        rz.changed = true;
      }
    }
  };

  #onUp = (e: PointerEvent): void => {
    if (this.#pid != null && e.pointerId !== this.#pid) return; // another finger lifted: the gesture goes on
    this.#pid = null;
    const m = this.#g;
    if (m) {
      const t = this.drag?.target ?? null;
      this.#g = null;
      this.drag = null;
      if (m.started) {
        if (m.kind === 'lib') suppressNextClick();
        if (t?.valid) {
          if (m.kind === 'move') {
            const id = m.id;
            this.run((d) => moveItem(d, id, t.page, t.x, t.y), [m.fromPage, t.page]);
          } else this.add(m.key, { x: t.x, y: t.y }, t.page);
        }
      }
    }
    const rz = this.#rz;
    if (rz) {
      this.#rz = null;
      this.resizing = null;
      const be = this.#env.be;
      const b = be.board;
      if (rz.changed && b) {
        const f = locate(b, rz.id);
        const next = be.autoPack && f ? this.#tidy(b, [f.page]) : b;
        if (next !== b) {
          // the preview is what the gesture showed; the tidy is the step to commit (undo goes to `before`)
          be.preview(rz.before);
          this.#env.holdPage();
          be.commit(next);
        } else be.flush(rz.before);
      }
    }
  };

  /** Stop every pointer gesture (pointercancel, Escape, a block switch); a resize preview goes back. */
  cancel(): void {
    this.#g = null;
    this.#pid = null;
    if (this.drag) this.drag = null;
    if (this.#rz) {
      if (this.#rz.changed) this.#env.be.preview(this.#rz.before);
      this.#rz = null;
      this.resizing = null;
    }
  }

  #reveal(id: string): void {
    requestAnimationFrame(() => this.#env.reveal(id));
  }

  // ── keys ───────────────────────────────────────────────────────────────────────────────────────

  /** An overlay that owns Escape / Ctrl+Z is open — someone else's (not the library or the menus in the
   *  editor's own layer, not a drawer the editor sits in). */
  #foreignOverlayOpen(): boolean {
    if (typeof document === 'undefined') return false;
    const root = this.#env.root();
    const layer = this.#env.layer();
    return Array.from(document.querySelectorAll(ESCAPE_OVERLAYS)).some((el) => isForeignOverlay(el, root, layer));
  }

  /** Escape (document, bubble phase — after the fields, menus and popovers that own it, before the app's
   *  window chain): cancel a running drag, close the library, or leave Arrange. True when it took the key. */
  escape(e: KeyboardEvent): boolean {
    if (e.key !== 'Escape' || !this.#env.be.editMode) return false;
    const step = arrangeEscape({
      defaultPrevented: e.defaultPrevented,
      overlayOpen: this.#foreignOverlayOpen(),
      editableTarget: isEditableTarget(e.target as HTMLElement | null),
      libOpen: this.libOpen,
      dragging: this.busy
    });
    if (!step) return false;
    e.preventDefault();
    e.stopPropagation();
    if (step === 'drag') this.cancel();
    else if (step === 'library') this.libOpen = false;
    else this.#env.leave();
    return true;
  }

  /** Escape inside the library (its own key handler): a running drag is cancelled first (the library stays
   *  open), else the library closes. */
  libraryEscape(): 'drag' | 'library' {
    if (this.busy) {
      this.cancel();
      return 'drag';
    }
    this.libOpen = false;
    return 'library';
  }

  /** Arrows / Shift+arrows / Delete on the selection (document, bubble phase): only for keys aimed at the
   *  board (the editor's root, or nothing in particular), never in a text field. A held arrow key is one
   *  step: its repeats are previewed, the step is saved once when the key is released. */
  keydown(e: KeyboardEvent): void {
    if (!this.#env.be.editMode || e.defaultPrevented || !this.sel) return;
    const t = e.target as HTMLElement | null;
    if (isEditableTarget(t) || typeof document === 'undefined') return;
    if (!aimedAtEditor(t, this.#env.root(), null, document.body, document.documentElement)) return;
    const a = arrangeKeyAction(e);
    if (!a || a.kind === 'undo' || a.kind === 'redo') return;
    e.preventDefault();
    if (a.kind === 'remove') {
      this.remove();
      return;
    }
    const id = this.sel;
    const b = this.#env.be.board;
    const f = b ? locate(b, id) : null;
    if (!f) return;
    const r =
      a.kind === 'move'
        ? this.#keyStep(e, (d) => nudgeItem(d, id, a.dx, a.dy), []) // never Auto-packed: it would pull the item straight back
        : this.#keyStep(e, (d) => growItem(d, id, a.dw, a.dh), [f.page]);
    if (a.kind === 'resize' && !e.repeat && r && !r.ok && (r.reason === 'collision' || r.reason === 'bounds')) this.#env.toast('No room to grow there', 'bad');
  }

  /** One arrow press (or repeat): shown at once, without a save; a new press closes the previous step. */
  #keyStep(e: KeyboardEvent, op: (d: BeBoard) => BeOpResult, tidyOn: readonly string[]): BeOpResult | null {
    if (!e.repeat || this.#key?.key !== e.key) this.#endKeyStep();
    const be = this.#env.be;
    const b = be.board;
    if (!b) return null;
    const r = this.#drawn(b, op);
    if (r.ok && r.board !== b) {
      const next = be.autoPack && tidyOn.length ? this.#tidy(r.board, tidyOn) : r.board;
      if (!this.#key) this.#key = { key: e.key, before: b, shown: next, timer: null };
      this.#env.holdPage();
      be.preview(next);
      this.#key.shown = next;
      this.sel = keepSelection(be.board, this.sel);
    }
    if (this.#key) {
      if (this.#key.timer) clearTimeout(this.#key.timer);
      this.#key.timer = setTimeout(() => this.#endKeyStep(), KEY_STEP_IDLE_MS);
    }
    return r;
  }

  /** Close a held key's step: one undo step and one save for all its presses — unless something else
   *  replaced the board meanwhile (a reload): then nothing is written. */
  #endKeyStep(): void {
    const k = this.#key;
    if (!k) return;
    this.#key = null;
    if (k.timer) clearTimeout(k.timer);
    const be = this.#env.be;
    if (be.board === k.shown) be.flush(k.before);
  }

  #keyup = (e: KeyboardEvent): void => {
    if (this.#key && e.key === this.#key.key) this.#endKeyStep();
  };

  /** Ctrl/⌘+Z while arranging belongs to the editor's undo (F13): taken in the window's capture phase before
   *  the preset history sees it (redo is taken too, as a no-op) — for keys aimed at the editor (its root, its
   *  own layer, or nothing in particular), never in a text field and never while someone else's dialog or
   *  menu is open; everything else goes on to whoever owns it. During a drag or resize it is a no-op. */
  undoKey = (e: KeyboardEvent): void => {
    if (!this.#env.be.editMode || e.defaultPrevented) return;
    const a = arrangeKeyAction(e);
    if (!a || (a.kind !== 'undo' && a.kind !== 'redo')) return;
    const t = e.target as HTMLElement | null;
    if (isEditableTarget(t) || typeof document === 'undefined') return;
    if (!aimedAtEditor(t, this.#env.root(), this.#env.layer(), document.body, document.documentElement)) return;
    if (this.#foreignOverlayOpen()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (a.kind === 'undo') this.undo();
  };

  /** Install the window listeners (pointer gestures, Ctrl/⌘+Z, the arrow keys' release); returns their
   *  removal (which also closes a held key's step). */
  attach(): () => void {
    // the browser took a pointer: only that pointer's gesture ends
    const cancel = (e: PointerEvent) => {
      if (this.#pid == null || e.pointerId === this.#pid) this.cancel();
    };
    window.addEventListener('pointermove', this.#onMove, { passive: false });
    window.addEventListener('pointerup', this.#onUp);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', this.undoKey, true);
    window.addEventListener('keyup', this.#keyup);
    return () => {
      window.removeEventListener('pointermove', this.#onMove);
      window.removeEventListener('pointerup', this.#onUp);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', this.undoKey, true);
      window.removeEventListener('keyup', this.#keyup);
      this.#endKeyStep();
    };
  }
}

/** A drag that ends on a clickable control must not also activate it. */
function suppressNextClick(): void {
  if (typeof window === 'undefined') return;
  const swallow = (ev: MouseEvent) => {
    ev.stopPropagation();
    ev.preventDefault();
    window.removeEventListener('click', swallow, true);
  };
  window.addEventListener('click', swallow, true);
  setTimeout(() => window.removeEventListener('click', swallow, true), 350);
}
