import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test';
import {
  BYPASS_MODE_PID,
  SCENE_IGNORE_PID,
  TRACKING_PID,
  boardSaves,
  bootBlockEditorMock,
  countBoardSaves,
  openAmpEditor,
  openLibrary,
  openMore,
  pickMore,
  selectTile
} from './support/blockEditorMock';

// Block Editor: the fixed area (AXIS-94) — the controls a device editor repeats on every page are shown once,
// beside the pages: a column at the far right (desktop, tablet; top and side navigation), a band at the bottom
// on a phone and in a very narrow editor. It never scrolls with the pages, is customizable in Arrange (drag
// from and to the pages, library, keyboard, its width) and saved with the board. The header's controls (Bypass,
// Bypass Mode, Scene Ignore) are in no default board, and the old grid map strip is gone.
// Fully mocked backend (support/blockEditorMock.ts, `fixed: true`) — no device.

const HEADER_KEYS = ['bypass', `e${BYPASS_MODE_PID}`, `e${SCENE_IGNORE_PID}`];
/** The default area: the page-level Tracking Mode, the mixer (Level, Balance, Input Select), the shared Depth. */
const FIXED_KEYS = [`e${TRACKING_PID}`, 'k7', 'k8', 'e11', 'k9'];
const PAGES = ['Authentic', 'Power Amp', 'EQ', 'Dynamics', 'Advanced'];

const board = (page: Page) => page.locator('[data-be-board]');
const fixed = (page: Page) => page.getByRole('region', { name: 'Fixed controls' });
const inFixed = (page: Page, key: string) => fixed(page).locator(`[data-be-key="${key}"]`);
const fixedGrid = (page: Page) => fixed(page).locator('[data-be-grid]');
const keysIn = (l: Locator) => l.locator('[data-be-key]').evaluateAll((els) => els.map((e) => e.getAttribute('data-be-key')));
const cellOf = (t: Locator) => t.evaluate((e) => ['x', 'y', 'w', 'h'].map((a) => Number(e.getAttribute(`data-be-${a}`))));
const storedBoard = (page: Page, key = 'axs.be1.Amp.Default.desktop') =>
  page.evaluate((k) => JSON.parse((JSON.parse(localStorage.getItem('axs.surface.doc') || '{}') as Record<string, string>)[k] ?? 'null'), key) as Promise<{
    boards: Record<string, { key?: string }[]>;
    fixed?: { cols: number; items: { key?: string; x: number; y: number }[] };
  } | null>;

/** A tab click scrolls smoothly; wait until the board rests. */
async function settle(page: Page) {
  await expect
    .poll(() =>
      board(page).evaluate(
        (el) =>
          new Promise<boolean>((res) => {
            const a = `${el.scrollLeft},${el.scrollTop}`;
            setTimeout(() => res(a === `${el.scrollLeft},${el.scrollTop}`), 150);
          })
      )
    )
    .toBe(true);
}

