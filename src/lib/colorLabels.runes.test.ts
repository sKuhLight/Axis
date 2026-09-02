// One-time-ever auto-check for the FM3-Edit preset-color import store (replicated-purring-bachman):
// refresh() discovers + parses and offers a prompt, but only ever attempts this ONCE across all
// launches — gated by a persisted flag set immediately after the first attempt, regardless of outcome.
// Mirrors library.runes.test.ts's mock-and-dynamic-import setup.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ColorLabelGroup, ColorLabelSources, ColorLabelImportResult } from './types';

const colorLabelSources = vi.fn<() => Promise<ColorLabelSources | null>>();
const importColorLabels = vi.fn<(source: { path: string }) => Promise<ColorLabelImportResult>>();
const applyColorLabelGroups = vi.fn<
  (groups: ColorLabelGroup[], opts?: { skipIds?: Record<string, string[]> }) => { tagged: number; unmatched: string[]; matchedIds: Record<string, string[]> }
>();
const showToast = vi.fn();

vi.mock('./forgefx', () => ({
  forgefx: { colorLabelSources: () => colorLabelSources(), importColorLabels: (s: { path: string }) => importColorLabels(s) }
}));
vi.mock('./library.svelte', () => ({ library: { applyColorLabelGroups: (g: ColorLabelGroup[], o?: unknown) => applyColorLabelGroups(g, o as never) } }));
vi.mock('./editor.svelte', () => ({ editor: { showToast: (t: string, a?: string) => showToast(t, a) } }));

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear()
  } as Storage;
}

const CANDIDATE = { path: '/fake/color-assignments_iii.dat', editor: 'FM3-Edit', size: 100, mtime: '2026-01-01T00:00:00.000Z' };
const GROUPS: ColorLabelGroup[] = [{ hex: '#febcbc', names: ['Lead Tone', 'Crunch'] }];

let storage: Storage;
beforeEach(() => {
  vi.resetModules();
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
  colorLabelSources.mockReset();
  importColorLabels.mockReset();
  applyColorLabelGroups.mockReset();
  showToast.mockReset();
  applyColorLabelGroups.mockReturnValue({ tagged: 2, unmatched: [], matchedIds: { Red: ['dev:1', 'dev:2'] } });
});

describe('colorLabels one-time-ever auto-check', () => {
  it('no candidates → no offer, nothing applied, one-shot NOT consumed', async () => {
    colorLabelSources.mockResolvedValue({ candidates: [] });
    const { colorLabels } = await import('./colorLabels.svelte');
    await colorLabels.refresh();
    expect(colorLabels.offer).toBeNull();
    expect(applyColorLabelGroups).not.toHaveBeenCalled();
    expect(storage.getItem('axs.colorLabels.autoChecked')).not.toBe('1');
  });

  it('first-ever discovery surfaces an offer instead of applying immediately, and consumes the one-shot', async () => {
    colorLabelSources.mockResolvedValue({ candidates: [CANDIDATE] });
    importColorLabels.mockResolvedValue({ groups: GROUPS });
    const { colorLabels } = await import('./colorLabels.svelte');
    await colorLabels.refresh();
    expect(colorLabels.offer).toEqual({ presetCount: 2 }); // sum of names across groups
    expect(applyColorLabelGroups).not.toHaveBeenCalled();
    expect(storage.getItem('axs.colorLabels.autoChecked')).toBe('1');
  });

  it('accept() applies now', async () => {
    colorLabelSources.mockResolvedValue({ candidates: [CANDIDATE] });
    importColorLabels.mockResolvedValue({ groups: GROUPS });
    const { colorLabels } = await import('./colorLabels.svelte');
    await colorLabels.refresh();
    colorLabels.accept();

    expect(colorLabels.offer).toBeNull();
    expect(applyColorLabelGroups).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('2 preset colors'), undefined);
  });

  it('dismiss() clears the offer without applying', async () => {
    colorLabelSources.mockResolvedValue({ candidates: [CANDIDATE] });
    importColorLabels.mockResolvedValue({ groups: GROUPS });
    const { colorLabels } = await import('./colorLabels.svelte');
    await colorLabels.refresh();
    colorLabels.dismiss();

    expect(colorLabels.offer).toBeNull();
    expect(applyColorLabelGroups).not.toHaveBeenCalled();
  });

  it('a prior launch that already consumed the one-shot never checks again, even if candidates now exist', async () => {
    storage.setItem('axs.colorLabels.autoChecked', '1');
    colorLabelSources.mockResolvedValue({ candidates: [CANDIDATE] });
    importColorLabels.mockResolvedValue({ groups: GROUPS });
    const { colorLabels } = await import('./colorLabels.svelte');
    await colorLabels.refresh();

    expect(colorLabels.offer).toBeNull();
    expect(colorLabelSources).not.toHaveBeenCalled();
    expect(applyColorLabelGroups).not.toHaveBeenCalled();
  });

  it('offered provenance is recorded on accept()', async () => {
    colorLabelSources.mockResolvedValue({ candidates: [CANDIDATE] });
    importColorLabels.mockResolvedValue({ groups: GROUPS });
    const { colorLabels } = await import('./colorLabels.svelte');
    await colorLabels.refresh();
    colorLabels.accept();

    expect(JSON.parse(storage.getItem('axs.colorLabels.offered')!)).toEqual({ Red: ['dev:1', 'dev:2'] });
  });
});
