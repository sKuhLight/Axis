import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_TOAST_DURATION,
  MAX_STACKED_TOASTS,
  ToastQueue,
  type ToastEnv,
  type Toast
} from '../toasts';

/**
 * A fully deterministic clock + timer: no `Date.now()`, no real `setTimeout`.
 * `advance(ms)` moves the clock forward and fires any timers that come due, so
 * the auto-dismiss/pause logic is tested without wall-clock timing.
 */
class FakeClock {
  time = 0;
  #seq = 0;
  #timers = new Map<number, { at: number; handler: () => void }>();

  readonly env: ToastEnv = {
    now: () => this.time,
    setTimer: (handler, delayMs) => {
      const id = ++this.#seq;
      this.#timers.set(id, { at: this.time + delayMs, handler });
      return id;
    },
    clearTimer: (handle) => {
      this.#timers.delete(handle as number);
    }
  };

  advance(ms: number): void {
    const target = this.time + ms;
    // Fire due timers in chronological order until we reach the target time.
    for (;;) {
      let next: { id: number; at: number; handler: () => void } | null = null;
      for (const [id, timer] of this.#timers) {
        if (timer.at <= target && (!next || timer.at < next.at)) next = { id, ...timer };
      }
      if (!next) break;
      this.time = next.at;
      this.#timers.delete(next.id);
      next.handler();
    }
    this.time = target;
  }

  get pending(): number {
    return this.#timers.size;
  }
}

describe('ToastQueue', () => {
  let clock: FakeClock;
  let queue: ToastQueue;

  beforeEach(() => {
    clock = new FakeClock();
    queue = new ToastQueue(clock.env);
  });

  it('enqueues a toast with defaults (accent tone, default duration)', () => {
    const id = queue.enqueue({ text: 'Applied "Stage" layout' });
    expect(queue.toasts).toHaveLength(1);
    const toast = queue.toasts[0];
    expect(toast.id).toBe(id);
    expect(toast.text).toBe('Applied "Stage" layout');
    expect(toast.tone).toBe('accent');
    expect(toast.duration).toBe(DEFAULT_TOAST_DURATION);
    expect(toast.createdAt).toBe(0);
  });

  it('honors explicit tone and duration', () => {
    queue.enqueue({ text: 'Careful', tone: 'warn', duration: 1000 });
    expect(queue.toasts[0].tone).toBe('warn');
    expect(queue.toasts[0].duration).toBe(1000);
  });

  it('auto-dismisses after its duration via the injected timer', () => {
    queue.enqueue({ text: 'gone soon', duration: 2000 });
    expect(queue.toasts).toHaveLength(1);
    clock.advance(1999);
    expect(queue.toasts).toHaveLength(1);
    clock.advance(1);
    expect(queue.toasts).toHaveLength(0);
    expect(clock.pending).toBe(0);
  });

  it('dismisses by id and clears its timer', () => {
    const id = queue.enqueue({ text: 'manual' });
    queue.dismiss(id);
    expect(queue.toasts).toHaveLength(0);
    expect(clock.pending).toBe(0);
    // Advancing past the duration does nothing (timer was cleared).
    clock.advance(DEFAULT_TOAST_DURATION + 100);
    expect(queue.toasts).toHaveLength(0);
  });

  it('dismiss of an unknown id is a no-op', () => {
    queue.enqueue({ text: 'stays' });
    queue.dismiss('toast-999');
    expect(queue.toasts).toHaveLength(1);
  });

  it(`caps the stack at ${MAX_STACKED_TOASTS}, evicting the oldest`, () => {
    const ids: string[] = [];
    for (let i = 0; i < MAX_STACKED_TOASTS + 2; i++) ids.push(queue.enqueue({ text: `t${i}` }));
    expect(queue.toasts).toHaveLength(MAX_STACKED_TOASTS);
    // The two oldest were evicted; the newest MAX are kept in order.
    const kept = queue.toasts.map((t) => t.text);
    expect(kept).toEqual(['t2', 't3', 't4']);
    // No orphan timers left from the evicted toasts.
    expect(clock.pending).toBe(MAX_STACKED_TOASTS);
  });

  it('a zero/non-finite duration never auto-dismisses', () => {
    queue.enqueue({ text: 'sticky', duration: 0 });
    queue.enqueue({ text: 'sticky2', duration: Number.POSITIVE_INFINITY });
    expect(clock.pending).toBe(0);
    clock.advance(1_000_000);
    expect(queue.toasts).toHaveLength(2);
  });

  it('pause banks remaining time; resume restarts from there', () => {
    const id = queue.enqueue({ text: 'hovered', duration: 2000 });
    clock.advance(500); // 1500 remaining
    queue.pause(id);
    expect(clock.pending).toBe(0); // timer cancelled while paused
    clock.advance(10_000); // paused: nothing dismisses
    expect(queue.toasts).toHaveLength(1);
    queue.resume(id);
    clock.advance(1499);
    expect(queue.toasts).toHaveLength(1);
    clock.advance(1);
    expect(queue.toasts).toHaveLength(0);
  });

  it('resume of a never-paused toast is a no-op', () => {
    const id = queue.enqueue({ text: 'x', duration: 2000 });
    queue.resume(id);
    // Still on its original schedule.
    clock.advance(2000);
    expect(queue.toasts).toHaveLength(0);
  });

  it('clear removes all toasts and cancels every timer', () => {
    queue.enqueue({ text: 'a' });
    queue.enqueue({ text: 'b' });
    queue.clear();
    expect(queue.toasts).toHaveLength(0);
    expect(clock.pending).toBe(0);
    clock.advance(DEFAULT_TOAST_DURATION + 100);
    expect(queue.toasts).toHaveLength(0);
  });

  it('notifies subscribers immediately and on every change', () => {
    const seen: number[] = [];
    const unsubscribe = queue.subscribe((toasts: readonly Toast[]) => seen.push(toasts.length));
    expect(seen).toEqual([0]); // immediate fire with the current (empty) list
    const id = queue.enqueue({ text: 'one' });
    queue.enqueue({ text: 'two' });
    queue.dismiss(id);
    expect(seen).toEqual([0, 1, 2, 1]);
    unsubscribe();
    queue.enqueue({ text: 'after unsub' });
    expect(seen).toEqual([0, 1, 2, 1]);
  });

  it('a subscriber sees the auto-dismiss emit', () => {
    const seen: number[] = [];
    queue.subscribe((toasts) => seen.push(toasts.length));
    queue.enqueue({ text: 'brief', duration: 500 });
    clock.advance(500);
    expect(seen).toEqual([0, 1, 0]);
  });
});
