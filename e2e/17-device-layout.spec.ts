import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import { bootCleanWorkbench } from './support/workbench';
import { bootBlockEditorMock, openAmpEditor, openMore, pickMore, selectTile } from './support/blockEditorMock';

// AXIS-36 (Layer 3) — the Block Editor "Default" board renders the editor-true DeviceLayout v2:
// pages become tabs (and board sections), and INSIDE a page controls flow left→right per row / rows
// top→bottom, with each widget kind mapped to its view. Driven against a fully MOCKED backend (single Drive block
// whose params carry a v2 layout) so nothing touches the operator's live FM3 on :5056.

const SHUNT_BASE = 1024;

const CAPS = {
  slotModel: 'grid',
  slotCount: 512,
  grid: { rows: 4, cols: 6 },
  hasScenes: false,
  sceneCount: 0,
  hasChannels: false,
  channelNames: [],
  channelBlocks: [],
  supportsSave: true,
  gridRouting: true,
  gridCursorSelect: false,
  shuntBase: SHUNT_BASE,
  editorLayouts: true
};
const DEVICE = { model: 'FM3', modelByte: '0x11', modelId: 17, apiVersion: 2, capabilities: CAPS, firmware: null, port: 'mock' };
const DETECT = { connected: true, modelId: 17, name: 'FM3', short: 'FM3', gen: 3, supported: true, port: 'mock' };

// One Drive block at row 0, col 0 — the block we select to render the surface.
const GRID = {
  model: 'FM3',
  name: 'MOCK LAYOUT',
  crcValid: true,
  rows: 4,
  cols: 6,
  scenes: [],
  cells: [{ row: 0, col: 0, effectId: 200, name: 'Drive 1', slug: 'Drive', isShunt: false, routeFlag: 0, fromRows: [] }]
};

// Drive block params + a v2 DeviceLayout:
//   row 0: Gain (knob), Tone (knob), <spacer>, Gain meter (dropped — no live monitor → gap)
//   row 1: Mode (dropdown → select), Bright (toggle), Level (slider)
//   row 2 (mixer): Bypass (a header control: on no default board)
const knob = (id: number, name: string) => ({ id, name, value: 0, norm: 0.5, min: 0, max: 10 });
const BLOCK_PARAMS = {
  block: 'Drive',
  slug: 'drive',
  page: 12,
  named: [knob(0, 'Gain'), knob(1, 'Tone'), knob(5, 'Level')],
  enums: [
    { id: 4, name: 'Mode', value: 0, options: [{ value: 0, label: 'Fat' }, { value: 1, label: 'Thick' }, { value: 2, label: 'Bright' }] },
    { id: 9, name: 'Bright', value: 0, options: [{ value: 0, label: 'Off' }, { value: 1, label: 'On' }] }
  ],
  type: { value: 3, name: 'FET Boost' },
  layout: {
    editorName: 'Drive',
    family: 'DRIVE',
    variantName: 'Type',
    variantValue: 'FET Boost',
    pages: [
      {
        name: 'Drive',
        rows: [
          {
            section: 'parameters',
            controls: [
              { label: 'Gain', paramName: 'DRIVE_GAIN', paramId: 0, widget: 'knob', rawWidget: 'knob' },
              { label: 'Tone', paramName: 'DRIVE_TONE', paramId: 1, widget: 'knob', rawWidget: 'knob' },
              { label: '', paramName: null, paramId: null, widget: 'spacer', rawWidget: 'spacer' },
              { label: 'Gain', paramName: 'DRIVE_GAINMON', paramId: 8, widget: 'meter', rawWidget: 'meterGainVert' }
            ]
          },
          {
            section: 'parameters',
            controls: [
              { label: 'Mode', paramName: 'DRIVE_MODE', paramId: 4, widget: 'dropdown', rawWidget: 'dropdown1' },
              { label: 'Bright', paramName: 'DRIVE_BRIGHT', paramId: 9, widget: 'toggle', rawWidget: 'toggle' },
              { label: 'Level', paramName: 'DRIVE_LEVEL', paramId: 5, widget: 'slider', rawWidget: 'slider' }
            ]
          },
          {
            section: 'mixer',
            controls: [{ label: 'Bypass', paramName: 'DRIVE_BYP', paramId: 6, widget: 'button', rawWidget: 'btnBypass' }]
          }
        ]
      }
    ]
  }
};

async function bootWithLayout(page: Page): Promise<void> {
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (path === '/device') return json(route, DEVICE);
    if (path === '/device/detect') return json(route, DETECT);
    if (path === '/healthz') return json(route, { ok: true, api: { version: 2 }, device: 'FM3' });
    if (path === '/preset/grid') return json(route, GRID);
    if (path === '/preset/blocks') return json(route, []);
    if (path === '/ports') return json(route, { chosen: null, override: null, profileOverride: null, ports: [] });
    if (/^\/preset\/blocks\/200\/params$/.test(path)) return json(route, BLOCK_PARAMS);
    // everything else (meters, monitors, cab, selects…) → benign empty; all boot reads are guarded.
    return json(route, {});
  });
  await page.route('**/api/events', (route) => route.abort());

  await bootCleanWorkbench(page);
  await expect(page.locator('[data-idx="0,0"].cell.block')).toBeVisible();
}

