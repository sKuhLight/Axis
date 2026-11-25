import { describe, expect, it } from 'vitest';
import { createEmptyDockLayout, type DockNode, type SplitDockNode, type TabStackDockNode } from '../../core';
import {
  COLLAPSED_STRIP_PX,
  SPLIT_HANDLE_PX,
  collapsedNodeExtent,
  isDockNodeCollapsed,
  layoutDockTree,
  layoutDockWorkspace,
  splitChildFlex,
  splitChildFlexCss,
  splitChildSizes,
  stackActivePanelId,
  stackCollapsedIn
} from '../dockLayout';

const tabs = (id: string, panelIds: string[], active = panelIds[0]): TabStackDockNode => ({ kind: 'tabs', id, panelIds, activePanelId: active });
const split = (id: string, axis: 'horizontal' | 'vertical', children: DockNode[], ratio?: number[]): SplitDockNode => ({
  kind: 'split',
  id,
  axis,
  children,
  ratio: ratio ?? children.map(() => 1 / children.length)
});

const collapsedIds = (...ids: string[]) => (stack: TabStackDockNode) => ids.includes(stack.id);

describe('stack collapse helpers', () => {
  it('reads the active panel (falling back to the first tab)', () => {
    expect(stackActivePanelId(tabs('t', ['a', 'b'], 'b'))).toBe('b');
    expect(stackActivePanelId(tabs('t', ['a', 'b'], 'stale'))).toBe('a');
    const isCollapsed = stackCollapsedIn({ a: { collapsed: true }, b: {} });
    expect(isCollapsed(tabs('t', ['a', 'b'], 'a'))).toBe(true);
    expect(isCollapsed(tabs('t', ['a', 'b'], 'b'))).toBe(false);
    expect(isCollapsed(tabs('t', ['x']))).toBe(false);
    // A held stack (its active tab lifted by a drag) follows its first remaining
    // tab — the one the reducer activates after the drop.
    expect(isCollapsed(tabs('t', ['b'], 'lifted'))).toBe(false);
    expect(isCollapsed(tabs('t', ['a', 'b'], 'lifted'))).toBe(true);
  });

  it('a split is collapsed only when every child is', () => {
    const node = split('s', 'horizontal', [tabs('t1', ['a']), tabs('t2', ['b'])]);
    expect(isDockNodeCollapsed(node, collapsedIds('t1'))).toBe(false);
    expect(isDockNodeCollapsed(node, collapsedIds('t1', 't2'))).toBe(true);
    expect(isDockNodeCollapsed(null, collapsedIds())).toBe(false);
  });

  it('measures collapsed extents along an axis', () => {
    const isCollapsed = collapsedIds('t1', 't2');
    expect(collapsedNodeExtent(tabs('t1', ['a']), 'horizontal', isCollapsed)).toBe(COLLAPSED_STRIP_PX);
    const row = split('s', 'horizontal', [tabs('t1', ['a']), tabs('t2', ['b'])]);
    expect(collapsedNodeExtent(row, 'horizontal', isCollapsed)).toBe(2 * COLLAPSED_STRIP_PX + SPLIT_HANDLE_PX);
    expect(collapsedNodeExtent(row, 'vertical', isCollapsed)).toBe(COLLAPSED_STRIP_PX);
    expect(collapsedNodeExtent(row, 'horizontal', isCollapsed, { strip: 46, handle: 8 })).toBe(100);
  });
});

describe('splitChildFlex / splitChildSizes', () => {
  it('without collapsed children keeps the ratios', () => {
    const node = split('s', 'horizontal', [tabs('t1', ['a']), tabs('t2', ['b'])], [0.25, 0.75]);
    const flex = splitChildFlex(node, collapsedIds());
    expect(flex).toEqual([
      { fixedPx: null, basisPercent: 25 },
      { fixedPx: null, basisPercent: 75 }
    ]);
    expect(splitChildSizes(1004, flex)).toEqual([250, 750]);
    expect(splitChildFlexCss(flex[0])).toBe('1 1 25%');
  });

  it('gives a collapsed child a fixed strip and its siblings the freed space by ratio', () => {
    const node = split('s', 'vertical', [tabs('t1', ['a']), tabs('t2', ['b']), tabs('t3', ['c'])], [0.5, 0.25, 0.25]);
    const flex = splitChildFlex(node, collapsedIds('t1'));
    expect(flex).toEqual([
      { fixedPx: COLLAPSED_STRIP_PX, basisPercent: 0 },
      { fixedPx: null, basisPercent: 50 },
      { fixedPx: null, basisPercent: 50 }
    ]);
    expect(splitChildFlexCss(flex[0])).toBe(`0 0 ${COLLAPSED_STRIP_PX}px`);
    // 600 - 2 handles (8) - strip (36) = 556 → 278 each
    expect(splitChildSizes(600, flex)).toEqual([36, 278, 278]);
  });

  it('a fully collapsed nested split is fixed at its extent in the parent', () => {
    const inner = split('s2', 'horizontal', [tabs('t2', ['b']), tabs('t3', ['c'])]);
    const node = split('s', 'horizontal', [tabs('t1', ['a']), inner]);
    const flex = splitChildFlex(node, collapsedIds('t2', 't3'));
    expect(flex[1]).toEqual({ fixedPx: 2 * COLLAPSED_STRIP_PX + SPLIT_HANDLE_PX, basisPercent: 0 });
    expect(flex[0]).toEqual({ fixedPx: null, basisPercent: 100 });
  });

  it('leaves the space unused when every child is collapsed, and never goes negative', () => {
    const node = split('s', 'horizontal', [tabs('t1', ['a']), tabs('t2', ['b'])]);
    const flex = splitChildFlex(node, collapsedIds('t1', 't2'));
    expect(splitChildSizes(500, flex)).toEqual([36, 36]);
    const mixed = splitChildFlex(split('s', 'horizontal', [tabs('t1', ['a']), tabs('t2', ['b'])]), collapsedIds('t1'));
    expect(splitChildSizes(20, mixed)).toEqual([36, 0]);
  });
});

