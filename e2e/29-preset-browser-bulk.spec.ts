import { test, expect, type Page } from '@playwright/test';
import { bootCleanWorkbench, clickNav } from './support/workbench';

/**
 * Preset Browser — bulk actions in the selection header.
 *
 * Marking multiple rows surfaces a header with Tag… / Favorite / Move… alongside Clear. Tag and
 * Favorite apply to every marked real entry; Move seeds the existing move dialog with the marked
 * device slots — the same seed the `M` shortcut uses, just reachable from a button.
 */

const summary = (number: number, name: string) => ({
  number,
  name,
  model: 'FM3',
  crcValid: true,
  scenes: ['Scene 1'],
  blocks: [{ effectId: 106, slug: 'amp', name: 'Amp 1', instance: 1 }],
  models: { amp: ['USA Clean'] },
  amps: ['USA Clean']
});

async function bootPresetBrowser(page: Page): Promise<void> {
  await bootCleanWorkbench(page);
  await page.evaluate(
    (cache) => window.localStorage.setItem('axs.lib.cache', JSON.stringify(cache)),
    [summary(1, 'Studio Clean'), summary(2, 'Lead'), summary(3, 'Clean')]
  );
  await page.reload();
  await page.waitForSelector('.aw-root');
  await clickNav(page, 'library');
}

const selectHead = (page: Page) => page.locator('.select-head');
const headButton = (page: Page, label: string) => page.locator('.select-head button').filter({ hasText: label });

test('bulk Tag… applies a tag to every marked preset', async ({ page }) => {
  await bootPresetBrowser(page);
  const rows = page.locator('.preset-row');
  await expect(rows).toHaveCount(3);

  await rows.nth(0).click({ modifiers: ['Meta'] });
  await rows.nth(1).click({ modifiers: ['Meta'] });
  await expect(selectHead(page)).toContainText('2 selected');

  await headButton(page, 'Tag').click();
  const picker = page.locator('.pk-pop');
  await expect(picker).toBeVisible();
  await expect(picker.locator('.pk-lbl').first()).toHaveText('Tag 2 presets');

  // Type an unknown tag → the Create row is focused; Enter accepts it for the whole selection.
  // (Regression guard: the keydown handler is on both the input and the popover, so without
  // stopPropagation Enter would toggle the tag on and straight back off.)
  await picker.locator('.pk-search input').fill('BulkDemo');
  await picker.locator('.pk-search input').press('Enter');

  await expect(page.locator('.tag-pill[data-tag="BulkDemo"]')).toHaveCount(2);
});

test('bulk Favorite sets every marked preset and flips the label', async ({ page }) => {
  await bootPresetBrowser(page);
  const rows = page.locator('.preset-row');
  await expect(rows).toHaveCount(3);

  await rows.nth(0).click({ modifiers: ['Meta'] });
  await rows.nth(1).click({ modifiers: ['Meta'] });

  await headButton(page, 'Favorite').click();
  await expect(page.locator('.preset-row.fav')).toHaveCount(2);
  await expect(headButton(page, 'Unfavorite')).toBeVisible();

  // Unfavorite removes the flag from both.
  await headButton(page, 'Unfavorite').click();
  await expect(page.locator('.preset-row.fav')).toHaveCount(0);
});

test('bulk Move… seeds the move dialog with the marked device slots', async ({ page }) => {
  await bootPresetBrowser(page);
  const rows = page.locator('.preset-row');
  await expect(rows).toHaveCount(3);

  await rows.nth(0).click({ modifiers: ['Meta'] });
  await rows.nth(1).click({ modifiers: ['Meta'] });

  await headButton(page, 'Move').click();
  const dialog = page.getByRole('dialog').filter({ hasText: 'Move presets' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.mv-count')).toHaveText('2 selected');
});

test('bulk Clear preset erases every marked device slot after ONE confirmation', async ({ page }) => {
  // A non-AM4 device's deep-dump capability is what enables Clear; detect alone decides that on this
  // offline boot. The blank-write endpoints are mocked so the round-trip never touches hardware.
  await page.route('**/api/device/detect', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ connected: true, modelId: 17, name: 'FM3', short: 'FM3', gen: 3, supported: true, port: 'mock' })
    })
  );
  const ok = (route: import('@playwright/test').Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  await page.route('**/api/preset/blank/syx', (route) =>
    route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from([1, 2, 3, 4]) })
  );
  await page.route('**/api/preset/load', ok);
  await page.route('**/api/preset/store', ok);
  await page.route('**/api/preset/select', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, number: 0 }) })
  );

  let dialogs = 0;
  page.on('dialog', (dialog) => { dialogs++; void dialog.accept(); });

  await bootPresetBrowser(page);
  const rows = page.locator('.preset-row');
  await expect(rows).toHaveCount(3);

  await rows.nth(0).click({ modifiers: ['Meta'] });
  await rows.nth(1).click({ modifiers: ['Meta'] });

  const clear = headButton(page, 'Clear preset');
  await expect(clear).toBeEnabled();
  await clear.click();

  // One confirmation for the whole selection, then both slots drop out of the library copy.
  await expect.poll(() => dialogs).toBe(1);
  await expect(page.locator('.preset-row')).toHaveCount(1);
  await expect(page.locator('.preset-row', { hasText: 'Studio Clean' })).toHaveCount(0);
  await expect(page.locator('.preset-row', { hasText: 'Lead' })).toHaveCount(0);
});
