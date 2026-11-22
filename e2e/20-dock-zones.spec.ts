import { test, expect, type Page } from '@playwright/test';
import { addCustomPanel, bootCleanWorkbench, collapseRail, editBarControl, enterEditMode, exitEditMode, openEditBarMenu, openMenu } from './support/workbench';

/**
 * UI rework slice 2 — visible dock zones. Mirrors the design harness checklist
 * (ui-rework/harness/scripts/test.mjs: dock / zone / edge / page / menu /
 * maximize / collapse) against the real shell at 1440×900:
 *   - a panel drag LIFTS the panel (its slot collapses, neighbours fill in),
 *   - the hovered stack shows five labelled zones (4 faint + 1 landing shape),
 *   - the panel lands EXACTLY on the highlighted rect, one drop = one undo step,
 *   - edges, empty region strips, small panels, nav pages, cancel,
 *   - Move to ▸ via the panel menu, maximize (double-click / Escape), collapse strips.
 */

type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

const center = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const near = (a: Rect | null, b: Rect | null, tol = 1) =>
  !!a &&
  !!b &&
  Math.abs(a.x - b.x) <= tol &&
  Math.abs(a.y - b.y) <= tol &&
  Math.abs(a.width - b.width) <= tol &&
  Math.abs(a.height - b.height) <= tol;
