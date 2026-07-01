<script lang="ts">
  import { editor } from './editor.svelte';
  import { library } from './library.svelte';

  type Recent = { n: number; name: string };
  let recents = $state<Recent[]>([]);
  let favs = $state<Recent[]>([]);
  let query = $state('');
  let inputEl = $state<HTMLInputElement | null>(null);

  const KEY = 'axs.presets';
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ rec: recents, fav: favs }));
    } catch {
      /* */
    }
  }
  function loadStore() {
    try {
      const j = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (Array.isArray(j?.rec)) recents = j.rec;
      if (Array.isArray(j?.fav)) favs = j.fav;
    } catch {
      /* */
    }
  }
  function pushRecent(n: number, name: string) {
    recents = [{ n, name }, ...recents.filter((r) => r.n !== n)].slice(0, 12);
    persist();
  }
  const isFav = (n: number) => favs.some((f) => f.n === n);
  function toggleFav(n: number, name: string) {
    favs = isFav(n) ? favs.filter((f) => f.n !== n) : [{ n, name: name || nameOf(n) }, ...favs].slice(0, 60);
    persist();
  }

  let filter = $state<'all' | 'fav' | 'recent'>('all');
  $effect(() => {
    if (!editor.presetOpen) return;
    query = '';
    filter = 'all';
    loadStore();
    setTimeout(() => inputEl?.focus(), 0);
  });

  const pad = (n: number) => String(n).padStart(3, '0');
  const typedNum = $derived.by(() => {
    const q = query.trim();
    return /^\d+$/.test(q) ? Number(q) : null;
  });
  function nameOf(n: number): string {
    if (editor.preset?.number === n && editor.preset.name) return editor.preset.name;
    return library.nameOfSlot(n) || recents.find((r) => r.n === n)?.name || '';
  }
  // full slot list, filtered by number or known name
  const rows = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const all = Array.from({ length: editor.presetCount }, (_, n) => ({ n, name: nameOf(n) }));
    if (!q) return all;
    return all.filter((r) => r.name.toLowerCase().includes(q) || pad(r.n).includes(q) || String(r.n).includes(q));
  });

  // the list shown under the tabs (search overrides the active filter)
  const mainList = $derived.by(() => {
    if (query.trim()) return rows;
    if (filter === 'fav') return favs.map((f) => ({ n: f.n, name: f.name || nameOf(f.n) }));
    if (filter === 'recent') return recents.map((r) => ({ n: r.n, name: r.name || nameOf(r.n) }));
    return rows;
  });

  async function go(n: number, name = '') {
    await editor.selectPreset(n);
    pushRecent(n, name || editor.preset?.name || '');
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      if (typedNum !== null) go(typedNum);
      else if (rows[0]) go(rows[0].n, rows[0].name);
    } else if (e.key === 'Escape') {
      editor.presetOpen = false;
    }
  }
</script>

