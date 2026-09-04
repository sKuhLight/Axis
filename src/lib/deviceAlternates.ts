// Which of several controls anchored at the SAME canvas coordinate the device is currently drawing.
//
// The official editor stacks alternates: it authors two (or more) controls at one position and shows
// one at a time, swapping them on ANOTHER control's value. The device now supplies that gate itself
// on the control's `render.controllingParamName` / `render.controllingParamValue` (a visibility gate:
// the control renders when the named param's current value is in the comma-joined list) — so this
// module READS it instead of naming block-specific gates.
//
// The ONE gate the layout data does NOT carry is the PEQ band gain/slope pair: a peaking band shows
// its `Gain` knob, a shelf/cut band its `Slope` dropdown — that is a property of the filter TYPE
// value, not of the layout, and is resolved via `shapeFromLabel` (documented below), never a
// hardcoded family list.

import { shapeFromLabel } from './eq';
import type { LayoutControl } from './types';

/** Live state the gates read, by editor param SYMBOL — never by paramId, which is family-scoped and
 *  shifts with the block's type. */
export interface AlternateContext {
  /** Current numeric value of a param, or undefined when it is not live. */
  valueOf: (paramName: string) => number | undefined;
  /** Current option LABEL of an enum param, or undefined when it is not live / not an enum. */
  labelOf: (paramName: string) => string | undefined;
}

/** Never-live context — every gate falls through to the default. Used for pure placement tests. */
export const NO_ALTERNATE_CONTEXT: AlternateContext = { valueOf: () => undefined, labelOf: () => undefined };

const isSlope = (c: LayoutControl) => /SLOPE$/.test(c.paramName ?? '');

/** Does this control's `controllingParam` visibility gate currently pass? No gate → always. */
function gatePasses(c: LayoutControl, ctx: AlternateContext): boolean {
  const name = c.render?.controllingParamName;
  if (!name) return true;
  const val = ctx.valueOf(name);
  if (val == null) return true; // controlling param not live → show the control (default)
  const list = (c.render?.controllingParamValue ?? '')
    .split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
  if (list.length === 0) return true;
  return list.includes(val);
}

/** `PEQ_GAIN1` → `PEQ_TYPE1`: the type enum for the band a gain knob belongs to. Null when the symbol
 *  is not an indexed gain, which is the only spelling the corpus's slope alternates use. */
function bandTypeSymbol(paramName: string | null | undefined): string | null {
  const m = /^(.*)_GAIN(\d+)$/.exec(paramName ?? '');
  return m ? `${m[1]}_TYPE${m[2]}` : null;
}

/**
 * Index within `group` of the alternate the device would be drawing right now.
 *
 * `group` is in document order, and index 0 — the control the editor authored first — is the default
 * for every gate that cannot be resolved. A group of one always answers 0.
 */
export function pickAlternate(group: readonly LayoutControl[], ctx: AlternateContext): number {
  if (group.length < 2) return 0;

  // ── the device's own visibility gate (render.controllingParamName/Value) ──
  // A gate resolves to exactly one visible control (e.g. graph_cab vs graph_cabZoom on CABINET_ZOOM,
  // the GLOBAL out-2 pair on GLOBAL_OUT2_TYPE). When the controlling param is live, only the matching
  // control is visible; when it is not live, all pass and the next shape below decides.
  const passing = group.map((c, i) => ({ c, i })).filter(({ c }) => gatePasses(c, ctx));
  if (passing.length === 1) return passing[0].i;

  // ── gain/slope pair: a shelf or cut band shows its slope, a peaking band its gain ──
  const slopeIndex = group.findIndex(isSlope);
  const gainIndex = group.findIndex((c) => bandTypeSymbol(c.paramName) != null);
  if (slopeIndex >= 0 && gainIndex >= 0) {
    const typeSymbol = bandTypeSymbol(group[gainIndex].paramName)!;
    const typeLabel = ctx.labelOf(typeSymbol);
    if (typeLabel == null) return gainIndex; // type not live → the gain knob, the commoner state
    // `isLow` only decides WHICH side a side-agnostic label means; here we care solely about
    // shelf/cut vs bell, which is side-independent, so either argument gives the same answer.
    return shapeFromLabel(typeLabel, true) === 'bell' ? gainIndex : slopeIndex;
  }

  // Default: the first control that still passes the gate, else index 0 (the editor's own first).
  return passing.length ? passing[0].i : 0;
}

/**
 * Resolve a whole page's alternates: `alternateKey` → the index within that anchor group to draw.
 *
 * `controls` must be the page's placed controls, already carrying `alternateKey`/`alternateIndex` from
 * `placePage`. Anchors with a single occupant are omitted — nothing to decide.
 */
export function resolveAlternates<T extends { control: LayoutControl; alternateKey: string; alternateIndex: number }>(
  controls: readonly T[],
  ctx: AlternateContext
): Map<string, number> {
  const groups = new Map<string, LayoutControl[]>();
  for (const c of controls) {
    const g = groups.get(c.alternateKey) ?? [];
    g[c.alternateIndex] = c.control;
    groups.set(c.alternateKey, g);
  }
  const out = new Map<string, number>();
  for (const [key, g] of groups) if (g.length > 1) out.set(key, pickAlternate(g, ctx));
  return out;
}

/** Should this placed control be drawn? False only for the losing side of an alternate group. */
export function isVisible(
  c: { alternateKey: string; alternateIndex: number },
  resolved: Map<string, number>
): boolean {
  const chosen = resolved.get(c.alternateKey);
  return chosen == null || chosen === c.alternateIndex;
}
