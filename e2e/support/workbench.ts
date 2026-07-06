import { type Page, expect } from '@playwright/test';

/** localStorage key the workbench store persists its document under. */
export const WORKBENCH_DOC_KEY = 'axs.workbench.doc';

/**
 * Boot the gated shell with a clean persisted document.
 *
 * The store persists to localStorage on every change, so a prior run (or the
 * parallel dev session) can leave a stale layout behind. We navigate once,
 * clear storage, reload, then wait for the shell root — giving every test the
 * canonical default layout (Signal Grid main + Block Editor bottom, side nav,
 * gridbar with GRID + SIZE widgets).
 */
export async function bootCleanWorkbench(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate((key) => window.localStorage.removeItem(key), WORKBENCH_DOC_KEY);
  await page.reload();
  await page.waitForSelector('.aw-root');
  // The default layout writes a fresh doc back to storage on boot.
  await expect
    .poll(async () => page.evaluate((key) => !!window.localStorage.getItem(key), WORKBENCH_DOC_KEY))
    .toBe(true);
}

/** Enter edit mode via the Customize FAB and assert the editing chrome is up. */
export async function enterEditMode(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Customize/ }).click();
  await expect(page.locator('.aw-root.aw-editing')).toHaveCount(1);
}

/** Exit edit mode via the Done button. */
export async function exitEditMode(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^Done$/ }).click();
  await expect(page.locator('.aw-root.aw-editing')).toHaveCount(0);
}

/** Tabs in a given dock region's tab stack. */
export function regionTabs(page: Page, region: string) {
  return page.locator(`.aw-tabstack[data-region="${region}"] .aw-pane-tab`);
}

/** Click a navigation entry by its stable entry id (grid, setup, scenes, …). */
export async function clickNav(page: Page, entryId: string): Promise<void> {
  await page.locator(`[data-nav-entry="${entryId}"] button.axis-nav-entry`).click();
}
