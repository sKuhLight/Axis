import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  arrangeAdd,
  boardSaves,
  bootBlockEditorMock,
  countBoardSaves,
  openAmpEditor,
  openLibrary,
  openMore,
  pickMore,
  pickProfile,
  selectTile
} from './support/blockEditorMock';
import { clickNav } from './support/workbench';

// Block Editor rework, slice 5 (AXIS-78): Arrange — the one-row arrange bar (selection tools, Undo, + Add,
// + Divider, Close gaps, Tidy up, Auto-pack, Page ▾, Done, the "⋯" overflow), the dotted 24-cell grid with
// its teal / red drop preview (also onto another page of the strip), the corner resize, the keyboard
// (arrows / Shift+arrows / Delete / Ctrl+Z / Escape), dividers, the Page ▾ menu and the "Add" library.
// Real pointer input against the fully mocked backend (support/blockEditorMock.ts) — no device.

const board = (page: Page) => page.locator('[data-be-board]');
const bar = (page: Page) => page.locator('[data-be-arrange-bar]');
const ab = (page: Page, part: string) => page.locator(`[data-be-ab="${part}"]`);
const done = (page: Page) => page.locator('[data-be-arrange-done]');
const onPage = (page: Page, pg: string, key: string) => page.locator(`section[data-be-page="${pg}"] [data-be-key="${key}"]`);
const pageMenu = (page: Page) => page.getByRole('menu', { name: 'Page options' });

type Grid = { g: Locator; box: { x: number; y: number; width: number; height: number }; step: number };

/** A page's arrange grid (24 columns), its box and its cell step (cell + gap, px). */
async function gridOf(page: Page, pg: string): Promise<Grid> {
  const g = page.locator(`[data-be-grid][data-page="${pg}"]`);
  await expect(g).toHaveAttribute('data-cols', '24');
  const box = (await g.boundingBox())!;
  const step = Number(await g.getAttribute('data-c')) + Number(await g.getAttribute('data-g'));
  return { g, box, step };
}

/** The centre of cell (cx, cy) of a grid. */
const cellAt = (gr: Grid, cx: number, cy: number) => ({ x: gr.box.x + cx * gr.step + gr.step / 2, y: gr.box.y + cy * gr.step + gr.step / 2 });

/** Press a tile inside its first cell (its grab cell is then (0, 0): the drop cell is where its top-left
 *  corner lands) and move it over cell (cx, cy) of `to` — without releasing. */
async function dragTileTo(page: Page, tile: Locator, to: Grid, cx: number, cy: number) {
  const t = (await tile.boundingBox())!;
  const x = t.x + to.step / 2;
  const y = t.y + to.step / 2;
  await expect.poll(() => page.evaluate(([px, py]) => !!document.elementFromPoint(px, py)?.closest('[data-be-item]'), [x, y])).toBe(true);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12, y, { steps: 3 });
  const c = cellAt(to, cx, cy);
  await page.mouse.move(c.x, c.y, { steps: 8 });
}

async function startArranging(page: Page, opts: { maximize?: boolean } = {}) {
  if (opts.maximize) {
    await page.getByRole('button', { name: 'Maximize Block Editor' }).click();
    await expect(page.getByRole('button', { name: 'Restore Block Editor' })).toBeVisible();
  }
  await pickMore(page, 'arrange');
  await expect(bar(page)).toBeVisible();
}

async function reloadEditor(page: Page) {
  await page.reload();
  await expect(page.locator('[data-idx="0,0"].cell.block')).toBeVisible();
  await openAmpEditor(page);
}

/** Open the Page ▾ menu of the arrange bar. */
async function openPageMenu(page: Page) {
  await ab(page, 'page').click();
  const menu = pageMenu(page);
  await expect(menu).toBeVisible();
  return menu;
}

const pos = async (tile: Locator) => ({ x: await tile.getAttribute('data-be-x'), y: await tile.getAttribute('data-be-y'), w: await tile.getAttribute('data-be-w'), h: await tile.getAttribute('data-be-h') });

