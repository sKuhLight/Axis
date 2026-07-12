import { test, expect, type Page } from '@playwright/test';
import { bootCleanWorkbench, enterEditMode, exitEditMode, regionTabs } from './support/workbench';

// ROUND 19 (AXIS-30): dragging parameter controls out of the Block Editor must
// COLLECT them into one panel (no tab-per-param), render as recognizable,
// block-coloured, named tiles, and arrange with the shared widget machinery.

const PARAM_MIME = 'application/x-workbench-parameter-source+json';

/** A serialized WorkbenchParameterSource, as ControlSurface emits on drag. */
function paramSourcePayload(opts: {
  effectId: number;
  paramId: number;
  block: string;
  label: string;
  color: string;
}): string {
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

/** Fire the HTML5 parameter drop onto a target, exactly as a control drag ends. */
async function dropParamOnto(page: Page, selector: string, payload: string): Promise<void> {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await page.evaluate(
    ({ dt, mime, data }) => dt.setData(mime, data),
    { dt: dataTransfer, mime: PARAM_MIME, data: payload }
  );
  await page.dispatchEvent(selector, 'dragover', { dataTransfer });
  await page.dispatchEvent(selector, 'drop', { dataTransfer });
}

test.describe('Parameter collect + tile (AXIS-30)', () => {
  test('dropping params onto a panel collects them as named, block-coloured tiles — no tab-per-param', async ({
    page
  }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);

    // Insert one custom panel to collect into.
    await page.getByRole('button', { name: /＋ Panel/ }).click();
    const customTabs = regionTabs(page, 'main').filter({ hasText: 'Custom Panel' });
    await expect(customTabs).toHaveCount(1);

    const panel = page.locator('.custom-panel').first();
    await expect(panel).toBeVisible();

    // Drop two parameters from DIFFERENT blocks into the same panel.
    await dropParamOnto(page, '.custom-panel', paramSourcePayload({ effectId: 100, paramId: 0, block: 'Amp 1', label: 'Gain', color: '#d98a2b' }));
    await dropParamOnto(page, '.custom-panel', paramSourcePayload({ effectId: 200, paramId: 1, block: 'Drive 1', label: 'Level', color: '#d6543f' }));

    // Both controls land in the ONE panel; no extra tab was spawned per param.
    const tiles = panel.locator('.axis-widget.param');
    await expect(tiles).toHaveCount(2);
    await expect(customTabs).toHaveCount(1);

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

  test('collected tiles arrange with the shared widget drag machinery', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await page.getByRole('button', { name: /＋ Panel/ }).click();

    await dropParamOnto(page, '.custom-panel', paramSourcePayload({ effectId: 100, paramId: 0, block: 'Amp 1', label: 'Gain', color: '#d98a2b' }));
    await dropParamOnto(page, '.custom-panel', paramSourcePayload({ effectId: 100, paramId: 1, block: 'Amp 1', label: 'Master', color: '#d98a2b' }));

    const panel = page.locator('.custom-panel').first();
    // In edit mode every collected tile gets the SAME drag surface the rest of the
    // workbench uses (round-18 shared machinery) — one per collected widget.
    await expect(panel.locator('.axis-widget.param')).toHaveCount(2);
    await expect(panel.locator('.aw-widget-drag-surface')).toHaveCount(2);
  });
});

// ROUND 20 (AXIS-31): state bugs on the collect feature.
test.describe('Parameter collect state (AXIS-31)', () => {
  test('bug #2 — the edge-drop overlay clears when a drag ends over a panel', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await page.getByRole('button', { name: /＋ Panel/ }).click();
    await expect(page.locator('.custom-panel')).toBeVisible();

    const payload = paramSourcePayload({ effectId: 100, paramId: 0, block: 'Amp 1', label: 'Gain', color: '#d98a2b' });
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    await page.evaluate(({ dt, mime, data }) => dt.setData(mime, data), { dt: dataTransfer, mime: PARAM_MIME, data: payload });

    // Dragging over the workspace edge raises the "Dock left" region overlay.
    await page.dispatchEvent('.aw-workspace', 'dragover', { dataTransfer });
    await expect(page.locator('.aw-edge-drop-preview')).toHaveCount(1);

    // The drop lands on the panel, which stopPropagation()s it — so the workspace
    // never sees the drop that would have cleared its own overlay. Pre-fix, the
    // overlay stuck until reload.
    await page.dispatchEvent('.custom-panel', 'drop', { dataTransfer });
    await expect(page.locator('.aw-edge-drop-preview')).toHaveCount(1);

    // `dragend` fires on the drag source and bubbles to the window — the reliable
    // cleanup point. After it, no overlay lingers.
    await page.evaluate(() => window.dispatchEvent(new DragEvent('dragend', { bubbles: true })));
    await expect(page.locator('.aw-edge-drop-preview')).toHaveCount(0);
  });

  test('bug #3 — a resting pinned control shows no drag affordance and no dashed slot look', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await page.getByRole('button', { name: /＋ Panel/ }).click();
    await dropParamOnto(page, '.custom-panel', paramSourcePayload({ effectId: 100, paramId: 0, block: 'Amp 1', label: 'Gain', color: '#d98a2b' }));

    const panel = page.locator('.custom-panel').first();
    await expect(panel.locator('.axis-widget.param')).toHaveCount(1);
    // In edit mode the tile has the drag surface (expected).
    await expect(panel.locator('.aw-widget-drag-surface')).toHaveCount(1);

    // Leaving customize must return the control to a clean resting state: the tile
    // is still there, but there is NO drag surface and its border is SOLID (never
    // the dashed drag/drop-slot look), regardless of what block is selected.
    await exitEditMode(page);
    const tile = panel.locator('.axis-widget.param').first();
    await expect(tile).toBeVisible();
    await expect(panel.locator('.aw-widget-drag-surface')).toHaveCount(0);
    const borderStyle = await tile.evaluate((el) => getComputedStyle(el).borderTopStyle);
    expect(borderStyle).toBe('solid');
  });
});
