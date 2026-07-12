# Axis Workbench Verification Report

Date: 2026-07-05

## 1. Executive summary

The planned Axis Workbench rebuild is architecturally sound and matches the direction of `docs/axis_workbench_design_aware_rebuild_plan_for_claude_code.md`: a generic Workbench core, a Svelte renderer, and an Axis-specific adapter layer. The design archive, especially `design/Axis Layout System.dc.html`, is substantially richer than the current production shell and must be treated as the behavioral specification, not visual inspiration.

The current Axis application is a functioning SvelteKit/Svelte 5/Vite app with real device integration, live parameter editing, preset/library features, cloud/account flows, and useful persistence patterns. It does not yet have a generic dock/workbench layer. The current route shell is a fixed composition of `ToolRail`, `TopBar`, one active main surface, `BlockEditor`, `StatusBar`, and overlays. The Workbench should therefore be introduced behind a new internal framework boundary rather than by replacing current UI logic in place.

The largest implementation risks are:

- Over-coupling the generic Workbench core to Axis concepts such as presets, devices, effect IDs, params, scenes, or ForgeFX.
- Treating live parameter values, meter values, tuner state, or preset state as layout state.
- Simplifying the design archive into a normal sidebar/dashboard instead of preserving dock regions, split/tab behavior, widget movement, grouping, panel libraries, layout profiles, and responsive behavior.
- Reusing design prototype implementation details such as `window.__PBBus` and `window.__FCBus` directly instead of replacing them with typed Svelte stores/controllers.
- Failing to model the production-only locked Axis Cloud/account requirement. Some design presets hide the account widget; the production Workbench must keep the account/cloud entry fixed or otherwise non-removable according to the user requirement.

Recommended first milestone: implement and test the Workbench core contract only: versioned schema, reducers, registries, migrations, default Axis layout factory, and invariant tests. Do not mount it in `+page.svelte` as the default shell until the model can represent the full design behavior.

## 2. Current repo findings

### Repository shape

Axis is a compact SvelteKit/Svelte 5 application:

- App route shell: `src/routes/+page.svelte`
- Global app styles/tokens: `src/app.css`
- Core app state: `src/lib/editor.svelte.ts`
- Device/API transport: `src/lib/forgefx.ts`
- Device edit history: `src/lib/history.svelte.ts`
- Block editor layout persistence: `src/lib/layouts.ts`
- Control-surface persistence: `src/lib/surfaceStore.svelte.ts`
- Main shell components: `ToolRail.svelte`, `TopBar.svelte`, `SignalGrid.svelte`, `BlockEditor.svelte`, `StatusBar.svelte`
- Major feature panels: `PresetBrowser.svelte`, `FcEditor.svelte`, `VirtualScreen.svelte`, `AxisPanel.svelte`, `DeviceTools.svelte`, `HistoryPanel.svelte`, `ThemePicker.svelte`
- Parameter/control surfaces: `ControlSurface.svelte`, `Knob.svelte`, `Dropdown.svelte`, `Toggle.svelte`, `EQGraph.svelte`, `ModifierFlyout.svelte`

The package uses SvelteKit, Svelte 5 runes, Vite, Vitest, `svelte-check`, Orama search, Supabase/cloud support, Capacitor mobile support, and Electron desktop support.

### Current shell behavior

`src/routes/+page.svelte` currently owns application composition directly:

- It initializes `surfaceStore`, `editor.init()`, polling, intervals, dirty-state guards, and keyboard shortcuts.
- It renders a fixed shell: `ToolRail`, `TopBar`, one of `PresetBrowser` / `FcEditor` / `VirtualScreen` / `SignalGrid`, then `BlockEditor` and `StatusBar`.
- It renders global overlays such as command palette, save dialog, tuner, cache prompt, Axis account panel, theme picker, notices, tour, and toast.

This shell should be wrapped/migrated gradually. It should not be deleted before equivalent Workbench modules exist.

### Reusable current code

Current components that should become Workbench panels/widgets or Axis adapter components:

- `SignalGrid.svelte`: real grid, block tiles, cables, gestures, add/remove/place/link behavior, live meters.
- `BlockEditor.svelte`: block editor wrapper with header, channel controls, resize, cab picker hook, and `ControlSurface`.
- `ControlSurface.svelte`: strongest existing implementation for parameter widgets, custom boards, arrange mode, per-control views, tray, resizing, and persistence.
- `PresetBrowser.svelte`: production Svelte port of the preset browser design, backed by `library`, cloud state, Orama search, advanced queries, saved filters, and real sync metadata.
- `FcEditor.svelte`: production device-true FC editor with model-shape-driven modes and ForgeFX writes.
- `ToolRail.svelte`: current capability-gated navigation, account/cloud entry, history/theme/tools/connection actions, mobile drawer.
- `TopBar.svelte`: current widget-equivalent controls: preset navigation, scene controls, view switch, add block, tuner, tempo, link/CPU/IO meters, per-block metering toggle, save.
- `AxisPanel.svelte`: account/cloud/privacy/about/connection/storage panel; should remain Axis-specific.
- `ThemePicker.svelte` and `theme.svelte.ts`: existing app theme system and tokens that can seed an Axis Workbench theme.

### Existing state and persistence seams

