import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  bootCleanWorkbench,
  collapseRail,
  editBar,
  editBarControl,
  enterEditMode,
  menuLabels,
  openEditBarMenu,
  openMenu
} from './support/workbench';

/**
 * UI rework slice 1 — the edit bar. Customize mode shows ONE full-window-width
 * strip at the very top (above rail and top bar, in normal flow): CUSTOMIZE tag ·
 * Undo/Redo · PAGE ▾ · LAYOUT ▾ · profile · Add ▾ · status · ⋯ · Done. The app
 * moves down by exactly the bar height; nothing overlaps; groups collapse into
 * ⋯ More on narrow windows. Mirrors the design harness's toolbar checklist.
 * (`bootCleanWorkbench` keeps the page offline, so no device popup covers the
 * chrome at phone widths.)
 */

type Rect = { x: number; y: number; width: number; height: number };

async function rect(page: Page, selector: string): Promise<Rect | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, selector);
}

async function shellGeometry(page: Page) {
  return {
    root: (await rect(page, '.aw-root'))!,
    rail: await rect(page, '.aw-rail'),
    top: (await rect(page, '.aw-topbar'))!,
    ws: (await rect(page, '.aw-workspace'))!,
    bottom: (await rect(page, '.aw-bottombar'))!
  };
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.5;

async function noHorizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth
  );
}

async function barNotClipped(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector('[data-editbar]');
    return !!bar && bar.scrollWidth <= bar.clientWidth + 1;
  });
}

async function menuInViewport(page: Page) {
  return page.evaluate(() => {
    const menu = document.querySelector('.aw-context-menu');
    if (!menu) return false;
    const r = menu.getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight;
  });
}

/** Visible button sizes inside the bar. */
async function barButtonSizes(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-editbar] button')]
      .filter((b) => b.getClientRects().length > 0)
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { h: Math.round(r.height), min: Math.round(Math.min(r.width, r.height)) };
      })
  );
}

const doneButtons = (page: Page) => page.getByRole('button', { name: 'Done', exact: true });

const PAGE_ITEMS = ['Rename page…', 'Duplicate page', 'Move left', 'Move right', 'Manage pages and templates…', 'Delete page'];
const LAYOUT_ITEMS = ['Default', 'Stage', 'Studio', 'Compact', 'Reset layout', 'Save this page as layout', 'Saved layouts (0)', 'Import…', 'Export this page'];
const PROFILE_ITEMS = ['Auto', 'Desktop', 'Tablet', 'Mobile'];
const ADD_ITEMS = ['Add panel…', 'Add custom panel', 'Add widget…', 'Add page', 'Open library'];
const allIn = (got: string[], want: string[]) => want.every((w) => got.includes(w));

