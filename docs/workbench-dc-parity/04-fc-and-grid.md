# 04 — FC Panel & Signal Grid parts (`design/AxisFcPanel.dc.html`)

Source of truth: `design/AxisFcPanel.dc.html` (3030 lines, branch `layout-rework`).
This one file serves **two production panels**:

1. the **Signal Grid panel** via `fc-part="grid"` (grid + cables + quick controls, pane-relative sizing), and
2. the **FC Controllers panels** via `fc-part="board" | "inspector" | "layouts" | "led" | "tap" | "hold"` (plus the un-parted full prototype shell).

The maintainer has declared the file **including its JS logic** the binding spec — production ports the logic verbatim (with typed controllers replacing the window bus).

---

## 1. Part selection & lifecycle

### 1.1 Props

```
fcPart        (attr `fc-part`)   — null | "grid" | "board" | "inspector" | "layouts" | "led" | "tap" | "hold"
gridMode      (attr `grid-mode`) — "full" | "map" | "auto"       (grid part only; default "auto")
blockSize     (attr `block-size`)— 0 | 1 | 2  (S/M/L)            (grid part only; default 1)
onSelectBlock (attr `on-select-block`) — (idx:number, cell) => void   (grid part only)
```

The Layout System mounts the grid part like this (`Axis Layout System.dc.html` line 251):

```html
<dc-import name="AxisFcPanel" fc-part="grid" grid-mode="{{ gridMode }}" block-size="{{ blockSize }}"
           on-select-block="{{ onGridSelect }}" hint-size="100%,100%"></dc-import>
```

### 1.2 Part gating (verbatim, `renderVals()` line 2532)

```js
const fcp=this.fcPart;
const isFc=fcp?(fcp!=="grid"):(S.railActive==="fc"), isBuild=fcp?(fcp==="grid"):!isFc, fc=this.fcView(mob);
const fcShowBoard=!fcp||fcp==="board",
      fcShowLay=!fcp||fcp==="board"||fcp==="layouts",
      fcShowInsp=!fcp||fcp==="inspector"||fcp==="led"||fcp==="tap"||fcp==="hold",
      fcShowLed=!fcp||fcp==="inspector"||fcp==="led";
if(fcp){ fc.scrimStyle=null; fc.inspShow=true;
  fc.inspStyle={ flex:"1 1 0%", minHeight:0, display:"flex", flexDirection:"column", background:this.tk.bg2 }; }
const showFull=fcp?false:!mob;   // rail + topbar only in the full shell
```

So per part:

| `fc-part` | Renders |
|---|---|
| *(none)* | full prototype shell: rail, top bar, grid, editor, FC, all overlays |
| `grid` | signal grid only (`isBuild` branch) |
| `board` | FC header strip (device selector) + LAYOUTS strip + board hero |
| `layouts` | LAYOUTS strip only |
| `inspector` | switch inspector: header + identity (LED/label) + tap **and** hold cards |
| `led` | inspector chrome + identity section only |
| `tap` / `hold` | inspector chrome + that one action card only |

### 1.3 Overlay suppression in part instances (verbatim, line 3017)

Every `fc-part` instance force-closes all overlays — overlays belong exclusively to the full-shell owner (in production: to the shell/controller):

```js
...(this.fcPart ? { editorOpen:false, histOpen:false, paletteOpen:false, drawerOpen:false,
                    libOpen:false, themeOpen:false, ctxShow:false, showHistPill:false, presetOpen:false } : {})
```

Note this also disables the block **context menu** and history pill inside the grid *part* — long-press/right-click still runs `openCtxAt` but nothing renders. The FC inspector-as-part additionally never shows a scrim and is always "open" (`fc.inspShow=true`).

### 1.4 `__FCBus` — exact shared-state keys

Bus creation (constructor):

```js
this.bus=window.__FCBus||(window.__FCBus={instances:new Set(), state:{}});
```

`componentDidMount`: `this.bus.instances.add(this); Object.assign(this.state, this.bus.state);`
`componentWillUnmount`: `this.bus.instances.delete(this);`

The `setState` override write-through (verbatim, line 2851):

```js
setState(patch, cb){ const p=(typeof patch==="function")?patch(this.state):patch;
  if(p) Object.assign(this.state,p);
  if(this.bus&&p){
    const SH=["fcLayout","fcView","fcSwitch","fcLayouts","fcDevice","fcInspOpen"];
    const sh={}; let has=false; SH.forEach(k=>{ if(k in p){ sh[k]=p[k]; has=true; } });
    if(has){ if(this.bus.state) Object.assign(this.bus.state, sh);
      this.bus.instances.forEach(i=>{ if(i!==this){ Object.assign(i.state,sh); try{ i.forceUpdate(); }catch(e){} } }); } }
  try{ this.forceUpdate(); }catch(e){} if(cb) cb(); }
```

**Shared FC state keys (the spec for the production FC controller snapshot):**

| Key | Meaning |
|---|---|
| `fcLayout` | selected layout index 0–8 (9 = "MASTER" at index 8) |
| `fcView` | selected view 0–3 |
| `fcSwitch` | selected switch index 0–11 |
| `fcLayouts` | the entire edited layout model (9 layouts × 4 views × 12 switches) |
| `fcDevice` | `"FM3" \| "FC-6" \| "FC-12"` |
| `fcInspOpen` | mobile-only: switch inspector sheet open |

Grid state (`grid`, `routes`, `knobs`, `selected`, …) is **not** on the bus — the grid part is a single mount; cross-panel selection goes through the `onSelectBlock` callback instead.

The Layout System's widgets also read the bus directly for their chips (`Axis Layout System.dc.html` line 1603):
`window.__FCBus.state.fcDevice / fcLayout / fcSwitch / fcView`.

---

## 2. `fc-part="grid"` — the Signal Grid panel

### 2.1 Grid toolbar ("gridbar") — panel chrome

The toolbar is **not** rendered inside `AxisFcPanel`; it is a widget zone named `gridbar` in the **grid pane header** of the Layout System (`Axis Layout System.dc.html` lines 241–243):