`editor.svelte.ts` is the central Axis runtime state. It includes connection/device state, presets, grid layout, block selection, parameters/enums, virtual effects, library mode, global mode, custom block-editor tabs, meters, tuner, CPU, viewport/mobile state, account/cloud/local/profile state, remote/direct/mobile support, palette/preset/cab/device tools, toasts, and ports.

Important integration rules:

- Workbench layout state must not be added directly to `editor` as another pile of UI flags.
- Axis panel/widget bindings should read from and dispatch through `editor` and `forgefx`, but Workbench core must not import either.
- `editor.setParam`, `editor.setEnum`, `editor.toggleBypass`, `editor.setChannel`, `editor.place`, `editor.removeSelected`, and related methods are the correct Axis side-effect paths.

`surfaceStore.svelte.ts` is the best persistence precedent:

- Single config doc: `config/surface`
- Local cache key: `axs.surface.doc`
- Reactive in-memory `$state`
- Debounced remote writes through `forgefx.putDoc`
- `surfApplyRemote` applies incoming docs without creating write loops
- `surfInit` folds old scattered localStorage keys into the doc

The Workbench should copy this pattern with a new doc/key, not reuse or overload the surface doc.

`layouts.ts` is for block editor layouts and swipe controls only:

- Local keys: `axis.layouts.v1`, `axis.swipe.v1`
- Remote mirror docs: `config/layouts`, `config/swipe`
- Domain: block editor tabs and quick controls, not global workbench layout

`history.svelte.ts` is device edit history only:

- It records param, bypass, channel, retype, place/remove/cable, scene, sceneName, and presetName operations.
- It persists per device/preset in IndexedDB.
- It should not be mixed with Workbench layout undo/redo.

`forgefx.ts` provides the backend config store and device API:

- `getDoc`, `putDoc`, `listDocs` already support config documents.
- `putDoc` stamps `origin: CLIENT_ID`, which is important for sync-loop avoidance.
- Axis adapter bindings should use this layer indirectly through `editor` where possible.

### Current responsive behavior

Current production responsive behavior is scattered:

- `editor.isMobile` returns `vw < 1366`, so many tablet/desktop widths enter "mobile" drawer/sheet mode.
- `ControlSurface.svelte` has its own `< 760` mobile breakpoint.
- `PresetBrowser.svelte`, `CommandPalette.svelte`, `AxisPanel.svelte`, `CabPicker.svelte`, `ModifierFlyout.svelte`, and `SaveDialog.svelte` bind to `editor.isMobile`.
- `SignalGrid.svelte` uses pane/container measurement and `ResizeObserver`, which is the right pattern for docked panels.

The design archive separates phone-like behavior from tablet profiles more explicitly. The Workbench needs profile-based responsive layout rather than one global `isMobile` boolean.

## 3. Design archive inventory

Relevant design files in `design/`:

| File | Role in Workbench rebuild |
| --- | --- |
| `CLAUDE.md` | Product rules and invariants. Defines the "everything is Widget, Panel, or Parameter" model, dock zones, widget variants, split-file pattern, layout invariants, and non-negotiable behavior. |
| `Axis Layout System.dc.html` | Primary Workbench behavioral source. Defines shell, five-region dock engine, split/tab/collapse/resize behavior, widget zones, widget drag/drop, grouping, custom panels, navigation reorder/hide, panel/layout library behaviors, responsive profiles, overflow handling, and edit layout mode. |
| `AxisWidget.dc.html` | Widget rendering and behavior spec. Defines widget kinds, size variants (`default`, `compact`, `mini`), density, axis, pinned parameter widgets, FC widgets, grid mode/block size widgets, account widget, and tooltip behavior. |
| `AxisGroup.dc.html` | Widget grouping spec. Defines grouped widget module, member ordering, insertion indicator, group drag grip, and edit overlays. |
| `AxisGridPanel.dc.html` | Pane-relative signal grid panel. Defines auto/map/full scaling, minimap behavior, cables, bypass/selection/readout visuals, and pane measurement requirements. |
| `AxisBlockEditor.dc.html` | Block editor/custom parameter board spec. Defines header, type search, channel controls, page tabs, arrange toolbar, draggable/resizable parameter widgets, tray, widget view cycling, modifier flyout, mobile behavior, and control types. |
| `AxisPresetBrowser.dc.html` | New split-capable Preset Browser spec. Defines `part` modes (`full`, `sources`, `list`, `detail`), shared state across instances, advanced query UI, saved filters, tags, cloud/device views, context menus, mobile drawers/detail screens, and theming. |
| `AxisFcPanel.dc.html` | FC and original editor behavior source. Defines FC board/inspector/layouts/LED/tap/hold parts, `fcPart` split behavior, FC widgets, mobile drawer/bottom sheet, account/cloud surfaces, and pane-relative grid behavior. |
| `Axis UX Review.dc.html` | Design archive review. Confirms the dock/widget architecture should stay, and flags implementation risks: top-bar autofit, pane-relative grid sizing, tablet clipping, competing dock models, keyboard/a11y, touch targets, and state feedback. |
| `Control Surface (Widget Grid).dc.html` | Original control-surface/widget-grid design. Source for arrangement mode, parameter widget types, grid resize, tray, compact packing, and modifier behavior. Much of this is already ported to `ControlSurface.svelte`. |
| `Preset Browser.dc.html` | Older Preset Browser design source. Current `PresetBrowser.svelte` says it was ported from this file; useful for visual and query behavior lineage. |
| `Axis Editor.dc.html` | Original full editor mockup. Source for general editor shell, grid, topbar, account/cloud, history, theme, picker, and block editing behavior. |
| `Axis Editor (AM4).dc.html` | AM4-specific original editor mockup. Useful for alternate device constraints and prior docking/editor behavior. |
| `support.js` | Prototype runtime support. Not a production dependency. |
| `screenshots/*.png` | Visual regression references for account states, preset browser, grid/cables, mobile sheets, widget grid arrangement, theme, AM4, and docked states. |

