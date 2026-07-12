# Axis Workbench Design-Aware Rebuild Plan for Claude Code

Date: 2026-07-05
Audience: Claude Code working inside the `sKuhLight/Axis` repository
Language: English
Status: Implementation planning document. This is not code yet.
Input sources: current Axis repository plus the design in Axis/design
The latest "view" where most feature are implemented is Axis Layout System.dc.html

---

## 0. Mandatory instruction for Claude Code

This document updates the earlier Axis Workbench plan after inspecting the uploaded design archive. The design archive is not a rough sketch. It already contains a large amount of working visual behavior with mock data. Treat the archive as a design specification that must be preserved and wired to real Axis state, not as disposable inspiration.

Before changing code:

1. Inspect the current repository.
2. Inspect the design archive if it is available in the working directory.
3. Verify current file paths and APIs before making edits.
4. Run current validation commands where possible.
5. Do not migrate Axis from Svelte/SvelteKit to React as part of this work.
6. Do not simplify, redesign, or remove existing design features merely because the implementation is complex.
7. Implement the Workbench in phases. Do not attempt a one-shot rewrite.
8. Keep the generic Workbench layer independent from Axis device concepts.
9. Preserve current real device behavior while replacing the shell/layout layer.
10. Any feature that exists in the design archive should be considered intended product behavior unless the user explicitly says otherwise.

Suggested verification commands:

```bash
npm install
npm run check
npm test
```

Suggested current repository files to inspect first:

```txt
package.json
src/routes/+page.svelte
src/lib/editor.svelte.ts
src/lib/SignalGrid.svelte
src/lib/BlockEditor.svelte
src/lib/ControlSurface.svelte
src/lib/HistoryPanel.svelte
src/lib/TopBar.svelte
src/lib/ToolRail.svelte
src/lib/StatusBar.svelte
src/lib/surfaceStore.svelte.ts
src/lib/forgefx.ts
src/lib/layouts.ts
```

Suggested design archive files to inspect first:

```txt
CLAUDE.md
Axis Layout System.dc.html
AxisWidget.dc.html
AxisGroup.dc.html
AxisGridPanel.dc.html
AxisBlockEditor.dc.html
AxisPresetBrowser.dc.html
AxisFcPanel.dc.html
Axis UX Review.dc.html
Control Surface (Widget Grid).dc.html
Preset Browser.dc.html
Axis Editor.dc.html
Axis Editor (AM4).dc.html
```

If the design files are not present in the repo, ask for them or use this document as the distilled product/architecture specification. Do not guess missing behavior silently.

---

## 1. Executive summary

Axis is not just adding a docking feature. Axis is moving from a fixed Svelte app shell into a reusable IDE-style Workbench framework.

The target product is **Axis Workbench**:

```txt
Generic Workbench Core
  -> Svelte Workbench Renderer
    -> Axis Adapter
      -> Axis panels, widgets, navigation, parameter bindings, and device actions
```

The uploaded design archive confirms that the intended UI is already feature-rich:

- Five dock regions: left, right, top, bottom, and main/center.
- Real tiling behavior. Docks reflow and shrink neighbors; they do not overlay each other.
- Per-region panel splitting.
- Per-slot tabs when a panel is dropped onto another panel's tab/header area.
- Whole-dock collapse and individual panel collapse.
- Region and slot resizing.
- A global Edit Layout / Customize mode.
- Widget zones in top-left, top-center, top-right, rail, bottom, grid toolbar, custom panels, floating space, hidden library, and overflow.
- Widgets with three required size states: default, compact, mini.
- Auto-fit behavior: widgets shrink from default to compact to mini when their zone narrows.
- Widget grouping by dragging one widget onto another.
- Fluent grouped modules with dividers and in-place reorder placeholders.
- Movable, hideable, reorderable navigation entries.
- Some fixed/locked navigation or chrome entries, such as the Axis Cloud button in the lower-left area, that must remain available.
- Custom panels that accept widgets and pinned parameters.
- Parameter drag sources from block editors.
- Pinned parameter widgets.
- Panel Library and saved widget/group templates.
- Full layout presets and per-device/profile layouts.
- Mobile/tablet-optimized behavior, not a desktop-only design.
- Existing default panels with polished internal layouts that should not be redesigned just because the shell becomes customizable.

The work is therefore a structured re-platforming:

```txt
From:
  fixed Axis app shell with directly mounted components

To:
  registered Workbench shell with panels, widgets, navigation, bindings, commands, persistence, and themes
```

The correct move is still **not React**. The correct move is a clean, typed, serializable Workbench architecture in Svelte.

---

## 2. Design archive inventory and how to use it

### 2.1 `CLAUDE.md`

This is a project guideline and should be treated as high-priority product guidance. Its key rule is:

```txt
Everything is a Widget, a Panel, or a Parameter.
```

For implementation, expand that into four registered Workbench primitives:

```txt
Panel
Widget
Parameter Binding
Navigation Entry
```

Navigation entries are special because they can behave like widgets in layout zones but also have app-routing/section semantics.

Important rules from the design guide:

- Default panels stay as-is and remain polished default experiences.
- Custom Panels are the power-user escape hatch.
- Most features should exist twice: as a default polished panel and as composable widgets/params that can be rearranged.
- Any new widget must support default, compact, and mini size states.
- The layout engine must reflow/shrink neighbors; it must not overlap panels.
- Empty zones/bars hide outside Edit Layout mode.
- Panels and layouts persist per device/profile.

### 2.2 `Axis Layout System.dc.html`

This is the main shell and the most important design source. It demonstrates:

- Root shell structure.
- Left rail.
- Top bar with left/center/right zones.
- Bottom bar.
- Mobile navigation drawer and hamburger behavior.
- Edit Layout ribbon.
- Panel dropdown and options dropdown.
- Widget library.
- Panel Library and saved groups.
- Five-region dock engine.
- `computeDock` behavior.
- Region resizing.
- Panel tabbing.
- Panel collapse.
- Widget dragging.
- Widget grouping.
- Navigation drag/reorder/hide.
- Edge-drop custom-panel creation.
- Layout presets: default, stage, studio, compact, tablet.
- Zones such as `tl`, `tc`, `tr`, `bottom`, `rail`, `gridbar`, `float`, `hidden`, and `panel:<id>`.

Do not discard these concepts. The production implementation should re-create them as typed Svelte components backed by a generic Workbench model.

### 2.3 `AxisWidget.dc.html`

This is the base widget design. It demonstrates:

- One shared widget baseline.
- Required size states: `default`, `compact`, `mini`.
- Auto-fit assumptions.
- Built-in widget kinds:
  - logo
  - preset
  - scenes
  - view
  - add block
  - tuner
  - tempo/BPM
  - CPU
  - save
  - search
  - history
  - grid map
  - undo/redo
  - connection
  - account/cloud
  - FC device
  - FC layouts
  - FC switch/view
  - grid mode
  - block size
  - pinned parameter
- Compact/mini behavior for segmented controls.
- Tooltip behavior for pinned parameters and icon widgets.

Every new production widget must follow the same size-state contract.

### 2.4 `AxisGroup.dc.html`

This demonstrates widget group rendering:

- Group module container.
- Members rendered as `AxisWidget` instances.
- Dividers between members.
- Insert indicator placeholder while dragging into a group.
- Grip for moving the whole group in Edit Layout mode.
- Member-level drag overlay.

Production implementation should model this as first-class `WidgetGroupNode`, not as ad hoc DOM state.

### 2.5 `AxisGridPanel.dc.html`

This demonstrates the signal grid as a panel:

- Full/map/auto grid modes.
- Pane-relative sizing.
- Responsive cell sizing.
- Cable rendering.
- Category colors.
- Bypass state.
- Selected state.
- Block size control.
- Minimap behavior.
- Mobile/panel-constrained behavior.

