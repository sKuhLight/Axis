import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, editBar, editBarControl, enterEditMode, exitEditMode } from './support/workbench';

test.describe('Edit mode', () => {
  test('Customize opens the edit bar; Done exits', async ({ page }) => {
    await bootCleanWorkbench(page);

    // Not editing initially: no edit bar.
    await expect(page.locator('.aw-root.aw-editing')).toHaveCount(0);
    await expect(editBar(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Customize/ })).toBeVisible();

    await enterEditMode(page);

    // The edit bar shows the CUSTOMIZE tag + the edit controls.
    await expect(editBar(page).locator('.aw-eb-tag')).toHaveText(/CUSTOMIZE/);
    await expect(page.getByRole('button', { name: 'Undo layout change' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Redo layout change' })).toBeVisible();
    await expect(editBarControl(page, 'page')).toBeVisible();
    await expect(editBarControl(page, 'layout')).toBeVisible();
    await expect(editBarControl(page, 'add')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Done', exact: true })).toHaveCount(1);
    // The bottom-bar toggle keeps its label and shows its pressed state.
    const toggle = page.locator('.aw-bottom-customize');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveClass(/active/);
    await expect(toggle).toContainText('Customize');

    // Done (in the bar) exits and the bar goes away.
    await editBarControl(page, 'done').click();
    await expect(page.locator('.aw-root.aw-editing')).toHaveCount(0);
    await expect(editBar(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Customize/ })).toBeVisible();

    // The bottom toggle exits too.
    await enterEditMode(page);
    await exitEditMode(page);
    await expect(editBar(page)).toHaveCount(0);
  });

  test('edit mode surfaces per-panel edit chrome', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);

    // In edit mode a removable panel gains a "Remove from page" (×) mini-action in its header.
    await expect(page.locator('.aw-pane-btn.danger[title="Remove from page"]').first()).toBeVisible();
    await expect(page.locator('.aw-pane-btn.danger[aria-label="Remove from page"]').first()).toBeVisible();
  });
});
