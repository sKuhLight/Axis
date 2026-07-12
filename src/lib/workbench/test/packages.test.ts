import { describe, expect, it } from 'vitest';
import {
  WORKBENCH_PACKAGE_FORMAT,
  WORKBENCH_PACKAGE_VERSION,
  createEmptyWorkbenchDocument,
  createWorkbenchPackage,
  importWorkbenchPackageCommands,
  packageActiveLayout,
  packagePanelTemplate,
  packageProfile,
  packageWidgetTemplate,
  parseWorkbenchPackage,
  reduceWorkbenchDocument,
  selectActiveLayout,
  validateWorkbenchDocument,
  type DockNode,
  type WorkbenchLayout
} from '../index';

/** A layout carrying nested dock structure + grouped widgets — the T02 collision surface. */
function nestedLayout(id: string): WorkbenchLayout {
  const base = createEmptyWorkbenchDocument({ profileId: 'p', layoutId: id }).layouts[id];
  // Pages (schema v2): the nested dock structure lives on the layout's page.
  const page = base.pages[base.activePageId];
  page.dock.root.main = {
    kind: 'split',
    id: 'split-0001',
    axis: 'horizontal',
    ratio: [0.5, 0.5],
    children: [
      { kind: 'tabs', id: 'tabs-0001', activePanelId: 'panel.a', panelIds: ['panel.a'] },
      { kind: 'tabs', id: 'tabs-0002', activePanelId: 'panel.b', panelIds: ['panel.b'] }
    ]
  };
  return {
    ...base,
    panels: {
      'panel.a': { id: 'panel.a', type: 'test.panel', title: 'A' },
      'panel.b': { id: 'panel.b', type: 'test.panel', title: 'B' }
    },
    widgets: {
      'widget.a': { id: 'widget.a', type: 'test.widget', zone: 'panel:panel.a', order: 0, size: 'default', groupId: 'group.g' },
      'widget.b': { id: 'widget.b', type: 'test.widget', zone: 'panel:panel.a', order: 1, size: 'default', groupId: 'group.g' }
    },
    widgetGroups: {
      'group.g': { id: 'group.g', widgetIds: ['widget.a', 'widget.b'] }
    }
  };
}

