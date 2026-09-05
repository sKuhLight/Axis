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
  import { getEditorSurface } from './editorSurface';
  import { placeLayout, DEVICE_SCALE, type PlacedControl, type PlacedPage } from './deviceCanvas';
  import { widgetView, graphKind, dropdownFieldHeight } from './deviceWidgets';
  import { resolveAlternates, isVisible, type AlternateContext } from './deviceAlternates';
  import { fmtControlValue, normFromValue, paramValue } from './format';
  import Knob from './Knob.svelte';
  import Toggle from './Toggle.svelte';
  import Dropdown from './Dropdown.svelte';
  import EQGraph from './EQGraph.svelte';
  import ModulationGraph from './ModulationGraph.svelte';
  import CompressorGraph from './CompressorGraph.svelte';
  import CabAlignmentGraph from './CabAlignmentGraph.svelte';
  import AdsrGraph from './AdsrGraph.svelte';
  import MegaTapGraph from './MegaTapGraph.svelte';
  import CabMicGraphic from './CabMicGraphic.svelte';
  import ModifierFlyout from './ModifierFlyout.svelte';
  import type { EqGraphSpec } from './eqGraphs';
  import type { ModulationGraphSpec } from './modulationGraphs';
  import type { CompressorGraphSpec } from './compressorGraphs';
  import type { CabAlignmentGraphSpec } from './cabAlignmentGraphs';
  import type { AdsrGraphSpec } from './adsrGraphs';
  import type { MegaTapGraphSpec } from './megaTapGraphs';
  import type { CabMicGraphSpec } from './cabMicGraphs';
  import type { EnumParam, LayoutControl, LiveMonitor, NamedParam } from './types';
  import { axisBlockEditorModifierController } from './axis-workbench/blockEditor/blockEditorModifierController';
  import { getOptionalWorkbenchContext } from './workbench/svelte/context';
  import { buildAxisPinMenuItems } from './axis-workbench/pinMenu';
  import { AXIS_PIN_SELECTED_PARAMETERS_ACTION } from './axis-workbench/axisParameterActions';
  import ContextMenu from './workbench/svelte/ContextMenu.svelte';
  import { menuPositionFromPointer, type WorkbenchMenuItem, type WorkbenchMenuPosition } from './workbench/svelte/contextMenu';

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
    q?: string;
  } = $props();

  // ── pages ──
  const pages = $derived(placeLayout(editor.blockLayout));
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
  const alternates = $derived(page ? resolveAlternates(page.controls, altContext) : new Map<string, number>());
  const drawn = $derived(page ? page.controls.filter((c) => isVisible(c, alternates)) : []);

  // ── graph binding ──
  // A graph's spec is keyed by (page index, graph ordinal on that page) — the same coordinates the
  // derive modules assign, computed from the ORIGINAL layout order because `placePage` sorts its output
  // by position. Keyed off the control object itself so the two orders never have to agree.
  const graphSlotOf = $derived.by(() => {
    const m = new WeakMap<LayoutControl, number>();
    for (const p of editor.blockLayout?.pages ?? []) {
      let slot = 0;
      for (const row of p.rows ?? []) for (const c of row.controls ?? []) if (c.widget === 'graph') m.set(c, slot++);
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

  // ── value plumbing ──
  const valText = (p: NamedParam | undefined) => (p ? fmtControlValue(p) : '–');
  const setNorm = (p: NamedParam, n: number) => editor.setParam(p, Math.max(0, Math.min(1, n)));
  const resetToDefault = (p: NamedParam) => {
    if (p.default == null) return;
    editor.setParam(p, normFromValue(p.default, p));
  };
  function wheel(e: WheelEvent, p: NamedParam | undefined) {
    if (!p) return;
    e.preventDefault();
    const dy = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    if (dy === 0) return;
    const step = e.shiftKey ? 0.002 : 0.02;
    setNorm(p, (p.norm ?? 0) + (dy < 0 ? -step : step));
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
        targetParam: c.paramId,
        slot: 1
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
  const matches = (c: LayoutControl) => !query || (c.label ?? '').toLowerCase().includes(query);
</script>

<div class="tabs">
  {#each pages as p (p.name)}
    <button class="tab" class:on={p.name === page?.name} onclick={() => (pageName = p.name)}>{p.name}</button>
  {/each}
  <span class="sp"></span>
</div>

{#if !page}
  <div class="empty">No device layout for this block.</div>
{:else}
  <!-- Fixed width. The pane scrolls; the canvas never reflows to it. -->
  <div class="scroller scroll">
    <!-- The placer speaks RENDERED px (device px x DEVICE_SCALE). The canvas draws at DEVICE px under
         one scale transform instead of consuming those numbers directly, so type, borders and knob
         dials scale with the boxes — laying out at 2x with 11px labels would draw device-sized
         controls around half-sized text. `.canvas` reserves the rendered footprint for the scroller;
         `.surface` is the device's own 1240px canvas, magnified. -->
    <div class="canvas" style:width="{page.width}px" style:height="{page.height}px">
      <div class="surface" style:width="{dp(page.width)}px" style:height="{dp(page.height)}px" style:--c={accent} style:transform="scale({DEVICE_SCALE})">
      {#each drawn as pc (pc.control.rawWidget + pc.alternateKey + pc.alternateIndex)}
        {@const c = pc.control}
        {@const view = viewOf(pc)}
        {@const p = named(c)}
        {@const e = enm(c)}
        <div
          class="cell {view}"
          class:dim={query.length > 0 && !matches(c)}
          class:hit={query.length > 0 && matches(c)}
          style:left="{dp(pc.x)}px"
          style:top="{dp(pc.y)}px"
          style:width="{dp(pc.w)}px"
          style:height="{dp(pc.h)}px"
          onmouseenter={() => showHelp(c)}
          onmouseleave={clearHelp}
          onwheel={(ev) => (view === 'knob' || view === 'fader' ? wheel(ev, p) : undefined)}
          oncontextmenu={(ev) => openMenu(pc, ev)}
          role="presentation"
        >
          {#if view === 'knob' && p}
            <Knob
              value={p.norm ?? 0}
              label={c.label}
              valueText={valText(p)}
              color={accent}
              size={Math.max(20, Math.min(dp(pc.w) - 8, dp(pc.h) - 30))}
              onInput={(v) => setNorm(p, v)}
              onReset={() => resetToDefault(p)}
            />
          {:else if view === 'fader' && p}
            <div class="fader">
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
              </div>
              <div class="fl">{c.label}</div>
            </div>
          {:else if view === 'dropdown' && e}
            <Dropdown
              label={c.label}
              value={e.value}
              options={e.options}
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
              <button class="btn act" class:on={editor.selected?.bypassed} onclick={() => editor.toggleBypass()}>
                {editor.selected?.bypassed ? 'Bypassed' : 'Engaged'}
              </button>
            {:else if e}
              <button class="btn" class:on={e.value === (e.options[1]?.value ?? 1)} title={c.label} onclick={() => bumpEnum(e, e.value === (e.options[1]?.value ?? 1) ? -1 : 1)}>
                {c.label}
              </button>
            {:else}
              <button class="btn" title={c.label} onclick={() => onPseudoClick(c)}>{c.label}</button>
            {/if}
          {:else if view === 'meter'}
            {@const m = liveMonitor(c)}
            {@const fill = monFill(m)}
            <div class="meter" class:horz={pc.w > pc.h} title="{c.label} (read-only)">
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
                {#if g}<ModulationGraph graph={g} {accent} />{/if}
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
  .tabs {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    flex: none;
  }
  .tab {
    padding: 5px 12px;
    border: 0;
    border-radius: 8px 8px 0 0;
    background: transparent;
    color: var(--textdim);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
  }
  .tab.on { color: var(--text); background: var(--surface2); box-shadow: inset 0 -2px 0 var(--accent); }
  .sp { flex: 1; }
  .empty { padding: 24px; color: var(--textdim); font-size: 13px; }

  /* The fixed canvas. Horizontal scroll on a narrow screen is the accepted cost of drawing the
     device's own 1240px canvas at 1:1 — it never reflows to the pane. */
  .scroller { flex: 1; overflow: auto; min-height: 0; }
  .canvas { position: relative; }
  .surface { position: absolute; top: 0; left: 0; transform-origin: top left; }
  .cell { position: absolute; overflow: hidden; display: flex; align-items: center; justify-content: center; }
  .cell.dim { opacity: 0.22; }
  .cell.hit { outline: 1px solid var(--c); outline-offset: 1px; border-radius: 4px; }

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

  .fader { display: flex; flex-direction: column; align-items: center; gap: 3px; height: 100%; width: 100%; }
  .fv { font: 700 9px/1 var(--font-mono); color: var(--textfaint); }
  .ftrack {
    position: relative; flex: 1; width: 8px; border-radius: 4px;
    background: var(--track); cursor: pointer; touch-action: none;
  }
  .ffill { position: absolute; bottom: 0; left: 0; right: 0; border-radius: 4px; background: var(--c); }
  .fl { font-size: 9px; font-weight: 600; color: var(--textdim); white-space: nowrap; cursor: pointer; }

  .btn {
    width: 100%; height: 100%; padding: 0 4px; border: 1px solid var(--border2); border-radius: 6px;
    background: var(--bg2); color: var(--text2); font-size: 10px; font-weight: 700; cursor: pointer;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .btn.on { background: var(--ok-tint); border-color: var(--ok-border); color: var(--ok); }
  .btn.act.on { background: rgba(214, 84, 63, 0.16); border-color: #d6543f; color: #d6543f; }

  .meter { display: flex; flex-direction: column; align-items: center; gap: 2px; width: 100%; height: 100%; }
  .meter .mtrack { position: relative; flex: 1; width: 10px; border-radius: 3px; background: var(--track); overflow: hidden; }
  .meter .mfill { position: absolute; left: 0; right: 0; bottom: 0; height: var(--f); }
  .meter.horz { flex-direction: row; align-items: center; }
  .meter.horz .mtrack { height: 8px; width: auto; align-self: center; }
  .meter.horz .mfill { top: 0; right: auto; height: auto; width: var(--f); }
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
