import { test, expect, type Page } from '@playwright/test';
import { bootBlockEditorMock, checkedProfile, openAmpEditor, openMore, pickMore, pickProfile, type BlockEditorMock } from './support/blockEditorMock';
import { clickNav } from './support/workbench';

// Block Editor rework, slice 2 (AXIS-75): the board shows every page at once (top strip / side stack),
// always fitted to the panel, with value gestures on every view and an arrange drag on the v2 board
// model. Driven against a fully mocked backend (support/blockEditorMock.ts) — no device.
// Since slice 3 (AXIS-76) Top / Side, control size, layout profiles and Arrange live in the header's ⋯
// menu (spec 41 covers the header itself); the assertions here are unchanged. Arrange itself (the bar,
// the library, the page menu, undo, keys) is spec 43's since slice 5 (AXIS-78).

const board = (page: Page) => page.locator('[data-be-board]');
const tile = (page: Page, key: string) => page.locator(`[data-be-key="${key}"]`).first();

/** Wait for the debounced write of a parameter and return the last one. */
async function lastWrite(mock: BlockEditorMock, pid: number) {
  await expect.poll(() => mock.writes.filter((w) => w.pid === pid).length).toBeGreaterThan(0);
  const all = mock.writes.filter((w) => w.pid === pid);
  return all[all.length - 1]!;
}

