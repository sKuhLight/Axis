import { test, expect, type Page } from '@playwright/test';
import { arrangeAdd, boardSaves, bootBlockEditorMock, countBoardSaves, openAmpEditor, pickMore } from './support/blockEditorMock';
import { addCustomPanel, enterEditMode, exitEditMode, regionTabs, WORKBENCH_DOC_KEY } from './support/workbench';

// Block Editor rework: everything done to ONE control outside Arrange (slice 4, AXIS-77) with real pointer
// input (spec 15 covers the workbench side with synthetic drops) — the hover actions ⚡ (click = pin to the
// default target, press-drag = pin drag at once) and ∿ (modifier flyout, or the docked modifier panel),
// the 380 ms hold-to-drag on the tile body, the long-press on touch / pen, and the control menu
// (right-click / Shift+F10): Pin to ▸, Edit modifier…, View ▸, Size ▸, Move to page ▸, Grid swipe control,
// Remove from page. Fully mocked backend, no device.

const tile = (page: Page, key: string) => page.locator(`[data-be-key="${key}"]`).first();
const onPage = (page: Page, pg: string, key: string) => page.locator(`section[data-be-page="${pg}"] [data-be-key="${key}"]`);
const ctxMenu = (page: Page) => page.getByRole('menu', { name: /^Control options/ });
const chip = (page: Page) => page.locator('.be-pinchip');
const flyout = (page: Page) => page.locator('[data-screen-label="Modifier Editor"].flyout');

async function withCustomPanel(page: Page) {
  const mock = await bootBlockEditorMock(page);
  await openAmpEditor(page);
  await enterEditMode(page);
  await addCustomPanel(page);
  await exitEditMode(page);
  const panel = page.locator('.custom-panel').first();
  await expect(panel).toBeVisible();
  await expect(panel.locator('.axis-widget.param')).toHaveCount(0);
  return { mock, panel };
}

/** Right-click a control and return its menu. */
async function openCtx(page: Page, key: string) {
  await tile(page, key).click({ button: 'right' });
  const menu = ctxMenu(page);
  await expect(menu).toBeVisible();
  return menu;
}

/** Open a control's menu, drill into a submenu row (`be-ci-<id>`) and pick the child row with this text. */
async function pickCtx(page: Page, key: string, submenu: string, text: string | RegExp) {
  const menu = await openCtx(page, key);
  await menu.locator(`.be-ci-${submenu}`).click();
  const row = menu.locator('[role="menuitem"], [role="menuitemradio"]').filter({ hasText: text }).first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(menu).toHaveCount(0);
}

/** Reload and reopen the amp's editor (the board comes back from storage). */
async function reloadEditor(page: Page) {
  await page.reload();
  await expect(page.locator('[data-idx="0,0"].cell.block')).toBeVisible();
  await openAmpEditor(page);
}

/** A synthetic pointer event of another pointer type (Playwright's mouse is always 'mouse'), sent to the
 *  element under (x, y) like the browser would. */
async function synth(page: Page, type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number, pointerType: 'touch' | 'pen') {
  await page.evaluate(
    ({ type, x, y, pointerType }) => {
      const el = document.elementFromPoint(x, y) ?? document.body;
      el.dispatchEvent(
        new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y, pointerId: 7, pointerType, isPrimary: true, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1 })
      );
    },
    { type, x, y, pointerType }
  );
}

/** Dock the Block Editor's modifier part on the right: seeded into the stored workbench document at the
 *  next load, before the app reads it (no pending write of the page before can overwrite the seed). */