{#if editor.presetOpen}
  <div class="bg" class:mob={editor.isMobile} role="presentation" onclick={() => (editor.presetOpen = false)}>
    <div class="card" class:sheet={editor.isMobile} role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
      <div class="head">
        <div class="title-row">
          <span class="title">Presets</span>
          {#if editor.preset && editor.preset.number >= 0}
            <span class="cur mono">PRE {pad(editor.preset.number)}</span>
          {/if}
          <span class="spacer"></span>
          <button class="close" aria-label="Close" onclick={() => (editor.presetOpen = false)}>✕</button>
        </div>
        <div class="search">
          <svg width="18" height="18" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5.2" fill="none" stroke="#6a6a74" stroke-width="1.5" /><path d="M10.8 10.8 L14.5 14.5" stroke="#6a6a74" stroke-width="1.5" stroke-linecap="round" /></svg>
          <input bind:this={inputEl} bind:value={query} onkeydown={onKey} placeholder="Type a preset number, then Enter…" />
        </div>
        <div class="tabs scroll">
          <button class="tab" class:on={filter === 'all'} onclick={() => (filter = 'all')}>All</button>
          <button class="tab" class:on={filter === 'fav'} onclick={() => (filter = 'fav')}>★ Favorites</button>
          <button class="tab" class:on={filter === 'recent'} onclick={() => (filter = 'recent')}>Recent</button>
        </div>
      </div>

      {#snippet presetRow(r: Recent)}
        <div class="rowwrap" class:active={editor.preset?.number === r.n}>
          <button class="row" onclick={() => go(r.n, r.name)}>
            <span class="num mono">{pad(r.n)}</span>
            <span class="rtext"><span class="rname">{r.name || `Preset ${r.n}`}</span></span>
            {#if editor.preset?.number === r.n}<span class="active-b mono">ACTIVE</span>{/if}
          </button>
          <button class="star" class:on={isFav(r.n)} title={isFav(r.n) ? 'Unfavorite' : 'Favorite'} aria-label="Favorite" onclick={() => toggleFav(r.n, r.name)}>{isFav(r.n) ? '★' : '☆'}</button>
        </div>
      {/snippet}

      <div class="list scroll">
        {#if !query.trim() && filter === 'all' && recents.length}
          <div class="section mono">RECENT</div>
          <div class="chiprow scroll">
            {#each recents as r (r.n)}
              <button class="chip" class:active={editor.preset?.number === r.n} onclick={() => go(r.n, r.name)}>
                <span class="cnum mono">{pad(r.n)}</span><span class="cname">{r.name || `Preset ${r.n}`}</span>
              </button>
            {/each}
          </div>
        {/if}
        <div class="section mono">
          {query.trim() ? `${mainList.length} MATCH${mainList.length === 1 ? '' : 'ES'}` : filter === 'fav' ? 'FAVORITES' : filter === 'recent' ? 'RECENT' : 'ALL PRESETS'}
        </div>
        {#each mainList.slice(0, 300) as r (r.n)}{@render presetRow(r)}{/each}
        {#if mainList.length > 300}
          <div class="empty">+{mainList.length - 300} more — type a number or name to filter</div>
        {/if}
        {#if mainList.length === 0}
          <div class="empty">{filter === 'fav' ? 'No favorites yet — tap ☆ on a preset.' : `No presets match “${query}”.`}</div>
        {/if}
      </div>

      <div class="foot mono">
        <span>Type # + ⏎ Load</span><span>★ Favorite</span><span>Esc Close</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .bg {
    position: absolute;
    inset: 0;
    z-index: 200;
    background: rgba(6, 6, 8, 0.66);
    backdrop-filter: blur(3px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 7vh 12px 12px;
    animation: axsOverlay 0.12s ease;
  }
  .bg.mob {
    align-items: stretch;
    padding: 0;
  }
  .card {
    width: 680px;
    max-width: 100%;
    max-height: 84vh;
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 16px;
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: axsPalette 0.15s cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  .card.sheet {
    width: 100%;
    height: 100%;
    max-height: none;
    border-radius: 0;
    animation: axsSheet 0.26s cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  .head {
    padding: 16px 18px 13px;
    border-bottom: 1px solid var(--surface2);
    flex: none;
  }
  .title-row {
    display: flex;
    align-items: center;
    gap: 11px;
    margin-bottom: 13px;
  }
  .title {
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
  }
  .cur {
    font: 700 10px/1 var(--font-mono);
    color: #f5c878;
    background: #241a12;
    border: 1px solid #5a3f1f;
    border-radius: 6px;
    padding: 5px 8px;
    letter-spacing: 0.04em;
  }
  .spacer {
    flex: 1;
  }
  .close {
    width: 34px;
    height: 34px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-2);
    border: 1px solid var(--border-2);
    border-radius: 9px;
    cursor: pointer;
    font-size: 14px;
    color: var(--text-dim);
  }
  .close:hover {
    border-color: var(--border-strong);
    color: var(--text);
  }
  .search {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 46px;
    padding: 0 14px;
    background: var(--panel-2);
    border: 1px solid var(--surface-3);
    border-radius: 11px;
  }
  .search input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text);
    font-family: inherit;
    font-size: 15px;
    font-weight: 500;
  }
  .tabs {
    display: flex;
    gap: 6px;
    margin-top: 11px;
    overflow-x: auto;
  }
  .tab {
    flex: none;
    padding: 7px 12px;
    border-radius: 8px;
    border: 1px solid var(--surface-3);
    background: var(--panel-2);
    color: var(--textdim);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    outline: none;
  }
  .tab:focus-visible {
    border-color: var(--accent);
  }
  .tab.on {
    background: rgba(53, 201, 214, 0.14);
    border-color: #2c4a4b;
    color: var(--accent);
  }
  .list {
    flex: 1;
    min-height: 140px;
    overflow-y: auto;
    padding: 8px 10px 12px;
  }
  .chiprow {
    display: flex;
    gap: 7px;
    overflow-x: auto;
    padding: 2px 8px 8px;
  }
  .chip {
    flex: none;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--surface-3);
    background: var(--panel-2);
    cursor: pointer;
    white-space: nowrap;
  }
  .chip:hover {
    border-color: var(--border-strong);
  }
  .chip.active {
    border-color: #5a3f1f;
    background: rgba(245, 166, 35, 0.08);
  }
  .cnum {
    font: 700 11px/1 var(--font-mono);
    color: var(--accent);
  }
  .cname {
    font-size: 12px;
    font-weight: 600;
    color: #d6d6dc;
  }
  .foot {
    display: flex;
    gap: 16px;
    padding: 10px 16px;
    border-top: 1px solid var(--surface2);
    font-size: 10px;
    color: var(--text-faint);
    flex: none;
  }
  .section {
    font: 600 10px/1 var(--font-mono);
    color: var(--textmuted);
    letter-spacing: 0.1em;
    padding: 13px 8px 9px;
  }
  .rowwrap {
    display: flex;
    align-items: center;
    border-radius: 11px;
  }
  .rowwrap:hover {
    background: rgba(53, 201, 214, 0.1);
  }
  .rowwrap.active {
    background: rgba(245, 166, 35, 0.07);
  }
  .row {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 8px 10px;
    border: 0;
    border-radius: 11px;
    background: transparent;
    cursor: pointer;
    text-align: left;
  }
  .star {
    flex: none;
    width: 38px;
    height: 38px;
    margin-right: 6px;
    border: 0;
    background: transparent;
    color: var(--border3);
    font-size: 17px;
    cursor: pointer;
    border-radius: 9px;
  }
  .star:hover {
    color: var(--amber);
  }
  .star.on {
    color: var(--amber);
  }
  .num {
    flex: none;
    width: 56px;
    height: 42px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--panel-2);
    border: 1px solid var(--surface-3);
    font: 700 14px/1 var(--font-mono);
    color: var(--accent);
  }
  .rtext {
    flex: 1;
    min-width: 0;
  }
  .rname {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .active-b {
    flex: none;
    font: 700 9px/1 var(--font-mono);
    color: #f5c878;
    background: #241a12;
    border: 1px solid #5a3f1f;
    border-radius: 5px;
    padding: 4px 7px;
    letter-spacing: 0.06em;
  }
  .empty {
    padding: 40px 20px;
    text-align: center;
    color: var(--text-faint);
    font-size: 13px;
  }
</style>
