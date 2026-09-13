import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, clickNav } from './support/workbench';

/**
 * V14c — bottom-nav mode.
 *
 * When navigation.mode === 'bottom' the side rail must NOT render the nav (the
 * entries move to the bottom bar). A widgets-only rail may survive for rail-zone
 * widgets (e.g. connection status) but never carries the nav.
 *
 * Every profile (desktop/tablet/phone) boots with the same side-nav layout — see
 * `feature-deletion` — so a phone-width viewport shows the same hamburger/drawer
 * pattern the side rail uses at any narrow width, not a persistent bottom bar.
 */

/** Switch the nav mode via a nav entry's right-click context menu. */
async function switchNavMode(
  page: import('@playwright/test').Page,
  to: 'bottom' | 'side',
  entry = page.locator('[data-nav-entry="grid"]').first()
): Promise<void> {
  await entry.click({ button: 'right' });
  const label = to === 'bottom' ? 'Use Bottom Navigation' : 'Use Side Navigation';
  await page.getByRole('menuitem', { name: label }).click();
}

test.describe('Bottom navigation mode', () => {
  test('bottom mode: nav is in the bottom bar and the rail carries no nav', async ({ page }) => {
    await bootCleanWorkbench(page);

    // Default boots in side mode: nav lives in the rail.
    await expect(page.locator('.aw-rail nav.aw-nav')).toHaveCount(1);

    await switchNavMode(page, 'bottom');

    // Bottom mode: the nav moved to the bottom bar; the rail carries NO nav.
    await expect(page.locator('.aw-root.aw-nav-bottom')).toHaveCount(1);
    await expect(page.locator('[data-zone-shell="bottom-nav"] [data-nav-entry="grid"]')).toHaveCount(1);
    await expect(page.locator('.aw-rail nav.aw-nav')).toHaveCount(0);

    // The nav entries in the bottom bar still work (clicks land — geometry guard).
    await clickNav(page, 'setup');
    await expect(page.locator('[data-nav-entry="setup"][data-nav-active="true"]')).toHaveCount(1);

    // Back to side mode restores the rail nav.
    await switchNavMode(page, 'side');
    await expect(page.locator('.aw-root.aw-nav-bottom')).toHaveCount(0);
    await expect(page.locator('.aw-rail nav.aw-nav')).toHaveCount(1);
  });

  test('phone boots into the same side nav as desktop, collapsed into a hamburger at that width', async ({ page }) => {
    // Every profile seeds the same default (side-nav) layout, so a phone-width
    // viewport gets no special bottom-nav treatment — it's the generic side-nav
    // component collapsing into a hamburger/drawer at a narrow width, same as it
    // would for any profile resized this small.
    await bootCleanWorkbench(page);
    await page.setViewportSize({ width: 390, height: 780 });

    await expect(page.locator('.aw-root.aw-nav-bottom')).toHaveCount(0);
    await expect(page.locator('.aw-mobile-menu')).toBeVisible();
  });
});