async function dockModifierPanel(page: Page) {
  await expect.poll(() => page.evaluate((key) => !!JSON.parse(localStorage.getItem(key) ?? 'null')?.layouts, WORKBENCH_DOC_KEY)).toBe(true);
  await page.addInitScript((key) => {
    if (sessionStorage.getItem('e2e.modifierSeeded')) return;
    sessionStorage.setItem('e2e.modifierSeeded', '1');
    const doc = JSON.parse(localStorage.getItem(key)!);
    const layout = doc.layouts[doc.profiles[doc.activeProfileId].layoutId];
    layout.panels['e2e.modifier'] = { id: 'e2e.modifier', type: 'axis.blockEditor.modifier', title: 'Modifier', closable: true, state: { part: 'modifier' } };
    const dock = layout.pages[layout.activePageId].dock;
    const stack = { kind: 'tabs', id: 'e2e.modifier.stack', panelIds: ['e2e.modifier'], activePanelId: 'e2e.modifier' };
    const right = dock.root.right;
    if (!right) dock.root.right = stack;
    else if (right.kind === 'tabs') {
      right.panelIds.push('e2e.modifier');
      right.activePanelId = 'e2e.modifier';
    } else right.children.push(stack);
    dock.regions.right = { ...(dock.regions.right ?? {}), collapsed: false };
    localStorage.setItem(key, JSON.stringify(doc));
  }, WORKBENCH_DOC_KEY);
  await page.reload();
  await page.waitForSelector('.aw-root');
  await openAmpEditor(page);
}

/** Share (0..1) of a page section that is inside the board's scroll area. */
async function shareInView(page: Page, pg: string) {
  const b = (await page.locator('[data-be-board]').boundingBox())!;
  const s = (await page.locator(`section[data-be-page="${pg}"]`).boundingBox())!;
  const w = Math.max(0, Math.min(b.x + b.width, s.x + s.width) - Math.max(b.x, s.x));
  const h = Math.max(0, Math.min(b.y + b.height, s.y + s.height) - Math.max(b.y, s.y));
  return (w * h) / (s.width * s.height);
}

