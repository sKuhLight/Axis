<script lang="ts">
  import { fmtControlValue, paramValue } from './format';
  import type { MegaTapGraphSpec } from './megaTapGraphs';

  let { graph, accent = '#35c9d6' }: { graph: MegaTapGraphSpec; accent?: string } = $props();
  const W = 360;
  const H = 130;
  const count = $derived(Math.max(1, Math.min(24, Math.round(graph.taps ? paramValue(graph.taps) : 8))));
  const timeCurve = $derived(0.35 + (graph.timeAlpha?.norm ?? 0.5) * 1.3);
  const ampCurve = $derived(0.35 + (graph.ampAlpha?.norm ?? 0.5) * 1.3);
  const label = (param: typeof graph.timeShape) => param?.options.find((option) => option.value === param.value)?.label;
  const taps = $derived(Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    return { x: 20 + Math.pow(t, timeCurve) * (W - 40), h: 12 + Math.pow(1 - t, ampCurve) * (H - 42) };
  }));
  const readouts = $derived([graph.taps && `TAPS ${fmtControlValue(graph.taps)}`, graph.predelay && `PRE ${fmtControlValue(graph.predelay)}`, label(graph.timeShape) && `TIME ${label(graph.timeShape)}`, label(graph.ampShape) && `AMP ${label(graph.ampShape)}`].filter((value): value is string => !!value));
</script>

<div class="wrap">
  <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label="MegaTap pattern">
    <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="10" fill="var(--bg)" stroke="var(--border)" />
    {#each [0.25, 0.5, 0.75] as tick}<line x1={W * tick} y1="16" x2={W * tick} y2={H - 18} stroke="var(--border)" />{/each}
    <line x1="18" y1={H - 18} x2={W - 18} y2={H - 18} stroke="var(--border2)" />
    {#each taps as tap}<line x1={tap.x} y1={H - 18} x2={tap.x} y2={H - 18 - tap.h} stroke={accent} stroke-width="2" stroke-linecap="round" />{/each}
    <text x="18" y={H - 6} fill="var(--textmuted)" font-size="9" font-family="var(--font-mono)">TIME</text>
    <text x={W - 18} y="13" text-anchor="end" fill="var(--textmuted)" font-size="9" font-family="var(--font-mono)">AMPLITUDE</text>
  </svg>
  <div class="hud mono">{#each readouts as value}<span>{value}</span>{/each}</div>
</div>

<style>
  .wrap { position: relative; width: 100%; height: 100%; min-height: 110px; }
  svg { display: block; width: 100%; height: 100%; }
  .hud { position: absolute; top: 8px; right: 10px; display: flex; gap: 10px; align-items: center; padding: 5px 8px; border: 1px solid var(--border2); border-radius: 7px; background: color-mix(in srgb, var(--bg) 82%, transparent); color: var(--textdim); font-size: 10px; pointer-events: none; }
  @media (max-width: 600px) { .hud span:nth-of-type(n + 3) { display: none; } }
</style>
