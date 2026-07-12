# 05 — Block Editor panel & Modifier part (`design/AxisBlockEditor.dc.html`)

Source of truth: `design/AxisBlockEditor.dc.html` (1088 lines, branch `layout-rework`). One component serving two panels:

- **`be-part` unset / `"full"`** → the Block Editor panel (toolbar, channel selector, page tabs, arrange mode, parameter board, tray, type search, toasts) **plus** the modifier *flyout* when no docked modifier part exists.
- **`be-part="modifier"`** → the docked Modifier panel (same modifier UI, panel-styled, empty state when no parameter is targeted).

Props (from `data-props`):

```
block       — {name:string, type:string, color:string, glyph:string}
bePart      — enum "full" | "modifier"  (default "full")
onClose     — () => void                         (called by "Remove from grid")
onParamGrab — (p:{block:string,param:string}, e:PointerEvent) => void   (pin-as-quick-control drag out)
```

Mount points in the Layout System (`Axis Layout System.dc.html` line 252–253):

```html
<dc-import name="AxisBlockEditor" block="{{ editorBlock }}" on-close="{{ closeEditor }}" on-param-grab="{{ onParamGrab }}" hint-size="100%,100%"></dc-import>
<dc-import name="AxisBlockEditor" be-part="modifier" hint-size="100%,100%"></dc-import>   <!-- pane id "bemod" -->
```

---

## 1. Bus & shared state (`window.__BEBus`)

Constructor:

```js
this.bePart=(props&&props.bePart&&props.bePart!=="full")?props.bePart:null;
this.bus=window.__BEBus||(window.__BEBus={instances:new Set(), state:{}}); if(!this.bus.state) this.bus.state={};
this.SHARED=["vals","toggles","selects","eq","bypassed","muted","channel","page","pageOrder","boards",
             "hidden","cols","rows","compact","editMode","mods","modParam","modBlock","idents"];
...
Object.assign(this.state, this.bus.state);   // adopt shared state at construction
```

`setState` write-through (verbatim, line 629):

```js
setState(patch, cb){
  const p=(typeof patch==="function")?patch(this.state):patch;
  if(p) Object.assign(this.state, p);
  if(this.bus && p){
    const sh={}; let has=false;
    this.SHARED.forEach(k=>{ if(k in p){ sh[k]=p[k]; has=true; } });
    if(has){ Object.assign(this.bus.state, sh);
      this.bus.instances.forEach(i=>{ if(i!==this){ Object.assign(i.state, sh); try{ i.forceUpdate(); }catch(e){} } }); } }
  try{ this.forceUpdate(); }catch(e){}
  if(cb) cb();
}
```

**Exact `__BEBus` shared keys** (the spec for a production BlockEditor↔Modifier controller):

| Key | Meaning |
|---|---|
| `vals` | continuous param values `{param: 0..100}` |
| `toggles` | boolean params `{param: bool}` |
| `selects` | enum params `{param: optionIndex}` |
| `eq` | tone-EQ band `{freq, gain}` |
| `bypassed`, `muted` | block state chips |
| `channel` | `"A".."D"` |
| `page`, `pageOrder` | active tab + tab order |
| `boards` | per-page widget layout `{page: Widget[]}` where `Widget={id,param,x,y,w,h,view}` |
| `hidden` | per-page tray contents `{page: param[]}` |
| `cols`, `rows`, `compact`, `editMode` | arrange-mode grid settings |
| `mods` | per-param modifier settings `{param: modObj}` |
| `modParam`, `modBlock` | the parameter/block currently targeted by the modifier panel |
| `idents` | per-block identity overrides from type search `{blockName:{name,type,glyph,color}}` |

NOT shared (per-instance): `drag`, `toast`, `editingId`, `editBuf`, `openSelect`, `moreOpen`, `modOpen`, `modSourceOpen`, `typeSearchOpen`, `typeQuery`, `typeCat`, `vw`, `contentW`.

**Modifier ownership rule** — `modPartMounted()` scans the bus for another instance with `bePart==="modifier"`:

```js
modPartMounted(){ let f=false; this.bus.instances.forEach(i=>{ if(i!==this && i.bePart==="modifier") f=true; }); return f; }
openMod=(e)=>{ const param=e.currentTarget.dataset.param; const block=this.ident().name;
  if(this.modPartMounted()){ this.setState({ modParam:param, modBlock:block, modOpen:false });
    this.toast("∿ "+param+" → Modifier panel","#f5a623"); }
  else this.setState({ modOpen:true, modParam:param, modBlock:block, modSourceOpen:false }); };
```

I.e. tapping the ∿ badge targets the **docked Modifier panel when one is mounted** (via shared `modParam/modBlock`), and only falls back to the in-editor flyout when it isn't. `modVisible = isModPanel || (S.modOpen && !partMounted)` — the flyout never opens while a docked part exists.

---

## 2. Editor anatomy (`be-part="full"`)