The existing production `SignalGrid.svelte` already has real device logic. Do not replace device behavior with mock behavior. Instead, preserve the design goal: the grid must be embeddable as a Workbench panel and must size to its actual panel, not to the full viewport.

### 2.6 `AxisBlockEditor.dc.html`

This demonstrates the block editor panel:

- Header with block identity and type search.
- Channel selector.
- Page tabs.
- Arrange mode.
- Widget-grid style parameter board.
- Drag/move/resize of control widgets inside the editor.
- Tray for hidden controls.
- Control views: knob, fader, slider, number, button, switch, select, EQ, action.
- Value editing.
- Modifier flyout.
- Mobile behavior.
- Parameter drag-source behavior.

The current production `BlockEditor.svelte` and `ControlSurface.svelte` already contain related logic. Production migration should reuse current real parameter APIs while adopting the Workbench boundaries.

### 2.7 `AxisPresetBrowser.dc.html`

This demonstrates the preset browser as both:

- a polished default full panel, and
- split-able subpanels.

It supports `part` modes such as:

```txt
full
sources
list
detail
```

The design uses a shared `window.__PBBus` to synchronize split instances. Production should replace window-global buses with typed shared stores or panel instance controllers.

### 2.8 `AxisFcPanel.dc.html`

This demonstrates the FC/foot-controller area as both:

- a polished default panel, and
- split-able subpanels.

It supports parts such as:

```txt
board
inspector
layouts
led
tap
hold
```

It also includes FC widgets such as:

- FC device selector
- FC layout selector
- switch/view selector

Production should replace the mock/shared bus with a typed store/controller and should preserve the split-panel behavior.

### 2.9 `Axis UX Review.dc.html`

This is a useful audit of the mockup. Treat it as design QA input, not as a request to remove features. Especially preserve the positive findings:

- The five-region dock skeleton is strong.
- The widget/panel/parameter model is correct.
- Edge-drop panel creation is intended.
- Cross-instance split-panel synchronization is intended.
- Default panel layouts are intended.
- Mobile/tablet behavior is in scope.

Also pay attention to risks mentioned there:

- Widget auto-fit must be real and consistent.
- Grid sizing must be pane-relative.
- Navigation entries must not become dead no-ops.
- Save/dirty/sync state should become real app state, not only toasts.
- Keyboard/focus/ARIA should not be ignored.

---

## 3. Non-negotiable product principles

### 3.1 The design is the target

The `.dc.html` files use mock data and a design-component runtime, but the behavior is intentional. Do not translate them into a simpler UI. Translate them into a maintainable Svelte/TypeScript Workbench implementation.

Wrong:

```txt
Implement only simple left/right tabs because the full design is complex.
```

Right:

```txt
Implement the Workbench model in phases, but keep the model capable of all designed behavior.
```

### 3.2 Default panels must remain polished

Do not force power-user customization onto every default panel. The default panels are the beginner-friendly experience.

Examples of default panels:

- Signal Grid
- Block Editor
- Preset Browser
- FC Controllers
- History
- Signal Chain

These panels may expose subparts and widgets, but their default full-panel layouts should remain stable and intentional.

### 3.3 Custom Panels are the power-user surface

A Custom Panel is where users build their own control surface:

- widgets
- pinned parameters
- preset controls
- scene controls
- tuner
- save actions
- FC controls
- custom grouped widgets

Do not respond to every customization request by creating another hardcoded screen. Prefer exposing composable pieces that users can put into Custom Panels.

### 3.4 Navigation is customizable too

Navigation entries are part of the customization system:

- reorderable
- hideable when allowed
- movable into top/bottom widget bars when allowed
- optionally renderable in rail, bottom nav, drawer, or as widgets
- controlled by lock rules for fixed entries

Important: the user wants some fixed entries, especially an Axis Cloud button in the lower-left area. The framework must support locked/fixed navigation entries.

### 3.5 Every widget has three size states

Every widget must support:

```txt
default
compact
mini
```

The layout engine may force a maximum size. The renderer may shrink below that maximum when the available width is insufficient.

Rules:

- Default is the full presentation.
- Compact reduces labels/details.
- Mini is the smallest useful representation.
- Multi-chip widgets collapse to current-value chips in mini mode where appropriate.
- Widgets must not force horizontal overflow.
- Widget roots must be able to shrink: `min-width: 0`, `max-width: 100%`, no fixed unbreakable widths except where explicitly measured.

### 3.6 The Workbench must be styleable like a framework

Axis Workbench should become reusable for other projects. Therefore:

- The generic Workbench core must be headless and style-agnostic.
- The Svelte renderer should expose semantic classes, slots, data attributes, and CSS custom properties.
- Axis styling should be one default theme, not the only possible look.
- New apps should be able to style the Workbench similarly to how Bootstrap can be themed or extended.
- Avoid hardcoded Axis colors in generic Workbench code.

### 3.7 Keep the framework extraction boundary strict

The long-term goal is an internal framework that can later become a separate package or repository. Treat `src/lib/workbench/` as package-quality code now, even before extraction.

Rules:

- `src/lib/workbench/core/` must remain pure TypeScript and app-agnostic.
- `src/lib/workbench/svelte/` must remain renderer/framework code, not Axis adapter code.
- `src/lib/workbench/` must not import Axis stores, Axis components, device APIs, cloud APIs, preset APIs, or Axis binding resolvers.
- Generic renderer behavior must be driven by schema, registry metadata, command handlers, CSS tokens, and slots/components supplied by the host app.
- Any Axis-specific visual or behavioral preference belongs in `src/lib/axis-workbench/`, in an Axis theme, or in Axis default document metadata.
- Do not hardcode app-specific widget type names in generic layout algorithms. Use generic metadata such as `locked`, `state.overflowPriority`, `state.minWidth`, `zone`, registry metadata, or host-provided callbacks.
- Do not hardcode Axis safe-area variables, Axis colors, Axis command names, or Axis text in generic Workbench code.
- Every reusable primitive should have stable semantic classes/data attributes and a small typed API so future apps can compose it without forking.
- Before declaring a milestone complete, run a boundary audit over `src/lib/workbench/` for accidental app-specific imports, strings, CSS variables, and assumptions.

---

## 4. Current repository observations to verify

Claude Code must verify these before implementation because the repository may change.

Expected current state:

- Axis is already SvelteKit/Svelte/Vite based.
- `src/routes/+page.svelte` currently mounts the app shell directly.
- Existing components such as `ToolRail`, `TopBar`, `SignalGrid`, `BlockEditor`, `HistoryPanel`, `PresetBrowser`, `FcEditor`, overlays, dialogs, and status widgets are directly mounted in the route.
- `editor.svelte.ts` is a broad central store containing device, preset, grid, selection, parameters, meters, capabilities, UI state, sync flags, and more.
- `ControlSurface.svelte` already contains concepts similar to the design's widget-grid control surface.
- `surfaceStore.svelte.ts` already implements a useful pattern for config persistence: local cache, one config document, debounced remote writes, remote apply, and revision bump.
- `forgefx.ts` contains the real request layer, including remote transport and request de-duplication/caching behavior.

Implementation must preserve real device behavior. The mock archive demonstrates layout/UX behavior, not replacement business logic.

---

## 5. Repository strategy

### 5.1 Do not start as a separate repository immediately

Build Axis Workbench inside the existing Axis repo first. The API will change frequently while the real Axis app is being migrated. A separate repo at the beginning would add friction.

Recommended initial structure:

```txt
src/lib/workbench/core/
  schema.ts
  ids.ts
  registry.ts
  commands.ts
  reducer.ts
  selectors.ts
  constraints.ts
  drag.ts
  migration.ts
  persistence.ts
  validation.ts

src/lib/workbench/svelte/
  WorkbenchHost.svelte
  WorkbenchFrame.svelte
  DockRegion.svelte
  DockSplit.svelte
  TabStack.svelte
  PanelHost.svelte
  PanelHeader.svelte
  WidgetHost.svelte
  WidgetGroupHost.svelte
  WidgetBar.svelte
  NavigationHost.svelte
  CustomPanel.svelte
  DragLayer.svelte
  ContextMenu.svelte
  OverflowMenu.svelte

src/lib/axis-workbench/
  axisWorkbench.ts
  axisPanels.ts
  axisWidgets.ts
  axisNavigation.ts
  axisBindings.ts
  axisDefaultLayouts.ts
  axisPersistence.ts
  axisTheme.ts
```

