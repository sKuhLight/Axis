<script lang="ts">
  import { paramValue } from '$lib/format';
  import { megaTapTaps } from './megaTapPattern';
  import type { MegaTapGraphSpec } from './megaTapGraphs';

  let { graph, accent = '#35c9d6' }: { graph: MegaTapGraphSpec; accent?: string } = $props();
  const W = 360;
  const H = 130;
  const PAD = 18;

  const shapeLabel = (param: typeof graph.timeShape) =>
    param?.options.find((option) => option.value === param.value)?.label ?? '';
  // Alpha reads as a 0..1 shape control and sits mid-travel when the block does not author it;
  // Randomize is an amount, and a missing one means none.
  const alpha = (param: typeof graph.timeAlpha) => (param ? paramValue(param) / 100 : 0.5);
  const amount = (param: typeof graph.timeRandom) => (param ? paramValue(param) / 100 : 0);
  const count = $derived(Math.max(1, Math.round(
    graph.taps ? paramValue(graph.taps) : graph.tapsEnum?.value ?? 8
  )));
  const timeMs = $derived(graph.time ? paramValue(graph.time) : 1000);
  const predelayMs = $derived(graph.predelay ? paramValue(graph.predelay) : 0);

  const taps = $derived(megaTapTaps({
    count,
    timeMs,
    timeShape: shapeLabel(graph.timeShape),
    timeAlpha: alpha(graph.timeAlpha),
    ampShape: shapeLabel(graph.ampShape),
    ampAlpha: alpha(graph.ampAlpha),
    timeRandom: amount(graph.timeRandom),
    ampRandom: amount(graph.ampRandom)
  }));

  // The box spans predelay plus the full Delay Time, so a tap sits where it lands in the delay
  // window rather than at its ordinal, and predelay slides the whole train right.
  const span = $derived(Math.max(1, predelayMs + timeMs));
  const peak = $derived(Math.max(...taps.map((tap) => tap.amp), 1e-6));
  const spikes = $derived(taps.map((tap) => ({
    x: PAD + ((predelayMs + tap.ms) / span) * (W - PAD * 2),
    h: (tap.amp / peak) * (H - PAD * 2)
  })));
</script>

<div class="wrap">
  <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label="MegaTap pattern">
    <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="10" fill="var(--bg)" stroke="var(--border)" />
    {#each [0.25, 0.5, 0.75] as tick}<line x1={W * tick} y1="16" x2={W * tick} y2={H - PAD} stroke="var(--border)" />{/each}
    <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--border2)" />
    {#each spikes as spike}
      <line x1={spike.x} y1={H - PAD} x2={spike.x} y2={H - PAD - spike.h} stroke={accent} stroke-width="2" stroke-linecap="butt" vector-effect="non-scaling-stroke" />
    {/each}
    <text x={PAD} y={H - 6} fill="var(--textmuted)" font-size="9" font-family="var(--font-mono)">TIME</text>
    <text x={W - PAD} y="13" text-anchor="end" fill="var(--textmuted)" font-size="9" font-family="var(--font-mono)">AMPLITUDE</text>
  </svg>
</div>

<style>
  .wrap { position: relative; width: 100%; height: 100%; min-height: 110px; }
  svg { display: block; width: 100%; height: 100%; }
</style>
