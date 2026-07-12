import { describe, expect, it } from 'vitest';
import {
  createAxisPresetBrowserDataView,
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
      ['cloud', 0]
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
});
