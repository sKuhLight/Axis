# Axis app-layer guide

This file applies when working under `src/lib/` (the Axis app layer). For
`src/lib/workbench/` and `src/lib/axis-workbench/` see
`src/lib/axis-workbench/CLAUDE.md`.

## Where this layer sits

Axis (SvelteKit 5 runes SPA + Electron) is the UI layer of a three-part chain:
**Axis → HTTP `/api` → ForgeFX (Fastify + device, `:5056`) → forgefx-midi (pure
protocol)**. Axis talks ONLY to the ForgeFX HTTP API. Protocol facts (frames,
opcodes, address models) are never authored here — if a feature needs new device
data, the work starts two repos down and surfaces as a new endpoint.

## HTTP client (`src/lib/api/forgefx.ts`)

One default-export object `forgefx` of ~60 one-liner methods, all delegating to a
private generic `req<T>(path, init?)`:

- `BASE = import.meta.env.VITE_FORGEFX_BASE ?? '/api'`; JSON bodies;
  `AbortSignal.timeout(12000)` default — long operations override per call
  (e.g. `backupDevice` uses `600000`).
- Non-2xx throws `ForgeError(status, msg)`; network/timeout failures are rethrown
  as status `0`. `setRequestFailureReporter` only reports status `>= 500` or `0`
  — 4xx is deliberately not reported.
- Naming: reads are nouns (`grid()`, `device()`, `blockParams(eid)`), writes are
  verb-prefixed (`set*` / `select*` / `place*`).
- Canonical read: `blockParams: (eid: number) => req<BlockParams>(`/preset/blocks/${eid}/params`)`.
  Canonical write: `setParam` — PUT with `{ value, continuous }`.
- **Two `TransportMode`s: `'local' | 'direct'`.** SSE `events()` runs ONLY in
  local mode (Browser Direct receives events via the in-page runtime bus), and
  binary helpers branch on `isDirect()`. Any new SSE or binary feature must
  handle both modes, or it silently no-ops in the web build.

## Types contract (`src/lib/api/types.ts`)

