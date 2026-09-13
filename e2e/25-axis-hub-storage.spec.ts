import { test, expect } from '@playwright/test';
import { bootCleanWorkbench } from './support/workbench';

/**
 * The Storage tab only renders when the engine serves the local-folder routes
 * (`loc.available`), so mock `/local/config` to claim the routes exist. This keeps
 * the spec about the form fields, not about a live backend.
 */
async function bootAxisStorage(page: import('@playwright/test').Page): Promise<void> {
  await page.route('**/local/config', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ configured: false, root: null, exists: false, lastSync: null }),
    }),
  );
  await bootCleanWorkbench(page);
  await page.locator('[data-nav-entry="account"] button.axis-nav-entry').click();
  await page.getByRole('button', { name: 'Storage' }).click();
}

test.describe('Axis hub — Storage', () => {
  test('the block library path field shows the current value, not just a placeholder', async ({ page }) => {
    await bootAxisStorage(page);

    const input = page.locator('#blk-path');
    await input.fill('/tmp/axis-blocks');
    await expect(input).toHaveValue('/tmp/axis-blocks');

    // The value survives closing and reopening the hub.
    await page.keyboard.press('Escape');
    await page.locator('[data-nav-entry="account"] button.axis-nav-entry').click();
    await page.getByRole('button', { name: 'Storage' }).click();
    await expect(page.locator('#blk-path')).toHaveValue('/tmp/axis-blocks');
  });
});
