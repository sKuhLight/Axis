import { test, expect, type Page } from '@playwright/test';
import { bootBlockEditorMock, checkedProfile, openAmpEditor, openMore, pickMore, pickProfile, profileRow } from './support/blockEditorMock';
import { clickNav } from './support/workbench';

// Block Editor rework, slice 3 (AXIS-76): the header — type chip (glyph · type · channel letter that
// unfolds A–D), page tabs / side page list, "Find a control…" popover with the flat results behind it,
// the Engaged | Mute | Scene Ignore segments — and the ⋯ menu (Arrange, Top / Side, control size, layout
// profiles and resets, save as default, change type, grid map, remove) with its amber "custom" dot.
// Fully mocked backend (support/blockEditorMock.ts) — no device.

const board = (page: Page) => page.locator('[data-be-board]');
const tile = (page: Page, key: string) => page.locator(`[data-be-key="${key}"]`).first();
const dot = (page: Page) => page.locator('[data-be-more-dot]');

/** Arrange (via ⋯), remove a control by its tile's ✕, finish arranging. */
async function removeInArrange(page: Page, key: string) {
  await pickMore(page, 'arrange');
  await expect(page.locator('[data-be-arrange-done]')).toBeVisible();
  await tile(page, key).locator('.be-x').click();
  await expect(page.locator(`[data-be-key="${key}"]`)).toHaveCount(0);
  await page.locator('[data-be-arrange-done]').click();
  await expect(page.locator('[data-be-arrange-done]')).toHaveCount(0);
}

