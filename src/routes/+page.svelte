<script lang="ts">
  import { onMount } from 'svelte';
  import { forgefx, ForgeError } from '$lib/forgefx';
  import type { BlockParams } from '$lib/types';
  import { colorOf, categoryOf } from '$lib/blocks';

  let blocks = $state<string[]>([]);
  let status = $state<'loading' | 'ready' | 'offline'>('loading');

  let openBlock = $state<string | null>(null);
  let sheet = $state<BlockParams | null>(null);
  let sheetState = $state<'loading' | 'ready' | 'error'>('loading');
  let filter = $state('');

  onMount(load);
  async function load() {
    status = 'loading';
    try {
      blocks = await forgefx.blocks();
      status = 'ready';
    } catch {
      status = 'offline';
    }
  }

  async function open(name: string) {
    openBlock = name;
    sheet = null;
    sheetState = 'loading';
    filter = '';
    try {
      sheet = await forgefx.blockParams(name);
      sheetState = 'ready';
    } catch (e) {
      sheetState = 'error';
      if (e instanceof ForgeError) console.warn(e.message);
    }
  }
  const close = () => (openBlock = null);

  const shown = $derived(
    sheet?.named.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase())) ?? []
  );
  // clamp a norm (0..1) for the fill bar; some values are raw/enums
  const pct = (n: number | undefined) => Math.max(0, Math.min(1, n ?? 0)) * 100;
</script>

<section class="wrap" data-screen="Signal Grid">
  {#if status === 'loading'}
    <p class="hint">Connecting to ForgeFX…</p>
  {:else if status === 'offline'}
    <div class="offline">
      <p class="hint">Device offline.</p>
      <p class="sub">Start the ForgeFX server (<code class="mono">localhost:5056</code>) and reconnect.</p>
      <button class="btn" onclick={load}>Retry</button>
    </div>
  {:else}
    <div class="grid">
      {#each blocks as name}
        <button class="block" style="--c:{colorOf(name)}" onclick={() => open(name)}>
          <span class="stripe"></span>
          <span class="b-name">{name}</span>
          <span class="b-cat mono">{categoryOf(name)}</span>
        </button>
      {/each}
    </div>
  {/if}
</section>

<!-- Block Editor — bottom sheet (touch) / right dock (desktop) -->
{#if openBlock}
  <div class="overlay" onclick={close} role="presentation"></div>
  <aside class="sheet scroll" data-screen="Block Editor" style="--c:{colorOf(openBlock)}">
    <header class="sheet-head">
      <div>
        <h2>{openBlock}</h2>
        {#if sheet}
          <span class="sub mono">page 0x{sheet.page.toString(16)} · {sheet.named.length} params</span>
        {/if}
      </div>
      <button class="x" onclick={close} aria-label="Close">✕</button>
    </header>

    {#if sheetState === 'loading'}
      <p class="hint">Reading parameters…</p>
    {:else if sheetState === 'error'}
      <p class="hint">Couldn't read this block.</p>
    {:else if sheet}
      {#if sheet.named.length > 10}
        <input class="search" placeholder="Filter parameters…" bind:value={filter} />
      {/if}
      <ul class="params">
        {#each shown as p}
          <li class="param">
            <div class="p-top">
              <span class="p-name">{p.name}</span>
              <span class="p-val mono">{p.value.toFixed(2)}{p.unit ? ` ${p.unit}` : ''}</span>
            </div>
            <div class="bar"><span class="fill" style="width:{pct(p.norm)}%"></span></div>
          </li>
        {/each}
        {#if shown.length === 0}
          <li class="hint" style="padding:10px 2px">No params match "{filter}".</li>
        {/if}
      </ul>
      <p class="ro mono">read‑only preview · live editing coming once write addressing is verified</p>
    {/if}
  </aside>
{/if}

<style>
  .wrap {
    padding: 18px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
  }
  .block {
    position: relative;
    aspect-ratio: 5 / 3;
    border: 1px solid var(--border-2);
    border-radius: var(--r-lg);
    background: linear-gradient(180deg, var(--surface-2), var(--surface));
    color: var(--text);
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: flex-start;
    padding: 12px 13px;
    cursor: pointer;
    overflow: hidden;
    transition: border-color 0.12s, transform 0.08s;
  }
  .block:hover {
    border-color: var(--c);
  }
  .block:active {
    transform: scale(0.98);
  }
  .stripe {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--c);
    opacity: 0.9;
  }
  .b-name {
    font-weight: 600;
    font-size: 14px;
  }
  .b-cat {
    font-size: 9px;
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .hint {
    color: var(--text-dim);
  }
  .sub {
    color: var(--text-mut);
    font-size: 11px;
  }
  .offline {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }
  .btn {
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    color: var(--text);
    border-radius: var(--r-sm);
    padding: 7px 14px;
    cursor: pointer;
  }
  code {
    color: var(--accent);
  }

  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    animation: axsOverlay 0.15s ease;
    z-index: 40;
  }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 80vh;
    overflow: auto;
    background: var(--panel-2);
    border-top: 2px solid var(--c);
    border-radius: var(--r-lg) var(--r-lg) 0 0;
    padding: 16px 18px 24px;
    z-index: 50;
    animation: axsSheet 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @media (min-width: 900px) {
    .sheet {
      left: auto;
      top: 0;
      bottom: 0;
      width: 400px;
      max-height: none;
      border-top: 0;
      border-left: 2px solid var(--c);
      border-radius: 0;
      animation: none;
    }
  }
  .sheet-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .sheet-head h2 {
    margin: 0 0 2px;
    font-size: 18px;
  }
  .x {
    border: 0;
    background: transparent;
    color: var(--text-mut);
    font-size: 16px;
    cursor: pointer;
  }
  .search {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--border-2);
    border-radius: var(--r-sm);
    color: var(--text);
    padding: 8px 10px;
    font: inherit;
    font-size: 13px;
    margin-bottom: 10px;
  }
  .search:focus {
    outline: none;
    border-color: var(--c);
  }
  .params {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .param {
    padding: 9px 2px;
    border-bottom: 1px solid var(--hairline);
  }
  .p-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 6px;
  }
  .p-name {
    font-size: 13px;
  }
  .p-val {
    font-size: 12px;
    color: var(--c);
  }
  .bar {
    height: 4px;
    border-radius: 3px;
    background: var(--surface-3);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--c);
    border-radius: 3px;
  }
  .ro {
    margin-top: 14px;
    font-size: 10px;
    color: var(--text-faint);
    text-align: center;
  }
</style>
