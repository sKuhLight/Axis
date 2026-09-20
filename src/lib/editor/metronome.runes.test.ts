import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnumParam, NamedParam } from '$lib/api/types';

interface ParamsResult { named: NamedParam[]; enums: EnumParam[]; type: null; slug: string | null; layout: null }

const setParam = vi.fn(async (..._args: unknown[]) => ({ ok: true }));
const blockParams = vi.fn(async (..._args: unknown[]): Promise<ParamsResult> => ({ named: [], enums: [], type: null, slug: null, layout: null }));
vi.mock('$lib/api/forgefx', () => ({
  forgefx: {
    setParam: (...args: unknown[]) => setParam(...args),
    blockParams: (...args: unknown[]) => blockParams(...args)
  }
}));

const { MetronomeStore, METRONOME_DEVICE } = await import('./metronome.svelte');

const tempoNorm = (bpm: number) => (bpm - METRONOME_DEVICE.tempoMin) / (METRONOME_DEVICE.tempoMax - METRONOME_DEVICE.tempoMin);
const levelNorm = (db: number) => (db - METRONOME_DEVICE.levelMin) / (METRONOME_DEVICE.levelMax - METRONOME_DEVICE.levelMin);

beforeEach(() => {
  vi.clearAllMocks();
  blockParams.mockResolvedValue({ named: [], enums: [], type: null, slug: null, layout: null });
});
afterEach(() => vi.useRealTimers());

describe('metronome store', () => {
  it('seeds the tempo from the preset tap tempo, clamped to the device range', () => {
    const store = new MetronomeStore();
    store.seed(152.4);
    expect(store.bpm).toBe(152);
    store.seed(9999);
    expect(store.bpm).toBe(250);
    store.seed(Number.NaN);
    expect(store.bpm).toBe(250); // unchanged by a non-finite seed
  });

  it('writes the tempo to the Controllers Tempo knob (eid 2, continuous)', () => {
    const store = new MetronomeStore();
    store.setBpm(120);
    expect(store.bpm).toBe(120);
    expect(setParam).toHaveBeenCalledWith(METRONOME_DEVICE.tempoEid, METRONOME_DEVICE.tempoPid, expect.closeTo(tempoNorm(120), 6), true);
  });

  it('writes the level to GLOBAL_METLEVEL1 (eid 1, continuous)', () => {
    const store = new MetronomeStore();
    store.setLevel(-18);
    expect(store.level).toBe(-18);
    expect(store.levelText).toBe('−18.0 dB');
    expect(setParam).toHaveBeenCalledWith(METRONOME_DEVICE.levelEid, METRONOME_DEVICE.levelPid, expect.closeTo(levelNorm(-18), 6), true);
  });

  it('turning on writes the GLOBAL_METRONOME switch and clocks the beat dots', () => {
    vi.useFakeTimers();
    const store = new MetronomeStore();
    store.start();
    expect(store.running).toBe(true);
    expect(store.beat).toBe(0);
    expect(setParam).toHaveBeenCalledWith(METRONOME_DEVICE.switchEid, METRONOME_DEVICE.switchPid, 1, false);
    vi.advanceTimersByTime(500); // one beat at 120 BPM
    expect(store.beat).toBe(1);
    vi.advanceTimersByTime(1500); // through beats 2, 3 and back to the downbeat
    expect(store.beat).toBe(0);
  });

  it('turning off writes the switch off and stops the clock', () => {
    vi.useFakeTimers();
    const store = new MetronomeStore();
    store.start();
    store.stop();
    expect(store.running).toBe(false);
    expect(store.beat).toBe(-1);
    expect(setParam).toHaveBeenLastCalledWith(METRONOME_DEVICE.switchEid, METRONOME_DEVICE.switchPid, 0, false);
    vi.advanceTimersByTime(1200);
    expect(store.beat).toBe(-1);
  });

  it('mirrors the device switch and level on sync (the Controllers Tempo/Pitch state)', async () => {
    vi.useFakeTimers();
    blockParams.mockResolvedValueOnce({
      named: [{ id: 119, name: 'Output 1', paramName: 'GLOBAL_METLEVEL1', value: -6, norm: 0.5 }],
      enums: [{ id: 14878, name: 'Metronome', paramName: 'GLOBAL_METRONOME', value: 1, options: [] }],
      type: null,
      slug: 'global',
      layout: null
    });
    const store = new MetronomeStore();
    await store.syncFromDevice();
    expect(blockParams).toHaveBeenCalledWith(METRONOME_DEVICE.switchEid, { observe: false });
    expect(store.running).toBe(true);
    expect(store.beat).toBe(0);
    expect(store.level).toBe(-6);

    blockParams.mockResolvedValueOnce({
      named: [],
      enums: [{ id: 14878, name: 'Metronome', paramName: 'GLOBAL_METRONOME', value: 0, options: [] }],
      type: null,
      slug: 'global',
      layout: null
    });
    await store.syncFromDevice();
    expect(store.running).toBe(false);
    expect(store.beat).toBe(-1);
  });

  it('toggle flips state', () => {
    vi.useFakeTimers();
    const store = new MetronomeStore();
    store.toggle();
    expect(store.running).toBe(true);
    store.toggle();
    expect(store.running).toBe(false);
  });
});
