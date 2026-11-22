import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  bootCleanWorkbench,
  collapseRail,
  editBar,
  editBarControl,
  enterEditMode,
  menuLabels,
  openMenu,
  regionTabs
} from './support/workbench';

/**
 * Slice 4 — the Add palette, click-to-place and the context "+" entries (4a),
 * then widget drags: the insert line, dwell grouping, "Group with ▸" and the
 * edit-mode top bar at 834 px (4b, the last describe blocks).
 */

const palette = (page: Page) => page.locator('[role="dialog"][aria-label="Add to the layout"]');
const card = (page: Page, key: string) => palette(page).locator(`[data-add-card="${key}"]`);
const cardButton = (page: Page, key: string) => card(page, key).locator('.ap-card');
const cardByTitle = (page: Page, kind: string, title: string) =>
  palette(page).locator(`[data-add-card][data-kind="${kind}"]`).filter({ has: page.locator('.ap-title', { hasText: new RegExp(`^${title}$`) }) });
const spots = (page: Page) => page.locator('[data-place-spot]');
const statusLine = (page: Page) => editBar(page).locator('.aw-eb-status');

async function openPalette(page: Page): Promise<void> {
  await editBarControl(page, 'add').click();
  await expect(palette(page)).toBeVisible();
}

async function rectOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('no box');
  return box;
}

/** Dispatch a synthetic pointer event at (x, y) on whatever is there (touch / pen gestures Playwright cannot drive). */
async function firePointer(
  page: Page,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  x: number,
  y: number,
  init: { pointerType?: string; pointerId?: number } = {}
): Promise<void> {
  await page.evaluate(
    ({ type, x, y, pointerType, pointerId }) => {
      const target = document.elementFromPoint(x, y) ?? document.body;
      target.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: x,
          clientY: y,
          pointerId,
          pointerType,
          isPrimary: true,
          button: type === 'pointermove' ? -1 : 0,
          buttons: type === 'pointerdown' || type === 'pointermove' ? 1 : 0
        })
      );
    },
    { type, x, y, pointerType: init.pointerType ?? 'touch', pointerId: init.pointerId ?? 11 }
  );
}

function noConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // Backend connection failures are expected offline (bootCleanWorkbench aborts /api).
    if (/\/api\/|Failed to load resource|ERR_FAILED|net::/.test(text)) return;
    errors.push(text);
  });
  return errors;
}

