import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, enterEditMode, regionTabs } from './support/workbench';

test.describe('Custom panels', () => {
  test('the "+ Panel" edit action inserts a custom panel with the empty-drop hint', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);

    await expect(regionTabs(page, 'main').filter({ hasText: 'Custom Panel' })).toHaveCount(0);

    // The "＋ Panel" ribbon action inserts a fresh custom panel into main.
    await page.getByRole('button', { name: /＋ Panel/ }).click();
    await expect(regionTabs(page, 'main').filter({ hasText: 'Custom Panel' })).toHaveCount(1);

    // A fresh custom panel shows the empty-drop affordance.
    await expect(page.locator('.aw-zone-empty').filter({ hasText: /EMPTY PANEL/i }).first()).toBeVisible();
  });
});