Design features by source:

- Docking, split panels, tabbed panels, custom panels, panel library, layout library, widget zones, widget grouping, nav customization, top/bottom bars, and responsive profile selection: `Axis Layout System.dc.html`.
- Widget variants, auto-fit sizing, pinned parameter widgets, FC widgets, account widget, and status widgets: `AxisWidget.dc.html`.
- Widget grouping behavior: `AxisGroup.dc.html`.
- Signal grid pane behavior: `AxisGridPanel.dc.html` and `AxisFcPanel.dc.html`.
- Block parameter widget grid/custom panel behavior: `AxisBlockEditor.dc.html` and `Control Surface (Widget Grid).dc.html`.
- Preset Browser split panels and shared state: `AxisPresetBrowser.dc.html`.
- FC split panels and FC widget integration: `AxisFcPanel.dc.html`.
- Mobile/tablet details: `Axis Layout System.dc.html`, `AxisPresetBrowser.dc.html`, `AxisFcPanel.dc.html`, `AxisBlockEditor.dc.html`, and design screenshots.

## 4. Feature matrix

| Feature | Design file source | Current Axis equivalent | Required Workbench module | Risk |
| --- | --- | --- | --- | --- |
| Five dock zones: left/right/top/bottom/main | `Axis Layout System.dc.html` | None; current route has fixed rail/top/main/editor/status shell | `core/dock`, `svelte/DockRegion`, `WorkbenchHost` | High |
| Docked panel drag/drop | `Axis Layout System.dc.html` | Block editor has bottom resize only; no generic panel drag | Dock reducer commands plus renderer drag controller | High |
| Region resize and collapse | `Axis Layout System.dc.html` | `BlockEditor` height resize only | Region sizing/collapse model and renderer handles | High |
| Cell splits within regions | `Axis Layout System.dc.html` | None | Dock split model with ratios and invariant checks | High |
| Tabbed panels | `Axis Layout System.dc.html` | Current route switches screens, no generic tab stacks | Tab stack model, active panel state, tab renderer | High |
| Pane collapse/minimize | `Axis Layout System.dc.html` | Close/editor collapse-ish behavior only | Panel collapse state separate from region collapse | Medium |
| Main-axis switching | `Axis Layout System.dc.html` | None | Dock region layout option | Medium |
| Edit Layout mode | `Axis Layout System.dc.html`, `CLAUDE.md` | `ControlSurface` arrange mode only | Workbench edit mode store, overlays, command dispatch | High |
| Custom panels | `Axis Layout System.dc.html` | `ControlSurface` custom boards, but not shell-level panels | Custom panel registry, panel instances, widget containers | High |
| Panel library | `Axis Layout System.dc.html` | None | Library model for saved panel templates | Medium |
| Layout library/profiles | `Axis Layout System.dc.html` | Theme presets; block editor layouts; no workbench profiles | Layout library, profiles, migration, apply/save commands | High |
| Top widget bar left/center/right | `Axis Layout System.dc.html`, `AxisWidget.dc.html` | `TopBar.svelte` hardcoded | Widget zones `top.left`, `top.center`, `top.right`; Axis widget registry | High |
| Bottom widget bar | `Axis Layout System.dc.html` | `StatusBar.svelte` fixed bottom status/legal bar | Widget zone plus optional app/status footer slot | Medium |
| Side rail widgets | `Axis Layout System.dc.html`, `AxisWidget.dc.html` | `ToolRail.svelte` hardcoded history/theme/account/connection | Widget zone `rail`; navigation/widget separation | High |
| Gridbar widgets | `Axis Layout System.dc.html`, `AxisWidget.dc.html` | GridMap/controls inside current editor only | Widget zone attached to panel or grid panel | Medium |
| Floating widgets | `Axis Layout System.dc.html` | None | Floating zone with x/y persistence | Medium |
| Hidden widgets/library | `Axis Layout System.dc.html` | Some hidden local recents/favorites only | Hidden widget zone and library UI | Medium |
| Widget variants: default/compact/mini | `AxisWidget.dc.html` | TopBar has ad hoc mobile hiding; ControlSurface has compact mode | Widget renderer contract and sizing policy | High |
| Widget auto-fit and overflow | `Axis Layout System.dc.html`, `Axis UX Review.dc.html` | TopBar scrolls/hides by `editor.isMobile`; no generic auto-fit | Zone measurement, priority, overflow menu | High |
| Widget grouping | `AxisGroup.dc.html`, `Axis Layout System.dc.html` | None | `WidgetGroupNode`, group commands, grouped renderer | Medium |
| Drag widgets between zones/panels | `Axis Layout System.dc.html` | ControlSurface arranges within one board only | Widget drag controller and reducer commands | High |
| Edge-drop widget creates panel | `Axis Layout System.dc.html` | None | Drag interpretation command: create panel and place widget | Medium |
| Custom navigation entries | `Axis Layout System.dc.html`, `CLAUDE.md` | `ToolRail` has capability-gated static entries | Navigation registry and layout state | High |
| Navigation reorder/hide | `Axis Layout System.dc.html` | None | Navigation layout reducer and edit renderer | Medium |
| Locked Axis Cloud/account entry | User requirement, `AxisWidget.dc.html`, `ToolRail.svelte`, `AxisPanel.svelte` | Account button fixed near rail bottom today | Nav/widget lock rules and Axis account adapter | Medium |
| Parameter widgets bound to block params | `AxisWidget.dc.html`, `AxisBlockEditor.dc.html`, `Axis Layout System.dc.html` | `ControlSurface` and `editor.params/enums` | Axis binding resolver plus generic binding ref | High |
| Mini/compact/default parameter widgets | `AxisWidget.dc.html` | ControlSurface control views, not topbar mini widgets | Axis param widget renderer variants | Medium |
| Block editor parameter board | `AxisBlockEditor.dc.html`, `Control Surface (Widget Grid).dc.html` | `BlockEditor.svelte` + `ControlSurface.svelte` | Axis panel adapter; optional custom-panel engine reuse | Medium |
| Signal grid panel | `AxisGridPanel.dc.html`, `AxisFcPanel.dc.html` | `SignalGrid.svelte` | Axis panel adapter with pane-relative sizing | Medium |
| Preset Browser full/split panels | `AxisPresetBrowser.dc.html` | `PresetBrowser.svelte` full screen only | Preset browser controller plus `sources/list/detail` panel adapters | High |
| FC split panels | `AxisFcPanel.dc.html` | `FcEditor.svelte` monolithic production editor | FC controller plus board/inspector/layout/LED/tap/hold adapters | High |
| FC widgets | `AxisWidget.dc.html`, `AxisFcPanel.dc.html` | Some FC state/actions inside `FcEditor` only | Axis FC widget registry and FC shared controller | Medium |
| Mobile drawer/nav behavior | `Axis Layout System.dc.html`, `AxisFcPanel.dc.html`, `AxisPresetBrowser.dc.html` | `ToolRail` mobile drawer, `editor.isMobile` | Profile-aware nav renderer and touch alternatives | High |
| Tablet profile/bottom nav | `Axis Layout System.dc.html` | Current app treats `<1366` as mobile | Workbench profile resolver and tablet layout defaults | High |
| Theme tokens/classes | All design files; `app.css`; `theme.svelte.ts` | Existing Axis CSS variables and theme engine | Generic `--aw-*` tokens plus Axis theme adapter | Medium |
| Layout persistence | Plan, `Axis Layout System.dc.html`, `surfaceStore.svelte.ts` | Surface/layouts/swipe docs only | `workbenchStore.svelte.ts`, schema migrations, remote apply | High |
| No live values in layout | Plan, user constraint | Current live values live in `editor`; ControlSurface stores board layout only | Binding refs only; value resolver in Axis adapter | Medium |
| Keyboard/a11y parity | `Axis UX Review.dc.html`, current code partially | CommandPalette keyboard support; many areas mouse-first | Command palette/context menus/focus management | Medium |

