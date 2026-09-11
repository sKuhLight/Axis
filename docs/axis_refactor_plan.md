# Axis architecture refactor — milestone plan

> On approval, move this file to `docs/axis_refactor_plan.md` so the Sonnet sessions can
> reference it in-repo.

## Context

Axis is ~63k LOC production + ~21k LOC tests across 434 files, in three layers:
`src/lib/workbench/` (14.8k, generic dockable-workbench framework),
`src/lib/axis-workbench/` (17.2k, the Axis binding), and a flat app layer
(30.8k, 122 production files loose in `src/lib/`).

An architecture review found two different regimes in one repo. `workbench/` is genuinely
well-built — pure reducer + commands + invariants + selectors, a render registry, zero app
imports, 5.8k LOC of tests, extraction-ready. The flat app layer is not: one god store, 47
fat components, ~1k lines of untested logic inside a single `.svelte` file, and no domain
boundaries.

The review also found ~3,500 LOC of dead code and tests left behind by the deleted
ControlSurface feature, and a documented "mirror rule" requiring preset-browser logic to be
hand-copied between the two shells.

**Decision taken:** the legacy monolith shell stays for now. We refactor everything *except*
the monolith first, then port the remaining workbench feature gaps, then revisit retirement.
This ordering is deliberate — with the monolith staying, the "don't refactor what you'll
delete" cost mostly evaporates (only ~3,000 LOC is eventually disposable and it's frozen
either way), the monolith serves as a frozen reference implementation to diff behaviour
against, and the later porting work gets strictly easier once the widget registry is
un-inverted.

**Intended outcome:** a domain-grouped app layer, a composed editor store instead of a god
object, a real overlay layer, per-type workbench components instead of mega-switches, and
documentation that matches the code — with no behaviour change at any point.

---

## Findings this plan acts on

| # | Finding | Evidence | Milestone |
|---|---|---|---|
| A | `editor.svelte.ts` is a god object | 2,110 lines, ~200 public members + 27 getters, 51 importers, ~20 responsibilities under `// ──` banners | M4 |
| B | Overlay state is a global flag bag + hardcoded Escape chain | 20 modals mounted unconditionally in `routes/+page.svelte`; 12 boolean flags on `editor`; 40-line `else if` priority chain | M3 |
| C | Dual-shell mirror | Preset browser = 1,570 (monolith) + 6,031 (workbench) LOC; `splitTop` documented "verbatim from monolith `splitOn`" | deferred (monolith kept) |
| D | Registry inversion | 24 widget types → one 1,596-line component; 4 PB parts → one 2,618-line component; 7 FC parts → one 1,302-line component | M5 |
| E | Leaky host seam | Host factories are excellent, but panels import `editor`/`library`/`history` directly; 12 files under `axis-workbench/` import `editor.svelte` | M5 (partial) |
| F | No domain grouping | 122 production files flat in `src/lib/`; clusters visible in filenames (convert 23, device 20, graphs 21, cab 10, block 8) | M2 |
| G | Dead ControlSurface subsystem | `deviceLayoutBoard.ts` 12/13 exports dead; `surfaceGrid`, `cabIdentityCards`, `FaderBank` unreachable; `workbench/packages.ts` + `workbench/core/registry.ts` zero consumers | M1 |
| H | No UI primitive layer | 13,897 lines of component CSS vs 64 tokens; `.card` in 17 components, `.chip` in 6+, `.row` in 27 | M3 + M6 |
| I | Documentation drift | ~6,300 of ~11k doc lines are process artifacts reading as current spec; stale ControlSurface / Axis Cloud references in 7 docs | M7 + per-milestone rule |

**Deliberately not touched — these are good:** `workbench/core` purity and test coverage;
only 3 import cycles in 434 files (two benign); the `syncBus` / `history.bindHost` /
host-factory seams; centralized build and feature gates; zero duplicated exported symbol
names repo-wide.

---

## Global rules — apply to every milestone

1. **The monolith is frozen for structure, open for mechanics.**
   `PresetBrowser.svelte`, `TopBar.svelte`, `ToolRail.svelte`, `StatusBar.svelte` may receive
   import-path updates and facade-preserving signature changes. Extracting their logic,
   changing their markup, or altering their behaviour is out of scope.
2. **`src/lib/workbench/` keeps zero app imports.** The app may import *from* it.
3. **Behaviour-preserving.** No feature work, no bug fixes bundled in. Find a bug → record it
   in the milestone report, do not fix it in the same PR.
4. **Ends green.** `npx vitest run` (node + runes projects), `npm run check`,
   `npx playwright test`; plus `npm run test:workbench-visual` for M5.
5. **Docs ship with the change.** Any claim the PR invalidates gets fixed in the same PR —
   `src/lib/CLAUDE.md`, `src/lib/axis-workbench/CLAUDE.md`, `.claude/commands/*`, `docs/`.
6. **Agents before commit:** `reviewer` and `test-runner`; add `workbench-reviewer` for
   anything under `src/lib/workbench/` or `src/lib/axis-workbench/`.
7. Plane task tracking per root `CLAUDE.md`.
8. **Line numbers in these prompts reflect the pre-M2 layout.** Once M2 has landed, files live
   under their domain folder — locate by filename, not by path.

## Scheduling

```
M1 ─→ M2a ─→ M2b ─→ M2c ─┬─→ M3 ─→ M4a ─→ M4b ─→ M4c ─→ M4d ─→ M6 ─→ M7
                          └─→ M5  (parallel — disjoint file set)
```

M5 touches only `axis-workbench/panels|widgets|registry`; M3 and M4 touch the app layer.
After M2 they can run concurrently in two sessions without conflicting.

