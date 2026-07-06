import { describe, expect, it, vi, beforeEach } from 'vitest';

// Isolate the pure saved-filter logic from the network mirror: putDoc is a no-op in tests.
vi.mock('../../forgefx', () => ({ forgefx: { putDoc: vi.fn(() => Promise.resolve()) } }));

import {
  addSavedFilter,
  removeSavedFilter,
  isSavedFilterActive,
  savedFilterDotColor,
  seedSavedFilters,
  loadSavedFilters,
  persistSavedFilters,
  AXIS_PB_SAVED_FILTERS_KEY,
  type AxisPbSavedFilter
} from '../presetBrowser/presetBrowserWorkbenchSavedFilters';
import { AXIS_PB_SEED_SAVED_FILTERS } from '../presetBrowser/presetBrowserWorkbenchQuery';
import { parseQuery } from '../presetBrowser/presetBrowserWorkbenchQuery';

// Minimal in-memory localStorage stub for the node test env.
function stubStorage(): void {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0
  } as Storage;
}

describe('Preset Browser saved filters (§3.3)', () => {
  beforeEach(() => stubStorage());

  it('seeds the 6 design filters for an empty store, with stable ids', () => {
    const seeds = seedSavedFilters();
    expect(seeds).toHaveLength(AXIS_PB_SEED_SAVED_FILTERS.length);
    expect(seeds.map((s) => s.name)).toEqual(AXIS_PB_SEED_SAVED_FILTERS.map((s) => s.name));
    expect(seedSavedFilters().map((s) => s.id)).toEqual(seeds.map((s) => s.id)); // idempotent ids
  });

  it('loads seeds when nothing is persisted, and the persisted list once written', () => {
    expect(loadSavedFilters().map((f) => f.name)).toEqual(AXIS_PB_SEED_SAVED_FILTERS.map((s) => s.name));
    const custom: AxisPbSavedFilter[] = [{ id: 's1', name: 'Mine', query: 'tag:Lead' }];
    persistSavedFilters(custom);
    expect(loadSavedFilters()).toEqual(custom);
    // reuses the SAME key the monolith persists to (shared list, not a second store).
    expect(localStorage.getItem(AXIS_PB_SAVED_FILTERS_KEY)).toBe(JSON.stringify(custom));
  });

  it('adds a named filter (ignoring blank names) and removes by id', () => {
    let list: AxisPbSavedFilter[] = [];
    list = addSavedFilter(list, '  ', 'tag:Lead');
    expect(list).toHaveLength(0); // blank name ignored
    list = addSavedFilter(list, 'High Gain', 'AMP(GAIN>7)');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'High Gain', query: 'AMP(GAIN>7)' });
    const id = list[0].id;
    list = removeSavedFilter(list, id);
    expect(list).toHaveLength(0);
  });

  it('highlights a filter as active when its parsed query equals the current conditions', () => {
    const filter: AxisPbSavedFilter = { id: 's', name: 'Leads', query: 'AMP(GAIN>7)  +  tag:Lead' };
    // Same conditions, different serialization/order → still active (parsed-query equality).
    const active = parseQuery('tag:Lead  +  AMP(GAIN>7)');
    expect(isSavedFilterActive(filter, active)).toBe(true);
    // Different query → not active.
    expect(isSavedFilterActive(filter, parseQuery('tag:Blues'))).toBe(false);
    // Empty query is active only when the list is genuinely unfiltered.
    const empty: AxisPbSavedFilter = { id: 'e', name: 'None', query: '' };
    expect(isSavedFilterActive(empty, [])).toBe(true);
    expect(isSavedFilterActive(empty, parseQuery('tag:Lead'))).toBe(false);
  });

  it('derives a dot color from the first block cond, else tag/cpu/scenes, else faint', () => {
    expect(savedFilterDotColor({ id: '1', name: '', query: 'AMP(TYPE=5153)' })).toBe('#d6543f');
    expect(savedFilterDotColor({ id: '2', name: '', query: 'REVERB(MIX>30)' })).toBe('#2fb0c9');
    expect(savedFilterDotColor({ id: '3', name: '', query: 'tag:Lead' })).toBe('#d65b9e');
    expect(savedFilterDotColor({ id: '4', name: '', query: 'cpu<55' })).toBe('#f5a623');
    expect(savedFilterDotColor({ id: '5', name: '', query: '' })).toMatch(/var\(/);
  });
});
