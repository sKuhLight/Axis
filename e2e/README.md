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
  `menuLabels`, `addPalette` / `openAddPalette` / `addPaletteCard`, `addCustomPanel`
  (the main tab bar's "+" → Add palette → "New custom panel").
- Add palette: `[role="dialog"][aria-label="Add to the layout"]`, chips `.cat`, target chip
  `.target`, cards `[data-add-card="<kind>:<catalog key>"][data-kind]` (button `.ap-card`,
  title `.ap-title`, status `[data-status]`, previews `[data-preview="live|static|panel|page"]`,
  template menu `.ap-dots`), footer `[data-manage="pages|widgets"]`, page note `[data-page-note]`.
  Context "+": `[data-zone-add="<zone>"]` (`.aw-zone-add` / "+ Widget"), `[data-tab-add]`,
  `[data-region-add="<region>"]`, `[data-nav-add-page]`.
  Click-to-place: `[data-placement="panel|widget|page"]`, spots `[data-place-spot]` (active:
  `[data-active="true"]`).
- Widget drags (slice 4b): the insert line `[data-insert-line]` and the dwell "Group" frame
  `[data-group-frame]` (both in the DragLayer), the chip `.aw-drag-target` ("Insert · …",
  "Group with …", "Reorder in group"), the zone wash `.aw-widget-zone.drop-target`, an empty
  zone's lit "+ Widget" `.aw-zone-empty.ins` (an empty zone gets no line); the widget / group menu's "Group with" submenu
  row (`menuitem` named /Group with/).
- `.aw-viewport.aw-preview` (pinned-profile preview), `.aw-preview-label`
- `.axis-gridbar .pill-chip` (Full/Map/Auto), `.axis-gridbar .block-size .step`
- `.axis-preset-tab` (Default/Stage/Studio/Compact — radio rows in the edit bar's LAYOUT menu)
- `.aw-zone-empty` (empty-zone placeholder; with the Add palette it is the "+ Widget" button `.aw-zone-add-empty`)
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
9. **09-custom-panel** — the "New custom panel" card inserts a custom panel whose
   empty body is a "+ Widget" button (with the drop hint) targeting it; a widget dragged
   over it lights that button up, and a release inserts it there.

Later specs (10–21) cover bottom-nav mode, pages, widget menus, the Customize
drawers (opened from the edit bar's PAGE / LAYOUT menus and the Add palette's footer), the profile
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
panels, and the nav context menu's edit-mode-only Delete, and **22-add-and-group** —
the Add palette (Add + / context "+"): real widget previews, panel schematics, page
mini-maps, chips and search, unsupported widgets greyed last with the reason, template
⋯ menus, Escape consumed (never reaching the app's Escape chain), ↑↓ across the
section rows, touch (a vertical swipe on a card scrolls, a sideways pull drags it out);
click-to-place (a click marks every spot, a click places on release, a swipe or the second
press of a double-click places nothing, Escape cancels, keyboard, the status line names the
active spot, focus returns to the opener, the Customize toggle still works), drag from the
palette, the context "+" entries inserting directly (a template at the zone's end), the
panel menu's Split right, and (slice 4b) widget drags: the insert line instead of a slot box,
a short release on a widget inserts beside it, resting 350 ms on a foreign widget / group
shows the Group frame and a release groups (one undo step), a member reorders directly inside
its own group, the widget menu's "Group with ▸", and the edit-mode top bar at 834 px staying
one row (zones collapse: units step down, nothing spills). Every spec runs offline: `bootCleanWorkbench` aborts `/api/**` at the
browser-context level (page-level mocks still win), so a reachable ForgeFX can
neither drive a device nor pop device prompts over the chrome.

Block Editor rework specs are numbered from 40 (no clash with the specs above): **40-block-editor-board** —
the v2 board against a mocked multi-page amp layout (`support/blockEditorMock.ts`): always fit at
1366×768, several pages visible at 2560×720 with their tabs highlighted, tab click scrolls to the page,
knob drag / click-to-type / arrow keys write the parameter (a click on a value and away writes nothing),
select popover and switch, side navigation persisted across a reload, an arrange drag persisted across a
reload (the moved tile selected), a later page kept active through Top/Side and S/M/L (control size persisted), boards of the
previous editor (seeded `axs.surface3.*` keys) surviving the first change, the empty page's Arrange
button, the phone width without Top/Side and Arrange, and the Setup screen on the same board (since slice 3
these steps go through the header's ⋯ menu).
**41-block-editor-header** — the header and its ⋯ menu: the channel letter of the type chip unfolds A–D and a
pick writes the channel (mocked `POST …/channel`), the Engaged segment writes bypass / engage while Mute and
Scene Ignore stay "coming soon" toasts, Top / Side via ⋯ kept after a reload (the side list has no heading and
no counts), reset this page / new copy / profile switch / delete copy, the amber "custom" dot appearing after a
change and leaving after "Reset all pages", save as default for the type, the type chip and "Change type…"
opening the model palette, the search popover jumping to a control with "Show all" / Enter opening the flat
results (and ending Arrange), one header row at the default 1440 px panel and two at 1100 px, the grid map
shown / hidden via ⋯, "Remove block from grid" with its inline confirm, and the Setup screen's compact row
with the same ⋯ menu; review round: Escape inside the popover / channel letters stays there (a maximized
panel stays maximized), Tab passes through the header without opening the popover or ending Arrange (one-row
and two-row Tab order), page tab and Arrange while the flat results show, ⚡ pin from the popover, Unused
carried into "Show all", a cab chip opening the cab picker, no-pack / read-error states with a usable header,
and "Clear this page" on a page outside the default layout (mock option `extraBlocks`).
**42-block-editor-pin** — everything done to one control outside Arrange, with real pointer input: a held knob
dragged onto a custom panel is collected there; ⚡ appears on hover (invisible = no press) and a click pins to the
default target (a new custom panel); one-row tiles have no hover actions (a 2×1 button toggles where ⚡ would
sit; the 6×1 slider); a ⚡ press-drag onto a custom panel collects the control with no hold; the control menu's
"Pin to ▸" tells same-named panels apart by where they are, lists "New tab beside the editor" and "New custom
panel" (a panel pick pins into that panel, "New tab" adds a Controls tab right after the Block Editor); the
long-press with synthetic touch / pen pointers (a still touch hold opens the menu; the pen's hold-drag reaches
a panel without the menu interrupting it; in Arrange on the tablet profile a touch hold opens no menu and a
slow drag still moves the tile); ∿ opens the modifier flyout (Escape closes it and a maximized panel stays
maximized; an overlay on top — the Ctrl+K palette — gets the first Escape; the control menu takes over from
the flyout) and, with the modifier panel docked (seeded into the stored workbench document at the next load),
targets the panel instead; View ▸ knob → fader, Size ▸ Large without overlaps, Move to page ▸ (a page already
holding the control is disabled) and Remove from page — each saved once (board writes counted in the stored
surface document) and kept after a reload; Move to page ▸ onto an earlier page keeps a later active page at
the start of the board; Grid swipe control on / off; Shift+F10 and the ContextMenu key on a focused tile
(Escape returns focus); a right-click in an open value field opens no menu; the phone menu without layout rows
(touch rows); and the control menu in Arrange (the tile's pin / swipe badges are gone).
**43-block-editor-arrange** — Arrange with real pointer input: a drag to a free spot (teal preview) kept after a
reload; a collision refused (red preview, nothing moves, nothing to undo); the corner handle resizing the
selection (w×h follows, one undo step for the gesture); a drag onto another page of the strip (2560 px, the
active page stays) and a page that already holds the control showing red; arrows / Shift+arrows / Delete on the
selection and Ctrl+Z walking back each step; a click on empty grid clearing the selection; the selection bar's
View / Size / ⚡ Pin / ⇆ swipe control / ✕ Remove; a divider added at the first free spot, labelled inline, rotated
and kept after a reload (drawn as a labelled line outside Arrange); Close gaps and Tidy up; Undo by button and
Ctrl+Z with one board save each, cleared when Arrange ends, and Ctrl+Z outside Arrange leaving the board alone;
Page ▾ rename (and a double-click on the tab), duplicate (fresh ids), move, delete with its inline confirm (undo
brings it back), the last page not deletable, "Pin page as panel" into a new custom panel; the Add library (a
click = first free spot, a drag = exact spot with the teal preview and the library faded, red onto another
control, a control already on the page pointed at instead of added twice); Escape closing the library and the
page menu before ending Arrange (a maximized panel stays maximized); the one-row bar at the default panel
height with a usable board; the tablet profile (40 px targets, the ⋯ overflow, the empty page's Arrange opening
the library); no Arrange on the phone; a layout profile switch while arranging (fresh undo, each profile keeps
its board); and the Setup screen's compact row arranging the same way; review round: Escape with the library
open and the board focused (library first, then Arrange, the panel stays maximized), Escape during a library
drag (drag cancelled, nothing added), a divider label kept on its own divider when the focus moves to another
divider / empty grid / a control, a control menu opened over the library stacking above it, undoing Duplicate /
Add page bringing the page back into view, Ctrl+Z during a drag or resize doing nothing, a held arrow key
(synthetic auto-repeats) being one step and one save, Ctrl+Z in Arrange never reaching the preset history
while outside Arrange it does (a recorded switch write is undone), and Delete / Backspace in the text fields
keeping the selected tile. Helpers `selectTile` / `openLibrary` /
`arrangeAdd` / `countBoardSaves` / `boardSaves` live in `support/blockEditorMock.ts`. Arrange selectors:
`[data-be-arrange-bar]` (`touch` class on the tablet), its parts `[data-be-ab="<part>"]` (`remove`, `pin`,
`swipe`, `label`, `rotate`, `undo`, `add`, `hdiv`, `vdiv`, `close-gaps`, `tidy`, `autopack`, `page`, `more`),
`[data-be-ab-view="<view>"]`, `[data-be-ab-size="S|M|L"]`, `[data-be-arrange-done]`; on a tile the `sel` class,
`[data-be-dims]` and `[data-be-resize]`; the drop preview `.be-ghost` (`.bad` when refused); the library
`[data-be-library]` with `[data-be-lib-row="<key>"]` (`data-on-page`), `[data-be-lib-input]`,
`[data-be-lib-close]`; the Page ▾ menu (`role="menu"` named "Page options") with `be-pm-<id>` rows (`rename`,
`duplicate`, `pin`, `earlier`, `later`, `delete`, `add`) and the bar's ⋯ ("More arrange tools") with `be-ab-<id>`
rows.
Board selectors: `[data-be-board]` (`data-nav`), `section[data-be-page]`, `[data-be-grid]`, `[data-be-item]` /
`[data-be-key]` / `[data-be-view]` / `data-be-x|y|w|h`, `[data-be-pin]` / `[data-be-mod]` (hover actions),
`[data-be-tab]` (`data-visible`, `data-active`; header tabs
and side list alike, `[data-be-pagenav="tabs|list"]`), `[data-be-select-menu]`, `[data-be-empty]`,
`[data-be-arrange-done]`. Header selectors: `[data-be-head]` (`data-be-head-rows`), `[data-be-chip]`,
`[data-be-type]`, `[data-be-channel-toggle]` / `[data-be-channel]`, `[data-be-engaged]`, `[data-be-mute]`,
`[data-be-scene]`, `[data-be-more]` (`data-custom`) / `[data-be-more-dot]`, `[data-be-find-input]`,
`[data-be-find]` / `[data-be-find-row]` / `[data-be-find-all]`, `[data-be-results]` / `[data-be-results-close]`.
⋯ rows carry `be-mi-<id>` classes (`arrange`, `nav-top|side`, `size-s|m|l`, `profile`, `reset-page`,
`reset-all`, `new-copy`, `delete-copy`, `save-default`, `change-type`, `grid-map`, `remove`, …); helpers
`openMore` / `pickMore` / `pickProfile` / `checkedProfile` live in `support/blockEditorMock.ts`. The control
menu (`role="menu"` named "Control options") has `be-ci-<id>` rows (`head`, `pin` → `pin-panel` / `pin-tab` /
`pin-new`, `modifier`, `view` → `view-opt`, `size` → `size-opt`, `move` → `move-opt`, `swipe` (`on`), `remove`).

## Ignore these generated artifacts

Playwright writes `test-results/` and `playwright-report/` at the repo root.
Add them to `.gitignore` (this suite does not own `.gitignore`):

```gitignore
/test-results
/playwright-report
```
