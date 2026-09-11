/**
 * Axis overlay registry — the single owner of "which modal/overlay is open" and of the
 * Escape-key priority order.
 *
 * Before this module, every dialog gated on its own boolean `$state` flag (mostly on the
 * `editor` singleton) and Escape priority was a hand-ordered `else if` chain in
 * `src/routes/+page.svelte`. Adding a dialog meant editing three files and silently
 * reshuffling everyone else's priority.
 *
 * Now:
 *   - `overlays.open(id)` / `close(id)` / `toggle(id)` / `isOpen(id)` drive the overlays
 *     whose state the registry owns directly (the ones that were plain booleans).
 *   - Overlays whose open-state genuinely lives elsewhere (the tuner is device-synced, the
 *     converter flow carries a whole state machine) register a {@link OverlayDelegate} via
 *     `src/lib/overlay/overlayRegistrations.ts` so the registry can still read/close them.
 *   - `overlays.escape()` closes the single highest-priority open overlay. `+page.svelte`
 *     calls it instead of running a chain.
 *
 * The priority order in {@link ESCAPE_ORDER} reproduces the historical `+page.svelte` chain
 * exactly — do not reorder it without matching intent.
 */

export type OverlayId =
  | 'tuner'
  | 'history'
  | 'cabPicker'
  | 'palette'
  | 'quickBuild'
  | 'convertScratch'
  | 'convert'
  | 'presetPicker'
  | 'presetSearch'
  | 'linkArm'
  | 'blockEditor'
  | 'deviceTools'
  | 'save'
  | 'axisHub'
  | 'theme';

/**
 * Escape precedence — lower closes first. Entries 0–100 mirror, in order, the historical
 * `onKey` `else if` chain in `src/routes/+page.svelte`
 * (tuner → history → cabPicker → palette → quickBuild → convertScratch → convert →
 * presetPicker → presetSearch → linkArm → blockEditor). Entries 200+ (`deviceTools`,
 * `save`, `axisHub`, `theme`) were never part of that chain; they sit lowest so an open
 * chain overlay always wins, but remain non-dismissible by Escape.
 */
const ESCAPE_ORDER: Record<OverlayId, number> = {
  tuner: 0,
  history: 10,
  cabPicker: 20,
  palette: 30,
  quickBuild: 40,
  convertScratch: 50,
  convert: 60,
  presetPicker: 70,
  presetSearch: 80,
  linkArm: 90,
  blockEditor: 100,
  deviceTools: 200,
  save: 210,
  axisHub: 220,
  theme: 230
};

const ESCAPE_DISABLED = new Set<OverlayId>(['deviceTools', 'save', 'axisHub', 'theme']);

const OVERLAY_IDS = Object.keys(ESCAPE_ORDER) as OverlayId[];
const STACK_ORDER = [...OVERLAY_IDS].sort((a, b) => ESCAPE_ORDER[a] - ESCAPE_ORDER[b]);

/**
 * An overlay whose open-state is not a registry-owned boolean. `isOpen`/`close` bridge to
 * wherever the state actually lives (a domain store, the editor singleton). Registered from
 * `overlayRegistrations.ts` so this module imports no app code.
 */
export interface OverlayDelegate {
  isOpen: () => boolean;
  close: () => void;
  /** Whether Escape should close it. Defaults to true. */
  escDismiss?: boolean;
}

class OverlayRegistry {
  /** Open-state for the overlays the registry owns outright (former plain booleans). */
  #owned = $state<Partial<Record<OverlayId, boolean>>>({});
  /** Bridges to overlays whose state lives elsewhere. */
  #delegates = new Map<OverlayId, OverlayDelegate>();

  /** Wire an overlay whose state lives outside the registry. Called once at boot. */
  register(id: OverlayId, delegate: OverlayDelegate): void {
    this.#delegates.set(id, delegate);
  }

  /** Test-only: drop all delegate registrations. */
  _resetForTest(): void {
    this.#delegates.clear();
    this.#owned = {};
  }

  isOpen(id: OverlayId): boolean {
    const d = this.#delegates.get(id);
    return d ? d.isOpen() : this.#owned[id] === true;
  }

  /** True when any overlay at all is open. */
  get anyOpen(): boolean {
    return OVERLAY_IDS.some((id) => this.isOpen(id));
  }

  open(id: OverlayId): void {
    if (this.#delegates.has(id)) {
      throw new Error(`overlays.open('${id}'): '${id}' is delegate-backed — open it through its own store`);
    }
    this.#owned[id] = true;
  }

  close(id: OverlayId): void {
    const d = this.#delegates.get(id);
    if (d) {
      if (d.isOpen()) d.close();
      return;
    }
    this.#owned[id] = false;
  }

  toggle(id: OverlayId): void {
    if (this.isOpen(id)) this.close(id);
    else this.open(id);
  }

  #escDismissable(id: OverlayId): boolean {
    const d = this.#delegates.get(id);
    return d ? d.escDismiss !== false : !ESCAPE_DISABLED.has(id);
  }

  /** True when this is the visually highest-priority open registry overlay. */
  isTop(id: OverlayId): boolean {
    if (!this.isOpen(id)) return false;
    return !OVERLAY_IDS.some((other) => this.isOpen(other) && ESCAPE_ORDER[other] < ESCAPE_ORDER[id]);
  }

  /** CSS stack level matching Escape/focus priority (lower order renders above higher order). */
  zIndex(id: OverlayId): number {
    return 390 - STACK_ORDER.indexOf(id);
  }

  /**
   * Close the single highest-priority open, Escape-dismissable overlay. Returns true when
   * one was handled (so the caller can stop). Mirrors the old chain: exactly one overlay
   * closes per Escape press.
   */
  escape(): boolean {
    let top: OverlayId | null = null;
    for (const id of OVERLAY_IDS) {
      if (!this.#escDismissable(id) || !this.isOpen(id)) continue;
      if (top === null || ESCAPE_ORDER[id] < ESCAPE_ORDER[top]) top = id;
    }
    if (top === null) return false;
    this.close(top);
    return true;
  }
}

export const overlays = new OverlayRegistry();
