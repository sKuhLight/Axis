import { test, expect, type Page } from '@playwright/test';
import { bootCleanWorkbench, enterEditMode } from './support/workbench';

// Quick Controls (custom panel as a Block Editor board): one panel collects every control dropped on it,
// lays the controls out on the block editor's cell raster (4 cells / two knobs a row, one knob column wider
// for a fifth control, never a third row before it is four knobs wide), and groups them under a labelled
// divider per block — switchable, and switching it back on re-sorts by block.

const PARAM_MIME = 'application/x-workbench-parameter-source+json';

function paramPayload(opts: { effectId: number; paramId: number; block: string; label: string; color: string }): string {
  return JSON.stringify({
    id: `axis.param.${opts.effectId}.${opts.paramId}`,
    label: opts.label,
    preferredWidgetType: 'axis.paramControl',
    defaultSize: 'default',
    binding: {
      kind: 'axis.paramControl',
      version: 1,
      target: {
        effectId: opts.effectId,
        paramId: opts.paramId,
        block: opts.block,
        param: opts.label,
        label: opts.label
      }
    },
    state: { block: opts.block, label: opts.label, color: opts.color }
  });
}

async function dropParam(page: Page, selector: string, payload: string, at?: { x: number; y: number }): Promise<void> {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await page.evaluate(({ dt, mime, data }) => dt.setData(mime, data), { dt: dataTransfer, mime: PARAM_MIME, data: payload });
  const init = at ? { dataTransfer, clientX: at.x, clientY: at.y } : { dataTransfer };
  await page.dispatchEvent(selector, 'dragover', init);
  await page.dispatchEvent(selector, 'drop', init);
}

/** Drop a control on empty workspace space in the main region: the first drop creates the one panel. */
async function dropOnWorkspace(page: Page, payload: string): Promise<void> {
  const main = (await page.locator('.aw-region[data-region="main"]').boundingBox())!;
  await dropParam(page, '.aw-workspace', payload, { x: main.x + main.width / 2, y: main.y + main.height / 2 });
}

/** Drop onto the panel's bottom-left cell, so the control is appended after the ones already there. */
async function dropOnPanel(page: Page, payload: string): Promise<void> {
  const box = (await page.locator('.custom-panel').boundingBox())!;
  await dropParam(page, '.custom-panel', payload, { x: box.x + 16, y: box.y + box.height - 8 });
}

const GAIN = paramPayload({ effectId: 100, paramId: 0, block: 'Amp 1', label: 'Gain', color: '#d98a2b' });
const MASTER = paramPayload({ effectId: 100, paramId: 1, block: 'Amp 1', label: 'Master', color: '#d98a2b' });
const LEVEL = paramPayload({ effectId: 200, paramId: 1, block: 'Drive 1', label: 'Level', color: '#d6543f' });
const TONE = paramPayload({ effectId: 200, paramId: 2, block: 'Drive 1', label: 'Tone', color: '#d6543f' });
const MIX = paramPayload({ effectId: 300, paramId: 3, block: 'Delay 1', label: 'Mix', color: '#4f8fd6' });

const grid = (page: Page) => page.locator('[data-quick-controls-grid]');
const tiles = (page: Page) => page.locator('.custom-panel .be-tile[data-be-view]');
const dividers = (page: Page) => page.locator('[data-quick-controls-divider]');

async function colsOf(page: Page): Promise<number> {
  return Number(await grid(page).getAttribute('data-cols'));
}

async function toggleGrouping(page: Page, on: boolean): Promise<void> {
  await page.locator('[data-quick-controls-menu]').click();
  await page.locator('[data-quick-controls-group]').setChecked(on);
  await page.locator('[data-quick-controls-menu]').click();
}

