---
description: Scaffold a new axis-workbench runtime adapter (types/controller/runtime/host/data quintet) following the fc/ template
---

Add a new runtime adapter to the Axis workbench: $ARGUMENTS

Read `src/lib/axis-workbench/CLAUDE.md` first if you have not already this session.

A runtime adapter connects a live app subsystem (editor/device data stream) to workbench
panels while keeping everything except one host file pure and unit-testable.

## Step 0 — Restate and collision-check

1. Restate which subsystem the adapter wraps, what snapshot shape panels will consume,
   and which panel part(s) it serves.
2. Check `src/lib/axis-workbench/axisWorkbenchRegistryManifest.ts` and
   `axisWorkbenchRuntimeAdapters.ts` for an existing adapter or type-string collision.
3. Study the reference template before writing code: `src/lib/axis-workbench/fc/`
   (`types.ts`, `fcWorkbenchController.ts`, `fcWorkbenchRuntime.ts`, `fcWorkbenchHost.ts`,
   `fcWorkbenchData.ts`).

## The quintet (create under `src/lib/axis-workbench/<x>/`)

1. **`types.ts`** — the parts array (`AXIS_X_PARTS`) + `axisXPanelType(part)` helper, and
   the adapter's snapshot/host TypeScript interfaces. No app imports.
2. **`<x>WorkbenchController.ts`** — pure UI-state logic for the panels. No app imports.
3. **`<x>WorkbenchRuntime.ts`** — pure orchestration: consumes a host interface, produces
   snapshots. No app imports.
4. **`<x>WorkbenchHost.ts`** — `createAxisXWorkbenchHost()`. **This is the ONLY file in
   the adapter allowed to import app modules** (the editor store, device runtime, etc.).
   Everything app-flavored is adapted to the host interface here.
5. **`<x>WorkbenchData.ts`** — pure data shaping/formatting for rendering. No app imports.

## Wiring

6. Declare the adapter manifest in
   `src/lib/axis-workbench/axisWorkbenchRuntimeAdapters.ts`.
7. Derive the part-panel types in `axisWorkbenchRegistryManifest.ts` from the parts array
   (mirror how `fc`/`presetBrowser`/`blockEditor` are imported there), and wire the panel
   components in `axisWorkbenchRegistry.ts`.
8. Panels mount the runtime via
   `bindAxisRuntimeHost({ runtime, host, onSnapshot, start })` from
   `src/lib/axis-workbench/runtimeBinding.ts`. Binding goes through
   `runtimeHostStack.ts` (LIFO) so multiple panels can bind concurrently — never wire a
   panel directly to the host.

## Host-seam rules (enforced by review)

- Only the host factory imports from the app (`editor`, device runtime, history, cloud).
- Controller, runtime, and data modules stay pure: they receive everything through the
  host interface or function arguments.
- Nothing under `src/lib/workbench/` may be touched to make an adapter work — adapters
  are pure `axis-workbench/` territory.

## Tests

- Node-env unit tests for controller, runtime, and data modules under
  `src/lib/axis-workbench/test/` (see `fcWorkbenchController.test.ts`,
  `fcWorkbenchRuntime.test.ts`, `fcWorkbenchData.test.ts`). Never mount `.svelte` in
  vitest. The host factory itself is exercised by e2e, not unit tests.
- Playwright e2e for the panels' visible behavior when they add chrome
  (`bootCleanWorkbench` from `e2e/support/workbench.ts`).

## Verify

```
npm run check && npm test
```

If e2e was touched: `npx playwright test <the spec you edited>`.

Then:
- Update `docs/axis_layout_rework_progress_log.md`.
- Create or advance the work item in Plane (see root `CLAUDE.md`, Task tracking section).
- Consider running the `workbench-reviewer` agent over the diff.
