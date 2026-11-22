import { describe, expect, it } from 'vitest';
import { createEmptyDockLayout, createEmptyWorkbenchDocument, createEmptyWorkbenchPage } from '../defaults';
import { reduceWorkbenchDocument } from '../reducer';
import type { DockNode, PanelInstance, WorkbenchDocument, WorkbenchPage } from '../schema';
import {
  activeWorkbenchPage,
  orderedWorkbenchPages,
  panelIdsInPageDock,
  selectActiveLayout,
  selectPanelPlacement,
  selectParkedPanels
} from '../selectors';

const panel = (id: string, extra: Partial<PanelInstance> = {}): PanelInstance => ({
  id,
  type: 'test.panel',
  title: id,
  ...extra
});

const page = (id: string, label = id): WorkbenchPage => createEmptyWorkbenchPage({ id, label });

const doc = (): WorkbenchDocument =>
  createEmptyWorkbenchDocument({
    profileId: 'profile.test',
    layoutId: 'layout.test',
    pageId: 'page.one',
    pageLabel: 'One'
  });

const layout = (d: WorkbenchDocument) => selectActiveLayout(d)!;
const dock = (d: WorkbenchDocument) => activeWorkbenchPage(layout(d))!.dock;

/** Doc with pages one+two, page two active. */
function twoPageDoc(): WorkbenchDocument {
  let d = doc();
  d = reduceWorkbenchDocument(d, { type: 'page.add', page: page('page.two', 'Two') }).next;
  d = reduceWorkbenchDocument(d, { type: 'page.activate', pageId: 'page.two' }).next;
  return d;
}

const collectNodeIds = (node: DockNode | null, ids: string[] = []): string[] => {
  if (!node) return ids;
  ids.push(node.id);
  if (node.kind === 'split') for (const child of node.children) collectNodeIds(child, ids);
  return ids;
};

describe('page.add', () => {
  it('inserts the page with a default bound navigation entry', () => {
    const r = reduceWorkbenchDocument(doc(), { type: 'page.add', page: page('page.two', 'Two') });

    expect(r.success).toBe(true);
    const l = layout(r.next);
    expect(l.pages['page.two']).toMatchObject({ id: 'page.two', label: 'Two' });
    expect(l.pageOrder).toEqual(['page.one', 'page.two']);
    const entry = l.navigation.entries['page:page.two'];
    expect(entry).toMatchObject({ label: 'Two', pageId: 'page.two' });
    expect(l.navigation.order).toContain('page:page.two');
    // Adding does NOT activate — the caller decides (controller.addPage batches an activate).
    expect(l.activePageId).toBe('page.one');
  });

  it('respects the insertion index for pageOrder and navigation order', () => {
    const r = reduceWorkbenchDocument(doc(), { type: 'page.add', page: page('page.zero', 'Zero'), index: 0 });

    const l = layout(r.next);
    expect(l.pageOrder).toEqual(['page.zero', 'page.one']);
    expect(l.navigation.order[0]).toBe('page:page.zero');
  });

  it('uses a provided navigation entry and forces its page binding', () => {
    const r = reduceWorkbenchDocument(doc(), {
      type: 'page.add',
      page: page('page.two', 'Two'),
      navEntry: { id: 'nav.custom', label: 'Custom', pageId: 'somewhere.else' }
    });

    expect(r.success).toBe(true);
    const l = layout(r.next);
    expect(l.navigation.entries['nav.custom']).toMatchObject({ label: 'Custom', pageId: 'page.two' });
  });

  it('carries the page icon into the default nav entry state', () => {
    const r = reduceWorkbenchDocument(doc(), {
      type: 'page.add',
      page: { ...page('page.two', 'Two'), icon: 'star' }
    });
    expect(layout(r.next).navigation.entries['page:page.two'].state).toEqual({ icon: 'star' });
  });

  it('rejects duplicate page ids and duplicate provided nav entry ids', () => {
    const dup = reduceWorkbenchDocument(doc(), { type: 'page.add', page: page('page.one') });
    expect(dup.success).toBe(false);
    expect(dup.error?.code).toBe('duplicate-id');

    let d = doc();
    d = reduceWorkbenchDocument(d, { type: 'page.add', page: page('page.two'), navEntry: { id: 'nav.x' } }).next;
    const dupNav = reduceWorkbenchDocument(d, { type: 'page.add', page: page('page.three'), navEntry: { id: 'nav.x' } });
    expect(dupNav.success).toBe(false);
    expect(dupNav.error?.code).toBe('duplicate-id');
  });

  it('mints a fresh nav entry id when the derived page:<id> is already taken', () => {
    let d = doc();
    d = reduceWorkbenchDocument(d, { type: 'page.add', page: page('page.two'), navEntry: { id: 'page:page.three' } }).next;
    const r = reduceWorkbenchDocument(d, { type: 'page.add', page: page('page.three', 'Three') });

    expect(r.success).toBe(true);
    const entries = Object.values(layout(r.next).navigation.entries).filter((e) => e.pageId === 'page.three');
    expect(entries).toHaveLength(1);
    expect(entries[0].id).not.toBe('page:page.three');
  });
});

