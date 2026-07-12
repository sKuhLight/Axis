import { test, expect } from '@playwright/test';
import { bootCleanWorkbench } from './support/workbench';

test.describe('Gridbar widgets', () => {
  // On the canonical default layout Signal Grid is the sole (and active) main tab,
  // so its pane toolbar — the gridbar (GRID Full/Map/Auto + SIZE stepper) — mounts
  // straight away with no extra tab activation.
  test('grid-mode chips are visible and clicking Map switches the active mode', async ({ page }) => {
    await bootCleanWorkbench(page);

    const bar = page.locator('.axis-gridbar');
    await expect(bar).toHaveCount(1);

    // GRID Full / Map / Auto chips.
    const pills = bar.locator('.pill-chip');
    await expect(pills).toHaveText(['Full', 'Map', 'Auto']);

    // Default active mode is Auto.
    await expect(bar.locator('.pill-chip.on')).toHaveText('Auto');

    // Clicking Map moves the active presentation to Map (class change is enough;
    // the grid body itself is offline in this environment so we assert the chip
    // state, which is the durable, device-free signal of the presentation switch).
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(bar.locator('.pill-chip.on')).toHaveText('Map');
  });

  test('block-size stepper cycles the size', async ({ page }) => {
    await bootCleanWorkbench(page);

    const size = page.locator('.axis-gridbar .block-size');
    await expect(size).toHaveCount(1);

    // SIZE − M + — default is M.
    await expect(size.locator('.strong')).toHaveText('M');

    // The "+" step (last .step button) bumps M → L.
    await size.locator('.step').last().click();
    await expect(size.locator('.strong')).toHaveText('L');

    // The "−" step (first .step button) drops it back down.
    await size.locator('.step').first().click();
    await expect(size.locator('.strong')).toHaveText('M');
  });
});