test.describe('Add palette', () => {
  test('Add opens the palette: real widget previews, panel and page cards, chips and search', async ({ page }) => {
    const errors = noConsoleErrors(page);
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await openPalette(page);

    // Chips + target chip + the shell's search.
    await expect(palette(page).locator('.cat')).toHaveText(['All', 'Panels', 'Pages', 'Widgets']);
    await expect(palette(page).locator('.target')).toHaveText('✛ Pick a card, then click a highlight');
    await expect(palette(page).locator('.ap-section')).toHaveText(['PANELS', 'PAGES', 'WIDGETS']);

    // Panels: status says where each panel is; "New custom panel" is a card.
    await expect(card(page, 'panel:instance:axis.signalGrid').locator('[data-status]')).toHaveText('On this page');
    await expect(card(page, 'panel:instance:axis.presetBrowser').locator('[data-status]')).toHaveText('On Preset Browser');
    await expect(card(page, 'panel:instance:axis.history').locator('[data-status]')).toHaveText('Not placed');
    await expect(cardByTitle(page, 'panel', 'New custom panel')).toHaveCount(1);
    await expect(card(page, 'panel:instance:axis.signalGrid').locator('[data-preview="panel"]')).toBeVisible();

    // Widgets: the REAL widget renders inert as the preview; side-effect types are static.
    await palette(page).locator('.cat', { hasText: 'Widgets' }).click();
    await expect(palette(page).locator('[data-add-card]:not([data-kind="widget"])')).toHaveCount(0);
    const preset = card(page, 'widget:builtin:axis.preset');
    await expect(preset.locator('[data-status]')).toHaveText('In Top left');
    await expect(preset.locator('[data-preview="live"] .axis-widget')).toBeVisible();
    await expect(preset.locator('[data-preview="live"]')).toHaveAttribute('inert', '');
    await expect(card(page, 'widget:builtin:axis.gridMap').locator('[data-status]')).toHaveText('Not placed');
    await expect(card(page, 'widget:builtin:axis.fcLayouts').locator('[data-preview="static"]')).toBeVisible();
    // Saved widget templates and hidden widgets are there too.
    await expect(card(page, 'widget:template:axis.library.widget.tools')).toHaveCount(1);
    await expect(card(page, 'widget:builtin:axis.search').locator('[data-status]')).toHaveText('Hidden');
    // Unsupported widgets (offline: no scenes, no telemetry) are greyed at the END with the reason.
    const widgetCards = palette(page).locator('[data-add-card][data-kind="widget"]');
    const total = await widgetCards.count();
    const last = widgetCards.nth(total - 1);
    await expect(last).toHaveClass(/off/);
    await expect(last.locator('.ap-card')).toBeDisabled();
    await expect(card(page, 'widget:builtin:axis.scenes')).toHaveClass(/off/);
    await expect(card(page, 'widget:builtin:axis.scenes').locator('[data-status]')).toHaveText('Needs a device with scenes');

    // Pages: Blank page with an empty mini-map; a note that every default page is there.
    await palette(page).locator('.cat', { hasText: 'Pages' }).click();
    await expect(card(page, 'page:blank').locator('[data-dock-thumbnail]')).toBeVisible();
    await expect(palette(page).locator('[data-page-note]')).toHaveText('All default pages are there');

    // Search narrows across kinds; the count follows.
    await palette(page).locator('.cat', { hasText: 'All' }).click();
    await palette(page).locator('input').fill('grid map');
    await expect(palette(page).locator('[data-add-card]')).toHaveCount(1);
    await expect(palette(page).locator('.count')).toHaveText('1 result');

    // Escape closes the palette (and nothing else) — from the search field, or a focused chip.
    await page.keyboard.press('Escape');
    await expect(palette(page)).toHaveCount(0);
    await expect(page.locator('.aw-root.aw-editing')).toHaveCount(1);
    await openPalette(page);
    await palette(page).locator('.cat', { hasText: 'Pages' }).click();
    await page.keyboard.press('Escape');
    await expect(palette(page)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('a deleted default page is a card with its mini-map; a click restores it', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    // Delete Setup via its nav context menu.
    await page.locator('[data-nav-entry="setup"]').click({ button: 'right' });
    await openMenu(page).getByRole('menuitem', { name: 'Delete Page' }).click();
    await openMenu(page).getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await expect(page.locator('[data-nav-entry="setup"]')).toHaveCount(0);
    await collapseRail(page);

    await openPalette(page);
    await palette(page).locator('.cat', { hasText: 'Pages' }).click();
    const setup = cardByTitle(page, 'page', 'Setup');
    await expect(setup.locator('[data-status]')).toHaveText('Missing default page');
    await expect(setup.locator('[data-dock-thumbnail]')).toContainText('Setup');
    await expect(cardByTitle(page, 'page', 'Restore default pages \\(1\\)')).toHaveCount(1);
    await setup.locator('.ap-card').click();
    await expect(palette(page)).toHaveCount(0);
    await expect(page.locator('[data-nav-entry="setup"]')).toHaveCount(1);
    await expect(page.locator('[data-nav-entry="setup"][data-nav-active="true"]')).toHaveCount(1);
  });

  test('Escape in the palette and while placing is consumed: the app Escape chain never sees it', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    // The app's Escape chain is a window listener (bubble phase): count what reaches it.
    await page.evaluate(() => {
      const w = window as unknown as { __escapes: number };
      w.__escapes = 0;
      window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') w.__escapes += 1;
      });
    });
    const escapes = () => page.evaluate(() => (window as unknown as { __escapes: number }).__escapes);
    // From the search field …
    await openPalette(page);
    await page.keyboard.press('Escape');
    await expect(palette(page)).toHaveCount(0);
    // … from a focused chip …
    await openPalette(page);
    await palette(page).locator('.cat', { hasText: 'Pages' }).click();
    await page.keyboard.press('Escape');
    await expect(palette(page)).toHaveCount(0);
    // … and while placing.
    await openPalette(page);
    await cardButton(page, 'panel:instance:axis.history').click();
    await expect(spots(page)).not.toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(spots(page)).toHaveCount(0);
    expect(await escapes()).toBe(0);
    await expect(page.locator('.aw-root.aw-editing')).toHaveCount(1);
    // Control: an Escape nobody consumes does reach the window.
    await page.keyboard.press('Escape');
    expect(await escapes()).toBe(1);
  });

  test('↑↓ follow the grid rows across the section headers and the page note', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await openPalette(page);
    await palette(page).locator('input').focus();
    const hi = palette(page).locator('.ap-cell.hi');
    const panelCount = await palette(page).locator('[data-add-card][data-kind="panel"]').count();
    // Default data: one page card (Blank page) under the PAGES header + note.
    await expect(palette(page).locator('[data-add-card][data-kind="page"]')).toHaveCount(1);
    const columns = await palette(page)
      .locator('[data-add-palette-grid]')
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length);
    expect(columns).toBeGreaterThan(1);
    // → walks the cards one by one (search empty) to the last panel card.
    for (let i = 0; i < panelCount - 1; i++) await page.keyboard.press('ArrowRight');
    await expect(hi).toHaveAttribute('data-card-index', String(panelCount - 1));
    // ↓ lands on the PAGES row right below (not `index + columns`, deep in the widgets) …
    await page.keyboard.press('ArrowDown');
    await expect(hi).toHaveAttribute('data-card-index', String(panelCount));
    await expect(hi).toHaveAttribute('data-kind', 'page');
    // … ↓ again on the first WIDGETS row, same column (the first card) …
    await page.keyboard.press('ArrowDown');
    await expect(hi).toHaveAttribute('data-card-index', String(panelCount + 1));
    await expect(hi).toHaveAttribute('data-kind', 'widget');
    // … and ↑↑ back up: the page, then the first card of the last panel row.
    await page.keyboard.press('ArrowUp');
    await expect(hi).toHaveAttribute('data-card-index', String(panelCount));
    await page.keyboard.press('ArrowUp');
    await expect(hi).toHaveAttribute('data-card-index', String(Math.floor((panelCount - 1) / columns) * columns));
  });

  test('touch: a vertical swipe on a card scrolls (the palette stays); a sideways pull drags it out', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await openPalette(page);
    await expect(cardButton(page, 'panel:instance:axis.history')).toHaveCSS('touch-action', 'pan-y');
    const box = await rectOf(cardButton(page, 'panel:instance:axis.history'));
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    // A vertical swipe: no drag (the browser scrolls the grid), the palette stays.
    await firePointer(page, 'pointerdown', x, y);
    await firePointer(page, 'pointermove', x + 2, y + 30);
    await firePointer(page, 'pointermove', x + 30, y + 40);
    await firePointer(page, 'pointerup', x + 30, y + 40);
    await expect(palette(page)).toBeVisible();
    await expect(page.locator('[data-dock-overlay]')).toHaveCount(0);
    // A sideways pull: the drag-out starts (the palette closes); a cancel drops nothing.
    await firePointer(page, 'pointerdown', x, y, { pointerId: 12 });
    await firePointer(page, 'pointermove', x + 40, y + 4, { pointerId: 12 });
    await expect(palette(page)).toHaveCount(0);
    await firePointer(page, 'pointercancel', x + 40, y + 4, { pointerId: 12 });
    await expect(page.locator('.aw-pane-tab', { hasText: 'History' })).toHaveCount(0);
  });

  test('template cards: ⋯ renames and deletes a saved widget template', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await openPalette(page);
    const tools = card(page, 'widget:template:axis.library.widget.tools');
    await tools.locator('.ap-dots').click();
    const menu = page.locator('.aw-context-menu[aria-label="Template actions"]');
    await expect(menu).toBeVisible();
    await menu.getByRole('menuitem', { name: 'Rename…' }).click();
    await menu.locator('input[data-menu-input]').fill('Tune and time');
    await page.keyboard.press('Enter');
    await expect(tools.locator('.ap-title')).toHaveText('Tune and time');

    await tools.locator('.ap-dots').click();
    await menu.getByRole('menuitem', { name: 'Delete template' }).click();
    await menu.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await expect(tools).toHaveCount(0);
    // The palette stays open for more.
    await expect(palette(page)).toBeVisible();
  });
});

