import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cell, Layout } from '$lib/device/grid';
import type { EnumParam, NamedParam } from '$lib/api/types';
import type { ParamEditingHost } from './paramEditing.svelte';

const setParamReq = vi.fn(async (..._args: unknown[]) => ({}));
const setBypass = vi.fn(async (..._args: unknown[]) => ({}));
const setChannel = vi.fn(async (..._args: unknown[]) => ({}));
type ParamsResult = { named: NamedParam[]; enums: EnumParam[]; type: { value: number; name: string } | null; slug: string | null; layout: null };
const emptyParams = (): ParamsResult => ({ named: [], enums: [], type: null, slug: null, layout: null });
const blockParams = vi.fn(async (..._args: unknown[]): Promise<ParamsResult> => emptyParams());
const monitors = vi.fn(async () => ({}));
vi.mock('$lib/api/forgefx', () => ({
  ForgeError: class ForgeError extends Error {},
  setRequestFailureReporter: vi.fn(),
  forgefx: {
    setParam: (...args: unknown[]) => setParamReq(...args),
    am4SetParamNorm: (...args: unknown[]) => setParamReq(...args),
    am4SetParamValue: (...args: unknown[]) => setParamReq(...args),
    setBypass: (...args: unknown[]) => setBypass(...args),
    setChannel: (...args: unknown[]) => setChannel(...args),
    blockParams: (...args: unknown[]) => blockParams(...args),
    am4BlockParams: (...args: unknown[]) => blockParams(...args),
    monitors: () => monitors(),
    selectCell: vi.fn(async () => ({})),
    meters: vi.fn(async () => []),
    looperControl: vi.fn(async () => ({})),
    setType: vi.fn(async () => ({})),
    applyBlockLibrarySource: vi.fn(async () => ({})),
    cabState: vi.fn(async () => ({}))
  }
}));

const record = vi.fn();
const recordGesture = vi.fn();
const checkpoint = vi.fn();
vi.mock('./history.svelte', () => ({ history: { record, recordGesture, checkpoint } }));
vi.mock('./layouts', () => ({
  loadLayouts: () => ({}),
  loadSwipe: () => ({}),
  saveLayouts: vi.fn(),
  saveSwipe: vi.fn(),
  newTabId: () => 'tab-1',
  resolveTabs: () => []
}));
vi.mock('$lib/graphs/eq', () => ({ geqBandsFromLayout: () => [] }));

const { ParamEditingStore } = await import('./paramEditing.svelte');

const cell = (): Cell => ({ row: 0, col: 1, kind: 'block', effectId: 7, display: 'Amp 1', pack: 'Amp', color: '#fff', fromRows: [], bypassed: false, channel: 'A' });
const emptyLayout = (): Layout => ({ cells: [], shunts: [], rows: 4, cols: 12, name: '', model: '', crcValid: true });
type FakeHost = ParamEditingHost & { layout: Layout; status: 'loading' | 'ready' | 'offline' };
function makeHost(): FakeHost {
  return {
    layout: emptyLayout(),
    status: 'ready',
    legacyAm4: false,
    paramsWithoutPack: false,
    hasCursorSelect: true,
    hasBlockMeters: true,
    slowLink: false,
    loadGrid: vi.fn(async () => {}),
    scheduleBlockStateReload: vi.fn(),
    showToast: vi.fn(),
    clearLooperWave: vi.fn()
  };
}
let host: FakeHost;
const fresh = () => {
  host = makeHost();
  const c = cell();
  host.layout = { ...emptyLayout(), cells: [c] };
  const store = new ParamEditingStore(host);
  store.selKey = '0,1';
  return { store, c };
};

beforeEach(() => {
  vi.clearAllMocks();
  setParamReq.mockResolvedValue({});
  setBypass.mockResolvedValue({});
  setChannel.mockResolvedValue({});
  blockParams.mockResolvedValue(emptyParams());
  monitors.mockResolvedValue({});
});
afterEach(() => vi.useRealTimers());

