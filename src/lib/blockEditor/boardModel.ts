// Block Editor board model (v2): a free 2D grid per page, measured in CELLS.
//
// One knob is 2×2 cells and a page is at most `MAXC` (24) cells wide, i.e. twelve knobs side by side;
// the height is free (capped at `MAX_ROWS`). Items are either controls (bound to a catalog key such as
// `k12`, `e4`, `eq`) or dividers (horizontal / vertical rules with an optional label, one cell thick).
//
// Everything here is pure and immutable: every operation returns a new board / list, and an operation
// that changes nothing hands back the very same reference so callers can skip a save or a render.
// No Svelte, no DOM — unit-tested in node (boardModel.test.ts).

import type { SurfaceBoard } from '../deviceLayoutBoard';

// ── types ────────────────────────────────────────────────────────────────────────────────────────

export type BeView =
  | 'knob'
  | 'fader'
  | 'slider'
  | 'number'
  | 'button'
  | 'switch'
  | 'select'
  | 'eq'
  | 'action'
  | 'meter'
  | 'wave';
export type BeDividerKind = 'hdiv' | 'vdiv';

export const BE_VIEWS: readonly BeView[] = ['knob', 'fader', 'slider', 'number', 'button', 'switch', 'select', 'eq', 'action', 'meter', 'wave'];
export const BE_DIVIDER_KINDS: readonly BeDividerKind[] = ['hdiv', 'vdiv'];

export interface BeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface BeControl extends BeRect {
  id: string;
  /** Catalog key (`k<paramId>`, `e<paramId>`, `eq`, `bypass`, `meter`, `wave`). */
  key: string;
  view: BeView;
  /** Source row of a device-layout board; keeps rows together when the page reflows. */
  row?: number;
}
export interface BeDivider extends BeRect {
  id: string;
  kind: BeDividerKind;
  label?: string;
}
export type BeItem = BeControl | BeDivider;

export interface BeBoard {
  v: 2;
  pageOrder: string[];
  page: string;
  boards: Record<string, BeItem[]>;
  /** Fingerprint of the device-layout variant a Default board was seeded from. */
  variantSig?: string;
}

/** The pre-rework board shape (no `v`, one control = one cell). */
export type BeBoardV1 = SurfaceBoard;

/** A divider is recognised by a valid `kind`; anything else (even with a stray `kind`) is a control. */
export const isDivider = (it: BeItem): it is BeDivider => {
  const k = (it as { kind?: unknown }).kind;
  return k === 'hdiv' || k === 'vdiv';
};
export const isControl = (it: BeItem): it is BeControl => !isDivider(it);
export const isBeView = (v: unknown): v is BeView => typeof v === 'string' && (BE_VIEWS as readonly string[]).includes(v);

/** Own-property check, so page names like `constructor` or `toString` never hit Object.prototype. */
export const hasOwn = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
/** Page names that can never be used (they would rewrite an object's prototype). */
export const isReservedPageName = (n: string): boolean => n === '__proto__';

// ── size table ───────────────────────────────────────────────────────────────────────────────────

/** Maximum page width in cells (12 knobs). */
export const MAXC = 24;
/** Maximum page height in cells; positions are clamped so no page can grow without bound. */
export const MAX_ROWS = 512;

export interface BeSpec {
  w: number;
  h: number;
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
}

/** Default size and limits per view / divider kind, in cells. */
export const BE_SPEC: Readonly<Record<BeView | BeDividerKind, BeSpec>> = {
  knob: { w: 2, h: 2, minW: 2, maxW: 6, minH: 2, maxH: 6 },
  fader: { w: 2, h: 4, minW: 1, maxW: 3, minH: 3, maxH: 8 },
  slider: { w: 6, h: 1, minW: 3, maxW: 20, minH: 1, maxH: 2 },
  number: { w: 2, h: 2, minW: 2, maxW: 4, minH: 1, maxH: 2 },
  button: { w: 2, h: 2, minW: 2, maxW: 4, minH: 1, maxH: 2 },
  switch: { w: 2, h: 2, minW: 1, maxW: 3, minH: 1, maxH: 3 },
  select: { w: 2, h: 2, minW: 2, maxW: 6, minH: 1, maxH: 2 },
  eq: { w: 8, h: 4, minW: 6, maxW: 24, minH: 3, maxH: 8 },
  action: { w: 2, h: 1, minW: 2, maxW: 6, minH: 1, maxH: 2 },
  // Upright by default (a block can report several bars, e.g. L/R); a wide, one-cell-high shape gives the
  // lying read-out variant.
  meter: { w: 2, h: 4, minW: 1, maxW: 24, minH: 1, maxH: 8 },
  wave: { w: 8, h: 4, minW: 6, maxW: 24, minH: 3, maxH: 8 },
  hdiv: { w: 6, h: 1, minW: 2, maxW: MAXC, minH: 1, maxH: 1 },
  vdiv: { w: 1, h: 4, minW: 1, maxW: 1, minH: 2, maxH: 24 }
};

export type BeSizeLabel = 'S' | 'M' | 'L';
export interface BePreset {
  w: number;
  h: number;
  label: BeSizeLabel;
}
const P = (w: number, h: number, label: BeSizeLabel): BePreset => ({ w, h, label });