Later, after stabilization, extract generic code:

```txt
packages/
  workbench-core/
  workbench-svelte/

src/lib/axis-workbench/
  ... Axis-specific adapter only ...
```

Only after the API is stable should a separate repo/package be considered.

### 5.2 Framework package contract

The extractable framework should feel closer to Bootstrap plus an IDE-layout engine than a one-off Axis shell. Future apps should be able to install/register:

```ts
createWorkbenchController(document, options)
createWorkbenchRenderRegistry()
registry.registerPanel({ type, component, title, ... })
registry.registerWidget({ type, component, supportedSizes, ... })
registry.registerNavigation({ id, component, ... })
<WorkbenchHost controller={controller} registry={registry} />
```

Required reusable framework surfaces:

- Dock regions, split panes, tab stacks, collapse/restore, resize handles.
- Widget zones, widget groups, overflow handling, default/compact/mini sizing.
- Drag/drop interpretation and visual previews.
- Edit mode, library drawers, context menus, command surfaces, and modal/menu primitives.
- Generic persistence and migration interfaces, with app-specific storage adapters.
- Generic auth/account/navigation slots, but no built-in Axis login/cloud behavior.
- CSS token contract under `--aw-*`, semantic classes under `.aw-*`, and state/data attributes under `data-aw-*`.
- Optional host-app theme mapping, for example Axis mapping `--axis-safe-top` to `--aw-safe-top`.

Extraction readiness checklist:

- No imports from `src/lib/axis-workbench/`, `editor.svelte.ts`, `forgefx.ts`, `history.svelte.ts`, `SignalGrid.svelte`, `BlockEditor.svelte`, `PresetBrowser.svelte`, cloud modules, or device modules inside `src/lib/workbench/`.
- No Axis-specific widget/panel/navigation type names inside generic algorithms.
- No Axis-specific CSS variables used directly inside generic Workbench components.
- No live app values persisted into `WorkbenchDocument`; only serializable layout state and binding references.
- Tests cover public exports, command dispatch, missing registry fallback, persistence adapters, drag interpretation, widget sizing, locked navigation, and boundary-sensitive behavior.

### 5.3 Naming

Use these conceptual names:

```txt
Workbench Core       generic, no Svelte, no Axis
Workbench Svelte     generic renderer
Axis Workbench       Axis-specific adapter and default theme
```

It is acceptable for the product name to be Axis Workbench, but the generic core should not depend on Axis.

---

## 6. Architecture layers

### 6.1 Workbench Core

The Workbench Core is pure TypeScript. It owns:

- serializable schemas
- IDs
- layout tree
- registries
- command definitions
- reducer
- constraints
- selectors
- drag/drop interpretation
- persistence interfaces
- migration
- validation

The core must not import:

```txt
Svelte components
editor.svelte.ts
forgefx.ts
SignalGrid.svelte
BlockEditor.svelte
Axis-specific type definitions
Fractal/FM3/preset/scene/parameter concepts
```

The core may define generic binding references, but it must not know how Axis resolves them.

### 6.2 Workbench Svelte Renderer

The renderer owns:

- rendering dock regions
- rendering split nodes
- rendering tab stacks
- rendering panels by registry definition
- rendering widget bars
- rendering widget groups
- rendering custom panels
- rendering navigation entries
- pointer/keyboard interaction wiring
- drag previews
- context menus
- overflow menus
- accessibility/focus behavior
- theme CSS variables and semantic classes

The renderer should receive a `WorkbenchController` or store from the core and registry definitions from the app.

### 6.3 Axis Adapter

The Axis adapter registers Axis-specific pieces:

- Signal Grid panel
- Block Editor panel
- History panel
- Preset Browser panel and parts
- FC panel and parts
- Signal Chain panel
- Custom Panel definition
- Axis widgets: preset, scenes, view, add, tuner, BPM, CPU, save, search, history, grid mode, block size, FC device/layout/switch, account/cloud, pinned parameter
- Axis navigation entries
- Axis parameter binding resolver
- Axis persistence adapter using `forgefx.getDoc` / `forgefx.putDoc` and localStorage cache
- Axis theme tokens

Axis components may read `editor`, `history`, `forgefx`, etc. The generic Workbench must not.

---

## 7. Product feature specification

### 7.1 Dock regions

The Workbench has five regions:

```txt
left
right
top
bottom
main
```

Region behavior:

- Left and right docks stack/split vertically.
- Top and bottom docks split horizontally.
- Main can split both ways, but the design currently has a main-axis toggle.
- Each region can contain multiple slots.
- Each slot can contain one or more tabbed panels.
- Panels dropped onto the tab/header area of a panel become tabs in that slot.
- Panels dropped between slots create new slots.
- Docks and slots are resizable.
- Whole side regions can collapse into strips.
- Individual panels can collapse.
- Empty regions/bars hide outside Edit Layout mode.
- Nothing should overlap except modals, popups, menus, tooltips, drag previews, and flyouts.

### 7.2 Dock invariants

The layout engine must enforce:

```txt
1. No panel overlap.
2. No child panel may push its assigned slot larger than the computed rectangle.
3. Pane sizing is based on the actual pane rectangle, not global viewport assumptions.
4. Resize operations clamp to minimum viable sizes.
5. Collapsed regions and collapsed panels preserve enough affordance to restore them.
6. Per-slot tabs are not region-wide tabs.
7. Layout is serializable.
8. Layout can migrate across schema versions.
```

### 7.3 Edit Layout mode

The global Edit Layout mode unlocks:

- panel drag handles
- panel close/rename/collapse controls
- dock drop zones
- widget drag overlays
- widget size controls
- widget hide controls
- navigation drag/hide controls
- custom panel editing
- widget library
- panel library
- layout presets/options

Outside Edit Layout mode:

- empty bars/zones hide
- drag handles hide
- configuration controls hide
- UI behaves as a normal device editor

### 7.4 Panel behavior

Panel instances are registered by type and stored by ID.

Panels support:

- title
- type
- instance state
- allowed regions
- singleton/multiple behavior
- closable flag
- renameable flag
- collapsible flag
- min size
- default placement
- optional parts/subpanels

Examples:

```txt
axis.signalGrid
axis.blockEditor
axis.history
axis.signalChain
axis.presetBrowser.full
axis.presetBrowser.sources
axis.presetBrowser.list
axis.presetBrowser.detail
axis.fc.full
axis.fc.board
axis.fc.inspector
axis.fc.layouts
axis.fc.led
axis.fc.tap
axis.fc.hold
workbench.customPanel
```

### 7.5 Custom Panels

Custom Panels are first-class panels that can contain:

- widgets
- widget groups
- pinned parameter widgets
- possibly layout fragments in the future

A Custom Panel should have its own internal layout mode. The design uses simple wrapping/placement in shell custom panels and a richer grid in the control surface. Production should choose a typed internal model, preferably a grid model:

```txt
cols
rowHeight
gap
items: widget or group references with x/y/w/h
```

Required Custom Panel features:

- Create new custom panel from Edit Layout.
- Auto-create custom panel by edge-dropping a widget/param into an empty region edge.
- Rename custom panel.
- Delete custom panel. Its widgets must not be lost; move them to hidden/library.
- Save custom panel to Panel Library.
- Load saved panel from Panel Library.
- Support grouped widgets inside custom panels.
- Support pinned parameters inside custom panels.

### 7.6 Widget zones

Support these placement zones conceptually:

