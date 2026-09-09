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
  // Phase is authored in degrees; the graph starts that far into the cycle.
  const phaseOffset = $derived.by(() => {
    if (!graph.phase) return 0;
    const degrees = paramValue(graph.phase);
    return Number.isFinite(degrees) ? (((degrees / 360) % 1) + 1) % 1 : 0;
  });
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
  // How much LFO the box holds. A graph with no window spans exactly one cycle whatever the Rate is; one
  // with a window spans a fixed slice of time, so a faster LFO packs more cycles into the same box.
  const cycles = $derived(graph.windowSeconds ? Math.max(1, rate * graph.windowSeconds) : 1);
  // The pen crosses the box once per drawn window, which for a one-cycle box is once per LFO cycle.
  const sweepRate = $derived(graph.windowSeconds ? rate / cycles : rate);
  const curve = $derived.by(() => {
    if (!shapeName) return '';
    const points: string[] = [];
    // The hardware graph is an oscilloscope: the trace remains until the sweep restarts.
    const scan = reducedMotion || !running ? 1 : (elapsed * sweepRate) % 1;
    const sweep = running && !reducedMotion ? Math.floor(elapsed * sweepRate) : 0;
    // Enough points that every drawn cycle keeps its corners, however many the window holds.
    const samples = Math.min(768, 96 * Math.ceil(cycles));
    const end = Math.floor(scan * samples);
    // Seconds per sample, so High Cut bends the trace by as much as it would in real time.
    const dt = cycles / (rate * samples);
    const alpha = Number.isFinite(highCut) ? 1 - Math.exp(-2 * Math.PI * Math.max(0.01, highCut) * dt) : 1;
    let filtered = 0;
    // Pre-roll settles the periodic low-pass before the visible sweep starts.
    for (let i = -samples; i <= end; i++) {
      const position = i / samples;
      const elapsedCycles = position * cycles + phaseOffset;
      // Random draws a fresh value per cycle, so every cycle in the window needs its own seed — and a
      // window has to advance by all the cycles it holds, or the next sweep redraws part of this one.
      const seed = cycles > 1 ? Math.floor(sweep * cycles + elapsedCycles) : sweep;
      let v = modulationValue(shapeName, elapsedCycles % 1, { duty, shape, randomSeed: seed, randomSteps: graph.randomSteps });
      if (quantize) v = (Math.round(((v + 1) / 2) * (quantize - 1)) / (quantize - 1)) * 2 - 1;
      filtered += alpha * (v - filtered);
      if (i < 0) continue;
      const x = position * W;
      const output = Math.max(-1, Math.min(1, center + filtered * amplitude));
      points.push(`${x.toFixed(1)},${(H / 2 - output * H * 0.46).toFixed(1)}`);
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
    <!-- Even 4×4 grid, drawn like the FM3 editor: square cells in the square box, brighter centre line. -->
    {#each [0.25, 0.5, 0.75] as f}
      <line x1={W * f} y1="0" x2={W * f} y2={H} stroke={f === 0.5 ? 'var(--border2)' : 'var(--border)'} />
      <line x1="0" y1={H * f} x2={W} y2={H * f} stroke={f === 0.5 ? 'var(--border2)' : 'var(--border)'} />
    {/each}
    <polyline points={curve} fill="none" stroke={accent} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
  </svg>
</div>

<style>
  .wrap { position: relative; width: min(100%, 83px); aspect-ratio: 1; margin: 0 auto; }
  svg { display: block; width: 100%; height: 100%; }
</style>
