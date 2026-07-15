<script lang="ts">
  import type { NamedParam } from './types';
  import { paramValue, normFromValue, fmtCompact } from './format';
  import type { EQShape } from './eq';
  import { getEditorSurface } from './editorSurface';
  const editor = getEditorSurface();

  const mob = $derived(editor.isMobile);

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
  // On mobile there's no scroll-wheel, so a tapped node stays "selected": the readout HUD sticks
  // and exposes Q −/+ steppers. Desktop keeps the transient (drag-only) HUD + wheel-to-Q.
  let drag = $state<{ band: EQBand; shape: EQShape } | null>(null);
  let selKey = $state<string | null>(null); // mobile: persistently selected band
  const activeKey = $derived(drag?.band.key ?? (mob ? selKey : null));
  const activeM = $derived(activeKey ? model.find((x) => x.band.key === activeKey) : undefined);
  const hud = $derived.by(() => {
    const m = activeM;
    if (!m) return null;
    return {
      f: fmtCompact(m.band.freq ? m.band.freq : { norm: normFromValue(m.fv, { min: 20, max: 20000, log: true }), value: m.fv, unit: 'Hz', min: 20, max: 20000, log: true }),
      g: isCut(m.shape) ? '—' : fmtCompact(m.band.gain),
      q: m.band.q ? fmtCompact(m.band.q) : '—',
      hasQ: !!m.band.q,
      band: m.band
    };
  });
  function down(e: PointerEvent, m: (typeof model)[number]) {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag = { band: m.band, shape: m.shape };
    if (mob) selKey = m.band.key;
  }
  function move(e: PointerEvent, svg: SVGSVGElement) {
    if (!drag) return;
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * cw;
    const py = ((e.clientY - r.top) / r.height) * H;
    const b = drag.band;
    if (b.freq) onSet(b.freq, normFromValue(hzAt(px), b.freq));
    if (!isCut(drag.shape)) onSet(b.gain, normFromValue(dbAt(py), b.gain));
  }
  function up() {
    drag = null;
  }
  function wheel(e: WheelEvent, b: EQBand) {
    if (!b.q) return;
    e.preventDefault();
    onSet(b.q, Math.max(0, Math.min(1, (b.q.norm ?? 0) - e.deltaY / 1200)));
  }
  function bumpQ(b: EQBand, dir: number) {
    if (!b.q) return;
    onSet(b.q, Math.max(0, Math.min(1, (b.q.norm ?? 0) + dir * 0.06)));
  }
  // tapping empty graph area clears the mobile selection
  function bgTap() {
    if (mob && !drag) selKey = null;
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
    onpointerdown={bgTap}
  >
    <rect x="0.5" y="0.5" width={cw - 1} height={H - 1} rx="11" fill="var(--bg)" stroke="var(--border)" stroke-width="1" />
    <line x1="0" y1={H / 2} x2={cw} y2={H / 2} style="stroke:var(--border2)" stroke-width="1" />
    {#each GRID_F as f (f)}
      <line x1={xOf(f)} y1="0" x2={xOf(f)} y2={H} style="stroke:var(--border)" stroke-width="1" />
      <text x={xOf(f) + 3} y={H - 5} style="fill:var(--textmuted)" font-size="9" font-family="var(--font-mono)">{flbl(f)}</text>
    {/each}
    <path d="{curve} L{cw},{H / 2} L0,{H / 2} Z" fill={accent} opacity="0.12" />
    <path d={curve} fill="none" stroke={accent} stroke-width="2" />
    {#each model as m (m.band.key)}
      <g class="node" class:fixed={!m.band.freq} class:sel={activeKey === m.band.key} onpointerdown={(e) => down(e, m)} onwheel={(e) => wheel(e, m.band)} role="button" tabindex="-1" aria-label="{m.band.gain.name} band">
        <circle cx={xOf(m.fv)} cy={nodeY(m)} r={mob ? 22 : 13} fill="transparent" />
        {#if activeKey === m.band.key}
          <circle cx={xOf(m.fv)} cy={nodeY(m)} r={mob ? 15 : 12} fill={accent} opacity="0.18" />
        {/if}
        <circle cx={xOf(m.fv)} cy={nodeY(m)} r={mob ? 8.5 : 6.5} fill={accent} style="stroke:var(--bg)" stroke-width="2" />
      </g>
    {/each}
  </svg>
  {#if hud}
    <div class="rd mono" class:mob>
      <span><b>{hud.f}</b> Hz</span><span><b>{hud.g}</b> dB</span>
      {#if mob && hud.hasQ}
        <span class="qctl">Q <b>{hud.q}</b>
          <!-- svelte-ignore a11y_consider_explicit_label -->
          <button class="qbtn" onpointerdown={(e) => { e.stopPropagation(); bumpQ(hud.band, -1); }}>−</button>
          <button class="qbtn" onpointerdown={(e) => { e.stopPropagation(); bumpQ(hud.band, 1); }}>+</button>
        </span>
      {:else}
        <span>Q <b>{hud.q}</b></span>
      {/if}
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
    align-items: center;
    gap: 12px;
    padding: 5px 10px;
    background: color-mix(in srgb, var(--bg) 82%, transparent);
    border: 1px solid var(--border2);
    border-radius: 8px;
    font-size: 11px;
    color: var(--text-mut);
    pointer-events: none;
  }
  /* mobile: dock the readout to the TOP so it never covers the frequency-axis labels along the
     bottom edge, and re-enable pointer events so the Q steppers are tappable */
  .rd.mob {
    top: 6px;
    bottom: auto;
    left: 6px;
    right: 6px;
    justify-content: space-around;
    padding: 7px 10px;
    font-size: 12px;
    pointer-events: auto;
  }
  .rd b {
    color: var(--text);
    font-weight: 700;
  }
  .qctl {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }
  .qbtn {
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--surface2);
    border: 1px solid var(--border2);
    border-radius: 8px;
    color: var(--text);
    font-size: 17px;
    line-height: 1;
    cursor: pointer;
    touch-action: manipulation;
  }
  .qbtn:active {
    background: var(--accent);
    color: var(--accentink, #04242a);
  }
</style>
