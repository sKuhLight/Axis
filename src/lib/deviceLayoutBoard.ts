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
  /** Heading text for a `view:'label'` widget (an unbound `sectionLabel`, e.g. "SATURATION"). Only set on
   *  label widgets, which have no catalog entry — no live param backs a section heading. */
  text?: string;
  /** The `key`s of the widgets THIS heading actually spans (only set on `view:'label'` widgets). Computed
   *  once at build time from `groupSectionLabels` + the row's real placement — carrying it forward lets
   *  `packRows` resize a heading correctly on reflow without re-deriving membership from a flattened
   *  widget list that no longer has the source row's `LayoutControl` array (and therefore no spacer/
   *  column-gap boundaries) to work from. Absent on a board built before this field existed. */
  members?: string[];
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

/** Parse a device `positionExact` string (`"465,370"`) into pixel coordinates, or `null` if absent/
 *  malformed. The device's own editor treats this as an absolute-pixel override of the column grid
 *  (documented on the upstream `forgefx-midi` type); Axis carried the field without ever reading it. */
export function parsePositionExact(s: string | null | undefined): { x: number; y: number } | null {
  if (!s) return null;
  const m = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(s.trim());
  if (!m) return null;
  return { x: Number(m[1]), y: Number(m[2]) };
}

/** Gap (device px) above which two `positionExact` controls are treated as different visual rows rather
 *  than neighbours on the same one. Tuned against real device data (`forgefx-midi/src/gen3/fm3/
 *  layouts.generated.ts`), not guessed: same-row spread tops out around 7px (the cab Align page's
 *  `Bank`/`Type`/`Zoom` row), while genuine row-to-row gaps start at 30px+ (Scene Levels' `Scene 1` →
 *  `Scene 2` is 34px; the cab's Bank/Type row → its IR Length row below is 60px). 20px sits cleanly
 *  between both with margin on either side. */
const CANVAS_ROW_GAP_PX = 20;

/** Group `positionExact`-only controls into synthetic visual rows, for controls the device placed on its
 *  own absolute canvas instead of a column grid — a lone outlier mixed into an otherwise col-authored row
 *  (the amp's HEADROOM), a dense per-slot cluster (the cab's Picker/Bank/Type/IR Length block), or an
 *  entire canvas-authored page (Speaker/Align/Scene Levels, where EVERY control in the row is one of
 *  these). Sorts by `(y, x)` — device reading order — then starts a new row whenever the gap to the
 *  previous item's `y` exceeds `CANVAS_ROW_GAP_PX` (see its own doc comment for the real numbers this was
 *  tuned against). Pure position math: no knowledge of grid columns or widget sizes, so the caller is free
 *  to flow-pack each returned row however it needs to. */
export function clusterByCanvasRow<T extends { xPx: number; yPx: number }>(items: readonly T[]): T[][] {
  const sorted = items.slice().sort((a, b) => a.yPx - b.yPx || a.xPx - b.xPx);
  const rows: T[][] = [];
  let prevY: number | null = null;
  for (const item of sorted) {
    if (prevY == null || item.yPx - prevY > CANVAS_ROW_GAP_PX) rows.push([]);
    rows[rows.length - 1]!.push(item);
    prevY = item.yPx;
  }
  return rows;
}

/** For one row's controls (already stripped of overlay candidates — see `buildDeviceLayoutBoard`), find
 *  each heading's member span: from right after the heading up to (but excluding) whichever comes first —
 *  the next heading, a `spacer` control, or a genuine authored-column GAP (a column number no control on
 *  the row claims, not even a spacer).
 *
 *  ONE rule regardless of how many headings share the row. An earlier version special-cased a row with
 *  exactly one heading to extend through its own internal spacers to the row's end, on the theory that a
 *  lone heading's spacers are just knob spacing rather than group boundaries. The real device disproves
 *  that for `TRANSFORMER` (Power Amp) specifically: it's followed by `XFormer Drive`/`XFormer Matching`,
 *  then a `spacer`, then `Speaker Impedance`/`PI Bias Excursion`/`Cathode Resistance`/`Cathode Time Const`
 *  — four knobs with unrelated param names (no shared `XFormer` prefix) that the real editor draws with NO
 *  heading over them, same as `SATURATION`'s spacer excluding the trailing Low Cut/High Cut knobs on its
 *  own row. The stop-at-spacer rule was always right; the "unless it's the row's only heading" exception
 *  was an unverified guess. `OUTPUT COMPRESSOR` (Dynamics) needs the column-gap check on top of that: its
 *  row has no spacer at all, just `Master Bias Excursion` at col 5 with col 4 claimed by nothing (a
 *  firmware-gated control added later) — the real editor draws it clear of the compressor group too.
 *
 *  Pure array-order arithmetic; no coordinate math needed to bound a label's span. */