async function arrange(page: Page) {
  await page.getByRole('button', { name: 'Maximize Block Editor' }).click();
  await expect(page.getByRole('button', { name: 'Restore Block Editor' })).toBeVisible();
  await pickMore(page, 'arrange');
  await expect(page.locator('[data-be-arrange-bar]')).toBeVisible();
}
const done = async (page: Page) => {
  await page.locator('[data-be-arrange-done]').click();
  await expect(page.locator('[data-be-arrange-bar]')).toHaveCount(0);
};
/** Press a tile in its first cell and move it over cell (cx, cy) of a grid, without releasing. */
async function dragOver(page: Page, tile: Locator, grid: Locator, cx: number, cy: number) {
  const g = (await grid.boundingBox())!;
  const step = Number(await grid.getAttribute('data-c')) + Number(await grid.getAttribute('data-g'));
  const t = (await tile.boundingBox())!;
  await page.mouse.move(t.x + step / 2, t.y + step / 2);
  await page.mouse.down();
  await page.mouse.move(t.x + step / 2 + 12, t.y + step / 2, { steps: 3 });
  await page.mouse.move(g.x + (cx + 0.5) * step, g.y + (cy + 0.5) * step, { steps: 10 });
}
async function reload(page: Page) {
  await page.reload();
  await expect(page.locator('[data-idx="0,0"].cell.block')).toBeVisible();
  await openAmpEditor(page);
}
/** One finger through Chromium's input pipeline (the tiles' `touch-action` decides what the browser pans). */
async function swipe(cdp: CDPSession, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= steps; i++)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const centre = async (l: Locator) => {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const pageGrid = (page: Page, name: string) => page.locator(`[data-be-grid][data-page="${name}"]`);

test.describe('Block Editor fixed area', () => {
  test('a shallow dock uses the selected scale across pages and Fixed and respects the editor minimum', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    await bootBlockEditorMock(page, { fixed: true });
    await openAmpEditor(page);
    await pickMore(page, 'nav-side');
    const dock = page.locator('.aw-region-bottom').filter({ has: board(page) });
    await dock.evaluate((el) => { el.style.height = '225px'; });
    const values: number[] = [];
    for (const size of ['s', 'm', 'l']) {
      await pickMore(page, `size-${size}`);
      const grid = pageGrid(page, 'Authentic');
      const cell = Number(await grid.getAttribute('data-c'));
      values.push(cell);
      await expect(pageGrid(page, 'Power Amp')).toHaveAttribute('data-c', String(cell));
      await expect(fixedGrid(page)).toHaveAttribute('data-c', String(cell));
    }
    expect(values[1]).toBeGreaterThan(values[0]!);
    expect(values[2]).toBeGreaterThan(values[1]!);
    await dock.evaluate((el) => { el.style.height = '120px'; });
    const height = () => dock.evaluate((el) => el.clientHeight);
    await expect.poll(height).toBeGreaterThan(120);
    const large = await height();
    await pickMore(page, 'size-s');
    await expect.poll(height).toBeLessThan(large);
    await expect.poll(height).toBeGreaterThan(120);
  });

  for (const nav of ['top', 'side'] as const) {
    test(`${nav} navigation: the repeated controls show once at the far right and stay put on page changes and scrolling`, async ({ page }) => {
      await countBoardSaves(page);
      await bootBlockEditorMock(page, { fixed: true });
      await openAmpEditor(page);
      if (nav === 'side') await pickMore(page, 'nav-side');
      await expect(board(page)).toHaveAttribute('data-nav', nav);
      const area = fixed(page);
      await expect(area).toHaveAttribute('data-be-fixed', 'column');
      expect(await keysIn(area)).toEqual(FIXED_KEYS);
      // once: on no page, and no page of its own
      for (const k of FIXED_KEYS) await expect(board(page).locator(`[data-be-key="${k}"]`)).toHaveCount(0);
      await expect(page.locator('[data-be-tab]')).toHaveText(PAGES);

      // beside the pages, with the pages' cell size, up to the right edge of the editor
      const main = (await page.locator('.be-main').boundingBox())!;
      const at = (await area.boundingBox())!;
      const b = (await board(page).boundingBox())!;
      expect(Math.abs(b.x + b.width - at.x)).toBeLessThan(1.5);
      expect(Math.abs(main.x + main.width - (at.x + at.width))).toBeLessThan(1.5);
      expect(await fixedGrid(page).getAttribute('data-c')).toBe(await pageGrid(page, 'Authentic').getAttribute('data-c'));
      expect(await fixedGrid(page).getAttribute('data-cols')).toBe('6');

      // every page change and a scroll of the pages leave it where it is
      const knobAt = (await inFixed(page, 'k7').boundingBox())!;
      for (const name of PAGES) {
        await page.locator(`[data-be-tab="${name}"]`).click();
        await settle(page);
        await expect(page.locator(`[data-be-tab="${name}"]`)).toHaveAttribute('aria-selected', 'true');
        expect(await inFixed(page, 'k7').boundingBox()).toEqual(knobAt);
      }
      // a wheel over the area scrolls no page; one over the pages does, and moves nothing in the area
      const pos = () => board(page).evaluate((el) => el.scrollLeft + el.scrollTop);
      const before = await pos();
      await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
      await page.mouse.wheel(0, -400);
      await page.waitForTimeout(250);
      expect(await pos()).toBe(before);
      await page.mouse.move(b.x + b.width / 2, b.y + b.height - 12);
      await page.mouse.wheel(0, -400);
      await expect.poll(pos).toBeLessThan(before);
      expect(await inFixed(page, 'k7').boundingBox()).toEqual(knobAt);
      expect(await boardSaves(page)).toBe(0); // looking writes nothing
    });
  }

  test('its controls work like on a page: drag, value, select, control menu', async ({ page }) => {
    const mock = await bootBlockEditorMock(page, { fixed: true });
    await openAmpEditor(page);
    const dial = (await inFixed(page, 'k8').locator('.be-dial').boundingBox())!;
    await page.mouse.move(dial.x + dial.width / 2, dial.y + 8);
    await page.mouse.down();
    await page.mouse.move(dial.x + dial.width / 2, dial.y - 22, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => mock.writes.filter((w) => w.pid === 8).length).toBeGreaterThan(0);
    await inFixed(page, `e${TRACKING_PID}`).locator('.be-field').click();
    await page.locator('[data-be-select-menu] [data-be-option="Wide"]').click();
    await expect.poll(() => mock.enumWrites.at(-1)).toEqual({ pid: TRACKING_PID, value: 2 });
    await inFixed(page, 'k9').click({ button: 'right' });
    const menu = page.getByRole('menu', { name: /^Control options/ });
    await expect(menu.locator('.be-ci-head')).toHaveText('Depth · Fixed area');
    await expect(menu.locator('.be-ci-modifier')).toBeVisible();
    await expect(menu.locator('.be-ci-remove')).toHaveText(/Remove from the fixed area/);
    // "Move to page ▸" moves it out; on a page the menu offers the way back
    await menu.locator('.be-ci-move').click();
    await menu.locator('.be-ci-move-opt', { hasText: 'Power Amp' }).click();
    await expect(inFixed(page, 'k9')).toHaveCount(0);
    const onPage = page.locator('section[data-be-page="Power Amp"] [data-be-key="k9"]');
    await expect(onPage).toHaveCount(1);
    await onPage.click({ button: 'right' });
    await menu.locator('.be-ci-move').click();
    await menu.locator('.be-ci-move-fixed').click();
    await expect(inFixed(page, 'k9')).toHaveCount(1);
    await expect(onPage).toHaveCount(0);
  });

  test('the select popover stays within the window at the right edge', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 768 });
    await bootBlockEditorMock(page, { fixed: true });
    await openAmpEditor(page);
    await page.getByRole('button', { name: 'Maximize Block Editor' }).click();
    const field = inFixed(page, 'e11').locator('.be-field');
    await expect(field).toBeVisible();
    // Place the trigger against the window edge to exercise clamping independently of dock padding.
    await field.evaluate((el) => {
      const right = window.innerWidth - el.getBoundingClientRect().right;
      (el as HTMLElement).style.translate = `${right - 12}px 0`;
    });
    await field.dispatchEvent('click');
    const popover = page.locator('[data-be-select-menu]');
    await expect(popover).toBeVisible();
    const t = (await field.boundingBox())!;
    const p = (await popover.boundingBox())!;
    expect(t.x + p.width).toBeGreaterThan(1440);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x + p.width).toBeLessThanOrEqual(1440);
  });

  test('no header control in the default board; the library and the search offer them; a placement of one’s own stays', async ({ page }) => {
    await bootBlockEditorMock(page, { fixed: true });
    await openAmpEditor(page);
    for (const k of HEADER_KEYS) await expect(page.locator(`[data-be-item][data-be-key="${k}"]`)).toHaveCount(0);
    await page.locator('[data-be-find-toggle]').click();
    for (const k of HEADER_KEYS) await expect(page.locator(`[data-be-find-row="${k}"]`)).toHaveCount(1);
    await page.keyboard.press('Escape');
    await arrange(page);
    const lib = await openLibrary(page);
    for (const k of HEADER_KEYS) await expect(lib.locator(`[data-be-lib-row="${k}"]`)).toHaveAttribute('data-on-page', 'false');
    await lib.locator(`[data-be-lib-row="e${SCENE_IGNORE_PID}"]`).click();
    await expect(board(page).locator(`[data-be-key="e${SCENE_IGNORE_PID}"]`)).toHaveCount(1);
    await done(page);
    await reload(page);
    await expect(board(page).locator(`[data-be-key="e${SCENE_IGNORE_PID}"]`)).toHaveCount(1);
    for (const k of ['bypass', `e${BYPASS_MODE_PID}`]) await expect(page.locator(`[data-be-item][data-be-key="${k}"]`)).toHaveCount(0);
  });

  test('Arrange: drag a control into the area and one out of it; the reload keeps both; "Reset fixed area" restores it', async ({ page }) => {
    await bootBlockEditorMock(page, { fixed: true });
    await openAmpEditor(page);
    await arrange(page);
    // a page's control into the area, under its last row
    const area = fixedGrid(page);
    await expect(area).toHaveClass(/\barrange\b/);
    await dragOver(page, pageGrid(page, 'Authentic').locator('[data-be-key="k4"]'), area, 0, 6);
    await expect(area.locator('.be-ghost')).toHaveCount(1);
    await expect(area.locator('.be-ghost')).not.toHaveClass(/\bbad\b/);
    expect(await board(page).evaluate((el) => el.scrollLeft)).toBe(0); // crossing the pages' edge pushed nothing along
    await page.mouse.up();
    await expect(inFixed(page, 'k4')).toHaveCount(1);
    expect(await cellOf(inFixed(page, 'k4'))).toEqual([0, 6, 2, 2]);
    await expect(pageGrid(page, 'Authentic').locator('[data-be-key="k4"]')).toHaveCount(0);
    // onto another control: refused (red)
    await dragOver(page, pageGrid(page, 'Authentic').locator('[data-be-key="k0"]'), area, 0, 2);
    await expect(area.locator('.be-ghost.bad')).toHaveCount(1);
    await page.mouse.up();
    await expect(inFixed(page, 'k0')).toHaveCount(0);
    // out of the area onto a page (its own cell), then within the area
    await dragOver(page, inFixed(page, 'k9'), pageGrid(page, 'Authentic'), 14, 0);
    await page.mouse.up();
    await expect(pageGrid(page, 'Authentic').locator('[data-be-key="k9"]')).toHaveCount(1);
    expect(await cellOf(pageGrid(page, 'Authentic').locator('[data-be-key="k9"]'))).toEqual([14, 0, 2, 2]);
    await dragOver(page, inFixed(page, 'k4'), area, 2, 4);
    await page.mouse.up();
    expect(await cellOf(inFixed(page, 'k4'))).toEqual([2, 4, 2, 2]);
    await done(page);
    const saved = (await storedBoard(page))!;
    expect(saved.fixed!.items.map((i) => i.key)).toEqual([`e${TRACKING_PID}`, 'k7', 'k8', 'e11', 'k4']);
    await expect(page.locator('[data-be-more]')).toHaveAttribute('data-custom', 'true');

    await reload(page);
    await expect(inFixed(page, 'k4')).toHaveCount(1);
    expect(await cellOf(inFixed(page, 'k4'))).toEqual([2, 4, 2, 2]);
    await expect(inFixed(page, 'k9')).toHaveCount(0);
    await expect(board(page).locator('section[data-be-page="Authentic"] [data-be-key="k9"]')).toHaveCount(1);

    // "Reset fixed area" (⋯): the area only, the pages stay as they are
    await pickMore(page, 'reset-fixed', { confirm: true });
    expect(await keysIn(fixed(page))).toEqual(FIXED_KEYS);
    await expect(board(page).locator('section[data-be-page="Authentic"] [data-be-key="k9"]')).toHaveCount(1);
    expect((await storedBoard(page))!.fixed!.items.map((i) => i.key)).toEqual(FIXED_KEYS);
    const menu = await openMore(page);
    await expect(menu.locator('.be-mi-reset-fixed')).toBeDisabled();
    await expect(menu.locator('.be-mi-reset-page')).toBeEnabled();
  });

  test('Arrange: the selected area takes the library’s click; keys move and resize there; Page ▾ keeps the page', async ({ page }) => {
    await bootBlockEditorMock(page, { fixed: true });
    await openAmpEditor(page);
    await arrange(page);
    await selectTile(page, 'k8', fixed(page));
    await expect(page.locator('[data-be-ab="page"]')).toHaveText(/Page: Authentic/);
    const lib = await openLibrary(page);
    await expect(lib.locator('.be-lhint b')).toHaveText('Fixed area');
    await expect(lib.locator('[data-be-lib-row="k8"]')).toHaveAttribute('data-on-page', 'true');
    await lib.locator('[data-be-lib-row="k13"]').click(); // Sag, also on Power Amp: allowed
    await expect(inFixed(page, 'k13')).toHaveCount(1);
    expect(await cellOf(inFixed(page, 'k13'))).toEqual([0, 4, 2, 2]);
    await expect(page.locator('section[data-be-page="Power Amp"] [data-be-key="k13"]')).toHaveCount(1);
    // keyboard: move, refused past the area's edge, resize, remove — and undo
    await expect(inFixed(page, 'k13')).toHaveClass(/\bsel\b/);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await cellOf(inFixed(page, 'k13'))).toEqual([3, 4, 2, 2]);
    await page.keyboard.press('Shift+ArrowDown');
    expect(await cellOf(inFixed(page, 'k13'))).toEqual([3, 4, 2, 3]);
    await page.keyboard.press('Delete');
    await expect(inFixed(page, 'k13')).toHaveCount(0);
    await expect(page.locator('.toast')).toContainText('from the fixed area');
    await page.keyboard.press('Control+z');
    expect(await cellOf(inFixed(page, 'k13'))).toEqual([3, 4, 2, 3]);
    // a page's tile makes the page the target again
    await selectTile(page, 'k0', board(page));
    await expect(lib.locator('.be-lhint b')).toHaveText('Authentic');
    // a library drag lands at its exact spot in the area whatever the target is (a knob is held by its first cell)
    const row = (await lib.locator('[data-be-lib-row="k14"]').boundingBox())!;
    const g = (await fixedGrid(page).boundingBox())!;
    const step = Number(await fixedGrid(page).getAttribute('data-c')) + Number(await fixedGrid(page).getAttribute('data-g'));
    await page.mouse.move(row.x + 30, row.y + row.height / 2);
    await page.mouse.down();
    await page.mouse.move(row.x + 10, row.y + row.height / 2 + 6, { steps: 3 });
    await page.mouse.move(g.x + 0.5 * step, g.y + 6.5 * step, { steps: 10 });
    await expect(fixedGrid(page).locator('.be-ghost:not(.bad)')).toHaveCount(1);
    await page.mouse.up();
    expect(await cellOf(inFixed(page, 'k14'))).toEqual([0, 6, 2, 2]);
  });

  test('Arrange: the width handle by mouse and keyboard, one undo step each; pages and area keep one cell size', async ({ page }) => {
    await bootBlockEditorMock(page, { fixed: true });
    await openAmpEditor(page);
    await page.locator('.be-root').first().evaluate((el) => (el.style.maxWidth = '900px'));
    await arrange(page);
    const handle = page.getByRole('separator', { name: 'Width of the fixed area' });
    await expect(handle).toHaveAttribute('aria-valuenow', '6');
    const c = await fixedGrid(page).getAttribute('data-c');
    await expect.poll(() => board(page).evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0);
    await board(page).evaluate((el) => (el.scrollLeft = 48));
    await settle(page);
    const offset = await board(page).evaluate((el) => el.scrollLeft);
    expect(offset).toBeGreaterThan(0);
    await handle.focus();
    await page.keyboard.press('ArrowLeft'); // the edge moves left: wider
    await expect(handle).toHaveAttribute('aria-valuenow', '7');
    await expect(handle).toBeFocused();
    expect(await board(page).evaluate((el) => el.scrollLeft)).toBe(offset);
    await page.keyboard.press('ArrowRight');
    await expect(handle).toHaveAttribute('aria-valuenow', '6');
    await page.keyboard.press('End');
    await expect(handle).toHaveAttribute('aria-valuenow', '8');
    await page.keyboard.press('Control+z');
    await expect(handle).toHaveAttribute('aria-valuenow', '6');
    // drag it two cells to the left
    const box = (await handle.boundingBox())!;
    const step = Number(c) + Number(await fixedGrid(page).getAttribute('data-g'));
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 2 * step, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(handle).toHaveAttribute('aria-valuenow', '8');
    expect(await fixedGrid(page).getAttribute('data-cols')).toBe('8');
    expect(await fixedGrid(page).getAttribute('data-c')).toBe(c); // the frozen cell
    expect((await storedBoard(page))!.fixed!.cols).toBe(8);
    await page.locator('[data-be-ab="undo"]').click();
    await expect(handle).toHaveAttribute('aria-valuenow', '6');
    // narrower: the controls pack again, nothing overlaps or leaves
    await handle.focus();
    await page.keyboard.press('Home');
    await expect(handle).toHaveAttribute('aria-valuenow', '2');
    expect((await keysIn(fixed(page))).sort()).toEqual([...FIXED_KEYS].sort());
    await done(page);
    expect(await fixedGrid(page).getAttribute('data-c')).toBe(await pageGrid(page, 'Authentic').getAttribute('data-c'));
  });

  test('a board without one: "Add fixed area"; emptied it shows only in Arrange and can be removed', async ({ page }) => {
    await bootBlockEditorMock(page); // nothing repeated
    await openAmpEditor(page);
    await expect(fixed(page)).toHaveCount(0);
    await arrange(page);
    await expect(fixed(page)).toHaveCount(0);
    const add = page.locator('[data-be-ab="fixed"]');
    if (await add.isVisible()) await add.click();
    else {
      await page.locator('[data-be-ab="more"]').click();
      await page.locator('.be-ab-fixed').click();
    }
    await expect(fixed(page)).toHaveCount(1);
    await expect(page.getByRole('separator', { name: 'Width of the fixed area' })).toBeFocused();
    await expect(add).toHaveCount(0);
    await dragOver(page, pageGrid(page, 'Authentic').locator('[data-be-key="k0"]'), fixedGrid(page), 0, 0);
    await page.mouse.up();
    await expect(inFixed(page, 'k0')).toHaveCount(1);
    await expect(page.locator('[data-be-fixed-remove]')).toHaveCount(0);
    await done(page);
    await expect(inFixed(page, 'k0')).toHaveCount(1);
    // emptied: gone outside Arrange, still there inside
    await pickMore(page, 'arrange');
    await selectTile(page, 'k0', fixed(page));
    await page.keyboard.press('Delete');
    await done(page);
    await expect(fixed(page)).toHaveCount(0);
    await pickMore(page, 'arrange');
    await expect(fixed(page)).toHaveCount(1);
    await page.getByRole('button', { name: 'Remove the fixed area' }).click();
    await expect(fixed(page)).toHaveCount(0);
    await expect(page.locator('[data-be-ab="fixed"]:focus, [data-be-ab="more"]:focus')).toHaveCount(1);
    await done(page);
    expect((await storedBoard(page))!.fixed).toBeUndefined();
  });

  test('a very narrow editor (desktop): a band instead of the column; Arrange shows the area’s own grid there', async ({ page }) => {
    await bootBlockEditorMock(page, { fixed: true });
    await openAmpEditor(page);
    await page.locator('.be-root').first().evaluate((el) => (el.style.maxWidth = '520px'));
    await expect(fixed(page)).toHaveAttribute('data-be-fixed', 'column');
    await page.locator('.be-root').first().evaluate((el) => (el.style.maxWidth = '330px'));
    await expect(fixed(page)).toHaveAttribute('data-be-fixed', 'band');
    await expect(page.locator('[data-be-fixed-toggle]')).toHaveAttribute('aria-expanded', 'false');
    const offsetInStrip = () => board(page).evaluate((el) => el.scrollLeft);
    await board(page).evaluate((el) => (el.scrollLeft = 48));
    await settle(page);
    expect(await offsetInStrip()).toBeGreaterThan(0);
    await page.locator('[data-be-fixed-toggle]').click();
    expect(await keysIn(fixed(page))).toEqual(FIXED_KEYS);
    expect(await offsetInStrip()).toBeGreaterThan(0);
    // the pages keep the whole width
    const w = await board(page).evaluate((el) => el.clientWidth);
    expect(w).toBeGreaterThanOrEqual(325);
    await page.getByRole('button', { name: 'Maximize Block Editor' }).click();
    await pickMore(page, 'arrange');
    await expect(fixedGrid(page)).toHaveAttribute('data-cols', '6');
    const handle = page.getByRole('separator', { name: 'Width of the fixed area' });
    await handle.focus();
    await page.keyboard.press('ArrowRight'); // the edge is on the right here: wider
    await expect(handle).toHaveAttribute('aria-valuenow', '7');
  });

  test('"Find a control…" flashes a control of the area without changing the page', async ({ page }) => {
    await bootBlockEditorMock(page, { fixed: true });
    await openAmpEditor(page);
    await page.locator('[data-be-tab="EQ"]').click();
    await settle(page);
    await page.locator('[data-be-find-toggle]').click();
    await page.locator('[data-be-find-input]').fill('balance');
    const row = page.locator('[data-be-find-row="k8"]');
    await expect(row.locator('[data-be-find-page="fixed"]')).toHaveText('Fixed area');
    await row.locator('.be-fmain').click();
    await expect(inFixed(page, 'k8')).toHaveClass(/\bflash\b/);
    await expect(page.locator('[data-be-tab="EQ"]')).toHaveAttribute('aria-selected', 'true');
  });

  test('no grid map anywhere: not in the editor, not in ⋯ (desktop, tablet)', async ({ page }) => {
    for (const size of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(size);
      await bootBlockEditorMock(page, { fixed: true });
      await openAmpEditor(page);
      await expect(page.locator('[data-screen="Grid Map"], .gridmap-wrap')).toHaveCount(0);
      const menu = await openMore(page);
      await expect(menu.locator('.be-mi-change-type')).toBeVisible();
      await expect(menu.locator('.be-mi-grid-map')).toHaveCount(0);
      await page.keyboard.press('Escape');
    }
  });
});

