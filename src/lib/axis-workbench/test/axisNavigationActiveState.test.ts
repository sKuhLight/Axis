import { describe, expect, it } from 'vitest';
import { createWorkbenchController } from '../../workbench';
import { createAxisWorkbenchDefaultDocument } from '../axisWorkbenchDefaults';
import { createAxisNavigationPanelAction } from '../axisWorkbenchNavigationActions';
import { isAxisNavigationEntryActive, type AxisNavigationActiveSnapshot } from '../axisNavigationActiveState';

const CLEAN: AxisNavigationActiveSnapshot = {
  libraryOpen: false,
  virtualSlug: null,
  themeOpen: false,
  accountOpen: false
};

function defaultController() {
  return createWorkbenchController(createAxisWorkbenchDefaultDocument());
}

describe('isAxisNavigationEntryActive', () => {
  it('marks grid active by default (Signal Grid is the active tab of main, no overlay)', () => {
    const controller = defaultController();
    expect(isAxisNavigationEntryActive(controller.document, CLEAN, 'grid')).toBe(true);
    // no docked screen open, no overlay ⇒ nothing else is active
    expect(isAxisNavigationEntryActive(controller.document, CLEAN, 'controllers')).toBe(false);
    expect(isAxisNavigationEntryActive(controller.document, CLEAN, 'library')).toBe(false);
    expect(isAxisNavigationEntryActive(controller.document, CLEAN, 'fc')).toBe(false);
  });

  it('tints fc / theme / account purely from the editor overlay snapshot', () => {
    const controller = defaultController();
    const doc = controller.document;
    expect(isAxisNavigationEntryActive(doc, { ...CLEAN, virtualSlug: 'fc' }, 'fc')).toBe(true);
    expect(isAxisNavigationEntryActive(doc, { ...CLEAN, virtualSlug: 'amp' }, 'fc')).toBe(false);
    expect(isAxisNavigationEntryActive(doc, { ...CLEAN, themeOpen: true }, 'theme')).toBe(true);
    expect(isAxisNavigationEntryActive(doc, { ...CLEAN, accountOpen: true }, 'account')).toBe(true);
  });

  it('tints library from the legacy overlay OR the docked Preset Browser panel (V13d)', async () => {
    const controller = defaultController();
    // Legacy overlay still tints it (surfaced outside the workbench shell).
    expect(isAxisNavigationEntryActive(controller.document, { ...CLEAN, libraryOpen: true }, 'library')).toBe(true);
    // No overlay + PB not docked ⇒ inactive.
    expect(isAxisNavigationEntryActive(controller.document, CLEAN, 'library')).toBe(false);

    // Dock the Preset Browser panel via the nav action ⇒ library tints from the doc.
    await createAxisNavigationPanelAction({
      actionId: 'axis.openPresetBrowser',
      panelId: 'axis.presetBrowser',
      panelType: 'axis.presetBrowser',
      title: 'Preset Browser',
      region: 'left'
    }).run({ controller, source: 'navigation' });
    expect(isAxisNavigationEntryActive(controller.document, CLEAN, 'library')).toBe(true);
  });

  it('an open overlay/rail screen suppresses the grid tint (it sits over the grid)', () => {
    const controller = defaultController();
    expect(isAxisNavigationEntryActive(controller.document, { ...CLEAN, libraryOpen: true }, 'grid')).toBe(false);
    expect(isAxisNavigationEntryActive(controller.document, { ...CLEAN, virtualSlug: 'fc' }, 'grid')).toBe(false);
  });

  it('marks a docked panel entry active only when it is the active tab of its stack', async () => {
    const controller = defaultController();
    // Controllers not docked yet ⇒ inactive.
    expect(isAxisNavigationEntryActive(controller.document, CLEAN, 'controllers')).toBe(false);

    await createAxisNavigationPanelAction({
      actionId: 'axis.openControllers',
      panelId: 'axis.controllers',
      panelType: 'axis.virtualScreen',
      title: 'Controllers',
      region: 'main',
      state: { slug: 'controllers' }
    }).run({ controller, source: 'navigation' });

    // Docked into main and activated ⇒ controllers active, grid no longer the active tab.
    expect(isAxisNavigationEntryActive(controller.document, CLEAN, 'controllers')).toBe(true);
    expect(isAxisNavigationEntryActive(controller.document, CLEAN, 'grid')).toBe(false);

    // Re-activate the grid tab ⇒ grid active again, controllers inactive.
    controller.dispatch({ type: 'panel.activate', panelId: 'axis.signalGrid' });
    expect(isAxisNavigationEntryActive(controller.document, CLEAN, 'grid')).toBe(true);
    expect(isAxisNavigationEntryActive(controller.document, CLEAN, 'controllers')).toBe(false);
  });

  it('resolves unknown entries as inactive', () => {
    const controller = defaultController();
    expect(isAxisNavigationEntryActive(controller.document, CLEAN, 'nonexistent')).toBe(false);
  });
});
