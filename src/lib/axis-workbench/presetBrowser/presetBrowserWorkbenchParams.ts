// Per-block parameter listing + drag-into-filters model for the docked Preset Browser detail pane (V13f).
//
// Ported from src/lib/PresetBrowser.svelte (`blocksOf`, `detailParams`, `fmtVal`, `fmtNum`,
// `matchedKeys`, `paramDragPayload`, `startDrag`/`onQueryDrop` payload codec). Pure logic over decoded
// blocks: it selects the params worth showing per block, formats their values, works out which cells are
// highlighted by the active query, and encodes/parses the drag payload used to drop a param onto the
// FILTERS row. `matchParamCond` moved to presetBrowserWorkbenchQuery.ts (it drives the filter path now,
// not just these highlights) and is re-exported here. The docked runtime reaches the SAME decoded blocks
// the monolith uses (library.paramsOf via the runtime host), so this is FULL param parity.

import type { AxisPbCond } from './presetBrowserWorkbenchQuery';
// matchParamCond now lives in the query module (it is on the filter path, not just the detail
// highlight path). Re-exported here so `matchedKeys` and existing callers keep their import.
export { matchParamCond } from './presetBrowserWorkbenchQuery';
import { matchParamCond } from './presetBrowserWorkbenchQuery';
import type { AxisPbDragPayload } from './presetBrowserWorkbenchFilters';
import { axisPbCatColor, axisPbCatLabel } from './presetBrowserWorkbenchRowChips';
import type { SpecDecodedBlock, SpecDecodedParam } from './presetBrowserWorkbenchSpecs';

// A decoded param as the detail listing needs it (superset of SpecDecodedParam with the drag/highlight ids).
export interface DetailParam extends SpecDecodedParam {
  paramId: number;
  name: string; // catalog symbol, e.g. DISTORT_TYPE
  unit?: string;
}

export interface DetailBlock extends SpecDecodedBlock {
  params: DetailParam[];
}

// The DnD mime type for a dragged block/param payload — must match the FILTERS row drop handler.
export const AXIS_PB_DND_MIME = 'application/x-axis-query';

// ── formatting (verbatim from monolith fmtNum / fmtVal) ──────────────────────────────────────────
export function fmtNum(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export function fmtVal(p: { value: number | null; enumLabel?: string | null; unit?: string }): string {
  if (p.enumLabel != null) return p.enumLabel;
  if (p.value == null) return '—';
  return fmtNum(p.value) + (p.unit && p.unit !== 'enum' && p.unit !== 'numeric' ? ' ' + p.unit : '');
}

// A block's params worth showing in the detail: skip zero/default noise; cap at 12 per block
// (verbatim from monolith `detailParams`).
export function detailParams(b: DetailBlock): DetailParam[] {
  return b.params.filter((p) => p.enumLabel != null || (p.value != null && Math.abs(p.value) > 1e-4)).slice(0, 12);
}

// Which detail cells are highlighted (matched by an active block-param condition), keyed `blockIndex:paramId`
// (verbatim from monolith `matchedKeys`). `blocks` is the entry's decoded block list.
export function matchedKeys(blocks: DetailBlock[], activeConds: AxisPbCond[]): Set<string> {
  const out = new Set<string>();
  for (const c of activeConds) {
    if (c.kind !== 'block' || !c.params.length) continue;
    blocks.forEach((b, bi) => {
      if (b.slug !== c.block) return;
      for (const pc of c.params) {
        for (const p of b.params) {
          if (
            (p.label.toLowerCase() === pc.name.toLowerCase() ||
              (/^type$/i.test(pc.name) && p.name.toLowerCase().endsWith('_type'))) &&
            matchParamCond(b, pc)
          ) {
            out.add(bi + ':' + p.paramId);
          }
        }
      }
    });
  }
  return out;
}

// The drag payload for a dragged detail param (verbatim from monolith `paramDragPayload`): enum → value
// as the label; numeric → the rounded value.
export function paramDragPayload(slug: string, p: DetailParam): AxisPbDragPayload {
  return p.enumLabel != null
    ? { slug, label: p.label, op: '=', val: p.enumLabel }
    : { slug, label: p.label, op: '=', val: String(p.value == null ? '' : Math.round(p.value * 10) / 10) };
}

// Encode a payload for setData on dragstart.
export function encodeDragPayload(p: AxisPbDragPayload): string {
  return JSON.stringify(p);
}

// Parse a payload from getData on drop (returns null on a bad/foreign payload).
export function parseDragPayload(raw: string | null | undefined): AxisPbDragPayload | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as AxisPbDragPayload;
    return p && typeof p.slug === 'string' ? p : null;
  } catch {
    return null;
  }
}

// ── the whole detail block-parameter listing (what the detail pane renders) ──────────────────────
export interface DetailParamCell {
  paramId: number;
  key: string; // param label
  value: string; // formatted display value
  hit: boolean; // highlighted by an active query cond
  payload: AxisPbDragPayload; // drag/double-click → add this cond
}

export interface DetailBlockCard {
  effectId?: number;
  slug: string;
  category: string;
  color: string;
  title: string | null; // typeName
  /** "Ch A" for amp channels, else "#instance". */
  instanceLabel: string;
  blockPayload: AxisPbDragPayload; // drag/double-click the header → filter by this block
  cells: DetailParamCell[];
}

// IO blocks excluded from the listing (verbatim from monolith detail filter).
const IO = new Set(['input', 'output']);

// Build the detail block-parameter listing (verbatim from the monolith d-blocks template). `focusEid` (an
// effectId) restricts the listing to that single block when set; otherwise all non-IO blocks are shown.
export function buildDetailBlockCards(
  blocks: DetailBlock[],
  activeConds: AxisPbCond[],
  focusEid: number | null
): DetailBlockCard[] {
  const hits = matchedKeys(blocks, activeConds);
  const cards: DetailBlockCard[] = [];
  blocks.forEach((b, bi) => {
    if (IO.has(b.slug)) return;
    const cellParams = detailParams(b);
    if (!cellParams.length) return;
    if (focusEid != null && b.effectId !== focusEid) return;
    const cat = axisPbCatLabel(b.slug);
    cards.push({
      effectId: b.effectId,
      slug: b.slug,
      category: cat,
      color: axisPbCatColor(b.slug),
      title: b.typeName ?? null,
      instanceLabel: b.channel != null ? `Ch ${'ABCD'[b.channel]}` : `#${b.instance ?? 1}`,
      blockPayload: { slug: b.slug },
      cells: cellParams.map((p) => ({
        paramId: p.paramId,
        key: p.label,
        value: fmtVal(p),
        hit: hits.has(bi + ':' + p.paramId),
        payload: paramDragPayload(b.slug, p)
      }))
    });
  });
  return cards;
}
