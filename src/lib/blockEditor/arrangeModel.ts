// Block Editor Arrange: the decisions and board operations behind the arrange bar, the keyboard and the
// "Add" library — all pure (arrangeModel.test.ts). The pointer gestures and the DOM live in
// beArrange.svelte.ts; the board model itself in boardModel.ts.

import {
  addControl,
  defaultIdGen,
  locate,
  moveItem,
  pageItems,
  resizeItem,
  tidy,
  writePage,
  type BeBoard,
  type BeDividerKind,
  type BeIdGen,
  type BeItem,
  type BeOpResult,
  type BeView
} from './boardModel';

// ── keyboard ─────────────────────────────────────────────────────────────────────────────────────

export type ArrangeKey =
  | { kind: 'undo' }
  /** There is no redo in Arrange; the key is still taken so the preset history does not redo meanwhile. */
  | { kind: 'redo' }
  | { kind: 'move'; dx: number; dy: number }
  | { kind: 'resize'; dw: number; dh: number }
  | { kind: 'remove' };

export interface ArrangeKeyEvent {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

const ARROWS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1]
};

/** What a key does while arranging: Ctrl/Cmd+Z undo (Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y redo — taken, no-op),
 *  arrows move the selection one cell, Shift+arrows resize it by one cell (→ / ↓ grow, ← / ↑ shrink),
 *  Delete / Backspace remove it. Anything else (also Alt combinations) is not Arrange's. */
export function arrangeKeyAction(e: ArrangeKeyEvent): ArrangeKey | null {
  if (e.ctrlKey || e.metaKey) {
    if (e.altKey) return null;
    const k = e.key.toLowerCase();
    if (k === 'z') return e.shiftKey ? { kind: 'redo' } : { kind: 'undo' };
    if (k === 'y') return { kind: 'redo' };
    return null;
  }
  if (e.altKey) return null;
  if (e.key === 'Delete' || e.key === 'Backspace') return { kind: 'remove' };
  const d = ARROWS[e.key];
  if (!d) return null;
  return e.shiftKey ? { kind: 'resize', dw: d[0], dh: d[1] } : { kind: 'move', dx: d[0], dy: d[1] };
}

/** Move an item by whole cells on its page (refused outside the page or onto another item). */
export function nudgeItem(board: BeBoard, id: string, dx: number, dy: number): BeOpResult {
  const f = locate(board, id);
  if (!f) return { board, ok: false, reason: 'missing' };
  return moveItem(board, id, f.page, f.item.x + dx, f.item.y + dy);
}

/** Grow / shrink an item by whole cells, clamped to its view's limits (a step past a limit is a no-op,
 *  same board); refused when it would leave the page or touch another item. */
export function growItem(board: BeBoard, id: string, dw: number, dh: number): BeOpResult {
  const f = locate(board, id);
  if (!f) return { board, ok: false, reason: 'missing' };
  return resizeItem(board, id, f.item.w + dw, f.item.h + dh);
}

/** The undo shortcut as the toasts, tooltips and hints name it (Ctrl on Windows / Linux, ⌘ on macOS). */
export const UNDO_KEYS = 'Ctrl/⌘+Z';

/** A DOM-like node: enough of `Node` to tell containment apart (pure tests pass plain objects). */
export interface ContainsNode {
  contains(other: unknown): boolean;
}

/** A key is Arrange's when it is aimed at the editor: at its root, at its own floating layer (the arrange
 *  menus, the library), or at nothing in particular (the page body / no focus). */
export function aimedAtEditor(target: unknown, root: ContainsNode | null, layer: ContainsNode | null, body: unknown, html: unknown): boolean {
  if (!target || target === body || target === html) return true;
  return (!!root && root.contains(target)) || (!!layer && layer.contains(target));
}

/** An overlay that owns Escape / Ctrl+Z (`ESCAPE_OVERLAYS`) is someone else's — not the editor's own
 *  floating layer (its library, its menus: they handle their own keys) and not a container the editor sits in
 *  (a mobile dock drawer with role="dialog" holding the whole editor). */
export function isForeignOverlay(el: ContainsNode, root: unknown, layer: ContainsNode | null): boolean {
  if (layer && (layer === el || layer.contains(el))) return false;
  if (root && el.contains(root)) return false;
  return true;
}

// ── Escape ───────────────────────────────────────────────────────────────────────────────────────

export interface ArrangeEscapeContext {
  /** Something earlier in the dispatch handled the key (a menu, a field, a popover). */
  defaultPrevented: boolean;
  /** Another overlay that owns Escape is open (a menu, a dialog, a drawer) — not the editor's own library
   *  and not a container of the editor (`isForeignOverlay`). */
  overlayOpen: boolean;
  /** The key went to a text field (it keeps its own Escape). */
  editableTarget: boolean;
  /** The "Add" library is open. */
  libOpen: boolean;
  /** A tile move, a corner resize or a library drag is running. */
  dragging: boolean;
}

