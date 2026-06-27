<script lang="ts">
  import { onMount } from 'svelte';
  import { forgefx, ForgeError } from '$lib/forgefx';
  import type { NamedParam } from '$lib/types';
  import { layoutFromGrid, cablesFor, type Cell, type Layout } from '$lib/grid';
  import Knob from '$lib/Knob.svelte';

  let status = $state<'loading' | 'ready' | 'offline'>('loading');
  let layout = $state<Layout>({ cells: [], shunts: [], rows: 1, cols: 1, name: '', model: '', crcValid: true });

  const CW = 96, CH = 72, GAP = 8;
  const gw = $derived(Math.max(1, layout.cols) * (CW + GAP) - GAP);
  const gh = $derived(Math.max(1, layout.rows) * (CH + GAP) - GAP);
  const cables = $derived(cablesFor(layout, CW, CH, GAP));

  // ── block editor (live) ──
  let editing = $state<Cell | null>(null);
  let params = $state<NamedParam[]>([]);
  let sheetState = $state<'loading' | 'ready' | 'error' | 'nopack'>('loading');
  const CHANNELS = ['A', 'B', 'C', 'D'];
  const sendTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  let lastPreset = $state<number | null>(null);
  let everLoaded = $state(false);
  onMount(() => {
    init();
    const t = setInterval(watchPreset, 4000); // live-update when the preset changes on the device
    return () => clearInterval(t);
  });
  async function init() {
    try {
      const n = (await forgefx.currentPreset()).number;
      if (n >= 0) lastPreset = n;
    } catch { /* */ }
    await load();
  }
  async function watchPreset() {
    try {
      const n = (await forgefx.currentPreset()).number;
      // 0x0D is flaky on a modified edit buffer and returns -1; ignore those
      // so a transient failure doesn't masquerade as a preset change (= reload flicker).
      if (n >= 0 && n !== lastPreset) { lastPreset = n; await load(); }
      else if (status === 'offline') await load(); // recover once the server is back
    } catch { /* keep showing the last good grid */ }
  }
  async function load() {
    if (!everLoaded) status = 'loading';
    try {
      // real grid (placement + routing); placed blocks add live bypass/channel
      const [grid, blocks] = await Promise.all([
        forgefx.grid(),
        forgefx.presetBlocks().catch(() => [])
      ]);
      layout = layoutFromGrid(grid, blocks);
      everLoaded = true;
      status = 'ready';
    } catch {
      // don't blank an already-rendered grid on a transient dump failure
      if (!everLoaded) status = 'offline';
    }
  }

  const slugOf = (c: Cell) => (c.pack ?? '').toLowerCase();

  async function open(c: Cell) {
    editing = c;
    if (!c.pack) { sheetState = 'nopack'; params = []; return; }
    await loadParams();
  }
  async function loadParams() {
    if (!editing?.pack) return;
    sheetState = 'loading';
    try {
      const r = await forgefx.blockParams(slugOf(editing));
      // knobs = editable params (drop the model-type selector + the inner bypass flag)
      params = r.named.filter((p) => !['type', 'bypass'].includes(p.name.toLowerCase()));
      sheetState = 'ready';
    } catch (e) {
      sheetState = 'error';
      if (e instanceof ForgeError) console.warn(e.message);
    }
  }
  const close = () => (editing = null);

  // live knob → device (optimistic + debounced continuous write)
  function setKnob(p: NamedParam, v: number) {
    p.norm = v;
    if (!editing?.pack) return;
    const slug = slugOf(editing);
    clearTimeout(sendTimers[p.name]);
    sendTimers[p.name] = setTimeout(() => forgefx.setParam(slug, p.name, v).catch(() => {}), 60);
  }
  async function toggleBypass() {
    if (!editing?.pack) return;
    const next = !(editing.bypassed ?? false);
    editing.bypassed = next; // editing IS the grid cell → updates the grid too
    try { await forgefx.setBypass(slugOf(editing), next); } catch { editing.bypassed = !next; }
  }
  async function setChannel(ch: string) {
    if (!editing?.pack || editing.channel === ch) return;
    const prev = editing.channel;
    editing.channel = ch;
    try { await forgefx.setChannel(slugOf(editing), ch); await loadParams(); }
    catch { editing.channel = prev; }
  }
  const pos = (row: number, col: number) =>
    `left:${col * (CW + GAP)}px; top:${row * (CH + GAP)}px; width:${CW}px; height:${CH}px;`;
