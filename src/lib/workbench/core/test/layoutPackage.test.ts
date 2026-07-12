import { describe, expect, it } from 'vitest';
import {
  LAYOUT_PACKAGE_KIND,
  LAYOUT_PACKAGE_VERSION,
  PANEL_PACKAGE_KIND,
  WORKBENCH_SCHEMA_VERSION,
  createDefaultWidgetZoneLayout,
  createEmptyNavigationLayout,
  exportLayoutPackage,
  exportPanelPackage,
  importLayoutPackage,
  importPanelPackage,
  layoutPackageFilename
} from '../index';
import type { DockNode, PanelTemplate, WorkbenchLayout } from '../schema';

function richLayout(): WorkbenchLayout {
  const tabsA: DockNode = { kind: 'tabs', id: 'tabs-0001', activePanelId: 'panel.a', panelIds: ['panel.a'] };
  const tabsB: DockNode = { kind: 'tabs', id: 'tabs-0002', activePanelId: 'panel.b', panelIds: ['panel.b'] };
  const split: DockNode = { kind: 'split', id: 'split-0001', axis: 'horizontal', ratio: [0.5, 0.5], children: [tabsA, tabsB] };
  return {
    id: 'layout.studio',
    label: 'Studio',
    pages: {
      'page.studio': {
        id: 'page.studio',
        label: 'Studio Page',
        dock: {
          regions: {
            left: { collapsed: false },
            right: { collapsed: false },
            top: { collapsed: false },
            bottom: { collapsed: false },
            main: { collapsed: false }
          },
          root: { left: null, right: null, top: null, bottom: null, main: split }
        }
      }
    },
    pageOrder: ['page.studio'],
    activePageId: 'page.studio',
    panels: {
      'panel.a': { id: 'panel.a', type: 'workbench.customPanel', title: 'A', state: { acceptsWidgets: true } },
      'panel.b': { id: 'panel.b', type: 'test.panel', title: 'B' }
    },
    widgets: {
      'widget.x': { id: 'widget.x', type: 'test.knob', zone: 'panel:panel.a', order: 0, size: 'default', groupId: 'group.1' },
      'widget.y': { id: 'widget.y', type: 'test.knob', zone: 'panel:panel.a', order: 1, size: 'default', groupId: 'group.1' },
      'widget.z': { id: 'widget.z', type: 'test.knob', zone: 'top.right', order: 0, size: 'default' }
    },
    widgetGroups: {
      'group.1': { id: 'group.1', widgetIds: ['widget.x', 'widget.y'] }
    },
    navigation: createEmptyNavigationLayout(),
    zones: createDefaultWidgetZoneLayout()
  };
}

function docWith(layout: WorkbenchLayout) {
  return { layouts: { [layout.id]: layout } };
}

// Pages (schema v2): the layout's docks live on its pages.
const firstPageDock = (layout: WorkbenchLayout) => Object.values(layout.pages)[0].dock;