## 5. Proposed folder structure

Keep generic Workbench code separated from Axis-specific bindings and panels:

```text
src/lib/workbench/
  core/
    schema.ts
    ids.ts
    registry.ts
    reducer.ts
    commands.ts
    selectors.ts
    invariants.ts
    migrations.ts
    defaults.ts
  svelte/
    WorkbenchHost.svelte
    DockWorkspace.svelte
    DockRegion.svelte
    DockPane.svelte
    TabStack.svelte
    SplitHandle.svelte
    WidgetZone.svelte
    WidgetHost.svelte
    WidgetGroup.svelte
    NavigationHost.svelte
    PanelLibrary.svelte
    LayoutLibrary.svelte
    WorkbenchProvider.svelte
  styles/
    workbench.css
    tokens.css
  test/
    reducer.test.ts
    migrations.test.ts
    invariants.test.ts

src/lib/axis-workbench/
  axisWorkbenchStore.svelte.ts
  axisWorkbenchDefaults.ts
  axisWorkbenchRegistry.ts
  axisWorkbenchBindings.ts
  axisWorkbenchTheme.ts
  panels/
    AxisSignalGridPanel.svelte
    AxisBlockEditorPanel.svelte
    AxisPresetBrowserPanel.svelte
    AxisPresetSourcesPanel.svelte
    AxisPresetListPanel.svelte
    AxisPresetDetailPanel.svelte
    AxisFcBoardPanel.svelte
    AxisFcInspectorPanel.svelte
    AxisFcLayoutsPanel.svelte
    AxisFcLedPanel.svelte
    AxisFcTapPanel.svelte
    AxisFcHoldPanel.svelte
    AxisAccountPanel.svelte
    AxisHistoryPanel.svelte
  widgets/
    AxisPresetWidget.svelte
    AxisScenesWidget.svelte
    AxisViewWidget.svelte
    AxisAddBlockWidget.svelte
    AxisTunerWidget.svelte
    AxisTempoWidget.svelte
    AxisCpuWidget.svelte
    AxisSaveWidget.svelte
    AxisSearchWidget.svelte
    AxisHistoryWidget.svelte
    AxisAccountWidget.svelte
    AxisConnectionWidget.svelte
    AxisParamWidget.svelte
    AxisGridModeWidget.svelte
    AxisBlockSizeWidget.svelte
    AxisFcDeviceWidget.svelte
    AxisFcLayoutsWidget.svelte
    AxisFcSwitchWidget.svelte
  controllers/
    presetBrowserController.svelte.ts
    fcController.svelte.ts
    parameterBindingResolver.svelte.ts
```

