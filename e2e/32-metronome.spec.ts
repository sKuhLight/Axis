import { test, expect, type Page, type Route } from '@playwright/test';
import { bootCleanWorkbench } from './support/workbench';

// The metronome modal (top-bar widget + global `M`). A fully MOCKED backend asserts the Axis
// half: the widget renders beside tap tempo, `M` opens the modal, the tempo seeds from the
// preset tempo, Space starts/stops the DEVICE metronome, and each control writes its own
// effect/param — tempo → CONTROLLERS_TEMPO (eid 2, 32), level → GLOBAL_METLEVEL1 (eid 1, 119),
// switch → GLOBAL_METRONOME (eid 1, 14878).

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
  tempo: true,
  editorLayouts: false,
  virtualEffects: []
};
const DEVICE = { model: 'FM3', modelByte: '0x11', modelId: 17, apiVersion: 2, capabilities: CAPS, firmware: null, port: 'mock' };
const DETECT = { connected: true, modelId: 17, name: 'FM3', short: 'FM3', gen: 3, supported: true, port: 'mock' };
const GRID = { model: 'FM3', name: 'MOCK', crcValid: true, rows: 4, cols: 6, scenes: [], cells: [] };

async function bootWithBackend(page: Page, opts: { metronomeOn?: boolean; level?: number } = {}): Promise<void> {
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  // Predicate, not a `**/api/**` glob: Vite serves app source under `/src/lib/api/…`, which the
  // glob would swallow and answer with JSON, breaking module loading.
  const isBackend = (url: URL) => url.pathname.startsWith('/api/');
  await page.route(isBackend, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, '');
    if (route.request().method() === 'PUT' && /^\/preset\/blocks\/[12]\/params\/\d+$/.test(path)) return json(route, { ok: true });
    if (path === '/device') return json(route, DEVICE);
    if (path === '/device/detect') return json(route, DETECT);
    if (path === '/healthz') return json(route, { ok: true, api: { version: 2 }, device: 'FM3' });
    if (path === '/tempo') return json(route, { bpm: 152 });
    if (path === '/preset/grid') return json(route, GRID);
    if (path === '/preset/blocks') return json(route, []);
    if (path === '/preset/blocks/1/params')
      return json(route, {
        block: 'GLOBAL',
        slug: 'global',
        page: -1,
        named: [{ id: 119, name: 'Output 1', paramName: 'GLOBAL_METLEVEL1', value: opts.level ?? -18, norm: 0.5, min: -40, max: 20 }],
        enums: [{ id: 14878, name: 'Metronome', paramName: 'GLOBAL_METRONOME', value: opts.metronomeOn ? 1 : 0, options: [{ value: 0, label: 'Off' }, { value: 1, label: 'On' }] }],
        type: null
      });
    if (path === '/ports') return json(route, { chosen: null, override: null, profileOverride: null, ports: [] });
    return json(route, {});
  });
  await page.route('**/api/events', (route) => route.abort());

  await bootCleanWorkbench(page, { interceptHealthz: false });
}

test.describe('Metronome modal', () => {
  test('the widget sits beside tap tempo and M opens the modal seeded from the preset tempo', async ({ page }) => {
    await bootWithBackend(page);

    await expect(page.locator('button[aria-label="Metronome"]')).toBeVisible();

    await page.keyboard.press('m');
    const dialog = page.getByRole('dialog', { name: 'Metronome' });
    await expect(dialog).toBeVisible();
    // Seeded from GET /tempo (152), not the 120 default.
    await expect(dialog.locator('.num')).toHaveText('152');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('opens mirroring the Controllers Tempo/Pitch switch and level', async ({ page }) => {
    await bootWithBackend(page, { metronomeOn: true, level: -6 });
    await page.keyboard.press('m');
    const dialog = page.getByRole('dialog', { name: 'Metronome' });
    await expect(dialog).toBeVisible();
    // The switch is ON on the device → the modal shows Stop without the user doing anything.
    await expect(dialog.getByRole('button', { name: 'Stop' })).toBeVisible();
    await expect(dialog.locator('.db')).toHaveText('−6.0 dB');
  });

  test('Space starts and stops the DEVICE metronome (GLOBAL_METRONOME)', async ({ page }) => {
    await bootWithBackend(page);
    await page.keyboard.press('m');
    const dialog = page.getByRole('dialog', { name: 'Metronome' });
    await expect(dialog).toBeVisible();

    const on = page.waitForRequest(
      (r) => r.method() === 'PUT' && new URL(r.url()).pathname === '/api/preset/blocks/1/params/14878'
    );
    await page.keyboard.press('Space');
    expect((await on).postDataJSON()).toMatchObject({ value: 1, continuous: false });
    await expect(dialog.getByRole('button', { name: 'Stop' })).toBeVisible();

    const off = page.waitForRequest(
      (r) => r.method() === 'PUT' && new URL(r.url()).pathname === '/api/preset/blocks/1/params/14878'
    );
    await page.keyboard.press('Space');
    expect((await off).postDataJSON()).toMatchObject({ value: 0, continuous: false });
    await expect(dialog.getByRole('button', { name: 'Start' })).toBeVisible();
  });

  test('tempo writes CONTROLLERS_TEMPO and level writes GLOBAL_METLEVEL1', async ({ page }) => {
    await bootWithBackend(page);
    await page.keyboard.press('m');
    const dialog = page.getByRole('dialog', { name: 'Metronome' });
    await expect(dialog).toBeVisible();

    // Type a new tempo → PUT the Tempo/Pitch Tempo knob (eid 2, pid 32).
    await dialog.locator('.num').click();
    await dialog.locator('input[aria-label="Tempo in BPM"]').fill('100');
    await dialog.locator('input[aria-label="Tempo in BPM"]').press('Enter');
    await expect(dialog.locator('.num')).toHaveText('100');

    const tempo = page.waitForRequest(
      (r) => r.method() === 'PUT' && new URL(r.url()).pathname === '/api/preset/blocks/2/params/32'
    );
    await dialog.locator('input[aria-label="Tempo"]').fill('128');
    const tempoReq = await tempo;
    expect(tempoReq.postDataJSON()).toMatchObject({ continuous: true });

    const level = page.waitForRequest(
      (r) => r.method() === 'PUT' && new URL(r.url()).pathname === '/api/preset/blocks/1/params/119'
    );
    await dialog.locator('input[aria-label="Metronome level"]').fill('-6');
    const levelReq = await level;
    expect(levelReq.postDataJSON()).toMatchObject({ continuous: true });
  });
});
