import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, WORKBENCH_DOC_KEY } from './support/workbench';

/**
 * "New preset" — the bare + in the top-bar preset cluster opens a two-item menu: start from a
 * template, or clear the buffer to a blank preset ("start from zero"). The widget must sit to the
 * right of the scene/pencil widget and before Save. The template picker is a registry-owned modal
 * (opens on click, closes on Escape); no ForgeFX → its list body shows the empty/error state, which
 * is fine — this spec covers the trigger, the menu, and the modal shell.
 */
test.describe('New preset', () => {
  test('the + sits right of the scene widget and its menu opens the template picker', async ({ page }) => {
    await bootCleanWorkbench(page);

    const host = page.locator('[data-widget="axis.widget.newPreset"]');
    await expect(host).toHaveCount(1);

    // Persisted order: scenes < + < save (the + lands right of the scene pencil).
    const order = await page.evaluate((key) => {
      const doc = JSON.parse(window.localStorage.getItem(key) ?? '{}') as {
        layouts?: Record<string, { widgets?: Record<string, { order?: number }> }>;
      };
      const layout = Object.values(doc.layouts ?? {}).find((l) => l?.widgets?.['axis.widget.newPreset']);
      const w = layout?.widgets ?? {};
      return {
        scenes: w['axis.widget.scenes']?.order,
        plus: w['axis.widget.newPreset']?.order,
        save: w['axis.widget.save']?.order
      };
    }, WORKBENCH_DOC_KEY);
    expect(order.plus).toBe((order.scenes ?? 0) + 1);
    expect(order.save).toBe((order.plus ?? 0) + 1);

    await host.locator('button').click();
    const menu = page.locator('.aw-context-menu[role="menu"]');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'New from template…' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Clear grid' })).toBeVisible();

    await menu.getByRole('menuitem', { name: 'New from template…' }).click();
    const dialog = page.getByRole('dialog', { name: 'New preset from template' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Load into current preset' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });

  test('Escape closes the + menu without opening anything', async ({ page }) => {
    await bootCleanWorkbench(page);
    await page.locator('[data-widget="axis.widget.newPreset"] button').click();
    const menu = page.locator('.aw-context-menu[role="menu"]');
    await expect(menu).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'New preset from template' })).toHaveCount(0);
  });
});