test.describe('Block Editor header (slice 3)', () => {
  test('channel: the chip letter unfolds A–D and a pick switches the channel', async ({ page }) => {
    const mock = await bootBlockEditorMock(page, { channel: 'A' });
    await openAmpEditor(page);
    const chip = page.locator('[data-be-chip]');
    await expect(chip).toContainText('Plexi 100W', { ignoreCase: true });
    const letter = chip.locator('[data-be-channel-toggle]');
    await expect(letter).toContainText('A');
    await expect(chip.locator('[data-be-channel]')).toHaveCount(0);

    await letter.click();
    await expect(chip.locator('[data-be-channel]')).toHaveText(['A', 'B', 'C', 'D']);
    await expect(chip.locator('[data-be-channel="A"]')).toHaveAttribute('aria-pressed', 'true');
    await chip.locator('[data-be-channel="C"]').click();
    await expect.poll(() => mock.channelWrites).toEqual(['C']);
    // the pick folds the chip again, showing the new letter; the board stays through the reload
    await expect(chip.locator('[data-be-channel]')).toHaveCount(0);
    await expect(chip.locator('[data-be-channel-toggle]')).toContainText('C');
    await expect(tile(page, 'k0')).toBeVisible();
  });

  test('a block without channels shows no channel letter', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await expect(page.locator('[data-be-chip]')).toBeVisible();
    await expect(page.locator('[data-be-channel-toggle]')).toHaveCount(0);
  });

  test('the Engaged segment bypasses and engages the block; Mute / Scene Ignore are placeholders', async ({ page }) => {
    const mock = await bootBlockEditorMock(page, { channel: 'A' });
    await openAmpEditor(page);
    const eng = page.locator('[data-be-engaged]');
    await expect(eng).toHaveAttribute('data-be-engaged', 'true');
    await expect(eng).toHaveText(/Engaged/);
    await eng.click();
    await expect.poll(() => mock.bypassWrites).toEqual([true]);
    await expect(eng).toHaveAttribute('data-be-engaged', 'false');
    await expect(eng).toHaveText(/Bypassed/);
    await expect(eng).toHaveAttribute('aria-pressed', 'false');
    await eng.click();
    await expect.poll(() => mock.bypassWrites).toEqual([true, false]);
    await expect(eng).toHaveText(/Engaged/);

    // one joined group with the two placeholders (no endpoint yet: a toast, no write)
    await expect(page.getByRole('group', { name: 'Block state' }).getByRole('button')).toHaveText([/Engaged/, /Mute/, /Scene Ignore/]);
    await page.locator('[data-be-mute]').click();
    await expect(page.locator('.toast')).toContainText('Mute — coming soon');
    await page.locator('[data-be-scene]').click();
    await expect(page.locator('.toast')).toContainText('Scene Ignore — coming soon');
    expect(mock.bypassWrites).toEqual([true, false]);
  });

  test('Navigation Top / Side via ⋯ is kept after a reload; the side list has no heading and no counts', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    const menu = await openMore(page);
    await expect(menu.locator('.be-mi-nav-top')).toHaveAttribute('aria-checked', 'true');
    await expect(menu.locator('.be-mi-nav-side')).toHaveAttribute('aria-checked', 'false');
    await menu.locator('.be-mi-nav-side').click();
    await expect(menu).toHaveCount(0);

    await expect(board(page)).toHaveAttribute('data-nav', 'side');
    const list = page.locator('[data-be-pagenav="list"]');
    await expect(list).toBeVisible();
    await expect(page.locator('[data-be-pagenav="tabs"]')).toHaveCount(0);
    const names = ['Authentic', 'Preamp', 'Power Amp', 'EQ', 'Dynamics', 'Advanced'];
    await expect(list.locator('[data-be-tab]')).toHaveText(names);
    expect((await list.innerText()).split('\n').map((t) => t.trim()).filter(Boolean)).toEqual(names);
    // the list sits left of the board
    const lb = (await list.boundingBox())!;
    const bb = (await board(page).boundingBox())!;
    expect(lb.x + lb.width).toBeLessThanOrEqual(bb.x + 1);
    // a list click scrolls the stack to its page
    await list.locator('[data-be-tab="Dynamics"]').click();
    await expect(page.locator('section[data-be-page="Dynamics"]')).toBeInViewport({ ratio: 0.9 });
    await expect(list.locator('[data-be-tab="Dynamics"]')).toHaveAttribute('data-active', 'true');

    await page.reload();
    await expect(page.locator('[data-idx="0,0"].cell.block')).toBeVisible();
    await openAmpEditor(page);
    await expect(board(page)).toHaveAttribute('data-nav', 'side');
    const again = await openMore(page);
    await expect(again.locator('.be-mi-nav-side')).toHaveAttribute('aria-checked', 'true');
    await again.locator('.be-mi-nav-top').click();
    await expect(board(page)).toHaveAttribute('data-nav', 'top');
    await expect(page.locator('[data-be-pagenav="tabs"] [data-be-tab]')).toHaveCount(6);
  });

  test('layout profiles via ⋯: reset this page, new copy, switch, delete', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    expect(await checkedProfile(page)).toBe('Default');

    // a change on the first page, then "Reset this page" brings it back
    await removeInArrange(page, 'k0');
    await expect(dot(page)).toBeVisible();
    await pickMore(page, 'reset-page', { confirm: true });
    await expect(page.locator('section[data-be-page="Authentic"] [data-be-key="k0"]')).toBeVisible();
    await expect(dot(page)).toHaveCount(0);

    // a new copy becomes the active profile, with the same board
    await pickMore(page, 'new-copy');
    expect(await checkedProfile(page)).toBe('Layout 1');
    await expect(page.locator('[data-be-tab]')).toHaveCount(6);

    // switch to Blank and back
    await pickProfile(page, 'Blank');
    await expect(page.locator('[data-be-empty]')).toContainText('This page is empty.');
    await expect(page.locator('[data-be-tab]')).toHaveText(['Page 1']);
    await pickProfile(page, 'Layout 1');
    await expect(page.locator('[data-be-tab="Authentic"]')).toBeVisible();

    // the copy can be deleted (inline confirm); the built-ins cannot
    const menu = await openMore(page);
    await expect(menu.locator('.be-mi-delete-copy')).toContainText('Layout 1');
    await menu.locator('.be-mi-delete-copy').click();
    await menu.locator('[data-menu-confirm]').click();
    await expect(menu).toHaveCount(0);
    expect(await checkedProfile(page)).toBe('Default');
    const after = await openMore(page);
    await expect(profileRow(after, 'Layout 1')).toHaveCount(0);
    await expect(after.locator('.be-mi-delete-copy')).toHaveCount(0);
  });

  test('the amber dot shows a changed layout and goes away after "Reset all pages"', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await expect(page.locator('[data-be-more]')).toHaveAttribute('data-custom', 'false');
    let menu = await openMore(page);
    await expect(menu.locator('.be-mi-layout-head')).toHaveText(/Layout · Default/);
    await expect(menu.locator('.be-mi-reset-all')).toBeDisabled();
    await page.keyboard.press('Escape');

    await removeInArrange(page, 'k0');
    await expect(dot(page)).toBeVisible();
    await expect(page.locator('[data-be-more]')).toHaveAttribute('data-custom', 'true');
    menu = await openMore(page);
    await expect(menu.locator('.be-mi-layout-head')).toHaveText(/Layout · Custom/);
    await page.keyboard.press('Escape');
    // still custom after a reload
    await page.reload();
    await expect(page.locator('[data-idx="0,0"].cell.block')).toBeVisible();
    await page.locator('[data-idx="0,0"].cell.block').click();
    await expect(board(page)).toBeVisible();
    await expect(dot(page)).toBeVisible();

    await pickMore(page, 'reset-all', { confirm: true });
    await expect(dot(page)).toHaveCount(0);
    await expect(page.locator('section[data-be-page="Authentic"] [data-be-key="k0"]')).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-idx="0,0"].cell.block')).toBeVisible();
    await openAmpEditor(page);
    await expect(page.locator('[data-be-more]')).toHaveAttribute('data-custom', 'false');
  });

  test('"Save as default for Amp" makes the layout the seed: no dot, and "Reset all pages" returns to it', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await removeInArrange(page, 'k0');
    await expect(dot(page)).toBeVisible();
    await pickMore(page, 'save-default');
    await expect(dot(page)).toHaveCount(0);
    const menu = await openMore(page);
    await expect(menu.locator('.be-mi-reset-device')).toBeVisible();
    await expect(menu.locator('.be-mi-forget-default')).toBeVisible();
    // back to the device layout: Drive returns and the layout differs from the saved default
    await menu.locator('.be-mi-reset-device').click();
    await menu.locator('[data-menu-confirm]').click();
    await expect(page.locator('section[data-be-page="Authentic"] [data-be-key="k0"]')).toBeVisible();
    await expect(dot(page)).toBeVisible();
    await pickMore(page, 'reset-all', { confirm: true });
    await expect(page.locator('[data-be-key="k0"]')).toHaveCount(0);
    await expect(dot(page)).toHaveCount(0);
    // forgetting the default: the device layout is the seed again
    await pickMore(page, 'forget-default');
    await expect(dot(page)).toBeVisible();
  });

  test('the type chip (and ⋯ "Change type…") opens the model palette', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await page.locator('[data-be-type]').click();
    const search = page.getByPlaceholder('Search types…');
    await expect(search).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(search).toHaveCount(0);
    await pickMore(page, 'change-type');
    await expect(page.getByPlaceholder('Search types…')).toBeVisible();
  });

  test('search: the popover jumps to a control, "Show all" and Enter show the flat results, a search ends Arrange', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await expect(page.locator('section[data-be-page="Dynamics"]')).not.toBeInViewport({ ratio: 0.5 });

    const input = page.locator('[data-be-find-input]');
    await input.click();
    const pop = page.locator('[data-be-find]');
    await expect(pop).toBeVisible();
    await input.fill('thresh');
    await expect(pop.locator('[data-be-find-row]')).toHaveCount(1);
    const row = pop.locator('[data-be-find-row="k22"]');
    await expect(row).toContainText('Threshold');
    await expect(row.locator('[data-be-find-page]')).toHaveText(['Dynamics']);
    await row.locator('.be-fmain').click();
    await expect(pop).toHaveCount(0);
    await expect(page.locator('section[data-be-page="Dynamics"]')).toBeInViewport({ ratio: 0.5 });
    await expect(page.locator('[data-be-tab="Dynamics"]')).toHaveAttribute('data-active', 'true');
    await expect(page.locator('section[data-be-page="Dynamics"] [data-be-key="k22"]')).toHaveClass(/flash/);

    // "Show all" → the flat, operable results replace the board
    await input.click();
    await expect(pop).toBeVisible();
    await input.fill('a');
    await pop.locator('[data-be-find-all]').click();
    await expect(pop).toHaveCount(0);
    const results = page.locator('[data-be-results]');
    await expect(results).toBeVisible();
    await expect(board(page)).toHaveCount(0);
    await expect(results.locator('[data-be-key="k1"]')).toBeVisible(); // Bass
    await input.fill('treb');
    await expect(results.locator('[data-be-key]')).toHaveCount(1);
    await page.locator('[data-be-results-close]').click();
    await expect(board(page)).toBeVisible();

    // Enter shows the results too; Escape clears them
    await input.fill('mid');
    await input.press('Enter');
    await expect(page.locator('[data-be-results] [data-be-key="k2"]')).toBeVisible();
    await input.press('Escape');
    await expect(board(page)).toBeVisible();
    await expect(input).toHaveValue('');

    // a search ends Arrange
    await pickMore(page, 'arrange');
    await expect(page.locator('[data-be-arrange-done]')).toBeVisible();
    await input.click();
    await expect(page.locator('[data-be-arrange-done]')).toHaveCount(0);
  });

  test('the header is one row from ~1240 px of editor width and two rows below', async ({ page }) => {
    await bootBlockEditorMock(page, { channel: 'A' });
    await openAmpEditor(page);
    const head = page.locator('[data-be-head]');
    // the default 1440 px workbench gives the editor more than 1240 px
    expect(await head.evaluate((el) => el.clientWidth)).toBeGreaterThanOrEqual(1240);
    await expect(head).toHaveAttribute('data-be-head-rows', '1');
    const top = async (sel: string) => (await head.locator(sel).first().boundingBox())!.y;
    expect(Math.abs((await top('[data-be-chip]')) - (await top('[data-be-tab]')))).toBeLessThan(12);

    // a narrower window (this flips the workbench to its tablet profile, deliberately: there the default
    // panel is narrower than the one-row width): the tabs and the search move to a second row
    await page.setViewportSize({ width: 1100, height: 800 });
    await expect(head).toHaveAttribute('data-be-head-rows', '2');
    expect(await head.evaluate((el) => el.clientWidth)).toBeLessThan(1240);
    expect(await top('[data-be-tab]')).toBeGreaterThan((await top('[data-be-chip]')) + 20);
    expect(await top('[data-be-find-input]')).toBeGreaterThan((await top('[data-be-engaged]')) + 20);
    // chip, state and ⋯ stay on the first row
    expect(Math.abs((await top('[data-be-more]')) - (await top('[data-be-engaged]')))).toBeLessThan(8);
  });

  test('⋯ "Grid map" hides and shows the strip, and the choice is kept', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    const map = page.locator('[data-screen="Block Editor"] [data-screen="Grid Map"]');
    await expect(map).toBeVisible();
    await pickMore(page, 'grid-map');
    await expect(map).toHaveCount(0);
    await page.reload();
    await expect(page.locator('[data-idx="0,0"].cell.block')).toBeVisible();
    await openAmpEditor(page);
    await expect(map).toHaveCount(0);
    const menu = await openMore(page);
    await expect(menu.locator('.be-mi-grid-map')).toHaveText(/Show grid map/);
    await menu.locator('.be-mi-grid-map').click();
    await expect(map).toBeVisible();
  });

  test('⋯ "Remove block from grid" asks first, then removes the block', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    const clears: unknown[] = [];
    page.on('request', (r) => {
      if (r.method() === 'PUT' && r.url().includes('/api/preset/grid/cell')) clears.push(r.postDataJSON());
    });
    const menu = await openMore(page);
    await menu.locator('.be-mi-remove').click();
    await expect(menu.locator('[data-menu-confirm]')).toHaveText(/Remove/);
    await menu.locator('[data-menu-cancel]').click();
    await expect(menu.locator('.be-mi-remove')).toBeVisible();
    await menu.locator('.be-mi-remove').click();
    expect(clears).toEqual([]); // cancel removed nothing
    await menu.locator('[data-menu-confirm]').click();
    await expect.poll(() => clears).toEqual([{ row: 1, col: 1, blockId: 0 }]);
    await expect(page.locator('.toast')).toContainText('Block removed');
  });

  test('the Setup screen keeps page tabs, search and the same ⋯ menu (no block rows)', async ({ page }) => {
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
    await expect(screen.locator('[data-be-head]')).toBeVisible();
    await expect(screen.locator('[data-be-chip], [data-be-engaged]')).toHaveCount(0);
    await expect(screen.locator('[data-be-tab]').first()).toBeVisible();
    await expect(screen.locator('[data-be-find-input]')).toBeVisible();
    const menu = await openMore(page, screen);
    for (const id of ['arrange', 'nav-side', 'size-m', 'new-copy', 'save-default']) await expect(menu.locator(`.be-mi-${id}`)).toBeVisible();
    await expect(menu.locator('.be-mi-save-default')).toHaveText(/Save as default for Setup/);
    await expect(menu.locator('.be-mi-change-type, .be-mi-grid-map, .be-mi-remove')).toHaveCount(0);
    await menu.locator('.be-mi-arrange').click();
    await expect(screen.locator('[data-be-arrange-done]')).toBeVisible();
  });
});

