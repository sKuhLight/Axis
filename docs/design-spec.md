# Axis design spec

**`design/Axis Editor.dc.html` is the canonical, mandatory design.** This doc summarizes it;
when in doubt, match the prototype pixel-for-pixel. Don't freelance the look — port from it.

## Design tokens

| Token | Value |
|-------|-------|
| App background | `#0c0c0e` · rail `#0f0f12` · panels `#0d0d10` |
| Surfaces | `#141417` `#17171a` `#1c1c21` · borders `#1d1d22` `#26262c` `#2a2a31` `#2c2c34` |
| Text | `#e9e9ee` (primary) · `#c3c3cb` · `#9a9aa3` (dim) · `#6e6e78` `#56565e` (faint) |
| **Accents** | cyan `#35c9d6` (primary / knob arc) · amber `#f5a623` (knob pointer, type text) · blue `#4f6bed` |
| EQ accents | low-cut purple `#9b8cf0` · high-cut pink `#d65b9e` · band amber `#f5a623` · output EQ green `#9ac24a` |
| Fonts | **Hanken Grotesk** (400–800) UI · **JetBrains Mono** (400–600) values/technical |
| Radii | 9–12px on controls · cards 12px | 
| Motion | `axsOverlay` fade · `axsSheet` slide-up · `axsPalette` rise+scale · `axsToast` · `axsPlace` (block place pop) |

## Screens / layers

- **Tool Rail** (66px, left): logo (tri-dot) + 6 icon items (Signal Grid, Presets, Library, Tuner, Settings…), connection LED at bottom.
- **Top Bar**: preset cluster (‹ PRE num name ›) · scene strip (SCN 1–8) · Add Block · tuner/tempo · Save.
- **Signal Grid**: fixed 4×12 cell matrix, blocks with level-fill + channel/bypass badges, **shunts** as pass-through nodes, **routing cables** between cells; drag to move/place (`axsPlace`), Move/Recycle bin.
- **Block Editor** (dockable right panel ≥900px / bottom sheet on touch, resizable) — see below.
- **Command Palette** (⌘K) — add-block / fuzzy actions, rises with `axsPalette`.
- **Toasts** — transient confirmations (`axsToast`).

## Block Editor (the big one)

Header (compact, one row):
- Block **icon** chip (category-colored).
- **Type picker**: title + type/model name (amber, JetBrains Mono) + magnifier → click to **retype** (change model; this is where real-world names + the toggle live).
- **Channel selector** `CH A B C D` (amp/channel blocks only).
- **View mode** segmented control (global ↔ per-block) + **OVR** badge when a block overrides the global view.
- Close ✕.

Body:
- **Tabs**: per-block parameter **pages**, horizontally drag/swipe-scrollable.
- **Knobs page**: responsive grid of knobs — SVG arc (135° sweep, cyan fill, amber pointer dot, inner `#141417`), value readout, label; **⚡ quick-toggle** to assign a knob to grid swipe-controls; pointer-drag to set, double-click to reset.
- **Input EQ page**: type segments; interactive frequency-response SVG (20 Hz–20 k) with **draggable low-cut (purple) / high-cut (pink) handles** + a **band node (amber)**; numeric readouts; sliders (Q etc.).
- **Output EQ page**: on/off toggle · type segments · **graphic EQ** curve with **draggable band nodes (green, ns-resize)** · Zero All.
- Unbuilt pages show a tasteful **stub**.

Footer (sticky):
- **Common knobs** (Level / Mix) with ⚡ swipe-assign.
- **Mute · Scene Ignore · Bypass · Remove** action chips.

## Mapping to ForgeFX API

- Type picker / model name ↔ `GET /blocks/{slug}/types` (`name` + `manufacturer` + `basedOn`); the real-names toggle swaps Fractal ↔ real label.
- Knobs / EQ / sliders ↔ `GET /preset/blocks/{slug}/params` (read) + `PUT /preset/blocks/{slug}/params/{param}` (write; continuous for knobs).
- Channel `CH A–D` ↔ `POST /preset/blocks/{slug}/channel`.
- Bypass ↔ `POST /preset/blocks/{slug}/bypass`. Remove ↔ `PUT /preset/grid/cell` (clear). Move/place ↔ `PUT /preset/grid/cell`; cables ↔ `POST /preset/grid/cable`.
- Scenes ↔ (scene endpoints, planned). Save ↔ `POST /preset/store` (beta).

> Build screens by porting the prototype's markup/styles into Svelte components; keep the tokens
> above. The prototype uses a custom `sc-for`/`sc-if`/`{{ }}` runtime — translate those to Svelte
> `{#each}`/`{#if}` and reactive state, but keep every style value.
