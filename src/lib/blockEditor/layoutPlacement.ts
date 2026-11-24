// Device-layout placement: one page of the server's device layout (rows of controls, each with optional
// placement data) → board items in cell units, so the default board looks like the device editor's page.
//
// Placement data per control (`LayoutPlacement`): `positionExact` = the control's top-left corner in the
// device editor's page, as a pixel string "x,y"; `col` = its zero-based column (one knob slot) within its
// row; `offsetX` / `offsetY` = a pixel nudge from that slot. Many pages carry none of it, many carry `col`
// only, some position (nearly) every control exactly, and some mix a few exact controls into `col` rows.
//
// How a page is laid out:
//   1. Positioned page — at least two exact controls, and at least half of the page's controls are exact.
//      Only the exact controls of the first exact control's section are positioned; everything else (the
//      page's controls without a position, the exact ones of later sections, alternates) flows below,
//      row by row (3.).
//      The pixel slot is measured per axis from the distances between neighbouring exact controls: the
//      smallest distance that recurs (a cluster of ≥ 2 values within 12 %), so one odd distance can't set
//      the scale; distances under 30 px never count (overlapping alternates, decorations). Horizontally
//      knobs first — unless the knobs only sit on every k-th slot (k ≥ 2) of the other controls, then the
//      finer all-controls slot (when it is at least 60 px) — then any standard-size control; vertically
//      any standard-size control in the same column, ignoring distances under 0.6 slot (thin selectors
//      stacked tightly). Without a recurring distance: the layout-wide slot (only when ≥ 3 distances from
//      ≥ 2 pages back it), then (horizontally) the median knob distance, then a typical device-editor
//      slot; vertically the layout-wide slot scaled to the page, else the typical proportion
//      (`verticalSlot`). One slot = 2 cells (a knob is 2×2). Every control is anchored at its top-left
//      corner (that is what the data gives: section titles sit above, separators left of the controls
//      they belong to).
//      Controls whose anchors lie (nearly) on an earlier one — within half a slot and 30 px — are
//      alternates (the device shows one or the other): the first keeps the spot, the rest flow with the
//      remainder. A page wider than 24 cells wraps by slot: each band of vertically overlapping controls
//      is cut at the last slot boundary that fits and the rest continues on a line below (everything under
//      it moves down), so the reading order holds. Standard-size controls (≤ one slot) take their anchors
//      in reading order (a blocked one goes to the nearest free spot); larger views (fader, slider, EQ
//      graph, meter, waveform) follow with a running cursor per anchor line (at their anchor or right of
//      the previous one there, else on the next lines), each first giving up height, then width (down to
//      the view's minimum).
//      Titles become `hdiv` dividers on the line above the controls they head — only when they sit above
//      those controls (a row header left of its control, or a title with nothing under it, is a gap) —
//      as wide as the run of controls under them; with no free line there a line is inserted, never
//      right under another divider line (no stacked titles). Text longer than 24 characters is a note,
//      not a title. Separators become a `vdiv` in a free column between the controls on both sides, all
//      of a device line or none.
//      Safety net — the page is laid out by rows instead (2.) when it has no standard-size control to
//      measure, when more than 15 % of its standard-size controls cannot take their anchor, or when the
//      reading order of any device line is broken (a later control of the line placed before an
//      earlier one).
//   2. Otherwise the rows flow top to bottom: controls left to right, a control with `col` starts at
//      column `col × 2`, a gap (spacer, separator, unknown parameter, duplicate) advances one knob slot,
//      a row wider than 24 cells wraps onto another line of the same row, an `offsetX` / `offsetY` nudge
//      (at most one slot) moves a control by half-knob steps when the nudged spot is free. Exact controls
//      without a column on such a page go at the end of their own row (wrapping under it). A title in a
//      row takes a line of its own above that row's controls, starting at the control it precedes.
//   3. Rows that flow (2., and the remainder of a positioned page): a change of `row.section` (e.g.
//      parameters → mixer) starts with a horizontal divider labelled with the section name, as wide as
//      the page's controls. On a positioned page gaps before the first flowing control of a row don't
//      count (the positioned controls of that row left them).
// Options let a page drop height (`fitLayoutPage`, the height budget of the default board): titles only
// on a line that is free anyway (no inserted title lines), a section divider only in a free row (else
// just the new line), positions off (rows).
//
// Deterministic: same input → same items (stable sorts, ids from the page index and key), and the
// result is already normal (no overlaps, sizes within limits), so `normalizeBoard` leaves it unchanged.
// Pure (layoutPlacement.test.ts).

import { isForeignControl, resolveControl, type LayoutOwner } from '../deviceLayoutBoard';
import type { LayoutControl, LayoutRow } from '../types';
import {
  bbox,
  BE_SPEC,
  isBlockLevelKey,
  findNear,
  fits,
  isBeView,
  isControl,
  isDivider,
  MAX_ROWS,
  MAXC,
  type BeControl,
  type BeDivider,
  type BeItem,
  type BeRect,
  type BeView
} from './boardModel';
import type { BeCtl } from './catalog';

export interface PxPoint {
  x: number;
  y: number;
}
export interface PitchPx {
  x: number;
  y: number;
}

/** Cells per knob slot (one knob = 2×2 cells). */
export const SLOT = 2;
/** A typical device-editor knob slot in pixels (a knob line is about 1.2 slots tall); used only where a
 *  layout has nothing to measure. */
export const DEFAULT_PITCH_PX: PitchPx = { x: 88, y: 106 };
/** Neighbour distances under this many pixels never count (overlapping alternates, decorations). */
export const MIN_DIST_PX = 30;
/** A positioned page is laid out by rows instead when more than this share of its standard-size
 *  controls cannot take their anchor. */
export const MAX_DISPLACED = 0.15;
/** Two exact controls are on one line when their tops differ by at most this many pixels (pitch). */
const LINE_TOL_PX = 24;
/** Two exact controls are on one device line when their tops differ by at most this many pixels
 *  (reading order, row headers, title lines). */
