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

## Deliberately deferred (documented in commits / agent reports)

- T12 P1/P2: full row anatomy (CPU meter, per-block chips, inline rename), context
  menus/swipe actions, detail cloud card/version restore, generic picker, builder-chip
  param editing, saved-filter inline UI. Deep param matching stays in the monolith
  (needs hydrated/decoded blocks).
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
**Round 7 COMPLETE. Round 8:** R8a T21+T23 LANDED (`0b4116f`) — all four safe-area
insets mapped + consumed edge-by-edge; phone bottom sheets (nav/dock/library) with
tested swipe-to-close (≥96px / ≥0.55px/ms, scroll-intent cancel), guards green.
R8b T26 Playwright E2E still IN FLIGHT (e2e/ + package.json only).

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
