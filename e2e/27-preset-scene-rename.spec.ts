import { test, expect, type Page, type Route } from '@playwright/test';
import { bootCleanWorkbench } from './support/workbench';

// The Grid page's single scene pencil opens BOTH the preset and scene names for inline editing
// (shared `nameRename` session in axis-workbench/widgets). Enter commits every changed field.
// Driven against a fully MOCKED device (renameable preset + writable scene names) so nothing
// touches the operator's live FM3 on :5056.

const CAPS = {
  slotModel: 'grid',
  slotCount: 512,
  grid: { rows: 4, cols: 6 },
  hasScenes: true,
  sceneCount: 3,
  hasChannels: false,
  channelNames: [],
  channelBlocks: [],
  supportsSave: true,
  gridRouting: true,
  gridCursorSelect: false,
  shuntBase: 1024,
  editorLayouts: true,
  sceneNamesWritable: true,
  presets: { count: 512, addressing: 'numeric', canRename: true, canScanNames: false, canDeepScan: false, liveQuery: true }
};
const DEVICE = { model: 'FM3', modelByte: '0x11', modelId: 17, apiVersion: 2, capabilities: CAPS, firmware: null, port: 'mock' };
const DETECT = { connected: true, modelId: 17, name: 'FM3', short: 'FM3', gen: 3, supported: true, port: 'mock' };
const GRID = { model: 'FM3', name: 'MOCK PRESET', crcValid: true, rows: 4, cols: 6, scenes: ['Intro', 'Verse', 'Chorus'], cells: [] };

async function bootWithRename(page: Page): Promise<void> {
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  const isBackend = (url: URL) => url.pathname.startsWith('/api/');
  await page.route(isBackend, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (path === '/device') return json(route, DEVICE);
    if (path === '/device/detect') return json(route, DETECT);
    if (path === '/healthz') return json(route, { ok: true, api: { version: 2 }, device: 'FM3' });
    if (path === '/preset') return json(route, { number: 5, name: 'MOCK PRESET' });
    if (path === '/preset/grid') return json(route, GRID);
    if (path === '/preset/scene-names') return json(route, { names: ['Intro', 'Verse', 'Chorus'] });
    if (path === '/scene') return json(route, { index: 0 });
    if (path === '/preset/name') return json(route, { ok: true });
    if (path === '/scene/name') return json(route, { ok: true });
    if (path === '/preset/blocks') return json(route, []);
    if (path === '/ports') return json(route, { chosen: null, override: null, profileOverride: null, ports: [] });
    return json(route, {});
  });
  await page.route('**/api/events', (route) => route.abort());

  // This spec supplies its own `/healthz` (device online) — opt out of the default offline intercept.
  await bootCleanWorkbench(page, { interceptHealthz: false });
  await expect(page.locator('.axis-preset .preset-name')).toHaveText('MOCK PRESET');
}

test.describe('Grid preset + scene inline rename', () => {
  test('the scene pencil opens both names and Enter commits the changes', async ({ page }) => {
    const sceneNameRequest = page.waitForRequest((r) => r.url().includes('/api/scene/name'));
    const presetNameRequest = page.waitForRequest((r) => r.url().includes('/api/preset/name'));

    await bootWithRename(page);
    await page.locator('.scene-rename').click();

    const presetInput = page.locator('.axis-preset .preset-name-in');
    const sceneInput = page.locator('.scene-name-in');
    await expect(presetInput).toBeVisible();
    await expect(sceneInput).toBeVisible();
    await expect(presetInput).toBeFocused();
    await expect(presetInput).toHaveValue('MOCK PRESET');
    await expect(sceneInput).toHaveValue('Intro');

    await presetInput.fill('My Lead');
    await sceneInput.fill('My Scene');
    await sceneInput.press('Enter');

    const sceneReq = await sceneNameRequest;
    expect(JSON.parse(sceneReq.postData() ?? '{}')).toEqual({ index: 0, name: 'My Scene' });
    const presetReq = await presetNameRequest;
    expect(JSON.parse(presetReq.postData() ?? '{}')).toEqual({ name: 'My Lead' });

    // Session closes after commit.
    await expect(presetInput).toHaveCount(0);
    await expect(page.locator('.scene-name-in')).toHaveCount(0);
  });

  test('Escape closes the session without writing', async ({ page }) => {
    let wrote = false;
    page.on('request', (r) => {
      if (r.url().includes('/api/preset/name') || r.url().includes('/api/scene/name')) wrote = true;
    });

    await bootWithRename(page);
    await page.locator('.scene-rename').click();
    await expect(page.locator('.scene-name-in')).toBeVisible();
    await page.locator('.scene-name-in').fill('Discarded');
    await page.locator('.scene-name-in').press('Escape');

    await expect(page.locator('.scene-name-in')).toHaveCount(0);
    expect(wrote).toBe(false);
  });
});
