// Block Editor board view: how the pages of a board are laid out on screen and how the scroll position
// maps back to pages.
//
// - One cell size for every page (the smallest "always fit" cell of the pages that are not re-flowed), so a
//   knob has the same size wherever it sits.
// - Top navigation: pages side by side in one horizontal strip, each with the page name on a vertical
//   "spine" in front of it. Side navigation: pages stacked, each at least one board height tall (they snap).
// - Section extents are computed here (not measured from the DOM): the component sizes every section with
//   exactly these numbers, so the visible-page and scroll-target maths stay pure.
// Pure numbers in, numbers out — no DOM (boardView.test.ts).

import { availableArea, layoutForPage, PAD_Y, SEC_HEAD, visiblePages, type BeNav, type BeSection, type PageLayout, type PageLayoutInput } from './boardGeometry';
import { hasOwn, pageItems, type BeBoard, type BeItem } from './boardModel';

// ── strip chrome (top navigation) ────────────────────────────────────────────────────────────────

/** Width of the vertical page-name spine and the gap between it and the page grid. */
export const SPINE_W = 16;
export const SPINE_GAP = 12;
/** Horizontal padding of a strip section: the first page gets a little more room on the left. */
export const STRIP_PAD_FIRST = 10;
export const STRIP_PAD_LEFT = 6;
export const STRIP_PAD_RIGHT = 18;
/** Extra horizontal chrome of a strip section over the board padding `availableArea` already reserves
 *  (2 × PAD_X). Taken off the width before the cell size is fitted, so one full 24-cell page plus its
 *  spine fits the board exactly. */
export const STRIP_EXTRA = STRIP_PAD_FIRST + SPINE_W + SPINE_GAP + STRIP_PAD_RIGHT - 28;

/** Horizontal chrome of a strip section (padding + spine). */
export function stripChrome(first: boolean): number {
  return (first ? STRIP_PAD_FIRST : STRIP_PAD_LEFT) + SPINE_W + SPINE_GAP + STRIP_PAD_RIGHT;
}

// ── page layouts with one shared cell ────────────────────────────────────────────────────────────

export interface BoardPage {
  page: string;
  /** Items actually drawn on the page (controls whose key the catalog lists, and dividers). */
  items: readonly BeItem[];
}

export type BoardLayoutInput = Omit<PageLayoutInput, 'frozenCell'> & {
  /** Arrange mode: the cell frozen when arranging began (same for every page). */
  frozenCell?: number;
};

/** Re-size a layout to another cell (grid dimensions kept). */
function withCell(L: PageLayout, c: number, area: { Wa: number; Ha: number }): PageLayout {
  const W = L.cols * (c + L.g) - L.g;
  const H = L.rows * (c + L.g) - L.g;
  return { ...L, c, W, H, overflowX: W > area.Wa + 1, overflowY: H > area.Ha + 1 };
}

/** Tallest item of the board (at least 1): in arrange mode every page keeps that many spare rows under
 *  its content, so any item — also one dragged over from another page — can be dropped below it. */
export function spareRowsFor(pages: readonly BoardPage[]): number {
  let h = 1;
  for (const p of pages) for (const it of p.items) h = Math.max(h, it.h);
  return h;
}

/** Layout of every page with ONE cell size: each page is fitted on its own first, then every page that
 *  is not re-flowed takes the smallest of those cells. In arrange mode the frozen cell is used as is. */
export function layoutBoardPages(pages: readonly BoardPage[], input: BoardLayoutInput): Record<string, PageLayout> {
  const bodyW = input.nav === 'top' ? Math.max(0, input.bodyW - STRIP_EXTRA) : input.bodyW;
  const inp: PageLayoutInput = { ...input, bodyW, ...(input.editMode ? { spareRows: input.spareRows ?? spareRowsFor(pages) } : {}) };
  const out: Record<string, PageLayout> = {};
  for (const p of pages) out[p.page] = layoutForPage(inp, p.items);
  if (input.editMode) return out;
  const fitted = pages.map((p) => out[p.page]!).filter((L) => !L.reflow);
  if (!fitted.length) return out;
  const shared = Math.min(...fitted.map((L) => L.c));
  const area = availableArea(bodyW, input.bodyH, input.nav);
  for (const p of pages) {
    const L = out[p.page]!;
    if (!L.reflow && L.c !== shared) out[p.page] = withCell(L, shared, area);
  }
  return out;
}

