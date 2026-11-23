// Grid map strip under the Block Editor header (F1): shown or hidden through the ⋯ menu. Independent
// of the strip's own fold (GridMap keeps that, folded by default in the workbench and on phones). Stored
// per browser like the fold. Pure (gridMapPrefs.test.ts); the storage is injected.

export const GRID_MAP_HIDDEN_KEY = 'axs.gridmap.hidden';

export interface FlagStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The strip is shown unless it was hidden; an unreadable store shows it. */
export function readGridMapShown(store: FlagStore | null | undefined): boolean {
  try {
    return store?.getItem(GRID_MAP_HIDDEN_KEY) !== '1';
  } catch {
    return true;
  }
}

/** Remember the choice (shown = the default, so the key goes away). */
export function writeGridMapShown(store: FlagStore | null | undefined, shown: boolean): void {
  try {
    if (shown) store?.removeItem(GRID_MAP_HIDDEN_KEY);
    else store?.setItem(GRID_MAP_HIDDEN_KEY, '1');
  } catch {
    /* storage blocked: the choice lasts for this session only */
  }
}

/** The browser's localStorage, or null where it is missing or blocked (reading the global itself throws
 *  a SecurityError when site data is blocked). `get` is injectable for tests. */
export function browserFlagStore(get: () => FlagStore | null | undefined = () => (typeof localStorage === 'undefined' ? null : localStorage)): FlagStore | null {
  try {
    return get() ?? null;
  } catch {
    return null;
  }
}
