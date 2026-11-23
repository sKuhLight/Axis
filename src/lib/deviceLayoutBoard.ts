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
//   labels, and params the device didn't surface).
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

/** Resolve one layout control to a catalog key + view, or `'gap'` (advance the cursor, draw nothing —
 *  spacers, labels, and parameters the device did not surface as a knob/enum). */
export function resolveControl(ctl: LayoutControl, byKey: ReadonlyMap<string, BoardCtl>): Resolved {
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
