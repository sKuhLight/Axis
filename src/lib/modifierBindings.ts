// Pure modifier-binding helpers — no device I/O, no runes. A modifier "attaches" a source to a target
// block param; the link lives ON the modifier slot as its own params (source pid 0, targetEffectId
// pid 8, targetParam pid 9). A target has an active modifier when some slot has source > 0 pointing at it.

export interface ModSlotBinding {
  source: number;
  targetEffectId: number;
  targetParam: number;
}

export const modifierTargetKey = (effectId: number, paramId: number): string => `${effectId}:${paramId}`;

/** Fold slot bindings into the set of targets that carry an ACTIVE modifier (source > 0). */
export function boundTargetKeys(slots: ModSlotBinding[]): Set<string> {
  const out = new Set<string>();
  for (const b of slots) {
    if (b.source > 0 && b.targetEffectId > 0) out.add(modifierTargetKey(b.targetEffectId, b.targetParam));
  }
  return out;
}