describe('layoutDockTree', () => {
  it('mirrors the flex layout: handles between children, collapsed strips fixed', () => {
    const tree = split('s', 'vertical', [split('s2', 'horizontal', [tabs('t1', ['a']), tabs('t2', ['b'])], [0.5, 0.5]), tabs('t3', ['c'])], [0.6, 0.4]);
    const rects = layoutDockTree(tree, { left: 0, top: 0, width: 804, height: 504 }, collapsedIds());
    expect(rects.get('t1')).toEqual({ left: 0, top: 0, width: 400, height: 300 });
    expect(rects.get('t2')).toEqual({ left: 404, top: 0, width: 400, height: 300 });
    expect(rects.get('t3')).toEqual({ left: 0, top: 304, width: 804, height: 200 });

    const collapsed = layoutDockTree(tree, { left: 0, top: 0, width: 804, height: 504 }, collapsedIds('t3'));
    expect(collapsed.get('t3')).toEqual({ left: 0, top: 468, width: 804, height: 36 });
    expect(collapsed.get('t1')).toEqual({ left: 0, top: 0, width: 400, height: 464 });
  });

  it('lays a lone stack over the whole rect', () => {
    expect(layoutDockTree(tabs('t', ['a']), { left: 5, top: 6, width: 7, height: 8 }, collapsedIds()).get('t')).toEqual({ left: 5, top: 6, width: 7, height: 8 });
    expect(layoutDockTree(null, { left: 0, top: 0, width: 1, height: 1 }, collapsedIds()).size).toBe(0);
  });
});

describe('layoutDockWorkspace (edit-mode mirror of DockWorkspace/DockRegion)', () => {
  const WS = { left: 100, top: 50, width: 1200, height: 800 };

  it('lays out side columns, the centre column and empty strips', () => {
    const dock = createEmptyDockLayout();
    dock.root.main = tabs('m', ['grid']);
    dock.root.right = tabs('r', ['editor']);
    dock.regions.right.sizePx = 300;
    const laid = layoutDockWorkspace(dock, {}, WS);
    expect(laid.regionRects.left).toEqual({ left: 100, top: 50, width: 44, height: 800 });
    expect(laid.regionRects.right).toEqual({ left: 1000, top: 50, width: 300, height: 800 });
    expect(laid.regionRects.top).toEqual({ left: 144, top: 50, width: 856, height: 48 });
    expect(laid.regionRects.bottom).toEqual({ left: 144, top: 802, width: 856, height: 48 });
    expect(laid.regionRects.main).toEqual({ left: 144, top: 98, width: 856, height: 704 });
    expect(laid.stacks.get('r')?.rect).toEqual({ left: 1001, top: 50, width: 299, height: 800 });
    expect(laid.stacks.get('m')?.rect).toEqual({ left: 144, top: 98, width: 856, height: 704 });
    expect(laid.emptyRegions.map((entry) => entry.region)).toEqual(['left', 'top', 'bottom']);
  });

  it('draws a user-collapsed region as the 32px strip and an all-strips region at its strip extent', () => {
    const dock = createEmptyDockLayout();
    dock.root.main = { kind: 'split', id: 's', axis: 'vertical', ratio: [0.5, 0.5], children: [tabs('m', ['grid']), tabs('c', ['editor'])] };
    dock.root.left = tabs('l', ['side']);
    dock.regions.left.collapsed = true;
    dock.root.bottom = tabs('b', ['history']);
    const laid = layoutDockWorkspace(dock, { history: { collapsed: true }, editor: { collapsed: true } }, WS);
    expect(laid.regionRects.left).toEqual({ left: 100, top: 50, width: 32, height: 32 });
    expect(laid.collapsedRegions).toEqual([{ region: 'left', rect: { left: 100, top: 50, width: 32, height: 32 } }]);
    expect(laid.stacks.has('l')).toBe(false);
    expect(laid.regionRects.bottom).toEqual({ left: 132, top: 814, width: 1124, height: 36 });
    expect(laid.stacks.get('b')).toEqual({ rect: { left: 132, top: 815, width: 1124, height: 35 }, region: 'bottom', collapsed: true });
    // main: the collapsed editor keeps a 36px strip at the bottom of the split
    expect(laid.stacks.get('c')?.rect.height).toBe(36);
    expect(laid.stacks.get('c')?.collapsed).toBe(true);
    expect(laid.stacks.get('m')?.collapsed).toBe(false);
  });
});
