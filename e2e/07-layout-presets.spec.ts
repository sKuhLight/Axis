import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, editBarControl, enterEditMode, openEditBarMenu, openMenu } from './support/workbench';

test.describe('Layout presets', () => {
  test('LAYOUT menu lists the presets; Stage moves nav to the bottom bar; Default restores the side rail', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);

    // LAYOUT preset rows live in the edit bar's LAYOUT menu (radio items).
    await expect(editBarControl(page, 'layout')).toContainText('Default');
    await openEditBarMenu(page, 'layout');
    const presetTabs = page.locator('.axis-preset-tab');
    await expect(presetTabs).toHaveText(['Default', 'Stage', 'Studio', 'Compact']);
    await expect(openMenu(page).getByRole('menuitemradio')).toHaveCount(4);
    await expect(openMenu(page).getByRole('menuitemradio', { name: 'Default' })).toHaveAttribute('aria-checked', 'true');

    // Default layout uses the side rail — no bottom-nav.
    await expect(page.locator('.aw-root.aw-nav-bottom')).toHaveCount(0);

    // Apply Stage → navigation moves into the bottom bar (V14c).
    await openMenu(page).getByRole('menuitemradio', { name: 'Stage' }).click();
    await expect(openMenu(page)).toHaveCount(0);
    await expect(page.locator('.aw-root.aw-nav-bottom')).toHaveCount(1);
    await expect(page.locator('[data-zone-shell="bottom-nav"]')).toHaveCount(1);
    // The nav lives in the bottom bar, not the rail: the bottom-nav carries the
    // entries and the rail carries NO nav (V14c — the full sidebar is gone in
    // bottom mode; a widgets-only rail may remain but never the nav).
    await expect(page.locator('[data-zone-shell="bottom-nav"] [data-nav-entry="grid"]')).toHaveCount(1);
    await expect(page.locator('.aw-rail nav.aw-nav')).toHaveCount(0);
    // The trigger shows the active preset, and the menu re-checks it.
    await expect(editBarControl(page, 'layout')).toContainText('Stage');
    await openEditBarMenu(page, 'layout');
    await expect(openMenu(page).getByRole('menuitemradio', { name: 'Stage' })).toHaveAttribute('aria-checked', 'true');

    // Apply Default → the side rail navigation returns.
    await openMenu(page).getByRole('menuitemradio', { name: 'Default' }).click();
    await expect(page.locator('.aw-root.aw-nav-bottom')).toHaveCount(0);
    await expect(page.locator('.aw-rail nav.aw-nav')).toHaveCount(1);
  });

  test('Reset layout asks inline first', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await openEditBarMenu(page, 'layout');

    await openMenu(page).getByRole('menuitem', { name: 'Reset layout' }).click();
    // The row turned into a prompt; nothing ran yet.
    await expect(openMenu(page)).toContainText('Reset to the “Default” preset?');
    await openMenu(page).getByRole('menuitem', { name: 'Cancel' }).click();
    await expect(openMenu(page).getByRole('menuitem', { name: 'Reset layout' })).toBeVisible();
    await expect(page.locator('.aw-toast-text', { hasText: 'Applied "Default" layout' })).toHaveCount(0);

    // Confirm resets: the active preset is re-applied (the preset action toasts).
    await openMenu(page).getByRole('menuitem', { name: 'Reset layout' }).click();
    await openMenu(page).getByRole('menuitem', { name: 'Reset', exact: true }).click();
    await expect(openMenu(page)).toHaveCount(0);
    await expect(page.locator('.aw-toast-text', { hasText: 'Applied "Default" layout' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Undo layout change' })).toBeEnabled();
  });
});
