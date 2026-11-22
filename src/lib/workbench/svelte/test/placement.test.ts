import { describe, expect, it } from 'vitest';
import type { DockDropGeometry } from '../dockDropTarget';
import {
  NAV_GAP_THICKNESS,
  PLACEMENT_ACTIVE_HINT,
  PLACEMENT_HINT,
  applyPlacementKey,
  describeSpot,
  navGapAt,
  navOrientation,
  navPlacementSpots,
  nextSpotIndex,
  panelPlacementSpots,
  placementActiveDescription,
  placementKeyAction,
  placementStatusText,
  rectCenter,
  spotDockTarget,
  spotIdForDockTarget,
  stepStackZone,
  widgetPlacementSpots,
  type PlacementSpot,
  type WorkbenchPlacementState
} from '../placement';

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });
/** Measured nav entries `n0, n1, …` from their rects. */
const navEntries = (...rects: ReturnType<typeof rect>[]) => rects.map((r, index) => ({ id: `n${index}`, rect: r }));

/** Workspace 1000×600: main stack (big), bottom stack (wide, short), empty left/right/top strips. */
function geometry(): DockDropGeometry {
  return {
    workspace: rect(0, 0, 1000, 600),
    stacks: [
      { stackId: 'bottom.s', activePanelId: 'editor', rect: rect(44, 460, 912, 140), region: 'bottom', collapsed: false, title: 'Editor' },
      { stackId: 'main.s', activePanelId: 'grid', rect: rect(44, 48, 912, 408), region: 'main', collapsed: false, title: 'Grid' }
    ],
    emptyRegions: [
      { region: 'left', rect: rect(0, 0, 44, 600) },
      { region: 'right', rect: rect(956, 0, 44, 600) },
      { region: 'top', rect: rect(44, 0, 912, 48) }
    ],
    pages: [],
    occupiedRegions: ['main', 'bottom'],
    regionRects: { main: rect(44, 48, 912, 408), bottom: rect(44, 460, 912, 140) },
    regionContentRects: { main: rect(44, 48, 912, 408), bottom: rect(44, 461, 912, 139) },
    zoom: 1
  };
}

const state = (spots: PlacementSpot[], extra: Partial<WorkbenchPlacementState> = {}): WorkbenchPlacementState => ({
  kind: 'panel',
  label: 'History',
  spots,
  activeSpotId: null,
  zone: 'center',
  insert: null,
  ...extra
});

describe('panelPlacementSpots', () => {
  it('lists stacks (main first), then the four edges; empty edges use their strip', () => {
    const spots = panelPlacementSpots(geometry());
    expect(spots.map((spot) => spot.id)).toEqual(['stack:main.s', 'stack:bottom.s', 'edge:left', 'edge:right', 'edge:top', 'edge:bottom']);
    expect(spots[0]).toMatchObject({ kind: 'stack', label: 'Grid', targetPanelId: 'grid', region: 'main', small: false });
    // The bottom stack is short (< 150px): "Add as tab" only.
    expect(spots[1].small).toBe(true);
    expect(spots.find((spot) => spot.id === 'edge:left')).toMatchObject({ empty: true, rect: rect(0, 0, 44, 600) });
    // The occupied bottom region's edge is its outer half.
    const bottom = spots.find((spot) => spot.id === 'edge:bottom')!;
    expect(bottom.empty).toBe(false);
    expect(bottom.rect.top).toBeGreaterThan(460);
  });

  it('adds an empty main region', () => {
    const g = geometry();
    g.stacks = [];
    g.occupiedRegions = [];
    g.emptyRegions.push({ region: 'main', rect: rect(44, 48, 912, 552) });
    const spots = panelPlacementSpots(g);
    expect(spots.at(-1)).toMatchObject({ id: 'edge:main', region: 'main', empty: true });
  });
});

