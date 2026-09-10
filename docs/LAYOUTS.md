# Layouts

How Axis organizes a block's controls into pages, where that arrangement comes from, and where the
work is headed. This doc describes both **what ships today** and the **design being implemented** —
each section is tagged accordingly so the two are never confused.

> **Legend** — **Implemented**: in the code today. **Planned / In-progress**: designed and being
> built; not yet wired (or only partly).

## The data flow

Editor layouts originate in `fractal-midi` as per-device, per-family layout data and travel through
ForgeFX to Axis:

```
fractal-midi  ──►  ForgeFX  ──►  Axis
  *_LAYOUTS         serves          renders as
  (device-          layout on       switchable
   authentic        the param       layout
   pages)           response        profiles
```

- **`fractal-midi`** exports per-device layout maps (`FM3_LAYOUTS` / `FM9_LAYOUTS` / `AXE3_LAYOUTS`):
  `family -> { editorName?, pages: [{ name, controls: [{ label, paramName, paramId, col? }] }] }`.
  This is **device-authentic editor layout data derived from the device editor configuration** —
  pages, control labels, and column positions as the device organizes them.
- **ForgeFX** attaches the family's layout to `GET /preset/blocks/:eid/params` as an optional
  `layout` field, alongside the live `named`/`enums`/`type` values. *(See the ForgeFX repo's
  `docs/LAYOUTS.md`.)*
- **Axis** is meant to consume that served layout as the **Default** layout profile for a block
  family, with the user able to switch between Default, a Blank canvas, and their own custom
  profiles.

## What ships today — the device canvas

**Implemented.** The block editor body renders the device's **own pixel-exact editor canvas**
([`src/lib/DeviceCanvas.svelte`](../src/lib/DeviceCanvas.svelte) +
[`src/lib/deviceCanvas.ts`](../src/lib/deviceCanvas.ts) /
[`src/lib/deviceWidgets.ts`](../src/lib/deviceWidgets.ts)): every control is drawn at the coordinate
the device authored on its fixed ~1240px canvas, sized from the served `bounds`, with nothing
snapped, packed, reflowed, or re-ordered. Pages come straight from the served layout's own pages.
This matches FM3-Edit by construction rather than by per-block heuristics. (Axis previously
re-derived its own arrangeable widget grid from the flat parameter list; that grid — and the
`ControlSurface` component behind it — was removed.)

Swipe-control assignments are still **persisted client-side** (`localStorage`), keyed by
**block-family slug + device-true paramId**. The client-side tab heuristics in
[`src/lib/layouts.ts`](../src/lib/layouts.ts) remain as the fallback for a block the server serves
no `layout` for.

## What's being built — Axis-Layouts (layout profiles)

**Planned / In-progress.** The **Axis-Layouts** system generalizes the per-family tabs above into
named, switchable **layout profiles** per context (per block family, and per virtual-effect screen):

- **Default** — *device-authentic*, seeded from the `layout` ForgeFX serves (the `*_LAYOUTS` pages,
  control labels, and column positions). This is the profile that turns the served layout into the
  initial arrangement.
- **Blank** — an empty canvas to build a layout from scratch.
- **Custom / duplicated** — user-created profiles (including duplicates of Default or another
  profile), switchable and persisted.

> **Status note.** The served `layout` is consumed: `BlockParams` carries it
> ([`src/lib/types.ts`](../src/lib/types.ts)), the editor store ingests it
> ([`src/lib/editor.svelte.ts`](../src/lib/editor.svelte.ts)), and
> [`src/lib/deviceCanvas.ts`](../src/lib/deviceCanvas.ts) places its pages onto the canvas.
> The built-in Ideal/Advanced/EQ tabs in `src/lib/layouts.ts` are now only the FALLBACK for a block
> the server serves no layout for — note its `Ideal` is a keyword heuristic and is unrelated to the
> device's real "Ideal" tab.

## Placement: how a served control lands on the canvas

The device places every control on its own fixed ~1240px canvas, and says where in the served
`PageLayout` geometry (`parametersX/Y` + `parametersSpacingX/Y`, `mixerX/Y` + `mixerSpacingX/Y`,
explicit Bypass / Scene Ignore / Kill Dry anchors) plus each control's `placement`
(`col`, `offsetX`, `offsetY`, `positionExact`). [`src/lib/deviceCanvas.ts`](../src/lib/deviceCanvas.ts)
is a **renderer, not an arranger**: it reads that geometry and draws each control exactly where the
device authored it. Nothing snaps, packs, reflows, clamps, repacks, centers, or infers group
membership.

- Each section (`parameters`, `mixer`) has its own row cursor. A flow row's baseline is
  `(sectionX, sectionY + cursor * sectionSpacingY)`, and the cursor advances only for flow rows — a
  row whose controls are *all* absolutely anchored is decoration (section headings, the cab identity
  cluster, a graph overlay) and does not move the cursor, or every following flow row drops a pitch.
- A control with `placement.col` sits at `baselineX + col * sectionSpacingX`; one without occupies
  the next authored flow slot. Spacers and absolutely-positioned controls both consume a slot.
  `offsetX`/`offsetY` nudge a control off its slot; `positionExact` overrides x/y outright.
- Widget outer size comes from the control's served `bounds`; a `sectionLabel`'s width is
  `render.sectionSpan.pixels` or `cols * sectionSpacingX`.

The graph modules `cabMicGraphs.ts`, `cabAlignmentGraphs.ts` and `eqGraphs.ts` each derive one
block's curve overlay from the layout's own tokens.

## Virtual-effect screens — Setup / Controllers / Modifier / FC

**Planned / In-progress.** ForgeFX exposes the device's non-audio editor sections on the same
`(effectId, paramId)` path as audio blocks, addressed by a reserved effect id:

| Effect id | Screen |
|-----------|--------|
| `1` | Setup (device-global) |
| `2` | Controllers |
| `3` | Modifier |
| `199` | Foot Controller (FC) |

The design points the **same block editor** at one of these effect ids — i.e. "Setup" is the block
editor pointed at effect id `1` — and renders its served layout on the device canvas, just like an
audio block.

> **Status note.** The tool rail ([`src/lib/ToolRail.svelte`](../src/lib/ToolRail.svelte)) currently
> implements only the **Build** (grid) screen; the Controllers / Footswitches / Scenes / Perform /
> Sets / Settings rail items are **stubs** that announce "coming soon." Wiring these screens to the
> virtual-effect endpoints (effect id `1`/`2`/`3`/`199`) is in progress. See the broader
> [ROADMAP](ROADMAP.md) for sequencing — the Setup screen is the nearest of these, since the GLOBAL
> block is reachable through the existing param path.

## Multi-device

**Implemented (device selection).** Axis auto-detects the attached unit; ForgeFX selects the matching
`DeviceProfile`, so the served layouts and virtual-effect resolution already correspond to the
connected device (FM3/FM9/Axe-Fx III) with no client changes. Each device supplies its own family
layouts; the gen-3 units share the virtual effect ids. Rendering those served layouts as layout
profiles is the **Planned / In-progress** half above.