describe('Workbench portable packages', () => {
  it('packages and parses active layouts', () => {
    const doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test', layoutLabel: 'Studio' });
    const pkg = packageActiveLayout(doc);
    const parsed = parseWorkbenchPackage(pkg);

    expect(pkg).toMatchObject({
      format: WORKBENCH_PACKAGE_FORMAT,
      packageVersion: WORKBENCH_PACKAGE_VERSION,
      schemaVersion: 2,
      kind: 'layout',
      metadata: { title: 'Studio', sourceId: 'layout.test' }
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects invalid package shapes', () => {
    expect(parseWorkbenchPackage(null).success).toBe(false);
    expect(parseWorkbenchPackage({ format: 'wrong' }).success).toBe(false);
    expect(parseWorkbenchPackage({ format: WORKBENCH_PACKAGE_FORMAT, packageVersion: 99 }).success).toBe(false);
  });

  it('creates collision-safe import commands for layouts', () => {
    const doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    const layout = selectActiveLayout(doc)!;
    const pkg = createWorkbenchPackage('layout', layout);

    const commands = importWorkbenchPackageCommands(doc, pkg);
    const importedLayout = commands[0]?.type === 'layout.save' ? commands[0].layout : null;

    expect(commands).toHaveLength(1);
    expect(importedLayout?.id).toBe('layout.test.copy1');
    expect(importedLayout).not.toBe(layout);
  });

  it('deep re-mints interior ids when importing a nested layout into a colliding document', () => {
    // The target document already holds a layout whose interior ids (dock nodes,
    // panels, widgets, group) are IDENTICAL to the imported package. A shallow
    // top-level-only re-key would leave those interior ids duplicated across the two
    // layouts — the T02 keyed-each crash class. The deep re-mint must eliminate them.
    let doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.existing' });
    doc = reduceWorkbenchDocument(doc, { type: 'layout.save', layout: nestedLayout('layout.existing') }).next;

    const pkg = createWorkbenchPackage('layout', nestedLayout('layout.existing'));
    const commands = importWorkbenchPackageCommands(doc, pkg);
    expect(commands).toHaveLength(1);
    expect(commands[0].type).toBe('layout.save');
    const imported = commands[0].type === 'layout.save' ? commands[0].layout : null;
    if (!imported) throw new Error('expected a layout.save command');

    // Top-level id policy is unchanged: de-duped against the existing layout.
    expect(imported.id).toBe('layout.existing.copy1');

    // Gather every interior id from both the existing and the imported layout.
    const interiorIds = (layout: WorkbenchLayout): string[] => {
      const ids: string[] = [];
      const walk = (node: DockNode | null): void => {
        if (!node) return;
        ids.push(node.id);
        if (node.kind === 'split') node.children.forEach(walk);
      };
      for (const page of Object.values(layout.pages)) {
        ids.push(page.id);
        for (const node of Object.values(page.dock.root)) walk(node);
      }
      ids.push(...Object.keys(layout.panels), ...Object.keys(layout.widgets), ...Object.keys(layout.widgetGroups));
      return ids;
    };
    const existing = new Set(interiorIds(doc.layouts['layout.existing']));
    const importedIds = interiorIds(imported);

    // Zero collisions: no imported interior id matches any id already in the document.
    for (const id of importedIds) expect(existing.has(id)).toBe(false);
    // And the imported layout kept none of the original interior ids verbatim.
    expect(importedIds).not.toContain('split-0001');
    expect(importedIds).not.toContain('tabs-0001');
    expect(importedIds).not.toContain('panel.a');
    expect(importedIds).not.toContain('widget.a');
    expect(importedIds).not.toContain('group.g');

    // References stay internally consistent after the re-mint.
    const tabs = Object.values(imported.pages)[0].dock.root.main;
    if (tabs?.kind !== 'split') throw new Error('expected a split root');
    const firstTab = tabs.children[0];
    if (firstTab?.kind !== 'tabs') throw new Error('expected a tabs child');
    const firstPanelId = firstTab.panelIds[0];
    expect(imported.panels[firstPanelId]).toBeTruthy();
    expect(firstTab.activePanelId).toBe(firstPanelId);
    const remintedWidgets = Object.values(imported.widgets);
    const remintedGroupId = Object.keys(imported.widgetGroups)[0];
    expect(remintedWidgets.every((w) => w.groupId === remintedGroupId)).toBe(true);
    expect(imported.widgetGroups[remintedGroupId].widgetIds.sort()).toEqual(remintedWidgets.map((w) => w.id).sort());
    // The `panel:` widget-zone refs follow the re-minted panel ids.
    expect(remintedWidgets.every((w) => imported.panels[w.zone.slice('panel:'.length)])).toBe(true);

    // Adopting the imported layout leaves the whole document valid (no dup-id errors).
    const adopted = reduceWorkbenchDocument(doc, commands[0]).next;
    expect(validateWorkbenchDocument(adopted).valid).toBe(true);
  });

  it('packages profile, panel template, and widget template library entries', () => {
    let doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    doc = reduceWorkbenchDocument(doc, {
      type: 'library.panel.save',
      template: {
        id: 'template.panel',
        title: 'Panel',
        panels: {
          'panel.a': { id: 'panel.a', type: 'test.panel' }
        }
      }
    }).next;
    doc = reduceWorkbenchDocument(doc, {
      type: 'library.widget.save',
      template: {
        id: 'template.widget',
        title: 'Widget',
        widgets: {
          'widget.a': { id: 'widget.a', type: 'test.widget', zone: 'top.left', order: 0, size: 'default' }
        }
      }
    }).next;

    expect(packageProfile(doc, 'profile.test')?.kind).toBe('profile');
    expect(packagePanelTemplate(doc, 'template.panel')?.metadata?.title).toBe('Panel');
    expect(packageWidgetTemplate(doc, 'template.widget')?.metadata?.title).toBe('Widget');
  });

  it('imports panel and widget template packages with safe ids', () => {
    const doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    doc.panelLibrary['template.panel'] = { id: 'template.panel', title: 'Panel', panels: { 'panel.a': { id: 'panel.a', type: 'test.panel' } } };
    doc.widgetLibrary['template.widget'] = {
      id: 'template.widget',
      title: 'Widget',
      widgets: { 'widget.a': { id: 'widget.a', type: 'test.widget', zone: 'top.left', order: 0, size: 'default' } }
    };

    const panelPackage = packagePanelTemplate(doc, 'template.panel')!;
    const widgetPackage = packageWidgetTemplate(doc, 'template.widget')!;
    const panelCommands = importWorkbenchPackageCommands(doc, panelPackage);
    const widgetCommands = importWorkbenchPackageCommands(doc, widgetPackage);

    expect(panelCommands[0]).toMatchObject({ type: 'library.panel.save', template: { id: 'template.panel.copy1' } });
    expect(widgetCommands[0]).toMatchObject({ type: 'library.widget.save', template: { id: 'template.widget.copy1' } });
  });

  it('supports explicit ids and overwrite for imported layouts', () => {
    const doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' });
    const layout = selectActiveLayout(doc)!;
    const pkg = createWorkbenchPackage('layout', layout);
    const explicit = importWorkbenchPackageCommands(doc, pkg, { id: 'layout.imported' });
    const overwrite = importWorkbenchPackageCommands(doc, pkg, { overwrite: true });

    expect((explicit[0] as { type: 'layout.save'; layout: WorkbenchLayout }).layout.id).toBe('layout.imported');
    expect((overwrite[0] as { type: 'layout.save'; layout: WorkbenchLayout }).layout.id).toBe('layout.test');
  });
});
