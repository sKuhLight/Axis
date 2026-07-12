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
