# Axis Layout Rework - Current State Review and Remaining Implementation Plan

Date: 2026-07-06
Branch: `layout-rework` (working-tree state, including uncommitted batch)
Status: Canonical remaining-implementation plan for the layout rework
Companion docs: `axis_workbench_design_aware_rebuild_plan_for_claude_code.md`, `axis_workbench_implementation_status_and_next_plan.md`, `axis_workbench_verification_report.md`

## Executive Summary

The `layout-rework` branch is substantially further along than a typical "in progress" branch: the generic Workbench core (schema, commands, reducer, invariants, migrations), the Svelte renderer (5-region dock, splits, tabs, collapse, resize, drag/drop with previews, widget zones with auto-fit/overflow, grouping, context-menu and keyboard alternatives), the Axis adapter (registry, persistence, bindings, split-pane controllers/runtimes, custom panels, parameter pinning) and the feature-gated shell integration are all real, tested (159 unit tests, `svelte-check` clean) and architecturally disciplined — the generic layer is verifiably free of Axis imports.

The status document (`axis_workbench_implementation_status_and_next_plan.md`) is **largely honest**, with two overstatements: Milestone 5 split panes are *reduced standalone surfaces*, not monolith parity; and several registered widgets are non-functional. The most important verified problems are:

1. **P0: phone-width blank render** — the app renders blank below roughly tablet widths under the Workbench gate (documented, reproducible via `WORKBENCH_SMOKE_PHONE=1`). Mobile support is a stated hard requirement.
2. **P0: invisible default widgets** — `axis.gridMode` and `axis.blockSize` are placed in a `gridbar` zone that **no component renders** (only `WidgetZone.svelte:57` mentions it in an overflow condition). They are also read-only stubs.
3. **P1: 5 of 21 registered widget types render as a fallback glyph** (`axis.logo`, `axis.gridMap`, `axis.fcDevice`, `axis.fcLayouts`, `axis.fcSwitchView`).
4. **P1: dead-end navigation** — Scenes/Live/Setup show "coming soon" toasts, violating the design rule "navigation entries must not be dead no-ops"; `VirtualScreen` (generic virtual-effect editor) has no Workbench route at all.
5. **P1: profile/layout-preset system is schema-only** — one default profile/layout exists; no per-device-profile presets, no profile resolver.
6. **P1: the visual implementation has not yet been driven by the live design set.** The `design/*.dc.html` files are the mandatory visual specification (see "Design Reference Set" below). This review verified structure and behavior against the planning documents; a dedicated, file-by-file DC parity pass is a required phase of the remaining work, not optional polish.
7. **P2: theming leaks** — hardcoded dark hex colors in `EditRibbon`, `WidgetZone` overflow menu, `WorkbenchLibraryDrawer`, and `WorkbenchHost` will break light themes.

Feature parity with the old shell is otherwise in good shape because overlays, keyboard shortcuts, boot gates, and the dirty guard are shared via `+page.svelte` for both shells. Roughly: desktop Workbench is ~80% of the way to a daily-usable gated beta; mobile is ~40%; design parity/polish ~60%.

## Sources Reviewed

- `docs/axis_workbench_design_aware_rebuild_plan_for_claude_code.md` (full, 2338 lines)
- `docs/axis_workbench_implementation_status_and_next_plan.md` (working-tree version, incl. uncommitted 2026-07-05/06 updates)
- `docs/axis_workbench_verification_report.md`
- All of `src/lib/workbench/core/`, `src/lib/workbench/svelte/`, `src/lib/axis-workbench/` (working-tree state, incl. untracked `moveAlternatives.ts`), their test suites
- `src/routes/+page.svelte`, `src/lib/TopBar.svelte`, `src/lib/ToolRail.svelte`, `src/lib/StatusBar.svelte`, `src/lib/ControlSurface.svelte` (uncommitted diff), `src/lib/editor.svelte.ts` (responsive parts), `src/app.css` (safe-area)
- `scripts/workbench-visual-smoke.mjs`, `package.json`, full `git status` / `git diff`
- Design reference set enumerated and cross-checked against working-tree deletions (see next section); **the `.dc.html` internals were not pixel-audited in this review** — that audit is scheduled as Phase 4 work below.
- Commands run: `npm run check` (0 errors/0 warnings), `vitest run` (35 files, 159 tests, all pass)

## Design Reference Set (mandatory visual specification)

The `design/` folder is the functional and visual specification. Implementation must match it; the planning documents are the architectural distillation, but **where they and the design files disagree on visuals/interaction, the design files win.**

### The live set (files to implement against)

| File | Role |
|---|---|
| `design/Axis Layout System.dc.html` | Shell / window manager. Entry point. Five-region dock engine, `computeDock()`, Edit Layout mode, widget zones, libraries, layout presets per device profile. |
| `design/AxisWidget.dc.html` | All widgets. Three size states `default > compact > mini` with auto-fit. |
| `design/AxisGroup.dc.html` | Grouped widget modules (fluent module, dividers, insert placeholder, group grip). |
| `design/AxisFcPanel.dc.html` | Mounted for the **signal grid** (`fc-part="grid"`) AND the FC parts (`board/inspector/layouts/led/tap/hold`). |
| `design/AxisBlockEditor.dc.html` | Block editor (`editor`) **plus** `be-part="modifier"`. |
| `design/AxisPresetBrowser.dc.html` | `part="full/sources/list/detail"`. |
| `design/support.js` | DC runtime (required to open the design files; do not hand-edit). |

### Ignore / excluded (superseded reference material)

`Axis Editor*`, `Preset Browser*`, `Control Surface (Widget Grid)`, all `(pre-*)`/`(AM4)` variants, `Axis UX Review` (reference snapshots only), and `AxisGridPanel.dc.html` (orphaned — the grid now renders via `AxisFcPanel` `fc-part="grid"`). The working tree's staged deletions already match this list.

### DC runtime model (for whoever ports visuals)

- The `.dc.html` files are **Design Components**: a lightweight custom runtime in `support.js`, not React/Vite/webpack. Each file = one `<x-dc>` template + a `class Component extends DCLogic` logic block. `{{ }}` holes are dotted lookups only; `<sc-for>`/`<sc-if>` for flow; `<dc-import name="X">` mounts sibling `X.dc.html`.
- Inline styles only (no CSS classes/stylesheets); the only `<helmet><style>` is fonts/keyframes/resets.
- The files open directly in a browser — no build step. To productionize, port each component **1:1** into the Svelte Workbench (template → Svelte markup, `renderVals()` return → props/derived state). Do not embed the DC runtime in production.
- **`support.js` and the DC logic blocks are the behavior source of truth, not just the visuals** (maintainer decision 2026-07-06): the design set is heavily tested across mobile/tablet/desktop — widget size states, panel drop zones, widget drag, grouping all work flawlessly there. Port that logic verbatim (thresholds, `computeDock` math, auto-fit breakpoints, drag choreography) instead of re-deriving it. Where the Svelte implementation already behaves differently, align it to the DC logic unless explicitly noted below.
- **Intentional production addition to KEEP** (maintainer decision 2026-07-06): the Svelte panel drag/drop shows *split before/after/below* placement indicators, which goes beyond the design's drop feedback. This is desired. The parity pass must not remove or simplify it.
- **Framework long-term goal**: `src/lib/workbench` is to become a standalone framework (Bootstrap-like ease) focused on dashboard UI / admin overviews / real app+tool frontends — not classic websites. This raises the bar on token discipline, semantic classes, boundary purity, and public API docs (T16/T17, Phase 6 item 6).

