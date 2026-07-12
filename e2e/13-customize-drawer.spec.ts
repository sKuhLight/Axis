import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, enterEditMode } from './support/workbench';

/**
 * ROUND 16 — Customize drawer rework (AXIS-24): the right-drawer views are now
 * Pages / Widgets / Layouts, each with a search field, and the Layouts view is
 * page-scoped (save the active page's dock into the shared store, apply a stored
 * layout back onto the active page). This spec exercises the search-filter and
 * the page-scoped save→apply round-trip end to end.
 */

async function openPages(page: import('@playwright/test').Page) {
  await enterEditMode(page);
  await page.getByRole('button', { name: /◳ Pages/ }).click();
  await expect(page.locator('.aw-lib-drawer')).toBeVisible();
}

test.describe('Customize drawer', () => {
  test('Pages view search filters the page list', async ({ page }) => {
    await bootCleanWorkbench(page);
    await openPages(page);

    const rows = page.locator('.aw-lib-row.page');
    const before = await rows.count();
    expect(before).toBeGreaterThan(1); // seed pages: Grid, Preset Browser, …

    // Type a query that matches exactly one seed page.
    await page.getByRole('textbox', { name: /Search pages/ }).fill('Grid');
    await expect(rows).toHaveCount(1);
    await expect(page.locator('.aw-lib-page-label')).toHaveText(/Grid/);

    // A no-match query shows the empty state (both the pages and panels sections
    // render one — assert the first).
    await page.getByRole('textbox', { name: /Search pages/ }).fill('zzzz-no-such-page');
    await expect(rows).toHaveCount(0);
    await expect(page.locator('.aw-lib-empty').first()).toBeVisible();

    // Clearing restores the full list.
    await page.locator('.aw-lib-search-clear').click();
    await expect(rows).toHaveCount(before);
  });

  test('Add Page appends a new page to the list', async ({ page }) => {
    await bootCleanWorkbench(page);
    await openPages(page);

    const rows = page.locator('.aw-lib-row.page');
    const before = await rows.count();
    // Scope to the drawer's Add Page control (the nav rail also has a per-page "+").
    await page.locator('.aw-lib-add-page', { hasText: 'Add Page' }).click();
    await expect(rows).toHaveCount(before + 1);
  });

  test('Layouts view saves the active page and applies it back', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await page.getByRole('button', { name: /⤓ Layouts/ }).click();
    await expect(page.locator('.aw-layout-drawer')).toBeVisible();

    // No saved page layouts yet.
    await expect(page.locator('.aw-layout-empty')).toBeVisible();

    await page.getByRole('button', { name: /Save This Page As Layout/ }).click();
    const rows = page.locator('.aw-layout-section .aw-layout-row');
    await expect(rows.first()).toBeVisible();

    // The saved layout can be applied back onto the active page.
    await page.getByRole('button', { name: 'Apply', exact: true }).first().click();
    await expect(page.locator('.aw-layout-status')).toContainText(/Applied/);

    // Search filters the saved layouts.
    await page.getByRole('textbox', { name: /Search saved/ }).fill('zzzz');
    await expect(rows).toHaveCount(0);
  });
});
