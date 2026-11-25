<script lang="ts">
  // A read-only graph tile's content: one served block visual drawn from the block's live values (the same
  // ones its knobs show). All reading and math live in visuals/graphModel.ts; this only renders the plot it
  // returns, the live gain-reduction bar and the LFO playhead.
  // The playhead runs on the surface's shared clock (≤ 30 fps), only while this tile is on screen, the page
  // is visible, nothing is being arranged and no reduced motion is asked for; it shows the RATE, not the
  // device's real LFO phase (the tooltip says so). Reading never writes. Colours: theme tokens only.
  import { untrack } from 'svelte';
  import type { BlockVisual } from '../types';
  import { getBeHost } from './beHost';
  import {
    gainReductionDb,
    GR_FALLBACK_MIN_DB,
    graphPlot,
    grPeak,
    grPeakShown,
    grScaleMinDb,
    GR_TICK_MS,
    playheadAt,
    VB_H,
    VB_W,
    type GraphTone,
    type GrPeak
  } from './visuals/graphModel';

  let { visual, itemId, pxW, pxH, edit = false }: { visual: BlockVisual; itemId: string; pxW: number; pxH: number; edit?: boolean } = $props();

  const host = getBeHost();
  const uid = $props.id();
  let root = $state<HTMLElement | null>(null);
  let onScreen = $state(false);

  const plot = $derived(
    graphPlot(visual, { knob: host.knob, enm: host.enm, typeName: host.typeName, bpm: host.bpm, hasTempo: host.hasTempo })
  );
  const small = $derived(pxH < 120 || pxW < 170);
  const tooltip = $derived([visual.title, ...plot.notes].join('\n'));

  // ── LFO playhead: registered with the shared clock while it can move and is on screen ──
  const moving = $derived(!!plot.playhead && host.animate && onScreen && !edit);
  $effect(() => {
    const on = moving;
    // the registration must not make this effect depend on the clock's own bookkeeping
    untrack(() => host.playhead(itemId, on));
    return () => untrack(() => host.playhead(itemId, false));
  });
  const dot = $derived(moving && plot.playhead ? playheadAt(plot.playhead, host.clock) : null);

  $effect(() => {
    const el = root;
    if (!el || typeof IntersectionObserver === 'undefined') {
      onScreen = true;
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) onScreen = e.isIntersecting;
    });
    io.observe(el);
    return () => io.disconnect();
  });

  const monitors = $derived(host.mons);
  /** Scale floor (dB): the served monitor's own range where it has one, else the kind's fallback. */
  const grMinDb = $derived(plot.gr ? grScaleMinDb(monitors, plot.gr.minDb) : GR_FALLBACK_MIN_DB.compressor);
  const grDb = $derived(plot.gr ? gainReductionDb(monitors, grMinDb) : null);
  let peak = $state<GrPeak | null>(null);
  /** A slow tick while a reading is shown, so the held peak falls back while the reading stays steady. */
  let nowMs = $state(Date.now());
  $effect(() => {
    if (grDb == null) return;
    const id = setInterval(() => (nowMs = Date.now()), GR_TICK_MS);
    return () => clearInterval(id);
  });
  $effect(() => {
    const db = grDb;
    peak = grPeak(untrack(() => peak), Date.now(), db);
  });
  const peakDb = $derived(grDb == null ? null : grPeakShown(peak, nowMs));
  const grScale = $derived(-grMinDb);
  /** Honesty notes for assistive tech (the tooltip is not reachable there; touch gets them in the control
   *  menu): the graph's accessible description. */
  const description = $derived(plot.notes.join(' '));

  const pctX = (x: number) => `${((x / VB_W) * 100).toFixed(2)}%`;
  const pctY = (y: number) => `${((y / VB_H) * 100).toFixed(2)}%`;
  const toneClass = (t: GraphTone) => `t-${t}`;
</script>

<div
  bind:this={root}
  class="be-graph"
  class:small
  class:edit
  role="img"
  aria-label={plot.aria}
  aria-describedby={description ? `${uid}-notes` : undefined}
  title={tooltip}
  data-be-graph={visual.key}
  data-be-graph-kind={visual.kind}
  data-be-playhead={moving ? 'on' : 'off'}
