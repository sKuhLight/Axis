import { test, expect } from '@playwright/test';
import { bootVisualWorkbench, clickNav, collapseRail } from './support/workbench';

test.describe('visual baselines', () => {
  test.skip(({ browserName }) => browserName !== 'chromium');

  test('desktop workbench shell', async ({ page }) => {
    await bootVisualWorkbench(page);
    await collapseRail(page);
    await expect(page).toHaveScreenshot('workbench-desktop.png');
  });

  test('shared dialog shell', async ({ page }) => {
    await bootVisualWorkbench(page);
    await page.locator('[data-widget="axis.widget.preset"] .preset-main').click();
    await expect(page.locator('[data-overlay="presetSearch"]')).toBeVisible();
    await expect(page).toHaveScreenshot('dialog-preset-search.png');
  });

  test('docked preset browser', async ({ page }) => {
    await bootVisualWorkbench(page);
    await clickNav(page, 'library');
    await expect(page.getByText('Preset Browser', { exact: true }).first()).toBeVisible();
    await collapseRail(page);
    await expect(page).toHaveScreenshot('preset-browser-docked.png');
  });

  test('mobile workbench', async ({ page }) => {
    await bootVisualWorkbench(page, { width: 390, height: 780 });
    await expect(page.locator('.aw-root.aw-nav-bottom')).toBeVisible();
    await expect(page).toHaveScreenshot('workbench-mobile.png');
  });
});
