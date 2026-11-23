import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test';
import { boardSaves, bootBlockEditorMock, countBoardSaves, openAmpEditor, openMore, pickMore, selectTile, type BlockEditorMock } from './support/blockEditorMock';

// Block Editor slice 7: touch and the phone layout.
// - Touch gestures go through Chromium's real input pipeline (CDP `Input.dispatchTouchEvent`), so the
//   tiles' `touch-action` decides what the browser pans: Top = a sideways swipe scrolls the strip, a
//   vertical drag changes the value; Side (F11) and the phone layout = a vertical swipe scrolls, a
//   sideways drag changes the value. A swipe along the scroll axis never writes a value.
// - The phone layout re-wraps every page to 8 cells (at most four knobs a row, a knob about a quarter of
//   the width) and stacks the pages; reading it writes no board.
// The touch input comes through the Chrome DevTools Protocol: Chromium only.
test.skip(({ browserName }) => browserName !== 'chromium', 'CDP touch input is Chromium-only');

const board = (page: Page) => page.locator('[data-be-board]');
const tile = (page: Page, key: string) => page.locator(`[data-be-key="${key}"]`).first();
const ctxMenu = (page: Page) => page.getByRole('menu', { name: /^Control options/ });
const writesOf = (mock: BlockEditorMock, pid: number) => mock.writes.filter((w) => w.pid === pid);

type Pt = { x: number; y: number; id?: number };

/** One finger through the browser's input pipeline: down at `from`, `steps` moves to `to`, up. */
async function swipe(cdp: CDPSession, from: Pt, to: Pt, steps = 12) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= steps; i++) {
    const p = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** A still finger held for `ms`. */
async function hold(page: Page, cdp: CDPSession, at: Pt, ms: number) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const centre = async (l: Locator): Promise<Pt> => {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

/** Track how far the board scrolled from where it is now (largest distance along each axis). */
async function watchScroll(page: Page) {
  await page.evaluate(() => {
    const el = document.querySelector('[data-be-board]') as HTMLElement;
    const w = window as unknown as { __beMax: { l: number; t: number } };
    const base = { l: el.scrollLeft, t: el.scrollTop };
    w.__beMax = { l: 0, t: 0 };
    el.addEventListener('scroll', () => {
      w.__beMax = { l: Math.max(w.__beMax.l, Math.abs(el.scrollLeft - base.l)), t: Math.max(w.__beMax.t, Math.abs(el.scrollTop - base.t)) };
    });
  });
}
/** Wait until the board stops scrolling (a smooth scroll to a page, a fling). */
async function settle(page: Page) {
  await expect
    .poll(() =>
      board(page).evaluate(
        (el) =>
          new Promise<boolean>((res) => {
            const a = `${el.scrollLeft},${el.scrollTop}`;
            setTimeout(() => res(a === `${el.scrollLeft},${el.scrollTop}`), 150);
          })
      )
    )
    .toBe(true);
}
const scrolled = (page: Page) => page.evaluate(() => (window as unknown as { __beMax: { l: number; t: number } }).__beMax);

/** Knob tiles of one page: their widths and how many share each visual row. */
async function knobRows(page: Page, pg: string) {
  return page.evaluate((pg) => {
    const tiles = Array.from(document.querySelectorAll<HTMLElement>(`[data-be-grid][data-page="${pg}"] [data-be-view="knob"]`));
    const rows = new Map<number, number>();
    const widths: number[] = [];
    for (const t of tiles) {
      const r = t.getBoundingClientRect();
      rows.set(Math.round(r.top), (rows.get(Math.round(r.top)) ?? 0) + 1);
      widths.push(r.width);
    }
    return { count: tiles.length, perRow: [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, n]) => n), minWidth: Math.min(...widths) };
  }, pg);
}
/** Every page grid of the board: its page, columns, knob count, the most knobs on one visual row and the
 *  narrowest knob tile. */
