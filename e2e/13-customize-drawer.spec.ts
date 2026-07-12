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

  test('reorder pages via the shared list-reorder drag (R18 unifies the machinery)', async ({ page }) => {
    await bootCleanWorkbench(page);
    await openPages(page);

    const labels = page.locator('.aw-lib-row.page .aw-lib-page-label');
    expect(await labels.count()).toBeGreaterThan(2);
    const firstBefore = await labels.first().textContent();

    // Drag the first page's reorder grip down past the third row's midpoint.
    // hover() first so the drawer's slide-in animation has settled before we read
    // geometry (boundingBox does not auto-wait for a stable position).
    const grip = page.locator('.aw-lib-row.page .aw-lib-drag-grip').first();
    await grip.hover();
    const gb = (await grip.boundingBox())!;
    const thirdRow = (await page.locator('.aw-lib-row.page').nth(2).boundingBox())!;
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
    await page.mouse.down();
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2 + 8);
    await page.mouse.move(thirdRow.x + thirdRow.width / 2, thirdRow.y + thirdRow.height * 0.5, { steps: 10 });

    // Mid-drag the page reorder rides the SAME machinery as every other drag:
    // the body carries the .aw-dragging-list class, the DragLayer shows the
    // ghost (a clone of the grabbed row), and an in-flow dashed slot is spliced
    // into the list where the page will land.
    await expect(page.locator('.aw-root.aw-dragging-list')).toHaveCount(1);
    await expect(page.locator('.aw-drag-list-ghost')).toBeVisible();
    await expect(page.locator('.aw-lib-slot[data-drag-slot]')).toBeVisible();

    await page.mouse.move(thirdRow.x + thirdRow.width / 2, thirdRow.y + thirdRow.height * 0.75, { steps: 4 });
    await page.mouse.up();

    // Drag cleared and the page that was first is no longer first.
    await expect(page.locator('.aw-root.aw-dragging-list')).toHaveCount(0);
    await expect(labels.first()).not.toHaveText(firstBefore ?? '');
  });

  test('drag a hidden widget out of the drawer onto the layout', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await page.getByRole('button', { name: /⧉ Widgets/ }).click();
    await expect(page.locator('.aw-lib-drawer')).toBeVisible();

    // Ensure a hidden widget exists: hide a placed one first.
    const placed = page.locator('.aw-lib-row.placed:not([disabled])');
    test.skip((await placed.count()) === 0, 'no unlocked placed widget available to hide');
    await placed.first().click();

    const hidden = page.locator('.aw-lib-row.add.aw-lib-draggable').first();
    await expect(hidden).toBeVisible();
    await hidden.hover();
    const hb = (await hidden.boundingBox())!;

    const topbar = (await page.locator('.aw-topbar').boundingBox())!;
    const placedBefore = await page.locator('.aw-topbar [data-widget-host]').count();

    // Manual pointer drag out of the drawer into the top bar.
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 - 8, hb.y + hb.height / 2 + 8);
    await page.mouse.move(topbar.x + topbar.width / 2, topbar.y + topbar.height / 2, { steps: 12 });
    // The drag-out drives the same drag machinery as in-layout drags.
    await expect(page.locator('.aw-root.aw-dragging-widget')).toHaveCount(1);
    // …and auto-collapses the drawer the instant it activates (design behaviour).
    await expect(page.locator('.aw-lib-drawer')).toHaveCount(0);
    await page.mouse.move(topbar.x + topbar.width / 2, topbar.y + topbar.height / 2, { steps: 4 });
    await page.mouse.up();

    // Drag cleared and the widget landed in the top bar.
    await expect(page.locator('.aw-root.aw-dragging-widget')).toHaveCount(0);
    await expect(page.locator('.aw-topbar [data-widget-host]')).toHaveCount(placedBefore + 1);
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