/** S/M/L size presets per view (the arrange bar's size buttons). */
export const BE_PRESETS: Readonly<Record<BeView, readonly BePreset[]>> = {
  knob: [P(2, 2, 'S'), P(3, 3, 'M'), P(4, 4, 'L')],
  fader: [P(2, 4, 'S'), P(2, 5, 'M'), P(2, 6, 'L')],
  slider: [P(4, 1, 'S'), P(6, 1, 'M'), P(8, 1, 'L')],
  number: [P(2, 1, 'S'), P(2, 2, 'M'), P(3, 2, 'L')],
  button: [P(2, 1, 'S'), P(2, 2, 'M'), P(3, 2, 'L')],
  switch: [P(2, 1, 'S'), P(2, 2, 'M')],
  select: [P(2, 1, 'S'), P(2, 2, 'M'), P(4, 2, 'L')],
  eq: [P(8, 4, 'S'), P(10, 4, 'M'), P(12, 5, 'L')],
  action: [P(2, 1, 'S'), P(3, 1, 'M'), P(2, 2, 'L')],
  meter: [P(1, 4, 'S'), P(2, 4, 'M'), P(2, 6, 'L')],
  wave: [P(8, 4, 'S'), P(12, 4, 'M'), P(16, 6, 'L')]
};

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const int = (v: number): number => (Number.isFinite(v) ? Math.round(v) : 0);

/** Clamp a size to a view's / divider's limits and to the page width. */
export function clampSize(spec: BeSpec, w: number, h: number): { w: number; h: number } {
  return { w: clamp(int(w), spec.minW, Math.min(spec.maxW, MAXC)), h: clamp(int(h), spec.minH, spec.maxH) };
}

/** The view a key gets when nothing better is known (used for unknown stored views). */
export function defaultViewForKey(key: string): BeView {
  if (key === 'eq') return 'eq';
  if (key === 'bypass') return 'action';
  if (key === 'meter') return 'meter';
  if (key === 'wave') return 'wave';
  if (key.startsWith('e')) return 'button';
  return 'knob';
}

// ── ids ──────────────────────────────────────────────────────────────────────────────────────────

export type BeIdGen = () => string;

let idCounter = 0;
/** Default id generator for user actions: time-seeded, monotonic within a session. */
export const defaultIdGen: BeIdGen = () => 'be' + Date.now().toString(36) + (idCounter++).toString(36);

/** Deterministic generator for tests and reproducible builds (`p1`, `p2`, …). */
export function sequentialIdGen(prefix = 'id'): BeIdGen {
  let n = 0;
  return () => `${prefix}${++n}`;
}

// ── geometry on one page ─────────────────────────────────────────────────────────────────────────

type Placed = BeRect & { id: string };

/** Extent of a page in cells, never less than 1×1. */
export function bbox(list: readonly BeRect[]): { C: number; R: number } {
  let C = 1;
  let R = 1;
  for (const it of list) {
    C = Math.max(C, it.x + it.w);
    R = Math.max(R, it.y + it.h);
  }
  return { C, R };
}

const overlaps = (a: BeRect, b: BeRect): boolean => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** True when a w×h rect at (x,y) stays inside the 24-cell page and touches nothing else on it. */
export function fits(list: readonly Placed[], x: number, y: number, w: number, h: number, exceptId?: string): boolean {
  if (x < 0 || y < 0 || x + w > MAXC) return false;
  const r = { x, y, w, h };
  return !list.some((o) => o.id !== exceptId && overlaps(r, o));
}

/** First free spot (row-major from the top-left) for a w×h rect; below everything if the page is full. */
export function findFree(list: readonly Placed[], w: number, h: number, exceptId?: string): { x: number; y: number } {
  const ww = Math.min(w, MAXC);
  const { R } = bbox(list);
  for (let y = 0; y <= R + h; y++) {
    for (let x = 0; x <= MAXC - ww; x++) if (fits(list, x, y, ww, h, exceptId)) return { x, y };
  }
  return { x: 0, y: R };
}

/** Nearest free spot to (x0,y0): first the same line to the right, then the following lines, closest
 *  column first. Used to resolve overlaps without throwing an item across the page. */
export function findNear(list: readonly Placed[], w: number, h: number, x0: number, y0: number, exceptId?: string): { x: number; y: number } {
  const ww = Math.min(w, MAXC);
  const sx = clamp(int(x0), 0, MAXC - ww);
  const sy = Math.max(0, int(y0));
  for (let x = sx; x <= MAXC - ww; x++) if (fits(list, x, sy, ww, h, exceptId)) return { x, y: sy };
  const xs = Array.from({ length: MAXC - ww + 1 }, (_, i) => i).sort(
    (a, b) => Math.abs(a - sx) - Math.abs(b - sx) || (a < sx ? 1 : 0) - (b < sx ? 1 : 0)
  );
  const { R } = bbox(list);
  const last = Math.max(R, sy + 1);
  for (let y = sy + 1; y <= last; y++) for (const x of xs) if (fits(list, x, y, ww, h, exceptId)) return { x, y };
  return { x: sx, y: last };
}

/** Map coordinates so the gaps between covered spans disappear (leading gap included). Works on
 *  intervals, so it never allocates per cell. */
