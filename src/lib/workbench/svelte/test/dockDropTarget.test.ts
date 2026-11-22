import { describe, expect, it } from 'vitest';
import {
  createEmptyDockLayout,
  createEmptyWorkbenchDocument,
  reduceWorkbenchDocument,
  selectActiveDock,
  type DockLayout,
  type DockNode,
  type SplitDockNode,
  type TabStackDockNode,
  type WorkbenchDocument
} from '../../core';
import {
  DEFAULT_BAND_REGION_PX,
  DEFAULT_SIDE_REGION_PX,
  EDGE_STRIP,
  completeDockDropGeometry,
  dockDropCommand,
  dockDropTargetAt,
  dockTargetFor,
  isSmallStack,
  landingRect,
  regionBandRect,
  splitHalf,
  topmostStackAt,
  zoneAt,
  zoneRects,
  type DockDropGeometry,
  type DockDropTarget,
  type DockStackSlot
} from '../dockDropTarget';

const WS = { left: 100, top: 50, width: 1200, height: 800 };
const GRID: DockStackSlot = {
  stackId: 'stack.main',
  activePanelId: 'grid',
  rect: { left: 200, top: 100, width: 808, height: 608 },
  region: 'main',
  collapsed: false,
  headerRect: { left: 200, top: 100, width: 808, height: 36 },
  tabRects: [
    { left: 210, top: 104, width: 90, height: 28 },
    { left: 304, top: 104, width: 90, height: 28 }
  ],
  title: 'Signal Grid'
};

function geometry(extra: Partial<DockDropGeometry> = {}): DockDropGeometry {
  return {
    workspace: WS,
    stacks: [GRID],
    emptyRegions: [],
    pages: [],
    occupiedRegions: ['main'],
    regionRects: {},
    regionContentRects: {},
    regionSizes: {},
    ...extra
  };
}

const at = (x: number, y: number, g: DockDropGeometry = geometry(), pages = true) => dockDropTargetAt({ x, y }, g, 'dragged', { pages });

