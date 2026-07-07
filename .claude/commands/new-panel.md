---
description: Scaffold a new axis-workbench panel through the full ordered registration checklist
---

Add a new panel to the Axis workbench: $ARGUMENTS

Read `src/lib/axis-workbench/CLAUDE.md` first if you have not already this session.

## Step 0 — Restate and collision-check

1. Restate what the panel shows, whether it should be a singleton, whether it needs
   navigation-rail access, whether it is docked by default, and whether it hosts a live
   runtime (device/editor data stream).
2. Open `src/lib/axis-workbench/axisWorkbenchRegistryManifest.ts` and check
   `AXIS_WORKBENCH_BASE_PANEL_TYPES` (and the derived part-panel types) for a name
   collision. Pick the type string `axis.<camelCaseName>`.

## Checklist (ordered — do not skip or reorder)

1. **Component** — create `src/lib/axis-workbench/panels/AxisXPanel.svelte` with
   `let { panel }: { panel: PanelInstance } = $props()`; use `getWorkbenchContext()` for
   controller/registry; read parameters from `panel.state`. Design tokens only — **no hex
   literals**.
2. **Manifest** — add `'axis.x'` to `AXIS_WORKBENCH_BASE_PANEL_TYPES` in
   `axisWorkbenchRegistryManifest.ts` (or, for a multi-part subsystem, create a new
   `<subsystem>/types.ts` with a parts array + `panelType(part)` helper and derive the
   types in the manifest like the existing `fc`/`presetBrowser`/`blockEditor` imports).
3. **Registry** — `src/lib/axis-workbench/axisWorkbenchRegistry.ts`: import the component
   and map it in the registerPanel loop.
4. **Defaults** — `src/lib/axis-workbench/axisWorkbenchDefaults.ts`: add a
   `createAxisWorkbenchPanels()` entry with a `singletonKey` (plus `locked` / `closable`
   as appropriate) and an optional panelLibrary entry.
5. **Navigation** *(conditional — only if the panel gets a nav entry)*:
   - nav id in `AXIS_WORKBENCH_NAVIGATION_IDS` and action id in
     `AXIS_WORKBENCH_ACTION_IDS` in the manifest;
   - nav entry/order in `axisWorkbenchDefaults.ts` AND in every preset's
     `buildNavigation` in `axisWorkbenchLayoutPresets.ts`;
   - register a `createAxisNavigationPanelAction({ actionId, panelId, panelType, title,
     region, state? })` in `axisWorkbenchRegistry.ts` (add-or-focus semantics — no dead
     nav buttons);
   - add a tint rule in `axisNavigationActiveState.ts` if the entry should highlight.
6. **Preset docks** *(conditional — only if docked by default)*: add the panel to
   `buildDock()` in `axisWorkbenchLayoutPresets.ts` — keep ALL six presets (`default`,
   `stage`, `studio`, `compact`, `tablet`, `mobile`) consistent.
7. **Runtime hosting** *(conditional — only if the panel binds a live runtime)*: build
   the types/controller/runtime/host/data quintet and declare it in
   `axisWorkbenchRuntimeAdapters.ts` — use `/new-runtime-adapter` for this part.
8. **Tests** — extract non-trivial pure logic into `.ts` modules with node-env unit tests
   under `src/lib/axis-workbench/test/` (never mount `.svelte` in vitest); add Playwright
   e2e coverage for dock/navigation behavior when the panel adds visible chrome
   (`bootCleanWorkbench` from `e2e/support/workbench.ts`, stable data-attributes).

## Verify

```
npm run check && npm test
```

If e2e was touched: `npx playwright test <the spec you edited>` (dock/nav specs live at
`e2e/03-dock.spec.ts` and `e2e/04-nav.spec.ts`).

Then:
- Update `docs/axis_layout_rework_progress_log.md`.
- Create or advance the work item in Plane (see root `CLAUDE.md`, Task tracking section).
- Consider running the `workbench-reviewer` agent over the diff.
