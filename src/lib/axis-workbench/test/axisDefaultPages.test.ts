import { describe, expect, it } from 'vitest';
import { createWorkbenchController, type WorkbenchController } from '../../workbench';
import {
  buildPanelCatalog,
  catalogAddCommands,
  panelIdsInDockTree,
  panelIdsInPageDock,
  selectPanelPlacement,
  type WorkbenchCommand,
  type WorkbenchLayout
} from '../../workbench/core';
import { createAxisWorkbenchDefaultDocument } from '../axisWorkbenchDefaults';
import { createAxisLayoutPreset } from '../axisWorkbenchLayoutPresets';
import {
  AXIS_PAGE_CONVERT,
  AXIS_PAGE_FC,
  AXIS_PAGE_GRID,
  AXIS_PAGE_PRESET_BROWSER,
  AXIS_PAGE_SETUP,
  AXIS_SEED_PAGE_ORDER
} from '../axisWorkbenchPages';
import {
  axisDefaultPageSpec,
  axisPageHints,
  axisPageResetAction,
  buildAxisAddPageItems,
  isAxisDefaultPage,
  listMissingAxisDefaultPages,
  resetAxisPageCommands,
  restoreAxisDefaultPagesCommands,
  type AxisPagesHost
} from '../axisDefaultPages';
import { AXIS_PANEL_CATALOG_HIDDEN_TYPES, createAxisCanonicalPanels } from '../axisPanelCatalog';
import { selectEmptyParkedCustomPanels } from '../../workbench/core';
import { AXIS_WORKBENCH_BASE_PANEL_TYPES } from '../axisWorkbenchRegistryManifest';

const PB = 'axis.presetBrowser';

function fresh(): WorkbenchController {
  return createWorkbenchController(createAxisWorkbenchDefaultDocument());
}

/** A controller whose active layout is the given preset (settings.presetKind set). */
function onPreset(kind: 'studio' | 'stage'): WorkbenchController {
  const controller = fresh();
  const layout = createAxisLayoutPreset(kind, { layoutId: `layout.${kind}` });
  const ok = controller.dispatchMany([
    { type: 'layout.save', layout },
    { type: 'profile.setLayout', profileId: controller.document.activeProfileId, layoutId: layout.id }
  ]);
  expect(ok.success).toBe(true);
  return controller;
}

const layoutOf = (controller: WorkbenchController): WorkbenchLayout => controller.activeLayout!;

function apply(controller: WorkbenchController, commands: WorkbenchCommand[]): void {
  const result = controller.dispatchMany(commands);
  expect(result.success, result.error?.message).toBe(true);
}

const pageIds = (controller: WorkbenchController, pageId: string): string[] =>
  panelIdsInPageDock(layoutOf(controller).pages[pageId]);

describe('listMissingAxisDefaultPages', () => {
  it('is empty on the default document and lists deleted seed pages in seed order', () => {
    const controller = fresh();
    expect(listMissingAxisDefaultPages(layoutOf(controller))).toEqual([]);
    controller.removePage(AXIS_PAGE_SETUP);
    controller.removePage(AXIS_PAGE_PRESET_BROWSER);
    expect(listMissingAxisDefaultPages(layoutOf(controller))).toEqual([
      { pageId: AXIS_PAGE_PRESET_BROWSER, label: 'Preset Browser', navEntryId: 'library' },
      { pageId: AXIS_PAGE_SETUP, label: 'Setup', navEntryId: 'setup' }
    ]);
  });

  it('never lists the nav-less convert page', () => {
    const controller = fresh();
    expect(controller.removePage(AXIS_PAGE_CONVERT).success).toBe(true);
    expect(listMissingAxisDefaultPages(layoutOf(controller))).toEqual([]);
    expect(restoreAxisDefaultPagesCommands(layoutOf(controller))).toEqual([]);
  });
});

