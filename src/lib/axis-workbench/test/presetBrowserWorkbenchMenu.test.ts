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
  it('device slot → Switch to Preset + Rename + Clear + Convert + Favorite + Tags (no audition)', () => {
    const actions = buildAxisPbMenuActions(entry(), { canRename: true, canClear: true });
    expect(actions.map((a) => a.id)).toEqual(['load', 'rename', 'clear', 'crossConvert', 'favorite', 'tags']);
    expect(actions[0].label).toBe('Switch to Preset');
    expect(actions.find((a) => a.id === 'favorite')?.label).toBe('Add to favorites');
    expect(actions.find((a) => a.id === 'tags')?.label).toBe('Tags…');
  });

  it('Clear is a danger item, set off from the non-destructive actions', () => {
    const actions = buildAxisPbMenuActions(entry(), { canRename: false, canClear: true });
    const clear = actions.find((a) => a.id === 'clear');
    expect(clear?.label).toBe('Clear preset');
    expect(clear?.danger).toBe(true);
    expect(clear?.separatorBefore).toBe(true);
  });

  it('omits Rename and Clear when the device can do neither', () => {
    const actions = buildAxisPbMenuActions(entry(), { canRename: false, canClear: false });
    expect(actions.map((a) => a.id)).toEqual(['load', 'crossConvert', 'favorite', 'tags']);
  });

  it('omits Clear on a name-scan device while keeping Rename', () => {
    const actions = buildAxisPbMenuActions(entry(), { canRename: true, canClear: false });
    expect(actions.map((a) => a.id)).toEqual(['load', 'rename', 'crossConvert', 'favorite', 'tags']);
  });

  it('non-device rows (files) get Audition + Save to device + Convert + Favorite + Tags (no load/rename)', () => {
    const actions = buildAxisPbMenuActions(entry({ deviceSlot: false }), { canRename: true, canClear: true });
    expect(actions.map((a) => a.id)).toEqual(['audition', 'saveToDevice', 'crossConvert', 'favorite', 'tags']);
    expect(actions[0].label).toBe('Audition');
    expect(actions.find((a) => a.id === 'saveToDevice')?.label).toBe('Save to device…');
  });

  it('flips the favorite label for favourited rows', () => {
    const actions = buildAxisPbMenuActions(entry({ fav: true }), { canRename: false, canClear: false });
    expect(actions.find((a) => a.id === 'favorite')?.label).toBe('Remove from favorites');
  });

  it('saved conversions get a reduced menu: Open in converter + Favorite + Tags + Delete (no device actions)', () => {
    const actions = buildAxisPbMenuActions(
      entry({ id: 'conv:x', deviceSlot: false, converted: true }),
      { canRename: true, canClear: true }
    );
    expect(actions.map((a) => a.id)).toEqual(['openConverter', 'favorite', 'tags', 'deleteConverted']);
    expect(actions.map((a) => a.id)).not.toContain('load'); // not a device slot — no load-to-device
    expect(actions.map((a) => a.id)).not.toContain('crossConvert');
    expect(actions.find((a) => a.id === 'deleteConverted')?.danger).toBe(true);
  });

  it('empty slots collapse to a single Switch action (no audition/rename/tags/favorite/convert)', () => {
    const actions = buildAxisPbMenuActions(
      entry({ id: 'dev:2', deviceSlot: true, empty: true }),
      { canRename: true, canClear: true }
    );
    expect(actions.map((a) => a.id)).toEqual(['load']);
    expect(actions[0].label).toBe('Switch to Preset');
  });

  it('adapts to WorkbenchMenuItems whose run dispatches the action id', () => {
    const actions = buildAxisPbMenuActions(entry(), { canRename: true, canClear: true });
    const dispatch = vi.fn();
    const items = toWorkbenchMenuItems(actions, dispatch);
    expect(items.map((i) => i.id)).toEqual(actions.map((a) => a.id));
    items.find((i) => i.id === 'load')?.run();
    expect(dispatch).toHaveBeenCalledWith('load');
  });
});