</script>

<section class="wrap scroll" data-screen="Signal Grid">
  {#if status === 'loading'}
    <p class="hint">Connecting to ForgeFX…</p>
  {:else if status === 'offline'}
    <div class="offline">
      <p class="hint">Device offline.</p>
      <p class="sub">Start the ForgeFX server (<code class="mono">localhost:5056</code>) and reconnect.</p>
      <button class="btn" onclick={load}>Retry</button>
    </div>
  {:else}
    <div class="gridbox" style="width:{gw}px; height:{gh}px;">
      <svg class="cables" width={gw} height={gh}>
        {#each cables as cab}<path d={cab.d} fill="none" stroke={cab.stroke} stroke-width="2" opacity="0.7" />{/each}
      </svg>

      <!-- shunts: routing pass-through nodes -->
      {#each layout.shunts as s}
        <div class="shunt" style={pos(s.row, s.col)}><span class="dot"></span></div>
      {/each}

      <!-- placed blocks -->
      {#each layout.cells as c}
        <button class="cell block" class:byp={c.bypassed} style="{pos(c.row, c.col)} --c:{c.color}" onclick={() => open(c)}>
          <span class="b-label">{c.display}</span>
          <span class="b-pack mono">{c.pack ?? '—'}</span>
          {#if c.channel}<span class="chan mono">{c.channel}</span>{/if}
          {#if c.bypassed}<span class="bypb mono">BYP</span>{/if}
        </button>
      {/each}
    </div>
    <p class="preview mono">
      {layout.model} · {layout.name || 'unnamed'} · {layout.rows}×{layout.cols} grid · real placement + routing (live decode)
      {#if !layout.crcValid}<span class="edit"> · edit buffer (unsaved)</span>{/if}
      <button class="refresh" onclick={load} title="Re-read the grid from the device">↻</button>
    </p>
  {/if}
</section>

{#if editing}
  <div class="overlay" onclick={close} role="presentation"></div>
  <aside class="sheet scroll" data-screen="Block Editor" style="--c:{editing.color}">
    <header class="ed-head">
      <span class="ed-icon" style="background:{editing.color}"></span>
      <div class="ed-id">
        <div class="ed-title">{editing.display}</div>
        <div class="ed-type mono">{editing.pack ?? '—'}</div>
      </div>
      {#if editing.pack}
        <div class="ch">
          <span class="ch-lbl mono">CH</span>
          {#each CHANNELS as ch}
            <button class="ch-btn" class:on={editing.channel === ch} onclick={() => setChannel(ch)}>{ch}</button>
          {/each}
        </div>
      {/if}
      <span class="ed-spacer"></span>
      <button class="x" onclick={close} aria-label="Close">✕</button>
    </header>

    {#if sheetState === 'nopack'}
      <p class="hint">No parameter pack for <b>{editing.display}</b> yet — bypass/channel still work.</p>
    {:else if sheetState === 'loading'}
      <p class="hint">Reading parameters…</p>
    {:else if sheetState === 'error'}
      <p class="hint">Couldn't read this block.</p>
    {:else}
      <div class="knobs">
        {#each params as p (p.name)}
          <Knob
            value={p.norm ?? 0}
            label={p.name}
            valueText={((p.norm ?? 0) * 10).toFixed(1)}
            color={editing.color}
            onInput={(v) => setKnob(p, v)}
          />
        {/each}
      </div>
      <p class="ro mono">live · drag a knob to set it on the device</p>
    {/if}

    <footer class="ed-foot">
      <button class="act byp" class:on={editing.bypassed} onclick={toggleBypass}>
        {editing.bypassed ? 'Bypassed' : 'Bypass'}
      </button>
    </footer>
  </aside>
{/if}

<style>
  .wrap { padding: 22px; overflow: auto; }
  .gridbox { position: relative; }
  .cables { position: absolute; inset: 0; pointer-events: none; z-index: 0; overflow: visible; }
  .cell { position: absolute; border-radius: var(--r-md); }

  .block {
    overflow: hidden; cursor: pointer; padding: 0;
    border: 1px solid color-mix(in srgb, var(--c) 45%, var(--border-2));
    background: linear-gradient(180deg, var(--surface-2), var(--surface));
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
    z-index: 2; transition: transform 0.08s, border-color 0.12s, opacity 0.12s;
  }
  .block:hover { border-color: var(--c); }
  .block:active { transform: scale(0.97); }
  .block.byp { opacity: 0.45; filter: grayscale(0.7); }
  .b-label { font-weight: 700; font-size: 14px; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.4); }
  .b-pack { font-size: 9px; color: var(--c); opacity: 0.85; }
  .chan { position: absolute; top: 6px; right: 7px; font-size: 9px; font-weight: 700; color: rgba(255,255,255,.85); background: rgba(0,0,0,.3); border-radius: 4px; padding: 2px 4px; }
  .bypb { position: absolute; top: 6px; left: 7px; font-size: 8px; font-weight: 700; color: var(--bg); background: var(--text-dim); border-radius: 4px; padding: 2px 4px; letter-spacing: .05em; }

  /* shunt: a small routing node the cables thread through */
  .shunt { position: absolute; display: flex; align-items: center; justify-content: center; z-index: 1; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--surface-3); border: 1px solid var(--border-2); }

  .preview { margin-top: 18px; font-size: 10px; color: var(--text-faint); display: flex; align-items: center; gap: 8px; }
  .edit { color: var(--amber, #f5a623); }
  .refresh { border: 1px solid var(--border-2); background: var(--surface-2); color: var(--text-dim); border-radius: var(--r-sm); width: 22px; height: 20px; cursor: pointer; font-size: 12px; line-height: 1; }
  .refresh:hover { border-color: var(--accent); color: var(--text); }
  .hint { color: var(--text-dim); }
  .sub { color: var(--text-mut); font-size: 11px; }
  .offline { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .btn { border: 1px solid var(--border-strong); background: var(--surface-2); color: var(--text); border-radius: var(--r-sm); padding: 7px 14px; cursor: pointer; }
  code { color: var(--accent); }

  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); animation: axsOverlay .15s ease; z-index: 40; }
  .sheet { position: fixed; left: 0; right: 0; bottom: 0; max-height: 80vh; overflow: auto; background: var(--panel-2); border-top: 2px solid var(--c); border-radius: var(--r-lg) var(--r-lg) 0 0; padding: 16px 18px 24px; z-index: 50; animation: axsSheet .22s cubic-bezier(.16,1,.3,1); }
  @media (min-width: 900px) { .sheet { left: auto; top: 0; bottom: 0; width: 400px; max-height: none; border-top: 0; border-left: 2px solid var(--c); border-radius: 0; animation: none; } }
  /* block editor */
  .ed-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .ed-icon { width: 30px; height: 30px; flex: none; border-radius: 9px; opacity: 0.9; }
  .ed-id { min-width: 0; line-height: 1.15; }
  .ed-title { font-weight: 700; font-size: 16px; color: #fff; }
  .ed-type { font-size: 11px; color: var(--c); }
  .ed-spacer { flex: 1; }
  .x { border: 0; background: transparent; color: var(--text-mut); font-size: 16px; cursor: pointer; }

  .ch { display: flex; align-items: center; gap: 3px; }
  .ch-lbl { font-size: 8px; font-weight: 600; color: var(--text-mut); letter-spacing: .08em; margin-right: 2px; }
  .ch-btn { width: 24px; height: 26px; border: 1px solid var(--border-2); background: var(--surface); color: var(--text-mut); border-radius: 6px; font: 600 12px/1 var(--font-mono); cursor: pointer; }
  .ch-btn:hover { color: var(--text); }
  .ch-btn.on { background: var(--c); color: var(--bg, #06181a); border-color: var(--c); }

  .knobs { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 14px 6px; padding: 4px 0 8px; }
  .ro { margin: 8px 0 0; font-size: 10px; color: var(--text-faint); text-align: center; }

  .ed-foot { display: flex; gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--hairline); }
  .act { height: 38px; padding: 0 16px; border: 1px solid var(--border-2); background: var(--surface); color: var(--text); border-radius: 9px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .act:hover { border-color: var(--border-strong); }
  .act.byp.on { background: var(--coral, #d6543f); border-color: var(--coral, #d6543f); color: #fff; }
</style>
