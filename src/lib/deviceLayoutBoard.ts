// Pure builder for the ControlSurface "Default" board from a device-authentic DeviceLayout (v2).
//
// The layout arrives already variant-selected by the server (the block's current type picks the
// variant), so we render its pages as tabs and, INSIDE each page, honour the editor's rows: rows flow
// top→bottom, and within a row controls are placed by one of two paths.
//
//   1. AUTHORED COLUMNS (`authoredX`) — when the row carries `placement.col`, that index IS the layout.
//      It encodes the true visual order (the amp's Authentic row 1 arrives as `[Bright col 4, Input Trim
//      col 0]` — array order is NOT left→right), deliberate holes (`Master Volume` at col 8, col 7 left
//      empty), and cross-row alignment (the Cathode Follower knobs at cols 3/4, sitting under the Power
//      Tube knobs above them). Flowing the array instead — which is all this module used to do — silently
//      destroyed all three.
//   2. FLOW — rows the device authored no column for keep the original band-aware left→right sweep,
//      wrapping at the column count. This is most FM3 blocks (Drive, Filter, Reverb), so the flow path is
//      the no-regression path and is asserted byte-identical in the tests.
//
// Consecutive `mixer`-section rows are coalesced into one strip first (`coalesceRows`) — the device
// splits its mixer across rows to suit a fixed-width canvas, which otherwise strands a block's master
// `Level` alone on its own full-width line. The board model is a flat grid of positioned
// widgets per page (`SurfaceWidget[]`); we compute each widget's grid cell from the row structure and
// tag it with its source `row` so the responsive re-pack (ControlSurface.packRows) can preserve the
// row breaks at any width. Widgets also carry a `group` — one band's set of controls (the PEQ's
// `Frequency 3`/`Type 3`/`Gain 3`/`Q3`/`S3`) — and neither the build nor the re-pack ever breaks a line
// in the middle of one: the device's own editor keeps a band together, and a set split across two lines
// is unreadable. This module is UI-free (no Svelte) so the mapping + layout can be unit-tested.
//
// Widget-type → view mapping is deliberately conservative: whenever a control resolves to a live
// catalog entry we start from that entry's own kind/default view (so FM3's mostly-`unknown` migrated
// data renders exactly as it did pre-v2 — no regression) and only refine the VIEW when the layout's
// widget hint is meaningful (slider/number for a continuous param, switch/button for a toggle). Controls
// with no live parameter fall back to the block's meter / bypass / EQ catalog entries where they exist,
// or advance the cursor as a gap (spacers, labels, and params the device didn't surface).

import type { DeviceLayout, LayoutControl, LayoutRow, MonitorEntry, MonitorParams } from './types';

/** Monitor rows for ONE device family (e.g. `DISTORT`), keyed by device-true pid.
 *
 *  Family scoping is NOT optional. Monitor pids are unique only within a family: pid 8 is
 *  `INPUT_GAINMONITOR` in INPUT but `Bass 1` in the amp, and pid 61 is `CABINET_VUMETER` in CABINET but
 *  `Freq 1` in the delay. Matching a monitor on pid alone would render real, editable knobs as
 *  read-only meters in unrelated blocks. */
export function monitorsByFamily(
  table: MonitorParams | null | undefined,
  family: string | null | undefined
): Map<number, MonitorEntry> {
  const out = new Map<number, MonitorEntry>();
  if (!table || !family) return out;
  for (const [token, m] of Object.entries(table)) {
    if (m.family === family) out.set(m.pid, { ...m, token });
  }
  return out;
}

export interface SurfaceWidget {
  id: string;
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  view: string;
  /** Source layout row index (device-authentic boards only) — drives row-preserving re-pack. */
  row?: number;
  /** Band-set id: controls of one band (`Frequency 3`/`Type 3`/`Gain 3`/`Q3`/`S3`) share it and never
   *  get split across a wrap. Device-authentic boards only. */
  group?: number;
  /** Effective device-authored column (from `placement.col`, gaps filled forward — see `authoredX`).
   *  Present only on rows the device actually authored; `packRows` honours it instead of re-flowing. */
  col?: number;
  /** This widget is a block-level control (Level/Balance/Bypass Mode/Bypass/Scene Ignore) rather than a
   *  page parameter. ControlSurface renders these as a fixed right-hand rail outside the page area, so
   *  they do not move when the page tab changes. See `railControls`. */
  rail?: boolean;
}
export interface SurfaceBoard {
  pageOrder: string[];
  page: string;
  boards: Record<string, SurfaceWidget[]>;
  /** Fingerprint of the served layout variant; used to re-seed the Default board on a type change. */
  variantSig?: string;
}