### Architecture rules the integration must respect (from the design)

1. **5 regions** (Left, Right, Main, Top, Bottom). In the design, panes are absolutely positioned by `computeDock()` in the shell; regions reflow/shrink neighbours (real tiling) — nothing overlaps except tooltips/modals/popups/drawers. The production renderer achieves the same invariant with flex/grid; the *behavioral* contract (reflow, no overlap) is what must hold.
2. **No CSS transitions on pane `left/top/width/height`** — a ResizeObserver re-render loop restarts them and panes get stuck. Verified currently compliant: the only transition in dock components is `opacity` on the collapse button (`DockRegion.svelte:152`). A guard test is scheduled (T34) so the visual-parity pass cannot regress this.
3. **Layout persists per device profile** (desktop / tablet / mobile), from `preset(kind)` in the design shell. Production must mirror this with the profile/preset model (T13/T14/T35).
4. **One global Edit Layout (Customize) toggle** unlocks drag/drop app-wide. (Implemented: controller `editMode`.)
5. **Cross-component communication**: the design shares state across split parts via `window.__PBBus` / `window.__FCBus`, with overlays rendering only on the owner instance. Production has already correctly replaced these with typed controllers + a runtime host stack (`presetBrowserWorkbench*`, `fcWorkbench*`, `runtimeHostStack.ts`); verify the "overlays render only on the owner instance" rule during the parity pass (T31).

## Current Branch / Repository State