```txt
top.left
top.center
top.right
bottom
rail
gridbar
float
hidden
overflow
customPanel:<panelId>
panel:<panelId>       legacy/design alias; production should prefer customPanel:<panelId>
```

The design uses `tl`, `tc`, `tr`, `bottom`, `rail`, `gridbar`, `float`, `hidden`, and `panel:<id>`. The production schema should use clear names, with a migration/adapter from design names if needed.

### 7.7 Widget behavior

Widgets must support:

- `default`, `compact`, `mini` size states.
- Auto-fit by zone width.
- Optional user maximum size state.
- Drag between zones.
- Hide to library.
- Move to floating position.
- Move into Custom Panels.
- Move into top/bottom widget bars.
- Group by dropping onto another widget.
- Reorder inside groups.
- Ungroup.
- Save group to library.
- Load group from library.
- Context menu operations for mouse and keyboard accessibility.

Built-in Axis widgets to register initially:

```txt
axis.logo
axis.preset
axis.scenes
axis.viewMode
axis.addBlock
axis.tuner
axis.tempo
axis.cpu
axis.save
axis.search
axis.history
axis.gridMap
axis.undoRedo
axis.connection
axis.accountOrCloud
axis.gridMode
axis.blockSize
axis.fcDevice
axis.fcLayouts
axis.fcSwitchView
axis.paramControl
```

### 7.8 Widget grouping

Widget grouping is not a visual-only feature. It must be represented in the layout schema.

Behavior:

- Drag one widget onto another single widget -> create a group.
- Drag widget into existing group -> insert at computed index.
- Drag group grip -> move entire group.
- Drag member -> reorder or remove from group.
- Group renders as one fluent module with dividers.
- Groups can be saved and loaded from library.
- Groups can be hidden, ungrouped, or moved.

### 7.9 Navigation behavior

Navigation entries are customizable but not identical to normal widgets.

Support:

- reorder in rail/bottom/drawer modes
- hide if `hideable: true`
- move to top/bottom widget bars if `movableToBars: true`
- render compact/mini if used as a widget
- route/activate app section or open/toggle panel
- locked/fixed entries that cannot be hidden or moved
- required fixed placement for selected entries such as Axis Cloud

Recommended definition:

```ts
type NavigationDefinition = {
  id: string;
  label: string;
  glyph?: string;
  action: WorkbenchActionRef;
  hideable: boolean;
  reorderable: boolean;
  movableToBars: boolean;
  lockedPlacement?: {
    area: 'rail.top' | 'rail.bottom' | 'bottom.left' | 'bottom.right' | 'top.left' | 'top.right';
  };
  widgetType?: string;
};
```

Axis-specific examples:

```txt
Grid
Ctrl / Controllers
FC
Scenes
Live
Sets
Setup
Axis Cloud / Account (fixed lower-left or rail footer)
```

Important: navigation entries must not be dead no-ops. If a feature area is not implemented, opening the nav entry should show a meaningful stub panel or placeholder panel that explains the status.

### 7.10 Parameters

Parameters are not just widgets. Parameters are domain bindings that can be rendered by widgets.

Examples:

```txt
Gain
Master
Bass
Mid
Treble
Presence
Bypass
Mix
Level
Channel
```

A parameter drag source creates an `axis.paramControl` widget with an Axis parameter binding.

Required binding semantics:

```txt
selectedBlock
specificEffectId
specificGridCell
specificBlockFamily
virtualEffect
```

Start with the minimum needed for current UX:

```txt
selectedBlock
specificEffectId
specificGridCell
```

Never store live parameter values inside the Workbench layout by default. Store the binding and visual settings. The value comes from Axis device/preset state.

### 7.11 Panel Library and Layout Library

Panel Library saves reusable fragments:

- single custom panel
- grouped panel fragment
- widget group
- future: larger dock fragments

Layout Library saves full Workbench arrangements:

- full dock layout
- panels
- widget bars
- navigation placement
- custom panels
- pinned parameter bindings
- panel states
- active profile metadata

It should not save current live device parameter values unless a later explicit snapshot feature is designed.

### 7.12 Profiles and presets

The design has layout presets such as:

```txt
default
stage
studio
compact
tablet
```

Production should model:

- layout presets shipped by Axis
- user layouts
- profile-specific active layouts
- device/profile-specific persistence

Possible profile keys:

```txt
desktop
tablet
mobile
stage
studio
compact
```

Do not assume viewport width alone equals profile. A user may want a stage layout on a desktop display.

### 7.13 Mobile and tablet

Mobile/tablet behavior is not optional.

Required concepts:

- bottom navigation mode
- hamburger/drawer behavior when appropriate
- bottom-sheet behavior for panels/flyouts where appropriate
- widget auto-fit
- touch-friendly hit areas
- scroll-safe grid behavior
- no horizontal overflow in normal operation
- Custom Panel editing must be possible on touch, even if less dense
- Drag/drop must have reasonable touch behavior or context-menu/tap alternatives

---

## 8. Styling and theming strategy

### 8.1 Goal

Axis Workbench should be reusable like a small framework. Axis should provide a strong default visual language, but other apps should not be forced to look like Axis.

The generic Workbench renderer should expose:

- semantic CSS custom properties
- semantic class names
- component parts/slots
- data attributes for state
- optional default CSS
- app-provided theme object

### 8.2 Do not hardcode Axis colors in generic core

The design language uses Axis colors such as:

```txt
--bg: #0c0c0e
--bg2: #0e0e10
--surface: #141417
--surface2: #1c1c21
--accent: #35c9d6
--amber: #f5a623
```

These belong in the Axis theme, not in `workbench-core`.

The generic renderer can use tokens such as:

```css
:root {
  --aw-bg: var(--bg, #0c0c0e);
  --aw-surface: var(--surface, #141417);
  --aw-surface-2: var(--surface2, #1c1c21);
  --aw-border: var(--border, #26262c);
  --aw-text: var(--text, #e9e9ee);
  --aw-text-muted: var(--textdim, #9a9aa3);
  --aw-accent: var(--accent, #35c9d6);
  --aw-warning: var(--amber, #f5a623);
}
```

But prefer a clean Workbench token namespace and let Axis map its existing theme to it.

### 8.3 Component classes and parts

Expose stable classes:

```txt
.aw-root
.aw-frame
.aw-region
.aw-region-left
.aw-region-right
.aw-region-top
.aw-region-bottom
.aw-region-main
.aw-panel
.aw-panel-header
.aw-panel-tabs
.aw-panel-tab
.aw-widget
.aw-widget-group
.aw-widget-bar
.aw-nav
.aw-nav-item
.aw-custom-panel
.aw-drag-layer
.aw-drop-preview
.aw-context-menu
.aw-overflow-menu
```

Expose state attributes:

```txt
data-aw-editing
data-aw-active
data-aw-collapsed
data-aw-dragging
data-aw-drop-target
data-aw-size="default|compact|mini"
data-aw-zone="top.left|top.center|..."
data-aw-kind="panel|widget|nav|param"
```

This gives future apps styling hooks without changing TypeScript.

### 8.4 Styling API

Provide a Workbench theme interface:

```ts
type WorkbenchTheme = {
  name: string;
  className?: string;
  vars?: Record<string, string>;
  density?: 'comfortable' | 'compact' | 'dense';
  radius?: 'sharp' | 'soft' | 'round';
};
```

Axis theme is one implementation:

```ts
export const axisWorkbenchTheme: WorkbenchTheme = {
  name: 'Axis Dark',
  className: 'axis-workbench-theme',
  vars: {
    '--aw-bg': '#0c0c0e',
    '--aw-surface': '#141417',
    '--aw-accent': '#35c9d6'
  }
};
```

### 8.5 Bootstrap-like extensibility

The user goal is framework-like ease. That means:

- New panels/widgets should be registerable with short definitions.
- Common layout primitives should have defaults.
- Styling should be token-based.
- Component anatomy should be stable.
- Apps should be able to override styles without forking components.
- Axis-specific design should be a theme/package on top, not baked into the core.