test.describe('Click to place', () => {
  test('a click marks every spot, a click on a highlight places it there; one undo step', async ({ page }) => {
    const errors = noConsoleErrors(page);
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await openPalette(page);
    await cardButton(page, 'panel:instance:axis.history').click();

    // The palette closes; every valid spot lights up; the bar says what to do.
    await expect(palette(page)).toHaveCount(0);
    await expect(page.locator('[data-placement="panel"]')).toHaveCount(1);
    await expect(spots(page)).not.toHaveCount(0);
    await expect(page.locator('[data-place-spot="edge:left"]')).toHaveCount(1);
    await expect(statusLine(page)).toContainText('History');
    await expect(statusLine(page)).toContainText('Esc cancels');

    // Hovering previews the landing exactly like a drag; the status line says where it lands.
    const grid = await rectOf(page.locator('.aw-tabstack[data-region="main"]'));
    const at = { x: grid.x + grid.width - 40, y: grid.y + grid.height / 2 };
    await page.mouse.move(at.x, at.y);
    await expect(page.locator('[data-dock-landing="right"]')).toBeVisible();
    await expect(page.locator('[data-place-spot][data-active="true"]')).toHaveCount(1);
    await expect(statusLine(page)).toHaveText('History → Split right · Signal Grid · Click or Enter places · Esc cancels');

    await page.mouse.click(at.x, at.y);
    await expect(spots(page)).toHaveCount(0);
    await expect(page.locator('[data-dock-overlay]')).toHaveCount(0);
    // History is now split right of the Signal Grid, in the main region.
    await expect(page.locator('.aw-tabstack[data-region="main"] .aw-pane-tab', { hasText: 'History' })).toHaveCount(1);
    await expect(page.locator('.aw-tabstack[data-region="main"]')).toHaveCount(2);
    // Placing ended: the bar is back to its idle hint.
    await expect(statusLine(page)).not.toContainText('Click a highlight');

    await editBarControl(page, 'undo').click();
    await expect(page.locator('.aw-pane-tab', { hasText: 'History' })).toHaveCount(0);
    await expect(page.locator('.aw-tabstack[data-region="main"]')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('a double-click on a card starts placing once — its second press places nothing', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await openPalette(page);
    await cardButton(page, 'panel:instance:axis.history').dblclick();
    await expect(palette(page)).toHaveCount(0);
    await expect(spots(page)).not.toHaveCount(0);
    await expect(page.locator('.aw-pane-tab', { hasText: 'History' })).toHaveCount(0);
    await expect(page.locator('.aw-toast', { hasText: 'Placement cancelled' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(spots(page)).toHaveCount(0);
  });

  test('touch: a swipe while placing places nothing; a tap places', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await openPalette(page);
    await cardButton(page, 'panel:instance:axis.history').click();
    await expect(spots(page)).not.toHaveCount(0);
    const grid = await rectOf(page.locator('.aw-tabstack[data-region="main"]'));
    const at = { x: grid.x + grid.width - 40, y: grid.y + grid.height / 2 };
    await firePointer(page, 'pointerdown', at.x, at.y, { pointerId: 21 });
    await firePointer(page, 'pointermove', at.x, at.y - 40, { pointerId: 21 });
    await firePointer(page, 'pointerup', at.x, at.y - 40, { pointerId: 21 });
    // Still placing, nothing placed.
    await expect(spots(page)).not.toHaveCount(0);
    await expect(page.locator('.aw-pane-tab', { hasText: 'History' })).toHaveCount(0);
    // A tap (a little jitter is fine) places on release.
    await firePointer(page, 'pointerdown', at.x, at.y, { pointerId: 22 });
    await expect(spots(page)).not.toHaveCount(0);
    await firePointer(page, 'pointerup', at.x + 3, at.y + 2, { pointerId: 22 });
    await expect(spots(page)).toHaveCount(0);
    await expect(page.locator('.aw-tabstack[data-region="main"] .aw-pane-tab', { hasText: 'History' })).toHaveCount(1);
  });

  test('while placing, the bottom-bar Customize toggle still finishes editing', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await openPalette(page);
    await cardButton(page, 'panel:instance:axis.history').click();
    await expect(spots(page)).not.toHaveCount(0);
    await page.locator('.aw-bottom-customize').click();
    await expect(page.locator('.aw-root.aw-editing')).toHaveCount(0);
    await expect(spots(page)).toHaveCount(0);
    await expect(page.locator('.aw-pane-tab', { hasText: 'History' })).toHaveCount(0);
  });

  test('keyboard placing names the active spot in the status line; focus returns to the opener', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await openPalette(page);
    await palette(page).locator('.cat', { hasText: 'Panels' }).click();
    await cardButton(page, 'panel:instance:axis.history').focus();
    await page.keyboard.press('Enter');
    await expect(statusLine(page)).toHaveText('History → Add as tab · Signal Grid · Click or Enter places · Esc cancels');
    await page.keyboard.press('ArrowDown');
    await expect(statusLine(page)).toHaveText('History → Split bottom · Signal Grid · Click or Enter places · Esc cancels');
    await page.keyboard.press('Enter');
    await expect(spots(page)).toHaveCount(0);
    // Back on the edit bar's Add, ready for the next one.
    await expect(editBarControl(page, 'add')).toBeFocused();

    // Closing the palette opened by a zone "+" gives the focus back to that "+".
    const zoneAdd = page.locator('[data-zone="top.left"] .aw-zone-add');
    await zoneAdd.click();
    await expect(palette(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette(page)).toHaveCount(0);
    await expect(zoneAdd).toBeFocused();
  });

  test('Escape cancels the placement; nothing changes', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await openPalette(page);
    await cardButton(page, 'panel:instance:axis.history').click();
    await expect(spots(page)).not.toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(spots(page)).toHaveCount(0);
    await expect(page.locator('.aw-toast', { hasText: 'Placement cancelled' })).toBeVisible();
    await expect(page.locator('.aw-pane-tab', { hasText: 'History' })).toHaveCount(0);
    await expect(page.locator('.aw-tabstack[data-region="main"]')).toHaveCount(1);
    // Still editing (Escape did not leave Customize).
    await expect(page.locator('.aw-root.aw-editing')).toHaveCount(1);
  });

  test('keyboard: arrows pick a card, Enter chooses, Tab walks the highlights, arrows pick a zone, Enter places', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await openPalette(page);
    await palette(page).locator('.cat', { hasText: 'Panels' }).click();
    await palette(page).locator('input').focus();
    // Arrows walk the grid (← → by one card while the search is empty, ↓ by a row); Enter chooses.
    await expect(palette(page).locator('.ap-cell.hi .ap-title')).toHaveText('Signal Grid');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await expect(palette(page).locator('.ap-cell.hi')).toHaveCount(1);
    await expect(palette(page).locator('.ap-cell.hi .ap-title')).toHaveText('History');
    await page.keyboard.press('ArrowDown');
    await expect(palette(page).locator('.ap-cell.hi .ap-title')).not.toHaveText('History');
    await page.keyboard.press('ArrowUp');
    await expect(palette(page).locator('.ap-cell.hi .ap-title')).toHaveText('History');
    await page.keyboard.press('Enter');
    await expect(palette(page)).toHaveCount(0);
    // Keyboard pick: the first spot (the main stack) is active.
    await expect(page.locator('[data-place-spot="stack:axis.tabs.grid.main"][data-active="true"]')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-place-spot][data-active="true"]')).not.toHaveAttribute('data-place-spot', 'stack:axis.tabs.grid.main');
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('[data-place-spot="stack:axis.tabs.grid.main"][data-active="true"]')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-dock-landing="bottom"]')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(spots(page)).toHaveCount(0);
    // Split below the Signal Grid.
    await expect(page.locator('.aw-tabstack[data-region="main"]')).toHaveCount(2);
    await expect(page.locator('.aw-tabstack[data-region="main"] .aw-pane-tab', { hasText: 'History' })).toHaveCount(1);
  });

  test('widgets: a click marks the zones, a click places it; a placed built-in moves instead of duplicating', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await openPalette(page);
    await palette(page).locator('.cat', { hasText: 'Widgets' }).click();
    await cardButton(page, 'widget:builtin:axis.cpu').click();
    await expect(page.locator('[data-placement="widget"]')).toHaveCount(1);
    await expect(page.locator('[data-place-spot="zone:top.center"]')).toHaveCount(1);
    await expect(statusLine(page)).toContainText('CPU load');
    await expect(statusLine(page)).toContainText('Esc cancels');
    const center = await rectOf(page.locator('[data-zone="top.center"]'));
    await page.mouse.move(center.x + center.width / 2, center.y + center.height / 2);
    // Slice 4b: no slot box any more; the empty zone's "+ Widget" lights up instead.
    await expect(page.locator('[data-zone="top.center"] .aw-zone-empty.ins')).toHaveCount(1);
    await expect(page.locator('[data-drag-slot]')).toHaveCount(0);
    await page.mouse.click(center.x + center.width / 2, center.y + center.height / 2);
    await expect(page.locator('[data-zone="top.center"] [data-widget-host]')).toHaveCount(1);
    // Moved, not copied: the right zone lost its CPU, and there is still one (debounced persist: poll).
    await expect
      .poll(() =>
        page.evaluate(() => {
          const doc = JSON.parse(localStorage.getItem('axs.workbench.doc') ?? '{}');
          const layout = doc.layouts[doc.profiles[doc.activeProfileId].layoutId];
          return Object.values(layout.widgets as Record<string, { type: string; zone: string }>)
            .filter((w) => w.type === 'axis.cpu')
            .map((w) => w.zone);
        })
      )
      .toEqual(['top.center']);
  });

  test('pages: Blank page lands at the clicked navigation gap', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await openPalette(page);
    await palette(page).locator('.cat', { hasText: 'Pages' }).click();
    await cardButton(page, 'page:blank').click();
    await expect(page.locator('[data-placement="page"]')).toHaveCount(1);
    await expect(page.locator('[data-place-spot^="nav:"]')).not.toHaveCount(0);
    // Between Grid and Preset Browser.
    const grid = await rectOf(page.locator('[data-nav-entry="grid"]'));
    const library = await rectOf(page.locator('[data-nav-entry="library"]'));
    const y = (grid.y + grid.height + library.y) / 2;
    await page.mouse.move(grid.x + grid.width / 2, y);
    await expect(page.locator('[data-place-spot="nav:1"][data-active="true"]')).toHaveCount(1);
    await page.mouse.click(grid.x + grid.width / 2, y);
    await expect(spots(page)).toHaveCount(0);
    const entries = page.locator('[data-aw-nav] [data-nav-entry]');
    await expect(entries.nth(0)).toHaveAttribute('data-nav-entry', 'grid');
    await expect(entries.nth(1)).toHaveAttribute('data-nav-active', 'true');
    await expect(entries.nth(2)).toHaveAttribute('data-nav-entry', 'library');
  });
});