test.describe('Block Editor device-layout board (AXIS-36, board v2)', () => {
  test('renders the layout page as a tab with rows top→bottom and mapped widget views', async ({ page }) => {
    await bootWithLayout(page);

    // Tap the Drive block → the embedded Block Editor mounts the board for it.
    await page.locator('[data-idx="0,0"].cell.block').click();
    await expect(page.locator('[data-be-board]')).toBeVisible();

    // The layout's single page becomes a tab named "Drive" (and a board section of that name).
    await expect(page.locator('[data-be-tab="Drive"]')).toBeVisible();
    await expect(page.locator('section[data-be-page="Drive"]')).toBeVisible();

    // Row 0 knobs render with the layout's labels.
    const gain = page.locator('[data-be-key="k0"][data-be-view="knob"]').first();
    const tone = page.locator('[data-be-key="k1"][data-be-view="knob"]').first();
    await expect(gain).toContainText('Gain');
    await expect(tone).toContainText('Tone');

    // Widget mapping: the multi-option enum (Mode) becomes a dropdown/select field; the toggle (Bright)
    // a switch; the slider (Level) renders as a horizontal slider row.
    await expect(page.locator('[data-be-view="select"]')).toHaveCount(1);
    await expect(page.locator('[data-be-key="e9"][data-be-view="switch"]')).toHaveCount(1);
    const level = page.locator('[data-be-key="k5"][data-be-view="slider"]').first();
    await expect(level).toBeVisible();
    await expect(level).toContainText('Level');

    // Rows flow top→bottom: the row-0 Gain knob sits above the row-1 Level slider.
    const gy = await gain.boundingBox();
    const ly = await level.boundingBox();
    expect(gy).toBeTruthy();
    expect(ly).toBeTruthy();
    expect(gy!.y).toBeLessThan(ly!.y);

    // The mixer row holds only the bypass, which the header shows: no tile, no divider for an empty row, and
    // no fixed area.
    await expect(page.locator('section[data-be-page="Drive"] [data-be-view="hdiv"]')).toHaveCount(0);
    await expect(page.locator('[data-be-item][data-be-key="bypass"]')).toHaveCount(0);
    await expect(page.locator('[data-be-fixed]')).toHaveCount(0);
  });
});

// Block Editor rework, slice 6 (AXIS-79): the default board takes the device editor's positions. The
// mocked amp (support/blockEditorMock.ts, `positioned: true`) has an Authentic page with exact pixel
// positions (a 92 px knob slot), three section titles and a mixer section without positions; a knob slot
// is 2 cells. Its Dynamics page makes the rows-only default 6 rows high, the height budget the positioned
// page fits exactly.

type Cell = { x: number; y: number; w: number; h: number };
const AUTH = 'section[data-be-page="Authentic"]';

/** The cells of a tile / divider, from its data attributes. */
async function cellOf(t: Locator): Promise<Cell> {
  await expect(t).toBeVisible();
  const [x, y, w, h] = await Promise.all(['x', 'y', 'w', 'h'].map((a) => t.getAttribute(`data-be-${a}`)));
  return { x: Number(x), y: Number(y), w: Number(w), h: Number(h) };
}
const tileCell = (page: Page, key: string) => cellOf(page.locator(`${AUTH} [data-be-key="${key}"]`).first());
/** A horizontal divider of the Authentic page by its label. */
const divider = (page: Page, label: string) =>
  page.locator(`${AUTH} [data-be-view="hdiv"]`).filter({ has: page.locator('.be-divlbl', { hasText: new RegExp(`^${label}$`) }) });

