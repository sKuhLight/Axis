import { test, expect, type Page } from '@playwright/test';
import { bootCleanWorkbench, clickNav } from './support/workbench';

/**
 * Preset Browser — advanced query bar.
 *
 * Regression coverage: the autocomplete context (`acContext` / `filtersContext`) is read ONLY from the
 * input's focus handler, so the first click used to synchronously build the filter-spec table over
 * every param of every preset before the dropdown could paint — seconds of dead UI on a hydrated
 * library. The fix warms those derivations in `requestIdleCallback` time instead. This spec pins the
 * behaviour that must survive it: the dropdown still opens on the FIRST click, and the renderer stays
 * responsive while it does.
 *
 * No wall-clock assertion — timing is flaky in CI, and the clean-boot fixture has no hydrated params
 * to be slow over. The felt latency is verified by hand; what's automated here is "still works".
 */
/**
 * Both modes render an `.query-input input`, so the placeholder is what actually distinguishes
 * them: the caret-aware advanced field advertises the query grammar, the simple one is a plain
 * search box.
 */
const ADVANCED_PLACEHOLDER = /AMP\(Type=5153/;
const SIMPLE_PLACEHOLDER = /^Search presets/;

/** Leave the Simple default and switch the bar into the typed query language. */
async function enterAdvanced(page: Page): Promise<void> {
  await page.locator('.adv-toggle').click();
  await expect(page.locator('.adv-toggle')).toHaveText('Advanced');
  await expect(page.locator('.query-input input')).toHaveAttribute(
    'placeholder',
    ADVANCED_PLACEHOLDER,
  );
}

test.describe('Preset Browser query bar', () => {
  test('the advanced autocomplete opens on the first click', async ({ page }) => {
    await bootCleanWorkbench(page);
    await clickNav(page, 'library');
    await expect(page.locator('.aw-tabstack[data-region="main"] .aw-pane-tab').filter({ hasText: 'Preset Browser' })).toHaveCount(1);

    // Simple is what a user who has never touched the toggle gets: the plain search box, no query
    // language. The toggle button is labelled with the mode you are IN, not the one it switches to.
    await expect(page.locator('.adv-toggle')).toHaveText('Simple');
    await expect(page.locator('.query-input input')).toHaveAttribute(
      'placeholder',
      SIMPLE_PLACEHOLDER,
    );

    await enterAdvanced(page);

    const input = page.locator('.query-input input');
    await expect(input).toHaveCount(1);
    await expect(page.locator('.ac')).toHaveCount(0); // closed until focused

    await input.click();

    // Liveness probe: on a renderer stuck in a synchronous build this never resolves and the test
    // times out here rather than on the assertion below (same technique as 11-pages.spec.ts).
    void (await page.evaluate(() => document.readyState));

    const dropdown = page.locator('.ac');
    await expect(dropdown).toHaveCount(1);
    await expect(dropdown.locator('.ac-ctx')).toHaveText('block / token');
    // The seed block families (amp/drive/cab/comp/reverb/delay) plus the snippet tokens are offered
    // even with an empty library, so this holds without any device fixture.
    await expect(dropdown.locator('.ac-item')).not.toHaveCount(0);
    await expect(dropdown.locator('.ac-item').filter({ hasText: 'AMP' }).first()).toBeVisible();
    await expect(dropdown.locator('.ac-item').filter({ hasText: 'tag:' }).first()).toBeVisible();
  });

  test('typing a block name narrows the suggestions and Escape closes them', async ({ page }) => {
    await bootCleanWorkbench(page);
    await clickNav(page, 'library');
    await enterAdvanced(page);

    const input = page.locator('.query-input input');
    await input.click();
    await input.fill('rev');

    const items = page.locator('.ac .ac-item');
    await expect(items.filter({ hasText: 'REVERB' }).first()).toBeVisible();
    await expect(items.filter({ hasText: 'AMP' })).toHaveCount(0);

    await input.press('Escape');
    await expect(page.locator('.ac')).toHaveCount(0);
  });

  // The mode is sticky from the first deliberate toggle onward (`axs.pb.searchMode`) — a user who
  // has learned the query language should not be thrown back to the simple box on every reload,
  // and one who switched back should stay switched back.
  test('the chosen mode survives a reload', async ({ page }) => {
    await bootCleanWorkbench(page);
    await clickNav(page, 'library');
    await enterAdvanced(page);

    await page.reload();
    await page.waitForSelector('.aw-root');
    await clickNav(page, 'library');
    await expect(page.locator('.adv-toggle')).toHaveText('Advanced');
    await expect(page.locator('.query-input input')).toHaveAttribute(
      'placeholder',
      ADVANCED_PLACEHOLDER,
    );

    // …and the way back is sticky too.
    await page.locator('.adv-toggle').click();
    await expect(page.locator('.adv-toggle')).toHaveText('Simple');

    await page.reload();
    await page.waitForSelector('.aw-root');
    await clickNav(page, 'library');
    await expect(page.locator('.adv-toggle')).toHaveText('Simple');
    await expect(page.locator('.query-input input')).toHaveAttribute(
      'placeholder',
      SIMPLE_PLACEHOLDER,
    );
  });
});