describe('page.activate', () => {
  it('switches the active page (and dock-scoped commands follow it)', () => {
    let d = twoPageDoc();
    expect(layout(d).activePageId).toBe('page.two');

    d = reduceWorkbenchDocument(d, { type: 'panel.add', panel: panel('panel.a'), region: 'main' }).next;
    // The panel landed on page.two's dock, page.one stays empty.
    expect(panelIdsInPageDock(layout(d).pages['page.two'])).toEqual(['panel.a']);
    expect(panelIdsInPageDock(layout(d).pages['page.one'])).toEqual([]);

    const back = reduceWorkbenchDocument(d, { type: 'page.activate', pageId: 'page.one' });
    expect(back.success).toBe(true);
    expect(layout(back.next).activePageId).toBe('page.one');
  });

  it('rejects a missing page', () => {
    const r = reduceWorkbenchDocument(doc(), { type: 'page.activate', pageId: 'nope' });
    expect(r.success).toBe(false);
    expect(r.error?.code).toBe('missing-page');
  });
});

describe('page.rename', () => {
  it('renames the page and its bound navigation entry', () => {
    let d = twoPageDoc();
    d = reduceWorkbenchDocument(d, { type: 'page.rename', pageId: 'page.two', label: '  Stage  ' }).next;

    expect(layout(d).pages['page.two'].label).toBe('Stage');
    expect(layout(d).navigation.entries['page:page.two'].label).toBe('Stage');
  });

  it('rejects empty labels and missing pages', () => {
    const empty = reduceWorkbenchDocument(twoPageDoc(), { type: 'page.rename', pageId: 'page.two', label: '   ' });
    expect(empty.success).toBe(false);
    expect(empty.error?.code).toBe('invalid-command');

    const missing = reduceWorkbenchDocument(doc(), { type: 'page.rename', pageId: 'nope', label: 'X' });
    expect(missing.success).toBe(false);
    expect(missing.error?.code).toBe('missing-page');
  });
});