---

## 9. Core data model

The persisted model must be JSON-serializable.

### 9.1 Layout document

```ts
type WorkbenchDocument = {
  schemaVersion: number;
  activeProfileId: string;
  profiles: Record<string, WorkbenchProfile>;
  layouts: Record<string, WorkbenchLayout>;
  libraries: WorkbenchLibraries;
  meta: {
    appId: string;
    createdAt: string;
    updatedAt: string;
  };
};
```

### 9.2 Profile

```ts
type WorkbenchProfile = {
  id: string;
  label: string;
  activeLayoutId: string;
  deviceProfile?: string;
  viewportClass?: 'desktop' | 'tablet' | 'mobile';
};
```

### 9.3 Layout

```ts
type WorkbenchLayout = {
  id: string;
  name: string;
  schemaVersion: number;

  dock: {
    regions: Record<DockRegionId, DockRegionState>;
    sizes: Partial<Record<DockRegionId, number>>;
    collapsed: Partial<Record<DockRegionId, boolean>>;
    mainAxis: 'row' | 'column';
  };

  bars: {
    topLeft: WidgetNode[];
    topCenter: WidgetNode[];
    topRight: WidgetNode[];
    bottom: WidgetNode[];
    rail: WidgetNode[];
    gridbar: WidgetNode[];
    floating: FloatingWidgetNode[];
    hidden: WidgetNode[];
  };

  navigation: NavigationLayout;

  panels: Record<string, PanelInstance>;
  widgets: Record<string, WidgetInstance>;
  customPanels: Record<string, CustomPanelState>;

  meta: {
    createdAt: string;
    updatedAt: string;
    sourcePreset?: string;
  };
};
```

### 9.4 Dock tree

```ts
type DockRegionId = 'left' | 'right' | 'top' | 'bottom' | 'main';

type DockRegionState = {
  root: DockNode | null;
};

type DockNode = SplitNode | TabStackNode;

type SplitNode = {
  kind: 'split';
  id: string;
  direction: 'row' | 'column';
  sizes: number[];
  children: DockNode[];
};

type TabStackNode = {
  kind: 'tabs';
  id: string;
  activePanelId: string;
  panelIds: string[];
  collapsed?: boolean;
};
```

Note: even a single panel should live in a `TabStackNode` with one panel ID. This keeps tab behavior simple.

### 9.5 Panel instance

```ts
type PanelInstance<TState = unknown> = {
  id: string;
  type: string;
  title?: string;
  state: TState;
};
```

### 9.6 Widget instance

```ts
type WidgetSize = 'default' | 'compact' | 'mini';

type WidgetInstance<TSettings = unknown> = {
  id: string;
  type: string;
  size: WidgetSize;
  maxSize?: WidgetSize;
  settings: TSettings;
  binding?: BindingRef;
};
```

### 9.7 Widget nodes and groups

```ts
type WidgetNode = WidgetRefNode | WidgetGroupNode;

type WidgetRefNode = {
  kind: 'widget';
  widgetId: string;
};

type WidgetGroupNode = {
  kind: 'group';
  id: string;
  style: 'fluent';
  direction: 'row' | 'column';
  children: WidgetRefNode[];
};

type FloatingWidgetNode = WidgetNode & {
  x: number;
  y: number;
};
```

### 9.8 Custom panel state

```ts
type CustomPanelState = {
  name: string;
  layout: {
    kind: 'grid';
    cols: number;
    rowHeight: number;
    gap: number;
  };
  items: CustomPanelItem[];
};

type CustomPanelItem = {
  id: string;
  node: WidgetNode;
  x: number;
  y: number;
  w: number;
  h: number;
};
```

### 9.9 Navigation layout

```ts
type NavigationLayout = {
  mode: 'side' | 'bottom' | 'drawer' | 'hidden';
  order: string[];
  hidden: Record<string, boolean>;
  placements: Record<string, NavigationPlacement>;
};

type NavigationPlacement =
  | { kind: 'nav'; area: 'rail' | 'bottom' | 'drawer' }
  | { kind: 'widgetBar'; bar: 'topLeft' | 'topCenter' | 'topRight' | 'bottom' }
  | { kind: 'locked'; area: string };
```

### 9.10 Bindings

```ts
type BindingRef = AxisParamBinding | AxisDeviceBinding | WorkbenchActionBinding;

type AxisParamBinding = {
  kind: 'axis.param';
  blockRef:
    | { mode: 'selectedBlock' }
    | { mode: 'effectId'; effectId: number }
    | { mode: 'gridCell'; row: number; col: number }
    | { mode: 'virtualEffect'; slug: string; eid: number };
  paramId: number;
};

type AxisDeviceBinding = {
  kind: 'axis.device';
  key: 'bpm' | 'scene' | 'preset' | 'cpu' | 'tuner' | 'connection';
};

type WorkbenchActionBinding = {
  kind: 'workbench.action';
  actionId: string;
  args?: Record<string, unknown>;
};
```

---

## 10. Registries

### 10.1 Panel definition

```ts
type PanelDefinition<TState = unknown> = {
  type: string;
  title: string;
  component: unknown;
  defaultState: () => TState;
  stateSchema?: unknown;
  singleton?: boolean;
  closable?: boolean;
  renameable?: boolean;
  allowedRegions?: DockRegionId[];
  defaultPlacement?: {
    region: DockRegionId;
    mode: 'tab' | 'split';
  };
  minSize?: { width?: number; height?: number };
  parts?: PanelPartDefinition[];
};
```

### 10.2 Widget definition

```ts
type WidgetDefinition<TSettings = unknown> = {
  type: string;
  title: string;
  component: unknown;
  defaultSettings: () => TSettings;
  settingsSchema?: unknown;
  supportedSizes: WidgetSize[];
  defaultSize: WidgetSize;
  allowedTargets: WidgetTarget[];
  estimateWidth?: (size: WidgetSize, settings: TSettings) => number;
  minSize?: Partial<Record<WidgetSize, { width: number; height: number }>>;
};

type WidgetTarget =
  | 'topBar'
  | 'bottomBar'
  | 'rail'
  | 'gridbar'
  | 'customPanel'
  | 'floating'
  | 'hidden';
```

### 10.3 Navigation definition

Use the definition from section 7.9. Navigation should be in a registry so the app can add/remove entries without editing the renderer.

### 10.4 Binding resolver registry

Bindings must resolve through app adapters.

```ts
type BindingResolver<TValue = unknown> = {
  kind: string;
  read: (binding: BindingRef) => TValue;
  write?: (binding: BindingRef, next: TValue) => void | Promise<void>;
  subscribe?: (binding: BindingRef, cb: () => void) => () => void;
};
```

The generic Workbench can pass bindings to widgets. The Axis adapter resolves them.

---

## 11. Command and reducer architecture

All layout mutations must go through commands. Components must not directly mutate layout objects.

### 11.1 Command examples

```ts
type WorkbenchCommand =
  | { type: 'ADD_PANEL'; panelType: string; target: DropTarget }
  | { type: 'MOVE_PANEL'; panelId: string; target: DropTarget }
  | { type: 'CLOSE_PANEL'; panelId: string }
  | { type: 'RENAME_PANEL'; panelId: string; title: string }
  | { type: 'TAB_PANEL'; panelId: string; tabStackId: string; index?: number }
  | { type: 'SPLIT_WITH_PANEL'; panelId: string; targetNodeId: string; edge: Edge }
  | { type: 'RESIZE_REGION'; region: DockRegionId; size: number }
  | { type: 'RESIZE_SPLIT'; splitNodeId: string; sizes: number[] }
  | { type: 'COLLAPSE_REGION'; region: DockRegionId; collapsed: boolean }
  | { type: 'COLLAPSE_PANEL'; panelId: string; collapsed: boolean }
  | { type: 'ADD_WIDGET'; widgetType: string; target: DropTarget; settings?: unknown; binding?: BindingRef }
  | { type: 'MOVE_WIDGET'; widgetId: string; target: DropTarget }
  | { type: 'HIDE_WIDGET'; widgetId: string }
  | { type: 'SET_WIDGET_SIZE'; widgetId: string; size: WidgetSize }
  | { type: 'GROUP_WIDGETS'; sourceWidgetIds: string[]; targetWidgetId: string; index?: number }
  | { type: 'UNGROUP_WIDGETS'; groupId: string }
  | { type: 'MOVE_NAV'; navId: string; target: NavigationPlacement; index?: number }
  | { type: 'HIDE_NAV'; navId: string }
  | { type: 'SHOW_NAV'; navId: string }
  | { type: 'SAVE_LAYOUT'; layoutId?: string; name?: string }
  | { type: 'APPLY_LAYOUT'; layoutId: string }
  | { type: 'SAVE_PANEL_TEMPLATE'; panelId: string; name: string }
  | { type: 'SAVE_GROUP_TEMPLATE'; groupId: string; name: string };
```