```html
<sc-if value="{{ pane.isGrid }}"><div data-zone="gridbar" onPointerDown="{{ stopProp }}" style="display:flex; align-items:center; gap:6px;">
  <sc-for list="{{ zoneGridbar }}" as="it" hint-placeholder-count="2">
    <div data-wid="{{ it.dragId }}" onContextMenu="{{ it.onCtx }}" style="{{ it.wrapStyle }}">
      <sc-if value="{{ it.isSingle }}"><dc-import name="AxisWidget" w="{{ it.w }}" data="{{ wdata }}" bus="{{ bus }}" hint-size="130px,32px"></dc-import></sc-if>
      <div onPointerDown="{{ it.onDrag }}" style="{{ it.overlayStyle }}"></div>
    </div></sc-for>
</div></sc-if>
```

Default gridbar widgets (Layout System line 691): `gridmode:W("gridbar",0), blocksize:W("gridbar",1)`. The zone participates in the widget auto-fit pipeline (`this._zoneSize.gridbar=_fit(this.zoneItems("gridbar"), Math.max(70,_gpw-250), 8)` — widgets step default → compact → mini so the header never overflows). Users can drag any widget into/out of the gridbar zone (zone id `gridbar`, human name "Grid bar").

**Widget: GRID MODE** (`AxisWidget.dc.html` lines 184–190, logic 271–273; `estW = 184`):

```html
<sc-if value="{{ isGridMode }}">
  <div style="{{ box }}">
    <sc-if value="{{ expanded }}"><span style="{{ label }}">GRID</span></sc-if>
    <div style="{{ chipRow }}">
      <sc-for list="{{ gridModes }}" as="m"><div data-m="{{ m.id }}" onClick="{{ onGridMode }}" style="{{ m.style }}">{{ m.label }}</div></sc-for>
    </div>
  </div>
</sc-if>
```

```js
const gmCur=(d.gridMode||"auto");
const gmAll=[{id:"full",label:"Full"},{id:"map",label:"Map"},{id:"auto",label:"Auto"}];
const gridModes = (mini ? gmAll.filter(m=>m.id===gmCur) : gmAll).map(m=>({ id:m.id, label:m.label, style:pill(mini||gmCur===m.id) }));
```

- `default`: "GRID" label + 3 chips Full/Map/Auto; `compact`: chips only; `mini`: only the *current* mode chip.
- Clicking calls `setGridMode(m)` → Layout System state `gridMode` → re-mounts prop into the grid part.

**Widget: BLOCK SIZE** (`AxisWidget.dc.html` lines 193–200; `estW = 132`):

```html
<sc-if value="{{ isBlockSize }}">
  <div style="{{ box }}">
    <sc-if value="{{ expanded }}"><span style="{{ label }}">SIZE</span></sc-if>
    <div onClick="{{ sizeLess }}" onPointerDown="{{ sizeLessHold }}" onPointerUp="{{ holdStop }}" onPointerLeave="{{ holdStop }}" title="Bigger blocks (hold)" style="{{ stepBtn }}">−</div>
    <span style="font:700 12px/1 'JetBrains Mono',monospace; color:#e9e9ee; min-width:12px; text-align:center;">{{ blockSizeLabel }}</span>
    <div onClick="{{ sizeMore }}" onPointerDown="{{ sizeMoreHold }}" onPointerUp="{{ holdStop }}" onPointerLeave="{{ holdStop }}" title="Smaller blocks (hold)" style="{{ stepBtn }}">+</div>
  </div>
</sc-if>
```

- `blockSizeLabel = ["S","M","L"][s.blockSize]` (Layout System line 1428). Stepper is hold-to-repeat and disabled while in map mode (`sBtn(mapMode||s.blockSize>=2)` / `sBtn(mapMode||s.blockSize<=0)`).
- Note inverted mapping in the Layout System: `sizeLess()` *increments* `blockSize` ("− means bigger blocks"), `sizeMore()` decrements — clamp 0..2.

**Widget: MAP (minimap)** (`AxisWidget.dc.html` lines 115–118, 294; `estW = 98`) — a passive 18-dot miniature of grid occupancy that can be placed anywhere (top bar by default, gridbar optionally):

```js
const mapDots = (d.mapCells || Array.from({length:18}, (_,i)=>[3,4,8,9,10,14].includes(i)))
  .map(on=>({ style:`width:3px; height:3px; border-radius:1px; background:${on?"#35c9d6":"#2a2a31"};` }));
```

### 2.2 Pane-relative sizing math (verbatim — the core spec)

Pane rect measurement — ResizeObserver installed on the pane host in `gridRef` (line 1919):

```js
gridRef = (el) => { this.gridInnerEl = el;
  if(el && this.fcPart==="grid"){
    const host=(el.parentElement&&el.parentElement.parentElement)||el.parentElement;
    if(host && typeof ResizeObserver!=="undefined" && this._gridRO!==host){
      if(this._gridRO_obj) this._gridRO_obj.disconnect();
      this._gridRO_obj=new ResizeObserver(()=>{ const w=host.clientWidth, h=host.clientHeight;
        if((w && Math.abs(w-(this._gridW||0))>1)||(h && Math.abs(h-(this._gridH||0))>1)){
          this._gridW=w; this._gridH=h;
          if(this._gridRAF) cancelAnimationFrame(this._gridRAF);
          this._gridRAF=requestAnimationFrame(()=>this.forceUpdate()); } });
      this._gridRO_obj.observe(host); this._gridRO=host;
      this._gridW=host.clientWidth; this._gridH=host.clientHeight; } } };
```

Mode resolution + cell sizing (lines 2557–2605, verbatim):

