// Enumerates the device's active modifier→target links so the block canvas can badge controls that
// have a modifier attached. Reads /mod/model once plus each modifier slot's raw values, then caches
// the (targetEffectId, targetParam) pairs; refreshed on block/preset change and after a bind.

import { forgefx } from './forgefx';
import { editor } from './editor.svelte';
import { boundTargetKeys, modifierTargetKey, type ModSlotBinding } from './modifierBindings';
import { deriveModulationGraphs } from '$lib/graphs/modulationGraphs';
import { lfoSourceFromName, type LfoModifierVisualization, type ModifierMapping } from '$lib/graphs/lfoModifier';
import type { NamedParam } from './types';

class ModifierBindingsStore {
  #bound = $state<Set<string>>(new Set());
  #visualizations = $state<Map<string, LfoModifierVisualization>>(new Map());
  #loading = false;
  #refreshAgain = false;
  #generation = 0;

  get bound(): Set<string> {
    return this.#bound;
  }

  has(targetEffectId: number | null | undefined, targetParam: number | null | undefined): boolean {
    if (targetEffectId == null || targetParam == null) return false;
    return this.#bound.has(modifierTargetKey(targetEffectId, targetParam));
  }

  visualization(targetEffectId: number | null | undefined, targetParam: number | null | undefined): LfoModifierVisualization | null {
    if (targetEffectId == null || targetParam == null) return null;
    return this.#visualizations.get(modifierTargetKey(targetEffectId, targetParam)) ?? null;
  }

  async refresh(): Promise<void> {
    if (!editor.isV2 || !editor.caps?.modifiers?.bind) {
      this.#generation++;
      this.#bound = new Set();
      this.#visualizations = new Map();
      return;
    }
    if (this.#loading) {
      this.#generation++;
      this.#refreshAgain = true;
      return;
    }
    this.#loading = true;
    const generation = ++this.#generation;
    try {
      const mm = await forgefx.modModel();
      const srcPid = mm?.fields?.source?.pid;
      const tgtEidPid = mm?.fields?.targetEffectId?.pid;
      const tgtParamPid = mm?.fields?.targetParam?.pid;
      const slotCount = mm?.slotCount ?? 0;
      if (!mm || mm.bindingSupported !== true || srcPid == null || tgtEidPid == null || tgtParamPid == null || slotCount <= 0) {
        if (generation === this.#generation) {
          this.#bound = new Set();
          this.#visualizations = new Map();
        }
        return;
      }
      const reads: Promise<(ModSlotBinding & { slotEid: number; values: Record<string, number> }) | null>[] = Array.from({ length: slotCount }, (_, i) =>
        forgefx
          .rawBlock(mm.effectId + i)
          .then(({ values }) => ({
            slotEid: mm.effectId + i,
            values,
            source: values[srcPid] ?? 0,
            targetEffectId: values[tgtEidPid] ?? 0,
            targetParam: values[tgtParamPid] ?? 0
          }))
          .catch(() => null)
      );
      const slots = (await Promise.all(reads)).filter((s): s is NonNullable<Awaited<(typeof reads)[number]>> => s != null);
      const bound = boundTargetKeys(slots);
      const sourceNames = new Map((mm.sources ?? []).map((source) => [source.ordinal, source.name]));
      const lfoSlots = slots.flatMap((slot) => {
        const source = lfoSourceFromName(sourceNames.get(Math.round(slot.source)));
        return source && slot.source > 0 && slot.targetEffectId > 0 ? [{ slot, source }] : [];
      });
      if (!lfoSlots.length) {
        if (generation === this.#generation) {
          this.#bound = bound;
          this.#visualizations = new Map();
        }
        return;
      }

      const controllers = await forgefx.blockParams(2, { observe: false });
      const graphs = deriveModulationGraphs({ layout: controllers.layout, params: controllers.named, enums: controllers.enums });
      const details = await Promise.all(lfoSlots.map(async ({ slot, source }) => {
        const params = await forgefx.blockParams(slot.slotEid, { observe: false }).catch(() => null);
        const byPid = new Map((params?.named ?? []).map((param) => [param.id, param]));
        const field = (name: string): NamedParam | undefined => {
          const pid = mm.fields[name]?.pid;
          return pid == null ? undefined : byPid.get(pid);
        };
        const rawNorm = (name: string, fallback: number) => {
          const pid = mm.fields[name]?.pid;
          const raw = pid == null ? undefined : slot.values[pid];
          return raw == null ? fallback : Math.max(0, Math.min(1, raw / 65534));
        };
        const norm = (name: string, fallback: number) => field(name)?.norm ?? rawNorm(name, fallback);
        const scaleParam = field('scale');
        const offsetParam = field('offset');
        const timeSeconds = (name: string) => {
          const param = field(name);
          return Number.isFinite(param?.value) ? param!.value! / 1000 : rawNorm(name, 0) * 10;
        };
        const mapping: ModifierMapping = {
          min: norm('min', 0),
          max: norm('max', 1),
          start: norm('start', 0),
          mid: norm('mid', 0.5),
          end: norm('end', 1),
          slope: norm('slope', 0.5),
          scale: Number.isFinite(scaleParam?.value) ? scaleParam!.value! : 1,
          offset: Number.isFinite(offsetParam?.value) ? offsetParam!.value! / 100 : rawNorm('offset', 0.5) * 2 - 1
        };
        const graph = graphs.find((candidate) => candidate.title.replace(/\s/g, '').toLowerCase() === `lfo${source.number}`);
        return graph ? [modifierTargetKey(slot.targetEffectId, slot.targetParam), {
          source,
          graph,
          mapping,
          attackSeconds: timeSeconds('attack'),
          releaseSeconds: timeSeconds('release')
        } as LfoModifierVisualization] as const : null;
      }));
      if (generation === this.#generation) {
        this.#bound = bound;
        this.#visualizations = new Map(details.filter((detail): detail is NonNullable<typeof detail> => detail != null));
      }
    } catch {
      if (generation === this.#generation) {
        this.#bound = new Set();
        this.#visualizations = new Map();
      }
    } finally {
      this.#loading = false;
      if (this.#refreshAgain) {
        this.#refreshAgain = false;
        void this.refresh();
      }
    }
  }
}

export const modifierBindings = new ModifierBindingsStore();