### 11.2 Drag payloads

```ts
type DragPayload =
  | { kind: 'panelInstance'; panelId: string }
  | { kind: 'panelDefinition'; panelType: string }
  | { kind: 'widgetInstance'; widgetId: string }
  | { kind: 'widgetDefinition'; widgetType: string }
  | { kind: 'widgetGroup'; groupId: string }
  | { kind: 'navigation'; navId: string }
  | { kind: 'param'; binding: AxisParamBinding; suggestedLabel?: string };
```

### 11.3 Drop targets

```ts
type DropTarget =
  | { kind: 'dockRegion'; region: DockRegionId }
  | { kind: 'tabStack'; tabStackId: string; index?: number }
  | { kind: 'splitEdge'; nodeId: string; edge: 'top' | 'right' | 'bottom' | 'left' }
  | { kind: 'widgetBar'; zone: WidgetBarZone; index: number }
  | { kind: 'widgetGroup'; groupId: string; index: number }
  | { kind: 'customPanelGrid'; panelId: string; x: number; y: number; w: number; h: number }
  | { kind: 'floating'; x: number; y: number }
  | { kind: 'hidden' };
```

### 11.4 Reducer invariants

The reducer must guarantee:

- No panel is present in more than one dock location.
- No widget is present in more than one zone/group/custom panel at the same time.
- Locked navigation entries cannot be hidden or moved away from locked placement.
- Singleton panels are not duplicated.
- Missing definitions render fallback panels/widgets instead of crashing.
- Closing a custom panel moves its widgets to hidden/library instead of losing them.
- Tab stacks cannot contain unknown panel IDs.
- Split sizes normalize to valid ratios.
- Empty split nodes are removed.
- Empty tab stacks are removed.

---

## 12. Persistence and migration

### 12.1 Use the existing config-doc pattern

Axis already has a good pattern in `surfaceStore.svelte.ts`:

- synchronous localStorage cache
- unified config document
- debounced remote writes
- remote apply without write loop
- revision bump for open UI reload

Reuse this pattern for Workbench.

Start with one document:

```txt
config/workbench
localStorage key: axs.workbench.doc
```

Later split if needed:

```txt
config/workbench.index
config/workbench.layout.<layoutId>
config/workbench.template.<templateId>
```

### 12.2 Layout persistence content

Persist:

- layout schema version
- profiles
- active profile
- active layout
- dock tree
- region sizes
- collapsed states
- panel instances and state
- widget instances and settings
- widget groups
- custom panels
- navigation order/visibility/placement
- pinned parameter bindings
- libraries/templates

Do not persist live values by default:

- current Gain value
- current Master value
- current scene value as a sound-setting snapshot
- current meter values
- transient tuner state

### 12.3 Migration

Every persisted document needs `schemaVersion`.

Create:

```txt
migration.ts
  migrateWorkbenchDocument(input: unknown): WorkbenchDocument
```

Migrations should:

- validate known fields
- fill missing defaults
- preserve unknown app-specific widget/panel state if safe
- move invalid widget/panel references to a recoverable fallback
- never destroy user layouts silently

### 12.4 Import/export

Eventually support:

- export current layout as JSON
- import layout JSON
- export panel template
- import panel template

Import must validate schema and remap IDs to avoid collisions.

---

## 13. Migration from design prototypes to production Svelte

### 13.1 Do not port mock state directly

The design files contain mock state and mock data. Production should keep the visual/interaction behavior but connect to real Axis sources.

Examples:

```txt
Mock preset number -> editor.preset
Mock scene -> editor.scene
Mock BPM -> editor.bpm
Mock CPU -> editor.cpu
Mock block params -> editor.params/editor.enums/forgefx.setParam
Mock FC bus -> typed FC store/controller
Mock preset browser state -> current library/cloud/preset stores
```

### 13.2 Replace window-global buses

Design uses patterns such as:

```txt
window.__PBBus
window.__FCBus
```

Production replacement:

```txt
shared typed Svelte store or controller per logical panel family
```

Example:

```ts
const presetBrowserController = createPanelFamilyController('axis.presetBrowser');
const fcController = createPanelFamilyController('axis.fc');
```

Each split part subscribes to the same controller state.

### 13.3 Preserve default full panels and split parts

Preset Browser and FC have two modes:

```txt
Full default panel
Split subpanel parts
```

Production should register both. Do not force the user to rebuild these screens manually.

### 13.4 Pane-relative sizing

Any panel that measures itself must measure its own pane/container, not the full app viewport.

Critical for:

- Signal Grid
- Control Surface
- Custom Panel grid
- Preset Browser list/detail
- FC board

### 13.5 Avoid local storage inside widgets

Individual widgets/panels should not write arbitrary localStorage keys. They should receive and update state through the Workbench persistence layer or Axis-specific stores.

---

## 14. Axis integration mapping

### 14.1 Initial panel registrations

Start by wrapping existing components.

```ts
registerPanel({
  type: 'axis.signalGrid',
  title: 'Signal Grid',
  component: SignalGridPanelAdapter,
  singleton: true,
  allowedRegions: ['main'],
  defaultPlacement: { region: 'main', mode: 'tab' },
  defaultState: () => ({ gridMode: 'auto' })
});
```

```ts
registerPanel({
  type: 'axis.blockEditor',
  title: 'Editor',
  component: BlockEditorPanelAdapter,
  singleton: true,
  allowedRegions: ['left', 'right', 'bottom', 'main'],
  defaultPlacement: { region: 'bottom', mode: 'tab' },
  defaultState: () => ({})
});
```

```ts
registerPanel({
  type: 'axis.history',
  title: 'History',
  component: HistoryPanelAdapter,
  singleton: true,
  allowedRegions: ['left', 'right', 'main'],
  defaultPlacement: { region: 'right', mode: 'tab' },
  defaultState: () => ({})
});
```

Add further panels for Preset Browser parts and FC parts once the base renderer works.

### 14.2 Initial widget registrations

Start with widgets that already exist conceptually in `TopBar`, `ToolRail`, `StatusBar`, or the design archive:

```txt
axis.preset
axis.scenes
axis.viewMode
axis.addBlock
axis.tuner
axis.tempo
axis.cpu
axis.save
axis.search
axis.history
axis.accountCloud
axis.gridMode
axis.blockSize
axis.paramControl
```

### 14.3 Initial navigation registrations

```txt
grid
controllers
fc
scenes
live
sets
setup
axisCloud/account
```

Axis Cloud/account should be fixed or locked in the designated lower-left/rail-footer area unless the user later changes this requirement.

### 14.4 Parameter binding resolver

The `axis.param` binding resolver should:

- find the target block by selected block, effect ID, grid cell, or virtual effect
- read current param value from `editor.params`, `editor.enums`, meters, or relevant cache
- write through existing `forgefx.setParam` / editor action methods
- optimistically update UI where existing Axis behavior does this
- debounce writes where appropriate
- reconcile with readback later

