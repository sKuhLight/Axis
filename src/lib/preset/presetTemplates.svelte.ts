// Preset templates store — lists the configured templates folder (the official editor's
// `presets/templates` directory by default) and loads a chosen template into the edit buffer.
// Templates are plain preset .syx files, so loading reuses the existing /preset/load path. Mirrors
// the block-library store's shape (load/preload/idle status) — the directory is user-configurable.
import { forgefx } from '$lib/api/forgefx';
import { deviceSession, editorNotifications, gridEditing, presetBuffer } from '$lib/editor/editorClients.svelte';
import { defaultPresetTemplatesPath } from '$lib/editor/blockLibraryPath';
import { appSettings } from '$lib/platform/appSettings.svelte';
import type { PresetSummary, TemplateCandidate } from '$lib/api/types';

export type PresetTemplatesStatus = 'idle' | 'loading' | 'ready' | 'error';

class PresetTemplatesStore {
  candidates = $state<TemplateCandidate[]>([]);
  status = $state<PresetTemplatesStatus>('idle');
  /** The directory the current `candidates` came from ('' = nothing loaded). */
  path = $state('');
  /** True when the engine answered: /fm3edit/templates/* is a desktop (Node) surface only. */
  available = $state(true);
  #request: Promise<void> | null = null;
  #scheduledPath = '';

  /** Configured templates directory, falling back to the detected unit's editor default. */
  get effectivePath(): string {
    return (
      appSettings.cfg.presetTemplatesPath ||
      defaultPresetTemplatesPath(deviceSession.detected?.connected ? deviceSession.detected.name : null) ||
      ''
    );
  }

  load = async (path: string): Promise<void> => {
    const nextPath = path.trim();
    if (!nextPath) {
      this.path = '';
      this.candidates = [];
      this.status = 'idle';
      return;
    }
    if (this.path === nextPath && (this.status === 'ready' || this.status === 'loading')) return this.#request ?? Promise.resolve();
    this.path = nextPath;
    this.status = 'loading';
    const request = forgefx
      .templateSources(nextPath)
      .then(({ candidates }) => {
        if (this.path === nextPath) {
          this.candidates = candidates;
          this.status = 'ready';
          this.available = true;
        }
      })
      .catch(() => {
        if (this.path === nextPath) {
          this.candidates = [];
          this.status = 'error';
          this.available = false;
        }
      })
      .finally(() => {
        if (this.#request === request) this.#request = null;
      });
    this.#request = request;
    return request;
  };

  preloadWhenIdle(path: string): void {
    const nextPath = path.trim();
    if (!nextPath || nextPath === this.path || nextPath === this.#scheduledPath) return;
    this.#scheduledPath = nextPath;
    const load = () => {
      this.#scheduledPath = '';
      void this.load(nextPath);
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(load, { timeout: 3000 });
    else setTimeout(load, 500);
  }

  /** Raw .syx bytes of one template, for the picker's decoded detail. */
  bytesOf(candidate: TemplateCandidate): Promise<ArrayBuffer> {
    return forgefx.templateFile(candidate.path, this.path);
  }

  /** Decode a template's bytes into the library summary shape (best-effort — null on failure). */
  async summaryOf(candidate: TemplateCandidate): Promise<PresetSummary | null> {
    try {
      return await forgefx.decodePresetFile(await this.bytesOf(candidate));
    } catch {
      return null;
    }
  }

  /** Load a template into the edit buffer — replaces the current preset, exactly like loading any
   *  local .syx. Returns false (with a toast) if the read or load failed. */
  loadIntoBuffer = async (candidate: TemplateCandidate): Promise<boolean> => {
    try {
      const bytes = await this.bytesOf(candidate);
      await forgefx.loadBytes(bytes);
      presetBuffer.noteBufferReplaced(`Loaded ${candidate.name} from template`);
      await gridEditing.load();
      editorNotifications.showToast(`Loaded template "${candidate.name}" — Save to store it on a slot`, '#f5a623');
      return true;
    } catch (e) {
      editorNotifications.showToast((e as Error)?.message || 'Could not load that template', '#d6543f');
      return false;
    }
  };
}

export const presetTemplates = new PresetTemplatesStore();
