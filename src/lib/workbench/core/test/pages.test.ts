import { describe, expect, it } from 'vitest';
import { createEmptyDockLayout, createEmptyWorkbenchDocument, createEmptyWorkbenchPage } from '../defaults';
import { reduceWorkbenchDocument } from '../reducer';
import type { DockNode, PanelInstance, WorkbenchDocument, WorkbenchPage } from '../schema';
import { activeWorkbenchPage, orderedWorkbenchPages, panelIdsInPageDock, selectActiveLayout } from '../selectors';

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
  it('removes the page, its nav entry, and the panels docked only there', () => {
    let d = twoPageDoc(); // page.two active
    d = reduceWorkbenchDocument(d, { type: 'panel.add', panel: panel('panel.a'), region: 'main' }).next;

    const r = reduceWorkbenchDocument(d, { type: 'page.remove', pageId: 'page.two' });
    expect(r.success).toBe(true);
    const l = layout(r.next);
    expect(l.pages['page.two']).toBeUndefined();
    expect(l.pageOrder).toEqual(['page.one']);
    expect(l.navigation.entries['page:page.two']).toBeUndefined();
    expect(l.navigation.order).not.toContain('page:page.two');
    expect(l.panels['panel.a']).toBeUndefined();
    // It was active — the nearest remaining page takes over.
    expect(l.activePageId).toBe('page.one');
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
