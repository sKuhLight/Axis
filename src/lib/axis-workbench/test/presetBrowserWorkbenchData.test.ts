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