/** The cell shown right now (what arrange mode freezes): the shared cell of the non-reflowed pages. */
export function sharedCell(layouts: Readonly<Record<string, PageLayout>>): number | null {
  const cells = Object.values(layouts)
    .filter((L) => !L.reflow)
    .map((L) => L.c);
  return cells.length ? Math.min(...cells) : null;
}

// ── sections along the scroll axis ───────────────────────────────────────────────────────────────

export interface SectionInput {
  page: string;
  /** Grid width / height (px). */
  W: number;
  H: number;
}

/** Size of one page section along the scroll axis: in the strip its full width (padding + spine + grid),
 *  in the side navigation its height (at least one board height, so the pages snap one by one). */
export function sectionSize(nav: BeNav, sec: SectionInput, index: number, bodyH: number): number {
  if (nav === 'top') return stripChrome(index === 0) + sec.W;
  return Math.max(bodyH, PAD_Y * 2 + SEC_HEAD + sec.H);
}

/** Offsets and sizes of every section along the scroll axis, in page order. */
export function sectionExtents(nav: BeNav, sections: readonly SectionInput[], bodyH: number): BeSection[] {
  const out: BeSection[] = [];
  let start = 0;
  sections.forEach((s, i) => {
    const size = sectionSize(nav, s, i, bodyH);
    out.push({ page: s.page, start, size });
    start += size;
  });
  return out;
}

/** Scroll position that brings a page to the start of the viewport (clamped to the scroll range). */
export function scrollTargetFor(sections: readonly BeSection[], page: string, viewport: number): number | null {
  const s = sections.find((x) => x.page === page);
  if (!s) return null;
  const total = sections.reduce((n, x) => Math.max(n, x.start + x.size), 0);
  return Math.max(0, Math.min(s.start, total - viewport));
}

export { visiblePages };

/** How far into a page's section the viewport starts (px along the scroll axis; negative before it), or
 *  null for an unknown page. With `scrollAtOffset` it keeps a page where it is on screen across a change
 *  that moves or resizes the sections (an arrange edit on another page). */
export function offsetInPage(sections: readonly BeSection[], page: string, pos: number): number | null {
  const s = sections.find((x) => x.page === page);
  return s ? pos - s.start : null;
}

/** The scroll position that starts the viewport `offset` px into a page's section (never below 0), or
 *  null for an unknown page. */
export function scrollAtOffset(sections: readonly BeSection[], page: string, offset: number): number | null {
  const s = sections.find((x) => x.page === page);
  return s ? Math.max(0, s.start + offset) : null;
}

/** What the board's scroll offset is anchored to: navigation, board size and the cells of every page.
 *  A change means the offset no longer points at the same page (the board re-anchors the active one). */
export function anchorKey(nav: BeNav, bodyW: number, bodyH: number, layouts: Readonly<Record<string, Pick<PageLayout, 'c'>>>): string {
  return `${nav}|${Math.round(bodyW)}x${Math.round(bodyH)}|${Object.entries(layouts)
    .map(([pg, L]) => `${pg}:${L.c}`)
    .join(',')}`;
}

/** Page that becomes active after a scroll, or null when the active page stays as it is: the current page
 *  while it is still visible, else the first visible one. While a programmatic scroll runs (`now <
 *  lockUntil`) nothing changes, so a tab click is not overridden by the pages the smooth scroll passes. */
