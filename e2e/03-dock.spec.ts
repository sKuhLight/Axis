import { test, expect } from '@playwright/test';
import {
  bootCleanWorkbench,
  enterEditMode,
  exitEditMode,
  clickNav,
  collapseRail,
  editBarControl,
  openMenu,
  regionTabs
} from './support/workbench';

test.describe('Dock interactions', () => {
  test('drag a panel tab from bottom into the main region', async ({ page }) => {
    await bootCleanWorkbench(page);
    // Tab dragging is an edit-mode gesture (TabStack.tabPointerDown gates on editMode).
    await enterEditMode(page);

    const src = regionTabs(page, 'bottom').filter({ hasText: 'Block Editor' }).first();
    const mainStack = page.locator('.aw-tabstack[data-region="main"]');
    const sb = await src.boundingBox();
    const mb = await mainStack.boundingBox();
    expect(sb && mb).toBeTruthy();
    const tx = mb!.x + mb!.width / 2;
    const ty = mb!.y + mb!.height / 2;

    // Manual pointer drag: press, move past the 5px threshold, glide to main.
    await page.mouse.move(sb!.x + sb!.width / 2, sb!.y + sb!.height / 2);
    await page.mouse.down();
    await page.mouse.move(sb!.x + sb!.width / 2 + 8, sb!.y + sb!.height / 2 + 8);
    await page.mouse.move(tx, ty, { steps: 10 });

    // The drag layer semantics flip the root into panel-drag mode.
    await expect(page.locator('.aw-root.aw-dragging-panel')).toHaveCount(1);

    await page.mouse.move(tx, ty, { steps: 4 });
    await page.mouse.up();

    // Block Editor now lives in the main stack alongside Signal Grid.
    await expect(regionTabs(page, 'main')).toHaveText([/Signal Grid/, /Block Editor/]);
  });

  test('tab switching activates the clicked panel', async ({ page }) => {
    await bootCleanWorkbench(page);
    // ROUND 15 (Pages): nav clicks switch PAGES (they no longer accumulate tabs in
    // one stack). To get a multi-tab main stack, drag the Grid page's Block Editor
    // tab up into main so main = [Signal Grid, Block Editor], then switch tabs.
    await enterEditMode(page);
    const src = regionTabs(page, 'bottom').filter({ hasText: 'Block Editor' }).first();
    const mainStack = page.locator('.aw-tabstack[data-region="main"]');
    const sb = await src.boundingBox();
    const mb = await mainStack.boundingBox();
    expect(sb && mb).toBeTruthy();
    const tx = mb!.x + mb!.width / 2;
    const ty = mb!.y + mb!.height / 2;
    await page.mouse.move(sb!.x + sb!.width / 2, sb!.y + sb!.height / 2);
    await page.mouse.down();
    await page.mouse.move(sb!.x + sb!.width / 2 + 8, sb!.y + sb!.height / 2 + 8);
    await page.mouse.move(tx, ty, { steps: 10 });
    await page.mouse.move(tx, ty, { steps: 4 });
    await page.mouse.up();

    const mainTabs = regionTabs(page, 'main');
    await expect(mainTabs).toHaveText([/Signal Grid/, /Block Editor/]);
    await exitEditMode(page);
    await collapseRail(page);

    // Clicking the Block Editor tab activates it; clicking Signal Grid switches back.
    await mainTabs.filter({ hasText: 'Block Editor' }).click();
    await expect(mainTabs.filter({ hasText: 'Block Editor' })).toHaveClass(/active/);
    await mainTabs.filter({ hasText: 'Signal Grid' }).click();
    await expect(mainTabs.filter({ hasText: 'Signal Grid' })).toHaveClass(/active/);
    await expect(mainTabs.filter({ hasText: 'Block Editor' })).not.toHaveClass(/active/);
  });

  test('collapse a panel and remove it from the page via the pane header menu; it comes back from the catalog', async ({ page }) => {
    await bootCleanWorkbench(page);
    await clickNav(page, 'setup');
    await enterEditMode(page);

    // Open the header actions (⋯) menu of the main stack's active panel.
    await page.locator('.aw-pane-btn[title="Panel actions"]').first().click();
    const menu = page.locator('.aw-context-menu');
    await expect(menu).toBeVisible();
    // Move to ▸ · Maximize · Collapse · Save · Remove from page (Close Panel became the parking "Remove from page").
    await expect(menu.locator('.aw-menu-item')).toContainText(['Move to', 'Maximize Panel', 'Collapse Panel', 'Save To Library', 'Remove from page']);

    // Move to ▸ drills into the docks, Main and the other pages.
    await menu.getByRole('menuitem', { name: /Move to/ }).click();
    await expect(menu.getByRole('menuitem', { name: 'Right dock' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Main' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /^Page: / }).first()).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Back' }).click();

    // Collapse the active panel: the stack becomes a slim labelled strip.
    await menu.getByRole('menuitem', { name: /Collapse Panel/ }).click();
    await expect(menu).toHaveCount(0);
    const strip = page.locator('.aw-tabstack[data-region="main"] [data-pane-strip]');
    await expect(strip).toBeVisible();
    await expect(strip).toContainText('Setup');
    // Clicking the strip expands it again.
    await strip.click();
    await expect(strip).toHaveCount(0);

    // Re-open and remove the panel; the Setup tab disappears from the main stack…
    await page.locator('.aw-pane-btn[title="Panel actions"]').first().click();
    await page.locator('.aw-context-menu').getByRole('menuitem', { name: /Remove from page/ }).click();
    await expect(regionTabs(page, 'main').filter({ hasText: 'Setup' })).toHaveCount(0);

    // …but it is only parked: the catalog lists it as "not placed" and re-adds the same panel.
    await editBarControl(page, 'add').click();
    await openMenu(page).getByRole('menuitem', { name: 'Add panel…' }).click();
    const row = page.locator('[data-panel-catalog] [data-catalog-entry="instance:axis.setup"]');
    await expect(row).toHaveAttribute('data-catalog-status', 'not placed');
    await row.locator('.aw-lib-grab').click();
    await expect(row).toHaveAttribute('data-catalog-status', 'on this page');
    await page.locator('.aw-lib-drawer .aw-lib-close').click();
    await expect(regionTabs(page, 'main').filter({ hasText: 'Setup' })).toHaveCount(1);
  });
});
