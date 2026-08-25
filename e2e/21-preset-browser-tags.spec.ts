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
    // …and the Frequent Tags chip goes with it. The chip is driven by usage counts, which outlive
    // the tag itself, so this is the guard against it lingering as an un-clickable ghost.
    await expect(page.locator('.quick-tag', { hasText: 'Lush' })).toHaveCount(0);
  });

  /**
   * A color of its own: a tag renders through ONE resolver (`library.colorOf`) everywhere it
   * appears, instead of every render site inventing its own hash — this is the regression guard
   * for the reported bug (Frequent Tags amber vs. row pill accent-peach for the same tag). Creating
   * a tag pins that the row pill and the Frequent Tags chip agree from the moment it's claimed;
   * right-clicking either and picking a different swatch pins that both move together, and that
   * the tag menu wins over the preset-actions menu on a pill (stopPropagation).
   */
  test('a tag renders the same color everywhere, and a swatch pick recolors it everywhere', async ({ page }) => {
    await bootCleanWorkbench(page);
    await page.evaluate((cache) => window.localStorage.setItem('axs.lib.cache', JSON.stringify(cache)), [
      summary(1, 'Studio Clean')
    ]);
    await page.reload();
    await page.waitForSelector('.aw-root');
    await clickNav(page, 'library');

    await row(page).click({ button: 'right' });
    await page.locator('.aw-menu-item', { hasText: 'Tags…' }).click();
    const picker = page.locator('.pk-pop');
    await picker.locator('.pk-search input').fill('Crunch');
    await picker.locator('.pk-item', { hasText: 'Create "Crunch"' }).click();
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);

    const pill = row(page).locator('.tag-pill', { hasText: 'Crunch' });
    const chip = page.locator('.quick-tag', { hasText: 'Crunch' });
    await expect(pill).toHaveCount(1);
    await expect(chip).toHaveCount(1);

    const colorOf = (el: import('@playwright/test').Locator) => el.evaluate((n) => getComputedStyle(n).color);
    const before = await colorOf(pill);
    expect(before).toBe(await colorOf(chip));

    // Right-click the pill: the tag swatch grid wins over the preset-actions menu (stopPropagation).
    await pill.click({ button: 'right' });
    const swatchPop = page.locator('.tag-swatch-pop');
    await expect(swatchPop).toHaveCount(1);
    await expect(page.locator('[aria-label="Preset actions"]')).toHaveCount(0);

    // Pick a swatch that isn't the current one — assert it's actually a change below.
    await swatchPop.locator('.swatch').nth(5).click();
    await expect(swatchPop).toHaveCount(0);

    const after = await colorOf(pill);
    expect(after).toBe(await colorOf(chip));
    expect(after).not.toBe(before);
  });

  /**
   * Rename a tag from the same popover that colors it. A tag is a bare string repeated across every
   * preset, so one rename has to reach the row pill AND the Frequent Tags chip at once. The popover's
   * name field is prepopulated and commits on Enter — no separate edit mode to enter first.
   *
   * The color travelling with the rename is covered by unit tests (renameTagColorKey, and colorOf in
   * library.runes.test.ts) rather than asserted here: an unclaimed tag gets a swatch assigned during
   * boot, so a DOM color comparison across the rename tests claim timing, not the rename.
   */
  test('renaming a tag rewrites it on every render site', async ({ page }) => {
    await bootCleanWorkbench(page);
    await page.evaluate(
      ({ cache, tags }) => {
        window.localStorage.setItem('axs.lib.cache', JSON.stringify(cache));
        window.localStorage.setItem('axs.lib.tags', JSON.stringify(tags));
      },
      { cache: [summary(1, 'Studio Clean')], tags: { 'dev:1': ['Cruch'] } }
    );
    await page.reload();
    await page.waitForSelector('.aw-root');
    await clickNav(page, 'library');

    await collapseRail(page);
    await page.locator('.quick-tag', { hasText: 'Cruch' }).click({ button: 'right' });
    const pop = page.locator('.tag-swatch-pop');
    await expect(pop).toHaveCount(1);

    // Exactly one swatch carries the tick: whichever colour the tag currently resolves to. Asserted
    // as a count rather than an index, so it does not depend on which swatch got claimed at boot.
    await expect(pop.locator('.swatch.on')).toHaveCount(1);

    // Prepopulated and ready to edit — no "Rename…" step in between.
    const input = pop.locator('.rename-in');
    await expect(input).toHaveValue('Cruch');
    await input.fill('Crunch');
    await input.press('Enter');
    await expect(pop).toHaveCount(0);

    await expect(row(page).locator('.tag-pill')).toHaveText(['Crunch']);
    await expect(page.locator('.quick-tag')).toHaveText(['Crunch']);
  });

  /** Renaming onto a name that already exists is a merge, not a duplicate. */
  test('renaming a tag onto an existing one merges them', async ({ page }) => {
    await bootCleanWorkbench(page);
    await page.evaluate(
      ({ cache, tags }) => {
        window.localStorage.setItem('axs.lib.cache', JSON.stringify(cache));
        window.localStorage.setItem('axs.lib.tags', JSON.stringify(tags));
      },
      {
        cache: [summary(1, 'Studio Clean'), summary(2, 'Stage Lead')],
        tags: { 'dev:1': ['Cruch', 'Crunch'], 'dev:2': ['Cruch'] }
      }
    );
    await page.reload();
    await page.waitForSelector('.aw-root');
    await clickNav(page, 'library');
    await collapseRail(page);

    await page.locator('.quick-tag', { hasText: 'Cruch' }).first().click({ button: 'right' });
    const pop = page.locator('.tag-swatch-pop');
    await pop.locator('.rename-in').fill('Crunch');
    await pop.locator('.rename-in').press('Enter');
    await expect(pop).toHaveCount(0);

    // One chip, and the preset that carried both tags now shows a single pill.
    await expect(page.locator('.quick-tag')).toHaveText(['Crunch']);
    await expect(row(page).locator('.tag-pill')).toHaveText(['Crunch']);
  });

  /**
   * Frequent Tags is ordered alphabetically, NOT by usage count. Counts still choose which tags win
   * the row's slots, but they never choose position — otherwise clicking a chip re-sorts the row
   * under the cursor and the next click lands on a neighbour. The seeded counts here are picked so
   * that the click WOULD have reordered the row under the old count-descending render: Motown goes
   * 2 → 3, tying Zeta at 3 and taking the lead on the alphabetical tie-break.
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
