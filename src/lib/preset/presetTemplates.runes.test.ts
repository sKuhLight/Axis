// Preset-templates store: directory resolution (configured → detected-unit default), the template
// list load lifecycle, and loading a template into the edit buffer. Mirrors library.runes.test.ts's
// mock-and-dynamic-import setup.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TemplateCandidate } from '$lib/api/types';

const templateSources = vi.fn<(path: string) => Promise<{ candidates: TemplateCandidate[] }>>();
const templateFile = vi.fn<(path: string, dir: string) => Promise<ArrayBuffer>>();
const loadBytes = vi.fn<(bytes: ArrayBuffer) => Promise<{ ok: boolean }>>();
const decodePresetFile = vi.fn();
const presetBackup = vi.fn<() => Promise<{ name: string; bytes: number[] }>>();
const saveTemplate = vi.fn<(dir: string, name: string, bytes: number[], overwrite?: boolean) => Promise<{ ok: boolean; path: string }>>();
const showToast = vi.fn();
const noteBufferReplaced = vi.fn();
const load = vi.fn<() => Promise<void>>();
const detected = { connected: true, name: 'FM3' };
const preset = { number: 3, name: 'Brit 800' };
const cfg = { blockLibraryPath: '', presetTemplatesPath: '' };

vi.mock('$lib/api/forgefx', () => ({
  forgefx: {
    templateSources: (p: string) => templateSources(p),
    templateFile: (p: string, d: string) => templateFile(p, d),
    loadBytes: (b: ArrayBuffer) => loadBytes(b),
    decodePresetFile: (b: ArrayBuffer) => decodePresetFile(b),
    presetBackup: () => presetBackup(),
    saveTemplate: (d: string, n: string, b: number[], o?: boolean) => saveTemplate(d, n, b, o)
  }
}));
vi.mock('$lib/editor/editorClients.svelte', () => ({
  deviceSession: { get detected() { return detected; }, get preset() { return preset; } },
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
  presetBackup.mockReset();
  saveTemplate.mockReset();
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

describe('presetTemplates.saveCurrentAsTemplate', () => {
  it('offers the current preset name as the default template name', async () => {
    const { presetTemplates } = await import('./presetTemplates.svelte');
    expect(presetTemplates.defaultTemplateName).toBe('Brit 800');
  });

  it('dumps the edit buffer and writes it into the templates folder, refreshing the list', async () => {
    cfg.presetTemplatesPath = '/t';
    const bytes = [0xf0, 1, 2, 0xf7];
    presetBackup.mockResolvedValue({ name: 'Brit 800', bytes });
    saveTemplate.mockResolvedValue({ ok: true, path: '/t/Brit 800.syx' });
    templateSources.mockResolvedValue({ candidates: [CANDIDATE] });
    const { presetTemplates } = await import('./presetTemplates.svelte');

    const outcome = await presetTemplates.saveCurrentAsTemplate('Brit 800');

    expect(outcome).toEqual({ ok: true, path: '/t/Brit 800.syx' });
    expect(saveTemplate).toHaveBeenCalledWith('/t', 'Brit 800', bytes, false);
    expect(templateSources).toHaveBeenCalledWith('/t');
    expect(presetTemplates.candidates).toEqual([CANDIDATE]);
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Brit 800'), '#33c46b');
  });

  it('reports a name clash as exists without toasting (the dialog offers a replace)', async () => {
    cfg.presetTemplatesPath = '/t';
    presetBackup.mockResolvedValue({ name: 'Brit 800', bytes: [1] });
    saveTemplate.mockRejectedValue(Object.assign(new Error('409'), { status: 409 }));
    const { presetTemplates } = await import('./presetTemplates.svelte');

    const outcome = await presetTemplates.saveCurrentAsTemplate('Brit 800');

    expect(outcome).toEqual({ ok: false, reason: 'exists' });
    expect(showToast).not.toHaveBeenCalled();
  });

  it('retries with overwrite when asked', async () => {
    cfg.presetTemplatesPath = '/t';
    presetBackup.mockResolvedValue({ name: 'Brit 800', bytes: [1] });
    saveTemplate.mockResolvedValue({ ok: true, path: '/t/Brit 800.syx' });
    templateSources.mockResolvedValue({ candidates: [] });
    const { presetTemplates } = await import('./presetTemplates.svelte');

    const outcome = await presetTemplates.saveCurrentAsTemplate('Brit 800', true);

    expect(outcome.ok).toBe(true);
    expect(saveTemplate).toHaveBeenCalledWith('/t', 'Brit 800', [1], true);
  });

  it('refuses with a toast when no templates folder is configured', async () => {
    detected.connected = false;
    const { presetTemplates } = await import('./presetTemplates.svelte');

    const outcome = await presetTemplates.saveCurrentAsTemplate('Brit 800');

    expect(outcome).toMatchObject({ ok: false, reason: 'error' });
    expect(presetBackup).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Setup'), '#d6543f');
  });

  it('toasts and reports error when the dump or write fails for another reason', async () => {
    cfg.presetTemplatesPath = '/t';
    presetBackup.mockRejectedValue(new Error('no dump'));
    const { presetTemplates } = await import('./presetTemplates.svelte');

    const outcome = await presetTemplates.saveCurrentAsTemplate('Brit 800');

    expect(outcome).toEqual({ ok: false, reason: 'error', message: 'no dump' });
    expect(showToast).toHaveBeenCalledWith('no dump', '#d6543f');
  });
});
