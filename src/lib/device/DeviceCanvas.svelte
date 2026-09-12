<script lang="ts">
  // The block editor's canvas: every control drawn at the DEVICE's own pixel coordinate.
  //
  // This component has no opinion about arrangement. `deviceCanvas.ts` turns the served layout page
  // into boxes; this draws them, absolutely positioned, on a fixed 1240px-wide surface (the device's
  // own canvas) that never reflows to its pane. Nothing here packs, snaps, wraps, or reorders
  // — if a page looks wrong, the fix is a widget METRIC or a ForgeFX field, never a rule about this
  // block. That is the whole point of the rework.
  //
  // What the canvas decides, and nothing else:
  //   • which of a device-authored ALTERNATE pair to draw (`deviceAlternates.ts`);
  //   • how to paint each widget family (`widgetView`) and which graph a `graph_*` token wants
  //     (`graphKind`) — both tables live in `deviceWidgets.ts`, next to the sizes;
  //   • how a control binds to a live parameter, by the device-true `paramId` the layout carries.
  import { getEditorSurface } from '$lib/editor/editorSurface';
  import { editor as liveEditor } from '$lib/editor/editor.svelte';
  import { modifierBindings } from '$lib/editor/modifierBindings.svelte';
  import { placeLayout, DEVICE_SCALE, type PlacedControl, type PlacedPage } from './deviceCanvas';
  import { widgetView, graphKind, graphSlotsForPage, dropdownFieldHeight } from './deviceWidgets';
  import { resolveAlternates, isVisible, type AlternateContext } from './deviceAlternates';
  import { fmtControlValue, normFromValue, paramValue } from '$lib/ui/format';
  import { enumKnobLabel, enumKnobNorm, enumKnobValueAt } from '$lib/ui/enumKnob';
  import Knob from '$lib/ui/Knob.svelte';
  import Toggle from '$lib/ui/Toggle.svelte';
  import Dropdown from '$lib/ui/Dropdown.svelte';
  import EQGraph from '$lib/graphs/EQGraph.svelte';
  import ModulationGraph from '$lib/graphs/ModulationGraph.svelte';
  import CompressorGraph from '$lib/graphs/CompressorGraph.svelte';
  import CabAlignmentGraph from '$lib/graphs/CabAlignmentGraph.svelte';
  import AdsrGraph from '$lib/graphs/AdsrGraph.svelte';
  import MegaTapGraph from '$lib/graphs/MegaTapGraph.svelte';
  import CabMicGraphic from '$lib/graphs/CabMicGraphic.svelte';
  import ModifierFlyout from '$lib/editor/ModifierFlyout.svelte';
  import type { EqGraphSpec } from '$lib/graphs/eqGraphs';
  import type { ModulationGraphSpec } from '$lib/graphs/modulationGraphs';
  import type { CompressorGraphSpec } from '$lib/graphs/compressorGraphs';
  import type { CabAlignmentGraphSpec } from '$lib/graphs/cabAlignmentGraphs';
  import type { AdsrGraphSpec } from '$lib/graphs/adsrGraphs';
  import type { MegaTapGraphSpec } from '$lib/graphs/megaTapGraphs';
  import type { CabMicGraphSpec } from '$lib/graphs/cabMicGraphs';
  import type { EnumParam, LayoutControl, LiveMonitor, NamedParam } from '$lib/api/types';
  import { axisBlockEditorModifierController } from '$lib/axis-workbench/blockEditor/blockEditorModifierController';
  import { getOptionalWorkbenchContext } from '$lib/workbench/svelte/context';
  import { buildAxisPinMenuItems } from '$lib/axis-workbench/pinMenu';
  import { AXIS_PIN_SELECTED_PARAMETERS_ACTION } from '$lib/axis-workbench/axisParameterActions';
  import ContextMenu from '$lib/workbench/svelte/ContextMenu.svelte';
  import { menuPositionFromPointer, type WorkbenchMenuItem, type WorkbenchMenuPosition } from '$lib/workbench/svelte/contextMenu';

  const editor = getEditorSurface();
  const wb = getOptionalWorkbenchContext();

  let {
    slug = '',
    accent = '#35c9d6',
    eqGraphs = [] as EqGraphSpec[],
    modulationGraphs = [] as ModulationGraphSpec[],
    compressorGraphs = [] as CompressorGraphSpec[],
    cabAlignmentGraphs = [] as CabAlignmentGraphSpec[],
    adsrGraphs = [] as AdsrGraphSpec[],
    megaTapGraphs = [] as MegaTapGraphSpec[],
    cabMicGraphs = [] as CabMicGraphSpec[],
    pseudoText = (() => null) as (c: LayoutControl) => string | null,
    onPseudoClick = (() => {}) as (c: LayoutControl) => void,
    pseudoOn = (() => false) as (c: LayoutControl) => boolean,
    q = $bindable('')
  }: {
    slug?: string;
    accent?: string;
    eqGraphs?: EqGraphSpec[];
    modulationGraphs?: ModulationGraphSpec[];
    compressorGraphs?: CompressorGraphSpec[];
    cabAlignmentGraphs?: CabAlignmentGraphSpec[];
    adsrGraphs?: AdsrGraphSpec[];
    megaTapGraphs?: MegaTapGraphSpec[];
    cabMicGraphs?: CabMicGraphSpec[];
    /** Text for a control whose paramId is a UI PSEUDO-param — one the editor draws but the block
     *  protocol has no value for (the cab's `CABINET_NAME1` / `CABINET_LABEL1`). The host supplies it
     *  (BlockEditor has the cab snapshot); the canvas stays ignorant of what a cab is. */
    pseudoText?: (c: LayoutControl) => string | null;
    /** Activate a pseudo-param control (the cab Picker button). Same reason: host's business. */
    onPseudoClick?: (c: LayoutControl) => void;
    /** Whether a pseudo-param button reads as active (the cab Mute button). Host's business. */
    pseudoOn?: (c: LayoutControl) => boolean;
    q?: string;
  } = $props();

  // ── pages ──
  const pages = $derived(placeLayout(editor.blockLayout));
  // The device's editor reserves an identity column (~305 device px) to the left of its controls, and
  // `placePage` collapses that column for the CONTENT while splitting out the controls the device
  // authors inside it (the block's page-level identity controls). The block editor fills the column with
  // its page tabs plus those rail controls; the canvas surface then sits to the rail's right with a
  // small gap. Tabs are drawn in RENDERED px (outside the 0.95 scale) so tab type stays full-size.
  const TAB_RAIL_W = (305 * DEVICE_SCALE) / 2 - 8;
  const RAIL_PAD = 13;
  let pageName = $state('');
  const page = $derived<PlacedPage | null>(pages.find((p) => p.name === pageName) ?? pages[0] ?? null);
  const pageIndex = $derived(page ? pages.indexOf(page) : -1);
  $effect(() => {
    // Keep the tab valid across a block change without resetting it on every unrelated re-derive.
    if (pages.length && !pages.some((p) => p.name === pageName)) pageName = pages[0].name;
  });

  // ── live binding ──
  // The join is FAMILY + paramName (the editor symbol), never the wire paramId alone: duplicate pids
  // exist across the catalog, so a pid-only join can bind a control to the wrong param. `paramId` is
  // used only as the WIRE ADDRESS for writes (editor.setParam reads the param's own id off the bound
  // param object). A control whose paramName has no live entry (a catalog gap) stays display-only.
  const bySymbol = $derived.by(() => {
    const m = new Map<string, NamedParam | EnumParam>();
    for (const p of editor.params) if (p.paramName) m.set(p.paramName, p);
    for (const e of editor.enums) if (e.paramName) m.set(e.paramName, e);
    return m;
  });
  const paramFor = (c: LayoutControl): NamedParam | EnumParam | undefined =>
    c.paramName ? bySymbol.get(c.paramName) : undefined;
  const named = (c: LayoutControl): NamedParam | undefined => {
    const p = paramFor(c);
    return p && !('options' in p) ? p : undefined;
  };
  const enm = (c: LayoutControl): EnumParam | undefined => {
    const p = paramFor(c);
    return p && 'options' in p ? p : undefined;
  };

  // The modulation-graph "Type" picker (LFO shape) is authored in device order; sort it alphabetically
  // so a long shape list stays scannable. Every other enum keeps its authored order.
  const LFO_TYPE_PARAM = /_LFO\d*TYPE$/;
  const dropdownOptions = (c: LayoutControl, e: EnumParam): EnumParam['options'] =>
    LFO_TYPE_PARAM.test(c.paramName ?? '')
      ? [...e.options].sort((a, b) => a.label.localeCompare(b.label))
      : e.options;

  const altContext = $derived<AlternateContext>({
    valueOf: (sym) => {
      const p = bySymbol.get(sym);
      return p == null ? undefined : 'options' in p ? p.value : p.value;
    },
    labelOf: (sym) => {
      const p = bySymbol.get(sym);
      return p && 'options' in p ? p.options.find((o) => o.value === p.value)?.label : undefined;
    }
  });
  const alternates = $derived(page ? resolveAlternates([...page.controls, ...page.rail], altContext) : new Map<string, number>());
  const drawn = $derived(page ? page.controls.filter((c) => isVisible(c, alternates)) : []);
  const drawnRail = $derived(page ? page.rail.filter((c) => isVisible(c, alternates)) : []);

  // ── mixer strip ──
  // The right-hand `section: 'mixer'` controls (the block's master Level/Balance/Bypass strip) are nudged
  // 2 rendered px left of their authored position and separated from the parameter grid by a 1px divider,
  // so the strip reads as its own column. Only drawn when there are parameter controls to its left.
  const mixerShift = (pc: PlacedControl) => (pc.section === 'mixer' ? 2 : 0);
  const mixerRule = $derived.by(() => {
    const ms = drawn.filter((pc) => pc.section === 'mixer');
    if (!ms.length || !drawn.some((pc) => pc.section !== 'mixer')) return null;
    const left = Math.min(...ms.map((c) => c.x));
    const top = Math.min(...ms.map((c) => c.y));
    const bottom = Math.max(...ms.map((c) => c.y + c.h));
    return { left: left - 14, top, height: Math.max(0, bottom - top) };
  });

  // ── graph binding ──
  // A graph's spec is keyed by (page index, slot) — the same coordinates the derive modules assign, via
  // the same `graphSlotsForPage` they call, so the two can never disagree about which graph is which.
  // The slot is the device's own `render.graphIndex` where it authors one, falling back to the layout
  // ordinal. Computed from the ORIGINAL layout order because `placePage` sorts its output by position,
  // and keyed off the control object itself so the two orders never have to agree.
  const graphSlotOf = $derived.by(() => {
    const m = new WeakMap<LayoutControl, number>();
    for (const p of editor.blockLayout?.pages ?? []) {
      const controls = (p.rows ?? []).flatMap((row) => row.controls ?? []);
      for (const [c, slot] of graphSlotsForPage(controls)) m.set(c, slot);
    }
    return m;
  });
  const eqGraphOn = $derived((pi: number) => eqGraphs.find((g) => g.pages.includes(pi)) ?? null);
  /** The DynaCab cone is anchored by the device on its own slot's `CABINET_DYNACAB_R{n}`, so the slot
   *  number comes off the control rather than from an ordinal. */
  const cabMicOn = $derived((c: LayoutControl) => {
    const n = Number(/(\d+)$/.exec(c.paramName ?? '')?.[1]);
    return Number.isFinite(n) ? (cabMicGraphs.find((g) => g.slot === n) ?? null) : null;
  });
  const slotted = <T extends { page: number; slot: number }>(list: T[], pi: number, slot: number) =>
    list.find((g) => g.page === pi && g.slot === slot) ?? null;

  // ── monitors (read-only meters) ──
  const mons = $derived(editor.monitorsFor(editor.selected?.effectId ?? -1));
  const blockMons = $derived(editor.openBlockMonitors);
  const liveMonitor = (c: LayoutControl): LiveMonitor | null => {
    const token = c.paramId != null ? blockMons.get(c.paramId)?.token : undefined;
    return mons.find((m) => m.paramName === (token ?? c.paramName)) ?? null;
  };
  const monFill = (m: LiveMonitor | null) => Math.max(0, Math.min(1, m?.norm ?? 0));
  /** Meter dB readout, mapped through the LAYOUT's own `min_dB`/`max_dB` (render.minDb/maxDb) when
   *  supplied — the device-authored meter scale, not a monitor-table default. */
  const monText = (c: LayoutControl, m: LiveMonitor | null) => {
    const min = c.render?.minDb, max = c.render?.maxDb;
    if (m?.norm != null && min != null && max != null) {
      const db = min + m.norm * (max - min);
      return `${db >= 0 ? '+' : ''}${db.toFixed(1)}`;
    }
    return m?.db != null ? `${m.db >= 0 ? '+' : ''}${m.db.toFixed(1)}` : m ? `${Math.round(m.norm * 100)}%` : '—';
  };
  /** A param the device also reports as a MONITOR is a reading, not a control — it must never render
   *  as a draggable knob (a drag would WRITE to it). */
  const isMonitor = (c: LayoutControl) => c.paramId != null && blockMons.has(c.paramId);

  // ── how to draw one control ──
  // A view is chosen only after the binding is known: an unbound or `unusable` param the device draws
  // as an input is display-only — the pseudo-params (cab name, slot label) and any `unusable` param
  // land here rather than as a control that writes nowhere.
  type View = ReturnType<typeof widgetView>;
  function viewOf(pc: PlacedControl): View {
    const c = pc.control;
    if (isMonitor(c)) return 'meter';
    const v = widgetView(c.rawWidget, c.widget);
    const p = paramFor(c);
    const unusable = p != null && 'unusable' in p && p.unusable != null;
    if ((v === 'knob' || v === 'fader') && (!p || unusable)) return 'label';
    if ((v === 'dropdown' || v === 'toggle') && (!p || unusable || !('options' in p))) return v === 'dropdown' ? 'readout' : 'label';
    return v;
  }

  // ── modifier badges ──
  // A control has a modifier attached when a modifier slot's source points at its (effectId, paramId).
  const modded = (c: LayoutControl) =>
    c.paramId != null && modifierBindings.has(editor.selected?.effectId, c.paramId);
  const modVisualization = (c: LayoutControl) =>
    c.paramId == null ? null : modifierBindings.visualization(editor.selected?.effectId, c.paramId);

  // ── value plumbing ──
  const valText = (p: NamedParam | undefined) => (p ? fmtControlValue(p) : '–');
  const setNorm = (p: NamedParam, n: number) => editor.setParam(p, Math.max(0, Math.min(1, n)));
  function setEnumNorm(e: EnumParam, norm: number) {
    const value = enumKnobValueAt(e, norm);
    if (value != null && value !== e.value) editor.setEnum(e, value);
  }
  // ── tap-to-type (knob) ──
  // A clean tap turns the value into a small text input. The typed value is a plain number in the device's display
  // units (e.g. 63 for %, 440 for Hz); `normFromValue` maps it back through the taper and clamps.
  let editing = $state<NamedParam | null>(null);
  let editText = $state('');
  const plainValue = (p: NamedParam) => {
    const v = p.min != null && p.max != null ? paramValue(p) : (p.value ?? 0);
    return Number.isFinite(v) ? parseFloat(v.toFixed(3)).toString() : '';
  };
  function beginEdit(p: NamedParam) {
    editing = p;
    editText = plainValue(p);
  }
  function commitEdit() {
    const p = editing;
    if (!p) return;
    const v = parseFloat(editText);
    if (Number.isFinite(v)) setNorm(p, normFromValue(v, p));
    editing = null;
  }
  function cancelEdit() {
    editing = null;
  }
  function focusAndSelect(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
  $effect(() => {
    void editor.selected?.effectId;
    void pageIndex;
    editing = null;
  });
  function wheel(e: WheelEvent, p: NamedParam | undefined, en: EnumParam | undefined) {
    if (!p && !en) return;
    e.preventDefault();
    const dy = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    if (dy === 0) return;
    if (en) {
      bumpEnum(en, dy < 0 ? -1 : 1);
      return;
    }
    const step = e.shiftKey ? 0.002 : 0.02;
    setNorm(p!, (p!.norm ?? 0) + (dy < 0 ? -step : step));
  }
  function bumpEnum(e: EnumParam, dir: number) {
    const i = e.options.findIndex((o) => o.value === e.value);
    const next = e.options[Math.max(0, Math.min(e.options.length - 1, (i < 0 ? 0 : i) + dir))];
    if (next) editor.setEnum(e, next.value);
  }

  // ── hover help (shown in the app's status bar, as the grid board did) ──
  // The param's curated help is ALREADY folded onto the served param by paramName (ForgeFX Phase 1.5) —
  // no second /help fetch here.
  function showHelp(c: LayoutControl) {
    const label = c.label || c.rawWidget;
    const p = paramFor(c);
    const h = p && 'help' in p ? p.help : undefined;
    editor.setHint(h ? `${label} — ${h.blurb}${h.tip ? '  ·  Tip: ' + h.tip : ''}` : label);
  }
  const clearHelp = () => editor.clearHint();

  // ── modifier flyout (launched from a control's context menu) ──
  let modOpen = $state(false);
  let modLabel = $state('');
  let modTargetEid = $state<number | null>(null);
  let modTargetParam = $state<number | null>(null);
  function openMod(c: LayoutControl) {
    if (c.paramId == null) return;
    const targetEid = editor.selected?.effectId ?? null;
    if (axisBlockEditorModifierController.modPartMounted) {
      axisBlockEditorModifierController.targetParameter({
        label: c.label,
        block: editor.selected?.display ?? 'Block',
        targetEffectId: targetEid,
        targetParam: c.paramId
      });
      editor.showToast(`∿ ${c.label} → Modifier panel`, '#f5a623');
      return;
    }
    modLabel = c.label;
    modTargetParam = c.paramId;
    modTargetEid = targetEid;
    modOpen = true;
  }

  // ── control context menu (right-click) ──
  // Replaces the inline ∿ badge: pinning and modifier launch both live here. Pinning routes through
  // the workbench's single pin action (My Controls); the modifier item reuses `openMod` (docked panel
  // when one is mounted, the in-editor flyout otherwise). Outside the workbench (monolith shell) only
  // the modifier item is offered.
  let menuPos = $state<WorkbenchMenuPosition>({ x: 0, y: 0 });
  let menuTarget = $state<PlacedControl | null>(null);

  function openMenu(pc: PlacedControl, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    menuTarget = pc;
    menuPos = menuPositionFromPointer(e);
  }

  function pinControl(c: LayoutControl, sectionId: string | null) {
    if (!wb) return;
    const paramId = paramFor(c)?.id ?? c.paramId;
    if (paramId == null) return;
    wb.registry.runAction(AXIS_PIN_SELECTED_PARAMETERS_ACTION, {
      controller: wb.controller,
      source: 'menu',
      args: sectionId ? { paramId, sectionId } : { paramId }
    });
  }

  const menuItems = $derived.by<WorkbenchMenuItem[]>(() => {
    const pc = menuTarget;
    if (!pc) return [];
    const c = pc.control;
    const items: WorkbenchMenuItem[] = [];
    const pinId = paramFor(c)?.id ?? c.paramId;
    if (wb && pinId != null) {
      items.push(...buildAxisPinMenuItems(wb.controller.document, (sectionId) => pinControl(c, sectionId)));
    }
    const view = viewOf(pc);
    const p = named(c);
    if ((view === 'knob' || view === 'fader') && p && c.paramId != null) {
      items.push({ id: 'modifier', label: 'Edit Modifier', separatorBefore: items.length > 0, run: () => openMod(c) });
    }
    return items;
  });

  // ── search ──
  // Search HIGHLIGHTS on the canvas instead of collecting matches into a list. Re-flowing the results
  // would be the discarded premise creeping back in; the device's arrangement is the point, so the
  // answer to "where is Feedback?" has to be shown in place.
  /** Rendered px → device px. See the `.surface` comment in the markup. */
  const dp = (n: number) => n / DEVICE_SCALE;

  const query = $derived(q.trim().toLowerCase());
  // Static text (section headings, `labelBold`, cab-name captions) is decoration, not a control — it
  // must never count as a "Find a control" result or light up as a hit.
  const isStaticLabel = (c: LayoutControl) => widgetView(c.rawWidget, c.widget) === 'label';
  const matches = (c: LayoutControl) => !query || (!isStaticLabel(c) && (c.label ?? '').toLowerCase().includes(query));
  // A match on an off-screen page must still be findable: when the query names a control the current
  // page doesn't draw, jump to the first page (in tab order) that does. The in-place highlight then
  // answers "where is X" exactly where X lives, without resurrecting the discarded results list.
  const matchesPage = (p: PlacedPage) => [...p.controls, ...p.rail].some((pc) => matches(pc.control));
  const pageMatches = (p: PlacedPage) => (query ? [...p.controls, ...p.rail].filter((pc) => matches(pc.control)).length : 0);
  const searchPage = $derived.by(() => (query ? (pages.find(matchesPage) ?? null) : null));
  $effect(() => {
    if (!searchPage) return;
    if (page && !matchesPage(page)) pageName = searchPage.name;
  });

  // Re-enumerate active modifiers whenever the block, the preset or the device's binding capability
  // changes — the badge set is device-global and cached, so this only costs one read per change.
  $effect(() => {
    void editor.selected?.effectId;
    void liveEditor.preset?.number;
    void liveEditor.caps?.modifiers?.bind;
    modifierBindings.refresh();
  });
</script>

{#snippet cell(pc: PlacedControl)}
  {@const c = pc.control}
  {@const view = viewOf(pc)}
  {@const p = named(c)}
  {@const e = enm(c)}
  {@const hasMod = modded(c)}
  {@const visualization = modVisualization(c)}
  <div
    class="cell v-{view}"
    class:dim={query.length > 0 && !matches(c)}
    class:hit={query.length > 0 && matches(c)}
    class:modded={hasMod}
    style:left="{dp(pc.x - mixerShift(pc))}px"
    style:top="{dp(pc.y)}px"
    style:width="{dp(pc.w)}px"
    style:height="{dp(pc.h)}px"
    onmouseenter={() => showHelp(c)}
    onmouseleave={clearHelp}
    onwheel={(ev) => (view === 'knob' || view === 'fader' ? wheel(ev, p, e) : undefined)}
    oncontextmenu={(ev) => openMenu(pc, ev)}
    role="presentation"
  >
    {#if view === 'knob' && (p || e)}
      <!-- -46, not -30: the knob now carries a readout chip ABOVE the dial (a value like
           "12000.0 Hz" never fitted on the dial face) plus the caption below. Some of that is
           reclaimed from the old MOD pill, which used to overhang the column by 4px and now sits
           inside the dial. -->
      {@const knobSize = Math.max(20, Math.min(dp(pc.w) - 8, dp(pc.h) - 46))}
      {#if p && editing === p}
        <div class="knob-edit" style="width:{knobSize + 8}px">
          {#if hasMod}<button class="mod-pill" type="button" aria-label="Edit modifier for {c.label}" onclick={() => openMod(c)}>MOD</button>{/if}
          <div class="knob-edit-box" style="height:{knobSize}px">
            <input
              class="vinput"
              use:focusAndSelect
              value={editText}
              oninput={(e) => (editText = e.currentTarget.value)}
              onkeydown={(e) => {
                if (e.key === 'Enter') commitEdit();
                else if (e.key === 'Escape') cancelEdit();
              }}
              onblur={commitEdit}
              aria-label="{c.label} value"
            />
          </div>
          <div class="vinput-lbl">{c.label}</div>
        </div>
      {:else}
        <Knob
          value={p ? (p.norm ?? 0) : enumKnobNorm(e!)}
          label={c.label}
          valueText={p ? valText(p) : enumKnobLabel(e!)}
          color={accent}
          size={knobSize}
          modded={hasMod}
          visualization={p ? visualization : null}
          bpm={liveEditor.bpm}
          formatValue={p ? (norm) => fmtControlValue({ ...p, norm }, 1) : null}
          onModifier={() => openMod(c)}
          freeMotion={!!e}
          onInput={(v) => p ? setNorm(p, v) : setEnumNorm(e!, v)}
          onEdit={() => { if (p) beginEdit(p); }}
        />
      {/if}
      {:else if view === 'fader' && p}
        <div class="fader">
          {#if hasMod}<button class="mod-pill" type="button" aria-label="Edit modifier for {c.label}" onclick={() => openMod(c)}>MOD</button>{/if}
          <div class="fv mono">{valText(p)}</div>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="ftrack"
            onpointerdown={(ev) => {
              const el = ev.currentTarget as HTMLElement;
              el.setPointerCapture(ev.pointerId);
              const set = (y: number) => {
                const r = el.getBoundingClientRect();
                setNorm(p, 1 - (y - r.top) / r.height);
              };
              set(ev.clientY);
              el.onpointermove = (m) => m.buttons && set(m.clientY);
              el.onpointerup = () => { el.onpointermove = null; el.onpointerup = null; };
            }}
          >
            <div class="ffill" style:height="{(p.norm ?? 0) * 100}%"></div>
            <div class="fhandle" style:bottom="calc({(p.norm ?? 0) * 100}% - 5px)"></div>
          </div>
          <div class="fl">{c.label}</div>
        </div>
    {:else if view === 'dropdown' && e}
      <Dropdown
        label={c.label}
        value={e.value}
        options={dropdownOptions(c, e)}
        {accent}
        fixedWidth={dp(pc.w)}
        fieldHeight={dropdownFieldHeight(dp(pc.h))}
        hideLabel={dp(pc.h) < 40}
        onChange={(v) => editor.setEnum(e, v)}
      />
    {:else if view === 'toggle' && e}
      <Toggle dense label={c.label} value={e.value} options={e.options} onChange={(v) => editor.setEnum(e, v)} />
    {:else if view === 'button'}
      {#if c.rawWidget === 'btnBypass'}
        <button class="btn act" class:on={!editor.selected?.bypassed} class:byp={editor.selected?.bypassed} onclick={() => editor.toggleBypass()}>
          {editor.selected?.bypassed ? 'Bypassed' : 'Engaged'}
        </button>
      {:else if e && e.options.length > 0}
        <button class="btn" class:on={e.value === (e.options[1]?.value ?? 1)} title={c.label} onclick={() => bumpEnum(e, e.value === (e.options[1]?.value ?? 1) ? -1 : 1)}>
          {c.label}
        </button>
      {:else}
        <button class="btn" class:on={pseudoOn(c)} title={c.label} onclick={() => onPseudoClick(c)}>{c.label}</button>
      {/if}
    {:else if view === 'meter'}
      {@const m = liveMonitor(c)}
      {@const fill = monFill(m)}
      <div class="meter" class:horz={pc.w > pc.h} title="{c.label} (read-only)">
        <div class="mlbl">{c.label}</div>
        <div class="mtrack">
          <div
            class="mfill"
            style:--f="{fill * 100}%"
            style:background={fill >= 0.92 ? '#d6543f' : fill >= 0.75 ? '#f5a623' : accent}
          ></div>
        </div>
        <div class="mval mono">{monText(c, m)}</div>
      </div>
    {:else if view === 'graph'}
      {@const kind = graphKind(c.rawWidget)}
      {@const slot = graphSlotOf.get(c) ?? 0}
      <div class="graph">
        {#if kind === 'freq'}
          {@const g = eqGraphOn(pageIndex)}
          {#if g}<EQGraph bands={g.bands} gainRange={g.gainRange} {accent} onSet={(pp, n) => editor.setParam(pp, n)} />{/if}
        {:else if kind === 'mod'}
          {@const g = slotted(modulationGraphs, pageIndex, slot)}
          {#if g}<ModulationGraph graph={g} {accent} bpm={editor.bpm} />{/if}
        {:else if kind === 'comp'}
          {@const g = slotted(compressorGraphs, pageIndex, slot)}
          {#if g}<CompressorGraph graph={g} {accent} live={mons.find((m) => m.role === 'gainReduction') ?? null} />{/if}
        {:else if kind === 'cabAlign'}
          {@const g = slotted(cabAlignmentGraphs, pageIndex, slot)}
          {#if g}<CabAlignmentGraph graph={g} {accent} />{/if}
        {:else if kind === 'adsr'}
          {@const g = slotted(adsrGraphs, pageIndex, slot)}
          {#if g}<AdsrGraph graph={g} {accent} />{/if}
        {:else if kind === 'megatap'}
          {@const g = slotted(megaTapGraphs, pageIndex, slot)}
          {#if g}<MegaTapGraph graph={g} {accent} />{/if}
        {/if}
      </div>
    {:else if view === 'dynacab'}
      {@const g = cabMicOn(c)}
      <div class="graph">
        {#if g}<CabMicGraphic graph={g} {accent} onSet={(pp, n) => editor.setParam(pp, n)} />{/if}
      </div>
    {:else if view === 'separator'}
      <div class="rule"></div>
    {:else if view === 'ticks'}
      <div class="ticks"></div>
    {:else if view === 'readout'}
      <div class="readout mono" title={c.label}>
        {pseudoText(c) ?? (e ? (e.options.find((o) => o.value === e.value)?.label ?? String(e.value)) : valText(p))}
      </div>
    {:else if view === 'spacer'}
      <span></span>
    {:else}
      <!-- label: the device's own control-group headings and static text -->
      <div class="lbl" class:heading={c.rawWidget === 'sectionLabel'} class:bold={c.rawWidget === 'labelBold'} title={c.label}>
        {pseudoText(c) ?? c.label}
      </div>
    {/if}
  </div>
{/snippet}

{#if !page}
  <div class="empty">No device layout for this block.</div>
{:else}
  <!-- Fixed width. The pane scrolls; the canvas never reflows to it. -->
  <div class="scroller scroll">
    {#if query && !searchPage}
      <div class="nores">No controls match “{q}”.</div>
    {/if}
    <!-- The placer speaks RENDERED px (device px x DEVICE_SCALE). The canvas draws at DEVICE px under
         one scale transform instead of consuming those numbers directly, so type, borders and knob
         dials scale with the boxes — laying out at 2x with 11px labels would draw device-sized
         controls around half-sized text. `.canvas` reserves the rendered footprint for the scroller;
         `.surface` is the device's own 1240px canvas, magnified. -->
    <div class="canvas" style:width="{TAB_RAIL_W + RAIL_PAD + page.width}px" style:height="{page.height}px" style:--c={accent}>
      <!-- Page tabs live in the device's own identity column (the ~305px strip `placePage` collapses)
           as a vertical rail; the canvas surface sits to its right with a small gap. -->
      <nav class="tabs" style:width="{TAB_RAIL_W}px">
        {#each pages as p (p.name)}
          <button class="tab" class:on={p.name === page?.name} onclick={() => (pageName = p.name)}>
            <span class="tname">{p.name}</span>
            {#if pageMatches(p) > 0}<span class="mcount">{pageMatches(p)}</span>{/if}
          </button>
        {/each}
      </nav>
      {#if drawnRail.length}
        <div class="rail-surface" style:width="{dp(TAB_RAIL_W)}px" style:height="{dp(page.height)}px" style:--c={accent} style:transform="scale({DEVICE_SCALE})">
          {#each drawnRail as pc (pc.control.rawWidget + pc.alternateKey + pc.alternateIndex)}
            {@render cell(pc)}
          {/each}
        </div>
      {/if}
      <div class="surface" style:width="{dp(page.width)}px" style:height="{dp(page.height)}px" style:left="{TAB_RAIL_W + RAIL_PAD}px" style:--c={accent} style:transform="scale({DEVICE_SCALE})">
      {#if mixerRule}
        <div class="mixer-rule" style:left="{dp(mixerRule.left)}px" style:top="{dp(mixerRule.top)}px" style:height="{dp(mixerRule.height)}px"></div>
      {/if}
      {#each drawn as pc (pc.control.rawWidget + pc.alternateKey + pc.alternateIndex)}
        {@render cell(pc)}
        {/each}
      </div>
    </div>
  </div>
{/if}

<ModifierFlyout open={modOpen} label={modLabel} targetEffectId={modTargetEid} targetParam={modTargetParam} onClose={() => (modOpen = false)} />

<div class="bctx">
  <ContextMenu open={menuTarget != null && menuItems.length > 0} position={menuPos} items={menuItems} label="Control actions" onClose={() => (menuTarget = null)} />
</div>

<style>
  /* Vertical page-tab rail, absolutely placed in the empty identity column the device's canvas leaves
     to the left of its controls. It spans the canvas height and sits on top of the (unscaled) rendered
     space, so tab type is full-size and never scales with the device drawing. */
  .tabs {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 10px;
    overflow-y: auto;
  }
  .tab {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--textdim);
    font-size: 12px;
    font-weight: 700;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
  }
  .tname {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mcount {
    flex: none;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--c, var(--accent));
    color: #06181a;
    font-size: 10px;
    font-weight: 800;
    line-height: 16px;
    text-align: center;
  }
  .tab.on { color: var(--text); background: var(--surface2); }
  .empty { padding: 24px; color: var(--textdim); font-size: 13px; }

  /* The fixed canvas. Horizontal scroll on a narrow screen is the accepted cost of drawing the
     device's own 1240px canvas at 1:1 — it never reflows to the pane. */
  .scroller { flex: 1; overflow: auto; min-height: 0; }
  .nores {
    position: sticky;
    top: 10px;
    z-index: 2;
    width: max-content;
    margin: 10px;
    padding: 10px 14px;
    border-radius: 10px;
    background: var(--surface2);
    color: var(--textdim);
    font-size: 13px;
  }
  .canvas { position: relative; }
  .surface { position: absolute; top: 0; left: 0; transform-origin: top left; }
  /* The identity column's controls, scaled exactly like the surface but living in the tab rail's strip.
     Sits under the tabs (z-index 0 vs the tabs' 1) so page tabs stay on top. */
  .rail-surface { position: absolute; top: 0; left: 0; transform-origin: top left; }
  .mixer-rule { position: absolute; width: 1px; background: var(--border2); }
  .cell { position: absolute; overflow: hidden; display: flex; align-items: center; justify-content: center; }
  .cell.dim { opacity: 0.22; }
  .cell.hit { outline: 1px solid var(--c); outline-offset: 1px; border-radius: 4px; }
  .cell.modded { overflow: visible; }
  .vinput {
    width: calc(100% - 6px);
    min-width: 0;
    padding: 2px 6px;
    border: 1px solid var(--c);
    border-radius: 6px;
    background: var(--surface2);
    color: var(--text);
    font: 700 12px/1 var(--font-mono);
    text-align: center;
    outline: none;
  }
  .knob-edit {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .knob-edit-box {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
  }
  .vinput-lbl {
    font-size: 12px;
    font-weight: 600;
    color: var(--textdim);
    text-align: center;
    max-width: 76px;
    line-height: 1.1;
    white-space: pre-line;
    height: 1.1em;
  }
  .mod-pill {
    position: absolute;
    top: -4px;
    right: 0;
    z-index: 1;
    flex: none;
    padding: 1px 5px;
    border: 1px solid var(--amber-border);
    border-radius: 4px;
    background: var(--amber-tint);
    color: var(--amber);
    font: 600 8px/1.2 var(--font-mono);
    letter-spacing: 0.04em;
    white-space: nowrap;
    cursor: pointer;
    box-shadow: 0 2px 5px color-mix(in srgb, var(--bg) 65%, transparent);
  }

  /* Bridges the workbench ContextMenu's `--aw-*` tokens onto the app tokens so the menu stays styled
     in the monolith shell too (inside the workbench, `.aw-root` already defines these identically). */
  .bctx {
    display: contents;
    --aw-surface: var(--surface);
    --aw-surface-2: var(--surface2);
    --aw-border: var(--border);
    --aw-border-2: var(--border2);
    --aw-text: var(--text);
    --aw-text-2: var(--text2);
    --aw-text-faint: var(--textfaint);
    --aw-accent: var(--accent);
    --aw-danger: var(--danger);
    --aw-font-ui: var(--font-ui);
    --aw-font-mono: var(--font-mono);
  }

  .fader { position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px; height: 100%; width: 100%; }  .fv { font: 700 9px/1 var(--font-mono); color: var(--textfaint); }
  .ftrack {
    position: relative; flex: 1; width: 8px; border-radius: 4px;
    background: var(--track); cursor: pointer; touch-action: none;
  }
  .ffill { position: absolute; bottom: 0; left: 0; right: 0; border-radius: 4px; background: var(--c); }
  .fhandle {
    position: absolute; left: 50%; transform: translateX(-50%);
    width: 18px; height: 10px; border-radius: 3px;
    background: var(--c); border: 2px solid var(--bg2);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  }
  .fl { font-size: 11px; font-weight: 600; color: var(--textdim); white-space: nowrap; cursor: pointer; }

  .btn {
    width: 100%; height: 100%; padding: 0 4px; border: 1px solid var(--border2); border-radius: 6px;
    background: var(--bg2); color: var(--text2); font-size: 10px; font-weight: 700; cursor: pointer;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .btn.on { background: var(--ok-tint); border-color: var(--ok-border); color: var(--ok); }
  .btn.act.byp { background: var(--danger-tint); border-color: var(--danger-border); color: var(--danger); }

  .meter { display: flex; flex-direction: column; align-items: center; gap: 2px; width: 100%; height: 100%; }
  .meter .mtrack { position: relative; flex: 1; width: 10px; border-radius: 3px; background: var(--track); overflow: hidden; }
  .meter .mfill { position: absolute; left: 0; right: 0; bottom: 0; height: var(--f); }
  .meter.horz { flex-direction: row; align-items: center; }
  .meter.horz .mtrack { height: 8px; width: auto; align-self: center; }
  .meter.horz .mfill { top: 0; right: auto; height: auto; width: var(--f); }
  .mlbl { font-size: 11px; font-weight: 700; color: var(--textdim); white-space: nowrap; line-height: 1; }
  .meter.horz .mlbl { max-width: 45%; overflow: hidden; text-overflow: ellipsis; }
  .mval { font: 700 9px/1 var(--font-mono); color: var(--textfaint); }

  .graph { width: 100%; height: 100%; overflow: hidden; }
  .rule { width: 1px; height: 100%; background: var(--border2); }
  .ticks { width: 100%; height: 100%; background: repeating-linear-gradient(to bottom, var(--border2) 0 1px, transparent 1px 12px); opacity: 0.5; }
  .readout {
    width: 100%; text-align: center; font: 700 11px/1.2 var(--font-mono); color: var(--text2);
    overflow: hidden; text-overflow: ellipsis; white-space: pre-line;
  }
  .lbl {
    width: 100%; text-align: center; font-size: 11px; color: var(--textdim); line-height: 1.15;
    overflow: hidden; text-overflow: ellipsis; white-space: pre-line;
  }
  .lbl.heading {
    display: flex;
    align-items: center;
    gap: 8px;
    text-align: left;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text2);
    font-size: 10px;
    white-space: nowrap;
  }
  .lbl.heading::after {
    content: '';
    flex: 1;
    min-width: 10px;
    height: 1px;
    background: var(--border);
  }
  .lbl.bold { font-weight: 800; color: var(--text); }
</style>
