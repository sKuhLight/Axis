import { describe, expect, it } from 'vitest';
import { createEmptyDockLayout, createEmptyWorkbenchDocument, createEmptyWorkbenchPage } from '../defaults';
import {
  collapseSingleChildSplits,
  isHeldTabStack,
  liftPanelFromDock,
  liftPanelFromPage,
  removePanelFromDock,
  removePanelFromNode
} from '../dockTree';
import { reduceWorkbenchDocument } from '../reducer';
import type { DockLayout, DockNode, SplitDockNode, TabStackDockNode, WorkbenchDocument } from '../schema';
import { activeWorkbenchPage, panelIdsInPageDock, selectActiveLayout } from '../selectors';

const tabs = (id: string, panelIds: string[], active = panelIds[0]): TabStackDockNode => ({ kind: 'tabs', id, panelIds, activePanelId: active });
const split = (id: string, axis: 'horizontal' | 'vertical', children: DockNode[], ratio?: number[]): SplitDockNode => ({
  kind: 'split',
  id,
  axis,
  children,
  ratio: ratio ?? children.map(() => 1 / children.length)
});

function dockWith(main: DockNode | null, bottom: DockNode | null = null): DockLayout {
  const dock = createEmptyDockLayout();
  dock.root.main = main;
  dock.root.bottom = bottom;
  return dock;
}

const freeze = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('removePanelFromNode', () => {
  it('drops a tab and keeps the active tab when it survives', () => {
    const result = removePanelFromNode(tabs('t', ['a', 'b', 'c'], 'c'), 'b');
    expect(result).toEqual({ removed: true, node: tabs('t', ['a', 'c'], 'c') });
  });

  it('falls back to the first tab when the active one is removed', () => {
    expect(removePanelFromNode(tabs('t', ['a', 'b'], 'b'), 'b').node).toEqual(tabs('t', ['a'], 'a'));
  });

  it('removes an emptied stack and collapses a single-child split', () => {
    const node = split('s', 'horizontal', [tabs('t1', ['a']), tabs('t2', ['b'])], [0.3, 0.7]);
    expect(removePanelFromNode(node, 'a')).toEqual({ removed: true, node: tabs('t2', ['b']) });
  });

  it('renormalizes ratios when a split keeps several children (equal reset on a count change)', () => {
    const node = split('s', 'vertical', [tabs('t1', ['a']), tabs('t2', ['b']), tabs('t3', ['c'])], [0.2, 0.3, 0.5]);
    const result = removePanelFromNode(node, 'b').node as SplitDockNode;
    expect(result.children.map((child) => child.id)).toEqual(['t1', 't3']);
    expect(result.ratio).toEqual([0.5, 0.5]);
  });

  it('keeps a one-child split with preserveSplits', () => {
    const node = split('s', 'horizontal', [tabs('t1', ['a']), tabs('t2', ['b'])]);
    const result = removePanelFromNode(node, 'a', { preserveSplits: true }).node as SplitDockNode;
    expect(result.kind).toBe('split');
    expect(result.id).toBe('s');
    expect(result.children).toEqual([tabs('t2', ['b'])]);
    expect(result.ratio).toEqual([1]);
  });

  it('never mutates its input and shares untouched branches', () => {
    const untouched = tabs('t3', ['c']);
    const node = split('s', 'horizontal', [split('s2', 'vertical', [tabs('t1', ['a']), tabs('t2', ['b'])]), untouched]);
    const before = freeze(node);
    const result = removePanelFromNode(node, 'a').node as SplitDockNode;
    expect(node).toEqual(before);
    expect(result.children[1]).toBe(untouched);
  });

  it('reports an absent panel without changing anything', () => {
    const node = tabs('t', ['a']);
    expect(removePanelFromNode(node, 'zzz')).toEqual({ removed: false, node });
  });
});

