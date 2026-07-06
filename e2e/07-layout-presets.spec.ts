import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, enterEditMode } from './support/workbench';

test.describe('Layout presets', () => {
  test('LAYOUT tabs are visible; Stage moves nav to the bottom bar; Default restores the side rail', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);

    // LAYOUT preset tabs live in the edit ribbon.
    const presetTabs = page.locator('.axis-preset-tab');
    await expect(presetTabs).toHaveText(['Default', 'Stage', 'Studio', 'Compact']);

    // Default layout uses the side rail — no bottom-nav.
    await expect(page.locator('.aw-root.aw-nav-bottom')).toHaveCount(0);

    // Apply Stage → navigation moves into the bottom bar.
    await page.getByRole('button', { name: 'Stage', exact: true }).click();
    await expect(page.locator('.aw-root.aw-nav-bottom')).toHaveCount(1);
    await expect(page.locator('[data-zone-shell="bottom-nav"]')).toHaveCount(1);

    // Apply Default → the side rail navigation returns.
    await page.getByRole('button', { name: 'Default', exact: true }).click();
    await expect(page.locator('.aw-root.aw-nav-bottom')).toHaveCount(0);
    await expect(page.locator('.aw-rail nav.aw-nav')).toHaveCount(1);
  });
});
