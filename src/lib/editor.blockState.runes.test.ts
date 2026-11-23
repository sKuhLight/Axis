// The editor store's block state (Scene Ignore + Bypass Mode of the open block, AXIS-81) and the shared enum
// write it goes through:
//   - the tag is scoped to the block (effect id) it was read for: another selected block never shows it,
//     not even while its own read is still pending;
//   - its values are the block's live enums (one source of truth with the board);
//   - nothing is written while the state belongs to another channel (a channel switch whose re-read is
//     pending), nor for a param the server did not tag;
//   - a write the device does not take (the request fails / a grid device refuses it) puts the value back,
//     drops the undo step and says so once — for the board's selects too (the same `setEnum`).
// Must stay a `.runes.test.ts`: the store's `$state` has to be real (client-compiled) for the assertions.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlockParams } from './types';

const blockParams = vi.fn(async (_eid: number): Promise<BlockParams> => ({ block: '', page: 0, named: [], enums: [], type: null }));
const setParam = vi.fn(async (_eid: number, _pid: number, _value: number, _continuous: boolean) => ({ ok: true }));
const setChannel = vi.fn(async (_eid: number, _ch: string) => ({ ok: true }));
vi.mock('./forgefx', () => ({
  forgefx: { blockParams, setParam, setChannel },
  ForgeError: class ForgeError extends Error {},
  setRequestFailureReporter: () => {},
  isRemote: () => false,
  isDirect: () => false,
  CLIENT_ID: 'test'
}));
const record = vi.fn((_op: unknown): string | null => 'step-1');
const discard = vi.fn((_id: string) => {});
vi.mock('./history.svelte', () => ({
  history: { record, discard, recordGesture: vi.fn(), checkpoint: vi.fn(), bindHost: vi.fn(), switchTo: vi.fn(async () => {}), applying: false }
}));
vi.mock('./library.svelte', () => ({ library: {} }));
vi.mock('./cloud.svelte', () => ({ cloud: {} }));
vi.mock('./deviceDefs.svelte', () => ({ deviceDefs: {} }));
vi.mock('./diagnostics.svelte', () => ({ diagnostics: {} }));
vi.mock('./surfaceStore.svelte', () => ({ surfApplyRemote: vi.fn() }));

const { editor } = await import('./editor.svelte');
import type { Cell } from './grid';

const AMP = 100;
const DRIVE = 101;
const cell = (effectId: number, col: number, channel?: string): Cell => ({ row: 0, col, kind: 'block', effectId, display: `Block ${effectId}`, pack: 'Amp', color: '', fromRows: [], channel });

const ampParams = (si = 0, bm = 0): BlockParams => ({
  block: 'Amp',
  page: 1,
  named: [],
  enums: [
    { id: 12, name: 'Bypass Mode', value: bm, options: [{ value: 0, label: 'THRU' }, { value: 1, label: 'MUTE FX OUT' }, { value: 2, label: 'MUTE OUT' }] },
    { id: 32, name: 'Scene Ignore', value: si, options: [{ value: 0, label: 'OFF' }, { value: 1, label: 'ON' }] },
    { id: 10, name: 'Bright', value: 0, options: [{ value: 0, label: 'OFF' }, { value: 1, label: 'ON' }] }
  ],
  type: null,
  blockState: {
    sceneIgnore: { paramId: 32, value: si, supported: true },
    bypassMode: {
      paramId: 12,
      value: bm,
      options: [
        { value: 0, label: 'THRU', muting: false },
        { value: 1, label: 'MUTE FX OUT', muting: false },
        { value: 2, label: 'MUTE OUT', muting: true }
      ]
    }
  }
});

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  vi.clearAllMocks();
  editor.apiVersion = 2;
  editor.caps = { slotModel: 'grid', hasScenes: true, sceneCount: 8, hasChannels: true, channelNames: ['A', 'B', 'C', 'D'], channelBlocks: [], supportsSave: true, blockState: true };
  editor.layout = { cells: [cell(AMP, 0, 'A'), cell(DRIVE, 1)], shunts: [], rows: 4, cols: 6, name: 'T', model: 'FM3', crcValid: true };
  blockParams.mockImplementation(async (eid) => (eid === AMP ? ampParams(1, 2) : { block: 'Drive', page: 2, named: [], enums: [], type: null }));
  await editor.openCell(editor.layout.cells[0]!);
});

