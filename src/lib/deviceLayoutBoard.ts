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
//   labels, and params the device didn't surface). A control that belongs to ANOTHER block (a cross-block
//   ref: Controllers › Modifiers, Tempo/Pitch, CS per Scene, …) is always a gap unless the server names
//   its owner by effect id and that is the open block (`isForeignControl`): its paramId is in the
//   owner's id space and must never bind to the open block's param with the same number.
// - `layoutVariantSig`: the served layout variant's fingerprint (re-seeds the Default board on a type
//   change).
// UI-free (no Svelte), unit-tested in deviceLayoutBoard.test.ts.

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
    else if (widget === 'number' || widget === 'readout' || widget === 'meter') candidate = 'number';
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
  /** Effect id of the block being edited (null/undefined = unknown: no cross-block ref can bind). */
  effectId?: number | null;
  /** Resolve as versions before the guard did (a cross-block ref binds by its bare paramId). ONLY for
   *  recognising a stored Default board that is still exactly such an old built-in seed (boardPersistence
   *  `previousSeed`), so it follows the current, guarded seed. Never for anything that is drawn. */
  legacyUnguarded?: boolean;
}

/** True when a layout control belongs to another block than the open one: it carries a cross-block ref
 *  whose owner is not proven to be the open block (no `effectId`, or a different one). Such a control
 *  never binds to a catalog entry of the open block. */
export function isForeignControl(ctl: LayoutControl, owner: LayoutOwner = {}): boolean {
  if (owner.legacyUnguarded) return false;
  const x = (ctl as { crossBlock?: unknown }).crossBlock;
  if (x == null || typeof x !== 'object') return false;
  const ownerId = (x as { effectId?: unknown }).effectId;
  return !(typeof ownerId === 'number' && typeof owner.effectId === 'number' && ownerId === owner.effectId);
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
