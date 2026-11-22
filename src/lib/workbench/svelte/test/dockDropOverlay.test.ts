import { describe, expect, it } from 'vitest';
import {
  DOCK_CARD_HEIGHT,
  DOCK_CARD_WIDTH,
  buildDockDropOverlay,
  describeDockDropTarget,
  ghostPosition,
  inflateRect,
  landingLabelFor,
  rectMinus,
  rectsOverlap
} from '../dockDropOverlay';
import { dockDropTargetAt, type DockDropGeometry, type DockStackSlot } from '../dockDropTarget';
import type { WorkbenchRect } from '../drag';

const VIEWPORT = { width: 1440, height: 900 };
const WS = { left: 72, top: 100, width: 1368, height: 700 };
const GRID: DockStackSlot = {
  stackId: 'stack.main',
  activePanelId: 'grid',
  rect: { left: 116, top: 148, width: 1280, height: 604 },
  region: 'main',
  collapsed: false,
  headerRect: { left: 116, top: 148, width: 1280, height: 36 },
  tabRects: [{ left: 130, top: 152, width: 90, height: 28 }],
  title: 'Signal Grid'
};
const geometry = (extra: Partial<DockDropGeometry> = {}): DockDropGeometry => ({
  workspace: WS,
  stacks: [GRID],
  emptyRegions: [],
  pages: [{ pageId: 'page.scenes', rect: { left: 8, top: 300, width: 50, height: 46 }, isCurrent: false, label: 'Scenes' }],
  occupiedRegions: ['main'],
  ...extra
});

const inside = (inner: WorkbenchRect, outer: WorkbenchRect, tol = 0.5) =>
  inner.left >= outer.left - tol &&
  inner.top >= outer.top - tol &&
  inner.left + inner.width <= outer.left + outer.width + tol &&
  inner.top + inner.height <= outer.top + outer.height + tol;

function overlayAt(x: number, y: number, extra: Partial<DockDropGeometry> = {}) {
  const g = geometry(extra);
  const pointer = { x, y };
  const target = dockDropTargetAt(pointer, g, 'editor', { pages: true });
  return buildDockDropOverlay({ pointer, geometry: g, target, panelLabel: 'Block Editor', viewport: VIEWPORT });
}

describe('rectMinus', () => {
  const zone = { left: 0, top: 0, width: 100, height: 100 };

  it('returns the zone itself when disjoint', () => {
    expect(rectMinus(zone, { left: 200, top: 0, width: 10, height: 10 })).toBe(zone);
  });

  it('returns the largest free strip beside a partial cover', () => {
    expect(rectMinus(zone, { left: 60, top: -10, width: 100, height: 200 })).toEqual({ left: 0, top: 0, width: 60, height: 100 });
    expect(rectMinus(zone, { left: -10, top: -10, width: 200, height: 30 })).toEqual({ left: 0, top: 20, width: 100, height: 80 });
  });

  it('returns null when no strip of at least 24×20 remains', () => {
    expect(rectMinus(zone, { left: -5, top: -5, width: 110, height: 110 })).toBeNull();
    expect(rectMinus(zone, { left: 20, top: -5, width: 100, height: 110 })).toBeNull(); // 20px strip < 24
  });
});

describe('ghostPosition', () => {
  const size = { width: 248, height: 52 };

  it('goes below-right of the pointer by default', () => {
    expect(ghostPosition({ x: 400, y: 300 }, size, [], null, VIEWPORT)).toEqual({ left: 418, top: 322 });
  });

  it('flips when the default spot leaves the viewport', () => {
    expect(ghostPosition({ x: 1400, y: 880 }, size, [], null, VIEWPORT)).toEqual({ left: 1400 - 18 - 248, top: 880 - 22 - 52 });
  });

  it('never covers an avoided label', () => {
    const label = { left: 400, top: 300, width: 300, height: 60 };
    const spot = ghostPosition({ x: 400, y: 300 }, size, [label], label, VIEWPORT);
    expect(rectsOverlap({ ...spot, ...size }, label)).toBe(false);
  });

  it('clamps into the viewport when nothing fits', () => {
    const spot = ghostPosition({ x: 100, y: 30 }, size, [], null, { width: 200, height: 60 });
    expect(spot.left).toBeGreaterThanOrEqual(8);
    expect(spot.top).toBeGreaterThanOrEqual(8);
  });
});

