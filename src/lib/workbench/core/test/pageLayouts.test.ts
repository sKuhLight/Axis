import { describe, expect, it } from 'vitest';
import { createEmptyWorkbenchDocument, createEmptyWorkbenchPage } from '../defaults';
import { reduceWorkbenchDocument } from '../reducer';
import {
  exportPageLayoutPackage,
  importPageLayoutPackage,
  PAGE_LAYOUT_PACKAGE_KIND
} from '../layoutPackage';
import type { WorkbenchDocument, WorkbenchPage, WorkbenchPageLayout } from '../schema';
import { activeWorkbenchPage, panelIdsInPageDock, selectActiveLayout } from '../selectors';

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

  it('replaces the target page dock, dropping its previous panels', () => {
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
    const l = layout(r.next);
    // Old panels gone from the layout entirely; exactly one (re-minted) remains on the page.
    expect(l.panels['panel.a']).toBeUndefined();
    expect(l.panels['panel.b']).toBeUndefined();
    expect(panelIdsInPageDock(l.pages['page.one']).length).toBe(1);
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