describe('page.remove', () => {
  it('removes the page and its nav entry, and PARKS the panels docked there', () => {
    let d = twoPageDoc(); // page.two active
    d = reduceWorkbenchDocument(d, { type: 'panel.add', panel: panel('panel.a', { state: { keep: 1 } }), region: 'main' }).next;

    const r = reduceWorkbenchDocument(d, { type: 'page.remove', pageId: 'page.two' });
    expect(r.success).toBe(true);
    const l = layout(r.next);
    expect(l.pages['page.two']).toBeUndefined();
    expect(l.pageOrder).toEqual(['page.one']);
    expect(l.navigation.entries['page:page.two']).toBeUndefined();
    expect(l.navigation.order).not.toContain('page:page.two');
    // Parked, not deleted: the instance (and its state) survives, docked nowhere.
    expect(l.panels['panel.a']).toMatchObject({ id: 'panel.a', state: { keep: 1 } });
    expect(orderedWorkbenchPages(l).flatMap(panelIdsInPageDock)).not.toContain('panel.a');
    // It was active — the nearest remaining page takes over.
    expect(l.activePageId).toBe('page.one');
  });

  it('parks locked panels too and keeps panel-owned widgets in their zone', () => {
    let d = twoPageDoc();
    d = reduceWorkbenchDocument(d, { type: 'panel.add', panel: panel('panel.locked', { locked: true }), region: 'main' }).next;
    d = reduceWorkbenchDocument(d, { type: 'panel.add', panel: panel('panel.custom'), region: 'left' }).next;
    d = reduceWorkbenchDocument(d, { type: 'zone.ensure', zone: { id: 'panel:panel.custom', orientation: 'free' } }).next;
    d = reduceWorkbenchDocument(d, {
      type: 'widget.add',
      widget: { id: 'w.owned', type: 'test.widget', zone: 'panel:panel.custom', order: 0, size: 'default' },
      zone: 'panel:panel.custom'
    }).next;

    const l = layout(reduceWorkbenchDocument(d, { type: 'page.remove', pageId: 'page.two' }).next);
    expect(l.panels['panel.locked']).toBeDefined();
    expect(l.panels['panel.custom']).toBeDefined();
    expect(l.zones['panel:panel.custom']).toBeDefined();
    expect(l.widgets['w.owned'].zone).toBe('panel:panel.custom');
  });

  it('a parked panel can be docked again by a later page.add', () => {
    let d = twoPageDoc();
    d = reduceWorkbenchDocument(d, { type: 'panel.add', panel: panel('panel.a'), region: 'main' }).next;
    const removed = reduceWorkbenchDocument(d, { type: 'page.remove', pageId: 'page.two' }).next;
    const dockWithA = createEmptyDockLayout();
    dockWithA.root.main = { kind: 'tabs', id: 'tabs.restored', activePanelId: 'panel.a', panelIds: ['panel.a'] };
    const restored = reduceWorkbenchDocument(removed, {
      type: 'page.add',
      page: { id: 'page.two', label: 'Two', dock: dockWithA }
    });
    expect(restored.success).toBe(true);
    expect(panelIdsInPageDock(layout(restored.next).pages['page.two'])).toEqual(['panel.a']);
  });

  it('activates the page that slid into the removed slot (nearest by order)', () => {
    let d = twoPageDoc();
    d = reduceWorkbenchDocument(d, { type: 'page.add', page: page('page.three', 'Three') }).next;
    d = reduceWorkbenchDocument(d, { type: 'page.activate', pageId: 'page.two' }).next;

    const r = reduceWorkbenchDocument(d, { type: 'page.remove', pageId: 'page.two' });
    expect(layout(r.next).pageOrder).toEqual(['page.one', 'page.three']);
    expect(layout(r.next).activePageId).toBe('page.three');
  });

  it('keeps the active page when a different page is removed', () => {
    const d = twoPageDoc();
    const r = reduceWorkbenchDocument(d, { type: 'page.remove', pageId: 'page.one' });
    expect(r.success).toBe(true);
    expect(layout(r.next).activePageId).toBe('page.two');
  });

  it('rejects removing the last page', () => {
    const r = reduceWorkbenchDocument(doc(), { type: 'page.remove', pageId: 'page.one' });
    expect(r.success).toBe(false);
    expect(r.error?.code).toBe('protected-page');
  });

  it('rejects a missing page', () => {
    const r = reduceWorkbenchDocument(doc(), { type: 'page.remove', pageId: 'nope' });
    expect(r.success).toBe(false);
    expect(r.error?.code).toBe('missing-page');
  });
});