---

# M1 · Delete the ControlSurface remnants

**Goal:** remove ~3,500 LOC of code and tests for a feature that no longer exists, so no later
milestone has to reason about whether it matters.
**Risk:** Low — pure subtraction, every target verified unreachable.

### Handoff prompt

````markdown
# Task: delete the ControlSurface dead subsystem

## Background

`ControlSurface.svelte` — a widget-grid control surface — was deleted from Axis on the
`feature-deletion` branch. Its supporting modules were left behind. Some are entirely
unreachable; others are kept alive by a single small function or by a barrel `export *`.
Around 3,500 LOC of production code and tests currently exist for a feature users cannot
reach.

This is pure subtraction. It is the first milestone of a larger refactor and unblocks the
rest, so it must land clean and complete.

Read `src/lib/CLAUDE.md` and `src/lib/axis-workbench/CLAUDE.md` before starting and follow
their process rules for this branch.

## Method

For **every** target below: run a repo-wide grep to confirm the finding still holds before
deleting. The analysis is recent but not infallible — if a target turns out to have a live
consumer, stop and report it rather than working around it. Delete leaf-first.

## Targets

### 1. `src/lib/deviceLayoutBoard.ts` (1,107 lines)

Only **one** of its 13 exports is live: `monitorsByFamily`, imported by
`src/lib/editor.svelte.ts:25`. Its body needs only the `MonitorParams` / `MonitorEntry` types
from `src/lib/types.ts` — no other dependency.

- Move `monitorsByFamily` (and only it) into a small new module, e.g.
  `src/lib/deviceMonitors.ts`, keeping its doc comment — the family-scoping rationale in it
  is load-bearing and must survive.
- Update the import in `editor.svelte.ts`.
- Delete `deviceLayoutBoard.ts`.

**Note:** the re-export at `deviceLayoutBoard.ts:45-48` carries a comment claiming
`cabIdentityCards`, `cabAlignmentGraphs` and `eqGraphs` import those symbols from this path.
That comment is **stale** — none of them do. Verify, then ignore it.

### 2. `src/lib/deviceGeometry.ts`

Only `parsePositionExact` has a live consumer (`src/lib/deviceCanvas.ts`). Every other export
is referenced solely by `deviceGeometry.test.ts` and by `deviceLayoutBoard.ts` (deleted above).

- Keep `parsePositionExact` and whatever it needs internally.
- Delete the rest and trim `deviceGeometry.test.ts` to match.

### 3. Test files for the above

Delete `src/lib/deviceLayoutBoard.test.ts` (1,570 lines) and
`src/lib/deviceLayoutSweep.test.ts`.

### 4. `src/lib/surfaceGrid.ts` + `surfaceGrid.test.ts`

Unreachable from any route entrypoint. Delete both.

### 5. `src/lib/surfaceStore.svelte.ts`

`surfGet` / `surfSet` / `surfRemove` / `surfRev` have zero consumers — nothing reads the
document this store persists. Two live wirings keep it running at boot:

- `src/routes/+page.svelte:51` — `void surfInit();`
- `src/lib/editor.svelte.ts:18` (import) and `:1160` — `else if (id === 'surface') surfApplyRemote(data);`

Confirm nothing reads the data, then delete the module **together with both call sites in the
same commit**. Removing the module without its wiring breaks the build; removing the wiring
without the module leaves dead I/O at boot.

### 6. `src/lib/cabIdentityCards.ts` + `cabIdentityCards.test.ts`

Unreachable from any route entrypoint. Delete both.

### 7. `src/lib/FaderBank.svelte`

Unreachable from any route entrypoint. Delete.

### 8. `isAxisControlArrangeEnabled`

`src/lib/axis-workbench/featureGate.ts:25`. The gate it guards no longer exists. Delete the
function and its `describe` block in `src/lib/axis-workbench/test/featureGate.test.ts`.
Leave `isAxisWorkbenchFeatureEnabled` and `isAxisLayoutEditingEnabled` alone.

### 9. `src/lib/workbench/packages.ts` (152 lines) + `src/lib/workbench/test/packages.test.ts`

Zero production consumers — only its own test. Delete both and remove the
`export * from './packages';` line from `src/lib/workbench/index.ts`.

Do **not** confuse this with `src/lib/workbench/core/layoutPackage.ts`, which IS live
(`WorkbenchLayoutDrawer.svelte` uses `exportPageLayoutPackage`, `importLayoutPackage`,
`importPageLayoutPackage`, `importPanelPackage`, `layoutPackageFilename`). Leave
`layoutPackage.ts` alone.

### 10. `src/lib/workbench/core/registry.ts` (85 lines) + its test

Zero consumers — not even a test references `createWorkbenchRegistry`. Superseded by
`svelte/renderRegistry.ts`. Delete and remove `export * from './registry';` from
`src/lib/workbench/core/index.ts`.

### 11. `src/lib/axis-workbench/axisWorkbenchRuntimeAdapters.ts` (38 lines) + its test

This is a manifest of **file paths as strings** consumed by nothing but its own test. It
duplicates information that lives in the filesystem and will rot silently on the next rename.

- Delete the module and `src/lib/axis-workbench/test/axisWorkbenchRuntimeAdapters.test.ts`.
- Rewrite the runtime-adapter registration step in `src/lib/axis-workbench/CLAUDE.md`
  (lines ~114, ~154, ~163) so it no longer instructs registering there — describe the
  types/controller/runtime/host/data quintet as a filesystem convention in prose.
- Update `.claude/commands/new-runtime-adapter.md` to match.

## Watch out for