```js
const gpPart = this.fcPart==="grid";
const gpMode = gpPart ? (this.props.gridMode||"auto") : "full";
const gpSize = gpPart ? (this.props.blockSize==null?1:this.props.blockSize) : 1;
const _gpHost = this.gridInnerEl && ((this.gridInnerEl.parentElement&&this.gridInnerEl.parentElement.parentElement)||this.gridInnerEl.parentElement);
const gpW = gpPart ? ((_gpHost&&_gpHost.clientWidth)||this._gridW||(S.vw||1280)) : (S.vw||1280);
const gpH = gpPart ? ((_gpHost&&_gpHost.clientHeight)||this._gridH||600) : 600;
// Resolved grid mode. Auto steps Full -> Map -> mobile as the panel narrows OR flattens, so it never scrollbars.
const gpSizeMin=[56,72,96][gpSize]||72; const gpFullGap=Math.round(gpSizeMin*0.32);
const fullMin = 12*gpSizeMin + 11*gpFullGap + 44;   // width a scroll-free full grid needs
const fullMinH = 4*Math.round(gpSizeMin*0.95) + 3*gpFullGap + 56;  // height a scroll-free full grid needs
let gMode;
if(!gpPart){ gMode = mob ? "mobile" : "full"; }
else if(gpMode==="map"){ gMode="map"; }
else if(gpMode==="full"){ gMode="full"; }
else { gMode = gpW < 620 ? "mobile" : ((gpW < fullMin || gpH < fullMinH) ? "map" : "full"); }   // auto
const gpMap = (gMode==="map");
const gMob = (gMode==="mobile");
const visCols = gMob ? this.clamp(S.mobCols||6, 3, 12) : 12;
const gpMinCol = gpMap ? 30 : gpSizeMin;
const gap = gMob ? (visCols<=4?16:visCols<=6?12:visCols<=8?9:6) : (gpMap?7:(gpPart?gpFullGap:26));
// integer column width; the scroll box is capped to exactly one page (pageW) so no next-page block can bleed in
const colW = gMob ? Math.max(28, Math.floor((gpW-24-(visCols-1)*gap)/visCols)) : 0;
const pageW = gMob ? (visCols*colW+(visCols-1)*gap) : 0;
const stripW = gMob ? (12*colW+11*gap) : 0;
const pageCount = gMob ? Math.ceil(12/visCols) : 1;
const page = this.clamp(S.page||0, 0, pageCount-1);
const pageShift = visCols*(colW+gap);
const denseGrid = gMob && visCols>6;  // blocks too small for per-block param swipe — disable it
this._dense = denseGrid;
const showType = gMob ? colW>=56 : (!gpMap && gpSize>=1);
const gridScrollStyle=gMob
  ? { flex:1, minHeight:0, overflowX:"hidden", overflowY:"auto", padding:"14px 12px", background:"transparent", WebkitOverflowScrolling:"touch" }
  : { flex:1, minHeight:0, overflow:"auto", padding:(gpMap?"14px 16px":"26px 22px"), background:"transparent", WebkitOverflowScrolling:"touch" };
// clip wrapper: exactly one page wide, centered — guarantees no next-page block bleeds past the edge
const gridClipStyle=gMob
  ? { position:"relative", width:pageW+"px", maxWidth:"100%", marginLeft:"auto", marginRight:"auto", overflow:"hidden" }
  : { position:"relative", width:"100%" };
// pane-relative height cap: cell width never exceeds what 4 scroll-free rows allow inside THIS pane
const _padV = gpMap ? 34 : 58;
const _colCapH = gpPart ? Math.max(22, Math.floor(((gpH-_padV-3*gap)/4)/0.95)) : 9999;
const _mapColMax = Math.min(42, _colCapH);
const _fullColMax = Math.min(140, _colCapH);
const gridInnerStyle=gMob
  ? { position:"relative", width:stripW+"px", transform:"translateX("+(-page*pageShift)+"px)", transition:"transform .26s cubic-bezier(.3,.8,.3,1)" }
  : { position:"relative", width:"100%", maxWidth:(gpMap?Math.min(720,12*_mapColMax+11*gap+2):Math.min(1680,12*_fullColMax+11*gap+2)), margin:"0 auto" };
const gridStyle={ display:"grid",
  gridTemplateColumns:gMob?("repeat(12, "+colW+"px)")
    :(gpMap?("repeat(12, minmax(24px,"+_mapColMax+"px))")
    :("repeat(12, minmax("+Math.min(gpMinCol,_fullColMax)+"px,1fr))")),
  gap, width:"100%", position:"relative", zIndex:1, pointerEvents:"none" };
```

Key derived facts:

- Device matrix is fixed **12 columns × 4 rows** (`idx = row*12 + col`); cells have `aspectRatio:"1 / 0.95"`.
- Block-size prop → minimum column width `56/72/96 px` (S/M/L) with gap = `round(min*0.32)`.
- `auto` mode: `<620 px wide → mobile`, else map when the pane can't fit a scroll-free full grid in **either** axis, else full.
- Cell heights are capped by the pane height so 4 rows always fit without scrolling (`_colCapH`); map cells max 42 px, full cells max 140 px.

Cell rect capture for cables — `remeasure()` (line 1756):

```js
remeasure(){
  const inner=document.querySelector("[data-grid-inner]"); if(!inner) return false;
  const cells=inner.querySelectorAll("[data-idx]"); if(!cells.length) return false;
  const ir=inner.getBoundingClientRect(); const map={};
  cells.forEach(el=>{ const r=el.getBoundingClientRect();
    map[+el.dataset.idx]={ left:r.left-ir.left, right:r.right-ir.left,
      cx:(r.left+r.right)/2-ir.left, cy:(r.top+r.bottom)/2-ir.top }; });
  map._w=ir.width; map._h=ir.height;
  this.setState({ rects:map }); return true; }
```

Re-measure triggers: `[0,120,400,900].forEach(t=>setTimeout(()=>this.remeasure(), t))` at mount, and a `requestAnimationFrame(remeasure)` whenever `vw / isMobile / editorOpen / editorH` change (`componentDidUpdate` signature check).

### 2.3 Cable rendering

SVG layer absolutely fills the grid inner (`overflow:visible; z-index:0; pointer-events:none`), one `<g>` per route:

```js
const cableD=(x1,y1,x2,y2)=>{ const dx=Math.max(22,(x2-x1)*0.5);
  return "M"+x1.toFixed(1)+" "+y1.toFixed(1)+" C"+(x1+dx).toFixed(1)+" "+y1.toFixed(1)+","
        +(x2-dx).toFixed(1)+" "+y2.toFixed(1)+","+x2.toFixed(1)+" "+y2.toFixed(1); };
// per route from→to (rects rf/rt):
const srcByp=(S.grid[from]&&S.grid[from].bypassed), live=liveSet.has(from), ck=from+"-"+to;
const stroke = !live ? this.tk.border : (srcByp ? this.tk.border3 : "#46464f");
cables.push({ key:ck, from, to, d:cableD(rf.right,rf.cy,rt.left,rt.cy),
  mx:((rf.right+rt.left)/2).toFixed(1), my:((rf.cy+rt.cy)/2).toFixed(1), stroke, hovered:S.hoverCable===ck,
  flow:live, flowStroke:srcByp?"#5a6b6e":this.tk.accent,
  flowStyle:{ animation:"axsFlow 1.15s linear infinite", opacity:srcByp?0.5:1, pointerEvents:"none" } });
```

Signal-liveness DFS (drives flow + stroke):

```js
const liveSet = new Set(); // every block reachable from an input — i.e. carrying signal
(function(){ const stack=[]; S.grid.forEach((c,i)=>{ if(c&&c.catId==="in") stack.push(i); });
  const seen=new Set(); while(stack.length){ const n=stack.pop(); if(seen.has(n))continue;
    seen.add(n); liveSet.add(n); (S.routes[n]||[]).forEach(t=>{ if(!seen.has(t)) stack.push(t); }); } })();
```

Template per cable (3 stacked paths + hover delete):

- base path: `stroke-width="2"`.
- flow overlay (only when `live`): `stroke-width="2.6" stroke-linecap="round" stroke-dasharray="0.1 12"` animated by `@keyframes axsFlow{ to{ stroke-dashoffset:-12; } }` at `1.15s linear infinite`.
- hit path: `stroke="rgba(0,0,0,0.001)" stroke-width="18"`, `pointer-events:stroke; cursor:pointer`, click = `removeRoute`.
- hover affordance at the midpoint: circle `r=9` fill `var(--surface)` stroke `var(--textfaint)` + `×` text (13 px, 700).
- while port-dragging, a live preview path: `stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="6 5"` ending at the pointer (`linkTo`).

Routing rules: a connection may only go to the **next column** (`tc===fc+1`); dropping on an empty cell auto-creates a shunt (`grid[to]={shunt:true}`). `removeRoute` deletes `to` from `routes[from]` (and the key when empty). Tapping (not dragging) a port arms *link mode* (`gridLink`) with an accent banner bar ("Linking from … — tap a highlighted block in the next column" + Cancel) and target-column highlighting.

### 2.4 Category colors (canonical palette)

`this.CATS` (lines 1530–1554) — `id / name / short / accent / glyph`:

| id | name | accent | glyph | | id | name | accent | glyph |
|---|---|---|---|---|---|---|---|---|
| in | Input | `#4f6bed` | → | | tremolo | Tremolo | `#cf9242` | ◢ |
| out | Output | `#2fa15f` | ⇥ | | pitch | Pitch | `#5fb0d6` | ♯ |
| amp | Amp | `#d98a2b` | ◣ | | eq | Graphic EQ | `#7fae4a` | ▤ |
| cab | Cab | `#7d7d87` | ▦ | | gate | Gate / Exp | `#9aa15f` | ⊓ |
| drive | Drive | `#d6543f` | ◈ | | wah | Wah | `#d68a4f` | ◞ |
| chorus | Chorus | `#2fb0c9` | ∿ | | rotary | Rotary | `#c95b7a` | ◉ |
| comp | Comp | `#b3a52b` | ▮ | | synth | Synth | `#7a5bd6` | ◇ |
| delay | Delay | `#4a82e0` | ⟫ | | send | Send | `#4a90b8` | ← |
| reverb | Reverb | `#3fa890` | ◜ | | return | Return | `#c0694f` | ↪ |
| enhance | Enhancer | `#9b8cf0` | ◎ | | looper | Looper | `#5b9ed6` | ⟳ |
| filter | Filter | `#d65b9e` | ⌇ | | ringmod | Ring Mod | `#9b6fd6` | ≈ |
| flange | Flanger | `#c95bc0` | ≋ | | formant | Formant | `#b5654d` | ◐ |

### 2.5 Cell visuals

**Block cell** (line 2641):

```js
const box=Object.assign({},base,{ background:"linear-gradient(180deg,"+this.shade(a,-0.42)+","+this.shade(a,-0.62)+")",
  border:"1px solid "+this.shade(a,-0.05), cursor:"pointer", touchAction:"none", overflow:"hidden",
  boxShadow:selected?"inset 0 1px 0 rgba(255,255,255,.14), 0 0 0 2px #f5a623, 0 0 22px rgba(245,166,35,.34)"
                    :"inset 0 1px 0 rgba(255,255,255,.1), 0 2px 6px rgba(0,0,0,.35)",
  opacity:c.bypassed?0.45:(moving?0.3:1), filter:c.bypassed?"grayscale(.6)":"none" });
```

- **Selected** = amber double ring (`#f5a623`), *not* the accent teal.
- **Bypassed** = `opacity:.45` + `grayscale(.6)` + hatch overlay:
  `background:repeating-linear-gradient(45deg, rgba(255,255,255,.07) 0 5px, rgba(0,0,0,0) 5px 11px)`.
- Placement pop: `animation:axsPlace .34s cubic-bezier(.2,.9,.3,1)` on `_placed`.
- Contents: glyph (15 px, `rgba(255,255,255,.82)`), label (700 14 px white, text-shadow), type line (`500 9px` mono `rgba(255,255,255,.62)`, only when `showType`), channel badge top-right (`700 9px` mono on `rgba(0,0,0,.28)`, shown for amps or channel ≠ A).
- **Bypass toggle dot** top-left (all non-IO blocks): 17×17 circle; on = `background:rgba(70,209,127,.16); border:1px solid rgba(70,209,127,.6)` with 7 px `#46d17f` glowing dot; off = `rgba(0,0,0,.34)` / grey dot; hover `transform:scale(1.2)`.
- **Quick-control fill layer** (the block acts as a value meter for the active quick param):
  `height:fillPct%; background:linear-gradient(180deg, shade(a,0.35), a); opacity: adjusting?1:0.78; borderTop:2px solid rgba(255,255,255,.7); transition:height .05s linear`.
