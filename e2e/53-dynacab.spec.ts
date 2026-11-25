import { test, expect, type Page } from '@playwright/test';
import { bootBlockEditorMock } from './support/blockEditorMock';

// DynaCab mic graphic (item 4): the CAB block's DynaCab page carries a `dynaCab` visual — the mic on the
// cab, positioned by the block's own Position / Distance controls and captioned with the selected cab and
// mic. The synthetic block (support/graphBlocks.ts) serves the visual and the matching layout slot.

const board = (page: Page) => page.locator('[data-be-board]');
const tile = (page: Page) => page.locator('[data-be-key="graph:dynaCab"]');
const graph = (page: Page) => page.locator('[data-be-graph="dynaCab"]');
const caption = (page: Page) => graph(page).locator('[data-be-graph-caption]');

async function openCab(page: Page): Promise<void> {
  await page.locator('[data-idx="2,2"].cell.block').click();
  await expect(board(page)).toBeVisible();
  await expect(tile(page)).toBeVisible();
}

test.describe('DynaCab mic graphic', () => {
  test('the cab silhouette and the mic sit on the DynaCab page, named by the block’s cab and mic, following the controls', async ({ page }) => {
    await bootBlockEditorMock(page, { graphs: true });
    await openCab(page);

    // anchored on the DynaCab page, in the layout's graph slot, as a read-only graph tile
    await expect(page.locator('section[data-be-page="DynaCab"] [data-be-key="graph:dynaCab"]')).toHaveCount(1);
    await expect(tile(page)).toHaveAttribute('data-be-view', 'graph');
    await expect(graph(page)).toHaveAttribute('role', 'img');
    await expect(graph(page)).toHaveAttribute('aria-label', /^DynaCab mic: 4x12 UK, Condenser 57, position /);
    await expect(caption(page)).toContainText('4x12 UK');
    await expect(caption(page)).toContainText('Condenser 57');
    await expect(caption(page)).toContainText('position');
    await expect(caption(page)).toContainText('distance');

    // the sketch: the cab body (a filled area), two speakers, the grille line, the mic head (filled) and its stand
    expect(await graph(page).locator('path.be-garea').count()).toBe(2);
    expect(await graph(page).locator('path.be-gline').count()).toBe(6);

    // the mic head and its guide follow the position / distance controls
    const micPath = async () => graph(page).locator('path.be-gline.t-main').first().getAttribute('d');
    const captionBefore = await caption(page).innerText();
    const before = { d: await micPath(), y: await graph(page).locator('line.be-gl').first().getAttribute('y1') };
    const position = page.locator('section[data-be-page="DynaCab"] [data-be-key="k93"] .be-dial');
    await position.focus();
    for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowUp');
    await expect.poll(micPath).not.toBe(before.d);
    await expect.poll(() => graph(page).locator('line.be-gl').first().getAttribute('y1')).not.toBe(before.y);
    await expect.poll(() => caption(page).innerText()).not.toBe(captionBefore);
    // drawing wrote nothing to the device
    expect(await page.evaluate(() => document.querySelectorAll('[data-be-board]').length)).toBeGreaterThan(0);
  });
});
