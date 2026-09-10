import { test, expect, type Page, type Route } from '@playwright/test';
import { bootCleanWorkbench } from './support/workbench';

// The Block Editor's embedded Grid Map (GridMap.svelte): starts collapsed on a clean boot, and a
// selected top-row block keeps its mini-map outline clear of the scroll edge. Driven against a fully
// MOCKED backend (single Drive block whose params carry a v2 layout) so nothing touches the
// operator's live FM3 on :5056.
//
// NOTE: this file used to also assert the ControlSurface "Default" board (`.boardwrap`/`.rail`,
// column-authored placement, the mixer rail). That component was removed when the Block Editor
// switched to rendering the device's own pixel-exact canvas (DeviceCanvas.svelte); those board
// tests were deleted with it. DeviceCanvas has unit coverage in `src/lib/deviceCanvas.test.ts` but
// no e2e rendering spec yet.

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
//   row 2 + row 3: two consecutive `mixer` rows → the block-level RAIL, rendered right of the page
const knob = (id: number, name: string) => ({ id, name, value: 0, norm: 0.5, min: 0, max: 10 });
const BLOCK_PARAMS = {
  block: 'Drive',
  slug: 'drive',
  page: 12,
  named: [knob(0, 'Gain'), knob(1, 'Tone'), knob(5, 'Level'), knob(7, 'Balance')],
  enums: [
    { id: 4, name: 'Mode', value: 0, options: [{ value: 0, label: 'Fat' }, { value: 1, label: 'Thick' }, { value: 2, label: 'Bright' }] },
    { id: 9, name: 'Bright', value: 0, options: [{ value: 0, label: 'Off' }, { value: 1, label: 'On' }] },
    { id: 10, name: 'Bypass Mode', value: 0, options: [{ value: 0, label: 'Mute' }, { value: 1, label: 'Thru' }, { value: 2, label: 'Mute In' }] }
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
            controls: [
              { label: 'Bypass Mode', paramName: 'DRIVE_BYPMODE', paramId: 10, widget: 'dropdown', rawWidget: 'dropdown1Tight' },
              { label: 'Bypass', paramName: 'DRIVE_BYP', paramId: 6, widget: 'button', rawWidget: 'btnBypass' }
            ]
          }
        ]
      },
      {
        // Page 2 repeats the rail MINUS the dropdown — exactly how the amp's "Speaker" tab drops Input
        // Select and Bypass Mode. The knobs and the button must not move when this page is selected.
        name: 'Tone',
        rows: [
          {
            section: 'parameters',
            controls: [{ label: 'Tone', paramName: 'DRIVE_TONE', paramId: 1, widget: 'knob', rawWidget: 'knob' }]
          },
          {
            section: 'mixer',
            controls: [
              { label: 'Balance', paramName: 'DRIVE_BAL', paramId: 7, widget: 'knob', rawWidget: 'knob' },
              { label: 'Bypass', paramName: 'DRIVE_BYP', paramId: 6, widget: 'button', rawWidget: 'btnBypass' }
            ]
          }
        ]
      }
    ]
  }
};

async function bootWithLayout(page: Page): Promise<void> {
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  // Match ONLY real backend calls (`/api/...` right after the origin) — not Vite's
  // module requests for `src/lib/api/*`, which a substring `**/api/**` glob would also
  // catch and answer with JSON, breaking the module graph.
  const isBackend = (url: URL) => url.pathname.startsWith('/api/');
  await page.route(isBackend, async (route) => {
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
  // Confirms the mocked grid/block routes took effect: the Block Editor's own embedded map
  // (GridMap.svelte, always mounted with the Block Editor — no selection or expansion needed).
  await expect(page.locator('.map')).toBeVisible();
}

/**
 * Expand the Block Editor's embedded Grid Map and tap the mocked Drive block (row 0, col 0). Split
 * out from `bootWithLayout()` because the map starts collapsed by default (its own tested behaviour)
 * and cells only render when expanded.
 */
async function selectDriveBlock(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Expand map' }).click();
  await page.locator('.mc.block[data-idx="0,0"]').click();
}

test.describe('Block Editor grid map', () => {
  test('starts the block editor map collapsed on a clean boot', async ({ page }) => {
    await bootWithLayout(page);

    await expect(page.getByRole('button', { name: 'Expand map' })).toBeVisible();
    await expect(page.locator('.map .body')).toHaveCount(0);

    await page.getByRole('button', { name: 'Expand map' }).click();
    await expect(page.locator('.map .body')).toBeVisible();
  });

  test('keeps a top-row selected mini-map block outline clear of the scroll edge', async ({ page }) => {
    await bootWithLayout(page);
    await selectDriveBlock(page);

    const bounds = await page.locator('.map .body').evaluate((body) => {
      const selected = body.querySelector<HTMLElement>('.mc.block.open');
      if (!selected) return null;
      const bodyBox = body.getBoundingClientRect();
      const selectedBox = selected.getBoundingClientRect();
      return { topInset: selectedBox.top - bodyBox.top };
    });

    // The outline extends 2px past the selected cell's scaled box.
    expect(bounds?.topInset).toBeGreaterThanOrEqual(2);
  });
});
