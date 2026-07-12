import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AXIS_FC_DEVICES,
  AXIS_HOLD_DELAY_MS,
  AXIS_HOLD_INTERVAL_MS,
  axisFcLayoutChipLabel,
  createAxisHoldRepeat,
  cycleAxisFcDevice,
  cycleAxisFcLayout,
  readAxisFcDevice
} from '../widgets/widgetControls';

describe('widgetControls FC helpers', () => {
  it('reads FC device defensively, defaulting to FM3', () => {
    expect(readAxisFcDevice('FC-6')).toBe('FC-6');
    expect(readAxisFcDevice('FC-12')).toBe('FC-12');
    expect(readAxisFcDevice('FM3')).toBe('FM3');
    expect(readAxisFcDevice('nonsense')).toBe('FM3');
    expect(readAxisFcDevice(undefined)).toBe('FM3');
    expect(readAxisFcDevice(42)).toBe('FM3');
  });

  it('cycles FC device through the roster and wraps', () => {
    expect(cycleAxisFcDevice('FM3')).toBe('FC-6');
    expect(cycleAxisFcDevice('FC-6')).toBe('FC-12');
    expect(cycleAxisFcDevice('FC-12')).toBe('FM3');
    // full loop returns to start
    let device = AXIS_FC_DEVICES[0];
    for (let i = 0; i < AXIS_FC_DEVICES.length; i += 1) device = cycleAxisFcDevice(device);
    expect(device).toBe(AXIS_FC_DEVICES[0]);
  });

  it('cycles FC layout with wrap and defensive bounds', () => {
    expect(cycleAxisFcLayout(0, 9)).toBe(1);
    expect(cycleAxisFcLayout(7, 9)).toBe(8);
    expect(cycleAxisFcLayout(8, 9)).toBe(0); // (fcLay+1)%9 wraps M -> layout 1
    // count coerced to at least 1 so a bad roster never divides by zero
    expect(cycleAxisFcLayout(0, 0)).toBe(0);
    expect(cycleAxisFcLayout(0, -3)).toBe(0);
    // negative / fractional layouts are floored & clamped
    expect(cycleAxisFcLayout(-2, 9)).toBe(1);
    expect(cycleAxisFcLayout(3.7, 9)).toBe(4);
  });

  it('labels layout chips 1…8 with M(aster) at index 8', () => {
    expect(axisFcLayoutChipLabel(0)).toBe('1');
    expect(axisFcLayoutChipLabel(7)).toBe('8');
    expect(axisFcLayoutChipLabel(8)).toBe('M');
  });
});

describe('createAxisHoldRepeat', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('arms after the delay then repeats at the interval', () => {
    const fn = vi.fn();
    const hold = createAxisHoldRepeat(fn);
    hold.start();
    // nothing fires before the arming delay elapses
    vi.advanceTimersByTime(AXIS_HOLD_DELAY_MS - 1);
    expect(fn).not.toHaveBeenCalled();
    // first repeat fires one interval after arming
    vi.advanceTimersByTime(1 + AXIS_HOLD_INTERVAL_MS);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(AXIS_HOLD_INTERVAL_MS * 3);
    expect(fn).toHaveBeenCalledTimes(4);
    hold.stop();
  });

  it('stop() cancels both the pending arm and the running repeat', () => {
    const fn = vi.fn();
    const hold = createAxisHoldRepeat(fn);
    hold.start();
    hold.stop(); // cancel before arming
    vi.advanceTimersByTime(AXIS_HOLD_DELAY_MS + AXIS_HOLD_INTERVAL_MS * 5);
    expect(fn).not.toHaveBeenCalled();

    hold.start();
    vi.advanceTimersByTime(AXIS_HOLD_DELAY_MS + AXIS_HOLD_INTERVAL_MS);
    expect(fn).toHaveBeenCalledTimes(1);
    hold.stop(); // cancel the running repeat
    vi.advanceTimersByTime(AXIS_HOLD_INTERVAL_MS * 5);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('ignores right-button (button === 2) presses', () => {
    const fn = vi.fn();
    const hold = createAxisHoldRepeat(fn);
    hold.start({ button: 2 });
    vi.advanceTimersByTime(AXIS_HOLD_DELAY_MS + AXIS_HOLD_INTERVAL_MS * 3);
    expect(fn).not.toHaveBeenCalled();
  });

  it('re-arming restarts the delay cleanly (no stale timers)', () => {
    const fn = vi.fn();
    const hold = createAxisHoldRepeat(fn);
    hold.start();
    vi.advanceTimersByTime(AXIS_HOLD_DELAY_MS - 5);
    hold.start(); // re-arm; the earlier delay must be discarded
    vi.advanceTimersByTime(5);
    expect(fn).not.toHaveBeenCalled(); // old delay would have fired here if not cleared
    vi.advanceTimersByTime(AXIS_HOLD_DELAY_MS - 5 + AXIS_HOLD_INTERVAL_MS);
    expect(fn).toHaveBeenCalledTimes(1);
    hold.stop();
  });
});
