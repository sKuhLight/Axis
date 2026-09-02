<script lang="ts">
  import { fmtControlValue, paramValue } from './format';
  import { compressorDotPosition, type CompressorGraphSpec } from './compressorGraphs';
  import type { LiveMonitor } from './types';

  let { graph, accent = '#35c9d6', live = null }: { graph: CompressorGraphSpec; accent?: string; live?: LiveMonitor | null } = $props();

  const W = 360;
  const H = 130;
  const MIN = -60;
  const MAX = 20;
  // Inset by the rect's corner radius (rx=10 below) so the curve/reference-line endpoints — which
  // sit exactly at (MIN,MIN) and (MAX,MAX) — land inside the rounded corners instead of poking past them.
  const PAD = 10;
  const hasTransfer = $derived(!!graph.threshold && !!graph.ratio);
  const kneeLabel = $derived(graph.knee?.options.find((option) => option.value === graph.knee?.value)?.label);
  const xOf = (db: number) => PAD + ((db - MIN) / (MAX - MIN)) * (W - PAD * 2);
  const yOf = (db: number) => H - PAD - ((db - MIN) / (MAX - MIN)) * (H - PAD * 2);
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
  // Live signal position on the curve, inferred from gain reduction (the only live value the device
  // reports for a compressor — confirmed against FM3-Edit's own wire traffic, it has no richer data
  // either). `live.db` is 0 at idle/unity and negative as reduction increases; a non-negative reading
  // (idle, or the COMP_GAINMONITOR pid's alternate 0..+40 makeup-gain display mode on some Comp Types)
  // has no reduction to place on the curve, so the dot rests at the silent corner (MIN,MIN) instead —
  // only the total absence of a live reading (metering off) hides it outright.
  const dot = $derived.by(() => {
    if (!hasTransfer || live?.db == null) return null;
    const threshold = paramValue(graph.threshold!);
    const ratio = Math.max(1, paramValue(graph.ratio!));
    const pos = compressorDotPosition(threshold, ratio, -live.db);
    if (!pos) return { input: MIN, output: MIN };
    // Clamp ALONG the curve (recompute via the same formula `curve` samples), not per-axis — heavy
    // reduction can push the inferred input past the graph's right edge, and clamping x alone while
    // keeping the unclamped y would float the dot above the line instead of riding it to the edge.
    if (pos.input > MAX) return { input: MAX, output: threshold + (MAX - threshold) / ratio };
    return pos;
  });
  // Percent-of-box position for the CSS dot overlay — kept out of the SVG's own coordinate space
  // (which uses preserveAspectRatio="none" to stretch to the box) because a <circle> drawn in that
  // stretched space renders as an ellipse, not a dot.
  const dotPct = $derived(dot && { left: (xOf(dot.input) / W) * 100, top: (yOf(dot.output) / H) * 100 });
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
      <polyline points={curve} fill="none" stroke={accent} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
    {:else}
      <text x={W / 2} y={H / 2 - 4} text-anchor="middle" fill="var(--textdim)" font-size="12">Sustain-style compressor</text>
      <text x={W / 2} y={H / 2 + 13} text-anchor="middle" fill="var(--textmuted)" font-size="10">Transfer curve unavailable</text>
    {/if}
  </svg>
  {#if dotPct}
    <div class="livedot" style:left="{dotPct.left}%" style:top="{dotPct.top}%" style:background={accent}></div>
  {/if}
  <div class="hud mono">{#each readouts as value}<span>{value}</span>{/each}</div>
</div>

<style>
  .wrap { position: relative; width: 100%; height: 100%; min-height: 110px; }
  svg { display: block; width: 100%; height: 100%; }
  .hud { position: absolute; top: 8px; right: 10px; display: flex; gap: 10px; align-items: center; padding: 5px 8px; border: 1px solid var(--border2); border-radius: 7px; background: color-mix(in srgb, var(--bg) 82%, transparent); color: var(--textdim); font-size: 10px; pointer-events: none; }
  .livedot { position: absolute; width: 13px; height: 13px; margin: -6.5px 0 0 -6.5px; border-radius: 50%; border: 2px solid var(--bg); box-shadow: 0 0 0 1px var(--border2); pointer-events: none; transition: left 90ms linear, top 90ms linear; }
  @media (max-width: 600px) { .hud span:nth-of-type(n + 3) { display: none; } }
</style>
