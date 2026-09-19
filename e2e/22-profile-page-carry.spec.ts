import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, clickNav, collapseRail, regionPanel } from './support/workbench';

/**
 * Regression: narrowing the window silently changed which VIEW you were looking at.
 *
 * The shell auto-switches device profiles on resize (760 / 1366 px, `core/profiles.ts`),
 * and every profile owns its own layout with its own `activePageId`. So crossing a
 * breakpoint used to drop you onto whatever page THAT profile's layout was last left on
 * — from the Preset Browser to the Block Editor, and back on widening.
 * The reducer's `profile.activate` now carries the active page onto the incoming layout.
 *
 * Chrome may adapt to the width (bottom nav, compact widgets); the page must not move.
 */
test.describe('Profile switch carries the active page', () => {
  /** Which page is rendered, read from the panel docked in the main region. */
  const mainPanel = (page: import('@playwright/test').Page, panelId: string) =>
    regionPanel(page, 'main', panelId);

  test('resizing across both breakpoints keeps the Preset Browser on screen', async ({ page }) => {
    await bootCleanWorkbench(page);

    await clickNav(page, 'library');
    await expect(mainPanel(page, 'axis.presetBrowser')).toHaveCount(1);

    // Desktop → tablet (< 1366): the profile swaps, the view must not.
    await page.setViewportSize({ width: 1100, height: 900 });
    await expect(mainPanel(page, 'axis.presetBrowser')).toHaveCount(1);

    // Tablet → phone (< 760).
    await page.setViewportSize({ width: 420, height: 900 });
    await expect(mainPanel(page, 'axis.presetBrowser')).toHaveCount(1);

    // And all the way back up.
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(mainPanel(page, 'axis.presetBrowser')).toHaveCount(1);

    // The Grid page is still reachable from the restored desktop chrome.
    await collapseRail(page);
    await clickNav(page, 'grid');
    await expect(mainPanel(page, 'axis.blockEditor')).toHaveCount(1);
  });

});
