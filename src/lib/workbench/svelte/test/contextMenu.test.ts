import { describe, expect, it } from 'vitest';
import { clampMenuPosition, effectiveZoom, resolveMenuPlacement } from '../contextMenu';

describe('context menu helpers', () => {
  it('keeps menus inside the viewport with a small margin', () => {
    expect(clampMenuPosition({ x: 390, y: 290 }, { width: 400, height: 300 }, { width: 120, height: 80 })).toEqual({
      x: 272,
      y: 212
    });
    expect(clampMenuPosition({ x: -20, y: -10 }, { width: 400, height: 300 }, { width: 120, height: 80 })).toEqual({
      x: 8,
      y: 8
    });
  });
});

describe('effectiveZoom', () => {
  it('is identity when visual and layout widths match (no CSS zoom)', () => {
    expect(effectiveZoom(1000, 1000)).toBe(1);
  });

  it('reports the ancestor CSS zoom factor from the visual/layout width ratio', () => {
    expect(effectiveZoom(900, 1000)).toBeCloseTo(0.9, 6); // scale 90%
    expect(effectiveZoom(1300, 1000)).toBeCloseTo(1.3, 6); // scale 130%
  });

  it('falls back to identity when a measurement is missing (SSR / detached)', () => {
    expect(effectiveZoom(0, 1000)).toBe(1);
    expect(effectiveZoom(900, 0)).toBe(1);
  });
});

describe('resolveMenuPlacement', () => {
  const viewport = { width: 1000, height: 800 };
  const menu = { width: 200, height: 120 };

  it('is a no-op division at 100% scale (matches clampMenuPosition)', () => {
    const clamped = clampMenuPosition({ x: 300, y: 200 }, viewport, menu);
    expect(resolveMenuPlacement({ x: 300, y: 200 }, viewport, menu, 1)).toEqual(clamped);
  });

  it('divides the clamped visual position by the effective zoom so a fixed menu in a zoomed subtree lands under the cursor', () => {
    // At scale 90% the pointer/viewport/menu-box are visual; the fixed menu
    // positions in layout space, so left/top must be pre-divided by 0.9.
    const zoom = 0.9;
    const clamped = clampMenuPosition({ x: 300, y: 200 }, viewport, menu);
    expect(resolveMenuPlacement({ x: 300, y: 200 }, viewport, menu, zoom)).toEqual({
      x: clamped.x / zoom,
      y: clamped.y / zoom
    });
  });

  it('clamps in visual space before de-zooming (visual viewport + visual menu box)', () => {
    // Position past the visual right/bottom edge is clamped to the visual margin,
    // then de-zoomed — the emitted layout coord is the clamped visual value / zoom.
    const zoom = 1.25;
    const result = resolveMenuPlacement({ x: 5000, y: 5000 }, viewport, menu, zoom);
    expect(result).toEqual({
      x: (viewport.width - menu.width - 8) / zoom,
      y: (viewport.height - menu.height - 8) / zoom
    });
  });

  it('guards a zero/negative zoom to identity', () => {
    const clamped = clampMenuPosition({ x: 300, y: 200 }, viewport, menu);
    expect(resolveMenuPlacement({ x: 300, y: 200 }, viewport, menu, 0)).toEqual(clamped);
  });
});