`src/lib/workbench/test/exports.test.ts` asserts against the barrel surface. Removing entries
from `workbench/index.ts` or `workbench/core/index.ts` will likely require updating it. Update
the assertions to match the new surface; do not weaken the test into a no-op.

## Docs (same PR)

Purge references to the deleted subsystem from:

- `README.md` — mentions a "widget-grid control surface you can rearrange"
- `docs/LAYOUTS.md`
- `src/lib/CLAUDE.md` — the `isAxisControlArrangeEnabled` row in the `VITE_` gate table, and
  the two consequence paragraphs below it about ControlSurface Arrange mode and swipe-control
  mapping
- `src/lib/axis-workbench/CLAUDE.md` — the runtime-adapter registration instructions (above)

Leave the historical planning documents in `docs/` untouched — a later milestone archives
those wholesale. Add a `CHANGELOG.md` entry only if the repo's convention records internal
cleanups; check recent entries first.

## Verification

- `npx vitest run` — both the `node` and `runes` projects
- `npm run check`
- `npx playwright test`
- Grep for `ControlSurface` — hits should remain only in `docs/` historical files
- Boot the app both ways (`npm run dev`, and with `VITE_AXIS_WORKBENCH=0`) and confirm no
  console errors at startup — item 5 removes a boot-time call

Run the `reviewer` and `test-runner` agents, plus `workbench-reviewer` (items 9–11 touch the
framework), before committing.

## Done when

Every target above is gone or trimmed, all four verification steps are green, and no
production module imports anything that was deleted.
````

---

# M2 · Domain-group the app layer

**Goal:** 122 production files currently sit flat in `src/lib/`. Group them into domain
folders so M3, M4 and M5 are reviewable.
**Risk:** Low but wide — `npm run check` catches everything.
**Split into three sessions** so each PR stays reviewable.

> **Progress:** the approved, authoritative file → folder mapping for all of M2 lives in
> `docs/axis_refactor_plan_m2_mapping.md`. **M2a landed** (commit `8a71eac` on `full-refactor`):
> `src/lib/convert/` + `src/lib/graphs/`. Two folders were added to the skeleton below during
> M2a — `ancillary/` and `fm3edit/` — see the mapping doc. Import convention: `$lib/<folder>/x`
> for cross-folder, relative for same-folder; `vitest.config.ts` gained a `$lib` alias.
> **M2b and M2c follow the mapping doc, not the skeleton below.**

### Handoff prompt — M2a (also produces the mapping for M2b/M2c)

````markdown
# Task: domain-group the Axis app layer — part A (convert + graphs)

## Background

`src/lib/` holds 122 production files flat in one directory, alongside two well-organised
subdirectories (`workbench/`, `axis-workbench/`). The domain clusters are already obvious
from filenames — `convert*` (23 files), `device*` (20), `*graph*` (21), `cab*` (10),
`block*` (8), `modifier|modulation*` (8), `preset*` (5), `grid*` (5) — nobody has moved them.

This is the second milestone of a larger refactor. It is **pure motion**: `git mv` plus
import-path updates, zero content changes. Everything that follows depends on it, so it must
be mechanical and complete.

Read `src/lib/CLAUDE.md` and `src/lib/axis-workbench/CLAUDE.md` before starting.

## Step 1 — produce the mapping, then STOP

Before moving anything, produce the **complete** `src/lib/` production file → target folder
mapping as a markdown table, and stop for approval.

Proposed skeleton — validate it against the real file list and adjust; do not force files
into a folder that doesn't fit:

```
src/lib/
  api/        forgefx, types, help, faro
  device/     device*, catalog, blocks, grid, gridRouting, layouts, density, fm3ColorMap
  preset/     PresetBrowser, library.svelte, presetRecency, presetConvertSource,
              PresetPicker, SaveDialog, tagColors, tagRename, colorLabels
  convert/    the 23 convert*/Convert* files
  graphs/     adsr / cabAlignment / cabMic / compressor / eq / megaTap / modulation
              (.ts builders + their .svelte renderers)
  editor/     editor.svelte, editorSurface, history.svelte, modifierBindings, blockLibrary*
  shell/      TopBar, ToolRail, StatusBar          ← monolith chrome, frozen
  ui/         Knob, Toggle, Dropdown, Icon, Toast, MiniGrid, …
  platform/   direct/, buildMode, mobile.svelte, appSettings, theme.svelte, idb, shims/
```

Flag anything genuinely ambiguous in the table rather than guessing — e.g. files used by
several domains, or components that are both chrome and feature.

## Step 2 — move convert + graphs only

Once the mapping is approved, this session moves **only** `convert/` and `graphs/`
(~44 files). M2b and M2c handle the rest.

## Rules

- `git mv` so history follows the file.
- **Zero content changes** other than import paths. No renames, no reformatting, no
  "while I'm here" cleanups. A reviewer must be able to confirm the diff is motion only.
- Tests move with their subject — they are already co-located and stay that way.
- Do **not** move `src/lib/workbench/` or `src/lib/axis-workbench/`.
- `axis-workbench/` import paths WILL change as a consequence. That is expected and
  mechanical.
- The monolith is frozen for structure but open for mechanics: `PresetBrowser.svelte`,
  `TopBar.svelte`, `ToolRail.svelte`, `StatusBar.svelte` may move and may have their imports
  rewritten. Nothing else about them changes.
- Pick one import convention (`$lib/…` vs relative) and apply it consistently within the
  files you touch. State which you chose in the PR description.

## Verification

- `npm run check` — this is the primary safety net and must be clean
- `npx vitest run` — both projects
- `npx playwright test`
- Boot the app both ways (`npm run dev`, and `VITE_AXIS_WORKBENCH=0`) and click through the
  converter flow, since this session moves it