describe('restoreAxisDefaultPagesCommands', () => {
  it('restores at the seed position with the original id, label and nav entry id; the parked panel is docked again', () => {
    const controller = fresh();
    const navBefore = [...layoutOf(controller).navigation.order];
    controller.removePage(AXIS_PAGE_PRESET_BROWSER);
    expect(selectPanelPlacement(layoutOf(controller), PB)).toEqual({ kind: 'parked' });

    apply(controller, restoreAxisDefaultPagesCommands(layoutOf(controller)));
    const layout = layoutOf(controller);
    expect(layout.pageOrder.indexOf(AXIS_PAGE_PRESET_BROWSER)).toBe(1);
    expect(layout.pages[AXIS_PAGE_PRESET_BROWSER].label).toBe('Preset Browser');
    expect(layout.navigation.entries.library).toMatchObject({ pageId: AXIS_PAGE_PRESET_BROWSER, label: 'Preset Browser' });
    expect(layout.navigation.order).toEqual(navBefore);
    // The same instance is back (no duplicate).
    expect(pageIds(controller, AXIS_PAGE_PRESET_BROWSER)).toEqual([PB]);
    expect(Object.values(layout.panels).filter((panel) => panel.singletonKey === PB)).toHaveLength(1);
  });

  it('is idempotent: running it on its own output adds nothing', () => {
    const controller = fresh();
    controller.removePage(AXIS_PAGE_FC);
    controller.removePage(AXIS_PAGE_GRID);
    apply(controller, restoreAxisDefaultPagesCommands(layoutOf(controller)));
    expect(restoreAxisDefaultPagesCommands(layoutOf(controller))).toEqual([]);
    expect(layoutOf(controller).pageOrder.slice(0, 7)).toEqual([...AXIS_SEED_PAGE_ORDER]);
  });

  it('leaves custom pages and edited default pages untouched; restores every missing page in one batch', () => {
    const controller = fresh();
    // Edit Grid (move Block Editor right) and add a custom page.
    apply(controller, [{ type: 'panel.move', panelId: 'axis.blockEditor', to: { kind: 'region', region: 'right' } }]);
    const customId = controller.addPage({ label: 'Mine' })!;
    controller.activatePage(AXIS_PAGE_GRID);
    controller.removePage(AXIS_PAGE_PRESET_BROWSER);
    controller.removePage(AXIS_PAGE_SETUP);
    const gridBefore = JSON.parse(JSON.stringify(layoutOf(controller).pages[AXIS_PAGE_GRID]));
    const customBefore = JSON.parse(JSON.stringify(layoutOf(controller).pages[customId]));

    const commands = restoreAxisDefaultPagesCommands(layoutOf(controller));
    expect(commands.filter((c) => c.type === 'page.add')).toHaveLength(2);
    apply(controller, commands);
    const layout = layoutOf(controller);
    expect(layout.pages[AXIS_PAGE_GRID]).toEqual(gridBefore);
    expect(layout.pages[customId]).toEqual(customBefore);
    expect(layout.pageOrder.indexOf(AXIS_PAGE_PRESET_BROWSER)).toBe(1);
    expect(layout.pageOrder.indexOf(AXIS_PAGE_SETUP)).toBe(layout.pageOrder.indexOf('axis.page.live') + 1);
    expect(layout.navigation.entries.setup.pageId).toBe(AXIS_PAGE_SETUP);
    // One batch = one undo step.
    controller.undoLayout();
    expect(listMissingAxisDefaultPages(layoutOf(controller)).map((page) => page.pageId)).toEqual([AXIS_PAGE_PRESET_BROWSER, AXIS_PAGE_SETUP]);
  });

  it('an absent spec panel (lost by an old document) is created fresh from its spec', () => {
    const controller = fresh();
    controller.removePage(AXIS_PAGE_PRESET_BROWSER);
    apply(controller, [{ type: 'panel.close', panelId: PB }]); // the old hard delete
    expect(layoutOf(controller).panels[PB]).toBeUndefined();
    const commands = restoreAxisDefaultPagesCommands(layoutOf(controller));
    expect(commands.map((c) => c.type)).toEqual(['panel.create', 'page.add']);
    apply(controller, commands);
    expect(layoutOf(controller).panels[PB]).toMatchObject({ type: PB, singletonKey: PB });
    expect(pageIds(controller, AXIS_PAGE_PRESET_BROWSER)).toEqual([PB]);
  });

  it('a spec panel docked on another page stays there; the restored page hints "Bring it here"', () => {
    const controller = fresh();
    apply(controller, [{ type: 'panel.move', panelId: PB, to: { kind: 'region', region: 'right' }, pageId: AXIS_PAGE_GRID }]);
    controller.removePage(AXIS_PAGE_PRESET_BROWSER);
    apply(controller, restoreAxisDefaultPagesCommands(layoutOf(controller)));
    expect(pageIds(controller, AXIS_PAGE_PRESET_BROWSER)).toEqual([]);
    expect(pageIds(controller, AXIS_PAGE_GRID)).toContain(PB);

    const layout = layoutOf(controller);
    const hints = axisPageHints(layout, layout.pages[AXIS_PAGE_PRESET_BROWSER]);
    expect(hints).toHaveLength(1);
    expect(hints[0]).toMatchObject({ text: 'Preset Browser is on page Grid', actionLabel: 'Bring it here' });
    apply(controller, hints[0].commands!());
    expect(pageIds(controller, AXIS_PAGE_PRESET_BROWSER)).toEqual([PB]);
    expect(pageIds(controller, AXIS_PAGE_GRID)).not.toContain(PB);
    expect(axisPageHints(layoutOf(controller), layoutOf(controller).pages[AXIS_PAGE_PRESET_BROWSER])).toEqual([]);
  });

  it('with reordered pages and a custom page between seed pages: lands right after its preceding seed page', () => {
    const controller = fresh();
    // Move Scenes to the front, insert a custom page right after Grid's slot.
    apply(controller, [{ type: 'page.move', pageId: 'axis.page.scenes', index: 0 }]);
    const customId = controller.addPage({ label: 'Mine', index: 2 })!;
    controller.activatePage(AXIS_PAGE_GRID);
    expect(layoutOf(controller).pageOrder.slice(0, 3)).toEqual(['axis.page.scenes', AXIS_PAGE_GRID, customId]);
    controller.removePage(AXIS_PAGE_PRESET_BROWSER);
    controller.removePage(AXIS_PAGE_FC);

    apply(controller, restoreAxisDefaultPagesCommands(layoutOf(controller)));
    const order = layoutOf(controller).pageOrder;
    // Preset Browser right after Grid (before the custom page), FC right after Preset Browser.
    expect(order.slice(0, 5)).toEqual(['axis.page.scenes', AXIS_PAGE_GRID, AXIS_PAGE_PRESET_BROWSER, AXIS_PAGE_FC, customId]);
    const nav = layoutOf(controller).navigation.order;
    expect(nav.indexOf('library')).toBe(nav.indexOf('grid') + 1);
    expect(nav.indexOf('fc')).toBe(nav.indexOf('library') + 1);
  });

  it('a taken nav entry id falls back to a minted entry (the page still restores)', () => {
    const controller = fresh();
    controller.removePage(AXIS_PAGE_PRESET_BROWSER);
    // An action entry squatting on the original id (it has a command target, so repair keeps it).
    const squatter = structuredClone(controller.document);
    const layout = squatter.layouts[squatter.profiles[squatter.activeProfileId].layoutId];
    layout.navigation.entries.library = { id: 'library', label: 'Library action', target: { command: 'x.open' } };
    layout.navigation.order.push('library');
    controller.setDocument(squatter);

    const commands = restoreAxisDefaultPagesCommands(layoutOf(controller));
    const add = commands.find((c) => c.type === 'page.add');
    expect(add && add.type === 'page.add' ? add.navEntry : 'missing').toBeUndefined();
    apply(controller, commands);
    const entry = Object.values(layoutOf(controller).navigation.entries).find((e) => e.pageId === AXIS_PAGE_PRESET_BROWSER);
    expect(entry?.id).toBe(`page:${AXIS_PAGE_PRESET_BROWSER}`);
    expect(layoutOf(controller).navigation.entries.library.target).toEqual({ command: 'x.open' });
  });

  it('the Grid page restores from the active preset kind (default document: Signal Grid + Block Editor)', () => {
    const plain = fresh();
    plain.activatePage(AXIS_PAGE_FC);
    plain.removePage(AXIS_PAGE_GRID);
    apply(plain, restoreAxisDefaultPagesCommands(layoutOf(plain)));
    const plainDock = layoutOf(plain).pages[AXIS_PAGE_GRID].dock;
    expect(panelIdsInDockTree(plainDock.root.main)).toEqual(['axis.signalGrid']);
    expect(panelIdsInDockTree(plainDock.root.bottom)).toEqual(['axis.blockEditor']);
    expect(plainDock.root.right).toBeNull();
    expect(layoutOf(plain).pageOrder[0]).toBe(AXIS_PAGE_GRID);
    expect(layoutOf(plain).navigation.order[0]).toBe('grid');

    const studio = onPreset('studio');
    studio.activatePage(AXIS_PAGE_FC);
    studio.removePage(AXIS_PAGE_GRID);
    apply(studio, restoreAxisDefaultPagesCommands(layoutOf(studio)));
    const studioDock = layoutOf(studio).pages[AXIS_PAGE_GRID].dock;
    expect(panelIdsInDockTree(studioDock.root.main)).toEqual(['axis.signalGrid']);
    expect(panelIdsInDockTree(studioDock.root.right)).toEqual(['axis.blockEditor', 'axis.history']);
    expect(studioDock.regions.right.sizePx).toBe(400);
  });
});