export function groupSectionLabels(
  controls: readonly LayoutControl[],
  isHeading: (ctl: LayoutControl) => boolean
): { ctlIndex: number; start: number; end: number }[] {
  const headingIdx: number[] = [];
  for (let i = 0; i < controls.length; i++) if (isHeading(controls[i])) headingIdx.push(i);
  return headingIdx.map((ctlIndex, k) => {
    const limit = headingIdx[k + 1] ?? controls.length;
    let end = limit;
    let lastCol: number | null = null;
    for (let i = ctlIndex + 1; i < limit; i++) {
      if (controls[i].widget === 'spacer') {
        end = i;
        break;
      }
      const col = controls[i].placement?.col;
      if (col == null) continue; // doesn't claim a column — doesn't affect contiguity either way
      if (lastCol != null && col > lastCol + 1) {
        end = i; // a column between them belongs to no control at all — a real break, stop here
        break;
      }
      lastCol = col;
    }
    return { ctlIndex, start: ctlIndex + 1, end };
  });
}

type Resolved = { key: string; view: string } | { label: string } | 'gap';

/** Resolve one layout control to a catalog key + view, a section heading, or `'gap'` (advance the cursor,
 *  draw nothing — spacers and parameters the device did not surface as a knob/enum). */
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
  // A `sectionLabel`/`labelBold` with no graph to bind (INPUT BOOST/SATURATION/TONESTACK, the cab's
  // "CAB 1"/"CAB 2") is a real section heading, not a dropped gap: render it as one (see
  // `groupSectionLabels` for how its column span is computed at the call site, which needs row context
  // this function doesn't have). Two `label`-widget shapes are NOT headings, though, and must keep the
  // pre-existing "drop it" behaviour:
  //  - bound to a live paramId (the cab's `labelCabName`, e.g. "Name") — a live DISPLAY FIELD, not
  //    decorative text; showing its static control-label ("Name") in place of the actual cabinet name
  //    would be actively misleading, and no live-value render path exists yet.
  //  - `labelSeperator` — a purely decorative divider between two columns whose own `label` text
  //    ("Seperator") the device never intended as user-visible.
  if (ctl.widget === 'label') {
    if (ctl.paramId != null || ctl.rawWidget === 'labelSeperator') return 'gap';
    return { label: ctl.label ?? '' };
  }
  // Unresolved dropdowns and anything else with no binding: leave a gap (matches the pre-v2 behaviour of
  // silently skipping unmapped controls, but keeps neighbours' horizontal alignment).
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

/** Bumped whenever the BUILDER's output shape changes (as opposed to the served layout), OR whenever a
 *  bug elsewhere permanently corrupted what got saved. It rides in the variant fingerprint, so every
 *  stored Default board re-seeds once and picks up the fix — without it a board saved before
 *  band-grouping keeps its untagged widgets and splits bands forever. b16→b17: `ControlSurface`'s
 *  `reconcile()` stripped every section-heading widget on every load (headings have no catalog entry, so
 *  they never matched its `valid` key set) — fixed there, but a board already saved mid-bug had its
 *  headings deleted and re-persisted without them, so the variantSig match alone would keep serving that
 *  headingless board forever; only a schema bump forces the re-seed that picks the fix up. b17→b18: a row
 *  containing a heading anywhere used to push EVERY control in that row down onto the heading's line —
 *  including controls that come before the heading in array order and belong to no heading at all (the
 *  amp's real Preamp row 2: Preamp Sag..Preamp Bias Excursion sit before TONESTACK, col 0–5, and were
 *  wrongly dragged down with Tonestack Type/Freq/Location, col 6–8, which the heading actually spans).
 *  Fixed to split the row at the heading; a board already saved with the old placement needs the bump to
 *  re-seed instead of keeping the wrong y's forever. b18→b19: a row with only ONE heading used to extend
 *  it across the row's ENTIRE remainder unconditionally, on the theory this was needed for `TRANSFORMER`
 *  (assumed to use its internal spacers as pure knob spacing). Wrong for the amp's real OUTPUT COMPRESSOR
 *  row, where `Master Bias Excursion` sits past a genuine authored-column gap (col 4 claimed by nothing,
 *  not even a spacer) and the real editor draws it clear of the compressor's underline. Fixed to stop at
 *  that gap, and each heading now carries its resolved `members` so the responsive re-pack (`packRows`)
 *  can't re-expand it back over them on reflow either. b19→b20: the TRANSFORMER assumption itself was
 *  also wrong — screenshot-confirmed the real editor stops its heading at the FIRST spacer (after
 *  `XFormer Drive`/`XFormer Matching`), same as every multi-heading row; `Speaker Impedance`/`PI Bias
 *  Excursion`/`Cathode Resistance`/`Cathode Time Const` (unrelated param names, no `XFormer` prefix) sit
 *  past that spacer with no heading over them. `groupSectionLabels` no longer special-cases a row with
 *  only one heading — every heading, on every row, stops at the first spacer/gap/next-heading. Boards
 *  saved with the old wider TRANSFORMER-shaped heading need the re-seed. b20→b21: rows can now carry an
 *  Axis-authored lead card in their reserved leading columns (`leadKeyForRow` — the cab's per-slot
 *  identity cluster), which also drops that row's canvas overlay cluster and headings. A board saved
 *  before the hook has neither the card nor the drop, and would keep serving the orphaned `IR Length`
 *  card under the knobs forever without the re-seed. */
