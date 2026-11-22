import { afterEach, describe, expect, it } from 'vitest';
import {
  PAGE_LAYOUT_PACKAGE_KIND,
  createEmptyWorkbenchDocument,
  exportLayoutPackage,
  exportPageLayoutPackage,
  exportPanelPackage,
  type PanelTemplate,
  type WorkbenchDocument
} from '../../core';
import { createWorkbenchController } from '../controller.svelte';
import {
  applyLayoutImport,
  applySavedPageLayout,
  classifyLayoutImport,
  exportActivePageLayout,
  exportSavedPageLayout,
  getWorkbenchBackupProvider,
  importLayoutFile,
  listWorkbenchBackups,
  parseLayoutImport,
  registerWorkbenchBackupProvider,
  restoreWorkbenchBackup,
  savePageAsLayout,
  workbenchBackupTimestamp,
  type WorkbenchBackupEntry
} from '../layoutActions';

function docWithPanel(): WorkbenchDocument {
  const controller = createWorkbenchController(createEmptyWorkbenchDocument({ profileId: 'profile.test', layoutId: 'layout.test' }));
  controller.dispatch({ type: 'panel.add', panel: { id: 'panel.a', type: 'test.panel', title: 'A' }, region: 'main' });
  return controller.document;
}

const template: PanelTemplate = {
  id: 'template.panel',
  title: 'My Panel',
  panels: { 'panel.t': { id: 'panel.t', type: 'workbench.customPanel', title: 'T' } },
  dock: { kind: 'tabs', id: 'tabs-0001', activePanelId: 'panel.t', panelIds: ['panel.t'] }
};

describe('save / apply', () => {
  it('saves the active page as a numbered page layout', () => {
    const controller = createWorkbenchController(docWithPanel());
    const page = controller.activePage!;
    const status = savePageAsLayout(controller);
    expect(status.tone).toBe('ok');
    expect(controller.pageLayouts).toHaveLength(1);
    expect(controller.pageLayouts[0].label).toBe(`${page.label} Layout 1`);
    expect(status.message).toContain(`${page.label} Layout 1`);
    expect(savePageAsLayout(controller).message).toContain('Layout 2');
  });

  it('applies a saved layout onto the active page and reports the target page', () => {
    const controller = createWorkbenchController(docWithPanel());
    savePageAsLayout(controller);
    const saved = controller.pageLayouts[0];
    const status = applySavedPageLayout(controller, saved.id);
    expect(status).toEqual({ tone: 'ok', message: `Applied “${saved.label}” to ${controller.activePage!.label}.` });
  });

  it('reports a failed apply as an error', () => {
    const controller = createWorkbenchController(docWithPanel());
    expect(applySavedPageLayout(controller, 'nope').tone).toBe('error');
  });
});

describe('export', () => {
  it('exports the active page as a page-layout package download', () => {
    const doc = docWithPanel();
    const result = exportActivePageLayout(doc);
    expect(result.status.tone).toBe('ok');
    expect(result.download?.stem).toBeTruthy();
    expect((result.download?.data as { kind: string }).kind).toBe(PAGE_LAYOUT_PACKAGE_KIND);
  });

  it('exports a saved layout, and fails cleanly for an unknown one', () => {
    const controller = createWorkbenchController(docWithPanel());
    savePageAsLayout(controller);
    const saved = controller.pageLayouts[0];
    const ok = exportSavedPageLayout(controller.document, saved.id, saved.label);
    expect(ok.status.tone).toBe('ok');
    expect(ok.download?.stem).toMatch(/layout-1$/);
    const missing = exportSavedPageLayout(controller.document, 'nope', 'Nope');
    expect(missing).toEqual({ status: { tone: 'error', message: 'Could not export "Nope".' }, download: null });
  });
});

