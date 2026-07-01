<script lang="ts">
  // One-time offer to build the local library cache (names · blocks · models · params for every preset),
  // shown when connected and no cache exists yet. Powers the quick picker names, Preset Browser search,
  // and param queries — like the OG editor's index. Dismissable per session.
  import { editor } from './editor.svelte';
  import { library } from './library.svelte';
  import { isRemote } from './forgefx';

  let dismissed = $state(false);
  // Not in remote mode — a full device scan over the relay is unusable; that's the host's job.
  const show = $derived(!dismissed && !isRemote() && !library.cacheBuilt && !library.scanning && editor.conn.state === 'online' && !editor.isAm4);
  const pct = $derived(library.scanTotal ? Math.round((library.scanDone / library.scanTotal) * 100) : 0);
</script>

{#if library.scanning}
  <div class="cp building">
    <div class="row">
      <span class="dot"></span>
      <span class="txt">Building library cache… <b>{library.scanDone}/{library.scanTotal}</b></span>
      <div class="bar"><div class="fill" style="width:{pct}%"></div></div>
    </div>
  </div>
{:else if show}
  <div class="cp">
    <div class="row">
      <span class="ic">≣</span>
      <div class="msg">
        <b>Build the library cache?</b>
        <span class="sub">Indexes every preset — names, blocks, models &amp; all params — so the browser, search and quick picker work instantly. One pass, stored locally.</span>
      </div>
      <button class="go" onclick={() => library.buildCache()}>Build cache</button>
      <button class="later" onclick={() => (dismissed = true)}>Later</button>
    </div>
  </div>
{/if}

<style>
  .cp {
    position: fixed;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    z-index: 400;
    max-width: 620px;
    width: calc(100% - 40px);
    background: #141417;
    border: 1px solid #2e2e36;
    border-radius: 13px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
    padding: 12px 14px;
    animation: cpUp 0.18s ease-out;
  }
  .cp.building {
    max-width: 420px;
  }
  @keyframes cpUp {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .ic {
    font-size: 20px;
    color: var(--accent, #35c9d6);
    flex: none;
  }
  .msg {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .msg b {
    font-size: 13px;
    font-weight: 700;
    color: #e9e9ee;
  }
  .sub {
    font-size: 11px;
    color: #8a8a94;
    line-height: 1.35;
  }
  .go {
    flex: none;
    height: 34px;
    padding: 0 15px;
    border-radius: 9px;
    border: none;
    background: var(--accent, #35c9d6);
    color: #06181a;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
  }
  .go:hover {
    filter: brightness(1.08);
  }
  .later {
    flex: none;
    height: 34px;
    padding: 0 11px;
    border-radius: 9px;
    border: 1px solid #2e2e36;
    background: transparent;
    color: #9a9aa3;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .later:hover {
    color: #e9e9ee;
    border-color: #3f3f48;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--accent, #35c9d6);
    flex: none;
    animation: cpPulse 1s ease-in-out infinite;
  }
  @keyframes cpPulse {
    50% {
      opacity: 0.3;
    }
  }
  .txt {
    font-size: 12px;
    color: #cfcfd6;
    flex: none;
  }
  .bar {
    flex: 1;
    height: 6px;
    background: #16161b;
    border: 1px solid #26262c;
    border-radius: 4px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--accent, #35c9d6);
    transition: width 0.2s;
  }
</style>
