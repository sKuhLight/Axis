// Pure state resolver for the `axis.paramControl` widget.
//
// A param widget binds to one block parameter (by effectId + paramId), but live
// values and writes only work while that block is the *open/selected* block —
// `editor.params`/`editor.enums` are populated per selected block. This resolver
// turns "what block does this widget target?" + "what block is open?" + "does the
// target block exist in the current preset?" into one of three explicit states:
//
//   • live     — the bound block is the open block; the widget reads/writes live.
//   • readonly — the block exists in the preset but is not open; values are a
//                stale preview, edits are disabled, a click OPENS the block.
//   • missing  — the block is not in the current preset at all; the widget is a
//                no-op that says so.
//
// Kept pure (no runes, no editor import) so it is unit-testable and the Svelte
// component only wires live inputs into it.

export type ParamWidgetState = 'live' | 'readonly' | 'missing';

export interface ParamWidgetStateInput {
  /** effectId the widget is bound to (from binding.target). undefined ⇒ unbound. */
  boundEffectId: number | undefined;
  /** effectId of the currently open/selected block, if any. */
  openEffectId: number | undefined;
  /**
   * effectIds present in the current preset grid (placed blocks + shunts).
   * Undefined ⇒ the preset is not loaded yet (treat as "can't tell it's missing").
   */
  presetEffectIds: Iterable<number> | undefined;
}

/**
 * Resolve the param widget's binding state.
 *
 * Rules:
 * - Unbound widgets (no effectId) are treated as `readonly` previews — they show
 *   a static preview value and can't be edited, but aren't flagged "missing"
 *   (there's no block to be missing).
 * - `live` when the bound block is the open block.
 * - `missing` when we have a preset roster and the bound block isn't in it.
 * - `readonly` otherwise (block exists but not open, or roster unknown).
 */
export function resolveParamWidgetState(input: ParamWidgetStateInput): ParamWidgetState {
  const { boundEffectId, openEffectId, presetEffectIds } = input;
  if (boundEffectId == null) return 'readonly';
  if (openEffectId != null && openEffectId === boundEffectId) return 'live';
  if (presetEffectIds != null && !hasEffectId(presetEffectIds, boundEffectId)) return 'missing';
  return 'readonly';
}

function hasEffectId(ids: Iterable<number>, target: number): boolean {
  if (ids instanceof Set) return ids.has(target);
  for (const id of ids) if (id === target) return true;
  return false;
}