describe('page.duplicate', () => {
  function docWithDockedPanels(): WorkbenchDocument {
    let d = doc();
    d = reduceWorkbenchDocument(d, { type: 'panel.add', panel: panel('panel.a', { singletonKey: 'test.a' }), region: 'main' }).next;
    d = reduceWorkbenchDocument(d, {
      type: 'panel.split',
      panel: panel('panel.b'),
      targetPanelId: 'panel.a',
      axis: 'horizontal'
    }).next;
    return d;
  }

  it('deep-copies the page with fresh dock-node AND panel-instance ids', () => {
    const d = docWithDockedPanels();
    const r = reduceWorkbenchDocument(d, { type: 'page.duplicate', pageId: 'page.one', newPageId: 'page.copy' });

    expect(r.success).toBe(true);
    const l = layout(r.next);
    const source = l.pages['page.one'];
    const copy = l.pages['page.copy'];
    expect(copy).toBeDefined();
    expect(copy.label).toBe('One Copy');
    expect(l.pageOrder).toEqual(['page.one', 'page.copy']);

    // Source panels intact, copy panels freshly minted (unique ids, same types).
    const sourcePanelIds = panelIdsInPageDock(source);
    const copyPanelIds = panelIdsInPageDock(copy);
    expect(sourcePanelIds.sort()).toEqual(['panel.a', 'panel.b']);
    expect(copyPanelIds).toHaveLength(2);
    for (const id of copyPanelIds) {
      expect(sourcePanelIds).not.toContain(id);
      expect(l.panels[id]).toBeDefined();
    }

    // Dock node ids are unique across the whole layout (source + copy).
    const nodeIds: string[] = [];
    for (const p of orderedWorkbenchPages(l)) {
      for (const node of Object.values(p.dock.root)) collectNodeIds(node, nodeIds);
    }
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
  });

  it('strips singletonKey from the copied panels so repair keeps both pages populated', () => {
    const d = docWithDockedPanels();
    const r = reduceWorkbenchDocument(d, { type: 'page.duplicate', pageId: 'page.one', newPageId: 'page.copy' });

    const l = layout(r.next);
    const copyPanelIds = panelIdsInPageDock(l.pages['page.copy']);
    expect(copyPanelIds).toHaveLength(2);
    for (const id of copyPanelIds) expect(l.panels[id].singletonKey).toBeUndefined();
    // The original singleton panel survives untouched.
    expect(l.panels['panel.a'].singletonKey).toBe('test.a');
  });

  it('adds a nav entry for the copy right after the source page entry', () => {
    let d = doc();
    // Give the source page a bound nav entry first (migrated docs have none).
    d = reduceWorkbenchDocument(d, { type: 'page.add', page: page('page.two', 'Two') }).next;
    const r = reduceWorkbenchDocument(d, { type: 'page.duplicate', pageId: 'page.two', label: 'Two B' });

    const l = layout(r.next);
    const copyId = l.pageOrder[l.pageOrder.indexOf('page.two') + 1];
    expect(copyId).toBeDefined();
    expect(l.pages[copyId].label).toBe('Two B');
    const copyEntry = Object.values(l.navigation.entries).find((e) => e.pageId === copyId);
    expect(copyEntry).toBeDefined();
    const sourceEntryIndex = l.navigation.order.indexOf('page:page.two');
    expect(l.navigation.order.indexOf(copyEntry!.id)).toBe(sourceEntryIndex + 1);
  });

  it('rejects a missing source and a colliding newPageId', () => {
    const missing = reduceWorkbenchDocument(doc(), { type: 'page.duplicate', pageId: 'nope' });
    expect(missing.success).toBe(false);
    expect(missing.error?.code).toBe('missing-page');

    const collide = reduceWorkbenchDocument(twoPageDoc(), { type: 'page.duplicate', pageId: 'page.one', newPageId: 'page.two' });
    expect(collide.success).toBe(false);
    expect(collide.error?.code).toBe('duplicate-id');
  });
});

