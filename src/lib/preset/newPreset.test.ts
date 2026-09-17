// "Start from zero": the blank-preset action loads the codec's clean scaffold through the same
// /preset/load path as every other file load, then reloads the editor and toasts.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const blankPresetSyx = vi.fn<() => Promise<ArrayBuffer>>();
const loadBytes = vi.fn<(bytes: ArrayBuffer) => Promise<{ ok: boolean }>>();
const showToast = vi.fn();
const noteBufferReplaced = vi.fn();
const load = vi.fn<() => Promise<void>>();

vi.mock('$lib/api/forgefx', () => ({
  forgefx: {
    blankPresetSyx: () => blankPresetSyx(),
    loadBytes: (b: ArrayBuffer) => loadBytes(b)
  }
}));
vi.mock('$lib/editor/editorClients.svelte', () => ({
  editorNotifications: { showToast: (t: string, a?: string) => showToast(t, a) },
  gridEditing: { load: () => load() },
  presetBuffer: { noteBufferReplaced: (l: string) => noteBufferReplaced(l) }
}));

beforeEach(() => {
  blankPresetSyx.mockReset();
  loadBytes.mockReset();
  showToast.mockReset();
  noteBufferReplaced.mockReset();
  load.mockReset();
});

describe('startBlankPreset', () => {
  it('loads the scaffold bytes, replaces the buffer, reloads the editor, and toasts success', async () => {
    const buf = new Uint8Array([0xf0, 0x00, 0x01]).buffer;
    blankPresetSyx.mockResolvedValue(buf);
    loadBytes.mockResolvedValue({ ok: true });
    load.mockResolvedValue();
    const { startBlankPreset } = await import('./newPreset');

    const ok = await startBlankPreset();

    expect(ok).toBe(true);
    expect(loadBytes).toHaveBeenCalledWith(buf);
    expect(noteBufferReplaced).toHaveBeenCalledWith(expect.stringContaining('blank'));
    expect(load).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('blank preset'), '#f5a623');
  });

  it('reports failure (and toasts) when the scaffold or load fails', async () => {
    blankPresetSyx.mockRejectedValue(new Error('unsupported'));
    const { startBlankPreset } = await import('./newPreset');

    const ok = await startBlankPreset();

    expect(ok).toBe(false);
    expect(loadBytes).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('unsupported', '#d6543f');
  });
});
