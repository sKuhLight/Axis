# Axis workbench E2E suite (Playwright) — task T26

End-to-end tests for the **gated workbench shell** (`VITE_AXIS_WORKBENCH=1`).
They exercise the shell chrome only — dock interactions, widgets, navigation,
custom panels, layout presets, keyboard, and persistence — **all of which work
without a ForgeFX device or backend**. With no backend the grid body renders an
offline/connecting state; no test depends on device data.

## Running

```bash
# Full suite (Chromium). Playwright boots its own gated dev server on :5199.
npm run test:e2e

# Single browser / file / test
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test e2e/03-dock.spec.ts
npx playwright test -g "corrupt"

# Headed / debug
npx playwright test --project=chromium --headed
npx playwright test --ui
```

### Dev server

`playwright.config.ts` has a `webServer` block that runs
`npx vite dev --host 127.0.0.1 --port 5199` with `VITE_AXIS_WORKBENCH=1`.
`reuseExistingServer` is on (outside CI), so a hand-started server on the same
port is reused:

```bash
VITE_AXIS_WORKBENCH=1 npx vite dev --host 127.0.0.1 --port 5199
```

Override the port with `PW_PORT=<n>` (config reads it for both the server and
`baseURL`).

## Browsers

Install the Playwright browser builds once:

```bash
npx playwright install chromium   # default project
npx playwright install firefox    # optional `firefox` project
```

- **`chromium`** — default project, uses Playwright's bundled Chromium.
- **`firefox`** — uses Playwright's bundled Firefox. Note: Playwright needs its
  own Juggler-patched Firefox; a stock system Firefox is **not** drop-in
  compatible via `executablePath`. For completeness the config still honours
  `PW_FIREFOX_PATH=/path/to/firefox` to point at a custom Playwright-compatible
  Firefox build, but the normal path is `npx playwright install firefox`.

Both projects pin the viewport to **1440×900**. This is load-bearing: the
workbench viewport-profile resolver (T14) treats widths `<1366` as the *tablet*
profile, whose seeded layout differs from the desktop default these tests
assert against. Keep any new tests at a desktop-width viewport unless they
specifically target the tablet/mobile profile.

## Test isolation

Every test starts from `bootCleanWorkbench(page)` (see `support/workbench.ts`),
which navigates, clears the persisted document (`localStorage` key
`axs.workbench.doc`), reloads, and waits for the shell. The store persists on
every change, so this reset gives each test the canonical default layout
(Signal Grid main + Block Editor bottom, side nav, gridbar with GRID + SIZE).

## Selectors

The suite uses existing stable hooks in the app source — **no `data-testid`
attributes were added**:

- `.aw-root`, `.aw-root.aw-editing`, `.aw-root.aw-nav-bottom`,
  `.aw-root.aw-dragging-panel`
- `[data-zone-shell="rail"]`, `[data-zone-shell="bottom-nav"]`,
  `[data-zone="top.left|top.right"]`
- `[data-tabstack]`, `[data-region="main|bottom|…"]`, `.aw-tabstack[data-region]`
- `.aw-pane-tab`, `.aw-pane-btn[title="Panel actions"]`, `.aw-tabbody`
- `[data-nav-entry="<id>"]`, `[data-nav-active="true"]`, `button.axis-nav-entry`
- `.aw-context-menu`, `.aw-menu-item` (roles `menu`/`menuitem`/`menuitemradio`;
  drill-in submenus start with a `Back` row; inline fields are `input[data-menu-input]`)
- Edit bar: `[data-editbar]` (role `toolbar`) with controls `[data-eb="undo|redo|page|layout|profile|add|more|done"]`,
  the `.aw-eb-tag` CUSTOMIZE tag, `.aw-eb-status` hint and the `[role="alert"]` error chip.
  Helpers in `support/workbench.ts`: `editBar`, `editBarControl`, `openEditBarMenu`,
  `menuLabels`, `addCustomPanel` (Add › "Add custom panel").
- `.aw-viewport.aw-preview` (pinned-profile preview), `.aw-preview-label`
- `.axis-gridbar .pill-chip` (Full/Map/Auto), `.axis-gridbar .block-size .step`
- `.axis-preset-tab` (Default/Stage/Studio/Compact — radio rows in the edit bar's LAYOUT menu)
- `.aw-zone-empty` (empty custom-panel hint)
- Buttons by accessible text: `Customize` (the bottom-bar toggle; pressed while editing),
  `Done` (exactly one, in the edit bar), `Undo layout change`, `Redo layout change`,
  `Auto` / `Desktop` / `Tablet` / `Mobile` (profile control), `Map`

## Test inventory (9 files, 17 tests)

1. **01-boot** — shell chrome renders; no console errors beyond the filtered
   ForgeFX/`/api` connection failures.
2. **02-edit-mode** — Customize opens the edit bar (CUSTOMIZE tag, Undo/Redo,
   PAGE, LAYOUT, Add, Done); per-panel Close chrome appears; Done exits.
3. **03-dock** — drag a panel tab between regions (manual pointer drag);
   tab switching; collapse + close from the pane header menu.
4. **04-nav** — Setup docks a VirtualScreen panel + active tint, second click
   focuses (no duplicate); Scenes docks a placeholder; active tint follows.
5. **05-widgets** — gridbar GRID chips visible, Map switches active mode;
   block-size stepper cycles M↔L.
6. **06-persistence** — a rearrangement survives reload; a corrupt stored doc
   self-heals to defaults (no blank page).
7. **07-layout-presets** — LAYOUT menu lists the presets as radio rows; Stage →
   bottom nav; Default → side rail; Reset layout asks inline first.
8. **08-keyboard** — Escape closes an open context menu and restores focus to
   the opener (T18).
9. **09-custom-panel** — Add › "Add custom panel" inserts a custom panel with
   the empty-drop hint.

Later specs (10–21) cover bottom-nav mode, pages, widget menus, the Customize
drawers (opened from the edit bar's PAGE / Add / LAYOUT menus), the profile
preview frame (the edit bar stays full width above it), parameter collect, grid
routing, device layout, telemetry, and **19-edit-bar** — the edit bar's geometry
(full width at the top, the app shifted by exactly its height, no overlap), its
menus (inline delete confirm, rename field, duplicate, presets, saved layouts,
import / export, backups, Add), and its overflow into ⋯ More at 1100 / 834 /
390 px, and **20-dock-zones** — panel drags (the dragged panel is lifted out of
the dock, five labelled zones on the hovered panel, the panel lands exactly on
the highlighted rect, edges, empty region strips, small panels, nav pages,
cancel, library drag-out, occupied and collapsed regions, tab bars at the
workspace top), the panel menu's Move to ▸, maximize (incl. Escape priority
behind app overlays) and collapse strips, and **21-pages-lossless** — pages and
panels are never lost: page deletes ask inline and park their panels, the
Library's panel catalog shows every panel's status and re-adds or moves it (tap
or drag), deleted default pages come back from Add page ▸ / the nav "+" at their
seed position with their nav entry, the "Bring it here" hint, Reset to default /
Clear page with one-step undo, Remove from page, Delete everywhere for custom
panels, and the nav context menu's edit-mode-only Delete. Every spec runs offline: `bootCleanWorkbench` aborts `/api/**` at the
browser-context level (page-level mocks still win), so a reachable ForgeFX can
neither drive a device nor pop device prompts over the chrome.

## Ignore these generated artifacts

Playwright writes `test-results/` and `playwright-report/` at the repo root.
Add them to `.gitignore` (this suite does not own `.gitignore`):

```gitignore
/test-results
/playwright-report
```