describe('dock-scoped commands target the active page', () => {
  it('region.resize and split.resize write to the active page only', () => {
    let d = twoPageDoc(); // page.two active
    d = reduceWorkbenchDocument(d, { type: 'region.resize', region: 'bottom', sizePx: 420 }).next;

    expect(layout(d).pages['page.two'].dock.regions.bottom.sizePx).toBe(420);
    expect(layout(d).pages['page.one'].dock.regions.bottom.sizePx).toBeUndefined();
  });

  it('panel.move pulls a panel from another page into the active page', () => {
    let d = doc();
    d = reduceWorkbenchDocument(d, { type: 'panel.add', panel: panel('panel.a'), region: 'main' }).next; // on page.one
    d = reduceWorkbenchDocument(d, { type: 'page.add', page: page('page.two', 'Two') }).next;
    d = reduceWorkbenchDocument(d, { type: 'page.activate', pageId: 'page.two' }).next;

    d = reduceWorkbenchDocument(d, { type: 'panel.move', panelId: 'panel.a', to: { kind: 'region', region: 'main' } }).next;

    expect(panelIdsInPageDock(layout(d).pages['page.one'])).toEqual([]);
    expect(panelIdsInPageDock(layout(d).pages['page.two'])).toEqual(['panel.a']);
    expect(dock(d).root.main?.kind).toBe('tabs');
  });

  it('page.add accepts a page with a prebuilt dock (repair normalizes its shape)', () => {
    const prebuilt: WorkbenchPage = {
      id: 'page.pre',
      label: 'Pre',
      dock: createEmptyDockLayout()
    };
    let d = doc();
    d = reduceWorkbenchDocument(d, { type: 'panel.add', panel: panel('panel.a'), region: 'main' }).next;
    const r = reduceWorkbenchDocument(d, { type: 'page.add', page: prebuilt });
    expect(r.success).toBe(true);
    expect(layout(r.next).pages['page.pre'].dock.root.main).toBeNull();
  });
});

describe('page.add never takes a panel from another page', () => {
  it('drops dock references to panels docked elsewhere; navIndex places the nav entry independently', () => {
    let d = doc();
    d = reduceWorkbenchDocument(d, { type: 'panel.add', panel: panel('panel.a'), region: 'main' }).next; // on page.one
    d = reduceWorkbenchDocument(d, { type: 'panel.create', panel: panel('panel.b') }).next; // parked
    const prebuilt = createEmptyDockLayout();
    prebuilt.root.main = { kind: 'tabs', id: 'tabs.x', activePanelId: 'panel.a', panelIds: ['panel.a', 'panel.b'] };
    const r = reduceWorkbenchDocument(d, { type: 'page.add', page: { id: 'page.zero', label: 'Zero', dock: prebuilt }, index: 0, navIndex: 0 });
    expect(r.success).toBe(true);
    const l = layout(r.next);
    expect(l.pageOrder[0]).toBe('page.zero');
    expect(l.navigation.order[0]).toBe('page:page.zero');
    expect(panelIdsInPageDock(l.pages['page.zero'])).toEqual(['panel.b']);
    expect(panelIdsInPageDock(l.pages['page.one'])).toEqual(['panel.a']);
    // The command's dock object is not mutated.
    expect((prebuilt.root.main as { panelIds: string[] }).panelIds).toEqual(['panel.a', 'panel.b']);
  });

  it('navIndex differs from index when the nav order diverges from the page order', () => {
    let d = doc();
    d = reduceWorkbenchDocument(d, {
      type: 'page.add',
      page: page('page.x', 'X'),
      index: 1,
      navIndex: 0
    }).next;
    const l = layout(d);
    expect(l.pageOrder).toEqual(['page.one', 'page.x']);
    expect(l.navigation.order[0]).toBe('page:page.x');
  });
});

describe('page.add navEntry: null', () => {
  it('adds a nav-less page', () => {
    const r = reduceWorkbenchDocument(doc(), { type: 'page.add', page: page('page.hidden', 'Hidden'), navEntry: null });
    expect(r.success).toBe(true);
    const l = layout(r.next);
    expect(l.pages['page.hidden']).toBeDefined();
    expect(Object.values(l.navigation.entries).some((e) => e.pageId === 'page.hidden')).toBe(false);
  });
});

