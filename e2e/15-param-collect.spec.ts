import { test, expect } from '@playwright/test';
import {
  bootCleanWorkbench,
  enterEditMode,
  exitEditMode,
  regionTabs,
  seedMyControls,
  seedPinnedControls
} from './support/workbench';

// Pinned parameter controls collect into ONE panel — My Controls, the single pin
// destination — and render as recognizable, block-coloured, named tiles that
// arrange with the shared widget machinery.
//
// Drag-to-pin is gone (there is nowhere else to drop a control), so the drop
// mechanics these specs used to cover — edge drops, tab-bar drops, drag-hover
// overlays — no longer exist. What remains under test is the panel and the tiles.

const GAIN = { effectId: 100, paramId: 0, block: 'Amp 1', label: 'Gain', color: '#d98a2b' };
const LEVEL = { effectId: 200, paramId: 1, block: 'Drive 1', label: 'Level', color: '#d6543f' };
const MASTER = { effectId: 100, paramId: 1, block: 'Amp 1', label: 'Master', color: '#d98a2b' };

test.describe('My Controls — the single pin destination', () => {
  test('ships as a tab beside History and cannot be closed', async ({ page }) => {
    await bootCleanWorkbench(page);

    const rightTabs = regionTabs(page, 'right');
    await expect(rightTabs.filter({ hasText: 'History' })).toHaveCount(1);
    await expect(rightTabs.filter({ hasText: 'My Controls' })).toHaveCount(1);

    await rightTabs.filter({ hasText: 'My Controls' }).click();
    await expect(page.locator('.custom-panel')).toBeVisible();
    // Empty state points at the only way to fill it.
    await expect(page.getByText(/Pin to My Controls/i).first()).toBeVisible();
  });

  test('collects controls from different blocks as named, block-coloured tiles — no tab per param', async ({ page }) => {
    await bootCleanWorkbench(page);
    await seedPinnedControls(page, [GAIN, LEVEL]);
    await regionTabs(page, 'right').filter({ hasText: 'My Controls' }).click();

    const panel = page.locator('.custom-panel').first();
    const tiles = panel.locator('.axis-widget.param');
    await expect(tiles).toHaveCount(2);
    // Both landed in the ONE panel — the right stack still has exactly two tabs.
    await expect(regionTabs(page, 'right')).toHaveCount(2);

    // Identity: each control shows its parameter NAME…
    await expect(panel.getByText('Gain', { exact: true })).toBeVisible();
    await expect(panel.getByText('Level', { exact: true })).toBeVisible();

    // …renders in the Block-Editor square-tile mode…
    await expect(panel.locator('.axis-widget.param[data-param-mode="tile"]')).toHaveCount(2);

    // …and carries its source block's category accent (ownership at a glance).
    const styles = await tiles.evaluateAll((els) => els.map((el) => el.getAttribute('style') ?? ''));
    expect(styles.some((s) => s.includes('#d98a2b'))).toBe(true);
    expect(styles.some((s) => s.includes('#d6543f'))).toBe(true);

    // Tooltip carries the source block name (control-surface style).
    await expect(panel.locator('.axtip', { hasText: 'Amp 1 · Gain' })).toHaveCount(1);
    await expect(panel.locator('.axtip', { hasText: 'Drive 1 · Level' })).toHaveCount(1);
  });

  test('pinned controls survive a reload', async ({ page }) => {
    await bootCleanWorkbench(page);
    await seedPinnedControls(page, [GAIN]);
    await regionTabs(page, 'right').filter({ hasText: 'My Controls' }).click();
    await expect(page.locator('.custom-panel .axis-widget.param')).toHaveCount(1);

    await page.reload();
    await page.waitForSelector('.aw-root');
    await regionTabs(page, 'right').filter({ hasText: 'My Controls' }).click();
    await expect(page.locator('.custom-panel .axis-widget.param')).toHaveCount(1);
    await expect(page.locator('.custom-panel').getByText('Gain', { exact: true })).toBeVisible();
  });
});

