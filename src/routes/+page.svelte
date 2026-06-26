<script lang="ts">
  import { onMount } from 'svelte';
  import { forgefx, ForgeError } from '$lib/forgefx';
  import type { BlockParams } from '$lib/types';

  let blocks = $state<string[]>([]);
  let status = $state<'loading' | 'ready' | 'offline'>('loading');

  let openBlock = $state<string | null>(null);
  let sheet = $state<BlockParams | null>(null);
  let sheetState = $state<'loading' | 'ready' | 'error'>('loading');

  onMount(load);
  async function load() {
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
    try {
      sheet = await forgefx.blockParams(name);
      sheetState = 'ready';
    } catch (e) {
      sheetState = 'error';
      if (e instanceof ForgeError) console.warn(e.message);
    }
  }
  const close = () => (openBlock = null);
</script>

<section class="grid-wrap" data-screen="Signal Grid">
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
        <button class="block" onclick={() => open(name)}>
          <span class="block-name">{name}</span>
          <span class="block-tag mono">tap to edit</span>
        </button>
      {/each}
    </div>
  {/if}
</section>

<!-- Block Editor — bottom sheet / modal (touch-first; the prototype's sheet approach) -->
{#if openBlock}
  <div class="overlay" onclick={close} role="presentation"></div>
  <aside class="sheet scroll" data-screen="Block Editor">
    <header class="sheet-head">
      <h2>{openBlock}</h2>
      <button class="x" onclick={close} aria-label="Close">✕</button>
    </header>
    {#if sheetState === 'loading'}
      <p class="hint">Reading parameters…</p>
    {:else if sheetState === 'error'}
      <p class="hint">Couldn't read this block.</p>
    {:else if sheet}
      <p class="sub mono">page 0x{sheet.page.toString(16)} · {sheet.named.length} params</p>
      <ul class="params">
        {#each sheet.named as p}
          <li class="param">
            <span class="p-name">{p.name}</span>
            <span class="p-val mono">
              {p.value.toFixed(2)}{p.unit ? ` ${p.unit}` : ''}
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </aside>
{/if}

<style>
  .grid-wrap {
    padding: 18px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 12px;
  }
  .block {
    aspect-ratio: 5 / 3;
    border: 1px solid var(--border-2);
    border-radius: var(--r-lg);
    background: linear-gradient(180deg, var(--surface-2), var(--surface));
    color: var(--text);
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-start;
    padding: 12px 13px;
    cursor: pointer;
    transition: border-color 0.12s, transform 0.08s;
  }
  .block:hover {
    border-color: var(--accent);
  }
  .block:active {
    transform: scale(0.98);
  }
  .block-name {
    font-weight: 600;
    font-size: 14px;
  }
  .block-tag {
    font-size: 9px;
    color: var(--text-faint);
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
    max-height: 78vh;
    overflow: auto;
    background: var(--panel-2);
    border-top: 1px solid var(--border-strong);
    border-radius: var(--r-lg) var(--r-lg) 0 0;
    padding: 16px 18px 28px;
    z-index: 50;
    animation: axsSheet 0.22s cubic-bezier(0.16, 1, 0.3, 1);
  }
  /* desktop: dock the editor to the right instead of a bottom sheet */
  @media (min-width: 900px) {
    .sheet {
      left: auto;
      top: 0;
      bottom: 0;
      width: 380px;
      max-height: none;
      border-top: 0;
      border-left: 1px solid var(--border-strong);
      border-radius: 0;
      animation: none;
    }
  }
  .sheet-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  .sheet-head h2 {
    margin: 0;
    font-size: 18px;
  }
  .x {
    border: 0;
    background: transparent;
    color: var(--text-mut);
    font-size: 16px;
    cursor: pointer;
  }
  .params {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
  }
  .param {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 9px 2px;
    border-bottom: 1px solid var(--hairline);
  }
  .p-name {
    font-size: 13px;
  }
  .p-val {
    font-size: 12px;
    color: var(--accent);
  }
</style>