- **QC dots** bottom-center (`showDots = qcl.length>1 && !denseGrid`): active dot 11×4 white, inactive 4×4 `rgba(255,255,255,.32)`.
- **Adjust overlay** while dragging/wheeling: full-cell `rgba(8,8,10,.58)` with 24 px mono value + 10 px uppercase accent label.
- **Out port**: 20 px circle, `right:-8; top:50%`, `border:2px solid var(--bg)`, background accent when the block is selected (with glow) else `border3`; hover `scale(1.25)`; hidden on col 11 and on `out` blocks.

**Shunt cell**: `background:var(--bg2); border:1px solid #20202a` (amber border when selected, accent when link target) containing a `62%×2px #4a4a55` bar. Tapping a shunt removes it.

**Empty cell** (line 2620): resting state renders a 5 px nav dot `#33333d`; on hover → dashed accent border, `aT(8)` bg, `+` (19 px weight 300); while a block is being drag-moved every empty cell shows `+` with three tiers — drop-over (accent dashed, `aT(18)`, scale 1.15), *parallel-row hint* when the cell is directly above/below a filled cell (`border:1px dashed #5066b0; background:rgba(79,107,237,.12); color:#8fa0f5`), other (dim `#3f4f54`/`#566b6e`). Armed-link targets get `border:1px dashed accent; background:aT(16); boxShadow:0 0 0 2px accent`.

**Map mode strip-down** (line 2658) — the "clean glyph minimap":

```js
if(gpMap){ cells.forEach(cl=>{
  if(cl.isBlock){ cl.showType=false; cl.showChan=false; cl.showDots=false; cl.canBypass=false; cl.label=""; cl.fillStyle={display:"none"};
    cl.glyphStyle=Object.assign({},cl.glyphStyle,{fontSize:"16px",color:"rgba(255,255,255,.9)"});
    if(cl.showOut){ cl.outStyle=Object.assign({},cl.outStyle,{width:11,height:11,right:-5,marginTop:-5,border:"2px solid "+this.tk.bg}); } }
  else if(cl.isEmpty && (cl.plus==="" || !cl.plus)){ cl.plus="+"; cl.plusStyle={ fontSize:"12px", fontWeight:300, lineHeight:1, color:this.tk.textmuted, opacity:0.45 };
    cl.boxStyle=Object.assign({},cl.boxStyle,{border:"1px dashed "+this.tk.border2}); }
}); }
```

### 2.6 Grid interactions (gesture spec)

- **Tap** a block: 240 ms single/double-tap discriminator (`handleTap`). Single → `openBlock(idx)`; in grid-part mode that is `if(this.props.onSelectBlock) this.props.onSelectBlock(idx, c); this.setState({selected:idx});` (never opens the internal editor). **Double-tap (<300 ms)** toggles bypass with toast.
- **Tap empty cell** → open Add-Block palette targeted at that cell (in the shell; the part still calls `openPaletteFor` but overlays are suppressed — production should route this to its own palette).
- **Vertical drag** on a block: adjusts the active quick-control param, `v = startVal + (startY-clientY)*0.6` clamped 0–100, with the adjust overlay.
- **Horizontal drag** on a block: cycles the quick-control param, one step per 38 px (`steps=-Math.round(dx/38)`), unless `denseGrid` (then horizontal = page swipe).
- **Wheel** on a block: `v -= sign(deltaY)*4`, flashes adjust overlay 800 ms.
- **Long-press 380 ms** (no movement): haptic (`navigator.vibrate(12)`) + context menu; keep holding and drag >10 px = lift into **move mode** (ghost chip rotated −3°, recycle-bin bar bottom-center for delete, drop on a cell = swap move with route remap).
- **Right-click**: same context menu (suppressed in part instances — see §1.3).
- **Port pointer-down + drag**: rubber-band connect; **port tap**: armed link mode + banner.
- **Mobile pinch** (2 touches): live column zoom `mobCols` 3–12.
- **Mobile empty-area swipe**: horizontal >48 px pages the grid; pager bar shows `− COLS +` stepper (tap value = toggle 12↔4 overview), page dots (active 20×7 accent), gesture hint.
- Quick-control list per block: `qcList` = user selection (`qcSel[idx]`) else `["Level","Gain","Master","Bass","Treble"]` for amps else `["Level", …first 3 cat knobs]`; keys `k:{idx}:common:{Level|Balance}` / `k:{idx}:qc:{label}`; unset values are seeded deterministically (`seed(key) → 24..79`).

### 2.7 Grid data model

```js
// grid is 12 cols x 4 rows; idx = row*12 + col
cell = { catId, type, label, channel:"A", bypassed:false } | { shunt:true } | null
routes = { [fromIdx]: number[] /* toIdx, next column only */ }
```

---

## 3. FC parts

Shared vocab (getters, themed at access time):

```js
FC_CATS = [ {id:"none",label:"None"}, {id:"preset",label:"Preset",color:"#f5a623",fns:[bank/inc/dec/num]},
  {id:"scene",label:"Scene",color:accent,fns:[sel/inc/dec]}, {id:"bank",label:"Bank",color:"#4f6bed",fns:[inc/dec]},
  {id:"block",label:"Effect Block",color:"#33c46b",fns:[byp/chan]},
  {id:"looper",label:"Looper",color:"#e0556f",fns:[rec/play/dub/undo/half/rev]},
  {id:"tap",label:"Tap Tempo",color:"#c084fc"}, {id:"tuner",label:"Tuner",color:"#9aa0a6"},
  {id:"layout",label:"Layout",color:"#46c2d6",fns:[go/inc/dec]} ]
// fn.params lists which extra editors appear: "preset" | "scene" | "wrap" | "limits" | "block" | "channel" | "layout"
FC_COLORS = ["#e23b3b","#f5871f","#f5c518","#33c46b",accent,"#4f6bed","#9b59f5","#ffffff","#ec4f9c"]
FC_BLOCKS = ["Amp 1","Cab 1","Drive 1","Delay 1","Reverb 1","Comp 1"]
```

Data model:

```js
switch = { label, color:null|hex, labelMode:"auto"|"action"|"custom", custom, tap:act, hold:act }
act    = { cat, fn, preset:0, scene:1, wrap:true, lo:0, hi:127, block:"Amp 1", channel:"A", layoutTo:0 }
fcLayouts = 9 layouts (1..8 + "MASTER") × views[4] × switches[12]
fcDeviceCount: FC-12→12, FC-6→6, FM3→3;   boardCols: FM3→3, FC-6→3, FC-12→6
```

`fcWriteSwitch(mut)` immutably rewrites only the `(fcLayout, fcView, fcSwitch)` cell — every FC edit funnels through it and therefore through the shared `fcLayouts` bus key.

Auto label (`fcAutoLabel`): `—` for none; `Preset +1 / Preset −1 / Preset N`; `Scene +1/−1/N`; `Bank +1/−1`; `<block> [chan]`; looper fn label; `Tap Tempo`; `Tuner`; `Layout +1/−1/N`. Summary (`fcSummary`): `"<Category> · <Function>"` or `"Empty"`.

### 3.1 `board`

- **Header strip** (only board part / full): `FC CONTROLLERS` label (700 12 mono, letter-spacing .16em), **device selector** segmented chips `FM3 | FC-6 | FC-12` (28 px h, active = accent bg + accentink text), right-aligned `deviceNote` = `"{count} switches · {device} · View {n}/4"`.
- **LAYOUTS strip** (see §3.2 — board shows it too).
- **Board hero** (`fc.boardStyle` padding `16px 20px 14px` desktop): row with a **layout-name input** (flex 1, `bg2` field, 700 15 px) + **VIEW selector** `1..4` (34×30 chips; non-active-but-assigned views show a 4 px accent dot top-right).
- **Switch tile** (min-height 112, radius 14, grid `repeat(boardCols,1fr)` gap 14/10 mobile, maxWidth 620 (≤3 cols) / 1060):

```js
tileStyle:{ ... background:empty?tk.bg2:"linear-gradient(180deg,#181820,#121217)",
  border:"1px solid "+(selected?ACC:(empty?tk.surface2:"#28282f")),
  boxShadow:selected?("0 0 0 1px "+ACC+", 0 8px 26px "+aT(18)):"0 2px 10px rgba(0,0,0,.35)" }
ledStyle:{ position:"absolute", top:0,left:0,right:0, height:5, background:empty?tk.border:col,
  boxShadow:empty?"none":"0 0 12px "+col, opacity:empty?0.6:1 }   // col = sw.color || tap-category color
numStyle: 20×20 badge top-right, mono 10px on rgba(12,12,14,.7)
labelStyle: 700 13.5px, 2-line clamp; empty switches show "—" in mono #45454e
// footer rows:  [T badge accent bg, tapText]  and  [H badge #f5a623 bg, holdText]  (11px mono, hold text #7e7e88)
```

- Displayed label per `labelMode`: `custom → s.custom||"—"`, `action → fcAutoLabel(s.tap)`, `auto → s.label || fcAutoLabel(s.tap)`.
- Tap a tile → `{fcSwitch:i, fcInspOpen:true}` (shared). Hint line: "Tap a switch to edit its Tap & Hold actions below".

### 3.2 `layouts`

Horizontal scroll strip: label `LAYOUTS` (700 10 mono .14em `textmuted`) + 9 chips:

```js
label: i===8 ? "MASTER" : String(i+1)
style: height 34, minWidth master?80:34, padding master?"0 13px":0, radius 9,
  font 700 (master? 11px .08em : 14px) mono,
  active → accent bg / accentink text; else surface bg, border2, text #dcdce2 if any switch assigned in the layout else #5c5c64
dotStyle (assigned && !active): 5×5 accent dot at top:5 right:5
```

Selecting a layout resets `fcView:0, fcSwitch:0`. Selecting a device resets `fcSwitch:0`.

### 3.3 `inspector` (and shared inspector chrome for `led`/`tap`/`hold`)

Header: `SWITCH` label + big switch number (700 17 mono) + divider + `VIEW` selector (same viewNav as board) + (mobile only) ✕ close. In part mode the inspector always shows and fills the pane (`inspStyle` override, §1.2); on mobile in the full shell it is a bottom sheet (`position:fixed; maxHeight:84vh; borderTopRadius:20; animation:axsSheet .26s`) with a scrim.

Desktop body layout: `flexWrap:wrap` — identity column (`flex:1 1 250px; minWidth:240; padding:16px 18px`) + two action cards (`flex:1 1 300px; minWidth:290; borderLeft:1px solid surface2`). Mobile: single column, cards become `bg2` rounded cards.

### 3.4 `led` (identity section)

- **Label input** (full-width, `bg2`, radius 11, 600 14 px; placeholder = `fcAutoLabel(sw.tap)`).
- **LED COLOR**: 9 swatches 28×28 radius 8 from `FC_COLORS`; selected = `border:2px solid #fff` + `box-shadow:0 0 0 2px accent`; plus an `AUTO` chip (28 px h, mono 10) = follow category color (`color:null`). Clicking the active swatch clears back to auto.
- **MINI-DISPLAY LABEL**: 3-mode segmented `Name | Action | Custom` (each flex 1, h 32, active accent); `Custom` reveals a second input (placeholder "Custom label…").
- Part-mode identity style: `{ flex:1, minWidth:0, display:flex, flexDirection:column, gap:14, padding:"16px 18px", maxWidth:560 }`.

### 3.5 `tap` / `hold` (action cards)

Card visibility rule (verbatim): `a.show = (!this.fcPart || this.fcPart==="inspector" || this.fcPart===a.which);` — the `tap` part shows only the TAP card, `hold` only HOLD. Part-mode card style: `{ display:flex, flexDirection:column, gap:10, padding:"16px 18px" }` (no border).

Card anatomy (top → bottom):

