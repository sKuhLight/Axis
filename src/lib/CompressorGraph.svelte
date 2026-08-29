<script lang="ts">
  import { fmtControlValue, paramValue } from './format';
  import type { CompressorGraphSpec } from './compressorGraphs';

  let { graph, accent = '#35c9d6' }: { graph: CompressorGraphSpec; accent?: string } = $props();

  const W = 360;
  const H = 130;
  const MIN = -60;
  const MAX = 20;
  const hasTransfer = $derived(!!graph.threshold && !!graph.ratio);
  const kneeLabel = $derived(graph.knee?.options.find((option) => option.value === graph.knee?.value)?.label);
  const xOf = (db: number) => ((db - MIN) / (MAX - MIN)) * W;
  const yOf = (db: number) => H - ((db - MIN) / (MAX - MIN)) * H;
  const curve = $derived.by(() => {
    if (!hasTransfer) return '';
    const threshold = paramValue(graph.threshold!);
    const ratio = Math.max(1, paramValue(graph.ratio!));
    const points: string[] = [];
    for (let i = 0; i <= 96; i++) {
      const input = MIN + ((MAX - MIN) * i) / 96;
      const output = input <= threshold ? input : threshold + (input - threshold) / ratio;
      points.push(`${xOf(input).toFixed(1)},${yOf(output).toFixed(1)}`);
    }
    return points.join(' ');
  });
  const readouts = $derived([
    graph.threshold && `THRESH ${fmtControlValue(graph.threshold)}`,
    graph.ratio && `RATIO ${fmtControlValue(graph.ratio)}`,
    kneeLabel && `KNEE ${kneeLabel}`,
    graph.sustain && `COMP ${fmtControlValue(graph.sustain)}`
  ].filter((value): value is string => !!value));
</script>

<div class="wrap">
  <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label="Compressor transfer curve">
    <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="10" fill="var(--bg)" stroke="var(--border)" />
    {#each [-40, -20, 0] as db}
      <line x1={xOf(db)} y1="0" x2={xOf(db)} y2={H} stroke="var(--border)" />
      <line x1="0" y1={yOf(db)} x2={W} y2={yOf(db)} stroke="var(--border)" />
    {/each}
    <line x1={xOf(MIN)} y1={yOf(MIN)} x2={xOf(MAX)} y2={yOf(MAX)} stroke="var(--border3)" stroke-dasharray="4 4" />
    {#if hasTransfer}
      <polyline points={curve} fill="none" stroke={accent} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    {:else}
      <text x={W / 2} y={H / 2 - 4} text-anchor="middle" fill="var(--textdim)" font-size="12">Sustain-style compressor</text>
      <text x={W / 2} y={H / 2 + 13} text-anchor="middle" fill="var(--textmuted)" font-size="10">Transfer curve unavailable</text>
    {/if}
    <text x="7" y={H - 7} fill="var(--textmuted)" font-size="9" font-family="var(--font-mono)">INPUT</text>
    <text x="7" y="13" fill="var(--textmuted)" font-size="9" font-family="var(--font-mono)">OUTPUT</text>
  </svg>
  <div class="hud mono">{#each readouts as value}<span>{value}</span>{/each}</div>
</div>

<style>
  .wrap { position: relative; width: 100%; height: 100%; min-height: 110px; }
  svg { display: block; width: 100%; height: 100%; }
  .hud { position: absolute; top: 8px; right: 10px; display: flex; gap: 10px; align-items: center; padding: 5px 8px; border: 1px solid var(--border2); border-radius: 7px; background: color-mix(in srgb, var(--bg) 82%, transparent); color: var(--textdim); font-size: 10px; pointer-events: none; }
  @media (max-width: 600px) { .hud span:nth-of-type(n + 3) { display: none; } }
</style>
