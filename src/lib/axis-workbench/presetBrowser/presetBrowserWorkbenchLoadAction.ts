import type { AxisPresetBrowserEntrySummary } from './presetBrowserWorkbenchData';

// The docked panel's loadEntry() and the slim search overlay's loadEntry() both need this same
// three-way dispatch — pulled out so it lives in exactly one place instead of drifting between the
// two callers. Pure, so it's unit-tested per axis-workbench/CLAUDE.md's testing convention
// (.svelte components are never unit-mounted). Same shape as presetBrowserWorkbenchRowGesture.ts.
export type AxisPresetLoadAction =
  | { kind: 'openConverter' }
  | { kind: 'loadEmptySlot'; number: number }
  | { kind: 'runtimeLoad' };

export function resolvePresetLoadAction(
  entry: Pick<AxisPresetBrowserEntrySummary, 'converted' | 'empty' | 'number'>
): AxisPresetLoadAction {
  // A saved conversion isn't a device slot — its primary action re-opens it in the converter.
  if (entry.converted) return { kind: 'openConverter' };
  // An empty slot has no preset to read — load the slot itself to start a fresh preset.
  if (entry.empty) return { kind: 'loadEmptySlot', number: entry.number ?? 0 };
  return { kind: 'runtimeLoad' };
}
