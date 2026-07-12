import { test, expect } from '@playwright/test';
import { bootCleanWorkbench, enterEditMode, exitEditMode } from './support/workbench';

/**
 * ROUND 17 — edit-mode profile preview (AXIS-27). Pinning Tablet/Mobile in the
 * edit ribbon adapts the WHOLE editing surface to that profile's real device
 * size (a centered, letterboxed in-window frame, no window resize), mirroring the
 * design's constrained `frameStyle` canvas. Auto/Desktop = full size; leaving edit
 * mode restores full-size rendering of the active profile.
 */
test.describe('Edit-mode profile preview', () => {
  test('pinning Mobile shrinks the editing surface to a device frame', async ({ page }) => {
    await bootCleanWorkbench(page);

    const fullBox = (await page.locator('.aw-root').boundingBox())!;
    expect(fullBox.width).toBeGreaterThan(1000); // full window at rest

    await enterEditMode(page);
    // Profile switcher lives in the edit ribbon (Auto · Desktop · Tablet · Mobile).
    await page.getByRole('button', { name: 'Mobile', exact: true }).click();

    // The preview backdrop appears and the root becomes a phone-sized frame.
    await expect(page.locator('.aw-viewport.aw-preview')).toHaveCount(1);
    await expect.poll(async () => (await page.locator('.aw-root').boundingBox())!.width).toBeLessThan(500);

    // Auto clears the pin → full-size editing surface again.
    await page.getByRole('button', { name: 'Auto', exact: true }).click();
    await expect(page.locator('.aw-viewport.aw-preview')).toHaveCount(0);
    await expect.poll(async () => (await page.locator('.aw-root').boundingBox())!.width).toBeGreaterThan(1000);
  });

  test('Tablet preview is a mid-size canvas and Done restores full size', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await page.getByRole('button', { name: 'Tablet', exact: true }).click();

    await expect(page.locator('.aw-viewport.aw-preview')).toHaveCount(1);
    await expect
      .poll(async () => (await page.locator('.aw-root').boundingBox())!.width)
      .toBeLessThan(1100); // ~1024 tablet frame

    // Leaving edit mode restores full-size rendering (the pin persists but the
    // preview frame is edit-mode only).
    await exitEditMode(page);
    await expect(page.locator('.aw-viewport.aw-preview')).toHaveCount(0);
    await expect.poll(async () => (await page.locator('.aw-root').boundingBox())!.width).toBeGreaterThan(1000);
  });
});