test.describe('Block Editor Arrange (slice 5): the board', () => {
  test('a control dragged to a free spot (teal preview) stays there after a reload', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await startArranging(page, { maximize: true });
    const gr = await gridOf(page, 'Authentic');
    const bass = onPage(page, 'Authentic', 'k1');
    await expect(bass).toHaveAttribute('data-be-x', '2');
    await dragTileTo(page, bass, gr, 16, 2);
    const ghost = gr.g.locator('.be-ghost');
    await expect(ghost).toHaveCount(1);
    await expect(ghost).not.toHaveClass(/\bbad\b/);
    await expect(ghost).toHaveCSS('grid-column-start', '17');
    await expect(ghost).toHaveCSS('grid-row-start', '3');
    await page.mouse.up();
    await expect(bass).toHaveAttribute('data-be-x', '16');
    await expect(bass).toHaveAttribute('data-be-y', '2');
    // the dropped tile is selected: its w×h shows, the bar holds its tools
    await expect(bass).toHaveClass(/\bsel\b/);
    await expect(bass.locator('[data-be-dims]')).toHaveText('2×2');
    await expect(ab(page, 'remove')).toBeVisible();

    await done(page).click();
    await expect(bar(page)).toHaveCount(0);
    await reloadEditor(page);
    await expect(onPage(page, 'Authentic', 'k1')).toHaveAttribute('data-be-x', '16');
    await expect(onPage(page, 'Authentic', 'k1')).toHaveAttribute('data-be-y', '2');
  });

  test('a collision is refused: the preview turns red and nothing moves', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await startArranging(page, { maximize: true });
    const gr = await gridOf(page, 'Authentic');
    const drive = onPage(page, 'Authentic', 'k0');
    const before = await pos(drive);
    // onto Treble (4, 0)
    await dragTileTo(page, drive, gr, 4, 0);
    await expect(gr.g.locator('.be-ghost.bad')).toHaveCount(1);
    await page.mouse.up();
    await expect(gr.g.locator('.be-ghost')).toHaveCount(0);
    expect(await pos(drive)).toEqual(before);
    await expect(ab(page, 'undo')).toBeDisabled(); // nothing to undo: nothing changed
  });

  test('the corner handle resizes the selected control (w×h follows); Undo takes it back', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await startArranging(page, { maximize: true });
    const gr = await gridOf(page, 'Authentic');
    const master = onPage(page, 'Authentic', 'k5'); // the last knob of the first row: free space to its right
    await selectTile(page, 'k5');
    await expect(master).toHaveAttribute('data-be-w', '2');
    const handle = master.locator('[data-be-resize]');
    await expect(handle).toBeVisible();
    const h = (await handle.boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + gr.step, h.y + h.height / 2 + gr.step, { steps: 4 });
    await page.mouse.move(h.x + h.width / 2 + 2 * gr.step, h.y + h.height / 2 + gr.step, { steps: 4 });
    await expect(master).toHaveAttribute('data-be-w', '4');
    await expect(master).toHaveAttribute('data-be-h', '3');
    await expect(master.locator('[data-be-dims]')).toHaveText('4×3');
    await page.mouse.up();
    await expect(master).toHaveAttribute('data-be-w', '4');
    await expect(ab(page, 'undo')).toBeEnabled();
    await ab(page, 'undo').click();
    await expect(master).toHaveAttribute('data-be-w', '2');
    await expect(master).toHaveAttribute('data-be-h', '2');
    await expect(ab(page, 'undo')).toBeDisabled(); // the whole gesture was one step
  });

  test('a drag onto another page of the strip moves it there; a page that already holds it shows red', async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 900 });
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await startArranging(page, { maximize: true });
    const p = await gridOf(page, 'Preamp');
    await expect(p.g).toBeInViewport();
    expect(p.box.x + 18 * p.step).toBeLessThan(2560 - 60); // the drop cells are on screen, clear of the edge band

    // Drive onto Preamp (12, 4)
    await dragTileTo(page, onPage(page, 'Authentic', 'k0'), p, 12, 4);
    await expect(p.g.locator('.be-ghost:not(.bad)')).toHaveCount(1);
    await page.mouse.up();
    await expect(onPage(page, 'Authentic', 'k0')).toHaveCount(0);
    await expect(onPage(page, 'Preamp', 'k0')).toHaveAttribute('data-be-x', '12');
    await expect(onPage(page, 'Preamp', 'k0')).toHaveAttribute('data-be-y', '4');
    await expect(page.locator('[data-be-tab="Authentic"]')).toHaveAttribute('data-active', 'true'); // the page stays in view

    // Level (on Preamp) also onto Authentic from the library: dragging it to Preamp then shows red
    await arrangeAdd(page, 'k7');
    await expect(onPage(page, 'Authentic', 'k7')).toHaveCount(1);
    await page.keyboard.press('Escape'); // the library closes, Arrange stays
    await expect(page.locator('[data-be-library]')).toHaveCount(0);
    await expect(bar(page)).toBeVisible();
    const p2 = await gridOf(page, 'Preamp');
    await dragTileTo(page, onPage(page, 'Authentic', 'k7'), p2, 16, 4);
    await expect(p2.g.locator('.be-ghost.bad')).toHaveCount(1);
    await page.mouse.up();
    await expect(onPage(page, 'Authentic', 'k7')).toHaveCount(1);
    await expect(onPage(page, 'Preamp', 'k7')).toHaveCount(1);
    await expect(onPage(page, 'Preamp', 'k0')).toHaveAttribute('data-be-x', '12');

    // selecting a tile on another visible page makes that page the current one (the page tools act there)
    await selectTile(page, 'k8');
    await expect(page.locator('[data-be-tab="Preamp"]')).toHaveAttribute('data-active', 'true');
    await expect(ab(page, 'page')).toContainText('Preamp');
    await expect(p2.g).toBeInViewport(); // nothing scrolled
  });

  test('keyboard: arrows move the selection one cell, Shift+arrows resize it, Delete removes it; Ctrl+Z undoes each', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await startArranging(page, { maximize: true });
    const master = onPage(page, 'Authentic', 'k5');
    await selectTile(page, 'k5');
    await page.keyboard.press('ArrowRight');
    await expect(master).toHaveAttribute('data-be-x', '11');
    await page.keyboard.press('ArrowDown');
    await expect(master).toHaveAttribute('data-be-y', '1');
    await page.keyboard.press('Shift+ArrowRight');
    await expect(master).toHaveAttribute('data-be-w', '3');
    await expect(master.locator('[data-be-dims]')).toHaveText('3×2');
    // one cell left, then against Presence (8, 0): refused, nothing moves (and no undo step)
    await page.keyboard.press('ArrowLeft');
    await expect(master).toHaveAttribute('data-be-x', '10');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(master).toHaveAttribute('data-be-x', '10');
    await page.keyboard.press('Delete');
    await expect(onPage(page, 'Authentic', 'k5')).toHaveCount(0);

    // every change was one step: back through remove, left, grow, down, right
    await page.keyboard.press('Control+z');
    await expect(master).toHaveAttribute('data-be-x', '10');
    await page.keyboard.press('Control+z');
    await expect(master).toHaveAttribute('data-be-x', '11');
    await page.keyboard.press('Control+z');
    await expect(master).toHaveAttribute('data-be-w', '2');
    await page.keyboard.press('Control+z');
    await expect(master).toHaveAttribute('data-be-y', '0');
    await page.keyboard.press('Control+z');
    await expect(master).toHaveAttribute('data-be-x', '10');
    await expect(ab(page, 'undo')).toBeDisabled();
  });

  test('a click on empty grid clears the selection; the selection bar offers View, Size, Pin, the swipe control and Remove', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await startArranging(page, { maximize: true });
    const bass = onPage(page, 'Authentic', 'k1');
    await selectTile(page, 'k1');
    await expect(page.locator('[data-be-ab-view="fader"]')).toBeVisible();
    await expect(page.locator('[data-be-ab-size="S"]')).toHaveAttribute('aria-pressed', 'true'); // a 2×2 knob is S
    await expect(ab(page, 'pin')).toBeVisible();
    await expect(ab(page, 'swipe')).toBeVisible();

    await page.locator('[data-be-ab-view="fader"]').click();
    await expect(bass).toHaveAttribute('data-be-view', 'fader');
    await page.locator('[data-be-ab-view="knob"]').click();
    await expect(bass).toHaveAttribute('data-be-view', 'knob');
    // L = 4×4: no room in place (Mid sits beside it), so it moves to the nearest free spot
    await page.locator('[data-be-ab-size="L"]').click();
    await expect(page.locator('[data-be-ab-size="L"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(bass).toHaveAttribute('data-be-w', '4');
    await expect(bass).toHaveAttribute('data-be-h', '4');

    await ab(page, 'swipe').click();
    await expect(ab(page, 'swipe')).toHaveAttribute('aria-pressed', 'true');
    await ab(page, 'swipe').click();
    await expect(ab(page, 'swipe')).toHaveAttribute('aria-pressed', 'false');

    // empty grid: no selection, the hint is back
    const gr = await gridOf(page, 'Authentic');
    const empty = cellAt(gr, 22, 5);
    await expect.poll(() => page.evaluate(([x, y]) => !document.elementFromPoint(x, y)?.closest('[data-be-item]'), [empty.x, empty.y])).toBe(true);
    await page.mouse.click(empty.x, empty.y);
    await expect(bass).not.toHaveClass(/\bsel\b/);
    await expect(ab(page, 'remove')).toHaveCount(0);

    await selectTile(page, 'k1');
    await ab(page, 'pin').click();
    await expect(page.locator('.custom-panel .axis-widget.param').filter({ hasText: 'Bass' })).toHaveCount(1);
    await selectTile(page, 'k1');
    await ab(page, 'remove').click();
    await expect(onPage(page, 'Authentic', 'k1')).toHaveCount(0);
  });
});

