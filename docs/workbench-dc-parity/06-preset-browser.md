# 06 — Preset Browser parts (`design/AxisPresetBrowser.dc.html`)

Source of truth: `design/AxisPresetBrowser.dc.html` (1397 lines, branch `layout-rework`). One component, four mount shapes via the `part` prop:

```
part = "full" | "sources" | "list" | "detail"     (default "full")
props: accent (color), density ("comfortable"|"compact"), advancedDefault (boolean, default true)
```

Part gating (verbatim, `renderVals()` line 1133):

```js
const part = this.part || "full";
const showRail    = part==="full";                    // tool rail (prototype chrome only)
const showTop     = part==="full" || part==="list";   // header + query bar + builder chips
const showSources = part==="full" || part==="sources";
const showResults = part==="full" || part==="list";
const showDetail  = part==="full" || part==="detail";
const isOwner = !this.bus || this.bus.owner()===this;
```

Part-specific container overrides (line 1385):

```js
libStyle:    (part==="sources" ? "position:relative; width:100%; flex:1; min-width:0; height:100%; overflow-y:auto; background:var(--surface);" : libStyle),
detailStyle: (part==="detail"  ? "position:relative; width:100%; flex:1; min-width:0; height:100%; overflow-y:auto; background:var(--bg2);"    : detailStyle),
```

---

## 1. `__PBBus` — shared state & overlay ownership

Bus creation (constructor, verbatim):

```js
const bus = window.__PBBus || (window.__PBBus = { instances:new Set(), state:null, PRESETS:null, PBYN:null,
  rank:{list:0,detail:1,sources:2,full:3},
  notify(){ this.instances.forEach(i=>{ try{ i.forceUpdate(); }catch(e){} }); },
  owner(){ let best=null,br=99; this.instances.forEach(i=>{ const r=(this.rank[i.part]!=null?this.rank[i.part]:3);
    if(r<br){ br=r; best=i; } }); return best; } });
```

Unlike the FC/BE buses, the PB bus shares **the entire state object by reference**: the first instance seeds `bus.state = this.state` (and the preset dataset `bus.PRESETS`/`bus.PBYN`); later instances adopt `this.state = bus.state`. The `setState` override (line 660):

```js
setState(patch, cb){ const p=(typeof patch==="function")?patch(this.state):patch;
  if(this.bus){ if(p) Object.assign(this.bus.state,p);
    this.bus.instances.forEach(i=>{ if(p) Object.assign(i.state,p); try{ i.forceUpdate(); }catch(e){} });
    if(!this.bus.instances.size && p) Object.assign(this.state,p); }
  else { if(p) Object.assign(this.state,p); try{ this.forceUpdate(); }catch(e){} }
  if(cb) cb(); }
```

**Every state key is therefore shared across all parts.** The full key list (initial state):

```
advanced, query, simpleQ, caret,
conditions, sort, selected,
acOpen, acItems, acIndex, acCtxLabel,
picker, pickerSearch, pickerHi,
saving, saved,
cloudOverride, view, toast,
marked, anchorN, renaming, renames, deleted, ctx,
deviceFilter, confirm,
vw, libOpen, swipeN, theme, themeOpen, showAllRows
```