function squeeze(spans: [number, number][]): (v: number) => number {
  const merged: [number, number, number][] = []; // [start, end, shift]
  let removed = 0;
  let end = 0;
  for (const [a, b] of spans.slice().sort((p, q) => p[0] - q[0])) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else {
      removed += a - end;
      merged.push([a, b, removed]);
    }
    end = merged[merged.length - 1]![1];
  }
  return (v) => {
    for (const [a, b, shift] of merged) if (v >= a && v < b) return v - shift;
    return v;
  };
}

/** Remove empty rows and columns (also leading ones) from a page. Same reference when nothing moves.
 *  A full-width horizontal divider covers every column, so no column is removed then (as in the
 *  design template). */
export function closeGaps<T extends BeItem>(list: readonly T[]): T[] {
  if (!list.length) return list as T[];
  const mx = squeeze(list.map((it) => [it.x, it.x + it.w]));
  const my = squeeze(list.map((it) => [it.y, it.y + it.h]));
  let changed = false;
  const out = list.map((it) => {
    const x = mx(it.x);
    const y = my(it.y);
    if (x === it.x && y === it.y) return it;
    changed = true;
    return { ...it, x, y };
  });
  return changed ? out : (list as T[]);
}

/** Gravity tidy: in reading order every item (dividers included) slides up as far as it can, then left.
 *  An item only checks against items already tidied AND the ones still waiting at their original
 *  positions, so valid input never ends up overlapping. Relative order is kept: a section under a
 *  horizontal divider stays under it. Same reference when nothing moves. */
export function tidy<T extends BeItem>(list: readonly T[]): T[] {
  const order = list.map((it, i) => ({ it, i })).sort((a, b) => a.it.y - b.it.y || a.it.x - b.it.x || a.i - b.i);
  const placed: Placed[] = [];
  const pending = new Map<number, Placed>(order.map(({ it, i }) => [i, { id: `#${i}`, x: it.x, y: it.y, w: it.w, h: it.h }]));
  const next = new Array<T>(list.length);
  let changed = false;
  for (const { it, i } of order) {
    pending.delete(i);
    const others = [...placed, ...pending.values()];
    let y = it.y;
    while (y > 0 && fits(others, it.x, y - 1, it.w, it.h)) y--;
    let x = it.x;
    while (x > 0 && fits(others, x - 1, y, it.w, it.h)) x--;
    placed.push({ id: `#${i}`, x, y, w: it.w, h: it.h });
    if (x !== it.x || y !== it.y) {
      changed = true;
      next[i] = { ...it, x, y };
    } else next[i] = it;
  }
  return changed ? next : (list as T[]);
}

export interface BeReflow {
  /** Display position per item id (dividers are not part of a reflow). */
  pos: Record<string, BeRect>;
  rows: number;
}

/** Re-pack a page into `cols` columns for a narrow display (the board itself is not changed).
 *  Dividers are dropped. Items carrying a source `row` keep their rows: each row starts on a fresh line
 *  and wraps within itself (like the previous editor's row-preserving pack). Other items flow into the
 *  first free spot in reading order. */
export function reflowPack(list: readonly BeItem[], cols: number): BeReflow {
  const columns = Math.max(1, Math.floor(cols));
  const controls = list.filter(isControl);
  const pos: Record<string, BeRect> = {};
  const placed: Placed[] = [];
  const fitsIn = (x: number, y: number, w: number, h: number): boolean =>
    x >= 0 && y >= 0 && x + w <= columns && !placed.some((p) => overlaps({ x, y, w, h }, p));
  let rows = 1;
  const put = (it: BeControl, x: number, y: number, w: number): void => {
    const r = { x, y, w, h: it.h };
    pos[it.id] = r;
    placed.push({ id: it.id, ...r });
    rows = Math.max(rows, y + it.h);
  };

  // 1) row-tagged items: one source row after another, wrapping inside the row
  const byRow = new Map<number, BeControl[]>();
  for (const it of controls) {
    if (it.row == null) continue;
    const bucket = byRow.get(it.row);
    if (bucket) bucket.push(it);
    else byRow.set(it.row, [it]);
  }
  let gy = 0;
  for (const key of [...byRow.keys()].sort((a, b) => a - b)) {
    const items = byRow.get(key)!.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    let x = 0;
    let rowH = 1;
    for (const it of items) {
      const w = Math.min(it.w, columns);
      if (x + w > columns) {
        gy += rowH;
        x = 0;
        rowH = 1;
      }
      put(it, x, gy, w);
      x += w;
      rowH = Math.max(rowH, it.h);
    }
    gy += rowH;
  }

  // 2) free items: first free spot in reading order (bounded: a free line always exists below `rows`)
  const free = controls.filter((it) => it.row == null).sort((a, b) => a.y - b.y || a.x - b.x);
  for (const it of free) {
    const w = Math.min(it.w, columns);
    let spot: { x: number; y: number } | null = null;
    for (let y = 0; !spot && y <= rows; y++) {
      for (let x = 0; x <= columns - w; x++) {
        if (fitsIn(x, y, w, it.h)) {
          spot = { x, y };
          break;
        }
      }
    }
    put(it, spot?.x ?? 0, spot?.y ?? rows, w);
  }
  return { pos, rows };
}

// ── board helpers ────────────────────────────────────────────────────────────────────────────────

export type BeOpFailure = 'missing' | 'bounds' | 'collision' | 'duplicate' | 'invalid' | 'last-page';
export interface BeOpResult {
  board: BeBoard;
  ok: boolean;
  reason?: BeOpFailure;
  /** setView only: the item had to move to the next free spot to fit the new view. */
  moved?: boolean;
}