const BOARD_SCHEMA = 'b21';

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

/** Add any widget the freshly-built device-authentic `fresh` board places but the SAVED board doesn't
 *  have yet (checked by key, across every page of `saved`) — e.g. a param whose device-reported kind
 *  changed (a knob reclassified as a toggle, or vice versa) between when the board was saved and now.
 *  Without this, `reconcile` drops the widget under its old, now-invalid key and nothing takes its
 *  place: the control just vanishes. Existing widgets keep their exact position; a newly-surfaced one is
 *  placed into the first free cell of the page `fresh` puts it on (a page `saved` doesn't have yet is
 *  appended to `pageOrder`). Returns `saved` unchanged (same reference) when nothing is missing. */
export function healBoardWithLayout(saved: SurfaceBoard, fresh: SurfaceBoard, cols: number, maxRows = MAX_ROWS): SurfaceBoard {
  const present = new Set(Object.values(saved.boards).flat().map((w) => w.key));
  const boards = { ...saved.boards };
  let pageOrder = saved.pageOrder;
  let changed = false;
  for (const pg of fresh.pageOrder) {
    const missing = (fresh.boards[pg] ?? []).filter((w) => !present.has(w.key));
    if (!missing.length) continue;
    changed = true;
    if (!boards[pg]) pageOrder = [...pageOrder, pg];
    boards[pg] = appendIntoFreeCells(boards[pg] ?? [], missing, cols, maxRows);
  }
  return changed ? { ...saved, pageOrder, boards } : saved;
}

/** Place `toAdd` into the first open gaps of a `cols`×`maxRows` grid already occupied by `existing` —
 *  `existing` keeps its exact x/y; only `toAdd`'s positions are computed. Same first-fit scan as
 *  `packInto`, but seeded with fixed occupied cells instead of re-flowing everything from scratch. */
function appendIntoFreeCells(existing: SurfaceWidget[], toAdd: SurfaceWidget[], cols: number, maxRows: number): SurfaceWidget[] {
  const occupied = Array.from({ length: maxRows }, () => new Array(cols).fill(false));
  const fits = (x: number, y: number, w: number, h: number) => {
    if (x < 0 || y < 0 || x + w > cols || y + h > maxRows) return false;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (occupied[j][i]) return false;
    return true;
  };
  const mark = (x: number, y: number, w: number, h: number) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) occupied[j][i] = true;
  };
  for (const w of existing) mark(w.x, w.y, Math.min(w.w, cols), Math.min(w.h, maxRows));
  const placed: SurfaceWidget[] = [];
  for (const w of toAdd) {
    const pw = Math.min(w.w, cols);
    const ph = Math.min(w.h, maxRows);
    let pos: { x: number; y: number } | null = null;
    for (let y = 0; y <= maxRows - ph && !pos; y++) for (let x = 0; x <= cols - pw && !pos; x++) if (fits(x, y, pw, ph)) pos = { x, y };
    pos ??= { x: 0, y: 0 }; // grid exhausted (practically unreachable at MAX_ROWS) — first cell rather than dropping the widget
    mark(pos.x, pos.y, pw, ph);
    placed.push({ ...w, x: pos.x, y: pos.y, w: pw, h: ph });
  }
  return [...existing, ...placed];
}

/** Build the device-authentic Default board from a v2 layout, or null when the layout carries no
 *  renderable controls (caller falls back to its curated heuristic board). `catalog` is the live control
 *  set (knobs `k<id>`, enums `e<id>`, plus graph/`geq`/`bypass`/`meter`); `cols` is the target grid width.
 *  `geqBandIds` are the param ids that collapse into the `geq` fader bank; `graphKeyForSlot` names the
 *  graph catalog entry each page/slot should resolve to. Slots are ordinal because a page may host more
 *  than one graph (the Controllers page has LFO 1 and LFO 2). */
