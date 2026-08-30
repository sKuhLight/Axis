import { describe, expect, it } from 'vitest';
import {
  createAxisPresetBrowserDataView,
  buildEmptyDeviceSlotEntries,
  normalizeAxisPresetBrowserSourceId,
  type AxisPresetBrowserLibEntryLike
} from '../presetBrowser/presetBrowserWorkbenchData';

const entries: AxisPresetBrowserLibEntryLike[] = [
  {
    id: 'dev:1',
    source: 'device',
    fav: true,
    summary: {
      number: 1,
      name: 'Studio Clean',
      model: 'Deluxe Verb',
      scenes: ['Intro', 'Lead'],
      blocks: [{ effectId: 101, slug: 'amp', name: 'Amp 1' }]
    }
  },
  {
    id: 'file:ambient',
    source: 'file',
    folder: 'Imported',
    summary: {
      number: 411,
      name: 'Ambient Wash',
      scenes: ['Main'],
      blocks: [
        { effectId: 201, slug: 'plex', name: 'Plex Delay' },
        { effectId: 202, slug: 'reverb', name: 'Reverb' }
      ],
      amps: ['USA Clean']
    }
  },
  {
    id: 'local:edge',
    source: 'local',
    summary: {
      name: 'Edge Of Breakup',
      scenes: [],
      blocks: []
    }
  }
];