const ok = (board: BeBoard, extra: Partial<BeOpResult> = {}): BeOpResult => ({ board, ok: true, ...extra });
const fail = (board: BeBoard, reason: BeOpFailure): BeOpResult => ({ board, ok: false, reason });

const hasPage = (board: BeBoard, page: string): boolean => hasOwn(board.boards, page);
export function pageItems(board: BeBoard, page: string): BeItem[] {
  return hasPage(board, page) ? (board.boards[page] ?? []) : [];
}

/** Find an item anywhere on the board. */
export function locate(board: BeBoard, id: string): { page: string; item: BeItem; index: number } | null {
  for (const page of board.pageOrder) {
    const list = pageItems(board, page);
    const index = list.findIndex((it) => it.id === id);
    if (index >= 0) return { page, item: list[index]!, index };
  }
  return null;
}

function writePage(board: BeBoard, page: string, list: BeItem[]): BeBoard {
  return { ...board, boards: { ...board.boards, [page]: list } };
}
function replaceItem(board: BeBoard, page: string, id: string, next: BeItem): BeBoard {
  return writePage(board, page, pageItems(board, page).map((it) => (it.id === id ? next : it)));
}
const hasKey = (list: readonly BeItem[], key: string, exceptId?: string): boolean =>
  list.some((it) => isControl(it) && it.key === key && it.id !== exceptId);

/** Move an item to (x,y) on `toPage` (its own page or another one). Rejects positions outside the page,
 *  collisions, and a parameter that already sits on the target page. A control moved to another page
 *  loses its source `row` (that row belongs to the old page). */
export function moveItem(board: BeBoard, id: string, toPage: string, x: number, y: number): BeOpResult {
  const f = locate(board, id);
  if (!f || !hasPage(board, toPage)) return fail(board, 'missing');
  const nx = int(x);
  const ny = int(y);
  const it = f.item;
  if (nx < 0 || ny < 0 || nx + it.w > MAXC || ny + it.h > MAX_ROWS) return fail(board, 'bounds');
  if (toPage === f.page) {
    if (nx === it.x && ny === it.y) return ok(board);
    if (!fits(pageItems(board, toPage), nx, ny, it.w, it.h, id)) return fail(board, 'collision');
    return ok(replaceItem(board, toPage, id, { ...it, x: nx, y: ny }));
  }
  const target = pageItems(board, toPage);
  if (isControl(it) && hasKey(target, it.key)) return fail(board, 'duplicate');
  if (!fits(target, nx, ny, it.w, it.h)) return fail(board, 'collision');
  let moved: BeItem;
  if (isControl(it)) {
    const { row: _row, ...rest } = it;
    moved = { ...rest, x: nx, y: ny };
  } else moved = { ...it, x: nx, y: ny };
  const boards = {
    ...board.boards,
    [f.page]: pageItems(board, f.page).filter((o) => o.id !== id),
    [toPage]: [...target, moved]
  };
  return ok({ ...board, boards });
}

/** Resize an item in place (clamped to its view's limits). Rejects a size that would collide. */
export function resizeItem(board: BeBoard, id: string, w: number, h: number): BeOpResult {
  const f = locate(board, id);
  if (!f) return fail(board, 'missing');
  const it = f.item;
  const spec = BE_SPEC[isDivider(it) ? it.kind : it.view];
  const s = clampSize(spec, w, h);
  if (s.w === it.w && s.h === it.h) return ok(board);
  if (!fits(pageItems(board, f.page), it.x, it.y, s.w, s.h, id)) return fail(board, it.x + s.w > MAXC ? 'bounds' : 'collision');
  return ok(replaceItem(board, f.page, id, { ...it, w: s.w, h: s.h }));
}

/** Change a control's view; it takes the new view's default size. When that does not fit where the
 *  control sits, it moves to the next free spot on the same page (`moved: true`). */
export function setView(board: BeBoard, id: string, view: BeView): BeOpResult {
  const f = locate(board, id);
  if (!f) return fail(board, 'missing');
  const it = f.item;
  if (isDivider(it) || !isBeView(view)) return fail(board, 'invalid');
  if (it.view === view) return ok(board);
  const sp = BE_SPEC[view];
  const list = pageItems(board, f.page);
  if (fits(list, it.x, it.y, sp.w, sp.h, id)) return ok(replaceItem(board, f.page, id, { ...it, view, w: sp.w, h: sp.h }));
  const p = findFree(list, sp.w, sp.h, id);
  return ok(replaceItem(board, f.page, id, { ...it, view, w: sp.w, h: sp.h, x: p.x, y: p.y }), { moved: true });
}

/** Turn a horizontal divider into a vertical one (and back), swapping width and height. */
export function rotateDivider(board: BeBoard, id: string): BeOpResult {
  const f = locate(board, id);
  if (!f) return fail(board, 'missing');
  const it = f.item;
  if (!isDivider(it)) return fail(board, 'invalid');
  const kind: BeDividerKind = it.kind === 'hdiv' ? 'vdiv' : 'hdiv';
  const s = clampSize(BE_SPEC[kind], it.h, it.w);
  if (!fits(pageItems(board, f.page), it.x, it.y, s.w, s.h, id)) return fail(board, it.x + s.w > MAXC ? 'bounds' : 'collision');
  return ok(replaceItem(board, f.page, id, { ...it, kind, w: s.w, h: s.h }));
}