describe('page hints', () => {
  it('a LOCKED spec panel on another page still gets "Bring it here" (locked = cannot leave the layout, it can move)', () => {
    const controller = fresh();
    controller.activatePage(AXIS_PAGE_FC);
    controller.removePage(AXIS_PAGE_GRID); // signal grid (locked) parked
    const customId = controller.addPage({ label: 'Mine' })!;
    apply(controller, [{ type: 'panel.move', panelId: 'axis.signalGrid', to: { kind: 'region', region: 'main' } }]);
    apply(controller, restoreAxisDefaultPagesCommands(layoutOf(controller)));
    const layout = layoutOf(controller);
    const hints = axisPageHints(layout, layout.pages[AXIS_PAGE_GRID]);
    const grid = hints.find((hint) => hint.id === 'axis.bringHere.axis.signalGrid')!;
    expect(grid).toMatchObject({ text: 'Signal Grid is on page Mine', actionLabel: 'Bring it here' });
    apply(controller, grid.commands!());
    expect(pageIds(controller, customId)).not.toContain('axis.signalGrid');
    expect(panelIdsInDockTree(layoutOf(controller).pages[AXIS_PAGE_GRID].dock.root.main)).toEqual(['axis.signalGrid']);
    expect(layoutOf(controller).panels['axis.signalGrid'].locked).toBe(true);
  });

  it('a hint shows for a spec panel outside main too (Block Editor elsewhere while Grid main is full)', () => {
    const controller = fresh();
    const customId = controller.addPage({ label: 'Mine' })!;
    apply(controller, [{ type: 'panel.move', panelId: 'axis.blockEditor', to: { kind: 'region', region: 'main' } }]);
    const layout = layoutOf(controller);
    const hints = axisPageHints(layout, layout.pages[AXIS_PAGE_GRID]);
    expect(hints.map((hint) => hint.text)).toEqual(['Block Editor is on page Mine']);
    apply(controller, hints[0].commands!());
    expect(panelIdsInDockTree(layoutOf(controller).pages[AXIS_PAGE_GRID].dock.root.bottom)).toEqual(['axis.blockEditor']);
    expect(pageIds(controller, customId)).toEqual([]);
  });
});