describe('describeDockDropTarget / landingLabelFor', () => {
  const g = geometry();
  it('describes every kind', () => {
    expect(describeDockDropTarget(null, g)).toMatch(/cancel/i);
    expect(describeDockDropTarget({ kind: 'zone', stackId: 'stack.main', targetPanelId: 'grid', region: 'main', zone: 'right', small: false }, g)).toBe(
      'Split right of Signal Grid'
    );
    expect(describeDockDropTarget({ kind: 'zone', stackId: 'stack.main', targetPanelId: 'grid', region: 'main', zone: 'center', small: true }, g)).toBe(
      'Add as tab to Signal Grid'
    );
    expect(describeDockDropTarget({ kind: 'tab', stackId: 'stack.main', targetPanelId: 'grid', region: 'main', index: 0 }, g)).toBe('Add as tab to Signal Grid');
    expect(describeDockDropTarget({ kind: 'edge', region: 'left', empty: true }, g)).toBe('Dock left · new region');
    expect(describeDockDropTarget({ kind: 'edge', region: 'left', empty: false }, g)).toBe('Dock left · outer edge');
    expect(describeDockDropTarget({ kind: 'edge', region: 'main', empty: true }, g)).toBe('Place in the main region');
    expect(describeDockDropTarget({ kind: 'page', pageId: 'page.scenes', accepts: true }, g)).toBe('Move to page Scenes');
    expect(describeDockDropTarget({ kind: 'page', pageId: 'page.grid', accepts: false }, g)).toBe('Already on this page');
  });

  it('labels landings', () => {
    expect(landingLabelFor({ kind: 'edge', region: 'left', empty: true })).toEqual({ long: 'Dock left', short: 'Left', key: 'edge-left' });
    expect(landingLabelFor({ kind: 'tab', stackId: 's', targetPanelId: 'p', region: 'main', index: 0 }).long).toBe('Add as tab');
  });
});

