import { describe, expect, it } from 'vitest';
import {
  AXIS_PB_PRESENCE_VIEWS,
  entryInPresenceView,
  presenceViewCount,
  presenceViewsForAuth,
  type AxisPbPresenceRow
} from '../presetBrowser/presetBrowserWorkbenchPresence';
import {
  createAxisPresetBrowserDataView,
  type AxisPresetBrowserLibEntryLike
} from '../presetBrowser/presetBrowserWorkbenchData';
import type { SyncState } from '../../types';

const row = (source: string, syncState: SyncState, cloudOnly = false): AxisPbPresenceRow => ({
  source,
  cloudOnly,
  syncState
});

describe('Preset Browser presence views (§3)', () => {
  it('classifies each SyncState into the design views like the monolith inView', () => {
    // On device (real slot, synced with cloud): device + cloud, not the delta views.
    const synced = row('device', 'synced');
    expect(entryInPresenceView(synced, 'device')).toBe(true);
    expect(entryInPresenceView(synced, 'cloud')).toBe(true);
    expect(entryInPresenceView(synced, 'needsUpload')).toBe(false);
    expect(entryInPresenceView(synced, 'needsUpdate')).toBe(false);
    expect(entryInPresenceView(synced, 'cloudOnly')).toBe(false);
    expect(entryInPresenceView(synced, 'notBackedUp')).toBe(false);

    // Local edits → Needs upload + In cloud.
    const modified = row('device', 'modified');
    expect(entryInPresenceView(modified, 'needsUpload')).toBe(true);
    expect(entryInPresenceView(modified, 'cloud')).toBe(true);
    expect(entryInPresenceView(modified, 'needsUpdate')).toBe(false);

    // Cloud newer → Needs update + In cloud.
    const outdated = row('device', 'outdated');
    expect(entryInPresenceView(outdated, 'needsUpdate')).toBe(true);
    expect(entryInPresenceView(outdated, 'cloud')).toBe(true);

    // Not backed up → device + notBackedUp, NOT in cloud.
    const deviceOnly = row('device', 'deviceOnly');
    expect(entryInPresenceView(deviceOnly, 'notBackedUp')).toBe(true);
    expect(entryInPresenceView(deviceOnly, 'cloud')).toBe(false);
    expect(entryInPresenceView(deviceOnly, 'device')).toBe(true);
  });

  it('treats cloud-only synthesized rows as In cloud + Cloud only, never On this device', () => {
    const cloudOnly = row('device', 'cloudOnly', true);
    expect(entryInPresenceView(cloudOnly, 'cloudOnly')).toBe(true);
    expect(entryInPresenceView(cloudOnly, 'cloud')).toBe(true);
    expect(entryInPresenceView(cloudOnly, 'device')).toBe(false); // synthesized rows aren't real slots
  });

  it("'all' matches everything and unknown state stays in cloud but not the deltas", () => {
    const unknown = row('device', 'unknown');
    expect(entryInPresenceView(unknown, 'all')).toBe(true);
    expect(entryInPresenceView(unknown, 'cloud')).toBe(true);
    expect(entryInPresenceView(unknown, 'needsUpload')).toBe(false);
  });

  it('counts views over a set (respecting whatever filtering was applied upstream)', () => {
    const rows = [
      row('device', 'synced'),
      row('device', 'modified'),
      row('device', 'outdated'),
      row('device', 'deviceOnly'),
      row('device', 'cloudOnly', true)
    ];
    expect(presenceViewCount(rows, 'all')).toBe(5);
    expect(presenceViewCount(rows, 'device')).toBe(4); // all but the synthesized cloud-only row
    expect(presenceViewCount(rows, 'cloud')).toBe(4); // synced+modified+outdated+cloudOnly (not deviceOnly)
    expect(presenceViewCount(rows, 'needsUpload')).toBe(1);
    expect(presenceViewCount(rows, 'needsUpdate')).toBe(1);
    expect(presenceViewCount(rows, 'notBackedUp')).toBe(1);
    expect(presenceViewCount(rows, 'cloudOnly')).toBe(1);
  });

  it('hides cloud views when signed out (honest state), shows all when signed in', () => {
    const out = presenceViewsForAuth(false).map((v) => v.id);
    expect(out).toEqual(['all', 'device']);
    const inn = presenceViewsForAuth(true).map((v) => v.id);
    expect(inn).toEqual(AXIS_PB_PRESENCE_VIEWS.map((v) => v.id));
  });
});

describe('Preset Browser data view — presence filtering (§3)', () => {
  const entries: AxisPresetBrowserLibEntryLike[] = [
    { id: 'dev:1', source: 'device', summary: { number: 1, name: 'Synced Rig', scenes: [], blocks: [] } },
    { id: 'dev:2', source: 'device', summary: { number: 2, name: 'Edited Rig', scenes: [], blocks: [] } },
    { id: 'cloud:9', source: 'device', summary: { number: 9, name: 'Cloud Rig', scenes: [], blocks: [] } }
  ];
  const syncStateOf = (e: AxisPresetBrowserLibEntryLike): SyncState => {
    if (e.id === 'dev:1') return 'synced';
    if (e.id === 'dev:2') return 'modified';
    return 'cloudOnly';
  };

  it("filters the visible list by the active presence view exactly like the monolith", () => {
    const upload = createAxisPresetBrowserDataView({
      entries,
      sourceId: 'all',
      syncStateOf,
      presenceView: 'needsUpload'
    });
    expect(upload.visibleEntries.map((e) => e.id)).toEqual(['dev:2']);

    const cloudOnly = createAxisPresetBrowserDataView({
      entries,
      sourceId: 'all',
      syncStateOf,
      presenceView: 'cloudOnly'
    });
    expect(cloudOnly.visibleEntries.map((e) => e.id)).toEqual(['cloud:9']);

    const device = createAxisPresetBrowserDataView({
      entries,
      sourceId: 'all',
      syncStateOf,
      presenceView: 'device'
    });
    expect(device.visibleEntries.map((e) => e.id)).toEqual(['dev:1', 'dev:2']); // cloud-only excluded
  });

  it('reports live presence-view counts on the data view', () => {
    const view = createAxisPresetBrowserDataView({ entries, sourceId: 'all', syncStateOf });
    const counts = Object.fromEntries(view.presenceViews.map((v) => [v.id, v.count]));
    expect(counts.all).toBe(3);
    expect(counts.needsUpload).toBe(1);
    expect(counts.cloudOnly).toBe(1);
    expect(counts.cloud).toBe(3); // synced + modified + cloudOnly
  });

  it("resolves 'none' sync state (signed out) so cloud views are empty", () => {
    const view = createAxisPresetBrowserDataView({ entries, sourceId: 'all', presenceView: 'cloud' });
    // No syncStateOf → every entry is 'none'; only the synthesized cloud:9 row still reads as In cloud.
    expect(view.visibleEntries.map((e) => e.id)).toEqual(['cloud:9']);
    const counts = Object.fromEntries(view.presenceViews.map((v) => [v.id, v.count]));
    expect(counts.needsUpload).toBe(0);
    expect(counts.needsUpdate).toBe(0);
  });
});
