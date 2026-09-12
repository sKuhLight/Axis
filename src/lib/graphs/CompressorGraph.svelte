<script lang="ts">
  import { paramValue } from '$lib/ui/format';
  import {
    GRAPH_MAX_DB, GRAPH_MIN_DB,
    ratioCurveY, ratioDotPosition, ratioTransfer, sustainCurveY, sustainDotPosition, sustainTransfer,
    type CompressorGraphSpec
  } from './compressorGraphs';
  import type { LiveMonitor } from '$lib/api/types';

  let { graph, accent = '#35c9d6', live = null }: { graph: CompressorGraphSpec; accent?: string; live?: LiveMonitor | null } = $props();

  // Square drawing box so the dB grid cells and the 1:1 reference line read true, like the FM3 editor.
  const W = 200;
  const H = 200;
  // The window the FM3 editor plots, which is NOT the Threshold knob's own -60..+20 range — see the
  // measurement note in `compressorGraphs.ts`.
  const MIN = GRAPH_MIN_DB;
  const MAX = GRAPH_MAX_DB;
  // The plot area IS the box: the curve runs edge to edge, as it does in the FM3 editor, and the grid
  // lines land on true quarters. Anything that would poke past the rounded corners (the 1:1 line's
  // endpoints, the live dot at rest) is clipped by `.wrap`, which carries the same corner radius.
  const PAD = 0;
  // Two kinds of compressor own this slot. Threshold/Ratio models compute their curve from their own
  // two params. Sustain-style models (a "Compression" knob, no Threshold/Ratio) get the fitted editor
  // curve — the device reports Threshold/Ratio frozen for them, so there is nothing to compute from;
  // see the SUSTAIN_* note in `compressorGraphs.ts`.
  const ratioStyle = $derived(!!graph.threshold && !!graph.ratio);
  const sustainStyle = $derived(!ratioStyle && !!graph.sustain);
  const hasTransfer = $derived(ratioStyle || sustainStyle);
  // COMP_LEVEL rides along on both curves: the editor draws the block's output level as part of the
  // transfer, measured off two presets whose Level differed. The sustain model works in normalised
  // graph units, so its share is the same dB divided by the axis span.
  const levelDb = $derived(graph.level ? paramValue(graph.level) : 0);
  const transfer = $derived(sustainStyle ? sustainTransfer(paramValue(graph.sustain!), levelDb / (MAX - MIN)) : null);
  // Threshold/Ratio models get their corner rounded by COMP_KNEE, which is how the FM3 editor draws it;
  // a hard corner was the visible difference on presets like 007. Variants with no Knee dropdown fall
  // back to the device's own default. See the knee note in `compressorGraphs.ts`.
  const ratio = $derived(ratioStyle
    ? ratioTransfer({ threshold: paramValue(graph.threshold!), ratio: paramValue(graph.ratio!), knee: graph.knee, level: levelDb, variant: graph.variant })
    : null);
  const xOf = (db: number) => PAD + ((db - MIN) / (MAX - MIN)) * (W - PAD * 2);
  const yOf = (db: number) => H - PAD - ((db - MIN) / (MAX - MIN)) * (H - PAD * 2);
  // The sustain model works in normalised graph space (0..1 on both axes) because that is how the
  // editor's own quartered grid is drawn; this plots it on the same dB window as the other curve.
  const xOfNorm = (n: number) => xOf(MIN + n * (MAX - MIN));
  const yOfNorm = (n: number) => yOf(MIN + n * (MAX - MIN));
  const curve = $derived.by(() => {
    if (!hasTransfer) return '';
    const points: string[] = [];
    if (transfer) {
      for (let i = 0; i <= 96; i++) {
        const input = i / 96;
        points.push(`${xOfNorm(input).toFixed(1)},${yOfNorm(sustainCurveY(input, transfer)).toFixed(1)}`);
      }
      return points.join(' ');
    }
    for (let i = 0; i <= 96; i++) {
      const input = MIN + ((MAX - MIN) * i) / 96;
      points.push(`${xOf(input).toFixed(1)},${yOf(ratioCurveY(input, ratio!)).toFixed(1)}`);
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
    if (transfer) {
      // Same idea on the sustain curve, in its normalised space: reduction maps to a point on the
      // curve, and no reduction rests at the silent corner.
      const pos = sustainDotPosition(transfer, -live.db / (MAX - MIN));
      if (!pos) return { input: MIN, output: MIN };
      const input = Math.min(1, pos.input);
      return { input: MIN + input * (MAX - MIN), output: MIN + sustainCurveY(input, transfer) * (MAX - MIN) };
    }
    const pos = ratioDotPosition(ratio!, -live.db);
    if (!pos) return { input: MIN, output: MIN };
    // Clamp ALONG the curve (recompute via the same formula `curve` samples), not per-axis — heavy
    // reduction can push the inferred input past the graph's right edge, and clamping x alone while
    // keeping the unclamped y would float the dot above the line instead of riding it to the edge.
    if (pos.input > MAX) return { input: MAX, output: ratioCurveY(MAX, ratio!) };
    return pos;
  });
  // Percent-of-box position for the CSS dot overlay — kept out of the SVG's own coordinate space
  // (which uses preserveAspectRatio="none" to stretch to the box) because a <circle> drawn in that
  // stretched space renders as an ellipse, not a dot.
  const dotPct = $derived(dot && { left: (xOf(dot.input) / W) * 100, top: (yOf(dot.output) / H) * 100 });
</script>

<div class="wrap">
  <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-label="Compressor transfer curve">
    <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="10" fill="var(--bg)" stroke="var(--border)" />
    <!-- Quarters of the box, which is how the editor draws its grid — on a -80..+20 window that puts
         the lines on -55 / -30 / -5 dB, so they are deliberately not round dB values. -->
    {#each [0.25, 0.5, 0.75] as q}
      <line x1={q * W} y1="0" x2={q * W} y2={H} stroke="var(--border)" />
      <line x1="0" y1={q * H} x2={W} y2={q * H} stroke="var(--border)" />
    {/each}
    <line x1={xOf(MIN)} y1={yOf(MIN)} x2={xOf(MAX)} y2={yOf(MAX)} stroke="var(--border3)" stroke-dasharray="4 4" />
    {#if hasTransfer}
      <polyline points={curve} fill="none" stroke={accent} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
    {:else}
      <text x={W / 2} y={H / 2 - 4} text-anchor="middle" fill="var(--textdim)" font-size="12">No transfer controls</text>
      <text x={W / 2} y={H / 2 + 13} text-anchor="middle" fill="var(--textmuted)" font-size="10">This model exposes no curve</text>
    {/if}
  </svg>
  {#if dotPct}
    <div class="livedot" style:left="{dotPct.left}%" style:top="{dotPct.top}%" style:background={accent}></div>
  {/if}
</div>

<style>
  /* Largest square that fits the slot: width drives it, max-height clamps it back when the slot is short. */
  /* Square box, clipped to the same corner radius the SVG border draws (rx=10 of a 200-unit
     viewBox = 5% of the side), so an edge-to-edge curve and a resting dot cannot overhang it. */
  .wrap { position: relative; width: 100%; max-height: 100%; aspect-ratio: 1; margin: 0 auto; min-height: 110px; overflow: hidden; border-radius: 5%; }
  svg { display: block; width: 100%; height: 100%; }
  .livedot { position: absolute; width: 13px; height: 13px; margin: -6.5px 0 0 -6.5px; border-radius: 50%; border: 2px solid var(--bg); box-shadow: 0 0 0 1px var(--border2); pointer-events: none; transition: left 90ms linear, top 90ms linear; }
</style>
