// Per-block type/kind listing + drag-into-filters model for the docked Preset Browser detail pane (V13f).
//
// Pure logic over decoded blocks: it derives each placed block's type/variety/kind (one row per channel
// for every family), and encodes/parses the drag payload used to drop a block onto the FILTERS row. The old
// per-parameter listing was removed — the panel now shows block kinds only. The docked runtime reaches
// the SAME decoded blocks the monolith uses (library.paramsOf via the runtime host), so this is FULL
// param parity (the monolith keeps its own param list). `matchParamCond` lives in the query module (it
// drives the filter path) and is re-exported here.

// matchParamCond lives in the query module (it is on the filter path). Re-exported here so existing
// callers keep their import.
export { matchParamCond } from './presetBrowserWorkbenchQuery';
import type { AxisPbDragPayload } from './presetBrowserWorkbenchFilters';
import { axisPbCatColor, axisPbCatLabel } from './presetBrowserWorkbenchRowChips';
import type { SpecDecodedBlock, SpecDecodedParam } from './presetBrowserWorkbenchSpecs';

// A decoded param as the detail listing needs it (superset of SpecDecodedParam with the catalog ids).
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

// A block's params worth showing, skipping zero/default noise; cap at 12 per block (verbatim from
// monolith `detailParams`). Still used by the Command Palette's saved-block preview — the detail pane
// no longer lists params (it shows block kinds instead).
export function detailParams(b: DetailBlock): DetailParam[] {
  return b.params.filter((p) => p.enumLabel != null || (p.value != null && Math.abs(p.value) > 1e-4)).slice(0, 12);
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

// ── the whole detail block listing (what the detail pane renders) ────────────────────────────────
// The detail shows a block's TYPE/KIND, not its parameters: a single type selector for most families,
// and one row per channel for a channel-blocked family (the amp).

// A type/kind row in a detail card — one per channel (A-D). Channels are the rule: every gen-3 block
// decodes one entry per channel (the amp's four calibrated, every other family's from its own record
// geometry), so a card lists a Ch row per channel; a single-channel family (Send/Return) renders one.
export interface DetailKind {
  label: string; // "Ch A" …
  value: string; // type/model name
}

export interface DetailBlockCard {
  effectId?: number;
  slug: string;
  category: string;
  color: string;
  instanceLabel: string;
  blockPayload: AxisPbDragPayload; // drag/double-click the header → filter by this block
  /** One type/kind row per channel, in channel order. */
  kinds: DetailKind[];
}

// IO blocks excluded from the listing (verbatim from monolith detail filter).
const IO = new Set(['input', 'output']);

// The TYPE/model selector param: `<FAM>_MODEL`, `<FAM>_TYPE`, or `<FAM>_BASETYPE` (MULTITAP/PLEX).
const TYPE_PARAM = /(_TYPE|_MODEL|_BASETYPE)$/;

// A block's type/variety/kind: its decoded `typeName`, else the type-selector param's label, else ''.
// CABINET (no single type selector — its "type" is the IR index) falls back to a type-ish param.
export function detailKind(b: DetailBlock): string {
  const named = b.typeName?.trim();
  if (named) return named;
  const p = b.params.find((x) => TYPE_PARAM.test(x.name)) ?? b.params.find((x) => x.label.toLowerCase() === 'type');
  if (!p) return '';
  return p.enumLabel ?? (p.value != null ? fmtVal(p) : '');
}

// Build the detail block listing. `focusEid` (an effectId) restricts the listing to that single block
// when set; otherwise all non-IO blocks are shown. Blocks sharing an effectId are one placed block.
// Channels are the rule: every card lists channel rows (A-D), grouped by effectId, so a block's
// per-channel types (amp, drive, delay, reverb, …) collapse into one card.
export function buildDetailBlockCards(blocks: DetailBlock[], focusEid: number | null): DetailBlockCard[] {
  const byEffect = new Map<string, DetailBlock[]>();
  const order: string[] = [];
  for (const b of blocks) {
    if (IO.has(b.slug)) continue;
    if (focusEid != null && b.effectId !== focusEid) continue;
    const key = b.effectId != null ? `eid-${b.effectId}` : `${b.slug}-${b.instance ?? 1}`;
    if (!byEffect.has(key)) {
      byEffect.set(key, []);
      order.push(key);
    }
    byEffect.get(key)!.push(b);
  }

  const cards: DetailBlockCard[] = [];
  for (const key of order) {
    const group = byEffect.get(key)!;
    const head = group[0];
    const kinds: DetailKind[] = group
      .map((b) => ({ ch: b.channel ?? 0, value: detailKind(b) }))
      .sort((a, b) => a.ch - b.ch)
      .map(({ ch, value }) => ({ label: `Ch ${'ABCD'[ch] ?? ch + 1}`, value }));
    cards.push({
      effectId: head.effectId,
      slug: head.slug,
      category: axisPbCatLabel(head.slug),
      color: axisPbCatColor(head.slug),
      instanceLabel: `#${head.instance ?? 1}`,
      blockPayload: { slug: head.slug },
      kinds
    });
  }
  return cards;
}