describe('liftPanelFromDock / liftPanelFromPage', () => {
  it('returns the same dock (identity) when the panel is not docked', () => {
    const dock = dockWith(tabs('t', ['a']));
    expect(liftPanelFromDock(dock, 'nope')).toBe(dock);
  });

  it('lifts without mutating and matches the mutating reducer removal', () => {
    const dock = dockWith(split('s', 'horizontal', [tabs('t1', ['a']), tabs('t2', ['b'])]), tabs('t3', ['c']));
    const before = freeze(dock);
    const lifted = liftPanelFromDock(dock, 'b');
    expect(dock).toEqual(before);

    const mutated = freeze(dock);
    removePanelFromDock(mutated, 'b');
    expect(lifted).toEqual(mutated);
    expect(lifted.root.main).toEqual(tabs('t1', ['a']));
  });

  it('a preserveSplits lift normalizes to exactly the reducer shape', () => {
    const dock = dockWith(
      split('s', 'horizontal', [tabs('t1', ['a']), split('s2', 'vertical', [tabs('t2', ['b']), tabs('t3', ['c'])], [0.4, 0.6])], [0.25, 0.75])
    );
    for (const panelId of ['a', 'b', 'c']) {
      const preserved = liftPanelFromDock(dock, panelId, { preserveSplits: true });
      const committed = liftPanelFromDock(dock, panelId);
      expect(collapseSingleChildSplits(preserved.root.main)).toEqual(committed.root.main);
    }
  });

  it('a preserveSplits lift keeps the surviving node ids (no remount of neighbours)', () => {
    const dock = dockWith(split('s', 'horizontal', [tabs('t1', ['a']), tabs('t2', ['b'])]));
    const lifted = liftPanelFromDock(dock, 'b', { preserveSplits: true });
    expect(lifted.root.main?.id).toBe('s');
    expect((lifted.root.main as SplitDockNode).children[0].id).toBe('t1');
  });

  it('empties a region whose only panel is lifted', () => {
    const dock = dockWith(tabs('t1', ['a']), tabs('t2', ['b']));
    expect(liftPanelFromDock(dock, 'b').root.bottom).toBeNull();
  });

  it('lifts at page level and keeps the page identity when nothing changes', () => {
    const page = createEmptyWorkbenchPage({ id: 'p', label: 'P' });
    page.dock.root.main = tabs('t1', ['a', 'b']);
    expect(liftPanelFromPage(page, 'zzz')).toBe(page);
    const lifted = liftPanelFromPage(page, 'a');
    expect(panelIdsInPageDock(lifted)).toEqual(['b']);
    expect(panelIdsInPageDock(page)).toEqual(['a', 'b']);
  });
});

describe('collapseSingleChildSplits', () => {
  it('replaces nested one-child splits by their child', () => {
    const node = split('s', 'horizontal', [split('s2', 'vertical', [tabs('t1', ['a'])]), tabs('t2', ['b'])]);
    expect(collapseSingleChildSplits(node)).toEqual(split('s', 'horizontal', [tabs('t1', ['a']), tabs('t2', ['b'])]));
    expect(collapseSingleChildSplits(split('s', 'vertical', [tabs('t1', ['a'])]))).toEqual(tabs('t1', ['a']));
    expect(collapseSingleChildSplits(null)).toBeNull();
  });
});

describe('panel.move with pageId', () => {
  function twoPages(): WorkbenchDocument {
    let doc = createEmptyWorkbenchDocument({ profileId: 'profile.t', layoutId: 'layout.t', pageId: 'page.one', pageLabel: 'One' });
    doc = reduceWorkbenchDocument(doc, { type: 'panel.add', panel: { id: 'grid', type: 't.grid', title: 'Grid' }, region: 'main' }).next;
    doc = reduceWorkbenchDocument(doc, { type: 'panel.add', panel: { id: 'editor', type: 't.editor', title: 'Editor' }, region: 'bottom' }).next;
    doc = reduceWorkbenchDocument(doc, { type: 'page.add', page: createEmptyWorkbenchPage({ id: 'page.two', label: 'Two' }) }).next;
    return doc;
  }
  const layoutOf = (doc: WorkbenchDocument) => selectActiveLayout(doc)!;

  it('removes the panel from the source page and appends it to the target page main', () => {
    let doc = twoPages();
    // Give page two a main panel so the move appends as a tab.
    doc = reduceWorkbenchDocument(doc, { type: 'page.activate', pageId: 'page.two' }).next;
    doc = reduceWorkbenchDocument(doc, { type: 'panel.add', panel: { id: 'scenes', type: 't.scenes', title: 'Scenes' }, region: 'main' }).next;
    doc = reduceWorkbenchDocument(doc, { type: 'page.activate', pageId: 'page.one' }).next;

    const result = reduceWorkbenchDocument(doc, { type: 'panel.move', panelId: 'editor', to: { kind: 'region', region: 'main' }, pageId: 'page.two' });

    expect(result.success).toBe(true);
    const layout = layoutOf(result.next);
    expect(layout.activePageId).toBe('page.one');
    expect(panelIdsInPageDock(layout.pages['page.one'])).toEqual(['grid']);
    expect(layout.pages['page.one'].dock.root.bottom).toBeNull();
    const main = layout.pages['page.two'].dock.root.main as TabStackDockNode;
    expect(main.panelIds).toEqual(['scenes', 'editor']);
    expect(main.activePanelId).toBe('editor');
  });

  it('gives an empty target page a main region', () => {
    const result = reduceWorkbenchDocument(twoPages(), { type: 'panel.move', panelId: 'grid', to: { kind: 'region', region: 'main' }, pageId: 'page.two' });
    expect(result.success).toBe(true);
    const layout = layoutOf(result.next);
    expect(layout.pages['page.two'].dock.root.main).toMatchObject({ kind: 'tabs', panelIds: ['grid'] });
    expect(activeWorkbenchPage(layout)?.dock.root.main).toBeNull();
  });

  it('fails with missing-page for an unknown page and leaves the document alone', () => {
    const doc = twoPages();
    const result = reduceWorkbenchDocument(doc, { type: 'panel.move', panelId: 'grid', to: { kind: 'region', region: 'main' }, pageId: 'page.nope' });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('missing-page');
    expect(result.next).toBe(doc);
  });
});