test.describe('Drag from the palette', () => {
  test('dragging a card closes the palette and drops like any drag', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await openPalette(page);
    const from = await rectOf(card(page, 'panel:instance:axis.history'));
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 30, from.y + from.height / 2 + 10, { steps: 3 });
    await expect(palette(page)).toHaveCount(0);
    const grid = await rectOf(page.locator('.aw-tabstack[data-region="main"]'));
    await page.mouse.move(grid.x + 40, grid.y + grid.height / 2, { steps: 6 });
    await expect(page.locator('[data-dock-landing="left"]')).toBeVisible();
    await page.mouse.up();
    await expect(page.locator('.aw-tabstack[data-region="main"]')).toHaveCount(2);
    await expect(page.locator('.aw-tabstack[data-region="main"]').first().locator('.aw-pane-tab')).toHaveText(['History']);
  });
});

test.describe('Context "+" entries', () => {
  test('the "+" tab adds a panel as a tab right there (no highlight step)', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await page.locator('.aw-tabstack[data-region="main"] [data-tab-add]').click();
    await expect(palette(page)).toBeVisible();
    await expect(palette(page).locator('.cat.on')).toHaveText('Panels');
    await expect(palette(page).locator('.target')).toHaveText('✛ New tab beside Signal Grid');
    await cardButton(page, 'panel:instance:axis.history').click();
    await expect(palette(page)).toHaveCount(0);
    await expect(spots(page)).toHaveCount(0);
    await expect(regionTabs(page, 'main')).toHaveText(['Signal Grid', 'History']);
  });

  test('a widget zone "+" inserts at its end; "+ Widget" fills an empty zone; templates copy', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    // The empty top centre zone shows "+ Widget" instead of its id.
    const empty = page.locator('[data-zone="top.center"] [data-zone-add]');
    await expect(empty).toHaveText('+ Widget');
    await empty.click();
    await expect(palette(page).locator('.cat.on')).toHaveText('Widgets');
    await expect(palette(page).locator('.target')).toHaveText('✛ Into Top center');
    await cardButton(page, 'widget:builtin:axis.gridMap').click();
    await expect(page.locator('[data-zone="top.center"] [data-widget-host]')).toHaveCount(1);

    // The compact "+" at the end of the left zone.
    const before = await page.locator('[data-zone="top.left"] [data-widget-host]').count();
    await page.locator('[data-zone="top.left"] .aw-zone-add').click();
    await expect(palette(page).locator('.target')).toHaveText('✛ End of Top left');
    await cardButton(page, 'widget:template:axis.library.widget.tools').click();
    await expect(page.locator('[data-zone="top.left"] [data-widget-host]')).toHaveCount(before + 2);
    // "End of Top left": the copies are the zone's LAST units, in template order.
    const leftTypes = () => page.locator('[data-zone="top.left"] [data-widget-host]').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.widgetType));
    expect((await leftTypes()).slice(-2)).toEqual(['axis.tuner', 'axis.tempo']);
    // A template again: another copy (never a move).
    await page.locator('[data-zone="top.left"] .aw-zone-add').click();
    await cardButton(page, 'widget:template:axis.library.widget.tools').click();
    await expect(page.locator('[data-zone="top.left"] [data-widget-host]')).toHaveCount(before + 4);
    expect((await leftTypes()).slice(-4)).toEqual(['axis.tuner', 'axis.tempo', 'axis.tuner', 'axis.tempo']);
  });

  test('"+ Panel" in an empty region strip moves a panel there; the nav "+" adds a page at the end', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await page.locator('[data-region-add="left"]').click();
    await expect(palette(page).locator('.target')).toHaveText('✛ Into the left region');
    await cardButton(page, 'panel:instance:axis.presetBrowser').click();
    await expect(regionTabs(page, 'left')).toHaveText(['Preset Browser']);

    const navCount = await page.locator('[data-aw-nav] [data-nav-entry]').count();
    await page.locator('[data-nav-add-page]').click();
    await expect(palette(page).locator('.cat.on')).toHaveText('Pages');
    await cardButton(page, 'page:blank').click();
    await expect(page.locator('[data-aw-nav] [data-nav-entry]')).toHaveCount(navCount + 1);
    await expect(spots(page)).toHaveCount(0);
  });

  test('panel menu "Split right" opens the palette on Panels and splits right there', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await page.locator('.aw-tabstack[data-region="main"] .aw-pane-btn[title="Panel actions"]').click();
    await openMenu(page).getByRole('menuitem', { name: 'Split right' }).click();
    await expect(palette(page)).toBeVisible();
    await expect(palette(page).locator('.target')).toHaveText('✛ Split right of Signal Grid');
    await cardByTitle(page, 'panel', 'New custom panel').locator('.ap-card').click();
    const stacks = page.locator('.aw-tabstack[data-region="main"]');
    await expect(stacks).toHaveCount(2);
    const left = await rectOf(stacks.nth(0));
    const right = await rectOf(stacks.nth(1));
    expect(right.x).toBeGreaterThan(left.x + left.width - 2);
    await expect(stacks.nth(1).locator('.aw-pane-tab')).toHaveText(['Custom Panel']);
  });
});