test.describe('Block Editor Arrange (slice 5): the bar', () => {
  test('a divider: added at the first free spot, labelled inline, rotated; kept after a reload', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await startArranging(page, { maximize: true });
    await ab(page, 'hdiv').click();
    const div = page.locator('section[data-be-page="Authentic"] [data-be-view="hdiv"]');
    await expect(div).toHaveCount(1);
    await expect(div).toHaveClass(/\bsel\b/);
    const label = ab(page, 'label');
    await expect(label).toBeFocused();
    await label.fill('Tone stack');
    await label.press('Enter');
    await expect(div.locator('.be-divlbl')).toHaveText('Tone stack');
    await expect(bar(page)).toBeVisible(); // Enter in the field keeps Arrange

    await ab(page, 'rotate').click();
    const vdiv = page.locator('section[data-be-page="Authentic"] [data-be-view="vdiv"]');
    await expect(vdiv).toHaveCount(1);
    await expect(vdiv.locator('.be-divlbl')).toHaveText('Tone stack');
    await ab(page, 'rotate').click();
    await expect(div).toHaveCount(1);

    await done(page).click();
    // the normal mode draws it as a line with its label
    await expect(div.locator('.be-divlbl')).toHaveText('Tone stack');
    await expect(div.locator('.be-hline')).toBeVisible();
    await reloadEditor(page);
    await expect(page.locator('section[data-be-page="Authentic"] [data-be-view="hdiv"] .be-divlbl')).toHaveText('Tone stack');
  });

  test('Close gaps removes the empty columns and rows of the page; Tidy up slides everything up and left', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await startArranging(page, { maximize: true });
    const master = onPage(page, 'Authentic', 'k5');
    // Master (10, 0) → (16, 0): columns 10–15 are empty now
    await selectTile(page, 'k5');
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
    await expect(master).toHaveAttribute('data-be-x', '16');
    await ab(page, 'close-gaps').click();
    await expect(master).toHaveAttribute('data-be-x', '10');
    await expect(page.locator('.toast')).toContainText('Closed the gaps on Authentic');

    // Master down to (16, 4) (rows 4–5 below the content): Tidy up slides it up, then left into its old place
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
    await expect(master).toHaveAttribute('data-be-y', '4');
    await ab(page, 'tidy').click();
    await expect(master).toHaveAttribute('data-be-y', '0');
    await expect(master).toHaveAttribute('data-be-x', '10');
    await expect(page.locator('.toast')).toContainText('Tidied Authentic');
    // one undo step each
    await ab(page, 'undo').click();
    await expect(master).toHaveAttribute('data-be-y', '4');
    await expect(master).toHaveAttribute('data-be-x', '16');
  });

  test('Undo by button and Ctrl+Z (one save each); leaving Arrange clears it and Ctrl+Z outside Arrange leaves the board alone', async ({ page }) => {
    await countBoardSaves(page);
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await startArranging(page, { maximize: true });
    const gr = await gridOf(page, 'Authentic');
    const bass = onPage(page, 'Authentic', 'k1');
    await expect(ab(page, 'undo')).toBeDisabled();
    const saves0 = await boardSaves(page);
    await dragTileTo(page, bass, gr, 16, 2);
    await page.mouse.up();
    await expect(bass).toHaveAttribute('data-be-x', '16');
    await dragTileTo(page, bass, gr, 18, 4);
    await page.mouse.up();
    await expect(bass).toHaveAttribute('data-be-x', '18');
    await expect.poll(() => boardSaves(page)).toBe(saves0 + 2);
    await ab(page, 'undo').click();
    await expect(bass).toHaveAttribute('data-be-x', '16');
    await page.keyboard.press('Control+z');
    await expect(bass).toHaveAttribute('data-be-x', '2');
    await expect(ab(page, 'undo')).toBeDisabled();
    await expect.poll(() => boardSaves(page)).toBe(saves0 + 4);
    await page.waitForTimeout(300);
    expect(await boardSaves(page)).toBe(saves0 + 4);

    // a move, Done, then Ctrl+Z outside Arrange: the board stays as it is
    await dragTileTo(page, bass, gr, 16, 2);
    await page.mouse.up();
    await expect(bass).toHaveAttribute('data-be-x', '16');
    await done(page).click();
    await expect(bar(page)).toHaveCount(0);
    await board(page).click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(200);
    await expect(bass).toHaveAttribute('data-be-x', '16');
    // a fresh Arrange starts with nothing to undo
    await pickMore(page, 'arrange');
    await expect(ab(page, 'undo')).toBeDisabled();
    await page.keyboard.press('Control+z');
    await expect(bass).toHaveAttribute('data-be-x', '16');
  });

  test('Page ▾: rename (also a double-click on the tab), duplicate, move, delete with a confirm; never the last page', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await startArranging(page, { maximize: true });
    await expect(ab(page, 'page')).toContainText('Authentic');

    let menu = await openPageMenu(page);
    await menu.locator('.be-pm-rename').click();
    const field = menu.locator('[data-menu-input]');
    await field.fill('Core');
    await field.press('Enter');
    await expect(menu).toHaveCount(0);
    await expect(page.locator('[data-be-tab="Core"]')).toBeVisible();
    await expect(page.locator('[data-be-tab="Authentic"]')).toHaveCount(0);
    await expect(ab(page, 'page')).toContainText('Core');

    // a double-click on the tab renames too
    await page.locator('[data-be-tab="Core"]').dblclick();
    const tabField = page.locator('[data-be-pagenav] input').first();
    await expect(tabField).toBeFocused();
    await tabField.fill('Main');
    await tabField.press('Enter');
    await expect(page.locator('[data-be-tab="Main"]')).toBeVisible();

    // duplicate: a copy right after it, with fresh ids, shown next
    menu = await openPageMenu(page);
    await menu.locator('.be-pm-duplicate').click();
    await expect(page.locator('[data-be-tab]').nth(1)).toHaveAttribute('data-be-tab', 'Main copy');
    await expect(page.locator('[data-be-tab="Main copy"]')).toHaveAttribute('data-active', 'true');
    const ids = await page.locator('section[data-be-page="Main"] [data-be-item]').evaluateAll((els) => els.map((e) => e.getAttribute('data-be-item')));
    const copyIds = await page.locator('section[data-be-page="Main copy"] [data-be-item]').evaluateAll((els) => els.map((e) => e.getAttribute('data-be-item')));
    expect(copyIds.length).toBe(ids.length);
    expect(copyIds.some((id) => ids.includes(id))).toBe(false);

    // move it right (after Preamp)
    menu = await openPageMenu(page);
    await menu.locator('.be-pm-later').click();
    await expect(page.locator('[data-be-tab]').nth(2)).toHaveAttribute('data-be-tab', 'Main copy');

    // delete asks first
    menu = await openPageMenu(page);
    await menu.locator('.be-pm-delete').click();
    await menu.locator('[data-menu-confirm]').click();
    await expect(page.locator('[data-be-tab="Main copy"]')).toHaveCount(0);
    await expect(bar(page)).toBeVisible();

    // undo brings the page back
    await ab(page, 'undo').click();
    await expect(page.locator('[data-be-tab="Main copy"]')).toHaveCount(1);
    await done(page).click();
    await reloadEditor(page);
    await expect(page.locator('[data-be-tab]').nth(0)).toHaveAttribute('data-be-tab', 'Main');
    await expect(page.locator('[data-be-tab="Main copy"]')).toHaveCount(1);

    // the last page cannot be deleted
    await pickProfile(page, 'Blank');
    await pickMore(page, 'arrange');
    menu = await openPageMenu(page);
    await expect(menu.locator('.be-pm-delete')).toBeDisabled();
  });

  test('Page ▾ "Pin page as panel" puts the page\'s controls into a new custom panel', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await startArranging(page);
    await expect(page.locator('.custom-panel')).toHaveCount(0);
    const menu = await openPageMenu(page);
    await expect(menu.locator('.be-pm-pin')).toContainText('8 controls');
    await menu.locator('.be-pm-pin').click();
    const panel = page.locator('.custom-panel');
    await expect(panel).toHaveCount(1);
    await expect(panel.locator('.axis-widget.param')).toHaveCount(8);
    await expect(panel.locator('.axis-widget.param').filter({ hasText: 'Drive' })).toHaveCount(1);
  });

  test('the Add library: a click adds at the first free spot, a drag places it exactly; marks what is on the page', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await startArranging(page, { maximize: true });
    const lib = await openLibrary(page);
    await expect(lib.locator('[data-be-lib-row="k0"]')).toHaveAttribute('data-on-page', 'true');
    await expect(lib.locator('[data-be-lib-row="k7"]')).toHaveAttribute('data-on-page', 'false');
    // a click: Level onto the first free spot of Authentic, selected
    await lib.locator('[data-be-lib-row="k7"]').click();
    const level = onPage(page, 'Authentic', 'k7');
    await expect(level).toHaveCount(1);
    await expect(level).toHaveClass(/\bsel\b/);
    await expect(lib.locator('[data-be-lib-row="k7"]')).toHaveAttribute('data-on-page', 'true');
    // the board has the keys now: an arrow moves the new control
    const x0 = Number(await level.getAttribute('data-be-x'));
    await page.keyboard.press('ArrowRight');
    await expect(level).toHaveAttribute('data-be-x', String(x0 + 1));
    await expect(lib.locator('[data-be-lib-input]')).toHaveValue('');
    // a click on a control that is already there points at it instead of adding a second one
    await lib.locator('[data-be-lib-row="k0"]').click();
    await expect(onPage(page, 'Authentic', 'k0')).toHaveCount(1);
    await expect(onPage(page, 'Authentic', 'k0')).toHaveClass(/\bsel\b/);

    // a drag: Balance to (18, 2) exactly, with the teal preview on the way
    const gr = await gridOf(page, 'Authentic');
    const row = lib.locator('[data-be-lib-row="k8"]');
    const r = (await row.boundingBox())!;
    await page.mouse.move(r.x + 40, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + 60, r.y + r.height / 2 + 10, { steps: 3 });
    // the library holds a new 2×2 knob by its middle cell (0, 0): the pointer's cell is its top-left
    const c = cellAt(gr, 18, 2);
    await page.mouse.move(c.x, c.y, { steps: 10 });
    await expect(lib).toHaveClass(/\bfading\b/);
    await expect(gr.g.locator('.be-ghost:not(.bad)')).toHaveCount(1);
    await expect(gr.g.locator('.be-ghost')).toHaveCSS('grid-column-start', '19');
    await page.mouse.up();
    const bal = onPage(page, 'Authentic', 'k8');
    await expect(bal).toHaveAttribute('data-be-x', '18');
    await expect(bal).toHaveAttribute('data-be-y', '2');
    await expect(lib).not.toHaveClass(/\bfading\b/);
    // dropping onto another control is refused (red)
    const row2 = lib.locator('[data-be-lib-row="k9"]');
    const r2 = (await row2.boundingBox())!;
    await page.mouse.move(r2.x + 40, r2.y + r2.height / 2);
    await page.mouse.down();
    await page.mouse.move(r2.x + 60, r2.y + r2.height / 2 + 10, { steps: 3 });
    const onBal = cellAt(gr, 18, 2);
    await page.mouse.move(onBal.x, onBal.y, { steps: 10 });
    await expect(gr.g.locator('.be-ghost.bad')).toHaveCount(1);
    await page.mouse.up();
    await expect(onPage(page, 'Authentic', 'k9')).toHaveCount(0);

    // ✕ closes the library, Arrange stays
    await lib.locator('[data-be-lib-close]').click();
    await expect(lib).toHaveCount(0);
    await expect(bar(page)).toBeVisible();
  });
});

