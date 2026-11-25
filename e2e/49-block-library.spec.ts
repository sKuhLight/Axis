import { expect, test } from '@playwright/test';
import { AMP_EID, bootBlockEditorMock, openAmpEditor } from './support/blockEditorMock';

test('save from the channel stack and load from the type picker after a reload', async ({ page }) => {
  const mock = await bootBlockEditorMock(page, { channel: 'A', blockLibrary: true });
  await openAmpEditor(page);
  const channel = await page.locator('[data-be-channel-toggle]').boundingBox();
  const libraryTrigger = page.locator('[data-be-block-library]');
  await expect(libraryTrigger).toBeVisible();
  expect((await libraryTrigger.boundingBox())!.x).toBeGreaterThan(channel!.x);
  await libraryTrigger.click();
  await page.getByRole('menuitem', { name: 'Save to Library' }).click();
  const library = page.getByRole('dialog', { name: 'Block library' });
  await expect(library).toContainText('channel A');
  await library.getByLabel('Name').fill('My Plexi');
  await library.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(library.getByRole('button', { name: /My Plexi/ })).toBeVisible();
  expect(mock.writes).toHaveLength(0);
  await library.getByRole('textbox', { name: 'Search saved blocks' }).press('Escape');
  await expect(library).toHaveCount(0);

  const drive = page.locator('[data-be-key="k0"] .be-dial').first();
  await drive.focus();
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => mock.writes.length).toBe(1);
  await page.reload();
  await expect(page.locator('[data-idx="0,0"].cell.block')).toBeVisible();
  await openAmpEditor(page);

  await page.locator('[data-be-type]').click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await library.getByRole('button', { name: /My Plexi/ }).click();
  expect(mock.writes).toHaveLength(1);
  await library.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(library).toHaveCount(0);
  expect(mock.writes).toHaveLength(2);
  expect(mock.writes[1]).toMatchObject({ pid: 0, value: 0.7, continuous: true });

  await page.locator('[data-be-type]').click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await library.getByRole('button', { name: /My Plexi/ }).click();
  // A front-panel channel change immediately before Load invalidates the target.
  await page.route('**/api/preset/scene-state', (route) => route.fulfill({
    json: [{ effectId: AMP_EID, channel: 'B', bypassed: false }]
  }));
  await library.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(library.getByRole('alert')).toContainText('channel changed');
  expect(mock.writes).toHaveLength(2);
});

test('the library trigger fits beside the channel on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await bootBlockEditorMock(page, { channel: 'A', blockLibrary: true });
  await page.locator('[data-idx="0,0"].cell.block').click({ position: { x: 10, y: 30 } });
  await expect(page.locator('[data-be-board]')).toBeVisible();
  const trigger = page.locator('[data-be-block-library]');
  await expect(trigger).toBeVisible();
  const bounds = (await trigger.boundingBox())!;
  const tools = (await page.locator('.be-actions').boundingBox())!;
  expect(bounds.width).toBeGreaterThanOrEqual(40);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(tools.x);
  expect(Math.abs(bounds.y - tools.y)).toBeLessThanOrEqual(2);
  await trigger.click();
  await expect(page.getByRole('menuitem', { name: 'Load from Library' })).toBeVisible();
});
