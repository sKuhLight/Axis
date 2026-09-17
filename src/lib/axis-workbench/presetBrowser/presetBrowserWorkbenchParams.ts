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
  /** Raw stored u16 (0..65534 model) — the only trustworthy source for the Cab IR ordinal, whose
   *  catalog range scales it into a fractional display value. */
  raw?: number;
}

export interface DetailBlock extends SpecDecodedBlock {
  params: DetailParam[];
}

/** Cab IR names per bank (Factory 1/2, Legacy, Scratchpad, User) — `GET /cab/irs`. */
export type CabIrCatalog = Record<string, string[]>;

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

// A Cab slot line — one per IR slot inside a channel (device-dependent count, 2–4).
export interface DetailSlot {
  label: string; // "CAB 1" …
  value: string; // IR/speaker name, or '—' when absent
  empty: boolean;
}

// A Cab channel section — a flat header plus that channel's slot lines (V13f "Option 5").
export interface DetailSection {
  label: string; // "CH A"
  badge: string; // "A"
  /** This channel is in DynaCab mode — its slots hold speaker/mic models, not legacy IRs. */
  dynacab: boolean;
  slots: DetailSlot[];
}

export interface DetailBlockCard {
  effectId?: number;
  slug: string;
  category: string;
  color: string;
  instanceLabel: string;
  blockPayload: AxisPbDragPayload; // drag/double-click the header → filter by this block
  /** One type/kind row per channel, in channel order. Empty for families rendered as `sections`. */
  kinds: DetailKind[];
  /** Cab only: one flat section per channel, each listing its IR slots. */
  sections?: DetailSection[];
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

// ── Cab slot sections (Option 5) ─────────────────────────────────────────────────────────────────
// A Cab is not "one type per channel": it is N IR slots per channel, N set by the device (the FM3 has
// two, the FM9/III four). The generic one-row-per-channel listing collapsed those slots into a single,
// meaningless number, so a Cab card instead renders one flat section per channel, each listing its own
// slots. Two device-true facts drive it, and neither is assumed:
//   • N comes from the per-slot PICKER/NAME/LABEL/DYNACAB params, which exist ONLY for real slots —
//     CABINET_TYPE/LEVEL/PAN are a universal 1..4 catalog on every gen-3 device and can't tell 2 from 4.
//   • The IR NAME comes from the bank (`CABINET_BANK{n}` enum label) + IR ordinal (`CABINET_TYPE{n}`)
//     resolved against the IR catalog. CABINET_TYPE's catalog range (0..1023) scales its display value
//     into a fraction, so the ordinal comes from the raw u16, exactly as ForgeFX's own cab reader does.
const CAB_CH = 'ABCD';
const CAB_SLOT_ANCHOR = /^CABINET_(PICKER|NAME|LABEL|DYNACAB_TYPE)(\d+)$/;
const cabSlotParam = (symbol: string) => new RegExp(`^CABINET_${symbol}(\\d+)$`);

/** One slot-bearing symbol's params for a Cab channel, keyed by slot number. */
function cabSlotParams(b: DetailBlock, symbol: string): Map<number, DetailParam> {
  const re = cabSlotParam(symbol);
  const out = new Map<number, DetailParam>();
  for (const p of b.params) {
    const m = re.exec(p.name);
    if (m) out.set(Number(m[1]), p);
  }
  return out;
}

/** The device's real slot count — the highest slot that carries a per-slot picker/name/label/dyna param. */
function cabSlotCount(b: DetailBlock): number {
  let max = 0;
  for (const p of b.params) {
    const m = CAB_SLOT_ANCHOR.exec(p.name);
    if (m) max = Math.max(max, Number(m[2]));
  }
  return max;
}

/** The IR ordinal. ForgeFX's own cab reader treats a raw above the bank's max as 16-bit-scaled and
 *  unscales it, else reads it as the ordinal — mirrored here so the two can't drift. */
function cabIrIndex(p: DetailParam | undefined, bankLen: number): number | null {
  if (!p) return null;
  if (p.enumLabel != null) {
    const n = Number(p.enumLabel.replace(/^#/, ''));
    if (Number.isFinite(n)) return n;
  }
  if (typeof p.raw !== 'number') return p.value != null ? Math.round(p.value) : null;
  const max = Math.max(1, bankLen - 1);
  return p.raw > max ? Math.round((p.raw / 65534) * max) : Math.round(p.raw);
}

/** A slot's IR display value: the catalog name for its bank+ordinal, else a stable `#ordinal`. */
function cabSlotValue(
  bank: DetailParam | undefined,
  type: DetailParam | undefined,
  irs: CabIrCatalog
): { value: string; empty: boolean } {
  const bankLabel = bank?.enumLabel?.trim() || null;
  const list = bankLabel ? irs[bankLabel] : undefined;
  const index = cabIrIndex(type, list?.length ?? 1024);
  if (index == null) return { value: '—', empty: true };
  const name = list?.[index];
  return name ? { value: name, empty: false } : { value: `#${index}`, empty: false };
}

/** One flat section per Cab channel, each listing its IR slots in slot order. */
export function cabSections(group: DetailBlock[], irs: CabIrCatalog = {}): DetailSection[] {
  return [...group]
    .sort((a, b) => (a.channel ?? 0) - (b.channel ?? 0))
    .map((b) => {
      const ch = b.channel ?? 0;
      const count = cabSlotCount(b);
      const dyna =
        (b.params.find((p) => p.name === 'CABINET_MODE')?.enumLabel ?? '').trim().toUpperCase() === 'DYNA-CAB';
      const bank = cabSlotParams(b, 'BANK');
      const type = cabSlotParams(b, 'TYPE');
      const dynaType = cabSlotParams(b, 'DYNACAB_TYPE');
      const slots: DetailSlot[] = [];
      for (let n = 1; n <= count; n++) {
        // In DynaCab mode a slot holds a speaker/mic model, not a legacy IR.
        const dynaName = dyna ? dynaType.get(n)?.enumLabel?.trim() : undefined;
        const { value, empty } = dynaName
          ? { value: dynaName, empty: false }
          : cabSlotValue(bank.get(n), type.get(n), irs);
        slots.push({ label: `CAB ${n}`, value, empty });
      }
      const badge = CAB_CH[ch] ?? String(ch + 1);
      return {
        label: `CH ${badge}`,
        badge,
        dynacab: dyna,
        slots
      };
    });
}

// Build the detail block listing. `focusEid` (an effectId) restricts the listing to that single block
// when set; otherwise all non-IO blocks are shown. Blocks sharing an effectId are one placed block.
// Channels are the rule: every card lists channel rows (A-D), grouped by effectId, so a block's
// per-channel types (amp, drive, delay, reverb, …) collapse into one card. A Cab is the exception — it
// carries N IR slots per channel, so it renders per-channel `sections` instead of one kind per channel.
export function buildDetailBlockCards(blocks: DetailBlock[], focusEid: number | null, irs: CabIrCatalog = {}): DetailBlockCard[] {
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
    const isCab = head.slug === 'cab';
    const kinds: DetailKind[] = isCab
      ? []
      : group
          .map((b) => ({ ch: b.channel ?? 0, value: detailKind(b) }))
          .sort((a, b) => a.ch - b.ch)
          .map(({ ch, value }) => ({ label: `Ch ${'ABCD'[ch] ?? ch + 1}`, value }));
    const card: DetailBlockCard = {
      effectId: head.effectId,
      slug: head.slug,
      category: axisPbCatLabel(head.slug),
      color: axisPbCatColor(head.slug),
      instanceLabel: `#${head.instance ?? 1}`,
      blockPayload: { slug: head.slug },
      kinds
    };
    if (isCab) card.sections = cabSections(group, irs);
    cards.push(card);
  }
  return cards;
}
