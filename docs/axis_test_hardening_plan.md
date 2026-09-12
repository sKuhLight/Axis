# Axis test hardening — milestone plan

> Companion to `docs/axis_refactor_plan.md`. That plan restructured the code; this one gives the
> next restructuring a net to fall into. Written to be executed by Sonnet sessions, one milestone
> per session.

## Context

The suite is green and structurally sound: **149 unit files / 1762 tests** across two vitest
projects, **20 e2e specs / 60 tests**, `svelte-check` clean. The `runes` project compiles
`*.svelte.ts` in *client* mode on purpose — the server runtime makes `$state` inert and would let
every reactivity assertion pass vacuously. That trap is already avoided.

Two facts shape everything below:

- **No coverage tooling exists.** No `@vitest/coverage-*`, no thresholds. "Solid" is currently
  unmeasurable, which is why T7 exists.
- **Components are never unit-mounted, by design** (`vitest.config.ts`: "Scope is deliberately
  narrow: rune MODULES only"). So ~200 `.svelte` files — `SignalGrid` (1,583), `PresetBrowser`
  (1,560), `ModifierEditorCore` (1,042) — rest entirely on 60 e2e tests. **Do not change this
  policy.** Every milestone here adds logic tests or e2e, never component mounts.

## Findings this plan acts on

| # | Finding | Evidence | Milestone |
|---|---|---|---|
| A | 54KB of live-hardware LFO ground truth is unused | `docs/handoff/modulation-graph-shapes/measurements/fm3-lfo-folded.json` — 13 captures, 7 types × 2 Shapes × 200 bins — referenced only in *comments* (`modulationGraphs.ts:76`, `modulationGraphs.test.ts:194`) | T1 |
| B | Half the LFO types have no hardware capture | `modulationValue` handles 14 type strings; captures cover 7. `square`/`pulse`/`astable`/`random`/`noise` unmeasured | T2 |
| C | A measured compressor capture was never digitised | `measurements/knee/official-018.png` exists; `CAPTURES` in the test holds 007, 013, 376 only | T3 |
| D | Compressor parity is narrow | Ratio exercised at 2 and 4 only; Knee at MED (1) and absent only | T3 |
| E | Thin graph modules | `adsrGraphs` 2 cases/54 lines, `megaTapGraphs` 2/52, `cabAlignmentGraphs` 3/52 | T4 |
| F | The facade guard cannot catch a dropped setter | `_editorSatisfiesSurface` is compile-time; assigning to a getter-only property is a silent no-op. `editorSurface.test.ts` is 22 lines and tests only context fallback | T5 |
| G | Largest untested logic module | `presetBrowserWorkbenchView.svelte.ts`, 870 lines, zero tests — and preset-browser logic caused 3 of the last 5 shipped bugs | T6 |
| H | No pixel baseline | `test:workbench-visual` asserts only that a screenshot is >10KB and not blank. Both Button/scrim regressions needed a human reviewer | T7 |

**Deliberately not touched — these are already good:** `compressorGraphs` parity captures (the
model to copy), `workbench/core` reducer/invariant coverage, the M4 editor slice tests (2,402 LOC),
the `overlays` registry tests, and the node/runes project split.

---

## Global rules — apply to every milestone

1. **Tests only.** No production behaviour changes. If a new test fails because the *code* is
   wrong, record it in the milestone report and stop — do not fix it in the same PR.
   (Exception: T5 may add a small exported helper if the guard genuinely needs one.)
2. **Never widen a tolerance to make a test pass.** A parity test that drifts loose is worse than
   none. If the measured error exceeds the threshold, report it as a finding.
3. **No component mounting.** See above. Logic modules and e2e only.
4. **Ends green.** `npx vitest run`, `npm run check`, and `npx playwright test` for any milestone
   touching `e2e/`.
5. **Every new test asserts a stated behaviour, not a snapshot of current output.** Name the case
   after the property it protects, matching the existing style
   (`'is monotonic across the plotted window'`, not `'matches snapshot'`).
6. **Agents before commit:** `reviewer` and `test-runner`; add `workbench-reviewer` for anything
   under `src/lib/workbench/` or `src/lib/axis-workbench/`.
7. Locate code by symbol name, not line number — line numbers in these prompts will drift.

## Scheduling

```
T1 ─→ T2      (same file, sequential)
T3 ─→ T4      (same pattern, sequential — but T3 can start immediately)
T5            (independent)
T6            (independent)
T7            (independent; do LAST — it freezes baselines)
```

T1/T2, T3/T4, T5, and T6 touch disjoint files and can run in four concurrent sessions.
T7 must be last: it records coverage numbers and pixel baselines, which every earlier milestone
changes.

---

# T1 · Pin the modulation waveforms to the hardware captures

**Goal:** make `modulationValue` provably match a live FM3, the way `compressorGraphs` already
matches FM3-Edit.
**Risk:** Low for the code, **medium for getting the test right** — there is one non-obvious trap
(§ Method, step 3). Read that section twice.

### Handoff prompt

````markdown
# Task: wire the FM3 LFO hardware captures into the modulation graph tests

## Background

`src/lib/graphs/modulationGraphs.ts` models the FM3's LFO waveforms. Its 23 existing tests in
`modulationGraphs.test.ts` are all *internal-consistency* assertions — "Exp and Log are mirrored
around the Shape ramp", "Trapezoid holds each extreme for a quarter cycle". They are good tests,
but nothing pins the curve to the hardware. The waveform model was difficult to get right and is
the most likely thing in this repo to silently regress.

The ground truth already exists and is unused:
`docs/handoff/modulation-graph-shapes/measurements/fm3-lfo-folded.json`.

Read `docs/handoff/modulation-graph-shapes/measurements/README.md` first — it explains how the
data was captured and what it settled. Read
`src/lib/graphs/compressorGraphs.test.ts` § "parity with the FM3 editor" second — that is the
pattern to copy.

## The data

13 captures, keyed `<TYPE>_b<shape*1000>`:

    EXP_b242  EXP_b500  LOG_b242  LOG_b500  SAW_DOWN_b242  SAW_DOWN_b500
    SAW_UP_b242  SINE_b242  SINE_b500  TRAPEZOID_b242  TRAPEZOID_b500
    TRIANGLE_b242  TRIANGLE_b500

Each value is `{ hw: number[200], shape: number, type: string }`. `hw` is the folded waveform
normalised to −1..+1 across 200 phase bins. `shape` is 0.242 or 0.5. `type` is the uppercased
waveform name — lowercase it to pass to `modulationValue`.

Note SAW_UP has only a b242 capture. Do not invent a b500 entry.

## Method

1. Import the JSON directly in `modulationGraphs.test.ts`. The `node` vitest project resolves
   JSON imports; no fixture copying, no `fs` read. Keep the test pointed at the file in `docs/`
   so the data has exactly one home.

2. For each capture, evaluate `modulationValue(type.toLowerCase(), i / 200, { shape })` for
   `i` in `0..199`. Leave `duty` unset — it defaults to 0.5, where the duty bias is the identity,
   which is the condition the captures were taken under.

3. **The trap — the captures are phase-unaligned.** Folding recovers a waveform's *shape* but not
   where in the cycle it starts (README § Method, last paragraph). `SAW_DOWN_b242` starts at
   +0.124 and `SAW_UP_b242` at +0.594, not at the trough. A naive bin-for-bin comparison will
   fail on every capture for reasons that have nothing to do with the model.

   Score it the way `verify.py` does — search all 200 circular shifts and take the best:

   ```
   rms = min over sh in 0..199 of
         sqrt( mean over i of ( hw[(i + sh) % 200] - model(i / 200) )^2 )
   ```

   `docs/handoff/modulation-graph-shapes/measurements/verify.py` is the reference implementation
   of exactly this (`def rms`). Port it faithfully.

4. Assert a **per-capture** RMS threshold, not one global number. The residuals differ by an order
   of magnitude between waveform families and a single loose threshold would hide a regression in
   the tight ones.

   Running `verify.py` today gives these RMS values for the current model. Confirm your TypeScript
   port reproduces them (it should, to ~0.001 — the TS and the script implement the same model),
   then set each threshold a little above the measured value:

   | capture | RMS | | capture | RMS |
   |---|---|---|---|---|
   | SINE_b500 | 0.017 | | TRAPEZOID_b500 | 0.038 |
   | SINE_b242 | 0.026 | | TRIANGLE_b500 | 0.047 |
   | TRAPEZOID_b242 | 0.055 | | TRIANGLE_b242 | 0.056 |
   | EXP_b242 | 0.085 | | EXP_b500 | 0.090 |
   | LOG_b242 | 0.090 | | LOG_b500 | 0.092 |
   | SAW_DOWN_b242 | 0.171 | | SAW_DOWN_b500 | 0.189 |
   | SAW_UP_b242 | 0.224 | | | |

   If your numbers differ materially from these, **stop and report it** — it means the TS model and
   the Python reference have diverged, which is itself the finding.

5. **The saw residual is known and unresolved.** README § "Known residual": the measured saw holds
   near its crest for 13–26% of the period before decaying, and a single exponential ramp does not
   reproduce that plateau; part of the residual is measurement artefact from the modifier damping.
   Encode this as a test that *documents* the limit — assert saw stays under its threshold **and**
   add a comment pointing at the README section. Do not try to fix the model.

6. **Add a negative control.** The single most valuable part of the compressor parity suite is
   `'needs the measured window and Level — the old -60..+20 window without Level is wildly off'`,
   which proves the test can fail. Do the same here: score the *superseded* model against the data
   and assert it is materially worse. `verify.py`'s `def old` is that model — a plain
   `sin(2πp)` sine, a base-10 log/exp bend, and a fixed-curvature (3.09) saw. It scores mean 0.201
   against the new model's 0.091, and 0.863 on SAW_UP_b242 against 0.224. Assert the old model's
   error exceeds a threshold comfortably above the new model's, on at least SINE_b242, LOG_b500 and
   SAW_UP_b242.

7. Add one test asserting the mean RMS across all 13 captures stays under ~0.10. This is the
   single number the README reports improving (0.201 → 0.091) and is the headline regression guard.

## Do not

- Do not widen a threshold to make something pass. Report instead (global rule 2).
- Do not modify `modulationGraphs.ts`. This milestone is tests only.
- Do not move or reformat the JSON, or regenerate it — the capture scripts need live hardware.
- Do not delete or rewrite the 23 existing tests. They cover things the captures cannot (duty
  cycle, tempo division, graph binding). Add alongside.

## Done when

`npx vitest run` is green with 13 new parity cases, at least 3 negative-control cases, and a mean
RMS case. `npm run check` clean.
````

---

# T2 · Close the modulation coverage gaps

**Goal:** test the seven waveform behaviours the hardware captures do not reach.
**Risk:** Low. **Depends on T1** (same file).

### Handoff prompt

````markdown
# Task: cover the untested LFO waveforms and waveform invariants

## Background

`modulationValue` in `src/lib/graphs/modulationGraphs.ts` accepts 14 type strings. After T1, seven
are pinned to hardware captures. These are not covered by any capture:

    square, pulse, astable, random, noise, ramp up, ramp down

Read `src/lib/graphs/modulationGraphs.test.ts` first and match its naming style — cases are named
after the property they protect.

## Targets

### 1. `square` / `pulse`

`phase < duty ? 1 : -1`. Assert: the two names are aliases; the transition sits exactly at `duty`;
the output is only ever ±1 (never an intermediate); `shape` has no effect on it.

### 2. `ramp up` / `ramp down` are aliases of `saw up` / `saw down`

One test asserting the pairs agree at every phase, for both Shape 0.242 and 0.5. This alias is a
one-line branch in the source and is exactly the kind of thing a refactor drops.

### 3. `random` / `noise` — deterministic, so assert exactly

These are **not** `Math.random()`. They are seeded:

```
const sample = Math.floor(phase * steps) + (randomSeed ?? 0) * steps;
const x = Math.sin(sample * 12.9898 + 78.233) * 43758.5453;
return (x - Math.floor(x)) * 2 - 1;
```

Assert: the same `(phase, randomSteps, randomSeed)` always returns the same value; the value is a
step function with exactly `randomSteps` plateaus per cycle; different seeds give different
sequences; output stays within −1..+1; `randomSteps` is clamped to at least 1 and rounded.
There is one existing case (`'holds one value a cycle when the graph says so, and two by default'`)
— extend around it, do not duplicate it.

### 4. `astable`

`curvedRamp` over each half-cycle, mirrored. Assert: it is symmetric about phase 0.5; it is
distinct from `triangle` at the same Shape (there is an existing case asserting this — keep it);
it reaches ±1; Shape controls the curvature.

### 5. Duty Cycle on the remaining waveforms

The existing duty tests cover sine, square, exp, log, trapezoid, triangle. Extend to `saw up`,
`saw down`, `astable`. Note from the source comment: duty biases the *triangle*, and sine/log/exp
derive from it — so check whether duty reaches saw and astable at all. **If it does not, that is a
finding, not a test to force.** Record it and move on.

### 6. Cross-cutting invariants — one table-driven test over all 14 types

For every type × Shape {0.1, 0.242, 0.5, 0.9} × Duty {0.05, 0.5, 0.95}:

- output always within −1..+1 inclusive (guards the `dutyBiased` clamp and `curvedRamp` overflow);
- `modulationValue(type, 0)` equals `modulationValue(type, 1)` to within a small epsilon
  (cycle continuity — skip the discontinuous types: square, pulse, saw, ramp, random, noise);
- phase wraps: `f(t)` equals `f(t + 1)` and `f(t - 1)` for fractional `t`;
- no `NaN` or `Infinity` anywhere, including at the clamp edges Shape 0.01 / 0.99.

This one test is cheap and catches a whole class of regression.

### 7. `modulationRate` edge cases

Existing coverage is 2 cases. Add: an unparseable tempo label falls back to free rate; `bpm <= 0`
falls back; `'NONE'` and `'OFF'` both fall back; dotted *and* triplet on the same label.

## Done when

`npx vitest run` green. Any behaviour you could not assert because the code does not support it is
written up in the milestone report rather than worked around.
````

---

# T3 · Close the compressor parity gaps

**Goal:** use the fourth measured capture, and widen parity past the two ratios currently tested.
**Risk:** Low. Digitising a PNG is the only manual step.

### Handoff prompt

````markdown
# Task: extend the compressor graph parity suite

## Background

`src/lib/graphs/compressorGraphs.test.ts` is the best test file in this repo — curves digitised
from FM3-Edit screenshots, asserted to within 2px of a 344px plot box, with a negative control.
This task widens it. Read it in full first; do not restructure it.

## Targets

### 1. Digitise `official-018.png`

`docs/handoff/compressor-graph/measurements/knee/` holds four captures: `official-007`,
`official-013`, `official-018`, `official-376`. The `CAPTURES` array in the test has only 007, 013
and 376. 018 was measured and never used.

`docs/handoff/compressor-graph/digitize_knee.py` is the script that produced the existing point
arrays — use it rather than eyeballing. You will need 018's Threshold, Ratio, Knee Type, Level and
variant; check `docs/handoff/compressor-graph/README.md` and `knee_curves.json` first, which may
already hold them. **If the parameters for 018 are not recorded anywhere, stop and report that** —
do not guess them from the curve, which would make the test circular.

### 2. Ratio and Knee sweep

Current parity covers ratio 4, 4, 2 and knee MED(1) or absent. Add coverage across the ratio and
knee-type ranges the device serves, using `ratioTransfer` + `ratioCurveY` and the existing
structural assertions (monotonic, approaches unity below threshold, approaches the ratio slope
above it, corner rounds rather than breaks). These are *structural*, not parity — you have no
captures for other settings, so do not claim parity you cannot measure.

### 3. Assert the unmodeled parameters really are ignored

The capture comment states Auto Makeup, Mix and input Gain are "the two the curve does not model"
(the count is off; three are named). Right now that is a comment. Make it a contract: assert
`ratioTransfer` / `sustainTransfer` produce identical output regardless of those inputs. This
converts an undocumented limitation into a stated one, so a future change that starts modelling
them fails loudly here.

### 4. `kneeSharpness` direct coverage

It is exercised only indirectly through `kneeAt`. Add direct cases: each Knee Type enum value maps
to its sharpness; a null knee falls back to the variant's own default; an unrecognised variant
falls back safely.

## Do not

- Do not modify `compressorGraphs.ts`.
- Do not loosen the existing 2px / 2.5px tolerances.
- Do not delete the negative-control case.

## Done when

`npx vitest run` green with a 4th parity capture, and 018's parameters either used or reported as
unrecoverable.
````

---

# T4 · Invariant sweep for the thin graph modules

**Goal:** bring the five lightly-tested graph modules up to a floor of structural coverage.
**Risk:** Low.

### Handoff prompt

````markdown
# Task: add structural invariant tests to the thin graph modules

## Background

Test density across `src/lib/graphs/`:

| module | prod | test | cases |
|---|---|---|---|
| adsrGraphs | 54 | 37 | 2 |
| cabAlignmentGraphs | 52 | 52 | 3 |
| megaTapGraphs | 52 | 30 | 2 |
| cabMicGraphs | 89 | 89 | 7 |
| eq | 98 | 88 | 8 |

Compare against `compressorGraphs` (282/278/24) and `modulationGraphs` (220/321/23) for the house
standard. These five draw real UI and have no parity data, so the goal is structural
invariants, not curve matching.

## Method

For each module, add a table-driven test covering the invariants its `derive*` function must hold.
Use `src/lib/graphs/eqGraphs.test.ts` (17 cases) as the local model for how to bind fixture params
and assert on derived specs. `src/lib/fixtures/blockParams/` holds real device params — prefer them
over hand-built objects, as `compressorGraphs.test.ts` does with `comp.json`.

Invariants to cover per module:

- every derived point is finite — no `NaN`/`Infinity` at parameter extremes or with params absent;
- output stays inside the module's declared plot window;
- a derive call with **no live params** returns an empty/degenerate spec rather than a half-drawn
  graph (`cabMicGraphs` already has `'skips a slot whose position or pan is not live rather than
  half-drawing it'` — that is the property to replicate);
- the graph takes its slot from the device-authored `graphIndex` where the module supports one, not
  the layout ordinal (`compressorGraphs` has this case; check which others need it);
- monotonicity or symmetry where the shape demands it.

## Do not

- Do not add snapshot tests. Assert named properties (global rule 5).
- Do not modify any `graphs/*.ts` source.

## Done when

Each of the five modules has at least 8 cases, `npx vitest run` green.
````

---

# T5 · A runtime guard for the editor facade

**Goal:** catch a dropped setter, which is the specific failure the next store refactor risks and
the current guard structurally cannot see.
**Risk:** Low. High value per line.

### Handoff prompt

````markdown
# Task: add a runtime surface guard for the editor store facade

## Background

`src/lib/editor/editor.svelte.ts` is a facade: after the M4 milestones its state lives in five
slices (`telemetry`, `deviceSession`, `presetBuffer`, `gridEditing`, `paramEditing`) and the facade
re-exposes every member so the ~56 modules that import `editor` keep working. Its public surface is
**226 unique members** (274 declarations, counting getter/setter pairs separately): **92 getters but
only 24 setters**, so 68 getters are intentionally read-only and 24 are the writable seam this test
protects.

Two guards exist and **neither catches the dangerous case**:

- `_editorSatisfiesSurface` in `editor.svelte.ts` is a compile-time check that the singleton
  satisfies the `EditorSurface` interface. TypeScript treats a getter-only property as satisfying a
  mutable interface property, so a slice migration that converts `foo = $state(x)` into
  `get foo()` **without** its matching `set foo(v)` compiles clean.
- `src/lib/editor/editorSurface.test.ts` is 22 lines and tests only that `getEditorSurface()` falls
  back to the singleton outside a Svelte context.

At runtime, `editor.foo = true` against a getter-only property is a **silent no-op** in non-strict
module scope — no throw, no warning. A modal would simply never open.

There are currently **22** properties assigned somewhere in `src/` or `e2e/` as `editor.X = …`. All
22 resolve to a working setter or a plain field today. This test freezes that.

## Method

Add to `src/lib/editor/` a `runes` test (`*.runes.test.ts` — it must be the runes project, because
the real store instantiates `$state` at module load and the node project has no Svelte compiler;
see the comment at the top of `editorSurface.test.ts` explaining why that file mocks instead).

The test should:

1. Import the real `editor` singleton.
2. Walk the prototype chain and collect every own/inherited property descriptor, excluding
   `#private` fields and anything starting with `_`.
3. For every property that has a `get` **and** is assigned anywhere in the codebase, assert it also
   has a `set`. Derive that list explicitly in the test file as a literal array — a hardcoded list
   is the point, because it should require a deliberate edit to shrink.
4. For each of those, assert a **round-trip**: read the current value, write a different value, read
   it back and confirm it changed, then restore. This catches both the missing setter and a setter
   wired to the wrong slice field — which the shape check alone would miss.
5. Assert the total unique public member count equals **226**, with a comment saying to update it
   deliberately when the surface intentionally changes. (274 if you count getter and setter
   declarations separately — pick one convention and say which in the comment.)

Getting the assigned-property list: `grep -rhoE '\beditor\.[a-zA-Z_$][a-zA-Z0-9_$]*\s*=[^=]' src e2e`
then filter out comments and string literals by hand. Expect exactly **22** names. Note that grep
will also hit `editor.isMobile=true` inside a *comment* in
`src/lib/axis-workbench/test/gridView.test.ts` — that is a false positive, not a 23rd property;
`isMobile` is a read-only getter and must not be added to the list. The 22 are `axisOpen`,
`themeOpen`, `paletteOpen`, `presetOpen`, `presetSearchOpen`, `cabPickerOpen`, `deviceToolsOpen`,
`quickBuildOpen`, `saveOpen`, `portsOpen`, `consentPromptOpen`, `drawerOpen`, `editorH`,
`meteringOn`, `virtual`, `bufferSource`, `reportPrompt`, `placeTarget`, `railActive`, `presetPick`,
`paletteMode`, `axisTab`.

Some of those are plain fields rather than accessors — the round-trip assertion covers both
uniformly, so do not special-case them.

## Watch for

Writing to some of these triggers real work — `axisOpen` calls `overlays.open()`, `portsOpen`
delegates into the device slice. Restore the original value in a `finally`, and run the whole thing
in one `describe` so ordering is stable. If a property cannot be safely round-tripped in a test
environment, exclude it **with a comment saying why**, not silently.

## Done when

The test fails if you locally delete any one setter from `editor.svelte.ts`. Verify that by
actually deleting one, watching it fail, and restoring it. `npx vitest run` green.
````

---

# T6 · Test the preset-browser view model

**Goal:** cover the largest untested logic module, in the subsystem with the worst recent bug
record.
**Risk:** Medium — 870 lines with no existing tests to pattern-match inside the file itself.

### Handoff prompt

````markdown
# Task: add unit tests for presetBrowserWorkbenchView

## Background

`src/lib/axis-workbench/presetBrowser/presetBrowserWorkbenchView.svelte.ts` is 870 lines and has
**zero tests** — the largest untested logic module in the repo.

This matters more than size alone suggests: three of the last five shipped bug fixes were
preset-browser bugs (search dropping filters for most block types, CPU sort ranking by block count
instead of weighted CPU, the quick-search overlay wiping the docked browser's search). The
sibling modules that *do* have tests — `presetBrowserWorkbenchQuery`, `presetBrowserWorkbenchData`,
`presetBrowserWorkbenchRowChips` — are where those fixes landed, with regression tests. The view
model has none.

Read these first, in order:
- `src/lib/axis-workbench/test/presetBrowserWorkbenchQuery.test.ts` — the local house style.
- `src/lib/axis-workbench/test/presetBrowserWorkbenchData.test.ts` — fixture/host mocking pattern.
- `src/lib/axis-workbench/CLAUDE.md` — layer rules for this directory.

## Method

1. **Survey before writing.** List the module's exports and classify each as pure, host-dependent,
   or rune-stateful. Put pure functions in a `node` test; anything holding `$state` needs a
   `*.runes.test.ts`. Report the classification at the top of your milestone report.

2. **Prioritise by blast radius, not by line count.** Cover in this order: selection and
   multi-select state transitions; sort comparators (especially any CPU/size/name ordering — the
   CPU sort bug lived next door); filter/search state and how it composes with the docked vs
   overlay entry points (the overlay-wipes-docked-search bug); empty and offline states (the
   "inventing empty-slot rows when no device is connected" bug was fixed in
   `presetBrowserWorkbenchData` by gating on live connection — check the view model makes the same
   assumption); pagination/windowing if present.

3. **Mock the host, do not import `editor`.** This directory's panels import `editor` directly today
   (29 files do), but tests must not — build a minimal host object, as the `Data` test does.

4. Aim for breadth over depth: one solid case per behaviour across the whole module beats
   exhaustive coverage of the first 200 lines.

## Do not

- Do not refactor the module. If it is hard to test, say so in the report with specifics — that is
  input to the next refactor milestone, not work for this one.
- Do not mount any component.

## Done when

The module has meaningful coverage of the five behaviour areas above, `npx vitest run` green, and
the report names anything left untestable without a production change.
````

---

# T7 · Coverage tooling and a pixel baseline

**Goal:** make "solid" a number, and stop CSS regressions reaching a human reviewer.
**Risk:** Low, but **run this last** — earlier milestones move every number it records.

### Handoff prompt

````markdown
# Task: add coverage reporting and a visual regression baseline

## Part 1 — coverage

The repo has no coverage tooling. Add `@vitest/coverage-v8` and wire it into `vitest.config.ts`
across **both** projects (`node` and `runes`).

- Add an `npm run test:coverage` script.
- Exclude from coverage: `src/lib/fixtures/**`, `**/*.test.ts`, `**/*.spec.ts`, `e2e/**`, and
  `**/*.svelte` (components are never unit-mounted here by design — including them would report a
  misleading floor, not a real gap).
- Run it, record the resulting per-directory numbers in the milestone report, and set
  `thresholds` to **just under the measured values** so the suite fails on regression rather than
  demanding new work. Do not set aspirational thresholds.
- Note in the report which directories fall furthest below `src/lib/graphs/` and
  `src/lib/workbench/core/`; that is the input to the next hardening round.

## Part 2 — pixel baseline

`npm run test:workbench-visual` runs `scripts/workbench-visual-smoke.mjs`, which drives Firefox and
asserts only that each screenshot file is **larger than 10KB and not blank**. It cannot detect a
visual regression. Two real ones shipped past it during the architecture refactor (a Button
variant silently filling three previously-transparent toast buttons; a dialog scrim normalisation
that changed the backdrop of ten dialogs, three of which gained a blur they never had).

Add Playwright `toHaveScreenshot()` coverage in `e2e/`:

- Cover at minimum: the workbench shell at desktop width; one dialog on the shared `ui/Dialog`
  shell (the scrim, blur and card frame are the regression surface); the preset browser docked
  panel; one mobile-width layout.
- Put baselines in the standard Playwright snapshot directory and commit them.
- Set a small `maxDiffPixelRatio` — enough to absorb font rendering jitter, not enough to hide a
  token change.
- Keep `workbench-visual-smoke.mjs` as-is; it is a fast boot check and serves a different purpose.

**Determinism first.** Before committing baselines, run the new specs three times and confirm they
are stable. Freeze anything time- or animation-dependent — the dialog shell has entry animations
(`axsOverlay`, `axsPalette`, `axsSheet`) that will flake unless disabled or waited out. If you
cannot make a surface deterministic, drop it from the baseline set and say so rather than
committing a flaky test.

## Done when

`npm run test:coverage` reports and enforces thresholds; the new visual specs pass three
consecutive runs; `npx playwright test` green.
````

---

## Reporting

Each milestone ends with a short report in `docs/handoff/`, named for the milestone. It must state:

- what was added, by file and case count;
- **any behaviour that could not be asserted**, and why — these accumulate into the next refactor's
  input;
- any finding that looks like a product bug, per global rule 1 (recorded, not fixed).