describe('panel.create / panel.remove (parking)', () => {
  it('panel.create adds a parked instance; duplicates and singleton twins are rejected', () => {
    let d = doc();
    const created = reduceWorkbenchDocument(d, { type: 'panel.create', panel: panel('panel.p', { singletonKey: 'k' }) });
    expect(created.success).toBe(true);
    d = created.next;
    expect(selectPanelPlacement(layout(d), 'panel.p')).toEqual({ kind: 'parked' });
    expect(reduceWorkbenchDocument(d, { type: 'panel.create', panel: panel('panel.p') }).error?.code).toBe('duplicate-id');
    expect(reduceWorkbenchDocument(d, { type: 'panel.create', panel: panel('panel.q', { singletonKey: 'k' }) }).error?.code).toBe(
      'duplicate-singleton'
    );
  });

  it('panel.remove parks: off every page, instance + owned widgets kept; panel.move docks it again', () => {
    let d = doc();
    d = reduceWorkbenchDocument(d, { type: 'panel.add', panel: panel('panel.a', { state: { n: 2 } }), region: 'main' }).next;
    d = reduceWorkbenchDocument(d, { type: 'zone.ensure', zone: { id: 'panel:panel.a', orientation: 'free' } }).next;
    d = reduceWorkbenchDocument(d, {
      type: 'widget.add',
      widget: { id: 'w.a', type: 'test.widget', zone: 'panel:panel.a', order: 0, size: 'default' },
      zone: 'panel:panel.a'
    }).next;
    const r = reduceWorkbenchDocument(d, { type: 'panel.remove', panelId: 'panel.a' });
    expect(r.success).toBe(true);
    const l = layout(r.next);
    expect(dock(r.next).root.main).toBeNull();
    expect(l.panels['panel.a'].state).toEqual({ n: 2 });
    expect(l.widgets['w.a'].zone).toBe('panel:panel.a');
    expect(selectParkedPanels(l).map((p) => p.id)).toEqual(['panel.a']);

    const back = reduceWorkbenchDocument(r.next, { type: 'panel.move', panelId: 'panel.a', to: { kind: 'region', region: 'right' } });
    expect(back.success).toBe(true);
    expect(selectPanelPlacement(layout(back.next), 'panel.a')).toEqual({ kind: 'docked', pageId: 'page.one' });
  });

  it('panel.remove rejects a missing panel and a locked panel (same rule as panel.close)', () => {
    let d = doc();
    d = reduceWorkbenchDocument(d, { type: 'panel.add', panel: panel('panel.l', { locked: true }), region: 'main' }).next;
    expect(reduceWorkbenchDocument(d, { type: 'panel.remove', panelId: 'nope' }).error?.code).toBe('missing-panel');
    expect(reduceWorkbenchDocument(d, { type: 'panel.remove', panelId: 'panel.l' }).error?.code).toBe('locked-panel');
    expect(reduceWorkbenchDocument(d, { type: 'panel.close', panelId: 'panel.l' }).error?.code).toBe('locked-panel');
  });

  it('panel.close accepts a LOCKED keyless copy while a keyed panel of its type exists; a lone locked panel stays protected', () => {
    let d = doc();
    d = reduceWorkbenchDocument(d, { type: 'panel.add', panel: panel('grid', { type: 't.grid', singletonKey: 'grid', locked: true }), region: 'main' }).next;
    d = reduceWorkbenchDocument(d, { type: 'panel.create', panel: panel('grid.copy', { type: 't.grid', locked: true }) }).next;
    const closed = reduceWorkbenchDocument(d, { type: 'panel.close', panelId: 'grid.copy' });
    expect(closed.success).toBe(true);
    expect(layout(closed.next).panels['grid.copy']).toBeUndefined();
    // The keyed original itself is never closable.
    expect(reduceWorkbenchDocument(d, { type: 'panel.close', panelId: 'grid' }).error?.code).toBe('locked-panel');
    // A locked keyless panel that is the only one of its type stays protected.
    let lone = doc();
    lone = reduceWorkbenchDocument(lone, { type: 'panel.create', panel: panel('solo', { type: 't.solo', locked: true }) }).next;
    expect(reduceWorkbenchDocument(lone, { type: 'panel.close', panelId: 'solo' }).error?.code).toBe('locked-panel');
  });

  it('panel.close stays the hard delete', () => {
    let d = doc();
    d = reduceWorkbenchDocument(d, { type: 'panel.add', panel: panel('panel.a'), region: 'main' }).next;
    const l = layout(reduceWorkbenchDocument(d, { type: 'panel.close', panelId: 'panel.a' }).next);
    expect(l.panels['panel.a']).toBeUndefined();
    expect(selectPanelPlacement(l, 'panel.a')).toBeUndefined();
  });
});

