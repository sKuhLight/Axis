import { test, expect, type CDPSession, type Locator, type Page } from '@playwright/test';
import { AMP_EID, bootBlockEditorMock, openLibrary, pickMore, selectTile, type BlockEditorMock } from './support/blockEditorMock';
import { COMP_EID, DELAY_EID, LOOPER_EID } from './support/graphBlocks';

// Read-only graph tiles (AXIS-89): the server serves `visuals` per block (role → param id, narrowed to the
// block's type) and keys the layout's graph slots; the Block Editor draws them from the values its knobs
// hold. Synthetic blocks in row 1 of the mocked grid (support/graphBlocks.ts): a compressor with a keyed
// graph slot, a tremolo (tempo-synced LFO, the device tempo is 90 bpm), a filter (response + LFO pages),
// a gate without a graph slot, a delay without a device layout, and the controllers (LFO 1 / 2, ADSR 1).

type Pt = { x: number; y: number };
const board = (page: Page) => page.locator('[data-be-board]');
const tile = (page: Page, key: string) => page.locator(`[data-be-key="${key}"]`).first();
const graph = (page: Page, key: string) => page.locator(`[data-be-graph="${key}"]`).first();
const mainPath = (page: Page, key: string) => graph(page, key).locator('path.be-gline.t-main').first();

/** Open the block at row 1, column `col` (the graph blocks). */
async function openBlock(page: Page, col: number, opts: { phone?: boolean } = {}) {
  await page.locator(`[data-idx="1,${col}"].cell.block`).click(opts.phone ? { position: { x: 6, y: 6 } } : undefined);
  await expect(board(page)).toBeVisible();
  await expect(page.locator('[data-be-board] [data-be-item]').first()).toBeVisible();
}
const ariaOf = (l: Locator) => l.getAttribute('aria-label');
/** The library group a row is listed under. */
const libGroupOf = (page: Page, key: string) =>
  page.evaluate((key) => {
    let group = '';
    for (const el of Array.from(document.querySelectorAll('[data-be-library] .be-llist > *'))) {
      if (el.classList.contains('be-lgroup')) group = el.textContent?.trim() ?? '';
      else if ((el as HTMLElement).dataset.beLibRow === key) return group;
    }
    return null;
  }, key);
const writesOf = (mock: BlockEditorMock, eid: number) => mock.graphWrites[eid] ?? [];

