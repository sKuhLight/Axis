import { test, expect, type Page } from '@playwright/test';
import { bootCleanWorkbench, clickNav } from './support/workbench';

/**
 * Preset Browser — the `M` move dialog.
 *
 * `M` is page-scoped (opens only while the Preset Browser page is active, inert elsewhere) and always
 * opens with nothing chosen. Each DRAG stages an independent move (grab any cell, straight onto a
 * destination — no click-to-select first); staged moves show as removable chips and are applied
 * together on confirm. Clicking cells builds the working set the next drag moves, and never disturbs a
 * staged move. Only explicitly MARKED list rows seed the working set.
 */

/** A summary shaped for `library.svelte.ts`'s `summarySchema` — anything else is dropped on restore. */
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

const moveDialog = (page: Page) => page.getByRole('dialog').filter({ hasText: 'Move presets' });

test('M drags a preset straight onto a destination without selecting it first', async ({ page }) => {
  await bootPresetBrowser(page);

  const dialog = moveDialog(page);
  await page.keyboard.press('m');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.mv-count')).toHaveText('Nothing staged');

  const cells = dialog.locator('.mv-cell');
  await expect(cells.first()).toBeVisible();

  // ONE gesture: grab slot 1's cell (never clicked/selected) and drop it on slot 8. The grab itself
  // makes it the source, the drop sets the destination, and the drop STAGES the move.
  await cells.nth(1).dragTo(cells.nth(8));
  await expect(dialog.locator('.mv-count')).toHaveText('1 staged');
  await expect(dialog.locator('.mv-bar .chip.moved')).toBeVisible();
  await expect(dialog.locator('.mv-btn.accent')).toBeEnabled();
  await expect(dialog.locator('.mv-chip-move')).toHaveCount(1);

  // The grid previews the OUTCOME: the destination cell shows the incoming preset name, and the
  // vacated source slot shows whatever swaps back into it (empty here, so it reads "Empty").
  await expect(cells.nth(8)).toHaveText('Studio Clean');
  await expect(cells.nth(1)).toHaveText('Empty');
});

test('staged moves accumulate and clicking a cell never disturbs them', async ({ page }) => {
  const requests: { writes: { from: number; to: number }[] }[] = [];
  await page.route('**/preset/move', (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, writes: [], slots: 0 }) });
  });
  await bootPresetBrowser(page);

  const dialog = moveDialog(page);
  await page.keyboard.press('m');
  const cells = dialog.locator('.mv-cell');
  await expect(cells.first()).toBeVisible();

  // Stage move 1: drag 3 (slot 3) onto slot 1.
  await cells.nth(3).dragTo(cells.nth(1));
  await expect(dialog.locator('.mv-count')).toHaveText('1 staged');

  // Now click slot 13 to start the NEXT move — the 3→1 stage must survive untouched.
  await cells.nth(13).click();
  await expect(dialog.locator('.mv-count')).toHaveText('1 staged · 1 selected');
  await expect(dialog.locator('.mv-chip-move')).toHaveCount(1);

  // Stage move 2 by dragging the selected cell onto slot 11.
  await cells.nth(13).dragTo(cells.nth(11));
  await expect(dialog.locator('.mv-count')).toHaveText('2 staged');
  await expect(dialog.locator('.mv-chip-move')).toHaveCount(2);

  // ONE confirm applies BOTH staged moves as a single permutation: 3→1 and 13→11, each with its swap-back.
  await dialog.locator('.mv-btn.accent').click();
  await expect(dialog).toBeHidden({ timeout: 8000 });
  expect(requests).toHaveLength(1);
  expect(requests[0]!.writes).toEqual([
    { from: 3, to: 1 },
    { from: 1, to: 3 },
    { from: 13, to: 11 },
    { from: 11, to: 13 }
  ]);
});

test('cells build a contiguous set, and a broken set is called out', async ({ page }) => {
  await bootPresetBrowser(page);

  const dialog = moveDialog(page);
  await page.keyboard.press('m');
  const cells = dialog.locator('.mv-cell');
  await expect(cells.first()).toBeVisible();

  // Click + Shift-click build a run.
  await cells.nth(1).click();
  await expect(dialog.locator('.mv-count')).toHaveText('1 selected');
  await cells.nth(4).click({ modifiers: ['Shift'] });
  await expect(dialog.locator('.mv-count')).toHaveText('4 selected');

  // Add a distant cell → no longer contiguous; the run is called out and confirm stays disabled.
  await cells.nth(20).click();
  await expect(dialog.locator('.mv-hint')).toHaveText('Pick a contiguous run of presets');
  await expect(dialog.locator('.mv-btn.accent')).toBeDisabled();

  // Clear resets everything.
  await dialog.locator('.mv-clear').click();
  await expect(dialog.locator('.mv-count')).toHaveText('Nothing staged');
});

test('M is seeded by the marked rows and is inert off the Preset Browser page', async ({ page }) => {
  await bootPresetBrowser(page);
  const rows = page.locator('.preset-row');
  await expect(rows).toHaveCount(3);

  await rows.first().click({ modifiers: ['Meta'] });
  await rows.nth(1).click({ modifiers: ['Meta'] });
  await expect(page.locator('.select-head')).toBeVisible();

  const dialog = moveDialog(page);
  await page.keyboard.press('m');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.mv-count')).toHaveText('2 selected');

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await clickNav(page, 'grid');
  await page.keyboard.press('m');
  await expect(dialog).toBeHidden();
});

test('M opens empty when a row is merely selected, and can be run again after a move', async ({ page }) => {
  await page.route('**/preset/move', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, writes: [], slots: 0 }) })
  );
  await bootPresetBrowser(page);
  const rows = page.locator('.preset-row');
  await expect(rows).toHaveCount(3);

  // A plain click only SELECTS the row (no mark, no "N selected" bar) — it must NOT pre-seed the
  // dialog, or the leftover selection would silently block the next move as a non-contiguous run.
  await rows.nth(2).click();
  await expect(page.locator('.select-head')).toHaveCount(0);

  const dialog = moveDialog(page);
  await page.keyboard.press('m');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.mv-count')).toHaveText('Nothing staged');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Two moves back to back, each picking its own source inside the dialog.
  const cells = dialog.locator('.mv-cell');
  for (const target of [10, 20]) {
    await page.keyboard.press('m');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.mv-count')).toHaveText('Nothing staged');
    await cells.nth(1).click();
    await cells.nth(target).click({ modifiers: ['Alt'] });
    await expect(dialog.locator('.mv-btn.accent')).toBeEnabled();
    await dialog.locator('.mv-btn.accent').click();
    await expect(dialog).toBeHidden({ timeout: 8000 });
  }
});