describe('Preset Browser Workbench data view', () => {
  it('normalizes legacy source ids', () => {
    expect(normalizeAxisPresetBrowserSourceId('files')).toBe('file');
    expect(normalizeAxisPresetBrowserSourceId(null)).toBe('all');
  });

  it('builds source counts and filters visible entries by active source', () => {
    const view = createAxisPresetBrowserDataView({
      entries,
      sourceId: 'file',
      tagsOf: (id) => (id === 'file:ambient' ? ['wide', 'delay'] : [])
    });

    expect(view.sources.map((source) => [source.id, source.count])).toEqual([
      ['all', 3],
      ['device', 1],
      ['local', 1],
      ['file', 1],
      ['cloud', 0],
      ['converted', 0]
    ]);
    expect(view.visibleEntries.map((entry) => entry.id)).toEqual(['file:ambient']);
    expect(view.visibleEntries[0]).toMatchObject({
      sourceLabel: 'Files',
      model: 'USA Clean',
      sceneCount: 1,
      blockCount: 2,
      tags: ['wide', 'delay']
    });
  });

  it('feeds all three columns of the composed full panel in one pass (sources | list | detail)', () => {
    // §"full": the docked panel renders sources + list + detail from a single data view. Guard that a
    // single call yields non-empty content for every column so the full body is never blank.
    const view = createAxisPresetBrowserDataView({
      entries,
      sourceId: 'all',
      selectedEntryId: 'dev:1'
    });

    expect(view.sources.find((source) => source.id === 'all')?.count).toBe(3); // sources column
    expect(view.visibleEntries.length).toBe(3); // list column
    expect(view.order).toEqual(view.visibleEntries.map((entry) => entry.id)); // shift-click order (§4.4)
    expect(view.selectedEntry?.id).toBe('dev:1'); // detail column
  });

  it('narrows the list column by conditions while keeping the selection resolvable', () => {
    const view = createAxisPresetBrowserDataView({
      entries,
      sourceId: 'all',
      selectedEntryId: 'file:ambient',
      conditions: [{ kind: 'block', block: 'reverb', params: [] }]
    });

    // only the reverb-carrying preset remains visible, but the detail column can still resolve any entry.
    expect(view.visibleEntries.map((entry) => entry.id)).toEqual(['file:ambient']);
    expect(view.selectedEntry?.id).toBe('file:ambient');
  });

  it('surfaces a Converted source with provenance, and shows the source label when the slot is unset', () => {
    const converted: AxisPresetBrowserLibEntryLike[] = [
      ...entries,
      {
        id: 'conv:fm3-lead-1',
        source: 'converted',
        provenance: 'FM3 → AM4',
        summary: { number: -1, name: 'Lead Port', model: 'AM4', scenes: [], blocks: [{ effectId: 0, slug: 'amp', name: 'Brit 800' }] }
      }
    ];
    const view = createAxisPresetBrowserDataView({ entries: converted, sourceId: 'converted' });
    expect(view.sources.find((s) => s.id === 'converted')).toMatchObject({ label: 'Converted', count: 1 });
    expect(view.visibleEntries.map((e) => e.id)).toEqual(['conv:fm3-lead-1']);
    expect(view.visibleEntries[0]).toMatchObject({ converted: true, provenance: 'FM3 → AM4', number: null });
  });

  it('uses filtered entries for list content while resolving detail from all entries', () => {
    const view = createAxisPresetBrowserDataView({
      entries,
      filteredEntries: entries.slice(0, 1),
      sourceId: 'all',
      selectedEntryId: 'local:edge'
    });

    expect(view.visibleEntries.map((entry) => entry.id)).toEqual(['dev:1']);
    expect(view.selectedEntry).toMatchObject({
      id: 'local:edge',
      name: 'Edge Of Breakup',
      number: null
    });
  });

  it('carries decoded amp/block model names through to AMP(TYPE=...) query matching (regression: the mirror used to drop them)', () => {
    const fm3: AxisPresetBrowserLibEntryLike = {
      id: 'dev:fm3-1',
      source: 'device',
      summary: {
        number: 2,
        name: '5153 Lead',
        model: 'FM3',
        scenes: [],
        blocks: [{ effectId: 101, slug: 'amp', name: 'Amp 1', instance: 1 }],
        models: { amp: ['5153 100W Blue'] },
        amps: ['5153 100W Blue']
      }
    };
    const view = (conditions: Parameters<typeof createAxisPresetBrowserDataView>[0]['conditions']) =>
      createAxisPresetBrowserDataView({ entries: [fm3], conditions }).visibleEntries.map((e) => e.id);

    expect(view([{ kind: 'block', block: 'amp', params: [{ name: 'TYPE', op: '=', val: '5153' }] }])).toEqual([
      'dev:fm3-1'
    ]);
    expect(view([{ kind: 'block', block: 'amp', params: [{ name: 'TYPE', op: '=', val: 'marshall' }] }])).toEqual([]);
    expect(view([{ kind: 'block', block: 'amp', params: [{ name: 'TYPE', op: '!=', val: 'marshall' }] }])).toEqual([
      'dev:fm3-1'
    ]);
    expect(view([{ kind: 'block', block: 'amp', params: [{ name: 'TYPE', op: '!=', val: '5153' }] }])).toEqual([]);
  });

  it('sorts by recency, sinking never-loaded entries below every loaded one', () => {
    const stamps: Record<string, number> = { 'dev:1': 100, 'file:ambient': 200 };
    const view = createAxisPresetBrowserDataView({
      entries,
      sort: 'recent',
      lastLoadedAt: (id) => stamps[id] ?? null
    });

    // Most recent first; 'local:edge' was never loaded so it lands last.
    expect(view.visibleEntries.map((entry) => entry.id)).toEqual(['file:ambient', 'dev:1', 'local:edge']);
    expect(view.visibleEntries.map((entry) => entry.lastLoadedAt)).toEqual([200, 100, null]);
  });

  it('breaks recency ties by preset number so the never-loaded bucket stays stable', () => {
    const slot = (n: number): AxisPresetBrowserLibEntryLike => ({
      id: `dev:${n}`,
      source: 'device',
      summary: { number: n, name: `Slot ${n}`, scenes: [], blocks: [] }
    });
    const view = createAxisPresetBrowserDataView({
      entries: [slot(9), slot(2), slot(5)],
      sort: 'recent',
      // Same stamp for two of them — the tiebreak, not sort stability, decides.
      lastLoadedAt: (id) => (id === 'dev:9' || id === 'dev:5' ? 500 : null)
    });

    expect(view.visibleEntries.map((entry) => entry.id)).toEqual(['dev:5', 'dev:9', 'dev:2']);
  });

  it('leaves entries unloaded when no recency source is injected', () => {
    const view = createAxisPresetBrowserDataView({ entries, sort: 'recent' });

    expect(view.visibleEntries.every((entry) => entry.lastLoadedAt === null)).toBe(true);
    // All null → pure number order, with the slot-less local entry last.
    expect(view.visibleEntries.map((entry) => entry.id)).toEqual(['dev:1', 'file:ambient', 'local:edge']);
  });

  it('sorts by name ascending and descending', () => {
    const asc = createAxisPresetBrowserDataView({ entries, sort: 'name', sortDir: 'asc' });
    expect(asc.visibleEntries.map((e) => e.name)).toEqual(['Ambient Wash', 'Edge Of Breakup', 'Studio Clean']);

    const desc = createAxisPresetBrowserDataView({ entries, sort: 'name', sortDir: 'desc' });
    expect(desc.visibleEntries.map((e) => e.name)).toEqual(['Studio Clean', 'Edge Of Breakup', 'Ambient Wash']);
  });

  it('sorts by slot number ascending and descending', () => {
    const asc = createAxisPresetBrowserDataView({ entries, sort: 'num', sortDir: 'asc' });
    expect(asc.visibleEntries.map((e) => e.id)).toEqual(['dev:1', 'file:ambient', 'local:edge']);

    // slot-less (local) entries sink last in both directions
    const desc = createAxisPresetBrowserDataView({ entries, sort: 'num', sortDir: 'desc' });
    expect(desc.visibleEntries.map((e) => e.id)).toEqual(['file:ambient', 'dev:1', 'local:edge']);
  });

  it('sorts by CPU ascending (low first) and descending (high first)', () => {
    const asc = createAxisPresetBrowserDataView({ entries, sort: 'cpu', sortDir: 'asc' });
    expect(asc.visibleEntries.map((e) => e.blockCount)).toEqual([0, 1, 2]);

    const desc = createAxisPresetBrowserDataView({ entries, sort: 'cpu', sortDir: 'desc' });
    expect(desc.visibleEntries.map((e) => e.blockCount)).toEqual([2, 1, 0]);
  });

  it('recent desc keeps the number-ascending tiebreak while recent asc flips only the primary key', () => {
    const slot = (n: number): AxisPresetBrowserLibEntryLike => ({
      id: `dev:${n}`,
      source: 'device',
      summary: { number: n, name: `Slot ${n}`, scenes: [], blocks: [] }
    });
    const lastLoadedAt = (id: string) => (id === 'dev:9' || id === 'dev:5' ? 500 : null);

    const desc = createAxisPresetBrowserDataView({
      entries: [slot(9), slot(2), slot(5)],
      sort: 'recent',
      sortDir: 'desc',
      lastLoadedAt
    });
    // equal stamps break by number ascending; never-loaded sinks last
    expect(desc.visibleEntries.map((e) => e.id)).toEqual(['dev:5', 'dev:9', 'dev:2']);

    const asc = createAxisPresetBrowserDataView({
      entries: [slot(9), slot(2), slot(5)],
      sort: 'recent',
      sortDir: 'asc',
      lastLoadedAt
    });
    // oldest first: never-loaded sinks below loaded ones, still number-ascending among equals
    expect(asc.visibleEntries.map((e) => e.id)).toEqual(['dev:2', 'dev:5', 'dev:9']);
  });

  it('does not throw on cloud-only entries with empty models/amps maps', () => {
    const cloudOnly: AxisPresetBrowserLibEntryLike = {
      id: 'cloud:9',
      source: 'device',
      summary: { number: 9, name: 'Cloud Only', model: 'FM3', scenes: [], blocks: [], models: {}, amps: [] }
    };
    expect(() =>
      createAxisPresetBrowserDataView({
        entries: [cloudOnly],
        conditions: [{ kind: 'block', block: 'amp', params: [{ name: 'TYPE', op: '=', val: '5153' }] }]
      })
    ).not.toThrow();
  });

  it('builds <EMPTY> slot entries for every cleared slot', () => {
    const empty = new Set([0, 2, 5]);
    const slots = buildEmptyDeviceSlotEntries(6, (n) => empty.has(n));
    expect(slots.map((s) => s.id)).toEqual(['dev:0', 'dev:2', 'dev:5']);
    expect(slots[0]).toMatchObject({
      id: 'dev:0',
      source: 'device',
      empty: true,
      summary: { number: 0, name: '<EMPTY>', scenes: [], blocks: [], amps: [], models: {}, crc: null }
    });
  });

  it('injects empty slots only into the device view (not "all", never into data.entries)', () => {
    const emptySlots = buildEmptyDeviceSlotEntries(3, (n) => n === 0 || n === 2);

    const device = createAxisPresetBrowserDataView({ entries, emptySlots, sourceId: 'device' });
    // num-ascending: the cleared slots sort in by slot number among the real device entry.
    expect(device.visibleEntries.map((e) => e.id)).toEqual(['dev:0', 'dev:1', 'dev:2']);
    // data.entries + source counts stay real-preset only.
    expect(device.entries.map((e) => e.id)).toEqual(['dev:1', 'file:ambient', 'local:edge']);
    expect(device.sources.find((s) => s.id === 'device')?.count).toBe(1);

    const all = createAxisPresetBrowserDataView({ entries, emptySlots, sourceId: 'all' });
    expect(all.visibleEntries.map((e) => e.id)).toEqual(['dev:1', 'file:ambient', 'local:edge']);
  });

  it('resolves an empty slot as the selected entry', () => {
    const emptySlots = buildEmptyDeviceSlotEntries(3, (n) => n === 2);
    const view = createAxisPresetBrowserDataView({
      entries,
      emptySlots,
      sourceId: 'device',
      selectedEntryId: 'dev:2'
    });
    expect(view.selectedEntry).toMatchObject({ id: 'dev:2', empty: true, number: 2, name: '<EMPTY>' });
  });

  it('forces empty slots to syncState "none" + cloudOnly false regardless of resolver', () => {
    const emptySlots = buildEmptyDeviceSlotEntries(1, (n) => n === 0);
    const view = createAxisPresetBrowserDataView({
      entries: [],
      emptySlots,
      sourceId: 'device',
      syncStateOf: () => 'synced'
    });
    const empty = view.visibleEntries.find((e) => e.empty);
    expect(empty).toMatchObject({ syncState: 'none', cloudOnly: false });
  });
});
