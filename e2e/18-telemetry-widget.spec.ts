import { test, expect, type Page, type Route } from '@playwright/test';
import { bootCleanWorkbench } from './support/workbench';

// AXIS-43 (META-17) — the workbench telemetry widget: a device polling-mode quick-switch + live traffic
// readout, capability-gated on caps.telemetryControl. Driven against a fully MOCKED backend so nothing
// touches the operator's live FM3 on :5056. The widget is seeded into the default layout's gridbar
// (axisWorkbenchDefaults), so bootCleanWorkbench (which forces the default doc) mounts it.

const SHUNT_BASE = 1024;

const baseCaps = {
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
  shuntBase: SHUNT_BASE
};

const GRID = {
  model: 'FM3',
  name: 'MOCK TELEMETRY',
  crcValid: true,
  rows: 4,
  cols: 6,
  scenes: [],
  cells: [{ row: 0, col: 0, effectId: 200, name: 'Drive 1', slug: 'Drive', isShunt: false, routeFlag: 0, fromRows: [] }]
};

const TELEMETRY_CONFIG = { mode: 'balanced', effective: { pollMs: 8000, watchMs: 6000 }, modes: ['performance', 'balanced', 'reduced'] };

interface TelemetryMock {
  puts: { mode?: string }[];
}

/** Install the mock. `telemetryControl` toggles the capability the widget gates on. */
async function bootTelemetry(page: Page, telemetryControl: boolean): Promise<TelemetryMock> {
  const mock: TelemetryMock = { puts: [] };
  const caps = { ...baseCaps, telemetryControl };
  const device = { model: 'FM3', modelByte: '0x0A', modelId: 10, apiVersion: 2, capabilities: caps, firmware: null, port: 'mock' };
  const detect = { connected: true, modelId: 10, name: 'FM3', short: 'FM3', gen: 3, supported: true, port: 'mock' };

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace(/^\/api/, '');
    const method = req.method();

    if (path === '/device') return json(route, device);
    if (path === '/device/detect') return json(route, detect);
    if (path === '/healthz') return json(route, { ok: true, api: { version: 2 }, device: 'FM3' });
    if (path === '/preset/grid') return json(route, GRID);
    if (path === '/preset/blocks') return json(route, []);
    if (path === '/ports') return json(route, { chosen: null, override: null, profileOverride: null, ports: [] });
    if (path === '/telemetry/config') {
      if (method === 'PUT') {
        const body = req.postDataJSON() as { mode?: string };
        mock.puts.push(body);
        return json(route, { ...TELEMETRY_CONFIG, mode: body.mode ?? 'balanced' });
      }
      return json(route, TELEMETRY_CONFIG);
    }
    // everything else (telemetry/status, cloud/status, meters, …) → benign empty; boot reads are guarded.
    return json(route, {});
  });
  await page.route('**/api/events', (route) => route.abort());

  await bootCleanWorkbench(page);
  return mock;
}

test.describe('Telemetry widget (AXIS-43)', () => {
  test('renders in the gridbar when the device advertises telemetry control', async ({ page }) => {
    await bootTelemetry(page, true);
    const widget = page.locator('.axis-gridbar .axis-telemetry');
    await expect(widget).toHaveCount(1);
    // The three P/B/R mode buttons render; Balanced (B) is the default active one.
    const modes = widget.locator('.tmode');
    await expect(modes).toHaveText(['P', 'B', 'R']);
    await expect(widget.locator('.tmode.on')).toHaveText('B');
  });

  test('a mode switch PUTs the new polling mode to the device', async ({ page }) => {
    const mock = await bootTelemetry(page, true);
    const widget = page.locator('.axis-gridbar .axis-telemetry');
    await expect(widget).toHaveCount(1);

    // Click "P" (Performance). setPollingMode → forgefx.setTelemetryMode → PUT /telemetry/config.
    await widget.locator('.tmode', { hasText: 'P' }).click();
    await expect(widget.locator('.tmode.on')).toHaveText('P');

    // A PUT carrying mode:'performance' was captured (alongside the boot-time reapply of 'balanced').
    await expect.poll(() => mock.puts.some((p) => p.mode === 'performance')).toBe(true);
  });

  test('is hidden when the device has no telemetry control', async ({ page }) => {
    await bootTelemetry(page, false);
    // The gridbar still mounts (grid mode / block size live there), but the telemetry widget renders
    // nothing without the capability.
    await expect(page.locator('.axis-gridbar')).toHaveCount(1);
    await expect(page.locator('.axis-telemetry')).toHaveCount(0);
  });
});
