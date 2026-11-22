import { expect, type Page, type Route } from '@playwright/test';
import { bootCleanWorkbench } from './workbench';

// A fully mocked backend with one amp-like block whose params carry a multi-page device layout, for the
// Block Editor board specs. Nothing reaches a real device: every /api call is answered here (or aborted
// by bootCleanWorkbench), and parameter writes are captured instead of sent.

export const AMP_EID = 100;

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
  meters: { liveMonitors: true }
};
const DEVICE = { model: 'FM3', modelByte: '0x11', modelId: 17, apiVersion: 2, capabilities: CAPS, firmware: null, port: 'mock' };
const DETECT = { connected: true, modelId: 17, name: 'FM3', short: 'FM3', gen: 3, supported: true, port: 'mock' };
const GRID = {
  model: 'FM3',
  name: 'MOCK AMP',
  crcValid: true,
  rows: 4,
  cols: 6,
  scenes: [],
  cells: [{ row: 0, col: 0, effectId: AMP_EID, name: 'Amp 1', slug: 'Amp', isShunt: false, routeFlag: 0, fromRows: [] }]
};

const knob = (id: number, name: string, norm = 0.5, extra: Record<string, unknown> = {}) => ({ id, name, value: 0, norm, min: 0, max: 10, ...extra });
const ctl = (label: string, paramId: number | null, widget: string, rawWidget = widget) => ({ label, paramName: `AMP_${label.toUpperCase().replace(/\W+/g, '_')}`, paramId, widget, rawWidget });
const row = (...controls: ReturnType<typeof ctl>[]) => ({ section: 'parameters', controls });

/** Amp params + a six-page layout: knobs and a switch (Authentic), selects, a slider and the bypass
 *  (Preamp), a fader, a button and the level meter (Power Amp; drawn only while metering is on), number
 *  views (EQ), and two plain knob pages so the strip is wider than the board. */
export const AMP_PARAMS = {
  block: 'Amp',
  slug: 'amp',
  page: 1,
  named: [
    knob(0, 'Drive', 0.7),
    knob(1, 'Bass'),
    knob(2, 'Mid'),
    knob(3, 'Treble'),
    knob(4, 'Presence', 0.3),
    knob(5, 'Master Volume'),
    knob(6, 'Input Trim', 0.1),
    knob(7, 'Level', 0.65, { min: -80, max: 20, unit: 'dB' }),
    knob(8, 'Balance'),
    knob(9, 'Depth'),
    knob(13, 'Sag'),
    knob(14, 'Bias', 0.4),
    knob(15, 'Hum'),
    knob(16, 'Low Cut', 0.2, { min: 20, max: 2000, unit: 'Hz', log: true }),
    knob(17, 'High Cut', 0.8, { min: 200, max: 20000, unit: 'Hz', log: true }),
    knob(18, 'Lo Freq'),
    knob(19, 'Hi Freq'),
    knob(21, 'Comp'),
    knob(22, 'Threshold', 0.6, { min: -60, max: 0, unit: 'dB' }),
    knob(23, 'Ratio'),
    knob(24, 'Attack'),
    knob(25, 'Release'),
    knob(26, 'Speaker Drive'),
    knob(27, 'Speaker Comp'),
    knob(28, 'Saturation')
  ],
  enums: [
    { id: 10, name: 'Bright Switch', value: 0, options: [{ value: 0, label: 'Off' }, { value: 1, label: 'On' }] },
    { id: 11, name: 'Input Select', value: 0, options: [{ value: 0, label: 'Sum L+R' }, { value: 1, label: 'Left' }, { value: 2, label: 'Right' }] },
    { id: 12, name: 'Bypass Mode', value: 0, options: [{ value: 0, label: 'Thru' }, { value: 1, label: 'Mute FX Out' }, { value: 2, label: 'Mute Out' }] },
    { id: 20, name: 'Boost', value: 0, options: [{ value: 0, label: 'Off' }, { value: 1, label: 'On' }] }
  ],
  type: { value: 7, name: 'Plexi 100W' },
  layout: {
    editorName: 'Amp',
    family: 'AMP',
    variantName: 'Type',
    variantValue: 'Plexi 100W',
    pages: [
      {
        name: 'Authentic',
        rows: [
          row(ctl('Drive', 0, 'knob'), ctl('Bass', 1, 'knob'), ctl('Mid', 2, 'knob'), ctl('Treble', 3, 'knob'), ctl('Presence', 4, 'knob'), ctl('Master', 5, 'knob')),
          row(ctl('Input Trim', 6, 'knob'), ctl('Bright', 10, 'toggle'))
        ]
      },
      {
        name: 'Preamp',
        rows: [
          row(ctl('Input Select', 11, 'dropdown', 'dropdown1'), ctl('Bypass Mode', 12, 'dropdown', 'dropdown1'), ctl('Level', 7, 'knob'), ctl('Balance', 8, 'knob')),
          row(ctl('Depth', 9, 'slider')),
          row(ctl('Bypass', 31, 'button', 'btnBypass'))
        ]
      },
      {
        name: 'Power Amp',
        rows: [row(ctl('Sag', 13, 'knob'), ctl('Bias', 14, 'knob'), ctl('Hum', 15, 'fader'), ctl('Boost', 20, 'button'), ctl('Output', 30, 'meter', 'meterGainVert'))]
      },
      {
        name: 'EQ',
        rows: [row(ctl('Low Cut', 16, 'number'), ctl('High Cut', 17, 'number'), ctl('Lo Freq', 18, 'knob'), ctl('Hi Freq', 19, 'knob'))]
      },
      {
        name: 'Dynamics',
        rows: [row(ctl('Comp', 21, 'knob'), ctl('Threshold', 22, 'knob'), ctl('Ratio', 23, 'knob'), ctl('Attack', 24, 'knob'), ctl('Release', 25, 'knob'))]
      },
      {
        name: 'Advanced',
        rows: [row(ctl('Speaker Drive', 26, 'knob'), ctl('Speaker Comp', 27, 'knob'), ctl('Saturation', 28, 'knob'))]
      }
    ]
  }
};