describe('holdActive lift (render-only)', () => {
  it('keeps the stale active id when the lifted panel was the active tab', () => {
    const dock = dockWith(tabs('t', ['a', 'b', 'c'], 'b'));
    const held = liftPanelFromDock(dock, 'b', { preserveSplits: true, holdActive: true }).root.main as TabStackDockNode;
    expect(held).toEqual(tabs('t', ['a', 'c'], 'b'));
    expect(isHeldTabStack(held)).toBe(true);
    // Lifting an inactive tab never holds the stack.
    const free = liftPanelFromDock(dock, 'a', { holdActive: true }).root.main as TabStackDockNode;
    expect(free.activePanelId).toBe('b');
    expect(isHeldTabStack(free)).toBe(false);
    // Without the option the reducer shape falls back to the first tab.
    expect((liftPanelFromDock(dock, 'b').root.main as TabStackDockNode).activePanelId).toBe('a');
  });

  it('isHeldTabStack is false for empty and valid stacks', () => {
    expect(isHeldTabStack({ panelIds: [], activePanelId: 'x' })).toBe(false);
    expect(isHeldTabStack({ panelIds: ['x'], activePanelId: 'x' })).toBe(false);
  });
});

describe('inserting into a region expands a user-collapsed region', () => {
  function docWithCollapsedLeft(): WorkbenchDocument {
    let doc = createEmptyWorkbenchDocument({ profileId: 'profile.t', layoutId: 'layout.t' });
    doc = reduceWorkbenchDocument(doc, { type: 'panel.add', panel: { id: 'grid', type: 't', title: 'Grid' }, region: 'main' }).next;
    doc = reduceWorkbenchDocument(doc, { type: 'panel.add', panel: { id: 'side', type: 't', title: 'Side' }, region: 'left' }).next;
    doc = reduceWorkbenchDocument(doc, { type: 'panel.add', panel: { id: 'p', type: 't', title: 'P' }, region: 'bottom' }).next;
    doc = reduceWorkbenchDocument(doc, { type: 'region.collapse', region: 'left', collapsed: true }).next;
    return doc;
  }
  const leftState = (doc: WorkbenchDocument) => activeWorkbenchPage(selectActiveLayout(doc)!)!.dock.regions.left;

  it.each([
    ['region append', { kind: 'region', region: 'left' }],
    ['region split', { kind: 'split', region: 'left', axis: 'horizontal', position: 'before' }],
    ['split beside a panel in it', { kind: 'split', targetPanelId: 'side', axis: 'vertical', position: 'after' }],
    ['tab into a stack in it', { kind: 'tab', targetPanelId: 'side' }]
  ] as const)('%s', (_name, to) => {
    const before = docWithCollapsedLeft();
    expect(leftState(before).collapsed).toBe(true);
    const result = reduceWorkbenchDocument(before, { type: 'panel.move', panelId: 'p', to });
    expect(result.success).toBe(true);
    expect(leftState(result.next).collapsed).toBe(false);
  });

  it('leaves other collapsed regions alone', () => {
    const result = reduceWorkbenchDocument(docWithCollapsedLeft(), { type: 'panel.move', panelId: 'p', to: { kind: 'region', region: 'right' } });
    expect(leftState(result.next).collapsed).toBe(true);
  });
});

describe('panel.move arrives expanded', () => {
  it('clears the moved panel collapsed flag (other panels keep theirs)', () => {
    let doc = createEmptyWorkbenchDocument({ profileId: 'profile.t', layoutId: 'layout.t' });
    doc = reduceWorkbenchDocument(doc, { type: 'panel.add', panel: { id: 'grid', type: 't', title: 'Grid', collapsed: true }, region: 'main' }).next;
    doc = reduceWorkbenchDocument(doc, { type: 'panel.add', panel: { id: 'p', type: 't', title: 'P', collapsed: true }, region: 'bottom' }).next;
    const result = reduceWorkbenchDocument(doc, { type: 'panel.move', panelId: 'p', to: { kind: 'region', region: 'right' } });
    expect(result.success).toBe(true);
    const panels = selectActiveLayout(result.next)!.panels;
    expect(panels.p.collapsed).toBeUndefined();
    expect(panels.grid.collapsed).toBe(true);
  });
});