async function everyGrid(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-be-board] [data-be-grid]')).map((g) => {
      const rows = new Map<number, number>();
      let minWidth = Infinity;
      const tiles = Array.from(g.querySelectorAll<HTMLElement>('[data-be-view="knob"]'));
      for (const t of tiles) {
        const r = t.getBoundingClientRect();
        rows.set(Math.round(r.top), (rows.get(Math.round(r.top)) ?? 0) + 1);
        minWidth = Math.min(minWidth, r.width);
      }
      return { page: g.dataset.page ?? '', cols: g.dataset.cols ?? '', count: tiles.length, maxPerRow: Math.max(0, ...rows.values()), minWidth };
    })
  );
}
/** Knob tiles at 390 px are 84 px wide, at 360 px 82 px: both at least 80 (a quarter of the width). */
const MIN_KNOB_TILE = 80;

/** The phone opens a block's editor with a tap near the cell's corner (its centre holds the bypass dot). */
async function openOnPhone(page: Page) {
  await page.locator('[data-idx="0,0"].cell.block').click({ position: { x: 6, y: 6 } });
  await expect(board(page)).toBeVisible();
  await expect(tile(page, 'k0')).toBeVisible();
}

/** Seed stored boards into the surface document and reload (like the previous editor's boards in spec 40):
 *  a custom profile "Wide" whose page holds one row of twelve knobs. */
async function seedWideBoard(page: Page, deviceClass: 'desktop' | 'phone') {
  const keys = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9', 'k13', 'k14'];
  const wide = { v: 2, pageOrder: ['Wide'], page: 'Wide', boards: { Wide: keys.map((key, i) => ({ id: 'w' + key, key, view: 'knob', x: i * 2, y: 0, w: 2, h: 2 })) } };
  const doc = {
    'axs.be1meta.Amp': JSON.stringify({ active: 'Wide', names: ['Default', 'Blank', 'Wide'], prefs: {}, migrated: true }),
    [`axs.be1.Amp.Wide.${deviceClass}`]: JSON.stringify(wide)
  };
  await page.evaluate((d) => localStorage.setItem('axs.surface.doc', JSON.stringify(d)), doc);
  await page.reload();
  await expect(page.locator('[data-idx="0,0"].cell.block')).toBeVisible();
}
const storedKeys = (page: Page) => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('axs.surface.doc') || '{}')).filter((k) => k.startsWith('axs.be1.')).sort());
const stored = (page: Page, key: string) => page.evaluate((k) => (JSON.parse(localStorage.getItem('axs.surface.doc') || '{}') as Record<string, string>)[k] ?? null, key);

