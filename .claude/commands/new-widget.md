---
description: Scaffold a new axis-workbench widget through the full ordered registration checklist
---

Add a new widget to the Axis workbench: $ARGUMENTS

Read `src/lib/axis-workbench/CLAUDE.md` first if you have not already this session.

## Step 0 — Restate and collision-check

1. Restate what the widget does, whether it is interactive, whether it needs live device
   data, and where it should appear by default.
2. Open `src/lib/axis-workbench/axisWorkbenchRegistryManifest.ts` and check
   `AXIS_WORKBENCH_WIDGET_TYPES` for a name collision (and for an existing widget that
   already covers the request). Pick the type string `axis.<camelCaseName>`.

## Checklist (ordered — do not skip or reorder)

1. **Manifest** — `src/lib/axis-workbench/axisWorkbenchRegistryManifest.ts`: append
   `'axis.X'` to `AXIS_WORKBENCH_WIDGET_TYPES`.
2. **New component** — `src/lib/axis-workbench/widgets/AxisXWidget.svelte`, its own file
   (mirror an existing one, e.g. `AxisTempoWidget.svelte`), destructuring only the props
   it needs from `AxisWorkbenchWidgetProps` (`widgetProps.ts`). Style with design tokens
   only (`--aw-*` and app tokens like `--accent`, `--bg2`, `--text`) — **no hex literals**
   — in the widget's own `<style>` block; only add to the shared `widgets/widgets.css` if
   the rule is genuinely reused by several widgets already. Logic shared by a *few*
   widgets (not just one) goes in its own module, e.g. `widgetControls.ts` or
   `fcWidgetSnapshot.svelte.ts` — don't reach for a shared module for something only your
   new widget uses.
3. **Registry** — `src/lib/axis-workbench/axisWorkbenchRegistry.ts`: import the component
   and add it to `AXIS_WIDGET_COMPONENTS` (a `Record<string, WorkbenchWidgetComponent>`
   literal, one entry per type — no switch).
4. **Fit math** — `src/lib/axis-workbench/widgets/widgetEstWidths.ts`: add
   `AXIS_WIDGET_EST_WIDTHS['axis.X']`. A missing entry silently breaks overflow-fit math.
   *(Conditional)* Add to `AXIS_WIDGET_KEEP_TYPES` only if the widget must never be
   trimmed on overflow.
5. **Binding** *(conditional — only if the widget shows live device data)*: reuse binding
   kind `axis.paramControl`, or add a new kind plus resolver in
   `src/lib/axis-workbench/axisWorkbenchBindings.ts`.
6. **Pure logic + unit test** *(conditional — required whenever the widget has
   non-trivial logic)*: extract it into a new `src/lib/axis-workbench/widgets/<x>.ts` and
   add `src/lib/axis-workbench/test/<x>.test.ts`. Vitest is node-env: never mount
   `.svelte` components in unit tests.
7. **Placement** *(conditional — required if the widget is seeded by default or
   user-addable)*: seed in `src/lib/axis-workbench/axisWorkbenchDefaults.ts` and/or add a
   widgetLibrary entry there. If seeded into layouts, update
   `src/lib/axis-workbench/axisWorkbenchLayoutPresets.ts`: the `WIDGET_TYPE` and
   `WIDGET_INSTANCE_ID` maps plus the per-preset widget lists — ALL six presets
   (`default`, `stage`, `studio`, `compact`, `tablet`, `mobile`) must stay consistent.
8. **e2e** *(conditional — required if the widget adds visible chrome)*: add an assertion
   mirroring `e2e/05-widgets.spec.ts`, using `bootCleanWorkbench` from
   `e2e/support/workbench.ts` and stable data-attributes.

## Verify

```
npm run check && npm test
```

If e2e was touched: `npx playwright test e2e/05-widgets.spec.ts` (or the spec you edited).

Then:
- Create or advance the work item in Plane (see root `CLAUDE.md`, Task tracking section).
- Consider running the `workbench-reviewer` agent over the diff.