test.describe('Block Editor fixed area on the tablet', () => {
  test.use({ hasTouch: true });
  test('touch: an area that does not scroll drags values like the pages (top: vertical); a sideways swipe changes nothing', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP touch input is Chromium-only');
    await page.setViewportSize({ width: 1100, height: 800 });
    const mock = await bootBlockEditorMock(page, { fixed: true });
    await openAmpEditor(page);
    await page.getByRole('button', { name: 'Maximize Block Editor' }).click(); // room: nothing to scroll in the area
    await expect(inFixed(page, 'k7')).toHaveCSS('touch-action', 'pan-x pinch-zoom');
    const cdp = await page.context().newCDPSession(page);
    const at = await centre(inFixed(page, 'k7').locator('.be-dial'));
    await swipe(cdp, at, { x: at.x - 120, y: at.y - 3 });
    await page.waitForTimeout(300);
    expect(mock.writes.filter((w) => w.pid === 7)).toEqual([]);
    await swipe(cdp, at, { x: at.x + 2, y: at.y - 50 });
    await expect.poll(() => mock.writes.filter((w) => w.pid === 7).length).toBeGreaterThan(0);
  });

  test('1024×768: a column; what the dock opener covers scrolls clear of it; Arrange has 40 px targets', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await bootBlockEditorMock(page, { fixed: true });
    await openAmpEditor(page);
    await expect(fixed(page)).toHaveAttribute('data-be-fixed', 'column');
    const opener = page.locator('.aw-mobile-dock-indicator.right');
    if (await opener.count()) {
      const scroller = fixed(page).locator('.be-fx-scroll');
      const viewport = (await scroller.boundingBox())!;
      const o = (await opener.boundingBox())!;
      expect(viewport.y + viewport.height).toBeLessThanOrEqual(o.y + 0.5);
      await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
      const last = (await inFixed(page, 'k9').boundingBox())!;
      expect(last.y + last.height).toBeLessThanOrEqual(o.y);
    }
    await pickMore(page, 'arrange');
    const handle = (await page.getByRole('separator', { name: 'Width of the fixed area' }).boundingBox())!;
    expect(handle.width).toBeGreaterThanOrEqual(40);
    expect(handle.height).toBeLessThanOrEqual(80);
  });
});