// ── Slice 4b: widget insert line, dwell grouping, "Group with ▸", 834 px ──

const DEFAULT_TOP_RIGHT = ['view', 'addBlock', 'tuner', 'tempo', 'cpu', 'meterToggle', 'save'];
const groupFrame = (page: Page) => page.locator('[data-group-frame]');
const insertLine = (page: Page) => page.locator('[data-insert-line]');
const widgetEl = (page: Page, kind: string) => page.locator(`[data-widget="axis.widget.${kind}"]`);
const zoneGroups = (page: Page, zone: string) => page.locator(`[data-zone="${zone}"] [data-widget-group]`);

/** A zone's units in order: loose widgets by kind, groups as `[a+b]`. */
async function unitOrder(page: Page, zone: string): Promise<string[]> {
  return page.locator(`[data-zone="${zone}"]`).evaluate((el) =>
    Array.from(el.children)
      .filter((child) => child.matches('[data-widget-host], [data-widget-group]'))
      .map((child) => {
        const kind = (id?: string) => (id ?? '').replace('axis.widget.', '');
        const host = child as HTMLElement;
        if (!host.dataset.widgetGroup) return kind(host.dataset.widget);
        const members = Array.from(host.querySelectorAll<HTMLElement>('[data-widget-host]')).map((m) => kind(m.dataset.widget));
        return `[${members.join('+')}]`;
      })
  );
}