/** The subset of a ControlSurface `Ctl` the builder needs (catalog entry). */
export interface BoardCtl {
  key: string;
  kind: string; // 'cont' | 'toggle' | 'select' | 'eq' | 'action' | 'meter' | 'wave'
  id: number;
  w: number;
  h: number;
  view: string;
  views: readonly string[];
}

const isBypassControl = (ctl: LayoutControl): boolean =>
  /bypass/i.test(ctl.rawWidget ?? '') || /bypass/i.test(ctl.label ?? '') || /bypass/i.test(ctl.paramName ?? '');

/** The band a control belongs to: the trailing number of its device symbol (`PEQ_FREQ3`, `PEQ_TYPE3`,
 *  `PEQ_Q3` → 3), falling back to the display label (`Frequency 3` → 3). Controls with no trailing
 *  number belong to no band and stand alone. Adjacent controls sharing an index are one set — that is
 *  exactly how the device's own editor groups them, and it is what must not straddle a line break. */
function bandIndex(ctl: LayoutControl): number | null {
  const m = /(\d+)\s*$/.exec(ctl.paramName ?? ctl.label ?? '');
  return m ? Number(m[1]) : null;
}

/** Pick the view for a control that resolved to a live catalog entry. Falls back to the entry's own
 *  default view (and only ever returns a view the entry actually supports) so an `unknown`/unmapped
 *  widget renders identically to the pre-v2 catalog default. */
function viewForWidget(widget: string, base: BoardCtl): string {
  let candidate = base.view;
  if (base.kind === 'cont') {
    if (widget === 'slider') candidate = 'slider';
    else if (widget === 'fader') candidate = 'fader';
    else if (widget === 'number' || widget === 'readout' || widget === 'meter') candidate = 'number';
    else if (widget === 'knob') candidate = 'knob';
    else if (widget === 'number' || widget === 'readout' || widget === 'meter' || widget === 'dropdown') candidate = 'number';
  } else if (base.kind === 'toggle') {
    if (widget === 'toggle') candidate = 'switch';
    else if (widget === 'button') candidate = 'button';
  }
  return base.views.includes(candidate) ? candidate : base.view;
}

/** Place a set of same-row items at the columns the device's own editor authored for them.
 *
 *  The device sends `placement.col` — a zero-based column index within the row — for many controls, and
 *  it is load-bearing in two ways the old sequential flow destroyed. It carries the true VISUAL order
 *  (the amp's Authentic row 1 arrives as `[Bright col 4, Input Trim col 0]`: array order is NOT left→right),
 *  and it carries deliberate holes and cross-row alignment (`Master Volume` at col 8 with col 7 empty;
 *  the Cathode Follower knobs at cols 3/4 so they sit under the Power Tube knobs on the row above).
 *
 *  Items are sorted by authored column, then swept left→right with a monotonic cursor. The cursor is what
 *  keeps the result well-formed when Axis's own widget widths disagree with the editor's one-control-
 *  per-column grid — a `select` is 2 cells wide, so an authored column can be occupied by the time we
 *  reach it. `max(col, cursor)` then shifts that control right rather than overlapping its neighbour;
 *  every column the widths leave alone still lands exactly where the device asked.
 *
 *  Returns null when the row extent cannot fit `columns` (a narrow pane), so the caller falls back to the
 *  group-aware flow+wrap path instead of overflowing off the right edge. */
