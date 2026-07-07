# Workbench framework guide

This file applies when working under `src/lib/axis-workbench/` or `src/lib/workbench/`.

## Two-layer architecture

- `src/lib/workbench/` — the **generic dockable-workbench framework**. Pure mechanism:
  documents, layouts, panels, widgets, docking, drag, navigation. It imports **nothing**
  from the app and knows nothing about audio devices, presets, or MIDI.
- `src/lib/axis-workbench/` — the **Axis binding**. Everything that maps Axis concepts
  (signal grid, block editor, foot controller, preset browser, device state) onto the
  generic framework lives here.

**Rule for new code:** if it is a reusable layout/docking mechanism, it belongs in
`workbench/`. If it mentions any Axis concept, it belongs in `axis-workbench/`. When in
doubt, start in `axis-workbench/` and promote later — never the reverse.

### Generic layer (`src/lib/workbench/`)

- `core/schema.ts` — `WorkbenchDocument` (profiles, layouts, panelLibrary, widgetLibrary);
  `WorkbenchLayout` (dock, panels, widgets, widgetGroups, navigation, zones, settings);
  `WidgetInstance { id, type, zone, order, size, groupId?, locked?, binding?, state?, floatingRect? }`
  with `WidgetSize = 'default' | 'compact' | 'mini'`;
  `PanelInstance { id, type, title?, singletonKey?, locked?, closable?, collapsible?, collapsed?, state? }`;
  `BindingRef { kind, version, target }`.
- `core/` — reducer, commands, selectors, invariants, ids, migrations, defaults,
  profiles, widgetFit. All pure and unit-tested.
- `svelte/renderRegistry.ts` — `WorkbenchRenderRegistry`: maps type strings to Svelte
  components for panels/widgets/navigation; also `registerAction`, `registerWidgetSizing`,
  `registerNavigationState`.
- `svelte/controller.svelte.ts` — `createWorkbenchController(doc, { onChange })`: runes
  store with `dispatch` / `dispatchMany`, subscribable.
- `svelte/` components — `WorkbenchHost.svelte`, `DockWorkspace`, `TabStack`, `PanelHost`,
  `WidgetZone`, `EditRibbon`, `DragLayer`, etc.
- `context.ts` — `getWorkbenchContext()` returns `{ controller, registry, … }`.
- `bindings.ts` — `WorkbenchBindingRegistry` resolves a `BindingRef.kind` to a live value.

### Axis binding layer (`src/lib/axis-workbench/`)

- `axisWorkbenchRegistryManifest.ts` — **the source of truth for every type string**:
  `AXIS_WORKBENCH_BASE_PANEL_TYPES`, `AXIS_WORKBENCH_WIDGET_TYPES`,
  `AXIS_WORKBENCH_NAVIGATION_IDS`, `AXIS_WORKBENCH_ACTION_IDS`, plus derived part-panel
  types from `blockEditor/types.ts`, `fc/types.ts`, `presetBrowser/types.ts`.
- `axisWorkbenchRegistry.ts` — the ONE file wiring every manifest type to a component or
  handler; also calls `registerWidgetSizing({ estWidth, isKeep })` and
  `registerNavigationState`.
- `axisWorkbenchStore.svelte.ts` — singleton controller + persistence (localStorage key
  `axs.workbench.doc`, 150 ms debounce; cloud `putDoc`, 1500 ms) and the normalization
  chain (migrate → ensureGridControls → pruneRetiredRail → ensureMobileBottomNav).
- `axisWorkbenchBindings.ts` — binding kind `axis.paramControl`, resolved from the editor
  store.
- `AxisWorkbenchShell.svelte` — seeds profiles, initializes, renders `WorkbenchHost` with
  the Axis theme and ribbon extras. `featureGate.ts` gates on `VITE_AXIS_WORKBENCH === '1'`.
