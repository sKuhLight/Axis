// The conversion doc already carries each target block's selected `typeName` (the model it resolved
// to). Fold those into the per-family `models` map a decoded `PresetSummary` carries, so a converted
// preset contributes to every model-based view — Insights' model rows, `library.modelsByFamily`,
// `allModels`, the search haystack — exactly like a decoded device/file entry. Before this, converted
// entries shipped `models: {}`, so their models were invisible to all of those.
import type { ConverterBlock } from '$lib/api/types';

/**
 * Per-family model names from a conversion's target blocks: lowercase family keys → first-seen name
 * casing, each `family\u0000name` pair de-duped. Blocks without a family or a resolved `typeName` are
 * skipped (an unplaced/unresolved block has no model to report).
 */
export function modelsFromConverterBlocks(blocks: readonly ConverterBlock[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const seen = new Set<string>();
  for (const block of blocks) {
    const family = (block.family ?? '').toLowerCase();
    const type = (block.typeName ?? '').trim();
    if (!family || !type) continue;
    const key = `${family}\u0000${type.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (out[family] ??= []).push(type);
  }
  return out;
}