/** What an Escape does while arranging: nothing when someone earlier handled it; a running drag is
 *  cancelled first (before any overlay or field check: the gesture owns the pointer and the key); then a
 *  foreign overlay or a text field keeps it; else the library closes; else Arrange ends. Whatever it does,
 *  the app's window Escape chain (close the editor, restore a maximized panel) never sees the key. */
export function arrangeEscape(c: ArrangeEscapeContext): 'library' | 'drag' | 'leave' | null {
  if (c.defaultPrevented) return null;
  if (c.dragging) return 'drag';
  if (c.overlayOpen || c.editableTarget) return null;
  if (c.libOpen) return 'library';
  return 'leave';
}

// ── page-wide operations ─────────────────────────────────────────────────────────────────────────

/** Run a page-wide rearrangement (`closeGaps` — "Close gaps": remove the empty rows and columns —, or
 *  `tidy` — "Tidy up": gravity) on one page. Same board when nothing moves. */
export function onPage(board: BeBoard, page: string, fn: (list: readonly BeItem[]) => BeItem[]): BeOpResult {
  if (!board.pageOrder.includes(page)) return { board, ok: false, reason: 'missing' };
  const list = pageItems(board, page);
  const next = fn(list);
  return { board: next === list ? board : writePage(board, page, next), ok: true };
}

/** Tidy several pages (Auto-pack after a move / resize / add). Same board when nothing moves. */
export function tidyPages(board: BeBoard, pages: readonly string[]): BeBoard {
  let out = board;
  for (const pg of new Set(pages)) {
    if (!out.pageOrder.includes(pg)) continue;
    out = onPage(out, pg, tidy).board;
  }
  return out;
}

// ── the "Add" library ────────────────────────────────────────────────────────────────────────────

export interface LibraryControl {
  key: string;
  /** The catalog's default view (its default size comes with it). */
  view: BeView;
}

/** Add a control from the library: at `at` when given (it must fit — a drop), else at the first free spot
 *  of the page (a click). A control already on the page is refused (`duplicate`). */
export function libraryAdd(
  board: BeBoard,
  page: string,
  ctl: LibraryControl,
  at: { x: number; y: number } | null = null,
  idGen: BeIdGen = defaultIdGen
): BeOpResult & { id?: string } {
  return addControl(board, page, { key: ctl.key, view: ctl.view }, at, idGen);
}

/** The cell a library drag holds a new item by: its middle (the pointer sits on the centre of the ghost). */
export function libraryGrab(w: number, h: number): { cx: number; cy: number } {
  return { cx: Math.max(0, Math.floor((w - 1) / 2)), cy: Math.max(0, Math.floor((h - 1) / 2)) };
}

/** The library popover's width (layout px); the room below the bar that is always enough, the window
 *  margin, the gap to the bar, the space kept free at the window edge and the smallest height (visual px). */
export const LIBRARY_W = 360;
export const LIBRARY_MIN_BELOW = 260;
const LIB_MARGIN = 8;
const LIB_GAP = 4;
const LIB_EDGE = 12;
const LIB_MIN_H = 140;

export interface LibraryPlacement {
  /** Layout px (a fixed element inside an ancestor CSS zoom positions in them). */
  left: number;
  /** Below the bar: `top`; above it: `bottom` (from the window's bottom edge). */
  top: number | null;
  bottom: number | null;
  width: number;
  maxH: number;
}

/** Where the "Add" library opens (all inputs in visual px): right-aligned to its trigger, clamped into the
 *  window; below the arrange bar (`floor`), or above it when there is less than `LIBRARY_MIN_BELOW` below and
 *  more room above (a short panel at the bottom of the window). The result is in layout px (÷ zoom). */
export function libraryPlacement(
  trigger: { right: number },
  floor: { top: number; bottom: number },
  viewport: { width: number; height: number },
  zoom: number
): LibraryPlacement {
  const z = zoom > 0 ? zoom : 1;
  const width = Math.min(LIBRARY_W * z, viewport.width - 2 * LIB_MARGIN);
  const left = Math.max(LIB_MARGIN, Math.min(trigger.right - width, viewport.width - width - LIB_MARGIN));
  const below = viewport.height - floor.bottom - LIB_EDGE;
  const above = floor.top - LIB_EDGE;
  if (below >= LIBRARY_MIN_BELOW || below >= above) {
    return { left: left / z, top: (floor.bottom + LIB_GAP) / z, bottom: null, width: width / z, maxH: Math.max(LIB_MIN_H, below) / z };
  }
  return { left: left / z, top: null, bottom: (viewport.height - floor.top + LIB_GAP) / z, width: width / z, maxH: Math.max(LIB_MIN_H, above) / z };
}

// ── names ────────────────────────────────────────────────────────────────────────────────────────

export const DIVIDER_NAME: Readonly<Record<BeDividerKind, string>> = { hdiv: 'Horizontal divider', vdiv: 'Vertical divider' };

/** The selection after a board change: kept while the item still exists, else none. */
export function keepSelection(board: BeBoard | null, sel: string | null): string | null {
  return sel && board && locate(board, sel) ? sel : null;
}