describe('resetAxisPageCommands', () => {
  it('a default page goes back to its spec; a foreign panel is parked; one batch, one undo step', () => {
    const controller = fresh();
    controller.activatePage(AXIS_PAGE_PRESET_BROWSER);
    apply(controller, [{ type: 'panel.move', panelId: 'axis.history', to: { kind: 'region', region: 'right' } }]);
    apply(controller, [{ type: 'panel.move', panelId: PB, to: { kind: 'region', region: 'left' } }]);
    const before = JSON.parse(JSON.stringify(layoutOf(controller).pages[AXIS_PAGE_PRESET_BROWSER]));

    const commands = resetAxisPageCommands(layoutOf(controller), AXIS_PAGE_PRESET_BROWSER);
    expect(commands.map((c) => c.type)).toEqual(['page.setDock']);
    apply(controller, commands);
    const dock = layoutOf(controller).pages[AXIS_PAGE_PRESET_BROWSER].dock;
    expect(panelIdsInDockTree(dock.root.main)).toEqual([PB]);
    expect(dock.root.left).toBeNull();
    expect(selectPanelPlacement(layoutOf(controller), 'axis.history')).toEqual({ kind: 'parked' });

    controller.undoLayout();
    expect(layoutOf(controller).pages[AXIS_PAGE_PRESET_BROWSER]).toEqual(before);
  });

  it('a spec panel docked on another page stays there (the hint offers to bring it)', () => {
    const controller = fresh();
    apply(controller, [{ type: 'panel.move', panelId: PB, to: { kind: 'region', region: 'right' }, pageId: AXIS_PAGE_GRID }]);
    apply(controller, resetAxisPageCommands(layoutOf(controller), AXIS_PAGE_PRESET_BROWSER));
    expect(pageIds(controller, AXIS_PAGE_PRESET_BROWSER)).toEqual([]);
    expect(pageIds(controller, AXIS_PAGE_GRID)).toContain(PB);
  });

  it('a custom page is cleared: empty dock, its panels parked', () => {
    const controller = fresh();
    const customId = controller.addPage({ label: 'Mine' })!;
    apply(controller, [{ type: 'panel.move', panelId: 'axis.history', to: { kind: 'region', region: 'main' } }]);
    const commands = resetAxisPageCommands(layoutOf(controller), customId);
    expect(commands).toEqual([{ type: 'page.setDock', pageId: customId }]);
    apply(controller, commands);
    expect(pageIds(controller, customId)).toEqual([]);
    expect(selectPanelPlacement(layoutOf(controller), 'axis.history')).toEqual({ kind: 'parked' });
  });

  it('a lost spec panel is created again; a missing page resets to nothing', () => {
    const controller = fresh();
    controller.activatePage(AXIS_PAGE_PRESET_BROWSER);
    apply(controller, [{ type: 'panel.close', panelId: PB }]);
    const commands = resetAxisPageCommands(layoutOf(controller), AXIS_PAGE_PRESET_BROWSER);
    expect(commands.map((c) => c.type)).toEqual(['panel.create', 'page.setDock']);
    apply(controller, commands);
    expect(pageIds(controller, AXIS_PAGE_PRESET_BROWSER)).toEqual([PB]);
    expect(resetAxisPageCommands(layoutOf(controller), 'nope')).toEqual([]);
  });

  it('the convert page counts as a default page with its own spec', () => {
    expect(isAxisDefaultPage(AXIS_PAGE_CONVERT)).toBe(true);
    expect(isAxisDefaultPage('page-custom')).toBe(false);
    const spec = axisDefaultPageSpec(undefined, AXIS_PAGE_CONVERT)!;
    expect(spec.panels.map((panel) => panel.id).sort()).toEqual(
      ['axis.convertBlockEditor', 'axis.convertGrid', 'axis.convertMinimap', 'axis.convertTray'].sort()
    );
  });
});