Root: `position:absolute; inset:0; display:flex; flex-direction:column; background:#0e0e10; color:#e9e9ee; font-family:'Hanken Grotesk'…; overflow:hidden`.

### 2.1 Toolbar (header)

Row: `padding:8px 12px; border-bottom:1px solid #1c1c22; background:#101013; gap:8px; flex-wrap:wrap`. Left → right:

1. **Block identity chip** (click = open type search):
   - `identStyle`: h 40, radius 10, padding `0 10px`, `background:#141417; border:1px solid #26262c` (hover `#3a3a44`).
   - Icon 28×28 radius 8, `background:linear-gradient(180deg, shade(color,0.14), shade(color,-0.5)); border:1px solid shade(color,-0.25)`, glyph white 14 px.
   - Name `700 13px #fff`, ellipsized to `maxWidth` 200 / 140 / 96 (contentW ≥640 / ≥440 / else).
   - Type line `500 9.5px mono #f5a623`, shown only when `contentW>=420` (`showIdentType`).
   - Trailing magnifier SVG (12×12, accent).
   - Identity resolves through `ident()`: props.block overridden by shared `idents[block.name]` (type-search picks).
2. **Channel selector**: `CH` micro-label (`600 8px mono #56565e .08em`) + 4 chips A–D, each 26×26 radius 7 mono 700 11; active `background:#1c2b2c; border:#2f6d70; color:#8fe3ea`, inactive `#101014 / #26262c / #56565e`. Writes shared `channel`.
3. Spacer.
4. **Mute chip** — `chip()` factory: h 30, radius 8, padding `0 11px`, `700 11px`; on = `bg #241a12 / border #5a3f1f / color #f5c878`; toggling toasts `"Block muted"` (amber) / `"Mute off"` (teal).
5. **Bypass chip** — always "on-styled": engaged `bg #142417 / border #2c4a31 / color #5fc46b`, bypassed `bg #241516 / border #5a2f33 / color #d6543f`; leading 7 px dot `#46d17f`/`#d6543f` with matching glow; label `Engaged` / `Bypassed`.
6. Vertical divider `1×22 #26262c`.
7. **Arrange button** (`toggleEdit`): idle `bg #101d1e / border #234d4f / color #4fd1dc`, icon `✥`, label `Arrange` (label only when `contentW>=560`); active `bg #35c9d6 / color #06181a`, icon `✓`, label `Done`. Entering/leaving arrange clears drag/value-edit/select state.
8. **⋯ More** (30×30): menu at `top:48px; right:10px`, `min-width:190px; bg #16161b; border #2e2e36; radius 11; shadow 0 18px 44px rgba(0,0,0,.6)`, items `Change block type…` (⌕, `#8fe3ea` glyph) and `Remove from grid` (✕, `#d6543f`, calls `props.onClose` after toast).

### 2.2 Page tabs + arrange controls row

- Normal: `padding:7px 12px 5px`. Arrange mode restyles the row: `background:#0b1516; border-bottom:1px solid #1a3a3c; padding:7px 12px`.
- Tabs (`pageOrder`, default `["Ideal","Tone","EQ"]`): `padding:6px 12px; radius 7; 700 12px`; active `bg #1c2b2c / border #2f6d70 / color #8fe3ea`, inactive transparent `#9a9aa3`. Horizontal scroll (`overflow-x:auto`).
- Arrange-only `＋` add-page tab (28×26 dashed `#33333c`, hover accent); `addPage` creates `"Page N"`, empty board, all params hidden (in tray).
- Arrange-only right cluster: `✥ ARRANGE` label (`700 9px mono .12em #4fd1dc`), then:
  - **COLS stepper** and **ROWS stepper** — bordered `#234d4f` pill h 26 with `−`/value/`+` (`stepStyle`: 22×20 `#1c1c21`); `gridResize(dim,d)` clamps cols 4–24, rows 4–8, then shrinks/clamps every widget on every page and re-packs if compact. *These are global across all pages/blocks* ("applies to every block").
  - **Packed/Free toggle** (`toggleCompact`): label `⊞ Packed` / `⊡ Free`; active teal chip styling; enabling packs all pages.
  - **⤢ Tidy** (`tidyUp`): packs the current board, toast "Board tidied".

### 2.3 Parameter board (the widget grid)

Geometry:

```js
this.GAP=8;
cell(){ const g=this.GAP, cols=this.state.cols, cw=this.state.contentW||((this.state.vw||1100)-64);
  return this.clamp(Math.floor((cw-(cols-1)*g)/cols), 34, 220); }
// contentW from a ResizeObserver on the scroll container: (el.clientWidth||0)-28
// initial cols:  vw<760 → clamp(round((vw-64)/84),4,8)   else clamp(round((vw-64)/108),6,20);  rows: 4
boardW=cols*cell+(cols-1)*g;  boardH=rows*cell+(rows-1)*g;   // board is fixed-size, centered, maxWidth:100%
gridLayerStyle={ position:"absolute", inset:0, display:"grid",
  gridTemplateColumns:"repeat("+cols+","+cell+"px)", gridTemplateRows:"repeat("+rows+","+cell+"px)", gap:g+"px" };
```

