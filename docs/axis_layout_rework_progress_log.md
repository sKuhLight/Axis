# Axis layout rework — running progress log

> Purpose: session-survivable state. Updated and committed **after every step** so any
> session (or a fresh one after a token cutoff) knows exactly where to resume.
> Canonical plan + task definitions: `docs/axis_layout_rework_review_and_remaining_plan.md`.
> Design source of truth: `docs/workbench-dc-parity/01…06-*.md` (extracted specs) and the
> `design/*.dc.html` live set.

## How to resume

1. `git log --oneline` on branch `layout-rework` — every landed step is one commit below.
2. Read **Next queue** for the next task to start; read the task's section in the plan doc
   and the matching `docs/workbench-dc-parity/` spec before implementing.
3. Verify green before starting: `npm run check` (0 errors) and `npx vitest run` must pass.
4. Update this log (Landed + Next queue) after every landed step.

## Current state — 2026-07-06 ~14:00

- **ALL P0 + P1 IMPLEMENTATION TASKS COMPLETE** (T11/T14/T15 closed the audit gaps).
  Tree clean, `npm run check` 0 errors, vitest **354/354** across 52 files.
- Open: **T31** = the operator's batched visual pass (checklist below) + its fix
  round; P2 backlog (T16 rest/T17–T23, T24 polish, T26 E2E), P3 (T27–T30), and the
  recorded deferrals (PROFILE switcher UI, toast surface, pages contentMode
  rendering, T12 row anatomy/context menus).

## Landed (chronological, this branch)

| Commit | Task | What |
|---|---|---|
| `3841470`…`240f6e8` | T01 | Dockable workbench foundation batches |
| `b6b1500` | T04–T06 | Panel singletons, rename validation, reducer command tests |
| `aa3b69d` | T16 (part 1) | Edit ribbon + library drawer tokenization |
| `d28562b` | T03 | Functional gridbar toolbar (grid mode + block size widgets) |
| `4572610` | — | Singleton keys on default Axis panels |
| `11eed7f` | extraction | Six DC parity spec docs (`docs/workbench-dc-parity/01–06`) |
| `eb711c3` | **T02** | Phone blank render root fix: persisted dock node ids collide with fresh-session id counters → duplicate keyed-each ids crash the dock render. Fix: `reserveWorkbenchIds` + duplicate-node-id validate/repair (`workbench/core/ids.ts`, `invariants.ts`), Axis store adopts the repaired doc. 6 regression tests. |
| `636e0ea` | grid map | `'map'` grid mode + pane-relative auto stepping per `04-fc-and-grid.md` §2 (`resolveAxisGridMetrics`: min-cols 56/72/96, map ≤42px, full ≤140px, 4-row height cap); SignalGrid map strip-down; mobile paging path untouched. |
| `a51e07a` | **T07/T08** | Five design widgets (logo, gridMap dots, fcDevice/fcLayouts/fcSwitchView bound to live FC controller) + `axis.meterToggle` (→ `editor.meteringOn`/`canMeterBlocks`); mini tap-to-cycle + 380/100ms hold-to-repeat (`widgets/widgetControls.ts`). |
| `e86661a` | **T12** | Preset-browser split-pane parity: 14-row soft cap + expander, list-part query bar (advanced↔simple conversion, sort, filter chips), quick tags, owner rank rule `list<detail<sources<full` (typed replacement for `__PBBus.owner()`), verbatim query-grammar port (`presetBrowser/presetBrowserWorkbenchQuery.ts`). |
| T34 | landed earlier inside T01/T03 series | Geometry-transition guard |
| `9a6617c` | **T15** | Touch parameter pinning: ~500ms long-press (8px move cancel, touch/pen only) or right-click opens a ContextMenu pin sheet (existing custom panels + New); routes through the same pin action as drag, extended with optional panelId append. ⌖ button/drag/modifier logic unchanged. |
| `2280082` | **T14** | Viewport profile resolver: pure `resolveProfileForViewport` (override > exact breakpoint > hold current), phone <760 / tablet <1366, persisted `profileOverrideId`, ResizeObserver in WorkbenchHost, `setAxisProfileOverride` API for the future PROFILE switcher. |
| `e9dc38b` | **T11** | paramControl binding states (pure `paramWidgetState.ts` resolver): live / readonly (dimmed + lock badge + click-opens-block via `editor.openCell`) / missing (amber dashed no-op); never "missing" before the preset roster loads. |
| `c050ca5` | **T13** | Six layout presets as data (`axisWorkbenchLayoutPresets.ts`) + apply/seed/copy actions; LAYOUT tabs in the edit ribbon (`AxisLayoutPresetPicker` via a new type-agnostic ribbon-extras snippet); tablet/mobile profiles seeded at boot; shared panel roster extracted from defaults. Deferred: PROFILE switcher UI, toasts, pages contentMode rendering. |
| `f2ce99f` | **FC parity** | FC part panels at 04-fc-and-grid.md §1/§3 parity: renderVals part gating + grid render part, board hero/switch-tile anatomy, layouts strip, typed per-slot card editors; fcDevice widget mirrors connected switch count. Deferred: hardware device switching + layout rename (no decoded addresses), AUTO LED chip, mobile sheet animations (full-shell concern). |
| `c3609df` | auto-fit | Generic estW auto-fit (`workbench/core/widgetFit.ts`): joint fit ×0.62, keep-set shedding in document order, 44px chip reserve; Axis estW table + keep-set (preset/save) via registry sizing provider (`widgets/widgetEstWidths.ts`); top zones fit jointly (fitGroup), gaps 12/10/8; manual density = ceiling; edit mode never sheds. |
| `8310758` | T33 (2/2) | Registered `axis.blockEditor.modifier` → `AxisBlockEditorModifierPanel` (manifest + registry). |
| `b031b68` | **T33** | Docked `be-part="modifier"` part: shared `ModifierEditorCore` (flyout/dock variants, overlay unchanged), typed `blockEditorModifierController`, ControlSurface ∿-badge ownership rule. Registration followed in `8310758`. |
| `6b224d4` | **T09/T10** | Live nav targets (Setup/Controllers → docked VirtualScreen; Scenes/Live → placeholder panels; add-or-focus semantics in `axisWorkbenchNavigationActions.ts`), Theme nav entry, bottom-zone hint ticker + legal widgets. Nav-id reconciliation deferred to T31. |

## Verification debt (needs hardware / a device or browser session)

> Operator decision 2026-07-06: visual checks happen **once, in one batch, after all
> implementation tasks are finished** — keep appending items here, don't block on them.

- **T02 phone fix**: reproduce only with a *stale persisted layout* + fresh session — a clean
  profile won't show it. Verify on the actual phone before closing T02 in the plan.
- Grid map/auto stepping, meter toggle, FC widgets, PB split panes: visually verified only
  via tests; browser smoke (Claude-in-Chrome on :5173) still pending.
- T09/T10: nav entries dock/focus the right panels, placeholder styling, hint ticker,
  legal links (Ko-fi/imprint open externally), theme entry opens the theme dialog.
- T33: flyout still behaves identically in the old shell; docked modifier part
  targets from the ∿ badge; Clear chip; knob formats (ms=v*5, slope, signed offset).
- auto-fit: top bar steps default→compact→mini as the window narrows; shed widgets
  land in the ⋯ chip (preset+save never shed); edit mode shows everything; bottom
  hint still flexes; gridbar widgets fit at 8px gaps.
- FC parity: board tiles (LED bar/badges/T-H rows/selection ring), layouts strip,
  part gating per part type, per-slot editors write correctly, grid part mounts
  SignalGrid, fcDevice chip matches the connected unit.
- T15: long-press a knob on a touch device opens the pin menu (verify it does NOT
  fire during value drags — flagged by the implementing agent), right-click works
  with a mouse, pinning into an existing panel lands in the right zone.
- T14: resizing across 760/1366 switches profile (and back), manual override wins
  and survives reload, layouts never change from a resize alone.
- T11: read-only param widget dims + shows lock, click opens the bound block,
  missing state appears when the block is deleted from the preset.
- T18: keyboard-only session — Customize → Tab ribbon → open menu/drawer →
  arrows/Tab inside → Escape restores focus to opener; mobile drawers Escape-close.
- T19: floater grip drag + arrow nudge, raise on click, drag offscreen then shrink
  window → self-heals into view; persists across reload.
- T13: LAYOUT tabs apply each preset correctly (dock arrangement + widgets + nav),
  rightW survives preset switches, tablet/mobile profiles activate at their
  breakpoints, applying presets repeatedly doesn't corrupt the document.
- T24 FC polish (R7c): hover states + `:focus-visible` rings render on FC tiles/
  layout+view chips/category+function chips/scene+channel minis/steppers/swatches/
  side-toggle; card steppers dim + disable at range bounds; every FC control shows
  a tooltip; board header shows `reading…` during live read; inspector-part with no
  selection shows the "No switch selected" hint; flat-config strip shows the "+N more"
  overflow badge past 64. Verify visually + a keyboard-only tab through the inspector.
- **T21+T23 mobile chrome (R8a)**: iOS safe-area — on a notched device (iPhone
  simulator, portrait + landscape) verify the rail/topbar/bottombar/Customize FAB
  clear the notch, home-indicator, and landscape edge insets; nothing clips under
  the status bar. **T23 swipe feel** — on a real touch device below 760px: nav
  drawer + each dock drawer + library present as bottom sheets (rounded top, grab
  bar, slide up from bottom); dragging the sheet down past ~96px OR a fast flick
  closes it; a slow short drag snaps back; dragging while the sheet's list is
  scrolled (not at top) scrolls the list instead of closing; scrim tap + Escape
  still close; reopening after a swipe-close animates cleanly (no stuck offscreen
  sheet). Desktop (>760px) presentation must be unchanged (rail docked left, library
  drawer from the right edge).
- **R9d mobile block flow (phone profile only)**: on a phone (<760, mobile profile
  active) tap a grid block → the block editor (bottom region) expands to ~75% of the
  window height and the grid above flips to MAP mode (map chip appears in the gridbar,
  glyph minimap renders under the top bar). Tap the **Minimize** chip at the top of the
  block editor → it collapses back to the mobile column layout (bottom returns to its
  prior size, grid returns to auto, gridMode chip hides again), block stays selected so
  quick actions remain reachable; re-tapping the block re-expands. Verify: (a) manually
  drag the bottom divider while expanded — the flow must NOT snap it back on the next
  tick, and minimizing keeps the user's size; (b) desktop/tablet profiles show ZERO
  change (no expand, no minimize chip, grid mode untouched); (c) switching profile away
  from phone while expanded restores the layout once. Command-wise: enter =
  region.resize(bottom,~75%) + widget.move(gridMode hidden→gridbar) + widget.state(map);
  leave = region.resize(prev) + widget.state(prevMode) + widget.hide(gridMode). All go
  through the controller so persistence/undo stay coherent.

## Deliberately deferred (documented in commits / agent reports)

- T12 P1/P2 (partial — DONE this pass, uncommitted, main-session review pending):
  §4.3 full row anatomy (per-block family chips "Cat · TYPE", ~CPU meter+colour,
  cloud/device presence chip, up to 3 tag pills, scenes) + inline rename (dbl-click
  device-slot name → editor.renameStoredPreset, same path as the monolith) + §4.4
  row context menu via the generic workbench ContextMenu (owner-gated by isOwner):
  Load / Audition / Favorite-Unfavorite / Rename / cloud Upload+Download by sync
  state — only backed actions (no Duplicate/Convert/Export/Delete — no workbench
  backing). Long-press (touch/pen, longPress.ts) opens the same menu; mouse uses
  right-click. New pure modules presetBrowserWorkbenchRowChips.ts +
  presetBrowserWorkbenchMenu.ts (+ 17 tests). check 0 err, workbench vitest 335/335.
  STILL DEFERRED: swipe-to-action rows (222px 3-col — long-press covers touch menu),
  detail cloud card/version restore, generic picker, builder-chip param editing.
  Deep param matching stays in the monolith (needs hydrated/decoded blocks).
- Widget library curation: meterToggle et al. not in `doc.widgetLibrary` groups —
  consistent with existing curated subset, revisit with T13.

## Next queue (in order; sequential where files conflict)

1. **Operator's batched visual check** — the full checklist is the Verification debt
   section above. Suggested order: desktop browser smoke on :5173 first (needs ForgeFX
   on :5056), then narrow-window auto-fit stepping, then the phone T02 check (stale
   persisted layout!), then FC panels against the connected device.
2. Fix round for whatever the visual check surfaces.
3. Later/parity backlog (from agent reports): T31 file-by-file DC visual pass incl.
   nav-id reconciliation, PROFILE switcher UI, workbench toast surface, pages
   contentMode rendering, T12 P1/P2 row anatomy + context menus, T16 remaining
   tokenization.

## Operator feedback 2026-07-06 (screenshot round 1)

Reference screenshots: `~/Bilder/Bildschirmfotos/DesignLook.png` (target) vs
`Current.png` (implemented). The panel ARRANGEMENT in Current.png was hand-made by
the operator as a showcase — do NOT "fix" the default layout from it. **"Layout
Profiles" will be built later, together with the operator.**

Standing rule (also plan T35): **keep every production feature** — the design
missing something (preset/block search recents/favorites/all, …) never justifies
removing it. After full implementation, audit what is app-generic (search/filter/
favorites, pickers, toasts, menus…) and migrate it into the standalone workbench
framework via data/adapter seams (plan task T35).

**Start layout (operator decision 2026-07-06):** boot default = Signal Grid main +
Block Editor bottom ONLY (landed as the commit after `c021cd6`). "Layout Profiles"
get built later, together with the operator — do not pre-build them.

**Screenshot round 2 (operator, 2026-07-06 ~14:45): "looks much better overall — keep
going."** One bug found and FIXED (`f8e2f7a`): grid cables kept pre-resize
coordinates on pane drags — the measurement pass was never re-triggered (mount-time
observer attached before the grid element existed; re-measure effect only tracked
old-shell window signals). Inner element now observed reactively + effect tracks
colW/cellH/gap/mapMode.

**Round 7 (new session, fresh budget) — IN FLIGHT (3 opus):**
- R7a T18 focus management: LANDED (`6e05671`) — focusTrap action (capture/trap/
  Escape/restore, 19 tests), ContextMenu roving arrows, drawers trapped,
  :focus-visible rings across chrome. Keyboard-only edit-mode pass → verification
  debt (no jsdom; live focus movement is manual).
- R7b T19 floating widgets: LANDED (`ae9bb33`) — grip strip drag + arrow nudge,
  raise-on-pointer-down (order-derived z), clamp/self-heal (core/floating.ts,
  16 tests), positions persist via widget.move floatingRect.
- R7c T24 FC polish: LANDED (`20b50e4`) — 14-item checklist: 7 closed (hover/
  focus/stepper bounds via axisFcSlotBounds/tooltips/board reading chip/no-switch
  state/+N flat badge), 4 already present, 3 honest deferrals (rename, AUTO LED,
  mobile sheets → T21/T23).
**Round 10 (deferral cleanup) — ALL FOUR LANDED.** Unit 610/610, check 0 errors.
- `8257832` R10a PROFILE switcher (pinned vs Auto w/ resolved hint).
- `57df36f` R10b generic toast surface (queue w/ injectable clock; layout-apply/
  copy/save-to-library wired from action layers). NOTE: commit 8257832 briefly
  referenced toasts before 57df36f added them (parallel-edit wart, one commit).
- `7c728a4` R10c T29 import/export (deep id re-mint; legacy packages.ts shallow
  re-key flagged as follow-up).
- `0eb1c2b` R10d PB row anatomy + owner-gated context menus (real actions only;
  222px swipe stack deferred, long-press covers touch).
**E2E realignment LANDED (`26cd377`)** — 34/34 both browsers; NO product
regressions (the suspected region-collapse was the live ForgeFX backend restoring
the operator's own synced layout over test boots; specs now intercept the backend
doc for determinism).
**HOTFIX (landed + pushed): drag-and-drop offset** — the Axis UI-scale CSS zoom
double-applied inside the fixed drag layer (preview/ghost drift ∝ zoom × distance).
DragLayer now self-calibrates via its visual/layout width ratio; probe-verified
exact at zoom 0.9 and identity at 100%. NOTE for V13 chrome work: any OTHER
fixed/overlay surface that renders getBoundingClientRect values (edit buttons?
context menu positioning?) may have the same bug when UI scale ≠ 100% — check
menuPositionFromPointer + edit chrome during V13b.

**ROUND 13 — IN FLIGHT (session 2026-07-06 evening). Baseline was green
(check 0, vitest 662/662). Landed so far:**
- V13a LANDED (`f8f942e`): drawer split into Panels/Widgets/Layouts views —
  LibraryDrawer takes `view` prop (panels|widgets), LayoutDrawer absorbed
  backups seam (registerWorkbenchBackupProvider moved there) + import/export
  + bottom-sheet; TARGET dropdowns gone (contextual placement: panels→main,
  widgets→top.right, drag places precisely); feature-keep verified per view.
- V13c+d LANDED (`3840fd1`): rail hover controls removed (reorder/hide stay on
  the entry context menu; drag-handle keyboard arrow-reorder was lost — menu
  covers it), rest-state entries square (WorkbenchHost CSS), History clock +
  AX avatar rail WIDGETS retired (nav-entry set unchanged; Axis Cloud ◈ = the
  account entry; History still library-re-addable) + pruneAxisRetiredRailWidgets
  on every normalize path; PB nav entry now add-or-focuses axis.presetBrowser
  (region left), overlay stays for legacy shell, active tint = docked OR overlay.
- V13g+h LANDED (`db29c83`): group drag-out was broken SINCE THE PORT (grab
  surface suppressed for grouped members + widget.move never cleared groupId) —
  members grab again, widget.move detaches partial moves (detachPartialGroupMembers,
  whole-group grip moves stay intact, <2-member groups dissolve); bottom-bar
  drops missed because the centered footer flex shrank the zone to content
  height (elementFromPoint fell through to the dock path) — bar zones stretch.
  NOTE for visual pass: in-place reorder WITHIN a group resolves as detach+
  regroup (design reference has no distinct gesture); zoom hotfix uninvolved.
- V13e+f LANDED (`f227f65`): docked PB search parity (caret-aware autocomplete:
  block/param/value/tag contexts + accept-splice/tidy; FILTERS builder chips w/
  addfilter→param→value picker chain) + detail parity (per-block param cards,
  ≤12 non-default, matched-cell highlight, Load-params hydration, drag/dblclick
  block-or-param → filters over application/x-axis-query payload). Pure modules:
  presetBrowserWorkbenchSpecs/Autocomplete/Filters/Params + 34 tests (+2
  controller editConds). **Stale-blocker note:** "deep param matching needs
  hydrated blocks / stays monolith" was WRONG — the docked host already wires
  library.paramsOf/hydrateParams; nothing data-blocked. Still monolith-only by
  scope: Orama ranking, MiniGrid preview, version history, folders, mobile
  slide-in sidebar.
- V13b LANDED (`b0824c6`): the misplaced ⋯/×/grip clusters were negative
  absolute offsets (top:-13/right:-12) escaping the widget/group box — in
  28-38px bar chips the cluster cleared the chip and sat on neighbours. Now
  inset top-right inside the widget's own box (token backdrop, collapses to a
  single ⋯ at compact/mini, 18→16px), groups follow the same model (grip stays
  in-flow per AxisGroup.dc.html); panel-header + floating chrome were already
  in-flow. UI-scale audit: ContextMenu had the SAME zoom double-application as
  the drag layer (fixed overlay at raw visual coords) — self-calibrates via the
  scrim probe now, identity at 100%; 7 tests for the placement math. DragLayer
  clean; no other offenders in the workbench overlay set.
- E2E-CAUGHT HOTFIX (`e91396f`): V13c's square rest-state entries (42px) in a
  rail whose hover/focus expansion kept 50px rows → pressing an entry expanded
  the rail on focus and shifted entries down mid-click → mouseup landed off the
  button, click never fired, nav docking silently dead (7 specs × 2 browsers
  red: 03-dock/04-nav/06-persistence all funnel through clickNav). Expanded
  rows now share the rest-state height. Bisect: 813da8d green → 3840fd1 red.

**ROUND 13 COMPLETE — suite after: check 0 errors, unit 717/717 (was 662),
e2e 34/34 chromium+firefox.** Round-13 verification debt for the next visual
pass: drawer three-view UX vs operator expectation (V13a), square rail at all
themes/scales, edit-chrome anchoring at UI scale ≠ 100% (context-menu de-zoom
is probe-verified in tests only), group member drag-out feel + the in-group
reorder note above, bottom-bar drops, docked-PB autocomplete/filters/param-
listing against the monolith side-by-side, PB reopen from the rail.

**ROUND 14 — operator visual pass 3 (2026-07-06 ~23:30), IN FLIGHT.
Screenshots: ~/Bilder/Bildschirmfotos/Bildschirmfoto_20260706_232516.png (design:
group w/ dashed border around the WHOLE group), _232649.png (design: drag-into-
group shows a dashed placeholder where the widget will land), _232736.png (ours:
group not visually distinct), _232825.png (ours: drag-into-group only outlines
the group, no insertion indicator).**
- V14a **group visual parity**: the dashed/dotted border must wrap the WHOLE
  group (grip left, group buttons top-right) like the design; our groups are
  indistinguishable from loose widgets in edit mode.
- V14b **group drop/reorder insertion indicator**: dragging INTO a group must
  show where the widget will land (design shows a dashed placeholder at the
  insertion point); rearranging WITHIN a group needs the same position feedback.
  (Round-13 note said in-group reorder = detach+regroup with no distinct
  gesture — operator expects visible in-group placement, so build it.)
- V14a+b LANDED (`8ac45d7`): members = bare transparent grab layers, group
  module carries THE dashed accent border (edit mode; full accent on hover-
  drag); drag-over-group previews a widget-sized dashed placeholder at the
  midpoint-computed insertion index (pure groupInsertion.ts, ±8/4px hit area);
  in-group insert + same-group reorder go through widget.group w/ memberOrder
  (NEVER widget.move → no detach), pull-out stays detachPartialGroupMembers,
  cross-group = detachFromOtherGroups; group-create = design center-28% band
  (was any-proximity). 17 new tests. Deferred cosmetic: grip stays V13's
  in-flow left column (design floats a ⠿ chip top-left).
- V14a+b FOLLOW-UP LANDED (`ea6cae4`, operator finding _234944.png): the real
  drag model lives in design/'Axis Layout System.dc.html' (NOT support.js —
  that's just the dc-runtime). Zones AND groups now splice a real dashed slot
  child into the flex flow at the live index (neighbours physically reflow,
  divider suppressed at the slot, rail slot 88% width, zone gap yields while a
  group is hovered); dragged widget/whole group lifts (display:none, zone
  closes the space) and DragLayer renders the REAL widget component as a
  half-opaque scale-1.03 ghost at the grab offset (zoom-calibrated: visual
  coords for position, layout px for sizes). Bonus real bugs fixed: zone
  hit-testing counted nested group members (skewed indices → top-level units
  only + pure unit→widget-order mapping) and in-group insert dispatched
  widget.group index:undefined which APPENDED THE WHOLE GROUP to the zone end
  (anchoredWidgetIndex keeps it in place). Tests -6 obsolete/+10. Deferred:
  grid-variant zones show a plain grid-cell slot (no design reference); drag
  feel = operator/hardware pass.

**ROUND 14 COMPLETE — suite: check 0 errors, unit 746/746, e2e 38/38
chromium+firefox.** Verification debt added for the next visual pass: group
border/gap/ghost feel vs design side-by-side, in-group reorder without detach,
cross-group moves, group-create center-band, bottom-nav on the real phone
(persistent bar, safe-areas, icon-only), widgets-only rail strip in bottom
mode, mobile side↔bottom switching via entry context menu.
- V14c+d LANDED (`826c818` + `8525fcb`): rail renders nav ONLY in side mode
  (pure shouldRenderRail/shouldRenderRailNav; bottom mode keeps a slim 64px
  widgets-only strip when rail widgets exist or while editing — design §9 rule);
  bottom mode suppresses the phone hamburger/drawer entirely (persistent bar);
  bottom entries icon-only everywhere (phone media rule scoped away from bottom
  mode; labels → aria-label). PLUS operator-intent override of the design spec:
  the mobile PROFILE now SEEDS navMode 'bottom' (spec seeds 'side'/hamburger —
  operator: "completely against any use of a bottom based nav... if its not
  there all the time") + one-shot ensureAxisMobileBottomNav migration for
  persisted docs (doc-metadata marker 'axisMobileBottomNav', deliberate
  switches back to side are never overridden). New e2e 10-nav-bottom-mode
  (desktop bottom mode + phone boot default + way back to side); 07 preset
  spec updated (Stage bottom mode ⇒ no rail nav). +4 unit / 2 e2e.
- V14c **bottom-nav mode leaves the rail visible** (original finding): with "Use Bottom Navigation"
  on, the full sidebar rail still renders — the rail must hide when bottom nav
  is active.
- V14d **mobile bottom-nav UX broken**: on mobile the bottom nav hides behind a
  hamburger + bottom flyout — "completely against any use of a bottom based
  nav"; the bar must be persistently visible on mobile. Bottom-nav entries must
  be icon-only (currently truncated label fragments show).

**Original round-13 worklist — operator visual pass round 2 (2026-07-06 ~20:35).
Screenshots:
~/Bilder/Bildschirmfotos/Bildschirmfoto_20260706_203127.png (light-theme library
drawer), _202758.png (edit mode, red circles = misplaced edit buttons), _203359.png
(nav rail).**
- V13a **Library drawer UX redesign**: Panels AND Widgets ribbon buttons open the
  SAME cluttered drawer (backups + saved layouts + target selects + saved panels
  all stacked) — "a UX nightmare". Split into purpose-built views: Panels button →
  panel browser only; Widgets → widget browser only; Layouts → layouts/backups/
  import-export. Clean list design, no target dropdowns exposed at top level.
- V13b **edit-mode buttons misplaced (every theme)**: the floating ⋯/×/grip
  clusters sit wrongly (overlap top-bar widgets, gridbar chips, rail entries —
  see red circles). Rework edit-chrome placement so buttons anchor cleanly to
  their widget/unit at all sizes.
- V13c **rail hover controls**: remove the per-entry hover buttons (drag/hide/menu)
  from the nav rail entirely — ugly there; rail entries must also be QUADRATIC
  (first entry renders non-square). Also REMOVE from the rail: the History entry
  (not needed) and the AX avatar below — "Axis Cloud" is the single account entry.
- V13d **Preset Browser reopen**: once the docked PB panel is closed there is NO
  way to reopen it (nav 'Preset Browser' opens the old overlay; only a layout
  reload restores it). Nav entry must dock/focus the panel (add-or-focus like
  Setup/Scenes do).
- V13e **PB search parity (feature-keep violation)**: the docked PB is missing the
  production search's AUTOCOMPLETE + the "Filters" block under the query bar
  (add filters via UI w/ autocomplete instead of advanced typing). Port from the
  monolith (PresetBrowser.svelte).
- V13f **PB detail/preview parity**: the right detail pane lost production
  features — per-block parameter listing (shows exactly what every param is set
  to) and drag-a-block-parameter-into-filters. Port from the monolith.
- V13g **widget group regression**: grabbing any widget inside a group to pull it
  out / reorder no longer works (worked before — likely broken by an edit-chrome
  or WidgetZone/Host rework round).
- V13h **bottom BAR drop regression**: widgets can no longer be dropped into the
  bottom widget BAR (only the bottom dock region accepts) — restore the bar as a
  drop target.

**ROUNDS 11+12 ALL LANDED — THE BUILDABLE PLAN IS EXHAUSTED.**
Suite: unit 662/662, e2e 17/17 chromium (+ firefox green per agent run), check 0.
- `c37240e` R11 storage: bak1..3 rotation + Restore UI (drawer provider seam),
  measured persist trim (repair off hot path, 150ms cache coalesce + pagehide
  flush, cloud 1500ms), rev/updatedAt + stale-write keep-newer-and-backup toast.
- `5c54c95` T30 layout undo/redo (in-memory ring, ribbon + edit-scoped keys).
- `f12b80e` pages contentMode (design flag near-vestigial in source; faithful
  narrow rendering: sides → openers/overlay, top/main/bottom inline, edit=fixed).
- `42ccd18` packages.ts deep interior re-mint (last T02-class hole) + regression.
- `26cd377`+`83142ec` e2e realigned to rounds 9-12 chrome; corrupt-doc spec drains
  the new write debounce; NO product regressions found.
REMAINING = operator-dependent only: visual pass/T31 (+nav-id reconciliation),
hardware batch (T27, phone T02, FC device, iOS, swipe feel), Layout Profiles
(BUILD TOGETHER), T35 audit (last).
Original round-12 worklist: T30 layout
undo/redo (in-memory ring in the controller, ribbon buttons + edit-mode
shortcuts, NEVER persisted), pages contentMode rendering (spec-verified from
01-shell.md; fixed default unchanged), packages.ts deep re-key (close the T02
collision class via layoutPackage machinery + regression test).
- **T30 DONE (uncommitted, main-session review pending). check 0 errors, vitest
  662/662 (+30 new: 16 layoutHistory + 14 controller).** New
  `workbench/svelte/layoutHistory.ts` = injectable-clock snapshot ring (depth 50,
  coalesce 450ms), Axis-neutral (frameworkBoundary guard passes). Controller owns
  one `LayoutHistory`: seeded in ctor, `record()` after each successful `dispatch`,
  `recordBatch()` after `dispatchMany` (one step per user action, never coalesces),
  `reset()` on external `setDocument`. Public API `undoLayout()/redoLayout()/
  canUndoLayout/canRedoLayout` — reactive through `#emit()`. Restore routes through
  `setDocument` under a `#restoringLayout` guard so repair runs but the ring is NOT
  re-baselined (redo future preserved). Undo state lives only on the controller
  instance — never on the document, never persisted/synced (proven by a test:
  a controller with history serialises byte-identical to one without).
  **Exclusion table:** EXCLUDE `panel.activate` + `profile.activate` (pure
  focus/viewport-driven). INCLUDE everything else structural. COALESCE per-target:
  `split.resize`/`region.resize` (drag streams), `widget.move` (order-independent
  set nudge/drag), `widget.resize`, `widget.state` (grid-mode/block-size hold
  repeat — meaningful, so kept but collapsed). `panel.add` etc. = null key (always
  standalone). UI: Undo/Redo buttons in the EXPANDED EditRibbon (tokens only,
  disabled bound to canUndo/canRedo) + capture-phase `Ctrl/Cmd+Z` /
  `Ctrl/Cmd+Shift+Z`/`Ctrl+Y` mounted via `$effect` ONLY while editMode is on,
  bailing when focus is in input/textarea/contentEditable, `preventDefault +
  stopPropagation` so the app device-history shortcut never double-fires.
- **pages contentMode rendering DONE (uncommitted, main-session review pending).
  check 0 errors, vitest 662/662 (+10 new contentMode), chromium e2e 17/17.**
  Spec finding: in `Axis Layout System.dc.html` the only live wiring of
  `contentMode` is `showStub = !presetPage && contentMode==="pages" && section!=="grid"`
  (line 1412) feeding `showGrid`/`showStub`/`presetPage` — but those are exported to
  renderVals and **NEVER consumed in the template** (the template always renders the
  full `computeDock` pane surface). So contentMode has NO region-hiding effect in the
  design itself; `onNav` docks sections into `main` identically in both modes.
  Faithful port (respecting §11 "left/right become overlay drawers … Bottom stays
  inline" + the §3/§11 "one full-page section" intent): pages mode drops the inline
  LEFT/RIGHT regions (they become edge openers + side overlay, now at ANY width since
  Stage is pages-mode on desktop), keeping TOP/MAIN/BOTTOM inline so the grid + the
  R9d phone block-editor (bottom) stay visible. New pure `workbench/svelte/
  contentMode.ts` (`resolveContentMode` repair-safe unknown→fixed,
  `effectiveContentMode`, `isPagesLayout`) + 10 tests. Edit mode forces
  effective=fixed (rearrange all regions). Zero change to fixed default; old shell
  untouched. DockWorkspace gated on `pagesMode`; `pages-opener`/`pages-active` CSS
  re-enable openers/scrim/side overlay outside the 760px query. NOTE for operator: I
  did NOT hide side/bottom regions wholesale — that would break the mobile profile
  (pages mode) which docks the block editor bottom; the spec's own mobile rule keeps
  bottom inline.
After round 11+12: ONLY operator-dependent work remains (visual pass/T31 incl.
nav-id reconciliation, hardware batch incl. T27, Layout Profiles TOGETHER, T35).
**Round 11 storage hardening — DONE (uncommitted, main-session review pending).
check 0 errors, vitest 662/662 (incl. round-12 T30 work in the same tree).**
- **(2) Measured first** (`test/axisWorkbenchPersistCost.test.ts`, numbers printed
  on every run): realistic doc (6 layouts × 30 widgets + 10+10 templates, ~101 KB)
  = repair 0.99ms + stringify 0.26ms + set 0.32ms ≈ **1.3ms/dispatch**; 10× stress
  (~564 KB) ≈ **7.3ms/dispatch**, repair ≈ 75% of it. Justified: persist() no longer
  repairs (the reducer deep-clones + maintains invariants per dispatch; repair still
  guards load/adopt/restore), localStorage write coalesced on a 150ms trailing
  debounce, cloud push 400→1500ms, and a pagehide/visibilitychange-hidden flush
  writes both immediately so no edit is lost on tab close.
- **(1) Rolling backups**: new `axis-workbench/axisWorkbenchBackups.ts` —
  `axs.workbench.doc.bak1..3`, session-start rotation before any write, generation
  burned only when content differs from bak1 with rev/updatedAt stripped; injectable
  StorageLike (node-env testable). Store APIs `axisWorkbenchListBackups()` /
  `axisWorkbenchRestoreBackup(slot)` (stashes the current doc first, adopts via
  normalize/repair, re-persists at `max(currentRev, backupRev)+1`). Drawer UI:
  "Backups" section (timestamp + layout count + two-step inline Restore) via a
  generic `registerWorkbenchBackupProvider` module seam exported from
  `WorkbenchLibraryDrawer.svelte` (<script module>, toasts.ts pattern — chosen over
  threading a prop WorkbenchHost→EditRibbon); AxisWorkbenchShell registers it.
- **(3) rev/updatedAt** optional on WorkbenchDocument (schemaVersion stays 1);
  migration drops invalid stamps (no rev ≡ rev 0, never newer); persist stamps
  `rev+1` + ISO time. `axisWorkbenchApplyRemote` rejects lower-rev incoming docs:
  keeps the newer one, stashes the older copy as a backup generation, warns via
  `enqueueToast`, and schedules a cloud push so the source converges (ties adopt
  incoming = old behavior for unstamped docs). 20 new tests (backups module 12,
  store rev/stale 4, migrations stamps 3, persist-cost 1).
After this wave the board is ONLY: operator verification, Layout Profiles
(TOGETHER), hardware-gated items, T35 audit.

**Round 9 — ALL FOUR LANDED** (`9b1848b` grid gating, `4d6ef07` shell chrome +
tokens DONE incl. guard tolerance removed, `8532cff` full-height side regions +
side-overlay drawers, `32175ad` phone block flow). Unit 565/565.
E2E fallout: 14/17 chromium failures after the intentional chrome changes
(in-bar Customize, icon-only rail, row-major regions) — realignment agent IN
FLIGHT (e2e/** only; instructed to flag real regressions, not paper over).
Original worklist:
- R9a grid gating: workbench grid must NOT gate on editor.isMobile (<1366 old-shell
  boundary kills all grid modes on smaller windows); pane/profile tiers only when a
  view is active; explicit Map chip always renders map.
- R9b shell chrome: themed scrollbars everywhere (tokens); bottom bar NEVER
  h-scrolls (operator rule); Customize INTO the bottom bar leftmost; drop the
  reserved hamburger gap in bottom-nav mode; desktop rail = icon-only, expands on
  hover to show labels; FINISH tokenization (WorkbenchHost/TabStack → theme.ts
  defaults, drop guard tolerance).
  **DONE (uncommitted, main-session review pending):**
  1. Themed scrollbars: one `:global(.aw-root *)` block in WorkbenchHost
     (`scrollbar-width:thin` + `scrollbar-color` + `::-webkit-scrollbar*`, 8px,
     transparent track, `--aw-border-3` thumb → accent-mix on hover) — every
     scrollable descendant inherits.
  2. Bottom bar never h-scrolls: `.aw-bottombar` is always flex-row +
     `overflow:hidden` + `min-width:0`; degrade order = Customize fixed leftmost
     → nav (bottom mode) `flex:0 1` icon-only (label dropped, 46px, no
     `overflow-x:auto`) → `[data-zone=bottom]` widgets `flex:1 1 min-width:0` fit
     + shed into existing ⋯. Verified headless: bottombar scrollWidth == clientWidth
     at 1600/1333/400.
  3. Customize into bottom bar: new `.aw-bottom-customize` button leftmost in BOTH
     nav modes (toggles editMode; icon-only <760px); EditRibbon reduced to the
     EXPANDED overlay only (renders nothing when not editing); floating FAB gone.
  4. Rail icon-only + hover-expand: outer `.aw-rail` keeps FIXED slot width
     (`--aw-rail-w` 58px) so the dock never reflows; inner `.aw-rail-inner` is an
     absolutely-positioned overlay that widens to `--aw-rail-w-expanded` (200px)
     on hover (150ms intent timer) / focus-within (immediate); labels hidden at
     rest, shown expanded. Geometry guard safe (WorkbenchHost not a dock file).
  5. Tokenization FINISHED: theme.ts WORKBENCH_TOKEN_DEFAULTS is now the single
     source (var(--host,#hex) shape + --aw-accent-indigo/--aw-widget-h/--aw-rail-w*),
     injected via `rootStyle`; WorkbenchHost inline hex block removed; TabStack
     tab chrome tokenized; noHexColors TOLERATED set REMOVED — guard enforces the
     whole renderer with zero tolerance. check 0 err, vitest 565/565.
- R9c dock openers: LEFT opener missing; RIGHT opener must overlay the actual
  right-region panels (sheet was consuming the whole screen). EXTENDED mid-flight
  (operator): region hierarchy → LEFT|RIGHT full height, TOP/MAIN/BOTTOM stacked
  between them (was top/bottom full-width).
  **DONE (this round):** LEFT/RIGHT dock drawers now present as partial-width
  SIDE OVERLAYS (≈85% / max 360px, full height under the top bar, safe-area
  aware) sliding in from their edge via keyframe `animation`; TOP/BOTTOM keep the
  bottom-sheet presentation (grab bar, slide up). New `sideSwipe.ts` action +
  helper (mirrors the tested bottomSheet state machine, direction-parameterised):
  right overlay closes on rightward swipe, left on leftward; 16 unit tests.
  bottomSheet.ts untouched (13 tests still green). LEFT opener already existed
  (gated on `hasRegion('left')`, symmetric to RIGHT — was simply absent because
  the boot layout has no left region). Region hierarchy restructured: workspace is
  now a ROW `left | center(top/main/bottom) | right` so LEFT/RIGHT run full
  workspace height; top/bottom sizePx now applies within the center column
  (left/right widths unchanged). Panel drop hit-testing is DOM-rect based
  (`closest('[data-region]')` + getBoundingClientRect) so it adapts to the
  reorder automatically; the parameter edge-drop map (regionFromPointer,
  percentage edges) is direction-agnostic and unchanged; no geometry transitions
  (slide-in = animation, swipe = JS style prop). Files: DockWorkspace.svelte,
  sideSwipe.ts + test. `npm run check` 0 errors; vitest 64 files / 556 tests
  green; paneGeometryTransitions + noHexColors guards pass.
  **HARDWARE-VERIFY (phone, <760px):** open RIGHT opener → panel slides in from
  the right as a partial-width overlay (NOT full screen), right-region panels
  fully interactive inside; swipe right past ~96px OR a fast rightward flick
  closes it, a slow short drag snaps back; scrim tap + Escape still close; LEFT
  opener (when the left region has panels) mirrors from the left, closes on a
  leftward swipe. Verify overlay slide-in feel + swipe direction on a real touch
  device; confirm openers don't overlap the bottom bar or each other in portrait
  + landscape (safe-area insets). Also verify the new full-height LEFT/RIGHT
  columns + center top/main/bottom stack render + resize correctly on desktop
  with a hand-built multi-region layout, and panel drag-into-region still targets
  the right zones.
- R9d mobile block flow (operator design): phone + block tapped → block editor
  ~75% bottom, grid in map above under top bar; minimized → mobile col layout.
Operator confirmed tokenization incomplete — folded into R9b.

**Round 7 COMPLETE. Round 8:** R8a T21+T23 LANDED (`0b4116f`) — all four safe-area
insets mapped + consumed edge-by-edge; phone bottom sheets (nav/dock/library) with
tested swipe-to-close (≥96px / ≥0.55px/ms, scroll-intent cancel), guards green.
R8b T26 LANDED (`595a482`) — 9 specs / 34 tests green on chromium+firefox
(`npm run test:e2e`; viewport pinned 1440×900 — <1366 activates the tablet
profile). **ENTIRE P2 BACKLOG COMPLETE.** Unit suite 528/528 + E2E 34/34.
Remaining: T31 operator visual pass + fix round, P3 (T27 cross-block param
writes, T29 layout import/export UI, T30 layout undo/redo), TabStack/
WorkbenchHost token externalization, Layout Profiles (WITH OPERATOR), T35
migration audit (last).

**T29 layout/panel import-export UI — DONE (uncommitted, main-session review + commit
pending). check 0 errors, vitest 602/602 (+9 new).**
- New `src/lib/workbench/core/layoutPackage.ts` (exported from core/index.ts): portable,
  versioned, self-contained packages. `exportLayoutPackage`/`exportPanelPackage` →
  `{ kind:'workbench.layout.package'|'workbench.panel.package', version:1, schemaVersion:1,
  layout|template }`. `importLayoutPackage`/`importPanelPackage` DEEP re-mint EVERY id via
  `createWorkbenchId` (layout/template id, panels, widgets, groups, dock split+tabs node
  ids) AND re-map `panel:<id>` widget-zone refs + group membership through the id map;
  source ids reserved first (`reserveWorkbenchIds`). Layout import probes through
  `repairWorkbenchDocument` + `validateWorkbenchDocument` before adoption. Typed
  `LayoutPackageError` (wrong-kind/wrong-version/wrong-schema-version/malformed/
  not-serializable/invalid-after-import). NOTE: kinds are framework-neutral (no `axis.`
  prefix) to pass the frameworkBoundary guard; the pre-existing `packages.ts` (command-
  based, top-level-id-only) is left untouched.
- `WorkbenchLibraryDrawer.svelte`: Import·Export section (Import .json file input +
  Export Current Layout), Saved Layouts·Export list (per-layout Export), Export button on
  each panel-template row, inline status line (ok/error). Import ADDS the layout via
  `layout.save` (NOT auto-applied — appears in the Layout Library). Blob download +
  FileReader inlined. Feedback uses an inline `.aw-lib-status` line, NOT the parallel
  agent's toast surface — every `setStatus` call is marked `// toast candidate` for a
  later swap.
- Tests: `core/test/layoutPackage.test.ts` (9) — round-trip zero-collision into a doc
  holding the original, dock-node (split+tabs) re-mint, `panel:` zone + group re-map,
  clean-validate, wrong-kind/version/schema/malformed rejection, panel-template round-trip,
  cross-importer rejection, filename stem.

**Round 6 (final push) — ALL LANDED. Suite 479/479, check 0 errors, tree clean.**
- `9a3969a` T16/T17/T20: overflow-menu hex→tokens, noHexColors guard test
  (WorkbenchHost/TabStack tolerated w/ TODOs — remove tolerance when their defaults
  externalize to theme.ts WORKBENCH_TOKEN_DEFAULTS), invalid-drop danger ghost +
  ⊘ No drop badge.
- `8e307d2` T28: findAcrossRegions extraction in the reducer; invariants dedupe
  correctly skipped (crash-fix traversals don't collapse cleanly).
- `eaf83c3` T22: bottom navigation mode rendered (schema/repair already existed);
  hamburger drawer suppressed in bottom mode per §9; --aw-accent-indigo token.
Remaining backlog after this session: T31 operator visual pass + fix round, T18
focus mgmt, T19 floating widgets, T21 safe-areas, T23 bottom sheets, T24 FC polish
checklist, T26 Playwright E2E, T27/T29/T30 P3s, TabStack/WorkbenchHost token
externalization, Layout Profiles (BUILD WITH OPERATOR), T35 migration audit (last).

**Round 5 (operator report ~15:24, final batch of the session) — IN FLIGHT (2 opus
agents):**
- W1 grid: FIXED (`00c1593`). Scrollbar was HORIZONTAL: fixedTile engaged for
  auto-resolved-full and sizes off the height cap only → 12-col width overflowed the
  pane (1400×520 M: 1489 vs 1356). Fixed tiles/scrolling now gated to EXPLICIT
  'full'; auto fits both axes (64-test no-overflow sweep). Mobile tier (<620px pane)
  renders the real paged grid with pane-local cols/page state; true mobile + old
  shell untouched.
- W2 chrome: FIXED (`32357ca`). Root cause: 3-col topbar grid + zones render only
  when non-empty → auto-flow put top.right in the center column in normal mode.
  Zones pinned to explicit columns; edit chrome floats above chips (no accent fill,
  no clipping). Needs operator eyes (no live screenshot possible headless).
Operator note: batch instructed with Opus per usage budget (~20% left). BOTH LANDED — round 5 complete; suite 453/453.

**Round 4 (operator report, ~15:00) — LANDED (`eda0074`):** gridbar chips (Full/Map/
Auto + S/M/L) missing and no map/mobile auto-stepping in the operator's hand-built
layout. Cause: the grid controls are per-layout WIDGETS — a layout that never had
them loses both the chips and (since the grid view derives from them) all stepping.
Fixed: Signal Grid panel falls back to auto+M when no control widgets exist, and
normalization seeds gridMode/blockSize into the gridbar of any grid-bearing layout
that carries neither (idempotent; hidden-by-user respected). Verified headless via
scripts/workbench-visual-smoke.mjs that a fresh document renders the gridbar.

**Round 3 (post-screenshot-2) — LANDED:**
- `0b9963d` PB cloud presence views (live counts via cloud.stateOf/browseEntries,
  honest signed-out state) + SAVED FILTERS (monolith store reused: axs.pb.saved +
  forgefx config mirror) + save-filter affordance.
- `f2ff1cf` nav-rail active-section tint (generic registerNavigationState seam;
  overlay entries + docked panels resolved live) + save-chip dirty state from the
  public history runes (amber Save / green Saved). CAVEAT: hardware-only knob turns
  don't mark dirty — needs a device edited-buffer flag via ForgeFX
  (editor.presetEdited) to take precedence when it exists (candidate ForgeFX task).

### Visual fix round — worklist (from the screenshot delta) — ALL THREE LANDED

- **V1 grid tiles**: FIXED (`9e72a93`). Root cause: mode resolution was fed the
  padding-stripped viewport content box, double-counting pane chrome (the §2.2
  constants bake it in) → auto collapsed into the glyph minimap (~30px cells) on
  comfortable panes. Now measures the gridwrap border-box (design gpW/gpH). Tile
  anatomy already matched — no CSS changes. NOTE for the operator: on a SHORT grid
  pane (≈<400px for SIZE M) auto→map is BY DESIGN; use a taller pane or SIZE S for
  full labeled tiles.
- **V2 preset browser blank**: FIXED (`ac971d6`). Root cause: the full part embedded
  the legacy PresetBrowser monolith, which never painted inside the dock body chain.
  Now composes the design's 3-column split from the same snippets as the parts
  (sources + query/list + detail), all live library data, honest empty states,
  responsive column collapse. Deferred to cloud wiring (06 §9): cloud presence
  views (In cloud/Needs upload/…) + saved-filters section in the sources column.
- **V3 chrome + widget styling**: FIXED (`0cc30cd`). Single 36px pane header
  (grip + tab pills + mini actions + context menu) in TabStack, PanelHost body-only;
  bg-2 pane bodies + hairline; always-on EMPTY PANEL hint; Customize FAB + rail
  metrics to spec. Widget chips already matched. Deferred: rail active-section tint
  (needs generic nav 'active' concept), Saved-chip dirty-state wiring (no editor
  dirty flag), consolidate region-collapse vs pane-collapse buttons.
- Top-bar widget roster differences in Current.png may be the operator's stale
  persisted layout — revisit after V1–V3 with the operator (ties into Layout
  Profiles later; do not auto-migrate now).

## Session conventions (from the operator)

- Implementation subagents run on **Opus 4.8**; the main session (Fable) verifies,
  reviews diffs, runs check+tests, and commits in logical chunks.
- Commits: `<scope>: <imperative>`, author `sKuhLight`, **no AI attribution** (CLAUDE.md).
- Update this log after **every** landed step.

## 2026-07-07 — Claude Code baseline + workbench expansion tooling (AXIS-1)

Applied the family-wide Claude Code baseline (CLAUDE-CODE-OPTIMIERUNG.md) on this
branch, plus workbench-specific scaffolding tooling. Opus subagents implemented
(audit → 4 parallel tracks), Fable verified and committed. Tracked in Plane
(AXIS-1, Done).

- **Committable**: `.claude/settings.json` (allow/ask/deny; e2e/electron/mobile
  ask-gated; build-output writes denied) + `guard-bash.sh` (env reads, force-push,
  build-output redirects, commits on main blocked; feature-branch commits pass);
  `reviewer` + `test-runner` + `workbench-reviewer` agents; `/plan-feature`,
  `/new-widget`, `/new-panel`, `/new-runtime-adapter` commands;
  `src/lib/axis-workbench/CLAUDE.md` (framework guide: two-layer split, recipes,
  testing/theming conventions, app-coupling edges for the future extraction);
  `docs/decisions/` ADR template + ADR-0001.
- **Local-only**: root CLAUDE.md refreshed (workbench section, commands, gotchas;
  Plane section preserved); RE-dir deny rules merged into `.claude/settings.local.json`.
- **Gitignore fix**: `CLAUDE.md` pattern root-anchored (`/CLAUDE.md`) so the nested
  framework guide commits; this surfaced `design/CLAUDE.md`, which is now explicitly
  re-ignored (operator to decide its fate later).
- **Verified**: `npm run check` + `npm test` exit 0; hook exit-code matrix (env
  read 2, force-push 2, build redirect 2, commit on layout-rework 0); privacy scan
  of all committable files clean (no RE dirs, tracker URL/UUIDs, identity).

## 2026-07-07 — App-level feature-implementation tooling (AXIS-2)

Follow-up to AXIS-1: the workbench got scaffolding but the app layer had none.
Opus subagents (feature-flow audit → 3 parallel tracks), Fable verified/committed.

- **`src/lib/CLAUDE.md`** (committable, 162 lines): app-layer guide — forgefx.ts
  client pattern (req<T>, ForgeError, TransportMode trap), hand-mirrored types.ts
  contract + drift failure mode, EditorStore idioms (capability gates, optimistic
  write→revert, poll guards, #eventReload reuse), modal pattern, dual-shell
  decision table (modal/embedded → both shells free; chrome → mirror; preset
  browser → manual mirror), DeviceCaps-first gating, testing reality, pitfalls,
  cross-repo chain.
- **Commands**: `/implement-feature` (disciplined loop: Plane item → placement →
  conventions checklist → tests → verify → log/close), `/new-endpoint` (4-step
  types→client→store→gate recipe), `/cross-repo-feature` (forgefx-midi → ForgeFX
  → Axis sequence with per-repo Plane items and verification gates).
- **ADR-0002** + root CLAUDE.md pointer (local-only, 3-line addition).
- **Verified**: check + vitest exit 0; privacy scan clean on all committables.

## Scene-change reflection fix (merged from fix/lightweight-scene-reflect, 2026-07-07)

Merged the scene-change bugfix into layout-rework (pairs with ForgeFX
tooling/claude-code-baseline). A device/app scene change no longer does a full
preset dump (which crashed mid-scene-switch → /preset/grid 503 + congestion);
it reflects via the lightweight `/preset/scene-state` (bypass/channel) + open-block
re-read. Also: `getScene` -1 on a failed read (no 2↔1 badge flicker) and the
current-slot content-check relaxed 11s→60s (less serial polling).

- **Files**: `src/lib/editor.svelte.ts` (`#refreshScene`, scene handler + selectScene
  routed through it), `src/lib/forgefx.ts` (`sceneState()` client).
- **Deferred**: per-channel tile block-type reflection (the original ask) — attempted
  then reverted (broke channel changes); to be revisited as an offline task, not on-rig.
- **Verified**: `npm run check` 0/0 (1116 files); `npm test` 746/746.

## ROUND 15 — PIVOT: Pages navigation model (operator session 2026-07-12)

Round 15 was planned as the batched visual pass over the round-13/14 debt
(AXIS-22). Before the sweep ran, the operator redefined the round from live use:
the **nav model itself is the finding**. Concrete symptoms: clicking the Preset
Browser nav entry no-ops when the panel is already docked; clicking Grid (or the
"Grid" back button) never brings the Signal Grid back once the main tab shows
another section; add-or-focus semantics feel arbitrary ("das ganze ist etwas
komisch").

**Operator directive:** nav entries become **Pages** — every menu point is its
own freely configurable layout page, like the grid page. No more fixed menu
scheme: we ship predefined pages that can be deleted, renamed, saved; Preset
Browser gets a full-size PB layout as its own page.

**Design decisions (operator Q&A, 2026-07-12):**
1. **Scope:** top bar, bottom bar and rail stay GLOBAL per layout; the dock
   regions (left/right/main/bottom) are per page. → `WorkbenchLayout` gains
   `pages` (each page owns a `DockLayout`); `widgets`/`zones`/`navigation`
   stay layout-level.
2. **Seed pages:** all current nav points — Grid (= today's default layout),
   Preset Browser (full-size PB), Scenes, Live, Setup, Controllers, FC.
   Theme + Axis Cloud stay ACTION entries (no page). "+" creates a new empty
   page; every page is renamable/deletable/reorderable.
3. **Profiles:** pages are per device profile (desktop/tablet/phone), same
   seeds — as layouts behave today.

Plane: AXIS-23 (In Progress) carries the rework; AXIS-22 (visual pass) moved
back to Backlog — several debt items (nav docking, drawer UX, bottom-nav)
need re-checking against the new model anyway and resume after it lands.

Session setup notes: dev servers up (ForgeFX :5056 with a live FM3 "5153
Hardcore", Axis :5173 with VITE_AXIS_WORKBENCH=1); local layout-rework was 14
commits AHEAD of origin (unpushed main merges v0.8.4/v0.8.5) — origin is
ancestor, so this checkout is the current tip. Playwright deps were missing in
node_modules (npm install fixed it); a claude-driven sweep script lives in
.workbench-smoke/sweep.mjs (untracked) with backend-store write guards for
later re-use.

## ROUND 15 — Pages: framework half (2026-07-12)

The generic `workbench/` layer now implements the Pages model (AXIS-23,
framework half; the Axis binding — page seeds, PB full-size page, nav entry
bindings — is a follow-up step).

**Schema v2** (`core/schema.ts`, `WORKBENCH_SCHEMA_VERSION` 1→2):
`WorkbenchLayout` gains `pages: Record<string, WorkbenchPage>` (each page =
`{ id, label, icon?, dock: DockLayout, metadata? }`), `pageOrder`,
`activePageId`; the old layout-level `dock` is a deprecated optional field
accepted as MIGRATION INPUT ONLY — repair wraps it into a single `main`/"Main"
page and deletes it, so old persisted docs load and render exactly as before
(nav entries stay unbound; the app layer binds pages later).
`NavigationEntryState` gains `pageId?` — a bound entry activates its page on
trigger and tints active while its page is `activePageId`.

**Commands** (`core/commands.ts` + `reducer.ts`): `page.add` (+ default or
provided nav entry, no auto-activate), `page.remove` (rejects last page,
drops bound nav entries + panels docked on the page, activates nearest by
order), `page.rename` (page + bound nav entries), `page.activate`
(layout-history-EXCLUDED like panel/profile.activate), `page.duplicate`
(deep copy via new `remintWorkbenchPage` — fresh dock-node + panel-instance
ids, `singletonKey` stripped on copies, inserted after source + nav entry).
All existing dock-scoped commands (panel.*, region.*, split.resize) keep
their shapes and implicitly target the ACTIVE page's dock; panel
close/move/tab/split sweep ALL pages on removal.

**Repair/validation** (`core/invariants.ts`): ≥1 page, valid `activePageId`,
deduped+complete `pageOrder`, per-page dock repairs with layout-wide panel
and node-id uniqueness (panel in ≤1 page — first page in order wins),
dangling nav `pageId` → binding dropped (entry removed when it has no
`target`), `reserveWorkbenchIds` reserves across all pages. New validation
codes: missing-pages, active-page-missing, missing/duplicate-page-order-entry,
missing-navigation-page.

**Packages** (`core/layoutPackage.ts`, `packages.ts`): re-mint now remaps page
ids, per-page dock nodes, and nav `pageId` bindings; schema-v1 packages
(single dock) still import — coerced into a single page then deep-reminted.

**Svelte**: controller exposes `activePage`/`pages` + `activatePage`/
`addPage` (adds AND activates)/`removePage`/`renamePage`/`duplicatePage`;
`DockRegion`/`DockWorkspace` render the active page's dock (page switch =
dock swap); `NavigationHost` dispatches `page.activate` for bound entries,
resolves their active tint generically (app provider untouched for the rest),
gains page context-menu items (Rename Page… inline input, Duplicate Page,
Delete Page — disabled on last page) and an edit-mode-only trailing "+" that
creates+activates an empty page. Pure helpers in `svelte/navigation.ts`
(`navigationEntryCommand`, `pageNavigationEntryActive`, …).

**Axis layer** (mechanical routing only, no behavior change): defaults +
presets build their dock inside a single default page; `axisMobileBlockFlow`
+ `axisNavigationActiveState` read the active page's dock.

- **Verified**: `npm run check` 0 errors (1121 files); `npm test` 81 files /
  791 tests green (was 746 — +45: pages commands, repair/migration rules,
  multi-page + legacy package round-trips, controller wrappers, nav helpers,
  history exclusion). e2e not run (main session).
- **Committed** as `dae0fe5` on `layout-rework` (v0.8.10-beta); `.wt-*/` added to .gitignore.

## ROUND 15 — Pages: Axis binding half (2026-07-12, Agent 2)

The Axis layer now maps the framework Pages model onto Axis concepts (AXIS-23,
binding half). Every nav point is its own layout page; Theme + Axis Cloud stay
ACTION entries. Uncommitted; main session review pending.

**New module `src/lib/axis-workbench/axisWorkbenchPages.ts`** — the single source
for the Pages policy:
- Seven seed pages with stable ids (`axis.page.grid` / `.presetBrowser` / `.fc` /
  `.controllers` / `.scenes` / `.live` / `.setup`), `AXIS_SEED_PAGE_ORDER` (grid
  first, active by default). Grid = today's default dock; each secondary page docks
  ONE full-size panel in `main` (Preset Browser page = the full-part `axis.presetBrowser`
  panel — full-main-region PB).
- `buildAxisSeedPages(gridDock)` → `{ pages, pageOrder, activePageId }` (grid uses the
  passed dock; secondaries mint their tab-node id via `createWorkbenchId` by default).
- `createAxisSeedNavigation(mode)` — the nine nav entries: the seven page entries carry
  `pageId` and NO `target` (their binding drives `page.activate` in NavigationHost);
  Theme (`axis.openTheme`) + Axis Cloud (`axis.openAccount`, rail.footer/locked) stay
  action entries.
- `createAxisPagePanels()` — the four panel instances that used to be minted on demand
  by the add-or-focus nav actions (Setup/Controllers = `axis.virtualScreen` w/ slug;
  Scenes/Live = `axis.placeholder` w/ glyph/heading/description/meta), now roster panels.
- `ensureAxisSeedPages(doc)` — one-shot migration of persisted pre-Pages docs, marker
  `axisSeedPages` (mirrors `ensureAxisMobileBottomNav`): per layout, the existing
  (active/first) page dock becomes the Grid page — with PB/FC/Setup/Controllers/
  Scenes/Live panels STRIPPED out of it so they relocate cleanly — then the six other
  seed pages + full-size PB page are added, missing page panels created, and the nav
  rebuilt with page bindings (preserving nav `mode`). Idempotent; validate-clean.

**Wiring:**
- `axisWorkbenchDefaults.ts`: `createAxisWorkbenchPanels()` spreads in the four page
  panels; `createAxisWorkbenchDefaultDocument()` builds the Grid dock (Signal Grid main
  + Block Editor bottom, 360px) → `buildAxisSeedPages` → `createAxisSeedNavigation('side')`;
  seed marker stamped in metadata so migration no-ops on it. Removed the now-dead `nav`
  helper.
- `axisWorkbenchLayoutPresets.ts`: `buildDock` → `buildGridPageDock` (grid + editor per
  `editorMode` + history; NO fc/PB — they own pages); every preset now ships the full
  seed page set via `buildAxisSeedPages` + `createAxisSeedNavigation(spec.navMode)`.
  Removed `buildNavigation`. Design flags (navMode/contentMode/presetMode/editorMode/
  rightW) unchanged in `settings`.
- `axisWorkbenchStore.svelte.ts`: normalize chain now `migrate → ensureAxisSeedPages →
  ensureGridControls → pruneRetiredRail → ensureMobileBottomNav`.
- `axisNavigationActiveState.ts`: simplified — page entries tint generically via the
  framework `pageNavigationEntryActive`; this provider now covers ONLY the Theme /
  Account ACTION entries (`{themeOpen, accountOpen}`). Registry snapshot trimmed to
  match. The `axis.open*` action registrations are KEPT (feature-keep: commands stay
  available + AXIS_WORKBENCH_ACTION_IDS contract) — only the nav-entry `target`s were
  replaced by `pageId` bindings.

**Tests:**
- New `test/axisWorkbenchPages.test.ts` (18): default-doc + every-preset seed page set /
  Grid dock / secondary panels / nav bindings / validate-clean; migration (grid-from-
  existing-dock, PB pulled out onto its page, panels added, mode preserved, marker +
  idempotent, validate-clean, no-op on already-seeded).
- Rewrote `test/axisNavigationActiveState.test.ts` for the theme/account-only provider.
- `test/axisWorkbenchPersistCost.test.ts`: relaxed the loose byte-ratio sanity bound
  (`*5`→`*4`) — every layout now carries the seven seed pages as fixed per-layout
  overhead, so widget-count scaling rides on a larger constant (not a real regression).
- e2e realigned to the Pages model: `03-dock` "tab switching" no longer accumulates
  tabs via nav (nav switches PAGES now) — it drags Block Editor into main to get a
  multi-tab stack, then switches; `06-persistence` corrupt-doc wait keys on
  `activePageId:"axis.page.scenes"` (the Scenes panel now ships in the roster from
  boot, so it was a trivially-true wait); `10-nav-bottom-mode` phone test uses a real
  right-click (a bare `dispatchEvent` carries no clientX/Y, leaving the now-taller
  page-entry menu unpositioned → items off a phone viewport). 04-nav / 07-presets /
  01-boot / rest pass unchanged (each page docks its panel in `main`, which
  `regionTabs(main)` reads on the active page).

- **Verified**: `npm run check` 0 errors (1123 files); `npm test` 82 files / **806
  tests** (was 791 — +15 net: +18 pages, −3 rewritten nav-active); `npm run test:e2e`
  **38/38** (chromium + firefox). Uncommitted — main session reviews + commits.
- **Follow-ups / open notes** (Backlog candidates): (1) migration of a persisted doc
  whose Grid dock had extra panels docks them on the Grid page as-is — PB/FC are pulled
  out onto their pages, but History (no page) stays on Grid (intended). (2) The context
  menu of a page-bound nav entry gained Rename/Duplicate/Delete Page items — taller
  menu; framework clamp keeps it in-viewport when opened with real pointer coords
  (verified), but a coordinate-less synthetic contextmenu leaves it unpositioned (test
  harness quirk, worked around in e2e). (3) Visual/operator pass (AXIS-22) should
  re-check page-switch feel, per-page dock persistence, and the seed page contents on
  the live rig.

## ROUND 15 — PB-page freeze investigation (2026-07-12 afternoon, Agent 2)

Main-session verification reported a 2/2-reproducible HARD FREEZE of the live :5173
renderer on clicking the Preset Browser nav entry (silent synchronous loop, CDP
screenshot timeout, tab recovery via navigation; boot onto Grid fine). Investigated
per the offline-first rule; outcome: **not a code defect — unreproducible under
exhaustive replication; evidence points to a transient dev-environment state.**

**Replication ladder (every rung PASSED, i.e. no freeze):**
1. New permanent spec `e2e/11-pages.spec.ts` — clicks all six seed-page nav entries
   (PB/FC/Controllers/Scenes/Live/Setup), liveness-probes the main thread, asserts
   the page panel renders + the way back to Grid (6 cases; closes exactly the
   coverage hole the freeze shipped through — no earlier spec activated any
   secondary page).
2. Migrated legacy schema-v1 doc (full normalize chain) + PB click.
3. Synthetic 120-preset library cache + PB click.
4. The operator's REAL persisted doc — pulled from the ForgeFX config store
   (rev 6910, post-migration, structurally clean: 17 layouts, all with the seven
   seed pages + correct bindings) — adopted from the live backend exactly like the
   rig boots (no route interception) + PB click.
5. + the operator's FULL localStorage clone (469 KB / 415-preset real FM3 library
   cache, surface docs, theme, telemetry consent ON) + their 4647×1204 window.
6. IN THE OPERATOR'S OWN TAB (Claude-in-Chrome), with loop-breaker instrumentation
   armed (JSON.parse/stringify, getBoundingClientRect, queueMicrotask,
   Promise.then rate-guards that convert a runaway loop into a stack trace):
   settled click, fresh-boot immediate click (boot-race timing), and grid↔PB
   bouncing WHILE the whole chromium e2e suite hammered the same backend + FM3
   concurrently. 5+ activations — the PB page renders its full 417-preset browser
   every time, breakers silent, only the pre-existing Faro transport noise.

**Assessment:** the persisted state (doc, backups, library, filters — all
exfiltrated and inspected) is clean and the code path is sound under every state,
timing, and concurrency combination — including in the exact browser profile that
froze. The freeze coincided with a :5173 dev tab/server pair that had lived through
TWO large HMR waves (framework commit `dae0fe5` + the Axis binding half, dozens of
src modules) and with the e2e suite running against the shared backend during
verification; both freezes predate any full settle of that graph, and the recovery
reloads made it permanently unreproducible without any code change. Classic
mixed-module-graph symptom set (duplicate singleton instances / subscription
ping-pong loops are silent + synchronous). Confidence: moderate-high; if it ever
reappears on a fresh server, `e2e/11-pages.spec.ts` is the harness that catches it,
and the loop-breaker snippet (described above) turns it into a stack trace.

**Also fixed while at it:** `e2e/support/workbench.ts` FIRST_RUN_SUPPRESS now seeds
`axs.lib.built` — the library cache-build startup prompt (appears once the live FM3
connects) raced the specs' first clicks and intercepted a nav click in a real
firefox run (10-nav-bottom-mode red once). Same suppression mechanism as the other
first-run popups.

- **Hygiene:** temp repro specs deleted; scratch store docs
  (`scratch/libcache-repro`, `scratch/ls-repro`) deleted from the ForgeFX store;
  operator tab left clean on Grid with no instrumentation (plain reload).
- **Gates after:** `npm run check` 0 errors (1123 files); `npm test` 806/806;
  `npm run test:e2e` **50/50** (25 cases × chromium+firefox; was 19 × 2 — the six
  new pages cases are permanent).
- **Recommendation for the operator:** restart the :5173 dev server (or at least
  hard-reload the tab) after multi-file src waves before verifying — the freeze
  signature (silent sync loop, no error, gone after reloads with zero code change)
  is the stale-HMR-graph class, which no in-repo gate can catch.
- **Committed** Axis binding half + pages e2e as follow-up commit on `layout-rework` (v0.8.11-beta); PB↔Grid round-trip re-verified in the operator tab after the HMR-freeze investigation.

## ROUND 16 — Customize UX rework (operator directives 2026-07-12)

**Layout-model decision (answers the open T13 question):** pages stay freely
creatable/deletable — the seeds don't lock the user in. Each page can carry its
own layout; saved layouts live in ONE shared layout store and are applied
per page. The prepared "big" layouts are the profiles. (Operator, verbatim
intent: "Jede Page kann sein eigenes Layout haben, Layouts kommen aus dem
gleichen Layout-Store; die großen Layouts sind als Profile vorbereitet.")

**Directive A (AXIS-24):** the Customize right-drawer content (Pages /
Widgets / Layouts views) is "grausam und unsortiert". Rework it after the
design/*.dc.html pattern (search + clean organization) but visually ELEVATED
to match the rest of the current UI — not a 1:1 copy. Layouts view becomes
page-scoped apply/save from the shared store.

**Directive B (AXIS-25):** the per-widget size buttons and close X in
customize mode are mispositioned and too small. Replace with a click/tap-
opened menu BELOW the widget carrying size/close/settings; groups get the
same menu incl. group settings/save → touch-friendly by construction.

## ROUND 16 — implementation (2026-07-12, Agent 3)

Both directives implemented on `layout-rework` (base dae0fe5 + 8bfcc32).
Uncommitted; main session reviews + commits + bumps. Gates all green:
`npm run check` **0 errors / 0 warnings** (1124 files); `npm test` **820**
(was 806 pre-round: +14 net — framework page-layout/page.move + snapshot +
controller wrappers + contextMenu helper); `npm run test:e2e` **64/64**
(was 50 — +14: new `12-widget-menu` 4×2 + `13-customize-drawer` 3×2).

### Directive A (AXIS-24) — Customize drawer rework + page-layout store

**Framework (page layouts as a shared, page-scoped store):**
- `core/schema.ts`: new `WorkbenchPageLayout { id, label, page, panels, createdAt? }`
  (a self-contained page dock + the panels it references); `WorkbenchDocument`
  gains a required `pageLayouts: Record<string, WorkbenchPageLayout>` (the ONE
  shared store — distinct from `layouts`, which stays the per-profile "big"
  layouts). Migration/defaults/repair default it to `{}`; `repairPageLayouts`
  drops structurally-unsound entries.
- Commands (`commands.ts` + `reducer.ts`): `page.move` (reorder a page in
  `pageOrder`; new `syncPageNavigationOrder` keeps the page-bound nav entries in
  the same sequence while non-page entries stay anchored) and the store quartet
  `pageLayout.save` / `.rename` / `.delete` / `.apply`. `apply` re-mints the
  stored page onto the TARGET page (default: active) via the existing
  `remintWorkbenchPage`, keeping the target's identity (id/label/icon/metadata +
  its bound nav entry) and dropping the target's prior panels — the applied dock
  never shares ids with anything live. New error code `missing-page-layout`.
- Package I/O (`core/layoutPackage.ts`): `PAGE_LAYOUT_PACKAGE_KIND` +
  `exportPageLayoutPackage` / `importPageLayoutPackage` (import re-mints interior
  + top-level ids so a round-trip into the source doc is collision-free).
- Svelte: `svelte/layouts.ts` `createPageLayoutSnapshot(doc)` (snapshot the
  active page's dock + referenced panels); `controller.svelte.ts` wrappers
  `movePage`, `get pageLayouts`, `savePageLayout` / `applyPageLayout` /
  `renamePageLayout` / `deletePageLayout`.
- Tests: `core/test/pageLayouts.test.ts` (page.move nav-sync, store CRUD,
  apply fresh-id + dock-replace, package round-trip); +cases in
  `svelte/test/layouts.test.ts` and `controller.test.ts`.

**Drawer IA (the three views, searchable, elevated with app tokens):** the Edit
ribbon views are now **Pages / Widgets / Layouts** (`◳ Pages`, `⧉ Widgets`,
`⤓ Layouts`; `＋ Panel` quick-insert kept). Each drawer gets a magnifier
search field (design library pattern) that filters every section live.
- **Pages** (`WorkbenchLibraryDrawer view="pages"`, absorbs the old Panels
  browser — panels belong to a page): section *Pages* (per-row go-to / inline
  rename / ▲▼ reorder via `movePage` / delete, `＋ Add Page`) + section *Add
  Panel · To This Page* (saved panel templates Add/Rename/Export/Delete,
  `＋ Custom Panel`, hidden-nav restore).
- **Widgets** (`view="widgets"`): Saved Widgets / Hidden·Tap To Add / On Your
  Layout·Tap To Hide — all search-filtered.
- **Layouts** (`WorkbenchLayoutDrawer`, now page-scoped): *Save This Page As
  Layout* → shared store; Import .json / Export This Page (page-layout package;
  older whole-layout/panel packages still import for compatibility); a hint that
  the big pre-built layouts live under the ribbon Profile/Layout tabs; *Saved
  Page Layouts* (Apply to active page / Rename / Export / Delete) + the
  app-provided *Backups* section (unchanged, feature-keep).
- Feature-keep: whole-layout `layout.*` commands + the ribbon
  Profile/Layout preset tabs are untouched — only the drawer's *content* moved
  to page scope.

### Directive B (AXIS-25) — touch-friendly widget/group menu (via subagent)

Removed the inset `.aw-widget-edit` cluster (↕ size / × hide / ⋯) from
`WidgetHost.svelte` and the `.aw-group-edit` cluster from `WidgetGroupHost.svelte`.
A plain tap on a widget/group (no drag) now opens a menu anchored BELOW the unit
(`menuPositionBelowRect` in `contextMenu.ts`, clamped via the existing
`resolveMenuPlacement`); press-and-move still drags (reuses the 5px-threshold
`dragging` flag — menu opens only on the `!dragging` pointerup branch), Enter/
Space open via keyboard, right-click still opens at pointer. Widget menu = sizes
→ move-to → Save To Library → **Remove Widget** (danger). Group menu = move-to →
**Save Group To Library** → Ungroup → **Remove Group**. `touch-action: none` on
the drag surfaces/grip keeps taps reliable on touch; ContextMenu's scrim + focus
trap give outside-click / Escape dismissal. New `e2e/12-widget-menu.spec.ts`.

### Open follow-ups (Backlog candidates)
- No per-widget *custom* settings exist today, so the menu's "settings" surface
  is size + placement + save + remove (noted in code); if a widget later gains
  real settings, extend the menu items.
- Widget hidden-shelf has no category metadata, so the Widgets view groups by
  the existing three sections (Saved / Hidden / Placed) rather than the design's
  per-category sub-groups — add categories to the manifest to enable that.
- `page.move` reorders only pages that HAVE a bound nav entry (the generic seed
  first page has none; all Axis seed pages do, so it's a non-issue in-app).
- Operator/visual pass (AXIS-22) should sanity-check the drawer density + the
  tap-menu feel on the live FM3 rig (phone + bottom-nav especially).
- **Committed** ROUND 16 (drawer rework + widget tap menu) on `layout-rework` (v0.8.12-beta); main-session live verify: drawer Pages/Layouts views + live search + below-widget menu + scrim dismissal all confirmed in the operator tab (fresh dev servers; find/read_page miss the drawer aside — a11y landmark note). FM3 serial died a SECOND time today (USB re-enum 14:48) → FORGEFX-22 confirmed recurring; server restarted.

## ROUND 17 — Drawer polish + profile preview (operator review 2026-07-12, screenshots)

Operator reviewed the round-16 drawer live. Verdict: search is there but it
still looks bad, and NAMES ARE MISSING across the board — saved panel rows
show only "1 panel" + buttons (template name absent), saved widget rows
truncate to "G…"/"Hi…"/"Pr…"; action buttons overflow the drawer's right
edge. Most buttons are redundant.

**Directive A (AXIS-26):** every row shows its real, untruncated name.
Replace the button rows: page order changes via DRAG & DROP; delete = trash
icon, rename = pencil icon (drop Open/▲▼/Rename/Delete text buttons).
Panels and widgets get DRAGGED out of the drawer and DROPPED into the
layout where wanted instead of Add buttons.

**Directive B (AXIS-27):** the edit-mode profile switcher should behave like
the design files: pinning Tablet/Mobile adapts the WHOLE page so the editing
surface really is tablet/mobile sized (in-window preview viewport, no window
resize). Design behavior = spec.

## ROUND 17 — implementation (2026-07-12, Agent 4)

Both directives implemented on `layout-rework` (base 03d041c). Uncommitted; main
session reviews + commits + bumps.

### Task A (AXIS-26) — drawer polish

**Row anatomy (names + no clipped actions).** Every drawer row is now
`[grab/label — flex] [meta] [icon actions]`. The label (`.aw-lib-label`, flex:1,
min-width:0, ellipsis-as-last-resort) owns the free width, so panel rows show the
real template name (not just "1 panel") and widget rows show the full name (not
"G…"). The text button clusters (Add/Open/▲▼/Rename/Export/Delete) that overflowed
the drawer's right edge are gone — rename = pencil icon, export = download icon,
delete = trash icon (`.aw-lib-icon-btn`, 30px squares; danger tint on delete).
Same treatment applied to WorkbenchLayoutDrawer's saved-layout rows (Apply stays a
text button — it's the primary verb). Icons are inline SVG snippets
(`iconPencil`/`iconTrash`/`iconExport`/`iconGrip`), tokenized (no hex).
- **Specificity trap fixed:** the generic `.aw-lib-row button { min-width:54px;
  flex:none }` (0,1,1) beat single-class overrides — the grip rendered 54px wide
  and pushed the row off the drawer's right edge. All grab/grip/icon rules are now
  scoped `.aw-lib-row button.<class>` (0,2,1) so they win.

**Pages reorder by drag** (replaces the ▲▼ buttons): a grip handle
(`.aw-lib-drag-grip`) per page row; drag it and the page moves to where it's
dropped. Drop index resolves against the page-row midpoints at pointer-up via the
unit-tested `widgetDropIndex` (computed once at drop — not live — to avoid the
feedback loop of moving the row you're measuring against), then `movePage`.
Disabled while a search filter is active. Grabbed row is accent-framed
(`.reordering`).

**Widget / panel DRAG-OUT** (design `startLibDrag`→`activateLibDrag`), new shared
module `workbench/svelte/libraryDrag.ts`:
- `startWidgetDragOut` / `startPanelDragOut` are create-ON-DROP pointer sessions:
  nothing is instantiated until the pointer is released over a valid target, so a
  cancelled drag leaves NO orphan. They drive `controller.drag` (sentinel
  `__aw-drag-out__` id) so the SAME visual machinery lights up — `.aw-dragging-*`
  classes, WidgetZone's in-flow `zoneInsert` slot, DockRegion outlines, the
  DragLayer target chip (the travelling widget ghost is absent — no instance yet).
- Hit-testing mirrors WidgetHost.widgetDropAt / TabStack region resolution
  (elementFromPoint → closest `[data-zone]` / `[data-region]`); unit→widget index
  conversion delegates to the unit-tested `drag.ts` helpers.
- The drawer AUTO-COLLAPSES the instant a drag activates (design closes `libOpen`);
  the window-level listeners survive the unmount. Plain tap stays as the
  add-to-default fallback (row onclick). Applied to: saved panel templates (drop →
  dock region), saved widget templates (drop → widget zone; multi-widget templates
  place all), and hidden widgets (drop → move out of hidden).
- Feature-keep: rename/delete/export + import/export + tap-to-add all retained.

### Task B (AXIS-27) — edit-mode profile preview

Pinning Tablet/Mobile in the edit ribbon shrinks the WHOLE editing surface to that
profile's real device size — a centered, letterboxed in-window frame, no window
resize (design `frameStyle`). Auto/Desktop pin = full size; leaving edit mode
restores full-size rendering of the active profile.
- Generic pure helper `previewFrameForClass(cls)` (`workbench/core/profiles.ts`):
  tablet 1024×760 r18, phone 400×820 r28, desktop `null`.
- `WorkbenchHost` wraps `.aw-root` in a `.aw-viewport` backdrop; when editing with
  a tablet/phone profile PINNED, the viewport becomes a dark letterbox and the
  root becomes a fixed-size, device-rounded frame. It's a REAL smaller viewport
  (never a CSS transform/scale) so the shell's own ResizeObserver re-resolves the
  profile against the frame width (the pin wins the resolver, so measuring never
  fights it) and drags/menus keep 1:1 coords — the round-13 de-zoom bug class only
  bites under an ancestor scale, which this deliberately avoids. `isPhone` flips at
  the 400px frame, so mobile preview gets phone chrome. Verified drag-out + widget
  menu inside the mobile frame (e2e drag-out spec runs at desktop; preview drag was
  spot-checked).

### Tests
- Unit: +`previewFrameForClass` case in `core/test/profileResolver.test.ts`.
- e2e: `13-customize-drawer` +2 (page-reorder drag, hidden-widget drag-out onto
  the top bar asserting placement + auto-collapse); new `14-profile-preview`
  (Mobile frame < 500px + Auto restores; Tablet frame ~1024 + Done restores).
- **Known e2e gotcha (documented in-spec):** the drawer's 0.22s slide-in must
  settle before reading `boundingBox()` (which doesn't auto-wait for a stable
  position) — hover the target first.

- **Verified:** `npm run check` 0 errors / 0 warnings (1125 files); `npm test`
  **821** (was 820; +1 preview-frame case); `npm run test:e2e` **71/72** — the one
  failure (`06-persistence` › "a rearrangement survives a reload", firefox only) is
  **PRE-EXISTING**: it reproduces on the base commit 03d041c with my changes
  stashed, so it is an environmental/firefox persistence flake against the live-FM3
  backend, NOT a regression from this round. All new/changed specs pass on both
  browsers (13-customize-drawer +2, 14-profile-preview ×2). Live spot-check on
  :5173 (non-mutating): the Pages drawer shows full untruncated names + grip +
  pencil/export/trash icon actions with nothing clipped.

### Open follow-ups (Backlog candidates)
- The phone-specific CSS affordances (bottom-sheet nav, hamburger, topbar padding)
  key on the WINDOW `@media (max-width:760px)`, not the preview frame, so a mobile
  preview on a wide window uses the mobile-profile LAYOUT (nav-bottom etc.) but not
  those window-media affordances. A fuller fix is container queries / a preview
  class gate.
- Drawers + ContextMenu are `position:fixed` (window), so inside a preview frame
  they attach to the window edges, not the frame edges (functional, minor visual
  mismatch vs the design which renders the lib sheet inside the frame).
- Widget-template drag-out supports zone drops; workspace-edge "new panel from a
  dragged widget" (WidgetHost has it for live widgets) isn't wired for drag-out.
- **Committed** ROUND 17 on `layout-rework` (v0.8.13-beta); main-session live verify on fresh servers: row names untruncated everywhere, pencil/trash icon actions + drag grips present, mobile preview = real 400×820 centered frame w/ phone UI, desktop restore OK. Known pre-existing: firefox 06-persistence flake (fails on base 03d041c too) → AXIS-28.

## ROUND 18 — Drawer drag unification + row anatomy (operator review 2026-07-12)

Operator review of round 17 (AXIS-29):
1. Page drag&drop in the drawer FEELS DIFFERENT from every other drag in the
   app. That contradicts the axis-workbench framework goal — interactions get
   built ONCE. Page reorder must ride the same shared machinery (DragLayer
   ghost at grab offset + in-flow dashed slot), extracted/generalized, not a
   bespoke second implementation.
2. The name chips in Pages/Widgets rows (background + border) look squeezed —
   label needs breathing room (or drop the chip look).
3. Pencil/trash icons trail directly behind the name, ragged per row — they
   belong in a consistent right-aligned column, same position on every row.

## ROUND 18 — implementation (2026-07-12, Agent 5)

Base 5524669 on `layout-rework`. Uncommitted; main session reviews + commits.

**Plan (before coding):**
1. *Unify page reorder onto the shared drag machinery.* The R17 page reorder was
   a bespoke session (no DragLayer ghost, drop-time-only index). Route it through
   the SAME `controller.drag` state the widget/zone drags use, so the DragLayer
   ghost + in-flow dashed slot + 5px threshold all light up identically.
   - `drag.ts`: new `kind:'list'` drag variant (listId/itemId/size/grabOffset/
     ghostEl/orientation/listInsert), shared `DRAG_THRESHOLD` const, pure
     `listReorderInsertIndex` (hit-test EXCLUDING the dragged item → the exact
     index `page.move` filter-then-splice wants).
   - New `dragSession.ts` `beginPointerDrag` — the extracted pointer-session core
     (threshold → activate → move → drop), used by BOTH `libraryDrag.ts` (drag-out)
     and the new `listReorderDrag.ts` (`startListReorder`, clones the grabbed row
     for a generic DragLayer ghost).
   - `DragLayer.svelte`: render a generic cloned-node ghost for `kind:'list'`.
   - `WorkbenchLibraryDrawer.svelte`: page reorder via `startListReorder`; splice
     the in-flow dashed slot into the page list flow (mirrors WidgetZone `zoneSlot`).
   - `WorkbenchHost.svelte`: `class:aw-dragging-list`.
2. *Row anatomy* — give labels breathing room, right-align icon column identically
   across Pages/Widgets/Layouts (grid the row so the action column has a fixed x).
3. Keep search / drag-out / icon actions / rename / preview working.

**Done — what shipped:**

*Task 1 — unified drag.* New generic list-reorder primitive, sharing the SAME
machinery as every other drag:
- `drag.ts`: `kind:'list'` drag variant + shared `DRAG_THRESHOLD` (5) + pure
  `listReorderInsertIndex` (hit-test EXCLUDING the dragged row → the exact index
  `page.move` filter-then-splice wants). +3 unit cases in `test/drag.test.ts`.
- `dragSession.ts` (NEW): `beginPointerDrag` — the pointer-session core (threshold
  → activate → stream moves → drop/tap), extracted from the drag-out code. Now
  used by BOTH `libraryDrag.ts` (`startWidgetDragOut`/`startPanelDragOut`,
  refactored onto it — behaviour unchanged, guarded by the drag-out e2e) AND the
  new primitive. (WidgetHost's in-layout widget drag stays inline — it interleaves
  group/zone/edge hit-tests mid-move — but uses the same `DRAG_THRESHOLD` +
  `pointerDistance` + the same `controller.drag` DragLayer/slot pipeline.)
- `listReorderDrag.ts` (NEW): `startListReorder` — clones the grabbed row for a
  generic DragLayer ghost, drives `controller.drag` with `listInsert`, commits via
  `movePage`.
- `DragLayer.svelte`: renders a generic cloned-node ghost (Svelte action mounts
  the clone; scoped-style attrs ride along so it renders styled) for `kind:'list'`,
  anchored at the grab offset like the widget ghost; "Reorder" chip.
- `WorkbenchLibraryDrawer.svelte`: page reorder now calls `startListReorder`; the
  in-flow dashed `.aw-lib-slot` is spliced into the page list (mirrors WidgetZone
  `zoneSlot`/`slotPos`), the dragged row lifts (`display:none`). Slot height ==
  lifted row height keeps the flow neutral (no measure-feedback loop → live
  hit-testing, unlike R17's drop-time-only index).
- `WorkbenchHost.svelte`: `class:aw-dragging-list`.

*Task 2 — row anatomy.* Root cause of the "squeezed chip" + ragged icons: the
generic `.aw-lib-row button` rule (0,1,1) beat `.aw-lib-page-open`'s own
`border:0/background/flex` (0,1,0), so the page name sat in a bordered chip AND
the body never expanded → meta + icons trailed the name. Fixed by scoping
`.aw-lib-row button.aw-lib-page-open` (0,2,1): plain label, flex:1. Icon actions
wrapped in a fixed-width (`102px`) right-aligned `.aw-lib-actions` /
`.aw-lib-row-actions` column so rename/export/delete sit at the SAME x on every
row across Pages/Widgets/Layouts (delete always far-right). Layout drawer widened
336→348 to match. Rows: min-height 42→48, label 12.5→13px, more padding.

**Gates (all green):** `npm run check` 0 errors / 0 warnings (1127 files);
`npm test` **824** (was 821; +3 `listReorderInsertIndex`); `npm run test:e2e`
**72/72** on BOTH browsers this run (incl. the firefox 06-persistence
"rearrangement survives a reload" flake — passed here; still AXIS-28, not ours).
`13-customize-drawer` page-reorder case rewritten to assert the shared path
(`.aw-root.aw-dragging-list` + `.aw-drag-list-ghost` + `.aw-lib-slot`). Live
:5173 visual verify (fresh tab, non-mutating): Pages rows = plain labels, aligned
icon column matching the panel rows, breathing room. Uncommitted; main session
reviews + commits + bumps.

**Open follow-ups (Backlog candidates):**
- `dragSession.ts` has no unit test (needs DOM/PointerEvent — vitest is node-env);
  covered by the drag-out + page-reorder e2e instead.
- WidgetHost's in-layout widget drag was intentionally NOT folded onto
  `beginPointerDrag` (mid-move hit-test interleaving) — a future pass could
  generalise `beginPointerDrag` with an `onMove`-returns-state shape and adopt it
  there too for full single-source drag lifecycle.
- The list-reorder primitive is only wired to the page list today; the hidden-nav
  / saved-template lists still reorder by their existing means (they don't reorder).
- **Committed** ROUND 18 on `layout-rework` (v0.8.14-beta); live verify: plain labels (no chip border), icon column at identical x across all rows, 7 page grips; unified drag path e2e-asserted (aw-dragging-list + generic ghost + in-flow slot).

## ROUND 19 — Param-control panels (operator review 2026-07-12, AXIS-30)

Operator tried dragging parameter CONTROLS out of the Block Editor:
1. The dragged controls have NO name — you can't tell what they are.
2. Every drop auto-creates a NEW TAB named after the parameter ("Drive 1",
   "Gain 1", "Bass 1") — one tab per param makes no sense. The point is to
   COLLECT the most important parameters of different blocks in ONE panel
   and ARRANGE them there.
3. They look nothing like the Block Editor controls. They should be
   widget-like, but need a display mode with the Block Editor's square
   control tiles — the current small ones are useless on mobile/touch.
4. Expected: drag the control INTO a panel and arrange it there like
   widgets; SAME color coding as the source block's controls in the Block
   Editor; hover/click tooltip shows the source block ("Amp 1", "Drive 1").

## ROUND 19 — implementation (2026-07-12, Agent 6)

Base 92e0982 on `layout-rework`. Uncommitted; main session reviews + commits + bumps.

### Exploration — what the current param drag-out did

- **Drag source** = `ControlSurface.svelte`. A pinnable control tile
  (`pinnable()`: cont/toggle/select, id≥0) is `draggable` and `ondragstart`
  writes an HTML5 `dataTransfer` payload: MIME `application/x-workbench-parameter-source+json`
  = a serialized `WorkbenchParameterSource` built by
  `axisParameterSourceFromEditorParamId` (`axisParameterSources.ts`). There is
  ALSO a touch/right-click path (`onPinContextMenu`/`onPinLongPress`) that opens a
  ContextMenu from `buildAxisPinMenuItems` (`pinMenu.ts` + `pinTargets.ts`) listing
  existing custom panels + "New custom panel", routed through
  `AXIS_PIN_SELECTED_PARAMETERS_ACTION`.
- **Two drop landing zones existed and DOUBLE-FIRED.** `AxisCustomPanel.svelte`
  had its own `ondrop` that appended a widget into the panel's zone
  (`createParameterWidgetCommand`) — good — but it did NOT `stopPropagation`, so
  the event bubbled to `DockWorkspace.svelte`'s workspace-level `ondrop`
  (`WORKBENCH_PARAMETER_SOURCE_EDGE_DROP_ACTION`) which ALWAYS ran
  `createCustomPanelFromParameterSourcesCommands` → **a brand-new panel/tab per
  drop**. And with no existing custom panel present, every drop hit only the
  workspace handler → new tab every time, titled after the param
  (`titleForSources` → single source's `.label`, i.e. "Drive 1"/"Gain 1"). That is
  exactly the operator's complaint #2.
- **Widget render** = `AxisWorkbenchWidget.svelte` `kind === 'paramControl'` branch:
  a small horizontal chip (24px ring + value); the param NAME only showed at
  `expanded` (default) size → invisible in compact/mini (complaint #1). `paramColor`
  was already read from `widget.state.color` but **nothing ever populated it** →
  always `var(--accent)` (complaint #4). Binding states (T11 live/readonly/missing,
  `paramWidgetState.ts`), live value edit (pointer-drag/wheel), and read-only
  click-to-open were all present and are preserved. There was no tile look
  (complaint #3). Block color coding lives in `catalog.ts` (`catFor(pack,base).accent`)
  and the Block Editor's control tiles are `.restile` (118×112, `.dialwrap` 60px
  knob + `.lbl`); design `AxisWidget.dc.html` already specifies `paramColor`,
  `paramSub`, and a `.axtip` hover tooltip (`block · label`) — the port had dropped
  colour + tooltip.

### What shipped

1. **Collect, don't spawn tabs.** `AxisCustomPanel` drop now `stopPropagation()`s
   (dragover + drop) so the workspace edge-drop can't also fire → dropping onto a
   panel appends into THAT panel, period. The workspace edge-drop
   (`createAxisParameterSourceEdgeDropAction`) now COLLECTS: pure
   `axisCollectPanelId(doc, region)` prefers a custom panel already in the dropped
   region, else the sole custom panel, else null → a fresh panel. Fresh collect
   panels get the generic renamable title **"Controls"** (`titleForSources()` no
   longer names after the param; explicit `title` args e.g. the pin-page path still
   win). The menu/touch pin path already appended when a `panelId` was chosen; it
   now shares the `appendSourcesCommands` helper and the same "Controls" default.
2. **Arrange = shared machinery, unchanged.** Collected controls are ordinary
   widgets in the panel's `WidgetZone` (grid variant), so they reorder/arrange via
   the SAME WidgetHost drag surface + `controller.drag` pipeline as every other
   widget (round-18 lesson: reuse, don't reinvent). No new drag code.
3. **Identity.** `axisParameterSources.ts` now computes the source block's category
   accent (`axisBlockAccent` → shared `catFor`/`baseName`) and stows it in the
   source `state.color` (presentation only — NOT in the identity `binding.target`).
   The widget reads it into `--param-color`. Name is now shown at every size except
   mini. A control-surface-style `.axtip` hover/focus tooltip renders
   "`Block · Param`" (plus `title`/`aria-label` for a11y).
4. **Block-editor tile mode.** New `param-tile` display: a touch-friendly square
   (min 92×84, compact 76×72) column — bigger knob ring (42/34px), value, name —
   bordered/backed with the block accent so ownership reads at a glance. It's the
   DEFAULT when a pinned param lives in a custom panel (`isPanelWidgetZone(widget.zone)`),
   and falls back to the compact horizontal chip in bars/rails (where a tall tile
   won't fit) and at mini size. `state.display` (`'tile'`|`'ring'`) overrides the
   per-context default (no toggle UI yet — see follow-ups). The existing default/
   compact/mini size menu scales the tile (item 4's "size options the widget menu
   already offers"). `defaultSize` for new pinned params is now `'default'` (the
   full touch tile).
5. **Feature-keep.** T11 binding states, live value edit, read-only lock/missing
   badges + click-to-open all intact. Old per-param custom panels keep loading
   (schema unchanged; a persisted param widget with no `state.color`/`display`
   simply renders tile-in-panel with the accent fallback). ControlSurface's ∿
   modifier badge (source side) untouched.

### Files changed
- `axisParameterSources.ts` — `color` on source inputs + `axisBlockAccent` + `state.color`; `defaultSize: 'default'`.
- `axisParameterActions.ts` — `axisCollectPanelId` + `appendSourcesCommands`; edge-drop collects; "Controls" default title; `AXIS_CUSTOM_PANEL_TYPE`/`AXIS_CONTROLS_PANEL_TITLE` exports.
- `panels/AxisCustomPanel.svelte` — `stopPropagation` on param dragover/drop.
- `widgets/AxisWorkbenchWidget.svelte` — tile render + name-always + `--param-color` + `.axtip` tooltip + `param-tile` CSS + `isPanelWidgetZone` import.
- Tests: `test/axisParameterSources.test.ts` (+color/defaultSize case), `test/axisParameterActions.test.ts` ("Controls" title + edge-drop collect case), new `e2e/15-param-collect.spec.ts` (drop-collect + identity/tile/colour/tooltip + arrange surface).

### Gates
- `npm run check` — **0 errors / 0 warnings** (1127 files).
- `npm test` — **826** (was 824; +2: colour-propagation + edge-drop-collect).
- `npm run test:e2e` — **75 passed / 1 failed**; the one failure is the KNOWN
  pre-existing firefox `06-persistence` "rearrangement survives a reload" flake
  (AXIS-28), not this round. New `15-param-collect` (×2) passes on BOTH browsers;
  `09-custom-panel` still green after the AxisCustomPanel change.

### Open follow-ups (Backlog candidates)
- **No tile/ring toggle in the widget menu.** The per-context default + `state.display`
  cover it, but there's no UI to flip a placed control between tile and ring (and
  no generic per-widget-type menu-contribution seam in `WorkbenchRenderRegistry`
  yet — round-16 noted the same gap). Add `registerWidgetMenu` if params (or other
  widgets) gain real per-widget settings.
- **Live block colour** is captured at pin time (persisted in `state.color`); if a
  preset swap changes the block in that slot, the tile keeps the original hue.
  Re-deriving live would need the widget to know the bound block's pack even when
  the block isn't open.
- **Edge-drop collect heuristic** picks the region-matched panel, else the sole
  custom panel, else new. With ≥2 custom panels in different regions, an empty-space
  drop in a region with none makes a fresh "Controls" — intended, but worth an
  operator sanity-check on the live rig (drag-into-panel is the primary path).
- Operator/visual pass (AXIS-22) on the live FM3: real drag from the Block Editor
  into a docked Controls panel, tile legibility + touch size on the phone profile,
  and the `.axtip` under a `position:fixed` preview frame (round-17 follow-up: fixed
  overlays attach to the window, not the preview frame).
- **Committed+pushed** ROUND 19 on `layout-rework` (v0.8.15-beta).

## ROUND 20 — Param-control drag-out state bugs (operator review 2026-07-12, AXIS-31)

Operator findings on the fresh round-19 feature:
1. The dotted border on a dragged-out control does NOT wrap the whole tile.
2. The "Dock Left" drop overlay STAYS after dragging a control out — only a
   reload clears it (drag-end cleanup missing on some path).
3. After reload — and sometimes after leaving customize — the controls sit
   in a weird drag/drop-looking state although customize is OFF. Seems
   correlated with no block being selected.
4. Pinned controls appear to depend on Block-Editor selection. Unnecessary:
   the grid blocks' quick controls work without any block open — pinned
   panel controls must be fully live regardless of selection.

## ROUND 20 — implementation (2026-07-12, Agent 7)

Base 314105a on `layout-rework`. Uncommitted; main session reviews + commits + bumps.

### Root causes (reproduced from code + the running :5173 workbench + live FM3 /api)

1. **Ghost outline too small.** The drag SOURCE (a `.card`/`.restile` tile in
   `ControlSurface.svelte`) never set a drag image, so the browser used its default:
   a snapshot of the dragged node **clipped to the on-screen portion** of it. Inside
   the scrolling control grid that clipped the ghost to a fraction of the tile — the
   "dotted outline that doesn't wrap the whole tile". Nothing in round 19 touched the
   source, so this predates it; the bigger tiles just made the clip obvious.
2. **Stale "Dock left" overlay.** `DockWorkspace.svelte` cleared its `edgeDropRegion`
   (the `.aw-edge-drop-preview` region overlay) only in `ondragleave` and its OWN
   `ondrop`. Round 19 made `AxisCustomPanel` `stopPropagation()` the drop so it can
   claim it — which means the workspace's `ondrop` never fires when the drop lands on
   a panel, so the overlay was never cleared. Escape-cancel and drop-over-non-target
   had the same gap. Only a reload reset it. `AxisCustomPanel`'s own
   `parameter-drag-hover` wash had the identical hole (Escape-cancel while hovering).
3. **Drag/drop-looking controls with customize OFF.** The T11 `readonly` and `missing`
   binding states rendered with `border-style: dashed` — the exact look of a drag
   slot. After a reload no block is open, so EVERY in-preset pinned control resolved to
   `readonly` (block exists but not the open block) → all dashed → "weird drag state",
   perfectly correlated with "no block selected".
4. **Selection dependency.** The widget read live values ONLY from `editor.params`/
   `editor.enums`, which are populated for the OPEN block alone. Bound-but-not-open →
   no data → `--` value, ring stuck at 0.5, edits disabled. The grid quick controls
   dodge this by reading `editor.meters` (a background per-block read, no block open);
   pinned params weren't wired to any equivalent.

### What shipped

1. **Full-tile drag image (bug #1).** `ControlSurface.onWorkbenchParameterDragStart`
   now clones the dragged tile off-screen at its full client box and hands it to
   `dataTransfer.setDragImage`, so the ghost always wraps the whole control regardless
   of scroll clipping. Guarded for environments without `setDragImage`; clone removed
   on the next tick after the spec's synchronous snapshot.
2. **Overlay cleanup on every drag end (bug #2).** Both `DockWorkspace` and
   `AxisCustomPanel` add a window-level `dragend` + `drop` listener (via `$effect`)
   that clears their hover state. `dragend` fires on the drag source and bubbles to
   the window on drop-anywhere, Escape-cancel, and release-over-non-target — the one
   reliable clear point the panel's `stopPropagation()` can't hide.
3. **Always-live pinned controls (bug #4).** New on-demand hydration in
   `editor.svelte.ts`: a mounted `axis.paramControl` widget calls
   `editor.registerPinnedBlock(effectId)` (ref-counted); a debounced `#hydratePinned()`
   fetches `blockParams(eid)` for each pinned block that is placed but NOT open and
   stashes the same `{ named, enums }` DTO the open block uses into `pinnedParams`
   (invalidated on every preset/scene reload; skipped on a slow MIDI link). The widget
   reads through `editor.pinnedView(effectId)` (open block's arrays, else the hydrated
   copy) and writes through `setPinnedParam`/`setPinnedEnum` (by effectId, optimistic +
   `forgefx.setParam`, history-recorded), which delegate to the normal `setParam`/
   `setEnum` when the block IS open. `resolveParamWidgetState` gained `hasLiveData` →
   an in-preset hydrated block is `live` (editable), not `readonly`.
4. **Clean resting state (bug #3).** With bug #4, in-preset controls are `live` (no
   dashed border). The residual `readonly` (brief pre-hydration flash / slow-link
   fallback) and `missing` states were re-styled `border-style: solid` (chip + tile)
   so a resting control is never mistaken for a drag/drop slot. `readonly` keeps its
   lock badge + click-to-open; `missing` keeps its amber warn badge, now clearly
   "unavailable" rather than an empty slot.

### Files changed
- `src/lib/ControlSurface.svelte` — `setFullTileDragImage()` off-screen clone in the param dragstart.
- `src/lib/workbench/svelte/DockWorkspace.svelte` — window `dragend`/`drop` clears `edgeDropRegion`.
- `src/lib/axis-workbench/panels/AxisCustomPanel.svelte` — window `dragend`/`drop` clears `parameterDragHover`.
- `src/lib/editor.svelte.ts` — `pinnedParams` state + `registerPinnedBlock`/`pinnedView`/`#hydratePinned`/`#invalidatePinned`/`setPinnedParam`/`setPinnedEnum`; invalidate in `load()` + `#refreshScene()`.
- `src/lib/axis-workbench/widgets/paramWidgetState.ts` — `hasLiveData` input → `live` for hydrated in-preset blocks.
- `src/lib/axis-workbench/widgets/AxisWorkbenchWidget.svelte` — read via `pinnedView`, register hydration, write via `setPinned*`, `hasLiveData` into the state resolver, readonly/missing borders → solid.
- Tests: `test/paramWidgetState.test.ts` (+4 hasLiveData cases), `e2e/15-param-collect.spec.ts` (+overlay-clears-after-drop, +no-drag-affordance/solid-border-outside-customize).

### Gates
- `npm run check` — **0 errors / 0 warnings** (1127 files).
- `npm test` — **830** (was 826; +4 paramWidgetState hasLiveData cases).
- `npm run test:e2e` — **80 passed / 0 failed** (was 76 = 38×2; +2 new cases ×2 browsers).
  The known firefox `06-persistence` flake (AXIS-28) passed this run too.

### Open follow-ups (Backlog candidates)
- **Live value/edit on the physical FM3 (bug #4)** is verified by types + unit + e2e
  and confirmed at the API level (`/preset/blocks/:eid/params` + `/preset/meters`
  return the data for unselected blocks), but NOT driven end-to-end on the rig: the
  e2e/dev backend serves the shared workbench doc, so injecting a real pinned control
  persistently would pollute the operator's layout. Fold a "drag a real control into a
  Controls panel, leave it unselected, confirm live value + editability + per-scene
  refresh" check into the AXIS-22 live-rig pass.
- **Enum pinned controls on a slow link** stay `readonly` (hydration skipped) — click
  opens the block. Acceptable; revisit if slow-link users pin many discretes.
- **Hydration is per mounted widget**, invalidated wholesale on preset/scene reload —
  fine for a handful of pinned params; if panels grow large, batch the `blockParams`
  reads or reuse a single preset-params sweep.
- **Committed+pushed** ROUND 20 on `layout-rework` (v0.8.16-beta).

## ROUND 21 — Drop-target UX (operator review 2026-07-12, screenshots, AXIS-32)

Operator findings, valid for ALL drag types (panels, widgets, controls):
1. "DOCK LEFT" region indicator is a small box — it should highlight the
   WHOLE region frame (the full drop area / window).
2. Dragging onto a panel's TAB BAR should create a NEW TAB at that spot.
3. Dragging over an EXISTING tab should switch to it (spring-loaded) so the
   drag can continue into that panel's content.
4. The dashed customize outline around widget tiles is STILL smaller than
   the tile (screenshots: line cuts through the Gain/Drive/Bass tiles) —
   round 20 fixed the drag GHOST, not the in-place outline. Must wrap the
   full tile at every size.

## ROUND 21 — implementation (2026-07-12, Agent 8)

Base 7115fdd on `layout-rework`. Uncommitted; main session reviews + commits + bumps.

### Root causes (from code + design `Axis Layout System.dc.html`)

1. **Small "DOCK LEFT" box, not a region highlight.** Two edge-drop worlds each
   drew a *small band on the edge* instead of the full region: the parameter
   (HTML5) drag → `DockWorkspace` `.aw-edge-drop-preview` CSS was `width:min(24%,220px)`
   (L/R) / `height:min(22%,150px)` (T/B) / `inset:18%` (main); the widget
   pointer drag → `WidgetHost.workspaceEdgeDropAt` returned the same 24%/22% rect
   as the DragLayer `previewRect`. Design's dock preview (`dropStyle`) fills the
   WHOLE region rect (L/R = full height × region width, T/B = full width × region
   height, main = whole main).
2. **Tab-bar drop always appended, no "at that spot".** Panel drag `panelDropIntentAt`
   returned `{kind:'tab', tabStackId}` with NO index → `insertPanelIntoTab` appended.
   And a parameter dropped on a tab bar wasn't handled at all — it bubbled to the
   workspace edge-drop (collect/new-panel-in-region), never "a new tab here".
3. **No spring-loading.** Nothing activated an inactive tab under a hovering drag,
   so a panel that was a background tab could never be dropped into.
4. **Outline clipped to the grid row.** Custom panels render widgets in a
   `variant="grid"` `WidgetZone` with `grid-auto-rows: <rowHeight>` (default 42px)
   and `align-items: stretch`. A param-control **tile** is `min-height:92px`, so
   the host was stretched to the 42px row while the tile overflowed it; the
   drag-surface dashed outline (`inset:0` of the host) was 42px and cut straight
   through the 92px tile. Round 20 fixed the drag GHOST (a `setDragImage` clone),
   not this in-place host box.

### What shipped

1. **Full-region highlight (directive #1).** New shared pure helper
   `defaultRegionBand(region, workspaceRect)` (+ DOM wrapper `fullRegionHighlightRect`)
   in `workbench/svelte/drag.ts`: prefers the LIVE docked `[data-region]` rect so
   the highlight exactly wraps the region on screen, else a full-cross-axis band on
   the target edge (L/R full height × ~clamp(28%,180..340) width; T/B full width ×
   clamp(32%,140..260) height; main = whole workspace). BOTH edge-drop worlds use it:
   `WidgetHost.workspaceEdgeDropAt` returns the full rect (rendered by the existing
   DragLayer `previewRect`), and `DockWorkspace` positions `.aw-edge-drop-preview`
   from the measured rect (inline geometry; CSS now only carries the look — dashed
   accent frame, label anchored top-left, `position:fixed` to match the DragLayer).
2. **Tab-bar drop = new tab at the spot (directive #2).** `TabStack.tabInsertIndexAt(x)`
   hit-tests the pointer against the tab pills' midpoints (shared `widgetDropIndex`);
   `panelDropIntentAt`/`panelPreviewAt` now carry that index (reducer's
   `insertPanelIntoTab` already honours `target.index`) and the tab preview
   highlights the HEADER strip (tab bar), not the whole body. Parameter drops: the
   `TabStack` header now accepts the `x-workbench-parameter-source` MIME
   (`ondragover`/`ondrop`, `stopPropagation` so the workspace edge-drop can't also
   fire) and runs `WORKBENCH_PARAMETER_SOURCE_EDGE_DROP_ACTION` with
   `{tabStackId, index}`; the Axis action (`axisParameterActions.ts`) branches on
   `tabStackId` → creates a NEW "Controls" panel targeted `{kind:'tab', tabStackId,
   index}` (rather than collecting).
3. **Spring-loaded tabs (directive #3).** One shared 500ms dwell timer in `TabStack`
   drives both worlds: a `$effect` on `$controller.drag.pointer` handles the
   pointer-based panel/widget/list drags (hit-tests the header's `[data-panel-tab]`
   pills), and the header `ondragover` handles the HTML5 parameter drag. Dwell
   survives jitter over the SAME tab (only a different tab / leaving the header
   resets it), never springs the already-active tab, cancels on drag end / unmount.
   On elapse → `panel.activate`, revealing the panel content so the drag continues
   into it.
4. **Outline wraps the tile (directive #4).** `WidgetZone` grid: `grid-auto-rows`
   → `minmax(<rowHeight>, auto)` (the row-height is a floor, not a cap, so a tall
   tile's row grows to it) and grid `align-items: stretch` → `start` (a short chip
   sharing a row with a tall tile keeps a tight box, not stretched). The host now
   wraps the full rendered tile at every size, so the `inset:0` drag-surface
   outline wraps it too. This also fixes the pre-existing visual bug of tiles
   overflowing their 42px cells.

### Semantics chosen for non-panel tab-bar drops
- **Parameter control → tab bar:** creates a NEW "Controls" custom panel as a tab
  at the pointer index in that stack (then further controls collect into its body).
- **Widget → tab bar:** NOT special-cased. A widget isn't a panel; the tab header
  is not a `[data-zone]`, so a widget released there falls through to the existing
  workspace edge-drop (new custom panel in that region) — unchanged behaviour.

### Files changed
- `src/lib/workbench/svelte/drag.ts` — `defaultRegionBand` (pure) + `fullRegionHighlightRect` (DOM).
- `src/lib/workbench/svelte/WidgetHost.svelte` — `workspaceEdgeDropAt` → full-region rect.
- `src/lib/workbench/svelte/DockWorkspace.svelte` — `edgeDropRect` state; full-region preview geometry + restyle.
- `src/lib/workbench/svelte/TabStack.svelte` — tab insert index + tab-bar preview; parameter-source header drop; shared spring-loaded dwell; `data-panel-tab`.
- `src/lib/workbench/svelte/WidgetZone.svelte` — grid `minmax(row,auto)` rows + `align-items:start`.
- `src/lib/axis-workbench/axisParameterActions.ts` — edge-drop action honours `{tabStackId, index}` → new "Controls" tab.
- Tests: `workbench/svelte/test/drag.test.ts` (+`defaultRegionBand` cases), `axis-workbench/test/axisParameterActions.test.ts` (+tab-bar new-tab case), `e2e/15-param-collect.spec.ts` (+4 AXIS-32 cases: full-region highlight, tab-bar new tab, spring activation, outline-wraps-tile).

### Gates
- `npm run check` — **0 errors / 0 warnings** (1127 files).
- `npm test` — **834** (was 830; +3 new cases: `defaultRegionBand` geometry ×3 +
  param tab-bar new-tab action).
- `npm run test:e2e` — **87 passed / 1 failed**; the one failure is the KNOWN
  pre-existing firefox `06-persistence` "rearrangement survives a reload" flake
  (AXIS-28), not this round. All 8 new AXIS-32 runs (4 cases × chromium+firefox)
  pass; `03-dock` (panel tab drag/switch) still green after the tab-index change.

### Open follow-ups (Backlog candidates)
- **UI-scale (`zoom`) + the param edge preview.** `.aw-edge-drop-preview` is
  `position:fixed` at the measured viewport rect (exact at default scale, like most
  overlays). Under a non-1 UI-scale it can drift like the DragLayer did before its
  self-calibrating zoom compensation — fold in the same comp if scale users report drift.
- **Spring dwell tuning + reduced-motion.** 500ms fixed; no `prefers-reduced-motion`
  gate. Operator sanity-check on the live rig for feel (esp. touch).
- **Tab-bar drop index precision.** The panel-drag index counts all rendered pills
  incl. the dragged one (reducer clamps); same-stack reorder can be off by one.
  Cross-stack (the common case) is exact.
- Operator/visual pass (AXIS-22) on the live FM3: full-region highlight legibility,
  spring feel, tab-bar-drop discoverability, tile outlines on the phone profile.
- **Committed+pushed** ROUND 21 on `layout-rework` (v0.8.17-beta).

## ROUND 22 — Param drag ghost as compact chip (operator review 2026-07-12, AXIS-34)

Operator screenshot: the round-20 full-tile drag image is an OPAQUE block —
you cannot see the drop targets underneath. Directive: like the other
drags — a compact tooltip-style ghost (icon + param name, block accent,
translucent), consistent with the shared DragLayer chip language. Keep the
round-20 no-clipping property (ghost fully rendered).

### Implementation (Agent 9)

- **`src/lib/ControlSurface.svelte`** — replaced `setFullTileDragImage` (the
  round-20 opaque full-tile clone) with **`setParamChipDragImage(event, c, source)`**.
  It builds a compact tooltip-style chip OFF-SCREEN (`position:fixed; top/left:-10000px`,
  keeping T20's fully-rendered / never-clipped property) and hands it to
  `setDragImage`, anchored at `(14, 16)` so the pointer sits just inside the chip's
  leading edge:
  - **Size/shape:** 32px-tall pill, `padding 0 12px`, `gap 7px`, `max-width 220px`,
    `border-radius 8px` — matching DragLayer's `.aw-drag-ghost` language.
  - **Content:** an 18px kind glyph (`paramChipGlyph`) + the param name
    (`source.label`, ellipsised). Glyph recalls the control: knob dial for `cont`,
    toggle switch for `toggle`, list rows for `select`.
  - **Coloring:** block accent from `source.state.color` (falls back to the `accent`
    prop) tints the glyph + the border, so the dragged chip stays block-owned.
  - **Translucency:** `background:color-mix(--bg2 88% transparent)`, `opacity:0.9`,
    lift shadow `0 12px 30px rgba(0,0,0,.5)`, app tokens (`--bg2`/`--text`/`--font-ui`)
    resolved from `:root` since the chip mounts on `document.body`.
- **Coverage:** the ONLY HTML5 param drag source in the app is ControlSurface —
  both its plain tile grid (~line 1085) and its arrange-mode widget grid (~line 1214)
  funnel through `onWorkbenchParameterDragStart`, so the one function fixes both.
  Grid quick-controls carry no drag-image code; `AxisCustomPanel` is the drop TARGET
  (no `setDragImage`); the preset-browser `startDrag` handlers are a separate
  filter-condition feature, out of scope.
- **e2e:** `e2e/15-param-collect.spec.ts` fires synthetic `DataTransfer` drops and
  never inspects the native drag image (uninspectable via Playwright), so no e2e
  change was needed.
- **Gates:** `npm run check` 0 errors / 0 warnings (1127 files); `npm test` 834
  passed (83 files); `npm run test:e2e` 87 passed, 1 failed = the known
  firefox `06-persistence` flake (AXIS-28) only. No commit / no version bump.
- **Committed+pushed** ROUND 22 on `layout-rework` (v0.8.18-beta).

## ROUND 23 — Grid cable routing UX (operator review 2026-07-12, AXIS-35)

Operator findings (screenshot: …Cab→PEQ 1 …gap… PEQ 2 …gap… GEQ→Reverb):
1. Cable drag should span MULTIPLE columns: dragging from PEQ 1's output
   all the way to GEQ connects the whole path — blocks along the row get
   chained, empty cells get auto-filled with shunts. One drag, not one per
   adjacent pair.
2. Dropping a block onto an existing SHUNT replaces the shunt and wires the
   block in on both sides — no manual shunt removal first.
CONSTRAINT: implementation/tests against the mocked backend only — never
route-write to the live FM3 from tests; operator verifies on the rig.

### Findings (Agent 10, explore pass)

Routing architecture (all in the monolith Signal Grid, embeds into workbench too):
- **Grid model** (`grid.ts`): `Cell { row,col,kind:'block'|'shunt',effectId,fromRows[] }`.
  `fromRows` = rows of the PREVIOUS column that feed this cell → a cable is
  `(srcRow,srcCol) → (destRow,srcCol+1)` iff dest.fromRows includes srcRow.
  Cables are ALWAYS between adjacent columns; a signal across empty columns needs
  a SHUNT (routing pass-through cell, `effectId >= caps.shuntBase`, gen-3 = 1024)
  in each gap so an adjacent-column cable chain can carry it.
- **forgefx mutations** (`forgefx.ts`): `placeCell(row,col,blockId)` (1-indexed),
  `clearCell(row,col)` (= place blockId 0), `cable(srcRow,srcCol,destRow,connect)`
  (destCol implied = srcCol+1). `editor.#W = n=>n+1` converts 0-idx layout → 1-idx API.
- **Existing `editor.connect(src,destRow,destCol)`** already spans multiple columns
  and lays a UNIQUE-instance shunt per gap (FM-Edit requires unique shunt ids or the
  device dedupes). BUT it ERRORED ("Clear the cells in between") when an intermediate
  cell held a BLOCK — the operator wants those blocks CHAINED instead. Straight run
  along src.row; final hop bends to destRow (diagonal). Records a composite history
  step (undoable as one logical op).
- **`editor.move(src,row,col)`**: same-col preserves wires (re-cable), cross-col drops
  them (device default). Occupied targets rejected in SignalGrid `up()` with
  "Cell occupied" — this is where drop-on-shunt was blocked.
- **`editor.place(row,col,blockId,label)`**: add-block flow (palette → CommandPalette
  → `editor.place`). Only reachable from EMPTY cells today (shunt tap = remove).
- **Undo/redo** (`history.svelte.ts`): `recordComposite(label, ops[])` — ops executed
  forward, undone as inverses in reverse. `remove` op carries `inRows/outRows` so undo
  restores a cleared cell WITH its cables. This is exactly the machinery to batch a
  shunt-replace / multi-cable connect as ONE undoable step.
- **e2e reality**: the dev `:5056` backend is the operator's LIVE FM3. e2e MUST
  intercept `/api/preset/grid/**` (+ /device, /preset, /preset/blocks) so no write
  reaches the rig; browser sanity on :5173 stays read-only.

### Path algorithm chosen
- **planConnect** (pure, `gridRouting.ts`): straight run along src.row from src.col+1
  to destCol-1: empty cell → alloc+place shunt; existing block on src.row → CHAIN
  through it (no shunt, no error); existing shunt → reuse. Destination empty → place
  shunt. Then chain adjacent cables along src.row, final hop bends to destRow.
  Cross-row = shunts on src.row until destCol-1, single diagonal cable on the last hop
  (predictable; matches the pre-existing bend semantics). Blocks strictly off src.row
  in intermediate columns are left untouched (shunt routes around them on src.row).
- **planReplaceShunt** (pure): target holds a shunt → capture its inputs (shunt.fromRows)
  and outputs (col+1 cells fed from it); ops = [remove src (move only, carries its own
  wires for undo), remove shunt (carries shunt wires for undo), place block, re-cable
  inputs, re-cable outputs]. Preserves the shunt's exact topology onto the block. One
  composite step.

### Implementation (Agent 10, done)
Files changed:
- **`src/lib/gridRouting.ts`** (NEW) — pure `planConnect` + `planReplaceShunt` (RouteCell in →
  ops + preview data out). Type-only `HistoryOp` import so it stays node-testable.
- **`src/lib/gridRouting.test.ts`** (NEW) — 10 unit tests (gaps→shunts, chain-through-block,
  cross-row bend, occupied dest, unique shunt-id allocation, shunt-replace move/place/reject).
- **`src/lib/editor.svelte.ts`** — `connect()` now delegates to `planConnect` (chains blocks
  instead of erroring); new `replaceShunt()` + `#runOp` forward-executor + `get shuntBase`;
  `place()` and `move()` detect a shunt target and route through `replaceShunt`. All mutations go
  through the SAME forgefx calls + `history.recordComposite` → one undoable logical step each.
- **`src/lib/SignalGrid.svelte`** — drag preview: `dragTarget` tracked on pointermove; a `$derived`
  `connectPreview` (reuses `planConnect`) draws every planned cable + highlights new-shunt cells;
  `moveReplaceTarget` highlights a hovered shunt during a block-move; `up()` now lets a block DROP
  onto a shunt (only a real block target is still rejected as "Cell occupied").
- **`e2e/support/gridMock.ts`** (NEW) — in-memory ForgeFX backend: serves a synthetic 4×6 grid,
  captures `/preset/grid/cell` + `/preset/grid/cable` writes, aborts the SSE stream. Nothing reaches
  the live :5056 FM3.
- **`e2e/16-grid-routing.spec.ts`** (NEW) — both flows driven by pointer against the mock, asserting
  the exact captured mutations + the mid-drag preview.

Undo/batching: each flow records ONE `recordComposite` step; `remove` ops carry `inRows/outRows`
so undo restores cleared cells (shunt or moved block) WITH their cables — undo/redo is one gesture.

Gates (all green): `npm run check` 0 errors/0 warnings · `npm test` 844 passed (84 files, +10 new)
· `npm run test:e2e` 91 passed / 1 failed = ONLY the known firefox 06-persistence flake (AXIS-28,
unrelated: workbench-chrome persistence, untouched here); the 4 new routing runs (2 specs × chromium
+ firefox) all pass.

Needs rig verification (operator): drag-connect and drop-on-shunt were validated ONLY against the
mock. On the real FM3, confirm (a) chaining through an intermediate block wires output→input as the
device expects, (b) a placeCell over a just-cleared shunt cell adopts the re-issued cables cleanly,
and (c) the unique shunt-instance allocation still avoids the device dedupe on longer runs. Browser
sanity on :5173 was kept READ-ONLY (no live drops).
- **Committed+pushed** ROUND 23 on `layout-rework` (v0.8.19-beta). Rig-verify list (chain-through wiring, placeCell over cleared shunt, shunt-instance dedupe on long runs) in AXIS-35.

## ROUND 24 — ControlSurface renders editor-true DeviceLayout v2 (AXIS-36, Layer 3)

Cross-repo Layer 3: the ForgeFX feature branch on :5056 now serves a v2 layout per block
(`layout = { editorName?, family, variantName, variantValue, fw?, pinned?, pages:[{ name, pageNum?, fw?,
rows:[{ section?, controls:[{ label, paramName|null, paramId|null, widget, rawWidget?, placement?,
crossBlock?, fw? }] }] }] }`) and advertises `caps.editorLayouts:true`. The variant is chosen
server-side by the block's current type. This round makes the ControlSurface "Default" board consume it.

### Board-model extension chosen
`SurfaceWidget` (formerly the inline `Widget`) gains an optional **`row?: number`** = the source layout
row index; `SurfaceBoard` gains **`variantSig?: string`** (served-variant fingerprint). Both types moved
out of `ControlSurface.svelte` into the new pure module so the builder is node-testable. Free-arranged
(user) boards never set `row`, so they keep the existing gravity-packed free grid untouched — the
row-preserving path only engages when `widgets.some(w => w.row != null)`.

### Widget-view mapping (conservative — zero FM3 regression)
Every control first resolves to its live catalog entry by `paramId` (`k<id>` knob / `e<id>` enum); the
entry's own kind/default view is the baseline, and the layout's `widget` only REFINES the view. So a
control the migrated data left as `unknown` renders exactly as pre-v2.

| layout `widget` | resolves to | surface view |
|---|---|---|
| `knob` | live cont param | `knob` |
| `slider` | live cont param | `slider` |
| `number`/`readout` (cont) | live cont param | `number` |
| `dropdown` | live enum (>2 opts) | `select` |
| `toggle` | live enum (≤2 opts) | `switch` |
| `button` (enum) | live enum (≤2 opts) | `button` |
| `button` + bypass token (no live param) | `bypass` catalog entry | `action` |
| `meter` (no live param) | `meter` catalog entry (only if block reports a monitor) | `meter` |
| `graph`/`label` (no live param, EQ block) | `eq` catalog entry | `eq` |
| `unknown` / anything unmapped | catalog default | catalog default (knob/select/toggle) |
| `spacer` | — | gap: advances the row cursor, draws nothing |
| unresolved dropdown / label / null-param (non-EQ) | — | gap (same as pre-v2 silent-skip, keeps alignment) |

Row layout: within a page, controls place left→right (x += widget width; a control overflowing the
remaining cols wraps onto a new grid line); each source layout row starts on a fresh grid line below the
tallest widget of the previous row. Pages become tabs (duplicate names suffixed `Gate` / `Gate 2` — the
real FM3 INPUT block ships three pages all named "Gate"). Unreferenced catalog controls sweep onto a
trailing "More" page. Responsive narrow-width reflow uses `packRows` (row-preserving) for device boards,
the existing `packInto` for free boards.

### Re-seed on type change (variant)
`layoutVariantSig(layout)` = `family|variantName|variantValue|editorName|pageCount|controlCount`. The
built Default board stamps it; `reconcile` carries it through persistence; `loadProfileBoard` re-seeds
the **Default** profile from the current layout whenever the saved board's sig ≠ the live sig (a type
change flips the served variant → new sig → reseed). `variantSig` is also folded into the board-load
`$effect` signature (kept before `surfRev` so the existing `revChanged` `.pop()` still reads surfRev), so
a variant change re-runs the load. Blank/custom profiles have their own storage and are never reseeded.

### Cross-block + placement (scoped)
`LayoutCrossBlock` and `LayoutPlacement` are typed; cross-block controls with a live `paramId` are meant
to bind via the round-20 pinned machinery (`registerPinnedBlock`/`pinnedView`), else display-only. The
live FM3 layouts carry **no** crossBlock or placement data today, so the render path for them is not yet
wired — `placement` offsets are stored+ignored (documented later-polish, matches AXIS-36 acceptance) and
cross-block falls through to the display-only/gap path. **Follow-up when a device emits crossBlock
controls: wire the pinned-hydration render in the surface** (candidate AXIS backlog item).

### Files changed
- **`src/lib/types.ts`** — replaced v1 `LayoutControl`/`DeviceLayout` with the v2 shape
  (`LayoutWidget`, `LayoutCrossBlock`, `LayoutPlacement`, `LayoutControl`, `LayoutRow`, `LayoutPage`,
  `DeviceLayout` with `family`/`variantName`/`variantValue`/`fw`/`pinned`).
- **`src/lib/deviceLayoutBoard.ts`** (NEW, pure/UI-free) — `buildDeviceLayoutBoard(layout, catalog, cols)`,
  `layoutVariantSig`, `packRows`, plus the `SurfaceWidget`/`SurfaceBoard`/`BoardCtl` types.
- **`src/lib/deviceLayoutBoard.test.ts`** (NEW) — 11 unit tests (row placement, spacer gap, widget→view
  mapping, `unknown` no-regression, meter/bypass drop-when-absent, overflow wrap, dup slot, duplicate page
  names, More sweep, null-return, variantSig, packRows reflow).
- **`src/lib/ControlSurface.svelte`** — `Widget`/`Board` now alias the module types; `layoutBoard()`
  delegates to `buildDeviceLayoutBoard`; removed the inline v1 `keyForParam`/page walk; added `variantSig`
  derived, the Default re-seed in `loadProfileBoard`, variantSig in the load effect sig, `reconcile`
  carries variantSig, and row-aware `viewWidgets` via `packRows`.
- **`e2e/17-device-layout.spec.ts`** (NEW) — mocks a single Drive block whose params carry a v2 layout
  (no write reaches the live :5056), taps it, and asserts the surface mounts, the layout page becomes a
  "Drive" tab, knob labels render, dropdown→`.selfield` + slider→`.slbl`, and row 0 (Gain) sits above
  row 1 (Level). Note: forgefx.ts needed no change — the layout rides the existing `BlockParams` DTO.

### FM3 no-regression evidence
The catalog-first resolution means any control whose `widget` is `unknown` (or unmapped) uses the SAME
catalog entry + default view as before; spacers/unresolved controls become gaps exactly like the pre-v2
silent-skip. Unit test `unknown/unmapped widgets fall back to the catalog default` locks this. Verified
against the live FM3 INPUT block shape (`/preset/blocks/37/params`): knobs 0/1/2/3/5→knob, enums 4/9→
select, meter 8→meter (when a monitor exists), bypass 6→action, the 4 spacers push the Gain meter to the
right, and the three same-named "Gate" pages become `Gate`/`Gate 2`/`Gate 3`.

### Gates
`npm run check` 0 errors / 0 warnings · `npm test` **855 passed** (85 files, +11 new) · `npm run test:e2e`
new spec passes chromium + firefox in isolation; full-suite result recorded at commit time (known flake:
firefox 06-persistence = AXIS-28, unrelated). Version bump to 0.8.20-beta + commit are the main session's.
NEVER wrote a param value to the live FM3; dev servers on :5173/:5056 left running.
- **Committed+pushed** ROUND 24 on `layout-rework` (v0.8.20-beta) — chain complete: codec 753ba45 (v0.3.13) → ForgeFX a4030c6 (v0.6.6-beta, dev :5056 runs this branch) → Axis. Operator sees editor-true Default boards on next block open.

## ROUND 25 — Layout editor rework, slice 1: edit bar at the top of the window (AXIS-68, parent AXIS-67)

Branch `feature/ui-rework` (worktree `.wt-feature-ui-rework`, branched from `fix/pr93-bugfixes`).
Design source: the UI-rework layout-editor prototype (variant D, edit bar above the whole app).

### What changed
- **Edit bar replaces the ribbon overlay.**
  - `EditRibbon.svelte` → `EditBar.svelte`: one 36 px row across the full window, rendered in flow above the rail and top bar.
  - The app moves down by exactly the bar height and gets a 1 px accent outline (left/right/bottom).
  - Contents, left to right: CUSTOMIZE tag, Undo/Redo, PAGE ▾, LAYOUT ▾, profile control, Add ▾, status or error chip, ⋯ More, Done.
  - The separate Pages / ＋ Panel / Widgets / Layouts buttons are gone; their functions live in the menus.
  - The drawers stay reachable through "Manage pages and templates…", "Add widget…" and "Manage layouts…".
- **Overflow:** `editBarLayout.ts` (pure).
  - Width estimates per group, collapse order: status, tag, profile → dropdown, add, profile, layout, page.
  - Touch presentation at ≤ 760 px: 44 px controls, at most two rows, and the error chip takes the second row.
- **Menus as data:** `editBarMenus.ts`.
  - Host extension `editBar` (layout items + profile options) replaces the `ribbonExtras` snippet.
  - Axis supplies presets and Reset layout from `axisWorkbenchLayoutActions.ts`. The active kind is read from `settings.presetKind`, so the tablet/mobile seeds reset to themselves.
  - Applying or resetting a preset removes the replaced layout in the same undo step, unless another profile uses it.
  - Clicking the checked preset is a no-op.
- **ContextMenu:** drill-in submenus, radio rows, headers, inline confirm, inline input, anchored placement and an overlay z-band (239/240).
  - The activation and Escape logic is a pure state machine in `contextMenu.ts`.
  - Existing flat menus behave as before.
- **Shared layout actions:** `layoutActions.ts` holds save / apply / import (3 package kinds) / export / backups, used by both the bar and the Layouts drawer.
- **Shell (`WorkbenchHost.svelte`):**
  - Tokens and the theme class move to `.aw-viewport`. A new `.aw-stage` holds `.aw-root`.
  - The preview letterbox lives in the stage, and its label shows the rendered frame size.
  - The workspace padding hacks are removed, and the top safe-area inset is applied once.
- **Floating widgets:** `core/floating.ts` `resolveFloatingHeal` means entering or leaving Customize never persists a floating move; edit mode only clamps for display.
- **Shortcuts:** the undo/redo predicate is extracted as `layoutHistoryShortcut()`.
- **Removed:** `AxisProfileSwitcher.svelte` and `AxisLayoutPresetPicker.svelte` (folded into the extension).

### e2e
- `bootCleanWorkbench` now aborts every `/api/**` call at browser-context level, so specs never reach a real device. Page-level mocks (16/17/18, workbench config 404) still win.
- Specs 02/07/09/13/14/15 and the README are adapted.
- New spec `19-edit-bar.spec.ts` (16 tests):
  - geometry and shift
  - menus
  - delete confirm with undo
  - rename and duplicate
  - presets
  - export/import round-trip
  - backup restore
  - Add menu
  - profile
  - no console errors
  - touch rename error
  - 1100/834/390 widths

### Gates
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 1666 passed (122 files; baseline 1576 / 118).
- Chromium e2e, full suite: 67/67.
- Firefox e2e: not run. The Playwright firefox build is not installed on this machine.

### Open (picked up in slice 2)
- At 390 px the open PAGE menu partly covers the error row after a rejected rename. The menu should re-place when the bar height changes.
- A menu whose trigger detaches without a resize keeps a stale anchor. Not reachable today.

## ROUND 26 — Layout editor rework, slice 2: visible dock zones, lift-on-drag, edge docks, page drops, panel menu (parent AXIS-67)

Branch `feature/ui-rework` (worktree `.wt-feature-ui-rework`). Design source: the layout-editor prototype (`startPanelDrag` / `_hit` / `_zoneRects` / `_minus` / `_ghostPos`, the drag overlay, the panel menu, maximize, collapse).

### What changed
- **Lift on drag (generic).**
  - `core/dockTree.ts` holds the ONE removal (`removePanelFromNode`, `removePanelFromDock`, `liftPanelFromDock` / `liftPanelFromPage`). The reducer uses it; so does the preview.
  - Controller: transient `liftedPanelId` (never persisted, never in history; cleared by `setDrag(null)`, leaving edit mode, cancel) and a memoized `renderedPage`. DockRegion / DockNode / TabStack render from it, so the dragged panel's slot collapses the moment the drag activates.
  - The lift keeps one-child splits (`preserveSplits`): same geometry as the reducer's removal, but neighbours keep their node ids and are not remounted on drag start / cancel.
- **Targets: `svelte/dockDropTarget.ts` (pure).** Nav pages first (current page refused) → 24px edge strips → stacks (tab bar = tab at index; collapsed or `< 200×150` = "Add as tab" only; else five zones, 8px inset, 25% bands, 6px gaps, rim = nearest band) → empty regions. `dockDropCommand` maps every target to ONE `panel.move`; `landingRect` is the exact post-drop rect (split = half the stack incl. the 4px handle, tab = whole stack / expanded rect of a collapsed one, empty region = its band, occupied region = outer half).
- **Overlay: `DockDropOverlay.svelte` + `svelte/dockDropOverlay.ts` (pure model).** One opaque landing shape with its label + panel name; the other zones as faint dashed boxes clipped around it (`rectMinus`); four 8px edge bars (the active one replaced); nav page highlight (accent / danger "Already on this page"); a pointer card placed by `ghostPosition` so it never covers a label. Rendered from DragLayer with its zoom compensation. The old per-region `::after` drag labels are gone.
- **Sessions: `svelte/panelDrag.ts`.** Measures the lifted DOM every move. Release over nothing or Escape cancels (toast "Drag cancelled"); one drop = one dispatch = one undo step. `dragSession.ts` gained `cancelOnEscape`.
- **Drop on a nav page:** `panel.move` takes an optional `pageId` (the target page's dock, active page unchanged, `missing-page` on an unknown page). Toast "Moved <panel> to <page>". Nav entries carry `data-nav-page`.
- **Panel menu / header (TabStack, model in `svelte/panelChrome.ts`):** Move to ▸ (docks, Main, one "Page: <label>" per other page) · Maximize/Restore · Collapse/Expand · Save To Library · Close Panel.
  - Maximize: transient `maximizedPanelId`, header button ⤢/⤡, double-click a tab, Escape restores when no menu/drawer/drag owns the key. The stack's own DOM is lifted with `position: fixed` over the measured workspace (no remount). Cleared on page switch / when the panel leaves the page.
  - Collapse: a stack whose active panel is collapsed is a 36px labelled strip (rotated in a horizontal split); siblings take the space (`svelte/dockLayout.ts` flex sizes). A fully collapsed side region shrinks to its strips; a collapsed main pins them to its top. Click (or right-click for the menu) on the strip.
- **Library drag-out** uses the same targets and overlay (no lift, no pages); `instantiatePanelTemplateCommands` accepts `target`.
- **Empty regions in edit mode** are slim labelled strips (44px side / 48px band) and drop targets; main keeps its placeholder; view mode unchanged. `fullRegionHighlightRect` falls back to the default band for an empty strip.
- **ContextMenu (slice-1 leftovers):** `boundary` prop (the edit bar passes itself) — an anchored menu opens below the bar and re-places on anchor / bar / ancestor resize; a detached anchor keeps the last placement.

### e2e
- `03-dock`: test 3 follows the new menu (Move to ▸ submenu, collapse strip → expand → close).
- `19-edit-bar`: @390 the open PAGE menu re-places below the error row.
- New `20-dock-zones.spec.ts` (11 tests): lift, five zones + exact landing + one-step undo for all five zones, edge left, empty top strip, small panel, cancel by release, page drop + refused current page, Move to ▸ Right dock / page, double-click maximize + Escape, collapse strip, view-mode collapse/maximize, library drag-out; console-error checks.

### Review fixes (regression review + workbench-reviewer)
- **Escape priority:** a maximized panel restores only on an Escape nothing else consumed (bubble phase, no stopPropagation, deferred check of `defaultPrevented`). The app's Escape chain (`routes/+page.svelte`) and the command palette now call `preventDefault()` when they handle Escape.
- **Collapsed regions:** every insert into a region clears `regions[r].collapsed`; the landing uses the expanded band; a user-collapsed strip is an edge target.
- **Moves arrive expanded:** `panel.move` clears the moved panel's `collapsed`; template instances never carry it.
- **Hit-testing:** a stack's tab bar beats the edge strips (stacks at the workspace edges); the topmost stack (drawer > inline) wins.
- **Lift holds the stack:** dragging the active tab of a multi-tab stack keeps that stack's body empty (`holdActive`) — no neighbour panel mounts mid-drag. The dragged panel itself still unmounts / remounts.
- **Maximize:** exclusive with collapse; double-click respects drawers; released when its inline owner unmounts or is not laid out.
- **Robustness:** a drop always clears the drag + lift (try/finally, rethrow); a refused drop leaves the reducer's error on the edit-bar chip instead of "Drag cancelled".
- **Collapsed strip:** parameter drops and spring-to-expand reach it; focus follows collapse / expand; split handles beside a strip are inert.
- **Purity / tests:** `completeDockDropGeometry` (model-derived geometry) and `layoutDockWorkspace` (edit-mode flex mirror) are pure; a round-trip suite checks reducer + mirror == `landingRect`; the drag session is unit-tested with injected collaborators. Dead panel-intent helpers removed. e2e tolerance 1px.

### Verification-review fixes
- **Escape after a block was opened (desktop):** the app chain still calls `closeEditor()`, but marks the key handled only when that is visible — the legacy shell, or the workbench phone profile (`axis-workbench/axisEditorEscape.ts`, used by `routes/+page.svelte`). A maximized panel restores on the first Escape again.
- **One Escape, two effects:** the maximize Escape snapshots open overlays (`MAXIMIZE_ESCAPE_OVERLAYS`, now incl. `[role="dialog"]`) in a window capture listener, before a dialog's own handler closes it; it restores only if nothing was open then and nothing called preventDefault.
- **Held stack with a collapsed next tab:** a held stack is judged by its first remaining tab (the one the reducer activates), so it is already a strip during the drag when that tab is collapsed; round-trip test added.
- **Rule documented:** moving a maximized panel to another stack releases the maximize (its owner unmounts).

### Gates
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 1818 passed (130 files; baseline 1666 / 122).
- Chromium e2e, full suite: 86/86 (baseline 67).

## ROUND 27 — Layout editor rework, slice 3: pages and panels are never lost (parent AXIS-67)

Branch `feature/ui-rework` (worktree `.wt-feature-ui-rework`). Product decisions by the operator: park instead of delete, every page deletable (inline confirm, undoable), Restore default pages, Reset to default per page, a complete panel catalog. A panel still lives on at most one page; no schema version, no migration.

### What changed
- **Parking (generic core).**
  - `page.remove` parks the page's panels (locked ones too) instead of deleting them; owned widget zones and widgets stay. Nav-entry cleanup and the nearest-page fallback are unchanged.
  - New `panel.remove` (Remove from page): off every page dock, instance kept; missing / locked panels rejected (same rule as `panel.close`).
  - New `panel.create`: a parked instance (duplicate id / singleton rejected like `panel.add`).
  - New `page.setDock { pageId, dock? }`: replaces a page's dock (no dock = clear); panels it drops are parked.
  - `page.add` takes `navIndex` (nav position independent of the page index).
  - `page.add` / `page.setDock` never take a panel from another page: references to panels docked elsewhere are dropped (they stay where they are).
  - `panel.close` stays the hard delete, unchanged.
  - Selectors `selectPanelPlacement` (`docked` + pageId / `parked`) and `selectParkedPanels`.
- **Panel catalog (`core/panelCatalog.ts`, pure).**
  - `buildPanelCatalog(layout, { canonical, templates, hiddenTypes })`: every instance once (docked / parked), each canonical spec without an instance as `absent`, `multiple` specs always, then templates. Hidden types are kept out only while docked.
  - `catalogAddCommands(doc, entry, target, { exact? })`: parked or elsewhere-docked → `panel.move`; on this page → activate (an exact drop moves it there); absent → fresh instance with its singleton key; `multiple` → a new instance; template → instantiation, with an existing singleton moved instead of copied. Cannot produce `duplicate-singleton`. `{ pageId }` targets use `panel.create` + `panel.move`.
  - `instantiatePanelTemplateCommands` / `labelFromWorkbenchType` moved to `core/panelTemplates.ts`; `svelte/library.ts` re-exports them.
- **Registry hooks (data only).** `registerPanelCatalogProvider({ canonical, hiddenTypes })`, `registerPageHints((layout, page) => PageHint[])`. Hints first rendered in the empty main placeholder; since the review fixes they are a bar above the workspace (see below). The button dispatches one batch.
- **Edit-bar extension `pages` part** (`WorkbenchEditBarPagesExtension`): `addPageItems()` (host rows around the generic "Blank page") and `reset(pageId)` (label, prompt, confirm label, commands). The extension is also on the workbench context so the navigation uses the same rows.
- **Axis.**
  - `axisPanelCatalog.ts`: canonical specs from the roster + secondary page specs (deduped by singleton key), without the converter panels; "Custom Panel" is a `multiple` spec. Converter types are the catalog's hidden types.
  - `axisDefaultPages.ts`: `listMissingAxisDefaultPages`, `restoreAxisDefaultPagesCommands` (seed position in page order and nav, original id / label / nav entry id; parked → docked, absent → `panel.create`, elsewhere → left there), `resetAxisPageCommands` (default page → spec dock, other panels parked; custom page → cleared), `axisPageHints` ("<Panel> is on page <Page> · Bring it here" → `panel.move` with `pageId`), and the edit-bar `pages` part.
  - The Grid page dock follows the layout's preset (`settings.presetKind`, legacy `activePreset`) via `buildAxisPresetGridDock`; the default document (no preset) gets its own Signal Grid + Block Editor dock (`createAxisDefaultGridDock`, now shared with the default document).
- **UI.**
  - Panel header × and ⋯ menu "Close Panel" → "Remove from page" (title / aria-label), `panel.remove`, no confirm.
  - PAGE menu: "Reset to default" (default pages) / "Clear page" (others) with inline confirm; Delete's prompt says the panels are kept.
  - Add menu: "Add page ▸" submenu — missing default pages (restore at seed position + open), "Already there: …", Blank page, "Restore default pages (n)"; "All default pages are there" when nothing is missing.
  - Nav "+": opens the same menu below the button (clamped, so it lifts above the bottom nav). The nav context menu shows Reset / Clear / Delete only in edit mode, each with an inline confirm.
  - Library drawer, pages view: page delete asks inline; "Add Panel · To This Page" is the full catalog with status (on this page / on <page> / not placed / new), tap adds or moves, drag-out lands on the exact dock target; custom panel instances get "Delete everywhere" (inline confirm → `panel.close`); templates keep rename / export / delete in their own section.

### Old stored documents (no migration)
- Panels an old document lost (old `page.remove` / Close Panel) show as "not placed" canonical entries and are created fresh from their spec.
- Deleted default pages show under Add page ▸ "Missing default pages" and come back with their nav entry id.

### e2e
- `02-edit-mode`: header button title / aria-label "Remove from page".
- `03-dock`: Remove from page removes Setup's tab; the catalog lists it "not placed" and moves it back.
- `19-edit-bar`: new delete prompt; Add page ▸ Blank page.
- `20-dock-zones`: the Block Editor template drop now moves the existing panel (was: refused as duplicate).
- New `21-pages-lossless.spec.ts` (11 tests; 14 after the review fixes below): delete confirm + catalog status + one-step undo; restore a deleted default page from Add page ▸ (seed position, `library` nav id, Grid keeps its edit); Restore default pages (2) with a custom page untouched; restore conflict hint + Bring it here; Reset to default parks a foreign panel + one-step undo; Clear page; Remove from page + catalog re-add (no duplicate); catalog drag-out to an exact spot; custom panel survives page delete with its widget + Delete everywhere; drawer page delete confirm; nav "+" menu and edit-mode-only Delete.

### Review fixes (regression review + workbench-reviewer)
- **`pageLayout.apply` no longer deletes (M1).** It now runs on `page.setDock` semantics (`reducer.ts` `mapStoredPageLayout`):
  - a stored panel with a `singletonKey` is THE live instance with that key (created with the key when none exists); one docked on another page stays there and the result carries a warning ("1 panel stays on another page"), which the bar / Layouts drawer notice appends;
  - a keyless stored panel reuses a keyless instance on the target page, or a parked one, with the same type + title + deep-equal state; only otherwise is a copy minted — applying the same layout twice creates nothing;
  - the target's unused panels are parked (custom panels keep their widgets); one undo step, no confirm.
  - The page-layout import keeps the snapshot's identity flags (`remintWorkbenchPage({ keepIdentity })`) so an imported layout maps its singletons too.
- **Duplicated pages leave removable copies (M2).** A live remint (`page.duplicate`) clears `locked` and defaults `closable` like a template instance. The catalog marks KEYLESS copies of a single-instance type (a keyed canonical spec, or a type whose original carries a key) "Delete everywhere"; the original (the instance with the key or the canonical id) never is.
- **Switching presets asks first (M3).** A DIFFERENT preset row gets the Reset-style inline confirm ("Switch to “Stage”? This replaces your layout. Undo brings it back."); the checked row stays a no-op. Carrying custom pages / custom or parked panels over to the new preset is out of scope — Undo is the way back.
- **Convert page self-heal (W1).** `ensureAxisConvertPage` drops references to panels docked on other pages and lists the page in `pageOrder` when it creates it; the step and the whole normalization chain are idempotent over a deleted-Convert + tray-on-Grid document (`axisConvertPage.test.ts`).
- **Catalog (m1, m2, m3, m6, m8).**
  - A spec with a key falls back to its canonical id (a keyless `axis.presetBrowser` from old docs is the canonical instance); the nav add-or-focus action now mints its panel WITH the singleton key and finds a keyed instance under another id.
  - Template whose singleton exists: its widgets are dropped (no pile-up per tap); when that instance cannot be placed (locked on another page) nothing is remapped and later panels land on the drop target.
  - An exact drop onto the panel's own single-panel stack (by `tabStackId`) is a no-op instead of a refusal.
  - Hidden types (converter panels) are never listed; parked custom panels with an empty widget zone are hidden (the seed `axis.customPanel` row is gone); the `multiple` row reads "New custom panel" (`CanonicalPanelSpec.label`).
  - The unused `{ pageId }` catalog target and `retargetToPage` are removed.
- **Locked panels (m5, superseded by the final round below).** First pass excluded locked, non-closable panels from the canonical list and kept locked panels from moving; the final round replaces that with one rule.
- **Protected Convert page (m6).** New registry hook `registerPageProtection(page) → reason | null`; Axis returns "Used by the preset converter" for `axis.page.convert`. Delete is disabled with the reason in the PAGE menu, the nav context menu and the Library drawer.
- **Hint bar (m7).** Page hints render as a slim bar above the dock workspace (outside `.aw-workspace`, so drag geometry is unchanged) — e.g. a restored Grid whose Block Editor lives elsewhere. The empty-main placeholder is plain again. (Visibility refined in the final round.)
- **Mobile block flow (m4).** Only a block editor docked on the ACTIVE page counts; a parked one no longer resizes an empty bottom region.
- **Nits.** Clear page (`page.setDock` without a dock) keeps the region sizes.
- **Refused drops.** The catalog can no longer produce a reducer refusal (single instances move, never copy), so no refused library drop is reachable in e2e; the path is unit-tested (`libraryDrag.test.ts` `commitPanelDragOut`, `panelDrag.test.ts`).
- **Tests added:** `pageLayouts` apply (singleton mapping, elsewhere stays + warning, create with key, parking, double apply, parked reuse), duplicate → delete, keyless canonical id, template widget / locked-remap cases, own-stack drop, Clear-page sizes, `page.setDock` input unmutated, restore with reordered pages and a custom page between seeds, nav-id collision, locked hint, hint outside main, mobile parked editor, nav action key, preset confirm; e2e: hint bar for Block Editor, Convert delete disabled, "New custom panel" / no seed row, preset Switch confirm (07, 19).

### Final review round
- **Locked = cannot leave the layout.** A locked panel has no ×, cannot be removed (parked) or hard-deleted, but it moves between docks and pages like any other:
  - the panel menu's Move to ▸ is enabled for locked panels (Remove from page and Save To Library stay disabled); tab drags never checked the lock, and `panel.move` never rejected it;
  - the catalog moves a locked instance that is docked on another page (`placeExisting`), a template's locked singleton moves too, and the restore hint keeps "Bring it here" for locked panels;
  - Signal Grid is canonical again (offered only when absent); Axis Account is left out by id (its nav action opens it).
- **`pageLayout.apply` reuse** prefers a keyless candidate already on the target page; a parked candidate is reused only when it owns no widgets — an empty stored custom panel can no longer swap the target's custom panel (with widgets) for an empty parked twin. Candidate state keys are computed once; an absent state equals `{}`; "N panels stay on other pages" counts distinct panels.
- **Hint bar visibility:** always while editing; in view mode only while the page's main region is empty (`shouldShowPageHints`).
- **Old locked copies:** `panel.close` accepts a locked panel that has no `singletonKey` while another panel of its type carries one (a copy from an older page duplicate); a lone locked panel stays protected. The catalog's copy rule matches (a locked copy is deletable only while its keyed original exists).
- **Empty custom panels:** a parked custom panel with widgets, another title or a changed state is listed normally; the empty default ones (no widgets, default title, absent / `{}` / default-grid state, unlocked — `selectEmptyParkedCustomPanels`) collapse into one drawer row "Empty custom panels (n) · Delete all" with an inline confirm that hard-deletes them in one batch.
- **Convert page hardening:** "Convert…" (ConvertDialog, preset-browser source) goes through `openAxisConvertPage`, which recreates a missing Convert page in the running session first (`panel.create` for missing panels + a nav-less `page.add` — `page.add` now accepts `navEntry: null`), then activates it.

### Gates
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 1907 passed (134 files) (baseline 1818 / 130).
- Chromium e2e, full suite: 100/100 (baseline 86; `21-pages-lossless` has 14 tests).

### Open
- Preset switch / Reset layout still replace the whole layout (custom pages, custom and parked panels are not carried over); both now ask first and Undo restores. Carrying content over is a later slice.
- A locked keyless panel that is the only one of its type (its keyed original is gone) stays protected from Delete everywhere.

## ROUND 28 — Layout editor rework, slice 4a: Add palette, click-to-place, context "+" (AXIS-71, parent AXIS-67)

Branch `feature/ui-rework` (worktree `.wt-feature-ui-rework`). Design source: the layout-editor prototype (picker cards, "+" in every zone / tab bar / empty region / navigation) and the operator-approved slice-4 brief. Slice 4b (widget insert line, dwell grouping, "Group with ▸", the 834 px top bar) is NOT in this round.

### What changed
- **Shared palette chrome (`src/lib/PaletteShell.svelte`).** Extracted from `CommandPalette`: scrim + card, search with hit count, target chip row (+ an extra snippet), filter chips, a scrollable content snippet, key-hint footer (+ an optional end snippet), phone bottom sheet, ↑↓ ⏎ Esc (and ←→ by one / ↑↓ by a row when the caller reports `columns > 1` and the search is empty). `CommandPalette` renders through it unchanged — before/after screenshots (desktop list, highlighted row, search, category chip, phone sheet) are pixel-identical. Optional `overlay` (fixed above the workbench, z 236), `wide` (920 px) and `escapeAnywhere` (Escape closes from a focused chip / card too — off for `CommandPalette`, whose Escape the app chain owns) for the Add palette.
- **Generic catalog + placement (workbench).**
  - `core/widgetCatalog.ts` (pure): `buildWidgetCatalog` — each host built-in widget type once (placed / hidden / absent), every other hidden widget, the saved widget templates; unavailable types keep their reason and go last. `widgetCatalogAddCommands`: a built-in with an instance MOVES (never duplicates), absent → fresh instance from its spec, hidden instance → moved back, template → a copy; same-zone moves correct the index for the widget itself. `widgetZoneLabel`, `widgetTitle`. `instantiateWidgetTemplateCommands` moved to `core/widgetTemplates.ts` (re-exported from `svelte/library.ts`).
  - `svelte/addCatalog.ts` (pure): request / fixed-target types, the card list (panels incl. templates · pages: host missing-default cards, Blank page, hidden navigation entries, host Restore default pages · widgets), statuses ("On this page", "On <page>", "Not placed", "Nowhere yet", "In <zone>", "Hidden", reasons), chip filter + multi-term search, blank-page / show-entry commands and the nav-gap → `navigation.order` / `pageOrder` index mapping, `WIDGET_ZONE_ADD_BUTTON_PX`.
  - `svelte/placement.ts` (pure): highlight spots from the measured dock (stacks main-first, the four edges, an empty main), widget zones and navigation gaps; the keyboard machine (Tab / Shift+Tab across spots, arrows walk a stack's zone cross / a zone's insert position / the neighbouring nav gap, Enter places, Escape cancels); the edit-bar line "<Name> · Click a highlight to place · Esc cancels".
  - `svelte/placementSession.ts` (DOM): a drag without a pressed button — window capture listeners; every move measures like a drag (`collectDockDropGeometry` → `dockDropTargetAt` → `buildDockDropOverlay` with click wording; `resolveWidgetDrop` for zones; nearest nav gap) and publishes `controller.drag` with `placement: true`, so DragLayer / WidgetZone show the same landing / in-flow slot as a drag. The click is the drop (swallowed with its own follow-ups, so nothing under it reacts); a click on nothing, a right click or Escape cancels ("Placement cancelled"); a press on the edit bar ends placing and goes through. One commit = one batch = one undo step.
  - `svelte/addPalette.ts`: the API the host palette gets — `items()`, `choose` (fixed target → insert at once; else close + click-to-place; host page cards run directly), `startDrag` (drag-out via `libraryDrag` — the palette closes on activation), template ⋯ rows (Rename… / Export (panel templates) / Delete), `manage(view)` (Library drawer), widget preview instances.
  - Controller: transient `addPalette` and `placement` (never persisted / in history; cleared on leaving edit mode). Registry: `registerAddPalette`, `registerWidgetCatalogProvider`. Pages extension: optional `addPageCards()`.
  - Components: `PlacementLayer.svelte` (dashed spots, the active one solid + labelled, nav gaps as bars), `DockThumbnail.svelte` (page mini-map from a dock tree), DragLayer hides its chip / reject frame while placing.
- **Entry points.**
  - Edit bar **Add +** opens the palette (aria-haspopup dialog); in ⋯ More it is one row "Add…". Hosts without a palette keep the old Add menu.
  - Widget zones (edit mode): a compact "+" (`WIDGET_ZONE_ADD_BUTTON_PX` = 26) at the free end, hidden during drags; an empty zone is one "+ Widget" button replacing the "top.center" / "Empty Panel" placeholders (a custom panel keeps "or drop widgets or parameters here" as its second line; without a host palette the old placeholders stay). Fixed target: that zone, at its end.
  - Tab bars: a "+" tab (not an `.aw-pane-tab`, so drop geometry is unchanged) → Panels, fixed target "tab in this stack".
  - Empty regions: "+ Panel · <region>" in the edit-mode strips, "+ Panel" under "Drop panels in main".
  - Navigation "+": the palette on Pages, fixed target "end of the navigation".
  - Panel ⋯ menu: **Split right / Split below** (edit mode) → Panels, fixed split target.
  - The Library drawers stay reachable: PAGE ▸ Manage pages and templates…, and the palette footer "Manage: Pages & panels · Widgets".
- **Axis.** `AxisAddPalette.svelte` (registered): preview grid on the shell (2 columns on the phone sheet) — widget cards render the real widget at default size inside an `inert` box, scaled down to the card (first guess `axisWidgetPreviewScale` from the estW table, then measured); `paramControl`, the FC widgets and `telemetry` (and unavailable cards) get a static preview; panel cards a schematic pane with the family glyph (`axisPanelGlyph`); page cards a `DockThumbnail`. `axisAddPalette.ts`: canonical widget specs (every manifest type but `axis.paramControl`, labels, default ids / grid-control state). `widgets/widgetAvailability.ts`: `axisWidgetUnavailableReason` ("Needs a device with scenes" …). `axisDefaultPages.ts`: `buildAxisAddPageCards` (missing default pages with their spec dock, Restore default pages (n), "Already there: …").

### e2e
- Helpers: `addPalette`, `openAddPalette`, `addPaletteCard`; `addCustomPanel` now goes main tab bar "+" → "New custom panel" (empty main: its "+ Panel").
- Adapted: 03 (catalog via PAGE ▸ Manage…), 09 (an empty custom panel shows "+ Widget" with the drop hint and opens the palette on it), 13 (widgets drawer via the palette footer), 19 (Add + opens the palette; Blank page placed by keyboard; ⋯ More "Add…"; console check opens the palette), 21 (Add page ▸ … → palette page cards; Blank page via the nav "+"; catalog via PAGE ▸ Manage…; nav "+" opens the palette).
- New `22-add-and-group.spec.ts` (13 tests; describe blocks: Add palette · Click to place · Drag from the palette · Context "+" entries — 4b appends its own): previews / chips / search / greyed reasons / Escape (search field and a focused chip); deleted default page card with mini-map restores; template ⋯ rename + delete; click marks + click places + one-step undo; Escape cancels; keyboard (arrows across the cards, Enter, Tab / Shift+Tab across the spots, ArrowDown = split below, Enter); widget placement moves a built-in; Blank page at a nav gap; drag from the palette; "+" tab, zone "+" / "+ Widget" / template copies, "+ Panel" + nav "+", Split right.

### Notes for slice 4b
- `WIDGET_ZONE_ADD_BUTTON_PX` (26 px, `svelte/addCatalog.ts`) is the zone "+" width; WidgetZone renders it (`.aw-zone-add`, `data-zone-add`) only while editing, with a host palette, with units, and with no drag / placement running — the zone gap (6 px) comes on top. `fitZone` is NOT yet adjusted for it.
- Zone unit hit-testing is unchanged (`[data-widget-host], [data-widget-group]`): neither "+" nor "+ Widget" is a unit. `libraryDrag.ts` now exports `resolveWidgetDrop` / `resolveWidgetDropInZone` / `zoneUnitEls`.
- Widget click-to-place drives the same `controller.drag.zoneInsert` slot as a drag (with `placement: true`), so an insertion line replacing the slot box applies to placing as well.
- `22-add-and-group.spec.ts` is organised in `test.describe` blocks; append the insert / grouping blocks.

### Open questions
- Widget templates have no export package (only panel templates do), so their ⋯ menu offers Rename… and Delete only.
- Missing default pages and "Restore default pages" restore directly at their seed position (no navigation highlight step); Blank page and hidden navigation entries go through the nav-gap highlights.
- The floating zone (a free canvas) gets no "+"; its edit-mode "floating" label is unchanged.
- The seeded panel library templates (Block Editor, Custom Panel, Device Tools, Footswitches, History, Preset Browser) show as template cards next to the live panels of the same name; the parked Axis Account instance shows as "Not placed" (both as in the slice-3 catalog).

### Gates
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 1974 passed (138 files) (baseline 1907 / 134).
- Chromium e2e, full suite: 113/113 (baseline 100; `22-add-and-group` has 13 tests).
- `CommandPalette` before/after screenshots (desktop, highlighted row, search, category chip, phone sheet): pixel-identical.

## ROUND 28 — slice 4b: insert line, dwell grouping, "Group with ▸", the 834 px top bar (AXIS-71, parent AXIS-67)

Branch `feature/ui-rework` (worktree `.wt-feature-ui-rework`), on top of 4a (uncommitted). Design source: the layout-editor prototype (`moveWidgetDrag` dwell + halo, `.insl` line, `fitSizes` with the edit "+" buttons, the widget menu's "Group with ›") and the operator-approved slice-4 brief.

### What changed
- **Plain drops always insert.** The instant rules are gone: the middle 28 % of a loose widget no longer groups, and a drop on / next to a foreign group no longer goes into it — both insert (by the unit midpoint, so a short release ON a widget lands beside it).
- **Drop order (pure, `svelte/widgetDrop.ts` `resolveWidgetDropOrder`):** (1) a dwell armed on a foreign unit → group with it (a group target takes the widget(s) in, appended after its members; a loose target forms a new group; the result sits where the target sits); (2) the dragged member inside its OWN group (hit area ±8/±4) → reorder there directly; (3) a widget zone → insert at the unit index; (4) off every zone near the workspace edge → new custom panel. Commands: `widgetGroupWithCommand`, `widgetReorderInGroupCommand`, `widgetInsertCommand` (one dispatch = one undo step).
- **Grouping only by dwelling (`svelte/dwellTracker.ts`, pure, time injected).** 350 ms within 10 px on a foreign unit (a loose widget or a group module; never the dragged unit, a member's own group, a locked unit or the floating canvas) arms grouping; the arm holds while the pointer stays on that unit and drops when it leaves. The session re-checks at the deadline, so the frame appears while the pointer is still.
- **One drag session for widgets and groups (`svelte/widgetDragSession.ts`).** WidgetHost (loose widget / member) and WidgetGroupHost (whole group: a dwell merges it with the target) share it; the old per-component hit-tests (`groupInsertAt`, `groupCreateAt`, both `workspaceEdgeDropAt`s) are gone. Escape now cancels a widget drag; a pointercancel aborts as before. The whole-group edge drop highlights the full region frame like the widget one.
- **Insert line instead of the widget-sized slot.** Nothing is spliced into the flow any more (`.aw-zone-slot` / `.aw-group-slot` removed): the session measures the units and `insertLineRect` (pure) puts a 3 px accent line centred in the gap (half a measured gap before the first / after the last unit; wrapped rows and the vertical rail handled). The DragLayer draws it (`[data-insert-line]`, zoom-compensated, never clipped). Library drag-out and click-to-place carry the same line (`resolveWidgetDrop` / `resolveWidgetDropInZone` return it; `zoneUnitEls` / `measureZoneUnits` take the moving ids). An empty zone gets no line — its "+ Widget" placeholder lights up (`.aw-zone-empty.ins`, design `.wempty.ins`) and stays on screen during drags (inert), so an emptied zone no longer collapses mid-drag.
- **Group frame.** The armed unit gets an amber frame with a "GROUP" badge (`[data-group-frame]`, DragLayer `previewKind: 'group'`); the chip reads "Insert · <zone>", "Group with <unit>", "Reorder in group" or "New panel in <region>". A reorder target keeps its accent module border.
- **Units move apart while editing.** Flow zones (bars, panel bodies, the rail) use a 16 px gap in edit mode (`WIDGET_ZONE_EDIT_GAP_PX`) so the line sits clearly between the dashed outlines; grid-variant custom panels keep their configured gap. The zone "+" now keeps its place (invisible, inert) while a drag / placement runs, so the bar does not shift at drag start.
- **"Group with ▸"** in the widget menu (after the sizes) and the group menu (first row): the other units of the same zone in zone order (a member's own group left out; unavailable types — not rendered — left out; groups hinted "Add to group"; locked units disabled "Locked"; "No other widget in this zone" when alone; floating / hidden widgets have none). Menu grouping keeps two loose widgets of one zone in their on-screen order; a group target appends. Builder: `groupWithMenuItem` (pure). Everything else in both menus is unchanged.
- **Top bar at 834 px (closes the AXIS-66 top-bar item).** `fitZone` / `fitZoneSize` take a `reservePx`; `svelte/zoneFit.ts` `fitWidgetZones` reserves the edit chrome before sizing: per zone with units the "+" (26 px) plus a gap, per empty zone the "+ Widget" button (84 px) — collapsed to the compact "+" when the label would cost the units a size tier or nothing fits — plus the top-bar zones' 5 px inline padding, with the 16 px edit gap. Narrow bars therefore step their units down (desktop layout at 834 px: compact in view mode, mini while editing) instead of spilling. Edit mode still never sheds into ⋯; its size is now the tier over EVERY unit (it used to take the shed survivors' re-fit, which could leave a too-large size). Last resort for a crowded bar: the top-bar zones clip and scroll sideways while editing (`overflow-x: auto`, `safe` alignment) instead of wrapping or overlapping. "+ Widget" never wraps (`white-space: nowrap`).

### Tests
- Unit (+48 tests, +3 files): `dwellTracker.test.ts` (350 ms / 10 px, tick deadline, drift restart, unit change, armed hold, tracker wrapper), `widgetDrop.test.ts` (drop order, unit hit-tests, group / reorder / insert commands run through the reducer incl. member pull-out and group dissolve, menu order, locked / no-op nulls, insert-line geometry incl. wrap / rail / empty zone, "Group with ▸" candidates + menu rows + availability, labels), `zoneFit.test.ts` (chrome per zone, view mode = design fit, 1440 default, 834 compact → mini while editing, "+ Widget" collapse threshold, no palette); `widgetFit.test.ts` + reserve cases.
- Replaced instant-rule tests: none existed (the 28 % / on-group rules were only in the components; no unit or e2e test covered them).
- e2e: `22-add-and-group` — the widget placement test now expects the lit "+ Widget" and no slot box; new describe blocks (7 tests): insert line between units + short release on a widget inserts beside it; short release on a group inserts beside it; dwell → Group frame → group + one-step undo; dwell on a group adds to it; member reorder inside its own group (no dwell, no frame); "Group with ▸" (widget menu, group menu merge, lone widget); 834 px edit-mode top bar one row (tablet layout and pinned Desktop: bar height unchanged, zones side by side, nothing scrolled / outside, "+ Widget" one line, units below default). `12-widget-menu` checks "Group with" in both menus; `09-custom-panel` + a drag into the empty custom panel (placeholder lights up, release inserts).

### Gates
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 2022 passed (141 files) (baseline 1974 / 138).
- Chromium e2e, full suite: 121/121 (baseline 113; `22-add-and-group` has 20 tests, `09-custom-panel` 2).
- Offline screenshots (temp spec, deleted): insert line, Group frame, reorder in a group, grouped result, "Group with ▸" menu, empty custom panel lit during a drag, 834 px top bar (tablet layout, pinned Desktop, view mode), edit spacing at 1440 px.

### Open
- Edit mode keeps every unit visible (no ⋯ shedding); a pathologically crowded top bar scrolls inside its zone while editing. Alternative: shed into ⋯ in edit mode too and offer the widget menu from the ⋯ list.
- AXIS-66's other items (CPU widget without readings, copy-layout-to-profile, possibly dead components) are not part of this slice.
- Library drag-out and click-to-place stay insert-only (nothing exists yet to dwell with).


### Review fix round (slice 4a + 4b)
- **Touch on palette cards.** A card is `touch-action: pan-y` and its drag-out is gated (`dragSession.ts` `shouldActivate` + `sidewaysTouchDragGate`, threaded through `startWidgetDragOut` / `startPanelDragOut` / `beginDockDropSession`): with touch or pen only a mostly sideways pull drags the card out; a vertical swipe stays the native scroll of the phone sheet and leaves the palette open. Mouse drags are unchanged.
- **Placement is a click, committed on release.** `placementSession.ts` records the press and places on its pointerup only when it moved less than a slop (mouse 5 px, pen 8, touch 12); a press that travelled (a scroll) or a pointercancel places nothing and the session goes on. The follow-up click / dblclick / contextmenu / mouseup are swallowed until that click arrives (fallback 400 ms) and only within 16 px of the press and never on the edit bar — so a late synthesized touch click cannot hit what is underneath and the next real click (Undo) still goes through. The second press of a double-click on the card (within 300 ms / 6 px of the pick) is ignored. The bottom bar's Customize toggle joins the pass-through list (`PLACEMENT_PASS_THROUGH`).
- **Escape.** `PaletteShell` with `escapeAnywhere` (the Add palette only) now also stops the key's propagation, from the search field and from anywhere in the card, so the app's window Escape chain (tuner, history, dialogs, block editor …) no longer runs on the same key. Placement already consumed Escape in the capture phase; both are covered by e2e. `CommandPalette` keeps its fall-through.
- **Widget template from a zone "+".** `widgetCatalogAddCommands` gives a template without an index the zone's end (all its widgets, as the reducer orders them), so the copies land together at the end instead of at the start (ungrouped) or split (grouped). `instantiateWidgetTemplateCommands` with an explicit index now places a group right after the template widgets that precede it (it used to jump ahead of them); the drawer's tap-to-add (no index) is unchanged.
- **Unit index → widget order by member ids.** `drag.ts` `widgetOrderIndexForUnits` (+ `zoneUnitsFromWidgets`) and `widgetDrop.ts` `zoneWidgetOrderIndex` resolve the reducer index from the measured units' member ids (before unit i: its first member; past the end: one past the last member of the previous unit) instead of counting units — a widget the zone does not render (a type the host gates off) no longer shifts drops one slot early. Used by the in-layout drag (`widgetInsertCommand` takes the measured units), the library drag-out and click-to-place by pointer (`resolveWidgetDropInZone`) and by keyboard.
- **Navigation gaps by id.** Gap spots carry their on-screen neighbours (`navBefore` / `navAfter`); `addCatalog.ts` `navOrderIndexForNeighbours` maps them onto `navigation.order` by id, so scrolled-away or unrendered entries no longer shift the index. Entries are measured inside the navigation's own box; the orientation comes from the measured rects (`navOrientation`), not from the nav mode.
- **Nav "+" = the end.** A page target without an index re-shows a hidden entry at the end of the navigation (it used to return to its old slot).
- **Locked groups.** A member of a locked group counts as locked (`widgetInLockedGroup`, `widgetUnitLocked`): it cannot be dragged (a tap still opens its menu), moved, removed or grouped elsewhere (menu row disabled, dwell / command null), and the reducer refuses a `widget.group` that would take a member out of a locked group (it used to leave the widget listed in two groups). Its size stays its own.
- **Arrow keys across section rows.** `src/lib/paletteGrid.ts` (`paletteRowMove`) moves ↑↓ by the grid rows as drawn: the Add palette passes `rowBreaks` (the section headers and the page note), so ↓ from a short last row lands in the next section's first row, same column. Without breaks it is exactly the old `index ± columns` (CommandPalette unchanged).
- **Accessibility while placing.** The edit-bar status line (`role="status"`) names the active spot — "History → Split right · Signal Grid · Click or Enter places · Esc cancels" (`placementActiveDescription`; the pointer now sets the stack zone / widget insert position too, so the highlight label and the line match the landing); a visually hidden status takes over when the bar has no room for the line. When a placement ends (placed or cancelled), a fixed-target insert runs or the palette closes, focus returns to what opened it (the Add button or the "+"), else to the edit bar's Add.
- **Tests.** Unit (+35 tests, +2 files): `addPalette.test.ts` (choose routing: fixed target vs click-to-place per card kind, host page cards, page `navIndex` / end, gap mapping, `live()` refetch, disabled cards, one undo step; injected `beginPlacement`), `paletteGrid.test.ts`, the unit → order helpers, gated-unit inserts, locked-group members (incl. the reducer), template end / group index, nav neighbours / orientation, status text, the drag gate. e2e `22-add-and-group` (+7): Escape never reaches the window listener (search field, chip, placement); ↑↓ across the section rows; touch swipe vs sideways pull on a card (synthetic pointer events); double-click on a card; a swipe while placing places nothing, a tap places; the Customize toggle while placing; the status line + focus return. The two "short release" cases now move and release in one task (`shortReleaseAt`) so a slow round trip can no longer arm the 350 ms dwell; the zone "+" template case asserts the copies are the zone's last units.

### Gates after the review fix round
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 2057 passed (143 files) (after 4b: 2022 / 141).
- Chromium e2e, full suite: 128/128 (`22-add-and-group` has 27 tests). Flake check `22-add-and-group --repeat-each=3`: 81/81 (one earlier run lost a test to a cold `page.goto` timeout while another suite was loading the machine; the rerun was clean).

## ROUND BE-1 — Block editor rework, slice 1: board model v2, geometry, per-device-class persistence (AXIS-74, parent AXIS-73)

Branch `feature/block-editor-rework` (worktree `.wt-feature-block-editor-rework`), cut from local `feature/ui-rework` @ `b2f8ce1`. Runs in parallel with the layout-editor slices on `feature/ui-rework`; rounds of this branch are numbered `BE-n` so they don't collide with that branch's rounds when the branches meet. Pure foundation modules only — no visible UI change; `ControlSurface.svelte` and `BlockEditor.svelte` still render exactly as before.

### What changed
- **New `src/lib/blockEditor/` (app layer, pure, node-env tests next to each module).**
  - `boardModel.ts`: v2 board (`v: 2`, controls + horizontal/vertical dividers with optional label), cell units (knob 2×2, page max 24 cells = 12 knobs, `MAX_ROWS` 512), size table + S/M/L presets per view, and the board operations (fits / findFree / findNear, add / move across pages / resize / setView with free-spot fallback / rotate / remove, closeGaps, tidy, reflowPack, page add / rename / duplicate / move / delete). `normalizeBoard` (replaces the old reconcile): drops vanished keys (block-level `meter` / `wave` / `eq` / `bypass` are kept while the catalog is still loading), dedupes keys per page, clamps sizes and coordinates, resolves overlaps at the nearest free spot, deterministic ids. `migrateV1`: old boards (1 control = 1 cell) ×2, clamped to the new size limits, row-tagged pages re-laid row by row, wide pages wrapped.
  - `boardGeometry.ts`: always-fit cell size (density Compact / Normal / Large = 32 / 40 / 50 px max, 20 px min, reference width = 24 cells so every page shares one scale), side navigation only from 560 px, reflow / overflow flags, visible-page detection (≥ 50 %).
  - `catalog.ts` (same keys as today: `k<id>`, `e<id>`, `eq`, `bypass`, `meter`, `wave`), `valueFormat.ts` (centre value, typed-value parsing with unit check, coarse / fine steps), `boardSchema.ts` (Zod v4, forgiving where normalize can repair, prototype-safe page records), `deviceLayoutBoardV2.ts` (device-layout default + curated fallback in v2 units, page-qualified ids).
  - `boardPersistence.ts`: keys `axs.be1.<slug>.<profile>.<deviceClass>`, `axs.be1meta.<slug>`, `axs.be1seed.<slug>`; device class from the workbench profile breakpoint, else viewport (< 760 px phone). Load chain: own class → desktop → legacy keys (one-time, only until the family is marked migrated by its first save) → family seed → seed; the Default profile still re-seeds on a device-layout variant change and stamps the variant on seeds. Saves write only the own device-class key; legacy keys are never written or deleted.
- `surfaceStore.svelte.ts`: the new key prefixes are owned (cloud / remote sync); `types.ts`: `LayoutPlacement.positionExact` is a `"x,y"` string (was mistyped as boolean; not consumed yet); `deviceLayoutBoard.ts`: `resolveControl` exported for the v2 builder (behaviour unchanged).
- The workbench document and its normalization chain are untouched (the boards live in the surface document).

### Review fixes (Opus review + workbench-reviewer)
- tidy no longer creates overlaps from staggered input; legacy keys are a one-time migration source (no resurrection after a variant switch, a phone-only profile, or a reused profile name); curated seeds get the variant stamp (edits survive reload); migration keeps row order instead of scattering grown controls; temporarily-missing block-level keys are kept; prototype page names (`constructor`, `toString`, `__proto__`) are safe; divider detection by kind value; cross-page moves drop the source row; coordinates capped; schema repairs instead of rejecting; deterministic ids; tighter owned-key regex; stricter typed-value parsing; load → save → load round-trip tests.

### Gates
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 2048 passed (142 files); the slice adds 141 tests.
- Chromium e2e, full suite (`PW_PORT=5197`): 98/100. The two failures are the first `01-boot` tests of the run timing out on `.aw-root` while the fresh worktree's dev server compiles cold (11 s vs the 10 s wait); `--repeat-each=3` passes every warm run in 2–4 s. No UI changed in this slice.

### Open
- Slice 2 must render only keys present in the catalog (kept block-level keys) and save only after the catalog is complete; the layout-status check (slice 3) must ignore keys the catalog doesn't list yet.
- The cold-start boot timeout in a fresh worktree is a harness issue (first-test wait vs dev-server warm-up), not product behaviour.

## ROUND BE-2 — Block editor rework, slice 2: the new board (AXIS-75, parent AXIS-73)

Branch `feature/block-editor-rework` (worktree `.wt-feature-block-editor-rework`), on top of ROUND BE-1. First slice with a visible change: the board area of the Block Editor (both shells) is the new v2 board. `ControlSurface.svelte` stays in the tree, untouched, as the fallback until slice 7 deletes it; since the review fix round (below) nothing mounts it any more (the virtual-effect screens used it until then).

### What changed
- **`BlockEditor.svelte` mounts the new `blockEditor/BeSurface.svelte`** instead of `ControlSurface`. In the workbench on a desktop / tablet device class the header and footer are slimmer and the grid map starts folded (a stored fold state wins; `GridMap` got a `defaultCollapsed` prop; the default fold was widened in the review fix round), so the always-fit board keeps the height. The "no param pack" / "reading…" / "couldn't read" states are unchanged.
- **Component split (plan §4.4):**
  - `BeBoard.svelte` — every page at once in one scroll area. **Top** (default): pages side by side as a strip, the page name on a vertical spine, a vertical wheel scrolls sideways while nothing overflows vertically, no snapping. **Side** (editor ≥ 560 px): pages stacked, each at least one board high, scroll-snap per page, the name as a rule. Scrollbars hidden; a mouse / pen drag on empty board area pans, touch scrolls natively; `pointercancel` ends every gesture. Pages at least half in view are reported up.
  - `BeControl.svelte` — one tile per view: knob (device-style value inside the dial, label below), fader, slider, number (± steppers), button, switch, select, eq (`EQGraph`), action (Engaged / Bypassed), meter (upright bar per monitor; a meter wider than tall lies flat with its dB read-out), wave (looper waveform, playhead, level, transport), horizontal / vertical dividers with an optional label. Continuous controls are focusable sliders (`role="slider"`, `aria-valuenow` / `aria-valuetext`).
  - `beState.svelte.ts` — per-editor runes state: board, family meta (layout profiles, navigation and control size per device class, auto-pack), interim arrange state. Persistence through `boardPersistence` on the surface document (`surfGet` / `surfSet` / `surfRemove`; localStorage only as the read-only legacy source). Loading never saves; a reload happens on a remote revision bump and on a change of family, catalog key set, layout variant or device class; nothing loads while the catalog only holds the bypass entry; only keys the catalog lists are drawn (kept block-level keys stay stored).
  - `beHost.ts` — the context contract between the surface and its tiles.
  - Pure helpers with tests: `boardView.ts` (one shared cell for every page, strip / side section geometry, scroll targets, the active page after a scroll incl. the lock after a tab click, tab highlight, wheel → strip, key steps, drag and Shift-fine maths, tile sizing and text fitting, meter fill / tone / tag / text, wave downsampling, interim arrange maths: drop / grab cell, resize snapping, edge auto-scroll, "Pin page" ids) and `pinDrag.ts` (pin-drag target resolution moved out of `ControlSurface`, same 380 ms / 6 px / 18 % numbers).
- **Values:** knob vertical drag 0.005 per px, Shift ×0.1; fader / slider track drag; a click on the value (knob, fader, slider, number) types it in place — Enter commits through `parseTyped`, Esc cancels, invalid input keeps the value; double-click types too; arrow keys step (Up / Right +, Down / Left −, Shift fine, PageUp / PageDown ×10); the hover bubble with the full value and the parameter help in the status bar stay.
- **Always fit:** one cell size for all pages (24-cell reference width, density cap S / M / L, page-height fit). Below 20 px the strip scrolls sideways and the side stack re-flows with a "Compact view · widen for full layout" hint.
- **Interim chrome on the v2 model (slices 3–5 replace it):**
  - Tab row: "Find a control…" with the flat live results, page tabs (every visible page highlighted, the active one amber; a click scrolls smoothly to the page and flashes it; scrolling moves the active page), rename by double-click and ＋ page in arrange, layout profiles (Default / Blank / copies / delete / Reset to device), Arrange (not on phones; a search or the phone layout ends it), plus a Top / Side and an S / M / L toggle stored per device class.
  - Arrange: dotted 24-cell grid; drag with a teal / red ghost, also onto another page of the strip (duplicate keys refused), edge auto-scroll; corner resize; ✕; view cycle; w×h; ⚡ grid swipe control; ⌖ pin; arrange bar with Pin page, Auto-pack (formerly Packed / Free: a tidy after every move / resize, stored in the family meta) and Tidy up; the "Add control" tray (click = first free spot). The cell size is frozen while arranging.
  - Normal mode, ported 1:1: ∿ modifier badge (flyout or the docked modifier panel), hold-to-drag pin with overlay and zoom compensation, right-click / long-press pin menu, click suppression after a pin drag; looper latches, meter thresholds, `hideIds` and the EQ props unchanged.
  - An empty page shows a centred hint with an "Arrange" button.
- `boardPersistence.ts` / `boardSchema.ts`: optional `autoPack` in the family meta.

### Completion round
- **Spec-40 arrange test:** its press landed on the tile's ✕ (Remove) in the arrange chrome, so no drag ever started — a test problem, not a product bug. The test now grabs the tile body (checked with `elementFromPoint`) and asserts the ghost's column before dropping.
- **Edge auto-scroll** covered the whole board on a short panel (the default workbench panel leaves about 50 px of board in arrange), so every arrange drag scrolled; the edge bands now shrink to a quarter of the board each.
- **Narrow selects and on / off pills** cut option names and Engaged / Bypassed after two letters at small cells; the text now fits the tile (`fitFont`, ≥ 9 px) and a narrow select drops its caret.
- **Phones:** search, control size and layout share the first line of the tab row, the page tabs wrap below it; the Top / Side toggle shows only where the side navigation can take effect (editor ≥ 560 px) or is the stored choice.
- The empty-page hint is centred in the page area.

### e2e
- New `40-block-editor-board.spec.ts` (7 tests) on `support/blockEditorMock.ts` (fully mocked backend, six-page amp layout, captured parameter writes): fit without vertical scroll at 1366×768; several pages with highlighted tabs at 2560×720; a tab click scrolls to its page (top and side); knob drag, click-to-type, invalid input, ArrowUp; select popover and switch; side navigation kept after a reload; an arrange drag kept after a reload.
- `17-device-layout` uses the new `data-be-*` selectors with the same assertions (page as tab and section, rows top→bottom, mapped views incl. the switch). `e2e/README.md` lists the new spec and the board selectors.

### Gates
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 2103 passed (145 files) (BE-1 baseline 2048 / 142; new: `boardView.test.ts`, `pinDrag.test.ts`, `beState.runes.test.ts`).
- Chromium e2e, full suite (`PW_PORT=5197`): 107/107 (pre-slice baseline 100; `40-block-editor-board` adds 7). Flake check `40-block-editor-board` + `17-device-layout` with `--repeat-each=3`: 24/24.

### Review fix round (Opus regression review + workbench-reviewer)
- **Boards of the previous editor stay reachable.** Any first write of a family (a prefs click, a profile switch, one moved tile) marks it migrated, after which the old keys are never read — every other old profile then lost its board. Before that first write the editor now carries every profile's old board (`axs.surface3.<slug>.<profile>`, and for Default the pre-profile `axs.surface2.<slug>`) over to its desktop key (`carryLegacyBoards`, called by `BeState` before any save). Old keys are still never written or deleted.
- **Decision: the Setup / Controllers / Modifier screens use the new board too.** `VirtualScreen.svelte` mounted the old `ControlSurface`, so with a virtual effect open two board UIs edited the same slug under different keys. It now mounts `BeSurface` (same props), so both share the `axs.be1` keys; `ControlSurface.svelte` is now really unused and stays only as the fallback until slice 7 deletes it. (The first version of this entry called it unused; the virtual-effect screens still mounted it.)
- **The active page is kept.** The board reported what was in view before the effects that scroll the page back ran, so a Top/Side switch, a control-size change, a profile switch or a reload jumped to the first page. The active page is now held synchronously before those changes, and the board re-anchors the active page whenever its geometry changes (navigation, board size, cell size — panel resize, height drag, dock splitter, S/M/L) before it reports. Entering or leaving Arrange keeps the current page in view.
- **A click on a value and away writes nothing.** Committing the unchanged pre-filled text is a no-op (it used to re-round and re-write, with an undo entry). Parameters without a range now show and take typed values on the same 0..10 scale (typing used to read a percentage).
- **Arrange: 2-high (and taller) controls can be dropped into a new row.** Every page keeps as many spare rows below its content as the tallest item on the board.
- **Decision: grid map fold.** Folded by default in the workbench on every device class and on a phone in the monolith; unfolded by default only in the monolith on desktop / tablet. A stored fold state still wins (the ⋯ toggle comes in slice 3).
- **One device class for everything.** The board key, the phone chrome (tab row layout, slim workbench header), Arrange and hover read one tracked device class (`deviceClass.svelte.ts`): the workbench profile's breakpoint (a profile without one is desktop, as in the workbench), else the window width. A phone profile at a desktop window size (large UI scale, a pinned preview) now gets the phone chrome and no Arrange; the viewport media queries are gone.
- **Forgiving meta.** A `null` / garbage `migrated`, `autoPack` or per-class prefs entry is dropped instead of discarding the whole meta (which also re-opened the old keys).
- **Kept but not drawn controls block nothing in Arrange.** Move, resize, view change, the tray and tidy work on the drawn items only; the hidden ones go back at the end of their pages and the load-time normalization moves them aside when their key is listed again.
- **Performance.** The catalog keeps its entries while the parameter set is unchanged, so a device parameter event no longer rebuilds the board, the page layouts and every tile; board and meta are raw state. Probe (401 parameter events, mocked SSE): script time 0.68 s → 0.19 s, forced layouts 401 → 1.
- Timers (pin hold, page flash) are cleared when the editor goes away; `effectiveZoom` comes from the workbench barrel.

**Tests added:** `carryLegacyBoards` (two old profiles + pre-profile Default, no-op once migrated); `BeState` hand-over (profile switch, prefs click, tile move, reload); forgiving meta; unranged scale both ways; spare rows + drop into a new row; arrange on drawn items + normalization when the key returns; workbench device class; `anchorKey`. e2e in `40-block-editor-board`: later page kept through Top/Side and S/M/L (control size kept after a reload), click on a value and away writes nothing, seeded old boards survive the first change and a reload, the empty page's Arrange button, phone width without Top/Side and Arrange, the Setup screen on the same board. New `42-block-editor-pin.spec.ts`: a held knob dragged onto a custom panel is collected there; the right-click pin menu lists the panels and pins to the picked one.

**Gates:** `npm run check` 0 errors / 0 warnings; `npm test` 2117 passed (145 files); chromium e2e full suite 114/115 — the one failure is `21-pages-lossless` "the nav “+” opens the page menu…" (the workbench nav rail stays expanded after its context menu closes: a pointer-boundary race in the rail hover logic). Its page mounts none of the Block Editor components (no block is selected, no virtual screen is open) and it fails the same way in the full suite with the VirtualScreen change reverted; it is timing-dependent here — the `21-pages-lossless` file passed 42/42 with `--repeat-each=3` on its own in one run and failed this test 2/2 in another, and it passed in this slice's earlier full run. Flake check `40` + `17` + `42` with `--repeat-each=3`: 48/48.

### Open
- Arrange at the default workbench panel height: the arrange bar and the tray leave the board about 50 px, so arranging scrolls vertically (as with the old surface). Slice 5 replaces both bars.
- Phone (390 px): the grid map now starts folded, the wrapped tab row still takes two lines; the board scrolls vertically when a page is taller than the sheet (as before). Header in slice 3, touch in slice 7.
- Two open editors of the same slug (e.g. the Setup screen and a Block Editor showing the same virtual effect) each keep their own board state; a change in one shows in the other after a reload.
- All pages render at once; fine with the six-page mock, to be measured with large blocks (plan §7).
- Interim arrange paths without an e2e of their own (resize, cross-page drop, tray, view cycle, profiles) are covered by the model / view unit tests; their e2e comes with slice 5 (`43-block-editor-arrange`).


## ROUND BE-3 — Block editor rework, slice 3: header and ⋯ menu (AXIS-76, parent AXIS-73)

Branch `feature/block-editor-rework` (worktree `.wt-feature-block-editor-rework`), on top of ROUND BE-2 and the merge of `feature/ui-rework` (layout editor slices 1–4). The interim chrome of slice 2 (tab row with search / tabs / Top-Side / S-M-L / profile menu / Arrange, and the old footer) is replaced by the new header and its ⋯ menu in both shells. The interim arrange bar and "Add control" tray stay until slice 5.

### What changed
- **New header (`blockEditor/BeHeader.svelte`), one component for both shells** (monolith and workbench panel), rendered by `BeSurface` so it can read the board state. One row from 1240 px of editor width (860 px with the side navigation, whose pages are listed beside the board), two rows below: chip · state · ⋯ on top, tabs · search underneath (`headerRows`, pure). On a phone the chip gives way first (down to ~132 px) so the state segments stay on its row; with the monolith's close button (phone sheet) the chip and ✕ get row one, state · ⋯ row two.
  - **Type chip:** category glyph (tinted tile) + `FAMILY · TYPE` sub line + type name (cab: the slot summary, opens the CabPicker; otherwise the model CommandPalette, F6) + channel letter when the block has channels; a click on the letter unfolds A–D inline, a pick (or a press elsewhere) folds it again. Texts and behaviour from the pure `typeChip`.
  - **Page navigation:** top = tabs in the header (every visible page teal, the active one amber, a click scrolls, double-click renames and ＋ adds while arranging); side = a page list left of the board (`BePageNav variant="list"`), no heading and no counts, same highlight. The side navigation now depends on the editor width, not the board width (the list would otherwise shrink the board below 560 px and flip back).
  - **"Find a control…" (F5, `BeFind.svelte`):** a popover in the template style (FIND count, All / Unused filter, "Show all", groups Knobs & faders / Switches / Selectors / Graphs · meters · actions; a row = kind · current value · page chips; a row click jumps to the control — its page scrolls in and the tile flashes — a chip jumps to that page, ⚡ pins it in the workbench). Enter or "Show all" opens the flat, operable results of slice 2 in the board (with "✕ Back to the board"); Escape closes the popover, then the results. Opening the search ends Arrange. Below 640 px the search is an icon button with the field inside the popover. Fixed-positioned (zoom-safe), so a short panel never clips it.
  - **Engaged | Mute | Scene Ignore** as one joined group (green / red LED); Mute and Scene Ignore keep the "coming soon" toast (F7). Labels shorten on narrow editors (`Ignore`, `On` / `Byp`).
  - **⋯ (`BeMoreMenu.svelte` + pure `moreMenu.ts`)** on the workbench `ContextMenu` (radio rows, headers, inline confirm), opened under the trigger and right-aligned to it, in the overlay band: Arrange controls / Finish arranging (not on phones, F12) · Navigation Top tabs / Side list (radio; only where the side list fits or is the stored choice) · Control size Compact / Normal / Large (radio, F3) · LAYOUT · Default|Custom (status in the section header, amber when custom): profile radios, Reset this page, Reset all pages (confirm), New copy, Delete “copy” (confirm, active copy), Save as default for <family>, and with a saved default also Reset to device layout (confirm) and Forget saved default · Change type… / Choose cab… · Show / Hide grid map · Remove block from grid (confirm, `removeSelected`). An **amber dot on ⋯** while the active layout differs from its seed. In the monolith the menu gets the workbench token defaults (they read the app tokens).
- **Layout status and seeds (`boardPersistence.ts`, `beState.svelte.ts`):** `loadSeed` resolves a profile's seed — the family's "default for this type" board (`axs.be1seed.<slug>`, F8: per block family, tried before the device layout, not for Blank), else the device layout / curated fallback (Blank: empty) — and `loadBoard` ends in it. `BeState` keeps the active profile's normalized seed (`seed`, `userSeed`) and gained `resetPage` (the current page back from the seed via `resetPageFrom` in `boardModel.ts`, fresh ids where a seed id now lives on another page), `resetAll` (the whole seed), `saveAsDefault` (carries legacy boards over first) and `forgetDefault`; `resetToDevice` stays. `boardDiffersFromSeed` takes the catalog keys, so controls the catalog does not list right now (kept block-level keys) never make a layout "custom" (BE-1 open point).
- **Grid map (F1 override):** the strip sits under the header; its fold defaults stay as decided in slice 2 (folded in the workbench on every device class and on a phone in the monolith, unfolded in the monolith on desktop / tablet; a stored fold wins). ⋯ "Hide / Show grid map" removes / restores the whole strip, stored per browser (`gridMapPrefs.ts`, `axs.gridmap.hidden`).
- **`BlockEditor.svelte`** is now the shell only: height grip, phone sheet, ✕ (monolith, passed as the header's end), grid map, and the block chrome (`BeBlockChrome`: glyph, type, cab summary, channel, bypass, actions). The old header and footer are gone. The no-pack / reading / error states show in the board area while the header stays usable; a reload of the same block (channel switch, retype, cab pick) keeps the board instead of remounting it (the surface is keyed per block and only syncs once the parameters are ready). In a workbench pane the editor no longer opens a stacking context (`z-index: auto`), so the ⋯ menu and the search popover stack above the workbench chrome (the bottom bar covered the lower menu rows).
- **`VirtualScreen.svelte`** (Setup / Controllers / Modifier, monolith and `AxisVirtualScreenPanel`) mounts `BeSurface` without a block and gets the compact row: page tabs · search · the same ⋯ (no type / grid map / remove rows; "Save as default for Setup").
- The interim arrange bar got a "✓ Done" button (the old Arrange toggle moved into ⋯); a search jump flashes its tile (`flashId` on the tile host).

### Inventory (§2.1 #1–14 and the moved interim chrome)
#1 glyph → chip · #2 type → chip name (CommandPalette) + ⋯ Change type… · #3 cab summary / CabPicker → chip + ⋯ Choose cab… · #4 channel → chip letter, unfolds A–D · #5 ✕ → end of the header (monolith) · #6 height grip → unchanged · #7 phone sheet / minimize bar → unchanged · #8 grid map → strip under the header + ⋯ show / hide · #9 no pack / reading / error → board area, header usable · #10 Engaged / Bypassed → segment · #11 Mute → segment (coming soon) · #12 Scene Ignore → segment (coming soon) · #13 remove → ⋯ Remove block from grid (confirm) · #14 "select a block" → unchanged. Moved: search → header field + popover + flat results; tabs → header tabs / side list (rename + ＋ while arranging); Top / Side → ⋯ Navigation; S / M / L → ⋯ Control size; profile menu (switch, new copy, delete, reset to device) → ⋯ LAYOUT; Arrange toggle → ⋯ Arrange + Done in the arrange bar; footer Mute / Scene Ignore / Engaged / Remove → header segments + ⋯.

### Decisions
- Header threshold 1240 px with the top navigation, 860 px with the side navigation (as in the template: no tabs in the header then). At the default 1440 px workbench the Block Editor panel is 1382 px wide, so it is one row; two rows below ~1240 px (e.g. a 1180 px window).
- The ⋯ menu reuses the workbench `ContextMenu` (radio rows instead of the template's segmented controls) for keyboard navigation, inline confirms and one look with the workbench menus.
- The LAYOUT status compares against the profile's seed = the saved "default for the type" if there is one, else the device layout (template semantics: "Save as default" makes the current layout the reference). "Reset all pages" goes back to that seed, which is "reset to device" as long as no default is saved; with a saved default the menu adds "Reset to device layout" and "Forget saved default", so the device layout stays reachable.
- "Reset this page" and "Reset all pages" are disabled while the layout equals its seed; "Reset all", "Delete copy", "Reset to device" and "Remove block" ask inline first.
- The Top / Side choice is hidden where the side list cannot take effect (editor < 560 px) unless it is the stored choice (as in slice 2); a lone "Top" radio would do nothing.
- Page rename stays arrange-only (double-click on a tab or list entry while arranging).
- Delete copy works on the active copy (switch first); the old menu had a ✕ per profile.
- Grid map "Hide" removes the whole strip, independent of its fold.

### Tests
- Vitest: `headerModel.test.ts` (row threshold incl. side and unmeasured, fit / labels, type chip incl. cab / no pack / no channel), `moreMenu.test.ts` (rows per device class, side fit / stored side, radio state and actions, status / disabled resets, copies, saved default, cab, virtual screens, no board), `findControls.test.ts` (pages of a key, jump page, groups / query / unused, flat results), `gridMapPrefs.test.ts`, `boardPersistence.test.ts` (loadSeed, fallback order own → desktop → user seed → device seed incl. a type change, has / clear user seed, catalog-key filter of the status), `boardModel.test.ts` (`resetPageFrom`), `beState.runes.test.ts` (status after a change and Reset all, Reset this page, save as default as the seed of every profile and of a type change, reset to device, forget, legacy carry-over before saving the default).
- e2e: new `41-block-editor-header.spec.ts` (13 tests; the mock gained channel / bypass capture, `/preset/scene-state` and the block's type list). `40-block-editor-board` uses the ⋯ menu for Top / Side, control size, profiles and Arrange (same assertions); `e2e/README.md` lists the spec and the new selectors / helpers.

### Gates
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 2306 passed (158 files) (baseline after the merge 2267 / 154; new: `headerModel`, `moreMenu`, `findControls`, `gridMapPrefs` tests, plus additions to the persistence, model and `BeState` tests).
- Chromium e2e, full suite (`PW_PORT=5197`): 156/156 (baseline 143; spec 41 adds 13). Flake check `41-block-editor-header` + `40-block-editor-board` + `17-device-layout` with `--repeat-each=3`: 81/81.

### Screenshots (mocked amp, not committed)
One row at 1440 px with the panel maximized, the default panel at 1440 px (also one row), two rows at 1180 px (top and side), ⋯ menu (default and custom), channel letter unfolded, search popover, side page list, amber dot, phone 390×844 (header, menu, search); against a monolith dev server: desktop, its menu and the phone sheet.


### Review fix round (Opus regression review + workbench-reviewer)
- **Escape stays in the editor.** The search popover owns Escape on its root (not only on the field): any button inside closes it and focus returns to the field (or the icon button); the channel letters fold on Escape with focus back on the letter. The app's window Escape chain (close the editor in the monolith, restore a maximized panel) no longer sees these.
- **The popover opens by intent only:** a press on the field, typing, or ArrowDown (which also walks into the rows; ↑ / ↓ move between rows). Plain focus (Tab through the header) neither opens it nor ends Arrange; focus leaving field and popover closes it.
- **Header controls work while the flat results show:** a page tab and ⋯ Arrange close the results first (the board was not mounted, and Arrange was switched straight back off).
- **"Forget saved default" no longer leaves the forgotten board on screen:** a board still loaded from the saved default reloads (without writing) to what the profile loads now — the device layout; boards the profile saved stay. `BeState.source` now follows saves.
- **Stacking bands (decision).** All floating parts of the editor live in deliberate bands (`blockEditor/overlayLayer.ts`): ⋯ menu, search popover, select popover, value bubble, modifier flyout and pin menu in one fixed OVERLAY layer (z 240 = the ContextMenu overlay band: above dock openers 170, drawers 180, nav sheet 230; below toasts 300 and the modals 360–400), the hold-to-drag pin chip in the DRAG band (1000, as the DragLayer). In the workbench both layers move to the shell's outermost element (`.aw-viewport`, which carries the `--aw-*` tokens), so a maximized tab stack (a fixed z-50 context) no longer puts the dock openers over the lower ⋯ rows. Inside a layer the parts use small local z-indexes (select 1–2, bubble 3). The editor keeps its own stacking context again (`.ed.embedded { z-index: 0 }`), and the board, the flat results and the grid-map strip are `isolation: isolate`, so in-panel z-indexes never meet the dock chrome. In the monolith (no workbench shell) the layers stay inside the editor.
- **"Reset this page"** is enabled only when the current page differs from its seed page (`pageDiffersFromSeed`), asks first and says what happens; a page the seed does not have reads "Clear this page" ("… is not in the device layout — clear it?"). An unchanged page writes nothing.
- **Blank:** "Clear all pages" / "Clear this page" with clear-wording prompts; no "Reset to device layout" / "Forget saved default" rows.
- **Channel letters:** focus moves into A–D on open and back to the letter after a pick or Escape; ← / → move between letters. On a phone they open as a bar over the first header row (40 px targets do not fit inside the chip).
- **Tab order = visual order:** the header renders its parts in document order per layout (`headerOrder`, pure) instead of CSS `order`, so Tab walks row 1 (chip, state, ⋯, ✕) before row 2 (tabs, search).
- **Phone hit targets ≥ 40 px:** chip, channel letter / letters, segments, ⋯, tabs, search icon / field, the monolith's ✕, and the popover's rows, chips and buttons.
- **⋯ rows without a board** (no pack, reading, error, nothing loaded): Arrange, Navigation, Control size, the profile radios and every layout action are disabled; the block rows (change type, grid map, remove) stay.
- **Labels:** "Save as default for …" falls back to the pack / base name / "this block" (never "—"); families sharing a short label get distinct names (`familyLabel`: Comp vs "Multi Comp"). The no-pack message no longer claims bypass works (it never did without a pack).
- **Find list** is built only while the popover is open; the flat results carry its All / Unused filter.
- **Header row break from the parts' widths** (`oneRowMinWidth`, `HEADER_PARTS`): one row once every part fits at its widest (chip at its cap, search, "Bypassed | Mute | Scene Ignore", ⋯, the close button when there is one, and with the top navigation a minimum share for the tabs; never below 1240 px with the tabs). The side-navigation threshold is now 996 px (1034 px with ✕) instead of 860 px, where a long cab chip wrapped undesigned. Measured: state group 253 px (constant 290), chip 199 px for "PLEXI 100W" (cap 392).
- **Popover placement** uses the workbench's tested `resolveAnchoredMenuPlacement` (under the header, right-aligned to the field) and re-places on a ResizeObserver of the field and the header (panel / split resizes), not only on window resize.
- **⋯ anchor width** comes from one named constant (`MORE_MENU_W`, documented as coupled to the ContextMenu's anchored width; the ContextMenu has no alignment option); the status row is styled through its public `className` hook only.
- **Storage guard:** the grid-map flag reads `localStorage` through `browserFlagStore()` (a blocked store is null, never a SecurityError at init).
- **The grid map stays mounted on a block switch:** the surface is no longer keyed per block; a `resetKey` gives each block a fresh view (no search / results / arrange / menu / select / flyout carried over), and the reading message shows on a block switch until the new block is ready while a reload of the same block keeps its board.

**Tests added:** `headerModel.test.ts` (row break from the part widths incl. side and ✕, document order per layout, `familyLabel`), `moreMenu.test.ts` (Reset this page enable / prompts incl. a page outside the seed and a saved default, Blank wording and rows, every board row disabled without a board, "this block" fallback), `boardPersistence.test.ts` (`pageDiffersFromSeed`), `beState.runes.test.ts` (unchanged page writes nothing; loading from the saved default writes nothing and forgetting it shows the device layout without writes; a saved board survives forgetting), `findControls.test.ts` (Unused carried into the flat results), `gridMapPrefs.test.ts` (`browserFlagStore`), new `overlayLayer.test.ts` (bands, move to the shell root, monolith stays). e2e in `41-block-editor-header` (+8 → 21 tests; the mock gained a cab, a block without a pack and a block whose read fails, and bypass capture per block): Escape from a popover button / the channel letters keeps a maximized panel maximized and focus returns; Tab passes through the header without opening the popover or ending Arrange, ArrowDown opens it, focus leaving closes it, one-row Tab order; two-row Tab order (tablet profile at 1100 px, deliberately); page tab and ⋯ Arrange while the results show; ⚡ pin from the popover; Unused + Show all; the cab chip and "Choose cab…" open the cab picker; no-pack and read-error states with a usable header; "Clear this page" on a page outside the default layout.

**Gates:** `npm run check` 0 errors / 0 warnings; `npm test` 2324 passed (159 files) (slice-3 first round 2306 / 158); chromium e2e full suite (`PW_PORT=5197`) 164/164 (first round 156; spec 41 now 21 tests); flake check `41` + `40` + `17` with `--repeat-each=3` 105/105. Screenshots refreshed in the scratchpad (workbench desktop / two rows / phone incl. the channel bar, monolith desktop / menu / phone).

### Open
- Mute / Scene Ignore stay placeholders until the device-side item (F7).
- The ⋯ menu is long on a phone (touch rows); it scrolls under the trigger.
- Monolith behaviour is checked by screenshots only (no monolith e2e harness).
- Interim arrange bar / tray, the page menu (S) and Escape-ends-Arrange come with slice 5; pin / modifier / context menu with slice 4.

## ROUND BE-4 — Block editor rework, slice 4: pin, modifier and the control menu (AXIS-77, parent AXIS-73)

Branch `feature/block-editor-rework` (worktree `.wt-feature-block-editor-rework`), on top of ROUND BE-3. Everything done to one control outside Arrange: the hover actions ⚡ / ∿, the pin paths and the new control menu, in both shells.

### What changed
- **Hover actions on a tile (`BeControl.svelte`; normal mode, pointer devices):** ⚡ top left = pin, ∿ top right = modifier, 16–20 px from the cell size, shown on hover or keyboard focus inside the tile (an invisible action takes no press). Not on phones (`deviceClass`), not on touch-only screens (`hover: none`; the long-press menu carries both there).
  - **⚡** only where a control can be pinned (continuous / toggle / select with a parameter id; not the meter, the bypass action, the EQ graph or the looper). A click pins to the **default target: a new custom panel named after the control** — the target the arrange ⌖ of the previous editor used (`AXIS_PIN_SELECTED_PARAMETERS_ACTION` without a panel; `pinActionArgs`). Pressing ⚡ and moving 3 px (`PIN_PRESS_DRAG`) starts the pin drag at once (no 380 ms hold); the release over a panel / tab bar / dock edge drops it like the hold-drag, and the click that follows a drag is swallowed.
  - **∿** only on continuous controls: the docked modifier panel when one is mounted, else the flyout (same `axisBlockEditorModifierController` path as before). Escape closes the flyout and stays in the editor (a maximized panel stays maximized).
  - The 380 ms hold-drag on the tile body is unchanged; its chip's "no target" text now reads "drop on a panel, tab bar or dock edge".
- **Control menu (`controlMenu.ts` pure builder + `BeContextMenu.svelte` on the workbench `ContextMenu`, overlay band):** right-click, long-press on touch, Shift+F10 / the ContextMenu key on a focused tile (opened at the tile, focus returns to it on close). Header "<control> · <page>", then **Pin to ▸** (the `buildAxisPinMenuItems` targets: custom panels with their widget counts, **New tab beside the editor** — a Controls tab right after the editor's tab in its own stack, the same parameter-source drop as a pin drag on a tab bar — and New custom panel), **Edit modifier…** (continuous only), **View ▸** (the views of the control's kind, radio), **Size ▸** (S / M / L of the current view from the slice-1 size table, radio, "Custom" listed when the current size is none of them), **Move to page ▸** (the other pages; one that already holds the control is disabled with "already there"), **Grid swipe control** (its own icon ⇆, `on` / `off`, amber while assigned; `editor.isSwipeControl` / `toggleSwipeControl`), **Remove from page**. Every row carries a `be-ci-<id>` class (icons, e2e hooks). On a phone (no Arrange, F12) View / Size / Move / Remove are left out; Pin, Modifier and the swipe control stay, rows 44 px. Tiles of the flat search results get the menu without the layout rows. Escape walks back out of a submenu, then closes; it never reaches the app's window Escape chain.
- **Board changes from the menu** go through `BeState.commit` (one save per action, none when nothing changed), with Auto-pack tidying the touched pages, and hold the active page (`holdActive`) so it stays in view. New pure ops in `boardModel.ts`: `sizeItem` (a size preset, clamped to the view; when it does not fit in place the item moves to the nearest free spot on its page instead of being refused, `moved: true` → toast) and `moveToPage` (first free spot of the other page; refuses a page that already holds the key, own page = no-op). View uses the existing `setView` (next free spot when needed).
- **`pinDrag.ts`:** `PIN_PRESS_DRAG`, `pinActionArgs` (default target), `edgeDropArgs` (shared by the drag drop and "New tab"), `tabIndexAfter` / `editorTabTarget` (the editor's stack and the index after its tab).
- **Interim arrange chrome:** the tile's ⌖ (pin) and ⚡ (grid swipe control) badges are gone — the control menu also opens in Arrange and reaches both (and the modifier). ✕, the view cycle and the corner resize stay until slice 5 rebuilds Arrange.
- `beHost.ts`: `pinPress` / `pinClick` / `ctxMenu` / `ctxLongPress` / `ctxKey` replace `pinMenu` / `pinLongPress` / `pinToWorkbench` / `toggleSwipe` / `isSwipe`. The old pin-only menu is gone.

### Inventory (§2.2 #17, #25–#30)
#17 views → control menu View ▸ (Arrange selection bar in slice 5; the interim arrange view cycle stays) · #25 ∿ modifier → hover ∿ + menu "Edit modifier…" (flyout or docked panel) · #26 ⚡ grid swipe control (Arrange only) → menu "Grid swipe control" with its own icon ⇆ (normal mode and Arrange; selection bar in slice 5) · #27 ⌖ pin (Arrange only) → hover ⚡ (click = default target) + menu Pin to ▸ (selection bar "Pin" in slice 5) · #28 380 ms hold-drag → unchanged; new: ⚡ press-drag starts at once · #29 right-click / long-press pin menu → menu Pin to ▸ (same targets plus "New tab beside the editor") · #30 Pin page → unchanged in the interim arrange bar (page menu in slice 5). Also from the menu: #46 size → Size ▸ presets, #47 remove → Remove from page.

### Decisions
- Default ⚡ target = a new custom panel (what the arrange ⌖ did); choosing an existing panel or a new tab is the menu's job.
- The template's segmented View / Size rows and page chips became submenus with radio rows (the ⋯ menu's pattern: keyboard navigation, one look with the workbench menus).
- "New tab" is offered only where the editor sits in a workbench tab stack (not in the monolith or a phone sheet without one).
- Size ▸ never refuses: an item that does not fit in place moves to the nearest free spot (toast), as `setView` / `resizeItem` do.
- The control menu also works in Arrange (until slice 5's selection bar), which is why the interim ⌖ / ⚡ badges could be retired now.
- Hover actions are hidden on touch-only screens (`hover: none` — an input capability, not a phone decision); phones are decided through `deviceClass` only.
- The modifier opens from the menu in Arrange too (the hover ∿ stays normal-mode only).

### Tests
- Vitest: `controlMenu.test.ts` (rows per view kind, continuous vs not, phone / no layout, flat results, page duplicates disabled, swipe state, pin targets incl. New tab, actions; `sizeChoices`), `boardModel.test.ts` (`sizeItem`: in place, nearest free spot, right edge, clamp / missing; `moveToPage`: first free spot, duplicate refused, own page, full page), `pinDrag.test.ts` (⚡ press threshold, `pinActionArgs` default / panel, `edgeDropArgs`, `tabIndexAfter`).
- e2e `42-block-editor-pin.spec.ts` (2 → 14 tests): hold-drag onto a custom panel; ⚡ on hover (invisible = no press) and a click pins to a new custom panel; ⚡ press-drag onto a custom panel without a hold; Pin to ▸ lists the panels / New tab / New custom panel and a panel pick pins there; Pin to ▸ New tab adds a Controls tab after the Block Editor; ∿ opens the flyout, Escape (flyout, then a submenu and the menu) keeps a maximized panel maximized, toggles have no ∿; with the modifier panel docked (seeded into the stored workbench document) ∿ and the menu row target the panel; View ▸ knob → fader kept after a reload; Size ▸ Large without overlaps; Move to page ▸ (a page already holding it disabled); Remove from page; Grid swipe control on / off; Shift+F10 and the ContextMenu key (focus returns); phone menu without layout rows (touch rows); the menu in Arrange (badges gone). `40-block-editor-board` only had a comment about the arrange chrome updated; `e2e/README.md` describes spec 42 and the menu's `be-ci-<id>` rows.

### Gates
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 2350 passed (160 files) (BE-3 2324 / 159; new `controlMenu.test.ts` 14, `boardModel.test.ts` +7, `pinDrag.test.ts` +5).
- Chromium e2e, full suite (`PW_PORT=5197`): 176/176 (BE-3 164; spec 42 now 14 tests). Flake check `42-block-editor-pin` + `40-block-editor-board` + `15-param-collect` with `--repeat-each=3`: 108/108.

### Screenshots (mocked amp, not committed)
Hover ⚡ / ∿ on a knob (and ⚡ hovered), the control menu, its Pin to ▸ / View ▸ / Move to page ▸ submenus, the swipe control on, a ⚡ pin drag in flight over a custom panel, the modifier flyout, the phone menu (390×844).

### Review fix round (two reviewers)
- **Hover actions never cover the control.** ⚡ / ∿ showed on one-row tiles: a click in the top-left corner of a 2×1 button pinned it instead of toggling, and the default 6×1 slider had ⚡ over its label and ∿ over its value. A pure rule in `boardView.ts` — `hoverActionsFit` on `tileContentBox`, which mirrors the tile layout (the tile's size helpers now come from the same module) — shows them only on tiles of two rows or more where a free strip above the centred content, or room beside it, holds them; a knob keeps the corners of its dial free. Other tiles use the control menu. Decision: the fader's value read-out is estimated at six characters, so the actions do not come and go with the value. At the normal density every knob and a 2×2 switch keep them; a 2×2 pill / select / number and a 2-wide fader do not.
- **The long-press never interrupts a gesture.** It opened the menu on top of the pen's 380 ms hold-drag (the chip died at ~690 ms) and, in Arrange on touch, dropped a still or slowly started move. It now opens the menu only on a still press in normal mode (`longPressOpensMenu`: never in Arrange — as before slice 4 —, during a pin drag or ⚡ press, an arrange move / resize, or once a value drag moved), and the tile's long-press uses the drag threshold (`DRAG_START_PX`) as its movement tolerance.
- **The flyout's Escape no longer swallows every Escape.** It listened on the window in the capture phase and stopped every Escape while open. It now listens on the document in the bubble phase — after the elements that handle their own Escape, before the app's window chain (closing the editor, restoring a maximized panel) — and leaves the key to whatever handled it (`defaultPrevented`) and to another overlay open on top (palette, dialog, menu, drawer: `ESCAPE_OVERLAYS`, the set the workbench checks before restoring a maximized panel) unless the key went into the flyout (`flyoutTakesEscape`). Opening the control menu closes the flyout.
- **The grid swipe control is honest.** The toast follows the state after the toggle (none when nothing changed), and the row is left out where the editor keeps no swipe controls: `EditorSurface.canSwipeControl` (live editor: needs a block family; the offline convert buffer: never), decided in the builder (`swipeSupported`).
- **The active page stays in view after every menu change.** A control moved onto an earlier page widens it and pushed the active page along the strip (the board re-anchors only on navigation, board size and cell size). `commitMenuOp` now brings the active page back into place (`scrollSoon`) after View, Size, Move and Remove.
- **A right-click in an open value field** keeps the field (no control menu); text fields are skipped for the menu keys too (`isEditableTarget`).
- **A menu whose rows are gone closes for good** (the menu state is cleared when its list is empty).
- **Remove from page outside Arrange** stays one click without undo (the editor's undo comes with Arrange in slice 5); the toast says "Arrange → Add brings it back". Decision.
- **Pin to ▸ tells same-named panels apart** (`placePinTargets`, app side, using the public workbench selectors `selectPanelPlacement` / `selectActivePage` / `selectPanelLocation`): a panel on another page shows that page, a panel on no page "not on a page", panels sharing a name on this page their dock region; a panel on this page with a name of its own keeps the plain count. `buildAxisPinMenuItems` and the workbench are unchanged.
- **Input decisions extracted** into `controlMenuInput.ts` (pure): the menu keys, the keyboard anchor (a contextmenu event without pointer coordinates opens at the tile), the 600 ms echo rule, editable targets, the long-press rule and the flyout's Escape rule.

**Tests added:** Vitest `controlMenuInput.test.ts` (10), `boardView.test.ts` (+6: hover actions fit, content box), `controlMenu.test.ts` (+3: no swipe row without support, `placePinTargets`). e2e spec 42 (14 → 21): one-row tiles without hover actions (a 2×1 button toggles where ⚡ sat, nothing is pinned; the 6×1 slider); a touch hold opens the menu, the pen's hold-drag reaches a custom panel undisturbed, and in Arrange on the tablet profile a touch hold opens no menu while a slow drag still moves the tile (synthetic touch / pen `PointerEvent`s); the Ctrl+K palette gets the first Escape over the flyout, and the control menu takes over from the flyout; Move to page ▸ onto an earlier page keeps a later active page at the start of the board (fails without the re-anchor: 88 px off); a right-click in an open value field; View / Size / Move / Remove kept after a reload, and Size / Move / Remove each saved exactly once (board writes counted in the stored surface document); the panel pick asserts that the chosen panel got the control; the docked modifier panel is seeded into the stored document at the next load (no fixed wait). The long-press and re-anchor tests were checked to fail with the old code paths.

**Gates:** `npm run check` 0 errors / 0 warnings; `npm test` 2369 passed (161 files) (first round 2350 / 160); chromium e2e full suite (`PW_PORT=5197`) 183/183 (first round 176); flake check `42-block-editor-pin` + `40-block-editor-board` + `15-param-collect` with `--repeat-each=3` 129/129. Screenshots added: Pin to ▸ with the place hints, a 2×2 switch with ⚡, the 2×1 button and the 6×1 slider without hover actions.

### Open
- The ∿ does not show whether a modifier is assigned (the template's lit ∿) — needs per-parameter modifier state from the codec through the server (filed separately).
- Arrange keeps the interim ✕ / view cycle / corner resize and the Pin page button until slice 5 (selection bar with View, Size, Pin, the swipe control and Remove; page menu with "Pin page as panel"; the editor's undo).
- Several 2×2 tiles (pill, select, number) and 2-wide faders show no hover actions at the normal density; pin and modifier are in their control menu.
- The menu's header is plain text (no kind icon / sub line as in the template).

## ROUND BE-5 — Block editor rework, slice 5: arrange mode (AXIS-78, parent AXIS-73)

Branch `feature/block-editor-rework` (worktree `.wt-feature-block-editor-rework`), on top of ROUND BE-4. Arrange after the template: one compact arrange bar replaces the interim bar and the "Add control" tray, the "Add" library, the Page ▾ menu, dividers, keyboard and undo — in both shells and on the virtual-effect screens.

### What changed
- **Split out of `BeSurface.svelte`** (−~560 lines of interim arrange code): `beArrange.svelte.ts` (the controller: selection, the move / resize / library-drag gestures with their drop preview, the keys, every arrange operation and the page operations; DOM only — hit-testing grids, window listeners, focus), pure `arrangeModel.ts` (key → action, nudge / grow maths, the Escape order, Close gaps / Tidy up / Auto-pack on pages, the library's add and grab cell, `keepSelection`), pure `arrangeHistory.ts` (the capped undo stack), pure `arrangeBar.ts` (the selection model, the one-row fit, the ⋯ rows), pure `pageMenu.ts` (the Page ▾ rows), and the components `BeArrangeBar.svelte`, `BeLibrary.svelte`, `BePageMenu.svelte`.
- **Enter / leave:** ⋯ "Arrange controls", or the empty page's "Arrange" (normal mode), which opens Arrange with the library open. "✓ Done" and **Escape** leave. Escape goes, in order, to whatever owns it (a menu, a field, the library's own field), then cancels a running drag / resize, then closes the library, then ends Arrange — and never reaches the app's window Escape chain while arranging (a maximized panel stays maximized). Opening the search still ends Arrange. Phone: no Arrange (F12); tablet: yes, with ≥ 40 px targets.
- **The arrange bar (`BeArrangeBar.svelte`)** — one row under the header: the selection's tools (a control: name, View segment, Size S / M / L, ⚡ Pin (the slice-4 default target), ⇆ grid swipe control (own icon, F2), ✕ Remove; a divider: name, label field, ⟲ Rotate, ✕ Remove) or a hint, then ↶ Undo · + Control (the library) · Divider ― / │ · Close gaps · Tidy up · Auto-pack (F4, default off, stored in the family meta as before) · Page: <name> ▾ · ✓ Done. It never wraps: the parts are measured in a hidden copy of the row and `fitBar` drops them in a fixed order (hint, tag, Auto-pack, Tidy up, Close gaps, dividers, the name, Page, swipe, pin, size, view, label, rotate, Undo, Remove, + Control; Done never) into a "⋯" at the end of the row (workbench `ContextMenu`: View / Size as radio submenus, the label as an input row, Page as a submenu). At the default workbench panel height the board now keeps ~183 px in Arrange (was ~50 px with the interim bar and tray).
- **Board in Arrange:** the dotted 24-cell grid; a press on a tile selects it (outline, its w×h on top, the corner handle) and a drag moves it with the teal / red preview, also directly onto another page of the strip (a page that already holds the control is refused, red); edge auto-scroll as before; the corner handle resizes (also shown under the pointer on pointer devices — an input-capability query, not a viewport one; a 40 px target reaching past the corner on the tablet); the tile's w×h shows while resizing. Arrows move the selection one cell, Shift+arrows resize it by one cell, Delete / Backspace remove it (only for keys aimed at the editor, never in a text field). A press on empty grid clears the selection. The cell stays frozen while arranging; a new panel width re-freezes it between gestures (a width change during a gesture is picked up when it ends). The interim per-tile ✕ / view cycle are gone (the ⌖ / ⚡ badges went in slice 4).
- **Dividers (hdiv / vdiv):** "Divider ― / │" adds one at the first free spot of the current page, selected, with the bar's label field focused (Enter or leaving the field saves, Escape puts the stored label back and stays in Arrange); they drag and resize like controls, Rotate switches the kind (refused without room), the label goes along. Outside Arrange a divider is the template's labelled line. Persisted with the board (model since slice 1).
- **Page ▾ (`pageMenu.ts` + `BePageMenu.svelte`, overlay band):** headed by the page; Rename… (inline field; an empty or taken name keeps it open — a double-click on a tab / list entry while arranging still renames too), Duplicate (a copy right after it with fresh ids, shown next), **Pin page as panel** (#30: the page's pinnable controls into a new workbench custom panel through the same `AXIS_PIN_SELECTED_PARAMETERS_ACTION` path the old "Pin page" button used; titled "<block> · <page>"; only with a workbench, disabled with nothing to pin), Move left / right (up / down with the side list), Delete page (inline confirm; never the last page), Add page.
- **The "Add" library (`BeLibrary.svelte`, overlay band):** a popover under the bar (above it when there is more room there), right-aligned to "+ Control" (or to the ⋯ when "+ Control" went into it), zoom-safe and following the bar: search field, count, All / Unused, the Find popover's groups, each row with kind · view · size and a mark "on this page" / "on <page>". A click adds the control at the first free spot of the current page (a control already there is selected instead, with a toast); dragging a row places it at the exact spot with the same teal / red preview (also on another page of the strip) while the library fades out of the way. It stays open while arranging (✕, Escape, "+ Control", Done close it).
- **Undo (`arrangeHistory.ts`, state in `BeState`):** every committed change while arranging — move, resize (one step per gesture: `flush(before)`), view, size preset, add, remove, divider ops, Close gaps, Tidy up, page ops, and also the ⋯ resets and the control menu's View / Size / Move / Remove when used in Arrange — pushes the board it replaced (immutable, so a reference); capped at 50; Undo puts it back on the page the user is on when that page still exists, and saves once. Cleared when Arrange starts or ends, on a profile switch, a new copy, a deleted active copy, forgetting the saved default and on every (re)load (block switch, remote revision). **Ctrl/Cmd+Z** belongs to it while arranging (F13): taken in the window's capture phase, before the preset history sees it (the workbench's layout history listens only while Customize is on — independent, F15); Ctrl/Cmd+Shift+Z / Ctrl+Y are taken as no-ops (there is no redo); text fields keep their own undo. Outside Arrange nothing changed.
- **Every change** goes through `BeState.commit` (one save per action; none when nothing changed), Auto-packed where it applies, and keeps the active page where it is on screen (`BeBoard.holdPage`, pure `offsetInPage` / `scrollAtOffset` in `boardView.ts`); a new item is revealed (`revealItem`), a page op shows its page.
- **The virtual-effect screens** (Setup / Controllers / Modifier) mount the same surface: Arrange works there the same way from the compact row's ⋯.
- `BePageNav`: Enter / Escape in the tab rename field are kept from Arrange and the app's Escape chain. `beHost.ts`: `selectedId` / `resizingId` / `touchArrange` replace `remove` / `cycleView`.

### Inventory (§2.2 #17, #30, #34, #35, #44–#52)
#17 views → **A** bar "View" segment (+ control menu View ▸ from slice 4); the interim view cycle is gone · #30 Pin page → **S** Page ▾ "Pin page as panel" (same action path) · #34 page rename → double-click on a tab / list entry while arranging + **S** "Rename…" · #35 add page → **S** "Add page" + the "+" after the tabs / list while arranging · #44 Arrange on/off → ⋯ "Arrange controls", the empty page's "Arrange", Done / Escape; phone none, tablet yes (F12); the search ends it · #45 ghost move → teal / red preview, cross-page directly onto any page of the strip (duplicates red), edge auto-scroll · #46 corner resize → corner handle on the selection (and under the pointer) + bar Size S / M / L + Shift+arrows · #47 remove ✕ → bar ✕, Delete / Backspace, control menu · #48 w×h → on the selected tile and while resizing · #49 Packed / Free → bar "Auto-pack" (F4, default off) · #50 Tidy up → bar, beside Close gaps · #51 tray "Add control" → "+ Control" library: click = first free spot, drag = exact spot · #52 empty page hints → normal mode: "This page is empty." + "Arrange" (opens the library); in Arrange: "Empty page — “+ Control” adds one, or drag one in from the library". Also from §2.3: dividers with label and rotate, Close gaps, Undo in Arrange, cross-page drag, duplicate / move / delete page.

### Decisions
- The bar follows the template's order; Tidy up (#50) and Auto-pack (F4) sit after Close gaps. The library button keeps the template's "+ Control" wording.
- One row always: what does not fit goes into a "⋯" at the end of the bar (never a second row); Done never goes.
- The empty page's "Arrange" opens the library at once (an empty page needs something to add).
- The library stays open while arranging and fades during its own drag; a click on a control already on the page points at it instead of refusing silently.
- No redo in Arrange (none in the template); its keys are still taken while arranging so the preset history cannot redo under the user. Undo cap 50.
- Arrows are never Auto-packed (it would pull the item straight back); Shift+arrows, the corner resize, size presets and adds are.
- Escape: drag → library → Arrange (menus and fields keep their own Escape).
- Resets from ⋯ while arranging are undoable steps too (they go through the same commit).
- "Pin page as panel" names the panel "<block> · <page>" (was "<block> Controls").
- Outside Arrange, "Remove from page" stays one click without undo (slice-4 decision); in Arrange its toast points at Ctrl+Z.

### Tests
- Vitest (+48 → 2417 in 165 files): `arrangeModel.test.ts` (22: keys, nudge / grow maths, Escape order, Close gaps / Tidy up / `tidyPages`, the library's first free spot / exact spot / refusals / grab cell, cross-page move with duplicate refusal and kept not-drawn controls, divider add / label / rotate, page duplicate / move / delete with fresh ids and the active page kept), `arrangeHistory.test.ts` (5: push / pop / cap / immutability / restore page), `arrangeBar.test.ts` (8: selection model, parts, `fitBar` drop order / ⋯ / Done never goes, the ⋯ rows), `pageMenu.test.ts` (7), `beState.runes.test.ts` (+5: one step per commit and one save per undo, page kept, nothing undoable outside Arrange and the cap, `flush(before)` = one step, cleared on Arrange start / end, profile switch and reload), `boardView.test.ts` (+1: keeping a page in place).
- e2e new `43-block-editor-arrange.spec.ts` (18 tests): a drag to a free spot (teal) kept after a reload; a collision refused (red, nothing moves, nothing to undo); the corner resize (w×h, one undo step); a drag onto another page of the strip and a page that already holds the control (red); arrows / Shift+arrows / Delete and Ctrl+Z through each step; a click on empty grid clears the selection, the bar's View / Size / Pin / swipe / Remove; a divider added, labelled, rotated, kept after a reload and drawn as a line outside Arrange; Close gaps and Tidy up; Undo by button and Ctrl+Z with one board save each, cleared on Done, Ctrl+Z outside Arrange leaves the board alone; Page ▾ rename (and the tab double-click), duplicate (fresh ids), move, delete with confirm (undo brings it back), the last page not deletable; Pin page as panel; the library's click / drag / red drop / "on this page"; Escape closes the library and the page menu before ending Arrange (a maximized panel stays maximized); the default panel height (one-row bar, usable board); tablet (40 px targets, the ⋯ overflow, the empty page's Arrange opening the library); phone without Arrange; a layout profile switch while arranging; the Setup screen. Migrated: spec 40's arrange drag (the moved tile is the selection; comments), spec 41's remove-in-Arrange (select + bar ✕) and the tray click (library), spec 42's Arrange → Add (library); `countBoardSaves` / `boardSaves` moved into `support/blockEditorMock.ts` (also `selectTile` / `openLibrary` / `arrangeAdd`); `e2e/README.md` describes spec 43 and the arrange selectors.

### Gates
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 2417 passed (165 files) (BE-4 2369 / 161).
- Chromium e2e, full suite (`PW_PORT=5197`): 201/201 (BE-4 183; spec 43 adds 18). Flake check `43-block-editor-arrange` + `40-block-editor-board` + `42-block-editor-pin` with `--repeat-each=3`: 156/156.

### Screenshots (mocked amp, not committed)
Arrange at the default workbench panel height, maximized with a selected control, a drag with the teal preview and one with the red, a divider with its label (and in normal mode), the Page ▾ menu, the Add library (maximized and at the default height), a library drag in flight, tablet Arrange and its ⋯.

### Open
- The template also opens the page menu from a right-click on a tab; here it is Page ▾ in the bar only.
- A tile drag shows the drop preview in the grid but no floating copy of the tile under the pointer.
- At the default workbench panel height the board in Arrange shows about one and a half rows of 2×2 knobs (the cell stays frozen at its normal-mode size, the spare rows scroll).
- Undo has no redo.

### Review fix round (two reviewers)
- **Escape with the library open reached the app (must-fix).** The library is a `role="dialog"`, which is in `ESCAPE_OVERLAYS`, so while it was open Arrange's Escape always saw "another overlay" and let the key through to the app's window chain (closing the editor in the monolith, restoring a maximized panel); a mobile dock drawer holding the editor blocked it the same way. The overlay check now ignores the editor's own floating layer (library, menus) and any overlay that contains the editor (`isForeignOverlay`), and a running drag takes Escape before any overlay / field check (`arrangeEscape`: drag → library → Arrange). Escape inside the library during a library drag now cancels the drag (nothing is added) and keeps the library open (`libraryEscape`).
- **A divider label went to whatever was selected when its field lost the focus (must-fix).** A press on another tile selected it before the field's change event fired, so the text landed on the new selection (or was lost on empty grid / a control). The field carries its divider's id (`data-be-div`, read at commit time; the ⋯ input row captures it when built) and `label(id, text)` writes that divider.
- **Window listeners only while arranging.** `arr.attach()` (pointer move / up / cancel, the capture-phase Ctrl/⌘+Z, the arrow keys' release) now runs from an effect gated on `be.editMode` in every editor instance (VirtualScreen too) and is removed when Arrange ends or the editor goes.
- **The library takes the focus only when it opens**, not on every anchor change (a selection change can move "+ Control" into the ⋯); moving the trigger only re-places it.
- **Shared menu rows:** `viewSubmenu` / `sizeSubmenu` / `swipeRow` (+ `rowClass(prefix)`) in `controlMenu.ts` build the control menu's and the arrange ⋯'s View ▸ / Size ▸ / swipe rows; the bar's size titles use `SIZE_NAME`.
- **One controller for board edits:** the control menu's View / Size / Move to page / Remove go through `BeArrange` in both modes (`view` / `size` / `moveTo` / `remove`; an undo step only while arranging, since only then does `BeState.commit` push one); BeSurface's `drawnOp` / `tidyPages` / `commitMenuOp` / `menu*` copies are gone; one remove toast ("Removed <name> from <page> — Ctrl/⌘+Z brings it back" in Arrange, "— Arrange → Add brings it back" outside).
- **One menu component, one layer:** `BeMenu.svelte` replaces `BeMoreMenu`, `BeContextMenu` and the slice's `BePageMenu` (anchored or at a position, the token defaults, the right-click guard and every row icon — the bolt once); the arrange bar's Page ▾ / ⋯ (their state bound out of the bar) and the "Add" library render inside BeSurface's one overlay layer, so a control menu opened over the library stacks above it (it used to open under the library's later-mounted layer).
- **Undoing "Add page" / "Duplicate"** brings the restored current page into view when the page the user was on went away with it (`pageToShowAfterUndo`); before, the scroll stayed where the vanished page was and the active page followed it.
- **Undo during a gesture** is a consumed no-op while a drag or resize runs (it changed the board under the gesture and the resize then pushed the undone step again). **A held arrow key** is one step: the repeats are previewed and saved once when the key is released (a 1.2 s idle fallback closes the step if the release never comes; any other edit, press or undo closes it first) — before, every auto-repeat was its own step and save.
- **Ctrl/⌘+Z only when aimed at the editor** (its root, its own layer, or no focus in particular) and never while someone else's dialog / menu is open; otherwise it goes on to whoever owns it.
- **Smaller:** the kind glyphs live once in `findControls.ts` (`KIND_ICON`, the Find popover and the library); `nextView` (dead) and its test are gone; `itemIdOn` and an exported `writePage` are reused; Close gaps / Tidy up share `onPage(board, page, fn)`; the library's placement (flip above the bar, clamp, zoom) is the pure, tested `libraryPlacement`; the Escape comment matches the order; after a library click or drop the board takes the keys (`focusBoard`); a divider label field in the ⋯ still consumes its focus request (a later field does not steal the focus); selecting a tile on another visible page of the strip makes that page current (Page ▾, Close gaps, Tidy up, + Divider and the library act there; the bar shows it); toasts, tooltips and hints say "Ctrl/⌘+Z" (the app has no platform-aware shortcut helper — its "⌘K" chip is literal).
- **Not fixed (open):** with the workbench's Customize already on, the workbench edit bar's capture-phase Ctrl/⌘+Z listener (registered on the window before Arrange's) runs first and takes the key for the layout history while both modes are on (F15: independent). Arrange cannot get ahead of an earlier window capture listener without editing `src/lib/workbench/` or keeping its own listener alive outside Arrange (which this round removed on purpose).

**Tests added:** Vitest — `arrangeModel.test.ts` (Escape order with a running drag first, `aimedAtEditor`, `isForeignOverlay`, `libraryPlacement` ×4, `onPage`), `arrangeHistory.test.ts` (`pageToShowAfterUndo`), `controlMenu.test.ts` (shared rows with a class prefix), `arrangeBar.test.ts` (the ⋯ label row commits to its divider id). e2e spec 43 (18 → 27): Escape with the library open and the board focused (library first, then Arrange; the panel stays maximized); Escape during a library drag (drag cancelled, nothing added, library open); a divider label kept on its own divider when the focus goes to another divider / empty grid / a control; a control menu opened over the library is on top (`elementFromPoint` at its centre); undoing Duplicate / Add page brings the page back into view; Ctrl+Z during a drag and a corner resize is a no-op (each gesture one step); a held arrow key (synthetic auto-repeats) is one step and one save at the release; Ctrl+Z in Arrange never reaches the preset history (no "Undo —", no parameter write) while outside Arrange it does; Delete / Backspace in the divider label, the tab rename, Page ▾ Rename… and the library search keep the selected tile. Spec 43 also checks that a library click hands the arrows to the new control and that selecting a tile on another visible page makes it current.

**Gates:** `npm run check` 0 errors / 0 warnings; `npm test` 2425 passed (165 files) (first round 2417; +9 new, −1 with `nextView`); chromium e2e full suite (`PW_PORT=5197`) 210/210 (first round 201; spec 43 now 27); flake check `43-block-editor-arrange` + `40-block-editor-board` + `42-block-editor-pin` with `--repeat-each=3` 183/183. Screenshots retaken (the menus now come from `BeMenu`, the library sits in the editor's one layer; same look).

**Open (added):** Ctrl/⌘+Z while the workbench's Customize was already on before Arrange started goes to the layout history (see above).

## ROUND BE-6 — Block editor rework, slice 6: device-layout positions (AXIS-79, parent AXIS-73)

Branch `feature/block-editor-rework` (worktree `.wt-feature-block-editor-rework`), on top of ROUND BE-5. The Default board now takes the device editor's own positions where they hold up, so it looks like the device's editor page. Axis only: the device layout already carries `placement` per control (`positionExact` = the control's top-left corner as a pixel string `"x,y"`, `col`, `offsetX` / `offsetY`) and the server passes it through unchanged.

### What changed
- **New pure `blockEditor/layoutPlacement.ts`** (one device-layout page → board items in cells), used by `deviceLayoutBoardV2.ts` for every page:
  - **Parsing:** `positionExact` is read defensively (`"x,y"` with optional whitespace and decimals; booleans, numbers, a third value, text → no position); `col` (≥ 0, capped), `offsetX` / `offsetY` (finite numbers, else 0). `types.ts` documents `positionExact` as the pixel string and what `row.section` now does.
  - **Entries:** every layout control resolves (same `resolveControl` as before) to a tile (catalog key + view; a key once per page), a title (section titles, and bold headings that show no live parameter of the block; text over 24 characters is a note, not a title), a separator, or a gap.
  - **Positioned page** (at least two exact controls, and at least half of the page's controls): only the exact controls of the first exact control's section are positioned; everything else flows below by rows. Pixel slot per page and axis (see Decisions), anchors relative to the page's top-left control, one slot = 2 cells (a knob is 2×2). Alternates (an anchor nearly on an earlier one) flow with the remainder. A page wider than 24 cells wraps by slot (bands of vertically overlapping controls cut at the last slot boundary that fits, the rest one band lower, everything below moves down). Standard-size controls take their anchors in reading order; larger views (fader, slider, EQ graph, meter, waveform) follow with a running cursor per anchor line, giving up height, then width, before they move on. Titles become `hdiv` dividers on the line above the controls they head (only when they sit above them), on a free line or one inserted line, never stacked; separators become a `vdiv` in a free column between the controls on both sides, all of a device line or none.
  - **Safety net:** a page is laid out by rows instead when it has no standard-size control, when more than 15 % of its standard-size controls cannot take their anchor, or when the reading order of a device line would break.
  - **Pages laid out by rows:** the row-faithful flow as before (a gap or separator = one knob slot, a row wider than 24 cells wraps), plus `col` (column × 2 cells) and `offsetX` / `offsetY` nudges in half-knob steps (at most one slot) when the nudged spot is free; exact controls without a column go at the end of their own row; a title in a row takes a line above it, starting at the control it precedes.
  - **Section changes** (`row.section`, e.g. parameters → mixer) between flowing rows start with an `hdiv` labelled with the section name ("Mixer"), as wide as the page's controls — handled before anything else in the row, so a row of spilled exact controls still starts its section. Dividers never overlap a control.
  - Deterministic (stable sorts, ids from the page index and key / divider number) and already normal: `normalizeBoard` leaves the result unchanged.
- **`deviceLayoutBoardV2.ts`:** every page goes through `fitLayoutPage` under the block's **height budget** (below); the layout-wide pitch is measured once over all pages; the "More" page, the `variantSig` re-seed on a type change, `hideIds` (catalog side) and the curated fallback without a device layout are unchanged. `rowFlowOnly` still builds the previous rows-only default (it sets the budget and is what the persistence layer recognises). `hasDeviceLayoutBoard` tells whether the seed comes from the device layout; an `onPage` hook reports each page's mode (tests, diagnostics).
- **Persistence (`boardPersistence.ts`, `beState.svelte.ts`, `BeSurface.svelte`):** the device default (F10: automatic in the Default profile) is the new board. A saved board and the user's "default for this type" keep winning. A stored Default board that is still exactly the previous rows-only default (e.g. after a "Reset all pages" before this slice) loads as the new default (source `seed`, nothing written, its page kept), so no amber dot lights up — not while the family has a saved default for the type, not when the stored board holds a control the catalog does not list right now (a meter / EQ graph / waveform arriving later), never for copies. The previous default is built only when such a board is found (`previousSeed` is a function), and the legacy carry-over before a save returns at once for a migrated family.
- **⋯ LAYOUT wording (F10, `moreMenu.ts`):** where the profile's seed is the device layout (Default or a copy, no saved default, the block has a device layout), the whole-layout reset row reads **"Reset to device layout"** (confirm "Reset every page to the device layout?"); with a saved default it stays "Reset all pages" and the separate "Reset to device layout" row follows as before; Blank keeps "Clear all pages". Without a device layout (curated fallback, screens without one) the rows say "Reset all pages" / "Reset to default layout" and the prompts "the default layout" (`hasDeviceLayout` in the menu state). The toasts are worded like their rows (`resetAllToast`, `builtInName`).

### Decisions
- **Height budget (coordinator decision):** all pages share one cell size, so a taller page shrinks the controls of every page. No page of the new default may be taller than the tallest page of the block's previous rows-only default. A page over budget drops, in this order: inserted title lines, then section-divider lines (a section change then only starts a new line, or its divider goes into a row that is free anyway), then its positions (plain rows the same way), and last falls back to its rows-only layout. Titles and section dividers therefore show where a page has height to spare, not on a block's tallest page.
- **Pitch detection:** per axis, the smallest neighbour distance that *recurs* (sorted distances clustered within 12 %, the first cluster with at least two members, its median); distances under 30 px never count. Horizontally knobs first, unless the knobs only sit on every k-th slot (k ≥ 2) of the other controls — then the finer all-controls slot, when it is at least 60 px (knobs between dropdowns; small square buttons 34 px apart are never a slot). The layout-wide slot counts only when at least three distances from at least two pages back it (one page with two cab sections side by side must not set the slot of every page, nor halve the row pages' nudges). Fallbacks: the layout-wide slot, then the median knob distance, then 88 × 106 px; a page without a recurring vertical distance uses the layout-wide vertical slot scaled to its horizontal slot, else 1.2 × the horizontal slot (the median line-to-slot ratio of the positioned device pages).
- **Anchoring:** top-left for every control and divider — the data gives top-left corners (section titles sit about 20 px above, separators about 15 px left of the controls they belong to; a wide graph's corner lines up with the knob column under it).
- **Alternates:** anchors within half a slot *and* within 30 px of an earlier one (the device shows one or the other: a gain knob and a slope selector on one spot, two output-level variants). Deviation from "half a slot": square buttons 36 px apart and mini sliders 40 px apart are both visible on the device, so 30 px is the bound.
- **Collisions:** reading order (line, column, layout order); every standard control at its anchor first, the blocked ones (≤ 15 %) at the nearest free spot (`findNear`); larger views with the per-line cursor. Titles yield to controls; separators are left out when a device line has no free column for all of them.
- **Titles:** a title heads the controls of the nearest device line below it (within one vertical slot), from its column to half a slot before the next title of its line, and only when the first of them starts within one slot of it. A label with a control on its own line to its right is a row header (a gap). Section names are capitalised (`mixer` → "Mixer"). No vertical section dividers (the data never says so); separators are the only vertical ones.
- **Mixed pages:** positioned = at least two exact controls that are at least half of the page's controls; on pages laid out by rows (most device pages give `col` only) a few exact controls go at the end of their own row rather than being guessed into the column grid.
- **Seed change without a dot:** recognising the exact previous rows-only default of the Default profile is the only migration; a stored board that differs from it in any way is the user's and is never replaced.
- **Wording:** one row per meaning — with the device layout as the seed the whole-layout reset *is* "Reset to device layout", so there is no second row saying the same.

### Real-data check (throwaway probe, not committed)
Every FM3 and Axe-Fx III layout variant (357, pages resolved by firmware and selector as the server does; 348 give a board), built with this builder: no overlaps, nothing outside the page, every board already normal and deterministic. Pages with at least two exact controls: 32 page instances positioned (22 with titles and divider lines, 1 without title lines, 9 without either; 20 distinct pages, e.g. the Filter / LFO / Modulation pages, Ten-Tap, Cab align, the Axe-Fx III cab page, Speaker, Megatap tap control, global scales / audio), 186 laid out by rows (91 with titles and dividers, 12 without title lines, 43 without either, 40 falling back to the rows-only page; 88 distinct pages, among them the setup audio page, the vocoder levels, PEQ, IR player, MIDI block). Reading-order inversions on device lines of positioned pages: 0 (101 alternates, which flow with the remainder by design, not counted). Knob size against the previous default (tallest rows-only page / tallest new page): minimum 1.0, median 1.0, no block below 1.0 (0 of 84).

### Tests
- Vitest: new `layoutPlacement.test.ts` (45: parsing incl. garbage; neighbour distances incl. the 30 px floor; recurring distance vs the smallest one; knobs first, the finer slot between dropdowns and its 60 px floor, thin stacked controls ignored vertically, the layout-wide slot needing three distances from two pages, the vertical fallback; positioned pages: one knob row with gaps, two rows, an outlier position, a wide EQ graph, a graph giving up height before width with only its lower right blocked, alternates on a shared anchor, a non-alternate collision (≤ 15 %), thin stacked dropdowns over 15 % → rows, a page of only sliders → rows, dense sliders beside knobs keeping their order, a 16-knob line wrapping by slot (order kept, no odd gaps) and the line below moving down, `wrapAnchors` cuts, a title line spanning its run, titles on a free line / one inserted line / never stacked / left out without insertion, row headers and labels with nothing below, long notes, bold headings vs a heading bound to a parameter, separators all of a line or none, only the first section positioned (an exact mixer Balance flows in its own row), remainder gaps not counted before the first flowing control, knobs between dropdowns kept exactly, a mixed page with a mixer divider, far-out positions clamped; rows pages: the row flow incl. separators as gaps, columns, nudges clamped to one slot, section dividers incl. 'gap' mode, a title in a row, exact controls at the end of their own row with titles over the columns, a row of exact controls still starting its section, garbage positions; the height budget's mode steps for a positioned and a rows page; determinism and twice = once through `normalizeBoard`), `deviceLayoutBoardV2.test.ts` (+4: positions + titles + mixer section end to end with the "More" page and the variant stamp; the height budget turning the same page into plain rows when it is the tallest; `rowFlowOnly`; `hasDeviceLayoutBoard`), `boardPersistence.test.ts` (+8: no stored board → no dot, no write; a stored previous default follows the new one (page kept, nothing written); an edited board keeps its content; only Default, never a copy, only when the defaults differ; not with a saved default for the type; not with a control the catalog does not list yet; the previous default built only when a stored board is compared), `moreMenu.test.ts` (+2: the F10 wording incl. toasts; the wording without a device layout), `beState.runes.test.ts` (+3: no dot and no write with positions; a stored previous default vs an edited board and the reset bringing the positions back; the previous default never built on a save).
- e2e `17-device-layout.spec.ts` (1 → 3): its Drive page (the block's tallest) starts the mixer section on a new line without a divider row (height budget); with the new mock option `positioned` (`AMP_PARAMS_POSITIONED` in `support/blockEditorMock.ts`: an Authentic line with exact pixel positions, GAIN / TONE / OUTPUT titles and a mixer section without positions; a three-row Dynamics page makes the rows-only default 6 rows high; the device editor's short labels "Master" / "Bright") the controls land in the expected cells (2-cell knob slots, the empty slots kept), the titles and the "Mixer" divider sit in the right place, nothing overlaps, the page is exactly as tall as the budget and fits at 1366×768 without the amber dot; and "Reset to device layout" (the only such row) puts a control moved in Arrange back, kept after a reload. The default amp mock is unchanged, so specs 40–43 see the same boards; spec 41's dot test only got its title updated to the new wording. `e2e/README.md` describes both.

### Gates
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 2487 passed (166 files) (BE-5 2425 / 165; new `layoutPlacement.test.ts` 45, plus `deviceLayoutBoardV2` +4, `boardPersistence` +8, `moreMenu` +2, `beState.runes` +3).
- Chromium e2e, full suite (`PW_PORT=5197`): 212/212 (BE-5 210; spec 17 now 3 tests). One earlier full run had a single `.aw-root` boot timeout in `15-param-collect` (the page never booted — load, not product behaviour); spec 15 alone passed 9/9 and the rerun of the full suite was 212/212. Flake check `17-device-layout` + `40-block-editor-board` with `--repeat-each=3`: 48/48.

### Screenshots (mocked amp with `positioned`, not committed)
The default panel at 1440 px and at 1366×768 (everything fits, full labels), the Authentic page with the GAIN / TONE / OUTPUT titles and the Mixer divider (default panel and maximized), the maximized editor, Arrange on the positioned page (every item on the grid), the ⋯ menu with "Reset to device layout", and the unpositioned default amp at the default panel for comparison.

### Open
- Titles and section dividers show only where a page has height to spare (height budget); on a block's tallest page a section change is just a new line. Accepted.
- Copies made from an untouched old Default (before this slice) now differ from the positioned seed and show the amber dot; copies are deliberately not migrated (they are the user's own layouts). Accepted.
- Alternates (controls sharing an anchor) flow with the remainder, after the positioned part; the device shows only one of them at a time.
- Pages laid out by columns that contain a few exact controls (a cab page's picker row, a graph between knob columns) put those at the end of their row instead of inside the column grid; that needs a column-to-pixel origin per page.
- Of the pages with exact positions, most still fall back to rows: thin one-line selectors, mini sliders and small buttons are 2×2 / 6×1 tiles on the board, so their device spacing does not map onto the grid without collisions.
- On a block with an EQ graph a plain label widget still resolves to the graph (the unchanged `resolveControl` rule); title labels are intercepted before it.

## ROUND BE-7 — Block editor rework, slice 7: touch, phone layout, ControlSurface removed (AXIS-80, parent AXIS-73)

Branch `feature/block-editor-rework` (worktree `.wt-feature-block-editor-rework`), on top of ROUND BE-6. The editor becomes usable on tablets and phones: the phone layout shows at most four knobs a row (binding user requirement), touch gestures no longer fight the board's scrolling, the long-press menu, keyboard and `aria` are finished, and the previous editor `ControlSurface.svelte` is gone now that every inventory row has a new home (checklist below).

### What changed
- **Phone layout (user requirement: at most four knobs a row).** On the device class `phone` every page is re-wrapped, row-faithfully, to **8 cells** (`PHONE_COLS`): four 2×2 knobs side by side, wider controls take their width (an EQ graph, a wave or a long slider at most the 8 cells). The cell is the available width / 8 (`phoneCell`: (width − 2 × 8 px padding − 7 gaps) / 8, never below the 20 px minimum, never above the control size's maximum): 40 px at 390 px (an 84 px knob tile), 39 px at 360 px (82 px). The pages **stack and scroll vertically** inside the sheet / panel, each only as tall as its content, without snapping, the page name as a rule; the header tabs still navigate (a tab scrolls to its page, the visible pages are highlighted) — page navigation as before, no horizontal strip on the phone. Applies to a phone board inherited from the desktop board (fallback chain) and to a phone board of its own alike. Display only: the re-wrap is a `pos` map like the side navigation's compact view, so **reading the phone view never writes a board** (asserted in e2e).
  - Pure `phoneWrap(list, cols)` in `boardModel.ts`: bands of vertically overlapping items (the visual rows, in reading order; a horizontal divider joins the line directly under it, so a title stays over the controls it heads); a band wider than 8 cells is cut into chunks at the widest column no item straddles, the chunks go one under the other and keep their 2D arrangement (a fader beside two knob rows stays beside them); inner gaps stay, a leading indent goes; empty lines between bands stay; horizontal dividers run to the right edge of their chunk (or up to the next divider on their line) — so the slice-6 section rules and titles span the phone page —, a vertical divider is kept only between items of its chunk; an item whose spot is taken (only after a hard cut through chained items) goes to the nearest free spot: nothing overlaps. Deterministic, the board untouched.
  - `boardGeometry.ts`: `phone` in the page layout input → `layoutForPage` returns the 8-column layout with `pos` (`phone: true`, not the side navigation's "compact view"); `PHONE_PAD_X`, `phoneAreaW`, `phoneCell`. `boardView.ts`: `sectionExtents(…, natural)` for stacked pages of their own height; `itemScrollTarget` for a jump to a control.
  - `BeSurface.svelte`: `boardNav` (how the board lays the pages out: `side` on the phone, else the navigation) next to `nav` (header tabs vs side list); `BeBoard.svelte` gets `phone` (natural sections, no snap, 8 px side padding, the 8-cell grid centred).
- **Touch gestures (`touchGesture.ts`, pure):** the board scrolls along one axis (top strip: x; side stack and the phone: y); touch changes values along the other one (a pen behaves like the mouse — fix round, REG#2). Tiles of value controls (knob, number, fader, slider) carry `touch-action: pan-x` in Top mode and `pan-y` in Side mode and on the phone, so the browser pans the board natively along its scroll axis and hands the other axis to the editor; Arrange keeps `none` (every tile a drag handle); other tiles `manipulation`. A direct-manipulation drag decides once it leaves an 8 px slop (`lockGesture`): along the scroll axis (or an exact diagonal) it is a scroll and changes nothing for the rest of the gesture; along the value axis it is a relative value drag (0.005 per px, Shift fine, up / right = more) — on touch for every continuous view, the whole tile being the target (≥ 40 px), so the 8–14 px fader track is no longer the only grip; a tap on a fader / slider track sets the tapped value; a tap on a knob's value still types it. The mouse is unchanged (knob / number vertical, faders and sliders follow their track). `pointercancel` (the browser taking a pan) resets every gesture (as before, now asserted). The value bubble opens for a mouse hover only (a tap no longer leaves it standing).
- **Long-press** opens the control menu on tablet and phone (slice 4) — the release of the holding finger can produce a click on the menu's scrim; that click is now swallowed (`suppressClickAfterRelease`), so the menu stays open (seen with Chromium touch input via the browser's input pipeline (CDP), not a physical device, in the phone profile).
- **Keyboard / aria for every view:** knob, fader (`aria-orientation="vertical"`) and slider `role="slider"`, the number view `role="spinbutton"` (it has ± steppers), switch `role="switch"`, toggle pills and the bypass action `aria-pressed`, the select field a `combobox` (`aria-expanded`, `aria-controls` → its listbox), meters `role="meter"`, dividers `role="separator"` (vertical ones with `aria-orientation`, labelled ones named), the looper's transport buttons named (Record, Play, Stop, Overdub, Undo, Reverse, Half speed; the latching ones with `aria-pressed`), fader / slider value buttons named ("<label>: <value> — type a value"); a 2 px accent focus ring on every operable part of a tile. The select popover is a keyboard listbox: it takes the focus on its current option, ↑ / ↓ / Home / End walk, Enter picks (and the focus returns to the field), Escape closes back to the field without reaching the app's Escape chain, Tab closes it.
- **Arrange on the tablet with touch** (drag with the teal / red preview, the 40 px corner handle — slice 5) checked with Chromium touch input via the browser's input pipeline (CDP), not a physical device; the tablet stores a board of its own on its first change while the desktop board stays as it was. Phone: no Arrange (F12).
- **Polish from the screenshots:** at 360 px the workbench header wrapped ⋯ onto its own line (chip · state · ⋯ did not fit): below 380 px (`HEADER_XS_W`, `headerFit().xs`) the state segments tighten and the chip may shrink to 100 px, so the row holds. A "Find a control…" jump on stacked pages (phone, side navigation) now scrolls the control itself into view (`BeBoard.scrollToItem`), not just its page's start — a phone page is three times as tall. A change of the board height on the phone (the on-screen keyboard while a value is typed, the grid map folding) no longer re-anchors the scroll to the page start: the phone's stacked pages do not depend on the height, so the position is kept (`anchorKey` without the height on the phone). Touch targets on the phone and the tablet: pills, select fields and the bypass action grow to 40 px where their tile has the room (`touchCtlHeight`), and the select list's rows are 40 px. *(Corrected in the fix round: the fixed `inset: -9px -6px` margin of the switch and the number steppers did not reach 40 px below a 40 px cell and overlapped the number's value; size-dependent hit margins per part replace it, see "Fix round" below.)*
- **`ControlSurface.svelte` deleted** (2832 lines; nothing mounted it since BE-2). `deviceLayoutBoard.ts` keeps what the v2 code uses — `resolveControl`, `layoutVariantSig`, the v1 board shape (`SurfaceWidget` / `SurfaceBoard`, read by the v1 → v2 migration) and `BoardCtl` —; the v1 builder `buildDeviceLayoutBoard`, `packRows` and `packSequential` (used only by ControlSurface) are gone with their tests, `resolveControl` is now tested directly. The legacy keys `axs.surface3.*` / `axs.surface2.*` are still read (carried over, migrated), never written or deleted. Comments naming ControlSurface in current code now name the Block Editor / `BeSurface`; `README.md`, `docs/LAYOUTS.md` (its "what ships today" and status notes) and `e2e/README.md` describe the current state. Historical docs (earlier rounds, review / verification reports, parity notes) are left as they were. No ADR named it.

### Inventory checklist (plan §2, #1–#53 → where it lives now)
§2.1 shell — #1 block glyph → `blockEditor/BeHeader.svelte` type chip (glyph tile; `headerModel.ts` `typeChip`) · #2 type → chip click → CommandPalette (`editor.openRetype`), ⋯ "Change type…" (`moreMenu.ts`) · #3 cab summary / CabPicker → chip shows the slot summary (`BlockEditor.svelte` `cabSummary` → `BeBlockChrome`), opens the CabPicker; ⋯ "Choose cab…" · #4 channel A–D → chip letter, unfolds A–D (phone: a bar over row one) · #5 ✕ (monolith) → end of the header (`BlockEditor.svelte` close snippet → `BeHeader` `end`) · #6 height grip → `BlockEditor.svelte` `.resize` (unchanged) · #7 phone sheet + workbench minimize bar → `BlockEditor.svelte` sheet / overlay, the workbench panel chrome (unchanged) · #8 grid map → `BlockEditor.svelte` strip under the header + ⋯ show / hide (`gridMapPrefs.ts`) · #9 no pack / reading / error → `BeSurface.svelte` board-area message, header usable · #10 Engaged / Bypassed → `BeHeader` state segment · #11 Mute → segment, "coming soon" (F7) · #12 Scene Ignore → segment, "coming soon" (F7) · #13 remove block → ⋯ "Remove block from grid" (confirm; `editor.removeSelected`) · #14 "select a block" → `AxisBlockEditorPanel` (unchanged).
§2.2 board — #15 catalog kinds → `catalog.ts` + `BeControl.svelte` views (knob, fader, slider, number, button, switch, select, eq, action, meter, wave) · #16 `hideIds` → `BeSurface` prop → `buildCatalog` · #17 views → arrange bar View segment (`BeArrangeBar` / `arrangeBar.ts`) + control menu View ▸ (`controlMenu.ts`) · #18 knob drag / fader + slider track / number ± 2 % (+ Shift fine, arrows) → `BeSurface` `tileDown` / `trackDown` / `valueMove`, `boardView.ts` `dragNorm` / `keySteps` / `NUDGE_STEP`, touch via `touchGesture.ts` · #19 value in the knob, click / double-click types, value bubble → `BeControl` `[data-be-value]`, `BeSurface` `startType` / `commitType`, `.be-tip` · #20 toggle, select popover → `BeControl` pill / switch / field, `BeSurface` select listbox (measured, zoom-safe, closes on reflow / scroll; now keyboard-walkable) · #21 EQ graph → `BeControl` `eq` (`EQGraph`) · #22 meter (+ lying variant) → `BeControl` meter (`isFlatMeter`) · #23 looper → `BeControl` `wave` + `BeSurface` `pressLoop` (latching / momentary) · #24 parameter help → `BeSurface` `showParamHelp` (status bar) · #25 ∿ modifier → hover ∿ + control menu "Edit modifier…" (flyout or the docked panel) · #26 grid swipe control → control menu ⇆ "Grid swipe control" + arrange bar ⇆ (F2) · #27 ⌖ pin → hover ⚡ (click = a new custom panel) + control menu Pin to ▸ + arrange bar ⚡ · #28 380 ms hold-drag → `BeSurface` `pinArm` / `beginPinDrag` / `dropPin` + `pinDrag.ts` (and the ⚡ press-drag) · #29 right-click / long-press pin menu → control menu Pin to ▸ (`BeMenu`, `buildAxisPinMenuItems` + New tab) · #30 Pin page → Page ▾ "Pin page as panel" (`pageMenu.ts`) · #31 search → `BeFind.svelte` popover + the flat results (`findControls.ts`, F5) · #32 tabs → `BePageNav` (header tabs / side list), scroll navigation in `BeBoard` · #33 swipe between pages → native scrolling of the strip (Top), of the stacked pages (Side, phone); tabs · #34 rename → double-click a tab / list entry while arranging + Page ▾ Rename… · #35 add page → Page ▾ Add page + "＋" after the tabs while arranging · #36 layout profiles → ⋯ LAYOUT (`moreMenu.ts`, `beState.svelte.ts`, `boardPersistence.ts`) · #37 device default, "More", re-seed on a type change → `deviceLayoutBoardV2.ts` + `layoutPlacement.ts` (device positions), `layoutVariantSig` · #38 curated fallback → `buildCuratedBoardV2` (`layouts.ts` `idealIds`) · #39 reconcile → `normalizeBoard` (+ `boardSchema.ts`) · #40 legacy keys → `boardPersistence.ts` (`carryLegacyBoards`, `migrateV1`; `axs.surface3.*` / `axs.surface2.*` read, never written or deleted) · #41 `config/surface` document, cloud, remote (`surfRev`) → `surfaceStore.svelte.ts` (`OWNED` includes `axs.be1*`) + `BeState` · #42 global COLS / ROWS / Compact → ⋯ Control size Compact / Normal / Large (F3) · #43 responsive re-pack → always fit (`boardGeometry.ts`), the side navigation's "Compact view" (`reflowPack`), the phone's 8-cell re-wrap (`phoneWrap`, this slice) · #44 Arrange on / off → ⋯ Arrange, the empty page's Arrange, Done / Escape (`beArrange.svelte.ts`); phone none (F12), tablet yes; the search ends it · #45 ghost move → teal / red preview, cross-page onto the strip · #46 corner resize → corner handle (40 px on the tablet) + Size S / M / L + Shift+arrows · #47 remove → bar ✕, Delete, control menu · #48 w×h → `.be-dims` · #49 Packed / Free → Auto-pack (F4) · #50 Tidy up → arrange bar · #51 tray → "+ Control" library (`BeLibrary.svelte`) · #52 empty-page hints → `BeBoard` "This page is empty." + Arrange (and the arrange hint) · #53 offline convert editor → `AxisConvertBlockEditorPanel` sets `convertEditor` as the `EditorSurface`; `BeSurface` reads and writes only through `getEditorSurface()`.
All 53 rows have a home; §2.3 (dividers, side navigation, spine, visible-page highlight, wheel, drag-to-pan, S/M/L, Close gaps, undo, cross-page drag, page duplicate / move / delete, save as default, arrows / Shift-fine, one / two header rows) shipped in slices 2–6.

### Decisions
- **Phone = stacked pages + header tabs.** The phone board always stacks its pages (vertical scroll), whatever the stored navigation; a horizontal strip of tall 8-cell pages would need two scroll axes (every knob gesture would fight one of them) and would share one vertical offset between pages of different heights. The header tabs navigate as before.
- **Phone cell:** width / 8 within the existing minimum (20 px) and the control size's maximum (Normal 40 px) — the maximum does not contradict "four knobs a row" and keeps a phone profile in a wide window at normal knob size; the 8-cell grid is centred in the page.
- **Phone gesture: a sideways drag changes the value, a vertical swipe scrolls** (`pan-y`) — the page scroll is the one never fought; the same as the Side navigation on touch (F11). Top mode on touch: vertical drag = value, sideways swipe = scroll (`pan-x`).
- **Touch value drags are relative** along the value axis for every continuous view (also faders: a vertical fader drags sideways on the phone / in Side mode); a tap on the track sets the tapped value. An exact diagonal counts as a scroll (no value change from an ambiguous swipe).
- **Pen behaves like the mouse** (changed in the fix round; reason: Wacom / Electron pens don't pan, so a touch-style value axis left a pen's knob / fader gestures doing nothing — REG#2): knob / number vertical, fader / slider tracks absolute, the 380 ms hold-drag to a panel (spec 42); a pen gesture is never dropped in JS — where a browser does pan for a pen, its `pointercancel` ends the gesture.
- **Long-press release:** the click a release may produce after the menu opened is swallowed.
- **Dividers on the phone** run across the 8 cells (section rules and titles); vertical dividers only where they still separate two items of a chunk.
- **The select field is a combobox** with a keyboard listbox; the number view is a spinbutton.
- **ControlSurface removal** deletes only what nothing else uses; the v1 board shape stays for the migration.

### Tests
- Vitest: `boardModel.test.ts` (+12, `phoneWrap`: a 12-knob row → three rows of four in reading order; rows faithful; inner gaps kept and the leading indent dropped; fader / select / slider widths and wide controls at 8 cells; a section divider across the 8 cells over the controls it heads; the slice-6 titles kept over their groups; a divider never widened into the next one; vertical dividers between items kept, at a chunk edge left out; empty lines kept; no overlap after a hard cut; deterministic, total, the board untouched, a page that fits keeps its shape), `boardGeometry.test.ts` (+4: 8 columns with the 12-knob row as 3 × 4, the cell at 390 / 360 / compact / narrow / a wide window, the height never shrinks the cell, never while arranging), `boardView.test.ts` (+5: natural stacked sections, `layoutBoardPages` on the phone (one cell, rows, the input untouched), `itemScrollTarget` ×2, `touchCtlHeight`), new `touchGesture.test.ts` (24: scroll axis, the value axis for mode × device class × input incl. pen, `tileTouchAction`, `lockGesture` (slop, swipes, value drags, the diagonal), `valueDelta`, `trackNorm`), `headerModel.test.ts` (the `xs` fit), `deviceLayoutBoard.test.ts` rewritten for `resolveControl` / `layoutVariantSig` (5; the v1 builder's and `packRows`' 11 tests went with them).
- e2e: new `44-block-editor-touch.spec.ts` (17 tests; Chromium touch input via the browser's input pipeline — CDP `Input.dispatchTouchEvent`, not a physical device — so `touch-action` decides what the browser pans): tablet profile — a sideways swipe over a knob scrolls the Top strip and writes nothing, a vertical drag writes; Side (F11) — a vertical swipe scrolls and writes nothing, a sideways drag writes; a fader — a swipe along the strip writes nothing, a tap on the track sets the tapped value; `pointercancel` ends a value drag; a long-press opens the control menu and the release keeps it open; Arrange with a touch drag, the 40 px resize handle, the tablet's own board stored while the desktop board stays byte-identical. Phone at 390×844 and 360×780 — every page 8 columns, at most four knobs a visual row, each knob tile ≥ 78 px wide, the pages stacked and scrolling under a swipe that writes nothing, a sideways drag writing, the tabs paging, no Arrange, a long-press menu without layout rows, a 12-knob row of an inherited desktop board and of a phone board of its own both as three rows of four, and no board written (`countBoardSaves` 0, the stored 24-cell row unchanged). Plus: every view's role / value (slider, vertical slider, spinbutton, switch, combobox, separator), the select's keyboard listbox (Enter opens on the current option, ↓ walks with a focus ring, Enter picks and writes, Escape back to the field with a maximized panel staying maximized), the switch's focus ring; on the phone a Find jump scrolls the control lower down a tall page into view, and a shorter board (the on-screen keyboard) keeps the scroll position (checked to fail without the fix: 0 instead of 180). `e2e/README.md` describes spec 44.

### Gates
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 2526 passed (167 files) (BE-6 2487 / 166; new `touchGesture.test.ts` 24, `boardModel` +12, `boardGeometry` +4, `boardView` +5, `deviceLayoutBoard` 11 → 5).
- Chromium e2e, full suite (`PW_PORT=5197`): 229/229 (BE-6 212; spec 44 adds 17). Flake check `44-block-editor-touch` + `40-block-editor-board` + `43-block-editor-arrange` with `--repeat-each=3`: 171/171. (An earlier full run before the last three fixes — keyboard height, touch targets — was 228/228.)

### Screenshots (mocked amp, not committed)
`<scratchpad>/be-slice7/`: `01`–`03` phone 390×844 workbench (positioned page with GAIN / TONE / OUTPUT titles and the Mixer rule re-wrapped, scrolled, the Power Amp page with the fader), `04` phone 390 maximized in the light theme, `05` / `06` phone 360×780 workbench (header on one row), `07` / `08` tablet 1024×768 normal and Arrange (selection with the 40 px handle), `09` tablet Side navigation, `10` / `11` desktop 1440 dark and light, `12` the select listbox, `13` / `14` the monolith phone sheet at 390×844 and 360×780 (+ scrolled).

### Open / deferred
- **EQ graph on the phone:** the graph keeps `touch-action: none` (its nodes drag in both axes), so a swipe that starts on the graph does not scroll the page; scroll from the knobs beside / below it. Needs node-only `touch-action` in `EQGraph` (shared component; not touched in this slice).
- **Pen in Top mode:** a pen hold-drag that leaves sideways can be taken by the browser's pan (see Decisions). *(Fix round: a pen now behaves like the mouse; only a browser that pans for pens still cancels such a drag.)*
- Carried over, unchanged by this slice: Mute / Scene Ignore stay placeholders (F7, device-side item); the ∿ shows no assigned state (AXIS-92); two open editors of the same slug keep separate board state until a reload (BE-2); all pages render at once — not measured with large real blocks (BE-2, needs device data); the template's page menu on a tab right-click, a floating copy of the dragged tile, redo in Arrange (BE-5); Ctrl/⌘+Z while the workbench's Customize was on before Arrange started goes to the layout history (BE-5, needs `src/lib/workbench/`); the menu header without kind icon (BE-4); the slice-6 accepted points (titles only with spare height, copies of an old Default show the dot, alternates, column pages, most exact pages falling back to rows, a plain label resolving to the EQ graph).
- Monolith behaviour is still checked by screenshots only (no monolith e2e harness).

### Fix round (reviews WB/REG)
Two reviews of the slice-7 diff (workbench review WB#1–13, regression review REG#1–14). Each finding → what changed (file), or deferred and why.

- **WB#3 = REG#1 — multi-touch (must-fix).** `BeSurface.svelte`: the value drag (`vd`) and the track gesture (`tk`) keep their `pointerId`; the window move / up handlers ignore every other pointer (the pin hold, ⚡ press and pin drag carry their pointer too), a value press while another pointer owns a value gesture is ignored, and `pointercancel` ends only the gesture of the cancelled pointer (`cancelPointer`; a menu opening over the board or another block still cancels everything). `beArrange.svelte.ts` does the same for its move / resize / library drags: its own `pointercancel` listener no longer ends another finger's arrange drag, another finger's moves and release never reach it. e2e with two CDP touch points.
- **WB#1 — the select list focused its first option (must-fix).** `BeSurface.svelte`: the open listbox focuses `[aria-selected="true"]`, the first option only when none is (the `?.focus() ?? …` always fell through: `focus()` returns undefined). e2e: pick "Left", reopen → "Left" is focused.
- **WB#5 — list scroll.** Focusing an option (on open, ↑ / ↓ / Home / End) scrolls the list just far enough to show it (`revealScroll`, `boardView.ts`, Vitest).
- **WB#8 = REG#10 — Tab in the listbox.** Tab closes the list with the focus back on the field and without `preventDefault`, so the focus moves on from the field; roving tabindex (the focused option — on open the current one — 0, the others −1).
- **WB#2 = REG#8 — 40 px touch targets (must-fix).** `boardView.ts`: `touchHitInset(size)` (half of what a part lacks of 40 px, per side), `touchHit(w, h, room)` and per view `centredPartHit` / `numberHits` / `faderValueHit` / `sliderValueHit` give every part smaller than 40 px a size-dependent hit margin (a `::before` of the part, `z-index: 1` inside the board) that grows it to 40 px, each side only within its own room: never over a neighbouring operable part — the number steppers never reach up over the value (the 6 px overlap REG#8 found) nor past the middle of their 6 px gap, the value never down over the steppers, the fader's value button never down over the track, the slider's stops halfway to the track — and at most into the gap and the next tile's 4 px edge strip, never over its control. Covered: number steppers and value, switch, one-row pills / select fields / the bypass action, fader / slider value buttons (the fader's grows, `minH`, where the room above is not enough); `.be-loopbtn` 40 px tall and ≥ 36 px wide with a 2 px margin each side (the 4 px gap shared). Search-result tiles get the touch sizing on the phone / tablet too (their 7 px edge: `STANDALONE_EDGE`; `touchCtlHeight` takes the edge). Vitest at the touch cells 40 / 39 / 35 / 32 (phone 390 / 360, tablet, Compact): every part ≥ 40 × 40, no overlaps. Known limit: a one-row narrow number tile (2×1, value over the steppers in one cell) keeps what fits. The BE-7 sentence on 40 px above is corrected.
- **WB#9 — `touchTargets`.** `beHost.ts` `touchTargets` (every device class but the desktop) drives the tile sizing (`BeControl.svelte`) and the select list's 40 px rows; `touchArrange` keeps its arrange meaning (the 40 px corner handle).
- **WB#6 — ⚡ over a touch-sized pill.** `tileContentBox` takes the rendered control height (`ctlH`: `touchCtlHeight` on touch), and the label row is one helper (`labelRowPx`) for `BeControl` and the content box; Vitest (a 2×2 button at a 48 px cell: the touch-sized pill leaves no room for the hover actions, the normal one does).
- **REG#2 — pen.** `touchGesture.ts` `isDirect` = touch only: a pen drags a knob / number vertically, follows a fader / slider track (`trackDown` accepts pen) and is never turned into a scroll in JS; a browser that pans for a pen still ends the gesture through `pointercancel`. Vitest updated (the pen rows of the value-axis table). Decision "Pen follows touch" above updated: pen behaves like the mouse.
- **REG#3 — phoneWrap, titled groups taller than one row.** `boardModel.ts`: a horizontal divider heads the next line with content under it (blank lines between them stay inside the band, unless that line holds a divider of its own), and a band holding a divider runs on through every line that starts right where it ends, up to an empty line or the next divider line — a title stays over all the rows of its group, the next section's rows never land under it. Vitest: the repro (GAIN / TONE / OUTPUT on line 0, knobs on lines 1 and 3) and its blank-line variant, the group ending at an empty line and at the next divider line, and a 400-board fuzz (no overlap, inside 8 cells, ≤ 4 knobs per visual row, widths / heights kept, every control and horizontal divider drawn, deterministic, input untouched). The reviewer's 4000-board fuzz script re-run: 0 failures, at most 4 knobs a row; its REG#3 repro now reads GAIN · Drive · Gain 2 / TONE · four knobs · two / OUTPUT · Master, Bright · Out 2.
- **REG#4 (visual a) — the RIGHT ◨ box.** It is the workbench's right-dock opener (`src/lib/workbench/`, unchanged; its rework is a follow-up of the main session). `BeBoard.svelte`: the phone board ends with `PHONE_END_PAD` of room (`boardGeometry.ts`, phone only), so the last row scrolls clear of the opener and of the 22 px "Collapse bottom" button. 112 px instead of the suggested ~56: derived from the opener (40 px high, 64 px above the workspace bottom → 104 px, + 8 px air); measured at 390×844: board bottom 792, opener 688–728, the last row ends at 670 when scrolled to the end (56 px would have left it at 726, under the opener). The tablet's Top strip scrolls sideways (room at the bottom moves nothing there): phone only. e2e asserts it.
- **REG#5 (visual b) — Arrange on a 1024×768 tablet.** (a) `BeSurface.svelte` renders the grid map strip (`belowHeader`) only outside Arrange. (b) On the tablet, entering Arrange measures the board (the bar in, the strip out) and, when fewer than three knob rows of the arrange cell fit (`arrangeWantsMaximize`: `bodyH < 3·(2c+g) + 2·PAD_Y`, `boardView.ts`, Vitest), maximizes the hosting workbench panel through the workbench controller from the editor's workbench context (`setMaximizedPanel`; the panel id from the editor's `[data-panel]` ancestor, as `editorTabTarget` finds its tab stack); Done (or anything that ends Arrange) restores it only when the editor maximized it and it is still maximized — a panel the user maximized stays. Monolith / no panel: nothing. The preset's bottom size is unchanged. 1024×768: the arrange board grows from 183 px to 471 px (cell 36: three rows need 248). e2e.
- **WB#4 — spec 44 on Firefox.** `test.skip(({ browserName }) => browserName !== 'chromium', 'CDP touch input is Chromium-only')`; note in `e2e/README.md`.
- **REG#6 / WB#10 — phone ≤ 4 coverage.** Spec 44 loops every `[data-be-grid]` of the board (knob count > 0), each knob tile ≥ 80 px at 390 (84 px) and at 360 (82 px; the review's real width, so the stricter 80 holds there too); a `positioned` run per phone width: ≤ 4 a row, GAIN / TONE / OUTPUT / Mixer each over its group, 0 saves.
- **REG#7 — iOS long-press.** `.be-tile`: `-webkit-user-select: none; -webkit-touch-callout: none`.
- **REG#14 — pinch-zoom.** `tileTouchAction`: `pan-x pinch-zoom` / `pan-y pinch-zoom` instead of bare `pan-x` / `pan-y` (Vitest, spec 44).
- **REG#12 — long-press click suppression.** `suppressClickAfterRelease(pointerId)` arms on the release of the long-pressed pointer only and swallows the next click unless a new press comes first (or 350 ms pass): a quick tap on a menu row right after the release goes through (e2e).
- **REG#11 — a curved swipe nudged the value before the browser took the pan: fixed.** A touch value drag the browser cancels less than 150 ms after it locked to 'value' goes back to its start value, written only when the value actually changed (`restoreOnCancel`, `touchGesture.ts`, Vitest; the `pointercancel` e2e still passes). Small: one write at most, only on a cancel the browser sends.
- **REG#9 — a drag along a slider's own track scrolls the board: deferred.** Making the track follow a touch drag needs `touch-action: none` on the (enlarged) track, so a swipe that starts on a slider's track would no longer scroll the strip / page — a new gesture conflict; the tap on the track and the relative drag along the value axis cover it.
- **Docs (WB#7, WB#11, WB#13).** `docs/LAYOUTS.md`: the served layout is consumed (no "is meant to"), the virtual-effect screens are implemented (the tool rail opens them, `VirtualScreen.svelte` mounts `BeSurface`; Footswitches has its own editor), the multi-device line no longer points at a "Planned / In-progress half". This round's "real touch input" → "Chromium touch input via the browser's input pipeline (CDP), not a physical device". `docs/workbench-dc-parity/05-block-editor.md`: a "superseded by `src/lib/blockEditor/` (slice 7)" note over its ControlSurface checklist. `e2e/README.md`: the inventory count (27 spec files), spec 44's new cases, the Chromium-only note.
- **WB#12 — Svelte minimum.** `$props.id()` needs Svelte 5.20: `package.json` and the root entry of `package-lock.json` (edited by hand, no `npm install`) now `^5.20.0` (installed: 5.56.4).
- Not in this round: REG#13 (the gitignored root `CLAUDE.md`, main session); the workbench right-dock opener rework (follow-up).

New tests: Vitest +27 — `touchGesture.test.ts` +5 (pen like the mouse in the value-axis table, `restoreOnCancel` ×3), `boardView.test.ts` +17 (`labelRowPx`, the standalone edge, `touchHitInset` / `touchHit`, number steppers + value, wide number, switch, one-row pills, search-result tile, fader / slider value at the four touch cells, the ⚡ content box with `ctlH`, `arrangeWantsMaximize` ×2, `revealScroll` ×3), `boardModel.test.ts` +5 (titled groups ×4, fuzz). e2e spec 44: 17 → 21 (two fingers, Arrange at 1024×768 with the auto-maximize, the positioned phone page at 390 and 360) and extended: every phone grid with the 80 px tiles and the end room clear of the opener, the select reopened on the picked option with the roving tab stop and Tab, the quick tap after a long-press, `pan-* pinch-zoom`.

Gates (fix round):
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 2553 passed (167 files) (BE-7 2526 / 167; +27).
- Chromium e2e, full suite (`PW_PORT=5197`): 233/233 (BE-7 229; spec 44 17 → 21). Flake check `44-block-editor-touch` + `40-block-editor-board` + `43-block-editor-arrange` with `--repeat-each=3`: 183/183.
- Screenshots (mocked amp, not committed) in `<scratchpad>/be-slice7-fix/`: `01` / `02` phone 390×844 workbench (positioned page; scrolled to the end, the last row clear of the RIGHT opener), `03` / `04` phone 360×780 workbench (top, end), `05` the monolith phone sheet at 390×844 (+ scrolled to the end), `06` / `07` tablet 1024×768 normal and Arrange (grid map strip hidden, panel maximized: room for about five knob rows), `08` tablet hit margins outlined (number steppers / value), `09` / `10` desktop 1440 dark and light (unchanged), `11` the select list reopened on its picked option ("Left", focus ring).

## ROUND BE-8 — Block editor: Scene Ignore and Bypass mode from the device (AXIS-81)

Branch `feature/block-editor-rework` (worktree `.wt-feature-block-editor-rework`), on top of ROUND BE-7. The header's state group was "Engaged/Bypassed | Mute | Scene Ignore" with Mute and Scene Ignore only toasting "coming soon" (F7). Scene Ignore is now the device's own per-block, per-channel param, and "Mute" is replaced by the block's real **Bypass mode** (there is no block mute on the devices; the bypass mode decides what a bypassed block does). Cross-repo: forgefx-midi (`feature/block-state-params`) resolves which param each one is per device and block family, ForgeFX (`feature/block-state-params`) tags them on the block params and advertises the cap, Axis renders and writes them.

### What changed
- **Data (Axis side).** `types.ts`: `DeviceCaps.blockState`, `BlockParams.blockState` (`BlockState` = `sceneIgnore: { paramId, value, supported, reason? } | null`, `bypassMode: { paramId, value, options: [{ value, label, muting }] } | null`). `forgefx.ts` `blockParams` normalizes the tag (`blockState.ts` `parseBlockState`: absent or malformed → no tag). `editor.svelte.ts`: the tag is kept per effect id; `editor.blockState` reads the CURRENT values from the block's live `enums` (`liveBlockState`), so the header and the board's own control of the same param can never disagree; `editor.blockStateCap` (undefined on a pre-v2 / older server); `editor.setBlockStateParam(paramId, value)` IS the board's enum write (`setEnum`: optimistic + history; undo re-reads the block). No new route: the server tags the ids, the write is the existing `PUT …/params/:pid` with `continuous:false`. `editorSurface.ts`: the three members are optional (the offline convert surface has none → disabled "Not available offline").
- **Header.** `headerModel.ts` (pure): `blockStateView` (availability with its reason, on / current mode, titles), `formatBypassModeLabel` ("MUTE FX OUT" → "Mute FX Out"; an unnamed ordinal → "Mode n"), `bypassModeText` ("Bypass: Thru", "Thru" below 720 px), `bypassModeInMenu` (below 470 px), `bypassModeMenu` (radio rows). `BeHeader.svelte`: Engaged | **Bypass: Thru ▾** | **Scene Ignore**. Scene Ignore toggles, `aria-pressed` = the value, accent LED when on, title "Scene Ignore · channel B — this block keeps its state on scene changes". Bypass mode opens the workbench ContextMenu (via `BeMenu`, in the editor's overlay layer; Escape never reaches the window chain) under the control: a "Bypass mode · channel B" header, one radio row per device mode, the muting ones hinted "mutes"; a muting current mode shows a muted mark in the control (amber; red while the block is bypassed, i.e. silent now). `BeSurface.svelte` owns the menu; on a phone-width editor (< 470 px) the control leaves the header and is a ⋯ submenu ("Bypass mode ▸", hint = the current mode, `moreMenu.ts`), so chip · Engaged | Ignore · ⋯ keep one row with 40 px targets (`.phone .be-seg` min 40 px).
- **Unavailable = disabled with the reason, never a toast** (`aria-disabled`, still focusable so the title can be read; a click does nothing): "Needs a newer ForgeFX server" (no cap key), "Not available on <device>" (cap false: VP4, AM4, gen-1/2), "Reading the block…" / "Couldn't read this block" / "This block has no parameters" (the read), "This block has no Scene Ignore" / "…no bypass mode" (the family lacks it), the server's "Needs firmware ≥ X.YY" (firmware known and below the gate). The "coming soon" toasts are gone (`BlockEditor.svelte`, the header).
- **Header widths.** `HEADER_PARTS.state` 290 → 350 (measured: 345 px for "Bypassed | Bypass: Mute FX Out ▾ | Scene Ignore"; the mode label is capped at 150 px). One row with the top tabs stays at 1240 px; with the monolith's ✕ it is now 1262 px (was the 1240 floor).
- **Mock + docs.** `e2e/support/blockEditorMock.ts`: the amp gets a Scene Ignore enum (`SCENE_IGNORE_PID` 32, the device layout's button on Preamp beside Bypass) and `blockState` (Bypass Mode = the existing Preamp select, `BYPASS_MODE_PID` 12, Mute Out muting); caps `blockState: true` by default, option `blockState: false | 'absent'`; discrete writes are recorded in `enumWrites` and read back by later block reads (also into `blockState`). `e2e/README.md`, `docs/ROADMAP.md` (scene ignore per block no longer a stub).

### Decisions
- **Scene Ignore is per channel** (device param in the channel-blocked body): the title names the active channel, a channel switch / scene change re-reads the block and the header follows.
- **No composite mute.** Bypass mode is shown and edited as what it is; muting is a property of the current mode (the codec's `MUTING_BYPASS_MODES`: MUTE / MUTE OUT / MUTE IN), shown as a mark, not a toggle.
- **Bypass mode UI = the workbench ContextMenu with radio rows** (as the ⋯ menu: keyboard, Escape, overlay layer and the 44 px touch rows already meet the header's rules) rather than the board's select popover (anchored to board tiles). Touch rows on phone and tablet.
- **Phone: Bypass mode collapses into ⋯** as a submenu (the search already sheds its field there); Scene Ignore stays in the header as "Ignore".
- **`aria-disabled` instead of `disabled`** for the two new segments, so keyboard users reach the reason; the Engaged segment keeps its native `disabled`.
- **Values from the live enums**, not a second copy: the server's tag decides WHICH param, the board's enum array holds its value — one write path, one source of truth.
- Mode labels title-cased for the header ("Thru", "Mute FX Out"); an ordinal the device did not name shows as "Mode n" (1-based).
- Device firmware gate is decided server-side (ForgeFX knows the unit's firmware); Axis shows the reason it gets.

### Tests
- Vitest: new `blockState.test.ts` (8: parse, absent / malformed, firmware reason, options, live values, unknown params, value replace), `headerModel.test.ts` +6 (available view per channel, the reason order, one without the other + the firmware gate, label formatting, text by width + the ⋯ move, the menu rows; one-row width with ✕ updated), `moreMenu.test.ts` +1 (the ⋯ Bypass mode submenu, disabled with its reason).
- e2e `41-block-editor-header.spec.ts` (21 → 27): the "coming soon" assertions replaced — Scene Ignore toggles with the tagged pid + `aria-pressed`, the board's Scene Ignore button follows and back, the channel in the title after a channel switch; Bypass mode menu (header row, modes, the muting hint) → write + "Bypass: Mute Out" + the muted mark + title, the board's select follows and back; keyboard (Enter opens with focus on a row, Escape closes back to the control with a maximized panel staying, arrows + Enter pick, Space toggles Scene Ignore); caps off for a device (`blockState: false` → "Not available on FM3") and an older server (`'absent'` → "Needs a newer ForgeFX server"): both disabled with the reason title, focusable, nothing written; phone 390: no sideways overflow, Engaged / Ignore / ⋯ / CH ≥ 40 px on row one, Bypass mode via ⋯ ▸ (44 px rows) writes. Tab-order walks now read `beBypassMode`.

### Gates
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 2568 passed (168 files) (BE-7 fix round 2553 / 167; new `blockState.test.ts` 8, `headerModel` +6, `moreMenu` +1).
- Chromium e2e, full suite (`PW_PORT=5197`): 239/239 (BE-7 233; spec 41 21 → 27). Flake check `41-block-editor-header` + `44-block-editor-touch` with `--repeat-each=3`: 144/144.
- Stack: forgefx-midi `npm run build && npm test` 99/99 suites (+ browser-safe, catalog, cache checks); ForgeFX `npm run typecheck && npm test` 40/40 suites (+ browser-safe).
- Screenshots (mocked amp, not committed) in `<scratchpad>/be-blockstate/`: desktop 1440 header with Scene Ignore on and the Bypass mode menu open (channel B), the muting mode engaged / bypassed, caps off (both disabled), phone 390 header, phone ⋯ ▸ Bypass mode submenu.

### Device side: verified vs inferred
Nothing new is verified on hardware. The param ids, option lists and firmware gates are codec catalog facts (forgefx-midi tests pin ids and firmware gates per device); the write is the existing discrete enum write, verified on hardware for type selects and inferred here. To verify: toggle both on a device (FM3, then FM9 / Axe-Fx III), confirm on the unit for the active channel, then switch scenes.

### Open / deferred
- A front-panel or other-UI change of either param is not reflected live: device `param` events update knobs only (pre-existing for every enum); the next block read shows it.
- FM3 FORMANT / MIXER / FDBKRET / MULTIPLEXER ship no bypass-mode labels in the codec catalog: without a device profile that names them those blocks show "Mode 1…n" (codec data follow-up).
- Carried over unchanged: the ∿ shows no assigned state (AXIS-92); the BE-7 open points.

### Fix round (stack review + workbench review, no must-fix)
- **No flicker on a re-read (#1).** `headerModel.ts` `blockStateView`: while the open block is re-read (`status: 'loading'`: a channel switch, a scene change, an undo) the last state stays on show — Scene Ignore `on`, the mode label, the muted mark — only disabled ("Reading the block…", `pending`, `aria-busy`, not dimmed: `.off.pending` keeps full strength); `bypassModeText` shows the label whenever there is one, so the control keeps its width. A hard reason (offline, server, device, read error, no pack) still clears it. First open of a block (no state yet) reads "Reading the block…", not "has none".
- **No wrong-channel write (#2).** The tag stores the channel it was read on (`editor.svelte.ts`); `editor.blockStateStale` is true while the selected channel differs (a channel switch / scene change before its re-read lands): the header shows the state disabled as pending and `setBlockStateParam` writes nothing.
- **A write the device does not take is undone (#3).** `setEnum` (the shared enum path: the header and the board's selects / switches): a failed request, or a refusal (`ok:false`) on a grid device, puts the value back if nothing changed it since, drops the undo step (`history.record` now returns the step id, new `history.discard(id)`) and toasts once ("<param>: the device did not take the change"). On a linear-chain device (AM4) `ok:false` means "no acknowledgement in time" and is left alone. Otherwise unchanged.
- **Tablet targets (#4).** `BeHeader` `touch` (device class phone or tablet, `BeSurface`): the 40 px rules (chip 42, state segments 40 high and ≥ 40 wide, ⋯, the channel letter and A–D) apply on the tablet too; the monolith's ✕ too (`BlockEditor.svelte` `.ed.touch .close`). `oneRowMinWidth` / `headerRows` take `touch` (⋯ / ✕ 40 px).
- **No row wrap (#5).** `bypassModeInMenu(width, { hasEnd, touch })`: the control moves into ⋯ below the tiny width AND wherever a readable chip (`CHIP_READABLE_W` 172 px: the CSS minimum of 132 px cut the type name to one letter at 500 px) · the widest narrow state group ("Bypassed | Mute FX Out ▾ | Ignore", measured 264 px, `STATE_NARROW_W` 270) · ⋯ (· ✕) no longer fit row one: 528 px (desktop), 538 (touch), 566 (✕), 586 (touch + ✕). One measurement: `BeSurface` binds the header's own width (no dead band between `rootW` and the header).
- **Nits.** The unreachable "param not in enums" write fallback and `withBlockStateValue` are gone: a tagged param the block's enums do not list is no control (`liveBlockState` → null). ForgeFX flags a failed block read (`readError: true`) instead of serving empty members; Axis shows "Couldn't read this block". `supported` parses strictly as a boolean (anything else = malformed member). The board's own Bypass Mode select shows the header's labels (`withBypassModeLabels` at load, from the tag: "Mute FX Out" on both). `types.ts`: the `DeviceEvent` kind `'blockState'` (bypass / channel pushes) is noted as unrelated to `BlockState`. `docs/ROADMAP.md` ("copy/controllers"), `docs/design-spec.md` (Mute → Bypass mode, AXIS-81). This log's device-side wording made neutral.
- **Tests.** Vitest: `blockState.test.ts` 8 → 10 (strict `supported`, `readError`, missing param = no control, labels), `headerModel.test.ts` +3 (pending keeps the state, the wrap thresholds with / without ✕ and touch, touch one-row widths), new `editor.blockState.runes.test.ts` (7: eid scoping incl. a pending read of another block, live values + board labels, stale channel writes nothing, only tagged params written, a failed request / a grid refusal reverted with the step dropped and one toast, a later change not overwritten, AM4 `ok:false` left alone). ForgeFX `drivers/block-state` 6 → 8 (channel B active reads channel B's values, a failed read flagged). e2e spec 41 27 → 33: a firmware gate ("Needs firmware ≥ 5.03", Bypass mode still works), a write the device refuses (mocked 500: header and board back, one toast; the board's select on the same path), a held re-read after a channel switch (state kept on show, disabled, same width, nothing written, then channel B), 470 / 500 / 540 px with "Mute FX Out" and "Bypassed" (control in ⋯ at 470 and 500, in the header at 540; chip · state · ⋯ on one row, no overflow, the chip ≥ 160 px); the caps-off no-write check is now deterministic (a board write arrives first). Spec 44 21 → 22: tablet header targets ≥ 40 px (Engaged, Bypass mode, Scene Ignore, ⋯, CH and A–D, the menu's rows), one row. The monolith's ✕ variant of #5 is covered by Vitest (no monolith e2e harness).

Gates (fix round):
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 2579 passed (169 files) (BE-8 2568 / 168; new `editor.blockState.runes.test.ts` 7, `blockState` +2, `headerModel` +2).
- Chromium e2e, full suite (`PW_PORT=5197`): 246/246 (BE-8 239; spec 41 27 → 33, spec 44 21 → 22). Flake check `41-block-editor-header` + `44-block-editor-touch` with `--repeat-each=3`: 165/165. (An earlier repeat run had one failure, 161/162: the Bypass mode test opened the board's select while the Preamp tab's smooth scroll was still running, and the select closes on scroll; spec 41 now waits for the board to rest after a tab click, `gotoPage`.)
- Stack: forgefx-midi `npm run build && npm test` 99/99 suites (+ browser-safe, catalog, cache checks); ForgeFX `npm run typecheck && npm test` 40/40 suites (+ browser-safe).
- Screenshots (mocked amp, not committed) in `<scratchpad>/be-blockstate/` (retaken): desktop 1440 header with Scene Ignore on and the Bypass mode menu (channel B), the muting mode engaged / bypassed, the pending re-read after a channel switch (state kept, disabled), caps off, the firmware gate, tablet 1100 header (40 px targets), phone 390 header + the ⋯ ▸ Bypass mode submenu, phone 500 (Bypass mode in ⋯, readable chip) and 540 ("Mute FX Out" in the header, one row).

## ROUND BE-8b — cross-block layout controls stay gaps (AXIS-93)

Branch `feature/block-editor-rework`, on top of ROUND BE-8. A device-layout control can belong to ANOTHER block than the one being edited (a cross-block ref: Controllers › Modifiers, Tempo/Pitch with the global metronome, CS per Scene, the Output block's config rows, …). Its `paramId` is in the owner's id space, but `resolveControl` ignored `crossBlock`, so such a control was seeded onto the open block's param that happens to carry the same number — a tile at the wrong place, under the wrong caption, writing a different parameter than the layout meant.

### What changed
- `deviceLayoutBoard.ts`: new `isForeignControl(ctl, owner)` — a control with a `crossBlock` is foreign unless the ref names its owner by `effectId` AND that is the open block. `resolveControl(ctl, byKey, owner)` returns a gap for a foreign control first (also no fall-back to the open block's meter / bypass / EQ entries). Controls without `crossBlock` (or `crossBlock: null`) resolve exactly as before.
- `types.ts`: `LayoutCrossBlock` now matches what the server sends — `effect: string` (the editor's owner token, e.g. `ID_GLOBAL`), optional `effectId?: number` (not sent yet), `family: string | null`, `paramId` documented as the owner's id. The old comment ("rendered live via the pinned-param hydration") was wrong and is gone.
- The same guard in every consumer of layout controls: the v2 seed (`deviceLayoutBoardV2.ts`: positioned and rows-only builds, the height budget, `hasDeviceLayoutBoard`) and `layoutPlacement.ts` `pageEntries` (tiles, and `boundToParam`: a bold heading that names a foreign param is a title, not a control). `BeSurface.svelte` passes the open block's effect id (`editor.selected?.effectId`).
- Stored boards: the persistence layer recognises an untouched stored Default board by comparing it with the previous rows-only seed. Those earlier versions had no guard, so `previousSeed` is built with `legacyUnguarded: true` (rows-only only; never drawn): a stored board that is still exactly that old seed follows the current, guarded seed; any board the user changed keeps its content.

### Decisions
- With today's servers (owner token only, no effect id) every cross-block ref is a gap: it keeps its slot so its neighbours stay aligned, and a page of refs only (e.g. Controllers › Modifiers, CS per Scene) is not shown. Binding them live needs the server to resolve the owner's effect id (research phase P6); the type and the guard are ready for it (`effectId` equal to the open block → binds as a normal control).
- The params a ref used to occupy are still on the board: a catalog entry no layout control places goes to the trailing "More" page as before.

### Tests
- Vitest: `deviceLayoutBoard.test.ts` +6 (a ref whose pid exists in the open block stays a gap; no meter / bypass / EQ fall-back; a matching effect id binds; a different owner or an unknown open block stays a gap; no / null `crossBlock` unchanged; `legacyUnguarded`), `deviceLayoutBoardV2.test.ts` +5 (positioned and rows-only seeds keep the slot, a refs-only page is not shown, the open block's id alone binds nothing, a matching owner binds, `hasDeviceLayoutBoard` ignores refs, the legacy previous seed), `layoutPlacement.test.ts` +1 (refs are gaps, a bold heading on a ref is a title, owner matching).
- Probe (not committed, over the served gen-3 layouts with the server's knob / enum sets as the catalog): cross-block controls bound to an open-block param before → after: FM3 38 → 0, FM9 36 → 0, Axe-Fx III 36 → 0 over every layout variant (default variant only: 35 / 32 / 32 → 0); all of them CONTROLLERS (Modifiers, CS per Scene, Tempo) plus OUTPUT (3–4).

### Gates
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 2591 passed (169 files) (BE-8 fix round 2579; +12).
- Chromium e2e (`PW_PORT=5197`) specs 17 / 40 / 44 (the device-layout ones): 38/38. No e2e mock carries cross-block controls, so no expectation changed.

### Fix round (review of 04a027c)
- **The FC screen is no longer all gaps.** Every numeric control of the gen-3 FC layout is tagged with the FC screen's own owner token (`ID_FOOTCONTROLLER`, family `FC`), so the guard emptied the whole screen and the curated board took over. `isForeignControl` now treats a ref as the open block's own when, without an effect id, it names the open layout's family (same param-id space) and a single-instance effect (no instance number at the end of the token). Refs to one instance of a multi-instance effect (`ID_OUTPUT1` on an Output page, `ID_DISTORT1`) and AM4 refs (family null) stay gaps. `LayoutOwner` carries the layout family; `legacyUnguarded` moved out of it into the builder (`buildDeviceLayoutBoardV2` option; it builds from a copy without refs, `withoutCrossBlockRefs`).
- `types.ts`: `crossBlock.effectId` must be in the same id space as the `:eid` the client reads the block with. `BeSource.owner` (the open block's effect id) is part of the BeState sync signature, so Output 1 → Output 2 (same family, catalog and variant) re-seeds with the right owner.
- Tests: `deviceLayoutBoard.test.ts` (same-family single-instance refs bind; multi-instance and foreign-family / family-less refs stay gaps; `withoutCrossBlockRefs`), `deviceLayoutBoardV2.test.ts` (an FC-like layout of self-refs builds a device board; the legacy builder in both modes), `boardPersistence.test.ts` (a stored Default equal to the old unguarded rows-only seed loads the guarded seed — source `seed`, no write; an edited board with a ref-bound tile is kept). Gates: with ROUND BE-9 below.

## ROUND BE-9 — Block editor: read-only graph tiles (AXIS-89)

Branch `feature/block-editor-rework`, on top of ROUND BE-8b. The block visuals a device editor typically shows (compressor curve, LFO / modulation scopes, ADSR, …) plus our own extras, built for our board and from our own math. Stack-pure from day one: the role tables (which catalog param plays which role in which display) live in forgefx-midi (`src/visuals.ts`, branch `feature/block-visuals`), ForgeFX serves them resolved per device and narrowed to the block's type (`visuals` on the block params, `graphKey` on the layout's graph slots, cap `blockVisuals`), and Axis knows no symbol names — it reads `visuals` + roles (param ids) and draws from the values its knobs hold.

### What changed
- **Data.** `types.ts`: `DeviceCaps.blockVisuals`, `BlockParams.visuals` (`BlockVisual` = `{ key, kind, title, mode?, roles }`), `LayoutControl.graphKey`. `blockVisuals.ts` parses the served list (absent / malformed → none; malformed entries and roles dropped; first of a repeated key wins); `forgefx.ts` normalizes it with the block state. `editor.svelte.ts`: `hasBlockVisuals` (cap true only) and `blockVisuals` (the served list, else none). `EditorSurface`: `bpm`, `hasTempo`, `blockVisuals?`, `meteringOn?` (the offline convert buffer: 120 / false / none).
- **Math (pure, Vitest, own math only)** under `src/lib/blockEditor/visuals/`: `tempo.ts` (divisions, synced rates), `lfo.ts` (textbook shapes, quantize, one-pole high cut), `dynamics.ts` (Giannoulis/Massberg/Reiss soft knee, downward expander, parallel mix, window), `response.ts` (RBJ analog prototypes, 4th order, Butterworth cuts, tilt, wah), `decay.ts`, `echo.ts`, `adsr.ts`, `plot.ts` (maps, paths, ticks, formatters), and `graphModel.ts` (one visual + live values → paths, markers, ticks, caption, honesty notes, `aria-label`; the playhead walk; the gain-reduction reading with a peak hold). Every illustrative constant is an exported, named constant marked "Illustrative (ours)".
- **Tile.** One read-only `graph` view and kind: `BE_SPEC.graph` 8×4 (min 4×3, max 24×8), presets S 6×3 / M 8×4 / L 12×6; catalog keys `graph:<key>` (ids −10, −11, …, after the EQ); `BeGraph.svelte` draws the plot (SVG in a fixed view box, non-scaling strokes, labels as HTML), `role="img"` with the computed `aria-label`, its notes in the tooltip, as its accessible description (`aria-describedby`) and under the name in its control menu (on touch: long-press), an amber badge where a user could be misled ("Auto makeup not drawn", "Simplified"), the live gain-reduction bar of a dynamics graph while metering is on (no dot on the curve), and the LFO playhead. Theme tokens only (a no-hex guard test scans the component — markup and SVG attributes included — and the math modules). The control menu keeps Size / Remove (no pin, no modifier: a negative id, not a continuous control) and opens for its notes even where it offers nothing to do (the phone); no value gestures, `touch-action: manipulation`, so the board scrolls through it.
- **Animation.** Only the LFO playhead: one shared clock in `BeSurface` (≤ 30 fps), running only while some playhead is registered — a tile registers while it is on screen (IntersectionObserver), the page is visible, nothing is being arranged and no reduced motion is asked for; otherwise the drawing is static (no dot). The tooltip says the dot shows the rate, not the device's real LFO phase.
- **Seeding.** `resolveControl`: a graph slot whose `graphKey` has a served visual becomes `graph:<key>` at its anchor (the PEQ / GEQ EQ rule stays first; the cross-block guard comes first of all, so a foreign slot never anchors). Unanchored visuals are not placed — not on "More", not on a curated board — and the Arrange library lists them under "Graphs · meters · actions" (Find lists them there too; the flat "Show all" results leave them out like the EQ graph). Persistence keeps `graph:` keys while a re-read has not brought them back (`isBlockLevelKey`, replacing the `BLOCK_LEVEL_KEYS` set check). A stored, untouched Default board picks up anchored graphs: `previousSeed` (which may now be several boards; the surface passes one) is the legacy rows-only default built without graphs and without the cross-block guard, and a stored board equal to it follows the current seed without a write — unless it is also the current seed minus its graph tiles (such a board may be one whose graphs the user removed; the user wins). A board the user changed, a removed graph included, is never rewritten; "Reset to device layout" brings the anchored graphs back. (The positioned default never shipped without graphs, so it is no previous seed.) Phone: `phoneWrap` makes every graph one full-width row (the ≤ 4 knobs a row rule is untouched).
- **Mock + spec.** `e2e/support/graphBlocks.ts` (synthetic compressor / tremolo / filter / gate / delay / controllers blocks with served `visuals` and keyed slots, tempo 90 bpm, a compressor gain-reduction monitor) behind `bootBlockEditorMock({ graphs, blockVisuals })`; new `e2e/45-block-editor-graphs.spec.ts` (12 tests).

### Decisions
- **Curated boards place no graph.** The brief's decision 3 ("curated boards get them after `eq`") and its phase-B line ("a Delay block without layout (graph only via the library)") disagree; on gen-3 the only curated block with a visual is the delay, so the more specific line wins: unanchored graphs, curated boards included, only via the library.
- **One generic renderer.** All kinds render through `BeGraph.svelte` from a per-kind plot model (`graphModel.ts`) instead of thin per-kind components: the kinds differ only in data, and the logic stays in tested `.ts`.
- **Values = the knobs' display values** (`paramValue`, which follows a drag at once), never the stale `value` field.
- **No mode inference in Axis:** compressor vs gate, tremolo vs panner, filter vs wah come from the served `mode`; a dynamics curve is drawn only with both `threshold` and `ratio` (or a gate's `range`). **The exception — value-label vocabularies:** within a mode, some drawing choices are read from the served option labels of a role's enum (or the block type name), mapped to our own drawing laws: the filter type (low-pass, peaking, …), the knee (HARD … SOFT), the LFO shape (SINE, TRIANGLE, …) and its OFF / STOP run state, the echo routing (MONO / STEREO / PING-PONG / DUAL), the ADSR curve, the tempo division (1/4, 1/8 …). A label we do not know is never guessed: it is drawn as a stated fallback (a sine with a note, "Response not drawn for this type", "Simplified"). Moving these to served codes is a server-side follow-up.
- **Gain reduction** is read from the block's `gainReduction` monitor (dB, else the inverted level); a bar with a peak hold (1.2 s, then 20 dB/s — illustrative) on the graph's right edge.
- Two layout slots with the same key on two pages give two tiles (a key appears once per page, as for knobs).

### Deferred
MegaTap (no honest law), the DynaCab mic graphic, the modifier live LFO (needs `/mod/slot`), drive / amp transfer curves, the phaser notch sweep, the rotary dial, the chorus second LFO, DELAY LFO scopes, the further response curves (comp sidechain, reverb EQ, multitap, plex, amp input EQ / speaker: those layout graph slots stay unkeyed gaps), an estimated gain-reduction dot on the curve.

### Assumptions shown to the user (tooltip / badge) and in the code headers
Knee widths per option are ours (HARD 0 / MED-HARD 3 / MEDIUM 6 / MED-SOFT 12 / SOFT 18 dB), "model knee, drawn medium" without a knee control, a gate without ratio as a hard gate to its range, Auto makeup not drawn, static curves only; LFO shapes / skew / duty on our own laws, tempo divisions as fractions of a whole note, the playhead = the rate, normalised modulation; analog prototypes, 4th order = section squared, cuts at 12 dB/oct, tilt as a shelf pair, wah sweep log-frequency with an idealised band-pass; reverb time as RT60; echo feedback × master per repeat, stereo R = T·ratio/100, other routings drawn as mono ("Simplified"); ADSR sustain as a hold time; cab delays in the device's unit on a fitted axis; FM3 custom tapers are served linear (a graph matches its knob, not necessarily the unit's display).

### Tests
- Vitest: new `visuals/*.test.ts` (tempo 12, lfo 20, dynamics 18, response 34, decay 8, echo 10, adsr 7, plot 12), `visuals/graphModel.test.ts` (22), `blockVisuals.test.ts` (5), `graphTiles.test.ts` (10: catalog entries, sizes / presets, `isBlockLevelKey` + persistence keep, phone full-width row, keyed-slot seeding with the EQ rule and the cross-block guard first, no graph on More / curated boards, Find groups), `noHexGraphColors.test.ts` (the component and the math modules), `boardPersistence.test.ts` +4 (an untouched stored Default picks up its anchored graph, an edited board is not rewritten, a stored graph tile survives a read without it; reworked in the fix round below) — plus the BE-8b fix-round tests.
- e2e `45-block-editor-graphs.spec.ts` (12): see `e2e/README.md`.

### Gates (BE-9 + the BE-8b fix round)
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 2772 passed (181 files) (BE-8b 2591 / 169).
- Chromium e2e, full suite (`PW_PORT=5197`): 258/258 (BE-8 246; spec 45 +12). Flake check specs 40–45 with `--repeat-each=3`: 384/384.
- Stack (phase A, `feature/block-visuals`): forgefx-midi `npm run build && npm test` 99/99 suites (+ browser-safe, catalog, cache checks); ForgeFX `npm run typecheck && npm test` 40/40 suites (+ browser-safe).
- Screenshots (mocked blocks, not committed) in `<scratchpad>/be-graphs/`: desktop 1440 light + dark, tablet 1024, phone 390 — compressor, tremolo, filter, delay (library-added), controllers.

### Fix round (two reviews of the BE-9 + BE-8b fix-up diff)
- **Playhead registration (must-fix 1).** No error showed in Chromium (spec 45 now fails on any page error or console error, e.g. `effect_update_depth_exceeded`), but the registration could feed back into itself: `BeGraph` now registers its playhead inside `untrack` (and unregisters on teardown the same way), and `BeSurface.setPlayhead` only writes (`playheadCount` from the plain set's size, never read before the write).
- **A removed graph stays removed (must-fix 2).** The surface passes ONE previous seed again: the legacy rows-only default, built without graph tiles and without the cross-block guard. The positioned defaults without graphs are gone (that default never shipped; a "graph removed" board equalled it and was upgraded back on reload). `loadBoard` also leaves a stored board alone when the previous seed is exactly the current one minus its graphs (a graph slot last on the last row: "untouched legacy" and "graph removed" look the same — the user wins). "Reset to device layout" brings the anchored graphs back (LAYOUTS.md says so).
- **Metering (should-fix a).** `BeHost.meteringOn`; `BeSurface` reads the block's monitors only while metering is on, so the gain-reduction bar AND the meter tile go away at METER OFF (no stale reading). Spec 45: metering on → bar, off → bar gone.
- **e2e/README (b):** 28 spec files / 259 tests on chromium, spec 45 after 44 (spec order), the Chromium-only note names spec 45's phone tests.
- **Mock (c):** `graphBlockParams` always serves `visuals` and the slots' `graphKey`, so the two no-cap tests prove the capability alone hides the graphs. Graph slots in the mock and the unit fixtures use a neutral `rawWidget: 'graph'`, the mock's gain-reduction monitor a made-up `X_` param name like the rest of the mock.
- **Gate knee (d):** a gate without a knee control is drawn hard and its `aria-label` says `knee hard (model)` (a compressor keeps `medium (model)`).
- **4th order (e):** only low-pass / high-pass / band-pass / notch are drawn as the squared section (`FOURTH_ORDER_TYPES`); peaking / shelves / tilt stay 2nd order (a squared peaking section would double its gain), and the "4th order = the section squared" note only appears for those types.
- **Nits.** Echo: a tempo division without a device tempo adds "Tempo unknown: drawn at the Time value." (like the LFO); `echo.ts` caps a tap's magnitude at `ECHO_MAX_AMP` (feedback × master > 1 no longer grows without bound; still flagged infinite). The peak hold falls back while the reading is steady (a `GR_TICK_MS` tick, not `Date.now()` inside a `$derived`). The gain-reduction scale takes the served monitor's `minDb` where it has one (`grScaleMinDb`), else the labelled fallback `GR_FALLBACK_MIN_DB` (−40 compressor / −60 gate). Inline constants are named (`THRESHOLD_RANGE_FALLBACK`, `DYNAMICS_WINDOW_FALLBACK` reused, `RESPONSE_RANGE_DB`, `LFO_TRACE_CYCLES` reused, `WAH_Q_DEFAULT`, `LFO_RANDOM_SEED`, `ECHO_WINDOW_PAD`, `CAB_AXIS_FIT`, `ORIGIN_TICK_GAP`, `GR_TICK_MS`), so the "every illustrative constant is named" line holds. One graph-key helper: `isGraphKey` / `graphCatalogKey` (boardModel, deviceLayoutBoard, persistence) instead of `'graph:'` strings. The unused `visuals/index.ts` barrel is gone. This log: the "No mode inference" decision names its exception (value-label vocabularies), the persistence line is corrected, no third-party fork is named.
- **Notes reach touch and assistive tech.** A graph's notes are its accessible description (`aria-describedby` on a visually hidden element; Svelte does not type `aria-description`) and sit under its name in the control menu (`ControlMenuState.notes`, rows `be-ci-note`); a menu with notes opens even where it offers nothing to do, so a long-press on the phone shows them.
- **Visual nits.** Tick labels sit on the plot's own background (the grid line no longer runs through them); a dynamics x tick within `ORIGIN_TICK_GAP` of the origin is left to the y axis (no two "−60" in the corner); the echo caption counts exactly what is drawn down to the stated floor — "500 ms, 8 repeats to −60 dB" at 40 % (ping-pong counted every tap; before, the left taps only: 4), `aria-label` the same; the phone screenshots are retaken per block (each shot asserts its own graph key first).
- Tests: `graphModel.test.ts` 22 → 27 (gate knee, origin tick, 4th-order note per type, echo caption count per routing, echo tempo unknown, GR scale), `echo.test.ts` +1 (growth cap), `response.test.ts` (4th-order peaking keeps its gain; notch squared), `boardPersistence.test.ts` (the graph describe rewritten for the single legacy seed: untouched legacy picks up the graph; a removed graph saved → loads as `desktop` without it; the ambiguous trailing-slot case keeps the removal; an edited board is not rewritten; a stored graph survives a read without it), `controlMenu.test.ts` +1 (notes rows; notes alone open the menu). Spec 45: 12 → 13 tests (metering off, notes in the description and the menu, phone long-press notes, the echo count, the page-error watch).

#### Gates (fix round)
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 2780 passed (181 files) (BE-9 2772; +8).
- Chromium e2e, full suite (`PW_PORT=5197`): 259/259 (spec 45 12 → 13). Flake check specs 40–45 with `--repeat-each=3`: 387/387.
- Screenshots retaken (20, `<scratchpad>/be-graphs/`, same set; every shot first asserts its own graph tile is in view — the phone delay shot is the desktop board the phone inherits, opened at 390 px).

#### Follow-up after the verification review
- Toggling METER no longer changes the catalog: the meter role comes from the block's ungated monitor list (`BeSurface` `blockMons`), so METER ON/OFF does not reload the board or drop the Arrange undo history; the meter tile and the graph's gain-reduction bar just show no reading while metering is off.
- Echo caption with feedback at or above 100 %: "N+ repeats" (the repeats never reach −60 dB, so the floor is not claimed); unit test added.
- Gates: `npm run check` 0/0; `npm test` 2781 passed (181 files); Chromium e2e full suite 259/259 before this follow-up, specs 17 + 40–45 after it 132/132.

## ROUND BE-10 — Block editor: fixed area, header controls out of every default, grid map strip gone (AXIS-94)

Branch `feature/block-editor-fixed-area`, on top of ROUND BE-9 (`a830d76`). The device editors repeat a mixer, and sometimes a control beside the pages, on every page; the default board stacked them under every page. They now show once, in one customizable area that stays in view. Bypass, Bypass Mode and Scene Ignore are in the header and no longer in any default board. The grid map strip of the Block Editor is removed.

### What changed
- **Grid map strip removed** (workbench, monolith; desktop, tablet, phone): `GridMap.svelte`, `gridMapPrefs.ts` (+ test), the ⋯ "Show / Hide grid map" row, the header's grid-map fields, the surface's `belowHeader` slot, the spec-41 test and the spec-44 assertions. The stored keys (`axs.gridmap.*`) are no longer read and not deleted. The "Grid swipe control ⇆", the workbench's Signal Grid "Map" view and the `axis.gridMap` widget are other features and untouched.
- **Model.** `BeBoard.fixed?: { cols, items }` (v stays 2). In the operation layer the area is one more list under a reserved page id (`FIXED_PAGE`, starts with a control character; `isReservedPageName`): `regions` / `hasPage` / `pageCols` / `pageItems` / `writePage` / `locate` know it, and move, resize, view, size, add, divider, rotate, label, remove, tidy, close gaps, Auto-pack, duplicates, find and the drawn-items wrapper work on it unchanged. An item wider than the area is narrowed when its view allows it (`sizedFor`), else refused. New: `addFixed`, `removeFixed`, `setFixedCols` (2..8 and what the items allow; narrowing packs again), `packArea`, `resetFixedFrom`. Page operations refuse it. The schema is forgiving (a bad `fixed` = absent, bad items dropped); `normalizeBoard` reconciles it (catalog, duplicates, clamp, overlap, ids unique across pages and area, no source rows).
- **Persistence.** Saved with the board (slug × profile × device class), in user seeds, copies and resets; `fixedDiffersFromSeed`, board fingerprints include the area; "Reset fixed area" next to "Reset this page".
- **Seed** (`fixedSeed.ts`, `deviceLayoutBoardV2.ts`): follows the shared-control rules and orders page-level controls, mixer controls and shared parameters. It tries 2 cells for narrow controls that fit the height budget, then 4. It considers 6 or 8 only where they lower the packed height. More wraps within the page width left beside Fixed. Controls that left the pages leave no slot in the rows, titles head what is left of their group, and a page that lost its left column closes up. Optional `LayoutPage.pageControls` form one row after the parameter rows (`pageRows`) and use their exact position on a positioned page. `layoutVariantSig` ignores them so a newer server can retain the user's Default board.
- **Header controls** (`headerControls.ts`): the bypass action, the served block-state params, exact labels, and the block's own layout controls; never the bypass of a part of the block (`<BLOCK>_<PART>_BYPASS`) and never another block's control. A named bypass flag must belong to the exact family and use the bypass widget. A misfiled control stays on its page. Out of device pages, fixed area, "More" and curated boards; still in the Arrange library and in Find ("Unused" lists them).
- **Height budget.** Recomputed on what remains: the tallest page by rows only plus two lines for titles / dividers, never above the previous rows-only height with everything on the page.
- **Migration.** Previous defaults are built for recognition only: `rowFlowOnly` + `legacyUnguarded` (released), `withoutFixed` (the `a830d76` default), the curated one `withHeader`, and the current seed as served without page-level controls. A stored Default that is exactly one of them loads the new seed on every device class, nothing written; any edited board keeps its content and gets no area. A shape that could be a previous (or the current) default with its graphs removed stays the user's.
- **View** (`fixedLayout.ts`, `BeFixed.svelte`, `BeGrid.svelte` split out of `BeBoard.svelte`): column at the far right with the pages' cell (pages measured against 24 − cols, or what the widest page needs), or a band at the bottom (phone; elsewhere when a column would leave < 240 px), at most four knobs a row, first line always shown, the rest behind a toggle. The place depends on the width only, so it cannot oscillate with the height a band takes.
- **Arrange** (`beArrange.svelte.ts`): drag page ↔ area, within it, library drag; the area becomes the target of "+ Control", the library, dividers, Close gaps and Tidy up once something in it (or its background) is pressed; arrows / Shift+arrows / Delete; the width handle (focusable separator, one undo step per drag or held key); "Add fixed area" in the bar; an emptied area shows only in Arrange with "Remove". A drag crossing the pages' edge towards the area no longer scrolls the pages along (`dwellScroll`, 220 ms).
- Control menu: "Move to page ▸" lists "Fixed area" (and every page for a control in it). Find: a "Fixed area" chip; a jump flashes the control without changing the page.

### Decisions
- **Height budget:** a strict "rows only of what remains" budget would drop more titles than before on the real layouts (the opposite of the aim), the old budget alone would let a few sparse pages grow; hence remaining + 2 lines, capped at the old height.
- **`…_BYPASS` names:** the brief's `/_(BYPASS|BYPASSMODE|SCENEIGNORE)$/` is narrowed to names of the block itself (one name token, the OLD variant included), so `<BLOCK>_EQ_BYPASS` stays in the layout. With a served block state the layout only decides about the bypass flag; Scene Ignore and Bypass Mode follow the tag (and exact labels).
- **A page that held nothing but the shared mixer goes away** (its controls are in the area); when that would be every page, nothing moves.
- **Select labels** over 12 characters take two knob columns in the area.
- **The loop waveform never moves** (8 cells wide, the area starts at 4).
- **Band:** no dividers (as in the compact view), its own cell from the width; in the workbench's phone shell 100 px on its right stay free for the dock opener (the toggle sits under it), and the pages' end clearance shrinks by the band's height. The phone dock height is capped by the workspace height remaining after the Signal Grid minimum. On the workbench tablet, the column viewport ends above the opener. The workbench column has a gutter beside the collapse button, and the phone monolith band respects the safe area.
- **Jump order** in Find: current page, then fixed area (already in view), then the first page.
- In the monolith the grid itself is above the docked editor on desktop / tablet; on the phone the editor is a full-screen sheet, so another block is reached through ✕ and the grid (the strip was the only way to switch without closing there).

### Tests
- Vitest: new `headerControls.test.ts`, `fixedSeed.test.ts`, `fixedLayout.test.ts`; `boardModel`, `boardSchema`, `boardPersistence` (every previous default × device class untouched; edited / removed / renamed / added kept), `beState.runes`, `deviceLayoutBoardV2` (an explicit header-key list and coverage for remaining non-graph catalog controls), `layoutPlacement` (gone controls, page-level rows), `boardView`, `boardGeometry`, `arrangeModel`, `arrangeBar`, `controlMenu`, `moreMenu`, `findControls` extended.
- e2e: new `46-block-editor-fixed.spec.ts` (17) with the mock option `fixed`; 17 / 41 / 43 / 44 updated (header controls are placed by hand where a test needs them on the board).
- Probes (not committed, over the served gen-3 layouts, FM3 / FM9 / Axe-Fx III): the recognition-only builders equal the `a830d76` code in 5240 comparisons; the new default over every variant (with and without the page-level controls the codec branch is adding) has no overlap, nothing out of bounds, no empty page, no lost control, no header control, and is already normal.

### Gates before the fix round
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 2893 passed (183 files) (BE-9 2781 / 181).
- Chromium e2e, full suite (`PW_PORT=5197`): 275/275 (BE-9 259; spec 41 −1, spec 46 +17).
- Not run: Firefox, a real device (neither the area nor the migration of real stored boards), a physical phone / tablet. The monolith shell has no e2e harness: checked by hand-run screenshots with the mocked device (desktop 1440, phone 390).
- Screenshots (mocked amp, not committed): 1440 top / side / Arrange with library / emptied area / Find flash, tablet 1024×768 and its Arrange, phone 390×844 closed and open, narrow editor 330 / 460 px, dark and light.

### Review fixes
- A1–A2: Header detection requires exact family ownership for named flags and the bypass widget for a named bypass flag. Explicit header fixtures and a probe of 919 Axe-Fx III, FM3, FM9 and AM4 variants cover MultiDelay and Amp Section.
- A3–A4: Select popovers and value bubbles clamp within the viewport. The Fixed band clears the bottom bar at 390×664 and 360×640 and resizes with an already-open editor when the viewport shrinks.
- B1–B2: Page reset restores the seed area when required to retain controls. The confirmation names moved and removed controls. The Fixed move command has an ID distinct from the command for a page named `fixed`.
- B3–B8: More fits beside Fixed, each previous seed has a regression test, foreign-family controls stay on their pages, and packing widens only when it lowers height. Mixer ordering stays as agreed.
- B9–B11, B15–B17: The tablet viewport stops above the dock opener, the workbench gutter protects the last tile, native scrollbars show overflow, and the touch axis follows actual content overflow. The tablet grip is 80 px high and the phone monolith band respects the safe area.
- B12–B14, B18: A move into or out of Fixed carries the tools' target to its destination. Arrange holds the placement while sizing, caps the width to preserve page space, and keeps focus on the handle. Tile shortcuts ignore the handle. Button release and window blur both end a width drag.
- Fixed keeps its label and the strip keeps its offset when resizing or toggling. Adding and removing the area returns focus to the next layout action. Regression tests cover fixed width during item edits, reserved IDs, page height, row flow and fixed-aware comparison.


### Fix-round verification
- `npm run check`: 0 errors and 0 warnings. `npm test`: 2,924 passed across 184 files. `npm run build`: passed.
- Chromium exercised the built app through an in-process mock harness for the 5197 origin because Windows denied socket connections to localhost. The full set covered 279 cases. 278 passed in one run, then the tablet target-size test passed on three repeats with a tolerance for Chromium sub-pixel rounding. Spec 46 passed 63/63 across three repeats.
- Reviewed dark and light screenshots of Top and Side at 1440, 1024 and 834 px, the closed and expanded 390×664 band, and the right-edge select.

## Block Editor scale in the desktop and tablet dock

- The scale uses the room available for two standard control rows and a full 12-control page. Fixed has its own width and shares the page scale. Pages with extra rows scroll, and a taller page no longer determines the scale for the block.
- Small, Medium and Large set distinct scale factors, cell limits and minimum editor heights. The dock minimum accounts for the measured editor chrome and leaves room for the Signal Grid. The phone still wraps at four controls per row.
- Device defaults prefer two rows where the controls fit. More can use all 12 slots on each row beside Fixed. Earlier untouched defaults can migrate, and edited layouts keep their placements.

## Header feedback, meter telemetry, AMP EQ and custom-panel dividers

- Page tabs scroll and drag without changing the page (wheel, Arrow/Home/End, pointer capture), the active tab is revealed after navigation or resize, and the strip is centred while the top controls stop re-flowing at 940 px.
- Search, Engaged | Bypass mode | Scene Ignore and ⋯ are one joined group at the type picker's 36 px (42 px on touch). The search field widens only while the header is one row and at least 1240 px.
- The block accent reaches the tab highlight and every editable control: tiles map the block colour onto the shared accent variables, so faders and sliders follow it like knobs.
- A parameter the layout serves as a meter becomes a read-only meter entry with no knob/fader/slider views. Its reading is bound by the served monitor symbol; a named reading with a normalized value is the only fallback.
- The Amp Input EQ is drawn as a parametric EQ graph (peak, low cut, high cut) from `DISTORT_INEQ*`; the Output EQ is a graphic EQ over the fixed-frequency Output EQ page. Both are resolved per device from the shipped catalogs and layouts (`feature/block-editor-eq-visuals` in forgefx-midi and ForgeFX), never from ids in Axis. Pages that name their positions (Low/Mid/High) have no frequencies to draw.
- The two-row default re-flows a page only when every title and divider survives: a positioned page that would fit two rows only by losing its group labels keeps its own placement.
- AMP layout graph slots key to `inputEq`; the graphic Output EQ slot is added only to an Output EQ page with at least three fixed frequencies.
- Block glyphs are inline SVG from the PTN icon set, with the licences in `legal/icons/`; the grid, type chip, pickers, palette and convert view all render them through `BlockGlyph`.
- Custom panels have horizontal and vertical dividers with a label and, for the vertical one, a row span; both are repeatable (a second divider is a new widget, not a move).

### Verification
- `npm run check`: 0 errors and 0 warnings. `npm test`: 2,946 passed across 188 files. `npm run build`: passed.
- Playwright specs 40-47 (the whole Block Editor set): 153 passed on the system Chrome (the bundled Chromium revision for this Playwright version is not installed here; a local-only config supplied `channel: chrome`, not committed).
- forgefx-midi `feature/block-editor-eq-visuals`: `npm run build` and 102 tests pass (15 visuals cases, including the new AMP EQ case). ForgeFX `feature/block-editor-eq-visuals`: typecheck and 41 suites pass against that codec build (block-visuals suite now pins the AMP Input/Output EQ on all three gen-3 devices).

## Redesign review follow-up

- The control search uses an icon at every width. It opens a 320 px popover and moves focus into the field. Closing the search returns focus to the button. Reopening it lets the user refine the flat results in place.
- The left navigation uses the PTN SVGs for Grid, Presets, Footswitches, Controllers, Live, Setup and Account. Scenes and Theme use matching SVGs.

## FM3 preset loading and live meter demand

- METER starts off. Axis requests live block monitors when METER is on and a visible tile uses the readings. Scrolling the last consumer out of view stops the requests. The Looper waveform still follows its own visibility.
- ForgeFX device reads recovered on Windows under Node 20. The FM3 returned all 512 full summaries in 12.4 seconds and the three post-switch grid requests each completed in 1.1–1.5 seconds. The Axis Preset Browser rebuilt the cache in 27.1 seconds with zero failed reads and zero live block monitor requests during the scan.
- Four focused browser tests passed for the meter toggle, the off-screen Amp meter, compressor gain reduction, and the Looper waveform.

## Dividers take no grid space

- A divider now sits ON a grid line instead of occupying a cell: `addDivider` gives an `hdiv` h = 0 and a `vdiv` w = 0, spanning the controls' own extent, and "Add divider" walks to the first line that has none so repeated dividers stack instead of overlapping. Rotating keeps it a line (the fixed area keeps cell-sized dividers, which it has to pack).
- `BeControl` draws a divider as an absolutely positioned band centred on that line (`divBox`), outside the CSS grid flow, so adding or removing one changes neither the page height nor any control's position.
- Verified in the browser: adding a divider leaves `data-rows`, the page height and every control's top unchanged; the arrange spec 43 (27 tests) passes; Axis check clean, 189 files / 2,965 tests pass.
- Device layouts are compacted too: `compactDividers` (layoutPlacement, the one `Placement` exit) drops rows that hold only dividers, moves every control up by the dropped rows above it and puts each divider on the next control row's top edge (or the page's bottom edge) with zero thickness. `cleanDivider` keeps that zero thickness through `normalizeBoard`, and `fits` lets a zero-thickness divider share a row edge with a control (it covers no cell). Device pages therefore no longer keep an empty line under a section title.
- Divider labels are never clipped any more: the band lets its label overflow (`.be-tile.divider { overflow: visible }`, vertical labels start at the band's top edge).
- The band IS the grid gap (`divBox` uses `g`), so it can never cover the row above or beside it: a horizontal divider's band fills the gap between two rows, a vertical one the gap between two columns, and `PAD_Y` 10 → 16 gives a title heading the first row the room it needs above the grid (the grid itself moves down, so a top title stops overlapping the first row).
- Gap 4 → 6 px (5 → 7 for Large) with the pitch kept: `cmax` drops by the same 2 px (52 → 50, 70 → 68) and `phoneMax` likewise, so the controls get 2 px narrower and the space between them 2 px wider, while no page re-flows, spills a control onto "More" or changes width. `widthCell` now takes the fixed area's real column count (it assumed a knob's 2), so pages keep their 24 columns beside a wider area instead of being squeezed.
- The gap is now the divider band itself: 4 → 12 px (s), 4 → 14 (m), 5 → 16 (l), with `cmax`/`phoneMax` lowered by the same delta (50 → 42, 68 → 59, 40 → 40) so the pitch at the cap does not grow and no page re-flows or spills. The phone keeps a slightly smaller knob (74 px at 390) and the band's first line holds two knobs instead of three at 360 px.
- Arrange shows a divider's drop preview as the LINE it becomes (`be-ghost.line`), not a one-row cell: the pointer snaps to the nearest grid line, and the preview draws centred in that gap.
- `phoneWrap` puts a compacted heading back on a line of its own (one inserted line per heading row, everything below shifts), so the phone keeps every title above the rows it heads; `compactDividers` no longer reorders the page (it maps the input order), which the phone's re-wrap depends on.
- The EQ graph no longer swallows a phone swipe: `EQGraph`'s background is `touch-action: manipulation` (a swipe on it pans the page / strip), only its `.node` bands keep `touch-action: none` for the two-axis drag. This closes the slice-7 deferral.
- Spec 17 now pins the line-divider model: titles sit ON their controls' line (`h = 0`), the mixer divider on its first row's line, the overlap check skips zero-thickness dividers.

## Port to the release bases (Axis v0.10.3-beta, ForgeFX v0.8.3-beta, codec v0.6.1)

- **Axis:** merged `v0.10.3-beta` (clean, 0 conflicts). `DeviceCaps.graphCurves` is mirrored from the server's telemetry cap (the curve tiles can be gated now); the Looper wave tile scales its bars to `host.wave.length` (the new capture sends 128 samples; the fixed viewBox clipped the last 18).
- **Codec:** merged `v0.6.1` and regenerated all four device layouts from the local FM3-Edit 1.07.15 config (`FORGEFX_MIDI_EDITOR_XML_ROOT=fas-re/raw`, the source main's own regeneration used). Our `<EditorControl>`-under-`<Page>` emission was ported onto main's newer generator: FM3 950 pages / 696 page-level controls, FM9 853/575, Axe-Fx III 1175/731, AM4 383/60. The data files' diff against `v0.6.1` is **additions only** (no regenerated line changed), so the newer source data and our page controls now live in one generation.
- **ForgeFX:** ported, not merged (`v0.8.3-beta` rewrote `blockParams` into classic + generic): `observe` on the definition-only read, `blockState` + `visuals` on the classic response, `pageControls` pruning on the firmware-aware gate, `stampGraphKeys` over the firmware-resolved pages, `graphKeys` option on `layoutFrom`. The meter-demand gate had also silenced the CPU poll; CPU keeps its own read while the four meter reads stay demand-gated.
- Gates on the merged base: Axis `npm run check` clean, `npm test` 189 files / 2,965; block-editor e2e 133/133 (40, 41, 43, 44, 45, 46, 51) and the workbench set 130/130 (01-22, spec 17 updated); codec `npm run build && npm test` green; ForgeFX `npm run typecheck && npm test` green (goldens regenerated for the new layout data).

### Still open (UI rework, deferred with reasons)

- **Control-menu header icon (BE-4):** needs a control-kind glyph set (knob / toggle / select / fader / meter / graph / wave); the icon work so far is block families (`BlockGlyph`) and UI actions (`Icon`), neither has kind glyphs.
- **Arrange redo (BE-5):** only undo exists (`arrangeHistory` is a single stack). A redo stack has to be cleared on every new arrange change and needs the bar row + keybinding + tests - a feature, not a fix.
- **Page menu on a tab right-click (BE-5):** `buildPageMenu` is built for the ACTIVE page; opening it for another tab needs the menu keyed by page (and the page switched on pick).
- **Floating copy of the dragged tile (BE-5):** the selection follows the pointer as an outline; a lifted copy is decoration.
- **Ctrl+Z routing while the workbench's Customize was on before Arrange started (BE-5):** reaches into `src/lib/workbench/` history.
- **Two open editors of the same slug keep separate board state (BE-2):** needs a board store shared per slug across mounts.
- **The ? hover action shows no assigned-modifier state (AXIS-92):** the editor has no live modifier-binding read for a control; the modifier bindings live on the device's modifier slots, which the app does not read yet.
- **Mute** stays a placeholder (device-side item); **FM3** FORMANT / MIXER / FDBKRET / MULTIPLEXER bypass-mode labels are missing from the codec catalog (codec data follow-up); a front-panel enum change still updates on the next block read, not live (pre-existing for every enum).




## UI follow-ups (second pass): navigation, palette, footer, scenes, EQ visuals

- **Side list is the built-in navigation** (`DEFAULT_PREFS.nav = 'side'`) and the header's ⋯ menu gained **Reset all editor layouts**: it drops every block family's boards, meta and saved seeds (`surfRemovePrefix`), so each regenerates from its device layout with the side list - a stored Top choice is cleared too. The Virtual / Setup screens mount `BeSurface`, so they follow the same default and reset.
- **Meter on by default** (`meteringOn` starts true; the demand flag reaches the server on connect).
- **No value bubble above knobs** (the value is on the tile): markup, CSS, state and the drag/hover triggers are gone; the parameter help still shows in the footer.
- **Add-block palette**: block rows resolve the Signal Grid's family catalog (`name -> pack`), so each row carries its block's accent + glyph; the "Place in cell" chip row is gone.
- **Scene widget (SCN)**: the preset shape without arrows (`SCN n`, name when expanded); clicking the number unfolds a bar of scene numbers over the widget itself - the channel selector's pattern, not a dropdown - the active one marked, a pick or a click-away folds it.
- **Grid re-read button** (the floating `.regrid` in the Signal Grid's corner) removed, both variants.
- **Footer**: `StatusBar` is the top bar's three areas - left hint (ticker), center device · preset · scene, right support / copyright / imprint.
- **EQ visuals**: the codec serves the PEQ parametric (5 bands) and GEQ graphic (10 bands) EQs; Axis keeps a graphic EQ's band gains off every page (catalog-wide, not just mixer-rail layouts), so a GEQ's faders are gone and the EQ tile draws them. The compressor graph works since the layout regeneration (its slot stamps to `dynamics`).
- Gates: `npm run check` clean, 189 files / 2,965 tests; block-editor e2e 40/45/46 47/47, workbench 05 + 22 29/29; codec `npm run build && npm test` green.

### Still open (UI)

- **Custom panels as a block-editor board** (handover: `HANDOVER-CUSTOM-PANEL.md` in the workspace root): one "Quick Controls" panel, 4 cells wide by default, grid drag/drop, block grouping with labelled dividers.
- **EQ style switch** on the tile (Output EQ / Input EQ / PEQ rendering as selectable views) and **clamping a seeded graph tile to the page/slot span**.

## Quick Controls: the custom panel is a Block Editor board

Branch `feature/block-editor-fixed-area`, on top of the second-pass follow-ups. A custom panel now lays its
widgets out on the Block Editor's cell raster, collects every control into ONE "Quick Controls" panel, and
groups them under a labelled divider per block. The EQ of a graphic-EQ block takes the place of the faders it
replaces instead of falling onto "More".

### What changed

- **Pure board** (`workbench/core/customPanelBoard.ts`, new + test): `layoutPanelBoard({ widgets, groupByBlock })`
  → `{ cols, rows, items }` with `PanelBoardItem { id, x, y, w, h, kind: 'control' | 'divider', label?, widgetId? }`.
  A control is 2×2 cells; 4 cells (two knobs) wide by default. The width grows one knob column at a time when a
  control no longer fits the two knob rows the default width holds (5th control → 6, 7th → 8), then the height
  grows (four knobs a row max). Grouping ON sorts by block label then control order and puts a labelled divider
  (`h = 0`, a line in the grid gap) above each block's first row; each block starts on a fresh row. Grouping OFF
  keeps the plain order and drops the dividers. `sortPanelWidgets` is the pure re-sort; `controlAtCell` maps a
  pointer to the tile under it. Deterministic and idempotent.
- **Tiles** (`axis-workbench/customPanelTiles.ts`, new + test): a widget as a board tile — bound block (the group
  name/key), parameter label, accent, and whether it is a parameter control at all (`Widgets` group for the
  other widget types). Grouping/auto-sort options are read from `panel.state` with their defaults (on).
- **Panel body** (`AxisCustomPanel.svelte`): replaces the `WidgetZone` body with the raster — one
  `AxisQuickControlTile` per control and a labelled line per divider. The tile (`AxisQuickControlTile.svelte`,
  new) renders the Block Editor's own `BeControl` (knob / on-off pill) and provides a minimal `BeHost`: values,
  typing, track/keyboard gestures and enum cycling go through the editor's pinned-block hydration, so a control
  works whether or not its block is open. Per block accent, 2×2 cells, no hover actions
  (`BeHost.hideHoverActions`, new optional field). Drops append at the pointer's cell (parameter drag), ⌘/Ctrl-drag
  reorders (a widget move by the pointer's cell), right-click selects and ×/Delete removes (`widget.hide`), Esc
  clears. The empty panel keeps the `+ Widget` / dashed drop hint.
- **One panel** (`axisParameterActions.ts`): `AXIS_CONTROLS_PANEL_TITLE = 'Quick Controls'`. Every collect path
  (edge drop, pin action, panel drop) goes through `axisCollectPanelId()`; a panel that is still at its default
  "Custom Panel" title is named Quick Controls on its first control, and a parked panel is docked and activated
  (collecting into an off-screen panel used to look like nothing happened).
- **Grouping toggle**: the panel's own header overflow (`⋯`, `data-quick-controls-menu`) carries "Group by block"
  and the `cols × rows` readout. The choice persists as `panel.state.groupByBlock` / `autoSort` through a new
  generic `panel.state` command (merge semantics like `widget.state`, one reducer test); switching it back on
  re-sorts and rewrites the widget order.
- **EQ placement** (`deviceLayoutBoardV2`): while a graphic EQ's band gains are dropped from a page, the first
  dropped fader's anchor becomes the `eq` tile (page tile, marked represented so it never reaches "More"); a page
  that already stamps an EQ graph keeps that slot instead. A page that draws its EQ gets the height budget for it
  (`BE_SPEC.eq.h + TITLE_LINES`), so the EQ no longer disappears when the faders it replaces were one line tall.

### Decisions

- **Width rule:** the handover's prose ("`cols += 2` when a control would start beyond `cols`", "the 5th widens")
  and its example numbers (3 → 6 cols, 5 → 8/6) contradict each other and its own e2e (three knobs → 4 wide).
  Implemented the coherent rule behind "the 5th control widens the panel": grow one knob column instead of
  stacking a third knob row at the current width, up to four knobs a row, then grow the height. Unit-tested
  (1–2 → 4/2, 3–4 → 4/4, 5–6 → 6/4, 7–8 → 8/4, 9 → 8/6).
- **A divider takes no cell** (h = 0): it is drawn in the grid gap above its block's first row, like the block
  editor's compacted section titles; the panel reserves one gap-band of top padding so the first one shows.
- **Widget drag in Customize:** a plain drag on a tile is the workbench's (`beginWidgetDrag`): the tile lifts
  (the drag ghost travels, the board closes the gap) and drops into any zone, onto a unit to group, or at the
  workspace edge for a new panel. The board's own ⌘/Ctrl-drag still reorders within the panel. Dropping INTO
  the panel is unchanged.

### Tests and gates

- `npm run check`: 0 errors, 0 warnings. `npm test`: 191 files / 2,985 tests (2,965 + 12 board + 5 tiles + 1
  reducer + 1 pin-collect + 1 EQ placement).
- New `e2e/23-quick-controls.spec.ts` (5): one "Quick Controls" panel on the first drop, 4 cells wide with
  block-editor tiles, the 5th control widens to 6 without wrapping, labelled dividers per block + toggle off/on,
  width survives a reload, select + × narrows the panel back.
- Chromium e2e (system Chrome, temporary local config): spec 23 5/5, workbench 09 + 15 11/11, spec 42 21/21,
  block editor 17 + 40 + 43 + 51 50/50. Full suite 289/295 — the six failures were one renamed-panel expectation
  (fixed) and five stale specs unrelated to this work (see follow-ups).

### Still open

- **Edit-mode widget drag-out of a Quick Controls tile:** done — see the section below.
- **Graph-tile size clamp (handover item 2):** done — see the section below.
- **EQ style switch on the tile (handover item 3):** done — see the section below.
- **Visual DynaCab UI (handover item 4):** done — see the section below.
- **Cab Align graph (handover item 5):** done — see the section below.
- **Stale e2e specs noticed in the full run:** fixed — `45-block-editor-graphs` now expects metering on by
  default (the four METER cases were rewritten around switching it OFF), and `46-block-editor-fixed`'s
  right-edge case only covers the select popover (the `.be-tip` value bubble was removed earlier).

## Graph and EQ tile seeds stay inside their slot

- **The seed.** `layoutPlacement` now sizes a large view (graph, EQ, meter, waveform) from its device slot before
  placement: `seedLargeWidth` narrows the view's default width to the room left on the page from its child column
  and to the slot's own run, never under the view's minimum. The slot's run is `slotSpanCells`: from the slot's
  exact x to the next exact control of the SAME device line, else the page's right edge, in cells at the page's
  measured pitch (one knob slot = 2 cells). A slot narrower than the spec keeps the view's minimum and the placer
  moves the tile to a free spot; a slot that starts near the right edge keeps its column instead of being clamped
  left over its neighbours. Arrange can still grow a tile; a stored board keeps whatever size it has.
- **Why not `graphTiles.ts`:** that file never existed on this branch — sizing lives in `layoutPlacement`'s
  positioned-page anchors. The clamp is applied where the anchors are built, so `putLarge` (height first, then
  width, then move) still has the last word when a spot is blocked.
- **No data migration needed:** a stored Default board whose graph tile was seeded at the old full width no longer
  matches the new seed and is kept as the user's board (nothing is removed or moved on load).
- **Tests.** New pure-helper cases (`seedLargeWidth` / `slotSpanCells`: slot narrower than the spec, page narrower
  than the slot, both fitting, a slot with no right neighbour, no measured pitch) and two positioned-page cases
  (an EQ narrowed from 8 to its 6-cell minimum by a neighbour on its line; a slot 18 cells in keeps x = 18 with a
  6-cell seed). The existing full-size and give-up-height cases still pass unchanged.
- **Gates.** `npm run check` 0/0; `npm test` 191 files / 2,991 tests (2,985 + 6). Chromium e2e: block editor
  17 + 40 + 41 + 44 + 47 + 51 75/75; 43 + 45 + 46 60/65 with only the five known stale cases (METER default,
  `.be-tip`).
## EQ styles: one eq tile, Input / Output / PEQ views

- **Views.** The eq tile gained three same-footprint view variants: `eqIn`, `eqOut`, `eqPeq` (`BE_SPEC` and
  `BE_PRESETS` copied from `eq`: 8×4 cells, min 6×3, max 24×8), labelled Input EQ / Output EQ / PEQ in the
  control menu's existing View list. The chosen view is the persisted per-tile field, so switching never resizes
  or moves the tile; `normalizeBoard` falls a stored view name the block no longer serves back to the first
  allowed one (footprint preserved), and the normalization stays idempotent.
- **Styles from the served visuals** (`blockEditor/eqStyles.ts`, new, pure + tested): a block's `eq` visuals whose
  key names input / output / peq (`inputEq`, `outputEq`, `peq`, `paramEq`) become styles; other eq visuals stay on
  the plain view. Each style carries its bands as the tile's editable `EQBand`s (roles are param ids resolved
  against the live params: graphic bands keep their fixed centres and draw as bells, parametric ones take their
  shape from the band's type enum), its title and its gain range (±12 dB graphic, ±20 dB parametric); repeated
  styles are deduped in the server's order.
- **Wiring.** `buildCatalog({ eqViews })` lists those views on the one `eq` entry (plain `eq` first when the block
  has its own bands, else the first style is the default; no bands and no styles = no eq tile). `BeControl` draws
  `host.eqBandsFor / eqTitleFor / eqGainRangeFor(view)` with the block's own bands as the fallback; `BeSurface`
  wires them from `BlockEditor`, which builds the styles from `editor.blockVisuals` for every block that is not a
  PEQ/GEQ itself (those keep their own bands on the plain view).
- **Seed.** When a graphic EQ's faders become the eq tile, `deviceLayoutBoardV2` gives the tile the style view of
  the visual that owned the faders (`eqOut` for an output EQ) when the catalog allows that view.
- **Tests.** `eqStyles.test.ts` (8 cases: style detection, view mapping, parametric/graphic band reading, dropped
  bands, dedupe/order/ranges, empty input) plus board normalization (kept style, unknown-style fallback, footprint
  clamp) and catalog views (styles only, styles + own bands, none); `deviceLayoutBoardV2` pins the seeded `eqOut`.
  New `e2e/52-eq-styles.spec.ts` against a synthetic EQ block (ten gain faders and Input/Output/PEQ visuals): the
  eq tile replaces the faders as Output EQ (10 band nodes), the View list shows the three labels and switches
  title + bands with the same footprint (3 / 10 / 5 nodes), and the chosen PEQ survives a reload.
- **Gates.** `npm run check` 0/0; `npm test` 192 files / 3,003 tests. Chromium e2e for the block-editor set
  (17, 40-47, 49, 51, 52): 159/164, the five failures being the known stale cases (4 × METER default in 45,
  1 × removed `.be-tip` bubble in 46).

## DynaCab mic graphic on the CAB block

- **Codec** (`forgefx-midi feature/block-editor-eq-visuals`, `3332178`): a new `dynaCab` visual kind for the
  CABINET family — slot 1's mic position (`CABINET_DYNACAB_R1`), distance (`CABINET_DYNACAB_Z1`), cab
  (`..._TYPE1`) and mic (`..._MIC1`). `stampGraphKeys` gives the page that shows those controls (the DynaCab
  page) the visual's slot, once per variant; the legacy Cab variant is untouched. The `visuals` suite grew to
  16 cases (kind, roles, one slot on the DynaCab page, offered only while its controls are in the layout).
- **ForgeFX** (`21bd62a`): the catalog / newer-firmware goldens are regenerated; their only diff is the new slot.
- **Axis**: parses the kind and draws it (`graphModel.dynaCabPlot`): a filled cab silhouette with two speakers,
  the mic at the served position (0 = cone centre, 1 = edge) and distance (0 = against the grille), a dashed
  grille line, a guide, and a caption / aria naming the selected cab and mic with both values. The mic head and
  its guide move with the controls; a missing value still draws the other with a note.
- **Tests.** 3 plot cases (caption, six series with two filled areas, movement, one served control, the empty
  case) and a new `e2e/53-dynacab.spec.ts` against a synthetic DynaCab block: the slot sits on the DynaCab page,
  the tile is a `role="img"` graph, the caption carries the cab / mic / values, the sketch has two filled areas
  and six lines, and the mic head + guide follow the position knob (nothing written).
- **Gates.** Codec `npm run build && npm test` green (135 tests); ForgeFX `npm run typecheck` and 70 suites
  green; Axis `npm run check` 0/0, `npm test` 192 files / 3,005 tests; e2e 45 + 52 + 53 + 17: 17/21 with only
  the four known stale METER cases.

## Cab alignment graph, tile drag-out and the stale specs

- **Cab alignment (handover item 5).** `graphModel.cabAlignPlot` no longer fits the axis to `max(delay1,
  delay2) × 1.5` on every step: the ceiling is a 1-2-5 step of the values' own scale (`niceCeil`), floored at a
  tenth of the device's maximum and capped by it, so the ticks and the slot-1 marker stay put while one knob
  turns. The two markers end at different heights (an equal pair still shows both), their inline `1` / `2`
  labels are dropped when they would collide (the caption always names both), a single served slot still
  draws and says which one is missing, and both at 0 lands at the scale origin instead of an empty plot. The
  synthetic CAB block now serves a second page with the graph slot, so the new `e2e/53` case checks the
  shared scale / stable ticks / both markers in the real board.
- **Tile drag-out in Customize.** A plain left-button press on a Quick Controls tile starts the workbench
  `beginWidgetDrag` (the parent builds it from the widget record, the tile host is a `[data-widget-host]` with
  its widget id), so a tile can leave the panel for any zone, group with another unit, or open a new panel at
  the workspace edge; the tile lifts (`display: none`) like a lifted WidgetHost. ⌘/Ctrl-drag keeps the board's
  own reorder. New case 6 in `e2e/23-quick-controls.spec.ts`: edit mode, drag the tile to `top.left`, the bar
  gains a host and the panel loses one.
- **Stale specs.** `45-block-editor-graphs`: metering now starts on, so its four METER cases check the
  gain-reduction readout is there, switching it off clears it, the Looper still loads its waveform with
  metering off, and the Amp's off-screen meter does not poll (the visible-read baseline is cleared after
  switching pages). `46-block-editor-fixed`: the right-edge case drops the removed `.be-tip` bubble and keeps
  the select-popover clamp.
- **Gates.** Axis `npm run check` 0/0, `npm test` 192 files / 3,009 tests; e2e 15 + 23 + 45 + 46 + 52 + 53:
  56/56 (Chromium, system Chrome).