/** Set (or clear, with an empty string) a divider's label. */
export function setDividerLabel(board: BeBoard, id: string, label: string): BeOpResult {
  const f = locate(board, id);
  if (!f) return fail(board, 'missing');
  const it = f.item;
  if (!isDivider(it)) return fail(board, 'invalid');
  const next = label.trim();
  if ((it.label ?? '') === next) return ok(board);
  const { label: _old, ...rest } = it;
  return ok(replaceItem(board, f.page, id, next ? { ...rest, label: next } : rest));
}

export function removeItem(board: BeBoard, id: string): BeOpResult {
  const f = locate(board, id);
  if (!f) return fail(board, 'missing');
  return ok(writePage(board, f.page, pageItems(board, f.page).filter((it) => it.id !== id)));
}

/** Add a control to a page, at `at` when given (must fit) or at the first free spot. A parameter can
 *  sit on a page only once. */
export function addControl(
  board: BeBoard,
  page: string,
  ctl: { key: string; view: BeView; w?: number; h?: number; row?: number },
  at?: { x: number; y: number } | null,
  idGen: BeIdGen = defaultIdGen
): BeOpResult & { id?: string } {
  if (!hasPage(board, page)) return fail(board, 'missing');
  const list = pageItems(board, page);
  if (!isBeView(ctl.view)) return fail(board, 'invalid');
  if (hasKey(list, ctl.key)) return fail(board, 'duplicate');
  const sp = BE_SPEC[ctl.view];
  const s = clampSize(sp, ctl.w ?? sp.w, ctl.h ?? sp.h);
  const p = at ? { x: int(at.x), y: int(at.y) } : findFree(list, s.w, s.h);
  if (at && !fits(list, p.x, p.y, s.w, s.h)) return fail(board, p.x < 0 || p.y < 0 || p.x + s.w > MAXC ? 'bounds' : 'collision');
  const id = idGen();
  const item: BeControl = { id, key: ctl.key, view: ctl.view, x: p.x, y: p.y, w: s.w, h: s.h };
  if (ctl.row != null) item.row = ctl.row;
  return { ...ok(writePage(board, page, [...list, item])), id };
}

/** Add a divider to a page (first free spot unless `at` is given and fits). */
export function addDivider(
  board: BeBoard,
  page: string,
  kind: BeDividerKind,
  at?: { x: number; y: number } | null,
  idGen: BeIdGen = defaultIdGen,
  label?: string
): BeOpResult & { id?: string } {
  if (!hasPage(board, page)) return fail(board, 'missing');
  const list = pageItems(board, page);
  const sp = BE_SPEC[kind];
  const p = at ? { x: int(at.x), y: int(at.y) } : findFree(list, sp.w, sp.h);
  if (at && !fits(list, p.x, p.y, sp.w, sp.h)) return fail(board, p.x < 0 || p.y < 0 || p.x + sp.w > MAXC ? 'bounds' : 'collision');
  const id = idGen();
  const item: BeDivider = { id, kind, x: p.x, y: p.y, w: sp.w, h: sp.h };
  if (label?.trim()) item.label = label.trim();
  return { ...ok(writePage(board, page, [...list, item])), id };
}

// ── pages ────────────────────────────────────────────────────────────────────────────────────────

const pageTaken = (board: BeBoard, n: string): boolean => isReservedPageName(n) || board.pageOrder.includes(n) || hasPage(board, n);

function uniquePageName(board: BeBoard, base: string): string {
  if (!pageTaken(board, base)) return base;
  for (let i = 2; ; i++) {
    const n = `${base} ${i}`;
    if (!pageTaken(board, n)) return n;
  }
}

/** Append a page (named `Page N` unless `name` is given; made unique) and make it the current page. */
export function addPage(board: BeBoard, name?: string): { board: BeBoard; page: string } {
  let page: string;
  const wanted = name?.trim();
  if (wanted && !isReservedPageName(wanted)) page = uniquePageName(board, wanted);
  else {
    let n = board.pageOrder.length + 1;
    page = `Page ${n}`;
    while (pageTaken(board, page)) page = `Page ${++n}`;
  }
  return { board: { ...board, pageOrder: [...board.pageOrder, page], page, boards: { ...board.boards, [page]: [] } }, page };
}

/** Rename a page. Rejects an empty or reserved name and a name another page already uses. */
export function renamePage(board: BeBoard, from: string, to: string): BeOpResult {
  const next = to.trim();
  if (!board.pageOrder.includes(from)) return fail(board, 'missing');
  if (!next || isReservedPageName(next)) return fail(board, 'invalid');
  if (next === from) return ok(board);
  if (pageTaken(board, next)) return fail(board, 'duplicate');
  const boards: Record<string, BeItem[]> = {};
  for (const k of Object.keys(board.boards)) boards[k === from ? next : k] = board.boards[k]!;
  return ok({
    ...board,
    pageOrder: board.pageOrder.map((p) => (p === from ? next : p)),
    page: board.page === from ? next : board.page,
    boards
  });
}

/** Copy a page (items get fresh ids) right after the original, named `<page> copy` (made unique), and
 *  make the copy the current page. */
