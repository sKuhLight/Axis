<script lang="ts">
  import { onMount } from 'svelte';
  import { paramValue } from './format';
  import { currentLabel, modulationRate, modulationValue, type ModulationGraphSpec } from './modulationGraphs';

  let { graph, accent = '#35c9d6', bpm = 120 }: { graph: ModulationGraphSpec; accent?: string; bpm?: number } = $props();

  const W = 96;
  const H = 96;
  let elapsed = $state(0);
  let reducedMotion = $state(false);
  // Read the enum fields directly so this component follows the dropdown's optimistic value update.
  const typeValue = $derived(graph.type?.value);
  const typeOptions = $derived(graph.type?.options);
  const shapeName = $derived(typeOptions?.find((option) => option.value === typeValue)?.label.toLowerCase());
  const amplitudeParam = $derived(graph.depth ?? graph.width);
  const amplitude = $derived(amplitudeParam ? Math.max(0, Math.min(1, amplitudeParam.norm ?? 0)) : 0.72);
  const center = $derived(graph.center ? ((graph.center.norm ?? 0.5) - 0.5) * 2 : 0);
  const duty = $derived(graph.duty ? Math.max(0.05, Math.min(0.95, graph.duty.norm ?? 0.5)) : 0.5);
  const shape = $derived(Math.max(0.01, Math.min(0.99, graph.shape?.norm ?? 0.5)));
  const freeRate = $derived(graph.rate ? paramValue(graph.rate) : 0.5);
  const rate = $derived(Math.max(0.01, modulationRate(Number.isFinite(freeRate) ? freeRate : 0.5, currentLabel(graph.tempo), bpm)));
  const running = $derived(currentLabel(graph.run)?.trim().toLowerCase() !== 'stop');
  const quantize = $derived.by(() => {
    const label = currentLabel(graph.quantize)?.trim();
    if (!label || label.toUpperCase() === 'OFF') return 0;
    const levels = Number(label);
    return Number.isFinite(levels) && levels >= 2 ? levels : 0;
  });
  const highCut = $derived(graph.highCut ? paramValue(graph.highCut) : Infinity);
  const curve = $derived.by(() => {
    if (!shapeName) return '';
    const points: string[] = [];
    // The hardware graph is an oscilloscope: the trace remains until the sweep restarts.
    const scan = reducedMotion || !running ? 1 : (elapsed * rate) % 1;
    const cycle = running && !reducedMotion ? Math.floor(elapsed * rate) : 0;
    const samples = 96;
    const end = Math.floor(scan * samples);
    const alpha = Number.isFinite(highCut)
      ? 1 - Math.exp((-2 * Math.PI * Math.max(0.01, highCut)) / (rate * samples))
      : 1;
    let filtered = 0;
    // Pre-roll settles the periodic low-pass before the visible sweep starts.
    for (let i = -samples; i <= end; i++) {
      const position = i / samples;
      const t = position % 1;
      let v = modulationValue(shapeName, t, { duty, shape, randomSeed: cycle });
      if (quantize) v = (Math.round(((v + 1) / 2) * (quantize - 1)) / (quantize - 1)) * 2 - 1;
      filtered += alpha * (v - filtered);
      if (i < 0) continue;
      const x = position * W;
      const output = Math.max(-1, Math.min(1, center + filtered * amplitude));
      points.push(`${x.toFixed(1)},${(H / 2 - output * H * 0.42).toFixed(1)}`);
    }
    return points.join(' ');
  });

  onMount(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const tick = (now: number) => {
      frame = 0;
      elapsed = now / 1000;
      if (!reducedMotion) frame = requestAnimationFrame(tick);
    };
    const updateMotion = () => {
      reducedMotion = media.matches;
      if (!reducedMotion && !frame) frame = requestAnimationFrame(tick);
    };
    updateMotion();
    media.addEventListener('change', updateMotion);

    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener('change', updateMotion);
    };
  });
</script>

<div class="wrap">
  <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label="{graph.title} waveform">
    <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="10" fill="var(--bg)" stroke="var(--border)" />
    {#each [0.25, 0.5, 0.75] as x}<line x1={W * x} y1="0" x2={W * x} y2={H} stroke="var(--border)" />{/each}
    <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="var(--border2)" />
    <polyline points={curve} fill="none" stroke={accent} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
  </svg>
</div>

<style>
  .wrap { position: relative; width: min(100%, 83px); aspect-ratio: 1; margin: 0 auto; }
  svg { display: block; width: 100%; height: 100%; }
</style>