Run the `reviewer` and `test-runner` agents before committing.

## Done when

`convert*` and `*graph*` files live under `src/lib/convert/` and `src/lib/graphs/`, no
production file references their old paths, and all verification is green. The approved
mapping table is recorded in the PR description for M2b/M2c to follow.
````

**M2b** — same prompt (steps 2 onward; the mapping already exists), scope `device/` + `preset/`
+ `fm3edit/`, following `docs/axis_refactor_plan_m2_mapping.md`.
**M2c** — same prompt, scope `api/` + `editor/` + `shell/` + `ui/` + `platform/` + `ancillary/`,
following the mapping doc. This session also updates the "Component pattern" section of
`src/lib/CLAUDE.md`, which currently states "Flat, one `.svelte` per feature directly under
`src/lib/`" — no longer true.

---

# M3 · Overlay and modal layer

**Goal:** replace the flag bag and the hardcoded Escape chain with a real overlay layer, and
give the 15 dialogs one shell. Doing this **before** M4 strips 12 booleans off the editor
store and shrinks the split.
**Risk:** Medium — touches every dialog. E2E covers the workbench shell; the monolith path
needs manual verification (there is no monolith e2e harness).

### Handoff prompt

````markdown
# Task: build a real overlay/modal layer for Axis

## Background

Axis mounts 20 modal components unconditionally in `src/routes/+page.svelte`, each gating on
a boolean `$state` flag that lives on the global `editor` store. Modal priority is encoded as
a ~40-line `else if` chain in the same file's `onKey` handler:

```
Escape → tuner → history.panelOpen → cabPickerOpen → paletteOpen → quickBuildOpen
       → convertScratch.open → convert.open → presetOpen → presetSearchOpen
       → linkFrom (disarm) → editorOpen
```

Adding a dialog means touching three files and silently reordering everyone else's priority.
There is no focus trap anywhere in the app layer, 25 components hand-roll a
`position: fixed; inset: 0` backdrop, and 17 independently define a `.card` rule.

This is the third milestone of a larger refactor. **Behaviour must not change** — same
dialogs, same priority order, same visuals.

Read `src/lib/CLAUDE.md` (Component pattern section) and `src/lib/axis-workbench/CLAUDE.md`
before starting.

## Current flags (pre-M2 paths)

On `src/lib/editor.svelte.ts`:
`editorOpen:132`, `axisOpen:301`, `themeOpen:303`, `drawerOpen:304`, `portsOpen:330`,
`paletteOpen:336`, `quickBuildOpen:339`, `presetOpen:342`, `presetSearchOpen:349`,
`cabPickerOpen:350`, `deviceToolsOpen:352`, plus `inLibrary:149`.

Elsewhere: `history.panelOpen` (`history.svelte.ts:83`), `convert.open`
(`convert.svelte.ts`), `convertScratch.open` (`convertScratch.svelte.ts`).

## Scope

### 1. Dialog shell primitive

One component owning backdrop, focus trap, Escape wiring, and card chrome. Migrate the
dialogs onto it so none of them define their own backdrop or `.card`.

Reuse `src/lib/workbench/svelte/focusTrap.ts` rather than writing a second one. It is generic
mechanism with no app concepts, and app → workbench is the legal direction of the dependency
rule (`workbench/` imports nothing from the app; the app importing workbench is exactly what
`axis-workbench/` already does). Do not move or modify the file.

Visual parity matters: capture before/after screenshots of each migrated dialog. Where a
dialog's card styling genuinely differs (size, padding, accent), expose it as a prop rather
than forking the shell.

### 2. Overlay registry

Replace the boolean bag with an ordered overlay stack, so Escape priority is **data**, not
control flow. Requirements:

- The existing priority order above is preserved exactly.
- `+page.svelte`'s `onKey` no longer contains a modal `else if` chain.
- Opening/closing an overlay is one call, not a flag assignment scattered across components.
- Overlays keep working in both shells — the shared modal layer sits below the shell `{#if}`
  branch in `+page.svelte` and must stay there.

Note the special cases that are **not** plain modals and must keep their current behaviour:
`editor.tourActive` short-circuits every key handler; `editor.linkFrom` is disarmed by Escape
before `editorOpen` closes; `editor.inLibrary` is a monolith *view* switch, not an overlay —
leave it alone.

### 3. Migrate the dialogs

One commit per dialog or small related group, so a regression bisects cleanly.

## Constraints

- `src/routes/+page.svelte` is shell-agnostic and may change freely.
- The monolith is frozen for structure. In particular `ToolRail.svelte:207-231` contains the
  connection port picker as inline markup. **Leave it exactly as is** — it gets migrated when
  the monolith is retired, and moving it now would change monolith behaviour.
- Do not modify `src/lib/workbench/`.
- No new features, no bug fixes. If you find one, record it in the PR description.

## Verification

- `npx vitest run`, `npm run check`, `npx playwright test`
- **Manual pass in BOTH shells** (`npm run dev`, and `VITE_AXIS_WORKBENCH=0`): open every
  dialog, confirm Escape closes the right one when several are open, confirm focus is trapped
  and returns to the trigger on close
- Screenshot diff of each migrated dialog against `main`

Run the `reviewer` and `test-runner` agents before committing.

## Docs (same PR)

`src/lib/CLAUDE.md` — the Component pattern section documents the modal pattern as "a boolean
`$state` flag on `editor` (`xOpen`) … Escape is handled centrally in `+page.svelte` in
priority order". Rewrite it to describe the new registry, and update the "minimal end-to-end
reference feature" pointer if `TunerOverlay.svelte` is no longer the clearest example.

