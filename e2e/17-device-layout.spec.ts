import { test, expect, type Page, type Route } from '@playwright/test';
import { bootCleanWorkbench } from './support/workbench';

// AXIS-36 (Layer 3) — the ControlSurface "Default" board renders the editor-true DeviceLayout v2:
// pages become tabs, and INSIDE a page controls flow left→right per row / rows top→bottom, with each
// widget kind mapped to its surface view. Driven against a fully MOCKED backend (single Drive block
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
//   row 0: Gain (knob, col 2), Tone (knob, col 0), <spacer>, Gain meter (dropped — no monitor → gap)
//          — authored `placement.col`: Gain is FIRST in the array but the device puts it RIGHT of Tone.
//   row 1: Mode (dropdown → select), Bright (toggle), Level (slider) — no cols, flows as before
//   row 2 + row 3: two consecutive `mixer` rows → coalesced into ONE footer strip
const knob = (id: number, name: string) => ({ id, name, value: 0, norm: 0.5, min: 0, max: 10 });
const BLOCK_PARAMS = {
  block: 'Drive',
  slug: 'drive',
  page: 12,
  named: [knob(0, 'Gain'), knob(1, 'Tone'), knob(5, 'Level'), knob(7, 'Balance')],
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
              { label: 'Gain', paramName: 'DRIVE_GAIN', paramId: 0, widget: 'knob', rawWidget: 'knob', placement: { col: 2 } },
              { label: 'Tone', paramName: 'DRIVE_TONE', paramId: 1, widget: 'knob', rawWidget: 'knob', placement: { col: 0 } },
              { label: '', paramName: null, paramId: null, widget: 'spacer', rawWidget: 'spacer', placement: { col: 1 } },
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
            controls: [{ label: 'Balance', paramName: 'DRIVE_BAL', paramId: 7, widget: 'knob', rawWidget: 'knob' }]
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

test.describe('ControlSurface device-layout board (AXIS-36)', () => {
  test('renders the layout page as a tab with rows top→bottom and mapped widget views', async ({ page }) => {
    await bootWithLayout(page);

    // Tap the Drive block → the embedded Block Editor mounts the ControlSurface for it.
    await page.locator('[data-idx="0,0"].cell.block').click();
    await expect(page.locator('.boardwrap')).toBeVisible();

    // The layout's single page becomes a tab named "Drive".
    await expect(page.locator('.tab', { hasText: 'Drive' }).first()).toBeVisible();

    // Row 0 knobs render with the layout's labels.
    const gain = page.locator('.lbl', { hasText: 'Gain' }).first();
    const tone = page.locator('.lbl', { hasText: 'Tone' }).first();
    await expect(gain).toBeVisible();
    await expect(tone).toBeVisible();

    // Widget mapping: the multi-option enum (Mode) becomes a dropdown/select field; the slider (Level)
    // renders as a horizontal slider row.
    await expect(page.locator('.selfield')).toHaveCount(1);
    const level = page.locator('.slbl', { hasText: 'Level' }).first();
    await expect(level).toBeVisible();

    // Rows flow top→bottom: the row-0 Gain knob sits above the row-1 Level slider.
    const gy = await gain.boundingBox();
    const ly = await level.boundingBox();
    expect(gy).toBeTruthy();
    expect(ly).toBeTruthy();
    expect(gy!.y).toBeLessThan(ly!.y);
  });

  test('places controls at the columns the device authored, not in array order', async ({ page }) => {
    await bootWithLayout(page);
    await page.locator('[data-idx="0,0"].cell.block').click();
    await expect(page.locator('.boardwrap')).toBeVisible();

    // `placement.col` carries the TRUE visual order: Gain is listed first but authored at col 2, Tone
    // second but authored at col 0. Flowing the array (the old behaviour) would put Gain on the left.
    const gain = page.locator('.lbl', { hasText: 'Gain' }).first();
    const tone = page.locator('.lbl', { hasText: 'Tone' }).first();
    const g = await gain.boundingBox();
    const t = await tone.boundingBox();
    expect(g).toBeTruthy();
    expect(t).toBeTruthy();
    expect(t!.x).toBeLessThan(g!.x); // Tone (col 0) left of Gain (col 2)
    expect(Math.abs(t!.y - g!.y)).toBeLessThan(4); // same row
    // col 1 is a spacer, so the two knobs are NOT adjacent — there is a real hole between them.
    expect(g!.x - (t!.x + t!.width)).toBeGreaterThan(t!.width * 0.5);
  });

  test('consecutive mixer rows coalesce into one footer strip', async ({ page }) => {
    await bootWithLayout(page);
    await page.locator('[data-idx="0,0"].cell.block').click();
    await expect(page.locator('.boardwrap')).toBeVisible();

    // The device splits its mixer across two rows to suit a fixed-width canvas; rendering each as its
    // own grid line stranded the block's master control alone at the far left (the Cab "Level 3" bug).
    // Compare the GRID CARDS, not their inner text: a knob card and the bypass action card lay their
    // contents out differently, so only the cards themselves share the strip's grid row.
    // `.boardwrap` scope matters: BlockEditor's own shell wrapper is also `.card`.
    const balance = page.locator('.boardwrap .card').filter({ has: page.locator('.lbl', { hasText: 'Balance' }) }).first();
    const bypass = page.locator('.boardwrap .card').filter({ has: page.locator('.action') }).first(); // "Engaged"/"Bypassed"
    await expect(balance).toBeVisible();
    await expect(bypass).toBeVisible();

    const b = await balance.boundingBox();
    const y = await bypass.boundingBox();
    expect(b).toBeTruthy();
    expect(y).toBeTruthy();
    expect(Math.abs(b!.y - y!.y)).toBeLessThan(4); // one strip, not two stacked rows
    expect(b!.x).toBeLessThan(y!.x); // Balance first, Bypass after it — array order within the strip
  });

  test('dropdown popover renders directly under its trigger, not the grid cell edge', async ({ page }) => {
    await bootWithLayout(page);
    await page.locator('[data-idx="0,0"].cell.block').click();
    await expect(page.locator('.boardwrap')).toBeVisible();

    // Regression guard (AXIS dropdown-offset bug): the popover used to be positioned from the
    // widget's grid cell bottom, which sits well below the trigger because `.card` centers its
    // content — a select field is shorter than the knob-sized cell it lives in. The popover must
    // track the actual rendered trigger element instead.
    const trigger = page.locator('.selfield');
    await trigger.click();
    const menu = page.locator('.selmenu');
    await expect(menu).toBeVisible();

    const t = await trigger.boundingBox();
    const m = await menu.boundingBox();
    expect(t).toBeTruthy();
    expect(m).toBeTruthy();

    // Menu top should sit just under the trigger's bottom edge (a couple px, not a whole cell).
    expect(m!.y - (t!.y + t!.height)).toBeGreaterThanOrEqual(0);
    expect(m!.y - (t!.y + t!.height)).toBeLessThan(10);
    // Left edge aligns with the trigger, not an unrelated grid column.
    expect(Math.abs(m!.x - t!.x)).toBeLessThan(2);
  });
});