function authoredX(items: readonly { col?: number | null; w: number }[], columns: number): number[] | null {
  if (!items.length || !items.every((i) => i.col != null)) return null;
  const order = items.map((_, i) => i).sort((a, b) => items[a].col! - items[b].col! || a - b);
  const xs = new Array<number>(items.length);
  let cursor = 0;
  for (const i of order) {
    const w = Math.min(Math.max(1, items[i].w), columns);
    const x = Math.max(items[i].col!, cursor);
    if (x + w > columns) return null;
    xs[i] = x;
    cursor = x + w;
  }
  return xs;
}

/** One row as the board actually lays it out. Consecutive `mixer` rows are coalesced into ONE strip:
 *  the device splits its mixer across rows to suit a fixed ~1280px canvas where the strip runs down the
 *  right-hand edge (the cab's `Balance` carries `positionExact: "1179,185"`), so rendering each of those
 *  rows as its own full-width grid line strands the block's master `Level` alone at the far left, reading
 *  as a bug rather than as a footer. Coalescing puts Level/Balance/Bypass/Scene Ignore back on one line.
 *
 *  Left-aligned, not right-pinned: the device's right edge is an artifact of its fixed canvas, and in
 *  Axis's variable-width board a right-pinned strip drifts away from the controls it acts on. */
type EffRow = { controls: LayoutControl[]; strip: boolean };
function coalesceRows(rows: readonly LayoutRow[] | undefined): EffRow[] {
  const out: EffRow[] = [];
  for (const r of rows ?? []) {
    const strip = r.section === 'mixer';
    const prev = out[out.length - 1];
    if (strip && prev?.strip) prev.controls.push(...(r.controls ?? []));
    else out.push({ controls: [...(r.controls ?? [])], strip });
  }
  return out;
}

type Resolved = { key: string; view: string } | 'gap';

/** Resolve one layout control to a catalog key + view, or `'gap'` (advance the cursor, draw nothing —
 *  spacers, labels, and parameters the device did not surface as a knob/enum). */
function resolveControl(
  ctl: LayoutControl,
  byKey: Map<string, BoardCtl>,
  geqBandIds: Set<number>,
  graphKey: string | null
): Resolved {
  if (ctl.widget === 'spacer') return 'gap';
  // Graphic-EQ bands collapse into ONE fader-bank widget (`geq`) — the layout lists them as N separate
  // sliders, so every band resolves to the same key and the caller's `seen` de-dupe drops the repeats.
  // Their column advances leave no holes: device-authentic boards are re-packed by `packRows`, which
  // recomputes `x` per source row.
  if (ctl.paramId != null && geqBandIds.has(ctl.paramId) && byKey.has('geq')) return { key: 'geq', view: 'geq' };
  // A pid the block reports as a read-only MONITOR beats any same-pid parameter entry. The device
  // surfaces several monitors in the ordinary param list as well (amp `HEADROOM`/`B+`/`Gain`, cab
  // `VU`/gain, comp/input/output `Gain`), so WITHOUT this the `paramId` branch below resolves them to
  // an editable knob — discarding the meter hint and letting a drag write to a read-only value.
  // Family-safe: `m<pid>` keys are built from the OPEN block's family-scoped monitor table, so amp
  // pid 8 (`Bass 1`) can never match INPUT_GAINMONITOR's pid 8.
  if (ctl.paramId != null) {
    const monKey = `m${ctl.paramId}`;
    const monBase = byKey.get(monKey);
    if (monBase) return { key: monKey, view: monBase.view };
  }
  // A live param → its catalog entry (knob `k<id>` or enum `e<id>`), refined by the widget hint.
  if (ctl.paramId != null) {
    const knobKey = `k${ctl.paramId}`;
    const enumKey = `e${ctl.paramId}`;
    const base = byKey.get(knobKey) ?? byKey.get(enumKey);
    if (base) return { key: base.key, view: viewForWidget(ctl.widget, base) };
  }
  // No live param → the block-level catalog entries the widget hint points at.
  if (ctl.widget === 'meter' && byKey.has('meter')) return { key: 'meter', view: 'meter' };
  if (ctl.widget === 'button' && isBypassControl(ctl) && byKey.has('bypass')) return { key: 'bypass', view: 'action' };
  // The response graph THIS page draws (a block can have several — the amp's Input EQ and Speaker
  // curves are different bands — so the key comes from the page, not from a single global `eq`).
  if ((ctl.widget === 'graph' || ctl.widget === 'label') && graphKey && byKey.has(graphKey)) {
    return { key: graphKey, view: 'eq' };
  }
  // Labels, unresolved dropdowns, and anything else with no binding: leave a gap (matches the pre-v2
  // behaviour of silently skipping unmapped controls, but keeps neighbours' horizontal alignment).
  return 'gap';
}

