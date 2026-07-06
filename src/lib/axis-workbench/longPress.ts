// Small, self-contained long-press gesture. No such helper existed in src/lib
// (the codebase uses ad-hoc pointerdown + window pointerup patterns), so this is
// the single reusable primitive. The pure state machine is extracted for tests;
// the Svelte `use:` action wraps it over pointer/timer wiring.

export interface LongPressOptions {
  /** Hold duration before firing, in ms. */
  duration?: number;
  /** Movement (px) that cancels the press. */
  moveTolerance?: number;
  /** Fired with the originating pointer position when the hold completes. */
  onLongPress: (detail: { x: number; y: number }) => void;
}

const DEFAULT_DURATION = 500;
const DEFAULT_MOVE_TOLERANCE = 8;

/**
 * Pure long-press decision core. Feed it pointer lifecycle events; it tracks the
 * start point and reports whether a move should cancel the pending press. Timer
 * scheduling lives in the caller so it stays deterministically testable.
 */
export class LongPressMachine {
  #startX = 0;
  #startY = 0;
  #armed = false;
  readonly moveTolerance: number;

  constructor(moveTolerance: number = DEFAULT_MOVE_TOLERANCE) {
    this.moveTolerance = Math.max(0, moveTolerance);
  }

  get armed(): boolean {
    return this.#armed;
  }

  start(x: number, y: number): void {
    this.#startX = x;
    this.#startY = y;
    this.#armed = true;
  }

  /** Returns true if the movement exceeds tolerance (press should be cancelled). */
  moved(x: number, y: number): boolean {
    if (!this.#armed) return false;
    const dx = x - this.#startX;
    const dy = y - this.#startY;
    const exceeded = dx * dx + dy * dy > this.moveTolerance * this.moveTolerance;
    if (exceeded) this.#armed = false;
    return exceeded;
  }

  /** Cancel any pending press (pointer up / leave / cancel). */
  cancel(): void {
    this.#armed = false;
  }

  /** Consume a completed hold; returns the start position, or null if disarmed. */
  complete(): { x: number; y: number } | null {
    if (!this.#armed) return null;
    this.#armed = false;
    return { x: this.#startX, y: this.#startY };
  }
}

/**
 * Svelte action: fires `onLongPress` after a touch/pen hold, cancelling on move
 * or release. Mouse is ignored — mouse users get the context-menu path instead,
 * so a click never becomes a long-press.
 */
export function longPress(node: HTMLElement, options: LongPressOptions) {
  let opts = options;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const machine = new LongPressMachine(opts.moveTolerance ?? DEFAULT_MOVE_TOLERANCE);

  function clearTimer() {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === 'mouse') return;
    machine.start(event.clientX, event.clientY);
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      const detail = machine.complete();
      if (detail) opts.onLongPress(detail);
    }, opts.duration ?? DEFAULT_DURATION);
  }

  function onPointerMove(event: PointerEvent) {
    if (machine.moved(event.clientX, event.clientY)) clearTimer();
  }

  function onPointerEnd() {
    machine.cancel();
    clearTimer();
  }

  node.addEventListener('pointerdown', onPointerDown);
  node.addEventListener('pointermove', onPointerMove);
  node.addEventListener('pointerup', onPointerEnd);
  node.addEventListener('pointercancel', onPointerEnd);
  node.addEventListener('pointerleave', onPointerEnd);

  return {
    update(next: LongPressOptions) {
      opts = next;
    },
    destroy() {
      clearTimer();
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', onPointerEnd);
      node.removeEventListener('pointercancel', onPointerEnd);
      node.removeEventListener('pointerleave', onPointerEnd);
    }
  };
}