test.describe('Block Editor touch (tablet profile)', () => {
  test.use({ hasTouch: true });
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 }); // the workbench's tablet profile
  });

  test('Top: a sideways swipe over a knob scrolls the strip and writes nothing; a vertical drag changes the value', async ({ page }) => {
    const mock = await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await expect(board(page)).toHaveAttribute('data-nav', 'top');
    await expect(tile(page, 'k1')).toHaveCSS('touch-action', 'pan-x pinch-zoom');
    const cdp = await page.context().newCDPSession(page);
    await watchScroll(page);
    const bass = await centre(tile(page, 'k1').locator('.be-dial'));
    await swipe(cdp, bass, { x: bass.x - 240, y: bass.y + 6 });
    await expect.poll(async () => (await scrolled(page)).l).toBeGreaterThan(40);
    await page.waitForTimeout(400); // longer than the write debounce
    expect(writesOf(mock, 1)).toEqual([]);

    // back to the start, then a vertical drag on the same knob
    await board(page).evaluate((el) => (el.scrollLeft = 0));
    await settle(page);
    const bass2 = await centre(tile(page, 'k1').locator('.be-dial'));
    await swipe(cdp, bass2, { x: bass2.x + 3, y: bass2.y - 60 });
    await expect.poll(() => writesOf(mock, 1).length).toBeGreaterThan(0);
    expect(writesOf(mock, 1).at(-1)!.value).toBeGreaterThan(0.5); // up = more (the knob started at 0.5)
  });

  test('Side (F11): a vertical swipe scrolls the pages and writes nothing; a sideways drag changes the value', async ({ page }) => {
    const mock = await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await pickMore(page, 'nav-side');
    await expect(board(page)).toHaveAttribute('data-nav', 'side');
    await expect(tile(page, 'k2')).toHaveCSS('touch-action', 'pan-y pinch-zoom');
    const cdp = await page.context().newCDPSession(page);
    await watchScroll(page);
    const mid = await centre(tile(page, 'k2').locator('.be-dial'));
    await swipe(cdp, mid, { x: mid.x + 6, y: mid.y - 200 });
    await expect.poll(async () => (await scrolled(page)).t).toBeGreaterThan(40);
    await page.waitForTimeout(400);
    expect(writesOf(mock, 2)).toEqual([]);

    await board(page).evaluate((el) => (el.scrollTop = 0));
    await settle(page);
    const mid2 = await centre(tile(page, 'k2').locator('.be-dial'));
    await swipe(cdp, mid2, { x: mid2.x + 60, y: mid2.y + 3 });
    await expect.poll(() => writesOf(mock, 2).length).toBeGreaterThan(0);
    expect(writesOf(mock, 2).at(-1)!.value).toBeGreaterThan(0.5); // right = more
  });

  test('a fader: a tap on its track sets the tapped value, a swipe along the strip writes nothing', async ({ page }) => {
    const mock = await bootBlockEditorMock(page);
    await openAmpEditor(page);
    const cdp = await page.context().newCDPSession(page);
    await page.locator('[data-be-tab="Power Amp"]').click();
    const track = tile(page, 'k15').locator('.be-vtrack');
    await expect(track).toBeVisible();
    const t = (await track.boundingBox())!;
    await watchScroll(page);
    await swipe(cdp, { x: t.x + t.width / 2, y: t.y + t.height / 2 }, { x: t.x + t.width / 2 + 200, y: t.y + t.height / 2 + 4 });
    await expect.poll(async () => (await scrolled(page)).l).toBeGreaterThan(40);
    await page.waitForTimeout(400);
    expect(writesOf(mock, 15)).toEqual([]);
    const t2 = (await track.boundingBox())!;
    await swipe(cdp, { x: t2.x + t2.width / 2, y: t2.y + t2.height * 0.25 }, { x: t2.x + t2.width / 2, y: t2.y + t2.height * 0.25 }, 1);
    await expect.poll(() => writesOf(mock, 15).length).toBeGreaterThan(0);
    expect(writesOf(mock, 15).at(-1)!.value).toBeGreaterThan(0.6); // a quarter from the top ≈ 0.75
  });

  test('a cancelled touch (pointercancel) ends the value drag: later moves change nothing', async ({ page }) => {
    const mock = await bootBlockEditorMock(page);
    await openAmpEditor(page);
    const p = await centre(tile(page, 'k3').locator('.be-dial'));
    await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y)!;
      const ev = (type: string, dy: number) =>
        new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: x, clientY: y + dy, pointerId: 9, pointerType: 'touch', isPrimary: true, button: type === 'pointermove' ? -1 : 0, buttons: 1 });
      el.dispatchEvent(ev('pointerdown', 0));
      for (const dy of [-4, -12, -24]) window.dispatchEvent(ev('pointermove', dy));
      window.dispatchEvent(ev('pointercancel', -24));
    }, p);
    await expect.poll(() => writesOf(mock, 3).length).toBeGreaterThan(0);
    await page.waitForTimeout(400);
    const n = writesOf(mock, 3).length;
    await page.evaluate(({ x, y }) => {
      for (const dy of [-40, -80, -120])
        window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y + dy, pointerId: 9, pointerType: 'touch', isPrimary: true, buttons: 1 }));
    }, p);
    await page.waitForTimeout(400);
    expect(writesOf(mock, 3)).toHaveLength(n);
  });

  test('two fingers: a second finger neither takes over nor ends the first one\'s value drag', async ({ page }) => {
    const mock = await bootBlockEditorMock(page);
    await openAmpEditor(page);
    const cdp = await page.context().newCDPSession(page);
    const a0 = await centre(tile(page, 'k1').locator('.be-dial'));
    const b0 = await centre(tile(page, 'k2').locator('.be-dial'));
    const a = (dy: number): Pt => ({ x: a0.x, y: a0.y - dy, id: 0 });
    const b = (dy: number): Pt => ({ x: b0.x, y: b0.y - dy, id: 1 });
    const touch = (type: string, touchPoints: Pt[]) => cdp.send('Input.dispatchTouchEvent', { type: type as 'touchStart', touchPoints });
    // finger A drags Bass up (Top: vertical = value) …
    await touch('touchStart', [a(0)]);
    for (let i = 1; i <= 6; i++) await touch('touchMove', [a(5 * i)]);
    // … finger B lands on Mid and both move up together (no pinch: the span stays)
    await touch('touchStart', [a(30), b(0)]);
    for (let i = 1; i <= 6; i++) await touch('touchMove', [a(30 + 3 * i), b(3 * i)]);
    // B lifts; A keeps dragging
    await touch('touchEnd', [b(18)]);
    for (let i = 1; i <= 4; i++) await touch('touchMove', [a(48 + 5 * i)]);
    await touch('touchEnd', []);
    await expect.poll(() => writesOf(mock, 1).length).toBeGreaterThan(0);
    await page.waitForTimeout(400); // longer than the write debounce
    expect(writesOf(mock, 2)).toEqual([]); // the second finger started nothing
    for (const w of writesOf(mock, 1)) {
      expect(w.value).toBeGreaterThan(0); // no flips to the extremes
      expect(w.value).toBeLessThan(1);
    }
    // 0.5 + (68 − 8 px slop) × 0.005 ≈ 0.8: the moves after B lifted still count (0.69 if B's release had ended the drag)
    expect(writesOf(mock, 1).at(-1)!.value).toBeGreaterThan(0.74);
  });

  test('a long-press opens the control menu; a quick tap on a row right after the release still works', async ({ page }) => {
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    const cdp = await page.context().newCDPSession(page);
    await hold(page, cdp, await centre(tile(page, 'k0').locator('.be-dial')), 750);
    const menu = ctxMenu(page);
    await expect(menu).toBeVisible();
    await expect(menu.locator('.be-ci-view')).toBeVisible(); // the tablet keeps the layout rows
    await page.waitForTimeout(400); // the finger's release closes nothing
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    // the click swallowed after a release is only the release's own: a fresh tap on a row goes through
    await hold(page, cdp, await centre(tile(page, 'k0').locator('.be-dial')), 750);
    await expect(menu).toBeVisible();
    const row = menu.locator('.be-ci-modifier');
    const r = await centre(row);
    await swipe(cdp, r, r, 1);
    await expect(menu).toHaveCount(0);
    await expect(page.locator('[data-screen-label="Modifier Editor"].flyout')).toHaveClass(/\bopen\b/);
  });

  test('Arrange at 1024×768: the grid map steps aside and the panel maximizes for three rows; Done restores it', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    const maximize = page.getByRole('button', { name: 'Maximize Block Editor' });
    const restore = page.getByRole('button', { name: 'Restore Block Editor' });
    await expect(maximize).toBeVisible();
    await expect(page.locator('.gridmap-wrap')).toBeVisible();
    await pickMore(page, 'arrange');
    await expect(page.locator('[data-be-arrange-bar]')).toBeVisible();
    await expect(page.locator('.gridmap-wrap')).toHaveCount(0); // the strip makes room for the arrange bar
    await expect(restore).toBeVisible(); // the editor maximized its panel
    const grid = page.locator('[data-be-grid][data-page="Authentic"]');
    const c = Number(await grid.getAttribute('data-c'));
    const g = Number(await grid.getAttribute('data-g'));
    await expect.poll(() => board(page).evaluate((el) => el.clientHeight)).toBeGreaterThanOrEqual(3 * (2 * c + g));
    await page.locator('[data-be-arrange-done]').click();
    await expect(page.locator('[data-be-arrange-bar]')).toHaveCount(0);
    await expect(maximize).toBeVisible(); // restored: the editor had maximized it
    await expect(page.locator('.gridmap-wrap')).toBeVisible();

    // a panel the user maximized stays maximized after Done
    await maximize.click();
    await expect(restore).toBeVisible();
    await pickMore(page, 'arrange');
    await page.locator('[data-be-arrange-done]').click();
    await expect(page.locator('[data-be-arrange-bar]')).toHaveCount(0);
    await expect(restore).toBeVisible();
  });

  test('Arrange with touch: a drag moves the tile, the resize handle is a 40 px target; the tablet keeps its own board', async ({ page }) => {
    // a desktop board first (an arrange step at the desktop size)
    await page.setViewportSize({ width: 1440, height: 900 });
    await bootBlockEditorMock(page);
    await openAmpEditor(page);
    await pickMore(page, 'arrange');
    await selectTile(page, 'k5'); // Master, the last knob of the first row (10, 0)
    await page.keyboard.press('ArrowRight');
    await expect(tile(page, 'k5')).toHaveAttribute('data-be-x', '11');
    await page.locator('[data-be-arrange-done]').click();
    await expect.poll(() => storedKeys(page)).toEqual(['axs.be1.Amp.Default.desktop']);
    const desktop = await stored(page, 'axs.be1.Amp.Default.desktop');

    // the tablet profile inherits it until it changes something there
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.reload();
    await openAmpEditor(page);
    await expect(tile(page, 'k5')).toHaveAttribute('data-be-x', '11');
    await pickMore(page, 'arrange');
    const grid = page.locator('[data-be-grid][data-page="Authentic"]');
    await expect(grid).toHaveAttribute('data-cols', '24');
    await expect(tile(page, 'k5')).toHaveCSS('touch-action', 'none');
    const step = Number(await grid.getAttribute('data-c')) + Number(await grid.getAttribute('data-g'));
    const g = (await grid.boundingBox())!;
    const t = (await tile(page, 'k5').boundingBox())!;
    const from = { x: t.x + step / 2, y: t.y + step / 2 };
    const cdp = await page.context().newCDPSession(page);
    await swipe(cdp, from, { x: g.x + 16 * step + step / 2, y: from.y }, 16);
    await expect(tile(page, 'k5')).toHaveAttribute('data-be-x', '16');
    await expect(tile(page, 'k5')).toHaveClass(/\bsel\b/);
    const handle = (await tile(page, 'k5').locator('[data-be-resize]').boundingBox())!;
    expect(Math.min(handle.width, handle.height)).toBeGreaterThanOrEqual(40);
    await page.locator('[data-be-arrange-done]').click();

    await expect.poll(() => storedKeys(page)).toEqual(['axs.be1.Amp.Default.desktop', 'axs.be1.Amp.Default.tablet']);
    const tablet = JSON.parse((await stored(page, 'axs.be1.Amp.Default.tablet'))!) as { boards: Record<string, { key?: string; x: number }[]> };
    expect(tablet.boards.Authentic!.find((it) => it.key === 'k5')!.x).toBe(16);
    expect(await stored(page, 'axs.be1.Amp.Default.desktop')).toBe(desktop); // the desktop board is untouched
  });
});

