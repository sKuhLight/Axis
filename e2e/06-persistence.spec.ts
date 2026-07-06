import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, clickNav, regionTabs, WORKBENCH_DOC_KEY } from './support/workbench';

test.describe('Persistence', () => {
  test('a rearrangement survives a reload', async ({ page }) => {
    await bootCleanWorkbench(page);

    // Dock the Setup panel — a persisted layout change.
    await clickNav(page, 'setup');
    await expect(regionTabs(page, 'main').filter({ hasText: 'Setup' })).toHaveCount(1);

    // Reload WITHOUT clearing storage — the layout must persist.
    await page.reload();
    await page.waitForSelector('.aw-root');
    await expect(regionTabs(page, 'main').filter({ hasText: 'Setup' })).toHaveCount(1);
  });

  test('a corrupt stored document self-heals to defaults (no blank page)', async ({ page }) => {
    await bootCleanWorkbench(page);

    // Corrupt the persisted doc with invalid JSON, then reload.
    await page.evaluate((key) => window.localStorage.setItem(key, '{not valid json'), WORKBENCH_DOC_KEY);
    await page.reload();

    // The shell still boots and renders the default layout — not a blank page.
    await page.waitForSelector('.aw-root');
    await expect(page.locator('.aw-root')).toHaveCount(1);
    await expect(regionTabs(page, 'main').filter({ hasText: 'Signal Grid' })).toHaveCount(1);
    await expect(regionTabs(page, 'bottom').filter({ hasText: 'Block Editor' })).toHaveCount(1);
    // The Setup panel from the corrupt doc is gone — we're back to defaults.
    await expect(regionTabs(page, 'main').filter({ hasText: 'Setup' })).toHaveCount(0);
  });
});
