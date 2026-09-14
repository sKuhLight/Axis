/**
 * Which names a combined preset + scene rename session should actually write.
 *
 * Kept as a pure module (like `sceneNameState.ts` / `saveDirtyState.ts`) so it is
 * unit-testable under the repo's node-only vitest setup — the shared session store
 * and the two widgets that render the inputs are never rendered in tests.
 *
 * Sanitation is NOT duplicated here — `presetBuffer.renamePreset` /
 * `deviceSession.renameScene` own the device rule (printable ASCII, ≤32,
 * right-trimmed). This layer only decides *whether* each field changed and is
 * allowed to be written.
 */

export interface NameRenameInput {
  /** Trimmed preset name the session opened with — the baseline a draft is diffed against. */
  presetBaseline: string;
  /** Live preset input value. */
  presetDraft: string;
  /** Trimmed scene name the session opened with. */
  sceneBaseline: string;
  /** Live scene input value. */
  sceneDraft: string;
  /** Device can rename the current preset (and a preset exists). */
  canPreset: boolean;
  /** Device can rename scenes. */
  canScene: boolean;
}

export interface NameRenameChanges {
  /** New preset name to write, or absent when the preset was unchanged / not writable. */
  preset?: string;
  /** New scene name to write, or absent when the scene was unchanged / not writable. */
  scene?: string;
}

/**
 * A blank preset name is rejected (the device would only restore the previous name, and the
 * monolith TopBar guards the same way); a blank SCENE name is a legitimate "clear it" edit, so
 * only a change is required.
 */
export function changedNameRenames(input: NameRenameInput): NameRenameChanges {
  const changes: NameRenameChanges = {};
  if (input.canPreset) {
    const next = input.presetDraft.trim();
    if (next && next !== input.presetBaseline) changes.preset = next;
  }
  if (input.canScene) {
    const next = input.sceneDraft.trim();
    if (next !== input.sceneBaseline) changes.scene = next;
  }
  return changes;
}