for (const vp of [
  { width: 390, height: 844 },
  { width: 360, height: 780 }
]) {
  test.describe(`Block Editor phone layout ${vp.width}×${vp.height}`, () => {
    test.use({ hasTouch: true });
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(vp);
    });

    test('at most four knobs a row, each about a quarter of the width; the pages stack and scroll; no Arrange; nothing written', async ({ page }) => {
      await countBoardSaves(page);
      const mock = await bootBlockEditorMock(page);
      await openOnPhone(page);
      await expect(board(page)).toHaveAttribute('data-nav', 'side');
      await expect(board(page)).toHaveClass(/\bphone\b/);
      // every page of the board
      const grids = await everyGrid(page);
      expect(grids.map((g) => g.page)).toEqual(['Authentic', 'Preamp', 'Power Amp', 'EQ', 'Dynamics', 'Advanced']);
      expect(grids.reduce((n, g) => n + g.count, 0)).toBeGreaterThan(0);
      for (const g of grids) {
        expect(g.cols, g.page).toBe('8');
        expect(g.maxPerRow, g.page).toBeLessThanOrEqual(4);
        if (g.count) expect(g.minWidth, g.page).toBeGreaterThanOrEqual(MIN_KNOB_TILE);
      }
      // the Authentic row of six knobs is now four + two
      expect((await knobRows(page, 'Authentic')).perRow.slice(0, 2)).toEqual([4, 2]);
      // header tabs navigate; a vertical swipe over the knobs scrolls the pages and changes nothing
      await expect(tile(page, 'k1')).toHaveCSS('touch-action', 'pan-y pinch-zoom');
      const cdp = await page.context().newCDPSession(page);
      await watchScroll(page);
      const bass = await centre(tile(page, 'k1').locator('.be-dial'));
      await swipe(cdp, bass, { x: bass.x + 4, y: bass.y - 220 });
      await expect.poll(async () => (await scrolled(page)).t).toBeGreaterThan(60);
      await page.waitForTimeout(400);
      expect(writesOf(mock, 1)).toEqual([]);
      await page.locator('[data-be-tab="Advanced"]').click();
      await expect(page.locator('[data-be-tab="Advanced"]')).toHaveAttribute('aria-selected', 'true');
      await expect(tile(page, 'k26')).toBeInViewport();
      await settle(page);
      // a sideways drag changes the value
      const sd = await centre(tile(page, 'k26').locator('.be-dial'));
      await swipe(cdp, sd, { x: sd.x + 50, y: sd.y + 2 });
      await expect.poll(() => writesOf(mock, 26).length).toBeGreaterThan(0);
      // no Arrange on the phone (F12)
      const menu = await openMore(page);
      await expect(menu.locator('.be-mi-arrange')).toHaveCount(0);
      await page.keyboard.press('Escape');
      // scrolled to the end, the last row sits clear of what floats over the board's bottom-right corner
      await board(page).evaluate((el) => (el.scrollTop = el.scrollHeight));
      await settle(page);
      const clear = await page.evaluate(() => {
        const bottom = Math.max(...Array.from(document.querySelectorAll('[data-be-board] [data-be-item]')).map((t) => t.getBoundingClientRect().bottom));
        const opener = document.querySelector('.aw-mobile-dock-indicator.right')?.getBoundingClientRect();
        const collapse = document.querySelector('button[title="Collapse bottom"]')?.getBoundingClientRect();
        return { bottom, opener: opener?.top ?? Infinity, collapse: collapse?.top ?? Infinity };
      });
      expect(clear.bottom).toBeLessThanOrEqual(clear.opener);
      expect(clear.bottom).toBeLessThanOrEqual(clear.collapse);
      // reading, scrolling and paging the phone view wrote no board
      expect(await boardSaves(page)).toBe(0);
      expect(await storedKeys(page)).toEqual([]);
    });

    test('a positioned device page: at most four knobs a row, every title over its group; nothing written', async ({ page }) => {
      await countBoardSaves(page);
      await bootBlockEditorMock(page, { positioned: true });
      await openOnPhone(page);
      const grids = await everyGrid(page);
      expect(grids.reduce((n, g) => n + g.count, 0)).toBeGreaterThan(0);
      for (const g of grids) {
        expect(g.cols, g.page).toBe('8');
        expect(g.maxPerRow, g.page).toBeLessThanOrEqual(4);
        if (g.count) expect(g.minWidth, g.page).toBeGreaterThanOrEqual(MIN_KNOB_TILE);
      }
      // GAIN over Drive, TONE over Bass … Presence, OUTPUT over Master and Bright, the Mixer rule over the
      // mixer knobs: each group lies between its title and the next one
      const tops = await page.evaluate(() => {
        const sec = document.querySelector('section[data-be-page="Authentic"]')!;
        const top = (el: Element | null) => (el ? el.getBoundingClientRect().top : NaN);
        const bottom = (el: Element | null) => (el ? el.getBoundingClientRect().bottom : NaN);
        const title = (name: string) => top(sec.querySelector(`[role="separator"][aria-label="${name}"]`));
        const tile = (key: string) => sec.querySelector(`[data-be-key="${key}"]`);
        return {
          titles: ['GAIN', 'TONE', 'OUTPUT', 'Mixer'].map(title),
          groups: [['k0'], ['k1', 'k2', 'k3', 'k4'], ['k5', 'e10'], ['k6', 'k7', 'k8']].map((keys) => keys.map((k) => [top(tile(k)), bottom(tile(k))]))
        };
      });
      tops.groups.forEach((group, i) => {
        const next = tops.titles[i + 1] ?? Infinity;
        for (const [t, b] of group) {
          expect(t).toBeGreaterThan(tops.titles[i]!);
          expect(b).toBeLessThanOrEqual(next);
        }
      });
      expect(await boardSaves(page)).toBe(0);
      expect(await storedKeys(page)).toEqual([]);
    });

    test('a long-press opens the control menu (pin and modifier, no layout rows)', async ({ page }) => {
      await bootBlockEditorMock(page);
      await openOnPhone(page);
      const cdp = await page.context().newCDPSession(page);
      await hold(page, cdp, await centre(tile(page, 'k0').locator('.be-dial')), 750);
      const menu = ctxMenu(page);
      await expect(menu).toBeVisible();
      await page.waitForTimeout(400); // the finger's release closes nothing
      await expect(menu).toBeVisible();
      await expect(menu.locator('.be-ci-modifier')).toBeVisible();
      await expect(menu.locator('.be-ci-view')).toHaveCount(0);
    });

    for (const cls of ['desktop', 'phone'] as const) {
      test(`a 12-knob row of a ${cls === 'desktop' ? 'desktop board the phone inherits' : 'phone board of its own'} shows as three rows of four; nothing written`, async ({ page }) => {
        await bootBlockEditorMock(page);
        await seedWideBoard(page, cls);
        await countBoardSaves(page);
        await page.reload();
        await expect(page.locator('[data-idx="0,0"].cell.block')).toBeVisible();
        await openOnPhone(page);
        await expect(page.locator('[data-be-tab]')).toHaveText(['Wide']);
        const r = await knobRows(page, 'Wide');
        expect(r.count).toBe(12);
        expect(r.perRow).toEqual([4, 4, 4]);
        expect(r.minWidth).toBeGreaterThanOrEqual(MIN_KNOB_TILE);
        // the stored board keeps its 24-cell row
        const kept = JSON.parse((await stored(page, `axs.be1.Amp.Wide.${cls}`))!) as { boards: { Wide: { x: number }[] } };
        expect(kept.boards.Wide.map((it) => it.x)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]);
        expect(await boardSaves(page)).toBe(0);
        expect(await storedKeys(page)).toEqual([`axs.be1.Amp.Wide.${cls}`]);
      });
    }
  });
}

