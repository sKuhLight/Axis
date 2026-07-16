import { describe, expect, it, vi } from 'vitest';
import {
  buildAxisPbMenuActions,
  toWorkbenchMenuItems,
  type AxisPbMenuEntry
} from '../presetBrowser/presetBrowserWorkbenchMenu';

function entry(over: Partial<AxisPbMenuEntry> = {}): AxisPbMenuEntry {
  return {
    id: 'dev:1',
    cloudOnly: false,
    deviceSlot: true,
    fav: false,
    syncState: 'none',
    ...over
  };
}

describe('context menu building (§4.4)', () => {
  it('device slot signed out → Load + Audition + Rename + Convert + Favorite, no cloud items', () => {
    const actions = buildAxisPbMenuActions(entry(), { canRename: true, cloudOn: false });
    expect(actions.map((a) => a.id)).toEqual(['load', 'audition', 'rename', 'crossConvert', 'favorite']);
    expect(actions[0].label).toBe('Load preset');
    expect(actions.find((a) => a.id === 'favorite')?.label).toBe('Add to favorites');
  });

  it('omits Rename when the device cannot rename', () => {
    const actions = buildAxisPbMenuActions(entry(), { canRename: false, cloudOn: false });
    expect(actions.map((a) => a.id)).toEqual(['load', 'audition', 'crossConvert', 'favorite']);
  });

  it('non-device rows (files) get Load + Convert + Favorite (no audition/rename)', () => {
    const actions = buildAxisPbMenuActions(entry({ deviceSlot: false }), { canRename: true, cloudOn: false });
    expect(actions.map((a) => a.id)).toEqual(['load', 'crossConvert', 'favorite']);
  });

  it('cloud-only rows load "from cloud" and skip audition/rename', () => {
    const actions = buildAxisPbMenuActions(
      entry({ cloudOnly: true, deviceSlot: false, syncState: 'cloudOnly' }),
      { canRename: true, cloudOn: true }
    );
    expect(actions[0].label).toBe('Load from cloud');
    expect(actions.map((a) => a.id)).toContain('cloudDownload');
    expect(actions.map((a) => a.id)).not.toContain('audition');
  });

  it('flips the favorite label for favourited rows', () => {
    const actions = buildAxisPbMenuActions(entry({ fav: true }), { canRename: false, cloudOn: false });
    expect(actions.find((a) => a.id === 'favorite')?.label).toBe('Remove from favorites');
  });

  it('picks the cloud action label + direction by sync state (signed in)', () => {
    const cloudOf = (syncState: string) =>
      buildAxisPbMenuActions(entry({ syncState }), { canRename: false, cloudOn: true }).find(
        (a) => a.id === 'cloudUpload' || a.id === 'cloudDownload'
      );
    expect(cloudOf('modified')).toMatchObject({ id: 'cloudUpload', label: 'Upload changes' });
    expect(cloudOf('outdated')).toMatchObject({ id: 'cloudDownload', label: 'Update from cloud' });
    expect(cloudOf('deviceOnly')).toMatchObject({ id: 'cloudUpload', label: 'Back up to cloud' });
    expect(cloudOf('synced')).toMatchObject({ id: 'cloudUpload', label: 'Re-upload to cloud' });
  });

  it('marks the cloud action with a separator so it sits below the core group', () => {
    const actions = buildAxisPbMenuActions(entry({ syncState: 'modified' }), { canRename: true, cloudOn: true });
    expect(actions.find((a) => a.id === 'cloudUpload')?.separatorBefore).toBe(true);
  });

  it('saved conversions get a reduced menu: Open in converter + Favorite + Delete (no device actions)', () => {
    const actions = buildAxisPbMenuActions(
      entry({ id: 'conv:x', deviceSlot: false, converted: true }),
      { canRename: true, cloudOn: true }
    );
    expect(actions.map((a) => a.id)).toEqual(['openConverter', 'favorite', 'deleteConverted']);
    expect(actions.map((a) => a.id)).not.toContain('load'); // not a device slot — no load-to-device
    expect(actions.map((a) => a.id)).not.toContain('crossConvert');
    expect(actions.find((a) => a.id === 'deleteConverted')?.danger).toBe(true);
  });

  it('adapts to WorkbenchMenuItems whose run dispatches the action id', () => {
    const actions = buildAxisPbMenuActions(entry(), { canRename: true, cloudOn: false });
    const dispatch = vi.fn();
    const items = toWorkbenchMenuItems(actions, dispatch);
    expect(items.map((i) => i.id)).toEqual(actions.map((a) => a.id));
    items.find((i) => i.id === 'load')?.run();
    expect(dispatch).toHaveBeenCalledWith('load');
  });
});