describe('Add page rows and page resets (edit bar / nav "+")', () => {
  const host = (controller: WorkbenchController): AxisPagesHost => ({
    getLayout: () => controller.activeLayout,
    dispatchMany: (commands) => {
      controller.dispatchMany(commands);
    }
  });

  it('says so when every default page is there', () => {
    const items = buildAxisAddPageItems(host(fresh()));
    expect(items.leading.map((item) => [item.kind, item.label])).toEqual([['header', 'All default pages are there']]);
    expect(items.trailing).toBeUndefined();
  });

  it('lists missing pages, what is already there, and restore all', () => {
    const controller = fresh();
    controller.removePage(AXIS_PAGE_PRESET_BROWSER);
    controller.removePage(AXIS_PAGE_SETUP);
    const items = buildAxisAddPageItems(host(controller));
    expect(items.leading.map((item) => item.label)).toEqual([
      'Missing default pages',
      'Preset Browser',
      'Setup',
      'Already there: Grid, Footswitches, Controllers, Scenes, Live'
    ]);
    expect(items.leading[3].kind).toBe('header');
    expect(items.trailing?.map((item) => item.label)).toEqual(['Restore default pages (2)']);

    // One row restores that page and opens it.
    items.leading[1].run();
    expect(layoutOf(controller).activePageId).toBe(AXIS_PAGE_PRESET_BROWSER);
    expect(listMissingAxisDefaultPages(layoutOf(controller)).map((page) => page.pageId)).toEqual([AXIS_PAGE_SETUP]);
    // Restore all brings the rest.
    buildAxisAddPageItems(host(controller)).trailing![0].run();
    expect(listMissingAxisDefaultPages(layoutOf(controller))).toEqual([]);
  });

  it('offers Reset to default on default pages and Clear page elsewhere', () => {
    const controller = fresh();
    const customId = controller.addPage({ label: 'Mine' })!;
    expect(axisPageResetAction(host(controller), AXIS_PAGE_GRID)).toMatchObject({ label: 'Reset to default', confirmLabel: 'Reset' });
    expect(axisPageResetAction(host(controller), customId)).toMatchObject({ label: 'Clear page', confirmLabel: 'Clear' });
    expect(axisPageResetAction(host(controller), 'nope')).toBeNull();
  });
});

