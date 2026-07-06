import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, enterEditMode, exitEditMode } from './support/workbench';

test.describe('Edit mode', () => {
  test('Customize toggles the edit ribbon; Done exits', async ({ page }) => {
    await bootCleanWorkbench(page);

    // Not editing initially.
    await expect(page.locator('.aw-root.aw-editing')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Customize/ })).toBeVisible();

    await enterEditMode(page);

    // The ribbon shows the EDIT LAYOUT label + the edit actions.
    await expect(page.locator('.aw-edit-label')).toHaveText(/EDIT LAYOUT/i);
    await expect(page.getByRole('button', { name: /Panels/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Widgets/ })).toBeVisible();

    // Done exits and the ribbon collapses back to the Customize FAB.
    await exitEditMode(page);
    await expect(page.getByRole('button', { name: /Customize/ })).toBeVisible();
  });

  test('edit mode surfaces per-panel edit chrome', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);

    // In edit mode a closable panel gains a Close (×) mini-action in its header.
    await expect(page.locator('.aw-pane-btn.danger[title="Close panel"]').first()).toBeVisible();
  });
});
