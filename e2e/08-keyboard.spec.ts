import { test, expect } from '@playwright/test';
import { bootCleanWorkbench } from './support/workbench';

test.describe('Keyboard', () => {
  test('Escape closes an open context menu and restores focus to the opener (T18)', async ({ page }) => {
    await bootCleanWorkbench(page);

    // Open the pane header actions menu via its button.
    const opener = page.locator('.aw-pane-btn[title="Panel actions"]').first();
    await opener.click();
    const menu = page.locator('.aw-context-menu');
    await expect(menu).toBeVisible();

    // Escape closes the menu.
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    // Focus returns to the opener button (focusTrap restore).
    await expect(opener).toBeFocused();
  });
});
