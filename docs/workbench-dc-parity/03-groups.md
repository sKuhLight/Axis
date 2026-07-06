# Workbench DC parity — 03 · Widget Groups

Source of truth: `design/AxisGroup.dc.html` plus the group-related logic in
`design/Axis Layout System.dc.html` (module style, drag/drop, creation).
Binding specification: port verbatim.

A group is a set of widget ids sharing `L().widgets[id].group === gid` within
one zone; consecutive same-group ids render as **one module** (`data-wid =
"grp:"+gid`, members carry `data-member`). Groups are created by dropping a
widget onto another widget's center, extended by dropping into the module, and
dissolved via the `⊟` control (`ungroup`) or per-member drag-out.

---

## 1. Template (verbatim, complete)

```html
<div class="axg" data-groupzone="{{ gid }}" style="{{ moduleStyle }}">
  <sc-for list="{{ members }}" as="m">
    <sc-if value="{{ m.showInd }}"><span style="{{ indStyle }}"></span></sc-if>
    <sc-if value="{{ m.showDiv }}"><span style="width:1px; height:20px; background:#26262c; flex:none;"></span></sc-if>
    <div data-member="{{ m.id }}" style="{{ m.wrap }}">
      <dc-import name="AxisWidget" w="{{ m.w }}" data="{{ wdata }}" bus="{{ bus }}"></dc-import>
      <sc-if value="{{ edit }}"><div data-member="{{ m.id }}" onPointerDown="{{ onMemberDown }}" style="{{ memberOverlay }}"></div></sc-if>
    </div>
  </sc-for>
  <sc-if value="{{ endInd }}"><span style="{{ indStyle }}"></span></sc-if>
  <sc-if value="{{ edit }}"><div onPointerDown="{{ gripDown }}" title="Move whole group" style="{{ gripStyle }}">⠿</div></sc-if>
</div>
```

## 2. Logic (verbatim, complete)

```js
class Component extends DCLogic {
  renderVals(){
    const raw=this.props.members||[];
    const indIndex=(this.props.indIndex==null?-1:this.props.indIndex);
    const draggingId=this.props.draggingId;
    const hovering=indIndex>=0;
    const members=raw.map((m,i)=>({ id:m.id, w:m.w, showDiv:i>0&&indIndex!==i, showInd:indIndex===i,
      wrap:`position:relative; display:flex; align-items:center; ${draggingId===m.id?"display:none;":""}` }));
    const base=this.props.moduleStyle||"";
    const moduleStyle = hovering ? base.replace("border:1px solid #26262c","border:1px solid #35c9d6") : base;
    const phW=this.props.phW||120, phH=this.props.phH||38;
    return {
      gid:this.props.gid, moduleStyle, edit:!!this.props.edit, members, endInd:indIndex===raw.length,
      memberHint:this.props.memberHint||"90px,38px", wdata:this.props.wdata||{}, bus:this.props.bus||{},
      onMemberDown:this.props.onMemberDown||(()=>{}), gripDown:this.props.gripDown||(()=>{}),
      indStyle:`width:${phW}px; height:${phH}px; border-radius:9px; border:1.5px dashed #35c9d6; background:rgba(53,201,214,.16); flex:none; margin:0 2px;`,
      memberOverlay:"position:absolute; inset:0; z-index:5; cursor:grab;",
      gripStyle:"position:absolute; top:-9px; left:6px; z-index:8; width:20px; height:16px; display:flex; align-items:center; justify-content:center; border-radius:5px; background:#1c1c21; border:1px solid #3a3a44; color:#9a9aa3; font-size:9px; cursor:grab;"
    };
  }
}
```

## 3. Visual spec

### Module container (supplied by the shell as `moduleStyle`)

```js
groupModuleStyle:`display:flex; align-items:center; height:${zoneSize==="mini"?28:zoneSize==="compact"?34:38}px; background:#0e0e10; border:1px solid #26262c; border-radius:10px; overflow:visible; padding:0 2px;`
```

- Background `#0e0e10`, border `1px solid #26262c`, radius **10px**, padding
  `0 2px`, `overflow:visible` (so the grip and edit bubbles can float above).