export function activeAfterScroll(visible: readonly string[], current: string, now: number, lockUntil: number): string | null {
  if (now < lockUntil || !visible.length) return null;
  const next = visible.includes(current) ? current : visible[0]!;
  return next === current ? null : next;
}

/** Highlight set for the page tabs: every visible page, or the active page before anything was measured. */
export function highlightedPages(visible: readonly string[], active: string): Set<string> {
  return new Set(visible.length ? visible : [active]);
}

// ── wheel ────────────────────────────────────────────────────────────────────────────────────────

export interface WheelScroller {
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
}

/** Horizontal scroll delta for a vertical wheel turn in the strip, or null when the wheel should keep its
 *  default (side navigation, a sideways gesture, nothing to scroll sideways, or the board also scrolls
 *  vertically). Line-mode deltas count 16 px per line. */
export function wheelToStrip(nav: BeNav, e: { deltaX: number; deltaY: number; deltaMode: number }, el: WheelScroller): number | null {
  if (nav !== 'top') return null;
  if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return null;
  if (el.scrollWidth <= el.clientWidth + 1) return null;
  if (el.scrollHeight > el.clientHeight + 1) return null;
  return e.deltaY * (e.deltaMode === 1 ? 16 : 1);
}

// ── values: keys and drags ───────────────────────────────────────────────────────────────────────

/** Steps for a key on a focused control: Up/Right = +1, Down/Left = −1, PageUp/PageDown = ±10. */
export function keySteps(key: string): number | null {
  switch (key) {
    case 'ArrowUp':
    case 'ArrowRight':
      return 1;
    case 'ArrowDown':
    case 'ArrowLeft':
      return -1;
    case 'PageUp':
      return 10;
    case 'PageDown':
      return -10;
    default:
      return null;
  }
}

/** Norm change per pixel of vertical knob drag; Shift drags ten times finer. */
export const DRAG_PER_PX = 0.005;
export const FINE_FACTOR = 0.1;

/** Norm after a vertical drag of `dy` px (up = positive), clamped to 0..1. */
export function dragNorm(norm: number, dy: number, fine: boolean): number {
  return Math.max(0, Math.min(1, norm + dy * DRAG_PER_PX * (fine ? FINE_FACTOR : 1)));
}

/** Number view steppers move 2 % per click (as before). */
export const NUDGE_STEP = 0.02;

// ── tile sizes ───────────────────────────────────────────────────────────────────────────────────

/** Pixel extent of `n` cells. */
export const pxOf = (n: number, c: number, g: number): number => n * c + (n - 1) * g;

/** Label font size for a cell size (10–12 px). */
export const labelPx = (c: number): number => Math.max(10, Math.min(12, Math.round(c * 0.28)));

/** Knob dial diameter for a tile: fills the tile, leaving room for the label below. */
export function dialSize(pxW: number, pxH: number, label: number): number {
  return Math.max(22, Math.min(220, Math.round(Math.min(pxW - 6, pxH - label - 6))));
}

/** Height of a pill, select field or fader / slider value control for a cell size. */
export const ctlHeightPx = (c: number): number => Math.max(22, Math.min(36, Math.round(c * 0.72)));
/** Number view: stepper button size. */
export const stepPx = (c: number): number => Math.max(16, Math.min(28, Math.round(c * 0.55)));
/** Switch view: the switch's width and height. */
export const switchPx = (c: number): { w: number; h: number } => ({
  w: Math.max(30, Math.min(54, Math.round(c * 1.05))),
  h: Math.max(18, Math.min(30, Math.round(c * 0.6)))
});
/** Fader view: the handle's width. */
export const faderHandlePx = (c: number): number => Math.max(18, Math.min(28, Math.round(c * 0.62)));
/** Number view: steppers beside the value from this tile width, under it below. */
export const NUM_WIDE_PX = 110;
/** Number view: the largest value font a tile allows (the text may still shrink to fit). */
export const numFontMax = (pxW: number, pxH: number): number => Math.max(11, Math.min(30, Math.round(Math.min(pxW * 0.2, pxH * 0.36))));
/** Size (px) of a hover action (⚡ / ∿) for a cell size. */
export const hoverActionPx = (c: number): number => Math.max(16, Math.min(20, Math.round(c * 0.46)));