- `panels/` — one component per panel type.
- `widgets/AxisWorkbenchWidget.svelte` — a SINGLE large switch component rendering ALL
  widget types via `kind = widget.type.replace(/^axis\./, '')` branches plus one
  `activate()` click dispatcher. `widgets/widgetEstWidths.ts` holds
  `AXIS_WIDGET_EST_WIDTHS` and `AXIS_WIDGET_KEEP_TYPES`.
- `axisWorkbenchDefaults.ts` — default document, `createAxisWorkbenchPanels()`,
  `ensureAxisGridControlWidgets`, panelLibrary/widgetLibrary entries.
- `axisWorkbenchLayoutPresets.ts` — six data-only presets (`default`, `stage`, `studio`,
  `compact` layout-tab kinds + `tablet`, `mobile` profile seeds): `PRESET_SPECS` with
  `WIDGET_TYPE` / `WIDGET_INSTANCE_ID` maps, `buildDock()`, `buildNavigation()`.
- `axisWorkbenchLayoutActions.ts` — `seedAxisProfiles`, `AXIS_MOBILE_PROFILE_ID`.
- `axisWorkbenchNavigationActions.ts` — `createAxisNavigationPanelAction({ actionId,
  panelId, panelType, title, region, state? })`, an add-or-focus helper;
  `axisNavigationActiveState.ts` computes nav tinting.
- Runtime adapters: `blockEditor/`, `fc/`, `presetBrowser/` — each has `types.ts` (parts
  array + `panelType(part)` helper) and a controller; `fc/` and `presetBrowser/` add
  runtime/host/data modules. `axisWorkbenchRuntimeAdapters.ts` declares the adapter
  manifests. See "Runtime adapters" below.

## Registration flow

Manifest → registry → render. A type string that is not in
`axisWorkbenchRegistryManifest.ts` does not exist; a manifest entry that is not wired in
`axisWorkbenchRegistry.ts` renders nothing. Never register a literal type string that
bypasses the manifest.

## Recipe: add a widget

1. `axisWorkbenchRegistryManifest.ts`: append `'axis.X'` to `AXIS_WORKBENCH_WIDGET_TYPES`.
2. `widgets/AxisWorkbenchWidget.svelte`: add an `{:else if kind === 'X'}` render branch,
   plus an `activate()` case if the widget is interactive. Design tokens only — no hex.
3. `widgets/widgetEstWidths.ts`: add `AXIS_WIDGET_EST_WIDTHS['axis.X']` (and add to
   `AXIS_WIDGET_KEEP_TYPES` if the widget must survive overflow trimming). A missing
   estWidth entry silently breaks widget-fit math.
4. Live device data? Reuse binding kind `axis.paramControl`, or add a new kind and
   resolver in `axisWorkbenchBindings.ts`.
5. Non-trivial pure logic goes in a new `widgets/<x>.ts` with `test/<x>.test.ts`.
6. Placement: seed in `axisWorkbenchDefaults.ts` and/or add a widgetLibrary entry; update
   `axisWorkbenchLayoutPresets.ts` (`WIDGET_TYPE` + `WIDGET_INSTANCE_ID` maps + per-preset
   widget lists) — keep ALL six presets consistent.
7. Visible chrome? Add an e2e assertion (mirror `e2e/05-widgets.spec.ts`).

## Recipe: add a panel

1. `panels/AxisXPanel.svelte` with `let { panel }: { panel: PanelInstance } = $props()`;
   use `getWorkbenchContext()` for controller/registry; read params from `panel.state`.
2. Manifest: add `'axis.x'` to `AXIS_WORKBENCH_BASE_PANEL_TYPES` (or a new subsystem
   `types.ts` with a parts array for multi-part panels).
3. `axisWorkbenchRegistry.ts`: import the component and map it in the registerPanel loop.
4. `axisWorkbenchDefaults.ts`: `createAxisWorkbenchPanels()` entry with `singletonKey`
   (plus `locked` / `closable` as appropriate) and an optional panelLibrary entry.
