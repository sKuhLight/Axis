import { onMount } from 'svelte';
import { bindAxisRuntimeHost } from '../runtimeBinding';
import {
  axisFcActionLabel,
  axisFcSlotBounds,
  createAxisFcDataView,
  type AxisFcSide,
  type AxisFcSlotLike
} from './fcWorkbenchData';
import { createAxisFcWorkbenchHost } from './fcWorkbenchHost';
import { ensureAxisFcWorkbenchModel } from './fcWorkbenchModel';
import type { AxisFcPart } from './types';
import { axisFcWorkbenchController, type AxisFcControllerSnapshot } from './fcWorkbenchController';
import { axisFcWorkbenchRuntime, type AxisFcRuntimeSnapshot } from './fcWorkbenchRuntime';

export type AxisFcRuntimePart = Exclude<AxisFcPart, 'full' | 'grid'>;

export type AxisFcPartView = ReturnType<typeof createAxisFcPartView>;

// Shared reactive setup + derived reads for every FC part panel (board/inspector/layouts/led/tap/hold).
// One binding to the runtime + controller per mounted part panel — each part panel is its own
// workbench panel instance, so each gets its own runtime host binding (mirrors the pre-split behavior).
export function createAxisFcPartView(part: AxisFcRuntimePart) {
  let snapshot = $state<AxisFcControllerSnapshot>(axisFcWorkbenchController.snapshot);
  let runtimeSnapshot = $state<AxisFcRuntimeSnapshot>(axisFcWorkbenchRuntime.snapshot);
  let lastReadKey = '';

  const data = $derived(
    createAxisFcDataView({
      model: runtimeSnapshot.model,
      layout: snapshot.layout,
      view: snapshot.view,
      switchIndex: snapshot.switchIndex,
      side: snapshot.side,
      edits: runtimeSnapshot.edits,
      labelText: runtimeSnapshot.labelText,
      present: runtimeSnapshot.present
    })
  );
  const cfg = $derived(data.selectedConfig);

  onMount(() =>
    bindAxisRuntimeHost({
      runtime: axisFcWorkbenchRuntime,
      host: createAxisFcWorkbenchHost(),
      onSnapshot: (next) => (runtimeSnapshot = next),
      start: () => void ensureAxisFcWorkbenchModel()
    })
  );

  $effect(() => {
    axisFcWorkbenchController.setPart(part);
  });

  $effect(() => axisFcWorkbenchController.subscribe((next) => (snapshot = next)));

  $effect(() => {
    const key = `${runtimeSnapshot.model?.liveState}:${part}:${snapshot.layout}:${snapshot.view}:${snapshot.switchIndex ?? 'none'}`;
    if (!runtimeSnapshot.model?.liveState || key === lastReadKey) return;
    lastReadKey = key;
    void axisFcWorkbenchRuntime.readSelection(snapshot);
  });

  function fieldNumber(field: string): number {
    return Number(runtimeSnapshot.edits[`${field}:${cfg}`] ?? 0);
  }

  function slotNumber(side: AxisFcSide, slotIndex: number, fallback = 0): number {
    return Number(runtimeSnapshot.edits[`${side}Params#${slotIndex}:${cfg}`] ?? fallback);
  }

  function labelValue(side: AxisFcSide): string {
    return runtimeSnapshot.labelText[`${side}Label:${cfg}`] ?? '';
  }

  const catList = $derived(
    Object.entries(runtimeSnapshot.model?.categories ?? {})
      .map(([value, label]) => ({ value: Number(value), label }))
      .sort((a, b) => a.value - b.value)
  );

  const labelModeList = $derived(
    Object.entries(runtimeSnapshot.model?.labelModes ?? {})
      .map(([value, label]) => ({ value: Number(value), label }))
      .sort((a, b) => a.value - b.value)
  );

  function functionsForSide(side: AxisFcSide) {
    return runtimeSnapshot.model?.functions?.[String(fieldNumber(`${side}Category`))] ?? [];
  }

  function selectedFunctionForSide(side: AxisFcSide) {
    const ord = fieldNumber(`${side}Function`);
    return functionsForSide(side).find((fn) => fn.ord === ord) ?? null;
  }

  function summaryFor(side: AxisFcSide): string {
    return axisFcActionLabel(runtimeSnapshot.model, side, cfg, runtimeSnapshot.edits, 'Empty');
  }

  function autoLabelFor(side: AxisFcSide): string {
    return axisFcActionLabel(runtimeSnapshot.model, side, cfg, runtimeSnapshot.edits);
  }

  function stepSlot(side: AxisFcSide, slot: AxisFcSlotLike, delta: number) {
    const { value } = axisFcSlotBounds(slot, slotNumber(side, slot.i, slot.min ?? 0) + delta);
    void axisFcWorkbenchRuntime.writeSlot(side, slot.i, value, cfg);
  }

  function sceneOptions(slot: AxisFcSlotLike): number[] {
    const lo = slot.min ?? 1;
    const hi = Math.min(slot.max ?? 8, lo + 11);
    return Array.from({ length: Math.max(1, hi - lo + 1) }, (_, i) => lo + i);
  }

  return {
    get data() {
      return data;
    },
    get snapshot() {
      return snapshot;
    },
    get runtimeSnapshot() {
      return runtimeSnapshot;
    },
    get cfg() {
      return cfg;
    },
    get catList() {
      return catList;
    },
    get labelModeList() {
      return labelModeList;
    },
    fieldNumber,
    slotNumber,
    labelValue,
    functionsForSide,
    selectedFunctionForSide,
    summaryFor,
    autoLabelFor,
    stepSlot,
    sceneOptions
  };
}