describe('optimistic block writes', () => {
  it('flips bypass before confirmation and records the confirmed edit', async () => {
    let release!: () => void;
    setBypass.mockReturnValue(new Promise<{}>((resolve) => { release = () => resolve({}); }));
    const { store, c } = fresh();
    const pending = store.toggleBypass();
    expect(c.bypassed).toBe(true);
    expect(record).not.toHaveBeenCalled();
    release();
    await pending;
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'bypass', eid: 7, from: false, to: true }));
  });

  it('restores bypass when the device rejects the edit', async () => {
    setBypass.mockRejectedValue(new Error('rejected'));
    const { store, c } = fresh();
    await store.toggleBypass();
    expect(c.bypassed).toBe(false);
    expect(record).not.toHaveBeenCalled();
  });

  it('updates channel optimistically and schedules a confirmed state reload', async () => {
    let release!: () => void;
    setChannel.mockReturnValue(new Promise<{}>((resolve) => { release = () => resolve({}); }));
    const { store, c } = fresh();
    const pending = store.setChannel('B');
    expect(c.channel).toBe('B');
    release();
    await pending;
    expect(host.scheduleBlockStateReload).toHaveBeenCalledOnce();
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'channel', from: 'A', to: 'B' }));
  });

  it('restores channel when the device rejects the edit', async () => {
    setChannel.mockRejectedValue(new Error('rejected'));
    const { store, c } = fresh();
    await store.setChannel('B');
    expect(c.channel).toBe('A');
    expect(host.scheduleBlockStateReload).not.toHaveBeenCalled();
  });
});

describe('parameter writes', () => {
  it('coalesces continuous writes and sends only the last value', async () => {
    vi.useFakeTimers();
    const { store } = fresh();
    const p = { id: 3, name: 'Gain', norm: 0.2 } as NamedParam;
    store.setParam(p, 0.4);
    store.setParam(p, 0.7);
    expect(p.norm).toBe(0.7);
    expect(setParamReq).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60);
    expect(setParamReq).toHaveBeenCalledTimes(1);
    expect(setParamReq).toHaveBeenCalledWith(7, 3, 0.7, true);
    expect(recordGesture).toHaveBeenLastCalledWith(expect.objectContaining({ from: 0.4, to: 0.7 }));
  });

  it('preserves the existing optimistic value when a continuous write fails', async () => {
    vi.useFakeTimers();
    setParamReq.mockRejectedValue(new Error('rejected'));
    const { store } = fresh();
    const p = { id: 3, name: 'Gain', norm: 0.2 } as NamedParam;
    store.setParam(p, 0.8);
    await vi.advanceTimersByTimeAsync(60);
    expect(p.norm).toBe(0.8);
  });

  it('keeps the existing optimistic enum behavior on rejection', async () => {
    setParamReq.mockRejectedValue(new Error('rejected'));
    const { store } = fresh();
    const e = { id: 4, name: 'Mode', value: 0, options: [{ value: 0, label: 'A' }, { value: 1, label: 'B' }] } as EnumParam;
    store.setEnum(e, 1);
    await Promise.resolve();
    expect(e.value).toBe(1);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'param', from: 0, to: 1 }));
  });
});

describe('selection and refresh', () => {
  it('loads a newly opened block without exposing type and bypass pseudo-params', async () => {
    blockParams.mockResolvedValue({
      named: [{ id: 1, name: 'Type', value: 0 }, { id: 2, name: 'Gain', norm: 0.5, value: 5 }],
      enums: [],
      type: { value: 2, name: 'Deluxe' },
      slug: 'amp',
      layout: null
    });
    const { store, c } = fresh();
    await store.openCell(c);
    expect(store.sheetState).toBe('ready');
    expect(store.params.map((p) => p.name)).toEqual(['Gain']);
    expect(store.blockType?.name).toBe('Deluxe');
  });

  it('marks the surface errored and allows a later retry', async () => {
    const { store } = fresh();
    blockParams.mockRejectedValueOnce(new Error('offline'));
    await store.reloadParams();
    expect(store.sheetState).toBe('error');
    await store.reloadParams();
    expect(store.sheetState).toBe('ready');
    expect(blockParams).toHaveBeenCalledTimes(2);
  });

  it('reassigns params when an SSE echo changes the selected block', () => {
    const { store } = fresh();
    store.params = [{ id: 3, name: 'Gain', norm: 0.2 } as NamedParam];
    const before = store.params;
    store.applyParamEcho(7, 3, 0.9);
    expect(store.params).not.toBe(before);
    expect(store.params[0].norm).toBe(0.9);
  });

  it('keeps externally writable editor height and virtual state reactive', () => {
    const { store } = fresh();
    store.editorH = 420;
    store.virtual = { eid: 1, slug: 'global', name: 'Setup' };
    expect(store.editorH).toBe(420);
    expect(store.selected?.effectId).toBe(1);
    store.virtual = null;
    expect(store.selected?.effectId).toBe(7);
  });
});

describe('EditorStore facade writability', () => {
  it('writes editor height and virtual selection through the compatibility facade', async () => {
    const { editor } = await import('./editor.svelte');
    editor.editorH = 460;
    editor.virtual = { eid: 2, slug: 'controllers', name: 'Controllers' };
    expect(editor.editorH).toBe(460);
    expect(editor.virtual?.eid).toBe(2);
    editor.virtual = null;
  });
});