/** Left→right, wrapping sweep of catalog entries into `cols` (used for the trailing "More" page — no
 *  row structure to preserve, just a tidy fill in catalog order). */
function packSequential(ctls: BoardCtl[], cols: number): SurfaceWidget[] {
  const out: SurfaceWidget[] = [];
  let x = 0;
  let y = 0;
  let rowH = 1;
  for (const c of ctls) {
    const w = Math.min(c.w, cols);
    if (x + w > cols) {
      y += rowH;
      x = 0;
      rowH = 1;
    }
    out.push({ id: 'w' + c.key, key: c.key, x, y, w, h: c.h, view: c.view });
    x += w;
    rowH = Math.max(rowH, c.h);
  }
  return out;
}

/** Rail membership for layouts the device did NOT tag with a `mixer` section — the paramIds of the
 *  block-level controls, as the set of controls that appear on EVERY page.
 *
 *  Most families (35 of the FM3's 43) mark the block-level strip with `section: 'mixer'` and need no
 *  inference; this is the fallback for the ones that don't. In practice FILTER is the only real
 *  consumer — the other untagged families are virtual effects with no rail, or single-page blocks.
 *
 *  Intersection rather than a name list, because no name list can be right: FILTER's `LOWCUT`/`HIGHCUT`
 *  are page knobs while PITCH's identically-named params are rail members. Intersection gets both right
 *  without knowing any names. It is safe ONLY as this fallback — used generally it over-collects (GATE
 *  repeats `THRESH`/`RATIO`/`ATTACK` on every page), but every such family tags its mixer rows and so
 *  never reaches here.
 *
 *  Returns an empty set for mixer-tagged layouts and for single-page blocks, which keep today's layout. */
export function railControls(layout: DeviceLayout | null | undefined): Set<number> {
  const pages = layout?.pages ?? [];
  if (pages.length < 2) return new Set();
  const idsOf = (pg: (typeof pages)[number]): Set<number> => {
    const out = new Set<number>();
    for (const r of pg.rows ?? []) {
      if (r.section === 'mixer') return new Set(); // tagged layout — caller uses the section instead
      for (const c of r.controls ?? []) if (c.paramId != null) out.add(c.paramId);
    }
    return out;
  };
  const first = idsOf(pages[0]!);
  if (!first.size) return new Set();
  let acc = first;
  for (let i = 1; i < pages.length; i++) {
    const ids = idsOf(pages[i]!);
    if (!ids.size) return new Set();
    acc = new Set([...acc].filter((id) => ids.has(id)));
    if (!acc.size) return acc;
  }
  return acc;
}

/** Bumped whenever the BUILDER's output shape changes (as opposed to the served layout). It rides in the
 *  variant fingerprint, so every stored Default board re-seeds once and picks up the new tagging —
 *  without it a board saved before band-grouping keeps its untagged widgets and splits bands forever. */
const BOARD_SCHEMA = 'b5';

/** Stable fingerprint of the served layout variant — changes when the block's type selects a different
 *  layout, so the Default board can be re-seeded (user boards keep their own storage). */
export function layoutVariantSig(layout: DeviceLayout | null | undefined): string {
  if (!layout) return '';
  const ctlCount = (layout.pages ?? []).reduce(
    (n, pg) => n + (pg.rows ?? []).reduce((m, r) => m + (r.controls?.length ?? 0), 0),
    0
  );
  return [
    BOARD_SCHEMA,
    layout.family ?? '',
    layout.variantName ?? '',
    layout.variantValue ?? '',
    layout.editorName ?? '',
    (layout.pages ?? []).length,
    ctlCount
  ].join('|');
}

