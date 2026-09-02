import { describe, expect, it, vi } from 'vitest';
import {
  buildAxisPbMenuActions,
  toWorkbenchMenuItems,
  type AxisPbMenuEntry
} from '../presetBrowser/presetBrowserWorkbenchMenu';

function entry(over: Partial<AxisPbMenuEntry> = {}): AxisPbMenuEntry {
  return {
    id: 'dev:1',
    deviceSlot: true,
    fav: false,
    ...over
  };
}

describe('context menu building (§4.4)', () => {
  it('device slot → Load + Audition + Rename + Convert + Favorite + Tags', () => {
    const actions = buildAxisPbMenuActions(entry(), { canRename: true });
    expect(actions.map((a) => a.id)).toEqual(['load', 'audition', 'rename', 'crossConvert', 'favorite', 'tags']);
    expect(actions[0].label).toBe('Load preset');
    expect(actions.find((a) => a.id === 'favorite')?.label).toBe('Add to favorites');
    expect(actions.find((a) => a.id === 'tags')?.label).toBe('Tags…');
  });

  it('omits Rename when the device cannot rename', () => {
    const actions = buildAxisPbMenuActions(entry(), { canRename: false });
    expect(actions.map((a) => a.id)).toEqual(['load', 'audition', 'crossConvert', 'favorite', 'tags']);
  });

  it('non-device rows (files) get Load + Convert + Favorite + Tags (no audition/rename)', () => {
    const actions = buildAxisPbMenuActions(entry({ deviceSlot: false }), { canRename: true });
    expect(actions.map((a) => a.id)).toEqual(['load', 'crossConvert', 'favorite', 'tags']);
  });

  it('flips the favorite label for favourited rows', () => {
    const actions = buildAxisPbMenuActions(entry({ fav: true }), { canRename: false });
    expect(actions.find((a) => a.id === 'favorite')?.label).toBe('Remove from favorites');
  });

  it('saved conversions get a reduced menu: Open in converter + Favorite + Tags + Delete (no device actions)', () => {
    const actions = buildAxisPbMenuActions(
      entry({ id: 'conv:x', deviceSlot: false, converted: true }),
      { canRename: true }
    );
    expect(actions.map((a) => a.id)).toEqual(['openConverter', 'favorite', 'tags', 'deleteConverted']);
    expect(actions.map((a) => a.id)).not.toContain('load'); // not a device slot — no load-to-device
    expect(actions.map((a) => a.id)).not.toContain('crossConvert');
    expect(actions.find((a) => a.id === 'deleteConverted')?.danger).toBe(true);
  });

  it('empty slots collapse to a single Load action (no audition/rename/tags/favorite/convert)', () => {
    const actions = buildAxisPbMenuActions(
      entry({ id: 'dev:2', deviceSlot: true, empty: true }),
      { canRename: true }
    );
    expect(actions.map((a) => a.id)).toEqual(['load']);
    expect(actions[0].label).toBe('Load preset');
  });

  it('adapts to WorkbenchMenuItems whose run dispatches the action id', () => {
    const actions = buildAxisPbMenuActions(entry(), { canRename: true });
    const dispatch = vi.fn();
    const items = toWorkbenchMenuItems(actions, dispatch);
    expect(items.map((i) => i.id)).toEqual(actions.map((a) => a.id));
    items.find((i) => i.id === 'load')?.run();
    expect(dispatch).toHaveBeenCalledWith('load');
  });
});
