# Workbench DC parity — 01 · Shell / Window Manager

Source of truth: `design/Axis Layout System.dc.html` (branch `layout-rework`).
This file is the **binding specification** — production must port the logic
verbatim (thresholds, math, choreography), not re-derive it. All code blocks
below are quoted from the design file unless marked otherwise.

Runtime context (from `design/support.js`): the component is a `class Component
extends DCLogic` whose `renderVals()` returns a flat object the `<x-dc>`
template renders against (`{{ }}` dotted lookups, `<sc-for list as>`,
`<sc-if value>`, `<dc-import name>` mounting sibling `.dc.html` components).
`setState` merges a patch into `this.state` and re-renders; `componentDidMount`
/ `componentWillUnmount` behave like React lifecycle. All styling is inline
style strings; `style-hover="…"` compiles to a generated `:hover` class.

---

## 1. State model (what the shell tracks)

From the constructor (abridged to the layout-relevant keys, values verbatim):

```js
this.state = {
  editMode:false, libOpen:false, libQuery:"", ribMenu:null, ctx:null,
  savedPanels:[], savedGroups:[], profile:"desktop", customPanels:{}, cpseq:0,
  contentW:0, contentH:0,
  layouts:{ desktop:this.preset("default"), tablet:this.preset("tablet"), mobile:this.preset("mobile") },
  activePreset:"default",
  section:"grid", stubs:{}, selected:null, editorOpen:false,
  panelBeMod:false, panelFc:false, panelHist:false, panelPresets:false,
  panelPSrc:false, panelPList:false, panelPDet:false,
  panelFcBd:false, panelFcIn:false, panelFcLay:false, panelFcLed:false, panelFcTap:false, panelFcHold:false,
  navOrder:this.NAV.map(n=>n.id), navHidden:{}, pinned:{},
  dock:{ place:{ grid:"main", editor:"bottom", fc:"bottom", history:"right", presets:"left" },
         tab:{left:false,right:false,top:false,bottom:false,main:false},
         active:{left:null,right:null,top:null,bottom:null,main:null},
         mainAxis:"h",
         size:{left:340,right:380,top:220,bottom:300},
         collapsed:{left:false,right:false,top:false,bottom:false} },
  drag:null, toasts:[], confirm:null, palette:null, renameState:null,
  dirty:false, connState:"connected", navDrawerOpen:false, mobDrawer:null,
  vw:(typeof window!=="undefined"?window.innerWidth:1440)
}
```

Key derived structures:

- **Layouts are per profile** (`desktop` / `tablet` / `mobile`), each layout is
  `{ navMode, contentMode, presetMode, editorMode, rightW, widgets:{ id:{zone,order,density,group} } }`.
  `L()` returns the active profile's layout; `setL(next)` writes it back;
  `patchWidget(id, patch)` merges into one widget record.
- **Dock state** (`state.dock`) is shared across profiles: `place` maps panel id
  → region (`left|right|top|bottom|main`), `size` per-region px, `collapsed`
  per-region, `paneCollapsed` per-pane (header-only), `cells` per-region array
  of slots (each slot = array of panel ids = a tab group), `split` per-region
  ratio array, `activePane` map, `mainAxis` `"h"|"v"`.
- **Panels roster**: `basePanels()` returns
  `["grid","editor","bemod","fc","history","presets","pbrowse","psrc","plist","pdet","fcbd","fcin","fclay","fcled","fctap","fchold"]`;
  `allPanels()` adds custom panels (`cp<seq>`) and stubs (`stub:ctrl|scn|live|setup`).
- **Visibility**: `visOf(p)` — `grid` is always visible; every other panel is
  gated by its own boolean flag (`editorOpen`, `panelBeMod`, `panelFc`, …,
  `stubs[k]`); custom panels are always visible while they exist.
- Pane display names via `paneName(id)`: Signal Grid, Block (name of selected
  block), Modifier, Signal Chain, History, Presets, Preset Browser, Sources,
  Preset List, Preset Info, FC Board, Switch Inspector, FC Layouts,
  Switch LED / Label, Tap Action, Hold Action, and stub names
  (Controllers/Scenes/Live/Setup); custom panels use their user-set name.

---

## 2. `computeDock()` — the region layout engine (verbatim)

```js
computeDock(){
  const s=this.state, d=s.dock||{place:{grid:"main"}};
  const cw=this.contentEl?this.contentEl.clientWidth:0, ch=this.contentEl?this.contentEl.clientHeight:0;
  const W=cw>0?cw:(s.contentW||Math.max(640,(s.vw||1280)-70)); const H=ch>0?ch:(s.contentH||600);
  const cpids=Object.keys(s.customPanels||{});
  const vis=(p)=>this.visOf(p);
  const panels=this.allPanels(); const occ={left:[],right:[],top:[],bottom:[],main:[]};
  panels.forEach(p=>{ if(vis(p)){ const r=(d.place&&d.place[p])||"main"; (occ[r]||occ.main).push(p); } });
  const has=(r)=>occ[r].length>0; const strip=26; const dsz=d.size||{}, dc=d.collapsed||{}, dtab=d.tab||{};
  // ---- mobile: left/right/top become overlay drawers (edge-indicator access), not inline docks. Bottom stays inline (main control point). ----
  const isMobile=s.profile==="mobile"; const mobD=s.mobDrawer||null;
  const ovL=isMobile&&has("left"), ovR=isMobile&&has("right"), ovT=isMobile&&has("top");
  let Lw= has("left")?(dc.left?strip:Math.min(dsz.left||340,Math.max(200,Math.round(W*0.34)))):0, Rw= has("right")?(dc.right?strip:Math.min(dsz.right||380,Math.max(220,Math.round(W*0.36)))):0;
  const MINC=180; if(Lw+Rw>W-MINC){ const avail=Math.max(0,W-MINC), tot=Lw+Rw||1; Lw=Math.floor(avail*Lw/tot); Rw=Math.floor(avail*Rw/tot); }
  // bottom cap: allow a much taller drawer (mobile especially) so you can keep a small grid and see all controls
  let Th= has("top")?(dc.top?strip:Math.min(dsz.top||220,Math.max(110,Math.round(H*0.36)))):0, Bh= has("bottom")?(dc.bottom?strip:Math.min(dsz.bottom||300,Math.max(120,Math.round(H*(isMobile?0.9:0.78))))):0;
  // overlay regions contribute 0 to inline layout so the grid keeps full width/height
  const ThLpre=ovT?0:Th;
  const MINR=120; if(ThLpre+Bh>H-MINR){ const av=Math.max(0,H-MINR), tv=ThLpre+Bh||1; if(!ovT) Th=Math.floor(av*ThLpre/tv); Bh=Math.floor(av*Bh/tv); }
  const LwL=ovL?0:Lw, RwL=ovR?0:Rw, ThL=ovT?0:Th;
  const midW=Math.max(160, W-LwL-RwL);
  // overlay drawer geometry (slid off-canvas when their drawer isn't the open one)
  const OWL=Math.min(dsz.left||320,Math.round(W*0.88)), OWR=Math.min(dsz.right||340,Math.round(W*0.88)), OHT=Math.min(dsz.top||260,Math.round(H*0.72));
  const rects={
    left:  ovL? {x:(mobD==="left"?0:-OWL-60), y:0, w:OWL, h:H} : {x:0,y:0,w:Lw,h:H},
    right: ovR? {x:(mobD==="right"?W-OWR:W+60), y:0, w:OWR, h:H} : {x:W-Rw,y:0,w:Rw,h:H},
    top:   ovT? {x:0, y:(mobD==="top"?0:-OHT-60), w:W, h:OHT} : {x:LwL,y:0,w:midW,h:ThL},
    bottom:{x:LwL,y:H-Bh,w:midW,h:Bh},
    main:  {x:LwL,y:ThL,w:midW,h:Math.max(90,H-ThL-Bh)} };
  const overlayRegion={left:ovL,right:ovR,top:ovT};
  const paneRect={}, paneTabs={}, paneShow={}, paneMini={}, paneRegion={}, cellResizers=[], cellsByRegion={}, regionLead={};
  panels.forEach(p=>{ paneShow[p]=false; paneRegion[p]=(d.place&&d.place[p])||"main"; });
  const paneCollapsedFlag={}; const pc=d.paneCollapsed||{}; const HH=36;
  const buildCells=(r)=>{ const flat=occ[r]; const stored=(d.cells&&d.cells[r])||null; if(!stored) return flat.map(id=>[id]); const seen={}, out=[]; stored.forEach(grp=>{ const g=(grp||[]).filter(id=> flat.indexOf(id)>=0 && !seen[id]); g.forEach(id=>seen[id]=1); if(g.length) out.push(g); }); flat.forEach(id=>{ if(!seen[id]){ out.push([id]); seen[id]=1; } }); return out; };
  Object.keys(occ).forEach(r=>{ const flat=occ[r]; if(!flat.length||dc[r]){ cellsByRegion[r]=[]; return; } const R=rects[r]; const edge=(r!=="main"); const slots=buildCells(r); cellsByRegion[r]=slots; const n=slots.length;
    let axis; if(r==="left"||r==="right") axis="v"; else if(r==="top"||r==="bottom") axis="h"; else axis=(d.mainAxis||"h");
    let ratios=(d.split&&d.split[r]&&d.split[r].length===n)?d.split[r].slice():slots.map(()=>1/n); const rsum=ratios.reduce((a,b)=>a+b,0)||1; ratios=ratios.map(x=>x/rsum);
    let acc=0; const along=(axis==="v"?R.h:R.w); const isColl=(slot)=>{ const a=slot.find(id=>d.activePane&&d.activePane[id])||slot[0]; return !!pc[a]; };
    let collCount=0, expRatio=0; slots.forEach((slot,i)=>{ if(isColl(slot)) collCount++; else expRatio+=ratios[i]; }); const remain=Math.max(0, along-collCount*HH);
    slots.forEach((slot,i)=>{ const coll=isColl(slot); let seg; if(coll) seg=HH; else if(n===1) seg=along; else seg=(expRatio>0?remain*(ratios[i]/expRatio):remain/Math.max(1,n-collCount)); let rc; if(axis==="v"){ rc={x:R.x,y:R.y+acc,w:R.w,h:seg}; } else { rc={x:R.x+acc,y:R.y,w:seg,h:R.h}; } acc+=seg;
      const active=slot.find(id=> d.activePane&&d.activePane[id])||slot[0];
      if(i===0) regionLead[r]=active;
      slot.forEach(p=>{ paneRect[p]=Object.assign({},rc); paneTabs[p]=slot.slice(); paneShow[p]=(p===active); paneMini[p]=edge; paneCollapsedFlag[p]=coll; });
      if(n>1&&i<n-1){ const b=Math.round(acc); cellResizers.push({ onDown:((rr,ii,ax,tot)=>(e)=>this.startCellResize(rr,ii,ax,tot,e))(r,i,axis,(axis==="v"?R.h:R.w)), style: axis==="v" ? `position:absolute; left:${R.x}px; top:${R.y+b-6}px; width:${R.w}px; height:12px; cursor:ns-resize; z-index:15;` : `position:absolute; left:${R.x+b-6}px; top:${R.y}px; width:12px; height:${R.h}px; cursor:ew-resize; z-index:15;` }); }
    });
  });
  // … pane descriptor build, strips, resizers, drop zones — quoted in later sections …
  return { panes, strips, resizers, mainEmpty, mainEmptyStyle, dropActive, dropStyle, dropLabel, pbRect, dropZones, mobDock:{ left:ovL, right:ovR, top:ovT, open:mobD } };
}
```

