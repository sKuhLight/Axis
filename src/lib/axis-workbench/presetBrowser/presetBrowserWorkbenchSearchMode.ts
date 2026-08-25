// Sticky simple/advanced search mode for the docked preset browser's query bar. The typed query
// language is opt-in: a first-time user meets the plain search box, and only a deliberate click on
// the mode toggle switches them over — from then on the choice survives reloads. Local-only (no
// cloud mirror — a per-device UI preference, matching the lighter MRU idiom used by frequent tags
// and the CabPicker/PresetPicker/CommandPalette `recents`, not the heavier saved-filters dual-write).
export const AXIS_PB_SEARCH_MODE_KEY = 'axs.pb.searchMode';

// Stored as the self-describing strings 'simple' | 'advanced' rather than a JSON boolean: readable
// in DevTools, and no corrupt or legacy value can coerce its way into the non-default branch.
export function loadAdvancedMode(): boolean {
  try {
    return localStorage.getItem(AXIS_PB_SEARCH_MODE_KEY) === 'advanced';
  } catch {
    return false; // storage unavailable (private mode / SSR)
  }
}

export function persistAdvancedMode(advanced: boolean): void {
  try {
    localStorage.setItem(AXIS_PB_SEARCH_MODE_KEY, advanced ? 'advanced' : 'simple');
  } catch {
    /* storage unavailable (private mode / SSR) */
  }
}