test.describe('Block Editor fixed area on short phones', () => {
  test.use({ hasTouch: true });
  for (const vp of [{ width: 390, height: 664 }, { width: 360, height: 640 }]) {
    test(`the expanded band clears the bottom bar at ${vp.width}×${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await bootBlockEditorMock(page, { fixed: true });
      const block = page.locator('[data-idx="0,0"].cell.block');
      await block.dispatchEvent('pointerdown', { pointerType: 'touch', button: 0, buttons: 1 });
      await block.dispatchEvent('pointerup', { pointerType: 'touch', button: 0, buttons: 0 });
      const band = fixed(page);
      await expect(band).toHaveAttribute('data-be-fixed', 'band');
      const toggle = band.locator('[data-be-fixed-toggle]');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect.poll(async () => {
        const bounds = (await band.boundingBox())!;
        const bottomBar = (await page.locator('.aw-bottombar').boundingBox())!;
        return bounds.y + bounds.height - bottomBar.y;
      }).toBeLessThanOrEqual(0.5);
    });
  }

  test('an open band stays above the bottom bar when the viewport shrinks', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await bootBlockEditorMock(page, { fixed: true });
    await page.locator('[data-idx="0,0"].cell.block').click({ position: { x: 6, y: 6 } });
    const band = fixed(page);
    await band.locator('[data-be-fixed-toggle]').click();
    await page.setViewportSize({ width: 390, height: 664 });
    await expect.poll(async () => {
      const bounds = (await band.boundingBox())!;
      const bottomBar = (await page.locator('.aw-bottombar').boundingBox())!;
      return bounds.y + bounds.height - bottomBar.y;
    }).toBeLessThanOrEqual(0.5);
  });
});

for (const vp of [
  { width: 390, height: 844 },
  { width: 360, height: 780 }
]) {
  test.describe(`Block Editor fixed area on the phone ${vp.width}×${vp.height}`, () => {
    test.use({ hasTouch: true });

    test('touch on the band: a sideways drag changes the value, a vertical swipe changes nothing; a long-press opens the menu', async ({ page, browserName }) => {
      test.skip(browserName !== 'chromium', 'CDP touch input is Chromium-only');
      await page.setViewportSize(vp);
      const mock = await bootBlockEditorMock(page, { fixed: true });
      await page.locator('[data-idx="0,0"].cell.block').click({ position: { x: 6, y: 6 } });
      const knob = inFixed(page, 'k7');
      await expect(knob).toHaveCSS('touch-action', 'pan-y pinch-zoom');
      const cdp = await page.context().newCDPSession(page);
      const at = await centre(knob.locator('.be-dial'));
      await swipe(cdp, at, { x: at.x + 3, y: at.y - 60 });
      await page.waitForTimeout(300);
      expect(mock.writes.filter((w) => w.pid === 7)).toEqual([]);
      await swipe(cdp, at, { x: at.x + 50, y: at.y + 2 });
      await expect.poll(() => mock.writes.filter((w) => w.pid === 7).length).toBeGreaterThan(0);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
      await page.waitForTimeout(750);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const menu = page.getByRole('menu', { name: /^Control options/ });
      await expect(menu.locator('.be-ci-head')).toHaveText('Level · Fixed area');
      await expect(menu.locator('.be-ci-move, .be-ci-remove')).toHaveCount(0); // no layout rows on the phone
    });

    test('a band under the pages: at most four knobs a row, the rest behind a toggle, clear of the dock opener', async ({ page }) => {
      await page.setViewportSize(vp);
      await countBoardSaves(page);
      await bootBlockEditorMock(page, { fixed: true });
      await page.locator('[data-idx="0,0"].cell.block').click({ position: { x: 6, y: 6 } });
      await expect(board(page).locator('[data-be-key="k0"]')).toBeVisible();
      const band = fixed(page);
      await expect(band).toHaveAttribute('data-be-fixed', 'band');
      // under the pages' scroller, full width; the first line only, no tile behind the toggle is there at all
      const b = (await board(page).boundingBox())!;
      const a = (await band.boundingBox())!;
      expect(Math.abs(b.y + b.height - a.y)).toBeLessThan(1.5);
      expect(Math.abs(a.width - b.width)).toBeLessThan(1.5);
      const toggle = page.locator('[data-be-fixed-toggle]');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      // the first line is full: Tracking Mode (two knobs wide) and as many knobs as the band's columns hold
      const cols = Number(await band.locator('[data-be-grid]').getAttribute('data-cols'));
      expect(await keysIn(band)).toEqual([`e${TRACKING_PID}`, 'k7', ...(cols >= 8 ? ['k8'] : [])]);
      const t = (await toggle.boundingBox())!;
      expect(Math.min(t.width, t.height)).toBeGreaterThanOrEqual(40);
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(await keysIn(band)).toEqual(FIXED_KEYS);
      // at most four knobs a row (two cells each in eight columns), nothing cut off at the right
      const rows = await band.locator('[data-be-item]').evaluateAll((els) => {
        const m = new Map<number, number>();
        for (const e of els) m.set(Number(e.getAttribute('data-be-y')), (m.get(Number(e.getAttribute('data-be-y'))) ?? 0) + Number(e.getAttribute('data-be-w')));
        return [...m.values()];
      });
      expect(Math.max(...rows)).toBeLessThanOrEqual(8);
      // clear of the workbench's floating box, closed and open
      const clear = () =>
        page.evaluate(() => {
          const o = document.querySelector('.aw-mobile-dock-indicator.right')?.getBoundingClientRect();
          const parts = [...document.querySelectorAll('[data-be-fixed] [data-be-item], [data-be-fixed-toggle]')].map((e) => e.getBoundingClientRect());
          return !o || parts.every((r) => r.right <= o.left || r.left >= o.right || r.bottom <= o.top || r.top >= o.bottom);
        });
      await page.waitForTimeout(200);
      expect(await clear()).toBe(true);
      await toggle.click();
      await page.waitForTimeout(200);
      expect(await clear()).toBe(true);
      // it stays while the pages scroll; the last row of the last page still scrolls clear of the box
      const knobAt = (await inFixed(page, 'k7').boundingBox())!;
      await board(page).evaluate((el) => (el.scrollTop = el.scrollHeight));
      await settle(page);
      expect(await inFixed(page, 'k7').boundingBox()).toEqual(knobAt);
      const end = await page.evaluate(() => ({
        bottom: Math.max(...[...document.querySelectorAll('[data-be-board] [data-be-item]')].map((x) => x.getBoundingClientRect().bottom)),
        opener: document.querySelector('.aw-mobile-dock-indicator.right')?.getBoundingClientRect().top ?? Infinity
      }));
      expect(end.bottom).toBeLessThanOrEqual(end.opener);
      // no grid map here either; nothing was written
      await expect(page.locator('[data-screen="Grid Map"], .gridmap-wrap')).toHaveCount(0);
      const menu = await openMore(page);
      await expect(menu.locator('.be-mi-grid-map, .be-mi-arrange')).toHaveCount(0);
      expect(await boardSaves(page)).toBe(0);
    });
  });
}
