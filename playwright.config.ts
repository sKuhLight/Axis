import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for the gated Axis workbench shell (task T26).
 *
 * The shell is gated behind `VITE_AXIS_WORKBENCH=1`. These tests exercise ONLY
 * the workbench chrome (dock, widgets, nav, custom panels, persistence) — all of
 * which work without a ForgeFX backend. With no device the grid body renders an
 * offline/connecting state; the tests never depend on device data. Expected
 * backend-connection console errors (the `/api` proxy 500s with no ForgeFX) are
 * filtered explicitly in the boot test.
 *
 * Browser selection:
 *   - Default project `chromium` uses Playwright's bundled Chromium.
 *   - `PW_BROWSER=firefox` switches to the `firefox` project, which is configured
 *     to fall back to the system Firefox via `executablePath` if the Playwright
 *     Firefox build isn't installed (see the firefox project below). This is the
 *     documented plan-B for sandboxes where only Firefox is available system-wide.
 */

const PORT = Number(process.env.PW_PORT ?? 5199);
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Optional system-Firefox fallback. Point PW_FIREFOX_PATH at a firefox binary
// (e.g. /usr/bin/firefox) to run the firefox project without the Playwright
// Firefox download. Ignored by the chromium project.
const firefoxPath = process.env.PW_FIREFOX_PATH;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 30_000,
  expect: { timeout: 8_000 },

  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    trace: 'on-first-retry',
    // The SPA is client-rendered (ssr=false); give it room to boot the shell.
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      // Viewport MUST stay ≥1366 wide: the workbench viewport-profile resolver
      // (T14) treats <1366 as the tablet profile, whose seeded layout differs
      // from the desktop default these tests assert against. Set it AFTER the
      // device spread so it wins over the device's 1280×720 default.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1440, height: 900 },
        ...(firefoxPath ? { launchOptions: { executablePath: firefoxPath } } : {}),
      },
    },
  ],

  webServer: {
    // Boot the gated shell on a dedicated port. `reuseExistingServer` lets a
    // hand-started `VITE_AXIS_WORKBENCH=1 npx vite dev --port 5199` be reused.
    command: `npx vite dev --host 127.0.0.1 --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { VITE_AXIS_WORKBENCH: '1' },
  },
});
