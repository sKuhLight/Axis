<script lang="ts">
  import type { NamedParam } from './types';
  import { paramValue, normFromValue, fmtCompact } from './format';
  import type { EQShape } from './eq';

  export interface EQBand {
    key: string;
    gain: NamedParam;
    freq?: NamedParam; // draggable frequency (PEQ); absent for GEQ (fixed)
    q?: NamedParam;
    centerHz?: number; // GEQ fixed frequency
    shape?: EQShape; // curve shape from the band type
  }
  let {
    bands,
    gainRange = 20,
    accent = '#35c9d6',
    onSet
  }: { bands: EQBand[]; gainRange?: number; accent?: string; onSet: (p: NamedParam, norm: number) => void } = $props();

  let cw = $state(560); // measured → real px so nodes stay round (no aspect stretch)
  let ch = $state(210); // measured height → the graph fills its widget (scales with size)
  const H = $derived(Math.max(110, ch));
  const FMIN = 20;
  const FMAX = 20000;
  const lx = Math.log10(FMIN);
  const rx = Math.log10(FMAX);
  const xOf = (hz: number) => ((Math.log10(Math.max(FMIN, Math.min(FMAX, hz))) - lx) / (rx - lx)) * cw;
  const yOf = (db: number) => H / 2 - (db / gainRange) * (H / 2 - 12);
  const hzAt = (px: number) => Math.pow(10, lx + (Math.max(0, Math.min(cw, px)) / cw) * (rx - lx));
  const dbAt = (py: number) => ((H / 2 - py) / (H / 2 - 12)) * gainRange;

  const GRID_F = [50, 100, 500, 1000, 5000, 10000];
  const flbl = (f: number) => (f >= 1000 ? f / 1000 + 'k' : '' + f);

  const model = $derived(
    bands.map((b) => ({
      band: b,
      shape: b.shape ?? 'bell',
      gv: paramValue(b.gain),
      fv: b.centerHz ?? (b.freq ? paramValue(b.freq) : 1000),
      qv: b.q ? paramValue(b.q) : 1.4
    }))
  );

  function bandDb(shape: EQShape, f: number, fc: number, gain: number, q: number): number {
    const L = Math.log10(f) - Math.log10(fc);
    if (shape === 'bell') {
      const s = 0.34 / Math.max(0.3, q);
      const d = L / s;
      return gain * Math.exp(-0.5 * d * d);
    }
    if (shape === 'lowshelf') return gain * (1 / (1 + Math.pow(10, 2.2 * L)));
    if (shape === 'highshelf') return gain * (1 / (1 + Math.pow(10, -2.2 * L)));
    if (shape === 'lowcut') return f < fc ? Math.max(-40, -12 * Math.log2(fc / f)) : 0;
    if (shape === 'highcut') return f > fc ? Math.max(-40, -12 * Math.log2(f / fc)) : 0;
    return 0;
  }

  const STEPS = 140;
  const curve = $derived.by(() => {
    const pts: string[] = [];
    for (let i = 0; i <= STEPS; i++) {
      const px = (i / STEPS) * cw;
      const f = hzAt(px);
      let db = 0;
      for (const m of model) db += bandDb(m.shape, f, m.fv, m.gv, m.qv);
      pts.push(`${px.toFixed(1)},${yOf(Math.max(-gainRange, Math.min(gainRange, db))).toFixed(1)}`);
    }
    return 'M' + pts.join(' L');
  });
  const isCut = (s: EQShape) => s === 'lowcut' || s === 'highcut';
  // composite dB at a frequency (sum of all bands) — so nodes sit ON the curve, like FabFilter
  const compAt = (f: number) => model.reduce((s, m) => s + bandDb(m.shape, f, m.fv, m.gv, m.qv), 0);
  const nodeY = (m: (typeof model)[number]) => yOf(Math.max(-gainRange, Math.min(gainRange, compAt(m.fv))));

  // ── drag + readout ──
  let drag: { band: EQBand; shape: EQShape } | null = null;
  let hud = $state<{ f: string; g: string; q: string } | null>(null);
  function readout(m: (typeof model)[number]) {
    hud = {
      f: fmtCompact(m.band.freq ? m.band.freq : { norm: normFromValue(m.fv, { min: 20, max: 20000, log: true }), value: m.fv, unit: 'Hz', min: 20, max: 20000, log: true }),
      g: isCut(m.shape) ? '—' : fmtCompact(m.band.gain),
      q: m.band.q ? fmtCompact(m.band.q) : '—'
    };
  }
  function down(e: PointerEvent, m: (typeof model)[number]) {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag = { band: m.band, shape: m.shape };
    readout(m);
  }
  function move(e: PointerEvent, svg: SVGSVGElement) {
    if (!drag) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * cw;
    const py = ((e.clientY - r.top) / r.height) * H;
    const b = drag.band;
    if (b.freq) onSet(b.freq, normFromValue(hzAt(px), b.freq));
    if (!isCut(drag.shape)) onSet(b.gain, normFromValue(dbAt(py), b.gain));
    const m = model.find((x) => x.band.key === b.key);
    if (m) readout(m);
  }
  function up() {
    drag = null;
    hud = null;
  }
  function wheel(e: WheelEvent, b: EQBand) {
    if (!b.q) return;
    e.preventDefault();
    onSet(b.q, Math.max(0, Math.min(1, (b.q.norm ?? 0) - e.deltaY / 1200)));
  }