Layers inside the board wrap: (1) arrange-mode background cell grid — one dashed cell per slot (`border:1px dashed #1f1f26; background:rgba(255,255,255,.012); radius 8`); (2) widget layer with optional **drag ghost** (`border:2px dashed #35c9d6|#d6543f; background:rgba(53,201,214,.12)|rgba(214,84,63,.12); radius 10` valid/invalid); (3) select popover; plus centered empty-state text "Empty page — add controls from the tray below" (`#3c3c44` 13 px).

**Widget model & catalog.** `CAT` maps param → `{kind, w, h, view, opts?}`; kinds `cont | toggle | select | eq | action`; view sets:

```js
CONT_VIEWS=["knob","fader","slider","number"];  TOG_VIEWS=["button","switch"];
VIEW_ICON={ knob:"◉", fader:"⇕", slider:"⇔", number:"#", button:"⏻", switch:"⊙", select:"▾", eq:"∿", action:"⏼" };
```

Default catalog (spec seed data): Gain 2×2 knob; Master/Bass/Mid/Treble/Presence/Input Trim/Depth/Definition/Sag/Low Cut/High Cut/Balance 1×1 knob; Level 1×2 **fader**; Bright/Boost 1×1 button; Amp Type 2×1 select (7 opts); Mode 2×1 select (Ideal/Authentic); Tone EQ 4×2 eq; Bypass 2×1 action. Default boards "Ideal" (18 widgets), "Tone", "EQ"; `hidden[page]` = all params not on that page.

**Card style** (`mkWidget`, verbatim core):

```js
const noBg = (wd.view==="action"||wd.view==="eq");
const card={ position:"relative", width:"100%", height:"100%", borderRadius:10, boxSizing:"border-box",
  background:noBg?"transparent":"#141417", border:"1px solid "+(ed?"#2c2c34":(noBg?"transparent":"#212127")),
  display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
  gap:Math.max(3,Math.round(cell*0.06)), padding:noBg?0:8, overflow:"hidden",
  transition:"border-color .12s, box-shadow .12s, opacity .12s", userSelect:"none", touchAction:"none",
  cursor: ed?"grab":(c.kind==="cont"?"ns-resize":"default"), opacity: dragging?0.28:1 };
if(wd._new) card.animation="bePop .34s cubic-bezier(.2,.9,.3,1)";
o.hoverStyle = ed?"border-color:#35c9d6;":(noBg?"":"border-color:#33333c;");
```

Label: `600 clamp(10, round(cell*0.135), 13)px #bdbdc6`, centered, ellipsized.

### 2.4 Control view types (visuals per size)

All continuous views share: `valueText = round(v)`, arc dash `((v/100)*113.1).toFixed(1)+" 300"`, pointer `rotate(-135+2.7*v, 32 32)`.