/** Build the device-authentic Default board from a v2 layout, or null when the layout carries no
 *  renderable controls (caller falls back to its curated heuristic board). `catalog` is the live control
 *  set (knobs `k<id>`, enums `e<id>`, plus `eq`/`geq`/`bypass`/`meter`); `cols` is the target grid width.
 *  `geqBandIds` are the param ids that collapse into the `geq` fader bank; `graphKeyForPage` names the
 *  response-graph catalog entry each page's graph slot should resolve to (see eqGraphs.ts). */
export function buildDeviceLayoutBoard(
  layout: DeviceLayout | null | undefined,
  catalog: BoardCtl[],
  cols: number,
  geqBandIds: Set<number> = new Set(),
  graphKeyForPage: (page: number) => string | null = () => null
): SurfaceBoard | null {
  if (!layout?.pages?.length) return null;
  const columns = Math.max(1, cols);
  const byKey = new Map(catalog.map((c) => [c.key, c]));

  // Page names key the {#each} in ControlSurface, so they MUST be unique — a layout can repeat a name
  // (this INPUT block ships three pages all named "Gate"); suffix any repeat.
  const usedNames = new Set<string>();
  const uniqName = (n: string): string => {
    const base = n || 'Page';
    let name = base;
    for (let i = 2; usedNames.has(name); i++) name = `${base} ${i}`;
    usedNames.add(name);
    return name;
  };

  const railIds = railControls(layout);

  const boards: Record<string, SurfaceWidget[]> = {};
  const pageOrder: string[] = [];

  layout.pages.forEach((pg, pageIndex) => {
    const graphKey = graphKeyForPage(pageIndex);
    const widgets: SurfaceWidget[] = [];
    const seen = new Set<string>();
    let gridRow = 0;
    let groupSeq = 0;
    coalesceRows(pg.rows).forEach((row, rowIndex) => {
      // Resolve the whole row up front: placing a band set needs its TOTAL width before it can tell
      // whether the set still fits the current line. A `key: null` slot is a gap (spacer, duplicate, or a
      // control with no catalog entry) that only advances the cursor so neighbours don't shift left.
      const slots: { key: string | null; view: string; w: number; h: number; group: number; col: number | null; rail: boolean }[] = [];
      let prevBand: number | null = null;
      for (const ctl of row.controls) {
        const band = bandIndex(ctl);
        if (band == null || band !== prevBand) groupSeq++; // band change (or no band) opens a new set
        prevBand = band;
        const group = groupSeq;
        const col = ctl.placement?.col ?? null;
        const rail = row.strip || (ctl.paramId != null && railIds.has(ctl.paramId));
        const r = resolveControl(ctl, byKey, geqBandIds, graphKey);
        const base = r === 'gap' ? undefined : byKey.get(r.key);
        if (r === 'gap' || !base || seen.has(r.key)) {
          slots.push({ key: null, view: '', w: 1, h: 1, group, col, rail });
          continue;
        }
        seen.add(r.key);
        slots.push({ key: r.key, view: r.view, w: Math.min(base.w, columns), h: base.h, group, col, rail });
      }

      // Device-authored columns (see `authoredX`). Gaps are dropped rather than allowed to consume a
      // column: they draw nothing, and on this path the alignment is stated explicitly by `col`, so a
      // decorative label sitting in the array ahead of `col: 0` must not shove the whole row right.
      // An un-authored real control inherits the last authored column seen in array order (-1 before the
      // first), which anchors it between its neighbours; the sweep's cursor then gives it the next free
      // column. Rows the device authored no column for at all fall through to the flow path below.
      let last = -1;
      const anchored = slots
        .map((s) => {
          if (s.col != null) last = s.col;
          return { slot: s, col: last, w: s.w };
        })
        .filter((a) => a.slot.key);
      if (anchored.length && slots.some((s) => s.col != null)) {
        const xs = authoredX(anchored, columns);
        if (xs) {
          let h = 1;
          anchored.forEach((a, i) => {
            const s = a.slot;
            widgets.push({ id: 'w' + s.key, key: s.key!, x: xs[i], y: gridRow, w: s.w, h: s.h, view: s.view, row: rowIndex, group: s.group, col: xs[i], ...(s.rail ? { rail: true } : {}) });
            h = Math.max(h, s.h);
          });
          gridRow += h;
          return;
        }
      }

      let x = 0;
      let rowH = 1;
      let placed = false;
      for (let i = 0; i < slots.length; ) {
        let end = i + 1;
        while (end < slots.length && slots[end].group === slots[i].group) end++;
        const groupW = slots.slice(i, end).reduce((n, s) => n + s.w, 0);
        // Keep one band's controls on ONE line: wrap the whole set rather than leaving half of it behind
        // (a set too wide for the grid can't be kept whole — it falls through to per-control wrapping).
        if (x > 0 && groupW <= columns && x + groupW > columns) {
          gridRow += rowH;
          x = 0;
          rowH = 1;
        }
        for (; i < end; i++) {
          const s = slots[i];
          if (s.key && x > 0 && x + s.w > columns) {
            // control doesn't fit the rest of this line — wrap onto a new grid line (still this row)
            gridRow += rowH;
            x = 0;
            rowH = 1;
          }
          if (s.key) {
            widgets.push({ id: 'w' + s.key, key: s.key, x, y: gridRow, w: s.w, h: s.h, view: s.view, row: rowIndex, group: s.group, ...(s.rail ? { rail: true } : {}) });
            rowH = Math.max(rowH, s.h);
            placed = true;
          }
          x += s.w;
        }
      }
      if (placed) gridRow += rowH; // next layout row starts below the tallest widget of this one
    });
    if (!widgets.length) return;
    const name = uniqName(pg.name?.trim() || `Page ${pageOrder.length + 1}`);
    boards[name] = widgets;
    pageOrder.push(name);
  });

  if (!pageOrder.length) return null;

  // Sweep anything the layout never referenced onto a trailing "More" page so nothing is lost.
  const placedKeys = new Set(pageOrder.flatMap((p) => boards[p]!.map((w) => w.key)));
  const rest = catalog.filter((c) => !placedKeys.has(c.key));
  if (rest.length) {
    const name = uniqName('More');
    boards[name] = packSequential(rest, columns);
    pageOrder.push(name);
  }

  return { pageOrder, page: pageOrder[0]!, boards, variantSig: layoutVariantSig(layout) };
}