test.describe('Block Editor pin (real pointer)', () => {
  test('a held knob dragged onto a custom panel is collected there', async ({ page }) => {
    const { mock, panel } = await withCustomPanel(page);
    const dial = page.locator('[data-be-key="k1"] .be-dial').first();
    const d = (await dial.boundingBox())!;
    const p = (await panel.boundingBox())!;
    await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(550); // past the 380 ms hold, without moving
    await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2, { steps: 10 });
    await expect(chip(page)).toContainText('Bass');
    await page.mouse.up();
    await expect(chip(page)).toHaveCount(0);

    await expect(panel.locator('.axis-widget.param')).toHaveCount(1);
    await expect(panel.getByText('Bass', { exact: true })).toBeVisible();
    // the hold never became a value change
    await page.waitForTimeout(200);
    expect(mock.writes.filter((w) => w.pid === 1)).toEqual([]);
  });

  test('⚡ appears on hover; a click pins the control to the default target (a new custom panel)', async ({ page }) => {
    const mock = await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await expect(page.locator('.custom-panel')).toHaveCount(0);
    const bass = tile(page, 'k1');
    const pin = bass.locator('[data-be-pin]');
    await expect(pin).toHaveCSS('opacity', '0');
    // invisible, it takes no press (a touch in the tile's corner never pins by accident)
    await expect(pin).toHaveCSS('pointer-events', 'none');
    await bass.hover();
    await expect(pin).toHaveCSS('opacity', '1');
    await expect(pin).toHaveCSS('pointer-events', 'auto');
    await expect(bass.locator('[data-be-mod]')).toHaveCSS('opacity', '1');
    // ⚡ only where a control can be pinned: not on the meter or the bypass action
    await expect(page.locator('[data-be-key="bypass"] [data-be-pin]')).toHaveCount(0);

    await pin.click();
    await expect(page.locator('.toast')).toContainText('Pinned Bass');
    const created = page.locator('.custom-panel');
    await expect(created).toHaveCount(1);
    await expect(created.locator('.axis-widget.param').filter({ hasText: 'Bass' })).toHaveCount(1);
    await page.waitForTimeout(200);
    expect(mock.writes.filter((w) => w.pid === 1)).toEqual([]);
  });

  test('one-row tiles have no hover actions: a 2×1 button toggles where ⚡ would sit, nothing is pinned', async ({ page }) => {
    const mock = await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await pickCtx(page, 'e10', 'view', 'Button');
    await expect(tile(page, 'e10')).toHaveAttribute('data-be-view', 'button');
    await pickCtx(page, 'e10', 'size', /Small/);
    const bright = tile(page, 'e10');
    await expect(bright).toHaveAttribute('data-be-h', '1');
    await bright.hover();
    await expect(bright.locator('[data-be-pin], [data-be-mod]')).toHaveCount(0);
    // a click in the pill's top-left corner (where ⚡ sat) toggles it
    const b = (await bright.locator('.be-pill').boundingBox())!;
    await page.mouse.click(b.x + 6, b.y + 6);
    await expect.poll(() => mock.writes.filter((w) => w.pid === 10).length).toBe(1);
    await expect(page.locator('.custom-panel')).toHaveCount(0);
    // the one-row slider neither (⚡ / ∿ would cover its label and value button)
    await page.locator('[data-be-tab="Preamp"]').click();
    const depth = onPage(page, 'Preamp', 'k9');
    await expect(depth).toHaveAttribute('data-be-h', '1');
    await depth.hover();
    await expect(depth.locator('[data-be-pin], [data-be-mod]')).toHaveCount(0);
    // a knob keeps them
    await tile(page, 'k7').hover();
    await expect(tile(page, 'k7').locator('[data-be-pin]')).toHaveCSS('opacity', '1');
  });

  test('⚡ press-drag onto a custom panel collects the control — no hold needed', async ({ page }) => {
    const { mock, panel } = await withCustomPanel(page);
    const bass = tile(page, 'k1');
    await bass.hover();
    const b = (await bass.locator('[data-be-pin]').boundingBox())!;
    const p = (await panel.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 12, b.y + b.height / 2 + 12, { steps: 2 });
    // the drag is up right away — far less than the 380 ms hold of the tile body
    expect(await chip(page).count()).toBe(1);
    await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2, { steps: 8 });
    await expect(chip(page)).toContainText('Add to panel');
    await page.mouse.up();
    await expect(chip(page)).toHaveCount(0);
    await expect(panel.locator('.axis-widget.param')).toHaveCount(1);
    await expect(panel.getByText('Bass', { exact: true })).toBeVisible();
    // the release after the drag pinned nothing else (no second panel from a click) and wrote no value
    await expect(page.locator('.custom-panel')).toHaveCount(1);
    expect(mock.writes.filter((w) => w.pid === 1)).toEqual([]);
  });

  test('the control menu: Pin to ▸ tells the panels apart, lists "New tab" and "New custom panel"; a panel pick pins there', async ({ page }) => {
    const { panel } = await withCustomPanel(page);
    let menu = await openCtx(page, 'k2');
    await expect(menu.locator('.be-ci-head')).toHaveText('Mid · Authentic');
    await menu.locator('.be-ci-pin').click();
    await expect(page.getByRole('menu', { name: 'Control options · Pin to' })).toBeVisible();
    const items = menu.getByRole('menuitem');
    await expect(items.filter({ hasText: 'New custom panel' })).toHaveCount(1);
    await expect(items.filter({ hasText: 'New tab beside the editor' })).toHaveCount(1);
    // two panels share the name "Custom Panel": the default layout's own one (on no page) and the one just
    // added to this workbench page — each row says where its panel is (this page: the dock region)
    const rows = menu.locator('.be-ci-pin-panel');
    await expect(rows).toHaveText([/^\s*Custom Panel\s*0 · not on a page\s*$/, /^\s*Custom Panel\s*0 · (main|top|bottom|left|right)\s*$/]);
    const here = rows.filter({ hasNotText: 'not on a page' });
    await here.click();
    await expect(menu).toHaveCount(0);
    await expect(page.locator('.toast')).toContainText('Pinned Mid to Custom Panel');
    // the picked panel got the control
    await expect(panel.locator('.axis-widget.param')).toHaveCount(1);
    await expect(panel.getByText('Mid', { exact: true })).toBeVisible();
    // its count went up; Escape walks back out of the submenu, then closes
    menu = await openCtx(page, 'k2');
    await menu.locator('.be-ci-pin').click();
    await expect(menu.locator('.be-ci-pin-panel').filter({ hasNotText: 'not on a page' })).toHaveText(/^\s*Custom Panel\s*1 · /);
    await page.keyboard.press('Escape');
    await expect(menu.locator('.be-ci-pin')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });

  test('the control menu: Pin to ▸ New tab puts the control in a new tab beside the editor', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    const stack = page.locator('.aw-tabstack').filter({ has: page.locator('[data-be-board]') });
    const region = await stack.first().getAttribute('data-region');
    const tabs = regionTabs(page, region ?? 'bottom');
    const before = await tabs.count();
    await pickCtx(page, 'k3', 'pin', 'New tab beside the editor');
    await expect(page.locator('.toast')).toContainText('Pinned Treble to a new tab');
    // a new "Controls" tab in the editor's stack, right after the Block Editor, holding the control
    await expect(tabs).toHaveCount(before + 1);
    const names = (await tabs.allTextContents()).map((t) => t.trim());
    expect(names[names.indexOf('Block Editor') + 1]).toBe('Controls');
    await expect(page.locator('.custom-panel .axis-widget.param').filter({ hasText: 'Treble' })).toHaveCount(1);
  });
});

