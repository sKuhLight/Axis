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
  type WorkbenchLayout
} from '../index';

describe('Workbench portable packages', () => {
  it('packages and parses active layouts', () => {
    const doc = createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test', layoutLabel: 'Studio' });
    const pkg = packageActiveLayout(doc);
    const parsed = parseWorkbenchPackage(pkg);

    expect(pkg).toMatchObject({
      format: WORKBENCH_PACKAGE_FORMAT,
      packageVersion: WORKBENCH_PACKAGE_VERSION,
      schemaVersion: 1,
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