Do not create a separate parameter write path that bypasses existing device-safety behavior.

---

## 15. Implementation phases

### Phase 0 - verification and design-reference setup

Goal: make sure Claude Code understands both current code and design target.

Tasks:

1. Inspect current repository.
2. Inspect design archive files if available.
3. Add a short `docs/workbench/` area if useful.
4. Copy or reference design archive files under `docs/design-reference/` only if the user wants them committed.
5. Document current hardcoded shell structure.
6. Document current state owners: `editor`, `history`, `surfaceStore`, etc.
7. Run `npm run check` and `npm test` if possible.

Acceptance:

- No behavior change.
- Clear notes on current shell and design target.

### Phase 1 - Workbench Core schema and reducer

Goal: implement pure TypeScript model before UI.

Tasks:

- Create schemas.
- Create ID utilities.
- Create registries.
- Create command definitions.
- Create reducer.
- Create selectors.
- Create constraints.
- Create migration skeleton.
- Add unit tests for reducer behavior.

Acceptance:

- Can create default layout in tests.
- Can add/move/tab/split panels in tests.
- Can move/group/hide widgets in tests.
- Can move/hide navigation entries in tests while respecting locked entries.
- No Svelte components needed yet.

### Phase 2 - Workbench Svelte renderer skeleton

Goal: render a static default Workbench layout with registered panel placeholders.

Tasks:

- Create `WorkbenchHost.svelte`.
- Create region renderer.
- Create split renderer.
- Create tab stack renderer.
- Create panel host.
- Render placeholder panels from registry.
- Add basic CSS token layer.
- Add Axis default theme mapping.

Acceptance:

- Static layout renders with five regions.
- Panels are constrained to their computed rectangles.
- Empty regions hide outside edit mode.
- No overlap.

### Phase 3 - migrate current Axis shell into Workbench

Goal: replace direct shell mounting with Workbench hosting existing components.

Tasks:

- Register Signal Grid, Block Editor, History, Preset Browser, FC/Signal Chain as panels.
- Create a default layout approximating current Axis shell.
- Replace direct mounting in `+page.svelte` with `WorkbenchHost` in a controlled branch/feature path.
- Keep overlays/dialogs working.
- Keep keyboard shortcuts working.
- Keep mobile gates and remote/direct boot behavior working.

Acceptance:

- Axis still starts.
- Device initialization still works.
- Signal Grid and Block Editor still work.
- History and existing overlays still work.
- No Workbench code imports Axis concepts except Axis adapter.

### Phase 4 - panel docking, tabs, splits, collapse, resize

Goal: implement designed panel layout behavior.

Tasks:

- Drag panel header.
- Drop into regions.
- Drop onto panel header/tab strip to tab into that slot.
- Drop between slots to split.
- Resize regions.
- Resize slots.
- Collapse regions.
- Collapse panels.
- Context menu for panel move/dock/close/rename.
- Keyboard/context-menu alternatives for drag-only actions.

Acceptance:

- Left/right stack vertically.
- Top/bottom split horizontally.
- Main follows main-axis behavior and can support both axes.
- Per-slot tabs work.
- Region collapse strips work.
- No overlap.

### Phase 5 - widgets, widget bars, navigation customization

Goal: implement the top/bottom/rail widget system and navigation customization.

Tasks:

- Register initial Axis widgets.
- Implement WidgetHost with size states.
- Implement WidgetBar zones.
- Implement auto-fit default -> compact -> mini.
- Implement overflow menu for top bar if even mini cannot fit.
- Implement drag between widget zones.
- Implement hide/show widget library behavior.
- Implement navigation reorder/hide/move-to-bar.
- Implement locked Axis Cloud/account placement.

Acceptance:

- Top-left/top-center/top-right zones work.
- Bottom bar works.
- Rail widgets work.
- Widgets can be hidden and restored.
- Navigation can be reordered and hidden when allowed.
- Locked entries cannot be hidden/moved incorrectly.
- No horizontal overflow in normal layouts.

### Phase 6 - widget grouping

Goal: implement fluent widget groups.

Tasks:

- Model WidgetGroupNode.
- Drag widget onto widget -> create group.
- Drag widget into group -> insert at index.
- Drag member out of group.
- Drag group grip -> move group.
- Ungroup.
- Hide group.
- Save group to library.
- Load group from library.

Acceptance:

- Group behavior matches design archive intent.
- Groups work in top bar, bottom bar, rail, floating, and custom panels where allowed.

### Phase 7 - Custom Panels and parameter widgets

Goal: implement the power-user composition surface.

Tasks:

- Register `workbench.customPanel`.
- Implement internal custom panel grid/layout.
- Allow widget drops into custom panels.
- Allow parameter drops into custom panels.
- Implement parameter drag sources from Block Editor/Control Surface.
- Implement pinned parameter widget binding.
- Support custom panel rename/delete/save/load.
- Support edge-drop creating a custom panel.

Acceptance:

- User can drag a parameter from a block editor and drop it into top bar, bottom bar, floating area, or custom panel.
- The parameter widget reads/writes real Axis parameter values.
- Layout stores binding, not live value.
- Custom panel templates can be saved/loaded.

### Phase 8 - split default panels

Goal: implement design-supported split parts for Preset Browser and FC.

Tasks:

- Register Preset Browser full/sources/list/detail parts.
- Replace `window.__PBBus` concept with typed controller/store.
- Register FC full/board/inspector/layouts/led/tap/hold parts.
- Replace `window.__FCBus` concept with typed controller/store.
- Ensure split parts stay synchronized.
- Ensure overlays render from the correct owner/root.

Acceptance:

- Preset Browser can be used as full panel or split sources/list/detail panels.
- FC can be used as full panel or split board/inspector/layouts/action panels.
- State stays synchronized across split parts.

### Phase 9 - persistence, libraries, import/export

Goal: persist complete Workbench state.

Tasks:

- Implement `workbenchStore.svelte.ts` or equivalent.
- Use local cache plus config doc.
- Implement debounced writes.
- Implement remote apply/revision bump.
- Persist layout library.
- Persist panel library.
- Persist group library.
- Add import/export.
- Add migration tests.

Acceptance:

- Full layout survives reload.
- Layout is synced through Axis config store where appropriate.
- Remote UI receives layout changes without write loops.
- Invalid/missing definitions recover gracefully.

### Phase 10 - extraction readiness

Goal: prepare generic code for reuse.

Tasks:

- Audit imports to ensure core has no Axis imports.
- Audit renderer to ensure it depends only on Svelte and Workbench Core.
- Move generic code under `packages/` if appropriate.
- Document public APIs.
- Add examples.
- Keep Axis adapter in Axis-specific path.

Acceptance:

- It is possible to imagine publishing/extracting `workbench-core` and `workbench-svelte` without Axis.
- New panels/widgets can be added with low boilerplate.

---

## 16. Testing strategy

### 16.1 Unit tests

Test core reducer and selectors without browser/Svelte.

Required test cases:

```txt
create default layout
add panel to empty region
move panel from main to right
split panel into region slot
tab panel into existing tab stack
close panel
collapse region
collapse panel
resize split and normalize sizes
add widget to top bar
move widget to bottom bar
hide widget
create widget group
insert widget into group
remove widget from group
move group
save/load group template
create custom panel
edge-drop creates custom panel
add param widget with binding
move nav entry
hide nav entry
reject hiding locked nav entry
migrate old schema
recover unknown panel/widget definitions
```

### 16.2 Component tests

Test renderer behavior where practical:

- regions render correctly
- tab selection works
- widget size state applied
- edit mode controls hide/show
- context menu actions dispatch commands

### 16.3 Manual/visual regression checks

Compare against design archive behavior:

- desktop default layout
- studio layout
- stage layout
- compact layout
- tablet layout
- top bar auto-fit
- widget grouping
- panel docking
- tab drop
- custom panel creation
- preset browser split
- FC split
- mobile nav drawer/bottom nav

