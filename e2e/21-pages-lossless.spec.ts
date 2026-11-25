import { test, expect, type Page } from '@playwright/test';
import {
  WORKBENCH_DOC_KEY,
  addCustomPanel,
  addPalette,
  addPaletteCard,
  openAddPalette,
  bootCleanWorkbench,
  collapseRail,
  editBarControl,
  enterEditMode,
  exitEditMode,
  openEditBarMenu,
  openMenu,
  regionTabs
} from './support/workbench';

/**
 * Slice 3 — pages and panels are never lost.
 *
 * Removing a panel from a page, or deleting a page, PARKS panels (they stay in
 * the document with their state and widgets); the Library's panel catalog lists
 * every panel with where it lives and puts it back; deleted default pages come
 * back at their seed position with their original nav entry; Reset to default /
 * Clear page are undoable in one step.
 */

const PB = 'axis.presetBrowser';

async function editReady(page: Page): Promise<void> {
  await bootCleanWorkbench(page);
  await enterEditMode(page);
  await collapseRail(page);
}

async function activatePage(page: Page, label: string): Promise<void> {
  await openEditBarMenu(page, 'page');
  await openMenu(page).getByRole('menuitemradio', { name: label, exact: true }).click();
  await expect(openMenu(page)).toHaveCount(0);
  await expect(editBarControl(page, 'page')).toContainText(label);
}

async function deleteActivePage(page: Page): Promise<void> {
  await openEditBarMenu(page, 'page');
  await openMenu(page).getByRole('menuitem', { name: 'Delete page' }).click();
  await openMenu(page).getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await expect(openMenu(page)).toHaveCount(0);
}

/** The Add palette on its Pages chip (edit bar Add +). */
async function openAddPage(page: Page): Promise<void> {
  await openAddPalette(page);
  await addPalette(page).locator('.cat', { hasText: 'Pages' }).click();
}

/** Click a page card of the open palette (missing default page, Restore default pages (n)). */
async function choosePageCard(page: Page, title: string): Promise<void> {
  await addPaletteCard(page, 'page', title).click();
  await expect(addPalette(page)).toHaveCount(0);
}

/** A blank page at the end of the navigation, opened (the nav "+" → Blank page). */
async function addBlankPage(page: Page): Promise<void> {
  await collapseRail(page);
  await page.locator('[data-nav-add-page]').click();
  await expect(addPalette(page)).toBeVisible();
  await choosePageCard(page, 'Blank page');
}

/** The panel catalog: the Library drawer (PAGE ▸ Manage pages and templates…). */
async function openCatalog(page: Page): Promise<void> {
  await openEditBarMenu(page, 'page');
  await openMenu(page).getByRole('menuitem', { name: 'Manage pages and templates…' }).click();
  await expect(page.locator('.aw-lib-drawer')).toBeVisible();
}

async function closeDrawer(page: Page): Promise<void> {
  await page.locator('.aw-lib-drawer .aw-lib-close').click();
  await expect(page.locator('.aw-lib-drawer')).toHaveCount(0);
}

const catalogRow = (page: Page, key: string) => page.locator(`[data-panel-catalog] [data-catalog-entry="${key}"]`);
const tabOf = (page: Page, title: string) => page.locator('.aw-workspace .aw-pane-tab', { hasText: new RegExp(`^${title}$`) });
const stackOf = (page: Page, title: string) =>
  page.locator('.aw-tabstack').filter({ has: page.locator('.aw-pane-tab', { hasText: new RegExp(`^${title}$`) }) });

async function undo(page: Page): Promise<void> {
  await editBarControl(page, 'undo').click();
}

/** The persisted active layout (debounced write — poll on it). */
async function storedLayout(page: Page): Promise<any> {
  return page.evaluate((key) => {
    const doc = JSON.parse(window.localStorage.getItem(key) ?? '{}');
    const profile = doc.profiles?.[doc.activeProfileId];
    return profile ? doc.layouts[profile.layoutId] : null;
  }, WORKBENCH_DOC_KEY);
}