- **knob**: SVG viewBox 64 — track circle r 24 `#2a2a31` width 5 dash `113.1 300` rotated 135°, value arc accent `#35c9d6`, hub r 14 `#141417`, pointer dot r 2.6 `#f5a623` at (32,21). Dial size `dial = clamp(round(min(pxW, pxH-22)*0.78), 30, 150)`; center value font `clamp(11, round(dial*0.26), 30)px` mono 600.
- **fader**: value text on top (font `clamp(11, round(cell*0.16), 18)`), vertical track `width:14; flex:1; minHeight:18; radius 8; bg #0e0e12; border #26262c; cursor:ns-resize`; fill from bottom `linear-gradient(180deg,#5fe0ea,#35c9d6)`; handle `28×14 radius 5 #f5a623; border:3px solid #0d0d10; shadow 0 2px 5px rgba(0,0,0,.5)` at `bottom:calc(pct% - 8px)`.
- **slider**: header row (label left, value right `#7fd8de`), horizontal track `height:10; radius 6` same colors (gradient 90°), round handle `16×16 #f5a623 border 3 #0d0d10` at `left:calc(pct% - 8px)`; `cursor:ew-resize`.
- **number**: `− value +`; step buttons `max(24, round(cell*0.32))²; radius 8; bg #1c1c21; border #33333c; font 16`; value `700 clamp(16, round(min(pxW,pxH)*0.32), 44)px mono`, min-width `vf*1.6`. `onNudge` ±1.
- **button** (toggle): pill `minHeight max(30, round(cell*0.42)); radius 9; 700 clamp(11, round(cell*0.16))px`; on `bg #142417 / border #2c4a31 / #5fc46b`, off `bg #0e0e12 / border #2a2a31 / #7a7a83`; 8 px dot `#46d17f` glow on.
- **switch** (toggle): 54×30 radius 15; on `bg #173a26 / border #3a7d4f / inset glow rgba(70,209,127,.25)`; 22 px knob `left:3↔27`, on `#46d17f` glow, off `#5a5a62`; `left .16s cubic-bezier(.3,.8,.3,1)`.
- **select**: label top-left (`600 11px #9a9aa3; margin-left:14`), field `height:max(32, round(cell*0.46)); radius 9; bg #0d0d10; border #2c2c34 (open: #35c9d6); 600 13px #ededf2` + `▾`. Options render in a **board-coordinate popover** under the widget: `left = wd.x*(cell+g); top = (wd.y+wd.h)*(cell+g)+2; width = max(widgetPx,150); bg #161619; border #2e2e36; radius 11; shadow 0 18px 44px; maxHeight 230; overflow-y:auto`; option rows `9px 11px radius 8 600 13`; current option `#7fd8de` on `rgba(53,201,214,.12)`. A full-board transparent scrim closes it.
- **eq**: transparent card. Label floats top-left (`700 12px #c3c3cb` at 9/26). SVG `viewBox 0 0 1000 300 preserveAspectRatio:none`: dashed zero line, fill path `rgba(53,201,214,.10)`, curve `#35c9d6` width 3 `vector-effect:non-scaling-stroke`. Draggable band node (circle r 18 `#f5a623` stroke `#0a0a0c` 3, `cursor:grab`) only when `w>=3 && h>=2` (`eqFull`); readout cards (Frequency/Gain, amber values, `bg #0d0d10; border #26262c; radius 9`) only when `w>=4 && h>=3` (`eqReadouts`). Curve math: gaussian peak `gain*exp(-(oct²)/(2*0.9²))` around `eq.freq` + 12 dB/oct low/high-cut shelves derived from the `Low Cut`/`High Cut` param values; x is log-mapped `fToX(f)=log10(f/20)/3*1000`, y `150-(db/18)*120`. Drag: `freq=round(20*1000^fx)`, `gain=clamp((0.5-fy)*36,-18,18)` (0.1 resolution).
- **action**: full-card button; engaged `bg #142417/#2c4a31/#5fc46b` "Engaged", bypassed `bg #241516/#5a2f33/#d6543f` "Bypassed"; toggles shared `bypassed`.

**Overlaid affordances on each card:**

- **Grab handle ⠿** (param drag-source): top-left, `700 10px mono #56565e; opacity:.55` (hover `opacity:1; color:#8fe3ea`); shown when `!editMode && kind!=="action" && cell>=44`; `onGrabDown` stops the event and calls `props.onParamGrab({block:ident().name, param}, e)` — the shell continues the drag and drops a **pinned parameter widget**; without a host it toasts `Pin "…" — available inside the Axis shell`.
- **Modifier badge ∿**: top-right 21×21 radius 7, shown on `cont` params outside arrange mode; inactive `bg rgba(255,255,255,.035); border #26262c; color #56565e`; active (mod source > 0) `bg rgba(245,166,35,.16); border #5a3f1f; color #f5a623`. Click = `openMod` (§1 ownership rule).
- **Arrange chrome** (editMode): inset dashed overlay `1px dashed rgba(53,201,214,.45)` on `rgba(53,201,214,.04)`; dims badge `w×h` top-right (`700 8px mono #5b5b64` on `rgba(0,0,0,.4)`); remove ✕ top-left (21×21, red `rgba(214,84,63,…)`); **view-cycle chip** bottom-left (only when >1 view available): `{icon}{viewName}` mono 9 px on `rgba(53,201,214,.14)`, cycles `CONT_VIEWS`/`TOG_VIEWS`; **resize handle** bottom-right 24×24 `cursor:nwse-resize` with 13×13 diagonal-lines SVG (accent strokes).

### 2.5 Arrange interactions (drag / move / resize / occupancy)

```js
metrics(){ const r=this.boardEl.getBoundingClientRect(); const c=this.cell(); return { left:r.left, top:r.top, cw:c, ch:c, g:this.GAP }; }
occupancy(except) // rows×cols boolean matrix of every widget except `except`
fits(m,x,y,w,h)   // bounds + collision test
firstFit(m,w,h)   // scan y→x for the first free rect
```

- **Move** (`startMove` → `onMove`): grid position from pointer minus grab offset,
  `nx=round((clientX-left-offx*(cw+g))/(cw+g))` clamped; ghost `drag={id,x,y,w,h,valid}`; `valid = effCompact() ? true : fits(...)`. On release: commit x/y if valid; in packed mode run `packList` after commit.
- **Resize** (`onResizeDown` → `onMove`): `dw=round((clientX-sx)/(cw+g))`; clamp `1..cols-x` / `1..rows-y`; in Free mode a colliding resize is rejected (no-op); packed re-packs on release.
- **Pack** (`packList`): sort by `y,x`, place each at first fit (top-left bias), clamp to grid; used by Tidy, Packed toggle, grid resize, and post-move/resize in packed mode. `effCompact() = compact || isMobile()`.
- **Tray add** (`onTrayAdd`): `firstFit(catalog w,h)` else `firstFit(1,1)` else toast "No room — enlarge the grid" (red); new widget gets `_new:1` for the `bePop` animation (cleared after 380 ms) and its param leaves `hidden[page]`.
- **Remove** (`onRemoveWidget`): deletes the widget and returns its param to `hidden[page]`.
- **Page swipe** (non-arrange): pointer-down on board background arms `sw`; horizontal move >8 px marks it; on release `|dx|>60` steps `page` through `pageOrder` (left = next).

