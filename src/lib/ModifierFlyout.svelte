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
    model = undefined,
    onClose
  }: {
    open?: boolean;
    label?: string;
    /** Pre-fetched address map; if omitted the flyout fetches /mod/model on first open. */
    model?: ModModel | null;
    onClose: () => void;
  } = $props();

  // ── design enums (placeholders — vocabularies not decoded) ──
  const SOURCES = ['None', 'Expression 1', 'Expression 2', 'LFO 1', 'LFO 2', 'Envelope', 'ADSR', 'Sequencer'];
  const CHANNELS = ['All', '1', '2', '3', '4'];
  const UPDATE = ['Fast', 'Medium', 'Slow'];
  const DAMP = ['None', 'Linear', 'Exponential', 'Logarithmic'];
  const ENGAGE = ['Off', 'Fast Pos', 'Slow Pos', 'Auto'];

  // ── address map ──
  let fetched = $state<ModModel | null>(null);
  const mm = $derived(model ?? fetched);
  const eid = $derived(mm?.effectId ?? 3);
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
  const srcOn = $derived(m.source > 0);

  // ── which curve fields write live (pid from the model, written continuous as 0..1) ──
  const CURVE_KEYS = ['min', 'max', 'start', 'mid', 'end', 'slope', 'scale', 'offset'] as const;
  type CurveKey = (typeof CURVE_KEYS)[number];

  function writeCurve(key: CurveKey, v100: number) {
    const f = mm?.fields?.[key];
    if (!f) return; // model not loaded → keep it local-only
    forgefx.setParam(eid, f.pid, clamp(v100) / 100, true).catch(() => {});
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
    if ((CURVE_KEYS as readonly string[]).includes(drag.key as string)) writeCurve(drag.key as CurveKey, nv);
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
    { key: 'attack', label: 'Attack', live: false },
    { key: 'release', label: 'Release', live: false }
  ];
  const mapKnobs: KnobSpec[] = [
    { key: 'start', label: 'Start', live: true },
    { key: 'mid', label: 'Mid', live: true },
    { key: 'end', label: 'End', live: true },
    { key: 'slope', label: 'Slope', live: true },
    { key: 'scale', label: 'Scale', live: true },
    { key: 'offset', label: 'Offset', live: true }
  ];
  const engageKnobs: KnobSpec[] = [{ key: 'offValue', label: 'Off Value', live: false }];

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

  function pickSource(i: number) {
    m = { ...m, source: i };
    sourceOpen = false;
    const f = mm?.fields?.source;
    if (f) forgefx.setParam(eid, f.pid, i, false).catch(() => {}); // ordinal → discrete, best-effort
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

  <!-- banner: target binding undecoded -->
  <div class="banner">
    Editing the active modifier (effect {eid}) — per-control binding pending decode.
  </div>

  <div class="body">
    <!-- SOURCE / CHANNEL / PC RESET -->
    <div class="section src-section">
      <div>
        <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
        <div class="srcbox" class:on={srcOn} onclick={() => (sourceOpen = !sourceOpen)}>
          <span class="srctxt">{srcOn ? SOURCES[m.source] : 'NONE'}</span>
          <span class="caret">▾</span>
        </div>
        <div class="caption center">MODULATION SOURCE</div>
        <div class="flag center">source list unconfirmed</div>
      </div>
      <div class="enum-row">
        <div class="enum-col">
          <div class="enumbtn disabled" title="pending decode">{CHANNELS[m.channel]}</div>
          <div class="caption">Channel <span class="pend">·pending</span></div>
        </div>
        <div class="enum-col">
          <div class="enumbtn disabled" title="pending decode">{m.pcReset ? 'On' : 'Off'}</div>
          <div class="caption">PC Reset <span class="pend">·pending</span></div>
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
          <div class="enumbtn disabled" title="pending decode">{UPDATE[m.updateRate]}</div>
          <div class="caption">Update Rate <span class="pend">·pending</span></div>
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
          <div class="enumbtn disabled" title="pending decode">{DAMP[m.damping]}</div>
          <div class="caption">Damping <span class="pend">·pending</span></div>
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
          <div class="enumbtn disabled" title="pending decode">{ENGAGE[m.autoEngage]}</div>
          <div class="caption">Auto Engage <span class="pend">·pending</span></div>
        </div>
      </div>
    </div>
  </div>

  <!-- SOURCE MENU -->
  {#if sourceOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <div class="srcmenu-scrim" onclick={() => (sourceOpen = false)}></div>
    <div class="srcmenu">
      {#each SOURCES as label, i (i)}
        <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
        <div class="srcopt" class:sel={i === m.source} class:none={i === 0} onclick={() => pickSource(i)}>{label}</div>
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
        <circle cx="32" cy="32" r="24" fill="none" stroke="#2a2a31" stroke-width="5" stroke-linecap="round" stroke-dasharray="113.1 300" transform="rotate(135 32 32)" />
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
    background: linear-gradient(180deg, #121216, #0d0d10);
    border-left: 1px solid #222229;
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
    border-bottom: 1px solid #1c1c22;
    flex: none;
    background: linear-gradient(180deg, #15151a, #0f0f12);
  }
  .srcdot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: none;
    background: #f5a623;
    box-shadow: 0 0 8px rgba(245, 166, 35, 0.8);
  }
  .title {
    min-width: 0;
    font-weight: 700;
    font-size: 14px;
    color: #fff;
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
    background: #1a1a1f;
    border: 1px solid #2a2a31;
    border-radius: 9px;
    cursor: pointer;
    font-size: 14px;
    color: #9a9aa3;
  }
  .close:hover {
    border-color: #3f3f48;
    color: #fff;
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
    background: #222229;
  }
  .divider b {
    font: 700 10px/1 'JetBrains Mono', monospace;
    letter-spacing: 0.13em;
    color: #6e6e78;
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
    background: #0a0a0c;
    border: 1px dashed #3a3a44;
    color: #cfcfd6;
  }
  .srcbox.on {
    background: #102023;
    border: 1px solid #2c5d63;
    color: #7fd8de;
  }
  .srctxt {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .caret {
    font-size: 10px;
    color: #6e6e78;
    flex: none;
    margin-left: 8px;
  }
  .caption {
    font: 600 10px/1 'JetBrains Mono', monospace;
    color: #6e6e78;
    letter-spacing: 0.04em;
    margin-top: 8px;
  }
  .caption.center {
    font-size: 9px;
    letter-spacing: 0.08em;
    text-align: center;
    color: #56565e;
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
    color: #d6543f;
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
    background: #16161b;
    border: 1px solid #2a2a31;
    color: #e3e3e8;
  }
  .enumbtn.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    color: #8a8a93;
  }
  .graph {
    position: relative;
    width: 100%;
    aspect-ratio: 1/1;
    max-height: 230px;
    background: #08080a;
    border: 1px solid #1c1c22;
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
    color: #3c3c44;
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
    background: #0c0c0e;
    border: 1px solid #202027;
    display: flex;
    align-items: center;
    justify-content: center;
    font: 600 10px/1 'JetBrains Mono', monospace;
    color: #cfcfd6;
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
    color: #9a9aa3;
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
    background: #16161b;
    border: 1px solid #2e2e36;
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
    color: #cfcfd6;
  }
  .srcopt.none {
    color: #8a8a93;
  }
  .srcopt.sel {
    color: #7fd8de;
    background: rgba(53, 201, 214, 0.12);
  }
  .srcopt:hover {
    background: rgba(255, 255, 255, 0.04);
  }
</style>