/** Fader value read-out width is estimated for this many characters, whatever the value: the hover
 *  actions must not come and go while the value changes. */
const FADER_VALUE_CHARS = 6;
/** A hover action sits 2 px inside the tile's 1 px border, with 1 px of air under it. */
const HOVER_ACTION_INSET = 4;

/** The size of what a tile shows (its control, and the label under it when there is one), centred in the
 *  tile. Mirrors the layout of BeControl; a view without hover actions just fills the tile. */
export function tileContentBox(view: string, d: { pxW: number; pxH: number; c: number; lf: number; showLabel: boolean }): { w: number; h: number } {
  const label = d.showLabel ? Math.ceil(d.lf * 1.15) + 2 : 0; // the label row (line-height 1.15) + the 2 px gap
  switch (view) {
    case 'knob': {
      const dial = dialSize(d.pxW, d.pxH, d.lf);
      return { w: dial, h: dial + label };
    }
    case 'fader':
      return { w: Math.max(faderHandlePx(d.c), Math.ceil(FADER_VALUE_CHARS * d.lf * MONO_EM) + 8), h: d.pxH };
    case 'slider':
      return { w: d.pxW, h: d.lf + 4 }; // one row: label · track · value button (2 px padding)
    case 'number': {
      const nf = numFontMax(d.pxW, d.pxH);
      const st = stepPx(d.c);
      return d.pxW >= NUM_WIDE_PX ? { w: d.pxW, h: Math.max(st, nf) + label } : { w: 2 * st + 6, h: nf + 2 + st + label };
    }
    case 'switch': {
      const s = switchPx(d.c);
      return { w: s.w, h: s.h + label };
    }
    case 'button':
    case 'select':
    case 'action':
      return { w: d.pxW, h: ctlHeightPx(d.c) + label };
    default:
      return { w: d.pxW, h: d.pxH };
  }
}

/** Whether the hover actions (⚡ top left, ∿ top right, `act` px each) fit a tile without covering its
 *  control. A one-row tile never has room (its control fills the height: a slider, a one-row button,
 *  switch, select or number) — those use the control menu. A knob leaves the corners of its dial's square
 *  free. Every other view centres its content (`box`): the actions need a free strip above it or free
 *  room beside it. */
export function hoverActionsFit(view: string, h: number, pxW: number, pxH: number, act: number, box: { w: number; h: number }): boolean {
  if (h < 2) return false;
  if (view === 'knob') return true;
  const need = act + HOVER_ACTION_INSET;
  return (pxH - box.h) / 2 >= need || (pxW - box.w) / 2 >= need;
}

/** Average glyph width of the monospace value font, as a fraction of the font size. */
const MONO_EM = 0.62;

/** Fit a value read-out into a box `width` px wide: the full text at up to `maxFont`; when that would
 *  need a font below `minFont`, the unit is dropped (the bubble / tooltip still shows it) and the number
 *  alone is fitted. */
export function fitValueText(text: string, width: number, maxFont: number, minFont = 8): { text: string; font: number } {
  const fit = (t: string) => Math.min(maxFont, Math.floor(width / Math.max(1, t.length * MONO_EM)));
  const full = fit(text);
  if (full >= minFont) return { text, font: full };
  const num = text.split(' ')[0] ?? text;
  return { text: num, font: Math.max(minFont, fit(num)) };
}

/** Average glyph width of the (bold) UI font, as a fraction of the font size. */
const UI_EM = 0.6;

/** Font size (half-px steps) at which `text` fits into `width` px in the UI font: at most `maxFont`, never
 *  below `minFont` (the text ellipsises beyond that). Keeps option names and on / off states readable on
 *  narrow tiles instead of cutting them after two letters. */
