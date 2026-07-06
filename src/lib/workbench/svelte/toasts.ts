/**
 * Generic workbench toast surface.
 *
 * The workbench shell has no toast affordance of its own — layout actions (apply
 * a LAYOUT preset, copy a profile layout, save a panel to the library) complete
 * silently. This module is the standalone, app-agnostic toast queue the shell
 * renders through `WorkbenchToasts.svelte`. It carries NO Axis imports: the Axis
 * layer (or any host) enqueues human text through {@link enqueueToast}; the
 * generic layer owns stacking, auto-dismiss, and the cap.
 *
 * The queue is a plain observable store (the same subscribe contract as
 * `WorkbenchController`) rather than a runes module, so its logic is fully unit
 * testable with an INJECTABLE clock + timer — no free-running `Date.now()` or
 * real `setTimeout` in tests. `WorkbenchToasts.svelte` subscribes to it.
 *
 * Tone maps to a `--aw-*` token in the component (accent / amber / danger) — this
 * module never names a color. Only transform/opacity animate in the component
 * (geometry guard), and it renders bottom-center above the bottom bar,
 * safe-area aware, `aria-live="polite"`.
 */

/** Semantic tone → the component maps each to an `--aw-*` accent token. */
export type ToastTone = 'accent' | 'warn' | 'danger';

export interface ToastInput {
  /** The human-readable message (e.g. `Applied "Stage" layout`). */
  text: string;
  /** Semantic accent; defaults to `accent`. */
  tone?: ToastTone;
  /** Auto-dismiss delay in ms; defaults to {@link DEFAULT_TOAST_DURATION}. */
  duration?: number;
}

export interface Toast {
  /** Stable id for keyed-each rendering + dismissal. */
  id: string;
  text: string;
  tone: ToastTone;
  duration: number;
  /** Timestamp (ms, from the injected clock) at which the toast was enqueued. */
  createdAt: number;
}

/** Default auto-dismiss delay (~2.6s per the design). */
export const DEFAULT_TOAST_DURATION = 2600;
/** Maximum simultaneously stacked toasts; older ones are dropped past this. */
export const MAX_STACKED_TOASTS = 3;

/**
 * Injectable environment so the queue is deterministic under test: a clock and a
 * one-shot timer pair. Defaults bind to the platform (`Date.now` + `setTimeout`).
 */
export interface ToastEnv {
  now(): number;
  setTimer(handler: () => void, delayMs: number): unknown;
  clearTimer(handle: unknown): void;
}

const defaultEnv: ToastEnv = {
  now: () => Date.now(),
  setTimer: (handler, delayMs) => setTimeout(handler, delayMs),
  clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

type Subscriber = (toasts: readonly Toast[]) => void;

/**
 * The toast queue. A tiny observable store: `subscribe` for the current list,
 * `enqueue`/`dismiss`/`clear` to mutate it. Auto-dismiss + hover-pause are driven
 * through the injected timer so tests advance time explicitly.
 */
export class ToastQueue {
  #toasts: Toast[] = [];
  #subscribers = new Set<Subscriber>();
  #timers = new Map<string, unknown>();
  /** Remaining ms until dismiss for a toast whose timer is paused (hover). */
  #paused = new Map<string, number>();
  #seq = 0;
  readonly #env: ToastEnv;

  constructor(env: ToastEnv = defaultEnv) {
    this.#env = env;
  }

  /** Current toasts, oldest first. Returned frozen so callers can't mutate it. */
  get toasts(): readonly Toast[] {
    return this.#toasts;
  }

  /**
   * Enqueue a toast. Returns its id. When the stack is at {@link MAX_STACKED_TOASTS}
   * the OLDEST toast is evicted (its timer cleared) so the newest always shows.
   */
  enqueue(input: ToastInput): string {
    const id = `toast-${++this.#seq}`;
    const toast: Toast = {
      id,
      text: input.text,
      tone: input.tone ?? 'accent',
      duration: input.duration ?? DEFAULT_TOAST_DURATION,
      createdAt: this.#env.now()
    };
    this.#toasts = [...this.#toasts, toast];
    // Evict the oldest until we're within the cap.
    while (this.#toasts.length > MAX_STACKED_TOASTS) {
      const [oldest, ...rest] = this.#toasts;
      this.#toasts = rest;
      this.#clearTimerFor(oldest.id);
    }
    if (toast.duration > 0 && Number.isFinite(toast.duration)) {
      this.#arm(id, toast.duration);
    }
    this.#emit();
    return id;
  }

  /** Dismiss a toast by id (no-op if already gone). */
  dismiss(id: string): void {
    const next = this.#toasts.filter((toast) => toast.id !== id);
    if (next.length === this.#toasts.length) return;
    this.#toasts = next;
    this.#clearTimerFor(id);
    this.#emit();
  }

  /** Remove every toast and cancel all pending timers. */
  clear(): void {
    if (!this.#toasts.length) return;
    for (const id of [...this.#timers.keys()]) this.#clearTimerFor(id);
    this.#toasts = [];
    this.#paused.clear();
    this.#emit();
  }

  /**
   * Pause the auto-dismiss timer for a toast (pointer entered). The remaining
   * time is banked so {@link resume} restarts from where it left off.
   */
  pause(id: string): void {
    if (this.#paused.has(id)) return;
    const toast = this.#toasts.find((t) => t.id === id);
    if (!toast) return;
    const elapsed = this.#env.now() - toast.createdAt;
    const remaining = Math.max(0, toast.duration - elapsed);
    this.#clearTimerFor(id);
    this.#paused.set(id, remaining);
  }

  /** Resume a paused toast's auto-dismiss with its banked remaining time. */
  resume(id: string): void {
    const remaining = this.#paused.get(id);
    if (remaining === undefined) return;
    this.#paused.delete(id);
    const toast = this.#toasts.find((t) => t.id === id);
    if (!toast) return;
    // Rebase createdAt so a subsequent pause computes the remaining time again.
    toast.createdAt = this.#env.now() - (toast.duration - remaining);
    if (remaining > 0) this.#arm(id, remaining);
    else this.dismiss(id);
  }

  /** Subscribe to the toast list. Fires immediately, returns an unsubscribe. */
  subscribe(run: Subscriber): () => void {
    this.#subscribers.add(run);
    run(this.#toasts);
    return () => this.#subscribers.delete(run);
  }

  #arm(id: string, delayMs: number): void {
    this.#clearTimerFor(id);
    const handle = this.#env.setTimer(() => {
      this.#timers.delete(id);
      this.dismiss(id);
    }, delayMs);
    this.#timers.set(id, handle);
  }

  #clearTimerFor(id: string): void {
    const handle = this.#timers.get(id);
    if (handle !== undefined) {
      this.#env.clearTimer(handle);
      this.#timers.delete(id);
    }
    this.#paused.delete(id);
  }

  #emit(): void {
    const snapshot = this.#toasts;
    this.#subscribers.forEach((run) => run(snapshot));
  }
}

/** The app-wide singleton queue (bound to the platform clock/timer). */
export const workbenchToasts = new ToastQueue();

/**
 * Enqueue a workbench toast on the shared queue. This is the seam the app layer
 * calls — a plain function so callers never touch the queue instance directly.
 *   enqueueToast({ text: 'Applied "Stage" layout' });
 */
export function enqueueToast(input: ToastInput): string {
  return workbenchToasts.enqueue(input);
}
