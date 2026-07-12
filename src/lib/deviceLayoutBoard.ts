// Pure builder for the ControlSurface "Default" board from a device-authentic DeviceLayout (v2).
//
// The layout arrives already variant-selected by the server (the block's current type picks the
// variant), so we render its pages as tabs and, INSIDE each page, honour the editor's rows: controls
// flow left→right within a row, rows flow top→bottom. The board model is a flat grid of positioned
// widgets per page (`SurfaceWidget[]`); we compute each widget's grid cell from the row structure and
// tag it with its source `row` so the responsive re-pack (ControlSurface.packRows) can preserve the
// row breaks at any width. This module is UI-free (no Svelte) so the mapping + layout can be unit-tested.
//
// Widget-type → view mapping is deliberately conservative: whenever a control resolves to a live
// catalog entry we start from that entry's own kind/default view (so FM3's mostly-`unknown` migrated
// data renders exactly as it did pre-v2 — no regression) and only refine the VIEW when the layout's
// widget hint is meaningful (slider/number for a continuous param, switch/button for a toggle). Controls
// with no live parameter fall back to the block's meter / bypass / EQ catalog entries where they exist,
// or advance the cursor as a gap (spacers, labels, and params the device didn't surface).

import type { DeviceLayout, LayoutControl } from './types';

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
  } else if (base.kind === 'toggle') {
    if (widget === 'toggle') candidate = 'switch';
    else if (widget === 'button') candidate = 'button';
  }
  return base.views.includes(candidate) ? candidate : base.view;
}

type Resolved = { key: string; view: string } | 'gap';

/** Resolve one layout control to a catalog key + view, or `'gap'` (advance the cursor, draw nothing —
 *  spacers, labels, and parameters the device did not surface as a knob/enum). */
function resolveControl(ctl: LayoutControl, byKey: Map<string, BoardCtl>): Resolved {
  if (ctl.widget === 'spacer') return 'gap';
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
  if ((ctl.widget === 'graph' || ctl.widget === 'label') && byKey.has('eq')) return { key: 'eq', view: 'eq' };
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

/** Stable fingerprint of the served layout variant — changes when the block's type selects a different
 *  layout, so the Default board can be re-seeded (user boards keep their own storage). */
export function layoutVariantSig(layout: DeviceLayout | null | undefined): string {
  if (!layout) return '';
  const ctlCount = (layout.pages ?? []).reduce(
    (n, pg) => n + (pg.rows ?? []).reduce((m, r) => m + (r.controls?.length ?? 0), 0),
    0
  );
  return [
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
 *  set (knobs `k<id>`, enums `e<id>`, plus `eq`/`bypass`/`meter`); `cols` is the target grid width. */
export function buildDeviceLayoutBoard(
  layout: DeviceLayout | null | undefined,
  catalog: BoardCtl[],
  cols: number
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

  const boards: Record<string, SurfaceWidget[]> = {};
  const pageOrder: string[] = [];

  for (const pg of layout.pages) {
    const widgets: SurfaceWidget[] = [];
    const seen = new Set<string>();
    let gridRow = 0;
    (pg.rows ?? []).forEach((row, rowIndex) => {
      let x = 0;
      let rowH = 1;
      let placed = false;
      for (const ctl of row.controls ?? []) {
        const r = resolveControl(ctl, byKey);
        if (r === 'gap') {
          x += 1;
          continue;
        }
        if (seen.has(r.key)) {
          x += 1; // a param listed twice — keep the slot so neighbours don't shift left
          continue;
        }
        const base = byKey.get(r.key);
        if (!base) {
          x += 1;
          continue;
        }
        const w = Math.min(base.w, columns);
        if (x + w > columns) {
          // control doesn't fit the rest of this line — wrap onto a new grid line (still this row)
          gridRow += rowH;
          x = 0;
          rowH = 1;
        }
        seen.add(r.key);
        widgets.push({ id: 'w' + r.key, key: r.key, x, y: gridRow, w, h: base.h, view: r.view, row: rowIndex });
        x += w;
        rowH = Math.max(rowH, base.h);
        placed = true;
      }
      if (placed) gridRow += rowH; // next layout row starts below the tallest widget of this one
    });
    if (!widgets.length) continue;
    const name = uniqName(pg.name?.trim() || `Page ${pageOrder.length + 1}`);
    boards[name] = widgets;
    pageOrder.push(name);
  }

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

/** Row-preserving re-pack for a device-authentic board at a narrower column count: groups widgets by
 *  their source `row`, lays each group left→right (wrapping within the group), and starts every source
 *  row on a fresh grid line so the editor's row structure survives responsive reflow. */
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
    const rw = rows.get(key)!.slice().sort((a, b) => a.x - b.x);
    let x = 0;
    let rowH = 1;
    for (const w of rw) {
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
    gy += rowH;
  }
  for (const w of noRow) {
    out.push({ ...w, x: 0, y: gy });
    gy += w.h;
  }
  return out;
}
