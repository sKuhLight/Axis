/**
 * Tap-tempo session — the transient "keep tapping" prompt.
 *
 * Tapping tempo is a gesture, not a single action: the first tap opens a prompt that
 * lingers while the user keeps tapping and dismisses itself after a short pause. This
 * store owns only that session state (whether the prompt is up, and how many taps have
 * landed). It deliberately touches no device: the caller performs the actual
 * `deviceSession.tapTempo()`, and the prompt reads the device-calculated BPM.
 *
 * Rune store (`.svelte.ts`) so the prompt reacts; unit-tested via `tapTempo.runes.test.ts`.
 */

/** Inactivity window before the prompt dismisses. */
export const TAP_TEMPO_TIMEOUT_MS = 1200;

class TapTempoSession {
  /** Whether the "keep tapping" prompt is showing. */
  active = $state(false);
  /** Bumped per tap so the prompt can restart its drain animation. */
  tapCount = $state(0);
  #timer: ReturnType<typeof setTimeout> | null = null;

  /** Record a tap: open the prompt (if closed) and re-arm the inactivity timeout. */
  tap(): void {
    this.active = true;
    this.tapCount += 1;
    this.#arm();
  }

  /** Dismiss immediately — inactivity timeout, Escape, or a scrim click. */
  end(): void {
    this.#disarm();
    this.active = false;
    this.tapCount = 0;
  }

  #arm(): void {
    this.#disarm();
    this.#timer = setTimeout(() => this.end(), TAP_TEMPO_TIMEOUT_MS);
  }

  #disarm(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }
}

export const tapTempo = new TapTempoSession();