## Done when

No dialog defines its own backdrop or `.card`; Escape order is declared in one place as data;
the editor store carries no modal booleans; both shells behave identically to `main`.
````

---

# M4 · Split `editor.svelte.ts`

**Goal:** decompose a 2,110-line god object with ~200 public members and 51 importers into
composed stores, behind a facade so no importer breaks.
**Risk:** High — mitigated by the facade, one slice per PR, and the compile-time surface guard.
**Four sessions.** M4a first: most self-contained, least coupled to the grid components, so it
validates the facade pattern at low risk.

| Session | Slice | Contents (source banners in `editor.svelte.ts`) |
|---|---|---|
| M4a | `telemetry` | live telemetry SSE (`:266`), polling mode (`:268`, `:890`), meters (`:601`), telemetry/diagnostics (`:317`, `:829`, `:1852`) |
| M4b | `deviceSession` | connection/preset (`:77`), capability gates (`:87`), connection picker (`:329`, `:1963`) |
| M4c | `presetBuffer` | preset versions/backup (`:738`), local folder sync (`:756`, `:775`), preset nav (`:2017`), save (`:2063`) |
| M4d | `gridEditing` + `paramEditing` | grid (`:125`), grid editing (`:1616`), link mode (`:1746`) · selection (`:130`, `:1350`), param writes (`:1467`), tabs (`:154`, `:386`), swipe (`:158`, `:433`), pinned hydration (`:163`, `:515`) |

> **M4a landed** on `full-refactor`. `editor/telemetry.svelte.ts` (`TelemetryStore`, 384 lines)
> + `editor/telemetry.runes.test.ts` (31 tests); `editor.svelte.ts` 2,123 → ~1,900 lines, facade at
> the bottom of the class, all 44 importers untouched. Decisions taken that M4b–M4d inherit:
>
> - `#openEvents` + `applyDeviceEvent` moved **into** the slice; cases owned by other slices call
>   back through `TelemetryHost` (`applyTempo`, `applyScene`, `applyParamEcho`, `applyConfig`,
>   `scheduleBlockStateReload`, `scheduleStructuralReload`). The `#eventReload` debounce timer
>   stays on `EditorStore` — it is shared with `selectScene` / `setChannel`.
> - The host interface is built by a private `#telemetryHost()` factory inside `EditorStore`, not
>   by passing `this`, so the host surface never lands on the public API.
> - `poll()` / `watchPreset()` stayed on `EditorStore` (they are preset/device reads → M4b/M4c).
>   The slice owns `pollingMode` only. `linkMs` is slice state written by `poll()` through a facade
>   setter.
> - The banner at `:1852` labelled `// ── telemetry actions ──` was **mislabelled** — it holds
>   `selectScene` / `renameScene` / `renamePreset` / `renameStoredPreset` / `setBpm` / `tapTempo`.
>   Only `toggleTuner` moved; the banner is now `// ── scene / rename / tempo actions ──`. The
>   renames belong to M4c, scene + tempo to M4b.
> - The first-run chain split: the slice owns consent + Faro and calls `host.onConsentResolved()`;
>   the Ko-fi notice and the tour stayed on `EditorStore` as onboarding.
> - `monitorParams` / `loadMonitorParams` / `monitorsByPid` / `openBlockMonitors` stayed — that is
>   the monitor *param table* (phantom-param suppression for the block editor), not live telemetry.
>   So did the grid-read `meters` map and `meterFor`.
>
> **Bug found, not fixed** (global rule 3): `startLiveMeters()`'s `if (this.#liveMeterTimer) return`
> guard does not hold while a tick is in flight — `tick()` nulls the handle as its first statement
> and runs synchronously from `startLiveMeters()`. Two overlapping `load()` calls therefore stack a
> second meter loop and double the poll cadence. Pre-dates the refactor (identical on `main`); both
> behaviours are pinned in `telemetry.runes.test.ts` so a fix has to update the test deliberately.

### Handoff prompt — M4a (template for M4b–M4d)

````markdown
# Task: extract the telemetry slice out of `editor.svelte.ts`

## Background

`src/lib/editor.svelte.ts` is a 2,110-line singleton class with roughly 200 public
fields/methods plus 27 getters, imported directly by 51 modules. It carries about 20
unrelated responsibilities, marked in the file by `// ── section ──` banners: connection,
capability gates, grid state, selection, view chrome, parameter tabs, swipe controls, pinned
param hydration, mobile density, SSE telemetry, polling mode, meters, lifecycle, Electron
auto-update, preset versions, local folder sync, param writes, grid editing, preset nav,
save, toasts.

Its size is why `src/lib/editorSurface.ts` — the seam built to decouple the grid components —
needs 100+ members to describe "the subset those components use", and why the store has
almost no unit tests.

This is the first of four extraction sessions. **The pattern you establish here is followed
by the other three, so get it right and document it.**

Read `src/lib/CLAUDE.md` (Store pattern section) before starting.

## Method — facade first

Do **not** update the 51 importers. Extract the slice into its own `*.svelte.ts` store, then
have `EditorStore` hold an instance and re-expose the slice's members by delegation, so every
existing call site keeps working unchanged.

```ts
// sketch — adapt to the real members
class EditorStore {
  #telemetry = new TelemetryStore(/* injected deps */);
  get meters() { return this.#telemetry.meters; }
  toggleMetering = () => this.#telemetry.toggleMetering();
}
```

Call-site migration (importing the slice directly instead of through `editor`) is a
**separate, later PR**. Never in the same commit as the extraction.

## The contract that must not break

`src/lib/editor.svelte.ts:2110` ends with:

```ts
export const _editorSatisfiesSurface: EditorSurface = editor;
```