test.describe('Block Editor device positions (slice 6)', () => {
  test('a page with exact positions: controls in the device cells, titles and the mixer section as dividers, fitted at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await bootBlockEditorMock(page, { positioned: true });
    await openAmpEditor(page);

    const drive = await tileCell(page, 'k0');
    const [bass, mid, treble, presence, master, bright] = await Promise.all(['k1', 'k2', 'k3', 'k4', 'k5', 'e10'].map((k) => tileCell(page, k)));
    // one line, knob slots of 2 cells, the device's empty slots kept as gaps
    for (const c of [bass, mid, treble, presence, master, bright]) expect(c.y).toBe(drive.y);
    expect([drive, bass, mid, treble, presence, master, bright].map((c) => c.x - drive.x)).toEqual([0, 4, 6, 8, 10, 14, 16]);
    expect(drive).toMatchObject({ x: 0, w: 2, h: 2 });
    await expect(page.locator(`${AUTH} [data-be-key="e10"]`)).toHaveAttribute('data-be-view', 'switch');

    // the section titles: dividers ON the line they head (h = 0, no cell of their own), over the controls
    for (const t of ['GAIN', 'TONE', 'OUTPUT']) await expect(divider(page, t)).toHaveCount(1);
    expect(await cellOf(divider(page, 'GAIN'))).toMatchObject({ x: drive.x, y: drive.y, w: 2, h: 0 });
    expect(await cellOf(divider(page, 'TONE'))).toMatchObject({ x: bass.x, y: drive.y, w: presence.x + presence.w - bass.x });
    expect(await cellOf(divider(page, 'OUTPUT'))).toMatchObject({ x: master.x, y: drive.y, w: bright.x + bright.w - master.x });
    // the mixer section (no positions) under a "Mixer" divider on its first row's line, in layout order
    await expect(divider(page, 'Mixer')).toHaveCount(1);
    const mixer = await cellOf(divider(page, 'Mixer'));
    const [trim, level, balance] = await Promise.all(['k6', 'k7', 'k8'].map((k) => tileCell(page, k)));
    expect(mixer.y).toBe(drive.y + drive.h);
    expect([trim, level, balance].map((c) => [c.x, c.y])).toEqual([0, 2, 4].map((x) => [x, mixer.y]));

    // nothing overlaps: a line divider covers no cell, so only the solid items are compared
    const all = await page.locator(`${AUTH} [data-be-item]`).evaluateAll((els) =>
      els.map((e) => ({ id: e.getAttribute('data-be-item')!, x: Number(e.getAttribute('data-be-x')), y: Number(e.getAttribute('data-be-y')), w: Number(e.getAttribute('data-be-w')), h: Number(e.getAttribute('data-be-h')) }))
    );
    expect(all.length).toBe(14);
    const solid = all.filter((a) => a.w > 0 && a.h > 0);
    for (let i = 0; i < solid.length; i++)
      for (let j = i + 1; j < solid.length; j++) {
        const a = solid[i]!;
        const b = solid[j]!;
        expect(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y, `${a.id} × ${b.id}`).toBe(false);
      }

    // height budget: the positioned page is no taller than the block's tallest rows-only page (6 rows)
    const tallest = await page.locator('section[data-be-page]').evaluateAll((secs) =>
      Math.max(...secs.map((s) => Math.max(0, ...[...s.querySelectorAll('[data-be-item]')].map((e) => Number(e.getAttribute('data-be-y')) + Number(e.getAttribute('data-be-h'))))))
    );
    expect(tallest).toBe(6);
    expect(level.y + level.h).toBe(mixer.y + level.h);

    // always fit: no vertical scroll, all of the page in view
    const fit = await page.locator('[data-be-board]').evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
    expect(fit.ch).toBeGreaterThan(0);
    expect(fit.sh).toBeLessThanOrEqual(fit.ch + 1);
    await expect(page.locator(`${AUTH} [data-be-key="e10"]`)).toBeInViewport();
    await expect(page.locator(`${AUTH} [data-be-key="k8"]`)).toBeInViewport();
    // the Default layout is not "custom" (no amber dot) although it is no longer the row flow
    await expect(page.locator('[data-be-more]')).toHaveAttribute('data-custom', 'false');
  });

  test('"Reset to device layout" puts the device positions back after an arrange move', async ({ page }) => {
    await bootBlockEditorMock(page, { positioned: true });
    await openAmpEditor(page);
    const master = await tileCell(page, 'k5');

    // Arrange: move Master one cell left into the empty slot (keyboard), then Done
    await pickMore(page, 'arrange');
    await expect(page.locator('[data-be-arrange-bar]')).toBeVisible();
    await selectTile(page, 'k5', page.locator(AUTH));
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await tileCell(page, 'k5')).x).toBe(master.x - 1);
    await page.locator('[data-be-arrange-done]').click();
    await expect(page.locator('[data-be-arrange-bar]')).toHaveCount(0);
    await expect(page.locator('[data-be-more-dot]')).toBeVisible();

    // the Default profile's whole-layout reset says what it does (F10) and is the only such row
    const menu = await openMore(page);
    const row = menu.locator('.be-mi-reset-all');
    await expect(row).toContainText('Reset to device layout');
    await expect(menu.locator('.be-mi-reset-device')).toHaveCount(0);
    await row.click();
    await expect(menu.locator('[data-menu-confirm]')).toBeVisible();
    await menu.locator('[data-menu-confirm]').click();
    await expect(menu).toHaveCount(0);

    await expect.poll(async () => tileCell(page, 'k5')).toEqual(master);
    await expect(page.locator('[data-be-more-dot]')).toHaveCount(0);
    await expect(divider(page, 'TONE')).toHaveCount(1);
    await expect(divider(page, 'Mixer')).toHaveCount(1);

    // kept after a reload, still not custom
    await page.reload();
    await expect(page.locator('[data-idx="0,0"].cell.block')).toBeVisible();
    await openAmpEditor(page);
    expect(await tileCell(page, 'k5')).toEqual(master);
    await expect(page.locator('[data-be-more]')).toHaveAttribute('data-custom', 'false');
  });
});
