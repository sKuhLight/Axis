import type { AxisPbRowBlockChip } from './presetBrowserWorkbenchRowChips';
import type { AxisPbCond } from './presetBrowserWorkbenchQuery';

// Narrows a row's mini signal-chain chips down to just the block(s) relevant to the active search, so
// AxisPresetBrowserSearchOverlay.svelte's results list doesn't repeat the ENTIRE chain on every row —
// only the part that explains why this preset matched. Not used by the docked Preset Browser panel,
// which always shows the full chain (browsing there is exploratory, not a quick "why did this match"
// glance, and it has the width to spare).
//
// No active search (no block condition, no free text) → nothing to highlight, so the chain hides
// entirely rather than showing an arbitrary full/empty state.
export function matchingChainChips(
  chips: AxisPbRowBlockChip[],
  conditions: AxisPbCond[],
  freeText: string
): AxisPbRowBlockChip[] {
  const blockConds = conditions.filter((c): c is Extract<AxisPbCond, { kind: 'block' }> => c.kind === 'block');
  const freeTokens = freeText.toLowerCase().split(/\s+/).filter(Boolean);
  if (!blockConds.length && !freeTokens.length) return [];

  return chips.filter((chip) => {
    // A structured `BLOCK(...)` filter names the family directly — that's reason enough regardless of
    // its TYPE param (the row already passed the real matchBlockCond check to be visible at all).
    if (blockConds.some((cond) => cond.block === chip.slug)) return true;
    if (!freeTokens.length) return false;
    const haystack = `${chip.cat} ${chip.type ?? ''} ${chip.slug}`.toLowerCase();
    return freeTokens.some((token) => haystack.includes(token));
  });
}
