# Axis Workbench Implementation Status And Next Plan

Date: 2026-07-05
Status: Living implementation tracker
Primary design reference: `design/Axis Layout System.dc.html`
Primary architecture reference: `docs/axis_workbench_design_aware_rebuild_plan_for_claude_code.md`

## Ground Rules

The design archive is the functional design specification. Visual parity work is intentionally deferred until the refreshed design is available, but implementation must not remove or simplify the design features.

Axis Workbench is being built as a reusable internal framework layer that can later become its own package/repository. Generic Workbench code must stay free of Axis device concepts, ForgeFX imports, live parameter values, preset state, cloud state, or editor store coupling.

The intended layering remains:

```txt
src/lib/workbench/
  generic schema, reducer, commands, renderer, actions, packages, bindings

src/lib/axis-workbench/
  Axis defaults, registry, persistence, bindings, panels, widgets, theme adapter
```

The old hand-built Axis shell remains the default. The Workbench shell stays feature-gated until parity gates pass.

## Current State

Latest verified validation:

```bash
npm run check
npm run test -- --run
npm run build
```

Current result:

```txt
check: passing
tests: passing, 149 tests
build: passing
```

Known non-blocking build warnings:

- Unused Orama imports in `src/lib/PresetBrowser.svelte`.
- Large Vite chunks.
- `editor.svelte.ts` is dynamically imported by the Axis Workbench binding adapter and statically imported elsewhere, so Vite does not split it into a separate chunk.

## Milestone Status

### Milestone 1: Generic Core

Status: effectively complete.

Implemented:

- Versioned serializable `WorkbenchDocument`.
- Profiles, layouts, five dock regions, split/tab dock nodes.
- Generic panel, widget, group, navigation, zone, library, and binding schemas.
- Generic binding envelope only; no live Axis values in core.
- Deterministic id helpers.
- Metadata-only core registries.
- Pure reducer with command result/error model.
- Dock repair, split ratio normalization, tab active-panel repair.
- Widget zones, hidden widgets, grouping/ungrouping, locked widget protection.
- Navigation order/hide/show/mode with locked/fixed entry protection.
- Layout/profile/library commands.
- Profile helpers and snapshot creation.
- Zone lifecycle commands.
- Custom panel helpers.
- Portable Workbench package helpers.
- Migrations and repair fallback.
- Axis default layout factory using generic core types.

Important current files:

```txt
src/lib/workbench/core/schema.ts
src/lib/workbench/core/commands.ts
src/lib/workbench/core/reducer.ts
src/lib/workbench/core/invariants.ts
src/lib/workbench/core/migrations.ts
src/lib/workbench/core/defaults.ts
src/lib/workbench/core/customPanels.ts
src/lib/workbench/packages.ts
src/lib/axis-workbench/axisWorkbenchDefaults.ts
```

### Milestone 2: Renderer Foundation And Axis Integration

Status: substantially implemented, still in progress.

Implemented:

- Public Workbench barrel exports.
- Generic Svelte renderer foundation:
  - `WorkbenchHost`
  - `DockWorkspace`
  - `DockRegion`
  - `DockNode`
  - `TabStack`
  - `PanelHost`
  - `SplitHandle`
  - `WidgetZone`
  - `WidgetHost`
  - `WidgetGroupHost`
  - `NavigationHost`
  - `EditRibbon`
  - `WorkbenchProvider`
  - library/layout drawers
  - context menu primitive
  - drag layer
- `WorkbenchController` with reactive document, reducer dispatch, batch dispatch, edit mode, drag state, subscriptions, and binding resolution.
- Svelte render registry for panels/widgets/navigation/actions.
- Action result tracking and missing-action fallback.
- Generic theme token mapping.
- Gated `AxisWorkbenchShell.svelte`.
- Axis Workbench persistence store:
  - config doc: `config/workbench`
  - local cache: `axs.workbench.doc`
  - migration/repair on load
  - debounced remote writes
  - remote apply without command dispatch
- Axis registry for major panel/widget/navigation types.
- Axis binding adapter for `axis.paramControl`.
- Axis theme adapter.
- Initial pane-host adapters for major Axis panels.
- Feature gate in `+page.svelte` through `VITE_AXIS_WORKBENCH=1`.

Still open before Milestone 2 can be called complete:

