<script lang="ts">
  // Shared Modifier editor internals — the single implementation behind both presentations:
  //   variant="flyout" → the right-anchored slide-in over a scrim (old shell; ModifierFlyout wraps this)
  //   variant="dock"   → the pane-filling docked `be-part="modifier"` panel (design §3, 05-block-editor.md)
  //
  // Ported from design/Control Surface (Widget Grid).dc.html (MODIFIER FLYOUT ~line 278). Edits the
  // device's active modifier slot. Curve fields (min/max/start/mid/end/slope/scale/offset) are wired
  // live via forgefx.setParam; source picking binds the slot to the opened control via forgefx.modBind.
  // Channel / PC Reset / Update Rate / Attack / Release / Damping / Auto Engage / Off Value are rendered
  // but only written when the model exposes their pid (flagged "pending decode" otherwise).
  import { forgefx } from './forgefx';
  import { editor } from './editor.svelte';
  import type { ModModel } from './types';

  const mob = $derived(editor.isMobile);

  let {
    variant = 'flyout',
    open = false,
    label = '',
    block = '',
    targetEffectId = null,
    targetParam = null,
    slot = 1,
    model = undefined,
    hasTarget = true,
    onClose
  }: {
    variant?: 'flyout' | 'dock';
    /** Flyout visibility (ignored by the dock variant, which is always "open" while mounted). */
    open?: boolean;
    label?: string;
    /** Owning block name — shown in the dock subtitle ("{BLOCK} · MODIFIER"). */
    block?: string;
    /** The control this editor was opened for: target block eid + paramId (for binding). */
    targetEffectId?: number | null;
    targetParam?: number | null;
    /** Modifier slot to use (1-based). */
    slot?: number;
    /** Pre-fetched address map; if omitted the editor fetches /mod/model on first open. */
    model?: ModModel | null;
    /** Dock variant only: false renders the empty state (no parameter targeted). */
    hasTarget?: boolean;
    onClose?: () => void;
  } = $props();

  const isDock = $derived(variant === 'dock');
  // "Live" when the editor should fetch/read/write: the flyout when open, the dock whenever targeted.
  const active = $derived(isDock ? hasTarget : open);

  // ── enum vocabularies (ordinal lists; channel/damping/etc. labels are conventional) ──
  const CHANNELS = ['All', '1', '2', '3', '4'];
  const UPDATE = ['Fast', 'Medium', 'Slow'];
  const DAMP = ['None', 'Linear', 'Exponential', 'Logarithmic'];
  const ENGAGE = ['Off', 'Fast Pos', 'Slow Pos', 'Auto'];

  // ── address map ──
  let fetched = $state<ModModel | null>(null);
  const mm = $derived(model ?? fetched);
  // the chosen modifier slot's effectId (slot N = base + N-1); curve/field writes + binding go here
  const eid = $derived((mm?.effectId ?? 3) + (Math.max(1, slot) - 1));
  // source list (name → ordinal) from the model, with an explicit None=0 at the top
  const SOURCES = $derived<{ name: string; ordinal: number }[]>([{ name: 'None', ordinal: 0 }, ...(mm?.sources ?? [])]);
  const canBind = $derived(targetEffectId != null && targetParam != null);
  let loading = $state(false);

  $effect(() => {
    if (active && model === undefined && fetched === null && !loading) {
      loading = true;
      forgefx
        .modModel()
        .then((m) => (fetched = m))
        .finally(() => (loading = false));
    }
  });

  // ── local edit state (no read-back yet — sensible defaults from the design's defaultMod) ──
  type Vals = {
    source: number;
    channel: number;
    pcReset: boolean;
    updateRate: number;
    damping: number;
    autoEngage: number;
    min: number;
    max: number;
    attack: number;
    release: number;
    start: number;
    mid: number;
    end: number;
    slope: number;
    scale: number;
    offset: number;
    offValue: number;
  };
  function defaults(): Vals {
    return {
      source: 0,
      channel: 0,
      pcReset: false,
      updateRate: 0,
      damping: 2,
      autoEngage: 1,
      min: 0,
      max: 100,
      attack: 20,
      release: 35,
      start: 0,
      mid: 50,
      end: 100,
      slope: 50,
      scale: 50,
      offset: 50,
      offValue: 0
    };
  }
  let m = $state<Vals>(defaults());
  let sourceOpen = $state(false);
  const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

  // ── read-back: load the modifier slot's live state on open. Norm fields are 0..65534 wire → 0..100
  //    UI; ordinal/ref fields are the raw integer. Re-reads whenever the target (eid/param) changes so
  //    the docked panel re-binds instantly when the editor's ∿ badge points it at a new parameter. ──
  const WIRE_MAX = 65534;
  let loadedKey = $state(''); // guards one load per (target, eid)
  $effect(() => {
    if (!active || !mm) return;
    const key = `${eid}:${targetEffectId}:${targetParam}`;
    if (loadedKey === key) return;
    loadedKey = key;
    forgefx
      .rawBlock(eid)
      .then(({ values }) => {
        const next = defaults();
        for (const [k, f] of Object.entries(mm!.fields)) {
          if (!(k in next)) continue; // skip targetEffectId/targetParam (binding, shown separately)
          const w = values[f.pid];
          if (w == null) continue;
          const rec = next as unknown as Record<string, number | boolean>;
          if (k === 'pcReset') rec[k] = w >= 0.5;
          else if (f.kind === 'ordinal' || f.kind === 'ref') rec[k] = Math.round(w);
          else rec[k] = clamp(Math.round((w / WIRE_MAX) * 100));
        }
        m = next;
      })
      .catch(() => {});
  });
  $effect(() => {
    if (!active) loadedKey = ''; // reset so the next open/target re-reads
  });

  const srcOn = $derived(m.source > 0);

  // ── write any modifier field to the device, encoded by its kind (from the model) ──
  function writeField(key: string, ui: number) {
    const f = mm?.fields?.[key];
    if (!f) return; // model not loaded → keep it local-only
    if (f.kind === 'ordinal' || f.kind === 'ref') forgefx.setParam(eid, f.pid, Math.round(ui), false).catch(() => {});
    else if (f.kind === 'bipolar') forgefx.setParam(eid, f.pid, (clamp(ui) - 50) / 50, false).catch(() => {});
    else forgefx.setParam(eid, f.pid, clamp(ui) / 100, true).catch(() => {});
  }

  // ── knob drag (vertical), mirrors the design's onModKnobDown ──
  let drag: { key: keyof Vals; sy: number; sv: number } | null = null;
  function knobDown(e: PointerEvent, key: keyof Vals) {
    e.stopPropagation();
    drag = { key, sy: e.clientY, sv: m[key] as number };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function knobMove(e: PointerEvent) {
    if (!drag) return;
    const dy = drag.sy - e.clientY; // up = increase
    const nv = clamp(drag.sv + dy * 0.6);
    m = { ...m, [drag.key]: nv };
    writeField(drag.key as string, nv);
  }
  function knobUp(e: PointerEvent) {
    if (!drag) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    drag = null;
  }

  // ── knob formatting (ported from the design's modKnobFmt) ──
  function knobFmt(key: keyof Vals, v: number): string {
    if (key === 'attack' || key === 'release') return Math.round(v * 5) + ' ms';
    if (key === 'slope') return ((v - 50) / 12.5).toFixed(1);
    if (key === 'offset') {
      const n = Math.round(v - 50);
      return (n > 0 ? '+' : '') + n;
    }
    return Math.round(v) + '%';
  }
  const TRACK = 113.1;
  const dashFor = (v: number) => `${((v / 100) * TRACK).toFixed(1)} 300`;
  const rotFor = (v: number) => `rotate(${(-135 + 2.7 * v).toFixed(1)} 32 32)`;

  type KnobSpec = { key: keyof Vals; label: string; live: boolean };
  const rangeKnobs: KnobSpec[] = [
    { key: 'min', label: 'Min', live: true },
    { key: 'max', label: 'Max', live: true }
  ];
  const dampKnobs: KnobSpec[] = [
    { key: 'attack', label: 'Attack', live: true },
    { key: 'release', label: 'Release', live: true }
  ];
  const mapKnobs: KnobSpec[] = [
    { key: 'start', label: 'Start', live: true },
    { key: 'mid', label: 'Mid', live: true },
    { key: 'end', label: 'End', live: true },
    { key: 'slope', label: 'Slope', live: true },
    { key: 'scale', label: 'Scale', live: true },
    { key: 'offset', label: 'Offset', live: true }
  ];
  const engageKnobs: KnobSpec[] = [{ key: 'offValue', label: 'Off Value', live: true }];

  function cycleEnum(key: keyof Vals, optCount: number) {
    const cur = Number(m[key]) || 0;
    const next = (cur + 1) % optCount;
    m = { ...m, [key]: next };
    writeField(key as string, next);
  }
  function setBoolEnum(key: keyof Vals) {
    const next = !m[key];
    m = { ...m, [key]: next };
    writeField(key as string, next ? 1 : 0);
  }

  // ── response curve path (ported from the design's modCurve) ──
  const curve = $derived.by(() => {
    const s = m.start / 100,
      mid = m.mid / 100,
      e = m.end / 100,
      scaleF = m.scale / 50,
      off = (m.offset - 50) / 50,
      slope = (m.slope - 50) / 50;
    let cur = '',
      fill = 'M0 100';
    for (let i = 0; i <= 50; i++) {
      const x = i / 50;
      const base = x < 0.5 ? s + (mid - s) * (x * 2) : mid + (e - mid) * ((x - 0.5) * 2);
      let y = (base - 0.5) * scaleF + 0.5 + off * 0.4 + slope * (x - 0.5) * 0.6;
      y = Math.max(0, Math.min(1, y));
      const px = (x * 100).toFixed(1),
        py = ((1 - y) * 100).toFixed(1);
      cur += (i ? ' L' : 'M') + px + ' ' + py;
      fill += ' L' + px + ' ' + py;
    }
    fill += ' L100 100 Z';
    return { cur, fill };
  });

  // Picking a source binds this modifier slot to the control it was opened for.
  let binding = $state(false);
  let bindMsg = $state('');
  function pickSource(ordinal: number) {
    m = { ...m, source: ordinal };
    sourceOpen = false;
    if (canBind) {
      binding = true;
      bindMsg = '';
      forgefx
        .modBind(slot, targetEffectId!, targetParam!, ordinal)
        .then((r) => (bindMsg = r?.ok ? (ordinal ? 'assigned' : 'cleared') : `error: ${r?.error ?? 'failed'}`))
        .catch((e) => (bindMsg = `error: ${e?.message ?? e}`))
        .finally(() => (binding = false));
    } else {
      const f = mm?.fields?.source;
      if (f) forgefx.setParam(eid, f.pid, ordinal, false).catch(() => {});
    }
  }

  // Clear the assigned source (design §3.2 "Clear" chip: source=0, other settings kept).
  function clearSource() {
    pickSource(0);
  }

  const dockEmpty = $derived(isDock && !hasTarget);
</script>

{#if variant === 'flyout'}
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="scrim" class:open onpointerdown={onClose}></div>
{/if}

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div
  class="panel"
  class:dock={isDock}
  class:flyout={!isDock}
  class:open
  class:mob
  data-screen-label="Modifier Editor"
  onpointermove={knobMove}
  onpointerup={knobUp}
>
  {#if dockEmpty}
    <!-- docked part, no parameter targeted (design §3.3) -->
    <div class="empty">
      <div class="empty-glyph">∿</div>
      <div class="empty-title">No parameter targeted</div>
      <div class="empty-sub">Tap the ∿ badge on any continuous parameter in a Block panel to edit its modifier here.</div>
    </div>
  {:else}
    <!-- header -->
    <div class="head">
      <span class="srcdot" class:on={srcOn}></span>
      <div class="titlewrap">
        <div class="title">{isDock ? label || 'Modifier' : `Edit Modifier${label ? `: ${label}` : ''}`}</div>
        {#if isDock}
          <div class="subtitle">{label ? `${(block || 'BLOCK').toUpperCase()} · MODIFIER` : 'NO PARAMETER TARGETED'}</div>
        {/if}
      </div>
      <span style="flex:1"></span>
      {#if srcOn}
        <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
        <div class="clear" onclick={clearSource} title="Clear modifier">Clear</div>
      {/if}
      {#if !isDock}
        <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
        <div class="close" onclick={onClose} title="Close">✕</div>
      {/if}
    </div>

    {#if !isDock}
      <!-- flyout banner: live binding status -->
      <div class="banner" class:ok={canBind}>
        {#if canBind}
          Modifier slot {slot} → <b>{label}</b>{#if bindMsg}<span class="bindmsg"> · {bindMsg}</span>{:else if binding}<span class="bindmsg"> · binding…</span>{/if}
        {:else}
          Editing modifier slot {slot} (effect {eid}) — open from a control's ∿ to assign it to that control.
        {/if}
      </div>
    {/if}

    <div class="body">
      <!-- SOURCE / CHANNEL / PC RESET -->
      <div class="section src-section">
        <div>
          <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
          <div class="srcbox" class:on={srcOn} onclick={() => (sourceOpen = !sourceOpen)}>
            <span class="srctxt">{SOURCES.find((s) => s.ordinal === m.source)?.name ?? (srcOn ? `Source ${m.source}` : 'NONE — tap to assign')}</span>
            <span class="caret">▾</span>
          </div>
          <div class="caption center">MODULATION SOURCE</div>
          {#if (mm?.sources?.length ?? 0) <= 1}<div class="flag center">more sources pending capture</div>{/if}
        </div>
        <div class="enum-row">
          <div class="enum-col">
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
            <div class="enumbtn" onclick={() => cycleEnum('channel', CHANNELS.length)}>{CHANNELS[m.channel]}</div>
            <div class="caption">Channel</div>
          </div>
          <div class="enum-col">
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
            <div class="enumbtn" onclick={() => setBoolEnum('pcReset')}>{m.pcReset ? 'On' : 'Off'}</div>
            <div class="caption">PC Reset</div>
          </div>
        </div>
      </div>

      <!-- RESPONSE CURVE -->
      <div class="section">
        <div class="divider"><span></span><b>RESPONSE</b><span></span></div>
        <div class="graph">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1="33.33" y1="0" x2="33.33" y2="100" style="stroke:var(--border)" stroke-width="0.5" />
            <line x1="66.66" y1="0" x2="66.66" y2="100" style="stroke:var(--border)" stroke-width="0.5" />
            <line x1="0" y1="33.33" x2="100" y2="33.33" style="stroke:var(--border)" stroke-width="0.5" />
            <line x1="0" y1="66.66" x2="100" y2="66.66" style="stroke:var(--border)" stroke-width="0.5" />
            <path d={curve.fill} fill="color-mix(in srgb, var(--accent) 10%, transparent)" stroke="none" />
            <path d={curve.cur} fill="none" style="stroke:var(--accent)" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
          </svg>
          <div class="axis x">SOURCE →</div>
          <div class="axis y">↑ VALUE</div>
        </div>
      </div>

      <!-- PARAMETER RANGE -->
      <div class="section">
        <div class="divider"><span></span><b>PARAMETER RANGE</b><span></span></div>
        <div class="knob-row">
          {#each rangeKnobs as k (k.key)}
            {@render modKnob(k)}
          {/each}
          <div class="enum-col self-center">
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
            <div class="enumbtn" onclick={() => cycleEnum('updateRate', UPDATE.length)}>{UPDATE[m.updateRate]}</div>
            <div class="caption">Update Rate</div>
          </div>
        </div>
      </div>

      <!-- DAMPING -->
      <div class="section">
        <div class="divider"><span></span><b>DAMPING</b><span></span></div>
        <div class="knob-row">
          {#each dampKnobs as k (k.key)}
            {@render modKnob(k)}
          {/each}
          <div class="enum-col self-center">
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
            <div class="enumbtn" onclick={() => cycleEnum('damping', DAMP.length)}>{DAMP[m.damping]}</div>
            <div class="caption">Damping</div>
          </div>
        </div>
      </div>

      <!-- MAPPING -->
      <div class="section">
        <div class="divider"><span></span><b>MAPPING</b><span></span></div>
        <div class="map-grid">
          {#each mapKnobs as k (k.key)}
            {@render modKnob(k)}
          {/each}
        </div>
      </div>

      <!-- AUTO ENGAGE -->
      <div class="section">
        <div class="divider"><span></span><b>AUTO ENGAGE</b><span></span></div>
        <div class="knob-row">
          {#each engageKnobs as k (k.key)}
            {@render modKnob(k)}
          {/each}
          <div class="enum-col self-center">
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
            <div class="enumbtn" onclick={() => cycleEnum('autoEngage', ENGAGE.length)}>{ENGAGE[m.autoEngage]}</div>
            <div class="caption">Auto Engage</div>
          </div>
        </div>
      </div>
    </div>

    <!-- SOURCE MENU -->
    {#if sourceOpen}
      <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
      <div class="srcmenu-scrim" onclick={() => (sourceOpen = false)}></div>
      <div class="srcmenu">
        {#each SOURCES as s (s.ordinal)}
          <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
          <div class="srcopt" class:sel={s.ordinal === m.source} class:none={s.ordinal === 0} onclick={() => pickSource(s.ordinal)}>{s.name}</div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

{#snippet modKnob(k: KnobSpec)}
  {@const v = m[k.key] as number}
  <div class="knob" class:dim={!k.live}>
    <div class="kval">{knobFmt(k.key, v)}</div>
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <div class="kbox" onpointerdown={(e) => knobDown(e, k.key)} title={k.live ? '' : 'pending decode — local preview only'}>
      <svg width="54" height="54" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="24" fill="none" style="stroke:var(--border2)" stroke-width="5" stroke-linecap="round" stroke-dasharray="113.1 300" transform="rotate(135 32 32)" />
        <circle cx="32" cy="32" r="24" fill="none" style="stroke:var(--accent)" stroke-width="5" stroke-linecap="round" stroke-dasharray={dashFor(v)} transform="rotate(135 32 32)" />
        <circle cx="32" cy="32" r="15" style="fill:var(--surface2);stroke:var(--bg)" stroke-width="1" />
        <g transform={rotFor(v)}><circle cx="32" cy="20" r="2.6" style="fill:var(--text)" /></g>
      </svg>
    </div>
    <div class="klbl">{k.label}{#if !k.live}<span class="pend"> ·pending</span>{/if}</div>
  </div>
{/snippet}

<style>
  /* ── flyout chrome (old shell): fixed right-anchored slide-in over a scrim ── */
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 190;
    background: rgba(6, 6, 8, 0.45);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.26s ease;
  }
  .scrim.open {
    opacity: 1;
    pointer-events: auto;
  }
  .panel.flyout {
    position: fixed;
    top: 0;
    bottom: 0;
    right: 0;
    width: min(420px, 94vw);
    z-index: 200;
    background: linear-gradient(180deg, var(--bg2), var(--bg2));
    border-left: 1px solid var(--border);
    box-shadow: -26px 0 60px rgba(0, 0, 0, 0.55);
    transform: translateX(112%);
    transition: transform 0.28s cubic-bezier(0.2, 0.85, 0.25, 1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .panel.flyout.open {
    transform: translateX(0);
  }
  /* mobile: full-screen sheet from the right (no peek of the grid behind it) */
  .panel.flyout.mob {
    width: 100vw;
    border-left: none;
  }
  /* ── dock variant (design §3.1): fills its pane, no scrim, no slide-in ── */
  .panel.dock {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    background: var(--bg2);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 13px 16px;
    border-bottom: 1px solid var(--surface2);
    flex: none;
    background: linear-gradient(180deg, var(--surface), var(--bg2));
  }
  .srcdot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: none;
    background: var(--border3);
  }
  .srcdot.on {
    background: var(--amber);
    box-shadow: 0 0 8px rgba(245, 166, 35, 0.8);
  }
  .titlewrap {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .title {
    min-width: 0;
    font-weight: 700;
    font-size: 14px;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .subtitle {
    font: 600 9px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.08em;
    color: var(--textmuted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .clear {
    height: 26px;
    display: flex;
    align-items: center;
    padding: 0 11px;
    flex: none;
    background: var(--surface2);
    border: 1px solid var(--border2);
    border-radius: 8px;
    cursor: pointer;
    font: 700 11px/1 'JetBrains Mono', monospace;
    color: var(--textdim);
  }
  .clear:hover {
    border-color: var(--danger);
    color: var(--danger);
  }
  .close {
    width: 32px;
    height: 32px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface2);
    border: 1px solid var(--border2);
    border-radius: 9px;
    cursor: pointer;
    font-size: 14px;
    color: var(--textdim);
  }
  .close:hover {
    border-color: var(--border3);
    color: var(--text);
  }
  .banner {
    flex: none;
    padding: 9px 16px;
    font: 600 11px/1.4 'JetBrains Mono', monospace;
    color: var(--amber);
    background: var(--amber-tint);
    border-bottom: 1px solid var(--amber-border);
  }
  .empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 20px;
    text-align: center;
  }
  .empty-glyph {
    font-size: 28px;
    color: var(--border3);
    line-height: 1;
  }
  .empty-title {
    font-weight: 700;
    font-size: 13px;
    color: var(--text2);
  }
  .empty-sub {
    max-width: 260px;
    font-weight: 500;
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--textdim);
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .section {
    display: flex;
    flex-direction: column;
  }
  .src-section {
    gap: 13px;
  }
  .divider {
    display: flex;
    align-items: center;
    gap: 11px;
    margin-bottom: 8px;
  }
  .divider span {
    flex: 1;
    height: 1px;
    background: var(--border);
  }
  .divider b {
    font: 700 10px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.13em;
    color: var(--textfaint);
  }
  .srcbox {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 46px;
    padding: 0 14px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 15px;
    font-weight: 700;
    background: var(--input);
    border: 1px dashed var(--border3);
    color: var(--text2);
  }
  .srcbox.on {
    background: var(--surface2);
    border: 1px solid var(--accent-border);
    color: var(--accentbright);
  }
  .srctxt {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .caret {
    font-size: 10px;
    color: var(--textfaint);
    flex: none;
    margin-left: 8px;
  }
  .caption {
    font: 600 10px/1 'JetBrains Mono', monospace;
    color: var(--textfaint);
    letter-spacing: 0.04em;
    margin-top: 8px;
  }
  .caption.center {
    font-size: 9px;
    letter-spacing: 0.08em;
    text-align: center;
    color: var(--textmuted);
  }
  .center {
    text-align: center;
  }
  .flag {
    font: 600 8px/1.3 'JetBrains Mono', monospace;
    color: var(--amber);
    letter-spacing: 0.04em;
    margin-top: 4px;
  }
  .pend {
    color: var(--danger);
    font-weight: 700;
  }
  .enum-row {
    display: flex;
    gap: 12px;
  }
  .enum-col {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
  }
  .self-center {
    align-self: center;
    flex: none;
  }
  .enumbtn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 96px;
    width: 100%;
    max-width: 150px;
    height: 38px;
    padding: 0 16px;
    border-radius: 9px;
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
    background: var(--track);
    border: 1px solid var(--border2);
    color: var(--text);
    cursor: pointer;
  }
  .enumbtn:hover {
    border-color: var(--border3);
  }
  .graph {
    position: relative;
    width: 100%;
    aspect-ratio: 1.4/1;
    max-height: 210px;
    background: var(--bg);
    border: 1px solid var(--surface2);
    border-radius: 10px;
    overflow: hidden;
  }
  .graph svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    touch-action: none;
  }
  .axis {
    position: absolute;
    font: 600 8px/1 'JetBrains Mono', monospace;
    color: var(--border3);
    letter-spacing: 0.06em;
  }
  .axis.x {
    left: 9px;
    bottom: 7px;
  }
  .axis.y {
    left: 9px;
    top: 7px;
    writing-mode: vertical-rl;
  }
  .knob-row {
    display: flex;
    align-items: flex-start;
    gap: 20px;
    justify-content: center;
  }
  .map-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px 6px;
    justify-items: center;
  }
  .knob {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }
  .knob.dim {
    opacity: 0.55;
  }
  .kval {
    width: 54px;
    height: 17px;
    border-radius: 5px;
    background: var(--bg);
    border: 1px solid var(--surface2);
    display: flex;
    align-items: center;
    justify-content: center;
    font: 600 10px/1 'JetBrains Mono', monospace;
    color: var(--text2);
  }
  .kbox {
    cursor: ns-resize;
    touch-action: none;
    user-select: none;
  }
  .kbox svg {
    display: block;
  }
  .klbl {
    font-weight: 600;
    font-size: 11px;
    color: var(--textdim);
  }
  .srcmenu-scrim {
    position: absolute;
    inset: 0;
    z-index: 8;
  }
  .srcmenu {
    position: absolute;
    left: 16px;
    right: 16px;
    top: 96px;
    z-index: 9;
    background: var(--track);
    border: 1px solid var(--border2);
    border-radius: 11px;
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.6);
    padding: 6px;
    max-height: 320px;
    overflow-y: auto;
  }
  .srcopt {
    display: flex;
    align-items: center;
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    color: var(--text2);
  }
  .srcopt.none {
    color: var(--textdim);
  }
  .srcopt.sel {
    color: var(--accentbright);
    background: var(--accent-tint);
  }
  .srcopt:hover {
    background: color-mix(in srgb, var(--text) 4%, transparent);
  }
</style>