/** Rows never cap vertically — packing only caps horizontally, by `cols`. */
export const MAX_ROWS = 512;

/** Gravity-pack a list into a `c`×`r` grid: sort by `(y, x)`, drop each widget into the first open gap.
 *  Used by free-arranged boards' explicit reflow (`tidyUp`/`toggleCompact`) and by the "no source row"
 *  half of `repackWidgets` below. Ported verbatim from `ControlSurface.svelte` (was a closure there;
 *  pure here). */
export function packInto(list: SurfaceWidget[], c: number, r: number): SurfaceWidget[] {
  const m = Array.from({ length: r }, () => new Array(c).fill(false));
  const fit = (x: number, y: number, w: number, h: number) => {
    if (x < 0 || y < 0 || x + w > c || y + h > r) return false;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (m[j][i]) return false;
    return true;
  };
  const out: SurfaceWidget[] = [];
  for (const w of list.slice().sort((a, b) => a.y - b.y || a.x - b.x)) {
    const pw = Math.min(w.w, c),
      ph = Math.min(w.h, r);
    let pos: { x: number; y: number } | null = null;
    for (let y = 0; y <= r - ph && !pos; y++) for (let x = 0; x <= c - pw && !pos; x++) if (fit(x, y, pw, ph)) pos = { x, y };
    if (!pos) pos = { x: 0, y: 0 };
    for (let j = pos.y; j < pos.y + ph; j++) for (let i = pos.x; i < pos.x + pw; i++) if (m[j]) m[j][i] = true;
    out.push({ ...w, x: pos.x, y: pos.y, w: pw, h: ph });
  }
  return out;
}