export function buildDeviceLayoutBoard(
  layout: DeviceLayout | null | undefined,
  catalog: BoardCtl[],
  cols: number,
  geqBandIds: Set<number> = new Set(),
  graphKeyForSlot: (page: number, slot: number) => string | null = () => null,
  /** Catalog keys with no row of their own to anchor to (the Dynacab mic graphic re-presents knobs
   *  that keep their own separate widgets, so it can't collapse onto one like `geq` does) — placed at
   *  the TOP of that page, ahead of its own rows, instead of falling through to the trailing "More"
   *  sweep, so the graphic reads as a first-class hero rather than stranding below the knobs. Tagged
   *  `row: -1` so the responsive re-pack (`packRows`) also keeps them ahead of the page's own rows. */
  extraKeysForPage: (page: number) => string[] = () => [],
  /** The catalog key of an Axis-authored card that belongs in ONE layout row's reserved leading columns,
   *  rather than above the page (`extraKeysForPage`) or in a row of its own.
   *
   *  The cab is the case this exists for: the device authors one row per cab slot, places that slot's
   *  identity cluster (`CAB n` heading, Picker, Bank, Type, Name, IR Length) by canvas pixels, and starts
   *  the knob row at `col 3` — leaving cols 0–2 empty PRECISELY because the cluster occupies them. Most of
   *  that cluster resolves to nothing in Axis (the CabPicker owns Bank/Type, `Name` is a live-value field,
   *  Picker/M/S carry pseudo param ids), so a single Axis card re-presents it — and it has to land in the
   *  row's own leading gap to read as that row's identity, which neither of the other placement paths can
   *  do. See `cabIdentityCards.ts`.
   *
   *  When a row yields a lead key that resolves to a live catalog entry, the card is placed at `x: 0` on
   *  that row's own grid line, clamped to the row's first authored column so it can never collide with the
   *  content it sits beside, and the row's `positionExact` overlay cluster and unbound section headings are
   *  DROPPED — the card now carries that information, and leaving them would duplicate the heading and
   *  re-strand the orphan control the card absorbed. Rows with no lead key are completely unaffected. */
  leadKeyForRow: (page: number, row: number) => string | null = () => null
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
    let graphSlot = 0;
    const widgets: SurfaceWidget[] = [];
    const seen = new Set<string>();
    let gridRow = 0;
    let groupSeq = 0;
    // Widgets with no device row of their own (the Dynacab hero graphic) — placed FIRST, packed
    // left→right and wrapping at `columns`, so they sit above the page's own rows instead of below them.
    // `row: -1` sorts ahead of the authored rows in `packRows`, keeping the hero on top through reflow.
    {
      let ex = 0;
      let eh = 1;
      for (const key of extraKeysForPage(pageIndex)) {
        if (seen.has(key)) continue;
        const base = byKey.get(key);
        if (!base) continue;
        seen.add(key);
        const w = Math.min(base.w, columns);
        if (ex > 0 && ex + w > columns) {
          gridRow += eh;
          ex = 0;
          eh = 1;
        }
        widgets.push({ id: 'w' + key, key, x: ex, y: gridRow, w, h: base.h, view: base.view, row: -1 });
        ex += w;
        eh = Math.max(eh, base.h);
      }
      if (ex > 0) gridRow += eh; // advance past the hero row(s) so the page's own rows start below them
    }
    coalesceRows(pg.rows).forEach((row, rowIndex) => {
      // Split out `positionExact`-only controls that are NOT section headings (the amp's HEADROOM, the
      // cab's per-slot identity cluster, or — when EVERY control in the row is one of these — a whole
      // canvas-authored page like Speaker/Align) — they must not consume a column or perturb `authoredX`
      // (their own `col` is null, so without this they'd inherit the row's last authored column and
      // likely overflow the row width, kicking the WHOLE row — including its legitimate col-authored
      // siblings — onto the flow fallback). They're placed as their own grid rows below instead (see
      // `clusterByCanvasRow` below). A `mixer`/rail control is EXEMPT even if it happens to carry
      // `positionExact` (the cab's `Balance` does) — it renders in the fixed sidebar via the ordinary rail
      // path regardless of placement, and must never be pulled into this row-of-its-own machinery, which
      // would strand it floating over the page content instead of in the rail.
      // An Axis-authored card claiming this row's reserved leading columns (see `leadKeyForRow`). Resolved
      // BEFORE the split because it decides the fate of the row's overlay cluster and headings.
      const leadKey = leadKeyForRow(pageIndex, rowIndex);
      const leadBase = leadKey && !seen.has(leadKey) ? byKey.get(leadKey) : undefined;

      const overlayCtls: LayoutControl[] = [];
      const mainCtls: LayoutControl[] = [];
      for (const ctl of row.controls) {
        const isRail = row.strip || (ctl.paramId != null && railIds.has(ctl.paramId));
        if (!isRail && ctl.widget !== 'label' && ctl.widget !== 'spacer' && ctl.placement?.col == null && parsePositionExact(ctl.placement?.positionExact) != null) {
          // A lead card absorbs this row's canvas-placed cluster — dropping it here is what removes the
          // orphaned control the card now shows (the cab's stray `IR Length`).
          if (!leadBase) overlayCtls.push(ctl);
        } else if (leadBase && !isRail && ctl.widget === 'label') {
          // …and its heading, which the card renders as its own title. Kept out of `mainCtls` entirely so
          // no heading line is reserved and the knobs stay on the row's first line, beside the card.
        } else {
          mainCtls.push(ctl);
        }
      }

      // Resolve the row up front: placing a band set needs its TOTAL width before it can tell whether the
      // set still fits the current line. A `key: null` slot is a gap (spacer, duplicate, or a control with
      // no catalog entry) that only advances the cursor so neighbours don't shift left. Unbound section
      // headings resolve to `{label}` here too (no column consumed — same as a gap) and are tracked
      // separately in `headingCtls` so their member span can be computed once the row's real x's are known.
      const slots: { key: string | null; view: string; w: number; h: number; group: number; col: number | null; rail: boolean; ctlIndex: number }[] = [];
      const headingCtls: { ctlIndex: number; text: string }[] = [];
      let prevBand: number | null = null;
      for (let ci = 0; ci < mainCtls.length; ci++) {
        const ctl = mainCtls[ci];
        const band = bandIndex(ctl);
        if (band == null || band !== prevBand) groupSeq++; // band change (or no band) opens a new set
        prevBand = band;
        const group = groupSeq;
        const col = ctl.placement?.col ?? null;
        const rail = row.strip || (ctl.paramId != null && railIds.has(ctl.paramId));
        const graphKey = graphKeyForSlot(pageIndex, ctl.widget === 'graph' ? graphSlot++ : 0);
        const r = resolveControl(ctl, byKey, geqBandIds, graphKey);
        if (r !== 'gap' && 'label' in r) {
          headingCtls.push({ ctlIndex: ci, text: r.label });
          slots.push({ key: null, view: '', w: 1, h: 1, group, col, rail, ctlIndex: ci });
          continue;
        }
        const base = r === 'gap' ? undefined : byKey.get(r.key);
        if (r === 'gap' || !base || seen.has(r.key)) {
          slots.push({ key: null, view: '', w: 1, h: 1, group, col, rail, ctlIndex: ci });
          continue;
        }
        seen.add(r.key);
        slots.push({ key: r.key, view: r.view, w: Math.min(base.w, columns), h: base.h, group, col, rail, ctlIndex: ci });
      }
      // A row with a heading reserves one grid line for the heading text, ABOVE the controls it heads —
      // but controls that precede the heading in array order (the amp's real Preamp row 2: Preamp
      // Sag/Tube Hardness/Triode 1+2 Plate Freq/Preamp Bias/Preamp Bias Excursion all sit BEFORE
      // TONESTACK, col-authored 0–5, with Tonestack Type/Freq/Location AFTER it at col 6–8) belong to NO
      // heading and must stay on the row they were already on, not get dragged down onto the heading's
      // line with the controls it actually labels. Split the row's slots at the FIRST heading's ctlIndex:
      // the "before" slice places at the row's start line unchanged; the heading line is reserved only
      // after that; the "after" slice (what the heading actually spans — see `groupSectionLabels`) places
      // below it. A row with no heading, or one whose heading opens the row (TRANSFORMER/OUTPUT
      // COMPRESSOR/INPUT BOOST — the entire row is what it heads), has an empty "before" slice and
      // behaves exactly as it did when this was a single un-split placement pass.
      const hasHeadingLine = headingCtls.length > 0;
      const firstHeadingCtlIndex = hasHeadingLine ? Math.min(...headingCtls.map((h) => h.ctlIndex)) : Infinity;
      const beforeSlots = slots.filter((s) => s.ctlIndex < firstHeadingCtlIndex);
      const afterSlots = slots.filter((s) => s.ctlIndex >= firstHeadingCtlIndex);
      const xByCtlIndex = new Map<number, { x: number; w: number; key: string }>();

      // Places one slice of this row's slots starting at grid line `startY`, via device-authored columns
      // (see `authoredX`) when the device gave any of them a `col`, falling back to the left→right
      // band-aware flow-wrap otherwise. Returns how many grid lines the slice consumed (0 if it placed
      // nothing) so the caller can advance past it. `col` values are absolute — a split-off "after" slice
      // still authors at its own cols (6–8, say), which is exactly the alignment the device intended.
      const placeSlots = (slotSubset: typeof slots, startY: number): number => {
        let last = -1;
        const anchored = slotSubset
          .map((s) => {
            if (s.col != null) last = s.col;
            return { slot: s, col: last, w: s.w };
          })
          .filter((a) => a.slot.key);
        if (anchored.length && slotSubset.some((s) => s.col != null)) {
          const xs = authoredX(anchored, columns);
          if (xs) {
            let h = 1;
            anchored.forEach((a, i) => {
              const s = a.slot;
              widgets.push({ id: 'w' + s.key, key: s.key!, x: xs[i], y: startY, w: s.w, h: s.h, view: s.view, row: rowIndex, group: s.group, col: xs[i], ...(s.rail ? { rail: true } : {}) });
              xByCtlIndex.set(s.ctlIndex, { x: xs[i], w: s.w, key: s.key! });
              h = Math.max(h, s.h);
            });
            return h;
          }
        }
        let x = 0;
        let y = startY;
        let rowH = 1;
        let placed = false;
        for (let i = 0; i < slotSubset.length; ) {
          let end = i + 1;
          while (end < slotSubset.length && slotSubset[end].group === slotSubset[i].group) end++;
          const groupW = slotSubset.slice(i, end).reduce((n, s) => n + s.w, 0);
          // Keep one band's controls on ONE line: wrap the whole set rather than leaving half of it behind
          // (a set too wide for the grid can't be kept whole — it falls through to per-control wrapping).
          if (x > 0 && groupW <= columns && x + groupW > columns) {
            y += rowH;
            x = 0;
            rowH = 1;
          }
          for (; i < end; i++) {
            const s = slotSubset[i];
            if (s.key && x > 0 && x + s.w > columns) {
              // control doesn't fit the rest of this line — wrap onto a new grid line (still this slice)
              y += rowH;
              x = 0;
              rowH = 1;
            }
            if (s.key) {
              widgets.push({ id: 'w' + s.key, key: s.key, x, y, w: s.w, h: s.h, view: s.view, row: rowIndex, group: s.group, ...(s.rail ? { rail: true } : {}) });
              xByCtlIndex.set(s.ctlIndex, { x, w: s.w, key: s.key });
              rowH = Math.max(rowH, s.h);
              placed = true;
            }
            x += s.w;
          }
        }
        return placed ? y - startY + rowH : 0;
      };

      const rowStartY = gridRow;
      gridRow += placeSlots(beforeSlots, gridRow);
      const headingY = gridRow;
      if (hasHeadingLine) gridRow += 1;
      gridRow += placeSlots(afterSlots, gridRow);

      // The lead card fills the row's reserved leading columns, spanning the row's FULL height so it reads
      // as that row's identity rather than as one more tile stacked beside it. Width is clamped to the
      // row's first authored column — that gap is the space the device left for it (`Level` at col 3 →
      // cols 0-2), and the clamp is what guarantees it can never overlap the row's own content. A row
      // whose content already starts at col 0 leaves no gap, so the card is skipped rather than drawn on
      // top of it. Emitted after the slices because its height is the number of grid lines they consumed.
      if (leadBase) {
        const authoredCols = slots.filter((s) => s.key && s.col != null).map((s) => s.col as number);
        const gap = authoredCols.length ? Math.min(...authoredCols) : columns;
        const lw = Math.min(leadBase.w, gap, columns);
        if (lw > 0) {
          seen.add(leadKey!);
          widgets.push({
            id: 'w' + leadKey,
            key: leadKey!,
            x: 0,
            y: rowStartY,
            w: lw,
            h: Math.max(1, gridRow - rowStartY),
            view: leadBase.view,
            row: rowIndex,
            col: 0
          });
        }
      }

      if (hasHeadingLine) {
        const spans = groupSectionLabels(mainCtls, (ctl) => ctl.widget === 'label');
        for (const h of headingCtls) {
          const span = spans.find((s) => s.ctlIndex === h.ctlIndex);
          const memberXs: { x: number; w: number; key: string }[] = [];
          if (span) for (let i = span.start; i < span.end; i++) { const xw = xByCtlIndex.get(i); if (xw) memberXs.push(xw); }
          const minX = memberXs.length ? Math.min(...memberXs.map((m) => m.x)) : 0;
          const maxEnd = memberXs.length ? Math.max(...memberXs.map((m) => m.x + m.w)) : columns;
          widgets.push({
            id: `lbl${pageIndex}_${rowIndex}_${h.ctlIndex}`,
            key: `label:${pageIndex}:${rowIndex}:${h.ctlIndex}`,
            x: minX,
            y: headingY,
            w: Math.max(1, maxEnd - minX),
            h: 1,
            view: 'label',
            text: h.text,
            row: rowIndex,
            ...(memberXs.length ? { members: memberXs.map((m) => m.key) } : {})
          });
        }
      }

      // Resolve every outlier candidate exactly like a `mainCtls` control — including graph-slot ordinals
      // via the same page-wide `graphSlot` counter used above, so a canvas-authored page's graph (Speaker/
      // Align/Scene Levels always carry `positionExact`, so it lands here, not in `mainCtls`) resolves
      // correctly instead of silently dropping. Never let one borrow a SHARED/global catalog key
      // ('meter'/'bypass'/'geq'): those back a single block-wide widget, not this specific control, and
      // mis-binding produces the wrong widget in the wrong place (seen with HEADROOM when its own `m<pid>`
      // monitor entry isn't in the live catalog — better to drop it, matching the pre-existing "silently
      // skipped" behaviour, than show the wrong thing at a misleading position).
      const outliers: { key: string; view: string; w: number; h: number; xPx: number; yPx: number }[] = [];
      for (const oc of overlayCtls) {
        const graphKey = graphKeyForSlot(pageIndex, oc.widget === 'graph' ? graphSlot++ : 0);
        const r = resolveControl(oc, byKey, geqBandIds, graphKey);
        if (r === 'gap' || 'label' in r) continue;
        if (r.key === 'meter' || r.key === 'bypass' || r.key === 'geq') continue;
        const base = byKey.get(r.key);
        if (!base || seen.has(r.key)) continue;
        const p = parsePositionExact(oc.placement?.positionExact)!;
        seen.add(r.key);
        outliers.push({ key: r.key, view: r.view, w: Math.min(base.w, columns), h: base.h, xPx: p.x, yPx: p.y });
      }
      // Place them as ordinary grid rows below this row's own col/flow content — never overlapping it, and
      // with no need to know which columns that content used. `clusterByCanvasRow` turns the raw pixel
      // scatter back into visual rows (device reading order); each synthetic row then flow-packs left→right
      // at the page's own column count, exactly like the page-level hero widgets above. This is the ONE
      // placement path for every `positionExact`-only shape: a lone outlier (HEADROOM), a dense per-slot
      // cluster (the cab's identity block), and a whole canvas-authored page (where `mainCtls` ends up
      // empty and every control in the row lands here) all flow through it identically.
      for (const cluster of clusterByCanvasRow(outliers)) {
        let cx = 0;
        let ch = 1;
        for (const o of cluster) {
          const w = Math.min(o.w, columns);
          if (cx > 0 && cx + w > columns) {
            gridRow += ch;
            cx = 0;
            ch = 1;
          }
          widgets.push({ id: 'w' + o.key, key: o.key, x: cx, y: gridRow, w, h: o.h, view: o.view, row: rowIndex });
          cx += w;
          ch = Math.max(ch, o.h);
        }
        gridRow += ch;
      }
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
 *  stranding `Frequency 3` at the end of one line and its type/gain/Q at the start of the next.
 *
 *  A section heading (`view: 'label'`) is a HARD break, never a soft one: `buildDeviceLayoutBoard` never
 *  merges controls it doesn't head back in with it, at any width. But a row never has more than ONE
 *  reserved heading LINE no matter how many headings share it (INPUT BOOST + SATURATION sit side by side
 *  on one line) — so a row-group splits into exactly three Y-bands relative to that single `headingY`:
 *  controls before it (belong to no heading — the TONESTACK row's Preamp Sag..Preamp Bias Excursion),
 *  the heading(s) themselves, and everything after (headed or not — SATURATION's row also trails unheaded
 *  Low Cut/High Cut, and it all reflows as ONE shared segment, matching the single combined control-line
 *  the device draws). A lone heading is re-sized from what its "after" band actually placed; multiple
 *  headings sharing one line keep their build-time relative position/width (clamped to fit) instead —
 *  which of the reflowed "after" widgets belongs to which heading is spacer-boundary information that
 *  lives only in `buildDeviceLayoutBoard`'s original `LayoutControl` array, not in this flattened list. */
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

  // Places one label-free segment starting at grid line `startY` — the row-wide authoredX-or-wrap logic
  // this replaced, unchanged, just scoped to whichever segment a heading split off. Returns the number
  // of grid lines it consumed (0 for an empty segment).
  const placeSegment = (seg: SurfaceWidget[], startY: number): number => {
    if (!seg.length) return 0;
    // A segment the device authored columns for is replayed at those columns, exactly as it was built —
    // the authored placement IS the layout, so re-flowing it would undo the alignment at every resize.
    // `authoredX` returns null when the segment no longer fits (narrow pane), and the flow path below
    // takes over, which is the same fallback the builder uses.
    const axs = authoredX(seg, columns);
    if (axs) {
      let rh = 1;
      seg.forEach((w, i) => {
        out.push({ ...w, x: axs[i], y: startY, w: Math.min(w.w, columns) });
        rh = Math.max(rh, w.h);
      });
      return rh;
    }
    let x = 0;
    let y = startY;
    let rowH = 1;
    for (let i = 0; i < seg.length; ) {
      // A band set (shared `group`) wraps as a unit, exactly as it was built — see the note above.
      let end = i + 1;
      if (seg[i].group != null) while (end < seg.length && seg[end].group === seg[i].group) end++;
      const groupW = seg.slice(i, end).reduce((n, w) => n + Math.min(w.w, columns), 0);
      if (x > 0 && groupW <= columns && x + groupW > columns) {
        y += rowH;
        x = 0;
        rowH = 1;
      }
      for (; i < end; i++) {
        const w = seg[i];
        const ww = Math.min(w.w, columns);
        if (x + ww > columns) {
          y += rowH;
          x = 0;
          rowH = 1;
        }
        out.push({ ...w, x, y, w: ww });
        x += ww;
        rowH = Math.max(rowH, w.h);
      }
    }
    return y - startY + rowH;
  };

  for (const key of [...rows.keys()].sort((a, b) => a - b)) {
    const rw = rows.get(key)!.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const firstLabel = rw.find((w) => w.view === 'label');
    if (!firstLabel) {
      gy += placeSegment(rw, gy); // no heading: one flowing segment, exactly as a headingless row always was
      continue;
    }
    // `buildDeviceLayoutBoard` never gives a source row more than ONE reserved heading line, no matter
    // how many headings share it (INPUT BOOST + SATURATION sit on the SAME line, side by side) — so the
    // row-group splits into exactly three Y-bands relative to that one `headingY`, not one break per
    // label. Controls before it belong to no heading and reflow as their own segment; everything after
    // it — headed or not (SATURATION's row also trails unheaded Low Cut/High Cut) — reflows as ONE
    // shared segment, matching the single combined control-line the device itself draws.
    const headingY = firstLabel.y;
    const before = rw.filter((w) => w.y < headingY);
    const headings = rw.filter((w) => w.y === headingY);
    const after = rw.filter((w) => w.y > headingY);

    gy += placeSegment(before, gy);
    const lineY = gy;
    const afterStartY = lineY + 1;
    const consumed = placeSegment(after, afterStartY);
    const placedAfter = out.slice(-after.length);

    // `members` (populated by buildDeviceLayoutBoard from groupSectionLabels + the row's authored columns)
    // names exactly which of `after`'s widgets belong to which heading — that's spacer/column-gap
    // boundary information only the original LayoutControl array has, which this flattened, already
    // reflowed list doesn't; without it we'd have to guess. A heading resizes from ONLY its true members,
    // post-reflow, so e.g. OUTPUT COMPRESSOR never re-expands to cover the unheaded Master Bias Excursion
    // trailing on the same row. A board saved before `members` existed falls back to the old behaviour:
    // single heading claims everything after it (all it could distinguish then); multiple headings keep
    // their build-time relative position/width (clamped to fit) rather than guess wrong.
    for (const h of headings) {
      const trueMembers = h.members ? placedAfter.filter((w) => h.members!.includes(w.key)) : headings.length === 1 ? placedAfter : null;
      if (trueMembers?.length) {
        const minX = Math.min(...trueMembers.map((w) => w.x));
        const maxEnd = Math.max(...trueMembers.map((w) => w.x + w.w));
        out.push({ ...h, x: minX, y: lineY, w: Math.max(1, maxEnd - minX) });
      } else if (headings.length === 1) {
        out.push({ ...h, x: 0, y: lineY, w: Math.min(h.w, columns) });
      } else {
        out.push({ ...h, x: Math.min(h.x, Math.max(0, columns - 1)), y: lineY, w: Math.min(h.w, columns) });
      }
    }
    gy = afterStartY + consumed;
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
