import { describe, expect, it } from 'vitest';
import { LongPressMachine } from '../longPress';

describe('LongPressMachine', () => {
  it('arms on start and completes with the start position', () => {
    const m = new LongPressMachine(8);
    m.start(100, 200);
    expect(m.armed).toBe(true);
    expect(m.complete()).toEqual({ x: 100, y: 200 });
    expect(m.armed).toBe(false);
  });

  it('does not complete twice', () => {
    const m = new LongPressMachine();
    m.start(10, 10);
    expect(m.complete()).not.toBeNull();
    expect(m.complete()).toBeNull();
  });

  it('cancels the press once movement exceeds tolerance', () => {
    const m = new LongPressMachine(8);
    m.start(0, 0);
    expect(m.moved(5, 5)).toBe(false); // dist ~7.07 < 8
    expect(m.armed).toBe(true);
    expect(m.moved(10, 0)).toBe(true); // dist 10 > 8
    expect(m.armed).toBe(false);
    expect(m.complete()).toBeNull();
  });

  it('treats tolerance boundary as within range', () => {
    const m = new LongPressMachine(10);
    m.start(0, 0);
    expect(m.moved(10, 0)).toBe(false); // exactly at tolerance, not exceeding
    expect(m.armed).toBe(true);
  });

  it('cancel() disarms a pending press', () => {
    const m = new LongPressMachine();
    m.start(1, 1);
    m.cancel();
    expect(m.complete()).toBeNull();
  });

  it('ignores movement when not armed', () => {
    const m = new LongPressMachine();
    expect(m.moved(1000, 1000)).toBe(false);
  });
});
