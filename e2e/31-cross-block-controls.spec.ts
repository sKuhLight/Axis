import { test, expect, type Page, type Route } from '@playwright/test';
import { bootCleanWorkbench, clickNav, collapseRail, regionPanel } from './support/workbench';

// The Controllers page's global-metronome controls are CROSS-BLOCK: the layout draws them on the
// Controllers page, but they read/write effectId 1 (GLOBAL), not the Controllers effect (eid 2). This
// spec drives a fully MOCKED backend (no live FM3) so it asserts the Axis half of the fix:
//   • the crossBlock control binds to the referenced block's params and renders as a real toggle/knob
//     (before the fix it fell through to a static label — the reported bug);
//   • a write is addressed to the OWNER effectId (PUT /preset/blocks/1/…), never to the open block.
// The serve-time effectId resolution itself is unit-tested in the ForgeFX server (drivers/layouts.test.ts).

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
  shuntBase: 1024,
  editorLayouts: true,
  virtualEffects: [{ eid: 2, slug: 'controllers', name: 'Controllers' }]
};
const DEVICE = { model: 'FM3', modelByte: '0x11', modelId: 17, apiVersion: 2, capabilities: CAPS, firmware: null, port: 'mock' };
const DETECT = { connected: true, modelId: 17, name: 'FM3', short: 'FM3', gen: 3, supported: true, port: 'mock' };
const GRID = { model: 'FM3', name: 'MOCK', crcValid: true, rows: 4, cols: 6, scenes: [], cells: [] };

// GLOBAL block (eid 1): the params the metronome controls actually read/write.
const GLOBAL_PARAMS = {
  block: 'GLOBAL',
  slug: 'global',
  page: -1,
  named: [{ id: 119, name: 'Output 1', paramName: 'GLOBAL_METLEVEL1', value: 0, norm: 0.5, min: -80, max: 0 }],
  enums: [
    { id: 14878, name: 'Metronome', paramName: 'GLOBAL_METRONOME', value: 0, options: [{ value: 0, label: 'Off' }, { value: 1, label: 'On' }] }
  ],
  type: null
};

// Controllers virtual effect (eid 2): its Tempo/Pitch page draws cross-block controls bound to eid 1.
const CONTROLLERS_PARAMS = {
  block: 'CONTROLLERS',
  slug: 'controllers',
  page: -1,
  // The real Controllers block always has params; a non-empty list is what makes VirtualScreen render
  // the canvas (an empty params+enums list is the "No parameters available" branch).
  named: [{ id: 32, name: 'Tempo', paramName: 'CONTROLLERS_TEMPO', value: 120, norm: 0.5, min: 20, max: 250 }],
  enums: [],
  type: null,
  layout: {
    editorName: 'Controllers',
    family: 'CONTROLLERS',
    variantName: 'Controllers',
    variantValue: null,
    pages: [
      {
        name: 'Tempo/Pitch',
        rows: [
          {
            section: 'parameters',
            controls: [
              { label: 'Tempo', paramName: 'CONTROLLERS_TEMPO', paramId: 32, widget: 'knob', rawWidget: 'knob', placement: { col: 0 } },
              { label: 'METRONOME', paramName: null, paramId: null, widget: 'label', rawWidget: 'sectionLabel', placement: { positionExact: '305,209' } },
              {
                label: 'Metronome',
                paramName: 'GLOBAL_METRONOME',
                paramId: 14878,
                widget: 'toggle',
                rawWidget: 'toggle',
                placement: { col: 1 },
                crossBlock: { effect: 'ID_GLOBAL', family: 'GLOBAL', paramName: 'GLOBAL_METRONOME', paramId: 14878, effectId: 1 }
              },
              {
                label: 'Output 1',
                paramName: 'GLOBAL_METLEVEL1',
                paramId: 119,
                widget: 'knob',
                rawWidget: 'knob',
                placement: { col: 2 },
                crossBlock: { effect: 'ID_GLOBAL', family: 'GLOBAL', paramName: 'GLOBAL_METLEVEL1', paramId: 119, effectId: 1 }
              }
            ]
          }
        ]
      }
    ]
  }
};

async function bootWithCrossBlock(page: Page): Promise<void> {
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  const isBackend = (url: URL) => url.pathname.startsWith('/api/');
  await page.route(isBackend, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, '');
    if (route.request().method() === 'PUT' && /^\/preset\/blocks\/1\/params\/\d+$/.test(path)) return json(route, { ok: true });
    if (path === '/device') return json(route, DEVICE);
    if (path === '/device/detect') return json(route, DETECT);
    if (path === '/healthz') return json(route, { ok: true, api: { version: 2 }, device: 'FM3' });
    if (path === '/preset/grid') return json(route, GRID);
    if (path === '/preset/blocks') return json(route, []);
    if (path === '/ports') return json(route, { chosen: null, override: null, profileOverride: null, ports: [] });
    if (/^\/preset\/blocks\/2\/params$/.test(path)) return json(route, CONTROLLERS_PARAMS);
    if (/^\/preset\/blocks\/1\/params$/.test(path)) return json(route, GLOBAL_PARAMS);
    return json(route, {});
  });
  await page.route('**/api/events', (route) => route.abort());

  // Provide our own online `/healthz`; opt out of the default offline intercept.
  await bootCleanWorkbench(page, { interceptHealthz: false });
}

test.describe('Controllers page: cross-block (global) controls', () => {
  test('renders the metronome toggle/knob live and writes to the owner effectId', async ({ page }) => {
    await bootWithCrossBlock(page);

    await clickNav(page, 'controllers');
    await expect(regionPanel(page, 'main', 'axis.controllers')).toHaveCount(1);

    // The cross-block toggle renders as a REAL switch (before the fix: a static label, no control).
    const metronome = page.locator('.cell.v-toggle .switch[aria-label="Metronome"]');
    await expect(metronome).toBeVisible();
    // And the cross-block knob renders a dial rather than a caption.
    await expect(page.locator('.cell.v-knob').filter({ hasText: 'Output 1' }).locator('.knob')).toHaveCount(1);

    // Flipping it must PUT to GLOBAL (eid 1) — the Controllers block's pid 14878 would be meaningless.
    const put = page.waitForRequest(
      (r) => r.method() === 'PUT' && new URL(r.url()).pathname === '/api/preset/blocks/1/params/14878'
    );
    await metronome.click();
    const req = await put;
    expect(req.method()).toBe('PUT');
    // A GLOBAL (device) setting is not preset content: the Save chip must stay clean.
    await expect(page.locator('.save[data-dirty]')).toHaveAttribute('data-dirty', 'false');
    await collapseRail(page);
  });

  test('the GLOBAL param read is observe:false so the device-edit target stays on Controllers', async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (u.pathname === '/api/preset/blocks/1/params') requested.push(u.search);
    });
    await bootWithCrossBlock(page);
    await clickNav(page, 'controllers');
    await expect(regionPanel(page, 'main', 'axis.controllers')).toHaveCount(1);
    await expect(page.locator('.cell.v-toggle .switch[aria-label="Metronome"]')).toBeVisible();
    expect(requested.some((s) => s.includes('observe=0'))).toBe(true);
  });
});
