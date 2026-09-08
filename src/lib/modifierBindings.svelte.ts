// Enumerates the device's active modifier→target links so the block canvas can badge controls that
// have a modifier attached. Reads /mod/model once plus each modifier slot's raw values, then caches
// the (targetEffectId, targetParam) pairs; refreshed on block/preset change and after a bind.

import { forgefx } from './forgefx';
import { editor } from './editor.svelte';
import { boundTargetKeys, modifierTargetKey, type ModSlotBinding } from './modifierBindings';

class ModifierBindingsStore {
  #bound = $state<Set<string>>(new Set());
  #loading = false;

  get bound(): Set<string> {
    return this.#bound;
  }

  has(targetEffectId: number | null | undefined, targetParam: number | null | undefined): boolean {
    if (targetEffectId == null || targetParam == null) return false;
    return this.#bound.has(modifierTargetKey(targetEffectId, targetParam));
  }

  async refresh(): Promise<void> {
    if (!editor.isV2 || !editor.caps?.modifiers?.bind) {
      this.#bound = new Set();
      return;
    }
    if (this.#loading) return;
    this.#loading = true;
    try {
      const mm = await forgefx.modModel();
      const srcPid = mm?.fields?.source?.pid;
      const tgtEidPid = mm?.fields?.targetEffectId?.pid;
      const tgtParamPid = mm?.fields?.targetParam?.pid;
      const slotCount = mm?.slotCount ?? 0;
      if (!mm || mm.bindingSupported !== true || srcPid == null || tgtEidPid == null || tgtParamPid == null || slotCount <= 0) {
        this.#bound = new Set();
        return;
      }
      const reads: Promise<ModSlotBinding | null>[] = Array.from({ length: slotCount }, (_, i) =>
        forgefx
          .rawBlock(mm.effectId + i)
          .then(({ values }) => ({
            source: values[srcPid] ?? 0,
            targetEffectId: values[tgtEidPid] ?? 0,
            targetParam: values[tgtParamPid] ?? 0
          }))
          .catch(() => null)
      );
      const slots = (await Promise.all(reads)).filter((s): s is ModSlotBinding => s != null);
      this.#bound = boundTargetKeys(slots);
    } catch {
      this.#bound = new Set();
    } finally {
      this.#loading = false;
    }
  }
}

export const modifierBindings = new ModifierBindingsStore();
