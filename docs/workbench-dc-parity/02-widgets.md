# Workbench DC parity — 02 · Widgets

Source of truth: `design/AxisWidget.dc.html` (plus the sizing/estimating logic
that lives in `design/Axis Layout System.dc.html` — quoted here because it
drives widget rendering). Binding specification: port verbatim.

The widget component receives:

- `w` — `{ kind, size, density, axis ("v" for rail), grouped, constrained,
  label, value, color, block }` (built by the shell's `mkW`, §3 below),
- `data` — live values (`presetNum, presetName, scene, view, bpm, cpu, dirty,
  connState, initials, gridMode, blockSizeLabel, fcDevice, fcLayout, fcSwitch,
  fcView`),
- `bus` — callbacks (`presetPrev/Next/Pick, onScene, setView, addBlock, tuner,
  tempo, save, search, history, map, undo, redo, account, reconnect,
  setGridMode, sizeLess, sizeMore, setFcDevice, setFcLayout, setFcSwitch,
  setFcView, paramTap`).

---

## 1. The 3 size states (base metrics)

Every widget supports `default > compact > mini`. Resolution (verbatim):

```js
const size = w.size || (w.density==="mini"?"mini":w.density==="compact"?"compact":"default");
const expanded = size==="default";
const mini = size==="mini";
const H = mini?28:(size==="compact"?34:38);
const PAD = mini?7:(size==="compact"?10:13);
const GAP = mini?5:8;
```

| Metric | default | compact | mini |
|---|---|---|---|
| Height `H` | **38px** | **34px** | **28px** |
| Horizontal padding `PAD` | 13px | 10px | 7px |
| Internal gap `GAP` | 8px | 8px | 5px |
| Chip height `chipH` | 22px | 20px | 22px (single chip) |
| Scene chip min-width | 21px | 18px | 24px (single) |
| Pill padding | `5px 10px` | `4px 8px` | `5px 9px` |
| Pill font size | 11px | 10.5px | 11px |
| Text labels (`expanded`) | shown | hidden | hidden |

Hard rules (comments verbatim):

- *"Widgets NEVER wrap internally — every size state is a designed single-row
  look with a fixed height."* → `flex-wrap:nowrap; white-space:nowrap;` and
  `fit = "flex:none;"` on every box; `chipRow` is `display:flex;
  flex-wrap:nowrap; gap:3px;`.
- *"mini = ONE current-value chip (tap cycles) — never a wrapped chip grid."*
- Root: `display:flex; align-items:center; gap:6px;
  ${vert?"flex-direction:column;":"flex-wrap:nowrap;"} flex:none;`
  (`vert` = rail placement).

### 1.1 Baseline styles (verbatim)

```js
const box = grouped
  ? `display:flex; align-items:center; flex-wrap:nowrap; white-space:nowrap; gap:${GAP}px; height:${H}px; padding:0 ${PAD}px; background:transparent; cursor:pointer; flex:none;`
  : `display:flex; align-items:center; flex-wrap:nowrap; white-space:nowrap; gap:${GAP}px; height:${H}px; padding:0 ${PAD}px; background:#0e0e10; border:1px solid #26262c; border-radius:10px; cursor:pointer; flex:none;`;
const boxSq = grouped
  ? `width:${H+4}px; height:${H}px; display:flex; align-items:center; justify-content:center; background:transparent; cursor:pointer;`
  : `width:${H}px; height:${H}px; display:flex; align-items:center; justify-content:center; border-radius:10px; background:#141417; border:1px solid #2a2a31; cursor:pointer;`;
const boxHover = grouped ? "background:#17171c;" : "border-color:#3a3a44;";
const label = "font:600 10px/1 'JetBrains Mono',monospace; color:#8a8a94; letter-spacing:.1em; flex:none;";
const arrowL = grouped
  ? `width:26px; height:${H}px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#9a9aa3; font-size:15px; background:transparent;`
  : `width:32px; height:${H}px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#9a9aa3; font-size:15px; background:#141417; border:1px solid #2a2a31; border-radius:9px 4px 4px 9px;`;
const arrowR = arrowL.replace("9px 4px 4px 9px","4px 9px 9px 4px");
const stepBtn = "width:22px; height:24px; display:flex; align-items:center; justify-content:center; border-radius:6px; cursor:pointer; font-size:15px; font-weight:600; color:#9a9aa3; background:#1c1c21;";
const pill = (act)=>`padding:${mini?"5px 9px":size==="compact"?"4px 8px":"5px 10px"}; border-radius:6px; cursor:pointer; font:600 ${size==="compact"?10.5:11}px/1 'Hanken Grotesk',sans-serif; white-space:nowrap; ${act?"background:#35c9d6; color:#06181a;":"color:#9a9aa3;"}`;
const numChip=(sel,minw)=>`min-width:${minw}px; height:${chipH}px; display:flex; align-items:center; justify-content:center; padding:0 ${size==="compact"?3:5}px; border-radius:6px; cursor:pointer; font:700 11px/1 'JetBrains Mono',monospace; ${sel?"background:#35c9d6; color:#06181a;":"color:#6e6e78;"}`;
```

**Grouped variant** (inside an AxisGroup module): box/boxSq lose their
background+border (the module supplies chrome); `boxSq` widens to `H+4`;
arrows shrink to 26px transparent; hover becomes a subtle fill `#17171c`.

### 1.2 Tooltip (custom, not `title`)

```css
.axw .axtipwrap{ position:relative; }
.axw .axtip{ position:absolute; top:calc(100% + 7px); left:50%; transform:translateX(-50%);
  white-space:nowrap; background:#16161a; border:1px solid #3a3a44; color:#e9e9ee;
  font:600 10px/1 'JetBrains Mono',monospace; letter-spacing:.04em; padding:6px 9px;
  border-radius:7px; opacity:0; pointer-events:none; transition:opacity .1s ease;
  z-index:400; box-shadow:0 8px 20px rgba(0,0,0,.5); }
.axw .axtipwrap:hover .axtip{ opacity:1; }
```

Used by the **param** widget (control-surface-style tooltip showing
`<Block> · <Param>`). All other widgets use native `title` tooltips.

### 1.3 Hold-to-repeat (verbatim)

```js
_mkHold(fn){ const self=this; return function(e){ if(!fn) return; if(e&&e.button===2) return; self._clearHold();
  self._holdT=setTimeout(function(){ self._holdI=setInterval(function(){ fn(); }, 100); }, 380); }; }
```

**380ms** arming delay, then repeat every **100ms**; cleared on
pointerup/pointerleave on the control and on any window `pointerup`. Used by:
preset ‹/› ("hold to scan") and blocksize −/+.

---

## 2. Widget catalog (all kinds, per-state behavior)

`kind` values: `logo, preset, scenes, view, add, tuner, tempo, cpu, save,
search, history, map, undo, conn, account, param, gridmode, blocksize,
fcdevice, fclayouts, fcswitch`.

Estimated default widths (shell `estW`, the basis of all fitting — compact
estimate = `estW×0.62`, floor 40px; mini overflow estimate = `estW×0.42`,
floor 36px; actual rendered widths are content-driven):

| kind | estW | kind | estW | kind | estW |
|---|---|---|---|---|---|
| preset | 250 | scenes | 240 | view | 170 |
| add | 132 | tuner | 78 | tempo | 82 |
| cpu | 124 | save | 98 | search | 168 |
| history | 44 | map | 98 | undo | 80 |
| account | 44 | conn | 124 | param:* | 128 |
| gridmode | 184 | blocksize | 132 | fcdevice | 150 |
| fclayouts | 210 | fcswitch | 220 | *(fallback)* | 120 |

### logo
`boxSq` with the 26×26 triangle-dots SVG (accent `#35c9d6`, `#4f6bed`,
`#f5a623`, stroke `#3a3a44` 1.6). No size-dependent content.

### preset — "Preset display"
- Anatomy: `‹` arrow · [`PRE` label · number · name · `▾`] · `›` arrow inside
  `box`.
- Arrows: `presetArrow = display:${mini?"none":"flex"}; align-items:center;
  justify-content:center; width:16px; align-self:stretch; color:#9a9aa3;
  font-size:16px; cursor:pointer; flex:none;` → **mini hides the arrows**.
  Click = prev/next; pointer-hold = scan (hold-to-repeat). Title
  `Previous/Next preset (hold to scan)`.
- Number: `font:700 14px/1 'JetBrains Mono'; color:#f5a623;`.
- Name: **default state only** — `font-size:13px; font-weight:600;
  color:#e9e9ee; ellipsis; max-width:150px;`. Compact/mini drop the name;
  `PRE`, number and `▾` (10px `#56565e`) remain.
- Click on the center = `presetPick` (opens flyout/page per layout).

### scenes — chips 1–8
- `SCN` label default only. Chips via `numChip`; active chip accent-filled.
- default: 8 chips min-width 21; compact: min-width 18, tighter padding;
  **mini: a single chip showing the active scene (min-width 24), tap advances
  `(active%8)+1`** (tip `Scene <n> · tap for next`).

### view — Basic/Advanced
- `VIEW` label default only. default: `Basic` + `Advanced`; compact:
  `Basic` + `Adv`; mini: one pill showing current (`Basic`/`Adv`), tap toggles.

### add — Add block
- Accent search-plus SVG (15×15). Default adds text `Add block`
  (`color:#4fd1dc; font:600 13px`) and the `⌘K` badge
  (`font:600 10px JetBrains Mono; color:#5e8a8c; background:#0d1516;
  border:1px solid #234142; border-radius:5px; padding:4px 6px;`).
  Compact/mini: icon only. Click → `addBlock` (opens the palette).

### tuner
- `♪` (15px `#9a9aa3`) + `TUNE` label (default only). Click → `tuner`.

### tempo
- BPM number (`font:700 14px JetBrains Mono; #e9e9ee`) + `BPM` label shown
  unless **mini** (`notMini` — note: shown in compact too, unlike most labels).
  Click → `tempo` (tap tempo).

### cpu
- `CPU` label (all sizes) + meter track + percent text (default only).
- Track: `width:${mini?26:44}px; height:6px; border-radius:3px;
  background:#1c1c21;`; bar `width:${cpu}%` colored by thresholds:
  `cpu>75 → #d6543f`, `cpu>55 → #f5a623`, else `#35c9d6`.

### save
- Status dot 8px: dirty → `background:#f5a623; box-shadow:0 0 7px #f5a623;`;
  saved → `background:#2fa15f; box-shadow:0 0 6px rgba(47,161,95,.6);`.
- Label default only: `Save *` (`#f5c878`) / `Saved` (`#7fae7f`), 700 13px.
- Title: `Unsaved changes · ⌘S to save` / `All changes saved`. Click → `save`.

### search
- Grey search SVG + placeholder text `Search presets…` (`13px #56565e`,
  default only). Click → `search` (opens Preset List panel).

### history
- `boxSq` clock SVG (16×16, `#9a9aa3`). Title `History · undo timeline`.

### map — grid map
- 6×3 dot matrix: `grid-template-columns:repeat(6,3px); grid-auto-rows:3px;
  gap:2px;`, dots `3×3px radius 1px`, on = `#35c9d6`, off = `#2a2a31`;
  default on-pattern indices `[3,4,8,9,10,14]` (or `data.mapCells`).
- `MAP` label default only.

### undo — Undo / Redo
- Two 15×15 arrow SVGs (`#9a9aa3`, hover `#e9e9ee`) split by a
  `1px × 16px #2a2a31` divider, in one `box`. No size-dependent content.

### conn — connection status
- Dot 9px `background:${c}; box-shadow:0 0 8px ${c};` + label (default only).
- State map (verbatim):

```js
const connMap = { connected:{c:"#33c46b",lbl:"AX-3 · FW1.4",tip:"Connected · AX-3 FW 1.4.0"},
                  syncing:{c:"#35c9d6",lbl:"Syncing…",tip:"Syncing with cloud…"},
                  pending:{c:"#f5a623",lbl:"Writing…",tip:"Writing to device…"},
                  disconnected:{c:"#d6543f",lbl:"Reconnect",tip:"Device disconnected · tap to reconnect"} };
```

- Click: `disconnected → bus.reconnect()`, else `bus.account()`.

### account
- `boxSq` containing a 24px gradient circle
  (`linear-gradient(135deg,#35c9d6,#4f6bed)`) with initials
  (`font:700 10px Hanken Grotesk; color:#06181a`). Title
  `Account & cloud sync`.

### fcswitch — Switch / View
- `SW` label (default only) · `‹` num `›` (fcArrow 16px wide, always shown) ·
  `VIEW` label (default only) · view chips.
- Switch number = `fcSwitch+1` (`font:700 14px JetBrains Mono;
  min-width:14px; center`). Prev clamps at 0; next unbounded (+1).
- View chips `[1,2,3,4]` via `numChip(sel,20)`; **mini renders no view chips**
  (`mini?[]:[0,1,2,3]`).

### fclayouts — FC Layouts
- `LAY` label default only; chips `1…8` + `M` (master, index 8) via
  `numChip(sel, compact?17:20)`; mini = one current chip, tap cycles
  `(fcLay+1)%9`.

### fcdevice — FC device
- `FC` label default only; pills `FM3 / FC-6 / FC-12`; mini = current pill,
  tap cycles through the 3 ids.

### gridmode
- `GRID` label default only; pills `Full / Map / Auto`; mini = current pill,
  tap cycles `full → map → auto`.

### blocksize
- `SIZE` label default only; `−` stepper · letter `S/M/L` (`font:700 12px
  JetBrains Mono; min-width:12px`) · `+` stepper (`stepBtn`, hold-to-repeat).
  Titles `Bigger blocks (hold)` / `Smaller blocks (hold)` (− = bigger blocks,
  + = smaller: they map to `sizeLess`/`sizeMore` which move the S/M/L index).

### param — pinned parameter (quick control)
- Anatomy: 24px arc knob + value + sub-label, wrapped in `axtipwrap` with the
  custom tooltip `{{ paramTitle }}` = `<block> · <label>`.
- Arc SVG (verbatim geometry): viewBox 32, r=12, `stroke-width:3.4`,
  track `stroke:#2a2a31; stroke-dasharray:56.5 150; transform:rotate(135 16 16)`,
  value arc `stroke:{{paramColor}}; stroke-dasharray:{{paramDash}}` where
  `paramDash=(56.5*v/100).toFixed(1)+" 150"` (v defaults 50, color defaults
  `#35c9d6` else the source block's category color).
- Value: `font:700 11px JetBrains Mono; #e9e9ee` (rounded). Sub-label
  (param name, `label` style) default only.
- Click → `bus.paramTap(w.block)`. Value is live: the shell wires
  `value = s.params[pinned.idx]`.

---

## 3. The generic auto-fit algorithm (authoritative)

Two independent width sources cap each widget, then manual density caps
further. From the shell's `mkW` (verbatim):

```js
const mkW=(id, grouped)=>{ const wl=L.widgets[id]; const vert=(wl.zone==="rail");
  // 3-size auto-fit: in a width-constrained panel, pick the largest of default/compact/mini that fits; manual density caps it smaller
  const rank={default:2,compact:1,mini:0}; const man=wl.density==="mini"?"mini":wl.density==="compact"?"compact":"default";
  let size="default"; const zoneW=this._panW&&this._panW[wl.zone];
  if(zoneW!=null && !vert){ const avail=zoneW-24, ew=this.estW(id); size = ew<=avail?"default":(ew*0.62<=avail?"compact":"mini"); }
  const zs=this._zoneSize&&this._zoneSize[wl.zone];
  if(zs&&!vert&&rank[zs]<rank[size]) size=zs;
  if(rank[man]<rank[size]) size=man;
  const constrained=(zoneW!=null && !vert)||(zs!=null&&zs!=="default");
  if(id.indexOf("param:")===0){ const p=s.pinned[id]||{}; return { kind:"param", density:wl.density, size, constrained, axis:vert?"v":"h", grouped:!!grouped, label:p.param, value:(p.idx!=null&&s.params[p.idx]!=null?s.params[p.idx]:p.value), color:p.color, block:p.block }; }
  return { kind:id, density:wl.density, size, constrained, axis:vert?"v":"h", grouped:!!grouped };
};
```

- **Per-panel fit** (custom panels): `_panW["panel:"+id] = pane.availW`
  (the pane's computed width). Per widget: fits `default` if
  `estW(id) <= availW-24`, else `compact` if `estW(id)*0.62 <= availW-24`,
  else `mini`.
- **Per-zone fit** (row zones `tl+tc+tr` jointly, `bottom`, `gridbar`):
  `_fit(ids, avail, gap)` — see `01-shell.md` §8 for the verbatim code and the
  overflow (`⋯`) shedding path. Factors: default = `Σ max(40, estW)`;
  compact = `Σ max(40, round(estW*0.62))`; else mini. Gap 12/10/8px per zone.
- **Manual density** (`wl.density`, set by the ⇲ cycle button or the context
  menu SIZE chips) is a **ceiling only** — auto-fit can shrink below it, never
  grow above it (`if(rank[man]<rank[size]) size=man`).
- Rail (`vert`) widgets skip width fitting (they're a fixed 52px column;
  presets place them as `compact`).
- Drop-time auto-shrink into the right dock and rail-drop compact defaulting
  are in `01-shell.md` §7.4.

The density-cycle button on each widget (edit mode) steps
`default → compact → mini → default` (`toggleDensity`, toast
`Widget size · <next>`).

---

## 4. Delta checklist vs current Svelte implementation

Checked against `src/lib/workbench/svelte/sizing.ts`, `WidgetZone.svelte`,
`WidgetHost.svelte`, `src/lib/axis-workbench/widgets/AxisWorkbenchWidget.svelte`,
`src/lib/axis-workbench/axisWorkbenchDefaults.ts`.

### P1 — behavior/math that must match

- [ ] **Auto-fit is a different algorithm.** Production `pickWidgetSize`
  (sizing.ts:11–31) uses one fixed threshold table for all widgets
  (`mini:44 / compact:88 / default:144`) against a per-unit
  `itemWidth = (zoneWidth - gaps) / unitCount` (WidgetZone.svelte:74–78).
  Design: **per-widget `estW` table** (§2) with **compact = estW×0.62**,
  40px floor, zone-level joint fit over `tl+tc+tr` with 12px gaps, plus
  per-custom-panel fit `estW <= availW-24`. Port `estW` + the ×0.62 rule +
  the joint top-row fit.
- [ ] **Overflow shedding rule differs.** Production sheds when
  `units.length >= 3 && zoneWidth < 150` with a slot count from
  `(zoneWidth-48)/(minUnitWidth+6)` (WidgetZone.svelte:59–71). Design: shed
  only when even mini doesn't fit; **preset + save always stay**; mini width
  estimate `max(36, estW*0.42)+10`, 44px reserved for the `⋯` chip; overflowed
  widgets get a red dashed outline (`#d6543f`) in edit mode instead of
  vanishing (design `_fit`/`_overflow`, 01-shell §8).
- [ ] **Manual density must act as a ceiling, not a fixed size.**
  Production `widget.resize` sets the size; verify auto-fit can still shrink
  below the manual setting per `mkW` (`rank[man]<rank[size]`).
- [ ] **Mini tap-cycles the *value*** for scenes / view / gridmode / fcdevice /
  fclayouts (single current-value chip; tap advances). Production mini
  renderings don't implement the cycle-on-tap semantics
  (AxisWorkbenchWidget.svelte). This is core mini behavior.
- [ ] **Hold-to-repeat missing** (380ms arm, 100ms repeat, cancel on
  up/leave/window-up) for preset prev/next and blocksize −/+
  (AxisWorkbenchWidget.svelte has single-shot clicks only).
- [ ] **Size metrics per state.** Production uses a single
  `--aw-widget-h: 38px` (WorkbenchHost.svelte:96). Design heights are
  38/34/28 with padding 13/10/7 and gap 8/8/5 per state (§1).

### P2 — visual anatomy

- [ ] **Custom tooltip** (`.axtip` bubble under the widget, §1.2) for param
  widgets — production uses native `title` only.
- [ ] **Preset widget**: mini must hide the ‹ › arrows (`presetArrow
  display:none`); name only in default with `max-width:150px` ellipsis; number
  amber `#f5a623` mono 14px. Verify against AxisWorkbenchWidget preset branch
  (arrows currently hidden only for `size==='mini'`? check line ~148).
- [ ] **CPU meter**: thresholds >75 red `#d6543f`, >55 amber `#f5a623`, else
  accent; track 44px (26px mini) × 6px radius 3.
- [ ] **conn widget**: 4-state map with exact colors/labels/tips (§2 conn);
  click routes reconnect vs account.
- [ ] **param arc geometry**: r12/viewBox32, stroke 3.4, dash `56.5·v/100
  ` of `150`, `rotate(135)`; value defaults 50; color = source block category
  color. (Production wheel-nudge ±0.015 on param widgets is an addition beyond
  the design — flag for maintainer decision rather than removal.)
- [ ] **Grouped rendering**: inside a group, box/boxSq become transparent and
  borderless with hover `#17171c`, boxSq width `H+4`, arrows 26px transparent
  (§1.1). Verify WidgetHost/WidgetGroupHost pass a `grouped` flag down and the
  widget consumes it.
- [ ] **Missing kinds**: design defines `logo`, `map` (6×3 dot matrix), `undo`
  (undo+redo pair), `fcswitch`, `fclayouts`, `fcdevice`, `search` visual;
  confirm each exists in AxisWorkbenchWidget (survey found preset, scenes,
  view, addBlock, tuner, tempo, cpu, save, connection, history, account,
  gridMode, blockSize, param — FC trio / map / undo / logo need verification
  or implementation).
- [ ] **Chip styles**: `numChip`/`pill` exact paddings, radius 6, accent
  fill `#35c9d6` on `#06181a` ink, inactive `#6e6e78`/`#9a9aa3` (§1.1).

### Non-deltas / mapping notes

- Zone id naming differs by design (`tl` ↔ `top.left` etc.) — a mapping, not a
  delta.
- Production `overflowPriority` metadata (axisWorkbenchDefaults.ts:101–120) is
  a reasonable generalization of the design's hardcoded `{preset,save}` keep
  set — keep the mechanism, but seed it so preset/save survive longest and the
  design's shed order is reproduced.
