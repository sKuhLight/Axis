import { test, expect, type Page } from '@playwright/test';
import { bootCleanWorkbench } from './support/workbench';
import { installGridMock, type GridMock } from './support/gridMock';

// AXIS-35 — grid cable-routing UX. Both flows are driven through the SignalGrid against a fully
// MOCKED backend (installGridMock) so no routing write ever reaches the operator's live FM3.

/** Centre of an element (viewport coords), or throw if it isn't laid out. */
async function centre(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function bootConnectedGrid(page: Page): Promise<GridMock> {
  const mock = await installGridMock(page);
  await bootCleanWorkbench(page);
  // The mock drives the device to "ready" — wait for the seeded blocks to render.
  await expect(page.locator('.cell.block').first()).toBeVisible();
  await expect(page.locator('[data-idx="0,0"]')).toBeVisible();
  return mock;
}

test.describe('Grid cable routing (AXIS-35)', () => {
  test('multi-column cable drag connects the whole path in one gesture', async ({ page }) => {
    const mock = await bootConnectedGrid(page);

    // Drag PEQ 1's output port (row 0, col 0) all the way to the empty cell at row 0, col 3.
    // In between: PEQ 2 (a block, must be chained) and one empty cell (must get a shunt).
    const port = await centre(page, '[data-idx="0,0"] .port');
    const target = await centre(page, '[data-idx="0,3"]');

    await page.mouse.move(port.x, port.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 12 });

    // Mid-drag the full planned path previews (dashed cables + a highlight on the new shunt cells).
    // (SVG paths report as "hidden" to Playwright's actionability check — assert presence instead.)
    await expect.poll(() => page.locator('.cbl-preview').count()).toBeGreaterThanOrEqual(3);
    await expect.poll(() => page.locator('.shunt-preview').count()).toBeGreaterThanOrEqual(2);

    await page.mouse.up();

    // The commit lays a shunt in the empty gap (col 2) AND the empty destination (col 3) — 1-indexed,
    // with UNIQUE shunt instance ids (the seed already uses instance 0), and chains a cable per hop.
    await expect.poll(() => mock.cableWrites.length).toBeGreaterThanOrEqual(3);

    const shuntPlacements = mock.cellWrites.filter((c) => c.blockId >= 1024);
    expect(shuntPlacements.map((c) => `${c.row},${c.col}`).sort()).toEqual(['1,3', '1,4']);
    // distinct instance ids, none colliding with the existing shunt (1024)
    const ids = shuntPlacements.map((c) => c.blockId);
    expect(new Set(ids).size).toBe(2);
    expect(ids).not.toContain(1024);
    // PEQ 2 (the intermediate block) is chained through — never cleared or shunted over
    expect(mock.cellWrites.some((c) => c.row === 1 && c.col === 2 && c.blockId >= 1024)).toBe(false);

    // cables chain each adjacent hop straight along row 0 (1-indexed row 1, cols 1→3)
    const cables = mock.cableWrites.map((c) => `${c.srcRow},${c.srcCol}->${c.destRow}:${c.connect}`);
    expect(cables).toContain('1,1->1:true');
    expect(cables).toContain('1,2->1:true');
    expect(cables).toContain('1,3->1:true');
  });

  test('dropping a block onto a shunt replaces it and preserves its wiring', async ({ page }) => {
    const mock = await bootConnectedGrid(page);

    // Long-press Comp 1 (row 1, col 0) to pick it up, then drop it onto the SHUNT at row 2, col 1.
    // The shunt is fed from row 2 (Drive) and feeds row 2 (Delay) — that topology must move to Comp.
    const comp = await centre(page, '[data-idx="1,0"]');
    const shunt = await centre(page, '[data-idx="2,1"]');

    await page.mouse.move(comp.x, comp.y);
    await page.mouse.down();
    await page.waitForTimeout(480); // exceed the 380ms long-press → move mode
    await page.mouse.move(shunt.x, shunt.y, { steps: 12 });

    // The shunt under the pointer is highlighted as the replace target.
    await expect.poll(() => page.locator('.shunt-preview').count()).toBeGreaterThanOrEqual(1);

    await page.mouse.up();

    await expect.poll(() => mock.cellWrites.length).toBeGreaterThanOrEqual(3);

    // Comp's own cell is cleared (2,1 in 1-idx), the shunt cell is cleared (3,2), and Comp is placed
    // into the shunt's cell (3,2) — preserving position.
    const writes = mock.cellWrites.map((c) => `${c.row},${c.col}:${c.blockId}`);
    expect(writes).toContain('2,1:0'); // clear Comp's old cell
    expect(writes).toContain('3,2:0'); // clear the shunt
    expect(writes).toContain('3,2:300'); // place Comp (eid 300) into the shunt's cell

    // the shunt's input (from row 2 of col 1) and output (to row 2 of col 3) are re-wired onto Comp
    const cables = mock.cableWrites.map((c) => `${c.srcRow},${c.srcCol}->${c.destRow}:${c.connect}`);
    expect(cables).toContain('3,1->3:true'); // input:  (row2,col0)→(row2,col1)  1-indexed
    expect(cables).toContain('3,2->3:true'); // output: (row2,col1)→(row2,col2)  1-indexed
  });
});
