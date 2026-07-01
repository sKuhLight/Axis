<script lang="ts">
  // Modifier editor flyout — ported from design/Control Surface (Widget Grid).dc.html
  // (MODIFIER FLYOUT, ~line 278). Edits the device's CURRENTLY-ACTIVE modifier (the
  // Modifier effect, effectId 3) — per-control target binding is not yet decoded, so
  // the ∿ that opened this only names the control for context (see banner).
  //
  // Wired live: the response-curve fields min/max/start/mid/end/slope/scale/offset, each
  //   a 0..1 norm written continuous to the Modifier effect via forgefx.setParam(eid,pid,v,true).
  // Source: rendered + best-effort (the source enum vocabulary is NOT decoded — labels are
  //   the design's placeholders; the chosen index is written as the ordinal).
  // Disabled (pids not decoded): Channel, PC Reset, Update Rate, Attack, Release, Damping,
  //   Auto Engage, Off Value — rendered but flagged "pending decode", no writes.
  import { forgefx } from './forgefx';
  import type { ModModel } from './types';

  let {
    open = false,
    label = '',
    targetEffectId = null,
    targetParam = null,
    slot = 1,
    model = undefined,
    onClose
  }: {
    open?: boolean;
    label?: string;
    /** The control this flyout was opened for: target block eid + paramId (for binding). */
    targetEffectId?: number | null;
    targetParam?: number | null;
    /** Modifier slot to use (1-based). */
    slot?: number;
    /** Pre-fetched address map; if omitted the flyout fetches /mod/model on first open. */
    model?: ModModel | null;
    onClose: () => void;
  } = $props();

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
    if (open && model === undefined && fetched === null && !loading) {
      loading = true;
      forgefx
        .modModel()
        .then((m) => (fetched = m))
        .finally(() => (loading = false));
    }
  });

  // ── local edit state (no read-back yet — sensible defaults from the design's defaultMod) ──
  // The curve fields are 0..1 (norm); UI shows them on a 0..100 scale to match the design knobs.
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

  // ── read-back: load the modifier slot's live state on open (the bulk read returns real wire values
  //    for the virtual MOD effect; per-pid GET does not). Norm fields are 0..65534 wire → 0..100 UI;
  //    ordinal/ref fields are the raw integer. Falls back to defaults if the read fails. ──
  const WIRE_MAX = 65534;
  let loadedKey = $state(''); // guards one load per (open, eid)
  $effect(() => {
    if (!open || !mm) return;
    const key = `${eid}`;
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
    if (!open) loadedKey = ''; // reset so the next open re-reads
  });

  const srcOn = $derived(m.source > 0);

  // ── write any modifier field to the device, encoded by its kind (from the model) ──
  //   norm    → 0..1 continuous (UI 0..100)
  //   bipolar → -1..1, sent discrete (the continuous opcode clamps to 0..1, killing the sign)
  //   ordinal/ref → integer, discrete
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

  // cycle an ordinal enum field (Channel / PC Reset / Update Rate / Damping / Auto Engage)
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

  // Picking a source binds this modifier slot to the control it was opened for: one /mod/bind call
  // writes targetEffectId (pid 8) + targetParam (pid 9) + source (pid 0) on the slot's eid. Choosing
  // None (ordinal 0) clears the source — mirrors FM3-Edit's NONE↔source toggle creating/removing the link.
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
      // no target context → fall back to writing just the source ordinal on the slot
      const f = mm?.fields?.source;
      if (f) forgefx.setParam(eid, f.pid, ordinal, false).catch(() => {});
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="scrim" class:open onpointerdown={onClose}></div>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
<div class="panel" class:open data-screen-label="Modifier Editor" onpointermove={knobMove} onpointerup={knobUp}>
  <!-- header -->
  <div class="head">
    <span class="srcdot"></span>
    <div class="title">Edit Modifier{label ? `: ${label}` : ''}</div>
    <span style="flex:1"></span>
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <div class="close" onclick={onClose} title="Close">✕</div>
  </div>

  <!-- banner: live binding status -->
  <div class="banner" class:ok={canBind}>
    {#if canBind}
      Modifier slot {slot} → <b>{label}</b>{#if bindMsg}<span class="bindmsg"> · {bindMsg}</span>{:else if binding}<span class="bindmsg"> · binding…</span>{/if}
    {:else}
      Editing modifier slot {slot} (effect {eid}) — open from a control's ∿ to assign it to that control.
    {/if}
  </div>

  <div class="body">
    <!-- SOURCE / CHANNEL / PC RESET -->
    <div class="section src-section">
      <div>
        <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
        <div class="srcbox" class:on={srcOn} onclick={() => (sourceOpen = !sourceOpen)}>
          <span class="srctxt">{SOURCES.find((s) => s.ordinal === m.source)?.name ?? (srcOn ? `Source ${m.source}` : 'NONE')}</span>
          <span class="caret">▾</span>
        </div>
        <div class="caption center">MODULATION SOURCE</div>
        {#if (mm?.sources?.length ?? 0) <= 1}<div class="flag center">more sources pending capture</div>{/if}
      </div>
      <div class="enum-row">
        <div class="enum-col">
          <div class="enumbtn" onclick={() => cycleEnum('channel', CHANNELS.length)}>{CHANNELS[m.channel]}</div>
          <div class="caption">Channel</div>
        </div>
        <div class="enum-col">
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
          <line x1="33.33" y1="0" x2="33.33" y2="100" stroke="#16161b" stroke-width="0.5" />
          <line x1="66.66" y1="0" x2="66.66" y2="100" stroke="#16161b" stroke-width="0.5" />
          <line x1="0" y1="33.33" x2="100" y2="33.33" stroke="#16161b" stroke-width="0.5" />
          <line x1="0" y1="66.66" x2="100" y2="66.66" stroke="#16161b" stroke-width="0.5" />
          <path d={curve.fill} fill="rgba(53,201,214,.10)" stroke="none" />
          <path d={curve.cur} fill="none" stroke="#35c9d6" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
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
</div>

{#snippet modKnob(k: KnobSpec)}
  {@const v = m[k.key] as number}
  <div class="knob" class:dim={!k.live}>
    <div class="kval">{knobFmt(k.key, v)}</div>
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <div class="kbox" onpointerdown={(e) => knobDown(e, k.key)} title={k.live ? '' : 'pending decode — local preview only'}>
      <svg width="54" height="54" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="24" fill="none" style="stroke:var(--border2)" stroke-width="5" stroke-linecap="round" stroke-dasharray="113.1 300" transform="rotate(135 32 32)" />
        <circle cx="32" cy="32" r="24" fill="none" stroke="#35c9d6" stroke-width="5" stroke-linecap="round" stroke-dasharray={dashFor(v)} transform="rotate(135 32 32)" />
        <circle cx="32" cy="32" r="15" fill="#16161b" stroke="#000" stroke-width="1" />
        <g transform={rotFor(v)}><circle cx="32" cy="20" r="2.6" fill="#dcdce2" /></g>
      </svg>
    </div>
    <div class="klbl">{k.label}{#if !k.live}<span class="pend"> ·pending</span>{/if}</div>
  </div>
{/snippet}

<style>
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
  .panel {
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
  .panel.open {
    transform: translateX(0);
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
    background: var(--amber);
    box-shadow: 0 0 8px rgba(245, 166, 35, 0.8);
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
    color: #f5c97a;
    background: rgba(245, 166, 35, 0.08);
    border-bottom: 1px solid rgba(245, 166, 35, 0.18);
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
    border: 1px solid #2c5d63;
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
    color: #d6a23f;
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
  }
  .enumbtn {
    cursor: pointer;
  }
  .enumbtn:hover {
    border-color: var(--border3);
  }
  .graph {
    position: relative;
    width: 100%;
    aspect-ratio: 1/1;
    max-height: 230px;
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
    background: rgba(53, 201, 214, 0.12);
  }
  .srcopt:hover {
    background: rgba(255, 255, 255, 0.04);
  }
</style>