Rationale:

- `src/lib/workbench/core` must be extractable and contain no Svelte, Axis, ForgeFX, device, preset, parameter, or editor imports.
- `src/lib/workbench/svelte` should be generic Svelte rendering of panels, widgets, navigation, docking, and library UI.
- `src/lib/axis-workbench` registers Axis panels/widgets, resolves bindings, adapts `editor`, and owns the default Axis layout.
- Existing components should be wrapped/adapted first, then split where the design requires separate parts.

## 6. Proposed data model

The Markdown plan's model is mostly correct. The important correction is that the generic core should not define an `AxisParamBinding` as a core type. Core should define a serializable binding reference envelope; the Axis adapter should define and validate Axis-specific binding payloads.

Suggested core model:

```ts
export interface WorkbenchDocument {
  schemaVersion: 1;
  activeProfileId: string;
  profiles: Record<string, WorkbenchProfile>;
  layouts: Record<string, WorkbenchLayout>;
  panelLibrary: Record<string, PanelTemplate>;
  widgetLibrary: Record<string, WidgetTemplate>;
  metadata?: {
    createdAt?: number;
    updatedAt?: number;
    app?: string;
  };
}

export interface WorkbenchProfile {
  id: string;
  label: string;
  layoutId: string;
  breakpoint?: 'desktop' | 'tablet' | 'phone';
  deviceClass?: string;
}

export interface WorkbenchLayout {
  id: string;
  label: string;
  dock: DockLayout;
  panels: Record<string, PanelInstance>;
  widgets: Record<string, WidgetInstance>;
  navigation: NavigationLayout;
  zones: WidgetZoneLayout;
  settings?: Record<string, unknown>;
}

export interface DockLayout {
  regions: Record<DockRegionId, DockRegionState>;
  root: Record<DockRegionId, DockNode | null>;
}

export type DockRegionId = 'left' | 'right' | 'top' | 'bottom' | 'main';

export type DockNode =
  | { kind: 'split'; id: string; axis: 'horizontal' | 'vertical'; ratio: number[]; children: DockNode[] }
  | { kind: 'tabs'; id: string; activePanelId: string; panelIds: string[] };

export interface DockRegionState {
  sizePx?: number;
  sizeRatio?: number;
  collapsed?: boolean;
}

export interface PanelInstance {
  id: string;
  type: string;
  title?: string;
  singletonKey?: string;
  closable?: boolean;
  collapsible?: boolean;
  locked?: boolean;
  state?: JsonObject;
}

export interface WidgetInstance {
  id: string;
  type: string;
  zone: WidgetZoneId;
  order: number;
  size?: 'default' | 'compact' | 'mini';
  groupId?: string | null;
  locked?: boolean;
  binding?: BindingRef;
  state?: JsonObject;
  floatingRect?: { x: number; y: number; width?: number; height?: number };
}

export interface BindingRef {
  kind: string;
  version: number;
  target: JsonObject;
}

export interface NavigationLayout {
  mode: 'side' | 'bottom';
  entries: Record<string, NavigationEntryState>;
  order: string[];
}

export interface NavigationEntryState {
  id: string;
  label?: string;
  hidden?: boolean;
  locked?: boolean;
  fixedSlot?: 'rail.footer' | 'bottom.trailing' | 'none';
  target?: { command: string; args?: JsonObject };
}
```

Axis-specific binding example, owned outside core:

```ts
export interface AxisParamBindingTarget {
  effectId: number;
  paramId: number;
  blockKey?: string;
  label?: string;
  valueKind: 'continuous' | 'enum';
}
```

Required model invariants:

- Every visible panel ID exists in `panels`.
- Every panel appears at most once in the dock tree.
- Every region tree contains only split/tab nodes; leaves are tab stacks.
- Region collapse is separate from pane collapse.
- Locked navigation entries cannot be hidden or removed.
- Locked/fixed widgets cannot be hidden unless their registry definition explicitly allows it.
- `WidgetInstance.binding` stores identity and binding metadata only. It never stores live value, meter, tuner, CPU, scene, or preset values.
- Unknown panel/widget types are preserved as serializable data and rendered as missing-plugin placeholders.
- Layout documents remain valid JSON and are migratable by schema version.

## 7. Proposed command/reducer model

All Workbench layout mutations should go through pure commands and a reducer. Renderers should interpret gestures into commands but should not mutate the document directly.

Core command families:

```ts
type WorkbenchCommand =
  | { type: 'panel.add'; panel: PanelInstance; region: DockRegionId; mode?: 'append' | 'tabWith'; targetPanelId?: string }
  | { type: 'panel.close'; panelId: string }
  | { type: 'panel.move'; panelId: string; to: DockTarget }
  | { type: 'panel.tab'; panelId: string; targetPanelId: string }
  | { type: 'panel.split'; panelId: string; region: DockRegionId; axis: 'horizontal' | 'vertical'; index: number }
  | { type: 'panel.rename'; panelId: string; title: string }
  | { type: 'panel.collapse'; panelId: string; collapsed: boolean }
  | { type: 'region.resize'; region: DockRegionId; sizePx: number }
  | { type: 'region.collapse'; region: DockRegionId; collapsed: boolean }
  | { type: 'split.resize'; splitId: string; ratio: number[] }
  | { type: 'widget.add'; widget: WidgetInstance; zone: WidgetZoneId; index?: number }
  | { type: 'widget.move'; widgetIds: string[]; zone: WidgetZoneId; index?: number; floatingRect?: FloatingRect }
  | { type: 'widget.hide'; widgetIds: string[] }
  | { type: 'widget.resize'; widgetId: string; size: WidgetSize }
  | { type: 'widget.group'; widgetIds: string[]; groupId?: string; index?: number }
  | { type: 'widget.ungroup'; groupId: string }
  | { type: 'navigation.move'; entryId: string; index: number }
  | { type: 'navigation.hide'; entryId: string }
  | { type: 'navigation.show'; entryId: string; index?: number }
  | { type: 'navigation.mode'; mode: 'side' | 'bottom' }
  | { type: 'layout.apply'; layoutId: string }
  | { type: 'layout.saveAs'; layout: WorkbenchLayout }
  | { type: 'library.panel.save'; template: PanelTemplate }
  | { type: 'library.panel.delete'; templateId: string }
  | { type: 'library.widgetGroup.save'; template: WidgetTemplate };
```

Reducer responsibilities:

- Normalize order indexes after widget/navigation moves.
- Enforce locked/fixed navigation and widget rules.
- Preserve unknown state fields.
- Create missing tab stacks when opening panels into empty regions.
- Remove empty split/tab nodes after closing/moving panels.
- Clamp split ratios and region sizes to minimums.
- Keep one active tab per non-empty tab stack.
- Move widgets from deleted custom panels to hidden/library state, matching the design behavior.
- Return validation errors for impossible operations rather than silently mutating.

Renderer responsibilities:

- Measure zones and panes.
- Convert drag targets into reducer commands.
- Handle pointer/keyboard/touch interactions.
- Render drop previews, overflow menus, edit controls, and locked-state affordances.

Axis adapter responsibilities:

- Register Axis panel/widget definitions.
- Convert widget actions into `editor`/`history`/`forgefx` calls.
- Resolve `BindingRef` values at render time.
- Keep device edit history separate from Workbench layout commands.

## 8. Persistence strategy

Create a new Workbench persistence store modeled after `surfaceStore.svelte.ts`.

Recommended identifiers:

- Remote config doc: `config/workbench`
- Local cache key: `axs.workbench.doc`
- Schema root: `WorkbenchDocument`
- Schema version: `schemaVersion: 1`

Persistence behavior:

- Seed synchronously from local cache for instant first render.
- On init, fetch `config/workbench` and migrate/merge if newer.
- Debounce writes to `forgefx.putDoc('config', 'workbench', doc)`.
- Stamp writes through existing ForgeFX `origin: CLIENT_ID`.
- Provide a remote-apply function equivalent to `surfApplyRemote` that updates local state without echo-writing.
- Call `notifyMutation()` when Workbench config changes and cloud autosync should notice.
- Keep import/export as validated JSON, not raw object assignment.
- Preserve unknown future fields through migrations.

Suggested store API:

```ts
export function workbenchInit(): Promise<void>;
export function workbenchDoc(): WorkbenchDocument;
export function workbenchDispatch(command: WorkbenchCommand): CommandResult;
export function workbenchApplyRemote(doc: WorkbenchDocument): void;
export function workbenchRev(): number;
```

Do not store in the Workbench layout:

- Current parameter values
- Tuner note/offset
- CPU/link/meter values
- Current preset name/number as live state
- Scene value as live state
- Cloud sync progress as live state
- Dirty preset/edit buffer state

Allowed in the layout:

- Widget instance identity, type, zone, order, size, group, floating coordinates
- Panel instance identity, type, title, dock position, tab/split/collapse state
- Binding references such as effect ID and param ID
- Static widget settings such as display preference, label override, min/max display option
- Navigation entry order, hidden state, and locked/fixed state
- Saved panel/group/layout templates

Potential later split if the document grows too large:

- `config/workbench` for active profiles/layouts
- `config/workbenchLibrary` for saved templates
- `config/workbenchSnapshots` only if a future explicit snapshot feature stores live values

## 9. Styling/theming strategy

The Workbench core renderer must be framework-like and generic. It should not hardcode Axis-only colors, block categories, device labels, account concepts, or preset-specific styling.

Recommended generic tokens:

```css
:root {
  --aw-bg: var(--bg);
  --aw-bg-2: var(--bg2);
  --aw-surface: var(--surface);
  --aw-surface-2: var(--surface2);
  --aw-border: var(--border);
  --aw-border-strong: var(--border3);
  --aw-text: var(--text);
  --aw-text-muted: var(--textdim);
  --aw-accent: var(--accent);
  --aw-accent-ink: var(--accentink);
  --aw-danger: var(--danger);
  --aw-ok: var(--ok);
  --aw-warning: var(--amber);
  --aw-font-ui: var(--font-ui);
  --aw-font-mono: var(--font-mono);
  --aw-rail-width: 66px;
  --aw-topbar-height: 60px;
  --aw-radius-sm: var(--r-sm);
  --aw-radius-md: var(--r-md);
}
```

Renderer strategy:

- Use semantic classes/data attributes: `.aw-host`, `.aw-dock-region`, `.aw-pane`, `.aw-tab-stack`, `.aw-widget-zone`, `.aw-widget`, `.aw-navigation`.
- Use slots/snippets/registry render functions for panel bodies, widget bodies, navigation entries, empty states, context menu content, and library rows.
- Keep Axis block category colors in the Axis adapter, not Workbench core.
- Map existing `src/app.css` and `theme.svelte.ts` tokens to `--aw-*`.
- Keep design visual behavior but express it through tokens/classes so the Workbench can later be extracted.
- Avoid one-off inline styles in the production Workbench renderer except for measured geometry (`left`, `top`, `width`, `height`, split ratios).

Design UX review notes to include early:

- Improve contrast tokens before freezing the system. Current design review flags `textfaint`/`textmuted` contrast.
- Standardize segmented controls, radii, spacing, focus rings, tooltip behavior, and icon sizing as Workbench component rules.
- Replace prototype Unicode-only action icons with the app's established `Icon.svelte` or a consistent icon system where practical.

## 10. Mobile/tablet strategy

The design archive has distinct responsive concepts that should be preserved:

- Phone-like behavior: drawer navigation, overlays, full-screen detail, bottom sheets, compact grids.
- Tablet profile: bottom navigation, touch-friendly layout, panel sizes clamped to frame, Workbench profile separate from simple viewport width.
- Pane-relative panels: signal grid, preset browser parts, FC parts, and custom panels must measure their own pane, not the whole viewport.

Current production conflict:

- `editor.isMobile` currently treats widths below 1366 as mobile. That is useful for the current shell but too broad for Workbench profiles.
- `ControlSurface` and design files use `<760` as a phone breakpoint.
- `Axis Layout System.dc.html` has a `profile === "tablet"` concept independent from viewport.

Recommended model:

```ts
type WorkbenchViewportClass = 'desktop' | 'tablet' | 'phone';
type WorkbenchProfileKind = 'desktop' | 'studio' | 'stage' | 'compact' | 'tablet' | 'custom';
```

Profile resolution should consider:

- User-selected layout profile
- Viewport class
- Device build/runtime: desktop, web/direct, remote, Capacitor mobile
- Input mode/touch availability
- Device model if needed for defaults

Mobile/tablet implementation requirements:

- Provide non-drag alternatives for moving/hiding widgets and panels via menus.
- Increase invisible hit targets for resize handles and edit controls while keeping the design's visual proportions.
- Use bottom sheets for widget library, panel library, command palette, and detail surfaces on touch profiles.
- Suppress side drawer when bottom navigation profile is active, avoiding duplicate nav systems.
- Ensure account/cloud remains accessible and fixed according to the production lock rule.
- Persist per-profile layouts, not one mutated layout that jumps based on viewport.

## 11. Migration strategy from current Axis UI

### Stage 0: verification and contract

This report completes the verification pass. No production UI should be replaced yet.

### Stage 1: Workbench core and tests

- Add generic schema, registries, commands, reducer, selectors, migrations, invariants.
- Add reducer tests for the design behaviors.
- Add default Axis layout JSON factory that can represent the design defaults.
- Assert no `editor`, `forgefx`, or Axis imports in core.

### Stage 2: static Svelte renderer behind a flag

- Add `WorkbenchHost` and render a static layout using mock registered panels/widgets.
- Validate dock region geometry, split/tab/collapse/resize, widget zones, and edit mode.
- Keep current `+page.svelte` default path unchanged.

### Stage 3: Axis adapter wrappers

Wrap existing production components as panels/widgets:

- `SignalGrid.svelte` -> `AxisSignalGridPanel`
- `BlockEditor.svelte` / `ControlSurface.svelte` -> `AxisBlockEditorPanel`
- `PresetBrowser.svelte` -> full preset panel first
- `FcEditor.svelte` -> full FC panel first
- `TopBar` controls -> Axis widget definitions
- `ToolRail` entries -> navigation definitions plus fixed account/connection widgets
- `HistoryPanel`, `AxisPanel`, `ThemePicker`, `DeviceTools` -> panel/overlay adapters as appropriate

### Stage 4: route shell integration

- Introduce a feature flag or development route for Workbench.
- Keep `editor.init`, polling, dirty guards, global keyboard shortcuts, gates, and overlays intact.
- Mount `WorkbenchHost` inside the existing app once the adapter can reproduce the current default shell.

### Stage 5: design-complete docking/widgets

- Implement full panel drag/drop, tabbing, split resizing, collapse, region collapse, panel library, layout library.
- Implement widget drag/drop, grouping, hidden library, auto-fit, overflow menu, floating widgets, panel widget zones.
- Enforce locked account/cloud behavior.

### Stage 6: split complex panels

- Replace prototype `window.__PBBus` design pattern with `presetBrowserController.svelte.ts`.
- Split Preset Browser into `sources`, `list`, and `detail` panel adapters while preserving shared selection/query/context state.
- Replace prototype `window.__FCBus` with `fcController.svelte.ts`.
- Split FC into board, inspector, layouts, LED, tap, and hold panel adapters.

### Stage 7: custom panels and parameter widgets

- Reuse/adapt `ControlSurface.svelte` concepts for custom panel parameter boards.
- Register `AxisParamWidget` and binding resolver.
- Ensure layout stores binding refs only and resolves live values through the Axis adapter.

### Stage 8: make Workbench the default shell

- After parity and persistence tests pass, switch `+page.svelte` to `WorkbenchHost`.
- Keep a short-lived fallback flag to load the old shell during validation.
- Remove obsolete fixed shell code only after the Workbench path is stable.