export function fitFont(text: string, width: number, maxFont: number, minFont = 9): number {
  const f = Math.floor((Math.max(0, width) / Math.max(1, text.length * UI_EM)) * 2) / 2;
  return Math.max(minFont, Math.min(maxFont, f));
}

/** A meter wider than tall renders as a lying bar with its read-out (like a "Headroom" meter). */
export const isFlatMeter = (w: number, h: number): boolean => w > h;

// ── meters ───────────────────────────────────────────────────────────────────────────────────────

export interface MeterReading {
  paramName: string;
  role: string;
  norm: number;
  db: number | null;
}

/** Bar fill 0..1. Gain-reduction meters read inverted on the wire (1.0 = no reduction), so they grow as
 *  reduction increases; level / VU / detector meters fill with the signal. */
export function meterFill(m: MeterReading | null): number {
  return !m ? 0 : m.role === 'gainReduction' ? 1 - m.norm : m.norm;
}

/** Colour band of a bar: red from 92 %, amber from 75 %, else the accent. */
export function meterTone(fill: number): 'danger' | 'amber' | 'accent' {
  return fill >= 0.92 ? 'danger' : fill >= 0.75 ? 'amber' : 'accent';
}

/** Short per-bar tag when a block reports several monitors (L/R for VU, band number, else the role). */
export function meterTag(m: MeterReading): string {
  if (/VUL$/.test(m.paramName)) return 'L';
  if (/VUR$/.test(m.paramName)) return 'R';
  return m.paramName.match(/GAINMON(\d)$/)?.[1] ?? (m.role === 'gainReduction' ? 'GR' : m.role === 'vu' ? 'VU' : '·');
}

/** Read-out text of the primary monitor: dB with sign, else a percentage, else a dash. */
export function meterText(m: MeterReading | null): string {
  if (!m) return '—';
  if (m.db != null) return `${m.db >= 0 ? '+' : ''}${m.db.toFixed(1)} dB`;
  return `${Math.round(m.norm * 100)}%`;
}

// ── looper waveform ──────────────────────────────────────────────────────────────────────────────

/** Downsample a loop envelope to `n` peak bars. */
export function waveBars(wave: readonly number[] | null | undefined, n: number): number[] {
  if (!wave || !wave.length) return [];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i * wave.length) / n);
    const b = Math.max(a + 1, Math.floor(((i + 1) * wave.length) / n));
    let peak = 0;
    for (let j = a; j < b && j < wave.length; j++) peak = Math.max(peak, wave[j] ?? 0);
    out.push(peak);
  }
  return out;
}

// ── arrange ──────────────────────────────────────────────────────────────────────────────────────

export interface GridHit {
  /** Grid rectangle in visual px (getBoundingClientRect). */
  left: number;
  top: number;
  /** Visual / layout px (CSS zoom of an ancestor); 1 without zoom. */
  zoom: number;
  c: number;
  g: number;
  cols: number;
  rows: number;
}

/** Cell where a dragged item lands: the pointer cell minus the cell the item was grabbed at, clamped so
 *  the item stays inside the grid. */
export function dropCell(px: number, py: number, grid: GridHit, item: { w: number; h: number }, grab: { cx: number; cy: number }): { x: number; y: number } {
  const st = grid.c + grid.g;
  const z = grid.zoom > 0 ? grid.zoom : 1;
  const cx = Math.floor((px - grid.left) / z / st) - grab.cx;
  const cy = Math.floor((py - grid.top) / z / st) - grab.cy;
  return {
    x: Math.max(0, Math.min(Math.max(0, grid.cols - item.w), cx)),
    y: Math.max(0, Math.min(Math.max(0, grid.rows - item.h), cy))
  };
}

