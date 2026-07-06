import { type Page, expect } from '@playwright/test';

/** localStorage key the workbench store persists its document under. */
export const WORKBENCH_DOC_KEY = 'axs.workbench.doc';

/**
 * First-run popup suppression keys (editor.svelte.ts). On a clean localStorage
 * boot the app opens one-time popups that are NOT part of the workbench chrome
 * under test — most importantly the telemetry-consent modal, a full-screen
 * `.bg` scrim (z-index 360) that intercepts every pointer event and blocks the
 * bottom-bar Customize control. Seeding these keys marks the first-run choices
 * as already made so the shell boots straight to the workbench, no modal.
 *   - axs.telemetry.decided : first-run consent choice made → consent modal off
 *   - axs.kofi.seen         : Ko-fi nudge toast dismissed
 *   - axs.tour.done         : guided tour completed
 */
const FIRST_RUN_SUPPRESS: Record<string, string> = {
  'axs.telemetry.decided': '1',
  'axs.telemetry.consent': '0',
  'axs.kofi.seen': '1',
  'axs.tour.done': '1',
};

/**
 * Boot the gated shell with a clean persisted document.
 *
 * Two sources can inject a stale layout, and BOTH must be neutralised or the
 * tests won't see the canonical default (Signal Grid main + Block Editor bottom):
 *   1. localStorage `axs.workbench.doc` — a prior run's persisted doc. We remove it.
 *   2. The ForgeFX backend config store (`GET /api/store/config/workbench`) —
 *      `axisWorkbenchInit()` fetches this on boot and, if present, applies it
 *      OVER the clean local default AND re-saves it to localStorage. In this
 *      dev environment a ForgeFX instance IS reachable on :5056 and holds a
 *      resized/rearranged doc from the parallel dev session (Signal Grid dragged
 *      into `top`, `main` emptied, `bottom.sizePx≈737`). We intercept that one
 *      request and return a 404 so `getDoc` resolves null and the app falls back
 *      to `createAxisWorkbenchDefaultDocument()` — the same seed a truly fresh
 *      machine gets. (All other `/api` calls are left alone; the grid just shows
 *      its offline state, which the specs never depend on.)
 *
 * We also seed the first-run popup-suppression flags so no modal scrim covers
 * the chrome under test. Navigate, clean, reload, wait for the shell root.
 */
export async function bootCleanWorkbench(page: Page): Promise<void> {
  // Force the backend config doc to look absent so the app seeds its default
  // layout locally instead of restoring the shared dev-session doc.
  await page.route('**/store/config/workbench', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: 'null' }),
  );

  await page.goto('/');
  await page.evaluate(
    ({ docKey, suppress }) => {
      window.localStorage.removeItem(docKey);
      for (const [k, v] of Object.entries(suppress)) window.localStorage.setItem(k, v);
    },
    { docKey: WORKBENCH_DOC_KEY, suppress: FIRST_RUN_SUPPRESS },
  );
  await page.reload();
  await page.waitForSelector('.aw-root');
  // The default layout writes a fresh doc back to storage on boot.
  await expect
    .poll(async () => page.evaluate((key) => !!window.localStorage.getItem(key), WORKBENCH_DOC_KEY))
    .toBe(true);
}

/**
 * Collapse the desktop nav rail so it doesn't overlay adjacent chrome.
 *
 * Round 9 (4d6ef07) made the desktop rail icon-only at rest and expand as an
 * absolutely-positioned overlay on hover/focus. A prior `clickNav()` leaves the
 * clicked nav button focused, which keeps the rail expanded (focusin); the
 * expanded 200px rail then overlays the bottom bar's Customize control AND the
 * left edge of the main tab strip, intercepting clicks on either. We blur the
 * active element and park the pointer in the top bar so hover-intent drops and
 * the rail collapses before we click the covered control.
 */
export async function collapseRail(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // Move the pointer away from the rail (top bar centre) so hover-intent drops.
  await page.mouse.move(720, 20);
  await expect(page.locator('.aw-rail.aw-rail-expanded')).toHaveCount(0);
}

/**
 * Enter edit mode via the in-bar Customize control and assert the editing
 * chrome is up. Round 9 folded Customize into the bottom bar (`.aw-bottom-customize`,
 * leftmost, both nav modes) — the old floating FAB is gone. The control toggles:
 * label "Customize" (title "Customize layout") at rest → "Done" (title "Finish
 * editing layout") while editing. We target the stable class so label visibility
 * (icon-only below 760px) never affects the selector.
 */
export async function enterEditMode(page: Page): Promise<void> {
  await collapseRail(page);
  await page.locator('.aw-bottom-customize').click();
  await expect(page.locator('.aw-root.aw-editing')).toHaveCount(1);
}

/** Exit edit mode via the same Customize control (now labelled "Done"). */
export async function exitEditMode(page: Page): Promise<void> {
  await collapseRail(page);
  await page.locator('.aw-bottom-customize.active').click();
  await expect(page.locator('.aw-root.aw-editing')).toHaveCount(0);
}

/** Tabs in a given dock region's tab stack. */
export function regionTabs(page: Page, region: string) {
  return page.locator(`.aw-tabstack[data-region="${region}"] .aw-pane-tab`);
}

/** Click a navigation entry by its stable entry id (grid, setup, scenes, …). */
export async function clickNav(page: Page, entryId: string): Promise<void> {
  await page.locator(`[data-nav-entry="${entryId}"] button.axis-nav-entry`).click();
}
