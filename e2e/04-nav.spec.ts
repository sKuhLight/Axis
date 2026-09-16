import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, clickNav, regionTabs } from './support/workbench';

test.describe('Navigation', () => {
  test('Setup docks a VirtualScreen panel and tints the entry active; a second click focuses (no duplicate)', async ({ page }) => {
    await bootCleanWorkbench(page);

    await clickNav(page, 'setup');

    // A Setup panel docks into the main stack and the nav entry goes active.
    await expect(regionTabs(page, 'main').filter({ hasText: 'Setup' })).toHaveCount(1);
    await expect(page.locator('[data-nav-entry="setup"][data-nav-active="true"]')).toHaveCount(1);

    // Clicking again focuses the existing panel — it must not add a second tab.
    await clickNav(page, 'setup');
    await expect(regionTabs(page, 'main').filter({ hasText: 'Setup' })).toHaveCount(1);
  });

  test('Live docks a placeholder panel', async ({ page }) => {
    await bootCleanWorkbench(page);

    await clickNav(page, 'live');
    await expect(regionTabs(page, 'main').filter({ hasText: 'Live' })).toHaveCount(1);
    // The placeholder panel body describes the future feature (no device needed).
    await expect(page.locator('.aw-tabstack[data-region="main"] .aw-tabbody')).toContainText(/Live/i);
  });

  test('active tint follows the selected section', async ({ page }) => {
    await bootCleanWorkbench(page);

    await clickNav(page, 'setup');
    await expect(page.locator('[data-nav-entry="setup"][data-nav-active="true"]')).toHaveCount(1);

    await clickNav(page, 'live');
    await expect(page.locator('[data-nav-entry="live"][data-nav-active="true"]')).toHaveCount(1);
    // Setup is no longer the active section.
    await expect(page.locator('[data-nav-entry="setup"][data-nav-active="true"]')).toHaveCount(0);
  });
});
