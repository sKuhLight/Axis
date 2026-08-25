import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, clickNav } from './support/workbench';

/**
 * Preset Browser — RECENT sort.
 *
 * The segment sorts by `presetRecency` (localStorage `axs.presets.lastLoaded`, entry id → epoch ms),
 * written whenever the app loads a preset. Loading a preset for real needs a device, so this spec seeds
 * the map directly and pins the ORDERING contract instead: most-recent first, never-loaded last.
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

const slots = (page: import('@playwright/test').Page) =>
  page.locator('.aw-tabstack[data-region="main"] .preset-row .preset-number');

test.describe('Preset Browser recency sort', () => {
  test('RECENT orders by last load and sinks never-loaded presets', async ({ page }) => {
    await bootCleanWorkbench(page);

    // Seed the device library cache + recency map, then reload: both are read once, at store construction.
    await page.evaluate(
      ({ cache, recency }) => {
        window.localStorage.setItem('axs.lib.cache', JSON.stringify(cache));
        window.localStorage.setItem('axs.presets.lastLoaded', JSON.stringify(recency));
      },
      {
        cache: [summary(1, 'Studio Clean'), summary(2, 'Never Loaded'), summary(3, 'Crunch')],
        // dev:3 most recent, dev:1 older, dev:2 absent → never loaded.
        recency: { 'dev:1': 1_700_000_000_000, 'dev:3': 1_800_000_000_000 }
      }
    );
    await page.reload();
    await page.waitForSelector('.aw-root');
    await clickNav(page, 'library');

    // Default sort is by slot number.
    await expect(slots(page)).toHaveText(['001', '002', '003']);

    await page.locator('.sort-seg button', { hasText: 'RECENT' }).click();

    await expect(slots(page)).toHaveText(['003', '001', '002']);

    // And back — RECENT must not mutate the underlying list.
    await page.locator('.sort-seg button', { hasText: '#' }).click();
    await expect(slots(page)).toHaveText(['001', '002', '003']);
  });
});