const DEVICE_LINE_PX = 12;
/** Distances within this fraction of a cluster's smallest value belong to the cluster. */
const CLUSTER_TOL = 0.12;
/** Two exact controls are in one column when their left edges differ by at most this share of a slot. */
const COLUMN_TOL = 0.4;
/** Vertical distances under this share of the horizontal slot don't count (tightly stacked thin controls). */
const MIN_Y_SHARE = 0.6;
/** A sane upper bound for `col` (wide rows wrap anyway). */
const MAX_COL = 63;

/** Cells a gap in a layout row advances: one knob slot. */
export const GAP_CELLS = SLOT;

// ── parsing ──────────────────────────────────────────────────────────────────────────────────────

const POS_RE = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

/** Parse an exact position `"x,y"` (pixels, whitespace allowed). Anything else — a boolean, a number, a
 *  third value, text — is no position. */
export function parsePositionExact(v: unknown): PxPoint | null {
  if (typeof v !== 'string') return null;
  const m = POS_RE.exec(v);
  if (!m) return null;
  const x = Number(m[1]);
  const y = Number(m[2]);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export interface ParsedPlacement {
  exact: PxPoint | null;
  col: number | null;
  /** Pixel nudges (0 when absent). */
  dx: number;
  dy: number;
}

/** A control's placement data, read defensively (the server passes it through unchanged). */
export function readPlacement(ctl: Pick<LayoutControl, 'placement'>): ParsedPlacement {
  const p: unknown = ctl.placement;
  const o = p && typeof p === 'object' ? (p as Record<string, unknown>) : {};
  const col = finite(o.col);
  return {
    exact: parsePositionExact(o.positionExact),
    col: col != null && col >= 0 ? Math.min(MAX_COL, Math.floor(col)) : null,
    dx: finite(o.offsetX) ?? 0,
    dy: finite(o.offsetY) ?? 0
  };
}

// ── entries ──────────────────────────────────────────────────────────────────────────────────────

export type EntryKind = 'tile' | 'label' | 'sep' | 'gap';

/** One layout control, resolved against the catalog. */
export interface LayoutEntry extends ParsedPlacement {
  kind: EntryKind;
  /** Source row index on the page. */
  row: number;
  /** The row's section ('' when the layout gives none). */
  section: string;
  /** Layout order on the page (tie-breaker everywhere). */
  index: number;
  /** tile: catalog key and view. */
  key?: string;
  view?: BeView;
  /** label: the title text. */
  text?: string;
}

/** A label widget bound to a live parameter of the block (it then stays a control). A control of another
 *  block (`isForeignControl`) is never bound to the open block's param with the same id. */
const boundToParam = (c: LayoutControl, byKey: ReadonlyMap<string, BeCtl>, owner: LayoutOwner): boolean =>
  typeof c.paramId === 'number' && !isForeignControl(c, owner) && (byKey.has(`k${c.paramId}`) || byKey.has(`e${c.paramId}`));
/** Title labels: the section titles, and the bold headings ("CAB 1", "LAYOUT") unless they show a live
 *  parameter of the block. Other label widgets (slider ticks, cab names, menu arrows…) are gaps. Whether
 *  a positioned title really heads controls is decided where it is placed. */
const isTitleLabel = (c: LayoutControl, byKey: ReadonlyMap<string, BeCtl>, owner: LayoutOwner): boolean => {
  const raw = c.rawWidget ?? '';
  return /^sectionlabel/i.test(raw) || (/^labelbold$/i.test(raw) && !boundToParam(c, byKey, owner));
};
const isSeparator = (c: LayoutControl): boolean => /^labelsep[ae]rator/i.test(c.rawWidget ?? '');
const titleText = (s: string): string => s.replace(/\s+/g, ' ').trim();
/** Longer label text is a note, not a title (a divider label is one short line). */
export const MAX_TITLE_CHARS = 24;

/** Resolve one page's rows: tiles (a catalog key + view; a key appears once per page, a repeat is a
 *  gap), titles, separators and gaps. `owner` = the open block, for the cross-block guard (a control
 *  of another block is a gap). */
export function pageEntries(rows: readonly LayoutRow[] | undefined, byKey: ReadonlyMap<string, BeCtl>, owner: LayoutOwner = {}): LayoutEntry[] {
  const out: LayoutEntry[] = [];
  const seen = new Set<string>();
  (Array.isArray(rows) ? rows : []).forEach((row, rowIndex) => {
    const section = typeof row?.section === 'string' ? row.section.trim() : '';
    for (const ctl of Array.isArray(row?.controls) ? row.controls : []) {
      if (!ctl || typeof ctl !== 'object') continue;
      const base = { ...readPlacement(ctl), row: rowIndex, section, index: out.length };
      if (isTitleLabel(ctl, byKey, owner)) {
        const text = titleText(typeof ctl.label === 'string' ? ctl.label : '');
        out.push(text && text.length <= MAX_TITLE_CHARS ? { ...base, kind: 'label', text } : { ...base, kind: 'gap' });
        continue;
      }
      if (isSeparator(ctl)) {
        out.push({ ...base, kind: 'sep' });
        continue;
      }
      const r = resolveControl(ctl, byKey, owner);
      const cat = r === 'gap' ? undefined : byKey.get(r.key);
      if (r === 'gap' || !cat || seen.has(r.key)) {
        out.push({ ...base, kind: 'gap' });
        continue;
      }
      seen.add(r.key);
      const view: BeView = isBeView(r.view) && cat.views.includes(r.view) ? r.view : cat.view;
      out.push({ ...base, kind: 'tile', key: r.key, view });
    }
  });
  return out;
}

// ── pitch ────────────────────────────────────────────────────────────────────────────────────────

/** Views the size of one knob slot or smaller; they set the grid (larger views are placed after them). */
export const isStandardView = (v: BeView): boolean => BE_SPEC[v].w <= SLOT && BE_SPEC[v].h <= SLOT;

/** For every point: the distance to its nearest neighbour further along `axis` within `tol` pixels on the
 *  other axis (same line / same column). Distances under `MIN_DIST_PX` don't count. */
export function neighbourDistances(points: readonly PxPoint[], axis: 'x' | 'y', tol: number): number[] {
  const other: 'x' | 'y' = axis === 'x' ? 'y' : 'x';
  const out: number[] = [];
  for (const p of points) {
    let best = Infinity;
    for (const q of points) {
      const d = q[axis] - p[axis];
      if (d >= MIN_DIST_PX && d < best && Math.abs(q[other] - p[other]) <= tol) best = d;
    }
    if (best < Infinity) out.push(best);
  }
  return out;
}

const median = (v: readonly number[]): number => {
  const s = v.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

interface Sample {
  d: number;
  /** Source page (layout-wide measuring). */
  page: number;
}

/** Sorted distances form clusters (each value within 12 % of its cluster's smallest); the first cluster
 *  with at least `minCount` members from at least `minPages` pages wins (its median). */
function recurringCluster(samples: readonly Sample[], minCount: number, minPages: number): number | null {
  const v = samples.filter((s) => Number.isFinite(s.d) && s.d > 0).sort((a, b) => a.d - b.d || a.page - b.page);
  let i = 0;
  while (i < v.length) {
    const start = v[i]!.d;
    let j = i;
    while (j + 1 < v.length && v[j + 1]!.d <= start * (1 + CLUSTER_TOL)) j++;
    const members = v.slice(i, j + 1);
    if (members.length >= minCount && new Set(members.map((s) => s.page)).size >= minPages) return median(members.map((s) => s.d));
    i = j + 1;
  }
  return null;
}

/** The smallest distance that recurs (a cluster of at least two within 12 %, its median), or null. */
export function recurringDistance(distances: readonly number[]): number | null {
  return recurringCluster(
    distances.map((d) => ({ d, page: 0 })),
    2,
    1
  );
}

/** The smallest plausible slot when the knobs give a coarser one: narrower spacing comes from small
 *  square buttons or half-width toggles, never from a knob slot. */
export const MIN_SLOT_PX = 60;

/** The knob slot, unless the knobs only sit on every k-th slot (k ≥ 2) of the other controls: then the
 *  finer all-controls slot (if it is a plausible slot at all). */
export function preferFinerSlot(knob: number | null, std: number | null): number | null {
  if (knob == null) return std;
  if (std == null || std >= knob || std < MIN_SLOT_PX) return knob;
  const k = Math.round(knob / std);
  return k >= 2 && Math.abs(knob / (k * std) - 1) <= CLUSTER_TOL ? std : knob;
}

export interface PitchSample {
  p: PxPoint;
  view: BeView;
}
interface PitchDistances {
  knobX: number[];
  stdX: number[];
}

function horizontalDistances(samples: readonly PitchSample[]): PitchDistances {
  const std = samples.filter((s) => isStandardView(s.view));
  return {
    knobX: neighbourDistances(std.filter((s) => s.view === 'knob').map((s) => s.p), 'x', LINE_TOL_PX),
    stdX: neighbourDistances(std.map((s) => s.p), 'x', LINE_TOL_PX)
  };
}
function verticalDistances(samples: readonly PitchSample[], pitchX: number): number[] {
  const std = samples.filter((s) => isStandardView(s.view)).map((s) => s.p);
  return neighbourDistances(std, 'y', pitchX * COLUMN_TOL).filter((d) => d >= pitchX * MIN_Y_SHARE);
}

export interface MeasuredPitch {
  /** Recurring horizontal slot, or null. */
  x: number | null;
  /** Recurring vertical slot (needs `x`), or null. */
  y: number | null;
  /** Median horizontal neighbour distance between knobs, else between any standard-size controls (a
   *  weaker fallback when nothing recurs), or null. */
  xLoose: number | null;
}

/** Measure one page's pixel slot from its exact controls. */
export function measurePitch(samples: readonly PitchSample[]): MeasuredPitch {
  const d = horizontalDistances(samples);
  const x = preferFinerSlot(recurringDistance(d.knobX), recurringDistance(d.stdX));
  const xLoose = d.knobX.length ? median(d.knobX) : d.stdX.length ? median(d.stdX) : null;
  const y = x != null ? recurringDistance(verticalDistances(samples, x)) : null;
  return { x, y, xLoose };
}

/** The layout-wide slot: every page's neighbour distances pooled. It only counts when at least three
 *  distances from at least two pages back it (one page's odd spacing — two cab sections side by side —
 *  must not set the slot of every page). Used where a page has nothing to measure itself, and for nudges
 *  on pages laid out by rows. */
export function measureLayoutPitch(pages: readonly (readonly PitchSample[])[]): { x: number | null; y: number | null } {
  const knobX: Sample[] = [];
  const stdX: Sample[] = [];
  pages.forEach((s, page) => {
    const d = horizontalDistances(s);
    for (const v of d.knobX) knobX.push({ d: v, page });
    for (const v of d.stdX) stdX.push({ d: v, page });
  });
  const x = preferFinerSlot(recurringCluster(knobX, 3, 2), recurringCluster(stdX, 3, 2));
  if (x == null) return { x: null, y: null };
  const ys: Sample[] = [];
  pages.forEach((s, page) => {
    for (const v of verticalDistances(s, x)) ys.push({ d: v, page });
  });
  return { x, y: recurringCluster(ys, 3, 2) };
}

/** The vertical slot of a page whose own lines give no recurring distance: the layout-wide vertical slot
 *  scaled to the page's horizontal slot (a page of smaller controls is smaller both ways), else the
 *  typical device-editor proportion. Never the horizontal slot itself — a knob line is taller than wide. */
export function verticalSlot(px: number, lp: { x: number | null; y: number | null } | null | undefined): number {
  if (lp?.x && lp.y) return lp.y * (px / lp.x);
  return px * (DEFAULT_PITCH_PX.y / DEFAULT_PITCH_PX.x);
}

/** Exact tiles of a page as pitch samples. */
export const pitchSamples = (entries: readonly LayoutEntry[]): PitchSample[] =>
  entries.filter((e) => e.kind === 'tile' && e.exact).map((e) => ({ p: e.exact!, view: e.view! }));

// ── page placement ───────────────────────────────────────────────────────────────────────────────

/** Titles: 'insert' — a line of their own where needed; 'free' — only on a line that is free anyway. */
export type TitleMode = 'insert' | 'free';
/** Section changes: 'line' — a divider line; 'gap' — a divider only in a row that is free anyway, else
 *  just the new line. */
export type SectionMode = 'line' | 'gap';

export interface PlacePageOptions {
  /** Index of the page on the board (part of every id). */
  pageIndex: number;
  /** The layout-wide pixel slot, where one could be measured. */
  layoutPitch?: { x: number | null; y: number | null } | null;
  titles?: TitleMode;
  sections?: SectionMode;
  /** false: lay the page out by rows even when it has exact positions. */
  positions?: boolean;
}

export interface PagePlacement {
  items: BeItem[];
  /** The page took the device positions (it passed the safety net). */
  positioned: boolean;
}

/** Deterministic, page-qualified item id (a key may sit on several pages). */
export const itemId = (pageIndex: number, key: string): string => `w${pageIndex}.${key}`;
const dividerId = (pageIndex: number, n: number): string => `w${pageIndex}.div${n}`;

const sizeOf = (view: BeView): { w: number; h: number } => ({ w: Math.min(BE_SPEC[view].w, MAXC), h: BE_SPEC[view].h });
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/** "parameters" → "Parameters". */
export const sectionTitle = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** A page is positioned when at least two of its controls are exact and they are at least half of them. */
export function isPositionedPage(entries: readonly LayoutEntry[]): boolean {
  const tiles = entries.filter((e) => e.kind === 'tile');
  const exact = tiles.filter((e) => e.exact).length;
  return exact >= 2 && exact * 2 >= tiles.length;
}

/** Lay out one page (positions when the page has them and they pass the safety net, else rows). */
export function layoutPage(entries: readonly LayoutEntry[], opts: PlacePageOptions): PagePlacement {
  if (opts.positions !== false && isPositionedPage(entries)) {
    const items = new PagePlacer(entries, opts).positioned();
    if (items) return { items, positioned: true };
  }
  return { items: new PagePlacer(entries, opts).rows(), positioned: false };
}

/** Lay out one page; the items only. */
export function placeLayoutPage(entries: readonly LayoutEntry[], opts: PlacePageOptions): BeItem[] {
  return layoutPage(entries, opts).items;
}

export type PageMode = 'positioned' | 'positioned-compact' | 'positioned-plain' | 'rows' | 'rows-compact' | 'rows-plain' | 'rows-only';

/** Lay out one page within a height budget (in cells): the first of these that fits — with positions
 *  (titles may insert lines, section dividers on lines of their own), then without inserted title lines,
 *  then also without section-divider lines (a divider only in a free row), then plain rows the same way,
 *  and last `rowsOnly` (the previous rows-only page, which sets the budget and so always fits). */
export function fitLayoutPage(
  entries: readonly LayoutEntry[],
  opts: PlacePageOptions,
  budget: number,
  rowsOnly: () => BeItem[]
): { items: BeItem[]; mode: PageMode } {
  const height = (items: readonly BeItem[]): number => (items.length ? bbox(items).R : 0);
  if (opts.positions !== false && isPositionedPage(entries)) {
    const steps: [PageMode, Partial<PlacePageOptions>][] = [
      ['positioned', { titles: 'insert', sections: 'line' }],
      ['positioned-compact', { titles: 'free', sections: 'line' }],
      ['positioned-plain', { titles: 'free', sections: 'gap' }]
    ];
    for (const [mode, o] of steps) {
      const items = new PagePlacer(entries, { ...opts, ...o }).positioned();
      if (!items) break; // the safety net turned the page down: rows
      if (height(items) <= budget) return { items, mode };
    }
  }
  const rowSteps: [PageMode, Partial<PlacePageOptions>][] = [
    ['rows', { titles: 'insert', sections: 'line' }],
    ['rows-compact', { titles: 'free', sections: 'line' }],
    ['rows-plain', { titles: 'free', sections: 'gap' }]
  ];
  for (const [mode, o] of rowSteps) {
    const items = new PagePlacer(entries, { ...opts, ...o }).rows();
    if (height(items) <= budget) return { items, mode };
  }
  return { items: rowsOnly(), mode: 'rows-only' };
}

/** One exact control of a positioned page in cells (before collisions). */
interface Anchor {
  e: LayoutEntry;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Reading order: line, then column, then layout order. */
const readingOrder = <T extends { x: number; y: number; e: LayoutEntry }>(a: T, b: T): number => a.y - b.y || a.x - b.x || a.e.index - b.e.index;

/** Wrap anchors wider than the page by slot: bands of vertically overlapping anchors (top to bottom) are
 *  cut at the last slot boundary no anchor straddles (a hard cut when there is none — the straddlers
 *  move on), each further part continuing one band height lower; everything below moves down. */
export function wrapAnchors<T extends { x: number; y: number; w: number; h: number }>(list: T[], order: (a: T, b: T) => number): void {
  if (!list.length || Math.max(...list.map((a) => a.x + a.w)) <= MAXC) return;
  const bands: { top: number; bottom: number; items: T[] }[] = [];
  for (const a of list.slice().sort(order)) {
    const last = bands[bands.length - 1];
    if (last && a.y < last.bottom) {
      last.items.push(a);
      last.bottom = Math.max(last.bottom, a.y + a.h);
    } else bands.push({ top: a.y, bottom: a.y + a.h, items: [a] });
  }
  let shift = 0;
  for (const band of bands) {
    const H = band.bottom - band.top;
    let rest = band.items;
    let start = Math.min(...rest.map((a) => a.x));
    let part = 0;
    for (;;) {
      const right = Math.max(...rest.map((a) => a.x + a.w));
      const free = (c: number) => rest.every((a) => a.x >= c || a.x + a.w <= c);
      let cut = -1;
      if (right - start > MAXC) {
        for (let c = start + MAXC; c > start && cut < 0; c--) if ((c - start) % SLOT === 0 && free(c)) cut = c;
        for (let c = start + MAXC; c > start && cut < 0; c--) if (free(c)) cut = c;
        if (cut < 0) cut = start + MAXC;
      }
      const head = cut < 0 ? rest : rest.filter((a) => a.x + a.w <= cut);
      for (const a of head) {
        a.x -= start;
        a.y += shift + part * H;
      }
      if (cut < 0 || head.length === rest.length) break;
      rest = rest.filter((a) => a.x + a.w > cut);
      start = Math.min(...rest.map((a) => a.x));
      part++;
    }
    shift += part * H;
  }
}

/** Places one page. `positioned()` returns null when the safety net turns the page down. */
class PagePlacer {
  private readonly placed: BeItem[] = [];
  private readonly sectionDividers: BeDivider[] = [];
  private divCount = 0;
  private tag = 0;
  private line = 0;
  private readonly flowPitch: PitchPx;
  private readonly titles: TitleMode;
  private readonly sections: SectionMode;

  constructor(
    private readonly entries: readonly LayoutEntry[],
    private readonly opts: PlacePageOptions
  ) {
    const lp = opts.layoutPitch ?? null;
    this.flowPitch = { x: lp?.x ?? DEFAULT_PITCH_PX.x, y: lp?.y ?? verticalSlot(lp?.x ?? DEFAULT_PITCH_PX.x, lp) };
    this.titles = opts.titles ?? 'insert';
    this.sections = opts.sections ?? 'line';
  }

  // ── shared ──

  private newDivider(kind: BeDivider['kind'], r: BeRect, label?: string): BeDivider {
    const d: BeDivider = { id: dividerId(this.opts.pageIndex, this.divCount++), kind, ...r };
    if (label) d.label = label;
    return d;
  }
  private put(e: LayoutEntry, x: number, y: number, w: number, h: number, row: number): BeControl {
    const c: BeControl = { id: itemId(this.opts.pageIndex, e.key!), key: e.key!, view: e.view!, x, y, w, h, row };
    this.placed.push(c);
    return c;
  }
  /** At (x,y) when free, else at the nearest free spot. */
  private putNear(e: LayoutEntry, x: number, y: number, row: number): BeControl {
    const { w, h } = sizeOf(e.view!);
    const sx = clamp(x, 0, MAXC - w);
    const sy = clamp(y, 0, MAX_ROWS - h);
    const at = fits(this.placed, sx, sy, w, h) ? { x: sx, y: sy } : findNear(this.placed, w, h, sx, sy);
    return this.put(e, at.x, at.y, w, h, row);
  }
  private get firstTileSection(): string {
    return this.entries.find((e) => e.kind === 'tile')?.section ?? '';
  }
  /** Section dividers span the controls' width (as far as their line is free). */
  private finish(): BeItem[] {
    if (this.sectionDividers.length) {
      const C = clamp(bbox(this.placed.filter(isControl)).C, BE_SPEC.hdiv.minW, MAXC);
      for (const d of this.sectionDividers) {
        const others = this.placed.filter((it) => it !== d);
        let w = C;
        while (w > BE_SPEC.hdiv.minW && !fits(others, d.x, d.y, w, 1)) w--;
        d.w = w;
      }
    }
    return this.placed;
  }

  // ── rows ──

  /** The whole page by rows. */
  rows(): BeItem[] {
    this.flowRows(new Set(), false, this.firstTileSection);
    return this.finish();
  }

  /** Rows top to bottom, without the entries in `skip`. `positioned`: the remainder of a positioned page. */
  private flowRows(skip: ReadonlySet<LayoutEntry>, positioned: boolean, startSection: string): void {
    let lastSection = startSection;
    const byRow = new Map<number, LayoutEntry[]>();
    for (const e of this.entries) {
      if (skip.has(e)) continue;
      const list = byRow.get(e.row);
      if (list) list.push(e);
      else byRow.set(e.row, [e]);
    }
    for (const rowIndex of [...byRow.keys()].sort((a, b) => a - b)) {
      const row = byRow.get(rowIndex)!;
      if (!row.some((e) => e.kind === 'tile')) continue;
      // the section change first: a row of spilled controls still starts its section
      const section = row[0]!.section;
      if (section !== lastSection) {
        if (section && lastSection && this.placed.some(isControl)) this.sectionBreak(section);
        lastSection = section;
      }
      this.placeRow(row, positioned);
    }
  }

  /** A labelled divider before a new section: on a line of its own ('line'), or in a free row just above
   *  ('gap'; without one the new section only starts a new line). */
  private sectionBreak(section: string): void {
    const label = sectionTitle(section);
    if (this.sections === 'gap') {
      const C = clamp(bbox(this.placed.filter(isControl)).C, BE_SPEC.hdiv.minW, MAXC);
      if (this.line > 0 && fits(this.placed, 0, this.line - 1, C, 1)) {
        const d = this.newDivider('hdiv', { x: 0, y: this.line - 1, w: C, h: 1 }, label);
        this.placed.push(d);
        this.sectionDividers.push(d);
      }
      return;
    }
    const d = this.newDivider('hdiv', { x: 0, y: this.line, w: MAXC, h: 1 }, label);
    this.placed.push(d);
    this.sectionDividers.push(d);
    this.line += 1;
  }

  /** One row: controls left → right (col / cursor / nudge), wrapping at 24 cells; exact controls without
   *  a column at the end of the row (rows pages); titles on a line of their own above. */
  private placeRow(row: readonly LayoutEntry[], positioned: boolean): void {
    const rowTag = this.tag++;
    // a title starts at the next control placed in the row's flow (else the next control at all)
    const titles: { text: string; colX: number | null; next: LayoutEntry | null; nextAny: LayoutEntry | null }[] = [];
    const plan: { e: LayoutEntry; x: number; dx: number; dy: number }[] = [];
    const spill: LayoutEntry[] = [];
    let cursor = 0;
    const nudge = (px: number, slot: number): number => clamp(Math.round((px / slot) * SLOT), -SLOT, SLOT);
    for (const e of row) {
      if (e.kind === 'gap' || e.kind === 'sep') {
        // a positioned page's remainder: the gaps before its first flowing control belonged to the
        // positioned controls of the row
        if (positioned && !plan.length) continue;
        cursor = (e.col != null ? e.col * SLOT : cursor) + GAP_CELLS;
        continue;
      }
      if (e.kind === 'label') {
        titles.push({ text: e.text!, colX: e.col != null ? e.col * SLOT : null, next: null, nextAny: null });
        continue;
      }
      for (const t of titles) t.nextAny ??= e;
      if (!positioned && e.exact && e.col == null) {
        spill.push(e);
        continue;
      }
      for (const t of titles) t.next ??= e;
      const { w } = sizeOf(e.view!);
      const x = e.col != null ? e.col * SLOT : cursor;
      const dx = nudge(e.dx, this.flowPitch.x);
      const dy = nudge(e.dy, this.flowPitch.y);
      plan.push({ e, x, dx, dy });
      cursor = x + dx + w;
    }
    const titleLine = titles.some((t) => t.next ?? t.nextAny) && this.titles === 'insert';
    const top = this.line + (titleLine ? 1 : 0);
    // target spots: wrap at 24 cells (a wrapped line keeps the row's later columns in step)
    let sub = top;
    let shift = 0;
    let subH = 1;
    const targets = plan.map((p) => {
      const { w, h } = sizeOf(p.e.view!);
      let x = p.x - shift;
      if (x + p.dx + w > MAXC && x > 0) {
        sub += subH;
        subH = 1;
        shift = p.x;
        x = 0;
      }
      subH = Math.max(subH, h);
      return { p, w, h, x: clamp(x, 0, MAXC - w), y: sub, nx: clamp(x + p.dx, 0, MAXC - w), ny: Math.max(top, sub + p.dy) };
    });
    // every control at its spot first (a nudge only where the nudged spot is free), then the blocked
    // ones at the nearest free spot — so one collision never pushes the rest of the row along
    const got: (BeControl | null)[] = targets.map((t) => {
      if ((t.p.dx || t.p.dy) && fits(this.placed, t.nx, t.ny, t.w, t.h)) return this.put(t.p.e, t.nx, t.ny, t.w, t.h, rowTag);
      return fits(this.placed, t.x, t.y, t.w, t.h) ? this.put(t.p.e, t.x, t.y, t.w, t.h, rowTag) : null;
    });
    targets.forEach((t, i) => {
      if (!got[i]) got[i] = this.putNear(t.p.e, t.x, t.y, rowTag);
    });
    const at = new Map<LayoutEntry, BeControl>();
    got.forEach((c, i) => at.set(targets[i]!.p.e, c!));
    // exact controls without a column: at the end of the row, wrapping under it
    if (spill.length) {
      const last = targets.length ? targets[targets.length - 1]! : null;
      const lineY = last ? last.y : top;
      const onLine = got.filter((c): c is BeControl => !!c && c.y === lineY);
      const startX = Math.max(0, ...onLine.map((c) => c.x + c.w));
      const lineH = Math.max(1, ...onLine.map((c) => c.h));
      this.flowLine(spill, startX, lineY, lineH, rowTag, at);
    }
    if (titles.length) {
      const firstLine = [...at.values()].filter((c) => c.y === top);
      if (titleLine) this.placeRowTitles(titles, at, firstLine, this.line);
      else if (this.line > 0) this.placeRowTitles(titles, at, firstLine, this.line - 1); // only if that line is free
    }
    this.line = Math.max(this.line + 1, bbox(this.placed).R);
  }

  /** Section titles of one row on the line `y`: each starts at the control it precedes (or its col) and
   *  reaches over the run of controls under it, up to the next title. */
  private placeRowTitles(
    titles: { text: string; colX: number | null; next: LayoutEntry | null; nextAny: LayoutEntry | null }[],
    cells: ReadonlyMap<LayoutEntry, BeControl>,
    under: BeControl[],
    y: number
  ): void {
    const at = titles
      .map((t) => {
        const n = t.next ?? t.nextAny;
        return { text: t.text, x: t.colX ?? (n ? cells.get(n)?.x : undefined) ?? null };
      })
      .filter((t): t is { text: string; x: number } => t.x != null)
      .sort((a, b) => a.x - b.x);
    at.forEach((t, i) => {
      const cap = at[i + 1]?.x ?? MAXC;
      const w = titleWidth(t.x, under, cap);
      if (w < BE_SPEC.hdiv.minW) return;
      const r = { x: clamp(t.x, 0, MAXC - w), y, w, h: 1 };
      if (fits(this.placed, r.x, r.y, r.w, r.h)) this.placed.push(this.newDivider('hdiv', r, t.text));
    });
  }

  /** Flow controls from (x, y) on a line `h0` high (wrapping at 24 cells onto the following lines). */
  private flowLine(list: readonly LayoutEntry[], x0: number, y: number, h0: number, rowTag: number, at: Map<LayoutEntry, BeControl>): void {
    let x = x0;
    let sub = y;
    let subH = h0;
    for (const e of list) {
      const { w } = sizeOf(e.view!);
      if (x + w > MAXC) {
        sub += subH;
        subH = 1;
        x = 0;
      }
      const c = this.putNear(e, x, sub, rowTag);
      at.set(e, c);
      if (c.y === sub) {
        x = c.x + c.w;
        subH = Math.max(subH, c.h);
      }
    }
  }

  // ── positions ──

  /** The page with its device positions (see the header), or null when the safety net turns it down. */
  positioned(): BeItem[] | null {
    const lp = this.opts.layoutPitch ?? null;
    const exactTiles = this.entries.filter((e) => e.kind === 'tile' && e.exact);
    if (exactTiles.length < 2) return null;
    const section = exactTiles[0]!.section;
    const cands = exactTiles.filter((e) => e.section === section);
    const own = measurePitch(pitchSamples(cands));
    const px = own.x ?? lp?.x ?? own.xLoose ?? DEFAULT_PITCH_PX.x;
    const py = own.y ?? verticalSlot(px, lp);

    // alternates: an anchor (nearly) on an earlier one — within half a slot, but never as far as two
    // controls the device shows side by side (square buttons, mini sliders sit 36–40 px apart)
    const near = Math.min(px / 2, MIN_DIST_PX);
    const kept: LayoutEntry[] = [];
    for (const e of cands) {
      if (!kept.some((k) => Math.abs(k.exact!.x - e.exact!.x) < near && Math.abs(k.exact!.y - e.exact!.y) < Math.min(py / 2, MIN_DIST_PX))) kept.push(e);
    }
    const stdCount = kept.filter((e) => isStandardView(e.view!)).length;
    if (kept.length < 2 || !stdCount) return null;

    // anchors in cells, wrapped by slot when wider than the page
    const ox = Math.min(...kept.map((e) => e.exact!.x));
    const oy = Math.min(...kept.map((e) => e.exact!.y));
    const anchors: Anchor[] = kept.map((e) => {
      const { w, h } = sizeOf(e.view!);
      return { e, w, h, x: Math.max(0, Math.round(((e.exact!.x - ox) / px) * SLOT)), y: clamp(Math.round(((e.exact!.y - oy) / py) * SLOT), 0, MAX_ROWS - h) };
    });
    wrapAnchors(anchors, readingOrder);
    for (const a of anchors) {
      a.x = clamp(a.x, 0, MAXC - a.w);
      a.y = clamp(a.y, 0, MAX_ROWS - a.h);
    }
    const at = new Map<LayoutEntry, BeControl>();

    // standard-size controls at their anchors (reading order); too many blocked → rows
    const std = anchors.filter((a) => isStandardView(a.e.view!)).sort(readingOrder);
    const blocked = std.filter((a) => {
      if (!fits(this.placed, a.x, a.y, a.w, a.h)) return true;
      at.set(a.e, this.put(a.e, a.x, a.y, a.w, a.h, 0));
      return false;
    });
    if (blocked.length > MAX_DISPLACED * std.length) return null;
    for (const a of blocked) at.set(a.e, this.putNear(a.e, a.x, a.y, 0));

    // larger views: a running cursor per anchor line, height given up before width
    const lineRight = new Map<number, number>();
    for (const a of anchors.filter((a) => !isStandardView(a.e.view!)).sort(readingOrder)) {
      const c = this.putLarge(a, Math.max(a.x, lineRight.get(a.y) ?? 0));
      at.set(a.e, c);
      lineRight.set(a.y, c.x + c.w);
    }

    if (!this.readingOrderKept(kept, at)) return null;

    // titles, then separators (both relative to the placed controls)
    const handled = new Set<LayoutEntry>(cands);
    for (const e of this.entries) if ((e.kind === 'label' || e.kind === 'sep') && e.exact && e.section === section) handled.add(e);
    this.placeTitles(kept, at, section, px, py);
    this.placeSeparators(kept, at, section, py);

    // reading-order line tags (a narrow reflow keeps the device's lines)
    const lineTags = new Map<number, number>();
    for (const y of [...new Set(this.placed.filter(isControl).map((c) => c.y))].sort((a, b) => a - b)) lineTags.set(y, lineTags.size);
    for (const c of this.placed) if (isControl(c)) c.row = lineTags.get(c.y)!;
    this.tag = lineTags.size;
    this.line = bbox(this.placed).R;

    // the remainder: alternates, controls without a position, later sections — by rows below
    const skip = new Set<LayoutEntry>([...handled].filter((e) => e.kind !== 'tile' || kept.includes(e)));
    this.flowRows(skip, true, section);
    return this.finish();
  }

  /** A larger view from (x0, anchor line): rightwards on its line, then the following lines (from its
   *  anchor column, then from the left); at every spot height is given up first, then width. */
  private putLarge(a: Anchor, x0: number): BeControl {
    const spec = BE_SPEC[a.e.view!];
    const last = Math.max(bbox(this.placed).R, a.y) + 1;
    for (let y = a.y; y <= last; y++) {
      const xs: number[] = [];
      if (y === a.y) for (let x = x0; x + spec.minW <= MAXC; x++) xs.push(x);
      else {
        for (let x = a.x; x + spec.minW <= MAXC; x++) xs.push(x);
        for (let x = 0; x < a.x && x + spec.minW <= MAXC; x++) xs.push(x);
      }
      for (const x of xs) {
        for (let w = Math.min(a.w, MAXC - x); w >= spec.minW; w--) {
          for (let h = a.h; h >= spec.minH; h--) {
            if (fits(this.placed, x, y, w, h)) return this.put(a.e, x, y, w, h, 0);
          }
        }
      }
    }
    return this.putNear(a.e, a.x, last, 0);
  }

  /** Device lines (exact tops within a few pixels) keep their left-to-right order on the board: every
   *  control after the one left of it (a later line, or the same line further right). Block-level
   *  controls (EQ graph, graph displays, meter, waveform, bypass) don't count. */
  private readingOrderKept(kept: readonly LayoutEntry[], at: ReadonlyMap<LayoutEntry, BeControl>): boolean {
    const lines: { y: number; m: LayoutEntry[] }[] = [];
    for (const e of kept.filter((e) => !isBlockLevelKey(e.key!)).sort((a, b) => a.exact!.y - b.exact!.y || a.index - b.index)) {
      const l = lines.find((l) => Math.abs(l.y - e.exact!.y) <= DEVICE_LINE_PX);
      if (l) l.m.push(e);
      else lines.push({ y: e.exact!.y, m: [e] });
    }
    for (const l of lines) {
      const cs = l.m.sort((a, b) => a.exact!.x - b.exact!.x || a.index - b.index).map((e) => at.get(e)!);
      for (let i = 1; i < cs.length; i++) {
        const a = cs[i - 1]!;
        const b = cs[i]!;
        if (b.y < a.y || (b.y === a.y && b.x < a.x)) return false;
      }
    }
    return true;
  }

  /** Titles of the positioned section: a title heads the controls of the nearest device line below it
   *  (within one vertical slot) from its own column up to the next title of its line, and only when the
   *  first of them starts within one slot of it; a label with a control on its own line to its right is
   *  a row header. A title goes on the line above its controls: there when that is free, else (titles
   *  'insert') on a line inserted above them — never right under another divider line. */
  private placeTitles(kept: readonly LayoutEntry[], at: ReadonlyMap<LayoutEntry, BeControl>, section: string, px: number, py: number): void {
    const titles = this.entries.filter((e) => e.kind === 'label' && e.exact && e.section === section).sort((a, b) => a.exact!.y - b.exact!.y || a.exact!.x - b.exact!.x || a.index - b.index);
    for (const t of titles) {
      const tp = t.exact!;
      // a row header: a control on the label's own line, to its right
      if (kept.some((e) => Math.abs(e.exact!.y - tp.y) <= DEVICE_LINE_PX && e.exact!.x > tp.x && e.exact!.x - tp.x <= px * 2)) continue;
      const below = kept.filter((e) => e.exact!.y > tp.y && e.exact!.y - tp.y <= py);
      if (!below.length) continue;
      const lineY = Math.min(...below.map((e) => e.exact!.y));
      const nextX = Math.min(...titles.filter((o) => o !== t && Math.abs(o.exact!.y - tp.y) <= DEVICE_LINE_PX && o.exact!.x > tp.x).map((o) => o.exact!.x));
      // (a control up to half a slot left of a title belongs to that title)
      const headed = below.filter((e) => e.exact!.y - lineY <= DEVICE_LINE_PX && e.exact!.x >= tp.x - px / 2 && e.exact!.x < nextX - px / 2).sort((a, b) => a.exact!.x - b.exact!.x);
      if (!headed.length || headed[0]!.exact!.x - tp.x > px) continue;
      const cells = headed.map((e) => at.get(e)!);
      const top = Math.min(...cells.map((c) => c.y));
      const onTop = cells.filter((c) => c.y === top);
      const x = Math.min(...onTop.map((c) => c.x));
      const w = titleWidth(x, onTop, MAXC);
      if (w < BE_SPEC.hdiv.minW) continue;
      if (top > 0 && fits(this.placed, x, top - 1, w, 1)) {
        this.placed.push(this.newDivider('hdiv', { x, y: top - 1, w, h: 1 }, t.text));
        continue;
      }
      if (this.titles !== 'insert') continue;
      // no stacked titles: never a title line right under another divider line
      if (top > 0 && this.placed.some((it) => isDivider(it) && it.kind === 'hdiv' && it.y === top - 1)) continue;
      for (const it of this.placed) if (it.y >= top) it.y += 1;
      this.placed.push(this.newDivider('hdiv', { x, y: top, w, h: 1 }, t.text));
    }
  }

  /** Separators of the positioned section: a vertical line in a free column between the controls left
   *  and right of it on its device line (both on one board line), as tall as the controls under them;
   *  heights down to the minimum are tried; all separators of a device line or none. */
  private placeSeparators(kept: readonly LayoutEntry[], at: ReadonlyMap<LayoutEntry, BeControl>, section: string, py: number): void {
    const seps = this.entries.filter((e) => e.kind === 'sep' && e.exact && e.section === section).sort((a, b) => a.exact!.y - b.exact!.y || a.exact!.x - b.exact!.x || a.index - b.index);
    const lines: { y: number; m: LayoutEntry[] }[] = [];
    for (const s of seps) {
      const l = lines.find((l) => Math.abs(l.y - s.exact!.y) <= DEVICE_LINE_PX);
      if (l) l.m.push(s);
      else lines.push({ y: s.exact!.y, m: [s] });
    }
    for (const l of lines) {
      const planned: BeRect[] = [];
      let ok = true;
      for (const s of l.m) {
        const sp = s.exact!;
        const near = kept.filter((e) => Math.abs(e.exact!.y - sp.y) <= py / 2);
        const left = near.filter((e) => e.exact!.x < sp.x).sort((a, b) => b.exact!.x - a.exact!.x)[0];
        const right = near.filter((e) => e.exact!.x > sp.x).sort((a, b) => a.exact!.x - b.exact!.x)[0];
        const L = left && at.get(left);
        const R = right && at.get(right);
        if (!L || !R || L.y !== R.y || R.x <= L.x + L.w) {
          ok = false;
          break;
        }
        const x = L.x + L.w;
        const strip = this.placed.filter((c): c is BeControl => isControl(c) && c.y >= L.y && c.x < R.x + R.w && c.x + c.w > L.x);
        const bottom = Math.max(L.y + Math.max(L.h, R.h), ...strip.map((c) => c.y + c.h));
        const spec = BE_SPEC.vdiv;
        let r: BeRect | null = null;
        for (let h = clamp(bottom - L.y, spec.minH, spec.maxH); h >= spec.minH && !r; h--) {
          if (fits([...this.placed, ...planned.map((p, i) => ({ ...p, id: `p${i}` }))], x, L.y, 1, h)) r = { x, y: L.y, w: 1, h };
        }
        if (!r) {
          ok = false;
          break;
        }
        planned.push(r);
      }
      if (ok) for (const r of planned) this.placed.push(this.newDivider('vdiv', r));
    }
  }
}

/** Width of a title at x: over the contiguous run of controls starting at x, capped by `cap`. */
function titleWidth(x: number, under: readonly BeRect[], cap: number): number {
  let end = x;
  for (const c of under.slice().sort((a, b) => a.x - b.x)) {
    if (c.x + c.w <= x) continue;
    if (c.x > end) break;
    end = Math.max(end, c.x + c.w);
  }
  if (end === x) end = x + BE_SPEC.hdiv.w;
  return clamp(Math.min(end, cap) - x, 0, MAXC - Math.min(x, MAXC - BE_SPEC.hdiv.minW));
}
