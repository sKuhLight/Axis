import { describe, expect, it } from 'vitest';
import { createEmptyWorkbenchDocument, createEmptyWorkbenchPage } from '../defaults';
import { reduceWorkbenchDocument } from '../reducer';
import {
  exportPageLayoutPackage,
  importPageLayoutPackage,
  PAGE_LAYOUT_PACKAGE_KIND
} from '../layoutPackage';
import type { PanelInstance, WorkbenchDocument, WorkbenchPage, WorkbenchPageLayout } from '../schema';
import { activeWorkbenchPage, panelIdsInPageDock, selectActiveLayout, selectPanelPlacement } from '../selectors';

const doc = (): WorkbenchDocument =>
  createEmptyWorkbenchDocument({
    profileId: 'profile.test',
    layoutId: 'layout.test',
    pageId: 'page.one',
    pageLabel: 'One'
  });

const layout = (d: WorkbenchDocument) => selectActiveLayout(d)!;
const page = (id: string, label = id): WorkbenchPage => createEmptyWorkbenchPage({ id, label });

/** Doc with pages one (a panel docked) + two (empty); page one active. */
function seeded(): WorkbenchDocument {
  let d = doc();
  d = reduceWorkbenchDocument(d, { type: 'page.add', page: page('page.two', 'Two') }).next;
  d = reduceWorkbenchDocument(d, {
    type: 'panel.add',
    panel: { id: 'panel.a', type: 'test.panel', title: 'A' },
    region: 'main'
  }).next;
  return d;
}

const pageLayoutFrom = (d: WorkbenchDocument, id = 'pl.1', label = 'Saved'): WorkbenchPageLayout => {
  const l = layout(d);
  const src = l.pages[l.activePageId];
  const panels = Object.fromEntries(
    panelIdsInPageDock(src)
      .filter((pid) => l.panels[pid])
      .map((pid) => [pid, l.panels[pid]])
  );
  return { id, label, page: structuredClone(src), panels: structuredClone(panels) };
};

describe('page.move', () => {
  it('reorders pageOrder and keeps the bound nav entries in sync', () => {
    let d = doc();
    d = reduceWorkbenchDocument(d, { type: 'page.add', page: page('page.two', 'Two') }).next;
    d = reduceWorkbenchDocument(d, { type: 'page.add', page: page('page.three', 'Three') }).next;
    const before = layout(d);
    expect(before.pageOrder).toEqual(['page.one', 'page.two', 'page.three']);

    const r = reduceWorkbenchDocument(d, { type: 'page.move', pageId: 'page.three', index: 0 });
    expect(r.success).toBe(true);
    const l = layout(r.next);
    expect(l.pageOrder).toEqual(['page.three', 'page.one', 'page.two']);
    // The page-bound nav entries follow the new page order. (The seed first page
    // has no bound nav entry — only pages added via page.add do — so only two/
    // three appear here; they still land in the new relative order.)
    const pageEntries = l.navigation.order.filter((id) => l.navigation.entries[id]?.pageId);
    expect(pageEntries).toEqual(['page:page.three', 'page:page.two']);
  });

  it('rejects an unknown page', () => {
    const r = reduceWorkbenchDocument(doc(), { type: 'page.move', pageId: 'nope', index: 0 });
    expect(r.success).toBe(false);
    expect(r.error?.code).toBe('missing-page');
  });
});

