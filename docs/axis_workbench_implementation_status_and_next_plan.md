# Axis Workbench Implementation Status And Next Plan

Date: 2026-07-05
Status: Living implementation tracker
Primary design reference: `design/Axis Layout System.dc.html`
Primary architecture reference: `docs/axis_workbench_design_aware_rebuild_plan_for_claude_code.md`

## Ground Rules

The live design archive is the functional design specification. Visual parity work now targets the refreshed DC files directly, and implementation must not remove or simplify the design features.

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
npm run test:workbench-visual
npm run build
```

Current result:

```txt
check: passing
tests: passing, 159 tests
build: passing
visual smoke: passing desktop Firefox screenshot
```

Latest focused update:

```txt
2026-07-05: custom panels now persist grid defaults, render through a grid WidgetZone variant, and accept Workbench parameter-source drag/drop from Control Surface board/search controls.
2026-07-05: parameter edge-drops and widget/group edge-drops now create custom panels, and the library drawer can target panel regions and widget zones.
2026-07-06: Preset Browser and FC split panes gained richer standalone surfaces, axis.paramControl gained open-block write/edit behavior, and a Firefox Workbench visual smoke command was added.
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

Status: complete for the gated Workbench foundation. Production default enablement remains blocked on later parity gates.

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
- Stronger gated-shell integration coverage.
- Renderer edge hardening around empty regions, failed actions, missing components, and restore paths.
- Persistence tests for malformed/stale remote documents, remote apply without command dispatch, and write-loop avoidance.
- Generic renderer boundary tests confirming Workbench remains Axis-free.
- Public package-style exports for core, renderer, actions, libraries, profiles, bindings, sizing, navigation, and move-alternative helpers.

Recently added hardening:

- Testable `VITE_AXIS_WORKBENCH=1` feature gate helper.
- Component-free Axis registry manifest for panel/widget/navigation/action coverage.
- Lazy Axis registry actions so registry metadata can be tested without initializing live editor stores.
- Malformed remote Workbench documents fall back to Axis defaults before being applied.
- Missing navigation actions create a fallback Workbench panel.
- Failed navigation actions create an error panel with command and message details instead of disappearing.
- Optional Workbench context helper lets production Axis components expose Workbench-only affordances without coupling the old shell to the Workbench.
- DC mobile shell behavior has been ported into the gated Svelte Workbench foundation:
  - phone-sized Workbench uses a hamburger-triggered left rail drawer instead of a bottom nav rail
  - left/right/top dock regions no longer consume inline mobile layout space
  - mobile left/right/top docks open through edge-indicator overlay drawers
  - bottom dock stays inline and can occupy up to 90% of the Workbench height

### Milestone 3: Edit Layout Interactions

Status: complete at the interaction/command-contract level. Pixel-perfect DC drag choreography remains part of the visual parity pass.

Implemented:

- Panel drag/drop interpretation for region, tab-stack, and edge split targets.
- Dock-wide panel drop wayfinding while a panel drag is active.
- DC-style dock and widget visual wayfinding:
  - all dock regions are outlined while panel dragging
  - widget zones are outlined while widget dragging
  - active preview, tab preview, split preview, insert line, and group preview share the DC dashed/solid accent language
  - drag ghost uses the compact floating module treatment from the design
- Panel context-menu alternatives for moving to all five dock regions.
- Widget drag/drop interpretation for zones, ordered inserts, floating placement, and grouping.
- Widget and group context-menu alternatives for moving to top-left, top-center, top-right, rail, bottom, floating, and hidden/library zones.
- Keyboard movement alternatives for widget, widget group, and navigation edit handles.
- Preview layer infrastructure.
- Widget group and navigation drag/reorder foundations.
- Context-menu alternatives for common panel/widget/navigation actions.
- Parameter source command helpers that can feed later drag/drop UI.
- Parameter pin command route from Control Surface arrange mode into Workbench custom panels.
- Overflow/library behavior for cramped widget zones.

Remaining design-parity work after this milestone:

- Continue porting final DC visual details where the internal panel/widget components still differ from the design archive.
- Add browser-level Playwright smoke checks for the gated Workbench shell once the visual pass starts.

### Milestone 4: Custom Panels, Libraries, And Bindings

Status: complete for layout/library/binding contracts. Further Axis live-write bindings are tracked as later binding-depth work.

Implemented:

- Panel-owned widget zones via `panel:<panelId>`.
- Custom panel command helpers:
  - `createCustomPanelCommands`
  - `createCustomPanelFromWidgetsCommands`
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
- Custom panel grid defaults are persisted in panel state and normalized through generic helpers.
- Generic `WidgetZone` supports a dedicated grid variant for panel-owned tiled widget surfaces.
- Parameter source drag payloads are serialized/validated through a generic Workbench MIME contract.
- Axis custom panels accept parameter-source drops and add bound parameter widgets to their owned grid zone.
- Control Surface board cards and live search result tiles expose parameter drag payloads when hosted inside the Workbench.
- Workbench workspace edge drops dispatch a generic parameter-source action.
- Axis registers the parameter-source edge-drop action and creates an `axis.customPanel` in the dropped region.
- Widget and widget-group edge drops create a new custom panel and move the dragged widgets into the panel-owned zone.
- Panel/widget library drawer supports rename, delete, load, hidden restore, placed-widget hide, and explicit target selection for panel regions and widget zones.

