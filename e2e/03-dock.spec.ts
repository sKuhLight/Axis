import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, enterEditMode, exitEditMode, clickNav, collapseRail, regionTabs, regionPanel } from './support/workbench';

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

    // History now lives in the main stack alongside Block Editor (order depends on
    // where the drop lands, so assert membership rather than sequence).
    const mainTabs = regionTabs(page, 'main');
    await expect(mainTabs).toHaveCount(2);
    await expect(mainTabs.filter({ hasText: 'Block Editor' })).toHaveCount(1);
    await expect(mainTabs.filter({ hasText: 'History' })).toHaveCount(1);
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
    await expect(mainTabs).toHaveCount(2);
    await expect(mainTabs.filter({ hasText: 'Block Editor' })).toHaveCount(1);
    await expect(mainTabs.filter({ hasText: 'History' })).toHaveCount(1);
    await exitEditMode(page);
    await collapseRail(page);

    // Clicking the History tab activates it; clicking Block Editor switches back.
    await mainTabs.filter({ hasText: 'History' }).click();
    await expect(mainTabs.filter({ hasText: 'History' })).toHaveClass(/active/);
    await mainTabs.filter({ hasText: 'Block Editor' }).click();
    await expect(mainTabs.filter({ hasText: 'Block Editor' })).toHaveClass(/active/);
    await expect(mainTabs.filter({ hasText: 'History' })).not.toHaveClass(/active/);
  });

  test('collapse and close a panel from the pane header buttons', async ({ page }) => {
    await bootCleanWorkbench(page);
    await clickNav(page, 'setup');
    await enterEditMode(page);

    // The Setup page's only panel docks in main — its header's collapse/close
    // buttons act on the active panel directly (the old ⋯ menu is gone).
    const stack = page.locator('.aw-tabstack[data-region="main"]').first();

    // Collapse the active panel; the header button flips to "Expand panel".
    await stack.locator('.aw-pane-btn[title="Collapse panel"]').click();
    await expect(stack.locator('.aw-pane-btn[title="Expand panel"]')).toHaveCount(1);

    // Close the panel; the Setup panel disappears from the stack.
    await stack.locator('.aw-pane-btn[title="Close panel"]').click();
    await expect(regionPanel(page, 'main', 'axis.setup')).toHaveCount(0);
  });
});
