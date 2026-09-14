import { deviceSession, presetBuffer } from '$lib/editor/editorClients.svelte';
import { changedNameRenames } from './nameRenameChanges';
import { storedSceneName } from './sceneNameState';

/**
 * One shared inline-rename session for the two top-bar name widgets (`axis.preset` and
 * `axis.scenes`). The Grid page's existing scene pencil (`AxisScenesWidget`) is the single
 * trigger: it opens BOTH names for editing at once, and Enter in either input commits every
 * field the user changed. The session lives at module scope because the two widgets are
 * separate registered types that can be placed independently — the shared drafts are what
 * let one Enter submit both names (see `changedNameRenames`).
 *
 * The preset field is the WORKING BUFFER only (`renamePreset`), persisted by the Save widget,
 * matching the monolith TopBar. The scene field is `renameScene`.
 */
class NameRenameSession {
  /** True while both name widgets render inline inputs. */
  active = $state(false);
  /** Live preset input value (seeded from the device at `begin`). */
  presetDraft = $state('');
  /** Live scene input value (seeded from the device at `begin`). */
  sceneDraft = $state('');
  /** 1-based scene the session targets — fixed at `begin`. */
  scene = $state(1);
  #presetBaseline = '';
  #sceneBaseline = '';

  /** The current preset is writable: the device supports rename AND a preset is loaded. */
  get canEditPreset(): boolean {
    return deviceSession.canRenamePresets && !!deviceSession.preset;
  }

  get canEditScene(): boolean {
    return deviceSession.canRenameScenes;
  }

  /** At least one of the two names is writable — gates the pencil affordance. */
  get canEditAny(): boolean {
    return this.canEditPreset || this.canEditScene;
  }

  /** Open the session, seeding both drafts from the live device state. No-op when neither is writable. */
  begin(): void {
    if (!this.canEditAny) return;
    this.scene = Math.max(1, Math.min(deviceSession.sceneCount || 8, deviceSession.scene || 1));
    this.#presetBaseline = (deviceSession.preset?.name ?? '').trim();
    this.#sceneBaseline = storedSceneName(deviceSession.sceneNames, this.scene);
    this.presetDraft = this.#presetBaseline;
    this.sceneDraft = this.#sceneBaseline;
    this.active = true;
  }

  /** Write every changed field, then close. Enter routes here from either input. */
  commit(): void {
    if (!this.active) return;
    const changes = changedNameRenames({
      presetBaseline: this.#presetBaseline,
      presetDraft: this.presetDraft,
      sceneBaseline: this.#sceneBaseline,
      sceneDraft: this.sceneDraft,
      canPreset: this.canEditPreset,
      canScene: this.canEditScene
    });
    this.active = false;
    if (changes.preset !== undefined) void presetBuffer.renamePreset(changes.preset);
    if (changes.scene !== undefined) void deviceSession.renameScene(this.scene, changes.scene);
  }

  /** Close without writing. Escape routes here. */
  cancel(): void {
    this.active = false;
  }

  /** Pencil click: toggle the session. */
  toggle(): void {
    if (this.active) this.cancel();
    else this.begin();
  }
}

export const nameRename = new NameRenameSession();
