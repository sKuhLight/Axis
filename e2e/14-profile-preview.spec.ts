import { test, expect, type Page } from '@playwright/test';
import { bootCleanWorkbench, editBar, enterEditMode, exitEditMode } from './support/workbench';

/**
 * ROUND 17 — edit-mode profile preview (AXIS-27). Pinning Tablet/Mobile in the
 * edit bar adapts the WHOLE editing surface to that profile's real device size
 * (a centered, letterboxed in-window frame, no window resize), mirroring the
 * design's constrained `frameStyle` canvas. Auto/Desktop = full size; leaving edit
 * mode restores full-size rendering of the active profile. The edit bar itself
 * stays full window width at the very top, outside the frame.
 */

/** The edit bar spans the window at the top, 36px tall, and the frame sits below it. */
async function expectBarAboveFrame(page: Page) {
  const viewport = page.viewportSize()!;
  const bar = (await editBar(page).boundingBox())!;
  expect(bar.x).toBe(0);
  expect(bar.y).toBe(0);
  expect(Math.abs(bar.width - viewport.width)).toBeLessThan(0.5);
  expect(Math.round(bar.height)).toBe(36);
  const frame = (await page.locator('.aw-root').boundingBox())!;
  expect(frame.y).toBeGreaterThanOrEqual(bar.y + bar.height - 0.5);
}

test.describe('Edit-mode profile preview', () => {
  test('pinning Mobile shrinks the editing surface to a device frame', async ({ page }) => {
    await bootCleanWorkbench(page);

    const fullBox = (await page.locator('.aw-root').boundingBox())!;
    expect(fullBox.width).toBeGreaterThan(1000); // full window at rest

    await enterEditMode(page);
    // Profile control lives in the edit bar (Auto · Desktop · Tablet · Mobile).
    await page.getByRole('button', { name: 'Mobile', exact: true }).click();

    // The preview backdrop appears and the root becomes a phone-sized frame.
    await expect(page.locator('.aw-viewport.aw-preview')).toHaveCount(1);
    await expect.poll(async () => (await page.locator('.aw-root').boundingBox())!.width).toBeLessThan(500);
    await expect(page.getByRole('button', { name: 'Mobile', exact: true })).toHaveAttribute('aria-pressed', 'true');
    // The bar stays full window width (desktop-sized, never the previewed profile).
    await expectBarAboveFrame(page);
    // The backdrop names the previewed profile and its frame size.
    await expect(page.locator('.aw-preview-label')).toHaveText(/^Mobile · \d+ × \d+$/);

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
    await expectBarAboveFrame(page);
    await expect(page.locator('.aw-preview-label')).toHaveText('Tablet · 1024 × 760');
    // No horizontal page overflow while previewing.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // On a short window the frame is capped to the stage below the bar; the
    // label then shows the size actually rendered.
    await page.setViewportSize({ width: 1440, height: 800 });
    await expect(page.locator('.aw-preview-label')).toHaveText(/^Tablet · 1024 × \d+ \(fitted\)$/);
    const frame = (await page.locator('.aw-root').boundingBox())!;
    const bar = (await editBar(page).boundingBox())!;
    expect(frame.y).toBeGreaterThanOrEqual(bar.y + bar.height - 0.5);
    expect(frame.y + frame.height).toBeLessThanOrEqual(800 + 0.5);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('.aw-preview-label')).toHaveText('Tablet · 1024 × 760');

    // Leaving edit mode restores full-size rendering (the pin persists but the
    // preview frame is edit-mode only).
    await exitEditMode(page);
    await expect(page.locator('.aw-viewport.aw-preview')).toHaveCount(0);
    await expect.poll(async () => (await page.locator('.aw-root').boundingBox())!.width).toBeGreaterThan(1000);
  });
});