5. Navigation (optional): nav id in the manifest; nav entry/order in defaults AND in every
   preset's `buildNavigation`; register a `createAxisNavigationPanelAction` in
   `axisWorkbenchRegistry.ts`; add an `axisNavigationActiveState.ts` tint if applicable.
6. Preset docks: add to `buildDock()` in the presets if the panel is docked by default.
7. Runtime-hosting panels: build the types/controller/runtime/host/data quintet and
   declare it in `axisWorkbenchRuntimeAdapters.ts` (see next section).
8. Tests: pure modules unit-tested; e2e for dock/navigation behavior.

## Runtime adapters

Scaffold `<x>/types.ts` + `<x>Controller.ts` + `<x>Runtime.ts` + `<x>Host.ts` +
`<x>Data.ts` following the `fc/` template. The host factory (e.g.
`createAxisFcWorkbenchHost()`) is the **single file allowed to import app modules**
(editor/device runtime); controllers, runtimes, and data modules stay pure and
unit-tested. Register the adapter in `axisWorkbenchRuntimeAdapters.ts`. Panels mount via
`bindAxisRuntimeHost({ runtime, host, onSnapshot, start })` from `runtimeBinding.ts`;
`runtimeHostStack.ts` is a LIFO stack so multiple panels can bind concurrently.

## Testing convention

Vitest runs in the node environment — **no DOM**. `.svelte` components are never
unit-mounted. Extract pure logic into `.ts` modules with a co-located
`test/<name>.test.ts` (examples: `widgetEstWidths.test.ts`, `paramWidgetState.test.ts`).
Interaction and rendering coverage is Playwright e2e: `e2e/*.spec.ts` with
`VITE_AXIS_WORKBENCH=1`, the `bootCleanWorkbench` helper from `e2e/support/workbench.ts`,
viewport width ≥ 1366, and stable selectors/data-attributes.

## Theming

- `workbench/` components use `--aw-*` tokens ONLY. A unit test fails on hex color
  literals in `workbench/svelte/*.svelte`.
- `axis-workbench/` components may use app tokens (`--accent`, `--bg2`, `--text`,
  `--danger`, `--ok`, `--amber`, `--font-mono`) and `--aw-*` tokens, but **never hex
  literals**.

## Persistence and normalization

The normalization chain in `axisWorkbenchStore.svelte.ts` (migrate → ensureGridControls →
pruneRetiredRail → ensureMobileBottomNav) runs on every load over previously-normalized
documents. It MUST stay idempotent: running it twice must equal running it once,
otherwise stored user layouts corrupt incrementally on each app start. Any change to a
normalization step needs an idempotence check in its unit test.

## App coupling and the extraction seam

`workbench/` is extraction-ready today (zero app imports — keep it that way).
`axis-workbench/` intentionally couples to the app; the honest list of coupling edges:

- `../../editor.svelte` — the central coupling (about a dozen importing files).
- `../../forgefx` — device runtime hosts + store persistence.
- `../../history.svelte`, `../../types`.
- Directly embedded app components: `SignalGrid`, `BlockEditor`, `FcEditor`,
  `VirtualScreen`, `ModifierEditorCore`, `library.svelte`, `cloud.svelte`.

The host-factory seam is the decoupling model: push all editor/device-runtime access into
the host factories, keep runtimes/controllers/data pure. If a future extraction moves
`workbench/` (and possibly the binding skeleton) to its own repository, the host
factories and embedded app components are exactly what stays behind.

## Tooling and process

- Scaffolding: `/new-widget`, `/new-panel`, `/new-runtime-adapter` walk the recipes above
  as checklists.
- Review: run the `workbench-reviewer` agent over the diff before committing framework
  changes.
- Framework changes on the layout-rework branch must be logged in
  `docs/axis_layout_rework_progress_log.md` and tracked in Plane (see root `CLAUDE.md`,
  Task tracking section).