describe('layoutPackage export/import (T29)', () => {
  it('exports a versioned, self-contained layout package', () => {
    const pkg = exportLayoutPackage(docWith(richLayout()), 'layout.studio');
    expect(pkg).toMatchObject({
      kind: LAYOUT_PACKAGE_KIND,
      version: LAYOUT_PACKAGE_VERSION,
      schemaVersion: WORKBENCH_SCHEMA_VERSION
    });
    // deep-cloned, not the same object
    expect(pkg!.layout).not.toBe(richLayout());
    expect(exportLayoutPackage(docWith(richLayout()), 'missing')).toBeNull();
  });

  it('round-trips into a doc that already contains the original with ZERO id collisions', () => {
    const original = richLayout();
    const pkg = exportLayoutPackage(docWith(original), 'layout.studio')!;
    const result = importLayoutPackage(pkg);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const imported = result.payload;

    // Collect every id on both sides.
    const collect = (l: WorkbenchLayout): string[] => {
      const ids: string[] = [l.id, ...Object.keys(l.pages), ...Object.keys(l.panels), ...Object.keys(l.widgets), ...Object.keys(l.widgetGroups)];
      const walk = (node: DockNode | null): void => {
        if (!node) return;
        ids.push(node.id);
        if (node.kind === 'split') node.children.forEach(walk);
      };
      for (const page of Object.values(l.pages)) Object.values(page.dock.root).forEach(walk);
      return ids;
    };
    const originalIds = new Set(collect(original));
    const importedIds = collect(imported);

    // No imported id reuses any original id.
    for (const id of importedIds) expect(originalIds.has(id)).toBe(false);
    // No duplicates within the imported layout.
    expect(new Set(importedIds).size).toBe(importedIds.length);
  });

  it('re-mints dock-node ids (tabs + split) and keeps panel references consistent', () => {
    const pkg = exportLayoutPackage(docWith(richLayout()), 'layout.studio')!;
    const result = importLayoutPackage(pkg);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const dock = firstPageDock(result.payload).root.main as Extract<DockNode, { kind: 'split' }>;

    expect(dock.kind).toBe('split');
    expect(dock.id).not.toBe('split-0001');
    for (const child of dock.children) {
      const tabs = child as Extract<DockNode, { kind: 'tabs' }>;
      expect(tabs.kind).toBe('tabs');
      expect(['tabs-0001', 'tabs-0002']).not.toContain(tabs.id);
      // every panelId referenced by the tab stack exists in the imported panels
      for (const pid of tabs.panelIds) expect(result.payload.panels[pid]).toBeTruthy();
      expect(result.payload.panels[tabs.activePanelId]).toBeTruthy();
    }
  });

  it('re-maps panel: widget-zone references and group membership through the id map', () => {
    const pkg = exportLayoutPackage(docWith(richLayout()), 'layout.studio')!;
    const result = importLayoutPackage(pkg);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const { panels, widgets, widgetGroups } = result.payload;
    const panelIds = new Set(Object.keys(panels));
    const groupIds = new Set(Object.keys(widgetGroups));

    for (const widget of Object.values(widgets)) {
      if (widget.zone.startsWith('panel:')) {
        expect(panelIds.has(widget.zone.slice('panel:'.length))).toBe(true);
      }
      if (widget.groupId) expect(groupIds.has(widget.groupId)).toBe(true);
    }
    for (const group of Object.values(widgetGroups)) {
      for (const wid of group.widgetIds) expect(widgets[wid]).toBeTruthy();
    }
  });

  it('imports clean-validating layouts (repaired probe passes validateWorkbenchDocument)', () => {
    const pkg = exportLayoutPackage(docWith(richLayout()), 'layout.studio')!;
    const result = importLayoutPackage(pkg);
    // If validation had failed the result would carry invalid-after-import.
    expect(result.success).toBe(true);
  });

  it('rejects wrong-kind, wrong-version, wrong-schema-version, and malformed packages', () => {
    const good = exportLayoutPackage(docWith(richLayout()), 'layout.studio')!;

    const nullResult = importLayoutPackage(null);
    expect(nullResult.success).toBe(false);
    if (!nullResult.success) expect(nullResult.error.code).toBe('not-an-object');

    const wrongKind = importLayoutPackage({ ...good, kind: PANEL_PACKAGE_KIND });
    expect(wrongKind.success).toBe(false);
    if (!wrongKind.success) expect(wrongKind.error.code).toBe('wrong-kind');

    const wrongVersion = importLayoutPackage({ ...good, version: 99 });
    expect(wrongVersion.success).toBe(false);
    if (!wrongVersion.success) expect(wrongVersion.error.code).toBe('wrong-version');

    const wrongSchema = importLayoutPackage({ ...good, schemaVersion: 99 });
    expect(wrongSchema.success).toBe(false);
    if (!wrongSchema.success) expect(wrongSchema.error.code).toBe('wrong-schema-version');

    const malformed = importLayoutPackage({ ...good, layout: { id: 'x' } });
    expect(malformed.success).toBe(false);
    if (!malformed.success) expect(malformed.error.code).toBe('malformed');
  });

  it('round-trips a MULTI-PAGE layout: pages, order, active page, and nav bindings all remap', () => {
    const layout = richLayout();
    // Second page with its own dock tree + panel.
    layout.panels['panel.c'] = { id: 'panel.c', type: 'test.panel', title: 'C' };
    layout.pages['page.live'] = {
      id: 'page.live',
      label: 'Live',
      dock: {
        regions: {
          left: { collapsed: false },
          right: { collapsed: false },
          top: { collapsed: false },
          bottom: { collapsed: false },
          main: { collapsed: false }
        },
        root: {
          left: null,
          right: null,
          top: null,
          bottom: null,
          main: { kind: 'tabs', id: 'tabs-0003', activePanelId: 'panel.c', panelIds: ['panel.c'] }
        }
      }
    };
    layout.pageOrder = ['page.studio', 'page.live'];
    layout.activePageId = 'page.live';
    layout.navigation.entries['page:live'] = { id: 'page:live', label: 'Live', pageId: 'page.live' };
    layout.navigation.order = ['page:live'];

    const pkg = exportLayoutPackage(docWith(layout), 'layout.studio')!;
    const result = importLayoutPackage(pkg);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const imported = result.payload;

    // Both pages survive with fresh ids, order + active page follow the map.
    expect(Object.keys(imported.pages)).toHaveLength(2);
    expect(imported.pageOrder).toHaveLength(2);
    for (const id of imported.pageOrder) expect(imported.pages[id]).toBeDefined();
    expect(['page.studio', 'page.live']).not.toContain(imported.pageOrder[0]);
    expect(imported.activePageId).toBe(imported.pageOrder[1]);

    // The nav page binding follows the re-minted page id.
    const navEntry = Object.values(imported.navigation.entries).find((e) => e.pageId);
    expect(navEntry).toBeDefined();
    expect(imported.pages[navEntry!.pageId!]).toBeDefined();
    expect(navEntry!.pageId).not.toBe('page.live');

    // Per-page panel references stay consistent.
    for (const page of Object.values(imported.pages)) {
      for (const node of Object.values(page.dock.root)) {
        if (node?.kind === 'tabs') {
          for (const pid of node.panelIds) expect(imported.panels[pid]).toBeTruthy();
        }
      }
    }
  });

  it('imports a legacy schema-v1 package (single dock) as a single-page layout', () => {
    const layout = richLayout();
    // Rebuild the payload in v1 shape: dock on the layout, no pages fields.
    const { pages: _pages, pageOrder: _pageOrder, activePageId: _activePageId, ...rest } = layout;
    const legacy = { ...rest, dock: layout.pages['page.studio'].dock };

    const pkg = { ...exportLayoutPackage(docWith(layout), 'layout.studio')!, schemaVersion: 1, layout: legacy };
    const result = importLayoutPackage(pkg);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const imported = result.payload;

    expect(Object.keys(imported.pages)).toHaveLength(1);
    const page = Object.values(imported.pages)[0];
    const main = page.dock.root.main;
    expect(main?.kind).toBe('split');
    // Interior ids were still re-minted on the legacy path.
    expect(main?.id).not.toBe('split-0001');
  });

  it('exports and re-mints panel-template packages', () => {
    const template: PanelTemplate = {
      id: 'template.panel',
      title: 'My Panel',
      panels: { 'panel.a': { id: 'panel.a', type: 'workbench.customPanel', title: 'A' } },
      widgets: { 'widget.x': { id: 'widget.x', type: 'test.knob', zone: 'panel:panel.a', order: 0, size: 'default' } },
      dock: { kind: 'tabs', id: 'tabs-0001', activePanelId: 'panel.a', panelIds: ['panel.a'] }
    };
    const pkg = exportPanelPackage({ panelLibrary: { 'template.panel': template } }, 'template.panel')!;
    expect(pkg.kind).toBe(PANEL_PACKAGE_KIND);

    const result = importPanelPackage(pkg);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const imported = result.payload;
    expect(imported.id).not.toBe('template.panel');
    expect(Object.keys(imported.panels)[0]).not.toBe('panel.a');
    const dock = imported.dock as Extract<DockNode, { kind: 'tabs' }>;
    expect(dock.id).not.toBe('tabs-0001');
    expect(imported.panels[dock.panelIds[0]]).toBeTruthy();
    // widget zone remapped to the new panel id
    const widget = Object.values(imported.widgets!)[0];
    expect(widget.zone.startsWith('panel:')).toBe(true);
    expect(imported.panels[widget.zone.slice('panel:'.length)]).toBeTruthy();
  });

  it('rejects panel packages presented to the layout importer and vice-versa', () => {
    const layoutPkg = exportLayoutPackage(docWith(richLayout()), 'layout.studio')!;
    const panelPkg = exportPanelPackage(
      { panelLibrary: { t: { id: 't', title: 'T', panels: { p: { id: 'p', type: 'x' } } } } },
      't'
    )!;
    expect(importPanelPackage(layoutPkg).success).toBe(false);
    expect(importLayoutPackage(panelPkg).success).toBe(false);
  });

  it('derives a filesystem-safe filename stem', () => {
    expect(layoutPackageFilename('My Studio Layout!')).toBe('my-studio-layout');
    expect(layoutPackageFilename('   ')).toBe('layout');
  });
});