### 2.1 Explanation / invariants

- **5 regions**: `left`, `right`, `top`, `bottom`, `main`. Every visible panel
  is placed in exactly one region via `dock.place[p]` (default `"main"`).
- **Region rectangles** are carved out of the content rect `W×H` (the BODY div,
  measured via `contentEl.clientWidth/Height`, falling back to
  `contentW/contentH` state, falling back to `max(640, vw-70)` × `600`):
  - Left width: `min(dock.size.left||340, max(200, round(W*0.34)))`; collapsed → `strip = 26`.
  - Right width: `min(dock.size.right||380, max(220, round(W*0.36)))`; collapsed → 26.
  - Horizontal squeeze: if `Lw+Rw > W-180` (MINC=180 px reserved for the middle
    column), both shrink **proportionally** to fit `W-180`.
  - Top height: `min(dock.size.top||220, max(110, round(H*0.36)))`; collapsed → 26.
  - Bottom height: `min(dock.size.bottom||300, max(120, round(H*0.78)))` —
    on the **mobile profile the cap rises to `H*0.9`** ("keep a small grid and
    see all controls"); collapsed → 26.
  - Vertical squeeze: if `Th+Bh > H-120` (MINR=120), both shrink proportionally.
  - `top`/`bottom` span only the middle column (`x=LwL, w=midW`); `left`/`right`
    span the full height. `midW = max(160, W-LwL-RwL)`; main height
    `max(90, H-ThL-Bh)`.
- **Regions only render when occupied** (`has(r)` = at least one visible panel
  placed there). Empty regions take zero space.
- **Mobile overlay drawers**: on `profile==="mobile"`, occupied `left`/`right`/
  `top` regions become **overlay drawers** instead of inline docks — they
  contribute 0 to the inline layout, and their rects are positioned off-canvas
  (`-OWL-60` / `W+60` / `-OHT-60`) unless `state.mobDrawer` names them open.
  Drawer sizes: `OWL=min(size.left||320, round(W*0.88))`,
  `OWR=min(size.right||340, round(W*0.88))`, `OHT=min(size.top||260, round(H*0.72))`.
  Bottom stays inline on mobile.
- **Slots / tab groups** (`buildCells`): within a region, `dock.cells[r]` stores
  an ordered array of slots; each slot is an array of panel ids that tab
  together. Reconciliation: stored groups are filtered to currently-present
  panels, deduped, then any un-stored visible panel is appended as its own
  slot. Slot axis: left/right stack **vertically**, top/bottom stack
  **horizontally**, main uses `dock.mainAxis` (`"h"` default, toggleable).
- **Slot sizing**: per-region ratio array `dock.split[r]` (normalized each
  pass; equal `1/n` when absent). **Pane-collapsed** slots (header-only) are
  fixed at `HH = 36px`; the remaining length is distributed to expanded slots
  proportionally to their ratios (`remain * ratio/expRatio`). A single slot
  takes the whole run. A slot's collapsed state follows its **active** pane.
- **Active tab**: `dock.activePane[id]` marks the active pane in its slot,
  else the slot's first panel. Only the active pane has `show:true`; all slot
  members share the same rect and tab list.
- **Cell resizers** between adjacent slots: 12px-thick hit strips centered on
  the boundary (`±6px`), `z-index:15`, `ns-resize`/`ew-resize` cursor.
- **Region resizers** (from the same function, quoted):

```js
const resizers=[];
if(has("left")&&!dc.left&&!overlayRegion.left) resizers.push({ onDown:(e)=>this.startRegionResize("left",e), style:`position:absolute; left:${Lw-6}px; top:0; width:12px; height:${H}px; cursor:ew-resize; z-index:14;` });
if(has("right")&&!dc.right&&!overlayRegion.right) resizers.push({ onDown:(e)=>this.startRegionResize("right",e), style:`position:absolute; left:${W-Rw-6}px; top:0; width:12px; height:${H}px; cursor:ew-resize; z-index:14;` });
if(has("top")&&!dc.top&&!overlayRegion.top) resizers.push({ onDown:(e)=>this.startRegionResize("top",e), style:`position:absolute; left:${LwL}px; top:${Th-6}px; width:${midW}px; height:12px; cursor:ns-resize; z-index:14;` });
if(has("bottom")&&!dc.bottom) resizers.push({ onDown:(e)=>this.startRegionResize("bottom",e), style:`position:absolute; left:${LwL}px; top:${H-Bh-6}px; width:${midW}px; height:12px; cursor:ns-resize; z-index:14;` });
```

Region-resize drag clamps (from `onDragMove`, `mode==="regionresize"`):

```js
if(r==="left")   dk.size.left  =this.clamp(d.s0+(e.clientX-d.sx),220,Math.max(260,rc.width-420));
else if(r==="right")  dk.size.right =this.clamp(d.s0-(e.clientX-d.sx),220,Math.max(280,rc.width-420));
else if(r==="top")    dk.size.top   =this.clamp(d.s0+(e.clientY-d.sy),120,Math.max(160,rc.height-220));
else if(r==="bottom") dk.size.bottom=this.clamp(d.s0-(e.clientY-d.sy),120,Math.max(180,rc.height-120));
```

Cell-resize drag (`mode==="cellresize"`): delta as fraction of the run,
applied to the two adjacent ratios with a **minimum ratio of 0.12** each:

```js
const delta=(d.axis==="v"?(e.clientY-d.sy):(e.clientX-d.sx))/Math.max(1,d.total);
const base=d.base.slice(); let a=base[d.i]+delta, b=base[d.i+1]-delta; const min=0.12;
if(a<min){ b-=(min-a); a=min; } if(b<min){ a-=(min-b); b=min; }
base[d.i]=a; base[d.i+1]=b; dk.split[d.r]=base;
```

- **Collapsed region strips**: when `dock.collapsed[r]`, the region renders as
  a single click-to-expand strip occupying the region rect:

```js
strips.push({ onExpand:()=>this.toggleRegionCollapse(r),
  style:`position:absolute; left:${R.x}px; top:${R.y}px; width:${R.w}px; height:${R.h}px; display:flex; align-items:center; justify-content:center; background:var(--bg2); border:1px solid var(--surface2); border-radius:10px; cursor:pointer; z-index:6;`,
  labelStyle:`font:700 9px/1 'JetBrains Mono',monospace; letter-spacing:.14em; color:#6e6e78; ${vert?"writing-mode:vertical-rl; transform:rotate(180deg);":""}`,
  text:(r==="left"?"» ":r==="right"?"« ":r==="top"?"▾ ":"▴ ")+r.toUpperCase() });
