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

## What ships today — the Control Surface

**Implemented.** The block editor body is a **widget-grid Control Surface**
([`src/lib/ControlSurface.svelte`](../src/lib/ControlSurface.svelte)): controls are tiles (knob,
fader, slider, number, switch, select, EQ, action) you can arrange, resize, and retype, organized
into **pages/tabs**.

Today those tabs are built **client-side** from the flat parameter list ForgeFX returns
([`src/lib/layouts.ts`](../src/lib/layouts.ts)):

- **Ideal** *(built-in)* — a heuristic pick of the most musician-facing knobs.
- **Advanced** *(built-in)* — the remaining knobs plus all discrete selectors.
- **EQ** *(built-in, amp only)* — the amp's graphic-EQ band params.
- **Custom tabs** — any number of user-created tabs, each a named set of param ids.

Custom tabs and swipe-control assignments are **persisted client-side** (`localStorage`), keyed by
**block-family slug + device-true paramId**, so a custom Amp view applies to every amp. This is the
layout machinery in place now; it does **not** yet read the served `layout` field.

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
> [`src/lib/deviceLayoutBoard.ts`](../src/lib/deviceLayoutBoard.ts) turns it into the Default board.
> The built-in Ideal/Advanced/EQ tabs in `src/lib/layouts.ts` are now only the FALLBACK for a block
> the server serves no layout for — note its `Ideal` is a keyword heuristic and is unrelated to the
> device's real "Ideal" tab.

## Placement: how a served control becomes a grid cell

The device places every control on its own fixed ~1240px canvas, and says where in four fields:
`placement.col`, `placement.offsetX`, `placement.offsetY`, `placement.positionExact`.
[`src/lib/deviceGeometry.ts`](../src/lib/deviceGeometry.ts) resolves all four onto one number line;
`deviceLayoutBoard.ts` snaps that line to the board grid. Two axes, modelled differently because the
device authors them differently:

- **Horizontal is absolute.** `col` and `positionExact.x` are two spellings of the same canvas x, so
  both go through `pxToCol`. `COL_PITCH` is *derived* as `CANVAS_W / DEVICE_COLS` precisely so
  `pxToCol(colToPx(c)) === c` — authored columns survive the round trip as an identity of the
  definition, not as a tuned approximation.
- **Vertical is relative.** `offsetY` nudges a control off its row's baseline, which is how ONE device
  row draws MORE THAN ONE visual line — the amp's Ideal page puts five toggles 70px above the knobs
  that share their column numbers. `splitByOffsetY` recovers those lines. `positionExact.y` is an
  absolute canvas coordinate instead, so those controls cluster among themselves
  (`clusterByCanvasRow`) and are placed below the row's own content. There is no reliable constant
  converting a row index to a canvas y, so the two are deliberately never mixed onto one axis.

### Two tiers, and where the grid stops

Measured across all 1015 Axe-Fx III pages, 92% are grid-shaped: 500 carry no `positionExact` at all,
and 433 carry one or two outliers (the amp's HEADROOM meter) that snap invisibly. The rest are
**pixel-composed**: 34 of 152 distinct pages — Cab, Align, Speaker, PEQ, Filter, Scene Levels,
Modifier, Tuner — place controls as little as 1–4px apart, which no column pitch can separate.
`isPanelCluster` identifies them from the geometry (never from a family name — a hardcoded list is
what produced the per-block patch cycle this replaced).

The grid tier lays every page out without overlap or overflow; five pages (`CONTROLLERS/CS per Scene`,
`FC/Devices`, `MIDIBLOCK/One Scene`, `VOCODER/Level`, `VOCODER/Pan`) have more section headings than
the grid has columns and crowd them onto the last column. Those pages want a **panel tier** — the
cluster rendered as one grid widget that positions its children by the device's own pixels — which is
not built yet. `src/lib/deviceLayoutSweep.test.ts` runs every page of all three devices through the
builder and pins that list by name, so an ordinary page cannot silently join it.

The hand-written `cabIdentityCards.ts`, `cabMicGraphs.ts`, `cabAlignmentGraphs.ts` and `eqGraphs.ts`
are each a panel-tier widget built by hand for one block; they are the candidates to retire into a
generic panel once it exists.

## Virtual-effect screens — Setup / Controllers / Modifier / FC

**Planned / In-progress.** ForgeFX exposes the device's non-audio editor sections on the same
`(effectId, paramId)` path as audio blocks, addressed by a reserved effect id:

| Effect id | Screen |
|-----------|--------|
| `1` | Setup (device-global) |
| `2` | Controllers |
| `3` | Modifier |
| `199` | Foot Controller (FC) |

The design points the **same Control Surface** at one of these effect ids — i.e. "Setup" is the
block editor pointed at effect id `1` — and renders it with the Default layout profile seeded from
the served layout, just like an audio block.

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
