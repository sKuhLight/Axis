import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, enterEditMode, exitEditMode, clickNav, collapseRail, regionTabs } from './support/workbench';

test.describe('Dock interactions', () => {
  test('drag a panel tab from the right dock into the main region', async ({ page }) => {
    await bootCleanWorkbench(page);
    // Tab dragging is an edit-mode gesture (TabStack.tabPointerDown gates on editMode).
    await enterEditMode(page);

    // Signal Grid ships undocked by default, so this drags History (right dock, tabbed
    // alongside My Controls) into main instead — same gesture, a pane that's actually there.
    const src = regionTabs(page, 'right').filter({ hasText: 'History' }).first();
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

    // History now lives in the main stack alongside Block Editor.
    await expect(regionTabs(page, 'main')).toHaveText([/Block Editor/, /History/]);
  });

  test('tab switching activates the clicked panel', async ({ page }) => {
    await bootCleanWorkbench(page);
    // ROUND 15 (Pages): nav clicks switch PAGES (they no longer accumulate tabs in
    // one stack). To get a multi-tab main stack, drag History (right dock) into main
    // so main = [Block Editor, History], then switch tabs.
    await enterEditMode(page);
    const src = regionTabs(page, 'right').filter({ hasText: 'History' }).first();
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
    await expect(mainTabs).toHaveText([/Block Editor/, /History/]);
    await exitEditMode(page);
    await collapseRail(page);

    // Clicking the History tab activates it; clicking Block Editor switches back.
    await mainTabs.filter({ hasText: 'History' }).click();
    await expect(mainTabs.filter({ hasText: 'History' })).toHaveClass(/active/);
    await mainTabs.filter({ hasText: 'Block Editor' }).click();
    await expect(mainTabs.filter({ hasText: 'Block Editor' })).toHaveClass(/active/);
    await expect(mainTabs.filter({ hasText: 'History' })).not.toHaveClass(/active/);
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
