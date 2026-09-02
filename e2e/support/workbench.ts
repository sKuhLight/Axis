import { type Page, expect } from '@playwright/test';

/** localStorage key the workbench store persists its document under. */
export const WORKBENCH_DOC_KEY = 'axs.workbench.doc';

/**
 * localStorage key the Preset Browser's sticky simple/advanced search mode lives under
 * (`presetBrowserWorkbenchSearchMode.ts`). Absent means Simple, the default a fresh user gets.
 * Cleared on every clean boot so a spec that toggled to Advanced can't leak into the next run.
 */
export const PB_SEARCH_MODE_KEY = 'axs.pb.searchMode';

/** LocalStorage key for the Block Editor Grid Map's expanded/collapsed state. */
export const GRID_MAP_COLLAPSE_KEY = 'axs.gridmap.collapsed';

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
 *   - axs.lib.built         : library cache-build startup prompt suppressed —
 *     it appears once a device connects (this dev environment has a live FM3
 *     behind the /api proxy) and RACES the specs' first clicks; it intercepted
 *     a nav click in a real run.
 */
const FIRST_RUN_SUPPRESS: Record<string, string> = {
  'axs.telemetry.decided': '1',
  'axs.telemetry.consent': '0',
  'axs.kofi.seen': '1',
  'axs.tour.done': '1',
  'axs.lib.built': 'true',
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
    ({ clearKeys, suppress }) => {
      for (const k of clearKeys) window.localStorage.removeItem(k);
      for (const [k, v] of Object.entries(suppress)) window.localStorage.setItem(k, v);
    },
    { clearKeys: [WORKBENCH_DOC_KEY, PB_SEARCH_MODE_KEY, GRID_MAP_COLLAPSE_KEY], suppress: FIRST_RUN_SUPPRESS },
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

/** Widget zone the My Controls panel renders — the only pin destination. */
export const MY_CONTROLS_ZONE = 'panel:axis.myControls';

export interface PinnedParamSpec {
  effectId: number;
  paramId: number;
  block: string;
  label: string;
  color: string;
}

/** A section marker in My Controls. A blank label renders as a bare divider. */
export interface SectionSpec {
  section: string;
}

export type MyControlsSpec = PinnedParamSpec | SectionSpec;

/**
 * Seed My Controls by editing the persisted document, then reload. Pinning is a
 * menu action over the LIVE selected block, so driving it through the UI would
 * couple these rendering specs to whatever device the dev proxy has connected;
 * writing the same widgets the pin action writes keeps them about the panel, not
 * about the device.
 *
 * Items are laid down in array order, so a section marker followed by controls
 * reproduces exactly what the pin menu produces.
 */
export async function seedMyControls(page: Page, items: MyControlsSpec[]): Promise<void> {
  await page.evaluate(
    ({ key, zone, entries }) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) throw new Error('no persisted workbench doc to seed into');
      const doc = JSON.parse(raw);
      const layout = doc.layouts[doc.profiles[doc.activeProfileId].layoutId];
      entries.forEach((spec, index) => {
        if ('section' in spec) {
          const id = `widget.section.${index}`;
          layout.widgets[id] = {
            id,
            type: 'axis.sectionHeader',
            zone,
            order: index,
            size: 'default',
            state: { label: spec.section, grid: { colSpan: 'full' } }
          };
          return;
        }
        const id = `axis.param.${spec.effectId}.${spec.paramId}`;
        layout.widgets[`widget.${id}`] = {
          id: `widget.${id}`,
          type: 'axis.paramControl',
          zone,
          order: index,
          size: 'default',
          binding: {
            kind: 'axis.paramControl',
            version: 1,
            target: {
              effectId: spec.effectId,
              paramId: spec.paramId,
              block: spec.block,
              param: spec.label,
              label: spec.label
            }
          },
          state: { label: spec.label, sourceId: id, block: spec.block, color: spec.color }
        };
      });
      window.localStorage.setItem(key, JSON.stringify(doc));
    },
    { key: WORKBENCH_DOC_KEY, zone: MY_CONTROLS_ZONE, entries: items }
  );
  await page.reload();
  await page.waitForSelector('.aw-root');
}

/** Seed pinned controls only — the common case. */
export async function seedPinnedControls(page: Page, specs: PinnedParamSpec[]): Promise<void> {
  await seedMyControls(page, specs);
}