</script>

<div class="eqwrap" bind:clientWidth={cw} bind:clientHeight={ch}>
  <svg
    class="eq"
    width={cw}
    height={H}
    role="application"
    aria-label="EQ response"
    onpointermove={(e) => move(e, e.currentTarget)}
    onpointerup={up}
    onpointerleave={up}
  >
    <rect x="0.5" y="0.5" width={cw - 1} height={H - 1} rx="11" fill="#0d0d10" stroke="#1f1f25" stroke-width="1" />
    <line x1="0" y1={H / 2} x2={cw} y2={H / 2} stroke="#2a2a31" stroke-width="1" />
    {#each GRID_F as f (f)}
      <line x1={xOf(f)} y1="0" x2={xOf(f)} y2={H} stroke="#16161b" stroke-width="1" />
      <text x={xOf(f) + 3} y={H - 5} fill="#4a4a52" font-size="9" font-family="var(--font-mono)">{flbl(f)}</text>
    {/each}
    <path d="{curve} L{cw},{H / 2} L0,{H / 2} Z" fill={accent} opacity="0.12" />
    <path d={curve} fill="none" stroke={accent} stroke-width="2" />
    {#each model as m (m.band.key)}
      <g class="node" class:fixed={!m.band.freq} onpointerdown={(e) => down(e, m)} onwheel={(e) => wheel(e, m.band)} role="button" tabindex="-1" aria-label="{m.band.gain.name} band">
        <circle cx={xOf(m.fv)} cy={nodeY(m)} r="13" fill="transparent" />
        <circle cx={xOf(m.fv)} cy={nodeY(m)} r="6.5" fill={accent} stroke="#0c0c0e" stroke-width="2" />
      </g>
    {/each}
  </svg>
  {#if hud}
    <div class="rd mono">
      <span><b>{hud.f}</b> Hz</span><span><b>{hud.g}</b> dB</span><span>Q <b>{hud.q}</b></span>
    </div>
  {/if}
</div>

<style>
  .eqwrap {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 110px;
  }
  .eq {
    display: block;
    border-radius: 11px;
    touch-action: none;
  }
  .node {
    cursor: grab;
  }
  .node.fixed {
    cursor: ns-resize;
  }
  .node:active {
    cursor: grabbing;
  }
  .rd {
    position: absolute;
    top: 8px;
    left: 10px;
    display: flex;
    gap: 12px;
    padding: 5px 10px;
    background: rgba(10, 10, 12, 0.82);
    border: 1px solid var(--border2);
    border-radius: 8px;
    font-size: 11px;
    color: var(--text-mut);
    pointer-events: none;
  }
  .rd b {
    color: var(--text);
    font-weight: 700;
  }
</style>
