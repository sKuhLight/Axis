import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, clickNav } from './support/workbench';

/**
 * Preset Browser — loading returns to the Grid page.
 *
 * A load is the deliberate commit gesture, so it leaves the Preset Browser page and shows the Signal
 * Grid it just loaded (via `openBuild()`). The load itself needs a device; this spec
 * seeds a device-slot summary and pins only the NAVIGATION contract — the row's dblclick handler
 * activates the Grid page synchronously, before/independently of the device read.
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

test.describe('Preset Browser load navigation', () => {
  test('double-clicking a preset activates the Grid page', async ({ page }) => {
    await bootCleanWorkbench(page);
    await page.evaluate(
      (cache) => window.localStorage.setItem('axs.lib.cache', JSON.stringify(cache)),
      [summary(1, 'Studio Clean')]
    );
    await page.reload();
    await page.waitForSelector('.aw-root');

    await clickNav(page, 'library');
    const row = page.locator('.aw-tabstack[data-region="main"] .preset-row');
    await expect(row).toHaveCount(1);
    await expect(page.locator('[data-nav-entry="grid"]')).not.toHaveAttribute('data-nav-active', 'true');

    await row.dblclick();

    await expect(page.locator('[data-nav-entry="grid"]')).toHaveAttribute('data-nav-active', 'true');
  });
});