describe('Axis canonical panels (the catalog is always complete)', () => {
  const specs = createAxisCanonicalPanels();

  it('covers the roster + page panels once each (Signal Grid too), without converter panels or Account; Custom Panel always makes a new one', () => {
    const keys = specs.map((spec) => spec.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of ['axis.signalGrid', 'axis.blockEditor', 'axis.history', PB, 'axis.fc', 'axis.controllers', 'axis.scenes', 'axis.live', 'axis.setup', 'axis.deviceTools']) {
      expect(keys).toContain(key);
    }
    // Account opens from its nav action: never offered (by id, not by its lock).
    expect(keys).not.toContain('axis.account');
    expect(specs.some((spec) => AXIS_PANEL_CATALOG_HIDDEN_TYPES.includes(spec.panel.type))).toBe(false);
    const custom = specs.find((spec) => spec.multiple)!;
    expect(custom).toMatchObject({ key: 'axis.customPanel', label: 'New custom panel', ownsWidgetZone: true });
    // Every canonical type is a registered manifest panel type.
    for (const spec of specs) expect(AXIS_WORKBENCH_BASE_PANEL_TYPES as readonly string[]).toContain(spec.panel.type);
  });

  it('a panel an old document lost is offered as "absent" and created again, never duplicated', () => {
    const controller = fresh();
    controller.activatePage(AXIS_PAGE_PRESET_BROWSER);
    apply(controller, [{ type: 'panel.close', panelId: PB }]);
    const catalog = buildPanelCatalog(layoutOf(controller), { canonical: specs, hiddenTypes: AXIS_PANEL_CATALOG_HIDDEN_TYPES });
    const absent = catalog.find((entry) => entry.key === `canonical:${PB}`)!;
    expect(absent.placement).toBe('absent');
    apply(controller, catalogAddCommands(controller.document, absent, { kind: 'region', region: 'main' }));
    expect(pageIds(controller, AXIS_PAGE_PRESET_BROWSER)).toEqual([PB]);

    const again = buildPanelCatalog(layoutOf(controller), { canonical: specs, hiddenTypes: AXIS_PANEL_CATALOG_HIDDEN_TYPES });
    expect(again.find((entry) => entry.key === `instance:${PB}`)).toMatchObject({ placement: 'docked', onActivePage: true });
    expect(again.some((entry) => entry.key === `canonical:${PB}`)).toBe(false);
  });

  it('keeps the converter panels out; the empty parked seed Custom Panel is offered for bulk delete instead', () => {
    const controller = fresh();
    const catalog = buildPanelCatalog(layoutOf(controller), { canonical: specs, hiddenTypes: AXIS_PANEL_CATALOG_HIDDEN_TYPES });
    expect(catalog.some((entry) => AXIS_PANEL_CATALOG_HIDDEN_TYPES.includes(entry.type))).toBe(false);
    expect(catalog.find((entry) => entry.key === `instance:${PB}`)).toMatchObject({ placement: 'docked', pageLabel: 'Preset Browser' });
    expect(catalog.some((entry) => entry.key === 'instance:axis.customPanel')).toBe(false);
    expect(selectEmptyParkedCustomPanels(layoutOf(controller), specs).map((panel) => panel.id)).toEqual(['axis.customPanel']);
    expect(catalog.filter((entry) => entry.title === 'New custom panel')).toHaveLength(1);
    // A lost Signal Grid is offered again (only while absent).
    expect(catalog.some((entry) => entry.key === 'canonical:axis.signalGrid')).toBe(false);
  });

  it('duplicating Grid then deleting the copy page leaves copies that can be deleted everywhere', () => {
    const controller = fresh();
    expect(controller.duplicatePage(AXIS_PAGE_GRID, { newPageId: 'page.gridCopy' }).success).toBe(true);
    const copies = pageIds(controller, 'page.gridCopy');
    expect(copies).toHaveLength(2);
    for (const id of copies) {
      expect(layoutOf(controller).panels[id].locked).toBeUndefined();
      expect(layoutOf(controller).panels[id].singletonKey).toBeUndefined();
    }
    controller.removePage('page.gridCopy');
    const catalog = buildPanelCatalog(layoutOf(controller), { canonical: specs, hiddenTypes: AXIS_PANEL_CATALOG_HIDDEN_TYPES });
    for (const id of copies) expect(catalog.find((entry) => entry.key === `instance:${id}`)).toMatchObject({ placement: 'parked', deletable: true });
    // The originals never are.
    expect(catalog.find((entry) => entry.key === 'instance:axis.signalGrid')?.deletable).toBeUndefined();
    expect(catalog.find((entry) => entry.key === 'instance:axis.blockEditor')?.deletable).toBeUndefined();
    for (const id of copies) apply(controller, [{ type: 'panel.close', panelId: id }]);
    expect(pageIds(controller, AXIS_PAGE_GRID).sort()).toEqual(['axis.blockEditor', 'axis.signalGrid']);
  });
});
