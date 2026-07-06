import { parseAxisBlockEditorPart, type AxisBlockEditorPart, type AxisModifierTarget } from './types';

// Typed shared controller for the docked Modifier part (design §1/§3 of 05-block-editor.md). It is
// the production replacement for the design's `window.__BEBus` modifier keys (`modParam`, `modBlock`)
// plus the modifier-ownership rule: while a `be-part="modifier"` panel is mounted, an editor's ∿
// badge targets the DOCKED panel instead of opening the in-editor flyout.
//
// No window buses — the ControlSurface / BlockEditor overlay flyout and the docked panel both talk
// to this singleton. Anyone editing shared modifier state (or asking whether a docked panel exists)
// goes through here.

export interface AxisBlockEditorModifierSnapshot {
  /** The parameter the docked panel is bound to, or null for the empty state (design §3.3). */
  target: AxisModifierTarget | null;
  /** How many `be-part="modifier"` panels are currently mounted (design `modPartMounted`). */
  mountedParts: number;
}

const EMPTY: AxisBlockEditorModifierSnapshot = { target: null, mountedParts: 0 };

export class AxisBlockEditorModifierController {
  #snapshot: AxisBlockEditorModifierSnapshot = { ...EMPTY };
  #subscribers = new Set<(snapshot: AxisBlockEditorModifierSnapshot) => void>();
  // mounted modifier parts, tracked by token so re-elections stay stable across mount/unmount.
  #mounted = new Set<symbol>();

  get snapshot(): AxisBlockEditorModifierSnapshot {
    return { ...this.#snapshot };
  }

  /** True when at least one docked Modifier part is mounted (design `modPartMounted()`). */
  get modPartMounted(): boolean {
    return this.#mounted.size > 0;
  }

  // Register a mounted Modifier part; returns an unregister fn (call on unmount).
  registerPart(): () => void {
    const token = Symbol('be-modifier-part');
    this.#mounted.add(token);
    this.#setMounted(this.#mounted.size);
    return () => {
      if (this.#mounted.delete(token)) this.#setMounted(this.#mounted.size);
    };
  }

  // Point the docked panel at a parameter (design `openMod` → shared `modParam`/`modBlock`). Called by
  // the editor's ∿ badge when a docked panel exists.
  targetParameter(target: AxisModifierTarget): void {
    this.#snapshot = { ...this.#snapshot, target: { ...target } };
    this.#emit();
  }

  // Clear the docked panel's target (returns it to the empty state).
  clearTarget(): void {
    if (this.#snapshot.target == null) return;
    this.#snapshot = { ...this.#snapshot, target: null };
    this.#emit();
  }

  subscribe(run: (snapshot: AxisBlockEditorModifierSnapshot) => void): () => void {
    run(this.snapshot);
    this.#subscribers.add(run);
    return () => this.#subscribers.delete(run);
  }

  #setMounted(count: number): void {
    if (count === this.#snapshot.mountedParts) return;
    this.#snapshot = { ...this.#snapshot, mountedParts: count };
    this.#emit();
  }

  #emit(): void {
    const snapshot = this.snapshot;
    this.#subscribers.forEach((run) => run(snapshot));
  }
}

export const axisBlockEditorModifierController = new AxisBlockEditorModifierController();

/** Convenience for the design's part-parse helper on `panel.state?.part`. */
export function partFromPanelState(part: unknown): AxisBlockEditorPart {
  return parseAxisBlockEditorPart(part);
}
