import { test, expect, type Page } from '@playwright/test';
import { bootBlockEditorMock, openAmpEditor } from './support/blockEditorMock';

async function activeVisible(page: Page) {
  await expect.poll(() => page.locator('[data-be-pagenav="tabs"]').evaluate((nav) => {
    const active = nav.querySelector('[data-active="true"]');
    if (!active) return false;
    const n = nav.getBoundingClientRect(), a = active.getBoundingClientRect();
    return a.left >= n.left && a.right <= n.right;
  })).toBe(true);
}

test('joined desktop header matches type picker height and centers its navigation', async ({ page }) => {
  await bootBlockEditorMock(page, { channel: 'A' });
  await openAmpEditor(page);
  const heights = await page.locator('[data-be-head]').evaluate((head) => {
    const selectors = ['[data-be-chip]', '[data-be-pagenav]', '.be-actions', '[data-be-engaged]', '[data-be-more]', '[data-be-find-toggle]'];
    return selectors.map((selector) => head.querySelector(selector)!.getBoundingClientRect().height);
  });
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2);
  const search = page.locator('.be-actions [data-be-find-toggle]');
  await expect(search).toBeVisible();
  await expect(page.locator('[data-be-find-input]')).toHaveCount(0);
  await expect(page.locator('.be-actions [data-be-more]')).toBeVisible();
  await expect(page.locator('[data-be-chip] .be-glyph svg')).toBeVisible();
  await expect(page.locator('.cell.block .block-glyph svg').first()).toBeVisible();
  await expect(page.locator('.axis-nav-entry .ic svg').first()).toBeVisible();
  await search.click();
  await expect(page.locator('[data-be-find-input]')).toBeFocused();
  expect((await page.locator('[data-be-find]').boundingBox())!.width).toBeLessThanOrEqual(322);
});

test('overflow tabs drag without selecting and reveal selection on End and resize', async ({ page }) => {
  await bootBlockEditorMock(page, { channel: 'A' });
  await openAmpEditor(page);
  const header = page.locator('[data-be-head]');
  await header.evaluate((el) => { el.style.width = '970px'; el.style.maxWidth = '100%'; });
  const nav = page.locator('[data-be-pagenav="tabs"]');
  await expect(header).toHaveAttribute('data-be-head-rows', '1');
  await expect.poll(() => nav.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  const box = (await nav.boundingBox())!;
  const selected = await nav.locator('[data-active="true"]').getAttribute('data-be-tab');
  await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 10, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  expect(await nav.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  expect(await nav.locator('[data-active="true"]').getAttribute('data-be-tab')).toBe(selected);
  await nav.locator('[data-active="true"]').focus();
  await page.keyboard.press('End');
  await expect(nav.locator('[data-be-tab="Advanced"]')).toHaveAttribute('data-active', 'true');
  await activeVisible(page);
  await header.evaluate((el) => { el.style.width = '945px'; });
  await activeVisible(page);
});

test('360px header retains two rows and a usable tab viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await bootBlockEditorMock(page, { channel: 'A' });
  // On a 360 px grid a cell is ~36 px; the bypass dot sits at its top-left, so tap the lower-left
  // corner of the tile (the dot covers the centre there).
  await page.locator('[data-idx="0,0"].cell.block').click({ position: { x: 10, y: 30 } });
  await expect(page.locator('[data-be-board]')).toBeVisible();
  await expect(page.locator('[data-be-key="k0"]').first()).toBeVisible();
  const rects = await page.locator('[data-be-head]').evaluate((head) => {
    return ['[data-be-chip]', '.be-actions', '[data-be-pagenav]'].map((selector) => {
      const r = head.querySelector(selector)!.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, right: r.right };
    });
  });
  expect(Math.abs(rects[0]!.y - rects[1]!.y)).toBeLessThanOrEqual(2);
  expect(rects[2]!.y).toBeGreaterThan(rects[0]!.y);
  for (const r of rects) { expect(r.x).toBeGreaterThanOrEqual(0); expect(r.right).toBeLessThanOrEqual(360); }
  await page.locator('[data-be-tab][data-active="true"]').focus();
  await page.keyboard.press('End');
  await activeVisible(page);
});