All API shapes are **hand-mirrored interfaces** — no codegen, no OpenAPI. The
chain is: ForgeFX route JSON → `types.ts` interface → `req<T>` → store `$state` →
component `$derived`. `DeviceCaps` is load-bearing: capability gates hang off it.
Drift failure mode: typecheck alone cannot catch server↔`types.ts` shape drift —
TS structural typing accepts any object with compatible optional fields, so a
server shape change not reflected in `types.ts` typechecks green; missing caps
fields silently hide features. The manual mirror discipline stands, but
`blockParams` (`NamedParam`/`EnumParam`/`DeviceLayout` and its `LayoutPage`/
`LayoutRow`/`LayoutControl`) now has a **contract test**:
`api/forgefxContract.test.ts` Zod-parses real ForgeFX response fixtures
(`api/fixtures/blockParams/*.json`, provenance in that dir's README) against a
schema mirroring the widened contract — this is what actually fails at test
time on drift, not just at runtime in the field. v2 caps fields are optional
(`?`) by design so legacy payloads degrade to the `isAm4` fallback branches.

## Store pattern (`src/lib/editor/editor.svelte.ts`, ~1865 lines)

`class EditorStore` exported as a singleton `export const editor`; components
import it directly — no context or props threading.

- State: `$state` class fields grouped by `// ── section ──` banners. Derived
  state: `get` accessors. The dominant idiom is the capability gate:
  `get hasTuner() { return this.isV2 ? !!this.caps?.tuner : <legacy isAm4 branch>; }`.
- Lifecycle: `routes/+page.svelte` `onMount` drives `editor.init()`,
  `editor.poll()`, and the `setInterval` poll/`watchPreset` loops.
- `poll()` / `watchPreset()` are re-entrancy-guarded (`#polling` / `#watching`)
  and throttled on slow links — **never add an unguarded device read to the poll
  loop**.
- SSE: `#openEvents` feeds `applyDeviceEvent`, a single `switch` over the
  `DeviceEvent` union. To react to a device-side change (e.g. scene change),
  extend the existing `case` and reuse the `#eventReload` debounce — do not add
  parallel timers.
- **THE canonical action shape** — optimistic update, await, revert on catch:

  ```ts
  toggleTuner = async () => {
    const next = !this.tuner.active;
    this.tuner = { active: next };
    await forgefx.setTuner(next).catch(() => {
      this.tuner = { active: !next };
    });
  };
  ```

Other stores: `preset/library.svelte.ts` (device scan, `.syx` import, Zod-validated
persisted summaries, Orama index), `editor/history.svelte.ts` (undo/redo, IndexedDB; binds a
narrow host interface to avoid an editor↔history import cycle).

**Own module vs extend editor:** give state its own `*.svelte.ts` when it has an
independent persistence lifecycle or must avoid an import cycle. Live device
state flowing through poll/SSE with the shared connection/caps stays in `editor`.

## Component pattern

One `.svelte` per feature, filed under its domain folder in `src/lib/`: `ui/`
(presentation primitives, no domain knowledge), `editor/` (the live editing
surface), `device/`, `preset/`, `fm3edit/`, `shell/` (frozen legacy-monolith
chrome), `ancillary/` (settings hub, onboarding, notices). Cross-folder imports
use the `$lib/<folder>/x` alias; same-folder imports are relative (`./sibling`).
Direct singleton import (`const cents = $derived(editor.tuner.cents ?? 0)`);
actions inline (`onclick={() => editor.toggleTuner()}`). Theming: use tokens from
`src/app.css` (`--accent`, `--bg2`, `--surface`, `--text`, `--ok`, `--amber`,
`--danger`, `--font-mono`) — the monolith is not hex-linted (only
`workbench/svelte/` is), but prefer tokens anyway.

### Overlay / modal pattern

Every modal renders through **`ui/Dialog.svelte`** — the one shell that owns the
scrim, card chrome, focus trap (`workbench/svelte/focusTrap.ts`) and
Escape-to-close. Props cover the per-dialog differences (`size`/`width`,
`align`, `sheet`/`mobileFull`, `accent`, `dismissible`, `title`); don't fork it.
Mount the dialog UNCONDITIONALLY in `+page.svelte` below the shell `{#if}` branch
and pass `open` + `onClose`.

Open-state and Escape priority live in the **overlay registry**
(`overlay/overlays.svelte.ts`). `overlays.open/close/toggle/isOpen(id)` drive the
registry-owned overlays; `+page.svelte`'s keydown handler calls
`overlays.escape()` (no chain) and the registry closes the single
highest-priority open overlay. `ESCAPE_ORDER` in that file is the priority table.
Overlays whose state genuinely lives elsewhere (tuner = device-synced, the
converter flow, link-arm, the block-editor drawer) register an `OverlayDelegate`
in `overlay/overlayRegistrations.ts`. `editor` keeps thin `get/set xOpen`
accessors delegating to `overlays` so long-standing call sites and the
`EditorSurface` contract still work.

Adding a dialog: pick/add an `OverlayId`, give it an `ESCAPE_ORDER` slot, render
via `Dialog`, drive `open` from `overlays.isOpen(id)` (or a domain store).
Minimal end-to-end reference: `editor/TunerOverlay.svelte` (Dialog shell +
delegate) and `device/DeviceTools.svelte` (Dialog shell + registry-owned flag).

## Dual-shell decision tree

Axis has two shells: the legacy monolith and the workbench. Where a feature lands
decides how much mirroring work it costs:

| Feature lives in… | Reaches both shells? | What you must do |
|---|---|---|
| Overlay-registry modal (`Dialog` + `overlays.isOpen(id)`) | Yes, automatically | Nothing — the shared modal layer sits below the shell `{#if}` branch |
| Embedded editor component (`SignalGrid` / `BlockEditor` / `FcEditor` / `VirtualScreen` / `ModifierEditorCore`) | Yes, automatically | Nothing — the workbench embeds these directly |
| Monolith chrome (`TopBar` / `ToolRail`) | No — monolith only | Build a mirrored widget/panel via `/new-widget` / `/new-panel` |
| Preset-browser logic (`PresetBrowser.svelte` / `library.svelte.ts`) | No | MUST manually mirror into `src/lib/axis-workbench/presetBrowser/` — query grammar + row/menu logic verbatim. Deep per-parameter matching (`matchParamCond` over decoded blocks) and the weighted CPU estimate are now shared in `presetBrowserWorkbenchQuery.ts`; the workbench hosts feed `library.paramsOf` into `preparePresetBrowserIndex` so `` `AMP(GAIN>7)` `` filters identically in both shells (and excludes entries whose params aren't hydrated). |

## Feature gating

Prefer a `DeviceCaps` capability gate: add the field to `DeviceCaps` in
`types.ts` → ForgeFX populates it from forgefx-midi → add a `get hasX()` getter →
gate the UI on it. Features then auto-appear per device and degrade gracefully on
legacy servers. Use `VITE_*` build flags only for whole-shell/build modes
(workbench/web/mobile), wired through a small pure, testable gate function
(pattern: `featureGate.ts`) with a defined gate-off behavior. Server-gated
There is no cloud: Axis Cloud (preset sync, accounts, and the Axis Remote relay)
was removed — see the "Retire" commits on `feature-deletion`. `putDoc`/`getDoc`
are the ForgeFX LOCAL config store, not a cloud API, and the `/device/cache/cloud`
endpoints are the shared device-definition profiles, which stay.

Two `VITE_` gates exist today, both in `src/lib/axis-workbench/featureGate.ts`:

| Gate | Env | Default | Off means |
|---|---|---|---|
| `isAxisWorkbenchFeatureEnabled` | `VITE_AXIS_WORKBENCH` | **on** (`'0'` opts out) | monolith shell |
| `isAxisLayoutEditingEnabled` | `VITE_AXIS_LAYOUT_EDIT` | **off** (`'1'` opts in) | no workbench layout editing |

`isAxisLayoutEditingEnabled` is a **retirement, not a deletion** — the code is
intact and stays e2e-covered (`playwright.config.ts` turns it on). It is clamped at
a single choke point so a new entry point cannot resurrect the feature by accident:
`WorkbenchController.setEditMode`/`toggleEditMode` (via the `layoutEditable`
construction option). If you add UI that would enter that mode, gate the affordance
too — do not remove the clamp.

One consequence worth knowing:

- The gate **clamps on the read side** rather than rewriting storage, so a doc
  saved while the feature was on cannot strand the user: `profileOverride`
  returns undefined (`controller.svelte.ts`). Persisted values are untouched, so
  re-enabling the flag restores them exactly. Do not "simplify" this into a
  migration that mutates the document.

**Deliberately still reachable with layout editing off:** dock region
collapse/resize (`DockRegion.svelte:72-74`), split-ratio drag (`SplitHandle.svelte`),
and panel collapse (`TabStack.svelte:389-396`). These size what already exists,
add/remove/move nothing, and are all reversible without the ribbon (a collapsed
region leaves a click-to-restore strip). Treated as normal app usage, like an IDE
sidebar divider — this is a decision, not an oversight.

## Testing reality

- Two vitest projects (`vitest.config.ts`), both node environment, no DOM:
  - **`node`** — `src/**/*.test.ts`, the bulk of the suite. Pure `.ts` modules only.
  - **`runes`** — `src/**/*.runes.test.ts`, for the rune stores (`*.svelte.ts`).
    A small local plugin compiles rune MODULES with
    `compileModule(..., { generate: 'client' })`. Do NOT reach for
    `@sveltejs/vite-plugin-svelte` here: it hardcodes
    `generate: ssr ? 'server' : 'client'` and vitest transforms in SSR mode, so
    runes compile to the server runtime where `$state` is an inert plain value —
    reactivity assertions then pass vacuously against real bugs. Components are
    still never unit-mounted; this is for stores.
  - `library.runes.test.ts` is the worked example (proxy-identity + derived
    invalidation). `editor.svelte.ts` is still `vi.mock`'d out of
    `editorSurface.test.ts` and is the obvious next candidate.
- The monolith otherwise has almost no unit coverage (only `direct/nativeMidi`
  and `direct/ota`). New features should extract pure logic and add a co-located
  vitest — an easy win.
- All 19 e2e specs are workbench-shell only (`VITE_AXIS_WORKBENCH=1`,
  `bootCleanWorkbench`, viewport ≥ 1366 px). There is NO monolith-shell e2e
  harness — monolith behavior is verified manually.
- CI now also runs the vitest unit suite; only Playwright e2e stays local. Green CI ≠ passing e2e.

## Pitfalls (all have bitten before)

- **Stale persisted state** — Zod-validate any new persisted slice (see
  `library.svelte.ts` `summarySchema`); never trust old localStorage shapes.
- **Preset-browser mirror rule** — see the dual-shell table; forgetting it ships
  divergent search behavior.
- **Polling races** — guard + throttle every loop; an unguarded read stacked
  serial device ops into multi-second lag on slow links.
- **Ungated telemetry reads** — capability-gate every telemetry read; devices
  that silently ignore frames cause 5 s serial-queue timeouts.
- **Own-echo loops in synced config** — ignore events where
  `e.origin === CLIENT_ID`, and never re-save on apply.
- **TransportMode divergence** — SSE/binary paths must handle local AND direct
  or the feature silently no-ops in the web build.

## Cross-repo change chain

Full walkthrough: `/cross-repo-feature`. Short form: protocol fact → forgefx-midi
(rebuild) → ForgeFX endpoint + `DeviceCaps` advertisement (**restart the ForgeFX
dev server on `:5056`** — the Axis dev server does NOT pick up ForgeFX changes,
it only proxies) → Axis `types.ts` + `forgefx.ts` + editor wiring → browser
refresh. The `file:../ForgeFX/server` link matters only for the packaged desktop
build (reinstall/rebuild, no hot-reload).

## Tooling and process

- Scaffolding/workflow commands: `/implement-feature`, `/new-endpoint`,
  `/cross-repo-feature`, `/plan-feature`; run the `reviewer` and `test-runner`
  agents before committing non-trivial changes.
- Task tracking in Plane is mandatory — see root `CLAUDE.md`, Task tracking
  section.
- On the layout-rework branch, also update
  `docs/axis_layout_rework_progress_log.md` after every step.
