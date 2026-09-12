import type { LibEntry } from '$lib/preset/library.svelte';
import {
  preparePresetBrowserIndex,
  type AxisPbDecodedBlock,
  type AxisPresetBrowserIndex,
  type AxisPresetBrowserLibEntryLike
} from './presetBrowserWorkbenchData';
import type { AxisPbRealNameLookup } from './presetBrowserWorkbenchQuery';

type ParamsOf = (entry: LibEntry) => AxisPbDecodedBlock[] | null;

export function createPresetBrowserIndex(
  entries: () => AxisPresetBrowserLibEntryLike[],
  tagsOf: (entryId: string) => string[],
  realNameFor: AxisPbRealNameLookup,
  lastLoadedAt: (entryId: string) => number | null,
  paramsOf: ParamsOf
) {
  let current = $state.raw<AxisPresetBrowserIndex>({ match: new Map(), deviceSlots: new Set() });

  $effect(() => {
    current = preparePresetBrowserIndex(
      entries(),
      tagsOf,
      realNameFor,
      lastLoadedAt,
      (entry) => paramsOf(entry as LibEntry)
    );
  });

  return {
    get current() {
      return current;
    }
  };
}
