import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, clickNav, regionTabs, WORKBENCH_DOC_KEY } from './support/workbench';

test.describe('Persistence', () => {
  test('a rearrangement survives a reload', async ({ page }) => {
    await bootCleanWorkbench(page);

    // Activate the Live page — a persisted layout change NOT in the default layout
    // (Grid is active by default, so the Live page becoming active is an
    // unambiguous signal that the page selection was persisted).
    await clickNav(page, 'live');
    await expect(regionTabs(page, 'main').filter({ hasText: 'Live' })).toHaveCount(1);

    // Wait for the ~150ms-debounced cache write to actually land before reloading —
    // otherwise this races the debounce (the pagehide flush covers it on Chromium
    // but not reliably on Firefox's `page.reload()`).
    await page.waitForFunction(
      (key) => (window.localStorage.getItem(key) ?? '').includes('"activePageId":"axis.page.live"'),
      WORKBENCH_DOC_KEY
    );

    // Reload WITHOUT clearing storage — the layout must persist.
    await page.reload();
    await page.waitForSelector('.aw-root');
    await expect(regionTabs(page, 'main').filter({ hasText: 'Live' })).toHaveCount(1);
  });

  test('a corrupt stored document self-heals to defaults (no blank page)', async ({ page }) => {
    await bootCleanWorkbench(page);

    // Activate a non-default page (Live) so we can prove the corrupt reload drops
    // it and returns to the canonical default layout.
    await clickNav(page, 'live');
    await expect(regionTabs(page, 'main').filter({ hasText: 'Live' })).toHaveCount(1);

    // Cache writes are debounced ~150ms (storage hardening round 11) with a
    // pagehide flush of PENDING writes — corrupting inside the debounce window
    // would just be overwritten by that flush on reload (correct app behavior:
    // never lose an edit on close). Wait until the docked state has actually
    // landed in storage so the corruption is the final word.
    // ROUND 15 (Pages): the Live panel ships in the roster from boot, so key off
    // the ACTIVE page instead — clicking the Live nav entry activates the Live
    // page, and that activePageId is the unambiguous signal the click persisted.
    await page.waitForFunction(
      (key) => (window.localStorage.getItem(key) ?? '').includes('"activePageId":"axis.page.live"'),
      WORKBENCH_DOC_KEY
    );
    // …and then let ALL debounced writes drain: docking dispatches more than one
    // command, so a second 150ms timer can still be pending after the first write
    // lands — it would rewrite the doc right over our corruption. 400ms > any
    // trailing debounce window.
    await page.waitForTimeout(400);

    // Corrupt the persisted doc with invalid JSON, then reload.
    await page.evaluate((key) => window.localStorage.setItem(key, '{not valid json'), WORKBENCH_DOC_KEY);
    await page.reload();

    // The shell still boots and renders the default layout — not a blank page.
    await page.waitForSelector('.aw-root');
    await expect(page.locator('.aw-root')).toHaveCount(1);
    await expect(regionTabs(page, 'main').filter({ hasText: 'Block Editor' })).toHaveCount(1);
    // The Live page from the corrupt doc is gone — we're back to defaults
    // (Block Editor in main).
    await expect(regionTabs(page, 'main').filter({ hasText: 'Live' })).toHaveCount(0);
  });
});
