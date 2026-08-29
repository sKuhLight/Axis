<script lang="ts">
  import { fmtControlValue } from './format';
  import type { AdsrGraphSpec } from './adsrGraphs';

  let { graph, accent = '#35c9d6' }: { graph: AdsrGraphSpec; accent?: string } = $props();

  const W = 360;
  const H = 130;
  const PAD = 18;
  const time = (param: typeof graph.attack) => Math.max(0.02, param?.norm ?? 0.1);
  const sustainLevel = $derived(Math.max(0, Math.min(1, graph.level?.norm ?? 0.5)));
  const threshold = $derived(Math.max(0, Math.min(1, graph.threshold?.norm ?? 0.5)));
  const curve = $derived.by(() => {
    const attack = time(graph.attack);
    const decay = time(graph.decay);
    const sustain = time(graph.sustain);
    const release = time(graph.release);
    const total = attack + decay + sustain + release;
    const x = (part: number) => PAD + (part / total) * (W - PAD * 2);
    const y = (level: number) => H - PAD - level * (H - PAD * 2);
    const p0 = { x: x(0), y: y(0) };
    const p1 = { x: x(attack), y: y(1) };
    const p2 = { x: x(attack + decay), y: y(sustainLevel) };
    const p3 = { x: x(attack + decay + sustain), y: y(sustainLevel) };
    const p4 = { x: x(total), y: y(0) };
    // Quadratic segments with the control point pinned to (start.x, end.y): a fast
    // initial move that flattens out by the segment's end, matching the exponential
    // attack/decay/release shape of a hardware envelope display (vs. linear ramps).
    return `M ${p0.x} ${p0.y} Q ${p0.x} ${p1.y} ${p1.x} ${p1.y} Q ${p1.x} ${p2.y} ${p2.x} ${p2.y} L ${p3.x} ${p3.y} Q ${p3.x} ${p4.y} ${p4.x} ${p4.y}`;
  });
  const readouts = $derived([
    graph.attack && `A ${fmtControlValue(graph.attack)}`,
    graph.decay && `D ${fmtControlValue(graph.decay)}`,
    graph.sustain && `S ${fmtControlValue(graph.sustain)}`,
    graph.release && `R ${fmtControlValue(graph.release)}`
  ].filter((value): value is string => !!value));
</script>

<div class="wrap">
  <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label="{graph.title} envelope">
    <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="10" fill="var(--bg)" stroke="var(--border)" />
    <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--border2)" />
    {#if graph.threshold}
      <line x1={PAD} y1={H - PAD - threshold * (H - PAD * 2)} x2={W - PAD} y2={H - PAD - threshold * (H - PAD * 2)} stroke="var(--border3)" stroke-dasharray="4 4" />
      <text x={W - PAD} y={H - PAD - threshold * (H - PAD * 2) - 4} text-anchor="end" fill="var(--textmuted)" font-size="9" font-family="var(--font-mono)">THRESH</text>
    {/if}
    <path d={curve} fill="none" stroke={accent} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
    <text x={PAD} y={H - 6} fill="var(--textmuted)" font-size="9" font-family="var(--font-mono)">LEVEL</text>
    <text x={W - PAD} y={H - 6} text-anchor="end" fill="var(--textmuted)" font-size="9" font-family="var(--font-mono)">TIME</text>
  </svg>
  <div class="hud mono">{#each readouts as value}<span>{value}</span>{/each}</div>
</div>

<style>
  .wrap { position: relative; width: 100%; height: 100%; min-height: 110px; }
  svg { display: block; width: 100%; height: 100%; }
  .hud { position: absolute; top: 8px; right: 10px; display: flex; gap: 10px; align-items: center; padding: 5px 8px; border: 1px solid var(--border2); border-radius: 7px; background: color-mix(in srgb, var(--bg) 82%, transparent); color: var(--textdim); font-size: 10px; pointer-events: none; }
  @media (max-width: 600px) { .hud span:nth-of-type(n + 3) { display: none; } }
</style>