test.describe('Block Editor board (slice 2)', () => {
  test('fresh storage: the built-in navigation is the side list (not the top strip)', async ({ page }) => {
    await bootBlockEditorMock(page, { nav: 'default' });
    await openAmpEditor(page);
    await expect(board(page)).toHaveAttribute('data-nav', 'side');
    // the side list lists every page and still switches pages
    await expect(page.locator('[data-be-tab]').first()).toBeVisible();
    await page.locator('[data-be-tab="Power Amp"]').click();
    await expect(page.locator('[data-be-tab="Power Amp"]')).toHaveAttribute('aria-selected', 'true');
  });

  test('1366×768: the board fits without vertical scroll and shows the first page', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await bootBlockEditorMock(page);
    await openAmpEditor(page);

    await expect(board(page)).toHaveAttribute('data-nav', 'top');
    const fit = await board(page).evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
    expect(fit.ch).toBeGreaterThan(0);
    expect(fit.sh).toBeLessThanOrEqual(fit.ch + 1);

    const first = page.locator('section[data-be-page="Authentic"]');
    await expect(first.locator('[data-be-key="k0"]')).toBeInViewport();
    await expect(first.locator('[data-be-key="k5"]')).toBeInViewport();
    await expect(page.locator('[data-be-tab="Authentic"]')).toHaveAttribute('data-active', 'true');
  });

  test('2560×720: several pages are visible at once and all their tabs are highlighted', async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 720 });
    await bootBlockEditorMock(page);
    await openAmpEditor(page);

    await expect.poll(() => page.locator('[data-be-tab][data-visible="true"]').count()).toBeGreaterThan(1);
    const visible = await page.locator('[data-be-tab][data-visible="true"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-be-tab')!));
    for (const name of visible) await expect(page.locator(`section[data-be-page="${name}"]`)).toBeInViewport({ ratio: 0.5 });
    const fit = await board(page).evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
    expect(fit.sh).toBeLessThanOrEqual(fit.ch + 1);
  });

  test('clicking a tab scrolls its page into view and makes it active', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    // six pages side by side are wider than the board
    await expect.poll(() => board(page).evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(true);
    await expect(page.locator('section[data-be-page="Advanced"]')).not.toBeInViewport({ ratio: 0.5 });
    await expect(page.locator('[data-be-tab="Advanced"]')).toHaveAttribute('data-visible', 'false');

    await page.locator('[data-be-tab="Advanced"]').click();
    await expect(page.locator('section[data-be-page="Advanced"]')).toBeInViewport({ ratio: 0.5 });
    await expect(page.locator('[data-be-tab="Advanced"]')).toHaveAttribute('data-active', 'true');
    await expect(page.locator('[data-be-tab="Advanced"]')).toHaveAttribute('data-visible', 'true');
    await expect(page.locator('section[data-be-page="Authentic"]')).not.toBeInViewport({ ratio: 0.5 });

    await page.locator('[data-be-tab="Authentic"]').click();
    await expect(page.locator('section[data-be-page="Authentic"]')).toBeInViewport({ ratio: 0.5 });
    await expect(page.locator('[data-be-tab="Authentic"]')).toHaveAttribute('data-active', 'true');

    // the side navigation scrolls vertically to the page
    await pickMore(page, 'nav-side');
    await expect(board(page)).toHaveAttribute('data-nav', 'side');
    await page.locator('[data-be-tab="EQ"]').click();
    await expect(page.locator('section[data-be-page="EQ"]')).toBeInViewport({ ratio: 0.9 });
    await expect(page.locator('[data-be-tab="EQ"]')).toHaveAttribute('data-active', 'true');
  });

  test('knob: drag writes, click on the value types it, arrow keys step', async ({ page }) => {
    const mock = await bootBlockEditorMock(page);
    await openAmpEditor(page);

    // drag up on the Bass knob → a continuous write above the starting 0.5
    const dial = tile(page, 'k1').locator('.be-dial');
    const box = (await dial.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 20, { steps: 5 });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 40, { steps: 5 });
    await page.mouse.up();
    const drag = await lastWrite(mock, 1);
    expect(drag.continuous).toBe(true);
    expect(drag.value).toBeGreaterThan(0.6);

    // click the value in the dial → type 7.5 → Enter commits norm 0.75 (range 0..10)
    await tile(page, 'k3').locator('[data-be-value]').click();
    const input = tile(page, 'k3').locator('input.be-vin');
    await expect(input).toBeFocused();
    await input.fill('7.5');
    await input.press('Enter');
    await expect(input).toHaveCount(0);
    await expect.poll(async () => (await lastWrite(mock, 3)).value).toBeCloseTo(0.75, 5);
    await expect(tile(page, 'k3').locator('[data-be-value]')).toHaveText('7.50');

    // invalid input keeps the old value
    await tile(page, 'k3').locator('[data-be-value]').click();
    await tile(page, 'k3').locator('input.be-vin').fill('loud');
    await tile(page, 'k3').locator('input.be-vin').press('Enter');
    await expect(tile(page, 'k3').locator('[data-be-value]')).toHaveText('7.50');

    // ArrowUp on the focused Mid knob steps +1 %
    await tile(page, 'k2').locator('.be-dial').focus();
    await page.keyboard.press('ArrowUp');
    await expect.poll(async () => (await lastWrite(mock, 2)).value).toBeCloseTo(0.51, 5);
    await expect(tile(page, 'k2').locator('.be-dial')).toHaveAttribute('aria-valuenow', '51');
  });

  test('select popover opens and picks; a switch toggles', async ({ page }) => {
    const mock = await bootBlockEditorMock(page);
    await openAmpEditor(page);

    await tile(page, 'e11').locator('.be-field').click();
    const menu = page.locator('[data-be-select-menu]');
    await expect(menu).toBeVisible();
    await menu.locator('[data-be-option="Left"]').click();
    await expect(menu).toHaveCount(0);
    const pick = await lastWrite(mock, 11);
    expect(pick).toEqual({ pid: 11, value: 1, continuous: false });
    await expect(tile(page, 'e11').locator('.be-field')).toContainText('Left');

    const sw = tile(page, 'e10').locator('[role="switch"]');
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await sw.click();
    expect(await lastWrite(mock, 10)).toEqual({ pid: 10, value: 1, continuous: false });
    await expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  test('side navigation stacks the pages and is kept after a reload', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);

    await pickMore(page, 'nav-side');
    await expect(board(page)).toHaveAttribute('data-nav', 'side');
    const a = (await page.locator('section[data-be-page="Authentic"]').boundingBox())!;
    const b = (await page.locator('section[data-be-page="Preamp"]').boundingBox())!;
    expect(Math.abs(a.x - b.x)).toBeLessThan(1);
    expect(b.y).toBeGreaterThanOrEqual(a.y + a.height - 1);

    await page.reload();
    await expect(page.locator('[data-idx="0,0"].cell.block')).toBeVisible();
    await openAmpEditor(page);
    await expect(board(page)).toHaveAttribute('data-nav', 'side');
    const menu = await openMore(page);
    await expect(menu.locator('.be-mi-nav-side')).toHaveAttribute('aria-checked', 'true');
  });

  test('arrange: a control dragged to a free spot stays there after a reload', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);

    await pickMore(page, 'arrange');
    const grid = page.locator('[data-be-grid][data-page="Authentic"]');
    await expect(grid).toHaveAttribute('data-cols', '24');
    const g = (await grid.boundingBox())!;
    const c = Number(await grid.getAttribute('data-c'));
    const gap = Number(await grid.getAttribute('data-g'));
    const step = c + gap;

    const drive = grid.locator('[data-be-key="k0"]');
    await expect(drive).toHaveAttribute('data-be-x', '0');
    await expect(drive).toHaveAttribute('data-be-y', '0');
    // grab the tile body inside its first cell, clear of the corner resize handle (bottom right; the
    // per-tile ✕ / view badges are gone since slice 5): the item's grab cell is (0, 0), so the pointer's
    // cell is where its top-left corner lands
    const t = (await drive.boundingBox())!;
    const grabX = t.x + step / 2;
    const grabY = t.y + t.height / 2 - 6;
    await expect.poll(() => page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('[data-be-key="k0"]') && !document.elementFromPoint(x, y)?.closest('button'), [grabX, grabY])).toBe(true);
    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.mouse.move(grabX + 36, grabY, { steps: 4 });
    await page.mouse.move(g.x + 20 * step + step / 2, grabY, { steps: 8 });
    await expect(grid.locator('.be-ghost:not(.bad)')).toHaveCount(1);
    await expect(grid.locator('.be-ghost')).toHaveCSS('grid-column-start', '21');
    await page.mouse.up();
    await expect(drive).toHaveAttribute('data-be-x', '20');
    await expect(drive).toHaveAttribute('data-be-y', '0');
    await expect(drive).toHaveClass(/\bsel\b/); // the moved tile is the selection (its tools in the arrange bar)

    await page.reload();
    await expect(page.locator('[data-idx="0,0"].cell.block')).toBeVisible();
    await openAmpEditor(page);
    const again = page.locator('section[data-be-page="Authentic"] [data-be-key="k0"]');
    await expect(again).toHaveAttribute('data-be-x', '20');
    await expect(again).toHaveAttribute('data-be-y', '0');
  });
});