describe('import classification (three package kinds)', () => {
  it('recognises a page-layout package first', () => {
    const controller = createWorkbenchController(docWithPanel());
    savePageAsLayout(controller);
    const pkg = exportPageLayoutPackage(controller.document, controller.pageLayouts[0].id);
    expect(classifyLayoutImport(pkg).kind).toBe('pageLayout');
  });

  it('recognises a whole-layout package', () => {
    const doc = docWithPanel();
    expect(classifyLayoutImport(exportLayoutPackage(doc, 'layout.test')).kind).toBe('layout');
  });

  it('recognises a panel package', () => {
    const pkg = exportPanelPackage({ panelLibrary: { [template.id]: template } }, template.id);
    expect(classifyLayoutImport(pkg).kind).toBe('panel');
  });

  it('rejects anything else with the page-layout parse error', () => {
    const result = classifyLayoutImport({ kind: 'something-else' });
    expect(result.kind).toBe('invalid');
    expect(result.kind === 'invalid' && result.message.length > 0).toBe(true);
  });

  it('treats unparsable text as invalid JSON', () => {
    expect(parseLayoutImport('{nope')).toEqual({ kind: 'invalid', message: 'File is not valid JSON.' });
  });

  it('stores each kind in its own place', () => {
    const source = createWorkbenchController(docWithPanel());
    savePageAsLayout(source);
    const pagePkg = exportPageLayoutPackage(source.document, source.pageLayouts[0].id);

    const target = createWorkbenchController(docWithPanel());
    const page = applyLayoutImport(target, classifyLayoutImport(pagePkg));
    expect(page.tone).toBe('ok');
    expect(target.pageLayouts).toHaveLength(1);

    const layoutCount = Object.keys(target.document.layouts).length;
    const layout = applyLayoutImport(target, classifyLayoutImport(exportLayoutPackage(source.document, 'layout.test')));
    expect(layout.tone).toBe('ok');
    expect(Object.keys(target.document.layouts)).toHaveLength(layoutCount + 1);

    const panel = applyLayoutImport(
      target,
      classifyLayoutImport(exportPanelPackage({ panelLibrary: { [template.id]: template } }, template.id))
    );
    expect(panel.tone).toBe('ok');
    expect(Object.values(target.document.panelLibrary).some((t) => t.title === 'My Panel')).toBe(true);

    expect(applyLayoutImport(target, { kind: 'invalid', message: 'bad' })).toEqual({ tone: 'error', message: 'bad' });
  });

  it('imports from a file-like object', async () => {
    const source = createWorkbenchController(docWithPanel());
    savePageAsLayout(source);
    const text = JSON.stringify(exportPageLayoutPackage(source.document, source.pageLayouts[0].id));
    const target = createWorkbenchController(docWithPanel());
    const status = await importLayoutFile(target, { text: async () => text });
    expect(status.tone).toBe('ok');
    expect(target.pageLayouts).toHaveLength(1);
    const unreadable = await importLayoutFile(target, {
      text: async () => {
        throw new Error('io');
      }
    });
    expect(unreadable.tone).toBe('error');
  });
});

describe('backups seam', () => {
  const entry: WorkbenchBackupEntry = { slot: 2, rev: 7, updatedAt: '2026-01-02T03:04:05.000Z', layoutCount: 3 };

  afterEach(() => registerWorkbenchBackupProvider(null));

  it('lists nothing without a provider and restores nothing', () => {
    registerWorkbenchBackupProvider(null);
    expect(getWorkbenchBackupProvider()).toBeNull();
    expect(listWorkbenchBackups()).toEqual([]);
    expect(restoreWorkbenchBackup(entry)).toEqual({ tone: 'error', message: 'Backup 2 could not be restored.' });
  });

  it('lists and restores through a registered provider', () => {
    const restored: number[] = [];
    registerWorkbenchBackupProvider({ list: () => [entry], restore: (slot) => (restored.push(slot), true) });
    expect(listWorkbenchBackups()).toEqual([entry]);
    expect(restoreWorkbenchBackup(entry)).toEqual({ tone: 'ok', message: 'Restored backup 2.' });
    expect(restored).toEqual([2]);
  });

  it('turns a failing or throwing provider into an error / empty list', () => {
    registerWorkbenchBackupProvider({
      list: () => {
        throw new Error('storage');
      },
      restore: () => {
        throw new Error('storage');
      }
    });
    expect(listWorkbenchBackups()).toEqual([]);
    expect(restoreWorkbenchBackup(entry).tone).toBe('error');
    registerWorkbenchBackupProvider({ list: () => [], restore: () => false });
    expect(restoreWorkbenchBackup(entry).tone).toBe('error');
  });

  it('formats backup timestamps, falling back for missing / bad values', () => {
    expect(workbenchBackupTimestamp({ ...entry, updatedAt: null })).toBe('Unknown time');
    expect(workbenchBackupTimestamp({ ...entry, updatedAt: 'not a date' })).toBe('Unknown time');
    expect(workbenchBackupTimestamp(entry)).toBe(new Date(entry.updatedAt!).toLocaleString());
  });
});