/** Row-preserving re-pack for a device-authentic board at a narrower column count: groups widgets by
 *  their source `row`, lays each group left→right (wrapping within the group), and starts every source
 *  row on a fresh grid line so the editor's row structure survives responsive reflow.
 *
 *  A source row that doesn't fit `columns` at build time (`buildDeviceLayoutBoard`) already wraps onto
 *  extra internal grid lines of its own, still tagged with that one source `row` — e.g. a device that
 *  reports ALL of a PEQ's 30 band controls as a single editor row. `y` strictly increases across those
 *  wrapped lines and `x` resets to 0 at each one, so sorting a row-group by `x` ALONE (as this used to)
 *  collapses same-offset items from different wrapped lines together — the "1st of every line" cluster,
 *  then the "2nd of every line" cluster, etc. — which reads as scrambled band order. Sorting by `(y, x)`
 *  reconstructs build order exactly, because within one source row `y` only ever advances forward.
 *
 *  Order alone isn't enough — the wrap must also fall BETWEEN bands. Widgets sharing a `group` are one
 *  band's set and move to the next line together, so a narrow window pushes band 3 down whole instead of
 *  stranding `Frequency 3` at the end of one line and its type/gain/Q at the start of the next. */
export function packRows(list: SurfaceWidget[], cols: number): SurfaceWidget[] {
  const columns = Math.max(1, cols);
  const rows = new Map<number, SurfaceWidget[]>();
  const noRow: SurfaceWidget[] = [];
  for (const w of list) {
    if (w.row == null) noRow.push(w);
    else {
      const bucket = rows.get(w.row);
      if (bucket) bucket.push(w);
      else rows.set(w.row, [w]);
    }
  }
  const out: SurfaceWidget[] = [];
  let gy = 0;
  for (const key of [...rows.keys()].sort((a, b) => a - b)) {
    const rw = rows.get(key)!.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    // A row the device authored columns for is replayed at those columns, exactly as it was built — the
    // authored placement IS the layout, so re-flowing it would undo the alignment at every resize/zoom.
    // `authoredX` returns null when the row no longer fits (narrow pane), and the flow path below takes
    // over, which is the same fallback the builder uses.
    const axs = authoredX(rw, columns);
    if (axs) {
      let rh = 1;
      rw.forEach((w, i) => {
        out.push({ ...w, x: axs[i], y: gy, w: Math.min(w.w, columns) });
        rh = Math.max(rh, w.h);
      });
      gy += rh;
      continue;
    }
    let x = 0;
    let rowH = 1;
    for (let i = 0; i < rw.length; ) {
      // A band set (shared `group`) wraps as a unit, exactly as it was built — see the note above.
      let end = i + 1;
      if (rw[i].group != null) while (end < rw.length && rw[end].group === rw[i].group) end++;
      const groupW = rw.slice(i, end).reduce((n, w) => n + Math.min(w.w, columns), 0);
      if (x > 0 && groupW <= columns && x + groupW > columns) {
        gy += rowH;
        x = 0;
        rowH = 1;
      }
      for (; i < end; i++) {
        const w = rw[i];
        const ww = Math.min(w.w, columns);
        if (x + ww > columns) {
          gy += rowH;
          x = 0;
          rowH = 1;
        }
        out.push({ ...w, x, y: gy, w: ww });
        x += ww;
        rowH = Math.max(rowH, w.h);
      }
    }
    gy += rowH;
  }
  for (const w of noRow) {
    out.push({ ...w, x: 0, y: gy });
    gy += w.h;
  }
  return out;
}

/** Re-pack a page for `cols`: row-preserving for device-authentic boards (widgets carry a source `row`),
 *  generic gravity-pack for free-arranged ones. The single decision point for all involuntary re-packs
 *  (responsive reflow, saved-board reconcile, zoom) — a free-arranged board is never routed through
 *  `packRows`, which would discard its hand-placed `x`/`y`, and a device-authentic board is never routed
 *  through `packInto`, which interleaves its band groups (see module banner). */
export function repackWidgets(list: SurfaceWidget[], cols: number, maxRows = MAX_ROWS): SurfaceWidget[] {
  return list.some((w) => w.row != null) ? packRows(list, cols) : packInto(list, cols, maxRows);
}
