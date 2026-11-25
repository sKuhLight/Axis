import { test, expect, type Page } from '@playwright/test';
import { bootBlockEditorMock } from './support/blockEditorMock';

// EQ styles (item 3): the Block Editor's eq tile carries the block's served EQ renderings as view variants —
// Input EQ / Output EQ / PEQ — all the same footprint, picked from the control menu's View list and kept on
// the stored board. The synthetic EQ block (support/graphBlocks.ts) serves ten graphic band gains as its
// page's faders (the tile takes their place), plus an Input EQ, an Output EQ and a PEQ as `visuals`.

const board = (page: Page) => page.locator('[data-be-board]');
const eqTile = (page: Page) => page.locator('[data-be-key="eq"]');
const nodes = (page: Page) => eqTile(page).locator('.eq g.node');

async function openEq(page: Page): Promise<void> {
  await page.locator('[data-idx="2,1"].cell.block').click();
  await expect(board(page)).toBeVisible();
  await expect(eqTile(page)).toBeVisible();
}

async function openMenu(page: Page) {
  await eqTile(page).click({ button: 'right' });
  const menu = page.getByRole('menu', { name: /^Control options/ });
  await expect(menu).toBeVisible();
  return menu;
}

async function footprint(page: Page): Promise<[string | null, string | null]> {
  return eqTile(page).evaluate((el) => [el.getAttribute('data-be-w'), el.getAttribute('data-be-h')]);
}

test.describe('EQ styles on the eq tile', () => {
  test('the output EQ takes the faders’ place; the View list switches Input / Output / PEQ with the footprint kept and the choice persisted', async ({ page }) => {
    await bootBlockEditorMock(page, { graphs: true });
    await openEq(page);

    // the graphic gains are gone and the eq tile is on their page, drawn as the served Output EQ
    await expect(eqTile(page)).toHaveAttribute('data-be-view', 'eqOut');
    await expect(page.locator('section[data-be-page="Graphic EQ"] [data-be-key="eq"]')).toHaveCount(1);
    await expect(eqTile(page).locator('.be-eqtitle')).toHaveText('Output EQ');
    await expect(nodes(page)).toHaveCount(10);
    const size = await footprint(page);
    // only the page's own two knobs stay beside the tile
    await expect(page.locator('[data-be-board] section[data-be-page="Graphic EQ"] [data-be-key^="k"]')).toHaveCount(2);

    // the control menu's View list offers all three styles, the current one checked
    let menu = await openMenu(page);
    await menu.locator('.be-ci-view').click();
    await expect(menu.getByRole('menuitemradio')).toHaveText(['Input EQ', 'Output EQ', 'PEQ']);
    await expect(menu.getByRole('menuitemradio', { name: 'Output EQ' })).toHaveAttribute('aria-checked', 'true');
    await menu.getByRole('menuitemradio', { name: 'Input EQ' }).click();
    await expect(menu).toHaveCount(0);

    // Input EQ: its own title and its bands (low cut, peak, high cut), the same tile size
    await expect(eqTile(page)).toHaveAttribute('data-be-view', 'eqIn');
    await expect(eqTile(page).locator('.be-eqtitle')).toHaveText('Input EQ');
    await expect(nodes(page)).toHaveCount(3);
    expect(await footprint(page)).toEqual(size);

    // PEQ: five bands, same footprint again
    menu = await openMenu(page);
    await menu.locator('.be-ci-view').click();
    await menu.getByRole('menuitemradio', { name: 'PEQ' }).click();
    await expect(eqTile(page)).toHaveAttribute('data-be-view', 'eqPeq');
    await expect(nodes(page)).toHaveCount(5);
    expect(await footprint(page)).toEqual(size);

    // the stored board keeps the chosen style after a reload
    await page.waitForTimeout(500);
    await page.reload();
    await openEq(page);
    await expect(eqTile(page)).toHaveAttribute('data-be-view', 'eqPeq');
    await expect(eqTile(page).locator('.be-eqtitle')).toHaveText('PEQ');
    await expect(nodes(page)).toHaveCount(5);
  });
});
