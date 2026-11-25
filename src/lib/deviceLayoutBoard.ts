// Device-layout helpers shared by the Block Editor (the v2 builder `blockEditor/deviceLayoutBoardV2.ts` and
// `blockEditor/layoutPlacement.ts`) and the shape of the previous editor's boards (v1), which the v2
// migration still reads (`axs.surface3.*`, `axs.surface2.*`; never written, never deleted).
//
// - `resolveControl`: one device-layout control → a catalog key + view, or a gap. Widget-type → view
//   mapping is deliberately conservative: whenever a control resolves to a live catalog entry we start from
//   that entry's own kind/default view (so FM3's mostly-`unknown` migrated data renders exactly as it did
//   pre-v2 — no regression) and only refine the VIEW when the layout's widget hint is meaningful
//   (slider/number for a continuous param, switch/button for a toggle). Controls with no live parameter
//   fall back to the block's meter / bypass / EQ catalog entries where they exist, else a gap (spacers,
//   labels, and params the device didn't surface). A graph slot keyed by the server (`graphKey`) becomes
//   the served graph display of that key (`graph:<key>`), the EQ graph rule first. A control that belongs to ANOTHER block (a cross-block
//   ref: Controllers › Modifiers, Tempo/Pitch, CS per Scene, …) is always a gap unless the server names
//   its owner by effect id and that is the open block (`isForeignControl`): its paramId is in the
//   owner's id space and must never bind to the open block's param with the same number.
// - `layoutVariantSig`: the served layout variant's fingerprint (re-seeds the Default board on a type
//   change).
// UI-free (no Svelte), unit-tested in deviceLayoutBoard.test.ts.

import { graphCatalogKey } from './blockVisuals';
import type { DeviceLayout, LayoutControl } from './types';

export interface SurfaceWidget {
  id: string;
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  view: string;
  /** Source layout row index (device-authentic boards only). */
  row?: number;
}
export interface SurfaceBoard {
  pageOrder: string[];
  page: string;
  boards: Record<string, SurfaceWidget[]>;
  /** Fingerprint of the served layout variant; used to re-seed the Default board on a type change. */
  variantSig?: string;
}

/** The subset of a catalog entry (`blockEditor/catalog.ts` BeCtl) the layout helpers need. */
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
    else if (widget === 'number' || widget === 'readout') candidate = 'number';
    else if (widget === 'knob') candidate = 'knob';
  } else if (base.kind === 'toggle') {
    if (widget === 'toggle') candidate = 'switch';
    else if (widget === 'button') candidate = 'button';
  }
  return base.views.includes(candidate) ? candidate : base.view;
}

export type Resolved = { key: string; view: string } | 'gap';

/** What the open block is, for the cross-block guard. */
export interface LayoutOwner {
  /** Effect id of the block being edited (null/undefined = unknown: no ref naming an effect id binds). */
  effectId?: number | null;
  /** Catalog family of the open block's layout (`layout.family`). */
  family?: string | null;
}

/** An editor owner token that names one instance of a multi-instance effect (`ID_OUTPUT1`, `ID_DISTORT1`):
 *  it ends in an instance number. A single-instance token (`ID_FOOTCONTROLLER`) does not. */
const isInstanceToken = (effect: unknown): boolean => typeof effect !== 'string' || /\d\s*$/.test(effect);

/** True when a layout control belongs to another block than the open one: it carries a cross-block ref
 *  whose owner is not proven to be the open block. Proven: the ref's `effectId` equals the open block's;
 *  or, without an effect id, the ref names the open layout's own family (same param-id space) and a
 *  single-instance effect (the Foot Controller screen's own params are tagged `ID_FOOTCONTROLLER`).
 *  A same-family ref to one instance of a multi-instance effect (`ID_OUTPUT1` on an Output page) stays
 *  foreign: binding it by family would put another instance's param under its heading. Such a control
 *  never binds to a catalog entry of the open block. */
export function isForeignControl(ctl: LayoutControl, owner: LayoutOwner = {}): boolean {
  const x = (ctl as { crossBlock?: unknown }).crossBlock;
  if (x == null || typeof x !== 'object') return false;
  const ref = x as { effectId?: unknown; effect?: unknown; family?: unknown };
  if (typeof ref.effectId === 'number') return !(typeof owner.effectId === 'number' && ref.effectId === owner.effectId);
  const sameFamily = typeof ref.family === 'string' && !!ref.family && typeof owner.family === 'string' && ref.family === owner.family;
  return !(sameFamily && !isInstanceToken(ref.effect));
}

/** A copy of a layout without cross-block refs: every control resolves by its bare paramId, as versions
 *  before the guard did. ONLY for recognising a stored Default board that is still exactly such an old
 *  built-in seed (`buildDeviceLayoutBoardV2` option `legacyUnguarded`); never for anything that is drawn. */
