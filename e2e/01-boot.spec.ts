import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, regionTabs } from './support/workbench';

test.describe('Boot', () => {
  test('shell renders its core chrome', async ({ page }) => {
    await bootCleanWorkbench(page);

    // Shell root + left rail.
    await expect(page.locator('.aw-root')).toHaveCount(1);
    await expect(page.locator('[data-zone-shell="rail"]')).toHaveCount(1);

    // Top bar widget zones.
    await expect(page.locator('[data-zone="top.left"]')).toHaveCount(1);
    await expect(page.locator('[data-zone="top.right"]')).toHaveCount(1);

    // Default dock: Signal Grid pane header + Block Editor tab.
    await expect(regionTabs(page, 'main').filter({ hasText: 'Signal Grid' })).toHaveCount(1);
    await expect(regionTabs(page, 'bottom').filter({ hasText: 'Block Editor' })).toHaveCount(1);

    // Navigation rail is populated.
    await expect(page.locator('[data-nav-entry]').first()).toBeVisible();
  });

  test('no unexpected console errors beyond the ForgeFX connection failures', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));

    await bootCleanWorkbench(page);
    await page.waitForTimeout(1500);

    // With no ForgeFX backend the `/api` proxy fails; the app surfaces these as
    // network/resource errors. Filter exactly those, then assert nothing else.
    const isBackendError = (text: string) =>
      /Failed to load resource/i.test(text) ||
      /net::ERR/i.test(text) ||
      /\b(500|502|503|504)\b/.test(text) ||
      /Internal Server Error/i.test(text) ||
      /\/api\b/.test(text) ||
      /forgefx/i.test(text) ||
      /fetch/i.test(text);

    const unexpected = errors.filter((e) => !isBackendError(e));
    expect(unexpected, `unexpected console errors:\n${unexpected.join('\n')}`).toEqual([]);
  });
});
