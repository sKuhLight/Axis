import { describe, expect, it, vi } from 'vitest';
import { AxisPresetBrowserWorkbenchController } from '../presetBrowser/presetBrowserWorkbenchController';
import { AxisPresetBrowserWorkbenchRuntime } from '../presetBrowser/presetBrowserWorkbenchRuntime';
import {
  AxisPresetBrowserViewModel,
  type AxisPresetBrowserViewModelHost
} from '../presetBrowser/presetBrowserWorkbenchViewModel';
import type {
  AxisPresetBrowserEntrySummary,
  AxisPresetBrowserLibEntryLike
} from '../presetBrowser/presetBrowserWorkbenchData';

const entries: AxisPresetBrowserLibEntryLike[] = Array.from({ length: 18 }, (_, index) => ({
  id: `dev:${index}`,
  source: 'device',
  summary: {
    number: index,
    name: index === 0 ? 'Clean Start' : index === 1 ? 'Lead End' : `Preset ${index}`,
    scenes: [],
    blocks: index === 1 ? [{ slug: 'amp', name: 'Amp' }] : []
  }
}));

function setup(overrides: Partial<AxisPresetBrowserViewModelHost> = {}) {
  const controller = new AxisPresetBrowserWorkbenchController();
  const runtime = new AxisPresetBrowserWorkbenchRuntime();
  const persistSavedFilters = vi.fn();
  const selectPreset = vi.fn();
  const renameStoredPreset = vi.fn();
  const openConverted = vi.fn();
  const host: AxisPresetBrowserViewModelHost = {
    get entries() { return entries; },
    get filteredEntries() { return entries; },
    get cacheBuilt() { return true; },
    get connectionState() { return 'online'; },
    get presetCount() { return 20; },
    get canRenamePresets() { return true; },
    tagsOf: (id) => id === 'dev:1' ? ['Lead'] : [],
    lastLoadedAt: (id) => id === 'dev:1' ? 200 : id === 'dev:0' ? 100 : null,
    realNameFor: () => '',
    selectPreset,
    renameStoredPreset,
    persistSavedFilters,
    openConverted,
    ...overrides
  };
  const model = new AxisPresetBrowserViewModel({
    controller,
    runtime,
    host,
    presenceViews: [{ id: 'all', label: 'All presets', glyph: '◉', color: 'var(--accent)' }]
  });
  return { controller, runtime, model, persistSavedFilters, selectPreset, renameStoredPreset, openConverted };
}

function summary(overrides: Partial<AxisPresetBrowserEntrySummary> = {}): AxisPresetBrowserEntrySummary {
  return {
    id: 'dev:1',
    sourceId: 'device',
    sourceLabel: 'Device',
    number: 1,
    name: 'Lead End',
    model: '',
    sceneCount: 0,
    blockCount: 1,
    fav: false,
    folder: null,
    tags: ['Lead'],
    lastLoadedAt: 200,
    blocks: [],
    models: {},
    amps: [],
    converted: false,
    provenance: null,
    ...overrides
  };
}

describe('Preset Browser view model orchestration', () => {
  it('coordinates selection, toggled marks, and display-order ranges', () => {
    const { controller, model } = setup();
    model.select(summary());
    model.toggleMark(summary({ id: 'dev:0' }));
    model.markRange(summary({ id: 'dev:2' }), ['dev:0', 'dev:1', 'dev:2']);

    expect(controller.snapshot.entryId).toBe('dev:1');
    expect(controller.snapshot.marked).toEqual({ 'dev:0': true, 'dev:1': true, 'dev:2': true });
  });

  it('composes free text, structured filters, tags, and natural sort directions', () => {
    const { controller, model } = setup();
    model.setQuery('lead `tag:Lead`');
    expect(model.data().visibleEntries.map((entry) => entry.id)).toEqual(['dev:1']);

    model.toggleSort('recent');
    expect(controller.snapshot).toMatchObject({ sort: 'recent', sortDir: 'desc' });
    model.toggleSort('recent');
    expect(controller.snapshot.sortDir).toBe('asc');
  });

  it('gates synthesized empty slots on an online connection', () => {
    const online = setup();
    expect(online.model.data().visibleEntries.slice(-2).map((entry) => entry.id)).toEqual(['dev:18', 'dev:19']);

    const offline = setup({ connectionState: 'offline' });
    expect(offline.model.data().visibleEntries.some((entry) => entry.empty)).toBe(false);
  });

  it('caps the first render at 14 rows and reveals all rows on request', () => {
    const { controller, model } = setup();
    expect(model.rowCap()).toMatchObject({ capped: true, totalRows: 20, hiddenCount: 6 });
    expect(model.rowCap().rows).toHaveLength(14);

    controller.setShowAllRows(true);
    expect(model.rowCap()).toMatchObject({ capped: false, totalRows: 20, hiddenCount: 0 });
    expect(model.rowCap().rows).toHaveLength(20);
  });

  it('routes rename/load actions and persists saved-filter changes through the host', () => {
    const { controller, runtime, model, persistSavedFilters, selectPreset, renameStoredPreset } = setup();
    expect(model.rename(summary(), '  New Lead  ')).toBe(true);
    expect(renameStoredPreset).toHaveBeenCalledWith(1, 'New Lead');
    expect(model.rename(summary({ empty: true }), 'Nope')).toBe(false);

    model.load(summary({ id: 'dev:19', number: 19, name: '<EMPTY>', empty: true }));
    expect(selectPreset).toHaveBeenCalledWith(19, { recency: false });
    expect(controller.snapshot.entryId).toBe('dev:19');

    const loadEntry = vi.spyOn(runtime, 'loadEntry').mockResolvedValue(true);
    model.load(summary());
    expect(loadEntry).toHaveBeenCalledWith('dev:1');

    controller.setQuery('clean `tag:Lead`');
    const saved = model.saveFilter([], '  Leads  ');
    expect(saved[0]).toMatchObject({ name: 'Leads', query: 'tag:Lead' });
    expect(persistSavedFilters).toHaveBeenLastCalledWith(saved);
    expect(model.deleteSavedFilter(saved, saved[0].id)).toEqual([]);
    expect(persistSavedFilters).toHaveBeenLastCalledWith([]);
  });
});
