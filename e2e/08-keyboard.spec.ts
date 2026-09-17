import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, clickNav, collapseRail } from './support/workbench';

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

  test('T toggles the tuner overlay, and never fires while typing (T18)', async ({ page }) => {
    // The tuner toggle is optimistic and reverts if `POST /tuner` fails, so answer it locally —
    // e2e must not reach the operator's live device, and an unanswered call would close the overlay.
    await page.route('**/tuner', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }),
    );
    await bootCleanWorkbench(page);

    const tuner = page.locator('[data-screen="Tuner"]');
    await expect(tuner).toHaveCount(0);

    // `t` opens it, `t` again closes it.
    await page.keyboard.press('t');
    await expect(tuner).toBeVisible();
    await page.keyboard.press('t');
    await expect(tuner).toHaveCount(0);

    // Escape closes it too (the shortcut must not disturb the existing Escape chain).
    await page.keyboard.press('t');
    await expect(tuner).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tuner).toHaveCount(0);
  });

  test('? opens the cheat sheet anywhere, listing only the keys that work there', async ({ page }) => {
    await bootCleanWorkbench(page); // lands on Grid

    const sheet = page.locator('[role="dialog"]').filter({ hasText: 'Keyboard shortcuts' });

    // On Grid every group is available.
    await page.keyboard.press('?');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.sc-group-title')).toContainText(['Essentials', 'Editing', 'Tools']);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);

    // Off Grid the grid-only rows are gone, but the global help keys remain.
    await clickNav(page, 'live');
    await collapseRail(page);
    await page.keyboard.press('?');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('.sc-group-title', { hasText: 'Editing' })).toHaveCount(0);
    await expect(sheet.locator('.sc-label', { hasText: 'Quick Build' })).toHaveCount(0);
    await expect(sheet.locator('.sc-label', { hasText: 'Tap tempo' })).toHaveCount(0);
    await expect(sheet.locator('.sc-label', { hasText: 'Show this shortcut list' })).toHaveCount(1);
  });
});
