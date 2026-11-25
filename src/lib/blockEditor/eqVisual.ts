import type { EQBand } from '../EQGraph.svelte';
import type { BlockVisual, NamedParam, EnumParam } from '../types';
import { shapeFromLabel } from '../eq';

/** Resolve only the server-provided parameter bindings, never fixed device IDs. */
export function visualEqBands(visual: BlockVisual, knob: (id: number) => NamedParam | undefined, enm: (id: number) => EnumParam | undefined): Array<EQBand & { label?: string }> {
  return (visual.bands ?? []).flatMap((b) => {
    const gain = b.gain == null ? undefined : knob(b.gain);
    const freq = b.freq == null ? undefined : knob(b.freq);
    const q = b.q == null ? undefined : knob(b.q);
    const type = b.type == null ? undefined : enm(b.type);
    const label = type?.options.find((o) => o.value === type.value)?.label;
    const shape = b.shape ?? (label && /high/i.test(label) ? shapeFromLabel(label, false) : shapeFromLabel(label, true));
    if ((b.gain != null && !gain) || (b.freq != null && !freq)) return [];
    if (!freq && b.centerHz == null && (visual.mode !== 'graphic' || !gain)) return [];
    return [{ key: b.key, gain, freq, q, centerHz: b.centerHz, shape, label: b.label }];
  });
}