### 2.6 Value editing interactions

- **Cont drag**: pointer-down on a cont card (non-arrange) arms `vd`; move = `clamp(sv + (sy-clientY)*0.5, 0, 100)`.
- **Track drag** (fader/slider): `onTrackDown` computes fraction from the track rect (vertical for fader, horizontal otherwise) and live-updates through `onMove`.
- **Type-in**: click the value (`onValueDown`) → `editingId` + `editBuf=round(val)`; an `<input>` replaces the value (`bg #0a0a0c; border 1px #35c9d6; radius 6/7; mono`), auto-focused & selected via `componentDidUpdate`; Enter/blur commit (`parseFloat`, clamp 0–100), Escape cancels. Switching blocks (`props.block.name` change) clears `editingId`/`openSelect`.
- **EQ drag**: §2.4. **Toggle/action/select**: click handlers, all suppressed in arrange mode.

### 2.7 Add-control tray (arrange mode only)

Footer band `padding:9px 12px 11px; border-top:1px solid #1a3a3c; background:#0b1516`:

- Header: `ADD CONTROL` (`700 9px mono .12em #4fd1dc`) + hint `tap to drop into the first free slot · drag tiles to move · ⌟ resize · ✕ remove` (`500 10px mono #46464f`).
- Horizontally scrolling tiles (h 42, radius 10, `bg #141417; border #2a2a31`, hover accent border): 26×26 icon chip (`#7fd8de` on `#0e1718` border `#234142`, glyph = `VIEW_ICON[view]`), param name `12px 600 #e3e3e8`, meta `kind · w×h` (`500 8.5px mono #6e6e78`), trailing `+`.
- Empty tray: "All controls are on the board." (`#46464f`).

### 2.8 Type-change search overlay

Full-panel scrim `rgba(6,6,8,.68)` + `blur(3px)`, card 600 px (`bg #141418; border #2a2a31; radius 14; shadow 0 32px 80px`):

- Search header: magnifier SVG + input (`600 15px`, placeholder "Change block type — search amps, drives, delays…", auto-focused after 30 ms) + result count `"{n} types"`.
- Category chip rail (horizontal scroll): `All` (⁘ `#9a9aa3`) + the 11 editor categories (`CATS` with color+glyph, e.g. amp `#d98a2b ◣`, drive `#d6543f ◈`, delay `#4a82e0 ⟫`, in `#4f6bed →`, out `#2fa15f ⇥` …); chip h 30 radius 9, active `#1c2b2c/#2f6d70/#8fe3ea`.
- Results list: rows with 34×34 gradient glyph chip (category color), type name `600 14px`, category `500 10px mono #6e6e78`; the current type row is amber-tinted (`bg rgba(245,166,35,.08); border #5a3f1f`) with a `CURRENT` badge (`700 9px mono #f5a623`). Query matches type or category name (case-insensitive substring).
- Picking writes shared `idents[blockName] = {name:cat.name, type, glyph, color}` + toast `"Changed to {type}"` in the category color. Empty state: "No block types match your search."
- Esc key and scrim close it. Also reachable from the ⋯ menu.

### 2.9 Toast

Bottom-center pill: `bg rgba(22,22,27,.97); border #2e2e36; radius 11; shadow 0 14px 40px; 600 12.5px`, 9 px glowing accent dot, `animation:beToast 2.1s ease forwards` (auto-dismiss; timer 2100 ms).

---

## 3. `be-part="modifier"` — the Modifier part (full spec)

### 3.1 Visibility & container

```js
const partMounted=this.modPartMounted();
const modVisible = isModPanel || (S.modOpen && !partMounted);
const modIsFlyout = !isModPanel;
const modScrim = modIsFlyout && modVisible;
const modHasParam = modVisible && !!S.modParam;
const modEmpty = modVisible && !S.modParam;
const modWrapStyle = isModPanel
  ? { position:"absolute", inset:0, display:"flex", flexDirection:"column", background:"#0e0e10", overflow:"hidden" }
  : { position:"absolute", top:0, bottom:0, right:0, width:"min(400px,96%)", zIndex:200, background:"#101013",
      borderLeft:"1px solid #222229", boxShadow:"-26px 0 60px rgba(0,0,0,.55)", display:"flex", flexDirection:"column",
      overflow:"hidden", animation:"beSlide .24s cubic-bezier(.2,.85,.25,1)" };
```

- **Docked part**: fills its pane, no scrim, no close button, always rendered (empty state when untargeted).
- **Flyout** (owner = the full editor instance): right-anchored `min(400px,96%)` slide-in over a `rgba(6,6,8,.45)` scrim; has a ✕ close.