/** Press on a widget and pull it past the drag threshold (it lifts out of the flow). */
async function startWidgetDrag(page: Page, kind: string): Promise<void> {
  const box = await rectOf(widgetEl(page, kind));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 4, { steps: 3 });
  await expect(widgetEl(page, kind)).toBeHidden();
}

/**
 * A SHORT release at (x, y): the move onto the point and the release are
 * dispatched in one task, so no dwell (350 ms) can arm in between however slow
 * the test's round trips are. The real button is released after (the drag has
 * already ended).
 */
async function shortReleaseAt(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(({ x, y }) => {
    const fire = (type: 'pointermove' | 'pointerup') =>
      (document.elementFromPoint(x, y) ?? document.body).dispatchEvent(
        new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: type === 'pointerup' ? 0 : -1, buttons: type === 'pointerup' ? 0 : 1 })
      );
    fire('pointermove');
    fire('pointerup');
  }, { x, y });
  await page.mouse.up();
}

/**
 * Drag a widget onto `target` (measured after the lift) at `fx` of its width:
 * `dwell` rests until the Group frame shows and releases; otherwise a short
 * release (`shortReleaseAt`) right on it.
 */
async function dragOnto(page: Page, kind: string, target: Locator, options: { dwell?: boolean; fx?: number } = {}): Promise<void> {
  await startWidgetDrag(page, kind);
  const box = await rectOf(target);
  const at = { x: box.x + box.width * (options.fx ?? 0.5), y: box.y + box.height / 2 };
  if (!options.dwell) {
    await shortReleaseAt(page, at.x, at.y);
    return;
  }
  await page.mouse.move(at.x, at.y, { steps: 4 });
  await expect(groupFrame(page)).toBeVisible();
  await page.mouse.up();
}

