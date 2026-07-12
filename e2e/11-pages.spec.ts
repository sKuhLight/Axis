import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, clickNav, collapseRail } from './support/workbench';

/**
 * ROUND 15 — Pages navigation model: every seed page must ACTIVATE cleanly.
 *
 * Regression coverage: activating the Preset Browser page hard-froze the renderer
 * (synchronous infinite loop, no console error) — none of the earlier specs ever
 * clicked the PB/FC/Controllers/Scenes/Live/Setup nav entries, so the freeze
 * shipped through a fully green suite. This spec clicks EVERY page-bound nav
 * entry, asserts the page's panel renders, and proves the main thread stays
 * responsive after each switch (a trivial page.evaluate would never return on a
 * frozen renderer, so each assertion doubles as a liveness probe).
 */

/** The seven seed pages: nav entry id → expected visible content probe. */
const SEED_PAGES: { entry: string; pageId: string; probe: (page: import('@playwright/test').Page) => Promise<void> }[] = [
  {
    entry: 'library',
    pageId: 'axis.page.presetBrowser',
    probe: async (page) => {
      // The full-size Preset Browser panel body mounts in the main region.
      await expect(page.locator('.aw-tabstack[data-region="main"] .aw-pane-tab').filter({ hasText: 'Preset Browser' })).toHaveCount(1);
    }
  },
  {
    entry: 'fc',
    pageId: 'axis.page.fc',
    probe: async (page) => {
      await expect(page.locator('.aw-tabstack[data-region="main"] .aw-pane-tab').filter({ hasText: 'Footswitches' })).toHaveCount(1);
    }
  },
  {
    entry: 'controllers',
    pageId: 'axis.page.controllers',
    probe: async (page) => {
      await expect(page.locator('.aw-tabstack[data-region="main"] .aw-pane-tab').filter({ hasText: 'Controllers' })).toHaveCount(1);
    }
  },
  {
    entry: 'scenes',
    pageId: 'axis.page.scenes',
    probe: async (page) => {
      await expect(page.locator('.aw-tabstack[data-region="main"] .aw-pane-tab').filter({ hasText: 'Scenes' })).toHaveCount(1);
    }
  },
  {
    entry: 'live',
    pageId: 'axis.page.live',
    probe: async (page) => {
      await expect(page.locator('.aw-tabstack[data-region="main"] .aw-pane-tab').filter({ hasText: 'Live' })).toHaveCount(1);
    }
  },
  {
    entry: 'setup',
    pageId: 'axis.page.setup',
    probe: async (page) => {
      await expect(page.locator('.aw-tabstack[data-region="main"] .aw-pane-tab').filter({ hasText: 'Setup' })).toHaveCount(1);
    }
  }
];

test.describe('Pages: every seed page activates cleanly', () => {
  for (const seed of SEED_PAGES) {
    test(`"${seed.entry}" activates ${seed.pageId} without freezing`, async ({ page }) => {
      await bootCleanWorkbench(page);

      await clickNav(page, seed.entry);

      // Liveness probe FIRST: if the renderer entered a synchronous loop this
      // evaluate never resolves and the test times out right here (the repro).
      const active = await page.evaluate(
        (key) => JSON.parse(window.localStorage.getItem(key) ?? '{}'),
        'axs.workbench.doc'
      );
      void active;

      // The nav entry tints active (its page is the layout's activePageId).
      await expect(page.locator(`[data-nav-entry="${seed.entry}"][data-nav-active="true"]`)).toHaveCount(1);
      await seed.probe(page);

      // And the way BACK to Grid still works (page swap in both directions).
      await collapseRail(page);
      await clickNav(page, 'grid');
      await expect(page.locator('[data-nav-entry="grid"][data-nav-active="true"]')).toHaveCount(1);
      await expect(page.locator('.aw-tabstack[data-region="main"] .aw-pane-tab').filter({ hasText: 'Signal Grid' })).toHaveCount(1);
    });
  }
});
