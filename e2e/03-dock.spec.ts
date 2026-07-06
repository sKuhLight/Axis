import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, enterEditMode, clickNav, regionTabs } from './support/workbench';

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

    // Manual pointer drag: press, move past the 5px threshold, glide to main.
    await page.mouse.move(sb!.x + sb!.width / 2, sb!.y + sb!.height / 2);
    await page.mouse.down();
    await page.mouse.move(sb!.x + sb!.width / 2 + 8, sb!.y + sb!.height / 2 + 8);
    await page.mouse.move(mb!.x + mb!.width / 2, mb!.y + mb!.height / 2, { steps: 10 });

    // The drag layer semantics flip the root into panel-drag mode.
    await expect(page.locator('.aw-root.aw-dragging-panel')).toHaveCount(1);

    await page.mouse.move(mb!.x + mb!.width / 2, mb!.y + mb!.height / 2, { steps: 4 });
    await page.mouse.up();

    // Block Editor now lives in the main stack alongside Signal Grid.
    await expect(regionTabs(page, 'main')).toHaveText([/Signal Grid/, /Block Editor/]);
  });

  test('tab switching activates the clicked panel', async ({ page }) => {
    await bootCleanWorkbench(page);
    // Dock two extra panels into the main stack so it has multiple tabs.
    await clickNav(page, 'setup');
    await clickNav(page, 'scenes');

    const mainTabs = regionTabs(page, 'main');
    await expect(mainTabs).toHaveText([/Signal Grid/, /Setup/, /Scenes/]);
    // Last-docked panel is active.
    await expect(mainTabs.filter({ hasText: 'Scenes' })).toHaveClass(/active/);

    // Clicking the Signal Grid tab (outside edit mode) activates it.
    await mainTabs.filter({ hasText: 'Signal Grid' }).click();
    await expect(mainTabs.filter({ hasText: 'Signal Grid' })).toHaveClass(/active/);
    await expect(mainTabs.filter({ hasText: 'Scenes' })).not.toHaveClass(/active/);
  });

  test('collapse and close a panel from the pane header menu', async ({ page }) => {
    await bootCleanWorkbench(page);
    await clickNav(page, 'setup');
    await enterEditMode(page);

    // Open the header actions (⋯) menu of the main stack's active panel.
    await page.locator('.aw-pane-btn[title="Panel actions"]').first().click();
    const menu = page.locator('.aw-context-menu');
    await expect(menu).toBeVisible();
    await expect(menu.locator('.aw-menu-item')).toContainText(['Collapse Panel', 'Close Panel']);

    // Collapse the active panel.
    await menu.getByRole('menuitem', { name: /Collapse Panel/ }).click();
    await expect(menu).toHaveCount(0);

    // Re-open and close the panel; Setup tab disappears from the main stack.
    await page.locator('.aw-pane-btn[title="Panel actions"]').first().click();
    await page.locator('.aw-context-menu').getByRole('menuitem', { name: /Close Panel/ }).click();
    await expect(regionTabs(page, 'main').filter({ hasText: 'Setup' })).toHaveCount(0);
  });
});