export interface ParamWrite {
  pid: number;
  value: number;
  continuous: boolean;
}

export interface BlockEditorMock {
  writes: ParamWrite[];
}

/** Install the mocked backend and boot a clean workbench with the amp block on the grid. */
export async function bootBlockEditorMock(page: Page): Promise<BlockEditorMock> {
  const mock: BlockEditorMock = { writes: [] };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/device') return json(route, DEVICE);
    if (path === '/device/detect') return json(route, DETECT);
    if (path === '/healthz') return json(route, { ok: true, api: { version: 2 }, device: 'FM3' });
    if (path === '/preset/grid') return json(route, GRID);
    if (path === '/preset/blocks') return json(route, []);
    if (path === '/ports') return json(route, { chosen: null, override: null, profileOverride: null, ports: [] });
    if (path === `/preset/blocks/${AMP_EID}/params`) return json(route, AMP_PARAMS);
    const w = new RegExp(`^/preset/blocks/${AMP_EID}/params/(\\d+)$`).exec(path);
    if (w && req.method() === 'PUT') {
      const body = req.postDataJSON() as { value: number; continuous: boolean };
      mock.writes.push({ pid: Number(w[1]), value: body.value, continuous: body.continuous });
      return json(route, { ok: true });
    }
    if (path.startsWith('/help/')) return json(route, null, 404); // no parameter help copy
    if (path === '/preset/monitors/live') return json(route, [{ effectId: AMP_EID, family: 'AMP', paramName: 'AMP_OUTPUT', role: 'level', norm: 0.62, db: -20 }]);
    return json(route, {});
  });
  await page.route('**/api/events', (route) => route.abort());
  await bootCleanWorkbench(page);
  await expect(page.locator('[data-idx="0,0"].cell.block')).toBeVisible();
  return mock;
}

/** Select the amp block so the embedded Block Editor shows its board. */
export async function openAmpEditor(page: Page): Promise<void> {
  await page.locator('[data-idx="0,0"].cell.block').click();
  await expect(page.locator('[data-be-board]')).toBeVisible();
  await expect(page.locator('[data-be-key="k0"]').first()).toBeVisible();
}