test.describe('Pinned control tiles', () => {
  test('arrange with the shared widget drag machinery', async ({ page }) => {
    await bootCleanWorkbench(page);
    await seedPinnedControls(page, [GAIN, MASTER]);
    await regionTabs(page, 'right').filter({ hasText: 'My Controls' }).click();
    await enterEditMode(page);

    const panel = page.locator('.custom-panel').first();
    // In edit mode every pinned tile gets the SAME drag surface the rest of the
    // workbench uses (round-18 shared machinery) — one per pinned widget.
    await expect(panel.locator('.axis-widget.param')).toHaveCount(2);
    await expect(panel.locator('.aw-widget-drag-surface')).toHaveCount(2);
  });

  test('a resting pinned control shows no drag affordance and no dashed slot look', async ({ page }) => {
    await bootCleanWorkbench(page);
    await seedPinnedControls(page, [GAIN]);
    await regionTabs(page, 'right').filter({ hasText: 'My Controls' }).click();
    await enterEditMode(page);

    const panel = page.locator('.custom-panel').first();
    await expect(panel.locator('.axis-widget.param')).toHaveCount(1);
    await expect(panel.locator('.aw-widget-drag-surface')).toHaveCount(1);

    // Leaving customize must return the control to a clean resting state: the tile
    // is still there, but there is NO drag surface and its border is SOLID (never
    // the dashed drag/drop-slot look), regardless of what block is selected.
    await exitEditMode(page);
    const tile = panel.locator('.axis-widget.param').first();
    await expect(tile).toBeVisible();
    await expect(panel.locator('.aw-widget-drag-surface')).toHaveCount(0);
    expect(await tile.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('solid');
  });

  test('the customize dashed outline wraps the full tile at every size', async ({ page }) => {
    await bootCleanWorkbench(page);
    await seedPinnedControls(page, [GAIN, LEVEL]);
    await regionTabs(page, 'right').filter({ hasText: 'My Controls' }).click();
    await enterEditMode(page);

    const panel = page.locator('.custom-panel').first();
    await expect(panel.locator('.axis-widget.param')).toHaveCount(2);
    await expect(panel.locator('.aw-widget-drag-surface')).toHaveCount(2);

    // The drag surface (which carries the dashed outline) must wrap the whole
    // rendered tile — pre-fix it was clamped to the 42px grid row and cut through
    // the ~92px tile. Measure each host's tile vs its surface.
    const wraps = await panel.locator('.aw-widget-host').evaluateAll((hosts) =>
      hosts.map((host) => {
        const tile = host.querySelector('.axis-widget.param');
        const surface = host.querySelector('.aw-widget-drag-surface');
        if (!tile || !surface) return null;
        const t = tile.getBoundingClientRect();
        const s = surface.getBoundingClientRect();
        return { th: t.height, tw: t.width, sh: s.height, sw: s.width };
      })
    );
    expect(wraps.length).toBe(2);
    for (const w of wraps) {
      expect(w).not.toBeNull();
      // Surface wraps the tile (>= tile box, minus a px of rounding). A tile is
      // ~92px tall — proof the outline is no longer clipped to the 42px row.
      expect(w!.th).toBeGreaterThan(60);
      expect(w!.sh).toBeGreaterThanOrEqual(w!.th - 2);
      expect(w!.sw).toBeGreaterThanOrEqual(w!.tw - 2);
    }
  });
});

// Sections divide the panel. A section is not a container — it is a full-row
// marker widget in the same zone, so the controls after it merely read as
// belonging to it. One widget type covers both affordances: labelled it is a
// titled rule, unlabelled a bare divider.
test.describe('My Controls sections', () => {
  async function openMyControls(page: import('@playwright/test').Page) {
    await regionTabs(page, 'right').filter({ hasText: 'My Controls' }).click();
    return page.locator('.custom-panel').first();
  }

  test('a section header spans the full grid row', async ({ page }) => {
    await bootCleanWorkbench(page);
    await seedMyControls(page, [{ section: 'Amp' }, GAIN, LEVEL]);
    const panel = await openMyControls(page);

    await expect(panel.locator('.axis-widget.section-header')).toHaveCount(1);
    await expect(panel.locator('.section-name')).toHaveText('Amp');

    // The header claims the whole row while a control takes one of two columns —
    // proof the `colSpan: 'full'` placement is being honoured, not just styled.
    const widths = await panel.locator('.aw-widget-grid-cell').evaluateAll((cells) =>
      cells.map((cell) => cell.getBoundingClientRect().width)
    );
    expect(widths.length).toBe(3);
    expect(widths[0]).toBeGreaterThan(widths[1] * 1.8);
  });

  test('an unlabelled header renders as a bare divider with no caption', async ({ page }) => {
    await bootCleanWorkbench(page);
    await seedMyControls(page, [GAIN, { section: '' }, LEVEL]);
    const panel = await openMyControls(page);

    const divider = panel.locator('.axis-widget.section-header.divider');
    await expect(divider).toHaveCount(1);
    await expect(divider.locator('.section-name')).toHaveCount(0);
    // Still nameable — that is how a divider becomes a section.
    await expect(divider.getByRole('button', { name: 'Name this divider' })).toBeVisible();
  });

  test('＋ Section drops straight into naming it, and the name survives a reload', async ({ page }) => {
    await bootCleanWorkbench(page);
    await seedPinnedControls(page, [GAIN]);
    const panel = await openMyControls(page);

    await panel.getByRole('button', { name: '＋ Section' }).click();
    // No extra click to enter rename mode — it's already there, draft pre-filled
    // with the default label and selected.
    const input = panel.locator('.section-input');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('Section');
    await input.fill('Drive');
    await input.press('Enter');
    await expect(panel.locator('.section-name')).toHaveText('Drive');

    await page.reload();
    await page.waitForSelector('.aw-root');
    const reloaded = await openMyControls(page);
    await expect(reloaded.locator('.section-name')).toHaveText('Drive');
  });

  test('＋ Divider adds an unlabelled marker', async ({ page }) => {
    await bootCleanWorkbench(page);
    await seedPinnedControls(page, [GAIN]);
    const panel = await openMyControls(page);

    await panel.getByRole('button', { name: '＋ Divider' }).click();
    await expect(panel.locator('.axis-widget.section-header.divider')).toHaveCount(1);
  });

  test('removing a named section removes its controls with it', async ({ page }) => {
    await bootCleanWorkbench(page);
    await seedMyControls(page, [{ section: 'Amp' }, GAIN, LEVEL]);
    const panel = await openMyControls(page);

    await panel.locator('.axis-widget.section-header').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Remove Widget' }).click();

    await expect(panel.locator('.axis-widget.section-header')).toHaveCount(0);
    await expect(panel.locator('.axis-widget.param')).toHaveCount(0);
  });

  test('removing a blank divider leaves its controls behind', async ({ page }) => {
    await bootCleanWorkbench(page);
    await seedMyControls(page, [{ section: '' }, GAIN, LEVEL]);
    const panel = await openMyControls(page);

    await panel.locator('.axis-widget.section-header').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Remove Widget' }).click();

    await expect(panel.locator('.axis-widget.section-header')).toHaveCount(0);
    await expect(panel.locator('.axis-widget.param')).toHaveCount(2);
  });
});