describe('dock targets of spots', () => {
  const spots = panelPlacementSpots(geometry());
  it('a stack spot is its zone (centre by default), a small one always the tab', () => {
    expect(spotDockTarget(spots[0])).toEqual({ kind: 'zone', stackId: 'main.s', targetPanelId: 'grid', region: 'main', zone: 'center', small: false });
    expect(spotDockTarget(spots[0], 'right')).toMatchObject({ zone: 'right', small: false });
    expect(spotDockTarget(spots[1], 'right')).toMatchObject({ zone: 'center', small: true });
  });

  it('an edge spot is its edge target', () => {
    expect(spotDockTarget(spots[2])).toEqual({ kind: 'edge', region: 'left', empty: true });
    expect(spotDockTarget({ id: 'zone:x', kind: 'zone', rect: rect(0, 0, 1, 1), label: 'x' })).toBeNull();
  });

  it('maps a hovered target back to its spot', () => {
    expect(spotIdForDockTarget({ kind: 'zone', stackId: 'main.s', targetPanelId: 'grid', region: 'main', zone: 'left', small: false })).toBe('stack:main.s');
    expect(spotIdForDockTarget({ kind: 'tab', stackId: 'bottom.s', targetPanelId: 'editor', region: 'bottom', index: 0 })).toBe('stack:bottom.s');
    expect(spotIdForDockTarget({ kind: 'edge', region: 'top', empty: true })).toBe('edge:top');
    expect(spotIdForDockTarget(null)).toBeNull();
  });
});

describe('widget and navigation spots', () => {
  it('one widget spot per visible zone', () => {
    const spots = widgetPlacementSpots([
      { zone: 'top.left', rect: rect(0, 0, 200, 40), units: 2, label: 'Top left' },
      { zone: 'gone', rect: rect(0, 0, 0, 0), units: 0, label: 'Gone' }
    ]);
    expect(spots).toEqual([{ id: 'zone:top.left', kind: 'zone', rect: rect(0, 0, 200, 40), label: 'Top left', zone: 'top.left', units: 2 }]);
  });

  it('navigation gaps before every entry and after the last (vertical rail)', () => {
    const entries = navEntries(rect(8, 100, 40, 40), rect(8, 150, 40, 40));
    const spots = navPlacementSpots(entries, rect(0, 90, 58, 120), 'vertical');
    expect(spots.map((spot) => spot.gap)).toEqual([0, 1, 2]);
    expect(spots[1].rect.top + spots[1].rect.height / 2).toBe(145);
    expect(spots[1].rect.height).toBe(NAV_GAP_THICKNESS);
    expect(spots[2].label).toBe('End of navigation');
    expect(navPlacementSpots([], rect(0, 0, 10, 10), 'vertical')).toEqual([]);
  });

  it('each gap carries its neighbours by id (the order maps by id, not by on-screen index)', () => {
    const spots = navPlacementSpots(
      [
        { id: 'grid', rect: rect(8, 100, 40, 40) },
        { id: 'setup', rect: rect(8, 150, 40, 40) }
      ],
      rect(0, 90, 58, 120),
      'vertical'
    );
    expect(spots.map((spot) => [spot.navAfter, spot.navBefore])).toEqual([
      [undefined, 'grid'],
      ['grid', 'setup'],
      ['setup', undefined]
    ]);
  });

  it('the orientation follows the measured entries (a row runs sideways), else the container shape', () => {
    expect(navOrientation([rect(8, 100, 40, 40), rect(8, 150, 40, 40)], rect(0, 0, 58, 600))).toBe('vertical');
    // A phone side mode laid out as a row: horizontal, whatever the nav mode says.
    expect(navOrientation([rect(10, 700, 60, 40), rect(80, 700, 60, 40), rect(150, 702, 60, 40)], rect(0, 690, 400, 60))).toBe('horizontal');
    expect(navOrientation([rect(10, 700, 60, 40)], rect(0, 690, 400, 60))).toBe('horizontal');
    expect(navOrientation([rect(8, 100, 40, 40)], rect(0, 0, 58, 600))).toBe('vertical');
    expect(navOrientation([], rect(0, 0, 58, 600))).toBe('vertical');
  });

  it('horizontal navigation (bottom bar) gets vertical gap lines', () => {
    const spots = navPlacementSpots(navEntries(rect(100, 10, 40, 40), rect(150, 10, 40, 40)), rect(90, 0, 120, 60), 'horizontal');
    expect(spots[1].rect.left + spots[1].rect.width / 2).toBe(145);
    expect(spots[1].orientation).toBe('horizontal');
  });

  it('the gap nearest the pointer, only over the navigation', () => {
    const container = rect(0, 90, 58, 120);
    const spots = navPlacementSpots(navEntries(rect(8, 100, 40, 40), rect(8, 150, 40, 40)), container, 'vertical');
    expect(navGapAt(spots, container, { x: 20, y: 147 })?.gap).toBe(1);
    expect(navGapAt(spots, container, { x: 20, y: 95 })?.gap).toBe(0);
    expect(navGapAt(spots, container, { x: 20, y: 200 })?.gap).toBe(2);
    expect(navGapAt(spots, container, { x: 400, y: 147 })).toBeNull();
  });
});