```

### 2.2 Pane descriptor (per panel) — the hard clamps

Each pane's absolute style (verbatim; `_ov` = overlay drawer region on mobile):

```js
style:`position:absolute; left:${Math.round(rc.x)}px; top:${Math.round(rc.y)}px; width:${Math.round(rc.w)}px; height:${Math.round(rc.h)}px; max-width:${Math.round(rc.w)}px; max-height:${Math.round(rc.h)}px; min-width:0; min-height:0; box-sizing:border-box; display:flex; flex-direction:column; background:var(--bg2); border-radius:0; overflow:hidden; ${_ov?"z-index:180;":""} box-shadow:${_ov?"0 0 46px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.08)":"inset 0 0 0 1px rgba(255,255,255,.06)"};`,
headerStyle:"flex:none; display:flex; align-items:center; gap:5px; padding:7px 9px; background:transparent; cursor:grab;",
gripStyle:"font:700 11px/1 'JetBrains Mono',monospace; color:#5a5a63; padding:0 3px; cursor:grab;",
bodyStyle:(paneCollapsedFlag[p]?"display:none;":"flex:1; min-height:0; position:relative; overflow:hidden;")
```

Note the invariant (also stated in `design/CLAUDE.md`): each pane hard-clamps
to its slot with `max-width/max-height` + `min-width:0` so a child DC can never
push it past its slot, and **no CSS `transition` on pane
`left/top/width/height`** (the ResizeObserver re-render loop would restart the
transition and leave panes stuck at stale positions → overlap). Panes are
separated by inset 1px white-alpha box-shadows, not borders.

Pane header contents (template order): grip `⠿` → tab chips (one per slot
member; active = `background:#1c2b2c; color:#8fe3ea;`, inactive
`color:#9a9aa3;`; `padding:5px 10px; border-radius:7px; font:700 10px/1
'Hanken Grotesk'`; click = activate, dbl-click = rename) → spacer → (grid pane
only) the `gridbar` widget zone → optional split-direction button (main region
with >1 slot; icon `⇭`/`⇬` — `⬍`/`⬌`) → optional "split tabs apart"
button (`‖`, only when slot has >1 tab; calls `ungroupSlot`) → pane-collapse
button (`–`/`+`) → dock-collapse button `«` (only on the region's lead pane,
`r!=="main"`; title `Collapse <REGION> dock`) → close `×` (all panels except
`grid`). All header mini-buttons use:

```js
const miniBtn="width:22px; height:22px; display:flex; align-items:center; justify-content:center; border-radius:6px; cursor:pointer; color:#9a9aa3; font-size:12px;";
```

Custom-panel body zone: `panelZone:"panel:"+p`,
`panelBodyStyle:"position:absolute; inset:0; overflow:auto; display:flex; flex-wrap:wrap; align-content:flex-start; gap:8px; padding:12px;"`,
plus `availW:Math.round(rc.w)` / `availH:max(140, round(rc.h)-40)` exported for
widget auto-fit. Empty custom panels show, centered:
`EMPTY PANEL<br>drag widgets & params here`
(`color:#3a3a44; font:600 10px/1.7 'JetBrains Mono'; letter-spacing:.12em;`).

