import { describe, expect, it } from 'vitest';
import { AxisPresetBrowserWorkbenchRuntime, type AxisPresetBrowserGridLike } from '../presetBrowser/presetBrowserWorkbenchRuntime';
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
  }
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

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

  it('loads device, file, and local entries through host actions', async () => {
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
      noteBufferReplaced: (label) => { calls.push(`note:${label}`); },
      reloadEditor: async () => { calls.push('reload'); },
      notify: (message) => { calls.push(`notify:${message}`); }
    });

    await runtime.loadEntry('dev:10');
    await runtime.loadEntry('file:pad');
    await runtime.loadEntry('local:Folder/Lead.syx');

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
      'notify:Loaded Lead - Save writes to disk or a slot'
    ]);
    expect(runtime.snapshot.lastLoadedEntryId).toBe('local:Folder/Lead.syx');
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

  it('drains row detail hydration before loading its device preset', async () => {
    const runtime = new AxisPresetBrowserWorkbenchRuntime();
    const gridRead = deferred<AxisPresetBrowserGridLike>();
    const gridStarted = deferred<void>();
    const calls: string[] = [];
    runtime.bindHost({
      findEntry: (entryId) => entries.find((entry) => entry.id === entryId) ?? null,
      hydrateParams: async () => {},
      presetGrid: async () => {
        calls.push('detail:grid');
        gridStarted.resolve();
        return gridRead.promise;
      },
      loadDeviceSlot: async (number) => { calls.push(`device:${number}`); }
    });

    const detail = runtime.loadDetail('dev:10'); // first click
    await gridStarted.promise;
    const load = runtime.loadEntry('dev:10'); // dblclick
    await Promise.resolve();

    expect(calls).toEqual(['detail:grid']);

    gridRead.resolve({ cells: [] });
    await Promise.all([detail, load]);

    expect(calls).toEqual(['detail:grid', 'device:10']);
  });

  it('records a load stamp for every source, but not for a failed load or an audition', async () => {
    const runtime = new AxisPresetBrowserWorkbenchRuntime();
    const recorded: string[] = [];
    runtime.bindHost({
      findEntry: (entryId) => entries.find((entry) => entry.id === entryId) ?? null,
      loadDeviceSlot: async () => {},
      fileBytes: () => new Uint8Array([1]),
      loadBytes: async () => {},
      localPath: (entryId) => entryId.slice('local:'.length),
      localPresetFile: async () => new Uint8Array([2]).buffer,
      deviceEntryBytes: async () => new Uint8Array([3]).buffer,
      recordLoad: (entryId) => recorded.push(entryId)
    });

    await runtime.loadEntry('dev:10');
    await runtime.loadEntry('file:pad');
    await runtime.loadEntry('local:Folder/Lead.syx');
    await runtime.auditionEntry('dev:10'); // auditioning is not loading

    expect(recorded).toEqual(['dev:10', 'file:pad', 'local:Folder/Lead.syx']);
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