test.describe('Block Editor controls: roles, values and the keyboard', () => {
  test('every control view says what it is; the select is a combobox the keyboard walks; Escape stays in the editor', async ({ page }) => {
    const mock = await bootBlockEditorMock(page, { positioned: true });
    await openAmpEditor(page);
    await page.getByRole('button', { name: 'Maximize Block Editor' }).click();
    const restore = page.getByRole('button', { name: 'Restore Block Editor' });
    await expect(restore).toBeVisible();

    await expect(tile(page, 'k0').getByRole('slider', { name: 'Drive' })).toHaveAttribute('aria-valuetext', /\S/);
    await expect(tile(page, 'k15').getByRole('slider', { name: 'Hum' })).toHaveAttribute('aria-orientation', 'vertical');
    await expect(tile(page, 'k9').getByRole('slider', { name: 'Depth' })).toBeVisible();
    await expect(tile(page, 'k16').getByRole('spinbutton', { name: 'Low Cut' })).toHaveAttribute('aria-valuenow', '20');
    await expect(tile(page, 'e10').getByRole('switch', { name: 'Bright' })).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('section[data-be-page="Authentic"]').getByRole('separator', { name: 'TONE' })).toHaveCount(1);

    // the select: Enter opens it on the current option, ↓ walks, Enter picks and gives the focus back
    const field = tile(page, 'e11').getByRole('combobox', { name: /Input Select/ });
    await expect(field).toHaveAttribute('aria-expanded', 'false');
    await field.focus();
    await page.keyboard.press('Enter');
    const list = page.getByRole('listbox');
    await expect(list).toBeVisible();
    await expect(field).toHaveAttribute('aria-expanded', 'true');
    await expect(field).toHaveAttribute('aria-controls', (await list.getAttribute('id'))!);
    await expect(list.getByRole('option', { name: 'Sum L+R' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(list.getByRole('option', { name: 'Left' })).toBeFocused();
    await expect(list.getByRole('option', { name: 'Left' })).toHaveCSS('outline-style', 'solid'); // the focus ring
    await page.keyboard.press('Enter');
    await expect(list).toHaveCount(0);
    await expect(field).toBeFocused();
    await expect.poll(() => writesOf(mock, 11).length).toBeGreaterThan(0);
    // reopened, the list takes the focus on the picked option (not the first one): one tab stop, on it
    await page.keyboard.press('Enter');
    await expect(list).toBeVisible();
    await expect(list.getByRole('option', { name: 'Left' })).toBeFocused();
    await expect(list.getByRole('option', { name: 'Left' })).toHaveAttribute('tabindex', '0');
    await expect(list.getByRole('option', { name: 'Sum L+R' })).toHaveAttribute('tabindex', '-1');
    // Escape closes the list back to the field and never reaches the app (the panel stays maximized)
    await page.keyboard.press('Escape');
    await expect(list).toHaveCount(0);
    await expect(field).toBeFocused();
    await expect(restore).toBeVisible();
    // Tab closes the list and moves on from the field (no write)
    const before = writesOf(mock, 11).length;
    await page.keyboard.press('Enter');
    await expect(list).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(list).toHaveCount(0);
    await expect(field).not.toBeFocused();
    expect(await page.evaluate(() => document.activeElement?.closest('[data-be-key]')?.getAttribute('data-be-key') ?? document.activeElement?.tagName)).not.toBe('BODY');
    expect(writesOf(mock, 11)).toHaveLength(before);
    await expect(restore).toBeVisible();
    // a keyboard focus ring on the switch
    await tile(page, 'e10').getByRole('switch').focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(tile(page, 'e10').getByRole('switch')).toHaveCSS('outline-style', 'solid');
  });
});

test.describe('Block Editor phone: find a control', () => {
  test.use({ hasTouch: true });
  test('a jump to a control lower down a tall page scrolls the control itself into view', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await bootBlockEditorMock(page);
    await openOnPhone(page);
    await page.locator('[data-be-find-toggle]').click();
    const pop = page.locator('[data-be-find]');
    await expect(pop).toBeVisible();
    await pop.locator('[data-be-find-input]').fill('release');
    await pop.locator('[data-be-find-row="k25"] .be-fmain').click();
    await expect(page.locator('[data-be-tab="Dynamics"]')).toHaveAttribute('aria-selected', 'true');
    await settle(page);
    await expect(page.locator('section[data-be-page="Dynamics"] [data-be-key="k25"]')).toBeInViewport({ ratio: 0.9 });
  });

  test('a shorter board (the on-screen keyboard while typing a value) keeps the scroll position', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await bootBlockEditorMock(page);
    await openOnPhone(page);
    await board(page).evaluate((el) => (el.scrollTop = 180)); // inside the first page (its third row)
    await settle(page);
    const before = await board(page).evaluate((el) => el.scrollTop);
    expect(before).toBeGreaterThan(100);
    await page.setViewportSize({ width: 390, height: 640 });
    await expect.poll(() => board(page).evaluate((el) => el.clientHeight)).toBeLessThan(404);
    await settle(page);
    expect(await board(page).evaluate((el) => el.scrollTop)).toBe(before);
    await expect(page.locator('[data-be-tab="Authentic"]')).toHaveAttribute('aria-selected', 'true');
  });
});
