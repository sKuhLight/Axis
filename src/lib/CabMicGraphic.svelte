<script lang="ts">
  // Dynacab mic-position graphic — a shaded speaker-cone illustration with a draggable dot marking
  // where the mic sits, next to the block's own Level/Pan/Position/Distance/Mic knobs (FM3-Edit's Cab
  // panel). The dot is bound to Position only: Position is the one knob that genuinely describes a
  // spot on the cone face (dead-center/on-axis → edge/off-axis), so dragging straight down the cone
  // sweeps it 0→1 — the same direction the knob's own norm already means. Pan here is the cab's
  // *output* stereo pan (bipolar_percent, mixing this cab left/right in the master bus), not a mic
  // placement — so it stays a text readout, never a drag axis, to avoid implying a spatial meaning it
  // doesn't have. Distance (mic-to-cone) isn't a point on this flat image either; it reads instead as
  // a depth cue — the dot grows and glows warmer as the mic gets closer — and stays a readout + knob.
  import { getEditorSurface } from './editorSurface';
  import type { NamedParam } from './types';
  import type { CabMicGraphSpec } from './cabMicGraphs';

  const editor = getEditorSurface();

  let { graph, accent = '#35c9d6', onSet }: { graph: CabMicGraphSpec; accent?: string; onSet: (p: NamedParam, norm: number) => void } = $props();

  // The spec holds stale NamedParam references (derived once from the layout, not re-read on a live
  // drag). Re-resolve each control from the LIVE param/enum lists by id so the readouts and the drag
  // track `editor.setParam`'s in-place `norm`/`value` writes instead of the snapshot.
  const liveParam = (id?: number): NamedParam | undefined =>
    id == null ? undefined : editor.params.find((p) => p.id === id);
  const position = $derived(liveParam(graph.position.id));
  const distance = $derived(liveParam(graph.distance?.id));

  const W = 240;
  const H = 210;
  const CX = W / 2;
  const CY = H / 2 + 8;
  const R = 82; // cone outer radius
  const TRAVEL = R * 0.78; // dust cap → cone edge, straight right

  const posNorm = $derived(Math.max(0, Math.min(1, position?.norm ?? 0)));
  const distNorm = $derived(distance ? Math.max(0, Math.min(1, distance.norm ?? 0)) : 0.5);
  const dotX = $derived(CX - R * 0.1 + posNorm * TRAVEL);
  const dotR = $derived(9 - distNorm * 3.5); // closer mic reads bigger…
  const dotGlow = $derived(0.4 - distNorm * 0.22); // …and with a warmer glow

  let dragging = $state(false);
  function down(e: PointerEvent) {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragging = true;
  }
  function move(e: PointerEvent, svg: SVGSVGElement) {
    if (!dragging || !position) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    onSet(position, Math.max(0, Math.min(1, (px - (CX - R * 0.1)) / TRAVEL)));
  }
  function up() {
    dragging = false;
  }

  const gid = $derived(`cabmic-${graph.key}`);
</script>

<div class="wrap">
  <svg
    viewBox="0 0 {W} {H}"
    role="application"
    aria-label="{graph.title} mic position"
    onpointermove={(e) => move(e, e.currentTarget)}
    onpointerup={up}
    onpointerleave={up}
  >
    <defs>
      <radialGradient id="{gid}-rim" cx="42%" cy="38%" r="75%">
        <stop offset="0%" stop-color="#3a3d43" />
        <stop offset="55%" stop-color="#232529" />
        <stop offset="100%" stop-color="#131417" />
      </radialGradient>
      <radialGradient id="{gid}-cone" cx="40%" cy="34%" r="80%">
        <stop offset="0%" stop-color="#4a4d54" />
        <stop offset="35%" stop-color="#302f33" />
        <stop offset="75%" stop-color="#1a191c" />
        <stop offset="100%" stop-color="#0c0c0e" />
      </radialGradient>
      <radialGradient id="{gid}-cap" cx="38%" cy="34%" r="70%">
        <stop offset="0%" stop-color="#6b6e75" />
        <stop offset="45%" stop-color="#3c3e43" />
        <stop offset="100%" stop-color="#1c1d20" />
      </radialGradient>
      <radialGradient id="{gid}-glow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color={accent} stop-opacity={dotGlow} />
        <stop offset="100%" stop-color={accent} stop-opacity="0" />
      </radialGradient>
    </defs>

    <rect x="0.5" y="0.5" width={W - 1} height={H - 1} rx="11" fill="var(--bg)" stroke="var(--border)" />

    <!-- basket / rubber surround -->
    <circle cx={CX} cy={CY} r={R} fill="url(#{gid}-rim)" stroke="#000" stroke-opacity="0.35" />
    <!-- paper cone -->
    <circle cx={CX} cy={CY} r={R * 0.86} fill="url(#{gid}-cone)" />
    <!-- corrugation ridges — faint concentric rings, the way a real cone catches light -->
    {#each [0.32, 0.5, 0.66, 0.8] as t}
      <circle cx={CX} cy={CY} r={R * 0.86 * t} fill="none" stroke="#000" stroke-opacity="0.22" stroke-width="1" />
      <circle cx={CX - R * 0.86 * t * 0.05} cy={CY - R * 0.86 * t * 0.05} r={R * 0.86 * t} fill="none" stroke="#fff" stroke-opacity="0.05" stroke-width="1" />
    {/each}
    <!-- dust cap -->
    <circle cx={CX} cy={CY} r={R * 0.16} fill="url(#{gid}-cap)" stroke="#000" stroke-opacity="0.4" />
    <ellipse cx={CX - R * 0.05} cy={CY - R * 0.06} rx={R * 0.06} ry={R * 0.035} fill="#fff" opacity="0.22" />

    <!-- mic travel path (dust cap → edge) -->
    <line x1={CX - R * 0.1} y1={CY} x2={CX - R * 0.1 + TRAVEL} y2={CY} stroke={accent} stroke-opacity="0.28" stroke-width="1.5" stroke-dasharray="1.5 3" />

    <!-- mic dot -->
    <circle cx={dotX} cy={CY} r={dotR + 10} fill="url(#{gid}-glow)" />
    <g class="dot" onpointerdown={down} role="slider" aria-label="{graph.title} position" aria-valuenow={Math.round(posNorm * 100)} aria-valuemin="0" aria-valuemax="100" tabindex="0">
      <circle cx={dotX} cy={CY} r={dotR + 9} fill="transparent" />
      <circle cx={dotX} cy={CY} r={dotR} fill={accent} stroke="var(--bg)" stroke-width="2" />
    </g>
  </svg>
</div>

<style>
  .wrap {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 150px;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
  }
  .dot {
    cursor: grab;
  }
  .dot:active {
    cursor: grabbing;
  }
</style>