>
  <div class="be-gtitle">
    <span class="be-gname">{visual.title}</span>
    {#if plot.badge}<span class="be-gbadge" data-be-graph-badge>{plot.badge}</span>{/if}
  </div>
  <div class="be-gplot">
    <svg class="be-gsvg" viewBox="0 0 {VB_W} {VB_H}" preserveAspectRatio="none" aria-hidden="true">
      {#if !small}
        {#each plot.xTicks as t (t.pos)}<line class="be-ggrid" x1={t.pos} y1="0" x2={t.pos} y2={VB_H} />{/each}
        {#each plot.yTicks as t (t.pos)}<line class="be-ggrid" x1="0" y1={t.pos} x2={VB_W} y2={t.pos} />{/each}
      {/if}
      {#each plot.hlines as l, i (i)}<line class="be-gl {toneClass(l.tone)}" x1="0" y1={l.y} x2={VB_W} y2={l.y} />{/each}
      {#each plot.vlines as l, i (i)}<line class="be-gl {toneClass(l.tone)}" x1={l.x} y1="0" x2={l.x} y2={VB_H} />{/each}
      {#each plot.series as s, i (i)}
        {#if s.area}<path class="be-garea" d={s.area} />{/if}
        <path class="be-gline {toneClass(s.tone)}" class:dash={s.dash} d={s.d} />
      {/each}
      {#each plot.spikes as s, i (i)}<line class="be-gspike {toneClass(s.tone)}" x1={s.x} y1={s.y0} x2={s.x} y2={s.y1} />{/each}
    </svg>
    {#if !small}
      {#each plot.xTicks as t (t.pos)}<span class="be-gtick x" style:left={pctX(t.pos)}>{t.label}</span>{/each}
      {#each plot.yTicks as t (t.pos)}<span class="be-gtick y" style:top={pctY(t.pos)}>{t.label}</span>{/each}
    {/if}
    {#each plot.vlines.filter((l) => l.label) as l, i (i)}<span class="be-gmark {toneClass(l.tone)}" style:left={pctX(l.x)}>{l.label}</span>{/each}
    {#if plot.empty}<div class="be-gempty">{plot.empty}</div>{/if}
    {#if dot}<span class="be-gdot" data-be-graph-dot style:left={pctX(dot.x)} style:top={pctY(dot.y)}></span>{/if}
    {#if plot.gr && grDb != null}
      <div class="be-ggr" data-be-graph-gr title="Live gain reduction">
        <div class="be-ggrfill" style:height="{Math.round((grDb / grScale) * 100)}%"></div>
        {#if peakDb != null && peakDb > 0}<div class="be-ggrpeak" style:top="{Math.round((peakDb / grScale) * 100)}%"></div>{/if}
        <span class="be-ggrtxt">−{grDb.toFixed(1)}</span>
      </div>
    {/if}
  </div>
  {#if !small || !plot.empty}<div class="be-gcap" data-be-graph-caption>{plot.caption}</div>{/if}
  {#if description}<span id="{uid}-notes" class="be-gsr" data-be-graph-notes>{description}</span>{/if}
</div>

<style>
  .be-graph {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 8px 4px;
    box-sizing: border-box;
    color: var(--textdim);
    user-select: none;
  }
  .be-graph.edit .be-gtitle {
    padding-left: 18px;
  }
  .be-gtitle {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font: 600 11px/1.2 var(--font-ui);
  }
  .be-gname {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .be-gbadge {
    flex: none;
    padding: 0 5px;
    border: 1px solid var(--amber-border);
    border-radius: 4px;
    background: var(--amber-tint);
    color: var(--amber);
    font: 600 9.5px/1.4 var(--font-ui);
    white-space: nowrap;
  }
  .be-gplot {
    position: relative;
    flex: 1;
    min-height: 0;
    border-radius: 4px;
    background: var(--input);
    overflow: hidden;
  }
  .be-gsvg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .be-ggrid {
    stroke: var(--border);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .be-gl {
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
    stroke-dasharray: 3 3;
  }
  .be-gline {
    fill: none;
    stroke-width: 1.75;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .be-gline.dash {
    stroke-dasharray: 4 3;
    stroke-width: 1.25;
  }
  .be-garea {
    fill: color-mix(in srgb, var(--accent) 12%, transparent);
    stroke: none;
  }
  .be-gspike {
    stroke-width: 2;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }
  .t-main {
    stroke: var(--accent);
  }
  .t-alt {
    stroke: var(--amber);
  }
  .t-ref {
    stroke: var(--border3);
  }
  .t-faint {
    stroke: var(--border2);
  }
  .be-gtick {
    position: absolute;
    padding: 0 2px;
    border-radius: 2px;
    /* the plot's own background masks the grid line running through the label */
    background: var(--input);
    font: 500 9px/1 var(--font-mono);
    color: var(--textmuted);
    pointer-events: none;
    white-space: nowrap;
  }
  .be-gtick.x {
    bottom: 2px;
    transform: translateX(-50%);
  }
  .be-gtick.y {
    left: 3px;
    transform: translateY(-50%);
  }
  .be-gmark {
    position: absolute;
    top: 2px;
    transform: translateX(3px);
    font: 600 9px/1 var(--font-mono);
    color: var(--textfaint);
    pointer-events: none;
  }
  .be-gmark.t-main {
    color: var(--accent);
  }
  .be-gmark.t-alt {
    color: var(--amber);
  }
  .be-gempty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 0 8px;
    text-align: center;
    font: 500 11px/1.3 var(--font-ui);
    color: var(--textfaint);
  }
  .be-gdot {
    position: absolute;
    width: 7px;
    height: 7px;
    margin: -3.5px 0 0 -3.5px;
    border-radius: 50%;
    background: var(--accentbright);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent);
    pointer-events: none;
  }
  .be-ggr {
    position: absolute;
    top: 4px;
    right: 4px;
    bottom: 4px;
    width: 9px;
    border-radius: 3px;
    background: var(--track);
    border: 1px solid var(--border2);
  }
  .be-ggrfill {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    background: var(--amber);
    border-radius: 2px;
  }
  .be-ggrpeak {
    position: absolute;
    left: -1px;
    right: -1px;
    height: 2px;
    background: var(--danger);
    transform: translateY(-50%);
  }
  .be-ggrtxt {
    position: absolute;
    right: 12px;
    top: 0;
    font: 600 9px/1 var(--font-mono);
    color: var(--amber);
    white-space: nowrap;
  }
  .be-gcap {
    flex: none;
    font: 500 10px/1.2 var(--font-mono);
    color: var(--textfaint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
  }
  .be-graph.small .be-gtitle {
    font-size: 10px;
  }
  /* read by assistive tech only (the graph's description) */
  .be-gsr {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
</style>
