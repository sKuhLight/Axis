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

## HTTP client (`src/lib/forgefx.ts`)

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
- **Three `TransportMode`s: `'local' | 'remote' | 'direct'`.** SSE `events()` runs
  ONLY in local mode (remote/direct receive events via the relay / runtime bus),
  and binary helpers branch on `isDirect()`. Any new SSE or binary feature must
  handle all three modes, or it silently no-ops in remote/direct builds.

## Types contract (`src/lib/types.ts`)

All API shapes are **hand-mirrored interfaces** — no codegen, no OpenAPI. The
chain is: ForgeFX route JSON → `types.ts` interface → `req<T>` → store `$state` →
component `$derived`. `DeviceCaps` is load-bearing: capability gates hang off it.
Drift failure mode: CI is typecheck+build only, so a server shape change that is
not reflected in `types.ts` typechecks green and fails at runtime — missing caps
fields silently hide features. v2 caps fields are optional (`?`) by design so
legacy payloads degrade to the `isAm4` fallback branches.

## Store pattern (`src/lib/editor.svelte.ts`, ~1865 lines)

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

Other stores: `cloud.svelte.ts` (true `$derived`, pure derivation + refresh),
`library.svelte.ts` (device scan, `.syx` import, Zod-validated persisted
summaries, Orama index), `history.svelte.ts` (undo/redo, IndexedDB; binds a
narrow host interface to avoid an editor↔history import cycle).

**Own module vs extend editor:** give state its own `*.svelte.ts` when it has an
independent persistence lifecycle or must avoid an import cycle. Live device
state flowing through poll/SSE with the shared connection/caps stays in `editor`.

## Component pattern

Flat, one `.svelte` per feature directly under `src/lib/`. Direct singleton
import (`const cents = $derived(editor.tuner.cents ?? 0)`); actions inline
(`onclick={() => editor.toggleTuner()}`). Modal pattern: a boolean `$state` flag
on `editor` (`xOpen`), the component gates on `{#if editor.xOpen}`, and it is
mounted UNCONDITIONALLY in `+page.svelte` below the shell branch; Escape is
handled centrally in `+page.svelte` in priority order. Theming: use tokens from
`src/app.css` (`--accent`, `--bg2`, `--surface`, `--text`, `--ok`, `--amber`,
`--danger`, `--font-mono`) — the monolith is not hex-linted (only
`workbench/svelte/` is), but prefer tokens anyway. Minimal end-to-end reference
feature: `TunerOverlay.svelte` + `editor.toggleTuner`.

## Dual-shell decision tree

Axis has two shells: the legacy monolith and the workbench. Where a feature lands
decides how much mirroring work it costs:

| Feature lives in… | Reaches both shells? | What you must do |
|---|---|---|
| Editor-flag modal (`{#if editor.xOpen}`) | Yes, automatically | Nothing — shared modal layer sits below the shell `{#if}` branch |
| Embedded editor component (`SignalGrid` / `BlockEditor` / `FcEditor` / `VirtualScreen` / `ModifierEditorCore`) | Yes, automatically | Nothing — the workbench embeds these directly |
| Monolith chrome (`TopBar` / `ToolRail`) | No — monolith only | Build a mirrored widget/panel via `/new-widget` / `/new-panel` |
| Preset-browser logic (`PresetBrowser.svelte` / `library.svelte.ts`) | No | MUST manually mirror into `src/lib/axis-workbench/presetBrowser/` — query grammar + row/menu logic verbatim; deep param matching intentionally stays monolith-only |

## Feature gating

Prefer a `DeviceCaps` capability gate: add the field to `DeviceCaps` in
`types.ts` → ForgeFX populates it from forgefx-midi → add a `get hasX()` getter →
gate the UI on it. Features then auto-appear per device and degrade gracefully on
legacy servers. Use `VITE_*` build flags only for whole-shell/build modes
(workbench/remote/mobile), wired through a small pure, testable gate function
(pattern: `featureGate.ts`) with a defined gate-off behavior. Server-gated
features (cloud): discover via the API (`cloudStatus().enabled`) — do not
client-gate.

## Testing reality

- vitest = node environment, no DOM — pure `.ts` modules only.
- The monolith currently has almost no unit coverage (only `direct/nativeMidi`
  and `direct/ota`). New features should extract pure logic and add a co-located
  vitest — an easy win.
- All 10 e2e specs are workbench-shell only (`VITE_AXIS_WORKBENCH=1`,
  `bootCleanWorkbench`, viewport ≥ 1366 px). There is NO monolith-shell e2e
  harness — monolith behavior is verified manually.
- CI runs typecheck+build only; tests are local-only. Green CI ≠ passing tests.

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
- **TransportMode divergence** — SSE/binary paths must handle
  local/remote/direct or the feature silently no-ops in some builds.

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
