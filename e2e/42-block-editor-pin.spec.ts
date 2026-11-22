import { test, expect, type Page } from '@playwright/test';
import { bootBlockEditorMock, openAmpEditor } from './support/blockEditorMock';
import { addCustomPanel, enterEditMode, exitEditMode } from './support/workbench';

// Block Editor rework: the board's own pin paths with real pointer input (spec 15 covers the workbench
// side with synthetic drops). A still ~380 ms hold on a control arms a pointer drag onto a workbench
// panel; a right-click opens the pin menu with its targets. Fully mocked backend, no device.

async function withCustomPanel(page: Page) {
  const mock = await bootBlockEditorMock(page);
  await openAmpEditor(page);
  await enterEditMode(page);
  await addCustomPanel(page);
  await exitEditMode(page);
  const panel = page.locator('.custom-panel').first();
  await expect(panel).toBeVisible();
  await expect(panel.locator('.axis-widget.param')).toHaveCount(0);
  return { mock, panel };
}

test.describe('Block Editor pin (real pointer)', () => {
  test('a held knob dragged onto a custom panel is collected there', async ({ page }) => {
    const { mock, panel } = await withCustomPanel(page);
    const dial = page.locator('[data-be-key="k1"] .be-dial').first();
    const d = (await dial.boundingBox())!;
    const p = (await panel.boundingBox())!;
    await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(550); // past the 380 ms hold, without moving
    await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2, { steps: 10 });
    await expect(page.locator('.be-pinchip')).toContainText('Bass');
    await page.mouse.up();
    await expect(page.locator('.be-pinchip')).toHaveCount(0);

    await expect(panel.locator('.axis-widget.param')).toHaveCount(1);
    await expect(panel.getByText('Bass', { exact: true })).toBeVisible();
    // the hold never became a value change
    await page.waitForTimeout(200);
    expect(mock.writes.filter((w) => w.pid === 1)).toEqual([]);
  });

  test('a right-click opens the pin menu with its targets; picking one pins the control', async ({ page }) => {
    await withCustomPanel(page);
    const openMenu = async () => {
      await page.locator('[data-be-key="k2"]').first().click({ button: 'right' });
      const menu = page.getByRole('menu');
      await expect(menu).toBeVisible();
      return menu;
    };
    let menu = await openMenu();
    const items = menu.getByRole('menuitem');
    // every custom panel of the layout (with its widget count), then "New custom panel"
    await expect(items.filter({ hasText: 'New custom panel' })).toHaveCount(1);
    const panels = items.filter({ hasText: /^\s*Custom Panel/ }); // case-sensitive: not "New custom panel"
    expect(await panels.count()).toBeGreaterThan(0);
    for (const t of await panels.allTextContents()) expect(t).toMatch(/Custom Panel\s*0/);
    await panels.first().click();
    await expect(menu).toHaveCount(0);
    // the picked panel now holds one control
    menu = await openMenu();
    await expect(menu.getByRole('menuitem').filter({ hasText: /Custom Panel\s*1/ })).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });
});