test.describe('Block Editor long-press (touch / pen)', () => {
  test('touch: a still hold on a knob opens the control menu', async ({ page }) => {
    const mock = await bootBlockEditorMock(page);
    await openAmpEditor(page);
    const d = (await page.locator('[data-be-key="k1"] .be-dial').first().boundingBox())!;
    const x = d.x + d.width / 2;
    const y = d.y + d.height / 2;
    await synth(page, 'pointerdown', x, y, 'touch');
    await expect(ctxMenu(page)).toBeVisible(); // after the 500 ms hold
    await expect(ctxMenu(page).locator('.be-ci-head')).toHaveText('Bass · Authentic');
    await synth(page, 'pointerup', x, y, 'touch');
    await expect(ctxMenu(page)).toBeVisible();
    expect(mock.writes.filter((w) => w.pid === 1)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(ctxMenu(page)).toHaveCount(0);
  });

  test('pen: the 380 ms hold-drag reaches a custom panel; the long-press never interrupts it', async ({ page }) => {
    const { panel } = await withCustomPanel(page);
    const d = (await page.locator('[data-be-key="k1"] .be-dial').first().boundingBox())!;
    const p = (await panel.boundingBox())!;
    const x = d.x + d.width / 2;
    const y = d.y + d.height / 2;
    await synth(page, 'pointerdown', x, y, 'pen');
    await expect(chip(page)).toHaveCount(1); // the hold-drag is up (380 ms)
    for (let i = 1; i <= 4; i++) await synth(page, 'pointermove', x + ((p.x + p.width / 2 - x) * i) / 4, y + ((p.y + p.height / 2 - y) * i) / 4, 'pen');
    await expect(chip(page)).toContainText('Add to panel');
    await page.waitForTimeout(500); // well past the 500 ms long-press of the tile
    await expect(ctxMenu(page)).toHaveCount(0);
    await expect(chip(page)).toContainText('Add to panel');
    await synth(page, 'pointerup', p.x + p.width / 2, p.y + p.height / 2, 'pen');
    await expect(chip(page)).toHaveCount(0);
    await expect(panel.locator('.axis-widget.param')).toHaveCount(1);
    await expect(panel.getByText('Bass', { exact: true })).toBeVisible();
  });

  test('Arrange (tablet profile): a touch hold opens no menu and a slow drag still moves the tile', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 }); // the workbench's tablet profile: Arrange is allowed
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await pickMore(page, 'arrange');
    const grid = page.locator('[data-be-grid][data-page="Authentic"]');
    await expect(grid).toHaveAttribute('data-cols', '24');
    const step = Number(await grid.getAttribute('data-c')) + Number(await grid.getAttribute('data-g'));
    const g = (await grid.boundingBox())!;
    const drive = grid.locator('[data-be-key="k0"]');
    await expect(drive).toHaveAttribute('data-be-x', '0');
    // the tile body inside its first cell, clear of the corner resize handle (as in spec 40)
    const t = (await drive.boundingBox())!;
    const x = t.x + step / 2;
    const y = t.y + t.height / 2 - 6;
    await expect.poll(() => page.evaluate(([px, py]) => !!document.elementFromPoint(px, py)?.closest('[data-be-key="k0"]') && !document.elementFromPoint(px, py)?.closest('button'), [x, y])).toBe(true);
    await synth(page, 'pointerdown', x, y, 'touch');
    await page.waitForTimeout(650); // a still finger past the 500 ms long-press
    await expect(ctxMenu(page)).toHaveCount(0);
    // a slow drag: a few px at a time, starting under the long-press tolerance
    const to = g.x + 14 * step + step / 2;
    for (let i = 1; i <= 3; i++) {
      await synth(page, 'pointermove', x + i * 2, y, 'touch');
      await page.waitForTimeout(120);
    }
    for (let i = 1; i <= 8; i++) await synth(page, 'pointermove', x + 6 + ((to - x - 6) * i) / 8, y, 'touch');
    await expect(grid.locator('.be-ghost:not(.bad)')).toHaveCount(1);
    await synth(page, 'pointerup', to, y, 'touch');
    await expect(drive).toHaveAttribute('data-be-x', '14');
    await expect(ctxMenu(page)).toHaveCount(0);
  });
});