export function duplicatePage(board: BeBoard, page: string, idGen: BeIdGen = defaultIdGen): { board: BeBoard; page: string | null } {
  const i = board.pageOrder.indexOf(page);
  if (i < 0) return { board, page: null };
  const name = uniquePageName(board, `${page} copy`);
  const order = board.pageOrder.slice();
  order.splice(i + 1, 0, name);
  const items = pageItems(board, page).map((it) => ({ ...it, id: idGen() }));
  return { board: { ...board, pageOrder: order, page: name, boards: { ...board.boards, [name]: items } }, page: name };
}

/** Move a page `delta` places in the page order. Same reference when that leaves the order unchanged. */
export function movePage(board: BeBoard, page: string, delta: number): BeBoard {
  const i = board.pageOrder.indexOf(page);
  const j = i + Math.trunc(delta);
  if (i < 0 || j < 0 || j >= board.pageOrder.length || j === i) return board;
  const order = board.pageOrder.slice();
  order.splice(i, 1);
  order.splice(j, 0, page);
  return { ...board, pageOrder: order };
}

/** Reset one page to its seed: the page gets the seed's items for the page of the same name (copies),
 *  or none when the seed has no such page. Seed items whose id is already used on another page of the
 *  board get a fresh id. The other pages, the page order and the current page stay as they are. */
export function resetPageFrom(board: BeBoard, seed: BeBoard, page: string, idGen: BeIdGen = defaultIdGen): BeOpResult {
  if (!board.pageOrder.includes(page)) return fail(board, 'missing');
  const used = new Set<string>();
  for (const pg of board.pageOrder) if (pg !== page) for (const it of pageItems(board, pg)) used.add(it.id);
  const list = pageItems(seed, page).map((it) => {
    let id = it.id;
    while (!id || used.has(id)) id = idGen();
    used.add(id);
    return { ...it, id };
  });
  return ok(writePage(board, page, list));
}

/** Delete a page. The last remaining page is never deleted. */
export function deletePage(board: BeBoard, page: string): BeOpResult {
  const i = board.pageOrder.indexOf(page);
  if (i < 0) return fail(board, 'missing');
  if (board.pageOrder.length < 2) return fail(board, 'last-page');
  const order = board.pageOrder.filter((p) => p !== page);
  const boards = { ...board.boards };
  delete boards[page];
  const current = board.page === page ? order[Math.max(0, i - 1)]! : board.page;
  return ok({ ...board, pageOrder: order, page: current, boards });
}

// ── normalization ────────────────────────────────────────────────────────────────────────────────

/** Block-level catalog entries that depend on data arriving after the parameters (EQ bands, level
 *  meters, loop waveform). Persistence keeps them even while they are missing from the catalog. */
export const BLOCK_LEVEL_KEYS: ReadonlySet<string> = new Set(['meter', 'wave', 'eq', 'bypass']);

export interface NormalizeOptions {
  /** Allowed views per catalog key; a stored view outside the list falls back to the first one. */
  viewsByKey?: ReadonlyMap<string, readonly BeView[]>;
  /** Keys kept even when the catalog does not list them (yet). The renderer shows only keys that are
   *  in the catalog, so a kept-but-absent control is simply not drawn until its data arrives. */
  keepKeys?: ReadonlySet<string>;
}

function cleanControl(it: BeControl, viewsByKey?: ReadonlyMap<string, readonly BeView[]>): BeControl {
  const allowed = viewsByKey?.get(it.key);
  let view: BeView = isBeView(it.view) ? it.view : defaultViewForKey(it.key);
  if (allowed?.length && !allowed.includes(view)) view = allowed[0]!;
  const s = clampSize(BE_SPEC[view], it.w, it.h);
  const out: BeControl = {
    id: typeof it.id === 'string' ? it.id : '',
    key: it.key,
    view,
    x: clamp(int(it.x), 0, MAXC - s.w),
    y: clamp(int(it.y), 0, MAX_ROWS - s.h),
    w: s.w,
    h: s.h
  };
  if (typeof it.row === 'number' && Number.isFinite(it.row)) out.row = int(it.row);
  return out;
}
function cleanDivider(it: BeDivider): BeDivider {
  const s = clampSize(BE_SPEC[it.kind], it.w, it.h);
  const out: BeDivider = {
    id: typeof it.id === 'string' ? it.id : '',
    kind: it.kind,
    x: clamp(int(it.x), 0, MAXC - s.w),
    y: clamp(int(it.y), 0, MAX_ROWS - s.h),
    w: s.w,
    h: s.h
  };
  const label = typeof it.label === 'string' ? it.label.trim() : '';
  if (label) out.label = label;
  return out;
}

/** Reconcile a stored (already schema-checked) board with the live catalog:
 *  - pages: unique, every page in `pageOrder` has a list, stray lists are appended, never zero pages,
 *    `page` points at an existing page, the reserved name `__proto__` is dropped;
 *  - controls whose key is no longer in the catalog are dropped (unless listed in `keepKeys`);
 *  - a key appears once per page — a duplicate on the same page (the previous editor could create one
 *    by dragging past a page edge) is dropped, the first occurrence wins;
 *  - sizes are clamped to the view's limits, positions to the 24-cell page and `MAX_ROWS`;
 *  - ids are unique across the board; a missing or repeated id is replaced by one derived from the
 *    page index and key (deterministic, so reloading the same input gives the same ids);
 *  - overlaps are resolved by moving the LATER item to the nearest free spot (same line to the right
 *    first, then the following lines);
 *  - `variantSig` is kept.
 *  Idempotent: normalizing a normalized board yields a deep-equal board. */