- Stronger gated-shell integration coverage.
- More runtime smoke checks for the Workbench route with real app boot, overlays, polling, keyboard shortcuts, and device behavior preserved.
- Renderer edge hardening around empty regions, failed actions, missing components, and restore paths.
- More persistence tests for stale cache, remote echo, write-loop avoidance, and imported package application.
- Confirm that generic renderer remains package-ready and Axis-free as more adapter behavior is added.

Recently added hardening:

- Testable `VITE_AXIS_WORKBENCH=1` feature gate helper.
- Component-free Axis registry manifest for panel/widget/navigation/action coverage.
- Lazy Axis registry actions so registry metadata can be tested without initializing live editor stores.
- Malformed remote Workbench documents fall back to Axis defaults before being applied.

### Milestone 3: Edit Layout Interactions

Status: partial groundwork.

Implemented:

- Basic panel drag/drop interpretation.
- Basic widget drag/drop interpretation.
- Preview layer infrastructure.
- Widget group and navigation drag/reorder foundations.
- Context-menu alternatives for common panel/widget/navigation actions.
- Parameter source command helpers that can feed later drag/drop UI.

Still open:

- Final drag/drop visuals and highlight behavior.
- Full panel drag targets for edge, tab, split, and per-slot drops.
- Touch alternatives.
- Polished widget drag between zones.
- Widget group insert indicators and member-level reorder.
- Floating widget placement polish.
- Overflow/library behavior polish.
- Keyboard-accessible alternatives for drag-only actions.

Visual work in this milestone should wait for the refreshed design.

### Milestone 4: Custom Panels, Libraries, And Bindings

Status: started at model/API level.

Implemented:

- Panel-owned widget zones via `panel:<panelId>`.
- Custom panel command helpers:
  - `createCustomPanelCommands`
  - `createBoundWidgetCommand`
  - `panelWidgetZoneId`
  - `panelIdFromWidgetZone`
  - `isPanelWidgetZone`
- Zone lifecycle commands:
  - `zone.ensure`
  - `zone.rename`
  - `zone.hide`
  - `zone.delete`
- Panel close moves owned-zone widgets to hidden instead of losing them.
- Panel and widget template save/load helpers.
- Layout/profile/panel/widget portable package helpers.
- Generic binding registry with versioned resolvers.
- Axis `axis.paramControl` binding resolver.
- Generic parameter source model and command helpers.
- Axis parameter source adapter for named and enum params.
- Edge-drop/custom-panel command sequence for pinned parameter widgets.

Still open:

- Custom Panel grid model.
- Parameter drag source model from Block Editor/Control Surface.
- Edge-drop parameter/widget creates a Custom Panel.
- Full Panel Library and Widget/Group Library UX polish.
- Bound parameter widget write/edit behavior.
- Binding resolver expansion for more Axis-specific binding kinds.
- Ensure no live value is persisted in Workbench documents.

### Milestone 5: Split Axis Panels

Status: controller and adapter groundwork implemented; full visual/behavioral split still open.

Implemented:

- Preset Browser split part types:
  - `full`
  - `sources`
  - `list`
  - `detail`
- Preset Browser shared controller state for source, selected entry, focused block, and detail open state.
- Preset Browser optional host binding for future extraction from the monolithic component.
- Preset Browser part panel adapter; `full` delegates to the current production `PresetBrowser`.
- Preset Browser split data adapter for real library-backed source counts, filtered list content, selected preset details, tags, and block focus targets.
- Preset Browser `sources`, `list`, and `detail` panes now render real library/editor-adjacent state instead of static placeholders.
- Preset Browser Workbench runtime host for device/file/local/cloud load paths, device audition, detail param hydration, grid preview loading, and version-history loading.
- Preset Browser split panes now use the shared runtime for load/audition/detail side effects instead of relying only on the monolithic browser.
- FC split part types:
  - `full`
  - `board`
  - `inspector`
  - `layouts`
  - `led`
  - `tap`
  - `hold`