test.describe('Block Editor modifier (∿)', () => {
  test('∿ opens the modifier flyout; Escape closes it and stays in the editor (the maximized panel stays)', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await page.getByRole('button', { name: 'Maximize Block Editor' }).click();
    const restore = page.getByRole('button', { name: 'Restore Block Editor' });
    await expect(restore).toBeVisible();

    const bass = tile(page, 'k1');
    await bass.hover();
    await bass.locator('[data-be-mod]').click();
    await expect(flyout(page)).toHaveClass(/\bopen\b/);
    await expect(flyout(page)).toContainText('Edit Modifier: Bass');
    await page.keyboard.press('Escape');
    await expect(flyout(page)).not.toHaveClass(/\bopen\b/);
    await expect(restore).toBeVisible();
    await expect(page.locator('[data-be-board]')).toBeVisible();

    // the menu row does the same; a toggle has no modifier
    const menu = await openCtx(page, 'k4');
    await menu.locator('.be-ci-modifier').click();
    await expect(flyout(page)).toHaveClass(/\bopen\b/);
    await expect(flyout(page)).toContainText('Edit Modifier: Presence');
    await page.keyboard.press('Escape');
    await expect(flyout(page)).not.toHaveClass(/\bopen\b/);
    const tog = await openCtx(page, 'e10');
    await expect(tog.locator('.be-ci-modifier')).toHaveCount(0);
    await expect(page.locator('[data-be-key="e10"] [data-be-mod]')).toHaveCount(0);
    // Escape inside the control menu (a submenu, then the root) never reaches the window Escape chain
    await tog.locator('.be-ci-pin').click();
    await page.keyboard.press('Escape');
    await expect(tog.locator('.be-ci-pin')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tog).toHaveCount(0);
    await expect(restore).toBeVisible();
  });

  test('the flyout leaves Escape to an overlay on top of it, and gives way to the control menu', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    const bass = tile(page, 'k1');
    await bass.hover();
    const mod = bass.locator('[data-be-mod]');
    await mod.click();
    await expect(flyout(page)).toHaveClass(/\bopen\b/);
    // the palette (Ctrl+K) opens over it: the first Escape closes the palette only, the next the flyout
    await page.keyboard.press('Control+k');
    const palette = page.locator('[role="dialog"]').filter({ has: page.locator('input') });
    await expect(palette).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(palette).toHaveCount(0);
    await expect(flyout(page)).toHaveClass(/\bopen\b/);
    await page.keyboard.press('Escape');
    await expect(flyout(page)).not.toHaveClass(/\bopen\b/);
    // the control menu (Shift+F10 on the tile) takes over from an open flyout; Escape then closes the menu
    await mod.focus();
    await mod.click();
    await expect(flyout(page)).toHaveClass(/\bopen\b/);
    await mod.focus();
    await page.keyboard.press('Shift+F10');
    await expect(ctxMenu(page)).toBeVisible();
    await expect(flyout(page)).not.toHaveClass(/\bopen\b/);
    await page.keyboard.press('Escape');
    await expect(ctxMenu(page)).toHaveCount(0);
    await expect(page.locator('[data-be-board]')).toBeVisible();
  });

  test('with the modifier panel docked, ∿ targets the panel instead of the flyout', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await dockModifierPanel(page);
    const docked = page.locator('.axis-modifier-part');
    await expect(docked).toBeVisible();
    await expect(docked).toContainText('No parameter targeted');

    const bass = tile(page, 'k1');
    await bass.hover();
    await bass.locator('[data-be-mod]').click();
    await expect(page.locator('.toast')).toContainText('∿ Bass → Modifier panel');
    await expect(docked).toContainText('Bass');
    await expect(docked).not.toContainText('No parameter targeted');
    await expect(flyout(page)).not.toHaveClass(/\bopen\b/);

    // the menu row follows the same rule
    const menu = await openCtx(page, 'k3');
    await menu.locator('.be-ci-modifier').click();
    await expect(docked).toContainText('Treble');
    await expect(flyout(page)).not.toHaveClass(/\bopen\b/);
  });
});