### 3.2 Header

`padding:10px 14px; border-bottom:1px solid #1c1c22; background:#101013`:

- Status dot 7 px: amber `#f5a623` + glow when the targeted param has an active source, else `#3a3a44`.
- Title = `modParam` (or "Modifier"); subtitle `"{MODBLOCK} · MODIFIER"` (mono 9 px `.08em #6e6e78`) or `"NO PARAMETER TARGETED"`.
- `Clear` chip (only when a source is assigned): h 26 `bg #141417/border #2a2a31/#9a9aa3`, hover red; sets `mods[param].source=0` + toast "Modifier cleared · {param}".
- ✕ close 28×28 — **flyout only** (`modIsFlyout`).

### 3.3 Empty state (docked part with no target)

Centered column: ∿ 28 px `#3a3a44`; "No parameter targeted" (`700 13px #cfcfd6`); "Tap the ∿ badge on any continuous parameter in a Block panel to edit its modifier here." (`500 11.5px #9a9aa3`, max-width 260).

### 3.4 Data model & binding

```js
defaultMod(){ return { source:0, channel:0, pcReset:false, updateRate:0, damping:2, autoEngage:1,
  min:0, max:100, attack:20, release:35, start:0, mid:50, end:100, slope:50, scale:50, offset:50, offValue:0 }; }
getMod(p){ return Object.assign(this.defaultMod(), this.state.mods[p]||{}); }
setMod(p,patch){ ...this.setState({ mods:{...mods, [p]:{...cur,...patch}} }); }   // mods is SHARED
modActive(p){ const m=this.state.mods[p]; return !!(m && m.source>0); }
SOURCES=["None","Expression 1","Expression 2","LFO 1","LFO 2","Envelope","ADSR","Sequencer"];
CHANNELS=["All","1","2","3","4"];  UPDATE=["Fast","Medium","Slow"];
DAMP=["None","Linear","Exponential","Logarithmic"];  ENGAGE=["Off","Fast Pos","Slow Pos","Auto"];
MAP_KEYS=[["start","Start"],["mid","Mid"],["end","End"],["slope","Slope"],["scale","Scale"],["offset","Offset"]];
```

Because `mods`, `modParam`, `modBlock` are shared bus keys, the docked panel re-binds instantly when any editor instance's ∿ badge is tapped, and edits made in the panel light up the badge in the editor.

### 3.5 Body sections (scrollable, `padding:14px; gap:16px`)

Every section is introduced by a hairline-flanked mono heading (`700 10px mono .13em #6e6e78` between two `1px #222229` lines).

1. **SOURCE** — select-style box: assigned `bg #102023; border 1px solid #2c5d63; color #7fd8de; 700 14px`, unassigned `bg #0a0a0c; border 1px dashed #3a3a44; color #9a9aa3`, label `NONE — tap to assign`; opens an inline option list (`bg #101014; border #26262c; radius 10`, rows like the select popover, "None" dimmed `#8a8a93`). Below: two centered enum buttons with captions — **Channel** (cycles All/1–4) and **PC Reset** (On/Off). Enum button style (`enumBtn`): `minWidth 88, maxWidth 150, h 34, radius 9, 700 12px`; active `bg #102023/border #2c5d63/#7fd8de`, idle `bg #141417/border #2a2a31/#e3e3e8`.
2. **RESPONSE** — curve preview: container `aspect-ratio:1.4/1; max-height:210px; bg #08080a; border #26262c; radius 10`; SVG viewBox 0 0 100 100 with third-lines `#16161b`, fill `rgba(53,201,214,.10)`, curve `#35c9d6` width 2.2; axis captions `SOURCE →` (bottom-left) and vertical `↑ VALUE`. Curve math (verbatim):

```js
modCurve(){ const m=this.getMod(this.state.modParam);
  const s=m.start/100, mid=m.mid/100, e=m.end/100, scaleF=m.scale/50, off=(m.offset-50)/50, slope=(m.slope-50)/50;
  let cur="", fill="M0 100";
  for(let i=0;i<=50;i++){ const x=i/50;
    let base = x<0.5 ? s+(mid-s)*(x*2) : mid+(e-mid)*((x-0.5)*2);
    let y = (base-0.5)*scaleF + 0.5 + off*0.4 + slope*(x-0.5)*0.6;
    y=this.clamp(y,0,1);
    const px=(x*100).toFixed(1), py=((1-y)*100).toFixed(1);
    cur+=(i?" L":"M")+px+" "+py; fill+=" L"+px+" "+py; }
  fill+=" L100 100 Z"; return { cur, fill }; }
```