/** Cell offset inside an item at which it was grabbed (clamped to the item). */
export function grabCell(px: number, py: number, tile: { left: number; top: number }, zoom: number, step: number, item: { w: number; h: number }): { cx: number; cy: number } {
  const z = zoom > 0 ? zoom : 1;
  return {
    cx: Math.max(0, Math.min(item.w - 1, Math.floor((px - tile.left) / z / step))),
    cy: Math.max(0, Math.min(item.h - 1, Math.floor((py - tile.top) / z / step)))
  };
}

/** Size after dragging the corner handle by (dx, dy) visual px, snapped to whole cells. */
export function resizeBy(start: { w: number; h: number }, dx: number, dy: number, step: number, zoom: number): { w: number; h: number } {
  const z = zoom > 0 ? zoom : 1;
  return { w: start.w + Math.round(dx / z / step), h: start.h + Math.round(dy / z / step) };
}

/** Run an arrange operation on the drawn items only. Controls whose key the catalog does not list right
 *  now (kept block-level entries such as a meter while metering is off) are taken off their pages first,
 *  so they neither block cells nor get moved, and are put back at the end of their pages afterwards.
 *  They may then overlap a drawn item; `normalizeBoard` moves them to the nearest free spot (they come
 *  last on the page) the next time the board loads — at the latest when their key is listed again.
 *  A failed or no-op operation returns the input board unchanged (same reference). */
export function onDrawnItems<R extends { board: BeBoard; ok: boolean }>(board: BeBoard, shown: (it: BeItem) => boolean, op: (b: BeBoard) => R): R {
  const hidden: Record<string, BeItem[]> = {};
  const drawn: Record<string, BeItem[]> = { ...board.boards };
  let any = false;
  for (const pg of board.pageOrder) {
    const list = pageItems(board, pg);
    const off = list.filter((it) => !shown(it));
    if (!off.length) continue;
    any = true;
    hidden[pg] = off;
    drawn[pg] = list.filter(shown);
  }
  if (!any) return op(board);
  const input: BeBoard = { ...board, boards: drawn };
  const r = op(input);
  if (!r.ok || r.board === input) return { ...r, board };
  const boards = { ...r.board.boards };
  for (const pg of Object.keys(hidden)) if (hasOwn(boards, pg)) boards[pg] = [...(boards[pg] ?? []), ...hidden[pg]!];
  return { ...r, board: { ...r.board, boards } };
}

/** Pixel distance that turns a press into a drag. */
export const DRAG_START_PX = 5;
/** Auto-scroll while dragging near the board edge: band (px) and step (px per move). */
export const AUTOSCROLL_EDGE = 30;
export const AUTOSCROLL_STEP = 14;

/** Auto-scroll delta for a pointer near an edge of the board rectangle (0 when well inside). On a short
 *  board the edge bands shrink to a quarter of its extent each, so they never cover the whole board (a
 *  drag would otherwise scroll wherever the pointer is). */
export function autoScrollDelta(p: number, lo: number, hi: number): number {
  const edge = Math.min(AUTOSCROLL_EDGE, Math.max(0, hi - lo) / 4);
  if (p < lo + edge) return -AUTOSCROLL_STEP;
  if (p > hi - edge) return AUTOSCROLL_STEP;
  return 0;
}

/** Parameter ids of a page's pinnable controls (unique, in page order) — "Pin page". */
export function pagePinIds(items: readonly BeItem[], catalog: ReadonlyMap<string, { id: number; kind: string }>): number[] {
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const it of items) {
    const key = (it as { key?: unknown }).key;
    if (typeof key !== 'string') continue;
    const c = catalog.get(key);
    if (!c || !isPinnableKind(c) || seen.has(c.id)) continue;
    seen.add(c.id);
    ids.push(c.id);
  }
  return ids;
}

/** Controls that can be pinned to a workbench panel: real parameters that are knobs, toggles or selects. */
export function isPinnableKind(c: { id: number; kind: string }): boolean {
  return c.id >= 0 && (c.kind === 'cont' || c.kind === 'toggle' || c.kind === 'select');
}