### 16.4 Performance checks

Measure:

- no excessive re-render during drag
- no repeated expensive layout measurement loops
- panels that are hidden/offscreen should suspend expensive measurements where possible
- Signal Grid measures pane size, not viewport
- parameter widgets avoid rendering hundreds of controls unnecessarily

---

## 17. Accessibility requirements

Do not postpone all accessibility work until the end. The design currently uses many div-like controls. Production should add:

- keyboard focus styles
- `role="button"` and Enter/Space behavior where actual buttons are not used
- prefer real `<button>` elements when possible
- `role="tablist"` / `role="tab"` for tab stacks
- `aria-selected` for tabs
- `aria-pressed` for toggles
- `aria-label` for icon-only controls
- Escape handling for menus/flyouts/context menus/edit mode
- focus trap in modal/flyout contexts
- context-menu alternatives for drag-only operations
- reduced-motion CSS fallbacks
- larger touch hit targets without changing visual size

This matters because a customization system cannot rely only on pointer drag/drop.

---

## 18. Developer API goal

After the framework exists, adding a panel should be small.

### 18.1 Panel example

```ts
import SignalChainPanel from './SignalChainPanel.svelte';
import { definePanel } from '$lib/workbench/core';

export const signalChainPanel = definePanel({
  type: 'axis.signalChain',
  title: 'Signal Chain',
  component: SignalChainPanel,
  singleton: true,
  allowedRegions: ['left', 'right', 'main', 'bottom'],
  defaultPlacement: { region: 'right', mode: 'tab' },
  defaultState: () => ({ compact: false })
});
```

### 18.2 Widget example

```ts
import TunerWidget from './TunerWidget.svelte';
import { defineWidget } from '$lib/workbench/core';

export const tunerWidget = defineWidget({
  type: 'axis.tuner',
  title: 'Tuner',
  component: TunerWidget,
  supportedSizes: ['default', 'compact', 'mini'],
  defaultSize: 'compact',
  allowedTargets: ['topBar', 'bottomBar', 'rail', 'customPanel', 'floating'],
  defaultSettings: () => ({ showNeedle: true, showNote: true }),
  estimateWidth: (size) => size === 'mini' ? 36 : size === 'compact' ? 64 : 120
});
```

### 18.3 Navigation example

```ts
export const axisCloudNav = defineNavigation({
  id: 'axisCloud',
  label: 'Axis Cloud',
  glyph: 'cloud',
  action: { kind: 'workbench.action', actionId: 'axis.openCloud' },
  hideable: false,
  reorderable: false,
  movableToBars: false,
  lockedPlacement: { area: 'rail.bottom' },
  widgetType: 'axis.accountCloud'
});
```

### 18.4 Parameter widget example

```ts
workbench.dispatch({
  type: 'ADD_WIDGET',
  widgetType: 'axis.paramControl',
  target: { kind: 'customPanelGrid', panelId, x: 0, y: 0, w: 2, h: 1 },
  binding: {
    kind: 'axis.param',
    blockRef: { mode: 'selectedBlock' },
    paramId: 0
  },
  settings: {
    view: 'knob',
    label: 'Gain',
    showValue: true
  }
});
```

---

## 19. File-by-file implementation notes

### 19.1 `src/routes/+page.svelte`

Eventually this should stop hardcoding the full app shell. It should initialize Axis boot gates and render `WorkbenchHost` once the app is ready.

Avoid breaking current boot behavior:

- remote gate
- direct gate
- mobile gate
- editor initialization
- polling/watch intervals
- keyboard shortcuts
- beforeunload dirty guard
- overlays that must remain global

### 19.2 `src/lib/editor.svelte.ts`

Do not put Workbench layout state into the existing `EditorStore` long term.

Create separate Workbench store/controller. Axis widgets can read from `editor`, but Workbench Core should not.

### 19.3 `src/lib/ControlSurface.svelte`

This component already contains many ideas relevant to Custom Panels and parameter widgets. Use it as implementation knowledge, but do not let it remain an isolated persistence island.

### 19.4 `src/lib/surfaceStore.svelte.ts`

Use as a persistence pattern, but create a new Workbench persistence store rather than overloading the surface document indefinitely.

### 19.5 `src/lib/SignalGrid.svelte`

Ensure it works as a panel. It should use pane/container measurements and should not assume it owns the full app viewport.

### 19.6 `src/lib/BlockEditor.svelte`

Convert to a registered panel. Later expose its parameter controls as drag sources for Workbench pinned parameter widgets.

### 19.7 `src/lib/TopBar.svelte` and `ToolRail.svelte`

These should be gradually replaced by Workbench widget/navigation rendering. Keep any unique Axis-specific logic by moving it into registered widgets/navigation definitions.

---

## 20. Non-goals for the first build

Do not implement these initially unless required for the phased migration:

- React migration.
- Full npm package extraction.
- Marketplace/plugin system.
- Multi-user collaborative layout editing.
- Saving live device parameter values inside layout documents.
- Rewriting the entire Block Editor internals before the shell works.
- Rewriting all default panels to be custom panels.
- Removing mobile/tablet behavior.
- Redesigning the visual system.

---

## 21. Acceptance criteria for the first production-ready Workbench milestone

A realistic first production milestone should satisfy:

1. Axis boots normally.
2. The shell is rendered through WorkbenchHost.
3. Default layout matches the current/product design closely enough to use daily.
4. Signal Grid and Block Editor still work with real device data.
5. Panels can be docked, resized, tabbed, collapsed, and persisted.
6. Top/bottom/rail widgets can be moved, hidden, restored, and resized.
7. Navigation entries can be reordered/hidden/moved where allowed.
8. Locked Axis Cloud/account entry remains available in the required fixed area.
9. Custom Panels can contain at least normal widgets and pinned parameter widgets.
10. Pinned parameter widgets read/write real Axis params through existing mechanisms.
11. Full layout persists across reload.
12. Schema has versioning and migration path.
13. No generic Workbench core import depends on Axis-specific code.
14. The design archive behavior is preserved, not simplified away.

---

## 22. Key risks

### 22.1 Building UI before the model

If drag/drop is built directly in components first, persistence and migration will become fragile. Build schema and commands first.

### 22.2 Over-coupling to Axis

If Workbench Core imports `editor` or `forgefx`, it will not become reusable. Keep Axis in the adapter.

### 22.3 Treating parameters as widget state

A parameter widget should store binding/settings, not live value. Otherwise loading a layout could accidentally change sound/device state.

### 22.4 Ignoring mobile

The design is already mobile/tablet-aware. Do not build a desktop-only MVP that later needs to be redone.

### 22.5 Replacing polished default panels with custom panels

Custom Panels are additive. They do not replace the default user experience.

### 22.6 Styling too hardcoded

Axis dark styling should be a theme. The framework should expose tokens/classes/slots so other apps can style it differently.

---

## 23. Claude Code execution checklist

Before implementing each phase:

```txt
1. Re-read the relevant design file.
2. Verify current production code path.
3. Identify which layer owns the change: core, renderer, or Axis adapter.
4. Add/adjust tests for model changes first.
5. Implement UI binding second.
6. Run check/test.
7. Verify no Axis imports leaked into generic core.
8. Verify no arbitrary design simplification was introduced.
9. Verify mobile/tablet behavior was not broken.
10. Document any intentional deviation from the design archive.
```

---

## 24. Final instruction

The target is not merely to make Axis configurable. The target is to create **Axis Workbench**: a reusable, strongly structured, themeable, IDE-style UI framework that Axis uses first.

The design archive already proves the intended interaction model visually. The production task is to:

```txt
preserve the designed behavior
replace mock data with real Axis data
replace ad hoc design runtime state with typed Svelte/TypeScript architecture
make the framework reusable and styleable
migrate existing Axis components safely
```

Do not remove or flatten features to make implementation easier. If a feature is too large for the current phase, keep the schema/API capable of supporting it and gate the UI until that phase is implemented.
