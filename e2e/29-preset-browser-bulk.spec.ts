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