describe('keyboard', () => {
  it('Tab walks the spots with wrap; Shift+Tab backwards; nothing focused starts at an end', () => {
    expect(nextSpotIndex(3, null, false)).toBe(0);
    expect(nextSpotIndex(3, null, true)).toBe(2);
    expect(nextSpotIndex(3, 2, false)).toBe(0);
    expect(nextSpotIndex(3, 0, true)).toBe(2);
    expect(nextSpotIndex(0, null, false)).toBeNull();
  });

  it('arrows walk the zone cross of a stack', () => {
    expect(stepStackZone('center', 'ArrowRight')).toBe('right');
    expect(stepStackZone('right', 'ArrowLeft')).toBe('center');
    expect(stepStackZone('right', 'ArrowRight')).toBe('right');
    expect(stepStackZone('right', 'ArrowUp')).toBe('top');
    expect(stepStackZone('bottom', 'ArrowUp')).toBe('center');
    expect(stepStackZone('left', 'Tab')).toBe('left');
  });

  it('Escape cancels; Enter focuses the first spot, then places', () => {
    const spots = panelPlacementSpots(geometry());
    const idle = state(spots);
    expect(placementKeyAction(idle, 'Escape', false)).toEqual({ type: 'cancel' });
    const focus = placementKeyAction(idle, 'Enter', false);
    expect(focus).toEqual({ type: 'focus', spotId: 'stack:main.s', zone: 'center', insert: null });
    const focused = applyPlacementKey(idle, focus);
    expect(placementKeyAction(focused, 'Enter', false)).toEqual({ type: 'commit' });
    expect(placementKeyAction(focused, ' ', false)).toEqual({ type: 'commit' });
    expect(placementKeyAction(focused, 'a', false)).toBeNull();
  });

  it('Tab moves between spots and resets the zone; arrows pick a zone on a big stack only', () => {
    const spots = panelPlacementSpots(geometry());
    let s = applyPlacementKey(state(spots), placementKeyAction(state(spots), 'Tab', false));
    expect(s.activeSpotId).toBe('stack:main.s');
    s = applyPlacementKey(s, placementKeyAction(s, 'ArrowRight', false));
    expect(s.zone).toBe('right');
    s = applyPlacementKey(s, placementKeyAction(s, 'Tab', false));
    expect(s).toMatchObject({ activeSpotId: 'stack:bottom.s', zone: 'center' });
    // Small stack: arrows are not ours.
    expect(placementKeyAction(s, 'ArrowRight', false)).toBeNull();
    s = applyPlacementKey(s, placementKeyAction(s, 'Tab', true));
    expect(s.activeSpotId).toBe('stack:main.s');
  });

  it('on a widget zone arrows move the insert position within 0..units', () => {
    const spots = widgetPlacementSpots([
      { zone: 'a', rect: rect(0, 0, 100, 40), units: 2, label: 'A' },
      { zone: 'b', rect: rect(0, 50, 100, 40), units: 0, label: 'B' }
    ]);
    let s = state(spots, { kind: 'widget' });
    s = applyPlacementKey(s, placementKeyAction(s, 'Tab', false));
    expect(s).toMatchObject({ activeSpotId: 'zone:a', insert: 2 });
    s = applyPlacementKey(s, placementKeyAction(s, 'ArrowLeft', false));
    s = applyPlacementKey(s, placementKeyAction(s, 'ArrowLeft', false));
    s = applyPlacementKey(s, placementKeyAction(s, 'ArrowLeft', false));
    expect(s.insert).toBe(0);
    s = applyPlacementKey(s, placementKeyAction(s, 'ArrowDown', false));
    expect(s.insert).toBe(1);
    s = applyPlacementKey(s, placementKeyAction(s, 'Tab', false));
    expect(s).toMatchObject({ activeSpotId: 'zone:b', insert: 0 });
  });

  it('on navigation gaps arrows step to the neighbouring gap', () => {
    const spots = navPlacementSpots(navEntries(rect(8, 100, 40, 40), rect(8, 150, 40, 40)), rect(0, 90, 58, 120), 'vertical');
    let s = state(spots, { kind: 'page' });
    s = applyPlacementKey(s, placementKeyAction(s, 'ArrowDown', false));
    expect(s.activeSpotId).toBe('nav:0');
    s = applyPlacementKey(s, placementKeyAction(s, 'ArrowDown', false));
    expect(s.activeSpotId).toBe('nav:1');
    s = applyPlacementKey(s, placementKeyAction(s, 'ArrowDown', false));
    s = applyPlacementKey(s, placementKeyAction(s, 'ArrowDown', false));
    expect(s.activeSpotId).toBe('nav:2');
    s = applyPlacementKey(s, placementKeyAction(s, 'ArrowUp', false));
    expect(s.activeSpotId).toBe('nav:1');
  });

  it('commit / cancel / null leave the state alone', () => {
    const s = state([]);
    expect(applyPlacementKey(s, { type: 'commit' })).toBe(s);
    expect(applyPlacementKey(s, null)).toBe(s);
    expect(placementKeyAction(s, 'Tab', false)).toBeNull();
  });
});