export function normalizeBoard(raw: BeBoard, catalogKeys: Iterable<string>, opts: NormalizeOptions = {}): BeBoard {
  const valid = catalogKeys instanceof Set ? (catalogKeys as Set<string>) : new Set(catalogKeys);
  const keep = opts.keepKeys;
  const rawBoards: object = raw.boards && typeof raw.boards === 'object' ? raw.boards : {};
  const listOf = (pg: string): unknown => (hasOwn(rawBoards, pg) ? (rawBoards as Record<string, unknown>)[pg] : undefined);

  const order: string[] = [];
  for (const p of [...(Array.isArray(raw.pageOrder) ? raw.pageOrder : []), ...Object.keys(rawBoards)]) {
    if (typeof p === 'string' && p && !isReservedPageName(p) && !order.includes(p)) order.push(p);
  }
  if (!order.length) order.push('Page 1');

  // ids already in use anywhere on the input, so a derived id never steals one a later item owns
  const rawIds = new Set<string>();
  for (const pg of order) {
    const src = listOf(pg);
    if (Array.isArray(src)) for (const it of src) if (it && typeof (it as BeItem).id === 'string') rawIds.add((it as BeItem).id);
  }
  const usedIds = new Set<string>();
  const derivedId = (pi: number, item: BeItem): string => {
    const base = `n${pi}.${isDivider(item) ? `${item.kind}${item.x}_${item.y}` : item.key}`;
    let id = base;
    for (let n = 2; usedIds.has(id) || rawIds.has(id); n++) id = `${base}~${n}`;
    return id;
  };

  const boards: Record<string, BeItem[]> = {};
  order.forEach((pg, pi) => {
    const src = listOf(pg);
    const placed: BeItem[] = [];
    const keys = new Set<string>();
    for (const it of Array.isArray(src) ? (src as BeItem[]) : []) {
      if (!it || typeof it !== 'object') continue;
      let item: BeItem;
      if (isDivider(it)) item = cleanDivider(it);
      else {
        const key = (it as { key?: unknown }).key;
        if (typeof key !== 'string' || !(valid.has(key) || keep?.has(key)) || keys.has(key)) continue;
        keys.add(key);
        item = cleanControl(it, opts.viewsByKey);
      }
      if (!item.id || usedIds.has(item.id)) item = { ...item, id: derivedId(pi, item) };
      usedIds.add(item.id);
      if (!fits(placed, item.x, item.y, item.w, item.h)) item = { ...item, ...findNear(placed, item.w, item.h, item.x, item.y) };
      placed.push(item);
    }
    boards[pg] = placed;
  });
  const out: BeBoard = { v: 2, pageOrder: order, page: order.includes(raw.page) ? raw.page : order[0]!, boards };
  if (typeof raw.variantSig === 'string') out.variantSig = raw.variantSig;
  return out;
}

// ── migration v1 → v2 ────────────────────────────────────────────────────────────────────────────

/** Split one band of items into chunks no wider than `maxC`, cutting only between items when possible.
 *  The first chunk keeps its x positions; later chunks start at their leftmost item. */
function segmentBand<T extends BeItem>(band: readonly T[], maxC: number): { start: number; items: T[] }[] {
  let rest = band.map((it) => ({ ...it })).sort((a, b) => a.x - b.x);
  const out: { start: number; items: T[] }[] = [];
  let start = 0;
  while (rest.length) {
    const right = Math.max(...rest.map((it) => it.x + it.w));
    if (right - start <= maxC) {
      out.push({ start, items: rest });
      break;
    }
    let cut = -1;
    for (let c = start + maxC; c > start; c--) {
      if (rest.every((it) => it.x >= c || it.x + it.w <= c)) {
        cut = c;
        break;
      }
    }
    if (cut < 0) {
      // items chained edge-to-edge past the limit: cut hard, push straddlers into the next chunk
      cut = start + maxC;
      rest = rest.map((it) => (it.x < cut && it.x + it.w > cut ? { ...it, x: cut } : it)).sort((a, b) => a.x - b.x);
    }
    out.push({ start, items: rest.filter((it) => it.x < cut) });
    rest = rest.filter((it) => it.x >= cut);
    if (rest.length) start = Math.min(...rest.map((it) => it.x));
  }
  return out;
}

/** Wrap a page wider than `maxC` cells onto extra lines, keeping rows together: items with a source
 *  `row` form one band per row, the others form bands of vertically overlapping items. */
