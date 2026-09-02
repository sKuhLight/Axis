import { describe, expect, it } from 'vitest';
import {
  AXIS_PB_PRESENCE_VIEWS,
  entryInPresenceView,
  isAxisPbPresenceView,
  presenceViewCount,
  presenceViews,
  type AxisPbPresenceRow
} from '../presetBrowser/presetBrowserWorkbenchPresence';
import {
  createAxisPresetBrowserDataView,
  type AxisPresetBrowserLibEntryLike
} from '../presetBrowser/presetBrowserWorkbenchData';

const row = (source: string): AxisPbPresenceRow => ({ source });

describe('library view classification (§3)', () => {
  it("'all' matches every row regardless of source", () => {
    for (const source of ['device', 'file', 'local', 'converted']) {
      expect(entryInPresenceView(row(source), 'all')).toBe(true);
    }
  });

  it("'device' matches only real device slots", () => {
    expect(entryInPresenceView(row('device'), 'device')).toBe(true);
    expect(entryInPresenceView(row('file'), 'device')).toBe(false);
    expect(entryInPresenceView(row('local'), 'device')).toBe(false);
    expect(entryInPresenceView(row('converted'), 'device')).toBe(false);
  });

  it('counts rows per view', () => {
    const rows = [row('device'), row('device'), row('file'), row('local')];
    expect(presenceViewCount(rows, 'all')).toBe(4);
    expect(presenceViewCount(rows, 'device')).toBe(2);
  });

  it('exposes exactly the two non-cloud views', () => {
    expect(presenceViews().map((v) => v.id)).toEqual(['all', 'device']);
    expect(AXIS_PB_PRESENCE_VIEWS.map((v) => v.id)).toEqual(['all', 'device']);
  });

  it('validates view ids', () => {
    expect(isAxisPbPresenceView('device')).toBe(true);
    expect(isAxisPbPresenceView('all')).toBe(true);
    // Retired cloud views must no longer validate — a persisted snapshot carrying one falls back.
    expect(isAxisPbPresenceView('cloudOnly')).toBe(false);
    expect(isAxisPbPresenceView('needsUpload')).toBe(false);
    expect(isAxisPbPresenceView(null)).toBe(false);
  });
});

describe('Preset Browser data view — library filtering (§3)', () => {
  const entries: AxisPresetBrowserLibEntryLike[] = [
    { id: 'dev:1', source: 'device', summary: { number: 1, name: 'Rig One', scenes: [], blocks: [] } },
    { id: 'dev:2', source: 'device', summary: { number: 2, name: 'Rig Two', scenes: [], blocks: [] } },
    { id: 'file:9', source: 'file', summary: { number: -1, name: 'Imported Rig', scenes: [], blocks: [] } }
  ];

  it('filters the visible list by the active view', () => {
    const device = createAxisPresetBrowserDataView({ entries, sourceId: 'all', presenceView: 'device' });
    expect(device.visibleEntries.map((e) => e.id)).toEqual(['dev:1', 'dev:2']);

    // 'all' keeps every entry; the data view owns the ordering (slot number, so the
    // imported entry at -1 leads), which this test deliberately does not pin.
    const all = createAxisPresetBrowserDataView({ entries, sourceId: 'all', presenceView: 'all' });
    expect(all.visibleEntries.map((e) => e.id).sort()).toEqual(['dev:1', 'dev:2', 'file:9']);
  });

  it('reports live view counts on the data view', () => {
    const view = createAxisPresetBrowserDataView({ entries, sourceId: 'all' });
    const counts = Object.fromEntries(view.presenceViews.map((v) => [v.id, v.count]));
    expect(counts.all).toBe(3);
    expect(counts.device).toBe(2);
  });
});
