import { test, expect } from '@playwright/test';
import { addCustomPanel, bootCleanWorkbench, enterEditMode, regionTabs } from './support/workbench';

test.describe('Custom panels', () => {
  test('the "New custom panel" card inserts a custom panel with the empty-drop hint', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);

    await expect(regionTabs(page, 'main').filter({ hasText: 'Custom Panel' })).toHaveCount(0);

    // The main tab bar's "+" → Add palette → "New custom panel" inserts a fresh custom panel into main.
    await addCustomPanel(page);
    await expect(regionTabs(page, 'main').filter({ hasText: 'Custom Panel' })).toHaveCount(1);

    // Its empty body is one "+ Widget" button that keeps the drop hint (was "Empty Panel").
    const add = page.locator('[data-zone^="panel:"] .aw-zone-add-empty');
    await expect(add).toBeVisible();
    await expect(add).toContainText('+ Widget');
    await expect(add).toContainText(/drop widgets or parameters here/i);

    // It opens the Add palette on Widgets with the panel as the target.
    await add.click();
    await expect(page.locator('[role="dialog"][aria-label="Add to the layout"] .target')).toHaveText('✛ Into Custom Panel');
  });

  test('a widget dragged over the empty custom panel lights its "+ Widget" up; a release inserts it there', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await addCustomPanel(page);
    const add = page.locator('[data-zone^="panel:"] .aw-zone-add-empty');
    await expect(add).toBeVisible();

    const tuner = page.locator('[data-widget="axis.widget.tuner"]');
    const from = (await tuner.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 4, { steps: 3 });
    const to = (await add.boundingBox())!;
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 });
    // Slice 4b: no slot box; the empty panel's placeholder lights up where the widget lands.
    await expect.poll(async () => ((await add.getAttribute('class')) ?? '').split(' ')).toContain('ins');
    await expect(page.locator('[data-zone^="panel:"].drop-target')).toHaveCount(1);
    await expect(page.locator('[data-drag-slot]')).toHaveCount(0);
    await page.mouse.up();

    await expect(page.locator('[data-zone^="panel:"] [data-widget="axis.widget.tuner"]')).toHaveCount(1);
    await expect(page.locator('[data-zone="top.right"] [data-widget="axis.widget.tuner"]')).toHaveCount(0);
    await expect(add).toHaveCount(0);
  });
});
