// Per-slot cab identity card: the "CAB 1" / "CAB 2" cluster FM3-Edit draws at the LEFT of each cab
// row — slot title, the live cabinet name, its bank + IR number, a way into the IR picker, and (legacy
// mode only) IR Length.
//
// The device authors ONE layout row per cab slot, and that row mixes two placement styles: an identity
// cluster placed by absolute canvas pixels (`positionExact` — the `CAB n` heading, Picker, M/S, Bank,
// Type, the live Name, IR Length) and the knob row placed by authored columns starting at col 3. Cols
// 0-2 are empty in the device data precisely BECAUSE the identity cluster occupies them. Axis could not
// render that cluster: `Bank`/`Type` are hidden from the grid because the CabPicker owns those params
// (BlockEditor's CAB_PICKER_IDS), `Name` is a live-value field with no static render path, and
// `Picker`/`M`/`S` carry pseudo param ids (65280/65286/65288) that no live param backs. All that survived
// was an orphaned `IR Length` card floating under the knobs with no indication of which slot it was for.
//
// So this is Axis RE-PRESENTING state the device already gives us — same posture as cabMicGraphs.ts and
// geqBandsFromLayout — not drawing something the layout told us to draw. It reads the live selection from
// `CabState` (the same snapshot the header's picker button already shows, re-read whenever the picker
// closes), and binds the one genuinely editable control it owns, IR Length, by ForgeFX param SYMBOL
// (`CABINET_IRLENGTH{n}`) rather than by id — ids are family-scoped and shift with the block's variant.
//
// M/S (mute/solo) are deliberately absent: their pseudo ids have no live param, enum, or endpoint behind
// them. They are FM3-Edit editor-internal, and nothing in Axis can read or write them today.
//
// In DynaCab mode the card shows the DynaCab cabinet name and drops Bank/IR#/IR Length — those params are
// correctly hidden in that mode (BlockEditor's CAB_LEGACY_ONLY_IDS), and the DynaCab selection is a single
// value, not a bank + index.

import type { CabState, DeviceLayout, EnumParam, LayoutControl } from './types';

export interface CabIdentitySpec {
  key: string; // 'cabid1' | 'cabid2' | …
  slot: number; // 1-based, matches the device's CAB n numbering
  title: string; // 'CAB 1' / 'CAB 2'
  /** Layout page the slot's own knobs live on — the card sits on that page. */
  page: number;
  /** Row WITHIN that page carrying the slot's knobs. The board builder places the card in that row's
   *  reserved leading columns, so it lands beside its own knobs rather than above or below them. */
  row: number;
  /** Live cabinet name ("4x12 Fractal GB 160 1"), or null when CabState hasn't arrived yet. */
  name: string | null;
  /** Legacy IR mode only — the bank ("Factory 2") and the IR number within it. */
  bank: string | null;
  irIndex: number | null;
  /** Legacy IR mode only — the live IR Length enum (`CABINET_IRLENGTH{n}`), the one editable control the
   *  card owns. Null in DynaCab mode, or when the variant doesn't serve it. */
  irLength: EnumParam | null;
  dyna: boolean;
}

const MAX_SLOTS = 4; // CABINET_* params go up to 4 mic slots in the protocol tables

/** Symbol → the page/row it appears on and its device-true paramId. Same posture as cabMicGraphs'
 *  `paramIndex`: the layout is the only place that maps a stable ForgeFX symbol to the id THIS block's
 *  variant uses, so every binding here goes through it. */
function symbolIndex(layout: DeviceLayout | null | undefined) {
  const at = new Map<string, { page: number; row: number }>();
  const idOf = new Map<string, number>();
  (layout?.pages ?? []).forEach((page, pageIndex) => {
    (page.rows ?? []).forEach((row, rowIndex) => {
      for (const c of (row.controls ?? []) as LayoutControl[]) {
        if (!c.paramName) continue;
        if (!at.has(c.paramName)) at.set(c.paramName, { page: pageIndex, row: rowIndex });
        if (c.paramId != null && !idOf.has(c.paramName)) idOf.set(c.paramName, c.paramId);
      }
    });
  });
  return { at, idOf };
}

/** One identity card per live cab slot. Empty when the block serves no cab rows (not a Cab block, or a
 *  variant with no slots) — a slot whose anchor knob isn't in the layout is skipped rather than placed
 *  on a guessed row. */
export function deriveCabIdentityCards(input: {
  layout: DeviceLayout | null | undefined;
  enums: EnumParam[];
  cabState: CabState | null;
  dyna: boolean;
}): CabIdentitySpec[] {
  const { at, idOf } = symbolIndex(input.layout);
  const enumById = new Map(input.enums.map((e) => [e.id, e]));
  const slotOf = new Map(input.cabState?.slots.map((s) => [s.slot, s]) ?? []);
  const out: CabIdentitySpec[] = [];
  for (let n = 1; n <= MAX_SLOTS; n++) {
    // Anchor on Level: it is the FIRST authored-column control of the slot's row, so the row it names is
    // exactly the row whose leading columns the card is meant to fill.
    const anchor = at.get(`CABINET_LEVEL${n}`) ?? at.get(`CABINET_PAN${n}`);
    if (!anchor) continue; // slot not on this variant — skip rather than half-draw it
    const slot = slotOf.get(n) ?? null;
    // IR Length is the ONE editable control this card owns. Legacy mode only — in DynaCab mode the device
    // ignores it and BlockEditor already hides it from the grid.
    const irLengthId = idOf.get(`CABINET_IRLENGTH${n}`);
    const irLength = input.dyna || irLengthId == null ? null : (enumById.get(irLengthId) ?? null);
    out.push({
      key: `cabid${n}`,
      slot: n,
      title: `CAB ${n}`,
      page: anchor.page,
      row: anchor.row,
      name: slot ? (input.dyna ? slot.dyna.label : slot.irName) : null,
      bank: !input.dyna && slot ? slot.bank.label : null,
      irIndex: !input.dyna && slot ? slot.irIndex : null,
      irLength,
      dyna: input.dyna
    });
  }
  return out;
}
