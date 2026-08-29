<script lang="ts">
  import { fmtControlValue, paramValue } from './format';
  import type { CabAlignmentGraphSpec } from './cabAlignmentGraphs';

  let { graph, accent = '#35c9d6' }: { graph: CabAlignmentGraphSpec; accent?: string } = $props();

  const W = 360;
  const H = 130;
  const zoomed = $derived(graph.zoom?.value === 1);
  const span = $derived(zoomed ? 0.25 : 1);
  const xOf = (delay: number) => 24 + Math.max(0, Math.min(1, delay / span)) * (W - 48);
  const delay1 = $derived(graph.delay1 ? paramValue(graph.delay1) : 0);
  const delay2 = $derived(graph.delay2 ? paramValue(graph.delay2) : 0);
  const readouts = $derived([
    graph.delay1 && `CAB 1 ${fmtControlValue(graph.delay1)}`,
    graph.delay2 && `CAB 2 ${fmtControlValue(graph.delay2)}`,
    `WINDOW ${zoomed ? '0.25 ms' : '1.0 ms'}`
  ].filter((value): value is string => !!value));
</script>

<div class="wrap">
  <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label="Cabinet time alignment">
    <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="10" fill="var(--bg)" stroke="var(--border)" />
    {#each [0.25, 0.5, 0.75] as tick}
      <line x1={24 + tick * (W - 48)} y1="18" x2={24 + tick * (W - 48)} y2={H - 18} stroke="var(--border)" />
    {/each}
    {#each [{ label: 'CAB 1', delay: delay1, y: 45 }, { label: 'CAB 2', delay: delay2, y: 88 }] as cab}
      <text x="8" y={cab.y + 3} fill="var(--textmuted)" font-size="9" font-family="var(--font-mono)">{cab.label}</text>
      <line x1="24" y1={cab.y} x2={W - 24} y2={cab.y} stroke="var(--border2)" />
      <line x1={xOf(cab.delay)} y1={cab.y - 18} x2={xOf(cab.delay)} y2={cab.y + 18} stroke={accent} stroke-width="2" />
      <circle cx={xOf(cab.delay)} cy={cab.y} r="4.5" fill={accent} stroke="var(--bg)" stroke-width="1.5" />
    {/each}
    <text x="24" y={H - 6} fill="var(--textmuted)" font-size="9" font-family="var(--font-mono)">0</text>
    <text x={W - 24} y={H - 6} text-anchor="end" fill="var(--textmuted)" font-size="9" font-family="var(--font-mono)">{span} ms</text>
  </svg>
  <div class="hud mono">{#each readouts as value}<span>{value}</span>{/each}</div>
</div>

<style>
  .wrap { position: relative; width: 100%; height: 100%; min-height: 110px; }
  svg { display: block; width: 100%; height: 100%; }
  .hud { position: absolute; top: 8px; right: 10px; display: flex; gap: 10px; align-items: center; padding: 5px 8px; border: 1px solid var(--border2); border-radius: 7px; background: color-mix(in srgb, var(--bg) 82%, transparent); color: var(--textdim); font-size: 10px; pointer-events: none; }
  @media (max-width: 600px) { .hud span:nth-of-type(n + 3) { display: none; } }
</style>
