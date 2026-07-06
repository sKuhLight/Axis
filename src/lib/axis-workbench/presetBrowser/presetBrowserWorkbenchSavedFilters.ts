// Saved filters for the docked preset browser (§3.3 of docs/workbench-dc-parity/06-preset-browser.md).
//
// PERSISTENCE REUSE: the monolith (src/lib/PresetBrowser.svelte lines 850-871) is the source of truth for
// where saved filters live — localStorage["axs.pb.saved"], mirrored to the unified config store via
// `forgefx.putDoc('config', 'savedFilters', …)` (which the cloud auto-sync then carries). We reuse the SAME
// key + mirror here so the docked browser and the monolith share one list; there is no second store.
//
// The classification/matching bits (active-filter highlight via parsed-query equality) are pure and unit
// tested; localStorage/forgefx I/O is isolated behind small helpers so the pure logic stays testable.
import { forgefx } from '../../forgefx';
import { condsEqual, parseQuery, type AxisPbCond } from './presetBrowserWorkbenchQuery';
import { AXIS_PB_SEED_SAVED_FILTERS } from './presetBrowserWorkbenchQuery';

export interface AxisPbSavedFilter {
  id: string;
  name: string;
  query: string;
}

// Same key the monolith persists to — a shared list, not a duplicate (PresetBrowser.svelte `SAVED_KEY`).
export const AXIS_PB_SAVED_FILTERS_KEY = 'axs.pb.saved';

export function loadSavedFilters(): AxisPbSavedFilter[] {
  try {
    const raw = localStorage.getItem(AXIS_PB_SAVED_FILTERS_KEY);
    if (!raw) return seedSavedFilters();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return seedSavedFilters();
    return parsed.filter(isSavedFilter);
  } catch {
    return seedSavedFilters();
  }
}

// The 6 seed filters (§3.3) for a first-run / empty store — same set the monolith advertises via
// AXIS_PB_SEED_SAVED_FILTERS. Deterministic ids keyed off the seed index so re-seeding is idempotent.
export function seedSavedFilters(): AxisPbSavedFilter[] {
  return AXIS_PB_SEED_SAVED_FILTERS.map((f, i) => ({ id: `seed-${i}`, name: f.name, query: f.query }));
}

// Persist through the same two mirrors the monolith uses so both surfaces agree and cloud sync picks it up.
export function persistSavedFilters(filters: AxisPbSavedFilter[]): void {
  try {
    localStorage.setItem(AXIS_PB_SAVED_FILTERS_KEY, JSON.stringify(filters));
  } catch {
    /* storage unavailable (private mode / SSR) — the cloud mirror still runs */
  }
  // mirror to the unified store (sync-ready), matching PresetBrowser.svelte persistSaved().
  forgefx.putDoc('config', 'savedFilters', filters).catch(() => {});
}

export function addSavedFilter(
  filters: AxisPbSavedFilter[],
  name: string,
  query: string
): AxisPbSavedFilter[] {
  const trimmed = name.trim();
  if (!trimmed) return filters;
  return [...filters, { id: 's' + Date.now(), name: trimmed, query }];
}

export function removeSavedFilter(filters: AxisPbSavedFilter[], id: string): AxisPbSavedFilter[] {
  return filters.filter((f) => f.id !== id);
}

// A saved filter is "active" when its parsed query equals the conditions currently filtering the list
// (§3.3, parsed-query equality — order-insensitive). Used for the row highlight.
export function isSavedFilterActive(filter: AxisPbSavedFilter, activeConditions: AxisPbCond[]): boolean {
  const conds = parseQuery(filter.query);
  // An empty saved query never lights up unless the list is genuinely unfiltered.
  if (!conds.length && !activeConditions.length) return filter.query.trim() === '';
  return condsEqual(conds, activeConditions);
}

// The colored dot for a saved-filter row (§3.3): first block cond's category color, else tag color, else
// faint. Kept pure (string colors) so it is testable.
export function savedFilterDotColor(filter: AxisPbSavedFilter): string {
  const conds = parseQuery(filter.query);
  const block = conds.find((c) => c.kind === 'block');
  if (block) return BLOCK_COLOR[(block as Extract<AxisPbCond, { kind: 'block' }>).block] ?? 'var(--accent)';
  if (conds.some((c) => c.kind === 'tag')) return '#d65b9e';
  if (conds.some((c) => c.kind === 'cpu')) return '#f5a623';
  if (conds.some((c) => c.kind === 'scenes')) return '#4f6bed';
  return 'var(--textfaint, var(--textdim))';
}

// Category dot colors (subset used for saved-filter dots — matches the design's block category palette).
const BLOCK_COLOR: Record<string, string> = {
  amp: '#d6543f',
  drive: '#f5a623',
  cab: '#9b8cf0',
  comp: '#4f6bed',
  chorus: '#35c9d6',
  flange: '#35c9d6',
  phaser: '#35c9d6',
  filter: '#d65b9e',
  enhance: '#9b8cf0',
  delay: '#4a82e0',
  reverb: '#2fb0c9'
};

function isSavedFilter(value: unknown): value is AxisPbSavedFilter {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as AxisPbSavedFilter).id === 'string' &&
    typeof (value as AxisPbSavedFilter).name === 'string' &&
    typeof (value as AxisPbSavedFilter).query === 'string'
  );
}