test.describe('Block Editor control menu (layout)', () => {
  test('View ▸ switches a knob to a fader, and it stays after a reload', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await expect(tile(page, 'k1')).toHaveAttribute('data-be-view', 'knob');
    const menu = await openCtx(page, 'k1');
    await expect(menu.locator('.be-ci-view')).toContainText('Knob');
    await menu.locator('.be-ci-view').click();
    await expect(menu.getByRole('menuitemradio')).toHaveText(['Knob', 'Fader', 'Slider', 'Number']);
    await expect(menu.getByRole('menuitemradio', { name: 'Knob' })).toHaveAttribute('aria-checked', 'true');
    await menu.getByRole('menuitemradio', { name: 'Fader' }).click();
    await expect(menu).toHaveCount(0);
    await expect(tile(page, 'k1')).toHaveAttribute('data-be-view', 'fader');
    // the active page stays in view
    await expect(page.locator('[data-be-tab="Authentic"]')).toHaveAttribute('data-active', 'true');

    await reloadEditor(page);
    await expect(onPage(page, 'Authentic', 'k1')).toHaveAttribute('data-be-view', 'fader');
  });

  test('Size ▸ takes a preset (moving to the nearest free spot when needed): one save, kept after a reload', async ({ page }) => {
    await countBoardSaves(page);
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    const bass = onPage(page, 'Authentic', 'k1');
    await expect(bass).toHaveAttribute('data-be-w', '2');
    const menu = await openCtx(page, 'k1');
    await menu.locator('.be-ci-size').click();
    await expect(menu.getByRole('menuitemradio')).toHaveText([/Small\s*2×2/, /Medium\s*3×3/, /Large\s*4×4/]);
    const saves = await boardSaves(page);
    await menu.getByRole('menuitemradio', { name: /Large/ }).click();
    await expect(bass).toHaveAttribute('data-be-w', '4');
    await expect(bass).toHaveAttribute('data-be-h', '4');
    // the action saved the board exactly once
    expect(await boardSaves(page)).toBe(saves + 1);
    // no overlap with its neighbours: the tiles of the page never share a cell
    const rects = await page.locator('section[data-be-page="Authentic"] [data-be-item]').evaluateAll((els) =>
      els.map((e) => ({ x: Number(e.getAttribute('data-be-x')), y: Number(e.getAttribute('data-be-y')), w: Number(e.getAttribute('data-be-w')), h: Number(e.getAttribute('data-be-h')) }))
    );
    for (const a of rects) for (const b of rects) if (a !== b) expect(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y).toBe(false);

    await reloadEditor(page);
    await expect(onPage(page, 'Authentic', 'k1')).toHaveAttribute('data-be-w', '4');
    await expect(onPage(page, 'Authentic', 'k1')).toHaveAttribute('data-be-h', '4');
  });

  test('Move to page ▸ moves it (one save, kept after a reload); a page that already holds it is disabled', async ({ page }) => {
    await countBoardSaves(page);
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    // Bass also goes onto Preamp (Arrange → Add), so Preamp refuses it
    await page.locator('[data-be-tab="Preamp"]').click();
    await pickMore(page, 'arrange');
    await arrangeAdd(page, 'k1');
    await expect(onPage(page, 'Preamp', 'k1')).toHaveCount(1);
    await page.locator('[data-be-arrange-done]').click();
    await page.locator('[data-be-tab="Authentic"]').click();
    await expect(page.locator('[data-be-tab="Authentic"]')).toHaveAttribute('data-active', 'true');

    const menu = await openCtx(page, 'k1');
    await menu.locator('.be-ci-move').click();
    await expect(menu.locator('.be-ci-move-opt')).toHaveText([/^\s*Preamp\s*already there\s*$/, /^\s*Power Amp\s*$/, /^\s*EQ\s*$/, /^\s*Dynamics\s*$/, /^\s*Advanced\s*$/]);
    await expect(menu.locator('.be-ci-move-opt').filter({ hasText: 'Preamp' })).toBeDisabled();
    const saves = await boardSaves(page);
    await menu.locator('.be-ci-move-opt').filter({ hasText: 'Dynamics' }).click();
    await expect(menu).toHaveCount(0);
    await expect(page.locator('.toast')).toContainText('Moved Bass to Dynamics');
    await expect(onPage(page, 'Authentic', 'k1')).toHaveCount(0);
    await expect(onPage(page, 'Dynamics', 'k1')).toHaveCount(1);
    expect(await boardSaves(page)).toBe(saves + 1);
    await expect(page.locator('[data-be-tab="Authentic"]')).toHaveAttribute('data-active', 'true');

    await reloadEditor(page);
    await expect(onPage(page, 'Authentic', 'k1')).toHaveCount(0);
    await expect(onPage(page, 'Dynamics', 'k1')).toHaveCount(1);
  });

  test('Move to page ▸ onto an earlier page keeps a later active page in view', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    // Power Amp: a later page the strip can bring to the start of the board (not clamped at the strip's end)
    const amp = page.locator('[data-be-tab="Power Amp"]');
    await amp.click();
    await expect(amp).toHaveAttribute('data-active', 'true');
    const boardX = (await page.locator('[data-be-board]').boundingBox())!.x;
    const sectionX = async (pg: string) => (await page.locator(`section[data-be-page="${pg}"]`).boundingBox())!.x - boardX;
    // the tab click's smooth scroll has brought it to the start of the board
    await expect.poll(async () => Math.abs(await sectionX('Power Amp'))).toBeLessThan(2);
    const ampX = await sectionX('Power Amp');
    const preampW = (await page.locator('section[data-be-page="Preamp"]').boundingBox())!.width;
    await pickCtx(page, 'k13', 'move', 'Preamp');
    await expect(onPage(page, 'Preamp', 'k13')).toHaveCount(1);
    // the earlier page grew, which pushes every later section along the strip
    await expect.poll(async () => (await page.locator('section[data-be-page="Preamp"]').boundingBox())!.width).toBeGreaterThan(preampW);
    await page.waitForTimeout(700); // past the hold after the change: scroll reports apply again
    // the active page is back at the start of the board, fully in view
    await expect(amp).toHaveAttribute('data-active', 'true');
    expect(Math.abs((await sectionX('Power Amp')) - ampX)).toBeLessThan(2);
    expect(await shareInView(page, 'Power Amp')).toBeGreaterThan(0.95);
  });

  test('Remove from page removes it (one save, kept after a reload); Grid swipe control toggles with its own state', async ({ page }) => {
    await countBoardSaves(page);
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    const saves = await boardSaves(page);
    let menu = await openCtx(page, 'k5');
    await menu.locator('.be-ci-remove').click();
    await expect(menu).toHaveCount(0);
    await expect(page.locator('[data-be-key="k5"]')).toHaveCount(0);
    // no undo outside Arrange: the toast says how to get it back
    await expect(page.locator('.toast')).toContainText('Removed Master Volume from Authentic — Arrange → Add brings it back');
    expect(await boardSaves(page)).toBe(saves + 1);

    menu = await openCtx(page, 'k2');
    await expect(menu.locator('.be-ci-swipe')).toContainText('off');
    await menu.locator('.be-ci-swipe').click();
    await expect(menu).toHaveCount(0);
    await expect(page.locator('.toast')).toContainText('Mid is now a grid swipe control');
    menu = await openCtx(page, 'k2');
    await expect(menu.locator('.be-ci-swipe')).toContainText('on');
    await expect(menu.locator('.be-ci-swipe')).toHaveClass(/\bon\b/);
    await menu.locator('.be-ci-swipe').click();
    await expect(page.locator('.toast')).toContainText('Mid is no longer a grid swipe control');
    menu = await openCtx(page, 'k2');
    await expect(menu.locator('.be-ci-swipe')).toContainText('off');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    await reloadEditor(page);
    await expect(page.locator('[data-be-key="k5"]')).toHaveCount(0);
  });

  test('Shift+F10 and the ContextMenu key open the menu on a focused tile; Escape returns focus', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    const dial = tile(page, 'k2').locator('.be-dial');
    await dial.focus();
    await page.keyboard.press('Shift+F10');
    const menu = ctxMenu(page);
    await expect(menu).toBeVisible();
    await expect(menu.locator('.be-ci-head')).toHaveText('Mid · Authentic');
    // keyboard navigation inside: the first row has focus
    await expect(menu.locator('.be-ci-pin')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(dial).toBeFocused();

    await page.keyboard.press('ContextMenu');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(dial).toBeFocused();
  });

  test('a right-click inside an open value field keeps the field (no control menu)', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await tile(page, 'k2').locator('[data-be-value]').click();
    const input = tile(page, 'k2').locator('input.be-vin');
    await expect(input).toBeVisible();
    await input.click({ button: 'right' });
    await page.waitForTimeout(150);
    await expect(ctxMenu(page)).toHaveCount(0);
    await expect(input).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(input).toHaveCount(0);
  });

  test('phone: no hover actions; the menu keeps pin, modifier and the swipe control, without layout rows', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await bootBlockEditorMock(page);
    await page.locator('[data-idx="0,0"].cell.block').click({ position: { x: 6, y: 6 } });
    await expect(page.locator('[data-be-key="k1"]').first()).toBeVisible();
    await expect(tile(page, 'k1').locator('[data-be-pin], [data-be-mod]')).toHaveCount(0);
    const menu = await openCtx(page, 'k1');
    await expect(menu.locator('.be-ci')).toHaveCount(4);
    await expect(menu.locator('.be-ci-pin, .be-ci-modifier, .be-ci-swipe')).toHaveCount(3);
    await expect(menu.locator('.be-ci-view, .be-ci-size, .be-ci-move, .be-ci-remove')).toHaveCount(0);
    // touch rows (≥ 40 px)
    for (const h of await menu.locator('[role="menuitem"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(40);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });

  test('in Arrange the control menu reaches pin and the grid swipe control (the tile badges are gone)', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await pickMore(page, 'arrange');
    await expect(page.locator('[data-be-arrange-done]')).toBeVisible();
    await expect(tile(page, 'k1').locator('[data-be-pin], .be-pinb, .be-swipe')).toHaveCount(0);
    const menu = await openCtx(page, 'k1');
    await expect(menu.locator('.be-ci-pin')).toBeVisible();
    await expect(menu.locator('.be-ci-swipe')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(page.locator('[data-be-arrange-done]')).toBeVisible();
  });
});