This compile-time guard forces the singleton to satisfy the `EditorSurface` interface in
`src/lib/editorSurface.ts`. It must still typecheck after the extraction. If it doesn't, the
facade is incomplete — fix the facade, do not weaken the guard or the interface.

## Slice: telemetry

Sections to extract (line numbers are pre-M2; locate by banner text if files have moved):

- `// ── live telemetry (SSE) ──` (~266)
- `// ── device-telemetry polling mode (META-17) ──` (~268 state, ~890 actions)
- `// ── live audio meters (per-block monitor level, normalized→dB) ──` (~601)
- `// ── telemetry / diagnostics ──` (~317 state, ~829 actions, ~1852 more actions)

Includes the `scrubPII` helper near the top of the file and the telemetry-consent /
instance-id / polling-mode localStorage loaders.

## Constraints specific to this slice

- **Poll-loop discipline.** `poll()` and `watchPreset()` are re-entrancy-guarded (`#polling`
  / `#watching`) and throttled. `src/routes/+page.svelte` owns the intervals via a `$effect`
  keyed on `editor.pollingMode`. Preserve all of this exactly — an unguarded device read in
  the poll loop has previously caused multi-second lag on slow links.
- **SSE stays single-path.** `#openEvents` feeds `applyDeviceEvent`, one `switch` over the
  `DeviceEvent` union, with an `#eventReload` debounce. Do not add a parallel timer or a
  second event path.
- **Capability gating.** Telemetry reads must stay capability-gated — devices that silently
  ignore frames cause 5s serial-queue timeouts. Whatever gate exists today moves with the
  slice intact.
- **Privacy.** `scrubPII` and the consent-default-OFF behaviour are load-bearing. Consent
  defaults to off; the instance id is a random uuid and never PII.
- The slice must not import back from `editor.svelte.ts`. Inject what it needs (the existing
  `syncBus.ts` and `history.bindHost` are the in-repo precedents for breaking such a cycle).

## Tests (required)

Add `src/lib/<newModule>.runes.test.ts`. It runs in the `runes` vitest project, which
compiles rune modules against the **client** runtime — the naming is load-bearing. Do not
reach for `@sveltejs/vite-plugin-svelte`: it compiles in SSR mode where `$state` is an inert
plain value and reactivity assertions pass vacuously.

`src/lib/library.runes.test.ts` is the worked example (proxy identity + derived invalidation).

Cover at minimum: polling-mode transitions, meter normalization, the consent gate, and that
`scrubPII` strips emails and home-directory usernames.

## Verification

- `npx vitest run` — both projects; the new `runes` test must actually assert reactivity
- `npm run check` — including `_editorSatisfiesSurface`
- `npx playwright test`
- Manual: connect to a device (or the dev server), confirm meters update, the telemetry
  polling-mode switch still changes cadence, and diagnostics upload still works

Run the `reviewer` and `test-runner` agents before committing.

## Docs (same PR)

`src/lib/CLAUDE.md` — the Store pattern section states `editor.svelte.ts` is "~1865 lines"
(it is 2,110 today and will shrink). Update the line count, describe the facade + slice
pattern you established, and note which slices remain to be extracted.

## Done when

The telemetry slice is its own store with runes tests, `EditorStore` delegates to it, all 51
importers are untouched and green, and the facade pattern is documented for M4b–M4d.
````

**M4b/M4c/M4d:** reuse this prompt verbatim, swapping the slice section, the slice-specific
constraints, and the test focus. Constraints worth carrying per slice:
**M4b** — the dominant idiom is the capability gate
(`get hasX() { return this.isV2 ? !!this.caps?.x : <legacy isAm4 branch>; }`); v2 caps fields
are optional by design so legacy payloads degrade to the `isAm4` branches.
**M4c** — save is destructive (overwrites a preset slot); the `syncBus.notifyMutation` hook is
registered by `editor.init()` and must keep firing.
**M4d** — the canonical action shape is optimistic update → await → revert on catch; this
slice backs most of `EditorSurface`, so the guard is at its most sensitive here.

---

# M5 · Un-invert the axis-workbench registries

**Goal:** the framework offers one component per type; the binding registers one component for
all of them and re-switches inside. Split them.
**Risk:** Medium-high, mostly CSS partitioning.
**Parallelisable** with M3/M4 after M2 — disjoint file set.

### Handoff prompt

````markdown
# Task: split the axis-workbench mega-switch components into per-type components

## Background

`src/lib/workbench/svelte/renderRegistry.ts` supports registering one Svelte component per
panel/widget type. The Axis binding bypasses this: it registers a **single** component for
every type and re-switches inside it.

| File | Lines | Types it switches over |
|---|---|---|
| `axis-workbench/widgets/AxisWorkbenchWidget.svelte` | 1,596 | 24 widget types |
| `axis-workbench/panels/preset-browser/AxisPresetBrowserPartPanel.svelte` | 2,618 | 4 parts |
| `axis-workbench/panels/fc/AxisFcPartPanel.svelte` | 1,302 | 7 parts |

The widget file carries 715 lines of CSS for 24 unrelated widgets; the preset-browser panel
carries 1,209. Adding a widget means editing the largest file in its directory — which is
exactly what the `/new-widget` recipe currently instructs.

This is behaviour-preserving refactoring. Nothing about how the app looks or behaves changes.

Read `src/lib/axis-workbench/CLAUDE.md` in full before starting — the registration flow,
theming rules and mirror rules there are binding.

## Scope

### 1. Split the three components

One component per type/part, wired directly in `axis-workbench/axisWorkbenchRegistry.ts`. The
type strings still come from `axisWorkbenchRegistryManifest.ts` — that stays the single source
of truth, and no literal type string may bypass it.