## 12. Test strategy

### Core unit tests

Use Vitest for pure Workbench core:

- Add/move/close panels in every region.
- Tab panel into another panel.
- Split tab stacks and resize ratios.
- Collapse/expand panels and regions.
- Move panels between regions without duplication.
- Add/move/hide/resize widgets.
- Group/ungroup widgets and preserve member order.
- Move/hide/show navigation entries.
- Reject hiding locked account/cloud entry.
- Save/apply layout profiles.
- Migrate old schema versions.
- Preserve unknown panel/widget state.

### Persistence tests

- Local cache seed.
- Remote doc apply without write loop.
- Debounced writes.
- Schema migration.
- Invalid/corrupt document fallback.
- Import/export validation.
- Verify no live parameter values are serialized in layout docs.

### Svelte/component tests

- `WorkbenchHost` renders every region.
- Empty regions hide outside edit mode and show targets in edit mode.
- Split handles and collapse strips render with correct hit areas.
- Widget zones render default/compact/mini states.
- Overflow menu appears when zone capacity is exceeded.
- Locked nav entries cannot render hide controls.

### Axis adapter tests

- Axis param binding resolves through mocked editor params/enums.
- Param widget writes use Axis `editor.setParam`/`setEnum` paths.
- Preset, scene, tuner, tempo, save, account, and connection widgets dispatch existing Axis actions.
- `PresetBrowser` split controller shares query/selection across parts.
- FC controller shares device/layout/view/switch selection across split parts.

### Visual/regression tests

- Compare Workbench screenshots against design screenshots for:
  - Default desktop Workbench
  - Tablet profile
  - Docked/split panels
  - Widget grouping and rearrangement
  - Preset Browser full and split modes
  - FC split modes
  - Mobile sheets/drawers
- Playwright should validate no major text overlap, blank panels, unreachable nav, or non-rendering canvases/SVGs.

### Manual acceptance pass

- Start app against mock/offline and real device where possible.
- Move panels between all five regions.
- Tab two panels together.
- Split multiple panels in one region.
- Resize regions and splits.
- Collapse/expand panels and regions.
- Move widgets across all zones.
- Group/ungroup widgets.
- Hide/restore widgets and nav entries.
- Confirm account/cloud cannot be removed or lost.
- Pin a parameter widget and verify live value/write behavior.
- Reload app and confirm layout persistence.

## 13. Open questions

1. What exact placement is required for the fixed Axis Cloud/account entry on every profile: rail footer, bottom nav trailing slot, or always lower-left even with bottom navigation?
2. Should locked account/cloud be a navigation entry, a widget, or both? Current design has an `account` widget; current production has a rail button opening `AxisPanel`.
3. Are Workbench layouts scoped per user, per local install, per device model, per physical device, or a combination?
4. Should profile selection be automatic by viewport/runtime, user-selected, or hybrid?
5. Which panels are singletons (`grid`, `block editor`, `preset browser`, `account`) and which can have multiple instances?
6. Should layout libraries sync through Axis Cloud by default, or remain local unless a cloud scope is enabled?
7. What conflict behavior is expected if two clients edit the Workbench layout concurrently?
8. Should Workbench have its own layout undo/redo stack, separate from device edit history?
9. For pinned parameter widgets, what is the most stable binding identity across preset changes: effect ID, grid row/col, block key, family+instance, or a composite?
10. Should custom panels use the full `ControlSurface` grid model immediately, or a simpler widget-only panel first?
11. How much of the design's stub panels (`Controllers`, `Scenes`, `Live`, `Setup`) should ship in the first user-visible Workbench milestone?
12. Should `StatusBar.svelte` remain a global footer outside Workbench, become a bottom widget bar item, or both?
13. How should global overlays (`CommandPalette`, `SaveDialog`, `TunerOverlay`, `ThemePicker`, `AxisPanel`) be layered relative to Workbench panels?
14. Are the currently untracked design archive files intended to be committed as part of the source of truth?

## 14. Recommended first implementation milestone

Recommended milestone: **Workbench Core Contract**.

Goal: create the extractable internal framework foundation without replacing the current Axis UI.

Scope:

- `src/lib/workbench/core/schema.ts`
- `src/lib/workbench/core/commands.ts`
- `src/lib/workbench/core/reducer.ts`
- `src/lib/workbench/core/selectors.ts`
- `src/lib/workbench/core/invariants.ts`
- `src/lib/workbench/core/migrations.ts`
- `src/lib/workbench/core/registry.ts`
- `src/lib/axis-workbench/axisWorkbenchDefaults.ts`
- Vitest tests for reducer, migrations, and invariants

Acceptance criteria:

- Core imports no Axis-specific modules and no Svelte components.
- A versioned `WorkbenchDocument` can serialize/deserialize as JSON.
- The default Axis layout can represent the design's five dock regions, primary panels, widget zones, navigation layout, hidden widgets, custom panel placeholders, and locked account/cloud rule.
- Reducer supports add/move/close/tab/split/resize/collapse panels.
- Reducer supports add/move/hide/resize/group/ungroup widgets.
- Reducer supports nav reorder/hide/show and rejects hiding locked entries.
- Tests cover invalid operations and invariant repair.
- No changes are made to the current production shell yet.

This milestone gives the project a stable contract to review before any visible UI migration begins.
