import { describe, it, expect } from 'vitest';
import { edgeRegionAt, exceedsPinHold, PIN_EDGE_BAND, PIN_HOLD_MS, PIN_MOVE_CANCEL } from './pinDrag';

describe('pin hold', () => {
  it('keeps the previous timing and tolerance', () => {
    expect(PIN_HOLD_MS).toBe(380);
    expect(PIN_MOVE_CANCEL).toBe(6);
  });
  it('cancels only past the tolerance on either axis', () => {
    expect(exceedsPinHold(100, 100, 106, 100)).toBe(false);
    expect(exceedsPinHold(100, 100, 107, 100)).toBe(true);
    expect(exceedsPinHold(100, 100, 100, 93)).toBe(true);
    expect(exceedsPinHold(100, 100, 104, 104)).toBe(false);
  });
});

describe('edgeRegionAt', () => {
  const ws = { left: 0, top: 0, width: 1000, height: 500 };
  it('finds the dock edge in the outer band', () => {
    expect(edgeRegionAt(10, 250, ws)).toBe('left');
    expect(edgeRegionAt(990, 250, ws)).toBe('right');
    expect(edgeRegionAt(500, 10, ws)).toBe('top');
    expect(edgeRegionAt(500, 490, ws)).toBe('bottom');
  });
  it('is null in the middle and for an unmeasured workspace', () => {
    expect(edgeRegionAt(500, 250, ws)).toBeNull();
    expect(edgeRegionAt(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
  });
  it('prefers left/right in the corners', () => {
    expect(edgeRegionAt(10, 10, ws)).toBe('left');
    expect(edgeRegionAt(995, 495, ws)).toBe('right');
  });
  it('uses the 18 % band', () => {
    expect(PIN_EDGE_BAND).toBe(0.18);
    expect(edgeRegionAt(179, 250, ws)).toBe('left');
    expect(edgeRegionAt(181, 250, ws)).toBeNull();
  });
});
