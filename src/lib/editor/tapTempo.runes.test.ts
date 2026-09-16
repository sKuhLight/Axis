import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TAP_TEMPO_TIMEOUT_MS, tapTempo } from './tapTempo.svelte';

describe('tapTempo session', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    tapTempo.end();
  });
  afterEach(() => {
    tapTempo.end();
    vi.useRealTimers();
  });

  it('opens on the first tap and dismisses after inactivity', () => {
    expect(tapTempo.active).toBe(false);
    tapTempo.tap();
    expect(tapTempo.active).toBe(true);
    vi.advanceTimersByTime(TAP_TEMPO_TIMEOUT_MS - 1);
    expect(tapTempo.active).toBe(true);
    vi.advanceTimersByTime(1);
    expect(tapTempo.active).toBe(false);
  });

  it('re-arms the inactivity timeout on every tap', () => {
    tapTempo.tap();
    vi.advanceTimersByTime(TAP_TEMPO_TIMEOUT_MS - 100);
    tapTempo.tap();
    vi.advanceTimersByTime(TAP_TEMPO_TIMEOUT_MS - 100);
    expect(tapTempo.active).toBe(true);
    vi.advanceTimersByTime(100);
    expect(tapTempo.active).toBe(false);
  });

  it('counts taps so the prompt can restart its drain animation', () => {
    expect(tapTempo.tapCount).toBe(0);
    tapTempo.tap();
    tapTempo.tap();
    expect(tapTempo.tapCount).toBe(2);
  });

  it('end() clears the pending timeout so it cannot fire later', () => {
    tapTempo.tap();
    tapTempo.end();
    expect(tapTempo.active).toBe(false);
    vi.advanceTimersByTime(TAP_TEMPO_TIMEOUT_MS);
    expect(tapTempo.active).toBe(false);
  });
});