describe('page.setDock', () => {
  function docWithPanels(): WorkbenchDocument {
    let d = twoPageDoc(); // page.two active
    d = reduceWorkbenchDocument(d, { type: 'panel.add', panel: panel('panel.a'), region: 'main' }).next;
    d = reduceWorkbenchDocument(d, { type: 'panel.add', panel: panel('panel.lock', { locked: true }), region: 'right' }).next;
    d = reduceWorkbenchDocument(d, { type: 'page.activate', pageId: 'page.one' }).next;
    d = reduceWorkbenchDocument(d, { type: 'panel.add', panel: panel('panel.one'), region: 'main' }).next;
    d = reduceWorkbenchDocument(d, { type: 'panel.create', panel: panel('panel.parked') }).next;
    return d; // page.one active: [panel.one]; page.two: [panel.a, panel.lock]; parked: panel.parked
  }

  it('without a dock it clears the page and parks every panel on it (locked ones too)', () => {
    const r = reduceWorkbenchDocument(docWithPanels(), { type: 'page.setDock', pageId: 'page.two' });
    expect(r.success).toBe(true);
    const l = layout(r.next);
    expect(panelIdsInPageDock(l.pages['page.two'])).toEqual([]);
    expect(selectParkedPanels(l).map((p) => p.id).sort()).toEqual(['panel.a', 'panel.lock', 'panel.parked']);
    expect(panelIdsInPageDock(l.pages['page.one'])).toEqual(['panel.one']);
  });

  it('docks parked panels, parks the rest, and never takes a panel from another page', () => {
    const next = createEmptyDockLayout();
    next.root.main = { kind: 'tabs', id: 'tabs.n', activePanelId: 'panel.parked', panelIds: ['panel.parked', 'panel.one', 'panel.ghost'] };
    next.regions.bottom.sizePx = 222;
    const r = reduceWorkbenchDocument(docWithPanels(), { type: 'page.setDock', pageId: 'page.two', dock: next });
    expect(r.success).toBe(true);
    const l = layout(r.next);
    expect(panelIdsInPageDock(l.pages['page.two'])).toEqual(['panel.parked']);
    expect(l.pages['page.two'].dock.regions.bottom.sizePx).toBe(222);
    expect(panelIdsInPageDock(l.pages['page.one'])).toEqual(['panel.one']);
    expect(selectParkedPanels(l).map((p) => p.id).sort()).toEqual(['panel.a', 'panel.lock']);
  });

  it('rejects a missing page', () => {
    expect(reduceWorkbenchDocument(doc(), { type: 'page.setDock', pageId: 'nope' }).error?.code).toBe('missing-page');
  });

  it('leaves its input dock unmutated', () => {
    const input = createEmptyDockLayout();
    input.root.main = { kind: 'tabs', id: 'tabs.in', activePanelId: 'panel.one', panelIds: ['panel.one', 'panel.parked'] };
    const snapshot = structuredClone(input);
    reduceWorkbenchDocument(docWithPanels(), { type: 'page.setDock', pageId: 'page.two', dock: input });
    expect(input).toEqual(snapshot);
  });

  it('Clear page (no dock) keeps the region sizes and only empties the roots', () => {
    let d = docWithPanels();
    d = reduceWorkbenchDocument(d, { type: 'page.activate', pageId: 'page.two' }).next;
    d = reduceWorkbenchDocument(d, { type: 'region.resize', region: 'right', sizePx: 444 }).next;
    const l = layout(reduceWorkbenchDocument(d, { type: 'page.setDock', pageId: 'page.two' }).next);
    expect(l.pages['page.two'].dock.regions.right.sizePx).toBe(444);
    expect(Object.values(l.pages['page.two'].dock.root).every((node) => node === null)).toBe(true);
  });
});
