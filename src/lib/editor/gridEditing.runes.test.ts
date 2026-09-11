import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cell, Layout } from '$lib/device/grid';
import type { GridEditingHost } from './gridEditing.svelte';

const grid = vi.fn(async () => ({ scenes: ['One', 'Two'] }));
const am4Grid = vi.fn(async () => ({ scenes: [] }));
const presetBlocks = vi.fn(async () => []);
const sceneNames = vi.fn(async () => ({ names: ['Clean', 'Lead'] }));
const placeCell = vi.fn(async () => ({}));
const clearCell = vi.fn(async () => ({}));
const cable = vi.fn(async () => ({}));
vi.mock('$lib/api/forgefx', () => ({ forgefx: { grid, am4Grid, presetBlocks, sceneNames, placeCell, clearCell, cable } }));

const decoded = (): Layout => ({ cells: [], shunts: [], rows: 4, cols: 12, name: 'Preset', model: 'FM3', crcValid: true });
vi.mock('$lib/device/grid', () => ({ layoutFromGrid: () => decoded() }));
vi.mock('$lib/device/gridRouting', () => ({
  planConnect: () => ({ ok: false, error: 'blocked', ops: [], label: '' }),
  planReplaceShunt: () => ({ ok: false, error: 'blocked', ops: [], label: '' })
}));
const record = vi.fn();
const recordComposite = vi.fn();
vi.mock('./history.svelte', () => ({ history: { record, recordComposite } }));
vi.mock('./gridHover.svelte', () => ({ gridHover: { cell: null } }));

const { GridEditingStore } = await import('./gridEditing.svelte');

type FakeHost = GridEditingHost & { selected: Cell | null; virtualActive: boolean; legacyAm4: boolean };
function makeHost(): FakeHost {
  return {
    legacyAm4: false,
    capabilityShuntBase: undefined,
    selected: null,
    virtualActive: false,
    closeEditor: vi.fn(),
    setSelectionKey: vi.fn(),
    setSceneNames: vi.fn(),
    onGridLoaded: vi.fn(),
    startLiveMeters: vi.fn(),
    showToast: vi.fn(),
    offerLoadFailure: vi.fn()
  };
}
let host: FakeHost;
const fresh = () => { host = makeHost(); return new GridEditingStore(host); };
const block = (): Cell => ({ row: 0, col: 1, kind: 'block', effectId: 7, display: 'Amp 1', pack: 'Amp', color: '#fff', fromRows: [] });

beforeEach(() => {
  vi.clearAllMocks();
  grid.mockResolvedValue({ scenes: ['One', 'Two'] });
  sceneNames.mockResolvedValue({ names: ['Clean', 'Lead'] });
  placeCell.mockResolvedValue({});
  clearCell.mockResolvedValue({});
});

describe('grid loading', () => {
  it('publishes decoded state and preserves the post-load side effects', async () => {
    const store = fresh();
    await store.load();
    expect(store.status).toBe('ready');
    expect(store.everLoaded).toBe(true);
    expect(host.setSceneNames).toHaveBeenCalledWith(['One', 'Two']);
    expect(host.onGridLoaded).toHaveBeenCalledOnce();
    expect(host.startLiveMeters).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(host.setSceneNames).toHaveBeenCalledWith(['Clean', 'Lead']);
  });

  it('disarms a link whose source disappeared during reload', async () => {
    const store = fresh();
    store.linkFrom = block();
    await store.load();
    expect(store.linkFrom).toBe(null);
  });

  it('marks an initial failure offline without offering a report', async () => {
    grid.mockRejectedValue(new Error('offline'));
    const store = fresh();
    await store.load();
    expect(store.status).toBe('offline');
    expect(host.offerLoadFailure).not.toHaveBeenCalled();
  });

  it('offers a report when a reload fails after the first success', async () => {
    const store = fresh();
    await store.load();
    grid.mockRejectedValue(new Error('lost'));
    await store.load();
    expect(host.offerLoadFailure).toHaveBeenCalledWith('/preset/grid', 'lost');
  });
});

describe('optimistic structural edits', () => {
  it('places immediately, records only after confirmation, then reconciles', async () => {
    let release!: () => void;
    placeCell.mockReturnValue(new Promise<{}>((resolve) => { release = () => resolve({}); }));
    const store = fresh();
    const pending = store.place(1, 2, 100, 'Delay 1');
    expect(store.layout.cells[0]).toMatchObject({ row: 1, col: 2, effectId: 100, display: 'Delay 1' });
    expect(record).not.toHaveBeenCalled();
    release();
    await pending;
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'place', row: 1, col: 2 }));
    expect(grid).toHaveBeenCalled();
  });

  it('removes immediately and reconciles after a rejection', async () => {
    clearCell.mockRejectedValue(new Error('rejected'));
    const store = fresh();
    store.layout = { ...decoded(), cells: [block()] };
    await store.removeAt(0, 1);
    expect(store.layout.cells).toEqual([]);
    expect(record).not.toHaveBeenCalled();
    expect(grid).toHaveBeenCalled();
  });
});

describe('link and responsive state', () => {
  it('keeps an invalid same-or-earlier-column link armed', async () => {
    const store = fresh();
    store.armLink(block());
    await store.completeLink(1, 1);
    expect(store.linkFrom?.effectId).toBe(7);
    expect(host.showToast).toHaveBeenCalledWith('Connect to a later column', '#d6543f');
  });

  it('cancels when the armed cell is tapped again', () => {
    const store = fresh();
    const c = block();
    store.armLink(c);
    store.armLink(c);
    expect(store.linkFrom).toBe(null);
  });

  it('clamps grid density and paging exactly as before', () => {
    const store = fresh();
    store.setCols(3);
    expect(store.mobCols).toBe(3);
    expect(store.mobColsAuto).toBe(false);
    store.setPage(99);
    expect(store.gridPage).toBe(store.pageCount - 1);
  });
});