test.describe('Edit bar · 1440×900', () => {
  test('a full-width 36px strip at the very top; the app moves down by exactly its height', async ({ page }) => {
    await bootCleanWorkbench(page);
    await expect(editBar(page)).toHaveCount(0); // no bar before edit mode
    await collapseRail(page);
    const before = await shellGeometry(page);

    await enterEditMode(page);
    await page.mouse.move(720, 500); // keep the rail collapsed
    const bar = (await rect(page, '[data-editbar]'))!;
    const after = await shellGeometry(page);

    expect(bar.x).toBe(0);
    expect(bar.y).toBe(0);
    expect(near(bar.width, 1440)).toBe(true);
    expect(Math.round(bar.height)).toBe(36);

    // Rail and top bar both start exactly at the bar bottom.
    expect(near(after.rail!.y, 36)).toBe(true);
    expect(near(after.top.y, 36)).toBe(true);
    // The app shifted by exactly the bar height …
    for (const key of ['root', 'top', 'ws'] as const) expect(near(after[key].y - before[key].y, bar.height)).toBe(true);
    expect(near(after.rail!.y - before.rail!.y, bar.height)).toBe(true);
    // … and nothing else changed size: widths, top/bottom bars; the workspace lost the bar height.
    expect(near(after.top.width, before.top.width)).toBe(true);
    expect(near(after.top.height, before.top.height)).toBe(true);
    expect(near(after.ws.width, before.ws.width)).toBe(true);
    expect(near(after.rail!.width, before.rail!.width)).toBe(true);
    expect(near(after.bottom.y, before.bottom.y)).toBe(true);
    expect(near(after.bottom.height, before.bottom.height)).toBe(true);
    expect(near(before.ws.height - after.ws.height, bar.height)).toBe(true);

    // No overlap with the workspace or the panel headers.
    expect(bar.y + bar.height).toBeLessThanOrEqual(after.ws.y + 0.5);
    const head = (await rect(page, '.aw-pane-head'))!;
    expect(head.y).toBeGreaterThanOrEqual(bar.y + bar.height);

    // The app below is outlined (1px, no top edge).
    const outline = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('.aw-root')!, '::after');
      return `${s.borderLeftWidth}/${s.borderRightWidth}/${s.borderBottomWidth}/${s.borderTopWidth}`;
    });
    expect(outline).toBe('1px/1px/1px/0px');

    // Exactly one Done; the bottom Customize is a pressed toggle.
    await expect(doneButtons(page)).toHaveCount(1);
    await expect(page.locator('.aw-bottom-customize')).toHaveAttribute('aria-pressed', 'true');

    // 28px controls; nothing clipped; tag first, status then Done last.
    const sizes = await barButtonSizes(page);
    expect(sizes.length).toBeGreaterThan(5);
    expect(sizes.every((s) => s.h >= 22 && s.h <= 30)).toBe(true);
    expect(await barNotClipped(page)).toBe(true);
    const order = await page.evaluate(() => {
      const kids = [...document.querySelector('[data-editbar]')!.children];
      const at = (cls: string) => kids.findIndex((k) => k.classList.contains(cls));
      return { tag: at('aw-eb-tag'), status: at('aw-eb-status'), done: at('aw-eb-done'), count: kids.length };
    });
    expect(order.tag).toBe(0);
    expect(order.done).toBe(order.count - 1);
    expect(order.status).toBe(order.count - 2);
    await expect(editBar(page).locator('.aw-eb-status')).toHaveText(/Drag a tab onto a panel to dock it/);
    // Destructive actions live in menus, never as top-level bar buttons.
    await expect(editBar(page)).not.toContainText(/Delete|Reset layout/);
    expect(await noHorizontalOverflow(page)).toBe(true);
  });

  test('PAGE menu: pages + page actions, opens downward inside the viewport, Escape closes', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await expect(editBarControl(page, 'page')).toContainText('Grid');

    await openEditBarMenu(page, 'page');
    const labels = await menuLabels(page);
    expect(allIn(labels, ['Grid', ...PAGE_ITEMS])).toBe(true);
    await expect(openMenu(page).getByRole('menuitemradio', { name: 'Grid' })).toHaveAttribute('aria-checked', 'true');
    expect(await menuInViewport(page)).toBe(true);
    expect((await rect(page, '.aw-context-menu'))!.y).toBeGreaterThanOrEqual(36 - 1);
    // The first page cannot move further left.
    await expect(openMenu(page).getByRole('menuitem', { name: /Move left/ })).toBeDisabled();

    await page.keyboard.press('Escape');
    await expect(openMenu(page)).toHaveCount(0);
  });

  test('Delete page asks inline first; Cancel keeps the page; Confirm deletes; Undo brings it back', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    const gridNav = page.locator('[data-nav-entry="grid"]');
    await expect(gridNav).toHaveCount(1);

    await openEditBarMenu(page, 'page');
    await openMenu(page).getByRole('menuitem', { name: 'Delete page' }).click();
    await expect(openMenu(page)).toContainText('Delete “Grid”? Its panels stay available in Add panel. Undo brings the page back.');
    await expect(gridNav).toHaveCount(1); // nothing deleted yet
    await openMenu(page).getByRole('menuitem', { name: 'Cancel' }).click();
    await expect(openMenu(page).getByRole('menuitem', { name: 'Delete page' })).toBeVisible();
    await expect(gridNav).toHaveCount(1);

    await openMenu(page).getByRole('menuitem', { name: 'Delete page' }).click();
    await openMenu(page).getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await expect(openMenu(page)).toHaveCount(0);
    await expect(gridNav).toHaveCount(0);
    await expect(editBarControl(page, 'page')).not.toContainText('Grid');

    await page.getByRole('button', { name: 'Undo layout change' }).click();
    await expect(gridNav).toHaveCount(1);
  });

  test('Rename via the menu input; an empty name shows a dismissable error', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);

    await openEditBarMenu(page, 'page');
    await openMenu(page).getByRole('menuitem', { name: 'Rename page…' }).click();
    const input = openMenu(page).locator('input[data-menu-input]');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('Grid');
    await input.fill('Pedalboard');
    await input.press('Enter');
    await expect(openMenu(page)).toHaveCount(0);
    await expect(editBarControl(page, 'page')).toContainText('Pedalboard');
    await expect(page.locator('[data-nav-entry="grid"]')).toContainText('Pedalboard');

    // An empty name is rejected: the field stays open and the bar shows the error.
    await openEditBarMenu(page, 'page');
    await openMenu(page).getByRole('menuitem', { name: 'Rename page…' }).click();
    await input.fill('');
    await input.press('Enter');
    await expect(openMenu(page)).toBeVisible();
    const error = editBar(page).locator('[role="alert"]');
    await expect(error).toContainText(/cannot be empty/i);
    // Escape cancels the field first, then closes the menu.
    await page.keyboard.press('Escape');
    await expect(input).toHaveCount(0);
    await expect(openMenu(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(openMenu(page)).toHaveCount(0);
    // The error chip replaces the status text and can be dismissed.
    await expect(editBar(page).locator('.aw-eb-status')).toHaveCount(0);
    await error.getByRole('button', { name: 'Dismiss error' }).click();
    await expect(error).toHaveCount(0);
    await expect(editBar(page).locator('.aw-eb-status')).toBeVisible();
  });

  test('Duplicate creates and opens “Grid Copy”; Move right reorders', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);

    await openEditBarMenu(page, 'page');
    await openMenu(page).getByRole('menuitem', { name: 'Duplicate page' }).click();
    await expect(editBarControl(page, 'page')).toContainText('Grid Copy');
    await expect(page.locator('[data-nav-active="true"]').filter({ hasText: 'Grid Copy' })).toHaveCount(1);

    const navOrder = () =>
      page.locator('[data-nav-entry]').evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.navEntry));
    const before = await navOrder();
    const from = before.findIndex((id) => id === 'grid');
    await page.locator('[data-nav-entry="grid"] button.axis-nav-entry').click();
    await expect(editBarControl(page, 'page')).toContainText('Grid');
    await openEditBarMenu(page, 'page');
    await openMenu(page).getByRole('menuitem', { name: 'Move right' }).click();
    await expect.poll(async () => (await navOrder()).indexOf('grid')).toBeGreaterThan(from);
  });

  test('LAYOUT menu: presets as radios, page layouts in submenus; Undo/Redo shortcuts', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);

    await openEditBarMenu(page, 'layout');
    expect(allIn(await menuLabels(page), LAYOUT_ITEMS)).toBe(true);
    await expect(openMenu(page).getByRole('menuitemradio')).toHaveCount(4);
    expect((await rect(page, '.aw-context-menu'))!.y).toBeGreaterThanOrEqual(36 - 1);

    // Save this page → the bar reports it, the submenu counts it.
    await openMenu(page).getByRole('menuitem', { name: 'Save this page as layout' }).click();
    await expect(editBar(page).locator('.aw-eb-status')).toContainText('Saved “Grid Layout 1”');
    await openEditBarMenu(page, 'layout');
    await openMenu(page).getByRole('menuitem', { name: 'Saved layouts (1)' }).click();
    const sub = await menuLabels(page);
    expect(sub[0]).toBe('Back');
    expect(allIn(sub, ['Grid Layout 1', 'Manage layouts…'])).toBe(true);
    // ArrowLeft goes back one level, Escape at the root closes.
    await page.keyboard.press('ArrowLeft');
    await expect(openMenu(page).getByRole('menuitem', { name: 'Save this page as layout' })).toBeVisible();
    await openMenu(page).getByRole('menuitem', { name: 'Saved layouts (1)' }).click();
    await openMenu(page).getByRole('menuitem', { name: 'Grid Layout 1' }).click();
    await expect(editBar(page).locator('.aw-eb-status')).toContainText('Applied “Grid Layout 1” to Grid');

    // Presets apply from the menu; the layout shortcuts undo/redo them.
    await openEditBarMenu(page, 'layout');
    await openMenu(page).getByRole('menuitemradio', { name: 'Studio' }).click();
    await expect(openMenu(page)).toContainText('Switch to “Studio”? This replaces your layout.');
    await openMenu(page).getByRole('menuitem', { name: 'Switch', exact: true }).click();
    await expect(editBarControl(page, 'layout')).toContainText('Studio');
    await page.keyboard.press('Control+z');
    await expect(editBarControl(page, 'layout')).toContainText('Default');
    await page.keyboard.press('Control+Shift+z');
    await expect(editBarControl(page, 'layout')).toContainText('Studio');
  });

  test('LAYOUT › Export this page downloads a package; Import… lists it under Saved layouts', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    const status = editBar(page).locator('.aw-eb-status');

    await openEditBarMenu(page, 'layout');
    const downloading = page.waitForEvent('download');
    await openMenu(page).getByRole('menuitem', { name: 'Export this page' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/\.json$/);
    const pkg = JSON.parse(readFileSync((await download.path())!, 'utf8'));
    expect(pkg.kind).toBe('workbench.pageLayout.package');
    await expect(status).toContainText('Exported “Grid”');

    // Import a fixture generated from that package under a distinct label.
    pkg.pageLayout.label = 'Imported Fixture';
    await openEditBarMenu(page, 'layout');
    const choosing = page.waitForEvent('filechooser');
    await openMenu(page).getByRole('menuitem', { name: 'Import…' }).click();
    const chooser = await choosing;
    await chooser.setFiles({ name: 'fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pkg)) });
    await expect(status).toContainText('Imported “Imported Fixture”');
    await openEditBarMenu(page, 'layout');
    await openMenu(page).getByRole('menuitem', { name: 'Saved layouts (1)' }).click();
    await expect(openMenu(page).getByRole('menuitem', { name: 'Imported Fixture' })).toBeVisible();

    // A file that is not a package is reported in the error chip.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await openEditBarMenu(page, 'layout');
    const choosingBad = page.waitForEvent('filechooser');
    await openMenu(page).getByRole('menuitem', { name: 'Import…' }).click();
    await (await choosingBad).setFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{nope') });
    await expect(editBar(page).locator('[role="alert"]')).toContainText('File is not valid JSON.');
  });

  test('LAYOUT › Backups › restore asks inline first', async ({ page }) => {
    await bootCleanWorkbench(page);
    // Seed a backup generation where the Axis backup store reads it (localStorage
    // `axs.workbench.doc.bak1`, newest slot); the LAYOUT menu lists backups on open.
    await page.evaluate(() => {
      const doc = JSON.parse(window.localStorage.getItem('axs.workbench.doc')!);
      window.localStorage.setItem(
        'axs.workbench.doc.bak1',
        JSON.stringify({ ...doc, rev: 3, updatedAt: '2026-01-02T03:04:05.000Z' })
      );
    });
    await enterEditMode(page);

    await openEditBarMenu(page, 'layout');
    await openMenu(page).getByRole('menuitem', { name: 'Backups' }).click();
    const restore = openMenu(page).getByRole('menuitem', { name: /layouts?$/ }).first();
    await restore.click();
    await expect(openMenu(page)).toContainText('Replace the current document with this backup?');
    await openMenu(page).getByRole('menuitem', { name: 'Cancel' }).click();
    await expect(restore).toBeVisible(); // nothing restored yet

    await restore.click();
    await openMenu(page).getByRole('menuitem', { name: 'Restore', exact: true }).click();
    await expect(openMenu(page)).toHaveCount(0);
    await expect(editBar(page).locator('.aw-eb-status')).toContainText(/Restored backup \d+\./);
  });

  test('Add menu: panel, custom panel, widget, page, library', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);

    await openEditBarMenu(page, 'add');
    expect(allIn(await menuLabels(page), ADD_ITEMS)).toBe(true);
    expect(await menuInViewport(page)).toBe(true);

    const navCount = await page.locator('[data-nav-entry]').count();
    // Add page is a submenu now: missing default pages (none here) · Blank page.
    await openMenu(page).getByRole('menuitem', { name: 'Add page' }).click();
    await expect(openMenu(page)).toContainText('All default pages are there');
    await openMenu(page).getByRole('menuitem', { name: 'Blank page' }).click();
    await expect(page.locator('[data-nav-entry]')).toHaveCount(navCount + 1);
    await expect(editBarControl(page, 'page')).toContainText(/Page \d+/);

    await openEditBarMenu(page, 'add');
    await openMenu(page).getByRole('menuitem', { name: 'Open library' }).click();
    await expect(page.locator('.aw-lib-drawer')).toBeVisible();
    await expect(page.locator('.aw-lib-drawer')).toContainText('Add Panel · To This Page');
  });

  test('profile control: Auto · Desktop · Tablet · Mobile, pinned choice pressed', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    for (const name of PROFILE_ITEMS) {
      await expect(editBar(page).getByRole('button', { name, exact: true })).toHaveCount(1);
    }
    await expect(editBar(page).getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(editBar(page).locator('[data-eb="profile"] button.resolved')).toHaveAttribute('aria-label', 'Desktop');
  });

  test('no page errors, console errors or Svelte warnings while using the bar', async ({ page }) => {
    const problems: string[] = [];
    page.on('pageerror', (err) => problems.push(`PAGEERROR: ${err.message}`));
    page.on('console', (msg) => {
      const text = msg.text();
      // The `/api` proxy fails without a ForgeFX backend (see 01-boot) — ignore those.
      const backend = /Failed to load resource|net::ERR|\b50[0-4]\b|Internal Server Error|\/api\b|forgefx|fetch/i.test(text);
      if (msg.type() === 'error' && !backend) problems.push(`error: ${text}`);
      if (msg.type() === 'warning' && /svelte|state_|effect_|ownership|binding_property/i.test(text)) problems.push(`warning: ${text}`);
    });

    await bootCleanWorkbench(page);
    await enterEditMode(page);
    for (const id of ['page', 'layout', 'add']) {
      await openEditBarMenu(page, id);
      await page.keyboard.press('Escape');
    }
    await openEditBarMenu(page, 'layout');
    await openMenu(page).getByRole('menuitem', { name: /^Saved layouts/ }).click();
    await openMenu(page).getByRole('menuitem', { name: 'Manage layouts…' }).click();
    await expect(page.locator('.aw-layout-drawer')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Tablet', exact: true }).click();
    await page.getByRole('button', { name: 'Auto', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await openEditBarMenu(page, 'more');
    await page.keyboard.press('Escape');
    await doneButtons(page).click();
    await page.waitForTimeout(300);
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('Done exits and the app returns to the top', async ({ page }) => {
    await bootCleanWorkbench(page);
    await enterEditMode(page);
    await doneButtons(page).click();
    await expect(editBar(page)).toHaveCount(0);
    await expect(page.locator('.aw-root.aw-editing')).toHaveCount(0);
    expect((await rect(page, '.aw-root'))!.y).toBe(0);
    expect((await rect(page, '.aw-rail'))!.y).toBe(0);
  });
});

test.describe('Edit bar · narrow windows', () => {
  test('@390: a rejected rename keeps the PAGE menu and its field open; the error takes the second row', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await bootCleanWorkbench(page);
    await enterEditMode(page);

    await openEditBarMenu(page, 'page');
    await openMenu(page).getByRole('menuitem', { name: 'Rename page…' }).click();
    const input = openMenu(page).locator('input[data-menu-input]');
    await input.fill('');
    await input.press('Enter');

    const error = editBar(page).locator('[role="alert"]');
    await expect(error).toContainText(/cannot be empty/i);
    // The menu and its field survive the state change.
    await expect(openMenu(page)).toBeVisible();
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    // PAGE stays in the bar (the chip is outside the single-row budget) …
    await expect(editBarControl(page, 'page')).toBeVisible();
    // … because the chip wraps onto its own second row.
    const chip = (await error.boundingBox())!;
    const trigger = (await editBarControl(page, 'page').boundingBox())!;
    expect(chip.y).toBeGreaterThanOrEqual(trigger.y + trigger.height - 1);
    expect((await editBar(page).boundingBox())!.height).toBeLessThanOrEqual(100);
    // The open menu follows the grown bar: it re-places below the second row
    // instead of covering the error chip.
    await expect
      .poll(async () => (await openMenu(page).boundingBox())!.y)
      .toBeGreaterThanOrEqual(chip.y + chip.height - 1);
  });

  for (const [w, h] of [
    [1100, 800],
    [834, 1112],
    [390, 844]
  ] as const) {
    test(`@${w}: fits, stays reachable, keeps one Done`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await bootCleanWorkbench(page);
      await collapseRail(page).catch(() => {});
      const view = (await rect(page, '.aw-root'))!;
      await enterEditMode(page);
      const bar = (await rect(page, '[data-editbar]'))!;
      const root = (await rect(page, '.aw-root'))!;

      expect(await noHorizontalOverflow(page)).toBe(true);
      expect(await barNotClipped(page)).toBe(true);
      await expect(doneButtons(page)).toHaveCount(1);
      expect(bar.x).toBe(0);
      expect(bar.y).toBe(0);
      expect(near(bar.width, w)).toBe(true);
      expect(near(root.y - view.y, bar.height)).toBe(true);
      const ws = (await rect(page, '.aw-workspace'))!;
      expect(bar.y + bar.height).toBeLessThanOrEqual(ws.y + 0.5);

      const sizes = await barButtonSizes(page);
      if (w >= 760) {
        expect(Math.round(bar.height)).toBe(36); // one row
      } else {
        expect(bar.height).toBeLessThanOrEqual(100); // at most two rows
        expect(sizes.every((s) => s.min >= 43)).toBe(true); // 44px touch controls
      }

      // Every group is either in the bar or reachable through ⋯ More.
      const visible = {
        page: (await editBarControl(page, 'page').count()) > 0,
        layout: (await editBarControl(page, 'layout').count()) > 0,
        profile: (await editBarControl(page, 'profile').count()) > 0,
        add: (await editBarControl(page, 'add').count()) > 0
      };
      const hasMore = (await editBarControl(page, 'more').count()) > 0;
      expect(hasMore).toBe(Object.values(visible).some((v) => !v));
      if (!hasMore) return;

      await openEditBarMenu(page, 'more');
      expect(await menuInViewport(page)).toBe(true);
      const more = await menuLabels(page);
      const wanted: Array<[keyof typeof visible, RegExp, string[]]> = [
        ['page', /^Page: /, PAGE_ITEMS],
        ['layout', /^Layout: /, LAYOUT_ITEMS],
        ['profile', /^Profile: /, PROFILE_ITEMS],
        ['add', /^Add$/, ADD_ITEMS]
      ];
      for (const [group, label, items] of wanted) {
        const inMore = more.some((l) => label.test(l));
        expect(visible[group] || inMore).toBe(true);
        if (!inMore) continue;
        if ((await openMenu(page).count()) === 0) await openEditBarMenu(page, 'more');
        await openMenu(page).getByRole('menuitem', { name: label }).click();
        const got = await menuLabels(page);
        expect(got[0]).toBe('Back');
        expect(allIn(got, items)).toBe(true);
        expect(await menuInViewport(page)).toBe(true);
        // Escape goes back one level, the next Escape closes.
        await page.keyboard.press('Escape');
        await expect(openMenu(page).getByRole('menuitem', { name: label })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(openMenu(page)).toHaveCount(0);
      }
    });
  }
});