/** A short name for the focused header element (Tab order checks). */
async function focusedPart(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return '';
    const d = el.dataset;
    if (d.beTab) return 'tab:' + d.beTab;
    for (const k of ['beType', 'beChannelToggle', 'beFindInput', 'beFindToggle', 'beEngaged', 'beMute', 'beScene', 'beMore'] as const) if (k in d) return k;
    return el.tagName.toLowerCase();
  });
}
async function tabWalk(page: Page, from: string, steps: number): Promise<string[]> {
  await page.locator(from).first().focus();
  const out = [await focusedPart(page)];
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press('Tab');
    out.push(await focusedPart(page));
  }
  return out;
}
const TABS = ['Authentic', 'Preamp', 'Power Amp', 'EQ', 'Dynamics', 'Advanced'].map((t) => 'tab:' + t);

test.describe('Block Editor header (slice 3): review fixes', () => {
  test('Escape inside the search popover or the channel letters stays there (the maximized panel stays)', async ({ page }) => {
    await bootBlockEditorMock(page, { channel: 'A' });
    await openAmpEditor(page);
    await page.getByRole('button', { name: 'Maximize Block Editor' }).click();
    const restore = page.getByRole('button', { name: 'Restore Block Editor' });
    await expect(restore).toBeVisible();

    const input = page.locator('[data-be-find-input]');
    await input.click();
    const pop = page.locator('[data-be-find]');
    await expect(pop).toBeVisible();
    await pop.getByRole('button', { name: 'Unused' }).focus();
    await page.keyboard.press('Escape');
    await expect(pop).toHaveCount(0);
    await expect(input).toBeFocused();
    await expect(restore).toBeVisible();
    await expect(page.locator('[data-be-board]')).toBeVisible();

    // the channel letters: Escape folds them, focus back on the letter
    await page.locator('[data-be-channel-toggle]').click();
    await expect(page.locator('[data-be-channel="A"]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-be-channel]')).toHaveCount(0);
    await expect(page.locator('[data-be-channel-toggle]')).toBeFocused();
    await expect(restore).toBeVisible();
  });

  test('Tab passes through the header without opening the popover or ending Arrange; one row: chip → tabs → search → state → ⋯', async ({ page }) => {
    await bootBlockEditorMock(page, { channel: 'A' });
    await openAmpEditor(page);
    await pickMore(page, 'arrange');
    await expect(page.locator('[data-be-arrange-done]')).toBeVisible();
    // in arrange mode a seventh ＋ tab follows the page tabs
    const walk = await tabWalk(page, '[data-be-type]', 12);
    expect(walk).toEqual(['beType', 'beChannelToggle', ...TABS, 'button', 'beFindInput', 'beEngaged', 'beMute', 'beScene']);
    await page.keyboard.press('Tab');
    expect(await focusedPart(page)).toBe('beMore');
    await expect(page.locator('[data-be-find]')).toHaveCount(0); // focus alone never opens it
    await expect(page.locator('[data-be-arrange-done]')).toBeVisible(); // …nor ends Arrange
    // ArrowDown in the field opens it (by intent) and walks into the rows
    await page.locator('[data-be-find-input]').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-be-find]')).toBeVisible();
    await expect(page.locator('[data-be-find] .be-fmain').first()).toBeFocused();
    await expect(page.locator('[data-be-arrange-done]')).toHaveCount(0);
    // focus leaving field and popover closes it
    await page.locator('[data-be-engaged]').focus();
    await expect(page.locator('[data-be-find]')).toHaveCount(0);
  });

  test('two rows (tablet profile at 1100 px): Tab walks row 1 (chip, state, ⋯) before row 2 (tabs, search)', async ({ page }) => {
    // a narrower window flips the workbench to its tablet profile on purpose: that is where the default
    // Block Editor panel is narrower than the one-row width
    await page.setViewportSize({ width: 1100, height: 800 });
    await bootBlockEditorMock(page, { channel: 'A' });
    await openAmpEditor(page);
    await expect(page.locator('[data-be-head]')).toHaveAttribute('data-be-head-rows', '2');
    const walk = await tabWalk(page, '[data-be-type]', 11);
    expect(walk).toEqual(['beType', 'beChannelToggle', 'beEngaged', 'beMute', 'beScene', 'beMore', ...TABS]);
    await page.keyboard.press('Tab');
    expect(await focusedPart(page)).toBe('beFindInput');
  });

  test('page tabs and ⋯ Arrange work while the flat results show', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    const input = page.locator('[data-be-find-input]');
    await input.click();
    await input.fill('a');
    await input.press('Enter');
    await expect(page.locator('[data-be-results]')).toBeVisible();
    await page.locator('[data-be-tab="Dynamics"]').click();
    await expect(page.locator('[data-be-results]')).toHaveCount(0);
    await expect(page.locator('section[data-be-page="Dynamics"]')).toBeInViewport({ ratio: 0.5 });
    await expect(page.locator('[data-be-tab="Dynamics"]')).toHaveAttribute('data-active', 'true');

    await input.click();
    await page.locator('[data-be-find-all]').click();
    await expect(page.locator('[data-be-results]')).toBeVisible();
    await pickMore(page, 'arrange');
    await expect(page.locator('[data-be-results]')).toHaveCount(0);
    await expect(page.locator('[data-be-arrange-done]')).toBeVisible();
    await expect(page.locator('[data-be-grid][data-page="Authentic"]')).toHaveAttribute('data-cols', '24');
  });

  test('⚡ in the popover pins the control; the Unused filter carries into "Show all"', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    const input = page.locator('[data-be-find-input]');
    await input.click();
    await input.fill('bass');
    await page.locator('[data-be-find-row="k1"] [data-be-find-pin]').click();
    await expect(page.locator('.toast')).toContainText('Pinned Bass');
    await expect(page.locator('.custom-panel .axis-widget.param').filter({ hasText: 'Bass' })).toHaveCount(1);

    // Drive leaves every page, then Unused + Show all lists only it
    await removeInArrange(page, 'k0');
    await input.click();
    await input.fill('');
    const pop = page.locator('[data-be-find]');
    await pop.getByRole('button', { name: 'Unused' }).click();
    await expect(pop.locator('[data-be-find-row]')).toHaveCount(1);
    await pop.locator('[data-be-find-all]').click();
    await expect(page.locator('[data-be-results] [data-be-key]')).toHaveCount(1);
    await expect(page.locator('[data-be-results] [data-be-key="k0"]')).toBeVisible();
  });

  test('a cab: the chip shows the slot and opens the cab picker', async ({ page }) => {
    await bootBlockEditorMock(page, { extraBlocks: true });
    await page.locator('[data-idx="0,1"].cell.block').click();
    const chip = page.locator('[data-be-chip]');
    await expect(chip).toContainText('FACTORY 1 4x12 Green', { ignoreCase: true });
    await expect(page.locator('[data-be-board]')).toBeVisible();
    await chip.locator('[data-be-type]').click();
    await expect(page.getByPlaceholder('Search cab IRs…')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByPlaceholder('Search cab IRs…')).toHaveCount(0);
    const menu = await openMore(page);
    await expect(menu.locator('.be-mi-change-type')).toHaveText(/Choose cab…/);
    await menu.locator('.be-mi-change-type').click();
    await expect(page.getByPlaceholder('Search cab IRs…')).toBeVisible();
  });

  test('no parameter pack / a read error: the message shows in the board area, the header stays usable', async ({ page }) => {
    const mock = await bootBlockEditorMock(page, { extraBlocks: true });
    // no pack: the type cannot change and nothing can be bypassed, but ⋯ still removes the block
    await page.locator('[data-idx="0,2"].cell.block').click();
    await expect(page.locator('[data-be-message]')).toContainText('No parameter pack for Mystery');
    await expect(page.locator('[data-be-type]')).toBeDisabled();
    let menu = await openMore(page);
    for (const id of ['arrange', 'size-m', 'new-copy', 'save-default']) await expect(menu.locator(`.be-mi-${id}`)).toBeDisabled();
    await expect(menu.locator('.be-mi-remove')).toBeEnabled();
    await expect(menu.locator('.be-mi-grid-map')).toBeEnabled();
    await page.keyboard.press('Escape');

    // a read error: the type palette and bypass still work
    await page.locator('[data-idx="0,3"].cell.block').click();
    await expect(page.locator('[data-be-message]')).toContainText("Couldn't read this block.");
    await page.locator('[data-be-engaged]').click();
    await expect.poll(() => mock.bypassByEid[103]).toEqual([true]);
    menu = await openMore(page);
    await expect(menu.locator('.be-mi-change-type')).toBeEnabled();
    await expect(menu.locator('.be-mi-arrange')).toBeDisabled();
    await page.keyboard.press('Escape');
    await page.locator('[data-be-type]').click();
    await expect(page.getByPlaceholder('Search types…')).toBeVisible();
  });

  test('a page the default layout does not have: "Clear this page" says so and asks first', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await pickMore(page, 'arrange');
    await page.getByRole('button', { name: 'Add page' }).first().click();
    await page.locator('[data-be-add="k0"]').click(); // Drive onto the new page
    await page.locator('[data-be-arrange-done]').click();
    const menu = await openMore(page);
    const row = menu.locator('.be-mi-reset-page');
    await expect(row).toHaveText(/Clear this page/);
    await row.click();
    await expect(menu.getByText('is not in the device layout — clear it?')).toBeVisible();
    await menu.locator('[data-menu-confirm]').click();
    await expect(menu).toHaveCount(0);
    await expect(page.locator('[data-be-empty]')).toBeVisible();
  });
});