- **Height follows the zone's auto-fit size**: 38px default / 34px compact /
  28px mini — same steps as widgets.
- **Hover-during-drag**: while an insert index is active (`indIndex>=0`) the
  border swaps to accent — literal string replacement
  `border:1px solid #26262c` → `border:1px solid #35c9d6`.
- Members render as **grouped** AxisWidgets (transparent, borderless — the
  module is the chrome; see `02-widgets.md` §1.1).

### Divider between members

`width:1px; height:20px; background:#26262c; flex:none;` — shown before every
member except the first (`showDiv: i>0`), and **suppressed at the insert
position** (`&& indIndex!==i`) so the placeholder replaces it.

### Insert-indicator placeholder

`indStyle` (above): a **widget-sized** slot — `width:phW × height:phH`
(the dragged unit's original rect; defaults 120×38, passed from the shell as
`drag.w/drag.h`), `border-radius:9px; border:1.5px dashed #35c9d6;
background:rgba(53,201,214,.16); margin:0 2px;`.

- Rendered **before member i** when `indIndex===i`; **after the last member**
  when `indIndex===members.length` (`endInd`).
- The index comes from the shell's stable snapshot of member midpoints
  (`_gsnap`, see `01-shell.md` §7.2 step 3) so the placeholder reflowing can't
  cause jitter. Group hit-area is the module rect expanded by **8px
  horizontally / 4px vertically**.
- A member currently being dragged renders `display:none` (`draggingId`).

### Group grip (edit mode only)

`⠿` chip floating **above the module's top-left**: `position:absolute;
top:-9px; left:6px; z-index:8; width:20px; height:16px; border-radius:5px;
background:#1c1c21; border:1px solid #3a3a44; color:#9a9aa3; font-size:9px;
cursor:grab;` — title `Move whole group`; pointer-down starts the whole-group
drag (`startDragGroup`).

### Member drag overlay (edit mode only)

Each member is covered by `position:absolute; inset:0; z-index:5;
cursor:grab;` carrying `data-member`; pointer-down starts a **single-member**
drag (`onMemberDown` → `startDrag(e, member)`), which removes it from the
group on drop elsewhere.

### Shell-side unit chrome around the module

The group unit (in the zone list) also gets, in edit mode, the standard
control bubbles at `top:-20px; right:-18px`: `⊟` = **ungroup** (splits all
members back to singles in place, toast `Ungrouped`) and `×` = hide group
(all members → `hidden`, group cleared). Right-click opens the group context
menu: `⛁ Save group to Library`.

### Member hints / sizing

- Shell passes `member-hint="90px,38px"` in horizontal zones and
  `"52px,44px"` in the rail (placeholder sizing only).
- On grouping and on group-insert, members are forced to
  `density:"expanded"` (= default ceiling); their rendered size still follows
  the zone auto-fit (the `w` prop is built with `mkW(id, true)`).

## 4. Group lifecycle (shell logic, summarized with exact rules)

- **Create**: drop a dragged unit on a single widget's **center 28%**
  (`left+width*0.36 … right-width*0.36`, full height) →
  `gid = "g"+Math.random().toString(36).slice(2,7)`; members =
  `[target, ...draggedIds]` at the target's zone position; toast
  `Grouped — now they move together`. (Full code: `01-shell.md` §7.4.)
- **Insert**: drop while `overGroup` → splice dragged ids at `overGroupIndex`
  into the member order; whole zone re-numbered with the group block anchored
  where it currently sits; toast `Placed in group`.
- **Group drag**: grip drags all members as one unit (`grp:<gid>` is excluded
  from self-hit-testing); dropping into a zone splices all ids contiguously;
  dropping on empty space floats them fanned `+i*10 / +i*46`; a group cannot
  be dropped into itself.
- **Ungroup / hide**: see above. **Save/load**: `saveGroupToLib` stores
  `{name:"Group <n>", ids:[{id,density}]}`; loading re-creates the group at
  the end of `tr` with a fresh gid (Library `SAVED · TAP TO LOAD`, `⛁` rows).

---

## 5. Delta checklist vs current Svelte implementation

Checked against `src/lib/workbench/svelte/WidgetGroupHost.svelte`,
`WidgetHost.svelte`, `WidgetZone.svelte`.

### P1 — behavior

- [ ] **Positional insert into a group is missing.** Production appends to the
  end of `group.widgetIds` (WidgetHost.svelte:102,134). Design: midpoint
  snapshot (`_gsnap`) → insert at `overGroupIndex`, with the divider at that
  index suppressed and a **widget-sized** placeholder shown (this file §3);
  group hit-area expanded ±8px/±4px.
- [ ] **Grouping trigger hit-test.** Production groups on any
  `[data-widget-host]` proximity hit (WidgetHost.svelte:140–143). Design
  requires the pointer inside the target's **middle 28% width** (0.36 insets)
  — outside that band the drop is a zone insert next to it, not a group.
- [ ] **Insert indicator visuals.** Production shows a 2px accent line
  (WidgetHost.svelte:182–183, WidgetGroupHost.svelte:119–121). Design (both in
  zones and in groups): a **ghost-sized dashed slot** — `phW×phH,
  border-radius:9px, 1.5px dashed #35c9d6, bg rgba(53,201,214,.16)` (in-group)
  / `.10` alpha (zone gap) — spliced into the flow so neighbours reflow.