Keys that *must* stay in lockstep for split-part UX: `selected` (list→detail sync), `conditions`/`query`/`simpleQ`/`advanced` (query bar ↔ chips ↔ sources' saved-filter "active" highlight ↔ list filtering ↔ detail matched-param highlighting), `view` + `deviceFilter` + `sort` (sources ↔ list), `marked`/`anchorN` (multi-select header), `saved`/`saving`, `renames`/`renaming`/`deleted`/`cloudOverride` (dataset mutations).

**Overlay ownership** — overlays live in shared state but render on exactly one instance, the *owner* (lowest rank: `list(0) < detail(1) < sources(2) < full(3)`):

```js
picker:   (isOwner ? picker : null),
ctx:      (isOwner ? ctx : null),
confirm:  (isOwner ? confirm : null),
themeOpen:(isOwner && S.themeOpen),
toast:    (isOwner && S.toast ? {...} : null)
```

So with list+sources+detail mounted, the **list panel owns all popovers/menus/dialogs/toasts** regardless of which part triggered them (picker anchors carry a `rect` in *fixed/viewport* coordinates so this works cross-panel).

---

## 2. Top bar + query system (`full` and `list` parts)

### 2.1 Browser header

Row `padding:12px 20px; border-bottom:1px solid var(--border); flex-wrap:wrap`:

- (navCompact `<1024`) hamburger 40×40 → toggles the Library drawer (`libOpen`).
- Title "Preset Browser" (800 17) + `countLine` under it (`600 10px mono`): `"{n} presets"` or `"{shown} of {total} presets"` when filtered.
- **Global sync chip** (`onSyncJump` → jumps to `view:"upload"`): text `"{n} to sync"` (amber) or `"All synced"` (green `#33c46b`); style `h 34; radius 9; 700 11px mono; color {c}; background {c}14; border 1px {c}40` + 7 px dot.
- Theme button ◐ (34×34).
- **DEVICE filter**: `DEVICE` micro-label + button `{dot}{label}▾` (h 34, radius 9; active device tints the border `{devColor}66`); opens the generic picker with counts per device. Devices: `Axe-Fx III #4f6bed / FM9 #2fb0c9 / FM3 #d98a2b / all #8a8a94`.
- **SORT segment**: `#` (num) / `A-Z` (name) / `CPU` (cpu desc); chips `6px 11px radius 7 mono 700 11`; active = accent bg + `--bg` text.
- **Advanced search toggle**: pill with dot; on = accent bg/accentink; toggling **converts state**: advanced→simple parses the current text into `conditions[]` and clears the input; simple→advanced serializes `conditions` back into the input via `condsToQuery` (join `"  +  "`).

### 2.2 Query bar

`padding:13px 20px 12px; background:var(--bg2); z-index:60`:

- Input wrap: h 46, radius 12, `bg var(--bg2); border 1px var(--border2)` (accent while autocomplete open); magnifier SVG; input is **mono 14 px 500**; placeholder:
  - advanced: `AMP(TYPE=5153, GAIN>7)  +  REVERB(MIX>30)  +  tag:Lead`
  - simple: `Search presets, tags, amps…`
- Clear `×` (24×24) shown when text present.
- **Save filter** button (`☆ Save filter`, radius 12) → opens the inline name input in the sources sidebar (`saving:true`, auto-focused).

### 2.3 Query language (grammar — port verbatim)

Terms joined by top-level `+` (paren-aware split). Term forms (`parseTerm`):

```
tag:"…" | tag:…            → {kind:"tag", val}
name:"…"                   → {kind:"name", val}
author:"…"                 → {kind:"author", val}
cpu OP number | scenes OP number   (OP ∈ >=,<=,!=,=,>,<)
TOKEN                      → {kind:"block", block:id, params:[]}
TOKEN(P OP V, P OP V, …)   → {kind:"block", block:id, params:[{name,op,val}]}
```

Block tokens = upper-cased category ids (`AMP`, `DRIVE`, `CAB`, `COMP`, `CHORUS`, `FLANGE`, `PHASER`, `FILTER`, `ENHANCE`, `DELAY`, `REVERB`; `FILTERABLE` order = picker order). Param specs per block in `PSPEC` (`[name, "enum"|"num"|"bool", a, b]`), e.g. `amp:[["TYPE","enum",AMP],["GAIN","num",0,10],…,["BRIGHT","bool"]]`.

Matching (`matchParam`): enum/bool → case-insensitive substring (negated for `!=`); numeric → supports a **range literal** `a-b` (inclusive, either order) else float compare via `cmp` (`=`/`!=` use epsilon 1e-9). A block cond matches if *some* instance of that block type satisfies *all* its param conds. Simple mode tokenizes on whitespace and requires every token in the haystack `name + tags + author + blocks(cat+TYPE)`.

Serialization (`condToText`): block `TOK(NAME{op}{val}, …)`, values quoted when they contain whitespace/commas/parens (`q()`).

### 2.4 Autocomplete (advanced mode)

Caret-aware context detection (`suggest(text, caret)`): finds the term under the caret; inside unclosed parens → **param** context, or **value** context after `NAME OP`; `tag:`/`author:` prefixes → those lists; else **block/token** context (blocks + snippet tokens `tag:`, `author:`, `name:`, `cpu<`, `scenes>`).

Dropdown: `top:calc(100%+6px); maxHeight:320; bg var(--surface); border var(--border2); radius 13; shadow 0 24px 60px; animation pbPop .13s`; context caption (`acCtxLabel`, e.g. `value · GAIN`, mono 9 uppercase); items = colored dot (square for blocks/tags, outline circle otherwise) + mono 13 label + right hint (param range `0–10`, "type", "On/Off", "block · Amp"…); footer hints `↑↓ move · ↵ insert · esc close`. Keyboard: ↑/↓ move, Enter/Tab insert at caret (`acceptAc` splices `item.insert` over the typed fragment and re-suggests), Esc closes; blur closes after 130 ms. Numeric value suggestions = `lo, 25%, 50%, 75%, hi` candidates. Enum lists capped at 40.

### 2.5 Builder chips (FILTERS row)

`padding:12px 20px; background:var(--bg)`, label `FILTERS`. One chip per parsed condition (chips are **derived from the live query** in advanced mode and from `conditions[]` in simple mode; edits go through `editConds` which re-serializes back into the input in advanced mode):

- **Block chip**: colored head `{dot}{CatName}` (`bg {cat}26; border {cat}55; 700 12`; click = add-param picker), then one pill per param cond `NAME{op}{val} ×` (`bg var(--surface2); mono 600 11`; × removes the param), then dashed `+ param`, then a border-separated `×` to remove the whole chip.
- **Scalar chip**: `{dot}{Label}: {val}` or `{Label} {op} {val}` (tag dot uses `TAGCOL`, cpu amber, scenes `#4f6bed`).
- `+ Add filter` button → generic picker (`addfilter` kind: 11 blocks with color dots + `tag:` + `author:` + `cpu` + `scenes`; picking `cpu`/`scenes` inserts a default cond `cpu<60` / `scenes>4`; picking a block adds an empty block cond; `tag`/`author` chain into their own pickers).
- Empty hint: advanced `"Type a query above, or add filters →"`, simple `"Add block, parameter & tag filters →"`. Right-aligned `Clear all` when chips exist.
- Param→value flow: `+ param` picker (names + range hints) → value picker (enum values with block-colored dots / On,Off / 5 numeric candidates; numeric default op `=`, from autocomplete `>` after num params).

---

## 3. `sources` part — LIBRARY sidebar

Desktop-in-full: fixed column `width:248; border-right var(--border); background:var(--bg2)`. As a part: fills pane with `background:var(--surface)`. Sections top→bottom:

1. **LIBRARY header** + cloud summary chip: green dot + `"{inCloud} synced"` or `"{inCloud} · {n} to sync"`.
2. **Views list** — the source list *with counts*; each row: glyph (18 wide, colored), label (700 12.5), right count (mono 10). Active row: `background:aT(8); border 1px {accent}55`. Definitions (id/label/glyph/color/predicate — port exactly):

```js
["all","All presets","≣",textdim,        ()=>true],
["device","On this device","▣",textfaint, x=>x.m.presence!=="cloudOnly"],
["cloud","In cloud","☁",accent,           x=>x.m.presence!=="deviceOnly"],
["cloudOnly","Cloud only","☁","#9b8cf0",  x=>x.m.presence==="cloudOnly"],
["deviceOnly","Not backed up","▪",textfaint, x=>x.m.presence==="deviceOnly"],
["upload","Needs upload","↑","#f5a623",   x=>x.sync==="modified"],
["update","Needs update","↓","#4a82e0",   x=>x.sync==="outdated"]
```

Counts respect the device filter and deletions (`cnt(fn)=PRESETS.filter(p=>!deleted && devOK && fn(metaOf(p))).length`). Clicking sets shared `view` (and closes the mobile drawer).

3. **SAVED FILTERS** — header + count; while `saving`, an inline name input (`border 1px var(--accent)`; Enter saves `{id:"s"+Date.now(), name, query}` where query = current advanced text or serialized conditions; Esc/blur cancels). Rows: color dot (first block cond's category color, else tag color, else faint), name (700 12.5), query subtitle (mono 9.5, ellipsized), hover-revealed `⧉` duplicate and `×` delete. A row is highlighted **active** when its parsed query equals the current conditions. Apply = switch to advanced + load query text. Persisted to `localStorage["pb.saved"]`; seeds:

```js
{name:"Hendrix Tones",     query:"tag:Hendrix"},
{name:"All 5153 Rigs",     query:"AMP(TYPE=5153)"},
{name:"Big Ambient Verbs", query:"REVERB(TYPE=Large Hall, MIX>30)"},
{name:"High-Gain Leads",   query:"AMP(GAIN>7)  +  tag:Lead"},
{name:"Low-CPU Live Set",  query:"cpu<55  +  tag:Live"},
{name:"TS-Boosted Blues",  query:"DRIVE(TYPE=TS808)  +  tag:Blues"}
```

Empty state: "No saved filters yet. Build a query and hit Save filter."

4. **QUICK TAGS** — 12 chips (`Clean, Crunch, Hi-Gain, Lead, Ambient, Metal, Blues, Hendrix, Worship, Funk, Bass, Modern`); toggle a `tag:` condition; off = `color {tagCol}; bg {tagCol}14; border {tagCol}33`, on = solid tag color with `--bg` text. Tag colors from `TAGCOL` (e.g. Clean `#35c9d6`, Crunch `#f5a623`, Hi-Gain `#d6543f`, Lead `#d65b9e`, Ambient `#9b8cf0`, Bass `#4f6bed`).

---

## 4. `list` part — results

### 4.1 Filtering / ordering / cap

```js
let list=this.PRESETS.filter(p=>!S.deleted[p.n] && devOK(p) && viewPred(metaOf(p)) && this.matchPreset(p,conds,simpleQ));
list=list.slice().sort((a,b)=> S.sort==="name"?this.effName(a.n).localeCompare(this.effName(b.n))
                              : S.sort==="cpu"?b.cpu-a.cpu : a.n-b.n);
this._order=list.map(p=>p.n);
// soft cap: mount a small page of rows first (keeps dock mounts fast); "Show all" expands
const totalRows=list.length;
if(!S.showAllRows && totalRows>14) list=list.slice(0,14);
```

The cap is a **soft cap of 14 rows** with an explicit expander button below the list: `"Show all {N} presets"` (h 40, radius 10, `bg var(--surface); border var(--border2)`), which sets `showAllRows:true`.

### 4.2 Selection header (sticky)

Rendered above the rows when `marked` is non-empty: sticky top bar (`bg var(--bg2)`, shadow) with `"{n} selected"` (accent mono), then buttons `⤓ Export`, `☁ Back up`, `Remove`, `Delete` (red-tinted `#1f1315/#3a1f1f/#e87b6a`), and a clear-✕.

### 4.3 Row anatomy

Row = swipe wrapper (mobile) + front. Front (`display:flex; gap:14; padding:13px 18px` — density `compact`: `9px 16px`; `border-bottom 1px var(--surface)`):

1. **Checkbox** 18×18 radius 5 — unmarked: `border var(--border3)` transparent; marked: accent fill + `✓`.
2. **Number** `pad3(n)` — mono 700 13, width 34; **amber `#f5a623` when selected**, else `textmuted`.
3. Main column:
   - Name (700 14.5, ellipsized) — or an inline **rename input** (accent border, Enter/blur commit into shared `renames`, Esc cancel; auto-focus+select).
   - Up to 3 **tag pills** (mono 700 9.5, `color TAGCOL; bg {col}1f`).
   - **Block chips** row: one per non-IO block, `"{Cat} · {TYPE}"` (mono 600 10, `color {cat}; bg {cat}17; border {cat}33; maxWidth 160`), title = `inst — TYPE`.
4. Right column (aligned end): device chip (`700 9 mono`, device color 1f/40 tint), **cloud chip** (glyph + short label, see §6 table), author (mono 9.5), **CPU meter** (`CPU` micro-label + 46×6 bar + colored % — thresholds `>=80 #e87b6a`, `>=62 #f5a623`, else `#33c46b`).

Row states: selected → `bg aT(6)` + `border-left 2px accent` + amber number; marked → `bg {accent}14` + same border-left; hover → `bg var(--bg2)` (or stronger tint when marked/selected).

### 4.4 Row interactions

- **Click** → `selected:n, anchorN:n` (detail part re-renders through the bus). **Cmd/Ctrl-click** toggles `marked[n]`. **Shift-click** marks the range between `anchorN` and `n` in current display order (`_order`).
- **Context menu** (right-click): if the row is marked and >1 marked → menu targets the whole selection. Items (single): `Load preset` (or `Load from cloud`) hint `↵`, `Rename ✎`, `Duplicate ⧉`, `Convert to device… ⇄`, `Export to disk ⤓`, divider, one sync-state action (`modified→Upload to cloud`, `outdated→Update from cloud`, `cloudOnly→Download to device`, `deviceOnly→Back up to cloud`, `synced→Re-upload to cloud`), divider, `Remove from device ⊘`, `Delete everywhere ✕` (danger red `#e87b6a`, hover `#2a1416`). Multi: `Export {n} to disk`, `Back up to cloud`, `Sync from cloud`, `Remove {n} from device`, `Delete {n} presets`. Menu card: fixed, w 230, radius 11, `shadow 0 24px 60px`, clamped to viewport.
- **Swipe-to-action** (mobile only, `ACTIONW=222`): pointer-capture drag left reveals three 74-px stacked actions — `▶ Load` (`#1b2b2d`/accentbright), `☁ Back up` (`#16241a`/`#48d18a`), `🗑 Delete` (`#2a1616`/`#f08a7a`, confirm dialog); axis-lock 8 px, open threshold half of ACTIONW, front translates with `transform .24s cubic-bezier(.4,0,.2,1)`.
- Destructive flows go through the **confirm dialog** (400 px card; danger `⚠` red icon chip, confirm button `#d6543f`; non-danger `↺` accent). Copy verbatim: delete = "This permanently removes {label} from this device and the cloud, including every saved version. This can't be undone."; remove = "Removes {label} from this device. Cloud copies (and their versions) are kept — presets with no cloud backup will be deleted entirely."
- **Empty state**: centered magnifier SVG (44, `--border3`), "No presets match this filter" (700 15 `textdim`), "Loosen a parameter range or remove a block condition." (mono 12 `textmuted`).

---

## 5. `detail` part

Column (in full: `width:368; border-left; background:var(--bg2)`; as part: fills pane; mobile: full-screen `position:fixed; inset:0; z-index:180`, shown only when `selected!=null`, with a sticky backdrop-blurred `‹ Results` back bar → `closeDetail()` clears `selected`).

**No selection** → placeholder: `◧` 30 px, "Select a preset", "Its full block + parameter breakdown and signal chain show up here."

With a selection (`detail` built from `PBYN[selected]`):

1. **Header** (`padding:20px 20px 16px`): amber `pad3` number + name (800 19); all tag pills; meta columns AUTHOR / SCENES / CPU (colored) / DEVICE (device color); **cloud status card** (`bg var(--bg2); radius 11`): cloud chip + status line, e.g. `"Device v6 · cloud v7 — newer version in cloud"` (all five `statusLine` variants in the code, §5.1); **Load button** — full-width amber `#f5a623` on `#1a1206`, label `Load preset` / `Load from cloud`; beside it a context-dependent accent **action button** (`Upload` / `Update` / `Download` / `Back up`); below, ghost button `⇄ Convert for another device` → converter picker (`"Convert to FM3 — fewer blocks · may trim"` hints; conversion clones the preset, trims blocks over the target's cap `FM3:6 / FM9:10 / III:99`, retargets device, bumps CPU ×1.16/×1.06/×0.9, creates a `v1` version note "Converted from {src} — {n} blocks trimmed…").
2. **VERSION HISTORY**: header + `"{n} versions"`; rows: status dot (accent = on device, `#9b8cf0` = in cloud, `--border2` otherwise, glow when either), version id (mono 700 11.5) + badges `On device` (accent) / `In cloud` (`#9b8cf0`) (`700 8.5 mono, {col}22 bg`), note line, meta `"{date} · {author}"`; current-device row is tinted `aT(6)` and shows `ON DEVICE` (green); every other row has a **Restore** button → confirm ("Restores v… to the device, replacing the current device version (v…). The replaced version stays in history.") → `doRevert` sets `localIdx` (and promotes `cloudOnly→both`).
3. **SIGNAL CHAIN**: chip per block incl. In/Out (`{glyph}{Cat}` mono 10.5, category-tinted `bg {cat}18 border {cat}33`), separated by `›` arrows.
4. **BLOCK PARAMETERS**: card per non-IO block (`border var(--surface2); radius 12; bg var(--bg2)`), header = category dot + name + instance id; body = 2-per-row param cells (`flex:1 1 calc(50% - 1px)`, separated by 1 px `--surface2` gaps): key (mono 9 faint) over value (mono 700 12.5). **Params matched by the active query are highlighted**: cell `bg aT(10)`, value in accent (`matchedKeys()` re-runs `matchParam` per block×cond).

### 5.1 Cloud sync model (shared by rows, views, detail, context menus)

```js
p.cl = { presence:"both"|"deviceOnly"|"cloudOnly", versions:[{v,date,note,author}...], localIdx, cloudIdx }
cloudOf(p)   = p.cl overlaid with state.cloudOverride[p.n]        // all mutations are overrides
deriveSync(m)= cloudOnly | deviceOnly | synced(local==cloud) | modified(local<cloud… local newer) | outdated
cloudMeta:  synced   {label:"Synced",     short:"Synced",    glyph:"☁", col:"#33c46b"}
            modified {label:"Local edits",short:"Local edit",glyph:"↑", col:"#f5a623"}
            outdated {label:"Cloud newer",short:"Update",    glyph:"↓", col:"#4a82e0"}
            cloudOnly{label:"Cloud only", short:"Cloud",     glyph:"☁", col:"#9b8cf0"}
            deviceOnly{label:"Not backed up",short:"Device", glyph:"▪", col:textfaint}
```

Actions mutate only `cloudOverride` (up: `cloudIdx=localIdx`, down: `localIdx=cloudIdx`, presence→`both`; removeFromDevice: `presence:"cloudOnly", localIdx:-1` — or full delete when there was no cloud copy).

---

## 6. Generic searchable picker (owner-rendered overlay)

One picker component drives all dropdowns: kinds `addfilter | tag | author | param | value | device | convert`. Anchored to the trigger's `getBoundingClientRect()` (fixed positioning, clamped `left ≤ vw-312`, `top = rect.bottom+6`): card w 300, maxHeight 360, radius 13, `pbPop .12s`; title (`Add a filter`, `Pick a tag`, `Pick a parameter`, `Pick a value`, `Filter by device`, `Convert preset to…`), search input (auto-focused), rows = optional color dot + label + right sub (counts, ranges, hints); keyboard ↑/↓/Enter/Esc; click-outside closes.

---

## 7. Mobile / responsive behavior

- Breakpoints: `isMobile() vw<760`, `navCompact() vw<1024`.
- `navCompact`: rail hamburger appears; the **Library sidebar becomes a left drawer**: `position:fixed; width:284; maxWidth:85vw; z-index:170; transform:translateX(0 | -102%); transition .22s cubic-bezier(.4,0,.2,1)` + `rgba(6,6,8,.55)` backdrop (`pbFade .12s`). Any view/tag/saved-filter pick closes it.
- `isMobile`: detail becomes a **full-screen overlay** (`position:fixed; inset:0; z-index:180`) shown when `selected!=null`, with the sticky `‹ Results` back bar (`backdrop-filter:blur(6px)`, `color-mix(in srgb, var(--bg) 94%, transparent)`); rows gain swipe-to-action (§4.4); row padding bumps slightly (`9px 10px`).
- Rail (`part==="full"` prototype chrome only) hides on mobile.
- Toast: fixed bottom-center pill (`pbPop .14s`, dot + text), owner-rendered, 2100 ms.

---

## 8. Visual values table

Theme tokens identical to doc 04 (`--bg #0c0c0e … --accent #35c9d6`, Hanken Grotesk / JetBrains Mono; themable via the same `resolveTk` engine, persisted `localStorage["pb.theme"]`).

| Element | Values |
|---|---|
| Sidebar width | 248 (full desktop) / 284 drawer (maxW 85vw) |
| Detail width | 368 (full desktop) |
| Query input | h 46, radius 12, mono 14/500; ac dropdown maxH 320, radius 13 |
| Chips row | chip head h 26 radius 7 (block: `{cat}26` bg, `{cat}55` border); param pill h 24 radius 7; wrap radius 9 `--surface`/`--border2` |
| Row | padding 13×18 (compact 9×16), gap 14, bottom border `--surface`; selected/marked left border 2px accent |
| Row number | mono 700 13, w 34, selected `#f5a623` |
| Checkbox | 18×18 radius 5 |
| Tag pill | mono 700 9.5, `{col}` on `{col}1f`, radius 5 |
| Block chip (row) | mono 600 10, `{cat}` on `{cat}17`, border `{cat}33`, radius 6, maxW 160 |
| Cloud/device chip | mono 700 9, `{col}` on `{col}1f`, border `{col}40`, radius 5 |
| CPU meter | bar 46×6 radius 4; thresholds 80/62 → `#e87b6a`/`#f5a623`/`#33c46b` |
| Soft cap | 14 rows + `Show all {N} presets` (h 40, radius 10) |
| Selection header | sticky, h ~50 (`10px 18px`), buttons h 30 radius 8; Delete tint `#1f1315/#3a1f1f/#e87b6a` |
| Context menu | fixed w 230 radius 11 shadow `0 24px 60px`; item `8px 10px` radius 8; danger `#e87b6a` |
| Picker | w 300 maxH 360 radius 13, list maxH 288 |
| Confirm dialog | w 400 radius 16; buttons h 44 radius 11; danger confirm `#d6543f` |
| Version row | dot 9 px (+glow), badges `700 8.5 mono {col}22`; Restore h 30 radius 8 |
| Detail Load button | h 42 radius 11 `#f5a623` text `#1a1206` 800 13 |
| Detail param cell | 50% grid, `8px 11px`, matched `aT(10)` + accent value |
| Swipe actions | total 222 px, 3 × 74 px columns; open threshold 111 px |
| Views row (sources) | `8px 9px` radius 10; active `aT(8)` + `{accent}55` border |
| Quick tag chip | `5px 10px` radius 8 mono 700 11 |
| Animations | `pbPop .1–.15s ease-out`, `pbFade .08–.12s` |

---

## 9. Delta checklist vs current production

Compared against: `src/lib/axis-workbench/panels/preset-browser/AxisPresetBrowserPartPanel.svelte`, `src/lib/axis-workbench/presetBrowser/*` (controller/runtime/data/types), `src/lib/PresetBrowser.svelte`, `src/lib/axis-workbench/axisWorkbenchRegistry.ts`.

Production shared state today: controller snapshot `{sourceId, entryId, focusedBlockEffectId, activePart, detailOpen}` + runtime `{loadingEntryId, auditioningEntryId, hydratingEntryId, error, details, lastLoaded*}`. Design shares far more (all of §1) — the checklist below calls out which keys need homes.

### P0 — structural gaps

- [ ] **Split-list cap mismatch** *(confirmed)* — `AxisPresetBrowserPartPanel.svelte` `list` part hard-caps at 120 rows (`.slice(0, 120)`) with **no expander**; the spec is a soft cap of **14** rows with a `"Show all {N} presets"` button (`showAllRows`) so dock mounts stay fast but the full library remains reachable (§4.1). Replace the silent 120-cap with the 14 + expander pattern (or virtualization) and the exact button chrome.
- [ ] **List part is missing the top bar + query system** — design `showTop = full || list`: the header (count line, sync chip, device filter, sort segment, advanced toggle), query bar with autocomplete, and builder-chips row are part of the **list part**, not just the monolith. Production list part renders only rows; the advanced query/chips/saved-filter UI lives solely in `PresetBrowser.svelte` (full). Port §2 into the list part (backed by the shared controller so sources/detail react).
- [ ] **Sources part content mismatch** — production sources part = preset sources with proportional bars. Design sources part = **views-with-counts** (7 cloud/device views, §3) + **saved filters** (apply/duplicate/delete/save-name inline) + **quick tags**. Decide the union: at minimum add saved filters + quick tags to the part and reconcile "views" with production's source list; counts must respect the active device filter and deletions.
- [ ] **Query/selection shared-state contract** — the parts must share `conditions/query/advanced`, `view`, `deviceFilter`, `sort`, `marked/anchorN`, `saved/saving`, `renaming/renames`, and `selected` (`entryId` exists). Extend `presetBrowserWorkbenchController` snapshot accordingly; overlay ownership (picker/ctx/confirm/toast render on the lowest-rank mounted part: list < detail < sources < full, §1) needs an explicit owner election in the controller.

### P1 — behavior parity

- [ ] **Row anatomy**: production list rows are 3-column (number / name+summary / counts). Spec rows add checkbox multi-select, tag pills, per-block chips (`Cat · TYPE`), device chip, cloud-sync chip, author, CPU meter, inline rename, selected = amber number + accent left border (§4.3). Port at least: checkbox+mark model (cmd/shift semantics over display order), cloud chip, CPU meter, block chips.
- [ ] **Context menus in the parts** — production part panels have no right-click menu; spec §4.4 defines single/multi menus with sync-state-dependent actions and danger styling, plus the sticky multi-select action header (Export / Back up / Remove / Delete / clear).
- [ ] **Detail part**: production detail shows metadata + version *count* only. Spec adds: cloud status card with 5 status lines, Load/Upload/Update/Download/Back-up dual buttons, **version list with Restore + On device / In cloud badges** and confirm-dialog copy, `⇄ Convert for another device` flow with block-cap trimming hints, signal-chain chip strip, and **query-matched param highlighting** (`matchedKeys` → `aT(10)` cells) (§5). Version restore/compare is currently "pending" in production — this is the binding spec for it.
- [ ] **Saved filters** — production persists `config/savedFilters` (good); verify the part-level UI: inline save-name input triggered by the query bar's `Save filter` button, active-filter highlight (parsed-query equality), duplicate/delete affordances, and the 6 seed filters for empty libraries (§3.3).
- [ ] **Advanced query grammar parity** — production `PresetBrowser.svelte` has the typed language + autocomplete; verify against §2.3–2.4 verbatim: paren-aware `+` split, `author:` term, numeric **range literal `a-b`**, `!=` substring negation for enums, caret-context autocomplete with insert-at-fragment, Tab-accept, and the advanced↔simple round-trip conversion on toggle.
- [ ] **Device filter + sort** — header DEVICE picker (with per-device counts) and `# / A-Z / CPU` segment shared across parts; production list part has no such header controls.
- [ ] **Mobile**: sources part as slide-in drawer `<1024` (production has this — verify 284 px/`-102%` transition + backdrop), full-screen detail with `‹ Results` back bar `<760`, and **swipe-to-action rows** (Load / Back up / Delete, 222 px, pointer-captured, axis-locked) which production lacks.
- [ ] **Empty/placeholder states**: list empty (magnifier + two-line copy), detail unselected (`◧` Select a preset), saved-filters empty, autocomplete "No matches — keep typing", picker "No matches" (§4.4, §5, §2.4). Production placeholders exist but copy/styling should match.

### P2 — polish

- [ ] Sync chip in the header (`{n} to sync` amber / `All synced` green) jumping to the "Needs upload" view; cloud summary line in sources.
- [ ] Cloud-state visual language everywhere (chips `☁ Synced / ↑ Local edit / ↓ Update / ☁ Cloud / ▪ Device` with the §5.1 colors) — production has sync concepts server-side; align the chip vocabulary.
- [ ] Confirm-dialog copy verbatim (delete vs remove vs restore) and danger/non-danger icon chips.
- [ ] Rename flow (inline input with auto-select, Enter/blur/Esc) and duplicate ("{name} copy") + export-to-disk JSON (single object vs array, filename rules) from rows/menus.
- [ ] `pbPop/pbFade` animation timings; density prop (`compact` row padding `9px 16px`); accent/density/advancedDefault as panel props.