test.describe('Block Editor Arrange (slice 5): entering, leaving, sizes, profiles', () => {
  test('Escape closes the library and the page menu first, then ends Arrange — a maximized panel stays maximized', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await startArranging(page, { maximize: true });
    const restore = page.getByRole('button', { name: 'Restore Block Editor' });

    await openLibrary(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-be-library]')).toHaveCount(0);
    await expect(bar(page)).toBeVisible();

    await openPageMenu(page);
    await page.keyboard.press('Escape');
    await expect(pageMenu(page)).toHaveCount(0);
    await expect(bar(page)).toBeVisible();

    await selectTile(page, 'k1');
    await page.keyboard.press('Escape');
    await expect(bar(page)).toHaveCount(0);
    await expect(restore).toBeVisible();
    await expect(board(page)).toBeVisible();
    // the next Escape is the app's again (it restores the maximized panel)
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Maximize Block Editor' })).toBeVisible();
  });

  test('at the default workbench panel height the bar is one row and the board stays usable', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    const normal = await board(page).evaluate((el) => el.clientHeight);
    await pickMore(page, 'arrange');
    await expect(bar(page)).toBeVisible();
    const barH = await bar(page).evaluate((el) => el.getBoundingClientRect().height);
    expect(barH).toBeLessThanOrEqual(48);
    const h = await board(page).evaluate((el) => el.clientHeight);
    expect(h).toBeGreaterThanOrEqual(Math.min(140, normal - 48));
    // the first row of controls is on screen and can be selected
    await expect(onPage(page, 'Authentic', 'k0')).toBeInViewport();
    await selectTile(page, 'k0');
    await expect(ab(page, 'remove')).toBeVisible();
  });

  test('the empty page\'s Arrange opens the library; the narrow tablet bar moves what does not fit into ⋯', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 }); // the workbench's tablet profile: Arrange is allowed
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await pickMore(page, 'arrange');
    await expect(bar(page)).toBeVisible();
    await expect(bar(page)).toHaveClass(/\btouch\b/);
    // touch targets
    const doneH = await done(page).evaluate((el) => el.getBoundingClientRect().height);
    expect(doneH).toBeGreaterThanOrEqual(40);
    // one row: what does not fit is in the ⋯
    const barH = await bar(page).evaluate((el) => el.getBoundingClientRect().height);
    expect(barH).toBeLessThanOrEqual(56);
    await selectTile(page, 'k5');
    await expect(ab(page, 'more')).toBeVisible();
    await ab(page, 'more').click();
    const more = page.getByRole('menu', { name: 'More arrange tools' });
    await expect(more).toBeVisible();
    // a tool from the ⋯ works like its button
    await more.locator('.be-ab-autopack').click();
    await expect(more).toHaveCount(0);
    await ab(page, 'more').click();
    await expect(more.locator('.be-ab-autopack')).toContainText('on');
    await page.keyboard.press('Escape');
    await expect(more).toHaveCount(0);
    await expect(bar(page)).toBeVisible();
    await selectTile(page, 'k5');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(onPage(page, 'Authentic', 'k5')).toHaveAttribute('data-be-y', '2'); // arrows are never Auto-packed
    await done(page).click();

    await pickProfile(page, 'Blank');
    await page.locator('[data-be-empty]').getByRole('button', { name: /Arrange/ }).click();
    await expect(bar(page)).toBeVisible();
    await expect(page.locator('[data-be-library]')).toBeVisible();
  });

  test('phone: no Arrange anywhere', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await bootBlockEditorMock(page);
    await page.locator('[data-idx="0,0"].cell.block').click({ position: { x: 6, y: 6 } });
    await expect(board(page)).toBeVisible();
    const menu = await openMore(page);
    await expect(menu.locator('.be-mi-arrange')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(bar(page)).toHaveCount(0);
  });

  test('a layout profile switch while arranging: Arrange stays, the undo is fresh, each profile keeps its own board', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await startArranging(page, { maximize: true });
    const master = onPage(page, 'Authentic', 'k5');
    await selectTile(page, 'k5');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(master).toHaveAttribute('data-be-y', '2');
    await expect(ab(page, 'undo')).toBeEnabled();

    await pickProfile(page, 'Blank');
    await expect(bar(page)).toBeVisible();
    await expect(ab(page, 'undo')).toBeDisabled();
    await expect(page.locator('[data-be-grid][data-page="Page 1"]')).toHaveAttribute('data-cols', '24');
    await arrangeAdd(page, 'k3');
    await expect(onPage(page, 'Page 1', 'k3')).toHaveCount(1);
    await expect(ab(page, 'undo')).toBeEnabled();

    await pickProfile(page, 'Default');
    await expect(bar(page)).toBeVisible();
    await expect(ab(page, 'undo')).toBeDisabled();
    await expect(onPage(page, 'Authentic', 'k5')).toHaveAttribute('data-be-y', '2');
    await pickProfile(page, 'Blank');
    await expect(onPage(page, 'Page 1', 'k3')).toHaveCount(1);
  });

  test('the Setup screen (compact row) arranges the same way', async ({ page }) => {
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
    await pickMore(page, 'arrange', { scope: screen });
    await expect(screen.locator('[data-be-arrange-bar]')).toBeVisible();
    const t = screen.locator('[data-be-key="k1"]').first();
    const x = Number(await t.getAttribute('data-be-x'));
    await selectTile(page, 'k1', screen);
    await page.keyboard.press('Shift+ArrowDown');
    await expect(t).toHaveAttribute('data-be-h', '3');
    await screen.locator('[data-be-ab="undo"]').click();
    await expect(t).toHaveAttribute('data-be-h', '2');
    expect(Number(await t.getAttribute('data-be-x'))).toBe(x);
    await screen.locator('[data-be-arrange-done]').click();
    await expect(screen.locator('[data-be-arrange-bar]')).toHaveCount(0);
  });
});