describe('pageLayout store', () => {
  it('saves, renames and deletes a page layout', () => {
    let d = seeded();
    const pl = pageLayoutFrom(d);
    d = reduceWorkbenchDocument(d, { type: 'pageLayout.save', pageLayout: pl }).next;
    expect(d.pageLayouts['pl.1']).toMatchObject({ id: 'pl.1', label: 'Saved' });

    d = reduceWorkbenchDocument(d, { type: 'pageLayout.rename', pageLayoutId: 'pl.1', label: 'Renamed' }).next;
    expect(d.pageLayouts['pl.1'].label).toBe('Renamed');

    d = reduceWorkbenchDocument(d, { type: 'pageLayout.delete', pageLayoutId: 'pl.1' }).next;
    expect(d.pageLayouts['pl.1']).toBeUndefined();
  });

  it('rename/delete/apply reject an unknown id', () => {
    const d = seeded();
    for (const command of [
      { type: 'pageLayout.rename', pageLayoutId: 'x', label: 'y' },
      { type: 'pageLayout.delete', pageLayoutId: 'x' },
      { type: 'pageLayout.apply', pageLayoutId: 'x' }
    ] as const) {
      const r = reduceWorkbenchDocument(d, command);
      expect(r.success).toBe(false);
      expect(r.error?.code).toBe('missing-page-layout');
    }
  });

  it('applies a stored layout onto the active page with fresh, non-colliding ids', () => {
    let d = seeded();
    d = reduceWorkbenchDocument(d, { type: 'pageLayout.save', pageLayout: pageLayoutFrom(d) }).next;
    // Switch to the empty page two and apply.
    d = reduceWorkbenchDocument(d, { type: 'page.activate', pageId: 'page.two' }).next;
    const beforePanelIds = Object.keys(layout(d).panels);

    const r = reduceWorkbenchDocument(d, { type: 'pageLayout.apply', pageLayoutId: 'pl.1' });
    expect(r.success).toBe(true);
    const l = layout(r.next);
    // Page two keeps its identity but gains the stored dock's panel.
    const two = l.pages['page.two'];
    const appliedPanels = panelIdsInPageDock(two);
    expect(appliedPanels.length).toBe(1);
    // Fresh id — must not equal the stored 'panel.a' nor collide with page one's.
    expect(appliedPanels[0]).not.toBe('panel.a');
    expect(beforePanelIds).not.toContain(appliedPanels[0]);
    // Page one's original panel is untouched (panel-in-≤1-page invariant holds).
    expect(panelIdsInPageDock(l.pages['page.one'])).toEqual(['panel.a']);
    expect(two.label).toBe('Two');
  });

  it('replaces the target page dock: an identical instance is reused, the rest is PARKED (never deleted)', () => {
    let d = seeded();
    d = reduceWorkbenchDocument(d, { type: 'pageLayout.save', pageLayout: pageLayoutFrom(d) }).next;
    // Give page one a second panel, then apply the (one-panel) layout back onto it.
    d = reduceWorkbenchDocument(d, {
      type: 'panel.add',
      panel: { id: 'panel.b', type: 'test.panel', title: 'B' },
      region: 'right'
    }).next;
    expect(panelIdsInPageDock(layout(d).pages['page.one']).sort()).toEqual(['panel.a', 'panel.b']);

    const r = reduceWorkbenchDocument(d, { type: 'pageLayout.apply', pageLayoutId: 'pl.1' });
    expect(r.success).toBe(true);
    const l = layout(r.next);
    // panel.a matches the stored panel (type + title + state) → reused, no copy.
    expect(panelIdsInPageDock(l.pages['page.one'])).toEqual(['panel.a']);
    // panel.b is parked: still in the roster, on no page.
    expect(l.panels['panel.b']).toBeDefined();
    expect(selectPanelPlacement(l, 'panel.b')).toEqual({ kind: 'parked' });
    expect(Object.keys(l.panels).sort()).toEqual(['panel.a', 'panel.b']);
  });
});

