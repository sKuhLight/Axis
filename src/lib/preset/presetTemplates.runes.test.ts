// Preset-templates store: directory resolution (configured → detected-unit default), the template
// list load lifecycle, and loading a template into the edit buffer. Mirrors library.runes.test.ts's
// mock-and-dynamic-import setup.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TemplateCandidate } from '$lib/api/types';

const templateSources = vi.fn<(path: string) => Promise<{ candidates: TemplateCandidate[] }>>();
const templateFile = vi.fn<(path: string, dir: string) => Promise<ArrayBuffer>>();
const loadBytes = vi.fn<(bytes: ArrayBuffer) => Promise<{ ok: boolean }>>();
const decodePresetFile = vi.fn();
const showToast = vi.fn();
const noteBufferReplaced = vi.fn();
const load = vi.fn<() => Promise<void>>();
const detected = { connected: true, name: 'FM3' };
const cfg = { blockLibraryPath: '', presetTemplatesPath: '' };

vi.mock('$lib/api/forgefx', () => ({
  forgefx: {
    templateSources: (p: string) => templateSources(p),
    templateFile: (p: string, d: string) => templateFile(p, d),
    loadBytes: (b: ArrayBuffer) => loadBytes(b),
    decodePresetFile: (b: ArrayBuffer) => decodePresetFile(b)
  }
}));
vi.mock('$lib/editor/editorClients.svelte', () => ({
  deviceSession: { get detected() { return detected; } },
  editorNotifications: { showToast: (t: string, a?: string) => showToast(t, a) },
  gridEditing: { load: () => load() },
  presetBuffer: { noteBufferReplaced: (l: string) => noteBufferReplaced(l) }
}));
vi.mock('$lib/platform/appSettings.svelte', () => ({ appSettings: { cfg } }));

const CANDIDATE: TemplateCandidate = { path: '/t/MATEUS.syx', name: 'MATEUS', size: 24680, mtime: '2026-01-01T00:00:00.000Z' };

beforeEach(() => {
  vi.resetModules();
  templateSources.mockReset();
  templateFile.mockReset();
  loadBytes.mockReset();
  decodePresetFile.mockReset();
  showToast.mockReset();
  noteBufferReplaced.mockReset();
  load.mockReset();
  detected.connected = true;
  detected.name = 'FM3';
  cfg.presetTemplatesPath = '';
});

describe('presetTemplates directory resolution', () => {
  it('uses the configured path when set', async () => {
    cfg.presetTemplatesPath = '/custom/templates';
    const { presetTemplates } = await import('./presetTemplates.svelte');
    expect(presetTemplates.effectivePath).toBe('/custom/templates');
  });

  it('falls back to the detected unit editor default when unconfigured', async () => {
    const { presetTemplates } = await import('./presetTemplates.svelte');
    expect(presetTemplates.effectivePath).toBe('~/Documents/Fractal Audio/FM3-Edit/presets/templates');
  });

  it('has no path when unconfigured and nothing is detected', async () => {
    detected.connected = false;
    const { presetTemplates } = await import('./presetTemplates.svelte');
    expect(presetTemplates.effectivePath).toBe('');
  });
});

describe('presetTemplates.load', () => {
  it('lists the candidates and reports ready', async () => {
    templateSources.mockResolvedValue({ candidates: [CANDIDATE] });
    const { presetTemplates } = await import('./presetTemplates.svelte');
    await presetTemplates.load('/t');
    expect(templateSources).toHaveBeenCalledWith('/t');
    expect(presetTemplates.candidates).toEqual([CANDIDATE]);
    expect(presetTemplates.status).toBe('ready');
    expect(presetTemplates.available).toBe(true);
  });

  it('an empty path clears the list', async () => {
    templateSources.mockResolvedValue({ candidates: [CANDIDATE] });
    const { presetTemplates } = await import('./presetTemplates.svelte');
    await presetTemplates.load('/t');
    await presetTemplates.load('  ');
    expect(presetTemplates.candidates).toEqual([]);
    expect(presetTemplates.status).toBe('idle');
  });

  it('a failure (missing route / unreadable dir) reports error and unavailable', async () => {
    templateSources.mockRejectedValue(new Error('404'));
    const { presetTemplates } = await import('./presetTemplates.svelte');
    await presetTemplates.load('/nope');
    expect(presetTemplates.status).toBe('error');
    expect(presetTemplates.candidates).toEqual([]);
    expect(presetTemplates.available).toBe(false);
  });
});

describe('presetTemplates.loadIntoBuffer', () => {
  it('loads the bytes, replaces the buffer, reloads the editor, and toasts success', async () => {
    templateSources.mockResolvedValue({ candidates: [] });
    const buf = new Uint8Array([1, 2, 3]).buffer;
    templateFile.mockResolvedValue(buf);
    loadBytes.mockResolvedValue({ ok: true });
    load.mockResolvedValue();
    const { presetTemplates } = await import('./presetTemplates.svelte');
    await presetTemplates.load('/t');
    const ok = await presetTemplates.loadIntoBuffer(CANDIDATE);
    expect(ok).toBe(true);
    expect(templateFile).toHaveBeenCalledWith(CANDIDATE.path, '/t');
    expect(loadBytes).toHaveBeenCalledWith(buf);
    expect(noteBufferReplaced).toHaveBeenCalledWith(expect.stringContaining('MATEUS'));
    expect(load).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('MATEUS'), '#f5a623');
  });

  it('reports failure (and toasts) when the read or load throws', async () => {
    templateSources.mockResolvedValue({ candidates: [] });
    templateFile.mockRejectedValue(new Error('boom'));
    const { presetTemplates } = await import('./presetTemplates.svelte');
    await presetTemplates.load('/t');
    const ok = await presetTemplates.loadIntoBuffer(CANDIDATE);
    expect(ok).toBe(false);
    expect(loadBytes).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('boom', '#d6543f');
  });
});
