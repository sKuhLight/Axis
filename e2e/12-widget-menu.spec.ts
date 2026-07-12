import { test, expect, type Page } from '@playwright/test';
import { bootCleanWorkbench, enterEditMode, WORKBENCH_DOC_KEY } from './support/workbench';

/**
 * R16b — the tiny per-widget size/close/⋯ buttons and the group ungroup/⋯
 * cluster are gone. In customize mode a plain tap on a widget (or the group
 * grip) opens the widget/group menu anchored BELOW the unit. These specs cover
 * that click-to-open flow, a size change through the menu, dismissal, and the
 * group variant with its Save Group item.
 */
test.describe('Widget customize menu', () => {
  test('tapping a widget in edit mode opens the below-widget menu; a size item resizes it', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);

    // `axis.widget.preset` is a loose widget in the (uncrowded) top-left bar, so
    // it renders as its own host with the edit-mode drag/tap surface on top.
    const host = page.locator('[data-widget="axis.widget.preset"]');
    await expect(host).toHaveCount(1);
    await expect(host).toHaveAttribute('data-size', 'default');

    // A plain click never crosses the 5px drag threshold, so pointerup opens the
    // menu instead of performing a drop.
    await host.click();
    const menu = page.locator('.aw-context-menu[role="menu"]');
    await expect(menu).toBeVisible();

    // The menu is the widget's settings surface: sizes + move-to + save + remove.
    await expect(menu.getByRole('menuitem', { name: 'Compact Size' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Remove Widget' })).toBeVisible();

    // Picking a size dispatches widget.resize; the host's data-size reflects it.
    await menu.getByRole('menuitem', { name: 'Compact Size' }).click();
    await expect(menu).toHaveCount(0);
    await expect(host).toHaveAttribute('data-size', 'compact');
  });

  test('Escape closes the widget menu', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);

    await page.locator('[data-widget="axis.widget.preset"]').click();
    const menu = page.locator('.aw-context-menu[role="menu"]');
    await expect(menu).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });

  test('clicking the scrim closes the widget menu', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);

    await page.locator('[data-widget="axis.widget.preset"]').click();
    const menu = page.locator('.aw-context-menu[role="menu"]');
    await expect(menu).toBeVisible();

    await page.locator('.aw-menu-scrim').click();
    await expect(menu).toHaveCount(0);
  });

  test('tapping a group grip opens the group menu with Save Group', async ({ page }) => {
    await bootCleanWorkbench(page);
    await seedGroup(page, 'axis.group.spec', ['axis.widget.view', 'axis.widget.addBlock']);
    await enterEditMode(page);

    const group = page.locator('[data-widget-group="axis.group.spec"]');
    await expect(group).toHaveCount(1);

    // The grip is both drag handle and menu opener: a tap opens the group menu
    // below the module.
    await group.locator('.aw-group-grip').click();
    const menu = page.locator('.aw-context-menu[role="menu"]');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Save Group/ })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Ungroup Widgets' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Remove Group' })).toBeVisible();
  });
});

/**
 * Group two existing loose widgets by mutating the persisted document, then
 * reload so the workbench renders the group. The config route is still mocked
 * 404 (from bootCleanWorkbench), so on reload the app restores this localStorage
 * doc instead of re-seeding the default.
 */
async function seedGroup(page: Page, groupId: string, widgetIds: string[]): Promise<void> {
  await page.evaluate(
    ({ key, gid, ids }) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) throw new Error('no persisted workbench doc to seed a group into');
      const doc = JSON.parse(raw);
      const layout = Object.values(doc.layouts as Record<string, { widgets: Record<string, { groupId?: string | null }>; widgetGroups: Record<string, unknown> }>).find(
        (l) => ids.every((id) => l.widgets[id])
      );
      if (!layout) throw new Error('no layout contains the widgets to group');
      for (const id of ids) layout.widgets[id].groupId = gid;
      layout.widgetGroups[gid] = { id: gid, widgetIds: ids };
      window.localStorage.setItem(key, JSON.stringify(doc));
    },
    { key: WORKBENCH_DOC_KEY, gid: groupId, ids: widgetIds }
  );
  await page.reload();
  await page.waitForSelector('.aw-root');
}
