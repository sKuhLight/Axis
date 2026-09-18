import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, WORKBENCH_DOC_KEY } from './support/workbench';

/**
 * Navigation is ALWAYS the side rail on Axis.
 *
 * The bottom-bar mode was retired with the workbench layout menus: there is no
 * user control to switch to it, and `normalizeAxisWorkbenchDocument` clamps any
 * persisted `navigation.mode: 'bottom'` back to `'side'` on load — so even a
 * document written by an older client can never move a user into the bottom bar.
 *
 * Every profile (desktop/tablet/phone) boots with the same side-nav layout, so a
 * phone-width viewport shows the same hamburger/drawer pattern the side rail uses
 * at any narrow width, not a persistent bottom bar.
 */

/** Force a persisted bottom mode, then reload and let the app clamp it. */
async function seedBottomNavMode(page: import('@playwright/test').Page): Promise<void> {
  // Let any pending debounced persist from a prior interaction flush (the cache
  // write debounces 150 ms) before overwriting localStorage — otherwise the
  // reload's pagehide flush clobbers the seed with the still-pending document.
  await page.waitForTimeout(300);
  await page.evaluate(
    ({ key }) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) throw new Error('no persisted workbench doc to seed into');
      const doc = JSON.parse(raw);
      for (const layout of Object.values(doc.layouts as Record<string, { navigation: { mode: string } }>)) {
        layout.navigation.mode = 'bottom';
      }
      window.localStorage.setItem(key, JSON.stringify(doc));
    },
    { key: WORKBENCH_DOC_KEY }
  );
  await page.reload();
  await page.waitForSelector('.aw-root');
}

test.describe('Side-only navigation', () => {
  test('a persisted bottom mode is clamped back to the side rail', async ({ page }) => {
    await bootCleanWorkbench(page);

    // Default boots in side mode: nav lives in the rail.
    await expect(page.locator('.aw-rail nav.aw-nav')).toHaveCount(1);

    await seedBottomNavMode(page);

    // The clamp wins: no bottom bar, the rail keeps the nav.
    await expect(page.locator('.aw-root.aw-nav-bottom')).toHaveCount(0);
    await expect(page.locator('[data-zone-shell="bottom-nav"] [data-nav-entry="grid"]')).toHaveCount(0);
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