test.describe('Block Editor board (slice 2): keeping the page, stored boards, phones', () => {
  test('a later page stays active through Top/Side and S/M/L; the control size is kept after a reload', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    const dyn = page.locator('[data-be-tab="Dynamics"]');
    const sec = page.locator('section[data-be-page="Dynamics"]');
    await dyn.click();
    await expect(dyn).toHaveAttribute('data-active', 'true');
    await expect(sec).toBeInViewport({ ratio: 0.5 });

    await pickMore(page, 'nav-side');
    await expect(board(page)).toHaveAttribute('data-nav', 'side');
    await expect(sec).toBeInViewport({ ratio: 0.5 });
    await page.waitForTimeout(700); // past the hold after the switch: scroll reports apply again
    await expect(dyn).toHaveAttribute('data-active', 'true');

    await pickMore(page, 'size-l');
    await expect((await openMore(page)).locator('.be-mi-size-l')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await expect(sec).toBeInViewport({ ratio: 0.5 });
    await page.waitForTimeout(700);
    await expect(dyn).toHaveAttribute('data-active', 'true');

    await pickMore(page, 'nav-top');
    await expect(board(page)).toHaveAttribute('data-nav', 'top');
    await expect(sec).toBeInViewport({ ratio: 0.5 });
    await page.waitForTimeout(700);
    await expect(dyn).toHaveAttribute('data-active', 'true');

    await page.reload();
    await expect(page.locator('[data-idx="0,0"].cell.block')).toBeVisible();
    await openAmpEditor(page);
    await expect((await openMore(page)).locator('.be-mi-size-l')).toHaveAttribute('aria-checked', 'true');
  });

  test('a click on a value and a click away writes nothing', async ({ page }) => {
    const mock = await bootBlockEditorMock(page);
    await openAmpEditor(page);
    const value = tile(page, 'k3').locator('[data-be-value]');
    await value.click();
    await expect(tile(page, 'k3').locator('input.be-vin')).toBeFocused();
    await page.locator('[data-be-find-toggle]').click(); // the value loses focus with its text untouched
    await expect(tile(page, 'k3').locator('input.be-vin')).toHaveCount(0);
    await page.keyboard.press('Escape');
    // the same with Enter on the untouched text
    await value.click();
    await tile(page, 'k3').locator('input.be-vin').press('Enter');
    await expect(tile(page, 'k3').locator('input.be-vin')).toHaveCount(0);
    await page.waitForTimeout(300); // longer than the write debounce
    expect(mock.writes.filter((w) => w.pid === 3)).toEqual([]);
  });

  test('boards of the previous editor show and survive the first change', async ({ page }) => {
    await bootBlockEditorMock(page);
    // what the previous editor left in the surface document (here its offline cache): two profiles,
    // "Live" active, one control per cell
    const v1 = (pg: string, keys: string[]) => ({ pageOrder: [pg], page: pg, boards: { [pg]: keys.map((key, i) => ({ id: 'w' + key, key, view: 'knob', x: i, y: 0, w: 1, h: 1 })) } });
    const doc = {
      'axs.surface3meta.Amp': JSON.stringify({ active: 'Live', names: ['Default', 'Blank', 'Live', 'Studio'] }),
      'axs.surface3.Amp.Live': JSON.stringify(v1('Gig', ['k0', 'k3'])),
      'axs.surface3.Amp.Studio': JSON.stringify(v1('Desk', ['k0', 'k1']))
    };
    await page.evaluate((d) => localStorage.setItem('axs.surface.doc', JSON.stringify(d)), doc);
    await page.reload();
    await expect(page.locator('[data-idx="0,0"].cell.block')).toBeVisible();
    await openAmpEditor(page);
    expect(await checkedProfile(page)).toBe('Live');
    await expect(page.locator('[data-be-tab]')).toHaveText(['Gig']);
    await expect(tile(page, 'k3')).toHaveAttribute('data-be-x', '2');

    // the first write (Top/Side) must not cost any other profile its board
    await pickMore(page, 'nav-side');
    await expect(board(page)).toHaveAttribute('data-nav', 'side');
    await page.reload();
    await expect(page.locator('[data-idx="0,0"].cell.block')).toBeVisible();
    await openAmpEditor(page);
    await expect(board(page)).toHaveAttribute('data-nav', 'side');
    expect(await checkedProfile(page)).toBe('Live');
    await expect(page.locator('[data-be-tab]')).toHaveText(['Gig']);
    await expect(tile(page, 'k3')).toHaveAttribute('data-be-x', '2');
    await pickProfile(page, 'Studio');
    await expect(page.locator('[data-be-tab]')).toHaveText(['Desk']);
    await pickProfile(page, 'Default');
    await expect(page.locator('[data-be-tab="Authentic"]')).toBeVisible();
    // the previous editor's keys are still there (never deleted)
    const kept = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('axs.surface.doc') || '{}')).filter((k) => k.startsWith('axs.surface3.')));
    expect(kept.sort()).toEqual(['axs.surface3.Amp.Live', 'axs.surface3.Amp.Studio']);
  });

  test('the Arrange button of an empty page starts arranging', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await pickProfile(page, 'Blank');
    const hint = page.locator('[data-be-empty]');
    await expect(hint).toContainText('This page is empty.');
    await hint.getByRole('button', { name: /Arrange/ }).click();
    await expect(page.locator('[data-be-arrange-done]')).toBeVisible();
    await expect(page.locator('[data-be-grid][data-page="Page 1"]')).toHaveAttribute('data-cols', '24');
  });

  test('phone width: no Top/Side choice (the editor is narrower than 560 px) and no Arrange', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await bootBlockEditorMock(page);
    // a tap near the corner selects the block (its centre holds the bypass dot)
    await page.locator('[data-idx="0,0"].cell.block').click({ position: { x: 6, y: 6 } });
    await expect(board(page)).toBeVisible();
    await expect(page.locator('[data-be-key="k0"]').first()).toBeVisible();
    const menu = await openMore(page);
    await expect(menu.locator('.be-mi-size-m')).toBeVisible();
    await expect(menu.locator('.be-mi-nav-top, .be-mi-nav-side')).toHaveCount(0);
    await expect(menu.locator('.be-mi-arrange')).toHaveCount(0);
  });

  test('the Setup screen (virtual effect) uses the same board', async ({ page }) => {
    await bootBlockEditorMock(page);
    await page.route('**/api/preset/blocks/1/params', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          block: 'Setup',
          slug: 'global',
          page: 1,
          named: ['Input Level', 'Output Level', 'Tuner Offset', 'Pan'].map((name, id) => ({ id, name, value: 0, norm: 0.5, min: 0, max: 10 })),
          enums: [{ id: 9, name: 'Mode', value: 0, options: [{ value: 0, label: 'A' }, { value: 1, label: 'B' }, { value: 2, label: 'C' }] }],
          type: null
        })
      })
    );
    await clickNav(page, 'setup');
    const screen = page.locator('.vscreen');
    await expect(screen.locator('[data-be-board]')).toBeVisible();
    await expect(screen.locator('[data-be-key="k0"]').first()).toContainText('Input Level');
    await expect(screen.locator('[data-be-view="select"]')).toHaveCount(1);
  });
});
