import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, clickNav } from './support/workbench';

/**
 * V14c / V14d — bottom-nav mode + phone persistence.
 *
 * V14c: when navigation.mode === 'bottom' the side rail must NOT render the nav
 * (the entries move to the bottom bar). A widgets-only rail may survive for
 * rail-zone widgets (e.g. connection status) but never carries the nav.
 *
 * V14d: on phone the bottom-nav bar is persistently visible — no hamburger, no
 * flyout — and its entries are icon-only.
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

  test('phone + bottom mode: the bottom nav is persistent — no hamburger', async ({ page }) => {
    // The design's mobile profile seeds `navMode:'side'` (hamburger drawer), so
    // phone does NOT force bottom nav — but WHEN bottom mode is active on the
    // phone profile it must be persistent (V14d). Shrink to phone width so the
    // phone profile activates, then flip THAT profile to bottom nav via the
    // hamburger drawer's entry context menu.
    await bootCleanWorkbench(page);
    await page.setViewportSize({ width: 390, height: 780 });

    // Phone defaults to side mode → hamburger present (design §9/§11).
    await expect(page.locator('.aw-mobile-menu')).toBeVisible();

    // Open the drawer, right-click an entry, choose "Use Bottom Navigation".
    await page.locator('.aw-mobile-menu').click();
    const railEntry = page.locator('.aw-rail nav.aw-nav [data-nav-entry="grid"]');
    await expect(railEntry).toBeVisible();
    // Dispatch the contextmenu directly (phone overlays can intercept a synthetic
    // right-click at a computed point; the event on the element is unambiguous).
    await railEntry.dispatchEvent('contextmenu');
    await page.getByRole('menuitem', { name: 'Use Bottom Navigation' }).click();

    // Wait for the phone profile to enter bottom mode.
    await expect(page.locator('.aw-root.aw-nav-bottom')).toHaveCount(1);

    // No hamburger and no scrim in bottom mode — the nav is always in the bar (V14d).
    await expect(page.locator('.aw-mobile-menu')).toHaveCount(0);
    await expect(page.locator('.aw-mobile-nav-scrim')).toHaveCount(0);

    // The bottom-nav bar is visible and its entries are reachable.
    const grid = page.locator('[data-zone-shell="bottom-nav"] [data-nav-entry="grid"]');
    await expect(grid).toBeVisible();
    await expect(page.locator('.aw-rail nav.aw-nav')).toHaveCount(0);

    // Entries are icon-only in the bottom bar (label hidden; icon shown).
    await expect(
      page.locator('[data-zone-shell="bottom-nav"] [data-nav-entry="grid"] .axis-nav-entry .lbl')
    ).toBeHidden();
    await expect(
      page.locator('[data-zone-shell="bottom-nav"] [data-nav-entry="grid"] .axis-nav-entry .ic')
    ).toBeVisible();
  });
});
