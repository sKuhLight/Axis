<script lang="ts">
  import { fmtControlValue, paramValue } from './format';
  import { currentLabel, type ModulationGraphSpec } from './modulationGraphs';

  let { graph, accent = '#35c9d6' }: { graph: ModulationGraphSpec; accent?: string } = $props();

  const W = 360;
  const H = 130;
  const shapeName = $derived((currentLabel(graph.type) ?? 'Sine').toLowerCase());
  const phase = $derived((paramValue(graph.phase ?? {}) / 360) % 1);
  const amplitude = $derived(graph.depth ? 0.14 + (graph.depth.norm ?? 0) * 0.7 : 0.72);
  const duty = $derived(graph.duty ? Math.max(0.05, Math.min(0.95, graph.duty.norm ?? 0.5)) : 0.5);
  const curve = $derived.by(() => {
    const points: string[] = [];
    for (let i = 0; i <= 96; i++) {
      const x = (i / 96) * W;
      const t = (i / 96 + phase) % 1;
      let v: number;
      if (/square|pulse/.test(shapeName)) v = t < duty ? 1 : -1;
      else if (/triangle/.test(shapeName)) v = 1 - 4 * Math.abs(t - 0.5);
      else if (/saw|ramp/.test(shapeName)) v = 1 - 2 * t;
      else if (/random|noise/.test(shapeName)) v = Math.sin(i * 13.17) * 0.7 + Math.sin(i * 3.91) * 0.3;
      else v = Math.sin(t * Math.PI * 2);
      points.push(`${x.toFixed(1)},${(H / 2 - v * amplitude * H * 0.42).toFixed(1)}`);
    }
    return points.join(' ');
  });
  const readouts = $derived([
    graph.rate && `RATE ${fmtControlValue(graph.rate)}`,
    graph.depth && `DEPTH ${fmtControlValue(graph.depth)}`,
    graph.duty && `DUTY ${fmtControlValue(graph.duty)}`,
    graph.phase && `PHASE ${fmtControlValue(graph.phase)}`
  ].filter((value): value is string => !!value));
</script>

<div class="wrap">
  <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label="{graph.title} waveform">
    <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="10" fill="var(--bg)" stroke="var(--border)" />
    {#each [0.25, 0.5, 0.75] as x}<line x1={W * x} y1="0" x2={W * x} y2={H} stroke="var(--border)" />{/each}
    <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="var(--border2)" />
    <polyline points={curve} fill="none" stroke={accent} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
  </svg>
  <div class="hud mono"><b>{currentLabel(graph.type) ?? 'Sine'}</b>{#each readouts as value}<span>{value}</span>{/each}</div>
</div>

<style>
  .wrap { position: relative; width: 100%; height: 100%; min-height: 110px; }
  svg { display: block; width: 100%; height: 100%; }
  .hud { position: absolute; top: 8px; right: 10px; display: flex; gap: 10px; align-items: center; padding: 5px 8px; border: 1px solid var(--border2); border-radius: 7px; background: color-mix(in srgb, var(--bg) 82%, transparent); color: var(--textdim); font-size: 10px; pointer-events: none; }
  .hud b { color: var(--text); font-weight: 700; }
  @media (max-width: 600px) { .hud span:nth-of-type(n + 3) { display: none; } }
</style>