test.describe('Quick Controls — one panel, block-editor board', () => {
  test('the first drop creates exactly one "Quick Controls" panel, 4 cells wide, drawn with block-editor tiles', async ({ page }) => {
    await bootCleanWorkbench(page);
    await expect(page.locator('.custom-panel')).toHaveCount(0);

    await dropOnWorkspace(page, GAIN);

    await expect(page.locator('.custom-panel')).toHaveCount(1);
    await expect(page.locator('[data-panel-tab]').filter({ hasText: 'Quick Controls' })).toHaveCount(1);
    await expect(grid(page)).toBeVisible();
    expect(await colsOf(page)).toBe(4);
    // Two knobs a row: a 210 px grid (4 × 42 + 3 × 14), never squashed.
    expect((await grid(page).boundingBox())!.width).toBeGreaterThanOrEqual(210);

    await dropOnPanel(page, MASTER);
    await dropOnPanel(page, LEVEL);

    await expect(tiles(page)).toHaveCount(3);
    await expect(page.locator('.custom-panel')).toHaveCount(1);
    // Block-editor visuals: knobs, in the block editor's cell units (2×2 cells each).
    expect(await tiles(page).first().getAttribute('data-be-view')).toBe('knob');
    expect(await tiles(page).first().getAttribute('data-be-w')).toBe('2');
    expect(await tiles(page).first().getAttribute('data-be-h')).toBe('2');
    expect(await colsOf(page)).toBe(4);
  });

  test('a fifth control widens the panel one knob column instead of wrapping', async ({ page }) => {
    await bootCleanWorkbench(page);
    await dropOnWorkspace(page, GAIN);
    for (const payload of [MASTER, LEVEL, TONE]) await dropOnPanel(page, payload);
    await expect(tiles(page)).toHaveCount(4);
    expect(await colsOf(page)).toBe(4);

    // Without grouping the controls flow: four fill the two 4-cell rows, the fifth widens the panel.
    await toggleGrouping(page, false);
    await dropOnPanel(page, MIX);

    await expect(tiles(page)).toHaveCount(5);
    expect(await colsOf(page)).toBe(6);
    const rows = await tiles(page).evaluateAll((els) => els.map((el) => Number(el.getAttribute('data-be-y'))));
    expect(Math.max(...rows)).toBeLessThanOrEqual(2);
    const xs = await tiles(page).evaluateAll((els) => els.map((el) => Number(el.getAttribute('data-be-x'))));
    expect(Math.max(...xs)).toBe(4);
  });

  test('grouping draws a labelled divider per block and the toggle off/on drops and re-sorts them', async ({ page }) => {
    await bootCleanWorkbench(page);
    await dropOnWorkspace(page, LEVEL);
    for (const payload of [GAIN, MASTER, TONE]) await dropOnPanel(page, payload);
    await expect(tiles(page)).toHaveCount(4);

    // Grouping is ON by default; blocks sort by label (Amp 1 before Drive 1).
    await expect(dividers(page)).toHaveCount(2);
    const labels = await dividers(page).evaluateAll((els) => els.map((el) => el.getAttribute('data-quick-controls-divider')));
    expect(labels).toEqual(['Amp 1', 'Drive 1']);
    expect(await dividers(page).first().getAttribute('style')).toContain('height: 14px');

    await toggleGrouping(page, false);
    await expect(dividers(page)).toHaveCount(0);
    await expect(tiles(page)).toHaveCount(4);

    await toggleGrouping(page, true);
    await expect(dividers(page)).toHaveCount(2);
    // Back on, the first block's controls come first (Amp 1 sorts before Drive 1).
    const firstTwo = await tiles(page).evaluateAll((els) =>
      els.slice(0, 2).map((el) => el.querySelector('.be-lbl')?.textContent ?? '')
    );
    expect(firstTwo.slice().sort()).toEqual(['Gain', 'Master']);
  });

  test('the panel and its width survive a reload', async ({ page }) => {
    await bootCleanWorkbench(page);
    await dropOnWorkspace(page, GAIN);
    for (const payload of [MASTER, LEVEL, TONE]) await dropOnPanel(page, payload);
    await toggleGrouping(page, false);
    await dropOnPanel(page, MIX);
    await expect(tiles(page)).toHaveCount(5);
    expect(await colsOf(page)).toBe(6);

    await page.waitForTimeout(400); // the store's 150 ms debounce
    await page.reload();
    await page.waitForSelector('.aw-root');
    await expect(page.locator('.custom-panel')).toHaveCount(1);
    await expect(tiles(page)).toHaveCount(5);
    expect(await colsOf(page)).toBe(6);
  });

  test('a control can be selected and deleted with the panel narrowing back', async ({ page }) => {
    await bootCleanWorkbench(page);
    await dropOnWorkspace(page, GAIN);
    for (const payload of [MASTER, LEVEL, TONE]) await dropOnPanel(page, payload);
    await toggleGrouping(page, false);
    await dropOnPanel(page, MIX);
    await expect(tiles(page)).toHaveCount(5);

    await tiles(page).last().click({ button: 'right' });
    await expect(page.locator('.custom-panel [data-quick-control-remove]')).toHaveCount(1);
    await page.locator('.custom-panel [data-quick-control-remove]').click();

    await expect(tiles(page)).toHaveCount(4);
    expect(await colsOf(page)).toBe(4);
  });

  test('in Customize a plain drag takes a tile out of the panel and into another zone', async ({ page }) => {
    await bootCleanWorkbench(page);
    await dropOnWorkspace(page, GAIN);
    await dropOnPanel(page, MASTER);
    await expect(tiles(page)).toHaveCount(2);

    await enterEditMode(page);
    const host = page.locator('.custom-panel [data-widget-host]').first();
    await expect(host).toHaveCount(1);
    const bar = page.locator('[data-zone="top.left"]');
    const before = await bar.locator('[data-widget-host]').count();
    const from = (await host.boundingBox())!;
    const to = (await bar.boundingBox())!;

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 24, from.y + from.height / 2 + 8, { steps: 5 });
    // the workbench drag has lifted the tile: it travels as the drag ghost, the board closes the gap
    await expect(host).toBeHidden();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();

    await expect(bar.locator('[data-widget-host]')).toHaveCount(before + 1);
    await expect(tiles(page)).toHaveCount(1);
  });
});
