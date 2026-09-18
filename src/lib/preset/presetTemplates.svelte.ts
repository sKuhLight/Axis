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

/** Result of writing the edit buffer into the templates folder. `'exists'` is a UI decision (offer
 *  overwrite), not a toast — every other failure has already toasted. */
export type SaveTemplateOutcome =
  | { ok: true; path: string }
  | { ok: false; reason: 'exists' }
  | { ok: false; reason: 'error'; message: string };

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

  /** Default name offered when saving the current preset as a template. */
  get defaultTemplateName(): string {
    return deviceSession.preset?.name?.trim() || 'Template';
  }

  load = async (path: string, force = false): Promise<void> => {
    const nextPath = path.trim();
    if (!nextPath) {
      this.path = '';
      this.candidates = [];
      this.status = 'idle';
      return;
    }
    if (!force && this.path === nextPath && (this.status === 'ready' || this.status === 'loading')) return this.#request ?? Promise.resolve();
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

  /** Write the CURRENT edit buffer (including unsaved edits) into the templates folder as
   *  `<name>.syx`. A name clash returns `'exists'` so the dialog can offer a replace; every other
   *  failure is toasted here and returned as `'error'`. On success the candidate list is refreshed. */
  saveCurrentAsTemplate = async (name: string, overwrite = false): Promise<SaveTemplateOutcome> => {
    const dir = this.effectivePath;
    if (!dir) {
      const message = 'No templates folder is set — choose one in Setup ▸ Storage.';
      editorNotifications.showToast(message, '#d6543f');
      return { ok: false, reason: 'error', message };
    }
    try {
      const backup = await forgefx.presetBackup();
      const saved = await forgefx.saveTemplate(dir, name, backup.bytes, overwrite);
      void this.load(dir, true);
      editorNotifications.showToast(`Saved "${name}" as a template`, '#33c46b');
      return { ok: true, path: saved.path };
    } catch (e) {
      if ((e as { status?: number })?.status === 409) return { ok: false, reason: 'exists' };
      const message = (e as Error)?.message || 'Could not save that template';
      editorNotifications.showToast(message, '#d6543f');
      return { ok: false, reason: 'error', message };
    }
  };
}

export const presetTemplates = new PresetTemplatesStore();
