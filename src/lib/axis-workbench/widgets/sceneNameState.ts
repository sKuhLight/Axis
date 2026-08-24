/**
 * Scene-name display rule for the `axis.scenes` widget.
 *
 * Kept as a pure module (like `saveDirtyState.ts` / `paramWidgetState.ts`) so it
 * is unit-testable under the repo's node-only vitest setup — the widget itself
 * is a Svelte component and never gets rendered in tests.
 *
 * Note we deliberately do NOT reuse `editor.sceneName(n)` for the inline label:
 * that accessor falls back to `"Scene N"`, which would just restate the scene
 * chip sitting right next to it. It stays the right call for the chip tooltips.
 *
 * Sanitation is NOT duplicated here — `editor.renameScene` owns the device rule
 * (printable ASCII, ≤32, right-trimmed) and this layer must not import down into
 * it. The widget only caps input length via `SCENE_NAME_MAX` and compares
 * trimmed values to decide whether a rename is worth dispatching.
 */

export interface SceneNameDisplay {
  /** What to render — the decoded name, or the `name…` rename affordance. */
  text: string;
  /** True when the slot carries no decoded name (drives the muted/italic style). */
  empty: boolean;
}

/** Placeholder shown in place of a blank scene name on renameable devices. */
export const SCENE_NAME_PLACEHOLDER = 'name…';

/** Device limit for a scene name in the working buffer (mirrors `editor.renameScene`). */
export const SCENE_NAME_MAX = 32;

/**
 * Display state for a 1-based scene number. Blank / whitespace-only / missing
 * slots collapse to the placeholder with `empty: true`.
 */
export function sceneNameDisplay(names: readonly string[], scene: number): SceneNameDisplay {
  const raw = names[scene - 1]?.trim() ?? '';
  return raw.length ? { text: raw, empty: false } : { text: SCENE_NAME_PLACEHOLDER, empty: true };
}

/** The stored name for a 1-based scene, trimmed — the baseline a draft is diffed against. */
export function storedSceneName(names: readonly string[], scene: number): string {
  return names[scene - 1]?.trim() ?? '';
}