test.describe('Widget insert line', () => {
  test('dragging shows a thin insert line between the units, no slot box; a short release on a widget inserts beside it', async ({ page }) => {
    const errors = noConsoleErrors(page);
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    expect(await unitOrder(page, 'top.right')).toEqual(DEFAULT_TOP_RIGHT);

    await startWidgetDrag(page, 'tuner');
    // In the gap between Tempo and CPU load: a line there, nothing spliced into the flow.
    const tempo = await rectOf(widgetEl(page, 'tempo'));
    const cpu = await rectOf(widgetEl(page, 'cpu'));
    // The units moved apart while editing (room for the line).
    expect(cpu.x - (tempo.x + tempo.width)).toBeGreaterThanOrEqual(14);
    await page.mouse.move((tempo.x + tempo.width + cpu.x) / 2, cpu.y + cpu.height / 2, { steps: 4 });
    await expect(insertLine(page)).toBeVisible();
    const line = await rectOf(insertLine(page));
    expect(line.width).toBeLessThanOrEqual(4);
    expect(line.x).toBeGreaterThanOrEqual(tempo.x + tempo.width - 1);
    expect(line.x + line.width).toBeLessThanOrEqual(cpu.x + 1);
    expect(line.height).toBeGreaterThan(cpu.height);
    await expect(page.locator('[data-drag-slot]')).toHaveCount(0);
    expect((await rectOf(widgetEl(page, 'cpu'))).x).toBeCloseTo(cpu.x, 0);
    await expect(page.locator('[data-zone="top.right"].drop-target')).toHaveCount(1);
    await expect(page.locator('.aw-drag-target')).toHaveText('Insert · Top right');
    await expect(groupFrame(page)).toHaveCount(0);

    // A short release right in the middle of CPU load (the old instant "group"
    // band) inserts beside it — by its midpoint — and never groups.
    await shortReleaseAt(page, cpu.x + cpu.width / 2 + 4, cpu.y + cpu.height / 2);
    await expect(insertLine(page)).toHaveCount(0);
    await expect(zoneGroups(page, 'top.right')).toHaveCount(0);
    expect(await unitOrder(page, 'top.right')).toEqual(['view', 'addBlock', 'tempo', 'cpu', 'tuner', 'meterToggle', 'save']);
    expect(errors).toEqual([]);
  });

  test('a short release on a group inserts beside it, never into it', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await dragOnto(page, 'tuner', widgetEl(page, 'cpu'), { dwell: true });
    expect(await unitOrder(page, 'top.right')).toEqual(['view', 'addBlock', 'tempo', '[cpu+tuner]', 'meterToggle', 'save']);
    await dragOnto(page, 'view', zoneGroups(page, 'top.right'), { fx: 0.6 });
    expect(await unitOrder(page, 'top.right')).toEqual(['addBlock', 'tempo', '[cpu+tuner]', 'view', 'meterToggle', 'save']);
  });
});

test.describe('Dwell to group', () => {
  test('resting 350 ms on a foreign widget shows the Group frame; a release groups them in one undo step', async ({ page }) => {
    const errors = noConsoleErrors(page);
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await startWidgetDrag(page, 'tuner');
    const cpu = await rectOf(widgetEl(page, 'cpu'));
    await page.mouse.move(cpu.x + cpu.width / 2, cpu.y + cpu.height / 2, { steps: 4 });
    // Holding still: the frame arms after the dwell, without another pointer move.
    await expect(groupFrame(page)).toBeVisible();
    await expect(groupFrame(page)).toHaveText('Group');
    await expect(insertLine(page)).toHaveCount(0);
    await expect(page.locator('.aw-drag-target')).toHaveText('Group with CPU load');
    const frame = await rectOf(groupFrame(page));
    expect(frame.x).toBeLessThan(cpu.x);
    expect(frame.x + frame.width).toBeGreaterThan(cpu.x + cpu.width);
    expect(frame.y).toBeLessThan(cpu.y);

    await page.mouse.up();
    await expect(groupFrame(page)).toHaveCount(0);
    await expect(zoneGroups(page, 'top.right')).toHaveCount(1);
    expect(await unitOrder(page, 'top.right')).toEqual(['view', 'addBlock', 'tempo', '[cpu+tuner]', 'meterToggle', 'save']);

    await editBarControl(page, 'undo').click();
    await expect(zoneGroups(page, 'top.right')).toHaveCount(0);
    expect(await unitOrder(page, 'top.right')).toEqual(DEFAULT_TOP_RIGHT);
    expect(errors).toEqual([]);
  });

  test('resting on a group adds the widget to it', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await dragOnto(page, 'tuner', widgetEl(page, 'cpu'), { dwell: true });
    await startWidgetDrag(page, 'tempo');
    const group = await rectOf(zoneGroups(page, 'top.right'));
    await page.mouse.move(group.x + group.width / 2, group.y + group.height / 2, { steps: 4 });
    await expect(groupFrame(page)).toBeVisible();
    await expect(page.locator('.aw-drag-target')).toHaveText('Group with CPU load + Tuner');
    await page.mouse.up();
    expect(await unitOrder(page, 'top.right')).toEqual(['view', 'addBlock', '[cpu+tuner+tempo]', 'meterToggle', 'save']);
  });

  test('inside its own group a member reorders directly (no dwell, no Group frame)', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await dragOnto(page, 'tuner', widgetEl(page, 'cpu'), { dwell: true });
    await startWidgetDrag(page, 'tuner');
    const cpu = await rectOf(widgetEl(page, 'cpu'));
    await page.mouse.move(cpu.x + cpu.width * 0.2, cpu.y + cpu.height / 2, { steps: 4 });
    await expect(page.locator('[data-widget-group].insert-target')).toHaveCount(1);
    await expect(insertLine(page)).toBeVisible();
    await expect(page.locator('.aw-drag-target')).toHaveText('Reorder in group');
    const line = await rectOf(insertLine(page));
    expect(line.x + line.width).toBeLessThanOrEqual(cpu.x + 1);
    // Resting changes nothing: the own group is never a dwell target.
    await page.waitForTimeout(600);
    await expect(groupFrame(page)).toHaveCount(0);
    await page.mouse.up();
    expect(await unitOrder(page, 'top.right')).toEqual(['view', 'addBlock', 'tempo', '[tuner+cpu]', 'meterToggle', 'save']);
  });
});