3. **PARAMETER RANGE** — knobs `Min`, `Max` + enum button **Update Rate** (Fast/Medium/Slow).
4. **DAMPING** — knobs `Attack`, `Release` (value format `round(v*5)+" ms"`) + enum button **Damping**.
5. **MAPPING** — 3-column grid (`gap:14px 6px`) of 6 knobs Start/Mid/End/Slope/Scale/Offset. Formats: slope `((v-50)/12.5).toFixed(1)`, offset signed `±round(v-50)`, others `round(v)+"%"`.
6. **AUTO ENGAGE** — knob `Off Value` + enum button **Auto Engage** (Off/Fast Pos/Slow Pos/Auto).

**Modifier knob spec** (`mkModKnob` + template): value readout box `54×17 radius 5 bg #0c0c0e border #202027 mono 600 10px #cfcfd6` above a 50×50 SVG knob (same 64-viewBox arc as editor knobs, hub r 15 `#16161b`, pointer dot `#dcdce2`), label below `600 11px #9a9aa3`; drag `cursor:ns-resize`, `nv = clamp(sv + (sy-clientY)*0.5, 0, 100)` via the global pointermove.

---

## 4. Mobile behavior

- `isMobile() = vw < 760` (window resize listener keeps `vw` fresh).
- `effCompact() = compact || isMobile()` — mobile always packs the board (no free-position gaps), and drag ghosts are always "valid" (auto-pack on drop).
- Initial `cols` on mobile: `clamp(round((vw-64)/84), 4, 8)` (desktop `clamp(round((vw-64)/108), 6, 20)`).
- Identity chip truncation tiers (§2.1): name max-width 96 px below 440 contentW; type line hidden below 420; Arrange label hidden below 560.
- Board page swipe (>60 px) is the primary page navigation on touch.
- Modifier flyout width `min(400px, 96%)` — near-full-width sheet on phones.
- Cell size floor 34 px keeps controls tappable; grab handle hidden when `cell<44`.

---

## 5. Visual values table

| Element | Values |
|---|---|
| Panel bg / toolbar | `#0e0e10` / `#101013`, border `#1c1c22` |
| Card | `bg #141417; border #212127` (arrange `#2c2c34`, hover `#33333c` / accent in arrange), radius 10, padding 8 |
| Grid | GAP 8; cell clamp 34–220; cols 4–24; rows 4–8 |
| Accent / warn / ok / danger | `#35c9d6` / `#f5a623` / `#46d17f`,`#5fc46b` / `#d6543f` |
| Knob arc | r 24, width 5, dash track `113.1 300`, rotate 135°, pointer `#f5a623` r 2.6 |
| Fader | track 14 w, fill `linear-gradient(180deg,#5fe0ea,#35c9d6)`, handle 28×14 `#f5a623` border 3 `#0d0d10` |
| Slider | track h 10, handle 16 ⌀ |
| Switch | 54×30 r 15, knob 22, travel 3→27, `.16s cubic-bezier(.3,.8,.3,1)` |
| Select popover | `bg #161619; border #2e2e36; r 11; shadow 0 18px 44px rgba(0,0,0,.6); maxHeight 230` |
| EQ | viewBox 1000×300, curve `#35c9d6` w 3, fill `rgba(53,201,214,.10)`, node r 18 `#f5a623`, y-range ±18 dB (display clamp ±22) |
| Value input | `bg #0a0a0c; border 1px #35c9d6; r 6–7; color #fff; mono` |
| Ghost | dashed 2px accent/red + 12% tint fill |
| Tray | band `#0b1516`, top border `#1a3a3c`; tile h 42 r 10 |
| More/type-search overlays | menu min-w 190; search card 600 px r 14; scrim `rgba(6,6,8,.68)` blur 3 |
| Modifier | flyout w `min(400px,96%)`, `beSlide .24s`; knob 50 px; readout 54×17; response `aspect 1.4/1 maxH 210` |
| Animations | `bePop .34s cubic-bezier(.2,.9,.3,1)`, `beToast 2.1s`, `beIn .12–.2s`, `beSlide .24s` |
| Fonts | Hanken Grotesk (UI), JetBrains Mono (values/labels/badges) |

---

## 6. Delta checklist vs current production

Compared against: `src/lib/axis-workbench/panels/AxisBlockEditorPanel.svelte`, `src/lib/axis-workbench/axisWorkbenchRegistry.ts`, `src/lib/BlockEditor.svelte`, `src/lib/ControlSurface.svelte`, `src/lib/ModifierFlyout.svelte`, `src/lib/EQGraph.svelte`.

### P0 — structural gaps

- [ ] **No `be-part="modifier"` equivalent registered** *(confirmed)* — `axisWorkbenchRegistry.ts` registers no `axis.modifier` (or `axis.blockEditor.modifier`) panel; modifier editing exists only as `ModifierFlyout.svelte` inside the editor. Implement a dockable Modifier panel per §3: pane-filling wrap style, empty state, header (dot/title/sub/Clear), and the §1 ownership rule — when the panel is mounted, the editor's ∿ badge must **target the panel** (shared `modParam`/`modBlock` equivalent on the controller) instead of opening the flyout, with the `"∿ {param} → Modifier panel"` toast.
- [ ] **Editor↔Modifier shared-state contract** — production needs a typed equivalent of the `__BEBus` SHARED keys (§1), most critically `mods`/`modParam`/`modBlock` (badge active-state + panel binding) and `editMode/cols/rows/compact/boards/hidden/page/pageOrder` if the board part is ever split. Map remaining keys onto `editor.svelte.ts` state (`vals/toggles/selects/channel/bypassed/muted` already exist as live params).