Stub panels (`stub:ctrl|scn|live|setup`) render a centered glyph/title/desc/
meta block (e.g. Controllers: "Modifiers, LFOs and pedalboard assignments dock
here in a later phase." / meta "MEANWHILE · PIN ANY PARAMETER FROM A BLOCK
EDITOR AS A QUICK CONTROL").

Empty main region hint: dashed box `border:1.5px dashed #1c1c21;
border-radius:10px;` with `MAIN — drag a panel here`
(`color:#33333a; font:600 11px/1.6 'JetBrains Mono'; letter-spacing:.1em;`).

The Preset Browser full view is **mounted once at load** into a hidden host
and *revealed* over its pane rect (no heavy runtime mount):

```js
pbHostStyle:((DK.pbRect && !edit)
  ? `position:absolute; left:${x}px; top:${y+36}px; width:${w}px; height:${max(60,h-36)}px; z-index:5; overflow:hidden; background:var(--bg2);`
  : "position:absolute; left:8px; top:8px; width:720px; height:480px; visibility:hidden; pointer-events:none; z-index:0; overflow:hidden;")
```

(the `+36` leaves the pane header interactive).

---

## 3. Layout preset system — `preset(kind)` (verbatim, complete)

Six kinds exist. `default` / `stage` / `studio` / `compact` are user-selectable
LAYOUT tabs in the Edit ribbon; `tablet` / `mobile` seed those profiles'
initial layouts. Unknown kind falls back to `default`.

```js
preset(kind){
  const W=(zone,order,density,group)=>({zone,order,density:density||"expanded",group:group||null});
  if(kind==="default") return {
    navMode:"side", contentMode:"fixed", presetMode:"flyout", editorMode:"drawer", rightW:340,
    widgets:{ preset:W("tl",0), scenes:W("tl",1), view:W("tr",0), add:W("tr",1), tuner:W("tr",2,"expanded","status"), tempo:W("tr",3,"expanded","status"), cpu:W("tr",4,"expanded","status"), save:W("tr",5),
              gridmode:W("gridbar",0), blocksize:W("gridbar",1),
              history:W("rail",0,"compact"), account:W("rail",1,"compact"), search:W("hidden",0), map:W("hidden",0), undo:W("hidden",0) }
  };
  if(kind==="stage") return {
    navMode:"bottom", contentMode:"pages", presetMode:"page", editorMode:"floating", rightW:340,
    widgets:{ preset:W("tl",0), tuner:W("tl",1), scenes:W("tc",0), tempo:W("tr",0), save:W("tr",1),
              view:W("hidden",0), add:W("hidden",0), cpu:W("hidden",0), search:W("hidden",0), history:W("hidden",0), map:W("hidden",0), undo:W("hidden",0), account:W("hidden",0) }
  };
  if(kind==="studio") return {
    navMode:"side", contentMode:"fixed", presetMode:"flyout", editorMode:"right", rightW:400,
    widgets:{ preset:W("tl",0), search:W("tl",1), scenes:W("tl",2), view:W("tr",0), add:W("tr",1), cpu:W("tr",2), save:W("tr",3),
              gridmode:W("gridbar",0), blocksize:W("gridbar",1),
              tuner:W("right",0), tempo:W("right",1), map:W("right",2), history:W("rail",0,"compact"), account:W("rail",1,"compact"), undo:W("hidden",0) }
  };
  if(kind==="compact") return {
    navMode:"side", contentMode:"fixed", presetMode:"flyout", editorMode:"drawer", rightW:320,
    widgets:{ preset:W("tl",0,"compact"), scenes:W("tl",1,"compact"), add:W("tr",0,"compact"), save:W("tr",1,"compact"),
              view:W("hidden",0), tuner:W("hidden",0), tempo:W("hidden",0), cpu:W("hidden",0), search:W("hidden",0), history:W("hidden",0), map:W("hidden",0), undo:W("hidden",0), account:W("rail",0,"compact") }
  };
  if(kind==="tablet") return {
    navMode:"bottom", contentMode:"pages", presetMode:"page", editorMode:"drawer", rightW:320,
    widgets:{ preset:W("tl",0), scenes:W("tc",0), tuner:W("tr",0), save:W("tr",1), add:W("bottom",0,"compact"),
              view:W("hidden",0), tempo:W("hidden",0), cpu:W("hidden",0), search:W("hidden",0), history:W("hidden",0), map:W("hidden",0), undo:W("hidden",0), account:W("hidden",0) }
  };
  if(kind==="mobile") return {
    navMode:"side", contentMode:"pages", presetMode:"page", editorMode:"drawer", rightW:300,
    widgets:{ preset:W("tl",0,"compact"), save:W("tr",0,"mini"), scenes:W("bottom",0,"compact"), add:W("bottom",1,"mini"),
              view:W("hidden",0), tuner:W("hidden",0), tempo:W("hidden",0), cpu:W("hidden",0), search:W("hidden",0), history:W("hidden",0), map:W("hidden",0), undo:W("hidden",0), account:W("hidden",0), gridmode:W("hidden",0), blocksize:W("hidden",0) }
  };
  return this.preset("default");
}
```

Notes:

- `density:"expanded"` is the legacy name for the default density (mapped to
  size `default` everywhere: `density==="mini"?"mini":density==="compact"?"compact":"default"`).
- `group:"status"` in `default` pre-groups tuner+tempo+cpu into one module in
  the top-right zone.
- Applying a LAYOUT tab (`onPreset`) replaces the current profile's layout with
  `preset(id)` **but preserves the current `rightW`**, sets `activePreset:id`,
  and toasts `Applied “<Kind>” layout`.
- Switching PROFILE (`onProfile`) just switches `state.profile` (each profile
  keeps its own layout object) and — for non-desktop — offers a toast action
  `Copy <From> layout` that deep-clones the source profile's layout
  (`copyLayoutFrom`).
- "Single Page" ribbon action (`singlePage()`) builds a docked workspace:
  `place = {grid:"main", psrc:"left", plist:"main", pdet:"right", history:"right", fc:"bottom"}`,
  un-collapses all regions, sizes
  `left = clamp(cw*0.24,220,340)`, `right = clamp(cw*0.26,240,380)`,
  `bottom = clamp(ch*0.34,150,300)`, opens those panels and enters edit mode.

---

## 4. Zone model

Widget zones (`L().widgets[id].zone`) and what renders each:

| Zone id | Where it renders | Orientation / notes |
|---|---|---|
| `tl` | Top bar, left cluster (`data-zone="tl"`) | horizontal; `gap:12px` |
| `tc` | Top bar, center cluster (flex:1, centered) | shows `DROP HERE · CENTER` hint when empty in edit mode |
| `tr` | Top bar, right cluster | horizontal; `gap:10px` |
| `rail` | Left icon rail, below nav (`data-zone="rail"`) | **vertical** (`axis:"v"`, widgets column, `gap:7px`, hint-size 52×52) |
| `bottom` | Persistent bottom utility bar | horizontal; sits right of the Customize FAB / bottom nav |
| `gridbar` | Inside the **grid pane header** (right side) | horizontal, `gap:6px`, hint-size 130×32 |
| `float` | Free-floating chips over the content area | `position:fixed`, per-widget `fx`/`fy` offsets from content rect |
| `panel:<id>` | Body of custom panel `<id>` | wrap-flex, `gap:8px; padding:12px` |
| `hidden` | Not rendered; listed in the Widget Library | — |
| `right` / `left` | Legacy dock zones — still buildable (`zoneRight`/`zoneLeft` exist, wrap-flex `gap:8px; padding:12px`) and `right` participates in drop auto-shrink; presets no longer place widgets there except `studio` (`tuner/tempo/map` → `right`) | vertical-ish wrap columns |

Zone containers get a highlight while a widget drag hovers them
(`hl(zone, base)`): `background:#0e2224;` when hovered, plus in edit mode with
any active widget drag: `outline:1px dashed #234d4f; outline-offset:-3px;`.

Panel content zones (`data-pane` ids) are the panels themselves — see §2
roster. `data-navzone` marks the nav strip (rail or bottom) for nav reorder;
`data-groupzone` marks group modules; `data-wid` marks widget/group units;
`data-member` marks group members.

---

## 5. Edit Layout mode

- Entered by the **✥ Customize** button (bottom bar, `showFab` = only outside
  edit mode; style `background:#101d1e; border:1px solid #234d4f; color:#4fd1dc;
  height:34px; border-radius:9px; font:700 12px`), or implicitly by grabbing a
  parameter (`onParamGrab`) or dragging from the Library. Exited via **✓ Done**
  or Escape; exit toasts `Layout saved to "<Profile>" profile` and clears
  `libOpen/drag/ribMenu`.
- What unlocks in edit mode:
  - Widget **drag overlays** (`position:absolute; inset:0; z-index:6;
    cursor:grab; border-radius:9px;`) covering every widget/group.
  - Per-unit **control buttons** floating above each widget (top -20px,
    right -18px, z-index 8): density/group toggle (`⇲` for singles, `⊟` =
    ungroup for groups) + hide `×`. Button style:
    `box-sizing:content-box; width:22px; height:22px; border:11px solid transparent; border-radius:17px; background:#1c1c21; background-clip:padding-box; box-shadow:inset 0 0 0 1px #3a3a44; display:flex; align-items:center; justify-content:center; color:#cfcfd6; font-size:12px; cursor:pointer;`
  - Dashed outlines on every widget unit
    (`outline:1px dashed #2f4a4c; outline-offset:3px; border-radius:10px;`).
  - Nav entries get the same overlay + a hide `×` bubble; nav becomes
    drag-reorderable.
  - Zone containers become wrap-enabled and show min-height drop areas; empty
    zones show drop hints (`tc`, `bottom`).
  - Overflowed widgets (see §8) show red dashed outlines
    (`outline:2px dashed #d6543f`) instead of disappearing.
- What hides outside edit mode: all of the above, plus empty top bar
  (`display:none` when all three top zones are empty and rail isn't overlay),
  empty bottom-zone hint, library drag-out.
- **Edit ribbon** (below the top bar; `background:#0b1516; border-bottom:1px
  solid #1a3a3c; padding:11px 16px; animation:lzRise .22s ease; z-index:40`):
  - `✥ EDIT LAYOUT` label (JetBrains Mono 700 11px, letter-spacing .14em, accent).
  - **PROFILE** segmented control: Desktop / Tablet / Mobile.
  - **LAYOUT** tabs: Default / Stage / Studio / Compact + `＋ Save` button
    (currently only toasts `Saved "My Layout · <Profile>"`).
  - Right side: `▤ Panels ▾` dropdown, `⚙ Options ▾` dropdown, `＋ Panel`
    (adds custom panel → right region), `▤ Widgets` (opens Widget Library),
    `✓ Done` (accent-filled).
  - Segmented-control chip style:
    `height:28px; padding:0 12px; … border-radius:7px; font:600 11px/1 'Hanken Grotesk'` —
    active: `background:var(--accent); color:var(--accent-ink);`, inactive `color:var(--textdim);`.
- **Panels dropdown** (`ribPanelsMenuStyle`: fixed, width 288, `background:#0c1213;
  border:1px solid #1a3a3c; border-radius:12px; padding:13px`): category-headed
  chip groups — PRESET BROWSER: Sources/List/Info; BLOCK EDITOR:
  Controls/Modifier; FC CONTROLLERS: Board/Switch/Layouts/LED/Tap/Hold; OTHER:
  Chain/History + `◧ Single Page`. Chip on-state:
  `background:#1c2b2c; color:#8fe3ea; border:1px solid #2f6d70;`; off:
  `background:#141417; color:var(--text2); border:1px solid var(--border2);`.
  Each chip toggles its panel into a default region:
  psrc→left, plist→main, pdet→right, bemod→right, fcbd→main, fcin→right,
  fclay→top, fcled→right, fctap→right, fchold→right, fc→bottom, history→right.
- **Options dropdown** (width 300): rows of segmented toggles —
  `NAV` Side/Bottom (`navMode`), `PRESETS` Flyout/Page (`presetMode`),
  `GRID` Left/Right/Top/Btm/Main (dock region of grid),
  `EDITOR` Left/Right/Top/Btm/Main (dock region of editor; opens it if closed).

---

## 6. Panel drag & drop choreography

### 6.1 Start

Pane headers start a dock drag (`onPointerDown` on the header):

```js
startPaneDrag(p,e){ e.preventDefault(); e.stopPropagation(); const r=(this.state.dock.place&&this.state.dock.place[p])||"main"; this.setState({drag:{mode:"dock", pane:p, target:r, tab:false, px:e.clientX, py:e.clientY}}); }
```

### 6.2 Target detection (in `onDragMove`, `mode==="dock"`) — verbatim

```js
if(d.mode==="dock"){ const rc=this.contentEl?this.contentEl.getBoundingClientRect():{left:0,top:0,width:1000,height:600};
  const px=e.clientX-rc.left, py=e.clientY-rc.top, W2=rc.width, H2=rc.height;
  let t="main"; if(px<W2*0.2) t="left"; else if(px>W2*0.8) t="right"; else if(py<H2*0.22) t="top"; else if(py>H2*0.78) t="bottom";
  let tabTarget=null; const proot=this.rootEl; if(proot){ const pels=Array.prototype.slice.call(proot.querySelectorAll("[data-pane]")); for(const pe of pels){ if(pe.dataset.pane===d.pane) continue; const pr=pe.getBoundingClientRect(); if(e.clientX>=pr.left&&e.clientX<=pr.right&&e.clientY>=pr.top&&e.clientY<=pr.bottom){ const rg=(this.state.dock.place&&this.state.dock.place[pe.dataset.pane])||"main"; t=rg; if(e.clientY<=pr.top+pr.height*0.42) tabTarget=pe.dataset.pane; break; } } }
  if(t!==d.target||tabTarget!==d.tabTarget||d.px!==e.clientX) this.setState({drag:Object.assign({},d,{target:t,tabTarget:tabTarget,px:e.clientX,py:e.clientY})}); return; }
```

- **Edge thresholds** (fractions of the content rect): left `< 20%`, right
  `> 80%`, top `< 22%`, bottom `> 78%`, else main.
- **Tab-into hit**: hovering another pane overrides the region to that pane's
  region; if the pointer is within the **top 42% of that pane's height**, the
  drop becomes "tab into that pane".

### 6.3 Preview visuals (while dragging)

All-available drop zones are outlined **the moment the drag begins**
(wayfinding, esp. on a clean canvas). For each of
`left/right/top/bottom/main` (using live sizes if occupied, else defaults
`{left:340,right:380,top:220,bottom:300}`):

```js
style:`position:absolute; left:${x}px; top:${y}px; width:${w}px; height:${h}px; box-sizing:border-box; border:1.5px dashed ${on?"#35c9d6":"rgba(53,201,214,.30)"}; background:${on?"rgba(53,201,214,.10)":"rgba(53,201,214,.025)"}; border-radius:12px; pointer-events:none; z-index:${on?39:38};`,
labelStyle:`position:absolute; top:8px; left:10px; font:700 9px/1 'JetBrains Mono',monospace; letter-spacing:.12em; color:${on?"#4fd1dc":"rgba(79,209,220,.55)"};`
```

(`on` = current target and not tab-targeting; labels are the region names in
caps.) The active target additionally gets the **live drop preview**:

```js
dropStyle=`position:absolute; left:${x}px; top:${y}px; width:${w}px; height:${h}px; background:rgba(53,201,214,.14); border:2px dashed #35c9d6; border-radius:12px; pointer-events:none; z-index:40;`;
dropLabel="Dock "+t.toUpperCase();
```

Tab-into preview replaces it with a strip over the target pane's header:

```js
dropStyle=`position:absolute; left:${x}px; top:${y}px; width:${w}px; height:36px; background:rgba(53,201,214,.24); border:2px solid #35c9d6; pointer-events:none; z-index:41;`; dropLabel="Tab into "+paneName;
```

The preview label style (top-left inside the preview):
`font:700 10px/1 'JetBrains Mono',monospace; letter-spacing:.1em; color:#4fd1dc;`.

> **INTENTIONAL PRODUCTION ADDITION — keep.** Production additionally shows
> split **before/after/below** placement indicators during panel drag (finer
> in-region placement than the design's region+tab targets). This exceeds the
> design on purpose and must not be "fixed back".

### 6.4 Drop handling (`onDragUp`, `mode==="dock"`) — verbatim

```js
if(d.mode==="dock"){ const p=d.pane; const t=d.target||((this.state.dock.place&&this.state.dock.place[p])||"main"); const other=(p==="grid")?"editor":"grid";
  const dk=JSON.parse(JSON.stringify(this.state.dock)); const from=(dk.place&&dk.place[p])||"main"; dk.place[p]=t; dk.collapsed=dk.collapsed||{}; dk.collapsed[t]=false; dk.cells=dk.cells||{};
  const effT=this.effectiveCells(t).map(g=>g.filter(x=>x!==p)).filter(g=>g.length);
  const effFrom=(from!==t)?this.effectiveCells(from).map(g=>g.filter(x=>x!==p)).filter(g=>g.length):null;
  if(d.tabTarget){ let placed=false; effT.forEach(g=>{ if(!placed && g.indexOf(d.tabTarget)>=0){ g.push(p); placed=true; } }); if(!placed) effT.push([d.tabTarget,p]); dk.activePane=dk.activePane||{}; dk.activePane[p]=true; }
  else { effT.push([p]); }
  dk.cells[t]=effT; if(effFrom) dk.cells[from]=effFrom;
  this.setState({dock:dk, drag:null}); this.flash("Docked "+this.paneName(p)+" → "+t.toUpperCase()); return; }
```

i.e. moving a pane un-collapses the target region, removes the pane from every
slot, then either appends it into the tab-target's slot (making it the active
tab) or appends it as a new slot at the end. Toast: `Docked <Name> → <REGION>`.

Right-click on a pane header opens the panel context menu (Save to Library /
Rename / Close panel — see §10).

---

## 7. Widget drag choreography

### 7.1 Start / ghost

```js
startDrag(e, id){ if(!this.state.editMode) return; e.preventDefault(); e.stopPropagation(); this._gsnapGid=null;
  const el=e.currentTarget.closest("[data-member]")||e.currentTarget.closest("[data-wid]"); const r=el?el.getBoundingClientRect():{left:e.clientX-40,top:e.clientY-20,width:120,height:40};
  this.setState({ drag:{ id, px:e.clientX, py:e.clientY, offx:e.clientX-r.left, offy:e.clientY-r.top, w:r.width, h:r.height, overZone:null, overIndex:0, mode:"widget" } });
}
```

Groups drag whole via their grip (`startDragGroup(e, group, ids)` — same shape
plus `groupId`/`groupIds`). While dragging, the source unit renders
`display:none` (real reflow, no gap left behind) and a **ghost** follows the
pointer (position updated imperatively via `ghostEl.style.left/top` between
renders):

```js
ghostStyle=`position:fixed; left:${drag.px-drag.offx}px; top:${drag.py-drag.offy}px; z-index:300; pointer-events:none; opacity:.5; padding:6px 8px; border-radius:11px; background:#0d0d0f; border:1px solid var(--accent); box-shadow:0 12px 30px rgba(0,0,0,.5); transform:scale(1.03);`
```

The ghost renders the real `AxisWidget` for the dragged id.

### 7.2 Hit testing (in `onDragMove`, widget branch) — verbatim behavior

1. **Zone hover**: iterate all `[data-zone]` rects (skipping `float`); the last
   one containing the pointer wins; none → `overZone="float"`.
2. **Insert index within zone**: among the zone's direct `[data-wid]` children
   (excluding the dragged unit `selfUnitId = groupIds ? "grp:"+groupId : id`),
   find the first child whose midpoint (`vert` zones — `rail`/`right` — use
   vertical midpoints, else horizontal) is past the pointer:

```js
overIndex=kids.length;
for(let i=0;i<kids.length;i++){ const kr=kids[i].getBoundingClientRect(); const mid=vert?(kr.top+kr.height/2):(kr.left+kr.width/2); const pos=vert?e.clientY:e.clientX; if(pos<mid){ overIndex=i; break; } }
```

3. **Group hover** (positional insert inside an existing group module): hit
   test all `[data-groupzone]` rects **expanded by 8px horizontally and 4px
   vertically**; on first entry the member midpoints are snapshotted
   (`this._gsnap`) so the reflowing placeholder can't cause jitter:

```js
if(this._gsnapGid!==hitGid){ this._gsnapGid=hitGid; this._gsnap=[...members except dragged].map(m=>r.left+r.width/2); }
const xs=this._gsnap||[]; let gi=xs.length; for(let i=0;i<xs.length;i++){ if(e.clientX<xs[i]){ gi=i; break; } }
overGroup=hitGid; overGroupIndex=gi;
```

4. **Single-unit center hover → offer grouping** (only when not over a group):
   scan all `[data-zone] > [data-wid]` singles (excluding self, groups, the
   gap); a hit requires the pointer inside the **middle 28% horizontally**
   (i.e. `left+width*0.36 … right-width*0.36`) and full height:

```js
if(e.clientX>=kr.left+kr.width*0.36 && e.clientX<=kr.right-kr.width*0.36 && e.clientY>=kr.top && e.clientY<=kr.bottom){ overUnit=k.dataset.wid; break; }
```

Only changed hover state triggers `setState`; otherwise `px/py` are mutated in
place (perf).

### 7.3 Indicators while dragging

- **Zone insert gap**: when hovering a zone (and not a group/unit), a dashed
  placeholder of the ghost's size is spliced into the unit list at `overIndex`:

```js
gapStyle:`width:${vert?"88%":(gw+"px")}; height:${gh}px; border-radius:9px; border:1.5px dashed #35c9d6; background:rgba(53,201,214,.10); flex:none;`
```

  (`gw/gh` = dragged unit's original rect, default 120×38).
- **Group insert indicator**: passed into `AxisGroup` as `indIndex` — the group
  renders a widget-sized dashed slot at that member index and its module border
  turns accent (see `03-groups.md`).
- **Grouping target highlight** on a hovered single unit:
  `outline:2px solid var(--accent); outline-offset:3px; border-radius:10px; background:rgba(53,201,214,.10);`.
- **Zone wash**: hovered zone container gets `background:#0e2224;`.

### 7.4 Drop handling (`onDragUp`, widget branch)

Priority order: **group insert → create group → float/edge-drop → zone insert**.

1. **Insert into existing group** at `overGroupIndex` (works for multi-drag):
   members re-ordered, dragged ids adopt `{group:gid, zone, density:"expanded"}`,
   then the whole zone is re-numbered keeping the group block at its current
   anchor position. Toast `Placed in group`.
2. **Create a new group** when dropped on a single unit's center
   (`d.overUnit`): `gid="g"+Math.random().toString(36).slice(2,7)`; members =
   `[target, ...dragged]`, all get `{group:gid, zone, density:"expanded"}`,
   spliced at the target's zone position. Toast
   `Grouped — now they move together`.
3. **Drop outside any zone** (`overZone==="float"`):
   - **Edge-drop auto-panel**: relative to the content rect, if
     `rx < W*0.18` → left, `rx > W*0.82` → right, `ry < H*0.15` → top,
     `ry > H*0.85` → bottom: create custom panel `cp<seq>` in that region
     (un-collapse it), move dragged widgets into `panel:cp<seq>` (order 0..n,
     group cleared). Toast `New <REGION> panel · dropped in`.
   - else **float placement**: `fx = max(6, px-offx-crLeft)`,
     `fy = max(6, py-offy-crTop)`; multi-drag fans out `+i*10 / +i*46`;
     group membership cleared.
4. **Zone insert**: splice dragged ids at `overIndex` among the zone's other
   ids, renumber `order`. Two density rules on drop:
   - **Auto-shrink to fit the right dock**: if target zone is `right` and
     `need = Σ estW(id) > avail = L.rightW - 24` → force density `compact`, or
     `mini` when `need > avail*1.7`; toast
     `Auto-shrank to <Mini|Compact> to fit the dock`.
   - Single (non-group) drops into the `rail` default to density `compact`;
     otherwise the widget keeps its density.

Floating widget chrome (wrap):
`position:fixed; left/top from content rect + fx/fy; z-index:50; padding:6px; border-radius:11px; background:#0d0d0f; border:1px solid ${edit?"#2f4a4c":"#26262c"}; box-shadow:0 10px 30px rgba(0,0,0,.45);`.

### 7.5 Library drag-out & parameter grab

- Library rows arm `startLibDrag` (edit mode only); moving **>5px** activates
  it: the widget is placed at `zone:"float"` under the pointer
  (`fx=e.clientX-crLeft-64, fy=e.clientY-crTop-19`, min 6) and a live widget
  drag starts (`offx:64, offy:19, w:150, h:40`). A click without movement adds
  to `tr` instead (`addWidget`: zone `tr`, appended, density `expanded`).
- `onParamGrab(p,e)` (from a block editor knob): creates/updates widget id
  `param:<block>:<param>`, records it in `state.pinned`, force-enters edit
  mode, places it floating under the pointer and starts the same drag
  (`w:132, h:38`). First grab toasts `Drag “<Block> · <Param>” onto your layout`.
  `pinParam(p)` (pin without drag) appends to `tr` and toasts
  `Pinned “<Block> · <Param>” — drag it anywhere`.

---

## 8. Top-bar auto-fit & overflow (the `⋯` chip)

Row zones (`tl`+`tc`+`tr` jointly, `bottom`, `gridbar`) auto-fit by stepping
default → compact → mini so they never overflow. Verbatim:

```js
const _fit=(ids,avail,gapPx)=>{ if(!ids.length) return "default";
  const need=(f)=>ids.reduce((t,id)=>t+Math.max(40,Math.round(this.estW(id)*f)),0)+gapPx*Math.max(0,ids.length-1);
  return need(1)<=avail ? "default" : (need(0.62)<=avail ? "compact" : "mini"); };
this._zoneSize={};
const _topIds=this.zoneItems("tl").concat(this.zoneItems("tc"),this.zoneItems("tr"));
const _topAvail=Math.max(180,_frameW-_railW0-(_mobVP0?62:32)-56);
let _tlv=_fit(_topIds,_topAvail,12);
this._overflow={};
if(_tlv==="mini"){
  // even mini can't fit everything: shed lowest-priority widgets into the ⋯ overflow (preset + save always stay)
  const _keep={preset:1,save:1};
  const _miniW=(id)=>Math.max(36,Math.round(this.estW(id)*0.42));
  const _avail=_topAvail-44; // reserve room for the ⋯ chip
  let _used=0; _topIds.forEach(id=>{ if(_keep[id]) _used+=_miniW(id)+10; });
  _topIds.forEach(id=>{ if(_keep[id]) return; _used+=_miniW(id)+10; if(_used>_avail) this._overflow[id]=true; });
  _tlv=_fit(_topIds.filter(id=>!this._overflow[id]),_avail,12);
}
this._zoneSize.tl=_tlv; this._zoneSize.tc=_tlv; this._zoneSize.tr=_tlv;
```

- Gap constants: top zones 12px, bottom 10px, gridbar 8px. Per-widget floor
  40px; compact factor **0.62**; mini estimate for overflow math **0.42 of
  estW, min 36px**, +10px spacing, 44px reserved for the `⋯` chip.
- Bottom zone avail: `max(120, frameW - railW - 32 - (navBottom? navCount*56+21 : 0))`.
- Gridbar avail: `max(70, gridPaneWidth - 250)` (only when the grid pane shows).
- Overflowed widgets: hidden outside edit mode; in edit mode marked with
  `outline:2px dashed #d6543f`. The topbar shows the chip
  `⋯ <count>` (`height:30px; padding:0 10px; border-radius:8px; background:#1c1c21;
  border:1px solid #3a3a44; color:#cfcfd6; font:700 12px/1 'JetBrains Mono'`),
  which opens the **overflow menu** (fixed, width 270,
  `background:#0c1213; border:1px solid #1a3a3c; border-radius:12px;`):
  header `HIDDEN · NOT ENOUGH SPACE`, rows with red dot `#d6543f` + label +
  home-zone name, footer button `✥ Rearrange in Customize` (enters edit mode).
- The zone-level size then feeds each widget's `mkW` (see `02-widgets.md` §2)
  together with per-panel width fitting (`this._panW["panel:"+id] = pane.availW`)
  and the manual density cap.
- `estW(id)` table (verbatim):

```js
estW(id){ const k=id.indexOf("param:")===0?"param":id; const m={preset:250,scenes:240,view:170,add:132,tuner:78,tempo:82,cpu:124,save:98,search:168,history:44,map:98,undo:80,account:44,conn:124,param:128,gridmode:184,blocksize:132,fcdevice:150,fclayouts:210,fcswitch:220}; return m[k]||120; }
```

---

## 9. Navigation

- Entries (`this.NAV`, order stored per-user in `state.navOrder`, hideable via
  `state.navHidden`):

```js
this.NAV = [
  {id:"grid",label:"Grid",glyph:"⊞"},{id:"ctrl",label:"Ctrl",glyph:"◉"},{id:"fc",label:"FC",glyph:"⌗"},
  {id:"scn",label:"Scn",glyph:"◪"},{id:"live",label:"Live",glyph:"⏺"},{id:"sets",label:"Sets",glyph:"≣"},{id:"setup",label:"Setup",glyph:"⚙"}
];
```

- Click behavior (`onNav`): `fc` toggles the Signal Chain panel → bottom;
  `sets` toggles the Preset Browser → main; `ctrl`/`scn`/`live`/`setup` toggle
  their stub panel → main; `grid` sets `section:"grid"`. No entry is
  hard-locked, but `grid` (the panel) is not closable and every hidden nav
  entry is restorable from the Library ("HIDDEN NAV · TAP TO RESTORE").
- **Rail mode** (`navMode:"side"`): 72px-wide rail (64px when the rail exists
  only for rail widgets), logo on top, nav items 52×50
  (`border-radius:11px`; active: `background:#13282a; color:var(--accent);
  border:1px solid #234d4f;`; inactive `color:var(--textfaint)`), glyph 18px +
  label 10px/600. Bottom of rail: connection dot (9px, `#33c46b`, glow) +
  `FW1.4` (mono 9px). Rail is visible when `navMode==="side"` OR rail-zone
  widgets exist OR edit mode.
- **Bottom-nav mode** (`navMode:"bottom"`): nav items render in the bottom bar
  (52×44, radius 10), separated from bottom-zone widgets by a 1px divider.
- **Reorder** (edit mode): pointer-down on a nav overlay starts `navDrag`; a
  ghost chip follows the pointer
  (`opacity:.7; … border:1px solid var(--accent); transform:scale(1.06);`) and
  an accent dashed gap placeholder (52×50 rail / 52×44 bottom,
  `border:1.5px dashed var(--accent); background:rgba(53,201,214,.12)`) is
  spliced at the midpoint-computed index; drop rewrites `navOrder`. The
  dragged entry dims to `opacity:.3`.
- **Hide / restore**: edit-mode `×` bubble sets `navHidden[id]`; toast
  `Hid “<Label>” — restore from Widgets`; restore list lives in the Library.
- **Mobile hamburger/drawer**: `railOverlay = (vw<760 || profile==="mobile") && navMode!=="bottom"`.
  The rail then renders as an off-canvas drawer
  (`position:absolute; width:80px; z-index:230; transform:translateX(-96px)`
  when closed, `translateX(0)` when open,
  `transition:transform .26s cubic-bezier(.2,.8,.3,1)`), with a scrim
  (`rgba(6,6,8,.52); backdrop-filter:blur(2px); z-index:225`) and a floating
  hamburger button (42×42, top/left 11px, 3 bars 18×2px).

---

## 10. Drawers, library, menus, dialogs

- **Widget Library** (`libOpen`): desktop = right sheet 320px wide
  (`background:#0c1213; border-left:1px solid #1a3a3c; animation:lzSlideR .22s`);
  tablet/mobile = bottom sheet (`border-radius:18px 18px 0 0; max-height:86%;
  animation:lzRise .24s`). Contents, in order:
  1. Search field (34px, `Search widgets…`).
  2. `SAVED · TAP TO LOAD` — saved custom panels (▤, loads as a new custom
     panel docked right) and saved groups (⛁, loads into `tr`), each with
     `<n> widgets` count + delete ×. Row style
     `background:#12181c; border:1px solid #2a4a44; border-radius:9px;`.
  3. `HIDDEN · TAP TO ADD` — hidden widgets grouped by category
     (order `Transport, Status, Grid, FC, Tools, Parameters, Other`;
     category from `_catOf`), rows `background:#101d1e; border:1px solid #234d4f;
     cursor:grab;` with `＋`; **tap to add** (→ `tr`) or **drag onto the
     layout** (5px threshold, see §7.5). Empty state: `All widgets are placed.`
  4. `ON YOUR LAYOUT · TAP TO HIDE` — placed widgets with accent dot, zone name
     (`Top · Left`, `Side rail`, `Grid bar`, …), `⌦` icon; tap hides.
  5. `HIDDEN NAV · TAP TO RESTORE` (only when nav entries are hidden).
- **Widget catalog** (`this.WIDGETS` labels/hints): preset "Preset display /
  nav + name", scenes "Scenes / 1–8", view "View switch / Basic/Adv", add
  "Add block / ⌘K", tuner, tempo "BPM", cpu "CPU meter", save, search,
  history, map "Grid map", undo "Undo / Redo", account, gridmode "Grid mode /
  Full/Map/Auto", blocksize "Block size / S/M/L", fcdevice "FC device /
  FM3/FC-6/FC-12", fclayouts "FC Layouts / 1–8 · Master", fcswitch
  "Switch / View / switch + 1–4".
- **Context menu** (right-click; fixed, width 214, `background:#0c1213;
  border:1px solid #1a3a3c; border-radius:10px; padding:6px;` clamped to
  viewport):
  - Panel: `▤ Save to Library`, `✎ Rename`, `× Close panel` (danger hover
    `background:#2a1416; color:#e88;`).
  - Group: `⛁ Save group to Library`.
  - Widget: label header; `MOVE TO` chip grid (Top L / Top C / Top R / Rail /
    Bottom / Grid bar / Float — `moveWidgetTo` appends to the zone; float gets
    `fx:48, fy:48`); `SIZE` chips (Default / Compact / Mini →
    `patchWidget({density})`); `× Hide widget`.
- **Save panel to library** captures `{name, items:[{id,density,group}]}`;
  **load** creates a fresh custom panel docked right and re-zones the items.
  **Save group** captures `{name:"Group <n>", ids:[{id,density}]}`; **load**
  re-creates it at the end of `tr` with a fresh gid.
- **Rename dialog**: fixed scrim `rgba(6,6,8,.55)` + 340px card
  (`background:#141417; border:1px solid var(--border3); border-radius:14px`),
  input auto-focused/selected, Enter commits / Escape cancels. Built-in panels
  can't be renamed (toast `Built-in panels can’t be renamed`).
- **Confirm dialog** (unsaved-changes on preset recall): 372px card, amber
  glow dot, buttons `Save & load` (accent) / `Discard` (danger
  `background:#2a1414; border:1px solid #5a2c2c; color:#e88`) / `Cancel`.
- **⌘K Add-block palette**: 520px card (max-height 66vh), search input,
  rows glyph+name+type, footer `↑↓ NAVIGATE · ⏎ INSERT → <target> · ESC CLOSE`;
  keyboard handled globally (`onKey`): ⌘S save, ⌘Z / ⇧⌘Z undo/redo, ⌘K open,
  Escape closes (rename → confirm → ribbon menu → ctx → library → preset
  flyout → edit mode, in that priority).
- **Preset flyout** (right, 400px, `presetMode:"flyout"`) and **History
  drawer** (right, 330px) — fixed panels with scrim, `lzSlideR .24s`.
- **Toasts**: bottom-center fixed stack (max 3, newest kept), each
  `padding:11px 18px; border-radius:11px; background:#16161a; border:1px solid
  var(--border3) (warn #5a4a2c / error #5a2c2c); font:600 13px; animation:lzRise .18s;`
  auto-dismiss **2300ms**, or **4600ms** with an action link (accent, e.g.
  Undo→Redo, Copy layout).

---

## 11. Mobile / tablet rules (all breakpoints & conditionals)

| Condition | Effect |
|---|---|
| `s.profile==="mobile"` | Frame becomes a 400px-wide device canvas: `width:400px; max-width:96vw; height:min(820px,96vh); border-radius:28px; border:1px solid var(--border3); box-shadow:0 30px 80px rgba(0,0,0,.6);` centered on `#08080a` |
| `s.profile==="tablet"` | Frame `width:1024px; max-width:96vw; height:min(760px,96vh); border-radius:18px;` |
| desktop | Frame `position:absolute; inset:0;` (fills viewport) |
| `(s.vw||1440)<760` (`mobVP`) | Real-viewport mobile: rail becomes hamburger/drawer overlay (`railOverlay`), top bar gets `padding-left:62px`, top-zone avail subtracts 62 |
| `railOverlay = (mobVP || isMobile) && navMode!=="bottom"` | Hamburger + slide-in rail drawer + scrim (see §9) |
| `isMobile && has(left/right/top)` | Those regions become **overlay drawers**; closed drawers show **edge indicators**: `◧ LEFT` / `RIGHT ◨` pills bottom-left/right (`bottom:64px; height:40px; border-radius:11px`), `▽ TOP` tab top-center (`height:26px; border-radius:0 0 12px 12px`); style base `background:var(--bg2); border:1px solid var(--accent-border1); color:var(--accent-text); font:700 10px JetBrains Mono` |
| open mobile drawer | scrim inside content area (`rgba(6,6,8,.5); blur(2px); z-index:150`), drawer pane `z-index:180` with `0 0 46px rgba(0,0,0,.6)` shadow |
| `isMobile` bottom region | height cap `H*0.9` instead of `H*0.78` |
| tablet/mobile (`mob`) | Widget Library becomes bottom sheet; grid canvas width computed as 1024 |
| `contentMode:"pages"` (stage/tablet/mobile presets) | non-grid sections render as full-page stubs instead of docked panels |
| Safe-area | none — no `env(safe-area-inset-*)` handling exists in the design |

Grid auto behavior tied to width: `mapMode = gridMode==="map" || (gridMode==="auto" && canvasW<1160) || !gridInMain`.

---

## 12. Visual tokens actually used (shell)

CSS custom properties (`:root`, verbatim):

| Token | Value | | Token | Value |
|---|---|---|---|---|
| `--bg` | `#0c0c0e` | | `--text` | `#e9e9ee` |
| `--bg2` | `#0e0e10` | | `--text2` | `#cfcfd6` |
| `--surface` | `#141417` | | `--textdim` | `#9a9aa3` |
| `--surface2` | `#1c1c21` | | `--textfaint` | `#8a8a94` |
| `--border` | `#26262c` | | `--textmuted` | `#56565e` |
| `--border2` | `#2a2a31` | | `--accent` | `#35c9d6` |
| `--border3` | `#3a3a44` | | `--accent-bright` | `#4fd1dc` |
| `--accent-text` | `#8fe3ea` | | `--accent-ink` | `#06181a` |
| `--accent-bg1` | `#101d1e` | | `--accent-bg2` | `#12262a` |
| `--accent-border1` | `#234d4f` | | `--accent-border2` | `#2f6d70` |
| `--amber` | `#f5a623` | | selection | accent on `#06181a` |

Recurring literals outside the vars: ribbon/menus bg `#0c1213` + border
`#1a3a3c`; ribbon strip bg `#0b1516`; drawer/float bg `#0d0d0f`; toast bg
`#16161a`; chip-on `#1c2b2c`; library saved-row `#12181c`/`#2a4a44`;
danger `#d6543f`, danger-dim `#2a1416`/`#2a1414`/`#5a2c2c`/`#e88`;
success `#2fa15f`/`#33c46b`/`#46d17f`; shell letterbox `#08080a`.

Dimensions:

| Thing | Value |
|---|---|
| Top bar | `min-height:62px` (56px in empty+overlay case), padding `11px 16px` |
| Rail width | 72px (`navMode:"side"`), 64px (widgets/edit only), 80px (mobile drawer) |
| Bottom bar | `min-height:52px`, padding `8px 16px` |
| Pane header height | 36px (`HH`, also the tab-into preview height and pbHost offset) |
| Collapsed region strip | 26px (`strip`) |
| Collapsed pane (header-only) | 36px |
| Region defaults | left 340 / right 380 / top 220 / bottom 300 |
| Region resize clamps | left/right min 220; top min 120; bottom min 120 (drag: ≥120/≥180-ish caps vs content, see §2.1) |
| Middle column reserve | `MINC=180` horizontal, `MINR=120` vertical, `midW≥160`, main height ≥90 |
| Resizer hit strips | 12px thick (regions z-14, cells z-15) |
| Header mini-buttons | 22×22, radius 6 |
| Tab chip | `padding:5px 10px; radius 7; font 700 10px Hanken Grotesk` |
| Ribbon buttons | height 30 (chips 28), radius 8 |
| Nav items | 52×50 rail / 52×44 bottom, radius 11/10 |
| Widget edit ctrl bubbles | 22×22 + 11px transparent hit border, radius 17 |
| Floating widget wrap | padding 6, radius 11 |
| Drop previews | radius 12, dash `2px dashed #35c9d6` (active) / `1.5px dashed` (outlines) |
| Context menu | width 214; overflow menu 270; Panels menu 288; Options menu 300 |
| Preset flyout 400px / History drawer 330px / Library sheet 320px | |
| Float editor | default 440×360, clamps w 320–760, h 240–700 |
| Drawer editor height | `clamp(L.drawerH||340, 200, 640)`; collapsed 46px |

Fonts: `'Hanken Grotesk',system-ui,sans-serif` (UI), `'JetBrains Mono',monospace`
(labels/values/badges). Scrollbars: thin, `--border2` thumb on transparent,
10px (9px for `.lz-scroll`), radius 6.

---

## 13. Timers, keyframes, animation rules

Keyframes (verbatim):

```css
@keyframes lzIn{ from{ opacity:0; } to{ opacity:1; } }
@keyframes lzSlideR{ from{ transform:translateX(100%); } to{ transform:translateX(0); } }
@keyframes lzRise{ from{ opacity:0; transform:translateY(12px); } to{ opacity:1; transform:translateY(0); } }
@keyframes lzToast{ 0%{opacity:0;transform:translate(-50%,10px);} 12%{opacity:1;transform:translate(-50%,0);} 88%{opacity:1;transform:translate(-50%,0);} 100%{opacity:0;transform:translate(-50%,6px);} }
@keyframes lzPulse{ 0%,100%{ border-color:var(--accent); } 50%{ border-color:#1c4a4e; } }
.lz-zone-live{ animation:lzPulse 1.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce){ *{ animation-duration:.001ms !important; animation-iteration-count:1 !important; transition-duration:.001ms !important; } .lz-zone-live{ animation:none !important; border-color:var(--accent) !important; } }
```

Durations in use: scrims `lzIn .14–.18s`; sheets `lzSlideR .22–.24s
cubic-bezier(.2,.7,.2,1)`; menus/cards `lzRise .16–.24s`; ribbon `lzRise .22s`;
drop preview `lzIn .12s`; rail drawer `transform .26s cubic-bezier(.2,.8,.3,1)`.

Timers: toast auto-dismiss 2300ms (4600ms with action); hold-to-repeat
(widgets) 380ms delay then 100ms interval; fake sync/reconnect 1400ms;
ResizeObserver → re-measure debounce 30ms; mount measurement retry loop
40 × 32ms; grid quick-control drag threshold 5px; library drag-out threshold
5px; grid value-fill `transition:height .05s linear` (the only geometry
transition, inside a block, allowed).

**Rule (binding):** no CSS transitions on pane `left/top/width/height` — panes
are re-laid-out imperatively every render; a transition there interacts with
the ResizeObserver re-render loop and leaves panes stuck at stale positions
(overlap). The mobile rail drawer animates `transform` only, which is fine.

---

## 14. Delta checklist vs current Svelte implementation

Compared against `src/lib/workbench/svelte/*` (DockWorkspace, DockRegion,
TabStack, PanelHost, WidgetZone, WidgetHost, WidgetGroupHost, NavigationHost,
EditRibbon, DragLayer, WorkbenchHost, controller.svelte.ts, sizing.ts, drag.ts,
layouts.ts) and `src/lib/axis-workbench/axisWorkbenchDefaults.ts`.

> **Intentional addition to KEEP (not a delta):** production shows split
> **before/after/below** placement indicators during panel drag (finer
> placement than the design's region+tab-42% model). Keep it; do not regress
> to region-only targets.

### P1 — structural / must-port

- [ ] **Layout presets & profiles are missing.** Production ships exactly one
  layout (`axis.layout.default`, `axisWorkbenchDefaults.ts:71`) and one
  profile (`axis.profile.desktop`). Design: `preset(kind)` for
  `default/stage/studio/compact` (LAYOUT tabs) **plus** per-profile layouts
  `desktop/tablet/mobile` seeded from `default/tablet/mobile` (§3), PROFILE
  tabs in the ribbon, `copyLayoutFrom` toast action, and `onPreset` preserving
  `rightW`. Port into `layouts.ts` / `axisWorkbenchDefaults.ts`. Note the
  production default layout also diverges from the design default (blockEditor
  +fc docked bottom, presetBrowser left, history right vs design
  `editor:bottom, fc:bottom, history:right, presets:left` with only grid
  visible initially — reconcile visibility flags too).
- [ ] **`computeDock` geometry constants differ.** Production: regions default
  320/320 (left/right CSS, `DockRegion.svelte:99`), 240 top/bottom
  (`:112`), defaults 320/340/360 in `axisWorkbenchDefaults.ts:97-99`, min
  resize 120, collapsed strip 32px. Design: defaults **340/380/220/300**,
  viewport-relative caps (`W*0.34 / W*0.36 / H*0.36 / H*0.78` — `H*0.9`
  mobile), **proportional squeeze** (`MINC=180`, `MINR=120`), `midW≥160`,
  main ≥90 high, collapse strip **26px**, resize clamps left/right min 220
  (§2.1). Port the whole function rather than approximating with CSS widths.
- [ ] **Pane-collapse (header-only slots) missing.** Design: per-pane collapse
  to `HH=36px` participating in slot distribution (`paneCollapsed`,
  `remain = along - collCount*HH`), body `display:none`, icon `–`/`+` (§2).
  Production only collapses whole regions.
- [ ] **Main-region split axis toggle + slot model.** Design: `dock.mainAxis`
  `"h"|"v"` toggled from the pane header (`⬌`/`⬍`), per-region
  `cells` slot groups with `split` ratios (min ratio **0.12**) and
  `ungroupSlot` (`‖` splits a tab group apart). Verify DockNode ratios match
  the 0.12 floor and that tab groups can be split apart from the header.
- [ ] **Panel-drag region detection.** Design: content-rect fractions
  **<20% left / >80% right / <22% top / >78% bottom**, plus hovered-pane
  override with **top-42%** = tab-into (§6.2). Production: DOM tabstack hit +
  0.24 pane-edge splits (`drag.ts:60`). Keep production's split
  before/after/below indicators (intentional addition), but region + tab
  thresholds must match the design numbers.
- [ ] **Drop preview visuals.** Design exact values: active zone
  `rgba(53,201,214,.14)` + `2px dashed #35c9d6` radius 12 + label
  `Dock <REGION>`; inactive outlines `1.5px dashed rgba(53,201,214,.30)` bg
  `.025`; tab strip preview `36px` high `rgba(53,201,214,.24)` solid border
  (§6.3). Production uses `color-mix` approximations
  (`TabStack.svelte`, `DockRegion.svelte:201-216`) and a 34%-of-pane split
  rect — align colors/alphas/labels with the design (split rect size is part
  of the intentional addition).
- [ ] **Widget-drag insert gap.** Production: 2px accent line
  (`WidgetHost.svelte:182`). Design: **ghost-sized dashed slot** spliced into
  the flow (`width:drag.w; height:drag.h; 1.5px dashed #35c9d6; bg
  rgba(53,201,214,.10)`; rail variant width 88%) + zone wash `#0e2224` (§7.3).
- [ ] **Grouping trigger + positional group insert** — see
  `03-groups.md` P1 (center-28% band, `_gsnap` snapshot, ±8/±4 hit expansion).
- [ ] **Top-bar auto-fit + overflow shedding.** Port `_fit`/`_overflow`
  verbatim (§8): joint `tl+tc+tr` fitting, per-widget `estW`, 0.62/0.42
  factors, keep-set `{preset,save}`, 44px chip reserve, red dashed outline for
  overflowed widgets in edit mode. Production's `units>=3 && zoneWidth<150`
  heuristic (`WidgetZone.svelte:59-71`) must go.
- [ ] **Drop-time density rules**: right-dock auto-shrink
  (`need > rightW-24 → compact`, `> ×1.7 → mini`, toast) and rail-drop default
  `compact` (§7.4).
- [ ] **Edge-drop auto-panel thresholds**: design `0.18/0.82` horizontal but
  **`0.15/0.85` vertical** (§7.4); production uses 0.18 uniformly
  (`WidgetHost.svelte:195`).
- [ ] **Toasts missing entirely.** Queue of ≤3, 2300ms (4600ms with action
  link), exact style + `lzRise` (§10). Many flows depend on them (dock/move/
  shrink/group/profile-copy feedback).
- [ ] **Mobile model.** Production has a 760px breakpoint + mobile dock
  drawers (`DockWorkspace.svelte:249-264` — sizes match design OWL/OWR/OHT
  88vw/320, 88vw/340, 72%/260). Missing vs design: **edge indicator pills**
  (`◧ LEFT` / `RIGHT ◨` at `bottom:64px`, `▽ TOP` top-center tab, §11),
  profile-driven (not just viewport-driven) overlay behavior, bottom-region
  mobile cap `H*0.9`, and per-profile layout persistence.

### P2 — edit mode & chrome

- [ ] **Edit ribbon content.** Production (`EditRibbon.svelte:41-54`): EDIT
  LAYOUT + Panels/＋Panel/Widgets/Layouts + error text; Customize as a
  floating bottom-left FAB. Design (§5): PROFILE segmented control, LAYOUT
  preset tabs + `＋ Save`, `▤ Panels ▾` **dropdown with per-part chips**
  (Sources/List/Info, Controls/Modifier, Board/Switch/Layouts/LED/Tap/Hold,
  Chain/History, `◧ Single Page`), `⚙ Options ▾` dropdown (NAV Side/Bottom,
  PRESETS Flyout/Page, GRID/EDITOR region pickers), `＋ Panel`, `▤ Widgets`,
  accent `✓ Done`; Customize button lives **in the bottom bar** next to a
  divider, not floating.
- [ ] **`singlePage()` workspace action** (grid main + psrc left + plist main
  + pdet right + history right + fc bottom, sized `cw*0.24/0.26`, `ch*0.34`)
  missing.
- [ ] **Pane header extras**: gridbar widget zone inside the grid pane header
  (production `gridbar` zone isn't rendered in `WorkbenchHost.svelte`),
  dock-collapse `«` on the region's lead pane, dbl-click tab rename, dynamic
  editor tab title = selected block name (`paneName(id,eName)`), pane
  context menu (Save to Library / Rename / Close).
- [ ] **Collapsed strip visuals**: 26px, rotated mono label
  (`» LEFT`/`« RIGHT`/`▾ TOP`/`▴ BOTTOM`), radius 10, click-to-expand (§2.1) —
  production 32px strip with hover-revealed 22px button
  (`DockRegion.svelte:124-157`).
- [ ] **⌘K add-block palette + global keymap** (⌘S, ⌘Z/⇧⌘Z, Escape cascade
  §10) — missing in production.
- [ ] **Confirm dialog** (unsaved-changes recall: Save & load / Discard /
  Cancel) — missing.
- [ ] **Rename modal** (autofocus+select, Enter/Escape) for custom panels —
  production only has inline rename in the library drawer.
- [ ] **Widget Library drawer parity**: search field, `SAVED · TAP TO LOAD`
  (panels ▤ + groups ⛁ with counts & delete ×), category grouping
  (Transport/Status/Grid/FC/Tools/Parameters/Other), tap-to-add vs 5px
  drag-out-to-float, `HIDDEN NAV · TAP TO RESTORE`, bottom-sheet variant on
  tablet/mobile (§10) — production drawer lists templates/hidden/placed but
  lacks search, categories, and drag-out.
- [ ] **Overflow menu**: production has the chip+menu (`WidgetZone.svelte:
  181-200, 329-399`) — align contents (red dot, home-zone name,
  `✥ Rearrange in Customize`) and the §8 trigger rule.
- [ ] **Context menu**: production has Move-to (7 zones) + Size + Hide — add
  the missing `Grid bar` target styling parity and group `⛁ Save group`,
  panel `▤ Save to Library`; verify float move sets `fx:48, fy:48`.
- [ ] **Nav parity**: design entries
  `grid/ctrl/fc/scn/live/sets/setup` with stub-panel toggling semantics
  (`onNav`, §9) vs production `grid/library/fc/scenes/live/setup/account`
  (locked account, `rail.footer`) — reconcile ids intentionally; port the
  **drag ghost chip + dashed gap placeholder** (production only dims to
  opacity 0.38, `NavigationHost.svelte:207`), hide-toast with restore hint,
  and rail footer connection dot + `FW1.4`.
- [ ] **Preset flyout (400px) / History drawer (330px)** app-level surfaces +
  `presetMode:"flyout"|"page"` switch — not in production workbench.
- [ ] **pbrowse mount-once hidden host** reveal pattern (§2.2) — perf
  requirement for the heavy Preset Browser.
- [ ] **Edit-mode widget chrome**: floating 22×22 ctrl bubbles with 11px
  transparent hit ring at `top:-20px; right:-18px`, dashed unit outlines
  `#2f4a4c`, zone dashed outlines during drag — align exact styles (§5).
- [ ] **Region resize handle geometry**: 12px hit strips centered on
  boundaries, z-index 14/15; drag clamps per §2.1 (production min 120 for all;
  design 220 min for left/right).

### P3 — cosmetic tokens

- [ ] Map `--aw-*` theme vars to the exact design palette (§12) — notably
  bg2 `#0e0e10`, surfaces `#141417/#1c1c21`, borders `#26262c/#2a2a31/#3a3a44`,
  accent family (`#35c9d6/#4fd1dc/#8fe3ea/#06181a/#101d1e/#12262a/#234d4f/#2f6d70`),
  menus `#0c1213`+`#1a3a3c`, ribbon `#0b1516`.
- [ ] Heights: top bar min 62 / bottom bar min 52 / pane header 36 / tab strip
  36 with 26px tabs (production matches 36/26 — verify chip paddings
  `5px 10px` radius 7 and active colors `#1c2b2c`/`#8fe3ea`).
- [ ] Keyframes/durations (`lzIn/lzSlideR/lzRise/lzPulse`, §13) and
  `prefers-reduced-motion` guard.
- [x] **No CSS transitions on pane left/top/width/height** — production
  complies today (only background/transform transitions found); keep it that
  way (binding rule, §13).