export function wrapWidePage<T extends BeItem>(list: readonly T[], maxC: number = MAXC): T[] {
  if (!list.length || bbox(list).C <= maxC) return list as T[];
  const bands: { top: number; bottom: number; items: T[] }[] = [];
  const byRow = new Map<number, T[]>();
  const loose: T[] = [];
  for (const it of list) {
    const row = isControl(it) ? it.row : undefined;
    if (row != null) {
      const b = byRow.get(row);
      if (b) b.push(it);
      else byRow.set(row, [it]);
    } else loose.push(it);
  }
  for (const items of byRow.values()) {
    bands.push({ top: Math.min(...items.map((i) => i.y)), bottom: Math.max(...items.map((i) => i.y + i.h)), items });
  }
  for (const it of loose.slice().sort((a, b) => a.y - b.y || a.x - b.x)) {
    const last = bands.length ? bands[bands.length - 1] : undefined;
    const looseBand = last && !last.items.some((i) => isControl(i) && i.row != null) ? last : undefined;
    if (looseBand && it.y < looseBand.bottom) {
      looseBand.items.push(it);
      looseBand.bottom = Math.max(looseBand.bottom, it.y + it.h);
    } else bands.push({ top: it.y, bottom: it.y + it.h, items: [it] });
  }
  bands.sort((a, b) => a.top - b.top);

  const out: T[] = [];
  let cursor = 0;
  let prevBottom = 0;
  for (const band of bands) {
    cursor += Math.max(0, band.top - prevBottom);
    prevBottom = Math.max(prevBottom, band.bottom);
    for (const seg of segmentBand(band.items, maxC)) {
      let segH = 0;
      for (const it of seg.items) {
        out.push({ ...it, x: it.x - seg.start, y: cursor + it.y - band.top });
        segH = Math.max(segH, it.y + it.h - band.top);
      }
      cursor += segH;
    }
  }
  return out;
}

/** One migrated control plus where it sat in the previous editor (for the row re-layout). */
interface Scaled {
  item: BeControl;
  /** Previous editor's grid line and doubled x / width before the size was fitted to the view. */
  v1y: number;
  sx: number;
  sw: number;
}

/** Re-lay a device-layout page row by row (like the v2 builder): rows top→bottom in `row` order, items
 *  left→right in their previous order. Gaps between neighbours on the same previous grid line are kept;
 *  a row the previous editor had wrapped is joined back up; a line wider than 24 cells wraps. */
function relayRows(items: Scaled[]): BeControl[] {
  const byRow = new Map<number, Scaled[]>();
  for (const s of items) {
    const r = s.item.row!;
    const b = byRow.get(r);
    if (b) b.push(s);
    else byRow.set(r, [s]);
  }
  const out: BeControl[] = [];
  let gy = 0;
  for (const r of [...byRow.keys()].sort((a, b) => a - b)) {
    const row = byRow.get(r)!.slice().sort((a, b) => a.v1y - b.v1y || a.sx - b.sx);
    let x = 0;
    let lineY = gy;
    let lineH = 0;
    let prev: Scaled | null = null;
    for (const s of row) {
      const { w, h } = s.item;
      let nx: number;
      if (!prev) nx = Math.min(s.sx, MAXC - w);
      else if (s.v1y !== prev.v1y) nx = x;
      else nx = x + Math.max(0, s.sx - (prev.sx + prev.sw));
      if (nx + w > MAXC) {
        lineY += lineH;
        nx = 0;
        lineH = 0;
      }
      out.push({ ...s.item, x: nx, y: lineY });
      x = nx + w;
      lineH = Math.max(lineH, h);
      prev = s;
    }
    gy = lineY + lineH;
  }
  return out;
}

/** Upgrade a pre-rework board (one control = one cell) to v2:
 *  - coordinates and sizes ×2, sizes then fitted to the view's limits;
 *  - row-tagged (device-layout) controls are re-laid row by row so grown controls push their
 *    neighbours along instead of being thrown elsewhere; other controls keep their positions;
 *  - a page that still ends up wider than 24 cells is wrapped, rows kept together.
 *  The result still goes through `normalizeBoard` (which resolves any remaining overlap nearby).
 *  A v2 board is returned unchanged (same reference). */
export function migrateV1(board: BeBoardV1 | BeBoard): BeBoard {
  if ((board as BeBoard).v === 2) return board as BeBoard;
  const v1 = board as BeBoardV1;
  const boards: Record<string, BeItem[]> = {};
  const src: object = v1.boards && typeof v1.boards === 'object' ? v1.boards : {};
  for (const pg of Object.keys(src)) {
    if (isReservedPageName(pg)) continue;
    const list = (src as Record<string, unknown>)[pg];
    const scaled: Scaled[] = (Array.isArray(list) ? (list as BeBoardV1['boards'][string]) : []).map((w) => {
      const view = isBeView(w.view) ? w.view : defaultViewForKey(w.key);
      const sw = Math.max(1, int(w.w)) * 2;
      const s = clampSize(BE_SPEC[view], sw, Math.max(1, int(w.h)) * 2);
      const sx = Math.max(0, int(w.x)) * 2;
      const item: BeControl = { id: w.id, key: w.key, view, x: sx, y: Math.max(0, int(w.y)) * 2, w: s.w, h: s.h };
      if (typeof w.row === 'number' && Number.isFinite(w.row)) item.row = w.row;
      return { item, v1y: int(w.y), sx, sw };
    });
    const tagged = scaled.filter((s) => s.item.row != null);
    const loose = scaled.filter((s) => s.item.row == null).map((s) => s.item);
    if (tagged.length) {
      // device-layout rows first; anything the user added freely keeps its spot below / around them
      boards[pg] = [...relayRows(tagged), ...wrapWidePage(loose)];
    } else boards[pg] = wrapWidePage(loose);
  }
  const out: BeBoard = { v: 2, pageOrder: Array.isArray(v1.pageOrder) ? v1.pageOrder.slice() : [], page: v1.page, boards };
  if (typeof v1.variantSig === 'string') out.variantSig = v1.variantSig;
  return out;
}