describe('zoneRects', () => {
  it('insets 8px, takes 25% bands and leaves 6px gaps', () => {
    expect(zoneRects(GRID.rect)).toEqual({
      top: { left: 208, top: 108, width: 792, height: 148 },
      bottom: { left: 208, top: 552, width: 792, height: 148 },
      left: { left: 208, top: 262, width: 198, height: 284 },
      right: { left: 802, top: 262, width: 198, height: 284 },
      center: { left: 412, top: 262, width: 384, height: 284 }
    });
  });

  it('never yields negative sizes for tiny rects', () => {
    const z = zoneRects({ left: 0, top: 0, width: 10, height: 10 });
    for (const rect of Object.values(z)) {
      expect(rect.width).toBeGreaterThanOrEqual(0);
      expect(rect.height).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('zoneAt', () => {
  it.each([
    ['top', 600, 150],
    ['bottom', 600, 600],
    ['left', 300, 400],
    ['right', 900, 400],
    ['center', 600, 400]
  ] as const)('resolves %s', (zone, x, y) => {
    expect(zoneAt(GRID.rect, { x, y })).toBe(zone);
  });

  it('counts the inset rim as the nearest band', () => {
    expect(zoneAt(GRID.rect, { x: 203, y: 400 })).toBe('left');
    expect(zoneAt(GRID.rect, { x: 1005, y: 400 })).toBe('right');
    expect(zoneAt(GRID.rect, { x: 600, y: 103 })).toBe('top');
    expect(zoneAt(GRID.rect, { x: 600, y: 705 })).toBe('bottom');
  });

  it('treats the gap under the top band as centre and the gap beside the centre as its side', () => {
    expect(zoneAt(GRID.rect, { x: 600, y: 259 })).toBe('center');
    expect(zoneAt(GRID.rect, { x: 409, y: 400 })).toBe('left');
    expect(zoneAt(GRID.rect, { x: 799, y: 400 })).toBe('right');
  });
});

describe('dockDropTargetAt', () => {
  it('resolves every zone of a stack', () => {
    expect(at(600, 400)).toEqual({ kind: 'zone', stackId: 'stack.main', targetPanelId: 'grid', region: 'main', zone: 'center', small: false });
    expect(at(300, 400)).toMatchObject({ kind: 'zone', zone: 'left' });
    expect(at(900, 400)).toMatchObject({ kind: 'zone', zone: 'right' });
    expect(at(600, 200)).toMatchObject({ kind: 'zone', zone: 'top' });
    expect(at(600, 650)).toMatchObject({ kind: 'zone', zone: 'bottom' });
  });

  it('inserts a tab at the pill index when over the tab bar', () => {
    expect(at(250, 115)).toEqual({ kind: 'tab', stackId: 'stack.main', targetPanelId: 'grid', region: 'main', index: 0 });
    expect(at(320, 115)).toMatchObject({ kind: 'tab', index: 1 });
    expect(at(700, 115)).toMatchObject({ kind: 'tab', index: 2 });
  });

  it('offers only "Add as tab" on small or collapsed stacks', () => {
    const narrow: DockStackSlot = { ...GRID, rect: { left: 200, top: 100, width: 199, height: 608 }, headerRect: null };
    const short: DockStackSlot = { ...GRID, rect: { left: 200, top: 100, width: 808, height: 149 }, headerRect: null };
    const collapsed: DockStackSlot = { ...GRID, collapsed: true };
    expect(at(210, 400, geometry({ stacks: [narrow] }))).toMatchObject({ kind: 'zone', zone: 'center', small: true });
    expect(at(210, 240, geometry({ stacks: [short] }))).toMatchObject({ kind: 'zone', zone: 'center', small: true });
    // A collapsed strip has no tab bar: even its top edge is "Add as tab".
    expect(at(600, 110, geometry({ stacks: [collapsed] }))).toMatchObject({ kind: 'zone', zone: 'center', small: true });
    expect(isSmallStack({ rect: { left: 0, top: 0, width: 200, height: 150 }, collapsed: false })).toBe(false);
  });

  it('gives the 24px edge strips priority over stacks, in left/right/top/bottom order', () => {
    const fill: DockStackSlot = { ...GRID, rect: { ...WS }, headerRect: null };
    const g = geometry({ stacks: [fill] });
    expect(at(WS.left + EDGE_STRIP - 1, 400, g)).toEqual({ kind: 'edge', region: 'left', empty: true });
    expect(at(WS.left + WS.width - EDGE_STRIP + 1, 400, g)).toEqual({ kind: 'edge', region: 'right', empty: true });
    expect(at(600, WS.top + 10, g)).toEqual({ kind: 'edge', region: 'top', empty: true });
    expect(at(600, WS.top + WS.height - 10, g)).toEqual({ kind: 'edge', region: 'bottom', empty: true });
    // corner: left wins over top
    expect(at(WS.left + 5, WS.top + 5, g)).toMatchObject({ kind: 'edge', region: 'left' });
    expect(at(WS.left + EDGE_STRIP + 1, 400, g)).toMatchObject({ kind: 'zone' });
  });

  it('marks an edge of an occupied region as not empty', () => {
    const g = geometry({ occupiedRegions: ['main', 'left'] });
    expect(at(110, 400, g)).toEqual({ kind: 'edge', region: 'left', empty: false });
  });

  it('falls back to stack membership when occupiedRegions is absent', () => {
    const g = geometry({ occupiedRegions: undefined });
    expect(at(110, 400, g)).toEqual({ kind: 'edge', region: 'left', empty: true });
  });

  it('makes empty region strips edge targets', () => {
    const g = geometry({ emptyRegions: [{ region: 'top', rect: { left: 144, top: 50, width: 1112, height: 48 } }] });
    expect(at(600, 90, g)).toEqual({ kind: 'edge', region: 'top', empty: true });
  });

  it('hits nav pages first and refuses the current page', () => {
    const pages = [
      { pageId: 'page.grid', rect: { left: 0, top: 100, width: 50, height: 40 }, isCurrent: true, label: 'Grid' },
      { pageId: 'page.scenes', rect: { left: 580, top: 380, width: 60, height: 40 }, isCurrent: false, label: 'Scenes' }
    ];
    const g = geometry({ pages });
    expect(at(20, 120, g)).toEqual({ kind: 'page', pageId: 'page.grid', accepts: false });
    // A page rect overlapping a stack still wins (priority).
    expect(at(600, 400, g)).toEqual({ kind: 'page', pageId: 'page.scenes', accepts: true });
    // Pages disabled (library drag-out): the stack zone resolves instead.
    expect(at(600, 400, g, false)).toMatchObject({ kind: 'zone', zone: 'center' });
  });

  it('returns null outside the workspace and outside every target', () => {
    expect(at(10, 10)).toBeNull();
    expect(at(1100, 400)).toBeNull(); // inside the workspace, but no stack / empty region there
  });

  it('skips a stack still showing the dragged panel', () => {
    const own: DockStackSlot = { ...GRID, activePanelId: 'dragged' };
    expect(at(600, 400, geometry({ stacks: [own] }))).toBeNull();
  });
});

describe('dockDropCommand / dockTargetFor', () => {
  const zone = (z: 'top' | 'left' | 'center' | 'right' | 'bottom'): DockDropTarget => ({
    kind: 'zone',
    stackId: 'stack.main',
    targetPanelId: 'grid',
    region: 'main',
    zone: z,
    small: false
  });

  it('maps zones to splits beside the target panel, centre to a tab', () => {
    expect(dockDropCommand('p', zone('left'))).toEqual({
      type: 'panel.move',
      panelId: 'p',
      to: { kind: 'split', targetPanelId: 'grid', axis: 'horizontal', position: 'before' }
    });
    expect(dockTargetFor(zone('right'))).toEqual({ kind: 'split', targetPanelId: 'grid', axis: 'horizontal', position: 'after' });
    expect(dockTargetFor(zone('top'))).toEqual({ kind: 'split', targetPanelId: 'grid', axis: 'vertical', position: 'before' });
    expect(dockTargetFor(zone('bottom'))).toEqual({ kind: 'split', targetPanelId: 'grid', axis: 'vertical', position: 'after' });
    expect(dockDropCommand('p', zone('center'))).toEqual({ type: 'panel.move', panelId: 'p', to: { kind: 'tab', tabStackId: 'stack.main' } });
  });

  it('keeps the precise tab index', () => {
    expect(dockDropCommand('p', { kind: 'tab', stackId: 's', targetPanelId: 'grid', region: 'main', index: 1 })).toEqual({
      type: 'panel.move',
      panelId: 'p',
      to: { kind: 'tab', tabStackId: 's', index: 1 }
    });
  });

  it('docks into an empty region, and splits an occupied one at its outer side', () => {
    expect(dockTargetFor({ kind: 'edge', region: 'left', empty: true })).toEqual({ kind: 'region', region: 'left' });
    expect(dockTargetFor({ kind: 'edge', region: 'left', empty: false })).toEqual({ kind: 'split', region: 'left', axis: 'horizontal', position: 'before' });
    expect(dockTargetFor({ kind: 'edge', region: 'right', empty: false })).toEqual({ kind: 'split', region: 'right', axis: 'horizontal', position: 'after' });
    expect(dockTargetFor({ kind: 'edge', region: 'top', empty: false })).toEqual({ kind: 'split', region: 'top', axis: 'vertical', position: 'before' });
    expect(dockTargetFor({ kind: 'edge', region: 'bottom', empty: false })).toEqual({ kind: 'split', region: 'bottom', axis: 'vertical', position: 'after' });
    expect(dockTargetFor({ kind: 'edge', region: 'main', empty: false })).toEqual({ kind: 'region', region: 'main' });
  });

  it('moves to another page main, and refuses the current page', () => {
    expect(dockDropCommand('p', { kind: 'page', pageId: 'page.scenes', accepts: true })).toEqual({
      type: 'panel.move',
      panelId: 'p',
      to: { kind: 'region', region: 'main' },
      pageId: 'page.scenes'
    });
    expect(dockDropCommand('p', { kind: 'page', pageId: 'page.grid', accepts: false })).toBeNull();
    expect(dockTargetFor({ kind: 'page', pageId: 'x', accepts: true })).toBeNull();
  });

  it('produces commands the reducer applies as the landing rect promises', () => {
    let doc: WorkbenchDocument = createEmptyWorkbenchDocument({ profileId: 'profile.t', layoutId: 'layout.t' });
    doc = reduceWorkbenchDocument(doc, { type: 'panel.add', panel: { id: 'grid', type: 't', title: 'Grid' }, region: 'main' }).next;
    doc = reduceWorkbenchDocument(doc, { type: 'panel.add', panel: { id: 'p', type: 't', title: 'P' }, region: 'bottom' }).next;
    const result = reduceWorkbenchDocument(doc, dockDropCommand('p', zone('right'))!);
    expect(result.success).toBe(true);
    const main = selectActiveDock(result.next)!.root.main as SplitDockNode;
    expect(main.axis).toBe('horizontal');
    expect(main.ratio).toEqual([0.5, 0.5]); // the 50/50 split landingRect halves
    expect((main.children[0] as TabStackDockNode).panelIds).toEqual(['grid']);
    expect((main.children[1] as TabStackDockNode).panelIds).toEqual(['p']);
  });
});

describe('landingRect', () => {
  const zone = (z: 'top' | 'left' | 'center' | 'right' | 'bottom', slot = GRID): Extract<DockDropTarget, { kind: 'zone' }> => ({
    kind: 'zone',
    stackId: slot.stackId,
    targetPanelId: slot.activePanelId,
    region: slot.region,
    zone: z,
    small: false
  });

  it('is the matching half of the target stack for a split (4px handle between)', () => {
    const g = geometry();
    expect(landingRect(zone('left'), g)).toEqual({ left: 200, top: 100, width: 402, height: 608 });
    expect(landingRect(zone('right'), g)).toEqual({ left: 606, top: 100, width: 402, height: 608 });
    expect(landingRect(zone('top'), g)).toEqual({ left: 200, top: 100, width: 808, height: 302 });
    expect(landingRect(zone('bottom'), g)).toEqual({ left: 200, top: 406, width: 808, height: 302 });
  });

  it('is the whole stack for a tab (centre or tab bar)', () => {
    const g = geometry();
    expect(landingRect(zone('center'), g)).toEqual(GRID.rect);
    expect(landingRect({ kind: 'tab', stackId: 'stack.main', targetPanelId: 'grid', region: 'main', index: 0 }, g)).toEqual(GRID.rect);
  });

  it('uses the expanded rect of a collapsed stack (the drop expands it)', () => {
    const strip: DockStackSlot = { ...GRID, collapsed: true, rect: { left: 200, top: 672, width: 808, height: 36 }, expandedRect: { left: 200, top: 400, width: 808, height: 308 } };
    const g = geometry({ stacks: [strip] });
    expect(landingRect({ ...zone('center', strip), small: true }, g)).toEqual({ left: 200, top: 400, width: 808, height: 308 });
    const noExpanded: DockStackSlot = { ...strip, expandedRect: undefined };
    expect(landingRect({ ...zone('center', noExpanded), small: true }, geometry({ stacks: [noExpanded] }))).toEqual(noExpanded.rect);
  });

  it('is the resulting band for an empty side region (default size, inner border off)', () => {
    const g = geometry();
    expect(landingRect({ kind: 'edge', region: 'left', empty: true }, g)).toEqual({ left: 100, top: 50, width: DEFAULT_SIDE_REGION_PX - 1, height: 800 });
    expect(landingRect({ kind: 'edge', region: 'right', empty: true }, g)).toEqual({ left: 981, top: 50, width: 319, height: 800 });
  });

  it('honours a stored region size and the zoom factor', () => {
    expect(regionBandRect('left', geometry({ regionSizes: { left: 280 } }))).toEqual({ left: 100, top: 50, width: 279, height: 800 });
    expect(regionBandRect('left', geometry({ zoom: 2 }))).toEqual({ left: 100, top: 50, width: 638, height: 800 });
  });

  it('spans the centre column between the current left and right regions for top/bottom', () => {
    const g = geometry({
      regionRects: { left: { left: 100, top: 50, width: 44, height: 800 }, right: { left: 1256, top: 50, width: 44, height: 800 } }
    });
    expect(landingRect({ kind: 'edge', region: 'top', empty: true }, g)).toEqual({ left: 144, top: 50, width: 1112, height: DEFAULT_BAND_REGION_PX - 1 });
    expect(landingRect({ kind: 'edge', region: 'bottom', empty: true }, g)).toEqual({ left: 144, top: 611, width: 1112, height: 239 });
    // No side regions rendered: the band spans the whole workspace width.
    expect(regionBandRect('top', geometry())).toEqual({ left: 100, top: 50, width: 1200, height: 239 });
  });

  it('keeps the rendered rect for an empty main region', () => {
    const main = { left: 144, top: 98, width: 1112, height: 704 };
    expect(landingRect({ kind: 'edge', region: 'main', empty: true }, geometry({ emptyRegions: [{ region: 'main', rect: main }] }))).toEqual(main);
  });

  it('is the outer half of an occupied region for an edge drop', () => {
    const g = geometry({
      regionContentRects: {
        right: { left: 980, top: 50, width: 320, height: 800 },
        left: { left: 100, top: 50, width: 319, height: 800 },
        top: { left: 144, top: 50, width: 1112, height: 239 },
        bottom: { left: 144, top: 611, width: 1112, height: 240 }
      }
    });
    expect(landingRect({ kind: 'edge', region: 'right', empty: false }, g)).toEqual({ left: 1142, top: 50, width: 158, height: 800 });
    expect(landingRect({ kind: 'edge', region: 'left', empty: false }, g)).toEqual({ left: 100, top: 50, width: 157.5, height: 800 });
    expect(landingRect({ kind: 'edge', region: 'top', empty: false }, g)).toEqual({ left: 144, top: 50, width: 1112, height: 117.5 });
    expect(landingRect({ kind: 'edge', region: 'bottom', empty: false }, g)).toEqual({ left: 144, top: 733, width: 1112, height: 118 });
  });

  it('leaves a fully collapsed region root its strip and gives the new stack the rest', () => {
    const g = geometry({
      regionContentRects: { right: { left: 981, top: 50, width: 319, height: 800 }, top: { left: 144, top: 50, width: 1112, height: 239 } },
      regionCollapsedExtents: { right: 36, top: 36 }
    });
    expect(landingRect({ kind: 'edge', region: 'right', empty: false }, g)).toEqual({ left: 1021, top: 50, width: 279, height: 800 });
    expect(landingRect({ kind: 'edge', region: 'top', empty: false }, g)).toEqual({ left: 144, top: 50, width: 1112, height: 199 });
  });

  it('is null for pages, no target, unknown stacks and unmeasured regions', () => {
    const g = geometry();
    expect(landingRect({ kind: 'page', pageId: 'x', accepts: true }, g)).toBeNull();
    expect(landingRect(null, g)).toBeNull();
    expect(landingRect({ ...zone('center'), stackId: 'nope' }, g)).toBeNull();
    expect(landingRect({ kind: 'edge', region: 'left', empty: false }, g)).toBeNull();
  });

  it('splitHalf never goes negative', () => {
    expect(splitHalf({ left: 0, top: 0, width: 2, height: 2 }, 'horizontal', 'after')).toEqual({ left: 4, top: 0, width: 0, height: 2 });
  });
});

describe('tab bars at the workspace edges beat the edge strips', () => {
  // A right-region stack whose 36px header sits at the very top of the workspace,
  // and a left-region stack flush with the workspace's left edge.
  const RIGHT: DockStackSlot = {
    stackId: 'stack.right',
    activePanelId: 'editor',
    rect: { left: WS.left + WS.width - 319, top: WS.top, width: 319, height: 800 },
    region: 'right',
    collapsed: false,
    headerRect: { left: WS.left + WS.width - 319, top: WS.top, width: 319, height: 36 },
    tabRects: [{ left: WS.left + WS.width - 310, top: WS.top + 4, width: 90, height: 28 }],
    title: 'Block Editor'
  };
  const LEFT: DockStackSlot = {
    stackId: 'stack.left',
    activePanelId: 'history',
    rect: { left: WS.left, top: WS.top, width: 319, height: 800 },
    region: 'left',
    collapsed: false,
    headerRect: { left: WS.left, top: WS.top, width: 319, height: 36 },
    tabRects: [{ left: WS.left + 9, top: WS.top + 4, width: 90, height: 28 }],
    title: 'History'
  };
  const g = () => geometry({ stacks: [RIGHT, LEFT], occupiedRegions: ['main', 'left', 'right'] });

  it('a pill inside the top strip inserts a tab, not "Dock top"', () => {
    const pill = RIGHT.tabRects![0];
    expect(at(pill.left + 10, pill.top + 10, g())).toEqual({ kind: 'tab', stackId: 'stack.right', targetPanelId: 'editor', region: 'right', index: 0 });
    expect(at(pill.left + 80, WS.top + 2, g())).toMatchObject({ kind: 'tab', index: 1 });
  });

  it('the header of a stack at the left edge beats the left strip too', () => {
    expect(at(WS.left + 3, WS.top + 10, g())).toMatchObject({ kind: 'tab', stackId: 'stack.left' });
  });

  it('below the header the edge strips still win', () => {
    expect(at(WS.left + 3, WS.top + 300, g())).toEqual({ kind: 'edge', region: 'left', empty: false });
    expect(at(WS.left + WS.width - 3, WS.top + 300, g())).toEqual({ kind: 'edge', region: 'right', empty: false });
  });

  it('nav pages still come first', () => {
    const pages = [{ pageId: 'page.x', rect: { ...RIGHT.headerRect! }, isCurrent: false }];
    expect(at(RIGHT.headerRect!.left + 50, WS.top + 10, geometry({ stacks: [RIGHT], pages }))).toMatchObject({ kind: 'page' });
  });
});

describe('topmostStackAt (stacking)', () => {
  const inline: DockStackSlot = { ...GRID, stackId: 'inline', layer: 0 };
  const drawer: DockStackSlot = { ...GRID, stackId: 'drawer', activePanelId: 'editor', layer: 1 };

  it('prefers the highest layer where stacks overlap, regardless of order', () => {
    expect(topmostStackAt([inline, drawer], { x: 600, y: 400 })?.stackId).toBe('drawer');
    expect(topmostStackAt([drawer, inline], { x: 600, y: 400 })?.stackId).toBe('drawer');
    expect(at(600, 400, geometry({ stacks: [inline, drawer] }))).toMatchObject({ kind: 'zone', stackId: 'drawer' });
  });

  it('keeps the first of equal layers and skips the dragged panel', () => {
    const twin: DockStackSlot = { ...GRID, stackId: 'twin' };
    expect(topmostStackAt([GRID, twin], { x: 600, y: 400 })?.stackId).toBe('stack.main');
    expect(topmostStackAt([GRID], { x: 600, y: 400 }, 'grid')).toBeUndefined();
  });
});

describe('user-collapsed regions', () => {
  it('their strip is an edge target for that region', () => {
    const g = geometry({ occupiedRegions: ['main', 'left'], collapsedRegions: [{ region: 'left', rect: { left: 100, top: 50, width: 32, height: 32 } }] });
    // inside the 32×32 strip but past both 24px edge strips
    expect(at(128, 78, g)).toEqual({ kind: 'edge', region: 'left', empty: false });
  });
});

describe('completeDockDropGeometry', () => {
  const tabsNode = (id: string, panelIds: string[]): TabStackDockNode => ({ kind: 'tabs', id, panelIds, activePanelId: panelIds[0] });
  function dockOf(roots: Partial<Record<'left' | 'right' | 'top' | 'bottom' | 'main', DockNode>>, regions: Partial<Record<string, { collapsed?: boolean; sizePx?: number }>> = {}): DockLayout {
    const dock = createEmptyDockLayout();
    for (const [region, node] of Object.entries(roots)) dock.root[region as 'main'] = node!;
    for (const [region, state] of Object.entries(regions)) Object.assign(dock.regions[region as 'main'], state);
    return dock;
  }
  const measured = (extra: Partial<DockDropGeometry> = {}): DockDropGeometry => ({
    workspace: WS,
    stacks: [],
    emptyRegions: [],
    pages: [],
    regionRects: { left: { left: 100, top: 50, width: 32, height: 32 }, right: { left: 1256, top: 50, width: 44, height: 800 } },
    regionContentRects: {},
    ...extra
  });

  it('derives occupied regions and stored sizes from the model', () => {
    const g = completeDockDropGeometry({ dock: dockOf({ main: tabsNode('m', ['grid']) }, { left: { sizePx: 280 } }), panels: {}, measured: measured() });
    expect(g.occupiedRegions).toEqual(['main']);
    expect(g.regionSizes?.left).toBe(280);
  });

  it('gives a user-collapsed occupied region its expanded band as content', () => {
    const g = completeDockDropGeometry({
      dock: dockOf({ main: tabsNode('m', ['grid']), left: tabsNode('l', ['side']) }, { left: { collapsed: true } }),
      panels: {},
      measured: measured()
    });
    expect(g.regionContentRects?.left).toEqual({ left: 100, top: 50, width: 319, height: 800 });
    expect(g.regionCollapsedExtents?.left).toBeUndefined();
    expect(landingRect({ kind: 'edge', region: 'left', empty: false }, g)).toEqual({ left: 100, top: 50, width: 157.5, height: 800 });
  });

  it('records the strip extent of an all-strips side region and expands a collapsed stack', () => {
    const strip: DockStackSlot = { stackId: 'r', activePanelId: 'editor', rect: { left: 1264, top: 50, width: 36, height: 800 }, region: 'right', collapsed: true };
    const g = completeDockDropGeometry({
      dock: dockOf({ main: tabsNode('m', ['grid']), right: tabsNode('r', ['editor']) }),
      panels: { editor: { collapsed: true } },
      measured: measured({ stacks: [strip], regionRects: { right: { left: 1264, top: 50, width: 36, height: 800 } } })
    });
    expect(g.regionContentRects?.right).toEqual({ left: 981, top: 50, width: 319, height: 800 });
    expect(g.regionCollapsedExtents?.right).toBe(36);
    expect(g.stacks[0].expandedRect).toEqual({ left: 981, top: 50, width: 319, height: 800 });
  });

  it('expands a collapsed stack inside a split of its region', () => {
    const tree: DockNode = { kind: 'split', id: 's', axis: 'vertical', ratio: [0.5, 0.5], children: [tabsNode('a', ['grid']), tabsNode('b', ['editor'])] };
    const content = { left: 200, top: 100, width: 800, height: 604 };
    const strip: DockStackSlot = { stackId: 'b', activePanelId: 'editor', rect: { left: 200, top: 668, width: 800, height: 36 }, region: 'main', collapsed: true };
    const g = completeDockDropGeometry({
      dock: dockOf({ main: tree }),
      panels: { editor: { collapsed: true } },
      measured: measured({ stacks: [strip], regionContentRects: { main: content }, regionRects: { main: content } })
    });
    expect(g.stacks[0].expandedRect).toEqual({ left: 200, top: 404, width: 800, height: 300 });
  });

  it('scales the strip / handle metrics by the zoom', () => {
    const g = completeDockDropGeometry({
      dock: dockOf({ main: tabsNode('m', ['grid']), right: tabsNode('r', ['editor']) }),
      panels: { editor: { collapsed: true } },
      measured: measured({ zoom: 2 })
    });
    expect(g.regionCollapsedExtents?.right).toBe(72);
  });
});