describe('buildDockDropOverlay', () => {
  it('draws one landing shape with the four other zones clipped around it', () => {
    const model = overlayAt(1300, 450); // right zone of the grid
    expect(model.target).toMatchObject({ kind: 'zone', zone: 'right' });
    expect(model.landing?.key).toBe('right');
    expect(model.landing?.label).toBe('Split right');
    expect(model.landing?.sub).toBe('Block Editor');
    // The label chip is centred inside the landing shape.
    const land = model.landing!.rect;
    const label = model.landing!.labelRect;
    expect(inside(label, land)).toBe(true);
    expect(label.left + label.width / 2).toBeCloseTo(land.left + land.width / 2, 5);
    expect(label.top + label.height / 2).toBeCloseTo(land.top + land.height / 2, 5);
    // 4 inactive zones, none under the landing shape.
    expect(model.zones.map((zone) => zone.id).sort()).toEqual(['bottom', 'center', 'left', 'top']);
    for (const zone of model.zones) expect(rectsOverlap(zone.rect, land)).toBe(false);
    // Inactive labels sit inside their own clipped box, never on the landing shape.
    for (const zl of model.zoneLabels.filter((entry) => !entry.over)) {
      expect(rectsOverlap(zl.rect, land)).toBe(false);
      expect(inside(zl.rect, model.zones.find((zone) => zone.id === zl.id)!.rect)).toBe(true);
    }
    expect(model.zoneLabels.length + 1).toBe(5);
  });

  it('keeps the pointer card clear of every label, off the pointer and inside the viewport', () => {
    for (const [x, y] of [
      [1300, 450],
      [200, 450],
      [700, 220],
      [700, 700],
      [700, 450]
    ]) {
      const model = overlayAt(x, y);
      const card = model.card.rect;
      expect(card.width).toBe(DOCK_CARD_WIDTH);
      expect(card.height).toBe(DOCK_CARD_HEIGHT);
      expect(rectsOverlap(card, model.landing!.labelRect)).toBe(false);
      for (const zl of model.zoneLabels) expect(rectsOverlap(card, zl.rect)).toBe(false);
      expect(x >= card.left && x <= card.left + card.width && y >= card.top && y <= card.top + card.height).toBe(false);
      expect(card.left).toBeGreaterThanOrEqual(0);
      expect(card.top + card.height).toBeLessThanOrEqual(VIEWPORT.height);
    }
  });

  it('shows four edge bars; an active edge replaces its bar with the landing shape', () => {
    expect(overlayAt(700, 450).edgeBars.map((bar) => bar.id)).toEqual(['left', 'right', 'top', 'bottom']);
    const edge = overlayAt(WS.left + 10, 450);
    expect(edge.target).toMatchObject({ kind: 'edge', region: 'left' });
    expect(edge.edgeBars.map((bar) => bar.id)).toEqual(['right', 'top', 'bottom']);
    expect(edge.landing).toMatchObject({ key: 'edge-left', label: 'Dock left' });
    expect(edge.zones).toEqual([]);
    expect(edge.edgeBars[0].rect).toEqual({ left: WS.left + WS.width - 12, top: WS.top + 22, width: 8, height: WS.height - 44 });
  });

  it('shows only the landing shape on a small stack', () => {
    const small: DockStackSlot = { ...GRID, rect: { left: 116, top: 600, width: 1280, height: 140 }, headerRect: null };
    const model = overlayAt(700, 650, { stacks: [small] });
    expect(model.target).toMatchObject({ kind: 'zone', zone: 'center', small: true });
    expect(model.zones).toEqual([]);
    expect(model.zoneLabels).toEqual([]);
    expect(model.landing?.label).toBe('Add as tab');
  });

  it('falls back to the short label without the panel name in a tight landing', () => {
    const narrow: DockStackSlot = { ...GRID, rect: { left: 116, top: 148, width: 210, height: 604 }, headerRect: null };
    const model = overlayAt(310, 450, { stacks: [narrow] });
    expect(model.target).toMatchObject({ kind: 'zone', zone: 'right' });
    // half of 210 → 103px wide: "Split right" (11*7.9+26 ≈ 113) does not fit → "Right", no sub.
    expect(model.landing).toMatchObject({ label: 'Right', sub: '' });
  });

  it('highlights a page target and flags a refused one', () => {
    const ok = overlayAt(30, 320);
    expect(ok.page).toEqual({ pageId: 'page.scenes', rect: { left: 8, top: 300, width: 50, height: 46 }, accepts: true });
    expect(ok.edgeBars).toEqual([]);
    expect(ok.landing).toBeNull();
    expect(ok.invalid).toBe(false);
    expect(ok.card.hint).toBe('Move to page Scenes');
    const refused = overlayAt(30, 320, {
      pages: [{ pageId: 'page.grid', rect: { left: 8, top: 300, width: 50, height: 46 }, isCurrent: true, label: 'Grid' }]
    });
    expect(refused.page?.accepts).toBe(false);
    expect(refused.invalid).toBe(true);
    expect(refused.card.hint).toBe('Already on this page');
  });

  it('is invalid with a cancel hint over no target', () => {
    const model = overlayAt(700, 40);
    expect(model.target).toBeNull();
    expect(model.landing).toBeNull();
    expect(model.invalid).toBe(true);
    expect(model.card.hint).toMatch(/cancel/i);
  });

  it('draws a caret at the tab insertion index', () => {
    const model = overlayAt(700, 160);
    expect(model.target).toMatchObject({ kind: 'tab', index: 1 });
    expect(model.caret).toEqual({ left: 130 + 90 + 1, top: 154, width: 2, height: 24 });
  });

  it('scales CSS-px sizes by the zoom', () => {
    const model = overlayAt(700, 450, { zoom: 2 });
    expect(model.card.rect.width).toBe(DOCK_CARD_WIDTH * 2);
    expect(model.edgeBars[0].rect.width).toBe(16);
  });

  it('inflateRect grows every side', () => {
    expect(inflateRect({ left: 10, top: 10, width: 10, height: 10 }, 2)).toEqual({ left: 8, top: 8, width: 14, height: 14 });
  });
});
