import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, clickNav, collapseRail } from './support/workbench';

/**
 * Preset Browser — tag creation (row context menu → Tags…).
 *
 * `library.addTag`/`removeTag` had zero UI callers before this: the only way a tag ever appeared
 * was via the cloud `config/tags` doc or seeded localStorage. This spec pins the new path: right-click
 * a row, open the Tags… picker, create a tag, and see it land as both a row pill and a Frequent Tags
 * chip — then untoggle it and see both disappear.
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

const row = (page: import('@playwright/test').Page) =>
  page.locator('.aw-tabstack[data-region="main"] .preset-row').first();

test.describe('Preset Browser tag creation', () => {
  test('create a tag from the row menu, see it as a pill + Frequent Tags chip, then remove it', async ({ page }) => {
    await bootCleanWorkbench(page);
    await page.evaluate((cache) => window.localStorage.setItem('axs.lib.cache', JSON.stringify(cache)), [
      summary(1, 'Studio Clean')
    ]);
    await page.reload();
    await page.waitForSelector('.aw-root');
    await clickNav(page, 'library');

    await expect(row(page)).toHaveCount(1);
    await row(page).click({ button: 'right' });

    const tagsItem = page.locator('.aw-menu-item', { hasText: 'Tags…' });
    await expect(tagsItem).toHaveCount(1);
    await tagsItem.click();

    const picker = page.locator('.pk-pop');
    await expect(picker).toHaveCount(1);
    await expect(picker.locator('.pk-lbl')).toHaveText('Tags for Studio Clean');

    // Esc closes it even before anything inside is clicked — the menu's focus trap hands focus back
    // to the row on its way out, so the popover cannot rely on owning focus.
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await row(page).click({ button: 'right' });
    await page.locator('.aw-menu-item', { hasText: 'Tags…' }).click();
    await expect(picker).toHaveCount(1);

    await picker.locator('.pk-search input').fill('Lush');
    await picker.locator('.pk-item', { hasText: 'Create "Lush"' }).click();

    // Popover stays open so several tags can be toggled in one pass.
    await expect(picker).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);

    await expect(row(page).locator('.tag-pill')).toHaveText(['Lush']);
    await expect(page.locator('.quick-tag', { hasText: 'Lush' })).toHaveCount(1);

    // Reopen and untoggle — the pill disappears.
    await row(page).click({ button: 'right' });
    await page.locator('.aw-menu-item', { hasText: 'Tags…' }).click();
    const reopened = page.locator('.pk-pop');
    await reopened.locator('.pk-item', { hasText: 'Lush' }).click();
    await page.keyboard.press('Escape');

    await expect(row(page).locator('.tag-pill')).toHaveCount(0);
  });
  /**
   * Frequent Tags is ordered alphabetically, NOT by usage count. Counts still choose which tags win
   * the row's slots, but they never choose position — otherwise using a tag re-sorts the row under
   * the cursor and the next click lands on a neighbour. The seeded counts here are picked so that
   * the click WOULD have reordered the row under a count-descending render: Motown goes 2 → 3,
   * tying Zeta at 3 and taking the lead on the alphabetical tie-break.
   */
  test('Frequent Tags renders alphabetically and does not reorder when a chip is clicked', async ({ page }) => {
    await bootCleanWorkbench(page);
    await page.evaluate(
      ({ cache, tags, counts }) => {
        window.localStorage.setItem('axs.lib.cache', JSON.stringify(cache));
        window.localStorage.setItem('axs.lib.tags', JSON.stringify(tags));
        window.localStorage.setItem('axs.pb.frequentTags', JSON.stringify(counts));
      },
      {
        cache: [summary(1, 'Studio Clean'), summary(2, 'Stage Lead')],
        tags: { 'dev:1': ['Zeta', 'Ambient'], 'dev:2': ['Motown'] },
        counts: { Zeta: 3, Ambient: 2, Motown: 2 }
      }
    );
    await page.reload();
    await page.waitForSelector('.aw-root');
    await clickNav(page, 'library');

    // Alphabetical on load — count order would have been Zeta, Ambient, Motown.
    const chips = page.locator('.quick-tag');
    await expect(chips).toHaveText(['Ambient', 'Motown', 'Zeta']);

    // Click the middle chip; its count rises past the tie, and the row must not budge.
    // The nav click above leaves the rail expanded over the sidebar — collapse it first.
    await collapseRail(page);
    await chips.nth(1).click();
    await expect(chips.nth(1)).toHaveClass(/\bon\b/); // the click registered as a tag filter
    await expect(chips).toHaveText(['Ambient', 'Motown', 'Zeta']);
  });
});
