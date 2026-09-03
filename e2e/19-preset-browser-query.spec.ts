import { test, expect, type Page } from '@playwright/test';
import { bootCleanWorkbench, clickNav } from './support/workbench';

/**
 * Preset Browser — unified query bar.
 *
 * One field: fuzzy free text everywhere, except text inside `` `...` `` spans parses as the typed
 * query grammar with caret-aware autocomplete (see parseUnifiedQuery / suggestInQuery). There is no
 * Simple/Advanced mode — the toggle was removed because it was redundant with "+ Add filter", which
 * builds identical structured conditions in either mode; backticks are the field's only signal that
 * a span should parse as a filter.
 *
 * Regression coverage: the autocomplete context (`acContext` / `filtersContext`) is read ONLY from the
 * input's focus handler, so the first click used to synchronously build the filter-spec table over
 * every param of every preset before the dropdown could paint — seconds of dead UI on a hydrated
 * library. The fix warms those derivations in `requestIdleCallback` time instead. This spec pins the
 * behaviour that must survive it: the dropdown still opens on the FIRST click inside backticks, and
 * the renderer stays responsive while it does.
 *
 * No wall-clock assertion — timing is flaky in CI, and the clean-boot fixture has no hydrated params
 * to be slow over. The felt latency is verified by hand; what's automated here is "still works".
 */
async function openBacktickSpan(page: Page): Promise<void> {
  const input = page.locator('.query-input input');
  await input.click();
  await input.pressSequentially('`');
}

test.describe('Preset Browser query bar', () => {
  test('typing outside backticks is plain search — no autocomplete', async ({ page }) => {
    await bootCleanWorkbench(page);
    await clickNav(page, 'library');
    await expect(page.locator('.aw-tabstack[data-region="main"] .aw-pane-tab').filter({ hasText: 'Preset Browser' })).toHaveCount(1);

    await expect(page.locator('.query-input input')).toHaveAttribute('placeholder', /Search presets/);

    const input = page.locator('.query-input input');
    await input.click();
    await input.pressSequentially('lead tone');
    await expect(page.locator('.ac')).toHaveCount(0);
  });

  test('a backtick opens the autocomplete on the first click', async ({ page }) => {
    await bootCleanWorkbench(page);
    await clickNav(page, 'library');

    await openBacktickSpan(page);

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

  test('typing a block name inside backticks narrows the suggestions and Escape closes them', async ({ page }) => {
    await bootCleanWorkbench(page);
    await clickNav(page, 'library');

    await openBacktickSpan(page);
    const input = page.locator('.query-input input');
    await input.pressSequentially('rev');

    const items = page.locator('.ac .ac-item');
    await expect(items.filter({ hasText: 'REVERB' }).first()).toBeVisible();
    await expect(items.filter({ hasText: 'AMP' })).toHaveCount(0);

    await input.press('Escape');
    await expect(page.locator('.ac')).toHaveCount(0);
  });

  test('moving the caret back outside the backtick span closes the autocomplete', async ({ page }) => {
    await bootCleanWorkbench(page);
    await clickNav(page, 'library');

    const input = page.locator('.query-input input');
    await input.click();
    // `AMP` free text, then an open span with the caret parked inside it.
    await input.pressSequentially('AMP `');
    await expect(page.locator('.ac')).toHaveCount(1);

    await input.press('Home'); // caret now sits in the free-text prefix, outside the backtick span
    await input.press('ArrowRight'); // trigger a caret-position recompute
    await expect(page.locator('.ac')).toHaveCount(0);
  });
});