test.describe('Group with ▸', () => {
  test('the widget menu lists the zone’s neighbours; picking one groups them; the group menu merges', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await widgetEl(page, 'tempo').click();
    const menu = openMenu(page);
    await expect(menu).toHaveAttribute('aria-label', 'Widget actions');
    await menu.getByRole('menuitem', { name: /Group with/ }).click();
    expect(await menuLabels(page)).toEqual(['Back', 'View', 'Add block', 'Tuner', 'CPU load', 'Block meters', 'Save']);
    await menu.getByRole('menuitem', { name: 'CPU load' }).click();
    await expect(menu).toHaveCount(0);
    // On-screen order kept, the group sits where Tempo sat.
    expect(await unitOrder(page, 'top.right')).toEqual(['view', 'addBlock', 'tuner', '[tempo+cpu]', 'meterToggle', 'save']);

    // The group menu has it too: a loose neighbour merges with the whole group.
    await zoneGroups(page, 'top.right').locator('.aw-group-grip').click();
    await expect(menu).toHaveAttribute('aria-label', 'Widget group actions');
    await menu.getByRole('menuitem', { name: /Group with/ }).click();
    expect(await menuLabels(page)).toEqual(['Back', 'View', 'Add block', 'Tuner', 'Block meters', 'Save']);
    await menu.getByRole('menuitem', { name: 'Save' }).click();
    expect(await unitOrder(page, 'top.right')).toEqual(['view', 'addBlock', 'tuner', '[tempo+cpu+save]', 'meterToggle']);

    // A lone widget has nobody to group with.
    await widgetEl(page, 'preset').click();
    await menu.getByRole('menuitem', { name: /Group with/ }).click();
    expect(await menuLabels(page)).toEqual(['Back', 'No other widget in this zone']);
  });
});

test.describe('Top bar at 834 px (AXIS-66)', () => {
  /** The edit-mode top bar: its box, and each zone with its children's boxes. */
  async function topBarGeometry(page: Page) {
    return page.locator('.aw-topbar').evaluate((bar) => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height };
      };
      return {
        bar: box(bar),
        zones: Array.from(bar.querySelectorAll<HTMLElement>(':scope > [data-zone]')).map((zone) => ({
          zone: zone.dataset.zone,
          ...box(zone),
          clientWidth: zone.clientWidth,
          scrollWidth: zone.scrollWidth,
          children: Array.from(zone.children).map(box)
        }))
      };
    });
  }

  test('editing keeps the top bar one row: the zones collapse instead of wrapping or spilling', async ({ page }) => {
    await page.setViewportSize({ width: 834, height: 1112 });
    await bootCleanWorkbench(page);
    await collapseRail(page).catch(() => {});
    const viewBar = await rectOf(page.locator('.aw-topbar'));
    await enterEditMode(page);
    for (const pin of [null, 'Desktop'] as const) {
      if (pin) {
        // The desktop layout's full top bar in an 834 px window.
        await editBarControl(page, 'profile').getByRole('button', { name: pin }).click();
        await expect(page.locator('[data-zone="top.right"] [data-widget-host]')).toHaveCount(7);
      }
      const geo = await topBarGeometry(page);
      expect(geo.bar.height).toBeCloseTo(viewBar.height, 0);
      expect(geo.zones.map((z) => z.zone)).toEqual(['top.left', 'top.center', 'top.right']);
      for (const [i, zone] of geo.zones.entries()) {
        // Nothing clipped or scrolled away, nothing outside its zone or below the row.
        expect(zone.scrollWidth, `${zone.zone} fits`).toBeLessThanOrEqual(zone.clientWidth + 1);
        if (i > 0) expect(zone.left).toBeGreaterThanOrEqual(geo.zones[i - 1].right - 0.5);
        for (const child of zone.children) {
          expect(child.left).toBeGreaterThanOrEqual(zone.left - 0.5);
          expect(child.right).toBeLessThanOrEqual(zone.right + 0.5);
          expect(child.top).toBeGreaterThanOrEqual(geo.bar.top - 0.5);
          expect(child.bottom).toBeLessThanOrEqual(geo.bar.bottom + 0.5);
        }
      }
      // The empty centre's "+ Widget" stays on one line.
      const emptyAdd = page.locator('[data-zone="top.center"] .aw-zone-add-empty');
      await expect(emptyAdd).toBeVisible();
      expect((await rectOf(emptyAdd)).height).toBeLessThanOrEqual(32);
    }
    // To make room the desktop units stepped down from their default size.
    await expect(widgetEl(page, 'view')).not.toHaveAttribute('data-size', 'default');
    await expect(widgetEl(page, 'preset')).not.toHaveAttribute('data-size', 'default');
  });
});