describe('pageLayout.apply never deletes or duplicates', () => {
  const keyed = (id: string, extra: Partial<PanelInstance> = {}): PanelInstance => ({
    id,
    type: 'test.grid',
    title: 'Grid',
    singletonKey: 'grid',
    locked: true,
    closable: false,
    ...extra
  });

  /** page one: [grid (keyed, locked), custom (owns a widget)]; page two empty; one stored layout of page one. */
  function withGrid(): WorkbenchDocument {
    let d = doc();
    d = reduceWorkbenchDocument(d, { type: 'page.add', page: page('page.two', 'Two') }).next;
    d = reduceWorkbenchDocument(d, { type: 'panel.add', panel: keyed('grid'), region: 'main' }).next;
    d = reduceWorkbenchDocument(d, { type: 'pageLayout.save', pageLayout: pageLayoutFrom(d, 'pl.grid', 'Grid layout') }).next;
    d = reduceWorkbenchDocument(d, { type: 'panel.add', panel: { id: 'custom', type: 'x.customPanel', title: 'Custom' }, region: 'right' }).next;
    d = reduceWorkbenchDocument(d, { type: 'zone.ensure', zone: { id: 'panel:custom', orientation: 'free' } }).next;
    d = reduceWorkbenchDocument(d, {
      type: 'widget.add',
      widget: { id: 'w.custom', type: 'w', zone: 'panel:custom', order: 0, size: 'default' },
      zone: 'panel:custom'
    }).next;
    return d;
  }

  it('maps a stored single-instance panel onto THE instance with that key (no keyless copy)', () => {
    const r = reduceWorkbenchDocument(withGrid(), { type: 'pageLayout.apply', pageLayoutId: 'pl.grid' });
    expect(r.success).toBe(true);
    const l = layout(r.next);
    expect(panelIdsInPageDock(l.pages['page.one'])).toEqual(['grid']);
    expect(Object.values(l.panels).filter((p) => p.type === 'test.grid')).toHaveLength(1);
    expect(l.panels.grid).toMatchObject({ singletonKey: 'grid', locked: true });
    expect(r.warnings).toBeUndefined();
  });

  it('an instance docked on ANOTHER page stays there and is reported', () => {
    let d = withGrid();
    d = reduceWorkbenchDocument(d, { type: 'page.activate', pageId: 'page.two' }).next;
    const r = reduceWorkbenchDocument(d, { type: 'pageLayout.apply', pageLayoutId: 'pl.grid' });
    expect(r.success).toBe(true);
    const l = layout(r.next);
    expect(panelIdsInPageDock(l.pages['page.one'])).toContain('grid');
    expect(panelIdsInPageDock(l.pages['page.two'])).toEqual([]);
    expect(r.warnings).toEqual(['1 panel stays on another page']);
  });

  it('creates the keyed instance when none exists', () => {
    let d = withGrid();
    d = reduceWorkbenchDocument(d, { type: 'page.activate', pageId: 'page.two' }).next;
    d = reduceWorkbenchDocument(d, { type: 'page.remove', pageId: 'page.one' }).next; // grid parked
    // Simulate an old document that lost it (locked: hard-delete via repair-free edit).
    const lost = structuredClone(d);
    delete layout(lost).panels.grid;
    const r = reduceWorkbenchDocument(lost, { type: 'pageLayout.apply', pageLayoutId: 'pl.grid' });
    expect(r.success).toBe(true);
    const created = Object.values(layout(r.next).panels).filter((p) => p.singletonKey === 'grid');
    expect(created).toHaveLength(1);
    expect(panelIdsInPageDock(layout(r.next).pages['page.two'])).toEqual([created[0].id]);
  });

  it('parks the target page panels the new dock does not use; custom panels keep their widgets', () => {
    const r = reduceWorkbenchDocument(withGrid(), { type: 'pageLayout.apply', pageLayoutId: 'pl.grid' });
    const l = layout(r.next);
    expect(selectPanelPlacement(l, 'custom')).toEqual({ kind: 'parked' });
    expect(l.zones['panel:custom']).toBeDefined();
    expect(l.widgets['w.custom'].zone).toBe('panel:custom');
  });

  it('applying the same layout twice creates nothing new (keyless panels are reused)', () => {
    let d = seeded();
    d = reduceWorkbenchDocument(d, { type: 'pageLayout.save', pageLayout: pageLayoutFrom(d) }).next;
    d = reduceWorkbenchDocument(d, { type: 'page.activate', pageId: 'page.two' }).next;
    d = reduceWorkbenchDocument(d, { type: 'pageLayout.apply', pageLayoutId: 'pl.1' }).next;
    const once = Object.keys(layout(d).panels).sort();
    const docked = panelIdsInPageDock(layout(d).pages['page.two']);
    d = reduceWorkbenchDocument(d, { type: 'pageLayout.apply', pageLayoutId: 'pl.1' }).next;
    expect(Object.keys(layout(d).panels).sort()).toEqual(once);
    expect(panelIdsInPageDock(layout(d).pages['page.two'])).toEqual(docked);
    // Page one's panel.a (identical, but on another page) was never taken.
    expect(panelIdsInPageDock(layout(d).pages['page.one'])).toEqual(['panel.a']);
  });

  it('a parked identical keyless panel is reused before a copy is minted', () => {
    let d = seeded();
    d = reduceWorkbenchDocument(d, { type: 'pageLayout.save', pageLayout: pageLayoutFrom(d) }).next;
    d = reduceWorkbenchDocument(d, { type: 'panel.remove', panelId: 'panel.a' }).next; // parked
    d = reduceWorkbenchDocument(d, { type: 'page.activate', pageId: 'page.two' }).next;
    const r = reduceWorkbenchDocument(d, { type: 'pageLayout.apply', pageLayoutId: 'pl.1' });
    expect(panelIdsInPageDock(layout(r.next).pages['page.two'])).toEqual(['panel.a']);
    expect(Object.keys(layout(r.next).panels)).toEqual(['panel.a']);
  });

  it('prefers the target page\'s own custom panel over an empty parked twin (never swaps a panel with widgets for an empty one)', () => {
    const custom = (id: string): PanelInstance => ({ id, type: 'x.customPanel', title: 'Custom Panel' });
    let d = doc();
    d = reduceWorkbenchDocument(d, { type: 'page.add', page: page('page.two', 'Two') }).next;
    // Store a layout of page one holding one (empty) custom panel.
    d = reduceWorkbenchDocument(d, { type: 'panel.add', panel: custom('c.stored'), region: 'main' }).next;
    d = reduceWorkbenchDocument(d, { type: 'pageLayout.save', pageLayout: pageLayoutFrom(d, 'pl.c', 'Custom') }).next;
    d = reduceWorkbenchDocument(d, { type: 'panel.remove', panelId: 'c.stored' }).next; // an EMPTY parked twin
    // Page one now carries custom panel A WITH a widget.
    d = reduceWorkbenchDocument(d, { type: 'panel.add', panel: custom('c.A'), region: 'main' }).next;
    d = reduceWorkbenchDocument(d, { type: 'zone.ensure', zone: { id: 'panel:c.A', orientation: 'free' } }).next;
    d = reduceWorkbenchDocument(d, {
      type: 'widget.add',
      widget: { id: 'w.A', type: 'w', zone: 'panel:c.A', order: 0, size: 'default' },
      zone: 'panel:c.A'
    }).next;
    const r = reduceWorkbenchDocument(d, { type: 'pageLayout.apply', pageLayoutId: 'pl.c' });
    const l = layout(r.next);
    expect(panelIdsInPageDock(l.pages['page.one'])).toEqual(['c.A']);
    expect(l.widgets['w.A'].zone).toBe('panel:c.A');
    expect(selectPanelPlacement(l, 'c.stored')).toEqual({ kind: 'parked' });
  });

  it('a parked twin that carries widgets is never reused; an absent state equals {}', () => {
    let d = seeded();
    d = reduceWorkbenchDocument(d, { type: 'pageLayout.save', pageLayout: pageLayoutFrom(d) }).next;
    d = reduceWorkbenchDocument(d, { type: 'panel.remove', panelId: 'panel.a' }).next; // parked...
    d = reduceWorkbenchDocument(d, { type: 'zone.ensure', zone: { id: 'panel:panel.a', orientation: 'free' } }).next;
    d = reduceWorkbenchDocument(d, {
      type: 'widget.add',
      widget: { id: 'w.a', type: 'w', zone: 'panel:panel.a', order: 0, size: 'default' },
      zone: 'panel:panel.a'
    }).next; // ...but carrying a widget
    d = reduceWorkbenchDocument(d, { type: 'page.activate', pageId: 'page.two' }).next;
    const r = reduceWorkbenchDocument(d, { type: 'pageLayout.apply', pageLayoutId: 'pl.1' });
    const docked = panelIdsInPageDock(layout(r.next).pages['page.two']);
    expect(docked).toHaveLength(1);
    expect(docked[0]).not.toBe('panel.a');

    // state {} on the live twin matches the stored panel without a state.
    let e = seeded();
    e = reduceWorkbenchDocument(e, { type: 'pageLayout.save', pageLayout: pageLayoutFrom(e) }).next;
    e = reduceWorkbenchDocument(e, { type: 'panel.close', panelId: 'panel.a' }).next;
    e = reduceWorkbenchDocument(e, { type: 'panel.create', panel: { id: 'panel.z', type: 'test.panel', title: 'A', state: {} } }).next;
    e = reduceWorkbenchDocument(e, { type: 'page.activate', pageId: 'page.two' }).next;
    expect(panelIdsInPageDock(layout(reduceWorkbenchDocument(e, { type: 'pageLayout.apply', pageLayoutId: 'pl.1' }).next).pages['page.two'])).toEqual([
      'panel.z'
    ]);
  });

  it('counts a single-instance panel kept on another page once, even when the stored layout references it twice', () => {
    let d = withGrid();
    // A stored layout with two entries carrying the same key.
    const stored = structuredClone(d.pageLayouts['pl.grid']);
    stored.id = 'pl.twice';
    stored.panels['grid.twin'] = { ...stored.panels.grid, id: 'grid.twin' };
    stored.page.dock.root.right = { kind: 'tabs', id: 'tabs.twin', activePanelId: 'grid.twin', panelIds: ['grid.twin'] };
    d = reduceWorkbenchDocument(d, { type: 'pageLayout.save', pageLayout: stored }).next;
    d = reduceWorkbenchDocument(d, { type: 'page.activate', pageId: 'page.two' }).next;
    expect(reduceWorkbenchDocument(d, { type: 'pageLayout.apply', pageLayoutId: 'pl.twice' }).warnings).toEqual(['1 panel stays on another page']);
  });

  it('keeps the target page identity and is one undoable step (rejects an unknown target page)', () => {
    let d = withGrid();
    const r = reduceWorkbenchDocument(d, { type: 'pageLayout.apply', pageLayoutId: 'pl.grid' });
    expect(layout(r.next).pages['page.one'].label).toBe('One');
    d = r.next;
    expect(reduceWorkbenchDocument(d, { type: 'pageLayout.apply', pageLayoutId: 'pl.grid', pageId: 'nope' }).error?.code).toBe('missing-page');
  });
});

describe('page-layout package', () => {
  it('round-trips through export → import with re-minted interior ids', () => {
    let d = seeded();
    d = reduceWorkbenchDocument(d, { type: 'pageLayout.save', pageLayout: pageLayoutFrom(d) }).next;
    const pkg = exportPageLayoutPackage(d, 'pl.1');
    expect(pkg?.kind).toBe(PAGE_LAYOUT_PACKAGE_KIND);

    const imported = importPageLayoutPackage(pkg);
    expect(imported.success).toBe(true);
    if (!imported.success) return;
    // Fresh top-level + interior ids so a re-import into the source document is safe.
    expect(imported.payload.id).not.toBe('pl.1');
    expect(Object.keys(imported.payload.panels)).not.toContain('panel.a');
    expect(imported.payload.label).toBe('Saved');
  });

  it('rejects a non-page-layout package', () => {
    const bad = importPageLayoutPackage({ kind: 'workbench.layout.package', version: 1, schemaVersion: 2, layout: {} });
    expect(bad.success).toBe(false);
  });
});