The widget kinds are: `logo, preset, scenes, tuner, tempo, cpu, meterToggle, save, search,
history, gridMap, undoRedo, connection, account, gridMode, blockSize, fcDevice, fcLayouts,
fcSwitchView, paramControl, sectionHeader, hint, legal, telemetry`.

`AxisWorkbenchWidget.svelte` also holds a shared `activate()` click dispatcher and shared
derived state. Factor those into a small shared module rather than copying them into 24 files.

### 2. CSS partitioning — the hard part

Move each type's rules into its own component. Genuinely shared rules become a small shared
style module or a design token. Rules that only *look* shared (same class name, different
values) get inlined per component.

**No hex literals.** `workbench/svelte/*.svelte` is unit-test enforced; `axis-workbench/`
components may use app tokens (`--accent`, `--bg2`, `--text`, `--danger`, `--ok`, `--amber`,
`--font-mono`) and `--aw-*` tokens, but never raw hex.

### 3. Clean up `axisWorkbenchRegistry.ts`

- Replace the `type === 'x' ? ComponentX : …` ternary chains with direct per-type mapping.
- Move the inline placeholder-panel copy (the user-facing strings in the `axis.openScenes` and
  `axis.openLive` action `state` payloads) out of the registration calls into data.
- Pick one way to reach the editor store. The file currently does both a top-level
  `import { editor } from '../editor.svelte'` and a dynamic `async function axisEditor()`.
  Keep one and explain the choice in a comment.

### 4. Unify the duplicated search-index effect

`AxisPresetBrowserPartPanel.svelte:141` and
`axis-workbench/presetBrowser/AxisPresetBrowserSearchOverlay.svelte:79` contain the same
seven-line `$effect` calling `preparePresetBrowserIndex`. Extract it once. Both call sites
must keep passing `library.paramsOf` — that feed is what makes deep parameter filtering work,
and a regression there silently returns wrong search results.

## Must not break

- **The single pin destination.** Every pin path resolves to the one `axis.myControls` panel
  instance. `createAxisPinSelectedParametersAction` ignores any `panelId`/`title` args by
  design — do not "fix" that.
- **Drag-to-pin stays retired.** `WORKBENCH_PARAMETER_SOURCE_EDGE_DROP_ACTION` is deliberately
  NOT registered, and `DockWorkspace`/`TabStack` gate their parameter-drop handlers on
  `registry.hasAction(...)`. Do not register it to make a dead drop target work.
- **Section-header semantics.** `axis.sectionHeader` is a marker widget claiming a full grid
  row via `state.grid.colSpan: 'full'`; removing a *named* header cascades to the controls
  under it via `axisMyControlsSectionRemovalIds`; a *blank* divider cascades nothing;
  `axisMyControlsWidgetCount` excludes headers. All of this is registered generically in
  `axisWorkbenchRegistry.ts` and must survive the split intact.
- **Widget-fit math.** `registry.registerWidgetSizing({ estWidth, isKeep })` feeds
  `widgets/widgetEstWidths.ts`. A missing `estWidth` entry silently breaks overflow trimming —
  every type must keep its entry.
- **Normalization idempotence.** Do not touch the chain in `axisWorkbenchStore.svelte.ts`
  (migrate → ensureGridControls → pruneRetiredRail → ensureMobileBottomNav →
  ensureAxisMyControlsPanel). Running it twice must equal running it once.
- **`src/lib/workbench/` keeps zero app imports.**

## Verification

- `npx vitest run`, `npm run check`
- `npx playwright test` — all 19 specs; `05-widgets.spec.ts` and `12-widget-menu.spec.ts` are
  the load-bearing ones here
- `npm run test:workbench-visual`
- Manual: every widget renders identically, every widget context menu behaves the same, the
  preset browser's four parts and the FC's seven parts all render, and pinning still lands in
  My Controls

Run `workbench-reviewer` **and** `reviewer` and `test-runner` before committing.

## Docs (same PR)

- `src/lib/axis-workbench/CLAUDE.md` — the "Recipe: add a widget" and "Recipe: add a panel"
  sections instruct editing the mega-switch (`add an {:else if kind === 'X'} render branch`).
  Rewrite both for per-type components. Also update the `AxisWorkbenchWidget.svelte`
  description under the Axis binding layer bullet list.
- `.claude/commands/new-widget.md` and `.claude/commands/new-panel.md` — same change.

## Done when

No component switches over more than one registered type, the registry maps types directly,
CSS lives with its component, all e2e and visual smoke pass, and the recipes describe the new
structure.
````

---

# M6 · UI primitives *(optional, opportunistic)*

**Goal:** extract shared visual primitives from the measured duplication — `.card` in 17
components, `.chip` in 6+, `.row` in 27, against 13,897 lines of component CSS and only 64
tokens in `src/app.css`. M3 already delivers the dialog shell; this is the non-modal
remainder (`Card`, `Chip`, `Button`, `Field`).
**Risk:** Low. Easy to defer, easy to do piecemeal.

