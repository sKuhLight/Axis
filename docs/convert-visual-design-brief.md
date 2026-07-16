# Cross-Device Preset Converter — Visual Design Brief

Brief for a design pass (hand to Claude Design). Scope: the **visual language for
conversion conflicts + states** on the converter page, and **parity with the normal
grid** for hover/drag. This pass is about *surfacing and locating* what the conversion
engine already reports so the user can fix it — NOT new interaction paradigms.

## 0. The page (what exists today)
- **Left / main — Target grid**: the converted preset in the real SignalGrid, placed +
  editable. This is where the user resolves and commits.
- **Right — Source grid** (read-only): the source device layout (e.g. FM3), blocks +
  cables. Doubles as a **drag source** (drag a source block onto a target cell to
  place/move its converted equivalent).
- **Bottom — Block Editor**: per-block type picker + params (the same component the
  normal editor uses).
- **Right-bottom — Tray "Unplaced blocks" + Conversion Report**.
- Commit ("Save to library" / "Apply to device") is **gated on zero unresolved
  conflicts** (`convertScratch.canCommit`).

## 1. Guiding principles (non-negotiable)
1. **Reuse, don't reinvent.** Hover tooltips, drag drop-target preview, cell selection
   glow, block glyph/color, the type picker, the param list — all already exist in
   `SignalGrid.svelte` / `BlockEditor.svelte` / `catalog.ts`. The converter must look
   and behave like the normal grid. Do not invent a parallel visual vocabulary.
2. **Parity.** Source and target grids behave like the normal grid: hover shows a
   tooltip; dragging shows **where the block will land**; invalid drops give the normal
   rejection feedback.
3. **Conflicts are first-class and located.** Every conversion issue must be visible
   **on the block itself** (both grids + block editor), not only as a line in the text
   report. The report is the index; the grids are the map.
4. **One severity language everywhere** (report chips, grid badges, block editor,
   tray) using the app's existing status tokens.

## 2. The states the design must express (grounded in the data model)

### 2.1 Severity — 3 levels, one color each, used on every surface
`info` · `warn` · `loss`. Derived client-side (`convertReport.ts`). Use the existing
app tokens: `--ok`/accent (info/verified), `--amber` (warn), `--danger` (loss/error).

### 2.2 Per-BLOCK states (drive the grid badges + block-editor header)
From `ConflictKind` (`type` · `clamps` · `placement` · `routing`) and the
`ConversionEvent` union:

| State | Source event(s) | Meaning | Severity |
|---|---|---|---|
| **type-unresolved** | `type-unresolved` | target has **no matching type**; a default was kept — user MUST pick a type | loss/error |
| **type-substituted** | `type-substituted` (confidence exact/lineage/fuzzy/fallback) | mapped to a *different* target type — verify | info→warn by confidence |
| **params-clamped** | `param-clamped` | one or more params clamped to the target range | warn |
| **params-dropped** | `param-dropped` | one or more params had no target equivalent | warn/loss |
| **params-unverified** | `param-unverified` | param carried but mapping not verified | warn |
| **unplaced** | `block-unplaced` | converted but not on the grid — needs placing | warn |
| **dropped** | `block-dropped` (family-missing / capacity-exceeded / instance-limit) | block does **not exist** on target — no cell; shown for awareness | loss |
| **merged** | `block-merged` | folded into another block (e.g. cab → AM4 amp's cab) — function preserved | info |
| **routing-simplified** | `routing-simplified` (carries `affectedBlockKeys`) | routing was simplified; mark the affected blocks | info/warn |
| **scene-collapsed** | `scene-collapsed` | fewer scenes on target (preset-level) | warn/loss |
| **channel-collapsed** | `channel-collapsed` | a block's channels collapsed | warn |
| **bypassed** | (block state) | offline bypass | (neutral, existing style) |

A block can carry several at once — the cell badge shows the **worst** severity; the
block editor lists all.

### 2.3 Per-PARAM states (drive the block-editor param list, esp. on type switch)
- **carried-ok** — mapped + in range (normal style).
- **clamped** — value adjusted; show `source → target` + the range.
- **unverified** — mapped, mapping not verified; show a `?`.
- **dropped** — no concept mapping / target lacks the param; show struck/greyed +
  reason, disabled.
(Per-param status is derived from the events by `blockKey` + `nativeName`; the impl
wiring attaches it to each param — the design should assume these four states exist.)

### 2.4 Placement / resolution
`placed` · `unplaced (tray)` · `dropped (no equivalent)`; and per conflict
`unresolved` → `resolved` (badge clears, brief ok-tick). A persistent **"N unresolved"**
counter drives the commit gate.

## 3. Per-surface requirements

### 3.1 Source grid (right, read-only, drag source)
- **Hover tooltip on every block** = what it is (full name/type), identical to the
  normal grid cell tooltip. **Reuse** the SignalGrid tooltip.
- **Conversion outcome badge** per source block (corner marker, severity-colored):
  carried / substituted / **dropped** (dimmed + loss badge so it's obvious it has no
  target equivalent and why).
- **Drag**: show a drag affordance AND drive the target grid's drop-target preview
  (§4.2) — mirror the normal grid, not a bespoke ghost-only drag.

### 3.2 Target grid (big, placed, editable) — the primary resolution surface
- **Per-cell conflict badge/outline** keyed to severity: unresolved type = error
  outline + icon; clamped = warn corner; substituted = warn dot; unverified = `?`;
  routing-affected = subtle marker. Worst-severity wins the outline.
- **Hover tooltip** = name/type **+ one-line conflict summary** ("Type 'X' not available
  — pick one" / "3 params clamped" / "mapping unverified").
- **Click a cell → focus it in the Block Editor at its conflict.**
- **Selection glow + drop-target preview** exactly like the normal grid.
- **Resolved** blocks clear their badge (brief ok-tick) so progress is visible.
- Prominent **"N unresolved · commit disabled"** state tied to `canCommit`.

### 3.3 Grid Map / minimap (if/when a target minimap returns)
- Mirror the same per-cell conflict badges at mini scale, so conflicts are locatable
  while scrolled. Same severity language.

### 3.4 Block Editor (bottom)
- **Header conflict banner**: if `type-unresolved` → a clear "Type not available on
  «target»" banner with the type picker front-and-center; other conflicts summarized.
- **Type picker shows ONLY types available on the target** (already fetched via
  `forgefx.blockTypes(family)`). The unresolved source type appears as an
  invalid/placeholder chip ("was: «sourceType» — not on «target»"). Choosing a type
  resolves the conflict.
- **On type switch**: params that map by concept **carry over automatically**; show
  per-param status (§2.3) and a summary line **"kept N of M parameters"**. This is both
  functional (carry the mappable params) and visual (show what carried / clamped /
  dropped).
- **Param list** uses the same severity language; clamped shows the range; dropped
  shown but disabled.
- Scene/channel-collapse noted in the header when relevant.

### 3.5 Tray + dropped blocks
- Distinguish **(a) converted-but-unplaced** (placeable — drag / "Place") from
  **(b) dropped** (no target equivalent — cannot place; listed for awareness with the
  reason: family-missing / capacity / instance-limit). Different visual treatment.
- Each row carries its severity + reason; clicking locates/opens where possible.

### 3.6 Conversion report
- Each row: severity chip + **click-to-locate** → highlight & scroll to the block on the
  grid and open it in the editor. Group by severity.

## 4. Interactions (reuse normal-grid behavior)
1. **Hover tooltips** — both grids, identical to the normal grid (SignalGrid cell
   tooltip pattern).
2. **Drag & drop parity** — while dragging (source→target, or moving within target),
   show the **same drop-target highlight** the normal grid uses (target-cell highlight,
   shunt-replace highlight, invalid-target feedback). Reuse SignalGrid's existing
   `dragTarget` / move-preview visuals; the user must SEE where the block lands.
3. **Type resolution** — pick from available types only; live param carry-over with
   per-param status; conflict badge updates immediately on **all** surfaces.
4. **Click-to-locate** — report row / tray row → highlight + scroll-to + open in editor.

## 5. Consistency
- Use existing app status tokens (`--danger` / `--amber` / `--ok` / `--accent`), the
  existing block glyph/color (`catFor`), and the existing cell/editor layouts. One
  legend, readable in **light and dark**. No new vocabulary — extend the block-cell +
  block-editor language.

## 6. Reuse these existing pieces (do not re-build)
- `SignalGrid.svelte`: cell tooltip, drag `dragTarget` / move-preview / drop feedback,
  cell selection glow.
- `BlockEditor.svelte`: type picker, param list layout, channel tabs.
- `catalog.ts` `catFor`: per-family glyph + accent color.
- `ConvertReport.svelte`: severity chips.

## 7. Out of scope for this pass
- Improving the conversion *logic* (mapping quality). This pass **surfaces** what the
  engine already reports. Where a state needs data not yet wired to the block/param
  (e.g. per-param status attached for the editor), that's an impl prerequisite — the
  design should assume the states in §2 are available.

## 8. Expected deliverable from Claude Design
Light + dark mockups of:
1. Source grid — hover tooltip, per-block outcome badges, drag preview.
2. Target grid — per-cell conflict badges + hover conflict summary + drop-target
   preview + "N unresolved" gate state.
3. Block Editor — unresolved-type banner, available-types-only picker, per-param
   carry-over status ("kept N of M"), clamped/dropped/unverified param rows.
4. Tray + report — placeable vs dropped distinction, click-to-locate.
5. A single **severity legend** (info / warn / loss) shared across all surfaces.