const fmt = (r: Rect | null) => (r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}` : 'null');

/** The tab stack holding a panel tab with this exact title. */
function stackOf(page: Page, title: string) {
  return page.locator('.aw-tabstack').filter({ has: page.locator('.aw-pane-tab', { hasText: new RegExp(`^${title}$`) }) });
}

function tabOf(page: Page, title: string) {
  return page.locator('.aw-pane-tab', { hasText: new RegExp(`^${title}$`) });
}

async function rectOf(page: Page, selector: string): Promise<Rect | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, selector);
}

async function stackRect(page: Page, title: string): Promise<Rect | null> {
  const box = await stackOf(page, title).first().boundingBox();
  return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
}

/** Signature of the whole dock: every stack's tabs + rounded rect, sorted. */
async function layoutSig(page: Page): Promise<string> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.aw-workspace .aw-tabstack')]
      .map((el) => {
        const r = el.getBoundingClientRect();
        const tabs = [...el.querySelectorAll('.aw-pane-tab, [data-pane-strip]')].map((t) => t.textContent?.trim()).join('+');
        return `${tabs}@${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`;
      })
      .sort()
      .join(' | ')
  );
}

interface OverlayInfo {
  land: Rect | null;
  landKey: string | null;
  landText: string | null;
  zones: string[];
  zoneLabels: string[];
  edgeBars: string[];
  card: string | null;
  page: { id: string | null; accepts: string | null } | null;
}

async function overlayInfo(page: Page): Promise<OverlayInfo> {
  return page.evaluate(() => {
    const R = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const land = document.querySelector<HTMLElement>('[data-dock-landing]');
    const label = document.querySelector<HTMLElement>('[data-dock-landing-label]');
    const pageEl = document.querySelector<HTMLElement>('[data-dock-page]');
    return {
      land: R(land),
      landKey: land?.dataset.dockLanding ?? null,
      landText: label ? label.innerText.replace(/\n/g, ' / ') : null,
      zones: [...document.querySelectorAll<HTMLElement>('[data-dock-zone]')].map((el) => el.dataset.dockZone ?? ''),
      zoneLabels: [...document.querySelectorAll<HTMLElement>('[data-dock-zone-label]')].map((el) => el.dataset.dockZoneLabel ?? ''),
      edgeBars: [...document.querySelectorAll<HTMLElement>('[data-dock-edge]')].map((el) => el.dataset.dockEdge ?? ''),
      card: document.querySelector<HTMLElement>('[data-dock-card]')?.innerText.replace(/\n/g, ' / ') ?? null,
      page: pageEl ? { id: pageEl.dataset.dockPage ?? null, accepts: pageEl.dataset.accepts ?? null } : null
    };
  });
}

/** Press on a panel tab and move past the 5px threshold: the drag (and the lift) is active. */
async function beginDrag(page: Page, title: string): Promise<void> {
  const tab = await tabOf(page, title).first().boundingBox();
  expect(tab, `tab ${title}`).toBeTruthy();
  const c = center(tab!);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 8, c.y + 8, { steps: 2 });
  await expect(page.locator('.aw-root.aw-dragging-panel')).toHaveCount(1);
  await expect(page.locator('[data-dock-overlay]')).toHaveCount(1);
}

/** Glide to a point (computed AFTER the lift), settle, read the overlay. Leaves the button down. */
async function hover(page: Page, to: Point): Promise<OverlayInfo> {
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.move(to.x, to.y);
  await page.waitForTimeout(60);
  return overlayInfo(page);
}

/** Full drag: begin, glide to `to()` (evaluated after the lift), read the overlay, release. */
async function dragTo(page: Page, title: string, to: () => Promise<Point>): Promise<OverlayInfo> {
  await beginDrag(page, title);
  const info = await hover(page, await to());
  await page.mouse.up();
  await expect(page.locator('.aw-root.aw-dragging-panel')).toHaveCount(0);
  return info;
}

/** Move a panel through its ⋯ menu: Move to ▸ <item>. */
async function moveViaMenu(page: Page, title: string, item: string): Promise<void> {
  await stackOf(page, title).locator('.aw-pane-btn[title="Panel actions"]').click();
  const menu = page.locator('.aw-context-menu');
  await menu.getByRole('menuitem', { name: /Move to/ }).click();
  await menu.getByRole('menuitem', { name: item }).click();
  await expect(menu).toHaveCount(0);
}

async function undo(page: Page): Promise<void> {
  await editBarControl(page, 'undo').click();
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`PAGEERROR: ${err.message}`));
  return errors;
}

const isBackendError = (text: string) =>
  /Failed to load resource/i.test(text) ||
  /net::ERR/i.test(text) ||
  /\b(500|502|503|504)\b/.test(text) ||
  /Internal Server Error/i.test(text) ||
  /\/api\b/.test(text) ||
  /forgefx/i.test(text) ||
  /fetch/i.test(text);

async function editReady(page: Page): Promise<void> {
  await bootCleanWorkbench(page);
  await enterEditMode(page);
  await collapseRail(page);
  await expect(stackOf(page, 'Block Editor')).toHaveCount(1);
  await expect(stackOf(page, 'Signal Grid')).toHaveCount(1);
}

test.describe('Dock zones (slice 2)', () => {
  test('a drag lifts the panel: its slot collapses and the neighbours fill the space; Escape cancels', async ({ page }) => {
    const errors = collectErrors(page);
    await editReady(page);
    const base = await layoutSig(page);
    const gridBefore = (await stackRect(page, 'Signal Grid'))!;

    await beginDrag(page, 'Block Editor');
    await expect(stackOf(page, 'Block Editor')).toHaveCount(0);
    await expect(page.locator('[data-empty-region="bottom"]')).toBeVisible();
    const gridLifted = (await stackRect(page, 'Signal Grid'))!;
    expect(gridLifted.height, `${fmt(gridBefore)} → ${fmt(gridLifted)}`).toBeGreaterThan(gridBefore.height + 100);

    await page.keyboard.press('Escape');
    await expect(page.locator('.aw-root.aw-dragging-panel')).toHaveCount(0);
    await page.mouse.up();
    await expect.poll(() => layoutSig(page)).toBe(base);
    await expect(page.locator('.aw-toast, [role="status"]').filter({ hasText: /Drag cancelled/i }).first()).toBeVisible();
    expect(errors.filter((e) => !isBackendError(e))).toEqual([]);
  });

  test('five labelled zones on the hovered panel; each lands exactly on the highlighted rect; undo restores in one step', async ({ page }) => {
    const errors = collectErrors(page);
    await editReady(page);
    const base = await layoutSig(page);

    const cases: [string, number, number][] = [
      ['right', 0.9, 0.5],
      ['left', 0.1, 0.5],
      ['top', 0.5, 0.18],
      ['bottom', 0.5, 0.88],
      ['center', 0.5, 0.5]
    ];
    for (const [zone, fx, fy] of cases) {
      const info = await dragTo(page, 'Block Editor', async () => {
        const g = (await stackRect(page, 'Signal Grid'))!;
        return { x: g.x + g.width * fx, y: g.y + g.height * fy };
      });
      expect(info.landKey, `zone ${zone}`).toBe(zone);
      // 4 faint zones + 1 landing shape, every zone labelled. "Add as tab" lands
      // on the whole stack, so the other four are fully covered: their boxes go,
      // their labels stay (on their own chips inside the landing shape).
      expect(info.zones.length, `zones for ${zone}: ${info.zones}`).toBe(zone === 'center' ? 0 : 4);
      expect(info.zones).not.toContain(zone);
      expect(info.zoneLabels.length + 1, `labels for ${zone}: ${info.zoneLabels}`).toBe(5);
      expect(info.landText ?? '').toContain(zone === 'center' ? 'Add as tab' : `Split ${zone}`);
      expect(info.card ?? '').toContain('Block Editor');
      expect(info.card ?? '').toContain(zone === 'center' ? 'Add as tab to Signal Grid' : `Split ${zone} of Signal Grid`);

      const after = await stackRect(page, 'Block Editor');
      expect(near(info.land, after), `zone ${zone}: landing ${fmt(info.land)} vs result ${fmt(after)}`).toBe(true);
      if (zone === 'center') await expect(stackOf(page, 'Signal Grid').locator('.aw-pane-tab')).toHaveCount(2);

      await undo(page);
      await expect.poll(() => layoutSig(page), { message: `undo after ${zone}` }).toBe(base);
    }
    expect(errors.filter((e) => !isBackendError(e))).toEqual([]);
  });

  test('edge dock and an empty region strip are targets that land on the highlighted rect', async ({ page }) => {
    await editReady(page);
    const base = await layoutSig(page);
    const ws = (await rectOf(page, '.aw-workspace'))!;

    const edge = await dragTo(page, 'Block Editor', async () => ({ x: ws.x + 10, y: ws.y + ws.height / 2 }));
    expect(edge.landKey).toBe('edge-left');
    expect(edge.landText ?? '').toContain('Dock left');
    // The other three edge bars stay; the active one is replaced by the landing shape.
    expect(edge.edgeBars.sort()).toEqual(['bottom', 'right', 'top']);
    const docked = await stackRect(page, 'Block Editor');
    expect(near(edge.land, docked), `${fmt(edge.land)} vs ${fmt(docked)}`).toBe(true);
    expect(Math.abs(docked!.x - ws.x)).toBeLessThanOrEqual(2);
    await expect(page.locator('.aw-tabstack[data-region="left"]')).toHaveCount(1);
    await undo(page);
    await expect.poll(() => layoutSig(page)).toBe(base);

    const strip = await dragTo(page, 'Block Editor', async () => center((await rectOf(page, '[data-empty-region="top"]'))!));
    expect(strip.landKey).toBe('edge-top');
    const top = await stackRect(page, 'Block Editor');
    expect(near(strip.land, top), `${fmt(strip.land)} vs ${fmt(top)}`).toBe(true);
    await expect(page.locator('.aw-tabstack[data-region="top"]')).toHaveCount(1);
    expect(top!.y).toBeLessThan((await stackRect(page, 'Signal Grid'))!.y);
    await undo(page);
    await expect.poll(() => layoutSig(page)).toBe(base);
  });

  test('a small panel only offers "Add as tab"', async ({ page }) => {
    await editReady(page);
    // Shrink the bottom region to its 120px minimum with its resize handle.
    const handle = (await rectOf(page, '.aw-region-bottom .aw-region-resize'))!;
    const h = center(handle);
    await page.mouse.move(h.x, h.y);
    await page.mouse.down();
    await page.mouse.move(h.x, h.y + 300, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => (await stackRect(page, 'Block Editor'))!.height).toBeLessThan(150);

    await beginDrag(page, 'Signal Grid');
    const info = await hover(page, center((await stackRect(page, 'Block Editor'))!));
    expect(info.landKey).toBe('center');
    expect(info.zones).toEqual([]);
    expect(info.zoneLabels).toEqual([]);
    expect(info.landText ?? '').toContain('Add as tab');
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(stackOf(page, 'Signal Grid')).toHaveCount(1);
  });

  test('releasing over no target cancels with the layout restored', async ({ page }) => {
    await editReady(page);
    const base = await layoutSig(page);
    const info = await dragTo(page, 'Block Editor', async () => center((await rectOf(page, '.aw-topbar'))!));
    expect(info.land).toBeNull();
    expect(info.card ?? '').toMatch(/cancel/i);
    await expect.poll(() => layoutSig(page)).toBe(base);
    await expect(page.getByText(/Drag cancelled/i).first()).toBeVisible();
  });

  test('dropping on another page nav entry moves the panel there; the current page is refused', async ({ page }) => {
    await editReady(page);
    const base = await layoutSig(page);
    const scenesEntry = page.locator('[data-nav-entry="scenes"]');
    const scenesPage = await scenesEntry.getAttribute('data-nav-page');
    expect(scenesPage).toBeTruthy();

    const info = await dragTo(page, 'Block Editor', async () => center((await scenesEntry.boundingBox())!));
    expect(info.page).toEqual({ id: scenesPage, accepts: 'true' });
    expect(info.card ?? '').toContain('Move to page Scenes');
    await expect(stackOf(page, 'Block Editor')).toHaveCount(0);
    await expect(page.getByText('Moved Block Editor to Scenes').first()).toBeVisible();
    // The active page did not change.
    await expect(page.locator('[data-nav-entry="grid"][data-nav-active="true"]')).toHaveCount(1);

    await collapseRail(page);
    await page.locator('[data-nav-entry="scenes"] button.axis-nav-entry').click();
    await expect(stackOf(page, 'Block Editor')).toHaveCount(1);
    await collapseRail(page);
    await page.locator('[data-nav-entry="grid"] button.axis-nav-entry').click();
    await collapseRail(page);
    await undo(page);
    await expect.poll(() => layoutSig(page)).toBe(base);

    // The current page's entry is refused: nothing moves.
    const grid = page.locator('[data-nav-entry="grid"]');
    const refused = await dragTo(page, 'Signal Grid', async () => center((await grid.boundingBox())!));
    expect(refused.page?.accepts).toBe('false');
    expect(refused.card ?? '').toContain('Already on this page');
    await expect.poll(() => layoutSig(page)).toBe(base);
  });

  test('Move to ▸ Right dock and Move to ▸ another page work from the panel menu', async ({ page }) => {
    await editReady(page);
    const base = await layoutSig(page);
    const ws = (await rectOf(page, '.aw-workspace'))!;
    const menu = page.locator('.aw-context-menu');

    await stackOf(page, 'Block Editor').locator('.aw-pane-btn[title="Panel actions"]').click();
    await menu.getByRole('menuitem', { name: /Move to/ }).click();
    await menu.getByRole('menuitem', { name: 'Right dock' }).click();
    await expect(page.locator('.aw-tabstack[data-region="right"]')).toHaveCount(1);
    const right = (await stackRect(page, 'Block Editor'))!;
    expect(Math.abs(right.x + right.width - (ws.x + ws.width))).toBeLessThanOrEqual(2);
    await undo(page);
    await expect.poll(() => layoutSig(page)).toBe(base);

    await stackOf(page, 'Block Editor').locator('.aw-pane-btn[title="Panel actions"]').click();
    await menu.getByRole('menuitem', { name: /Move to/ }).click();
    await expect(menu.getByRole('menuitem', { name: /^Page: Grid/ })).toHaveCount(0); // not the current page
    await menu.getByRole('menuitem', { name: 'Page: Scenes' }).click();
    await expect(stackOf(page, 'Block Editor')).toHaveCount(0);
    await expect(page.getByText('Moved Block Editor to Scenes').first()).toBeVisible();
    await undo(page);
    await expect.poll(() => layoutSig(page)).toBe(base);
  });

  test('double-click a tab maximizes over the workspace; Escape restores', async ({ page }) => {
    await editReady(page);
    const base = await layoutSig(page);
    const ws = (await rectOf(page, '.aw-workspace'))!;

    await tabOf(page, 'Block Editor').dblclick();
    const maximized = page.locator('.aw-tabstack[data-maximized="true"]');
    await expect(maximized).toHaveCount(1);
    await expect.poll(async () => near(await stackRect(page, 'Block Editor'), ws, 2)).toBe(true);
    await expect(stackOf(page, 'Block Editor').locator('[data-pane-maximize]')).toHaveAttribute('aria-label', 'Restore Block Editor');

    await page.keyboard.press('Escape');
    await expect(maximized).toHaveCount(0);
    await expect.poll(() => layoutSig(page)).toBe(base);
  });

  test('collapse leaves a slim labelled strip; clicking the strip expands it', async ({ page }) => {
    await editReady(page);
    const base = await layoutSig(page);
    const gridBefore = (await stackRect(page, 'Signal Grid'))!;

    await page.locator('[aria-label="Collapse Block Editor"]').click();
    const strip = page.locator('[data-pane-strip]');
    await expect(strip).toBeVisible();
    await expect(strip).toContainText('Block Editor');
    const stripBox = (await strip.boundingBox())!;
    expect(stripBox.height).toBeLessThanOrEqual(48);
    // The sibling (main) takes the freed space.
    expect((await stackRect(page, 'Signal Grid'))!.height).toBeGreaterThan(gridBefore.height + 100);

    await strip.click();
    await expect(strip).toHaveCount(0);
    expect((await stackRect(page, 'Block Editor'))!.height).toBeGreaterThan(100);
    await expect.poll(() => layoutSig(page)).toBe(base);
  });

  test('a library panel dragged out of the drawer uses the same zones and lands on the highlighted rect', async ({ page }) => {
    await editReady(page);
    await openEditBarMenu(page, 'page');
    await openMenu(page).getByRole('menuitem', { name: 'Manage pages and templates…' }).click();
    await expect(page.locator('.aw-lib-drawer')).toBeVisible();
    // A non-singleton template (a Block Editor copy would be refused as a duplicate).
    const grab = page.locator('.aw-lib-row.saved .aw-lib-grab').filter({ hasText: 'Custom Panel' }).first();
    test.skip((await grab.count()) === 0, 'no Custom Panel template in the library');
    const stacksBefore = await page.locator('.aw-workspace .aw-tabstack').count();

    await grab.scrollIntoViewIfNeeded();
    await grab.hover();
    const g = (await grab.boundingBox())!;
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + g.width / 2 - 8, g.y + g.height / 2 + 8, { steps: 2 });
    await expect(page.locator('.aw-root.aw-dragging-panel')).toHaveCount(1);
    await expect(page.locator('.aw-lib-drawer')).toHaveCount(0); // the drawer collapses on activation
    const grid = (await stackRect(page, 'Signal Grid'))!;
    const info = await hover(page, { x: grid.x + grid.width * 0.9, y: grid.y + grid.height * 0.5 });
    expect(info.landKey).toBe('right');
    expect(info.zones.length).toBe(4);
    await page.mouse.up();

    await expect(page.locator('.aw-workspace .aw-tabstack')).toHaveCount(stacksBefore + 1);
    const rects = await page.evaluate(() =>
      [...document.querySelectorAll('.aw-workspace .aw-tabstack')].map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      })
    );
    expect(rects.some((r) => near(r, info.land)), `landing ${fmt(info.land)} vs ${rects.map(fmt).join(' | ')}`).toBe(true);
  });

  test('a singleton template dropped from the library moves the existing panel instead of being refused', async ({ page }) => {
    await editReady(page);
    await openEditBarMenu(page, 'page');
    await openMenu(page).getByRole('menuitem', { name: 'Manage pages and templates…' }).click();
    // Block Editor is a singleton that is already docked: its template used to be
    // refused as a duplicate; the catalog now moves the one instance to the drop.
    const grab = page.locator('.aw-lib-row.saved .aw-lib-grab').filter({ hasText: 'Block Editor' }).first();
    test.skip((await grab.count()) === 0, 'no Block Editor template in the library');
    await grab.scrollIntoViewIfNeeded();
    await grab.hover();
    const g = (await grab.boundingBox())!;
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + g.width / 2 - 8, g.y + g.height / 2 + 8, { steps: 2 });
    await expect(page.locator('.aw-root.aw-dragging-panel')).toHaveCount(1);
    const grid = (await stackRect(page, 'Signal Grid'))!;
    await hover(page, { x: grid.x + grid.width * 0.9, y: grid.y + grid.height * 0.5 });
    await page.mouse.up();

    await expect(page.locator('[data-editbar] [role="alert"]')).toHaveCount(0);
    await expect(page.getByText(/Drag cancelled/i)).toHaveCount(0);
    // Still exactly one Block Editor, now beside the Signal Grid (moved out of the bottom dock).
    await expect(page.locator('.aw-workspace .aw-pane-tab').filter({ hasText: 'Block Editor' })).toHaveCount(1);
    await expect(page.locator('.aw-tabstack[data-region="bottom"]')).toHaveCount(0);
  });

  test('an edge drop on an occupied region lands exactly on its outer half', async ({ page }) => {
    await editReady(page);
    await moveViaMenu(page, 'Block Editor', 'Left dock');
    await expect(page.locator('.aw-tabstack[data-region="left"]')).toHaveCount(1);
    const ws = (await rectOf(page, '.aw-workspace'))!;

    const info = await dragTo(page, 'Signal Grid', async () => ({ x: ws.x + 10, y: ws.y + ws.height * 0.6 }));
    expect(info.landKey).toBe('edge-left');
    expect(info.card ?? '').toContain('Dock left · outer edge');
    const after = await stackRect(page, 'Signal Grid');
    expect(near(info.land, after), `${fmt(info.land)} vs ${fmt(after)}`).toBe(true);
    expect(Math.abs(after!.x - ws.x)).toBeLessThanOrEqual(1);
    // Block Editor shares the left region, on the inner side.
    await expect(page.locator('.aw-tabstack[data-region="left"]')).toHaveCount(2);
    expect((await stackRect(page, 'Block Editor'))!.x).toBeGreaterThan(after!.x + after!.width);
  });

  test('a drop into a collapsed region expands it and lands exactly', async ({ page }) => {
    await editReady(page);
    await moveViaMenu(page, 'Block Editor', 'Left dock');
    await page.locator('.aw-region-left .aw-region-collapse').click();
    await expect(page.locator('.aw-region-left.collapsed')).toHaveCount(1);
    await expect(stackOf(page, 'Block Editor')).toHaveCount(0);
    const ws = (await rectOf(page, '.aw-workspace'))!;

    const info = await dragTo(page, 'Signal Grid', async () => ({ x: ws.x + 10, y: ws.y + ws.height * 0.6 }));
    expect(info.landKey).toBe('edge-left');
    // The landing is the expanded region's outer half, not a sliver of the strip.
    expect(info.land!.width).toBeGreaterThan(100);
    await expect(page.locator('.aw-region-left.collapsed')).toHaveCount(0);
    const after = await stackRect(page, 'Signal Grid');
    expect(near(info.land, after), `${fmt(info.land)} vs ${fmt(after)}`).toBe(true);
    await expect(stackOf(page, 'Block Editor')).toHaveCount(1);
  });

  test('a tab bar at the workspace top inserts a tab instead of docking to the top edge', async ({ page }) => {
    await editReady(page);
    await moveViaMenu(page, 'Block Editor', 'Right dock');
    const ws = (await rectOf(page, '.aw-workspace'))!;
    const pill = (await tabOf(page, 'Block Editor').boundingBox())!;
    // The pill sits inside the 24px top edge strip.
    expect(pill.y + pill.height / 2 - ws.y).toBeLessThan(24);

    const info = await dragTo(page, 'Signal Grid', async () => {
      const p = (await tabOf(page, 'Block Editor').boundingBox())!;
      return { x: p.x + p.width + 12, y: p.y + p.height / 2 };
    });
    expect(info.landKey).toBe('tab');
    expect(info.card ?? '').toContain('Add as tab to Block Editor');
    await expect(page.locator('.aw-tabstack[data-region="right"] .aw-pane-tab')).toHaveText([/Block Editor/, /Signal Grid/]);
    const after = await stackRect(page, 'Signal Grid');
    expect(near(info.land, after), `${fmt(info.land)} vs ${fmt(after)}`).toBe(true);
  });

  test('Escape closes an app overlay first; the next Escape restores the maximized panel', async ({ page }) => {
    await bootCleanWorkbench(page);
    await collapseRail(page);
    await tabOf(page, 'Signal Grid').dblclick();
    const maximized = page.locator('.aw-tabstack[data-maximized="true"]');
    await expect(maximized).toHaveCount(1);

    // The command palette (the top-bar "Add block" widget) — an app-level overlay.
    await page.locator('.axis-widget.add').first().click();
    const palette = page.getByPlaceholder(/Search amps/);
    await expect(palette).toBeVisible();
    // Escape from outside the palette's own field: only the app's Escape chain
    // (on window) can close it — the maximize must not take the key first.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    await page.keyboard.press('Escape');
    await expect(palette).toHaveCount(0);
    await page.waitForTimeout(50); // past the deferred maximize check
    await expect(maximized).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(maximized).toHaveCount(0);
  });

  test('lifting the active tab of a multi-tab stack mounts no other tab while dragging', async ({ page }) => {
    await editReady(page);
    await addCustomPanel(page); // main = [Signal Grid, Custom Panel], Custom Panel active
    const main = page.locator('.aw-tabstack[data-region="main"]');
    await expect(main.locator('.aw-pane-tab')).toHaveCount(2);

    await beginDrag(page, 'Custom Panel');
    // The stack stays (Signal Grid's pill), but its body is held empty: no panel mounts.
    await expect(main.locator('.aw-pane-tab')).toHaveText([/Signal Grid/]);
    await expect(main.locator('[data-tabbody-held]')).toHaveCount(1);
    await expect(main.locator('.aw-panel')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(main.locator('.aw-pane-tab')).toHaveCount(2);
    await expect(main.locator('[data-tabbody-held]')).toHaveCount(0);
  });

  test('collapse moves focus to the strip and expand back to the tab; handles beside a strip are inert', async ({ page }) => {
    await editReady(page);
    // Put Block Editor under Signal Grid in a split so a handle sits beside it.
    const info = await dragTo(page, 'Block Editor', async () => {
      const g = (await stackRect(page, 'Signal Grid'))!;
      return { x: g.x + g.width * 0.5, y: g.y + g.height * 0.88 };
    });
    expect(info.landKey).toBe('bottom');
    const handle = page.locator('.aw-workspace .aw-split-handle');
    await expect(handle).toHaveCount(1);
    await expect(handle).not.toHaveAttribute('data-split-handle-inert', 'true');

    await page.locator('[aria-label="Collapse Block Editor"]').click();
    const strip = page.locator('[data-pane-strip]');
    await expect(strip).toBeFocused();
    await expect(handle).toHaveAttribute('data-split-handle-inert', 'true');
    expect(await handle.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');

    await page.keyboard.press('Enter');
    await expect(strip).toHaveCount(0);
    await expect(tabOf(page, 'Block Editor')).toBeFocused();
    await expect(handle).not.toHaveAttribute('data-split-handle-inert', 'true');
  });

  test('collapse and maximize also work outside edit mode', async ({ page }) => {
    const errors = collectErrors(page);
    await bootCleanWorkbench(page);
    await collapseRail(page);
    const ws = (await rectOf(page, '.aw-workspace'))!;

    await stackOf(page, 'Block Editor').locator('[data-pane-maximize]').click();
    await expect.poll(async () => near(await stackRect(page, 'Block Editor'), ws, 2)).toBe(true);
    await stackOf(page, 'Block Editor').locator('[data-pane-maximize]').click();
    await expect(page.locator('.aw-tabstack[data-maximized="true"]')).toHaveCount(0);

    await tabOf(page, 'Signal Grid').dblclick();
    await expect(page.locator('.aw-tabstack[data-maximized="true"]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.aw-tabstack[data-maximized="true"]')).toHaveCount(0);

    await page.locator('[aria-label="Collapse Block Editor"]').click();
    await expect(page.locator('[data-pane-strip]')).toBeVisible();
    await page.locator('[data-pane-strip]').click();
    await expect(page.locator('[data-pane-strip]')).toHaveCount(0);

    // Entering and leaving edit mode keeps the dock intact.
    await enterEditMode(page);
    await exitEditMode(page);
    await expect(stackOf(page, 'Block Editor')).toHaveCount(1);
    expect(errors.filter((e) => !isBackendError(e))).toEqual([]);
  });
});