export function withoutCrossBlockRefs(layout: DeviceLayout): DeviceLayout {
  return {
    ...layout,
    pages: (layout.pages ?? []).map((pg) =>
      !pg ? pg : { ...pg, rows: (pg.rows ?? []).map((r) => (!r ? r : { ...r, controls: (r.controls ?? []).map((c) => (c && c.crossBlock ? { ...c, crossBlock: undefined } : c)) })) }
    )
  };
}

/** Resolve one layout control to a catalog key + view, or `'gap'` (advance the cursor, draw nothing —
 *  spacers, labels, parameters the device did not surface as a knob/enum, and controls of another block
 *  (`isForeignControl`)). */
export function resolveControl(ctl: LayoutControl, byKey: ReadonlyMap<string, BoardCtl>, owner: LayoutOwner = {}): Resolved {
  if (ctl.widget === 'spacer') return 'gap';
  if (isForeignControl(ctl, owner)) return 'gap';
  // A live param → its catalog entry (knob `k<id>` or enum `e<id>`), refined by the widget hint.
  if (ctl.paramId != null) {
    const knobKey = `k${ctl.paramId}`;
    const enumKey = `e${ctl.paramId}`;
    const base = byKey.get(knobKey) ?? byKey.get(enumKey);
    if (base && (ctl.widget !== 'meter' || base.kind === 'meter')) return { key: base.key, view: viewForWidget(ctl.widget, base) };
  }
  // No live param → the block-level catalog entries the widget hint points at.
  if (ctl.widget === 'meter' && byKey.has('meter')) return { key: 'meter', view: 'meter' };
  if (ctl.widget === 'button' && isBypassControl(ctl) && byKey.has('bypass')) return { key: 'bypass', view: 'action' };
  if (ctl.widget === 'graph' && ctl.rawWidget === 'graph_looper' && byKey.has('wave')) return { key: 'wave', view: 'wave' };
  if (ctl.widget === 'graph' && (!ctl.graphKey || ctl.graphKey === 'eq') && byKey.has('eq')) return { key: 'eq', view: 'eq' };
  // a graph slot the server keyed (`graphKey`) → the served display of that key, when the block serves it
  // (the EQ rule above stays first: a PEQ / GEQ slot is the interactive EQ graph)
  if (ctl.widget === 'graph' && typeof ctl.graphKey === 'string' && ctl.graphKey) {
    const g = byKey.get(graphCatalogKey(ctl.graphKey));
    if (g) return { key: g.key, view: 'graph' };
  }
  // Labels, unresolved dropdowns, and anything else with no binding: leave a gap (matches the pre-v2
  // behaviour of silently skipping unmapped controls, but keeps neighbours' horizontal alignment).
  return 'gap';
}

/** Stable fingerprint of the served layout variant — changes when the block's type selects a different
 *  layout, so the Default board can be re-seeded (user boards keep their own storage). */
export function layoutVariantSig(layout: DeviceLayout | null | undefined): string {
  if (!layout) return '';
  const ctlCount = (layout.pages ?? []).reduce(
    (n, pg) => n + (pg.rows ?? []).reduce((m, r) => m + (r.controls?.length ?? 0), 0),
    0
  );
  const base = [
    layout.family ?? '',
    layout.variantName ?? '',
    layout.variantValue ?? '',
    layout.editorName ?? '',
    (layout.pages ?? []).length,
    ctlCount
  ].join('|');
  // A firmware-level variant can contain multiple choices for the same page. Amp models can
  // switch between two pages with the same name and control count inside that one variant.
  const alternatives = layout.pages
    .filter((pg) => pg.selectorParamName != null && pg.value != null)
    .map(({ name, selectorParamName, value }) => [name, selectorParamName, value]);
  return alternatives.length ? `${base}${SELECTED_PAGES_MARKER}${JSON.stringify(alternatives)}` : base;
}

const SELECTED_PAGES_MARKER = '|selected-pages:';

/** Older boards predate page alternatives in their signature. A match on their complete, older
 *  identity lets migration recognize untouched defaults without dropping customized boards. */
export function sameLayoutVariant(stored: string | undefined, current: string): boolean {
  return stored === current || (!!stored && current.startsWith(`${stored}${SELECTED_PAGES_MARKER}`));
}

/** Whether changing a served parameter can select different pages of this block. */
export function isLayoutPageSelector(layout: DeviceLayout | null, paramId: number, effectId: number): boolean {
  if (!layout) return false;
  const selectors = new Set(layout.pages.flatMap((pg) => pg.selectorParamName ? [pg.selectorParamName] : []));
  return selectors.size > 0 && layout.pages.some((pg) => [
    ...(pg.pageControls ?? []), ...pg.rows.flatMap((r) => r.controls)
  ].some((ctl) => ctl.paramId === paramId && ctl.paramName != null && selectors.has(ctl.paramName)
    && !isForeignControl(ctl, { family: layout.family, effectId })));
}