- [ ] **Members forced to `density:"expanded"` on group/insert** (design) —
  verify production preserves/resets member size the same way.
- [ ] **Dragged member renders `display:none`** inside the module (design
  `draggingId`) — production dims/leaves it? verify and match (real reflow, no
  residual gap).

### P2 — visuals

- [ ] **Grip**: design is a `⠿` chip floating above the module
  (`top:-9px; left:6px; 20×16; radius 5; bg #1c1c21; border #3a3a44; color
  #9a9aa3; font 9px`). Production is an in-row 18px-wide `⋮` column with a
  right border (WidgetGroupHost.svelte:223,262). Match the design chip
  (edit-mode only).
- [ ] **Divider**: design `1px × 20px #26262c` centered spans; production
  full-height border with `margin:8px 1px` (WidgetGroupHost.svelte:310–312).
- [ ] **Module chrome**: `bg #0e0e10; border 1px #26262c; radius 10;
  padding 0 2px; overflow:visible;` and **height stepping 38/34/28 with the
  zone size** — production uses `var(--aw-bg-2)` + fixed
  `var(--aw-widget-h)`=38 (WidgetGroupHost.svelte:251–258).
- [ ] **Hover accent border** while a drag hovers the module
  (`#26262c → #35c9d6` swap) — not present in production.
- [ ] **Ungroup control**: design `⊟` bubble in the standard edit-control
  cluster at `top:-20px; right:-18px` (+ hide `×`); production has separate
  18×18 ungroup/menu buttons at `top:-9px` (WidgetGroupHost.svelte:274–308).
  Align position/size/styling with the design bubbles
  (22×22 + 11px transparent hit ring, `background:#1c1c21`, inset ring
  `#3a3a44`).
- [ ] **Member overlay**: full-member `inset:0; z-index:5; cursor:grab`
  drag surface in edit mode (design) — verify production member drag surface
  covers the whole member, not just a handle.
- [ ] **Grouped widget rendering** (transparent/borderless members, module as
  the only chrome) — see `02-widgets.md` delta; required for the module to
  read as one unit.

### Non-deltas

- Production `library.widget.save` for groups ≈ design `⛁ Save group to
  Library` — flow exists; verify saved-group rows appear in the Library drawer
  with member count and delete, and load lands at the end of the top-right
  zone with a fresh gid.