### P1 — behavior parity in the editor (`AxisBlockEditorPanel` + `BlockEditor.svelte`/`ControlSurface.svelte`)

- [ ] **Toolbar layout**: identity chip (gradient glyph, name, amber type line, magnifier) with the §2.1 truncation tiers (200/140/96 name width; type hidden <420; Arrange label hidden <560) driven by **panel contentW**, not viewport — verify `BlockEditor.svelte` header responds to pane width in the workbench.
- [ ] **Mute chip + ⋯ More menu** (Change block type… / Remove from grid → `onClose`) — production footer has Mute/Remove (per `FcEditor`-era footer in the monolith); confirm the panelized editor exposes them in the toolbar as specced, and that Remove routes through the workbench close.
- [ ] **Arrange-mode toolbar**: global COLS/ROWS steppers (4–24 / 4–8, rescaling all pages), Packed/Free toggle with auto-pack, Tidy, add-page `＋` — `ControlSurface.svelte` has Arrange (move/resize/retype/add/remove/tidy); verify cols/rows steppers + packed/free semantics (`packList` top-left pack, `effCompact = compact || mobile`) and the arrange-tinted tab row (`#0b1516`/`#1a3a3c`).
- [ ] **Tray** (arrange): hidden-params-per-page model, tile anatomy (icon chip/param/meta/`+`), first-fit drop with `bePop` animation, "No room — enlarge the grid" toast, params returning to the tray on widget remove — verify against `ControlSurface.svelte`'s add-control flow.
- [ ] **View cycling**: per-kind view sets (`knob/fader/slider/number`, `button/switch`) with the bottom-left cycle chip showing `VIEW_ICON` + name — confirm ControlSurface's retype control covers the same sets and iconography.
- [ ] **Param grab-as-widget**: ⠿ handle on every non-action control (visible `cell>=44`, hidden in arrange) calling `onParamGrab({block,param}, pointerEvent)` so the shell can pin the parameter as a floating/docked quick-control widget (registry has `axis.paramControl`) — verify the drag-out pipeline from the panelized editor exists end-to-end.
- [ ] **Value type-in**: click-value → focused/selected input, Enter/blur commit clamp, Esc cancel, cleared on block switch — verify every view type (knob center, fader/slider header, number center).
- [ ] **Select popover**: board-anchored positioning under the widget with 150 px min width and scrim-close (§2.4) — production selects may use native/flyout menus; align look (`#161619` card, current-option teal tint).
- [ ] **Type search overlay**: category chip rail + CURRENT badge + per-category colored glyph chips + Esc/scrim close (§2.8) — `BlockEditor.svelte` has `openRetype()`; verify chrome parity (600 px card, count label, empty state copy).
- [ ] **Board page swipe** (>60 px horizontal on background) for page switching outside arrange mode.

### P1 — modifier content parity (`ModifierFlyout.svelte`)

- [ ] Section structure & order: SOURCE (select + Channel + PC Reset) → RESPONSE (curve, `modCurve()` math §3.5) → PARAMETER RANGE (Min/Max + Update Rate) → DAMPING (Attack/Release + Damping) → MAPPING (6-knob 3-col grid) → AUTO ENGAGE (Off Value + engage enum). Production flyout has min/max/start/mid/end/slope/scale/offset + source/channel/update/damping enums — verify grouping, enum cycles (tap-to-cycle buttons, not dropdowns), and knob value formats (`ms = v*5`, slope `(v-50)/12.5`, offset signed).
- [ ] Clear button semantics (`source=0`, keeps other settings) + status dot; dashed "NONE — tap to assign" source box.
- [ ] Flyout presentation: right slide-in `min(400px,96%)`, `beSlide .24s`, scrim `rgba(6,6,8,.45)` — vs production flyout styling.

### P2 — polish

- [ ] Card/`bePop` placement animation, toast spec (`beToast 2.1s`, glowing dot), hover border transitions (.12s).
- [ ] EQ widget size gates (`eqFull` w≥3&h≥2 node-drag; `eqReadouts` w≥4&h≥3) and non-scaling-stroke curve — compare `EQGraph.svelte` behavior when embedded at small sizes.
- [ ] Fader `w:1,h:2` default for Level; Gain default `2×2` knob — catalog-driven default sizes/views per param (production derives from the device catalog; keep visual defaults equivalent).
- [ ] Empty-page state copy ("Empty page — add controls from the tray below").
- [ ] Channel chips write-through and identity `idents` override behavior after a type change (name/glyph/color update everywhere, including toolbar and toasts).