describe('block state scoping', () => {
  it('reads the open block\'s tag with live values; labels the board\'s Bypass Mode like the header', () => {
    expect(editor.sheetState).toBe('ready');
    expect(editor.blockState?.sceneIgnore).toMatchObject({ paramId: 32, value: 1 });
    expect(editor.blockState?.bypassMode).toMatchObject({ paramId: 12, value: 2 });
    expect(editor.blockStateStale).toBe(false);
    expect(editor.enums.find((e) => e.id === 12)!.options.map((o) => o.label)).toEqual(['Thru', 'Mute FX Out', 'Mute Out']);
    expect(editor.enums.find((e) => e.id === 10)!.options.map((o) => o.label)).toEqual(['OFF', 'ON']); // untouched
    // the board edits the enum: the block state follows
    editor.enums.find((e) => e.id === 32)!.value = 0;
    expect(editor.blockState?.sceneIgnore?.value).toBe(0);
  });

  it('another block never shows it, also while its own read is pending', async () => {
    let release: (v: BlockParams) => void = () => {};
    blockParams.mockImplementation((eid) => (eid === DRIVE ? new Promise<BlockParams>((r) => (release = r)) : Promise.resolve(ampParams())));
    const opening = editor.openCell(editor.layout.cells[1]!);
    expect(editor.selected?.effectId).toBe(DRIVE);
    expect(editor.blockState).toBeNull(); // the amp's tag is still held, but not for this block
    editor.setBlockStateParam(32, 0);
    expect(setParam).not.toHaveBeenCalled();
    release({ block: 'Drive', page: 2, named: [], enums: [], type: null });
    await opening;
    expect(editor.blockState).toBeNull(); // served none
  });

  it('a channel switch whose re-read is pending: stale, nothing written', async () => {
    editor.layout.cells[0]!.channel = 'B'; // what setChannel does optimistically before the re-read lands
    expect(editor.blockStateStale).toBe(true);
    expect(editor.blockState?.sceneIgnore?.value).toBe(1); // still on show (the header keeps it, disabled)
    editor.setBlockStateParam(32, 0);
    await flush();
    expect(setParam).not.toHaveBeenCalled();
    // the re-read lands on channel B: writable again
    await editor.openCell(editor.layout.cells[0]!);
    expect(editor.blockStateStale).toBe(false);
    editor.setBlockStateParam(32, 0);
    expect(setParam).toHaveBeenCalledWith(AMP, 32, 0, false);
  });

  it('only the tagged params are written, through the enum write', async () => {
    editor.setBlockStateParam(10, 1); // the board's Bright: not a block-state param
    editor.setBlockStateParam(99, 1); // nothing at all
    expect(setParam).not.toHaveBeenCalled();
    editor.setBlockStateParam(12, 1);
    expect(setParam).toHaveBeenCalledWith(AMP, 12, 1, false);
    expect(editor.blockState?.bypassMode?.value).toBe(1);
    expect(record).toHaveBeenCalledTimes(1);
    await flush();
    expect(discard).not.toHaveBeenCalled();
  });
});

describe('setEnum: a write the device did not take', () => {
  it('a failed request puts the value back, drops the undo step and says so once', async () => {
    setParam.mockRejectedValueOnce(new Error('500'));
    const bm = editor.enums.find((e) => e.id === 12)!;
    editor.setEnum(bm, 0);
    expect(bm.value).toBe(0); // optimistic
    await flush();
    expect(bm.value).toBe(2);
    expect(discard).toHaveBeenCalledWith('step-1');
    expect(editor.toast?.text).toBe('Bypass Mode: the device did not take the change');
    expect(editor.blockState?.bypassMode?.value).toBe(2); // the header follows
  });

  it('a grid device refusing it (ok:false) is the same; a later change is not overwritten', async () => {
    setParam.mockResolvedValueOnce({ ok: false });
    const si = editor.enums.find((e) => e.id === 32)!;
    editor.setEnum(si, 0);
    await flush();
    expect(si.value).toBe(1);
    expect(discard).toHaveBeenCalledTimes(1);
    // the value moved on before the refusal arrived: kept, the step still dropped
    let reject: (e: Error) => void = () => {};
    setParam.mockImplementationOnce(() => new Promise((_, r) => (reject = r)));
    editor.setEnum(si, 0);
    si.value = 1; // e.g. a re-read landed meanwhile
    reject(new Error('timeout'));
    await flush();
    expect(si.value).toBe(1);
    expect(discard).toHaveBeenCalledTimes(2);
  });

  it('ok:false on a linear-chain device (AM4: no acknowledgement yet) is left alone; a success changes nothing', async () => {
    editor.caps = { ...editor.caps!, slotModel: 'linear' };
    setParam.mockResolvedValueOnce({ ok: false });
    const si = editor.enums.find((e) => e.id === 32)!;
    editor.setEnum(si, 0);
    await flush();
    expect(si.value).toBe(0);
    expect(discard).not.toHaveBeenCalled();
    editor.setEnum(si, 1);
    await flush();
    expect(si.value).toBe(1);
    expect(discard).not.toHaveBeenCalled();
  });
});