test.describe('Pages and panels are never lost (slice 3)', () => {
  test('Delete page asks inline first; its panel is "not placed" in the catalog; Undo brings page and panel back in one step', async ({ page }) => {
    await editReady(page);
    const navLibrary = page.locator('[data-nav-entry="library"]');
    await activatePage(page, 'Preset Browser');

    await openEditBarMenu(page, 'page');
    await openMenu(page).getByRole('menuitem', { name: 'Delete page' }).click();
    await expect(openMenu(page)).toContainText('Delete “Preset Browser”? Its panels stay available in Add panel. Undo brings the page back.');
    await expect(navLibrary).toHaveCount(1); // nothing deleted yet
    await openMenu(page).getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await expect(navLibrary).toHaveCount(0);

    await openCatalog(page);
    await expect(catalogRow(page, `instance:${PB}`)).toHaveAttribute('data-catalog-status', 'not placed');
    await expect(catalogRow(page, `canonical:${PB}`)).toHaveCount(0);
    await closeDrawer(page);

    await undo(page);
    await expect(navLibrary).toHaveCount(1);
    await activatePage(page, 'Preset Browser');
    await expect(regionTabs(page, 'main').filter({ hasText: 'Preset Browser' })).toHaveCount(1);
  });

  test('a deleted default page comes back from Add page ▸ at its seed position with its nav entry; Grid keeps its edit', async ({ page }) => {
    await editReady(page);
    // A prior edit on Grid: the Block Editor moves to the right dock.
    await stackOf(page, 'Block Editor').locator('.aw-pane-btn[title="Panel actions"]').click();
    await openMenu(page).getByRole('menuitem', { name: /Move to/ }).click();
    await openMenu(page).getByRole('menuitem', { name: 'Right dock' }).click();
    await expect(page.locator('.aw-tabstack[data-region="right"]').filter({ hasText: 'Block Editor' })).toHaveCount(1);

    await activatePage(page, 'Preset Browser');
    await deleteActivePage(page);
    await expect(page.locator('[data-nav-entry="library"]')).toHaveCount(0);

    await openAddPage(page);
    await expect(addPalette(page).locator('[data-page-note]')).toContainText('Already there: Grid');
    await expect(addPalette(page).locator('[data-add-card][data-kind="page"]').filter({ hasText: 'Preset Browser' }).locator('[data-status]')).toHaveText('Missing default page');
    await choosePageCard(page, 'Preset Browser');

    // Restored second in the nav with its ORIGINAL entry id (so its glyph matches), and opened.
    await expect(page.locator('[data-nav-entry]').nth(1)).toHaveAttribute('data-nav-entry', 'library');
    await expect(editBarControl(page, 'page')).toContainText('Preset Browser');
    await expect(regionTabs(page, 'main').filter({ hasText: 'Preset Browser' })).toHaveCount(1);
    await expect.poll(async () => (await storedLayout(page))?.pageOrder?.[1]).toBe('axis.page.presetBrowser');

    await activatePage(page, 'Grid');
    await expect(page.locator('.aw-tabstack[data-region="right"]').filter({ hasText: 'Block Editor' })).toHaveCount(1);
  });

  test('Restore default pages (n) brings back every missing page and leaves a custom page untouched', async ({ page }) => {
    await editReady(page);
    await addBlankPage(page);
    await addCustomPanel(page);
    const customLabel = (await editBarControl(page, 'page').locator('.v').textContent())!.trim();
    await expect(regionTabs(page, 'main').filter({ hasText: 'Custom Panel' })).toHaveCount(1);

    await activatePage(page, 'Setup');
    await deleteActivePage(page);
    await activatePage(page, 'Footswitches');
    await deleteActivePage(page);
    await expect(page.locator('[data-nav-entry="setup"], [data-nav-entry="fc"]')).toHaveCount(0);

    await openAddPage(page);
    await choosePageCard(page, 'Restore default pages (2)');
    await expect(page.locator('[data-nav-entry="fc"]')).toHaveCount(1);
    await expect(page.locator('[data-nav-entry="setup"]')).toHaveCount(1);
    await expect(page.locator('[data-nav-entry]').nth(2)).toHaveAttribute('data-nav-entry', 'fc');

    await activatePage(page, customLabel);
    await expect(regionTabs(page, 'main').filter({ hasText: 'Custom Panel' })).toHaveCount(1);
    await openAddPage(page);
    await expect(addPalette(page).locator('[data-page-note]')).toHaveText('All default pages are there');
  });

  test('restore conflict: a page whose panel lives on another page shows "Bring it here", and the button moves it', async ({ page }) => {
    await editReady(page);
    await activatePage(page, 'Preset Browser');
    await stackOf(page, 'Preset Browser').locator('.aw-pane-btn[title="Panel actions"]').click();
    await openMenu(page).getByRole('menuitem', { name: /Move to/ }).click();
    await openMenu(page).getByRole('menuitem', { name: 'Page: Grid' }).click();
    await expect(regionTabs(page, 'main').filter({ hasText: 'Preset Browser' })).toHaveCount(0);

    await deleteActivePage(page);
    await openAddPage(page);
    await choosePageCard(page, 'Preset Browser');
    await expect(editBarControl(page, 'page')).toContainText('Preset Browser');

    const hint = page.locator('[data-page-hints] [data-page-hint]');
    await expect(hint).toHaveCount(1);
    await expect(hint).toContainText('Preset Browser is on page Grid · Bring it here');
    // View mode keeps the bar while the page's main region is empty.
    await exitEditMode(page);
    await expect(hint).toHaveCount(1);
    await hint.locator('[data-page-hint-action]').click();
    await expect(regionTabs(page, 'main').filter({ hasText: 'Preset Browser' })).toHaveCount(1);
    await expect(page.locator('[data-page-hint]')).toHaveCount(0);
    await enterEditMode(page);

    await activatePage(page, 'Grid');
    await expect(tabOf(page, 'Preset Browser')).toHaveCount(0);
  });

  test('the hint bar also covers a panel outside main: Block Editor elsewhere → Bring it here docks it at the Grid bottom', async ({ page }) => {
    await editReady(page);
    // Block Editor moves to a custom page, then Grid is deleted and restored.
    await addBlankPage(page);
    const customLabel = (await editBarControl(page, 'page').locator('.v').textContent())!.trim();
    await activatePage(page, 'Grid');
    await stackOf(page, 'Block Editor').locator('.aw-pane-btn[title="Panel actions"]').click();
    await openMenu(page).getByRole('menuitem', { name: /Move to/ }).click();
    await openMenu(page).getByRole('menuitem', { name: `Page: ${customLabel}` }).click();
    await deleteActivePage(page);
    await openAddPage(page);
    await choosePageCard(page, 'Grid');
    await expect(editBarControl(page, 'page')).toContainText('Grid');
    await expect(regionTabs(page, 'main').filter({ hasText: 'Signal Grid' })).toHaveCount(1);

    const hint = page.locator('[data-page-hints] [data-page-hint]');
    await expect(hint).toHaveCount(1);
    await expect(hint).toContainText(`Block Editor is on page ${customLabel} · Bring it here`);
    // View mode: Grid shows content (main is not empty), so the bar steps aside.
    await exitEditMode(page);
    await expect(page.locator('[data-page-hints]')).toHaveCount(0);
    await enterEditMode(page);
    await expect(hint).toHaveCount(1);
    await hint.locator('[data-page-hint-action]').click();
    await expect(page.locator('.aw-tabstack[data-region="bottom"]').filter({ hasText: 'Block Editor' })).toHaveCount(1);
    await expect(page.locator('[data-page-hints]')).toHaveCount(0);
  });

  test('the Convert page cannot be deleted (used by the preset converter)', async ({ page }) => {
    await editReady(page);
    await activatePage(page, 'Convert');
    await openEditBarMenu(page, 'page');
    const del = openMenu(page).getByRole('menuitem', { name: /Delete page/ });
    await expect(del).toBeDisabled();
    await expect(del).toContainText('Used by the preset converter');
    await page.keyboard.press('Escape');
    await openEditBarMenu(page, 'page');
    await openMenu(page).getByRole('menuitem', { name: 'Manage pages and templates…' }).click();
    const row = page.locator('.aw-lib-row.page').filter({ hasText: 'Convert' });
    await expect(row.getByRole('button', { name: 'Delete Convert' })).toBeDisabled();
  });

  test('Reset to default restores the spec and parks a foreign panel; Undo reverts in one step', async ({ page }) => {
    await editReady(page);
    await activatePage(page, 'Footswitches');
    await openCatalog(page);
    const history = catalogRow(page, 'instance:axis.history');
    await expect(history).toHaveAttribute('data-catalog-status', 'not placed');
    await history.locator('.aw-lib-grab').click();
    await expect(history).toHaveAttribute('data-catalog-status', 'on this page');
    await closeDrawer(page);
    await expect(tabOf(page, 'History')).toHaveCount(1);

    await openEditBarMenu(page, 'page');
    await openMenu(page).getByRole('menuitem', { name: 'Reset to default' }).click();
    await expect(openMenu(page)).toContainText('Reset “Footswitches” to its default panels?');
    await openMenu(page).getByRole('menuitem', { name: 'Reset', exact: true }).click();
    await expect(openMenu(page)).toHaveCount(0);
    await expect(tabOf(page, 'History')).toHaveCount(0);
    await expect(tabOf(page, 'Footswitches')).toHaveCount(1);

    await openCatalog(page);
    await expect(catalogRow(page, 'instance:axis.history')).toHaveAttribute('data-catalog-status', 'not placed');
    await closeDrawer(page);

    await undo(page);
    await expect(tabOf(page, 'History')).toHaveCount(1);
    await expect(tabOf(page, 'Footswitches')).toHaveCount(1);
  });

  test('Clear page empties a custom page', async ({ page }) => {
    await editReady(page);
    await addBlankPage(page);
    await addCustomPanel(page);
    await expect(regionTabs(page, 'main')).toHaveCount(1);

    await openEditBarMenu(page, 'page');
    await expect(openMenu(page).getByRole('menuitem', { name: 'Reset to default' })).toHaveCount(0);
    await openMenu(page).getByRole('menuitem', { name: 'Clear page' }).click();
    await openMenu(page).getByRole('menuitem', { name: 'Clear', exact: true }).click();
    await expect(regionTabs(page, 'main')).toHaveCount(0);
    await expect(page.locator('[data-empty-region="main"]')).toBeVisible();
  });

  test('Remove from page parks a panel; the catalog moves the same instance back (no duplicate)', async ({ page }) => {
    await editReady(page);
    // Locked = cannot leave the layout: the Signal Grid can move but not be removed.
    await stackOf(page, 'Signal Grid').locator('.aw-pane-btn[title="Panel actions"]').click();
    await expect(openMenu(page).getByRole('menuitem', { name: /Move to/ })).toBeEnabled();
    await expect(openMenu(page).getByRole('menuitem', { name: /Remove from page/ })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(openMenu(page)).toHaveCount(0);

    await page.locator('.aw-tabstack[data-region="bottom"] [data-pane-remove]').click();
    await expect(tabOf(page, 'Block Editor')).toHaveCount(0);

    await openCatalog(page);
    const row = catalogRow(page, 'instance:axis.blockEditor');
    await expect(row).toHaveAttribute('data-catalog-status', 'not placed');
    await expect(catalogRow(page, 'canonical:axis.blockEditor')).toHaveCount(0);
    await row.locator('.aw-lib-grab').click();
    await expect(row).toHaveAttribute('data-catalog-status', 'on this page');
    await closeDrawer(page);
    await expect(tabOf(page, 'Block Editor')).toHaveCount(1);
    await expect.poll(async () => {
      const layout = await storedLayout(page);
      return Object.values(layout?.panels ?? {}).filter((panel: any) => panel.singletonKey === 'axis.blockEditor').length;
    }).toBe(1);
  });

  test('a parked panel can be dragged out of the catalog onto an exact dock spot', async ({ page }) => {
    await editReady(page);
    await page.locator('.aw-tabstack[data-region="bottom"] [data-pane-remove]').click();
    await expect(tabOf(page, 'Block Editor')).toHaveCount(0);

    await openCatalog(page);
    const grab = catalogRow(page, 'instance:axis.blockEditor').locator('.aw-lib-grab');
    await grab.scrollIntoViewIfNeeded();
    await grab.hover();
    const g = (await grab.boundingBox())!;
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + g.width / 2 - 8, g.y + g.height / 2 + 8, { steps: 2 });
    await expect(page.locator('.aw-root.aw-dragging-panel')).toHaveCount(1);
    await expect(page.locator('.aw-lib-drawer')).toHaveCount(0);
    const grid = (await stackOf(page, 'Signal Grid').boundingBox())!;
    await page.mouse.move(grid.x + grid.width * 0.9, grid.y + grid.height * 0.5, { steps: 8 });
    await page.mouse.move(grid.x + grid.width * 0.9, grid.y + grid.height * 0.5, { steps: 2 });
    await page.mouse.up();

    await expect(page.locator('.aw-root.aw-dragging-panel')).toHaveCount(0);
    await expect(page.locator('.aw-tabstack[data-region="main"]').filter({ hasText: 'Block Editor' })).toHaveCount(1);
    const editor = (await stackOf(page, 'Block Editor').boundingBox())!;
    const gridAfter = (await stackOf(page, 'Signal Grid').boundingBox())!;
    expect(editor.x).toBeGreaterThan(gridAfter.x + gridAfter.width - 2);
    await expect(tabOf(page, 'Block Editor')).toHaveCount(1);
  });

  test('a custom panel survives deleting its page (listed, re-addable, with its widgets); Delete everywhere removes it after a confirm', async ({ page }) => {
    await editReady(page);
    await addBlankPage(page);
    await addCustomPanel(page);
    const zone = page.locator('.aw-workspace [data-zone^="panel:"]');
    await expect(zone).toHaveCount(1);
    const zoneId = (await zone.getAttribute('data-zone'))!;
    const panelId = zoneId.slice('panel:'.length);

    // Drop a hidden widget (Search) into the custom panel (Widgets drawer, from the Add palette's footer).
    await openAddPalette(page);
    await addPalette(page).locator('[data-manage="widgets"]').click();
    const hidden = page.locator('.aw-lib-row.add.aw-lib-draggable').filter({ hasText: 'Search' }).first();
    await expect(hidden).toBeVisible();
    await hidden.hover(); // waits out the drawer's slide-in so the box is final
    const hb = (await hidden.boundingBox())!;
    const zb = (await zone.boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 - 8, hb.y + hb.height / 2 + 8);
    await page.mouse.move(zb.x + zb.width / 2, zb.y + zb.height / 2, { steps: 12 });
    await page.mouse.move(zb.x + zb.width / 2, zb.y + zb.height / 2, { steps: 3 });
    await page.mouse.up();
    await expect(zone.locator('[data-widget-host]')).toHaveCount(1);

    await deleteActivePage(page);
    await expect.poll(async () => {
      const layout = await storedLayout(page);
      return [!!layout?.panels?.[panelId], layout?.widgets?.['axis.widget.search']?.zone];
    }).toEqual([true, zoneId]);

    await activatePage(page, 'Grid');
    await openCatalog(page);
    const row = catalogRow(page, `instance:${panelId}`);
    await expect(row).toHaveAttribute('data-catalog-status', 'not placed');
    await row.locator('.aw-lib-grab').click();
    await expect(row).toHaveAttribute('data-catalog-status', 'on this page');
    await closeDrawer(page);
    await expect(page.locator(`.aw-workspace [data-zone="${zoneId}"] [data-widget-host]`)).toHaveCount(1);

    await openCatalog(page);
    await row.getByRole('button', { name: /Delete .* everywhere/ }).click();
    await expect(row).toContainText('everywhere?');
    await row.getByRole('button', { name: 'Cancel' }).click();
    await expect(row).toHaveAttribute('data-catalog-status', 'on this page');
    await row.getByRole('button', { name: /Delete .* everywhere/ }).click();
    await row.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(catalogRow(page, `instance:${panelId}`)).toHaveCount(0);
    await closeDrawer(page);
    await expect(page.locator(`.aw-workspace [data-zone="${zoneId}"]`)).toHaveCount(0);
  });

  test('the catalog offers one "New custom panel" and hides the empty parked seed custom panel', async ({ page }) => {
    await editReady(page);
    await openCatalog(page);
    await expect(catalogRow(page, 'canonical:axis.customPanel')).toContainText('New custom panel');
    await expect(catalogRow(page, 'instance:axis.customPanel')).toHaveCount(0);
    // The empty parked seed custom panel sits in one bulk row: Delete all asks first.
    const empties = page.locator('[data-panel-catalog] [data-catalog-empties]');
    await expect(empties).toContainText('Empty custom panels (1)');
    await empties.getByRole('button', { name: 'Delete all' }).click();
    await expect(empties.locator('[data-lib-confirm]')).toContainText('Delete 1 empty custom panel? They hold no widgets.');
    await empties.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(empties).toHaveCount(0);
    await expect(page.locator('[data-panel-catalog] [data-catalog-entry]').filter({ hasText: 'Signal Grid' })).toHaveCount(1);
    await expect(catalogRow(page, 'canonical:axis.account')).toHaveCount(0);
  });

  test('the Library page list deletes only after an inline confirm', async ({ page }) => {
    await editReady(page);
    await openEditBarMenu(page, 'page');
    await openMenu(page).getByRole('menuitem', { name: 'Manage pages and templates…' }).click();
    const row = page.locator('.aw-lib-row.page').filter({ hasText: 'Scenes' });
    await row.getByRole('button', { name: 'Delete Scenes' }).click();
    await expect(row.locator('[data-lib-confirm]')).toContainText('Its panels stay available in Add panel');
    await row.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('[data-nav-entry="scenes"]')).toHaveCount(1);
    await row.getByRole('button', { name: 'Delete Scenes' }).click();
    await row.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.locator('.aw-lib-row.page').filter({ hasText: 'Scenes' })).toHaveCount(0);
    await expect(page.locator('[data-nav-entry="scenes"]')).toHaveCount(0);
  });

  test('the nav "+" opens the Add palette on Pages; the nav context menu offers Delete only in edit mode', async ({ page }) => {
    await bootCleanWorkbench(page);
    const scenes = page.locator('[data-nav-entry="scenes"]');

    // View mode: no destructive page actions in the nav context menu.
    await scenes.click({ button: 'right' });
    await expect(openMenu(page)).toBeVisible();
    await expect(openMenu(page).getByRole('menuitem', { name: 'Delete Page' })).toHaveCount(0);
    await expect(openMenu(page).getByRole('menuitem', { name: 'Reset to default' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(openMenu(page)).toHaveCount(0);
    // Escape hands focus back to the nav entry (the rail expands on focus): drop it.
    // Each attempt passes the pointer over the rail and off again, so a fresh pointerleave
    // always fires (a retry that only re-moves to the same point produces no event at all).
    await expect(async () => {
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      const rail = await page.locator('.aw-rail').boundingBox();
      if (rail) await page.mouse.move(rail.x + rail.width / 2, rail.y + rail.height / 2);
      await page.mouse.move(720, 20);
      await expect(page.locator('.aw-rail.aw-rail-expanded')).toHaveCount(0, { timeout: 1000 });
    }).toPass();

    await enterEditMode(page);
    await collapseRail(page);
    await scenes.click({ button: 'right' });
    await expect(openMenu(page).getByRole('menuitem', { name: 'Reset to default' })).toHaveCount(1);
    await openMenu(page).getByRole('menuitem', { name: 'Delete Page' }).click();
    await expect(openMenu(page)).toContainText('Delete “Scenes”? Its panels stay available in Add panel.');
    await expect(scenes).toHaveCount(1); // asked first
    await openMenu(page).getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await expect(scenes).toHaveCount(0);

    // "+" opens the Add palette on Pages (not a blank page right away).
    const navCount = await page.locator('[data-nav-entry]').count();
    await collapseRail(page);
    await page.locator('[data-nav-add-page]').click();
    await expect(addPalette(page)).toBeVisible();
    await expect(addPalette(page).locator('.cat.on')).toHaveText('Pages');
    await expect(page.locator('[data-nav-entry]')).toHaveCount(navCount);
    await expect(addPaletteCard(page, 'page', 'Scenes')).toBeVisible();
    await expect(addPaletteCard(page, 'page', 'Blank page')).toBeVisible();
    await expect(addPaletteCard(page, 'page', 'Restore default pages (1)')).toBeVisible();
    await choosePageCard(page, 'Scenes');
    await expect(scenes).toHaveCount(1);
    await expect(page.locator('[data-nav-entry]').nth(4)).toHaveAttribute('data-nav-entry', 'scenes');
  });
});
