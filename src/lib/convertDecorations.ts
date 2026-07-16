// Pure builders for the cross-device converter's CONFLICT-VISUALIZATION UI (Phase 2 · META-24 · AXIS-48).
//
// This layers the Phase-1 `convertConflicts` foundation over the live `ScratchState`: it derives the
// per-block resolution flags (from `state.conflicts[].resolved`, NEVER from block fields) that the
// foundation's `blockConflicts` / `isBlocking` / `sourceOutcome` need, and turns them into the tiny
// data the surfaces render — a target-cell decoration (corner badge + severity ring) and a source-cell
// outcome view. Framework-free; unit-tested in convertDecorations.test.ts.
//
// The SEVERITY-vs-BLOCKING rule (per the Phase-2 brief): a cell's badge/ring uses the LOSS/error
// treatment (red ring + `!`) whenever the block is BLOCKING (type-unresolved OR substituted-unverified) —
// even when the block's content severity is only `warn` — because a blocking block gates the commit and
// the operator must see it. Otherwise the badge follows the worst CONTENT severity and the ring appears
// only for a content `loss`. The report keeps content severity (it classifies, it doesn't gate).

import type { ConversionEvent, ConverterDeviceId } from './types';
import type { ScratchState } from './convertScratch';
import {
  blockConflicts,
  worstSev,
  blockBadge,
  isBlocking,
  sevToken,
  sourceOutcome,
  type BlockResolution,
  type SourceResolution,
  type SourceOutcomeView
} from './convertConflicts';

/** A per-cell decoration the target grid paints over the REAL SignalGrid via its `cellDecorations` prop:
 *  a corner badge (`icon` tinted `sevVar`), an optional severity ring (`outlineVar`), and a transient
 *  ok-tick. All fields optional so the live editor's undefined map is a zero-cost no-op. */
export interface CellDecoration {
  icon?: string;
  sevVar?: string;
  outlineVar?: string;
  tick?: boolean;
}

/**
 * The per-block resolution flags the foundation's `blockConflicts` / `isBlocking` consume, derived from
 * the ScratchState conflict list (the `resolved` flags) rather than from any block field:
 * - an UNRESOLVED-kind type conflict → `{ typeUnresolved: !resolved }`
 * - a SUBSTITUTION-kind type conflict → `{ substituted: true, verified: resolved }`
 * Returns undefined when the block has no type conflict (blockConflicts then reports AS-CONVERTED).
 */
export function resolutionFor(state: ScratchState | null | undefined, blockKey: string): BlockResolution | undefined {
  const tc = state?.conflicts.find((c) => c.id === `type:${blockKey}`);
  if (!tc || !tc.type) return undefined;
  if (tc.type.unresolved) return { typeUnresolved: !tc.resolved };
  return { substituted: true, verified: tc.resolved };
}

/** Source-grid resolution overrides (resolved / verified / placed) from the ScratchState, so a resolved
 *  source block flips its outcome badge back to `carried`. Placement reads the live block position. */
export function sourceResolutionFor(state: ScratchState | null | undefined, blockKey: string): SourceResolution | undefined {
  if (!state) return undefined;
  const tc = state.conflicts.find((c) => c.id === `type:${blockKey}`);
  const block = state.blocks.find((b) => b.key === blockKey);
  return {
    resolved: !!tc?.resolved,
    verified: !!tc?.resolved,
    placed: !!block && block.position !== null
  };
}

/**
 * The decoration for one PLACED target cell, or null when the block is clear. Blocking blocks get the
 * loss treatment (red ring + `!`); otherwise the worst content severity drives the badge, and the ring
 * appears only for a content `loss`. `tick` is added by the caller (a transient resolution flash).
 */
export function cellDecorationFor(
  events: ConversionEvent[],
  state: ScratchState | null | undefined,
  blockKey: string,
  targetDevice?: ConverterDeviceId
): CellDecoration | null {
  const resolution = resolutionFor(state, blockKey);
  if (isBlocking(events, blockKey, resolution)) {
    const loss = sevToken('loss');
    return { icon: '!', sevVar: loss, outlineVar: loss };
  }
  const conflicts = blockConflicts(events, blockKey, resolution, targetDevice);
  const worst = worstSev(conflicts);
  const badge = blockBadge(conflicts);
  if (!badge || !worst) return null;
  const sv = sevToken(worst);
  return { icon: badge.icon, sevVar: sv, outlineVar: worst === 'loss' ? sv : undefined };
}

/** The source-grid outcome badge for one source block, with the ScratchState resolution overrides
 *  applied. Thin adapter over the foundation's `sourceOutcome`. */
export function sourceOutcomeFor(
  events: ConversionEvent[],
  state: ScratchState | null | undefined,
  sourceBlockKey: string
): SourceOutcomeView {
  return sourceOutcome(events, sourceBlockKey, sourceResolutionFor(state, sourceBlockKey));
}
