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
  meters: { liveMonitors: true },
  blockState: true
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

/** The amp's Scene Ignore (an OFF / ON enum, shown on the board as the device layout's button) and Bypass
 *  Mode (a select on the Preamp page): the ids the server tags as the block state. */
export const SCENE_IGNORE_PID = 32;
export const BYPASS_MODE_PID = 12;

/** Amp params + a six-page layout: knobs and a switch (Authentic), selects, a slider, the bypass and the
 *  Scene Ignore button (Preamp), a fader, a button and the level meter (Power Amp; drawn only while
 *  metering is on), number views (EQ), and two plain knob pages so the strip is wider than the board.
 *  `blockState` tags Scene Ignore + Bypass Mode (cap `blockState`; Mute Out silences the block). */
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
    { id: 20, name: 'Boost', value: 0, options: [{ value: 0, label: 'Off' }, { value: 1, label: 'On' }] },
    { id: 32, name: 'Scene Ignore', value: 0, options: [{ value: 0, label: 'OFF' }, { value: 1, label: 'ON' }] }
  ],
  blockState: {
    sceneIgnore: { paramId: SCENE_IGNORE_PID, value: 0, supported: true },
    bypassMode: {
      paramId: BYPASS_MODE_PID,
      value: 0,
      options: [
        { value: 0, label: 'Thru', muting: false },
        { value: 1, label: 'Mute FX Out', muting: false },
        { value: 2, label: 'Mute Out', muting: true }
      ]
    }
  } as Record<string, unknown> | undefined,
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
          row(ctl('Bypass', 31, 'button', 'btnBypass'), ctl('Scene Ignore', 32, 'button', 'btnIgnoreScene'))
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

// ── the same amp with device positions (`positioned: true`) ──
// The Authentic page as the device editor lays it out: one line with exact pixel positions (top-left
// corners, a 92 px knob slot), an empty slot after Drive and another before Master, section titles over
// the gain, tone and output groups, and below them a "mixer" section without positions (Input Trim, and
// Level and Balance moved over from Preamp). The Dynamics page has three rows, so the block's rows-only
// default is 6 rows high: the height budget the positioned page has to fit (it does, exactly, with its
// title line and the mixer divider). Expected cells (a knob slot = 2 cells): the titles on line 0, Drive
// (0,1), Bass / Mid / Treble / Presence (4|6|8|10, 1), Master (14,1), Bright (16,1), the "Mixer" divider
// on line 3, Input Trim / Level / Balance (0|2|4, 4).

const at = <T extends object>(c: T, x: number, y: number) => ({ ...c, placement: { positionExact: `${x},${y}` } });
const title = (text: string, x: number, y: number) => ({ label: text, paramName: null, paramId: null, widget: 'label', rawWidget: 'sectionLabel', placement: { positionExact: `${x},${y}` } });
/** x of the k-th knob slot of the positioned Authentic page. */
const slotX = (k: number) => 305 + 92 * k;