1. Title row: 9×9 rounded dot (tap = accent, hold = `#f5a623`), `TAP`/`HOLD` (700 12 mono .12em), right-aligned summary (`fcSummary`).
2. **CATEGORY** chip-wrap: one chip per `FC_CATS` entry; active chip filled with the category's own color (`fcChip(active, c.color)` → h 31, radius 9, 600 12).
3. **FUNCTION** chip-wrap (when the category has fns), active = accent.
4. Conditional param editors, driven by `fn.params`:
   - `preset` → "Preset number" stepper `« − value + »` (steps ∓10/∓1/±1/±10, clamp 0–511, value 700 14 mono, buttons `fcStep()` 32 px / 40 px touch).
   - `scene` → `SCENE` chips 1–8 (`fcMini` 31×30 / 40×40 touch).
   - `block` → `BLOCK` chips from `FC_BLOCKS`.
   - `channel` → `CHANNEL` chips A–D.
   - `layout` → `TARGET LAYOUT` chips from current layout names (`L.name || "L"+(i+1)`).
   - `limits` → Low/High steppers (clamp 0–127).
   - `wrap` → "Wrap at limits" pill toggle 42×24 (`background:on?accent:border2`, 18 px white dot sliding `left:3↔21`, `.15s`).
5. Picking a category resets the act to `fcAct(cat, firstFn)`; every edit writes through `fcSetAct(which, patch)` → shared `fcLayouts`.

### 3.6 FC widgets (`AxisWidget.dc.html`)

All follow the widget contract: root `max-width:100%; min-width:0`, three sizes `default > compact > mini` (labels render only when `expanded`, i.e. default size; layout engine picks size from `estW`).

| Widget id | estW | Anatomy |
|---|---|---|
| `fcdevice` | 150 | `FC` label + chip row `FM3 / FC-6 / FC-12` (mini: current chip only) |
| `fclayouts` | 210 | `LAY` label + chip row `1..8 / M` (assigned-dot variant), writes `fcLayout` |
| `fcswitch` | 220 | `SW` label + `‹ n ›` switch stepper + `VIEW` label + chips `1..4`, writes `fcSwitch`/`fcView` |
| `gridmode` | 184 | `GRID` label + `Full/Map/Auto` chips (§2.1) |
| `blocksize` | 132 | `SIZE` label + `− S/M/L +` stepper (§2.1) |
| `map` | 98 | 18-dot minimap (§2.1) |

Widget data comes from the shell's `wdata` object, which reads `window.__FCBus.state` directly for `fcDevice/fcLayout/fcSwitch/fcView`.

---

## 4. Visual values table

CSS custom properties (`:root`, resolved through the theme engine `resolveTk`):

| Token | Dark value | | Token | Dark value |
|---|---|---|---|---|
| `--bg` | `#0c0c0e` | | `--text` | `#e9e9ee` |
| `--bg2` | `#0e0e10` | | `--text2` | `#cfcfd6` |
| `--surface` | `#141417` | | `--textdim` | `#9a9aa3` |
| `--surface2` | `#1c1c21` | | `--textfaint` | `#8a8a94` |
| `--border` | `#26262c` | | `--textmuted` | `#56565e` |
| `--border2` | `#2a2a31` | | `--accent` | `#35c9d6` |
| `--border3` | `#3a3a44` | | `--accentink` | `#06181a` |

Fonts: `--font-ui: 'Hanken Grotesk',system-ui,sans-serif`, `--font-mono: 'JetBrains Mono',ui-monospace,monospace`.

| Element | Values |
|---|---|
| Grid cell | `aspect-ratio:1/0.95`, radius 11, gap `round(sizeMin*0.32)` (full) / 7 (map) / 6–16 (mobile by density) |
| Block size min col | S 56 / M 72 / L 96 px; map col 24–42 px; full col cap 140 px |
| Selected block ring | `0 0 0 2px #f5a623, 0 0 22px rgba(245,166,35,.34)` |
| Bypass hatch | `repeating-linear-gradient(45deg, rgba(255,255,255,.07) 0 5px, transparent 5px 11px)` |
| Cable | width 2 (base) / 2.6 (flow, dash `0.1 12`, `axsFlow 1.15s`), hit width 18; dead `--border`, bypassed-src `--border3` (flow `#5a6b6e`), live `#46464f` (flow accent) |
| Out port | 20×20 (full) / 11×11 (map), `right:-8/-5`, border 2px `--bg` |
| Bypass dot toggle | 17×17, dot 7 px, on `#46d17f` glow `0 0 6px rgba(70,209,127,.85)` |
| FC switch tile | minHeight 112, radius 14, LED bar h 5 + `0 0 12px <color>` glow, T badge accent / H badge `#f5a623` (16×16 radius 4) |
| FC layout chip | h 34, minW 34 (MASTER 80), radius 9, mono 700 14 (MASTER 11/.08em) |
| FC view chip | 34×30, radius 8, mono 700 13; assigned dot 4×4 |
| FC category/fn chip | h 31, radius 9, 600 12; active = category color bg + accentink |
| FC mini chip (scene/chan) | 31×30 desktop / 40×40 touch, radius 8, mono 700 12 |
| FC step button | 32×32 desktop / 40×40 touch, radius 8, mono 600 13 |
| Wrap toggle | 42×24 radius 13, dot 18 white, `.15s` |
| LED swatch | 28×28 radius 8; selected `2px #fff` + `0 0 0 2px accent` |
| Grid pager (mobile) | stepper 34/42 px, page dot 7 px (active 20×7 accent), bar padding `9px 14px 13px` |
| Toast | bottom 24, `--surface2` bg, radius 12, `axsToast 2.2s` |
| Overlays | palette 760 px, preset picker 680 px, history/library 560 px, account 440 px; scrim `rgba(6,6,8,.66)` + `blur(3px)` |
| Mobile breakpoints | `isMobile <760`, `isTablet 760–1023`, `isTouch <1024`; grid part: mobile `<620` pane width |

---

## 5. Delta checklist vs current production

Compared against: `src/lib/axis-workbench/panels/AxisSignalGridPanel.svelte`, `src/lib/axis-workbench/panels/fc/AxisFcPartPanel.svelte`, `src/lib/axis-workbench/fc/*` (controller/runtime/data/types), `src/lib/SignalGrid.svelte`, `src/lib/FcEditor.svelte`, `src/lib/axis-workbench/axisWorkbenchRegistry.ts`.

### P0 — structural gaps (spec not present in production)

