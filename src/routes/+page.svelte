<script lang="ts">
  import { onMount } from 'svelte';
  import { forgefx, ForgeError } from '$lib/forgefx';
  import type { BlockParams } from '$lib/types';
  import { layoutFromStatus, cablesFor, COLS, type Cell, type Layout } from '$lib/grid';

  let status = $state<'loading' | 'ready' | 'offline'>('loading');
  let layout = $state<Layout>({ cells: [], empties: [], rows: 1 });

  const CW = 96, CH = 72, GAP = 8;
  const gw = $derived(COLS * (CW + GAP) - GAP);
  const gh = $derived(Math.max(1, layout.rows) * (CH + GAP) - GAP);
  const cables = $derived(cablesFor(layout.cells, CW, CH, GAP));

  // editor sheet
  let editing = $state<{ pack: string; display: string } | null>(null);
  let sheet = $state<BlockParams | null>(null);
  let sheetState = $state<'loading' | 'ready' | 'error' | 'nopack'>('loading');
  let filter = $state('');

  let lastPreset = $state<number | null>(null);
  onMount(() => {
    init();
    const t = setInterval(watchPreset, 3000); // live-update when the preset changes on the device
    return () => clearInterval(t);
  });
  async function init() {
    try { lastPreset = (await forgefx.currentPreset()).number; } catch { /* */ }
    await load();
  }
  async function watchPreset() {
    try {
      const n = (await forgefx.currentPreset()).number;
      if (n !== lastPreset) { lastPreset = n; await load(); }
    } catch { /* offline; layout poll left as-is */ }
  }
  async function load() {
    status = 'loading';
    try {
      layout = layoutFromStatus(await forgefx.status());
      status = 'ready';
    } catch {
      status = 'offline';
    }
  }

  async function open(c: Cell) {
    if (!c.pack) {
      editing = { pack: '', display: c.display ?? '' };
      sheetState = 'nopack';
      return;
    }
    editing = { pack: c.pack, display: c.display ?? c.pack };
    sheet = null; sheetState = 'loading'; filter = '';
    try { sheet = await forgefx.blockParams(c.pack); sheetState = 'ready'; }
    catch (e) { sheetState = 'error'; if (e instanceof ForgeError) console.warn(e.message); }
  }
  const close = () => (editing = null);
  const shown = $derived(sheet?.named.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase())) ?? []);
  const pct = (n: number | undefined) => Math.max(0, Math.min(1, n ?? 0)) * 100;
  const pos = (c: Cell) => `left:${c.col * (CW + GAP)}px; top:${c.row * (CH + GAP)}px; width:${CW}px; height:${CH}px;`;
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
        {#each cables as cab}<path d={cab.d} fill="none" stroke={cab.stroke} stroke-width="2" opacity="0.65" />{/each}
      </svg>
      {#each layout.empties as c}
        <div class="cell empty" style={pos(c)}><span class="plus">+</span></div>
      {/each}
      {#each layout.cells as c}
        <button class="cell block" class:byp={c.bypassed} style="{pos(c)} --c:{c.color}" onclick={() => open(c)}>
          <span class="b-label">{c.display}</span>
          <span class="b-pack mono">{c.pack ?? '—'}</span>
          {#if c.channel}<span class="chan mono">{c.channel}</span>{/if}
          {#if c.bypassed}<span class="bypb mono">BYP</span>{/if}
        </button>
      {/each}
    </div>
    <p class="preview mono">live preset blocks · positions are chain-ordered (real routing comes from the preset blob next)</p>
  {/if}
</section>

{#if editing}
  <div class="overlay" onclick={close} role="presentation"></div>
  <aside class="sheet scroll" data-screen="Block Editor" style="--c:{layout.cells.find((x) => x.pack === editing?.pack)?.color ?? 'var(--accent)'}">
    <header class="sheet-head">
      <div>
        <h2>{editing.display}</h2>
        {#if sheet}<span class="sub mono">page 0x{sheet.page.toString(16)} · {sheet.named.length} params</span>{/if}
      </div>
      <button class="x" onclick={close} aria-label="Close">✕</button>
    </header>
    {#if sheetState === 'nopack'}
      <p class="hint">No parameter pack for <b>{editing.display}</b> yet.</p>
    {:else if sheetState === 'loading'}
      <p class="hint">Reading parameters…</p>
    {:else if sheetState === 'error'}
      <p class="hint">Couldn't read this block.</p>
    {:else if sheet}
      {#if sheet.named.length > 10}<input class="search" placeholder="Filter parameters…" bind:value={filter} />{/if}
      <ul class="params">
        {#each shown as p}
          <li class="param">
            <div class="p-top"><span class="p-name">{p.name}</span><span class="p-val mono">{p.value.toFixed(2)}{p.unit ? ` ${p.unit}` : ''}</span></div>
            <div class="bar"><span class="bfill" style="width:{pct(p.norm)}%"></span></div>
          </li>
        {/each}
      </ul>
      <p class="ro mono">read‑only preview</p>
    {/if}
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
    z-index: 1; transition: transform 0.08s, border-color 0.12s, opacity 0.12s;
  }
  .block:hover { border-color: var(--c); }
  .block:active { transform: scale(0.97); }
  .block.byp { opacity: 0.45; filter: grayscale(0.7); }
  .b-label { font-weight: 700; font-size: 14px; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.4); }
  .b-pack { font-size: 9px; color: var(--c); opacity: 0.85; }
  .chan { position: absolute; top: 6px; right: 7px; font-size: 9px; font-weight: 700; color: rgba(255,255,255,.85); background: rgba(0,0,0,.3); border-radius: 4px; padding: 2px 4px; }
  .bypb { position: absolute; top: 6px; left: 7px; font-size: 8px; font-weight: 700; color: var(--bg); background: var(--text-dim); border-radius: 4px; padding: 2px 4px; letter-spacing: .05em; }

  .empty { display: flex; align-items: center; justify-content: center; border: 1px dashed var(--hairline); }
  .plus { font-size: 22px; color: #2f2f37; }

  .preview { margin-top: 18px; font-size: 10px; color: var(--text-faint); }
  .hint { color: var(--text-dim); }
  .sub { color: var(--text-mut); font-size: 11px; }
  .offline { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
  .btn { border: 1px solid var(--border-strong); background: var(--surface-2); color: var(--text); border-radius: var(--r-sm); padding: 7px 14px; cursor: pointer; }
  code { color: var(--accent); }

  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); animation: axsOverlay .15s ease; z-index: 40; }
  .sheet { position: fixed; left: 0; right: 0; bottom: 0; max-height: 80vh; overflow: auto; background: var(--panel-2); border-top: 2px solid var(--c); border-radius: var(--r-lg) var(--r-lg) 0 0; padding: 16px 18px 24px; z-index: 50; animation: axsSheet .22s cubic-bezier(.16,1,.3,1); }
  @media (min-width: 900px) { .sheet { left: auto; top: 0; bottom: 0; width: 400px; max-height: none; border-top: 0; border-left: 2px solid var(--c); border-radius: 0; animation: none; } }
  .sheet-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; }
  .sheet-head h2 { margin: 0 0 2px; font-size: 18px; }
  .x { border: 0; background: transparent; color: var(--text-mut); font-size: 16px; cursor: pointer; }
  .search { width: 100%; background: var(--surface); border: 1px solid var(--border-2); border-radius: var(--r-sm); color: var(--text); padding: 8px 10px; font: inherit; font-size: 13px; margin-bottom: 10px; }
  .search:focus { outline: none; border-color: var(--c); }
  .params { list-style: none; margin: 0; padding: 0; }
  .param { padding: 9px 2px; border-bottom: 1px solid var(--hairline); }
  .p-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
  .p-name { font-size: 13px; }
  .p-val { font-size: 12px; color: var(--c); }
  .bar { height: 4px; border-radius: 3px; background: var(--surface-3); overflow: hidden; }
  .bfill { display: block; height: 100%; background: var(--c); }
  .ro { margin-top: 14px; font-size: 10px; color: var(--text-faint); text-align: center; }
</style>