Still open:

- Bound Axis parameter widgets now support open-block drag/wheel/click editing; cross-block direct writes remain a later binding-depth item.
- Binding resolver expansion for additional Axis-specific binding kinds.
- Browser-level visual smoke coverage for custom panel drag/drop and library flows beyond the current desktop shell screenshot.

### Milestone 5: Split Axis Panels

Status: substantially implemented. Split panes are now model-backed, runtime-backed, and visually richer; exact monolithic-browser/editor feature parity remains an ongoing polish track.

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
- Preset Browser split panes now expose standalone source totals, list source/count summaries, richer preset rows, detail readiness chips, and runtime detail status.
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
- FC split panes now expose mode/config status, board summaries, function dropdowns where decoded model metadata is available, display-mode controls, function hints, slot role labels, and inspector read-back summaries.
- Lifecycle-safe runtime host stack for Axis split-panel runtimes, so multiple mounted panes can bind hosts and unmount in any order without clearing the active runtime host incorrectly.
- Shared Axis runtime binding helper and component-free runtime adapter manifest.
- Runtime adapter convention now separates split panel rendering, pure data adapters, shared controllers, runtime hosts, and concrete Axis service host factories.
- Axis registry now registers split part panel types.
- Block Editor / Control Surface arrange mode can now trigger the Workbench `axis.pinSelectedParameters` action when hosted inside the Workbench shell:
  - per-control pinning creates a parameter custom panel for that parameter
  - per-page pinning creates a parameter custom panel for the current visible control page
  - the action supports explicit `paramId` / ordered `paramIds` filtering so future drag/drop wiring can reuse the same contract
- Control Surface parameter DOM now has final desktop drag-source wiring for Workbench-hosted board cards and search results.
- Axis custom panels now provide a grid drop target for those parameter sources.
- `axis.paramControl` widgets now resolve current open-block parameter state and support direct drag/wheel editing for continuous parameters plus click-cycling for enum parameters when the bound block is open.
- `npm run test:workbench-visual` starts a gated Workbench dev server and captures a nonblank desktop Firefox screenshot into `.workbench-smoke/`.

Needed:

- Continue deep visual/interaction parity against the live DC files where the split panes still do not expose every monolithic browser/editor affordance.
- Replace prototype bus ideas from the design archive with typed Svelte stores/controllers.
- Keep current production behavior working while exposing pane-hosted parts.
- Phone-width Firefox smoke currently exposes an app-wide blank-render issue below roughly tablet widths; the opt-in `WORKBENCH_SMOKE_PHONE=1 npm run test:workbench-visual` path is left as the failing reproduction.

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

The current implementation batch follows the refreshed live design files directly. The project is porting the DC behavior into the Svelte Workbench shell rather than embedding the DC runtime.

Items 1 and 2 have been implemented at the non-visual contract/model level:

1. Split-panel controller groundwork for Preset Browser and FC.
2. Parameter drag-source model and custom panel insertion commands.

Still needed after this batch:

- Real Preset Browser `sources/list/detail` view extraction.
- Real FC `board/inspector/layouts/led/tap/hold` view extraction.
- Continue UI wiring from Block Editor/Control Surface parameter DOM to parameter sources:
  - initial arrange-mode Pin page / Pin control command route is implemented
  - desktop Control Surface board/search drag-source attributes and custom-panel drop path are implemented
  - embedded Block Editor parameter controls use the shared Control Surface drag-source path
  - edge-drop custom-panel creation is implemented for parameter sources, widgets, and widget groups
  - touch drag alternatives and final drop visuals remain open
- Begin the no-compromise DC visual/mobile parity pass using the live design files:
  - `design/Axis Layout System.dc.html`
  - `design/AxisWidget.dc.html`
  - `design/AxisGroup.dc.html`
  - `design/AxisFcPanel.dc.html`
  - `design/AxisBlockEditor.dc.html`
  - `design/AxisPresetBrowser.dc.html`
  - `design/support.js`

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

Final drag visuals are now partially implemented in the Workbench shell and custom-panel drop target; continue to port the remaining DC details where the Svelte surfaces differ.

Allowed light integration:

- Add command/context-menu route from a parameter source to "Pin to Custom Panel" if easy and safe.
- Add test-only helpers before UI integration if current Block Editor parameter DOM is risky.
- Keep the implementation ready for refreshed design drag targets.

### Item 2 Tests

Add tests for:

- Axis parameter source creation from mock parameter data.
- Bound widget command does not persist live value.
- Edge-drop/custom-panel helper creates zone + panel + widget command sequence.
- Existing widget custom-panel helper creates zone + panel + widget move command sequence.
- Multiple parameter source helper creates stable order.
- Panel close still moves parameter widgets to hidden.
- Generic Workbench boundary remains Axis-free.
- Parameter source drag payload parser accepts valid serialized sources and rejects malformed payloads.

## Do Not Do Yet

These are intentionally deferred:

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