describe('labels', () => {
  it('the edit bar status line', () => {
    expect(placementStatusText('Preset Browser')).toBe(`Preset Browser · ${PLACEMENT_HINT}`);
    expect(PLACEMENT_HINT).toBe('Click a highlight to place · Esc cancels');
    // Once a spot is active the line says where it lands (the bar's role="status" announces it).
    expect(placementStatusText('History', 'Split right · Grid')).toBe(`History → Split right · Grid · ${PLACEMENT_ACTIVE_HINT}`);
    expect(placementStatusText('History', null)).toBe(`History · ${PLACEMENT_HINT}`);
  });

  it('the active spot in words: stack zone, edge, widget insert position, nav gap', () => {
    const spots = panelPlacementSpots(geometry());
    expect(placementActiveDescription(state(spots))).toBeNull();
    expect(placementActiveDescription(state(spots, { activeSpotId: 'stack:main.s', zone: 'right' }))).toBe('Split right · Grid');
    expect(placementActiveDescription(state(spots, { activeSpotId: 'edge:left' }))).toBe('Left edge');
    expect(placementActiveDescription(state(spots, { activeSpotId: 'gone' }))).toBeNull();
    const zones = widgetPlacementSpots([
      { zone: 'a', rect: rect(0, 0, 100, 40), units: 3, label: 'Top right' },
      { zone: 'b', rect: rect(0, 50, 100, 40), units: 0, label: 'Top center' }
    ]);
    const widget = (extra: Partial<WorkbenchPlacementState>) => state(zones, { kind: 'widget', ...extra });
    expect(placementActiveDescription(widget({ activeSpotId: 'zone:a', insert: 3 }))).toBe('Top right, at the end');
    expect(placementActiveDescription(widget({ activeSpotId: 'zone:a', insert: 0 }))).toBe('Top right, at the start');
    expect(placementActiveDescription(widget({ activeSpotId: 'zone:a', insert: 1 }))).toBe('Top right, position 2 of 4');
    // Pointer hover (no keyboard insert) and an empty zone: just the zone.
    expect(placementActiveDescription(widget({ activeSpotId: 'zone:a' }))).toBe('Top right');
    expect(placementActiveDescription(widget({ activeSpotId: 'zone:b', insert: 0 }))).toBe('Top center');
    const nav = navPlacementSpots(navEntries(rect(8, 100, 40, 40)), rect(0, 90, 58, 120), 'vertical');
    expect(placementActiveDescription(state(nav, { kind: 'page', activeSpotId: 'nav:1' }))).toBe('End of navigation');
  });

  it('describes the active spot', () => {
    const spots = panelPlacementSpots(geometry());
    expect(describeSpot(spots[0])).toBe('Add as tab · Grid');
    expect(describeSpot(spots[0], 'bottom')).toBe('Split bottom · Grid');
    expect(describeSpot(spots[1], 'left')).toBe('Add as tab · Editor');
    expect(describeSpot(spots[2])).toBe('Left edge');
    expect(rectCenter(rect(0, 0, 10, 20))).toEqual({ x: 5, y: 10 });
  });
});
