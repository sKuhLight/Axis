import { describe, expect, it } from 'vitest';
import { AxisPresetBrowserWorkbenchRuntime } from '../presetBrowser/presetBrowserWorkbenchRuntime';
import type { AxisPresetBrowserLibEntryLike } from '../presetBrowser/presetBrowserWorkbenchData';

const entries: AxisPresetBrowserLibEntryLike[] = [
  {
    id: 'dev:10',
    source: 'device',
    summary: {
      number: 10,
      name: 'Crunch',
      model: 'FM3',
      scenes: ['A'],
      blocks: [{ effectId: 1, slug: 'amp', name: 'Amp 1' }]
    }
  },
  {
    id: 'file:pad',
    source: 'file',
    summary: {
      number: 0,
      name: 'Pad',
      scenes: [],
      blocks: []
    }
  },
  {
    id: 'local:Folder/Lead.syx',
    source: 'local',
    summary: {
      number: 0,
      name: 'Lead',
      scenes: [],
      blocks: []
    }
  },
  {
    id: 'cloud:42',
    source: 'device',
    summary: {
      number: 42,
      name: 'Cloud Lead',
      scenes: [],
      blocks: []
    }
  }
];

describe('Preset Browser Workbench runtime', () => {
  it('restores the previous host when multiple Preset Browser panes bind and unbind', async () => {
    const runtime = new AxisPresetBrowserWorkbenchRuntime();
    const calls: string[] = [];
    const unbindA = runtime.bindHost({
      findEntry: (entryId) => entries.find((entry) => entry.id === entryId) ?? null,
      loadDeviceSlot: async (number) => { calls.push(`a:${number}`); }
    });
    const unbindB = runtime.bindHost({
      findEntry: (entryId) => entries.find((entry) => entry.id === entryId) ?? null,
      loadDeviceSlot: async (number) => { calls.push(`b:${number}`); }
    });

    await runtime.loadEntry('dev:10');
    unbindB();
    await runtime.loadEntry('dev:10');
    unbindA();
    await expect(runtime.loadEntry('dev:10')).resolves.toBe(false);

    expect(calls).toEqual(['b:10', 'a:10']);
    expect(runtime.snapshot.error).toContain('No Preset Browser runtime host');
  });

  it('loads device, file, local, and cloud entries through host actions', async () => {
    const runtime = new AxisPresetBrowserWorkbenchRuntime();
    const calls: string[] = [];
    runtime.bindHost({
      findEntry: (entryId) => entries.find((entry) => entry.id === entryId) ?? null,
      openBuild: () => calls.push('openBuild'),
      loadDeviceSlot: async (number) => { calls.push(`device:${number}`); },
      fileBytes: () => new Uint8Array([1, 2, 3]),
      loadBytes: async (bytes) => { calls.push(`bytes:${bytes.byteLength}`); },
      localPath: (entryId) => entryId.slice('local:'.length),
      localPresetFile: async (path) => {
        calls.push(`localFile:${path}`);
        return new Uint8Array([4, 5]).buffer;
      },
      setBufferSource: (source) => { calls.push(`buffer:${source?.path ?? 'none'}`); },
      latestCloudVersionId: () => 'version.cloud',
      loadCloudVersion: async (versionId) => { calls.push(`cloud:${versionId}`); },
      noteBufferReplaced: (label) => { calls.push(`note:${label}`); },
      reloadEditor: async () => { calls.push('reload'); },
      notify: (message) => { calls.push(`notify:${message}`); }
    });

    await runtime.loadEntry('dev:10');
    await runtime.loadEntry('file:pad');
    await runtime.loadEntry('local:Folder/Lead.syx');
    await runtime.loadEntry('cloud:42');

    expect(calls).toEqual([
      'openBuild',
      'device:10',
      'openBuild',
      'bytes:3',
      'note:Loaded Pad',
      'reload',
      'notify:Loaded Pad',
      'openBuild',
      'localFile:Folder/Lead.syx',
      'bytes:2',
      'note:Loaded Lead from local folder',
      'buffer:Folder/Lead.syx',
      'reload',
      'notify:Loaded Lead - Save writes to disk or a slot',
      'openBuild',
      'cloud:version.cloud',
      'note:Loaded Cloud Lead from cloud',
      'reload',
      'notify:Loaded Cloud Lead from cloud'
    ]);
    expect(runtime.snapshot.lastLoadedEntryId).toBe('cloud:42');
  });

  it('auditions device entries through raw bytes and records status', async () => {
    const runtime = new AxisPresetBrowserWorkbenchRuntime();
    const calls: string[] = [];
    runtime.bindHost({
      findEntry: (entryId) => entries.find((entry) => entry.id === entryId) ?? null,
      openBuild: () => calls.push('openBuild'),
      deviceEntryBytes: async (number) => {
        calls.push(`dump:${number}`);
        return new Uint8Array([1, 2, 3, 4]).buffer;
      },
      loadBytes: async (bytes) => { calls.push(`load:${bytes.byteLength}`); },
      noteBufferReplaced: (label) => { calls.push(label); },
      reloadEditor: async () => { calls.push('reload'); }
    });

    await runtime.auditionEntry('dev:10');

    expect(calls).toEqual(['openBuild', 'dump:10', 'load:4', 'Auditioned Crunch', 'reload']);
    expect(runtime.snapshot.lastAuditionedEntryId).toBe('dev:10');
  });

  it('hydrates detail state with params, grid, and versions', async () => {
    const runtime = new AxisPresetBrowserWorkbenchRuntime();
    runtime.bindHost({
      findEntry: (entryId) => entries.find((entry) => entry.id === entryId) ?? null,
      hydrateParams: async () => {},
      paramsOf: () => [{ effectId: 1, slug: 'amp', name: 'Amp 1' }],
      presetGrid: async () => ({ cells: [1, 2, 3] }),
      versions: async () => [{ id: 'v1' }, { id: 'v2' }]
    });

    const detail = await runtime.loadDetail('dev:10');

    expect(detail).toMatchObject({
      entryId: 'dev:10',
      paramsLoaded: true,
      gridLoaded: true,
      versionsLoaded: true,
      blockCount: 1
    });
    expect(runtime.snapshot.details['dev:10']?.versions.map((version) => version.id)).toEqual(['v1', 'v2']);
  });

  it('reports missing entries without calling host load actions', async () => {
    const runtime = new AxisPresetBrowserWorkbenchRuntime();
    const calls: string[] = [];
    runtime.bindHost({
      findEntry: () => null,
      openBuild: () => calls.push('openBuild')
    });

    await expect(runtime.loadEntry('missing')).resolves.toBe(false);

    expect(calls).toEqual([]);
    expect(runtime.snapshot.error).toContain('missing');
  });
});