Handoff prompt follows the M3 template: behaviour- and pixel-preserving, screenshot diffs per
migrated component, one commit per primitive, tokens over hex, monolith frozen for structure
(it may consume a primitive only if that's a pure markup-for-markup swap — otherwise leave it).

---

# M7 · Documentation consolidation

**Goal:** ~11k lines of docs, of which ~6,300 are process artifacts that read as current spec.

### Handoff prompt

````markdown
# Task: consolidate and de-stale the Axis documentation

## Background

`docs/` holds ~11k lines. About 6,300 of those are **process artifacts** — a 2,193-line
progress log (156 KB), a 2,337-line rebuild plan, a 790-line verification report, a 597-line
implementation-status doc, a 394-line review/remaining-plan — that describe intent at a past
moment but read as current specification. Only ~1k lines are durable reference
(`LAYOUTS.md`, `TELEMETRY.md`, `RELEASING.md`, `ROADMAP.md`, `design-spec.md`,
`mobile-ios.md`, `decisions/`).

Several documents reference subsystems that no longer exist: ControlSurface (deleted) and
Axis Cloud (removed — preset sync, accounts and the Axis Remote relay).

A multi-milestone refactor has just landed. This session brings the documentation back in
line with the code.

## Scope

### 1. Archive the process docs

Move to `docs/archive/`, each with a dated header stating it is historical and not current
specification:

- `axis_layout_rework_progress_log.md`
- `axis_layout_rework_review_and_remaining_plan.md`
- `axis_workbench_design_aware_rebuild_plan_for_claude_code.md`
- `axis_workbench_implementation_status_and_next_plan.md`
- `axis_workbench_verification_report.md`

Judgement call: `docs/workbench-dc-parity/` is design-parity reference that the code still
cites by section number (e.g. "01-shell.md §9"). Keep it live unless you find those citations
are all stale — check before moving.

### 2. Purge stale subsystem references

Grep for `ControlSurface` and `Axis Cloud` across `docs/` and the repo root. Anything outside
`docs/archive/` either gets corrected or gets an explicit historical marker.

### 3. Refresh both CLAUDE.md files against the post-refactor tree

`src/lib/CLAUDE.md`:
- Store pattern — the `editor.svelte.ts` line count and the new facade/slice composition
- Component pattern — no longer "flat, one `.svelte` per feature directly under `src/lib/`";
  describe the domain folders
- The modal pattern paragraph — describe the overlay registry
- Testing reality — refresh the coverage claims

`src/lib/axis-workbench/CLAUDE.md`:
- The widget/panel recipes and the `AxisWorkbenchWidget.svelte` description
- The runtime-adapter registration step

Both files are load-bearing for future agent sessions. Accuracy matters more than brevity —
but verify every factual claim (line counts, file paths, spec counts) against the tree rather
than copying forward.

### 4. Decide the progress-log rule

`src/lib/CLAUDE.md` currently mandates: *"On the layout-rework branch, also update
`docs/axis_layout_rework_progress_log.md` after every step."* If that log moves to
`docs/archive/`, the mandate must either follow it there or be restated for current work.

**This is a process decision, not a file question — surface it to the operator and do not
decide it unilaterally.**

### 5. Update the slash-command skills

`.claude/commands/*.md` — `implement-feature`, `new-widget`, `new-panel`,
`new-runtime-adapter`, `plan-feature`, `new-endpoint`, `cross-repo-feature`. Any that
reference the old structure need updating.

## Verification

- Every file path, line number and command named in the docs actually exists / runs
- `npx vitest run`, `npm run check` still green (doc-only changes should not affect these, but
  `axis-workbench/CLAUDE.md` claims are asserted by some tests — confirm)
- No non-archive document references a deleted subsystem

## Done when

`docs/` distinguishes current reference from historical record, both CLAUDE.md files describe
the tree as it actually is, and the progress-log mandate has an explicit operator decision
recorded.
````

---

# M8 · Deferred — port the remaining workbench gaps

Not part of this refactor. Recorded so it isn't lost.

An earlier shell-parity audit found five gaps where the workbench (default shell) trails the
monolith. Gap 1 — deep parameter filtering silently matching everything — **has been fixed**;
`presetBrowserWorkbenchQuery.ts` now shares `matchParamCond` and the weighted CPU estimate,
and the hosts feed `library.paramsOf` into `preparePresetBrowserIndex`.

Remaining:

| Gap | Severity | Fix |
|---|---|---|
| Desktop auto-update UI absent | Real loss | New widget — `downloadUpdate`/`installUpdate`/`dismissUpdate` exist only in `TopBar.svelte` |
| Device Tools unreachable | Real loss | Panel exists with a singleton key and library template, but no preset's `buildDock()` includes it and there is no nav id. Add a nav entry |
| Output level meter + link latency absent | Minor | New widget — `editor.levels` / `editor.linkMs` render only in `TopBar.svelte` |
| `axis.connection` dead click | Bug | Point it at `editor.openAxis('device')` (the Axis hub Connection tab already does full serial + MIDI port picking) instead of `editor.openPorts()`, whose UI is markup inside `ToolRail.svelte` |
| `axis.search` dead click | Bug | Point it at `editor.presetSearchOpen` (overlay already mounted) instead of `editor.openLibrary()`, which only the monolith branch reads |

The first two are the only real ports. Both get easier after M5 — they become new files rather
than branches 25 and 26 of a mega-switch. Once M8 lands, the monolith retirement decision can
be revisited.

---

## Overall verification

Every milestone ends with all of:

```bash
npx vitest run          # node + runes projects
npm run check           # svelte-kit sync && svelte-check
npx playwright test     # 19 workbench-shell e2e specs
npm run test:workbench-visual   # M5 and any workbench/ change
```

Plus a manual pass **in both shells** — `npm run dev` for the workbench, and
`VITE_AXIS_WORKBENCH=0 npm run dev` for the monolith. There is no monolith e2e harness, so
monolith behaviour is only ever verified by hand; every milestone that can reach it (M1, M2,
M3, M4) must include that pass.

Agents before every commit: `reviewer` and `test-runner`; add `workbench-reviewer` for any
change under `src/lib/workbench/` or `src/lib/axis-workbench/`.