- FC shared controller state for layout, view, switch, side, and inspector open state.
- FC optional host binding for future extraction from the monolithic component.
- FC part panel adapter; `full` delegates to the current production `FcEditor`.
- FC split data adapter for the production editor's model-shape rules: live layout/view/switch models, geometry-only blind-write models, and flat config models.
- FC `layouts`, `board`, `tap`, `hold`, `led`, and `inspector` panes now render FC model-backed state instead of static placeholders.
- FC Workbench runtime host for model load, live switch read-back, field writes, category reset writes, value-slot writes, custom label character writes, and LED color writes.
- FC split panes now use the shared runtime instead of directly owning FC model state.
- Lifecycle-safe runtime host stack for Axis split-panel runtimes, so multiple mounted panes can bind hosts and unmount in any order without clearing the active runtime host incorrectly.
- Shared Axis runtime binding helper and component-free runtime adapter manifest.
- Runtime adapter convention now separates split panel rendering, pure data adapters, shared controllers, runtime hosts, and concrete Axis service host factories.
- Axis registry now registers split part panel types.
- Block Editor / Control Surface arrange mode can now trigger the Workbench `axis.pinSelectedParameters` action when hosted inside the Workbench shell:
  - per-control pinning creates a parameter custom panel for that parameter
  - per-page pinning creates a parameter custom panel for the current visible control page
  - the action supports explicit `paramId` / ordered `paramIds` filtering so future drag/drop wiring can reuse the same contract

Needed:

- Continue extracting editing/read-back behavior from monolithic panels into typed Svelte controllers; FC and Preset Browser now both have first shared runtime controllers, but the monolithic panels still own the full polished/editorial UX.
- Replace prototype bus ideas from the design archive with typed Svelte stores/controllers.
- Keep current production behavior working while exposing pane-hosted parts.

### Milestone 6: Profiles, Mobile/Tablet, Polish

Status: early profile/layout support only.

Implemented:

- Core profile model and commands.
- Layout save/apply/delete/rename.
- Layout package helpers.
- Axis default profile/layout.

Still open:

- Desktop/tablet/mobile/stage/studio/compact layout sets.
- Profile resolver that does not equate viewport width with user intent.
- Bottom nav and drawer behavior.
- Keyboard/focus/ARIA pass.
- Visual parity checks against refreshed design/screenshots.
- Mobile/tablet behavior from the new design.

## Immediate Plan

The next implementation batch will focus on non-visual work. Visual parity and widget styling are deferred until the refreshed design is available.

Items 1 and 2 have been implemented at the non-visual contract/model level:

1. Split-panel controller groundwork for Preset Browser and FC.
2. Parameter drag-source model and custom panel insertion commands.

Still needed after this batch:

- Real Preset Browser `sources/list/detail` view extraction.
- Real FC `board/inspector/layouts/led/tap/hold` view extraction.
- Continue UI wiring from Block Editor/Control Surface parameter DOM to parameter sources:
  - initial arrange-mode Pin page / Pin control command route is implemented
  - final drag-source attributes, touch behavior, and drop visuals are still deferred
- Final drag visuals and drop target rendering after the refreshed design lands.

## Item 1: Split-Panel Controller Groundwork

Goal: make Preset Browser and FC Editor split-capable without redesigning their UI yet.

This is not a visual rewrite. The first pass should create typed shared controller layers and lightweight pane-part adapters so the Workbench can host parts independently later.

### Preset Browser Controller Plan

Add an Axis-specific controller module:

```txt
src/lib/axis-workbench/presetBrowser/
  presetBrowserWorkbenchController.svelte.ts
  types.ts
```

Proposed part type:

```ts
export type AxisPresetBrowserPart = 'full' | 'sources' | 'list' | 'detail';
```

Controller responsibilities:

- Hold shared browser selection state that multiple pane parts can read.
- Mirror or delegate to the existing `library` and `editor` stores.
- Avoid duplicating preset data.
- Avoid storing live preset/library values in the Workbench document.
- Provide stable methods for:
  - opening a source
  - selecting a preset row
  - opening detail
  - applying/importing a preset action where current production code already supports it
  - reporting empty/loading/error states

Add pane adapters:

```txt
src/lib/axis-workbench/panels/preset-browser/
  AxisPresetBrowserPartPanel.svelte
```

First implementation can render current `PresetBrowser.svelte` for `full`, and useful non-final placeholders for `sources`, `list`, and `detail` that are wired to the controller.

Do not split the current monolithic Preset Browser UI visually in this pass unless it is low-risk. The important part is the controller contract and registered panel parts.

Add registry types:

```txt
axis.presetBrowser.full
axis.presetBrowser.sources
axis.presetBrowser.list
axis.presetBrowser.detail
```

### FC Controller Plan

Add an Axis-specific controller module:

```txt
src/lib/axis-workbench/fc/
  fcWorkbenchController.svelte.ts
  types.ts
```

Proposed part type:

```ts
export type AxisFcPart = 'full' | 'board' | 'inspector' | 'layouts' | 'led' | 'tap' | 'hold';
```

Controller responsibilities:

- Hold shared FC selection/view/layout state for pane parts.
- Delegate real device operations to existing FC/editor/ForgeFX code paths.
- Avoid prototype global buses.
- Avoid storing live FC config state in the Workbench document.
- Provide stable methods for:
  - selecting switch
  - selecting layout/view
  - updating tap/hold side
  - opening inspector
  - reporting loading/unsupported states

Add pane adapters:

```txt
src/lib/axis-workbench/panels/fc/
  AxisFcPartPanel.svelte
```

First implementation can render current `FcEditor.svelte` for `full`, and useful non-final placeholders for the sub-parts wired to the controller.

Add registry types:

```txt
axis.fc.full
axis.fc.board
axis.fc.inspector
axis.fc.layouts
axis.fc.led
axis.fc.tap
axis.fc.hold
```

### Item 1 Tests

Add tests for:

- Preset Browser part type parsing/fallback.
- Preset Browser controller shared selection state.
- FC part type parsing/fallback.
- FC controller shared selection state.
- Registry includes split panel part types.
- Workbench package/boundary test still confirms generic Workbench has no Axis imports.

## Item 2: Parameter Drag-Source Model And Custom Panel Insertion Commands

Goal: define the non-visual parameter drag and insertion API before implementing final drag visuals.

This should create a framework-level drag payload shape and Axis-specific helpers that produce generic Workbench commands.

### Generic Workbench Additions

Add generic drag/source types under:

```txt
src/lib/workbench/svelte/parameterSources.ts
```

or, if the model is renderer-independent:

```txt
src/lib/workbench/core/parameterSources.ts
```

Proposed generic shape:

```ts
export interface WorkbenchParameterSource {
  id: string;
  label: string;
  binding: BindingRef;
  preferredWidgetType?: string;
  defaultSize?: WidgetSize;
  state?: JsonObject;
}
```

Add helpers that turn parameter sources into commands:

- add bound widget to an existing zone
- add bound widget to a custom panel
- edge-drop parameter creates a custom panel then inserts widget

These helpers must return `WorkbenchCommand[]`, not mutate the document.

### Axis Parameter Source Additions

Add Axis-specific helper module:

```txt
src/lib/axis-workbench/axisParameterSources.ts
```

It should translate current editor/block parameter information into generic `WorkbenchParameterSource` objects with binding refs:

```ts
{
  kind: 'axis.paramControl',
  version: 1,
  target: {
    effectId,
    paramId,
    block,
    param,
    label
  }
}
```

Important rule:

The binding target may store stable identifiers and labels. It must not store live parameter values, live meter values, preset values, tuner values, or any other volatile runtime state.

### Command Helpers

Add or extend helpers so these flows are command-only:

1. Drop parameter into existing zone:

```txt
widget.add bound param widget
```

2. Drop parameter into existing custom panel:

```txt
widget.add bound param widget into panel:<panelId>
```

3. Edge-drop parameter creates a custom panel:

```txt
zone.ensure
panel.add
widget.add bound param widget into panel:<newPanelId>
```

4. Multiple selected parameters create a custom panel:

```txt
zone.ensure
panel.add
widget.add ...
widget.add ...
optional widget.group
```

### UI Integration Scope For This Pass

Do not implement final drag visuals yet.

Allowed light integration:

- Add command/context-menu route from a parameter source to "Pin to Custom Panel" if easy and safe.
- Add test-only helpers before UI integration if current Block Editor parameter DOM is risky.
- Keep the implementation ready for refreshed design drag targets.

### Item 2 Tests

Add tests for:

- Axis parameter source creation from mock parameter data.
- Bound widget command does not persist live value.
- Edge-drop helper creates zone + panel + widget command sequence.
- Multiple parameter source helper creates stable order.
- Panel close still moves parameter widgets to hidden.
- Generic Workbench boundary remains Axis-free.

## Do Not Do Yet

These are intentionally deferred:

- Final widget visual styling.
- Final drag highlight/drop preview visuals.
- Mobile/tablet visual polish.
- Default shell replacement.
- Workbench layout undo/redo.
- Deep refactor of `PresetBrowser.svelte` or `FcEditor.svelte` visuals.

## Completion Gates For The Next Batch

The next batch is done when:

- Preset Browser and FC split part types/controllers exist.
- Axis registry knows split part panel types.
- Generic parameter source model exists.
- Axis parameter source helper exists.
- Command helpers can add parameter widgets to zones/custom panels.
- Tests cover the new contracts.
- `npm run check`, `npm run test -- --run`, and `npm run build` pass.