- Branch `layout-rework`, one commit ahead of the 0.8.3-beta merge base: `3841470 Layout rework: dockable Axis workbench system`.
- **Large uncommitted batch** (+2554/−8391 across 41 files + 4 untracked): split-pane enrichment (`AxisPresetBrowserPartPanel`, `AxisFcPartPanel`), parameter edge-drop and drag-source wiring (`ControlSurface.svelte`, `DockWorkspace`, `axisParameterActions/Sources`), mobile dock drawers (`DockWorkspace`, `WorkbenchHost`), keyboard/context-menu move alternatives (new `moveAlternatives.ts` + consumers), navigation failure panels (`actions.ts`, `NavigationHost`), the visual smoke script (`scripts/workbench-visual-smoke.mjs`), deletion of superseded `.dc.html` design files (matching the design handoff's ignore list), and the status-doc update.
- Validation on the working tree: `npm run check` clean, 159/159 tests green.
- The Workbench is fully gated behind `VITE_AXIS_WORKBENCH=1` (`featureGate.ts`, branch at `+page.svelte:133-151`); the old shell remains the production default. The gate is exclusive — the two shells never render in parallel.

## Intended Target State From Existing Docs

Condensed from the rebuild plan (§1–§15), the verification report, and the design handoff:

- **Architecture**: three strict layers — headless `workbench/core` (pure TS, serializable, command/reducer), generic `workbench/svelte` renderer (tokens `--aw-*`, classes `.aw-*`, no Axis concepts), `axis-workbench` adapter (registrations, bindings, persistence, theme).
- **Layout model**: versioned `WorkbenchDocument` → profiles → layouts → 5 dock regions with split/tab trees, per-slot tabs, region+panel collapse, resize with clamping, no overlap, serializable + migratable.
- **Dock/panel behavior**: drag to tab/split/region with previews, context-menu and keyboard alternatives, Edit Layout mode (chrome hidden outside it), panel library, layout library.
- **Widgets**: three size states (default/compact/mini) with auto-fit and overflow; zones top.left/center/right, bottom, rail, gridbar, floating, hidden; grouping as first-class schema; ~21 Axis widgets.
- **Custom panels & parameters**: grid-based custom panels, parameter drag sources from Block Editor/Control Surface, `axis.paramControl` bindings storing identity only (never live values), edge-drop creation.
- **Split default panels**: Preset Browser full/sources/list/detail; FC full/board/inspector/layouts/led/tap/hold **plus the grid part** (`fc-part="grid"` in the design) and the block editor's `be-part="modifier"`; synchronized via typed controllers (no window buses).
- **Navigation**: reorderable/hideable/movable entries, locked Axis Cloud in rail footer, **no dead no-op entries**.
- **Responsive/mobile**: profile-based (desktop/tablet/phone ≠ viewport width alone), per-device-profile layout presets, drawer/bottom-nav modes, bottom sheets, touch alternatives, safe areas.
- **Visuals**: the live design set is the binding spec (previous section).
- **Explicitly deferred by the status doc**: mobile visual polish, default-shell replacement, layout undo/redo, deep PresetBrowser/FcEditor visual refactor.
- **Known problems admitted in docs**: phone blank render; DC pixel parity outstanding; touch drag alternatives open; binding depth (cross-block writes) deferred.

## Implementation Status Matrix

| Area | Status | Evidence | Gap | Priority | Confidence |
|---|---|---|---|---|---|
| Core schema/commands/reducer | DONE (minor bugs) | `core/schema.ts`, `reducer.ts` (649 l., 35+ commands), 35 reducer tests | `panel.rename` unvalidated (reducer.ts:390); `singletonKey` never enforced (schema.ts:81); `navigation.show` partial-success semantics | P1 | 0.95 |
| Invariants / repair / migrations | DONE | `invariants.ts` (validate+repair), `migrations.ts` (v1) | Only v1 path; repair recursion unbounded (theoretical) | P3 | 0.9 |
| Persistence (doc+cache+debounce+remote apply) | DONE | `axisWorkbenchStore.svelte.ts` — `config/workbench`, `axs.workbench.doc`, 400 ms debounce, `notifyMutation()`, migration fallback | Import/export helpers exist (`packages.ts`) but no UI entry point verified | P2 | 0.9 |
| Dock: regions/splits/tabs/collapse/resize | DONE | `DockWorkspace/DockRegion/DockNode/TabStack/SplitHandle`, min clamps 120 px / ratio 0.08 | Pixel-level DC parity pass pending | P1 (parity) | 0.9 |
| Panel drag/drop + previews | DONE | `TabStack.svelte:96-135`, `drag.ts` (24 % split edge), `DragLayer` with tab/split/insert/group styles | No invalid-drop visual state; DC choreography parity pending | P2 | 0.85 |
| Context-menu + keyboard alternatives | DONE (new, uncommitted) | `moveAlternatives.ts`, `PanelHost:14-44`, `WidgetHost:275-291`, `NavigationHost:97-111` | Arrow-key moves only in edit mode; no discoverability hints | P3 | 0.85 |
| Widget auto-fit + overflow | DONE | `WidgetZone.svelte:52-71`, ResizeObserver, priority culling | Overflow menu hardcodes dark colors (WidgetZone:339-342); auto-fit thresholds not yet validated vs `AxisWidget.dc.html` | P2 | 0.85 |
| Widget grouping | DONE | `WidgetGroupHost.svelte`, group commands + tests | Visual parity vs `AxisGroup.dc.html` unverified | P2 | 0.85 |
| Floating widgets | PARTIAL | `WidgetHost.svelte:302` (positioning only) | No drag-within-floating, no resize, no z-order management | P2 | 0.85 |
| Edge-drop → custom panel (params/widgets/groups) | DONE | `DockWorkspace.svelte:23-65`, `WidgetHost:187-201`, `axisParameterActions.ts` | Touch alternative for HTML5 drag missing | P1 (touch part) | 0.85 |
| Custom panels + param pinning | DONE | `AxisCustomPanel.svelte`, `customPanels.ts` grid settings, `axis.pinSelectedParameters` | — | — | 0.85 |
| `axis.paramControl` read/write | PARTIAL | `AxisWorkbenchWidget.svelte:40-131` — drag/wheel/click editing when block open | Read-only/stale when bound block not open; cross-block writes deferred | P1 | 0.9 |
| Axis widgets (21 types) | PARTIAL | `AxisWorkbenchWidget.svelte:145-290` — 16 real-data kinds | `logo/gridMap/fcDevice/fcLayouts/fcSwitchView` → fallback glyph (:286-289); `gridMode`/`blockSize` read-only | P1 | 0.9 |
| `gridbar` zone | BROKEN / RISKY | Only hit in `WidgetZone.svelte:57`; defaults place 2 widgets there (`axisWorkbenchDefaults.ts:118-119`); no `<WidgetZone zone="gridbar">` anywhere | Default-layout widgets are invisible | P0 | 0.9 |
| Grid part per design (`fc-part="grid"` toolbar/modes/minimap) | PARTIAL | `AxisSignalGridPanel.svelte` wraps production `SignalGrid` | Design's grid-panel chrome (gridbar toolbar, mode/size controls, minimap behavior in pane) not ported | P1 | 0.8 |
| Block editor `be-part="modifier"` part | MISSING | No modifier part registered (`axisWorkbenchRegistryManifest.ts`); `ModifierFlyout.svelte` exists only as overlay | Design defines modifier as a block-editor split part | P1 | 0.85 |
| Navigation entries | PARTIAL | Registry: 7 entries; account locked `rail.footer` (defaults:129-133); failed actions → error panel (actions.ts new) | Scenes/Live/Setup = toast stubs (registry:74-76); design forbids dead no-ops | P1 | 0.9 |
| VirtualScreen / setup & controllers editors | MISSING (in Workbench) | Old shell: `+page.svelte:139-148` routes `editor.virtual` → `VirtualScreen`; no Workbench panel registered | Whole virtual-effect editing area unreachable in Workbench except FC | P1 | 0.85 |
| Split panes PB (sources/list/detail) | PARTIAL | `AxisPresetBrowserPartPanel.svelte` (535 l. vs monolith 1636 l.), real library data + shared runtime, `.slice(0,120)` cap (:115) | Not monolith/design parity: no advanced query UI, saved filters, context menus, virtualization | P1–P2 | 0.85 |
| Split panes FC (board/inspector/…) | PARTIAL | `AxisFcPartPanel.svelte` (537 l. vs 701 l.), model-backed with runtime writes | Reduced affordances vs `FcEditor` and `AxisFcPanel.dc.html` | P2 | 0.8 |
| Split-pane controllers/runtimes (no window buses) | DONE | `presetBrowserWorkbench*`/`fcWorkbench*` + `runtimeHostStack.ts`, tested | "Overlays only on owner instance" rule unverified | P2 (verify) | 0.9 |
| Shell coexistence, overlays, shortcuts, dirty guard | DONE | `+page.svelte:74-164` shared by both shells | Escape priority order is old-shell-oriented (no Workbench-drawer handling) | P2 | 0.95 |
| ControlSurface drag sources | DONE (uncommitted) | `ControlSurface.svelte:854-877, 994-1000, 1125-1127`, guarded by `workbenchCanPin` | Zero risk to non-Workbench path (guard verified) | — | 0.9 |
| Profiles / layout presets | MISSING (beyond model) | Only `axis.profile.desktop`+`axis.layout.default` (defaults:62-71); no per-device-profile presets, no resolver | Design `preset(kind)` desktop/tablet/mobile unimplemented | P1 | 0.95 |
| Mobile drawers (≤760 px) | PARTIAL | `DockWorkspace.svelte:84-98, 271-282`, `WorkbenchHost:190-272` | No safe-area insets, no Escape close, no swipe, no bottom-nav mode | P1 | 0.85 |
| Phone rendering | BROKEN / RISKY | Docs (status:286) + `WORKBENCH_SMOKE_PHONE=1` failing repro; smoke desktop passes | App-wide blank below ~tablet width | P0 | 0.8 (needs runtime confirm) |
| Theming tokens | PARTIAL | `--aw-*` broadly used; hardcoded hex in `EditRibbon:76,93-113`, `WidgetZone:339-342`, `WorkbenchLibraryDrawer:266-378`, `WorkbenchHost:146` | Light-theme breakage; Axis-var fallbacks live in generic renderer instead of theme adapter | P2 | 0.9 |
| Pane-geometry transition rule | DONE (guard pending) | Only `opacity` transition in dock components (`DockRegion.svelte:152`) | Add guard test so parity pass can't regress it (T34) | P2 | 0.9 |
| Accessibility | PARTIAL | Roles/aria on menus, separators, groups; Escape in menus/drawers; focus on menu open | No focus traps, no `:focus-visible` styles, Escape missing on mobile drawers/nav | P2 | 0.85 |
| Framework boundary | DONE | `frameworkBoundary.test.ts`; grep confirms zero Axis imports in `workbench/` | — | — | 0.95 |
| Test coverage | PARTIAL | 159 tests; core ~65 % command coverage | Untested: `panel.rename/collapse`, `split.resize`, `widget.resize`, `region.resize`; zero browser E2E for drag/drop/persistence | P1 | 0.9 |
| DC visual parity (live design set) | MISSING (as a pass) | No evidence of file-by-file comparison; smoke test only checks non-blank screenshot | Dedicated per-file parity audit required (Phase 4) | P1 | 0.9 |
| Layout undo/redo | MISSING (deliberate) | Status doc "Do Not Do Yet" | Deferred by design — keep deferred | P3 | 0.95 |

## Feature Coverage Review

Verified against the old shell's full control inventory (`TopBar`/`ToolRail`/`StatusBar`):

**No regression (shared or ported):** boot gates, `editor.init`/polling, Cmd+K palette, Cmd+Z/Y undo/redo, Escape chain, beforeunload dirty guard, all 13 overlays (CommandPalette, CabPicker, DeviceTools, HistoryPanel, PresetPicker, SaveDialog, TunerOverlay, CachePrompt, AxisPanel, ThemePicker, Notices, Tour, Toast) — all render from `+page.svelte` outside either shell. Preset nav/rename, scenes, view mode, add block, tuner, tempo, CPU/link/output meters, save, history, connection, account are covered by working widgets bound to real `editor`/`history` state.

**Regressions / missing integrations in the Workbench shell:**

- **Per-block metering toggle** (TopBar:216-221) — no widget equivalent.
- **Theme picker** — no nav entry/widget (ToolRail has a dedicated button).
- **VirtualScreen** (Settings/Controllers virtual effects) — unreachable; only FC has a panel.
- **Scenes/Live/Setup nav** — toast stubs instead of placeholder panels.
- **Grid mode / block size controls** — invisible (gridbar) and read-only even if rendered.
- **Modifier editing as a block-editor part** (`be-part="modifier"` in the design) — only the overlay flyout exists.
- **StatusBar content** (hint ticker, Ko-fi/imprint links) — no Workbench equivalent in the `bottom` zone; legal links matter for the imprint requirement.
- **Preset browser split list** caps at 120 rows with no paging/virtualization.
- **Param widgets** silently degrade to read-only when the bound block isn't open — acceptable v1, but needs explicit visual state and later cross-block writes.

## Design System / UX Review

- Token discipline is good overall (`--aw-*` + `color-mix()`), but four components hardcode a private dark palette (`#0c1213`, `#1a3a3c`, `#4fd1dc`, `#101d1e`, `#234d4f`, …): `EditRibbon`, `WidgetZone` overflow menu, `WorkbenchLibraryDrawer`, plus the `#4f6bed` logo dot in `WorkbenchHost:146`. These will break with Axis's existing theme engine (`theme.svelte.ts` supports theme switching) and violate the framework contract.
- The generic renderer's token fallbacks reference Axis variables (`--bg`, `--surface`, `--accentink`…) directly in `WorkbenchHost:78-97`. The plan tolerates this transitionally, but the mapping belongs in `axisWorkbenchTheme.ts`, with neutral defaults in the generic layer.
- Drag previews share a consistent dashed/solid accent language (good), but there is no invalid-drop styling and no distinct hover/active affordance grammar documented.
- Empty/loading/error states: navigation failures now create error panels (good, new); custom panel has an empty-state hint; split panes have loading/readiness chips; the library drawer and overflow menus lack empty states.
- One product decision is silently divergent: the plan's zone naming says production should prefer `customPanel:<panelId>`, the code uses `panel:<panelId>` (`customPanels.ts` `PANEL_WIDGET_ZONE_PREFIX`). Fine, but document it as intentional.
- **The binding visual reference is the live design set.** None of the above matters more than a systematic per-file comparison against `Axis Layout System.dc.html`, `AxisWidget.dc.html`, `AxisGroup.dc.html`, `AxisFcPanel.dc.html`, `AxisBlockEditor.dc.html`, `AxisPresetBrowser.dc.html` (Phase 4 / T31).

## Mobile / Responsive Review

- Workbench mobile breakpoint is a consistent 760 px (all components aligned), replacing the old shell's overly-broad `editor.isMobile` (<1366). Good direction, but there is **no profile resolver** — viewport width is still the only signal, which the plan explicitly forbids as the final model. The design shell's `preset(kind)` per device profile (desktop/tablet/mobile) is the target.
- Implemented: hamburger rail drawer, left/right/top docks as edge-indicator overlay drawers, inline bottom dock up to 90 % height, mobile nav row.
- Missing: `--axis-safe-*` inset handling anywhere in the Workbench (old shell uses it in TopBar/StatusBar/drawer — iOS builds will clip under the notch/home indicator); Escape/swipe to close drawers; bottom-navigation mode (`NavigationMode` supports 'side'|'bottom' in schema but no drawer mode and no UI to switch); bottom-sheet pattern for libraries/detail; touch alternatives for HTML5 drag (parameter drag uses `dataTransfer`, which is unreliable on touch).
- **The phone blank render is the gating defect**: below roughly tablet width the app renders blank (documented as *app-wide* in the status doc — needs a runtime bisect to confirm whether it's Workbench-only or affects the old shell too).

## Technical Architecture Review

Strengths: strict layer boundary (enforced by test), command/reducer purity, repair-based migrations, host-stack runtime pattern for split panes (clean replacement for `window.__PBBus`/`__FCBus`, exactly as the design handoff intends for production), controller/context injection avoiding prop drilling, symmetric listener/observer cleanup, sane z-index architecture, no TODO/FIXME debt, compliance with the design's no-geometry-transition rule.

Weaknesses:

- `PanelInstance.singletonKey` is dead schema — singleton panels are not enforced anywhere; duplicating the Signal Grid panel is currently possible via commands.
- `panel.rename` accepts empty/whitespace titles (other renames validate).
- `navigation.show` returns success while silently skipping the reorder for fixed entries.
- Reducer duplication (`findTabStackByPanel`/`findTabStackById`), undocumented `0.01` ratio floor.
- Untested commands: `panel.rename`, `panel.collapse`, `split.resize`, `widget.resize`, `region.resize` — precisely the interactive ones.
- No component/browser tests at all for the renderer; the only visual check is a screenshot-not-blank smoke.
- `editor.svelte.ts` chunking warning (dynamic+static import) noted in docs — cosmetic for now.

## Risks and Fragile Areas

1. **Phone blank render** — unknown root cause; could hide a fundamental CSS/layout or boot-gate interaction problem (highest risk).
2. **Persistence schema lock-in** — layouts are already being persisted to `config/workbench`; every schema change from here needs a migration. The `gridbar` fix, per-profile presets, and navigation-mode work all touch the persisted document. Do them before real users create layouts.
3. **Singleton non-enforcement** — a user in Edit Layout mode can create states the adapters don't expect (two Signal Grids fighting over one editor selection).
4. **HTML5 drag for parameter sources** — pointer-event drags (panels/widgets) will work on touch; the `dataTransfer`-based parameter drag will not, creating an inconsistent interaction model.
5. **Hardcoded dark palette** — will regress visibly the moment ThemePicker themes are applied to the Workbench.
6. **Split-pane divergence** — the reduced split surfaces will drift from the monolith and the design unless parity items are tracked concretely (query language, saved filters, context menus).
7. **Parity-pass regression risk** — porting DC visuals 1:1 could tempt reintroducing geometry transitions or inline one-off styling; the guard test (T34) and the no-hex test (T16) exist to catch this.

## Missing Runtime Verification

Static review could not verify (each needs the listed manual/automated check):

1. **Phone blank render root cause** — run `npm run dev` with `VITE_AXIS_WORKBENCH=1`, resize to 390×844, check console; also test the *old* shell at that width to confirm/refute "app-wide".
2. **Full interaction loop on hardware** — connect device → load preset → select block → edit param (block editor panel + pinned widget) → save → verify device state.
3. **Persistence round-trip** — arrange panels/widgets, reload, verify layout restoration; test with a second client for write-loop avoidance (`origin: CLIENT_ID`).
4. **Drag/drop choreography** — tab drop, split drop, edge-drop custom panel, widget grouping, overflow menu behavior — in a real browser, mouse and touch.
5. **Electron and iOS Capacitor** boots with the gate on (safe-area, in-process ForgeFX).
6. **Split-pane synchronization** — sources+list+detail mounted simultaneously; FC board+inspector; verify overlays (menus/pickers/toasts) render only on the owner instance.
7. **Theme switching** while Workbench active (will expose the hardcoded-hex issues).
8. **Design-file side-by-side** — open each live-set `.dc.html` directly in a browser next to the running Workbench and compare (the concrete workflow for Phase 4).

## Recommended Remaining Implementation Plan

Preliminary step (P0, not a phase): **commit the current working-tree batch** (it is coherent, green, and reviewed) so subsequent phases have a stable base. Split into ~4 commits: renderer interactions + moveAlternatives, split-pane/param work + ControlSurface, smoke script + docs, design-file cleanup.

### Phase 1 - Stabilize Core Workbench Shell

**Goal:** No known-broken states in the gated shell; persisted schema safe to build on.
**Rationale:** Everything later (presets, mobile, parity) writes into the persisted document and the widget/zone system; fix the foundations first.
**Tasks:**

1. Diagnose and fix the phone blank render (bisect: gate off vs on, 390 px; suspect `.aw-root` grid/drawer media rules in `WorkbenchHost`/`DockWorkspace`). Make `WORKBENCH_SMOKE_PHONE=1` pass and fold it into the default smoke run.
2. Fix the `gridbar` zone: render it as the grid toolbar inside `AxisSignalGridPanel` per the design's `fc-part="grid"` chrome, via `<WidgetZone zone="gridbar" …>`; wire `axis.gridMode`/`axis.blockSize` to real editor state (grid density / block size setters) instead of inert `widget.state`.
3. Enforce singletons: honor `singletonKey`/registry `singleton` in `panel.add` (reducer) + repair pass; add tests. Signal Grid, Block Editor, History, account = singleton.
4. Reducer hygiene: validate `panel.rename` (trim/non-empty); clarify `navigation.show` semantics (document or make atomic); add tests for `panel.rename/collapse`, `split.resize`, `widget.resize`, `region.resize`.
5. Add Escape handling to mobile nav drawer and mobile dock drawers.

**Files:** `WorkbenchHost.svelte`, `DockWorkspace.svelte`, `core/reducer.ts`, `core/invariants.ts`, `core/test/reducer.test.ts`, `panels/AxisSignalGridPanel.svelte`, `AxisWorkbenchWidget.svelte`, `scripts/workbench-visual-smoke.mjs`.
**Acceptance:** phone smoke green; gridbar widgets visible and functional in the grid panel; singleton duplication impossible; all reducer commands tested; Escape closes every drawer.
**Verification:** `npm run check && npm test && npm run test:workbench-visual` (with phone+compact); manual 390 px browser session.
**Risks:** blank-render cause may sit outside the Workbench (boot gates); timebox the bisect.
**Confidence:** 0.8

### Phase 2 - Restore / Verify Feature Parity

**Goal:** Every capability of the old shell is reachable in the gated Workbench; no dead nav entries; every registered widget renders.
**Tasks:**

1. Implement the 5 unrendered widgets — `axis.logo` (rail brand), `axis.gridMap` (minimap toggle/embed via existing `GridMap.svelte`/`MiniGrid.svelte`), `axis.fcDevice`, `axis.fcLayouts`, `axis.fcSwitchView` (bind to `fcWorkbenchController`) — with default/compact/mini states per `AxisWidget.dc.html`; or explicitly unregister any that are deferred (document why).
2. Add `axis.meterToggle` widget (per-block metering, parity with TopBar:216-221) and place in default `top.right`.
3. Register an `axis.virtualScreen` panel wrapping `VirtualScreen.svelte` (state: virtual-effect slug) and route Setup/Controllers nav entries to it; replace Scenes/Live toast stubs with meaningful placeholder panels ("what this will be + status") per the no-dead-no-ops rule.
4. Add a Theme nav entry/action (`editor` theme picker open) and a StatusBar-equivalent: hint ticker widget + legal/imprint links in the `bottom` zone (imprint is a legal requirement).
5. Register `axis.blockEditor.modifier` as a block-editor split part per the design's `be-part="modifier"` (reuse `ModifierFlyout.svelte` internals through a part adapter, keeping the overlay flyout for the old shell).
6. Param widget: explicit visual "read-only — open block to edit" state; add an "open block" affordance on click when bound block is closed. (Cross-block direct writes remain a later binding-depth item — keep on backlog, don't cut.)
7. Preset-browser split list: replace `.slice(0,120)` with virtualization or incremental paging; port advanced-query entry, saved filters, and row context menus toward monolith/design parity (track as itemized checklist against `PresetBrowser.svelte` + `AxisPresetBrowser.dc.html`).

**Files:** `AxisWorkbenchWidget.svelte`, `axisWorkbenchRegistry(.Manifest).ts`, `axisWorkbenchDefaults.ts`, new `panels/AxisVirtualScreenPanel.svelte`, new modifier part in `panels/`, `AxisPresetBrowserPartPanel.svelte`, `AxisWorkbenchNavigationEntry.svelte`.
**Acceptance:** parity checklist (section "Feature Coverage Review") fully ✅ or explicitly deferred with a stub panel; no widget renders the fallback glyph; nav has zero toast stubs.
**Verification:** manual sweep of every ToolRail/TopBar/StatusBar control against the Workbench; runtime smoke: connect → load preset → select block → edit parameter → save.
**Confidence:** 0.85

### Phase 3 - Complete Dock, Panel, and Layout Behavior

**Goal:** The layout system reaches the design's full behavior set: presets, profiles, floating widgets, import/export.
**Tasks:**

1. Ship layout presets mirroring the design shell's `preset(kind)`: at minimum `desktop`, `tablet`, `mobile` device-profile presets (plus `stage`/`studio`/`compact` from the plan if the design's preset list confirms them — verify inside `Axis Layout System.dc.html` during T31); factories in `axisWorkbenchDefaults.ts`; expose them in `WorkbenchLayoutDrawer` with apply/duplicate; migration to inject presets into existing persisted docs without clobbering user layouts.
2. Profile resolver: `viewportClass` (desktop/tablet/phone) + runtime (electron/web/capacitor) + user override; per-profile active layout persistence; never auto-mutate a user's layout on resize — switch profiles instead.
3. Floating widgets: drag-to-move within floating zone, optional resize, z-order (bring-to-front on pointer-down), keep-in-viewport clamping.
4. Invalid-drop preview state in `DragLayer`/drop interpretation (e.g., dimmed/red-tinted preview when target rejects).
5. Layout/panel import-export UI in the layout drawer using existing `packages.ts` helpers (validate + ID remap on import).
6. Add a `drawer` navigation mode to schema/renderer (currently only side/bottom) with migration.

**Files:** `axisWorkbenchDefaults.ts`, `core/schema.ts` + `migrations.ts`, `core/profiles.ts`, `WorkbenchLayoutDrawer.svelte`, `WidgetHost.svelte` (floating), `DragLayer.svelte`, `drag.ts`, `packages.ts`.
**Acceptance:** all shipped presets selectable and correct at their intended sizes; profile switch on viewport class change with per-profile persistence; floating widgets fully manipulable; import/export round-trips.
**Verification:** unit tests for preset factories/migration/profile resolution; manual preset walkthrough at 1440/1024/390 widths.
**Risks:** persisted-doc migration — write migration tests first.
**Confidence:** 0.75

### Phase 4 - Design System Consistency Pass (DC Visual Parity)

**Goal:** One intentional visual product that matches the live design set 1:1; theme-proof generic layer.
**Rationale:** The `.dc.html` files are the mandatory visual spec. This phase is a *file-driven* pass, not generic polish.

**Workflow per design file:** open the `.dc.html` directly in a browser (no build step; `support.js` must sit alongside) → walk every state (sizes, edit mode, drag, mobile width) → screenshot → compare to the running gated Workbench → itemize deltas → port 1:1 (template → Svelte markup, `renderVals()` → props/derived), keeping styles token-based (no inline one-offs, no hex).

**Tasks:**

1. **`Axis Layout System.dc.html`** — shell chrome: topbar/rail/bottom-bar proportions, Edit Layout ribbon, dock drop wayfinding, panel headers/tabs, collapse strips, library/panel drawers, layout preset options, mobile drawer choreography. Verify pane behavior matches `computeDock()` semantics (reflow, no overlap) and that **no geometry transitions** get introduced.
2. **`AxisWidget.dc.html`** — every widget kind's default/compact/mini rendering, auto-fit thresholds, segmented-control collapse behavior, pinned-parameter tooltips. Calibrate `WidgetZone` sizing/`estimateWidth` against the design's actual breakpoints.
3. **`AxisGroup.dc.html`** — fluent group module: dividers, insert indicator placeholder, group grip, member drag overlay.
4. **`AxisFcPanel.dc.html`** — both roles: the **grid part** (`fc-part="grid"`: grid toolbar, full/map/auto modes, minimap, block size, pane-relative sizing) against `AxisSignalGridPanel`, and the FC parts (board/inspector/layouts/led/tap/hold) against `AxisFcPartPanel`.
5. **`AxisBlockEditor.dc.html`** — block editor chrome (header, type search, channel selector, page tabs, arrange toolbar, tray, control views) against `AxisBlockEditorPanel`/`ControlSurface`, plus the `be-part="modifier"` part (T33 lands the part; this task lands its visuals).
6. **`AxisPresetBrowser.dc.html`** — `part="full/sources/list/detail"` visuals against `AxisPresetBrowserPartPanel` (rows, detail chips, source counts, mobile drawers/detail screens).
7. Replace every hardcoded hex in `EditRibbon` (:76, 93-113), `WidgetZone` overflow (:339-342), `WorkbenchLibraryDrawer` (:266-281, 345-378), `WorkbenchHost` logo dot (:146) with `--aw-*` tokens / `color-mix()`; add a "no hex in generic renderer" guard test.
8. Move Axis-variable fallbacks (`--bg`, `--surface`, …) out of `WorkbenchHost` into `axisWorkbenchTheme.ts`; give the generic layer neutral self-contained defaults.
9. Focus pass: `:focus-visible` styles on drag surfaces/tabs/handles; focus trap (or restore-on-close) for context menus and drawers.
10. Empty/loading states for library drawer, overflow menu, split panes' empty selections.
11. Theme-switch QA: run every ThemePicker theme against the Workbench.
12. Add the pane-geometry transition guard test (no transitions on `left/top/width/height` in dock components).

**Files:** all `workbench/svelte` components incrementally, `axisWorkbenchTheme.ts`, `workbench/svelte/theme.ts`, adapter panels/widgets, new guard tests.
**Acceptance:** per-file delta checklists closed and maintainer-approved (screenshot diffs archived in `.workbench-smoke/`); zero hex literals in `src/lib/workbench/svelte` (geometry excepted); all themes legible; guard tests green.
**Verification:** side-by-side design-file sessions; visual smoke across ≥2 themes; new unit guard tests.
**Risks:** 1:1 porting temptation to copy inline styles — enforce token discipline via the guard test.
**Confidence:** 0.75

### Phase 5 - Mobile / Responsive Completion

**Goal:** Phone/tablet is a first-class experience per the design, on web and Capacitor iOS.
**Tasks:**

1. Safe-area integration: map `--axis-safe-*` → `--aw-safe-*` in the Axis theme; consume in `WorkbenchHost` topbar/rail/drawers and `DockWorkspace` bottom dock/indicators.
2. Bottom-navigation mode for phone/tablet profiles (schema `NavigationMode 'bottom'` exists; renderer support + suppress side drawer when active).
3. Touch drag alternatives: long-press → context menu path for parameter pinning (replacing dataTransfer on touch); verify pointer-event drags for panels/widgets on touch; enlarge effective hit areas for split handles (currently 10 px) via invisible padding.
4. Bottom-sheet presentation for widget/panel/layout drawers below 760 px; swipe-to-close on drawers.
5. Tablet/mobile presets as the default layouts for their device profiles (from Phase 3).
6. iOS Capacitor runtime check with the gate on (notch, home indicator, MIDI transport unaffected).

**Files:** `axisWorkbenchTheme.ts`, `WorkbenchHost.svelte`, `DockWorkspace.svelte`, `WorkbenchLibraryDrawer/LayoutDrawer`, `ControlSurface.svelte` (touch pin path), `SplitHandle.svelte`.
**Acceptance:** phone+compact+desktop smokes green; full editing loop possible on a 390 px touch viewport without HTML5 drag; safe areas respected on iOS build.
**Verification:** smoke matrix; manual iOS simulator/device pass (can piggyback on the existing iOS branch workflow).
**Confidence:** 0.7

### Phase 6 - QA, Regression Testing, and Release Readiness

**Goal:** Confidence to flip the default shell.
**Tasks:**

1. Playwright suite for the gated shell: boot, panel move/tab/split/collapse/resize, widget move/group/hide/restore/overflow, nav reorder + locked-account rejection, custom-panel creation via edge drop, persistence reload, theme switch.
2. Persistence adversarial tests: corrupted doc, concurrent client echo, migration from every shipped schema step.
3. Hardware manual test plan execution (see below) on FM3 at minimum.
4. Performance pass: drag re-render profiling, grid pane-measurement under rapid resize, many-widget zones.
5. Gate flip strategy: default `VITE_AXIS_WORKBENCH=1` in dev → beta release with old shell behind a fallback flag → remove old shell only after a full beta cycle (matches plan §Stage 8).
6. Boundary re-audit + docs: public API docs for `workbench/` exports (extraction readiness).

**Acceptance:** all suites green in CI; manual hardware checklist signed off; fallback flag proven to restore the old shell.
**Confidence:** 0.75

## Detailed Task Backlog

| ID | Priority | Task | Files / Areas | Acceptance Criteria | Verification | Confidence |
|---|---|---|---|---|---|---|
| T01 | P0 | Commit current working-tree batch in logical commits | repo root | clean `git status`; check/tests green per commit | `npm run check && npm test` | 0.95 |
| T02 | P0 | Fix phone (<~760 px) blank render | `WorkbenchHost.svelte`, `DockWorkspace.svelte`, boot gates | 390×844 renders shell; smoke-phone passes | `WORKBENCH_SMOKE_PHONE=1 npm run test:workbench-visual` | 0.75 |
| T03 | P0 | Render `gridbar` zone in Signal Grid panel per `fc-part="grid"` design chrome; make gridMode/blockSize widgets functional (write to editor grid density/block size) | `AxisSignalGridPanel.svelte`, `AxisWorkbenchWidget.svelte:190-216`, `axisWorkbenchDefaults.ts:118-119`, `design/AxisFcPanel.dc.html` | widgets visible in grid toolbar; toggles change grid rendering | manual + unit test on widget dispatch | 0.85 |
| T04 | P1 | Enforce panel singletons (`singletonKey` or registry flag) in `panel.add` + repair | `core/reducer.ts`, `core/invariants.ts`, tests | duplicate add of singleton returns error; repair dedupes | new reducer tests | 0.9 |
| T05 | P1 | Validate `panel.rename`; clarify `navigation.show`; document ratio floor | `core/reducer.ts:390,532`, `invariants.ts:64` | empty titles rejected; semantics documented/tested | reducer tests | 0.95 |
| T06 | P1 | Test untested commands: `panel.collapse`, `split.resize`, `widget.resize`, `region.resize`, `panel.tab` edge cases, `zone.delete moveWidgetsTo` | `core/test/reducer.test.ts` | each command has ≥1 direct test incl. failure path | `npm test` | 0.95 |
| T07 | P1 | Implement or unregister 5 fallback-glyph widgets (`logo`, `gridMap`, `fcDevice`, `fcLayouts`, `fcSwitchView`) with 3 size states per `AxisWidget.dc.html` | `AxisWorkbenchWidget.svelte:145-290`, `axisWorkbenchRegistryManifest.ts:19-41`, `fcWorkbenchController.ts` | no widget renders the generic glyph fallback | visual + registry test | 0.8 |
| T08 | P1 | Add `axis.meterToggle` widget (per-block metering parity) | `AxisWorkbenchWidget.svelte`, defaults, manifest | toggle mirrors TopBar behavior (`editor` meter flag) | manual with device/mock | 0.85 |
| T09 | P1 | `AxisVirtualScreenPanel` + route Setup/Controllers nav; placeholder panels for Scenes/Live (no toast stubs) | new panel, `axisWorkbenchRegistry.ts:63-78`, defaults | every nav entry opens a panel; zero "coming soon" toasts | manual nav sweep | 0.85 |
| T10 | P1 | Theme nav entry + StatusBar parity (hint ticker widget, legal/imprint links in bottom zone) | registry, defaults, new widget(s) | theme picker reachable; imprint link visible in Workbench | manual | 0.85 |
| T11 | P1 | Param widget closed-block UX: explicit read-only state + "open block" affordance | `AxisWorkbenchWidget.svelte:40-131,217-236` | visibly distinguishable states; click opens bound block | manual + unit | 0.85 |
| T12 | P1 | Preset split-list: remove 120-row cap (virtualize/paginate); parity items: advanced query, saved filters, row context menus | `AxisPresetBrowserPartPanel.svelte:115`, PB runtime, `design/AxisPresetBrowser.dc.html` | 1000+ preset library scrolls; parity checklist vs monolith + design tracked | manual with large library | 0.7 |
| T13 | P1 | Layout presets per device profile (`preset(kind)`: desktop/tablet/mobile, plus any additional kinds confirmed in the design shell) + drawer UI + doc migration | `axisWorkbenchDefaults.ts`, `migrations.ts`, `WorkbenchLayoutDrawer.svelte`, `design/Axis Layout System.dc.html` | presets apply correctly; existing user docs unharmed | migration tests + manual | 0.75 |
| T14 | P1 | Profile resolver (viewport class + runtime + user override), per-profile active layout | `core/profiles.ts`, `controller.svelte.ts`, adapter | resize switches profile, not mutate layout | unit + manual resize | 0.7 |
| T15 | P1 | Touch alternative for parameter pinning (long-press/context menu instead of dataTransfer) | `ControlSurface.svelte`, `AxisCustomPanel.svelte` | pin flow works on touch emulation | Playwright touch / device | 0.75 |
| T31 | P1 | **DC visual parity pass, file by file** (live set: Layout System, AxisWidget, AxisGroup, AxisFcPanel incl. `fc-part="grid"`, AxisBlockEditor incl. `be-part="modifier"`, AxisPresetBrowser; `support.js` as runtime). Per-file delta checklist → 1:1 port (template→Svelte, `renderVals()`→props), token-based styling only. Verify "overlays only on owner instance" for split parts. | `design/*.dc.html`, all renderer + adapter components | each file's checklist closed with archived screenshot diffs; maintainer sign-off | side-by-side browser sessions + `.workbench-smoke/` archive | 0.75 |
| T33 | P1 | Register `axis.blockEditor.modifier` split part (`be-part="modifier"`), adapting `ModifierFlyout.svelte` internals | new part panel, `axisWorkbenchRegistry(.Manifest).ts`, `design/AxisBlockEditor.dc.html` | modifier editable as docked part; overlay flyout unchanged in old shell | manual + registry test | 0.75 |
| T16 | P2 | Replace hardcoded hex with tokens in EditRibbon/WidgetZone-overflow/LibraryDrawer/Host logo; add "no hex in generic renderer" guard test | 4 components + new test | grep for `#[0-9a-f]{3,8}` in `workbench/svelte` clean (geometry excepted) | new unit test | 0.9 |
| T17 | P2 | Move Axis var fallbacks into `axisWorkbenchTheme.ts`; neutral generic defaults | `WorkbenchHost.svelte:78-97`, `theme.ts`, `axisWorkbenchTheme.ts` | generic renderer renders sanely with no host vars | boundary-style test | 0.85 |
| T18 | P2 | Focus management: `:focus-visible` styles, focus trap/restore for menus+drawers, Escape on mobile nav/dock drawers | `ContextMenu`, drawers, `WorkbenchHost`, `DockWorkspace` | keyboard-only session can operate edit mode | manual keyboard pass | 0.8 |
| T19 | P2 | Floating widgets: drag-within-zone, z-order, viewport clamping | `WidgetHost.svelte`, `WidgetZone.svelte` | floaters movable/stackable, never lost offscreen | manual | 0.8 |
| T20 | P2 | Invalid-drop preview styling | `DragLayer.svelte`, `drag.ts` | rejected targets visually distinct during drag | manual | 0.8 |
| T21 | P2 | Safe-area insets in Workbench (map `--axis-safe-*`→`--aw-safe-*`) | theme adapter, `WorkbenchHost`, `DockWorkspace` | iOS notch/home-indicator respected | iOS simulator | 0.8 |
| T22 | P2 | Bottom-navigation mode + drawer mode in schema/renderer (with migration) | `core/schema.ts`, `NavigationHost.svelte`, migrations | phone profile can use bottom nav; side drawer suppressed | manual at 390 px | 0.7 |
| T23 | P2 | Bottom-sheet presentation for drawers on phone; swipe-to-close | drawers, `WorkbenchHost` | drawers behave as sheets below 760 px | manual | 0.7 |
| T24 | P2 | FC split-pane parity polish vs `FcEditor` + `AxisFcPanel.dc.html` (itemized affordance checklist) | `AxisFcPartPanel.svelte`, fc runtime | checklist items closed or explicitly deferred | manual vs monolith + design | 0.7 |
| T26 | P2 | Playwright E2E suite for gated shell (dock, widgets, nav, custom panels, persistence reload) | new `e2e/` or scripts | suite green in CI | CI run | 0.75 |
| T34 | P2 | Guard test: no CSS transitions on pane geometry (`left/top/width/height`) in dock components (currently compliant — only `opacity` at `DockRegion.svelte:152`) | new unit test over `workbench/svelte` sources | test fails if a geometry transition is introduced | `npm test` | 0.9 |
| T27 | P3 | Cross-block param writes (binding depth) | bindings, ForgeFX paths | pinned widget edits non-open blocks safely | hardware test | 0.6 |
| T28 | P3 | Reducer refactors: extract tab-stack finder, dedupe repair logic; template metadata (version/tags) | `core/reducer.ts`, `invariants.ts`, `schema.ts` | no behavior change; tests green | `npm test` | 0.85 |
| T29 | P3 | Import/export UI for layouts/panels (validate + ID remap) | `WorkbenchLayoutDrawer`, `packages.ts` | JSON round-trip with collision-safe IDs | unit + manual | 0.8 |
| T30 | P3 | Workbench layout undo/redo (currently deliberately deferred — keep last) | controller, commands | layout-only undo separate from device history | unit | 0.6 |

(T25 from an earlier draft is superseded by T31; task IDs are stable otherwise.)

## Suggested Manual Test Plan

Run with `VITE_AXIS_WORKBENCH=1 npm run dev` (+ ForgeFX on :5056), once against mock/offline and once against real FM3 hardware:

1. **Boot & parity**: app boots; Signal Grid in main, Block Editor+FC tabs bottom, Preset Browser left, History right; all top-bar widgets show live data (preset, scenes, view, tuner, tempo, CPU, save).
2. **Core loop**: connect device → load preset → select block in grid → edit parameter in Block Editor panel → Cmd+Z undo → save via widget → SaveDialog → verify on device.
3. **Dock behavior**: drag Block Editor tab onto History (tabs merge); drag out to left region edge (split); resize region and split; collapse/expand region and panel; close and restore from library drawer.
4. **Widgets**: enter Edit Layout; move tempo widget to bottom bar; group tuner+tempo; reorder within group via drag and via arrow keys; ungroup; hide/restore via library; narrow the window until overflow menu appears; verify auto-fit default→compact→mini against `AxisWidget.dc.html`.
5. **Navigation**: reorder entries; attempt to hide the account entry (must be rejected/locked in rail footer); activate every entry — none may dead-end.
6. **Custom panels & params**: drag a knob from the open block's Control Surface to a custom panel; edge-drop a parameter into an empty region; edit via drag/wheel/click; close the source block and confirm the widget's read-only state; delete the panel and confirm widgets land in hidden, not lost.
7. **Split panes**: open PB sources+list+detail side by side — selection syncs, overlays render only on the owner pane; open FC board+inspector — switch selection syncs; write an FC field and verify read-back.
8. **Persistence**: reload — full layout restored; open a second browser tab — layout syncs without write loops.
9. **Mobile**: 390×844 — shell renders (post-T02); hamburger drawer opens/closes (incl. Escape); left/right/top docks open as overlay drawers; bottom dock resizes to 90 %; run the core loop by touch.
10. **Theme & overlays**: switch themes via picker — no illegible surfaces; Cmd+K palette, tuner overlay, device tools, account panel all layer correctly above the Workbench.
11. **Design side-by-side**: open each live-set `.dc.html` in a browser tab next to the Workbench and compare shell chrome, widget sizes, group modules, grid toolbar, block editor, preset browser parts.
12. **Fallback**: unset the gate — old shell fully intact (regression guard).

## Open Questions / Decisions Needed

1. **Scenes/Live/Sets scope**: placeholder panels are mandated — but should "Sets & Songs" (present in old ToolRail) get a nav entry too? It's currently absent from Workbench navigation defaults.
2. **StatusBar fate**: bottom widget-zone content vs. keeping a fixed global footer (verification report Q12) — affects the imprint/legal link placement.
3. **Param binding identity**: effectId+paramId is current; is grid-cell or family+instance binding needed before users build large custom panels (bindings break on preset changes otherwise)? (Verification report Q9.)
4. **Layout sync scope**: should `config/workbench` sync via Axis Cloud free-tier sync like other config docs, and what is the conflict story between two clients?
5. **`panel:<id>` vs `customPanel:<id>` zone naming**: keep current `panel:` prefix (needs a doc note) or migrate now while few docs exist?
6. **Preset kinds**: confirm the exact `preset(kind)` list in `Axis Layout System.dc.html` (desktop/tablet/mobile confirmed by the handoff; do stage/studio/compact also exist in the live shell?) — determines T13 scope.
7. **Gate-flip criteria**: which subset of Phases 2–5 is the hard gate for making Workbench the default shell (suggest: all P0/P1 + T16/T18/T21 + T31 sign-off)?
8. **Tablet breakpoint**: 760 px is the only Workbench threshold; the old shell used 1366. Where does "tablet" begin for profile resolution — 761–1365?

## Final Recommendation

Proceed on this branch — the architecture is sound, the boundary discipline is real, and no rewrite is needed. The runtime/technical foundation is strong; the remaining center of gravity is (a) the P0 stabilization items, (b) feature parity, and (c) the **design-file-driven visual parity pass** — the live `.dc.html` set is the binding spec and must drive Phase 4, not generic polish instincts.

Execute in this order: **commit the in-flight batch (T01)**, then Phase 1 stabilization (phone render T02 is the single most important unknown — bisect it before planning mobile work in detail), then Phase 2 parity (mostly mechanical widget/panel work with clear evidence trails), then presets/profiles (Phase 3) *before* any real users persist layouts, then the DC parity and mobile passes. Do not flip the default shell until the Phase 6 gate; keep the old shell behind a fallback flag for one full beta cycle. The two structural decisions worth settling immediately, because they shape the persisted schema, are singleton enforcement (T04) and the profile/preset model (T13/T14) — everything else can iterate safely behind the gate.
