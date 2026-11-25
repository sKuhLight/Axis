import { describe, expect, it } from 'vitest';
import { widgetGridPlacement } from '../widgetGridPlacement';

describe('widget grid placement', () => {
  it('keeps full-row dividers within the configured columns after resizing', () => {
    expect(widgetGridPlacement({ fullRow: true }, 2)).toBe('grid-column: 1 / -1');
    expect(widgetGridPlacement({ fullRow: true }, 8)).toBe('grid-column: 1 / -1');
  });
  it('clamps explicit positions and spans so persisted placements cannot create extra columns', () => {
    expect(widgetGridPlacement({ column: 8, colSpan: 6 }, 4)).toBe('grid-column: 4 / span 1');
    expect(widgetGridPlacement({ colSpan: 8 }, 4)).toBe('grid-column: span 4');
    expect(widgetGridPlacement({ x: 1, y: 2, w: 8, h: 2 }, 4)).toBe('grid-column: 2 / span 3; grid-row: 3 / span 2; align-self: stretch');
  });
  it('ignores invalid placement values', () => {
    expect(widgetGridPlacement(null, 4)).toBe('');
    expect(widgetGridPlacement({ column: NaN, colSpan: '6' }, 4)).toBe('');
  });
});