- [ ] **Gridbar toolbar not rendered** *(confirmed)* — `AxisSignalGridPanel.svelte` is a bare wrapper around `SignalGrid.svelte`; no `gridbar` widget zone exists in the grid pane header. `axis.gridMode` / `axis.blockSize` widgets exist in the registry (`axisWorkbenchRegistry.ts`) but mount in the TopBar, not in the grid pane header with per-zone auto-fit (§2.1). Add a gridbar zone to the grid panel header hosting `gridmode` + `blocksize` (+ optional `map`) widgets, draggable in Edit-Layout mode.
- [ ] **Pane-relative sizing missing** — production `SignalGrid.svelte` sizes from viewport/editor-resize, not from its own pane rect. Port §2.2 verbatim: ResizeObserver on the pane host, `gpSizeMin=[56,72,96][blockSize]`, `fullMin/fullMinH` thresholds, `auto` stepping full→map→mobile at `<fullMin`/`<fullMinH`/`<620`, and the 4-row height cap `_colCapH` so the grid never scrollbars inside a dock.
- [ ] **Map (glyph minimap) grid mode missing** — production has no map rendering of the main grid (`GridMap.svelte` is the Block-Editor navigator, a different artifact). Implement §2.5 map strip-down: glyph-only cells ≤42 px, 11 px ports, dashed dim empties, routing still active.
- [ ] **`blockSize` (S/M/L) not plumbed into the grid panel** — `editor.blockSize` exists for the widget, but SignalGrid must consume it as min column width 56/72/96 with gap `round(min*0.32)` (§2.2).
- [ ] **`onSelectBlock` contract** — grid part must *not* open its own editor; it emits `(idx, cell)` and sets `selected` only (§2.6). Verify `AxisSignalGridPanel` routes selection to the workbench Block Editor panel instead of the legacy docked editor.

### P1 — behavior parity in the grid

- [ ] **Overlay suppression in part instances** — part mounts must never render palette/context-menu/history-pill/toasts of their own (§1.3); those belong to the shell. Verify SignalGrid-in-panel doesn't spawn its legacy overlays.
- [ ] Quick-control gestures on blocks: vertical drag `*0.6`, horizontal param-cycle per 38 px, wheel step 4, adjust overlay, QC fill layer + dots, `denseGrid` cutoff (mobile cols >6) — check `SignalGrid.svelte` parity (it has swipe params; verify the exact fill/dot/overlay visuals of §2.5–2.6).
- [ ] Double-tap (<300 ms) toggles bypass; single tap defers 240 ms — verify discriminator timing.
- [ ] Long-press 380 ms → context menu; keep-holding drag = move mode with rotated ghost, delete bin, swap semantics + route remap (`moveBlock`).
- [ ] Cable spec: 3-path stack (base/flow/18px hit), liveness DFS coloring, hover midpoint ×, drag preview dash `6 5`, next-column-only rule with auto-shunt, armed-link banner (`gridLinkBar`) — diff against `SignalGrid.svelte` cable code.
- [ ] Mobile: pinch column zoom (3–12), one-page clip wrapper + translateX paging, pager bar (COLS stepper with tap-to-toggle 12↔4, dots, hint) — production has paging; verify pager chrome + pinch.
- [ ] Selected-block visual is **amber** (`#f5a623` ring), ports are accent-on-selected — check color parity.

### P1 — FC parts parity

- [ ] **FC board tiles**: production `AxisFcPartPanel.svelte` board renders a switch grid but must match §3.1 tile anatomy (5 px glowing LED bar, num badge, 2-line label with labelMode logic, T/H badge rows with auto-labels, selected accent ring, boardCols 3/3/6, maxWidth 620/1060).
- [ ] **Layouts strip**: chips `1..8` + wide `MASTER`, assigned-dot indicator, selection resets view+switch (§3.2). Production renders layout buttons — verify MASTER treatment + dots + reset semantics.
- [ ] **Inspector**: chip-based CATEGORY/FUNCTION editors with per-fn param editors (preset stepper 0–511 with ±10, scene chips, block chips, channel chips, target-layout chips, limits 0–127, wrap pill) — production tap/hold parts are field-editor styled; align to §3.5 chip UI and the desktop two-card + identity wrap layout of §3.3.
- [ ] **LED part**: 9-swatch palette + AUTO chip + tri-mode mini-display label with custom input (§3.4); production hides color UI when the model lacks color metadata — keep that guard but match visuals when present.
- [ ] **Device selector** (`FM3 | FC-6 | FC-12`) in the board header + `fcdevice` widget — production FC controller snapshot (`layout, view, switchIndex, side, activePart, inspectorOpen`) has no device key; decide mapping (design's `fcDevice` ↔ production connected-device model) and expose the widget states.
- [ ] **Shared-state key mapping** — design `{fcLayout, fcView, fcSwitch, fcLayouts, fcDevice, fcInspOpen}` vs production controller `{layout, view, switchIndex, side, activePart, inspectorOpen}` + runtime `{model, edits, labelText, present}`: confirm every design key has a home; note production adds `side` (tap/hold selector) which the design expresses as separate parts instead.
- [ ] FC widgets `fcdevice/fclayouts/fcswitch` (estW 150/210/220) with 3-size states reading controller state — registry has `axis.fcDevice`, `axis.fcLayouts`, `axis.fcSwitchView`; verify size-state rendering and that they *write* to the same controller the parts read.

### P2 — polish

- [ ] Keyframes/`animation` parity: `axsPlace .34s` placement pop, `axsFlow 1.15s` cable flow, `axsSheet/axsDrawer/axsPalette/axsOverlay/axsToast` timings on FC mobile sheet + overlays.
- [ ] `deviceNote` string format `"{n} switches · {device} · View {v}/4"`.
- [ ] Board layout-name input (rename layouts inline) — check production supports layout rename.
- [ ] Empty-cell resting nav dot (5 px `#33333d`) + hover-only `+`, parallel-row blue hint while dragging (§2.5).
- [ ] Theme engine: FC part instances skip root `zoom` scaling (`rootRef` sets `zoom=1` when `fcPart`); panel-scoped CSS variables only.
