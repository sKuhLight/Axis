// Which of several controls anchored at the SAME canvas coordinate the device is currently drawing.
//
// The official editor stacks alternates: it authors two (or more) controls at one position and shows
// one at a time, swapping them on ANOTHER control's value. Nothing in the layout data says which — the
// gate lives in the editor's own JUCE code — so this module is the one place Axis names those gates.
//
// IT IS A CLOSED SET, NOT A PATCH SURFACE. Sweeping the served corpus (FM3 + FM9 + Axe-Fx III, every
// variant, every page, after ForgeFX's `pruneControlsByFw` has removed the FIRMWARE alternates) finds
// exactly 17 co-anchored groups in three shapes:
//
//   6x  knobCompact | dropdownCompact3   PEQ bands 1 and 5: a `Gain` knob or a `Slope` dropdown
//   9x  graph_cab* | graph_cabZoom*      the cab Align page's response graph, zoomed or not
//   2x  dropdown1 | dropdown1            FM3 GLOBAL out 2: `Boost/Pad` or `Output Level`
//
// `deviceAlternates.test.ts` re-derives that census from the corpus and fails if a fourth shape
// appears, so this stays a bounded list rather than growing one entry per bug report.
//
// The gates themselves are device semantics, not layout guesses:
//   • ZOOM  — the same page authors a real `*_ZOOM` toggle param. Read it.
//   • SLOPE — a parametric band shows `Slope` only when its filter TYPE is a shelf or a cut; a peaking
//     band has a gain instead. That is the same fact `eq.ts:shapeFromLabel` already encodes for the
//     response curve, so this reuses it rather than re-listing the type options.
//   • The GLOBAL out-2 pair is gated on a hardware/global setting that the block protocol does not
//     expose at all. It falls through to the default (index 0 = the editor's own first-authored
//     control) and is called out here rather than silently guessed.

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

const isZoom = (c: LayoutControl) => /Zoom/.test(c.rawWidget ?? '');
const isSlope = (c: LayoutControl) => /SLOPE$/.test(c.paramName ?? '');

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

  // ── zoom pair: the page's own `*_ZOOM` toggle picks the zoomed variant ──
  const zoomIndex = group.findIndex(isZoom);
  if (zoomIndex >= 0 && group.some((c) => !isZoom(c))) {
    // The toggle is authored on the same page but is NOT part of this anchor group, so it is addressed
    // by symbol. Every occurrence in the corpus is `<FAMILY>_ZOOM`; take it off whichever family the
    // group's own params name, falling back to the cab's (the only family that ships a zoom graph).
    const family = group.map((c) => c.paramName?.split('_')[0]).find(Boolean) ?? 'CABINET';
    const on = ctx.valueOf(`${family}_ZOOM`);
    return on ? zoomIndex : group.findIndex((c) => !isZoom(c));
  }

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

  return 0;
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