export const AMP_PARAMS_POSITIONED = {
  ...AMP_PARAMS,
  // the device editor's short labels (the long parameter names do not fit a small tile)
  named: AMP_PARAMS.named.map((p) => (p.id === 5 ? { ...p, name: 'Master' } : p)),
  enums: AMP_PARAMS.enums.map((e) => (e.id === 10 ? { ...e, name: 'Bright' } : e)),
  layout: {
    ...AMP_PARAMS.layout,
    pages: [
      {
        name: 'Authentic',
        rows: [
          {
            section: 'parameters',
            controls: [
              title('GAIN', slotX(0), 29),
              at(ctl('Drive', 0, 'knob'), slotX(0), 50),
              title('TONE', slotX(2), 29),
              at(ctl('Bass', 1, 'knob'), slotX(2), 50),
              at(ctl('Mid', 2, 'knob'), slotX(3), 50),
              at(ctl('Treble', 3, 'knob'), slotX(4), 50),
              at(ctl('Presence', 4, 'knob'), slotX(5), 50),
              title('OUTPUT', slotX(7), 29),
              at(ctl('Master', 5, 'knob'), slotX(7), 50),
              at(ctl('Bright', 10, 'toggle'), slotX(8), 50)
            ]
          },
          { section: 'mixer', controls: [ctl('Input Trim', 6, 'knob'), ctl('Level', 7, 'knob'), ctl('Balance', 8, 'knob')] }
        ]
      },
      {
        name: 'Preamp',
        rows: [
          row(ctl('Input Select', 11, 'dropdown', 'dropdown1'), ctl('Bypass Mode', 12, 'dropdown', 'dropdown1')),
          row(ctl('Depth', 9, 'slider')),
          row(ctl('Bypass', 31, 'button', 'btnBypass'), ctl('Scene Ignore', 32, 'button', 'btnIgnoreScene'))
        ]
      },
      ...AMP_PARAMS.layout.pages.slice(2, 4),
      {
        name: 'Dynamics',
        rows: [row(ctl('Comp', 21, 'knob'), ctl('Threshold', 22, 'knob')), row(ctl('Ratio', 23, 'knob'), ctl('Attack', 24, 'knob')), row(ctl('Release', 25, 'knob'))]
      },
      ...AMP_PARAMS.layout.pages.slice(5)
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
  /** Captured discrete (enum) writes of the amp (`PUT …/params/<pid>` with `continuous:false`), in order:
   *  the board's selects / switches and the header's Scene Ignore / Bypass mode. The amp's params read
   *  back with these values (and its `blockState` with them). */
  enumWrites: { pid: number; value: number }[];
  /** Answer the amp's next discrete write to this param with a 500 (captured, not applied); cleared after. */
  failNextEnumWrite: number | null;
  /** Captured channel switches of the amp (`POST /preset/blocks/<eid>/channel`). */
  channelWrites: string[];
  /** Captured bypass writes of the amp (`POST /preset/blocks/<eid>/bypass`). */
  bypassWrites: boolean[];
  /** Captured bypass writes of every block, by effect id. */
  bypassByEid: Record<number, boolean[]>;
}

export interface BlockEditorMockOptions {
  /** Give the amp block channels, starting on this one (its live state then comes from /preset/blocks
   *  and /preset/scene-state and follows the captured channel / bypass writes). */
  channel?: string;
  /** Three more blocks beside the amp: a cab at (0,1) (`CAB_EID`), a block without a parameter pack
   *  at (0,2) (`NOPACK_EID`) and a block whose parameters fail to read at (0,3) (`ERROR_EID`). */
  extraBlocks?: boolean;
  /** Serve the amp's layout with device positions (`AMP_PARAMS_POSITIONED`): an Authentic page with exact
   *  pixel positions, section titles and a mixer section. */
  positioned?: boolean;
  /** The device's `blockState` capability (default true). `false`: a device without it (caps false, no
   *  tag on the params); `'absent'`: an older ForgeFX (no caps key, no tag). */
  blockState?: boolean | 'absent';
  /** Serve the amp's Scene Ignore as firmware-gated (`supported: false` with this reason, e.g.
   *  "Needs firmware ≥ 5.03"). */
  sceneIgnoreGate?: string;
}

export const CAB_EID = 101;
export const NOPACK_EID = 102;
export const ERROR_EID = 103;
const EXTRA_CELLS = [
  { row: 0, col: 1, effectId: CAB_EID, name: 'Cab 1', slug: 'Cab', isShunt: false, routeFlag: 0, fromRows: [0] },
  { row: 0, col: 2, effectId: NOPACK_EID, name: 'Mystery 1', slug: null, isShunt: false, routeFlag: 0, fromRows: [0] },
  { row: 0, col: 3, effectId: ERROR_EID, name: 'Drive 1', slug: 'Drive', isShunt: false, routeFlag: 0, fromRows: [0] }
];
const CAB_PARAMS = {
  block: 'Cab',
  slug: 'cab',
  page: 1,
  named: [knob(8, 'Level', 0.5), knob(9, 'Pan'), knob(10, 'Low Cut', 0.2)],
  enums: [],
  type: null
};
const CAB_STATE = {
  modeParam: 0,
  mode: { value: 0, label: 'Legacy' },
  modeOptions: [
    { value: 0, label: 'Legacy' },
    { value: 1, label: 'DynaCab' }
  ],
  bankOptions: ['FACTORY 1'],
  dynaOptions: [],
  slots: [{ slot: 1, bankParam: 1, irParam: 2, dynaParam: 3, bank: { value: 0, label: 'FACTORY 1' }, irIndex: 4, irName: '4x12 Green', dyna: { value: 0, label: '' } }]
};

/** Install the mocked backend and boot a clean workbench with the amp block on the grid. */
export async function bootBlockEditorMock(page: Page, opts: BlockEditorMockOptions = {}): Promise<BlockEditorMock> {
  const mock: BlockEditorMock = { writes: [], enumWrites: [], failNextEnumWrite: null, channelWrites: [], bypassWrites: [], bypassByEid: {} };
  const grid = opts.extraBlocks ? { ...GRID, cells: [...GRID.cells, ...EXTRA_CELLS] } : GRID;
  const bsCap = opts.blockState ?? true;
  const device =
    bsCap === true
      ? DEVICE
      : bsCap === false
        ? { ...DEVICE, capabilities: { ...CAPS, blockState: false } }
        : { ...DEVICE, capabilities: Object.fromEntries(Object.entries(CAPS).filter(([k]) => k !== 'blockState')) };
  // the amp's enum values as the device holds them (the captured enum writes land here)
  const enumValues = new Map<number, number>();
  const ampParams = () => {
    const base = opts.positioned ? AMP_PARAMS_POSITIONED : AMP_PARAMS;
    const enums = base.enums.map((e) => (enumValues.has(e.id) ? { ...e, value: enumValues.get(e.id)! } : e));
    const valueOf = (pid: number) => enums.find((e) => e.id === pid)?.value ?? 0;
    const bs = base.blockState as { sceneIgnore: { paramId: number }; bypassMode: { paramId: number } } | undefined;
    const blockState =
      bsCap === true && bs
        ? {
            sceneIgnore: {
              ...bs.sceneIgnore,
              value: valueOf(bs.sceneIgnore.paramId),
              ...(opts.sceneIgnoreGate ? { supported: false, reason: opts.sceneIgnoreGate } : {})
            },
            bypassMode: { ...bs.bypassMode, value: valueOf(bs.bypassMode.paramId) }
          }
        : undefined;
    const out: Record<string, unknown> = { ...base, enums };
    if (blockState) out.blockState = blockState;
    else delete out.blockState;
    return out;
  };
  const live = { bypassed: false, channel: opts.channel ?? null };
  const blockState = () => [{ slug: 'Amp', name: 'Amp 1', effectId: AMP_EID, row: 0, col: 0, fromRows: [], bypassed: live.bypassed, channel: live.channel }];
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (path === '/device') return json(route, device);
    if (path === '/device/detect') return json(route, DETECT);
    if (path === '/healthz') return json(route, { ok: true, api: { version: 2 }, device: 'FM3' });
    if (path === '/preset/grid') return json(route, grid);
    if (path === '/preset/blocks') return json(route, opts.channel ? blockState() : []);
    if (path === '/preset/scene-state' && opts.channel) return json(route, blockState().map(({ effectId, bypassed, channel }) => ({ effectId, bypassed, channel })));
    if (path === `/preset/blocks/${AMP_EID}/channel` && req.method() === 'POST') {
      const body = req.postDataJSON() as { channel: string };
      mock.channelWrites.push(body.channel);
      live.channel = body.channel;
      return json(route, { ok: true });
    }
    const byp = /^\/preset\/blocks\/(\d+)\/bypass$/.exec(path);
    if (byp && req.method() === 'POST') {
      const eid = Number(byp[1]);
      const body = req.postDataJSON() as { bypassed: boolean };
      (mock.bypassByEid[eid] ??= []).push(body.bypassed);
      if (eid === AMP_EID) {
        mock.bypassWrites.push(body.bypassed);
        live.bypassed = body.bypassed;
      }
      return json(route, { ok: true });
    }
    if (opts.extraBlocks) {
      if (path === `/preset/blocks/${CAB_EID}/params`) return json(route, CAB_PARAMS);
      if (path === `/preset/blocks/${CAB_EID}/cab`) return json(route, CAB_STATE);
      if (path === '/cab/irs') return json(route, { 'FACTORY 1': ['4x12 Green', '2x12 Blue'] });
      if (path === `/preset/blocks/${ERROR_EID}/params`) return json(route, { error: 'unknown block' }, 404); // 4xx: a read error without the failure reporter
    }
    if (path === '/ports') return json(route, { chosen: null, override: null, profileOverride: null, ports: [] });
    if (path === `/preset/blocks/${AMP_EID}/params`) return json(route, ampParams());
    const w = new RegExp(`^/preset/blocks/${AMP_EID}/params/(\\d+)$`).exec(path);
    if (w && req.method() === 'PUT') {
      const body = req.postDataJSON() as { value: number; continuous: boolean };
      const pid = Number(w[1]);
      mock.writes.push({ pid, value: body.value, continuous: body.continuous });
      if (body.continuous === false) {
        mock.enumWrites.push({ pid, value: body.value });
        if (mock.failNextEnumWrite === pid) {
          mock.failNextEnumWrite = null;
          return json(route, { error: 'device timeout' }, 500);
        }
        enumValues.set(pid, body.value);
      }
      return json(route, { ok: true });
    }
    if (path.startsWith('/help/')) return json(route, null, 404); // no parameter help copy
    if (/^\/blocks\/[^/]+\/types$/.test(path))
      return json(route, [
        { value: 7, name: 'Plexi 100W', manufacturer: null, basedOn: null },
        { value: 8, name: 'Recto Orange', manufacturer: null, basedOn: null }
      ]);
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

// ── the header's ⋯ menu (rows carry `be-mi-<id>` classes, see src/lib/blockEditor/moreMenu.ts) ──

/** Open the ⋯ menu of the (first) Block Editor surface and return it. */
export async function openMore(page: Page, scope = page.locator('body')) {
  await scope.locator('[data-be-more]').first().click();
  const menu = page.getByRole('menu', { name: 'Block and layout options' });
  await expect(menu).toBeVisible();
  return menu;
}

/** Pick a ⋯ row by its id (`arrange`, `nav-side`, `size-l`, `new-copy`, …); confirms when it asks. */
export async function pickMore(page: Page, id: string, opts: { confirm?: boolean; scope?: ReturnType<Page['locator']> } = {}) {
  const menu = await openMore(page, opts.scope);
  await menu.locator(`.be-mi-${id}`).click();
  if (opts.confirm) await menu.locator('[data-menu-confirm]').click();
  await expect(menu).toHaveCount(0);
}

const exact = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

/** A profile row of the open ⋯ menu by its name (the label, without its hint). */
export const profileRow = (menu: ReturnType<Page['locator']>, name: string) =>
  menu.locator('.be-mi-profile').filter({ has: menu.page().locator('span:not(.aw-menu-check)', { hasText: exact(name) }) });

/** Pick a layout profile from the ⋯ menu. */
export async function pickProfile(page: Page, name: string) {
  const menu = await openMore(page);
  await profileRow(menu, name).click();
  await expect(menu).toHaveCount(0);
}

/** The active layout profile, read from the ⋯ menu (opened, then closed). */
export async function checkedProfile(page: Page): Promise<string> {
  const menu = await openMore(page);
  const label = (await menu.locator('.be-mi-profile[aria-checked="true"] span:not(.aw-menu-check)').first().textContent())?.trim() ?? '';
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  return label;
}

// ── board saves ──

/** Count the board saves of this page load (a change of any `axs.be1.<…>` board in the stored surface
 *  document). Call before booting; read with `boardSaves`. */
export async function countBoardSaves(page: Page) {
  await page.addInitScript(() => {
    const boardsOf = (raw: string | null) => {
      try {
        const d = JSON.parse(raw ?? '{}') as Record<string, string>;
        return Object.keys(d)
          .filter((k) => k.startsWith('axs.be1.'))
          .sort()
          .map((k) => `${k}=${d[k]}`)
          .join('\n');
      } catch {
        return '';
      }
    };
    const w = window as unknown as { __beSaves: number };
    w.__beSaves = 0;
    let last = boardsOf(window.localStorage.getItem('axs.surface.doc'));
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
      if (k === 'axs.surface.doc') {
        const now = boardsOf(v);
        if (now !== last) w.__beSaves++;
        last = now;
      }
      return set.call(this, k, v);
    };
  });
}

/** The board saves counted since `countBoardSaves` (this page load). */
export const boardSaves = (page: Page) => page.evaluate(() => (window as unknown as { __beSaves: number }).__beSaves);

// ── Arrange (the bar's parts carry `data-be-ab="<part>"`, the library rows `data-be-lib-row="<key>"`) ──

/** Select a tile while arranging (a click on its body). */
export async function selectTile(page: Page, key: string, scope = page.locator('body')) {
  const t = scope.locator(`[data-be-key="${key}"]`).first();
  await t.click();
  await expect(t).toHaveClass(/\bsel\b/);
}

/** Open the "Add" library from the arrange bar (if it is not open) and return it. */
export async function openLibrary(page: Page) {
  const lib = page.locator('[data-be-library]');
  if (!(await lib.isVisible())) await page.locator('[data-be-ab="add"]').click();
  await expect(lib).toBeVisible();
  return lib;
}

/** Arrange: add a control from the library to the current page (a click = the first free spot). */
export async function arrangeAdd(page: Page, key: string) {
  const lib = await openLibrary(page);
  await lib.locator(`[data-be-lib-row="${key}"]`).click();
}