test.describe('Block Editor Arrange (slice 5): review fixes', () => {
  /** The horizontal dividers of the first page. */
  const dividers = (page: Page) => page.locator('section[data-be-page="Authentic"] [data-be-view="hdiv"]');

  test('Escape with the library open and the board focused closes the library, then ends Arrange (the panel stays maximized)', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await startArranging(page, { maximize: true });
    const restore = page.getByRole('button', { name: 'Restore Block Editor' });
    await openLibrary(page);
    await selectTile(page, 'k1'); // the board has the focus now, the library stays open
    await expect(page.locator('[data-be-library]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-be-library]')).toHaveCount(0);
    await expect(bar(page)).toBeVisible();
    await expect(restore).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(bar(page)).toHaveCount(0);
    await expect(restore).toBeVisible();
  });

  test('Escape during a library drag cancels the drag only: nothing is added, the library stays open', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await startArranging(page, { maximize: true });
    const lib = await openLibrary(page);
    const gr = await gridOf(page, 'Authentic');
    const r = (await lib.locator('[data-be-lib-row="k8"]').boundingBox())!;
    await page.mouse.move(r.x + 40, r.y + r.height / 2);
    await page.mouse.down();
    await page.mouse.move(r.x + 60, r.y + r.height / 2 + 10, { steps: 3 });
    const c = cellAt(gr, 18, 2);
    await page.mouse.move(c.x, c.y, { steps: 8 });
    await expect(gr.g.locator('.be-ghost')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(gr.g.locator('.be-ghost')).toHaveCount(0);
    await expect(lib).toBeVisible();
    await expect(lib).not.toHaveClass(/\bfading\b/);
    await page.mouse.move(c.x + 10, c.y, { steps: 2 });
    await page.mouse.up();
    await expect(onPage(page, 'Authentic', 'k8')).toHaveCount(0);
    await expect(lib).toBeVisible();
    await expect(bar(page)).toBeVisible();
  });

  test('a divider label commits to its own divider when the field loses the focus to another divider, empty grid or a control', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await startArranging(page, { maximize: true });
    await ab(page, 'hdiv').click();
    await ab(page, 'label').press('Escape'); // no label; Arrange stays
    await ab(page, 'hdiv').click();
    await expect(dividers(page)).toHaveCount(2);
    const ids = await dividers(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-be-item')!));
    const d1 = page.locator(`[data-be-item="${ids[0]}"]`);
    const d2 = page.locator(`[data-be-item="${ids[1]}"]`);
    const label = (d: Locator) => d.locator('.be-divlbl');

    // typed into the first one (no Enter), then a press on the second divider
    await d1.click();
    await ab(page, 'label').fill('Alpha');
    await d2.click();
    await expect(d2).toHaveClass(/\bsel\b/);
    await expect(label(d1)).toHaveText('Alpha');
    await expect(label(d2)).toHaveCount(0);

    // typed into the second, then a press on empty grid: kept, not lost
    await ab(page, 'label').fill('Beta');
    const gr = await gridOf(page, 'Authentic');
    const empty = cellAt(gr, 20, 5);
    await page.mouse.click(empty.x, empty.y);
    await expect(d2).not.toHaveClass(/\bsel\b/);
    await expect(label(d2)).toHaveText('Beta');
    await expect(label(d1)).toHaveText('Alpha');

    // typed into the first, then a press on a control
    await d1.click();
    await ab(page, 'label').fill('Gamma');
    await selectTile(page, 'k0');
    await expect(label(d1)).toHaveText('Gamma');
    await expect(label(d2)).toHaveText('Beta');
  });

  test('a control menu opened while the library is open stacks above it', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await startArranging(page, { maximize: true });
    const lib = await openLibrary(page);
    const lb = (await lib.boundingBox())!;
    // right-click the knob just left of the library near its right edge: the menu opens there, reaching over it
    let key = 'k0';
    for (const k of ['k1', 'k2', 'k3']) {
      const b = (await onPage(page, 'Authentic', k).boundingBox())!;
      if (b.x + b.width < lb.x) key = k;
    }
    const knob = onPage(page, 'Authentic', key);
    const t = (await knob.boundingBox())!;
    await knob.click({ button: 'right', position: { x: t.width - 6, y: 16 } });
    const menu = page.getByRole('menu', { name: /^Control options/ });
    await expect(menu).toBeVisible();
    const m = (await menu.boundingBox())!;
    const cx = m.x + m.width / 2;
    const cy = m.y + m.height / 2;
    // the menu's centre lies over the library …
    expect(cx > lb.x && cx < lb.x + lb.width && cy > lb.y && cy < lb.y + lb.height).toBe(true);
    // … and the menu is what is hit there
    expect(await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.aw-context-menu'), [cx, cy])).toBe(true);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(lib).toBeVisible();
  });

  test('undoing "Duplicate" / "Add page" brings the page the user is back on into view', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await startArranging(page, { maximize: true });
    const authentic = page.locator('section[data-be-page="Authentic"]');

    let menu = await openPageMenu(page);
    await menu.locator('.be-pm-duplicate').click();
    await expect(page.locator('[data-be-tab="Authentic copy"]')).toHaveAttribute('data-active', 'true');
    await expect(page.locator('section[data-be-page="Authentic copy"]')).toBeInViewport({ ratio: 0.5 });
    await ab(page, 'undo').click();
    await expect(page.locator('[data-be-tab="Authentic copy"]')).toHaveCount(0);
    await expect(authentic).toBeInViewport({ ratio: 0.5 });
    await page.waitForTimeout(900); // past the hold: scroll reports apply again
    await expect(page.locator('[data-be-tab="Authentic"]')).toHaveAttribute('data-active', 'true');

    menu = await openPageMenu(page);
    await menu.locator('.be-pm-add').click();
    await expect(page.locator('[data-be-tab="Page 7"]')).toHaveAttribute('data-active', 'true');
    await ab(page, 'undo').click();
    await expect(page.locator('[data-be-tab="Page 7"]')).toHaveCount(0);
    await expect(authentic).toBeInViewport({ ratio: 0.5 });
    await page.waitForTimeout(900);
    await expect(page.locator('[data-be-tab="Authentic"]')).toHaveAttribute('data-active', 'true');
  });

  test('Ctrl+Z during a drag or a corner resize does nothing; each gesture is still one step', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await startArranging(page, { maximize: true });
    const gr = await gridOf(page, 'Authentic');
    const bass = onPage(page, 'Authentic', 'k1');
    const master = onPage(page, 'Authentic', 'k5');
    // step 1: Bass → (16, 2)
    await dragTileTo(page, bass, gr, 16, 2);
    await page.mouse.up();
    await expect(bass).toHaveAttribute('data-be-x', '16');

    // a drag of Master with Ctrl+Z in the middle: nothing is undone, the drop still lands
    await dragTileTo(page, master, gr, 18, 4);
    await page.keyboard.press('Control+z');
    await expect(bass).toHaveAttribute('data-be-x', '16');
    await expect(gr.g.locator('.be-ghost:not(.bad)')).toHaveCount(1);
    await page.mouse.up();
    await expect(master).toHaveAttribute('data-be-x', '18');
    await expect(master).toHaveAttribute('data-be-y', '4');

    // a corner resize of Master with Ctrl+Z in the middle
    await selectTile(page, 'k5');
    const h = (await master.locator('[data-be-resize]').boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + gr.step, h.y + h.height / 2, { steps: 4 });
    await page.keyboard.press('Control+z');
    await page.mouse.move(h.x + h.width / 2 + 2 * gr.step, h.y + h.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect(master).toHaveAttribute('data-be-w', '4');
    await expect(master).toHaveAttribute('data-be-x', '18');

    // three steps back, then nothing left
    await ab(page, 'undo').click();
    await expect(master).toHaveAttribute('data-be-w', '2');
    await ab(page, 'undo').click();
    await expect(master).toHaveAttribute('data-be-x', '10');
    await ab(page, 'undo').click();
    await expect(bass).toHaveAttribute('data-be-x', '2');
    await expect(ab(page, 'undo')).toBeDisabled();
  });

  test('a held arrow key is one step with one save, written when the key is released', async ({ page }) => {
    await countBoardSaves(page);
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await startArranging(page, { maximize: true });
    const master = onPage(page, 'Authentic', 'k5');
    await selectTile(page, 'k5');
    const saves0 = await boardSaves(page);
    // the first press and two auto-repeats (what holding the key sends), then the release
    const key = (type: 'keydown' | 'keyup', repeat: boolean) =>
      page.evaluate(
        ({ t, r }) => (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent(t, { key: 'ArrowDown', code: 'ArrowDown', repeat: r, bubbles: true, cancelable: true })),
        { t: type, r: repeat }
      );
    await key('keydown', false);
    await key('keydown', true);
    await key('keydown', true);
    await expect(master).toHaveAttribute('data-be-y', '3');
    await page.waitForTimeout(200);
    expect(await boardSaves(page)).toBe(saves0); // nothing written while the key is held
    await key('keyup', false);
    await expect.poll(() => boardSaves(page)).toBe(saves0 + 1);
    await page.waitForTimeout(300);
    expect(await boardSaves(page)).toBe(saves0 + 1);
    // one undo step for the whole hold
    await ab(page, 'undo').click();
    await expect(master).toHaveAttribute('data-be-y', '0');
    await expect(ab(page, 'undo')).toBeDisabled();
  });

  test('Ctrl+Z in Arrange never reaches the preset history; outside Arrange it does', async ({ page }) => {
    const mock = await bootBlockEditorMock(page);
    await openAmpEditor(page);
    // a parameter change the preset history records
    const sw = onPage(page, 'Authentic', 'e10').locator('[role="switch"]');
    await sw.click();
    await expect.poll(() => mock.writes.filter((w) => w.pid === 10).length).toBe(1);

    await startArranging(page);
    const master = onPage(page, 'Authentic', 'k5');
    await selectTile(page, 'k5');
    await page.keyboard.press('ArrowRight');
    await expect(master).toHaveAttribute('data-be-x', '11');
    await page.keyboard.press('Control+z');
    await expect(master).toHaveAttribute('data-be-x', '10');
    await page.keyboard.press('Control+z'); // nothing left to undo in Arrange: still Arrange's key
    await page.waitForTimeout(400);
    expect(mock.writes.filter((w) => w.pid === 10)).toHaveLength(1);
    await expect(page.locator('.toast', { hasText: 'Undo —' })).toHaveCount(0);

    // outside Arrange the key is the preset history's again: the switch goes back
    await done(page).click();
    await expect(bar(page)).toHaveCount(0);
    await page.keyboard.press('Control+z');
    await expect.poll(() => mock.writes.filter((w) => w.pid === 10).length).toBe(2);
    expect(mock.writes.filter((w) => w.pid === 10).at(-1)).toEqual({ pid: 10, value: 0, continuous: false });
    await expect(page.locator('.toast', { hasText: 'Undo —' })).toHaveCount(1);
    await expect(master).toHaveAttribute('data-be-x', '10');
  });

  test('Delete / Backspace typed into a text field never remove the selected tile', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await startArranging(page, { maximize: true });
    const master = onPage(page, 'Authentic', 'k5');

    // the divider label field (the divider is the selection)
    await ab(page, 'hdiv').click();
    const field = ab(page, 'label');
    await field.pressSequentially('ab');
    await field.press('Backspace');
    await field.press('Delete');
    await expect(dividers(page)).toHaveCount(1);
    await field.press('Escape');

    // the tab rename field
    await selectTile(page, 'k5');
    await page.locator('[data-be-tab="Authentic"]').dblclick();
    const tabField = page.locator('[data-be-pagenav] input').first();
    await expect(tabField).toBeFocused();
    await tabField.press('Backspace');
    await tabField.press('Delete');
    await tabField.press('Escape');
    await expect(master).toHaveCount(1);
    await expect(bar(page)).toBeVisible();

    // Page ▾ Rename…
    await selectTile(page, 'k5');
    const menu = await openPageMenu(page);
    await menu.locator('.be-pm-rename').click();
    const pmField = menu.locator('[data-menu-input]');
    await pmField.press('Backspace');
    await pmField.press('Delete');
    await pmField.press('Escape');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(master).toHaveCount(1);

    // the library's search field
    await selectTile(page, 'k5');
    const lib = await openLibrary(page);
    const search = lib.locator('[data-be-lib-input]');
    await expect(search).toBeFocused();
    await search.pressSequentially('x');
    await search.press('Backspace');
    await search.press('Delete');
    await expect(master).toHaveCount(1);
    await expect(master).toHaveClass(/\bsel\b/);
    await expect(bar(page)).toBeVisible();
  });
});
