import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ReloadScheduler, strongerReload, type ReloadKind } from './reloadScheduler';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const setup = (initiallyBusy = false) => {
  const state = { busy: initiallyBusy };
  const ran: string[] = [];
  const s = new ReloadScheduler(() => state.busy, 1000);
  const ask = (kind: ReloadKind, settleMs = 250) => s.schedule(kind, settleMs, () => { ran.push(kind); });
  return { state, ran, s, ask };
};

describe('strongerReload', () => {
  it('ranks changed above scene above blockState; the later of equals wins', () => {
    expect(strongerReload('blockState', 'scene')).toBe('scene');
    expect(strongerReload('scene', 'blockState')).toBe('scene');
    expect(strongerReload('scene', 'changed')).toBe('changed');
    expect(strongerReload('changed', 'scene')).toBe('changed');
    expect(strongerReload('changed', 'blockState')).toBe('changed');
    expect(strongerReload('blockState', 'blockState')).toBe('blockState');
  });
});

describe('ReloadScheduler — idle', () => {
  it('runs a single request after its settle window', () => {
    const { ran, ask } = setup();
    ask('scene');
    vi.advanceTimersByTime(249);
    expect(ran).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(ran).toEqual(['scene']);
  });
  it('coalesces a burst into one read and restarts the settle window', () => {
    const { ran, ask } = setup();
    ask('scene');
    vi.advanceTimersByTime(200);
    ask('scene');
    vi.advanceTimersByTime(200);
    expect(ran).toEqual([]); // the second request pushed the read out
    vi.advanceTimersByTime(50);
    expect(ran).toEqual(['scene']);
    vi.advanceTimersByTime(5000);
    expect(ran).toEqual(['scene']); // exactly once
  });
  it('a later lighter request does not downgrade a pending full reload', () => {
    const { ran, ask } = setup();
    ask('changed');
    vi.advanceTimersByTime(100);
    ask('scene');
    ask('blockState', 120);
    vi.advanceTimersByTime(300);
    expect(ran).toEqual(['changed']);
  });
  it('a later stronger request upgrades a pending lighter one', () => {
    const { ran, ask } = setup();
    ask('blockState', 120);
    ask('scene');
    ask('changed');
    vi.advanceTimersByTime(300);
    expect(ran).toEqual(['changed']);
  });
  it('forgets the strong kind once it has run: the next light request is light again', () => {
    const { ran, ask, s } = setup();
    ask('changed');
    vi.advanceTimersByTime(300);
    expect(s.pendingKind).toBeNull();
    ask('scene');
    expect(s.pendingKind).toBe('scene');
    vi.advanceTimersByTime(300);
    expect(ran).toEqual(['changed', 'scene']);
  });
});

describe('ReloadScheduler — while a walk / import / diagnostic run owns the device', () => {
  it('does not read while busy, and reads once when it is over', () => {
    const { state, ran, ask } = setup(true);
    ask('scene');
    vi.advanceTimersByTime(10_000);
    expect(ran).toEqual([]);
    state.busy = false;
    vi.advanceTimersByTime(1000); // the next re-check
    expect(ran).toEqual(['scene']);
    vi.advanceTimersByTime(10_000);
    expect(ran).toEqual(['scene']);
  });
  it('keeps the strongest deferred kind: changed, then scene and blockState during the run → one full reload afterwards', () => {
    const { state, ran, ask, s } = setup(true);
    ask('changed');
    vi.advanceTimersByTime(2000);
    ask('scene');
    vi.advanceTimersByTime(2000);
    ask('blockState', 120);
    vi.advanceTimersByTime(5000);
    expect(ran).toEqual([]);
    expect(s.pendingKind).toBe('changed');
    state.busy = false;
    vi.advanceTimersByTime(1000);
    expect(ran).toEqual(['changed']);
    vi.advanceTimersByTime(10_000);
    expect(ran).toEqual(['changed']);
  });
  it('a scene deferred first is upgraded by a changed that arrives later in the run', () => {
    const { state, ran, ask } = setup(true);
    ask('scene');
    vi.advanceTimersByTime(3000);
    ask('changed');
    state.busy = false;
    vi.advanceTimersByTime(1250);
    expect(ran).toEqual(['changed']);
  });
  it('a request that arrives right after the run starts its own settle window and runs once', () => {
    const { state, ran, ask } = setup(true);
    ask('scene');
    vi.advanceTimersByTime(1500);
    state.busy = false;
    ask('scene');
    vi.advanceTimersByTime(250);
    expect(ran).toEqual(['scene']);
    vi.advanceTimersByTime(5000);
    expect(ran).toEqual(['scene']);
  });
  it('cancel drops whatever is pending', () => {
    const { ran, ask, s } = setup();
    ask('changed');
    s.cancel();
    vi.advanceTimersByTime(5000);
    expect(ran).toEqual([]);
    expect(s.pendingKind).toBeNull();
  });
});