/** Collect the page's errors (uncaught exceptions and console errors) — e.g. a Svelte effect that re-runs
 *  itself (`effect_update_depth_exceeded`). Aborted / mocked-away requests are not app errors. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|net::ERR_/i.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function swipe(cdp: CDPSession, from: Pt, to: Pt, steps = 12) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test.describe('Block Editor graph tiles (AXIS-89)', () => {
  let errors: string[] = [];
  test.beforeEach(({ page }) => {
    errors = watchErrors(page);
  });
  test.afterEach(() => {
    expect(errors, 'no page errors').toEqual([]);
  });
  test('compressor: the graph sits at its layout slot, its name tells the values, a threshold change redraws it and the graph writes nothing', async ({ page }) => {
    const mock = await bootBlockEditorMock(page, { graphs: true });
    await openBlock(page, 0);
    const t = page.locator('section[data-be-page="Basic"] [data-be-key="graph:dynamics"]');
    await expect(t).toBeVisible();
    // the slot after Threshold / Ratio / Attack / Release (four knobs = 8 cells) on the first row
    await expect(t).toHaveAttribute('data-be-x', '8');
    await expect(t).toHaveAttribute('data-be-y', '0');
    await expect(t).toHaveAttribute('data-be-view', 'graph');
    const g = graph(page, 'dynamics');
    await expect(g).toHaveAttribute('role', 'img');
    await expect(g).toHaveAttribute('aria-label', /^Compressor curve: threshold [−-]18 dB, ratio 4.*knee medium.*level \+?2 dB.*mix 100%/);
    // its notes are its accessible description
    const notesId = await g.getAttribute('aria-describedby');
    expect(notesId).toBeTruthy();
    await expect(page.locator(`[id="${notesId}"]`)).toContainText('Static curve only');
    const before = { aria: await ariaOf(g), d: await mainPath(page, 'dynamics').getAttribute('d') };
    // raise the threshold with the keyboard on its knob
    const dial = tile(page, 'k0').locator('.be-dial');
    await dial.focus();
    for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowUp');
    await expect.poll(() => ariaOf(g)).not.toBe(before.aria);
    await expect.poll(() => mainPath(page, 'dynamics').getAttribute('d')).not.toBe(before.d);
    // only the threshold was written; reading the graph wrote nothing
    await expect.poll(() => writesOf(mock, COMP_EID).length).toBeGreaterThan(0);
    expect(new Set(writesOf(mock, COMP_EID).map((w) => w.pid))).toEqual(new Set([0]));
  });

  test('compressor: knee and mix redraw the curve; a sustain-only type draws no invented curve', async ({ page }) => {
    const mock = await bootBlockEditorMock(page, { graphs: true });
    await openBlock(page, 0);
    const g = graph(page, 'dynamics');
    await expect(g).toHaveAttribute('aria-label', /knee medium/);
    // knee → HARD (the board's select)
    await tile(page, 'e5').locator('button').first().click();
    await page.getByRole('option', { name: 'HARD', exact: true }).click();
    await expect(g).toHaveAttribute('aria-label', /knee hard/);
    // mix down: the label and the curve follow
    const d = await mainPath(page, 'dynamics').getAttribute('d');
    await tile(page, 'k11').locator('.be-dial').focus();
    for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowDown');
    await expect.poll(() => ariaOf(g)).not.toMatch(/mix 100%/);
    await expect.poll(() => mainPath(page, 'dynamics').getAttribute('d')).not.toBe(d);
    // a sustain-only type: the same slot, gain reduction only, no curve
    mock.compSustainOnly = true;
    await page.locator('[data-idx="0,0"].cell.block').click();
    await openBlock(page, 0);
    await expect(g).toHaveAttribute('aria-label', /no static curve/);
    await expect(g.locator('.be-gempty')).toHaveText('No static curve for this type');
    await expect(g.locator('path.be-gline.t-main')).toHaveCount(0);
  });

  test('meters start off and a visible compressor graph asks for gain reduction when enabled', async ({ page }) => {
    await bootBlockEditorMock(page, { graphs: true });
    await openBlock(page, 0);
    const toggle = page.locator('button.meter-toggle').first();
    await expect(toggle).not.toHaveClass(/\bon\b/);
    const gr = graph(page, 'dynamics').locator('[data-be-graph-gr]');
    await expect(gr).toHaveCount(0);
    await toggle.click();
    await expect(gr).toBeVisible();
    await expect(gr).toContainText('6.0');
    // METER OFF: no stale reading stays on the graph
    await toggle.click();
    await expect(gr).toHaveCount(0);
    await expect(graph(page, 'dynamics')).toBeVisible();
  });

  test('Looper loads its waveform with Meter off without polling audio meters for the Looper', async ({ page }) => {
    await bootBlockEditorMock(page, { graphs: true });
    const toggle = page.locator('button.meter-toggle').first();
    await expect(toggle).not.toHaveClass(/\bon\b/);
    const meterReads: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.pathname.endsWith('/preset/monitors/live')) meterReads.push(url.searchParams.get('eid') ?? '');
    });
    const waveform = page.waitForResponse((res) => {
      const url = new URL(res.url());
      return url.pathname.endsWith('/preset/looper') && url.searchParams.get('eid') === String(LOOPER_EID);
    });
    await page.locator('[data-idx="2,0"].cell.block').click();
    const tile = page.locator('section[data-be-page="Looper"] [data-be-key="wave"]');
    await expect(tile).toBeVisible();
    await waveform;
    await expect(tile.locator('.be-wbar').first()).toBeVisible();
    expect(meterReads).not.toContain(String(LOOPER_EID));
  });

  test('a gain reduction-only graph follows METER', async ({ page }) => {
    const mock = await bootBlockEditorMock(page, { graphs: true });
    mock.compSustainOnly = true;
    await openBlock(page, 0);
    const g = graph(page, 'dynamics');
    await expect(g.locator('.be-gempty')).toHaveText('No static curve for this type');
    await expect(g.locator('[data-be-graph-gr]')).toHaveCount(0);
    await page.locator('button.meter-toggle').first().click();
    await expect(g.locator('[data-be-graph-gr]')).toContainText('6.0');
  });

  test('Amp does not poll a meter off screen and starts when the meter scrolls into view', async ({ page }) => {
    await bootBlockEditorMock(page, { graphs: true });
    const meterReads: string[] = [];
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (url.pathname.endsWith('/preset/monitors/live')) meterReads.push(url.searchParams.get('eid') ?? '');
    });
    await page.locator('[data-idx="0,0"].cell.block').click();
    const meter = page.locator('section[data-be-page="Power Amp"] [data-be-key="meter"]');
    await expect(meter).toHaveCount(1);
    await pickMore(page, 'nav-side');
    await expect(board(page)).toHaveAttribute('data-nav', 'side');
    const away = page.locator('[data-be-tab="Authentic"]');
    await away.click();
    await expect(meter).not.toBeInViewport();
    await page.locator('button.meter-toggle').first().click();
    await expect(meter).not.toBeInViewport();
    // Once per polling interval was the regression. Leave the Amp editor open past one interval.
    await page.waitForTimeout(1200);
    expect(meterReads).toEqual([]);
    await page.locator('[data-be-tab="Power Amp"]').click();
    await expect(meter).toBeInViewport();
    await expect.poll(() => meterReads).toContain(String(AMP_EID));
    await away.click();
    await expect(meter).not.toBeInViewport();
    const count = meterReads.length;
    await page.waitForTimeout(1200);
    expect(meterReads).toHaveLength(count);
  });

  test('tremolo: tempo 1/4 at 90 bpm draws a 1.5 Hz LFO whose playhead moves (the rate, not the device phase)', async ({ page }) => {
    await bootBlockEditorMock(page, { graphs: true });
    await openBlock(page, 1);
    const g = graph(page, 'lfo');
    await expect(g.locator('[data-be-graph-caption]')).toHaveText(/^1\.5 Hz · 667 ms · 1\/4$/);
    await expect(g).toHaveAttribute('aria-label', /^Tremolo LFO: sine, 1\.5 Hz \(1\/4 at 90 bpm\), depth 50%/);
    await expect(g).toHaveAttribute('title', /moving dot shows the rate, not the device’s real LFO phase/);
    await expect(g).toHaveAttribute('data-be-playhead', 'on');
    const dot = g.locator('[data-be-graph-dot]');
    const at = async () => (await dot.getAttribute('style')) ?? '';
    const first = await at();
    await expect.poll(at, { timeout: 3000 }).not.toBe(first);
  });

  test('reduced motion, and arranging, keep the scope still', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await bootBlockEditorMock(page, { graphs: true });
    await openBlock(page, 1);
    const g = graph(page, 'lfo');
    await expect(g).toHaveAttribute('data-be-playhead', 'off');
    await expect(g.locator('[data-be-graph-dot]')).toHaveCount(0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(g).toHaveAttribute('data-be-playhead', 'on');
    await pickMore(page, 'arrange');
    await expect(graph(page, 'lfo')).toHaveAttribute('data-be-playhead', 'off');
    await expect(graph(page, 'lfo').locator('[data-be-graph-dot]')).toHaveCount(0);
  });

  test('filter: the response on the Filter page, the LFO on the Modulation page', async ({ page }) => {
    await bootBlockEditorMock(page, { graphs: true });
    await openBlock(page, 2);
    await expect(page.locator('section[data-be-page="Filter"] [data-be-key="graph:response"]')).toBeVisible();
    await expect(page.locator('section[data-be-page="Modulation"] [data-be-key="graph:lfo"]')).toHaveCount(1);
    await expect(graph(page, 'response')).toHaveAttribute('aria-label', /^Filter response: peaking, frequency (1 kHz|1000 Hz), Q 2, gain \+?6 dB, 2nd order/);
    await expect(graph(page, 'response').locator('[data-be-graph-caption]')).toHaveText(/peaking, 1k Hz/);
  });

  test('controllers: LFO 1, LFO 2 and ADSR 1 at their slots', async ({ page }) => {
    await bootBlockEditorMock(page, { graphs: true });
    await openBlock(page, 5);
    const lfoPage = page.locator('section[data-be-page="LFO 1 + 2"]');
    await expect(lfoPage.locator('[data-be-key="graph:lfo1"]')).toHaveCount(1);
    await expect(lfoPage.locator('[data-be-key="graph:lfo2"]')).toHaveCount(1);
    await expect(page.locator('section[data-be-page="ADSR 1"] [data-be-key="graph:adsr1"]')).toHaveCount(1);
    await expect(graph(page, 'lfo1')).toHaveAttribute('aria-label', /^LFO 1: triangle, 2\.0 Hz/);
    await expect(graph(page, 'adsr1')).toHaveAttribute('aria-label', /^ADSR 1: attack 100 ms, decay 200 ms, sustain 300 ms at 60%, release 400 ms, exponential/);
  });

  test('gate: no graph on the seed; added from the library ("Graphs · meters · actions"), sized S / M / L, removable', async ({ page }) => {
    await bootBlockEditorMock(page, { graphs: true });
    await openBlock(page, 3);
    await expect(page.locator('[data-be-key="graph:dynamics"]')).toHaveCount(0);
    await pickMore(page, 'arrange');
    const lib = await openLibrary(page);
    await expect(lib.locator('[data-be-lib-row="graph:dynamics"]')).toBeVisible();
    expect(await libGroupOf(page, 'graph:dynamics')).toBe('Graphs · meters · actions');
    await lib.locator('[data-be-lib-row="graph:dynamics"]').click();
    const t = tile(page, 'graph:dynamics');
    await expect(t).toBeVisible();
    await expect(graph(page, 'dynamics')).toHaveAttribute('aria-label', /^Gate curve: threshold [−-]40 dB, ratio 2/);
    await page.locator('[data-be-lib-close]').click();
    await selectTile(page, 'graph:dynamics');
    for (const [label, w, h] of [['S', 6, 3], ['M', 8, 4], ['L', 12, 6]] as const) {
      await page.locator(`[data-be-ab-size="${label}"]`).click();
      await expect(t).toHaveAttribute('data-be-w', String(w));
      await expect(t).toHaveAttribute('data-be-h', String(h));
    }
    await pickMore(page, 'arrange'); // finish arranging
    // the control menu keeps Size and Remove (no pin, no modifier: a read-only display)
    await t.click({ button: 'right' });
    const menu = page.getByRole('menu', { name: 'Control options' });
    // its notes under the name (what is drawn and what is not)
    await expect(menu.locator('.be-ci-note').first()).toBeVisible();
    await expect(menu.locator('.be-ci-size')).toBeVisible();
    await expect(menu.locator('.be-ci-modifier')).toHaveCount(0);
    await menu.locator('.be-ci-remove').click();
    await expect(page.locator('[data-be-key="graph:dynamics"]')).toHaveCount(0);
  });

  test('delay without a device layout: the echo train comes only from the library', async ({ page }) => {
    const mock = await bootBlockEditorMock(page, { graphs: true });
    await openBlock(page, 4);
    await expect(page.locator('[data-be-key="graph:echo"]')).toHaveCount(0);
    await pickMore(page, 'arrange');
    const lib = await openLibrary(page);
    await lib.locator('[data-be-lib-row="graph:echo"]').click();
    const g = graph(page, 'echo');
    // 40 % feedback: eight repeats down to the stated −60 dB floor — the caption counts what is drawn
    await expect(g).toHaveAttribute('aria-label', /^Echo train: time 500 ms, feedback 40%, ping-pong, 8 repeats to −60 dB/);
    await expect(g.locator('[data-be-graph-caption]')).toHaveText(/^500 ms, 8 repeats to −60 dB$/);
    await expect(g.locator('line.be-gspike')).toHaveCount(8);
    expect(writesOf(mock, DELAY_EID)).toEqual([]);
  });

  for (const cap of [false, 'absent'] as const) {
    test(`no blockVisuals capability (${cap}): no graph tiles, none in the library`, async ({ page }) => {
      await bootBlockEditorMock(page, { graphs: true, blockVisuals: cap });
      await openBlock(page, 0);
      await expect(tile(page, 'k0')).toBeVisible();
      await expect(page.locator('[data-be-view="graph"]')).toHaveCount(0);
      await pickMore(page, 'arrange');
      const lib = await openLibrary(page);
      await expect(lib.locator('[data-be-lib-row^="graph:"]')).toHaveCount(0);
    });
  }
});

test.describe('Block Editor graph tiles on the phone (390×844)', () => {
  test.use({ hasTouch: true });
  test.skip(({ browserName }) => browserName !== 'chromium', 'touch through CDP (Chromium only)');
  test('a graph is one full-width row, knobs stay at most four a row, and a swipe over it scrolls the board', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const mock = await bootBlockEditorMock(page, { graphs: true });
    await openBlock(page, 0, { phone: true });
    const t = tile(page, 'graph:dynamics');
    await expect(t).toBeVisible();
    const grid = page.locator('[data-be-grid][data-page="Basic"]');
    const [tb, gb] = [await t.boundingBox(), await grid.boundingBox()];
    expect(tb!.width).toBeGreaterThan(gb!.width * 0.9);
    const perRow = await page.evaluate(() => {
      const rows = new Map<number, number>();
      for (const k of Array.from(document.querySelectorAll<HTMLElement>('[data-be-grid] [data-be-view="knob"]'))) {
        const top = Math.round(k.getBoundingClientRect().top);
        rows.set(top, (rows.get(top) ?? 0) + 1);
      }
      return Math.max(0, ...rows.values());
    });
    expect(perRow).toBeLessThanOrEqual(4);
    await expect(t).toHaveCSS('touch-action', 'manipulation');
    // a vertical swipe that starts on the graph scrolls the board and writes nothing
    await board(page).evaluate((el) => (el.scrollTop = 0));
    const box = (await t.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const from = { x: box.x + box.width / 2, y: box.y + box.height - 10 };
    await swipe(cdp, from, { x: from.x + 2, y: from.y - 300 });
    await expect.poll(() => board(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(30);
    await page.waitForTimeout(300);
    expect(writesOf(mock, COMP_EID)).toEqual([]);
  });

  test('a long-press on a graph shows its notes (the tooltip does not reach touch)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await bootBlockEditorMock(page, { graphs: true });
    await openBlock(page, 0, { phone: true });
    const t = tile(page, 'graph:dynamics');
    await t.scrollIntoViewIfNeeded();
    const box = (await t.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
    await page.waitForTimeout(750);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const menu = page.getByRole('menu', { name: /^Control options/ });
    await expect(menu).toBeVisible();
    await expect(menu.locator('.be-ci-note')).not.toHaveCount(0);
    await expect(menu.locator('.be-ci-note', { hasText: 'Static curve only' })).toBeVisible();
  });
});
