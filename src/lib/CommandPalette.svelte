<script lang="ts">
  import { editor, baseName } from './editor.svelte';
  import { forgefx } from './forgefx';
  import { catFor, shade } from './catalog';

  type Family = { slug: string; name: string; page: number };
  type TypeOpt = { value: number; name: string; manufacturer: string | null; basedOn: string | null };

  let families = $state<Family[]>([]);
  let types = $state<TypeOpt[]>([]);
  let loading = $state(false);
  let query = $state('');
  let hi = $state(0);
  let realNames = $state(false);
  let inputEl = $state<HTMLInputElement | null>(null);

  const retype = $derived(editor.paletteMode === 'retype');
  const target = $derived(editor.placeTarget ?? editor.firstEmptyCell);

  // load catalog when opened
  $effect(() => {
    if (!editor.paletteOpen) return;
    query = '';
    hi = 0;
    setTimeout(() => inputEl?.focus(), 0);
    if (retype) {
      const c = editor.selected;
      if (!c?.pack) return;
      loading = true;
      forgefx
        .blockTypes(c.pack.toLowerCase())
        .then((t) => (types = t))
        .catch(() => (types = []))
        .finally(() => (loading = false));
    } else if (families.length === 0) {
      loading = true;
      forgefx
        .blocks()
        .then((b) => (families = b.map((x) => ({ slug: x.slug, name: x.name, page: x.page }))))
        .catch(() => (families = []))
        .finally(() => (loading = false));
    }
  });

  const typeLabel = (t: TypeOpt) =>
    realNames && (t.basedOn || t.manufacturer) ? `${t.manufacturer ?? ''} ${t.basedOn ?? ''}`.trim() : t.name;

  const results = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (retype) {
      const list = q
        ? types.filter((t) => (t.name + ' ' + (t.manufacturer ?? '') + ' ' + (t.basedOn ?? '')).toLowerCase().includes(q))
        : types;
      return list.slice(0, 80).map((t) => ({ key: String(t.value), name: typeLabel(t), sub: t.name, kind: 'Model', value: t.value, page: 0 }));
    }
    const list = q ? families.filter((f) => (f.name + ' ' + f.slug).toLowerCase().includes(q)) : families;
    return list.slice(0, 80).map((f) => ({ key: f.slug, name: f.name, sub: f.slug, kind: 'Block', value: 0, page: f.page }));
  });

  function pick(i: number) {
    const r = results[i];
    if (!r) return;
    if (retype) {
      editor.retype(r.value);
      editor.showToast('Type changed', '#35c9d6');
    } else {
      const t = target;
      if (!t) {
        editor.showToast('Grid is full', '#d6543f');
      } else {
        editor.place(t.row, t.col, r.page, r.name);
        editor.showToast(`Placed ${r.name}`, '#35c9d6');
      }
    }
    editor.placeTarget = null;
    editor.paletteOpen = false;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      hi = Math.min(results.length - 1, hi + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      hi = Math.max(0, hi - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(hi);
    } else if (e.key === 'Escape') {
      editor.paletteOpen = false;
    }
  }

  function chipFor(r: { sub: string; kind: string }) {
    if (r.kind === 'Block') return catFor(null, r.sub);
    const c = editor.selected;
    return catFor(c?.pack ?? null, baseName(c?.display ?? ''));
  }
</script>

{#if editor.paletteOpen}
  <div class="bg" role="presentation" onclick={() => (editor.paletteOpen = false)}>
    <div class="card" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
      <div class="search">
        <svg width="19" height="19" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5.2" fill="none" stroke="#6a6a74" stroke-width="1.5" /><path d="M10.8 10.8 L14.5 14.5" stroke="#6a6a74" stroke-width="1.5" stroke-linecap="round" /></svg>
        <input
          bind:this={inputEl}
          bind:value={query}
          oninput={() => (hi = 0)}
          onkeydown={onKey}
          placeholder={retype ? 'Search types…' : 'Search amps, drives, delays, reverbs…'}
        />
        <span class="count mono">{results.length} result{results.length === 1 ? '' : 's'}</span>
      </div>

      <div class="chips">
        <span class="target">{retype ? '↻ Change type' : target ? `✛ Place in cell ${target.row + 1},${target.col + 1}` : 'Grid full'}</span>
        {#if retype}
          <label class="rn"><input type="checkbox" bind:checked={realNames} /> real names</label>
        {/if}
      </div>

      <div class="list scroll">
        {#if loading}
          <div class="empty">Loading…</div>
        {:else if results.length === 0}
          <div class="empty">No matches for “{query}”.</div>
        {:else}
          {#each results as r, i (r.key)}
            {@const cat = chipFor(r)}
            <button
              class="row"
              class:hi={i === hi}
              onmouseenter={() => (hi = i)}
              onclick={() => pick(i)}
            >
              <span class="chip" style="background:linear-gradient(180deg,{shade(cat.accent, 0.16)},{shade(cat.accent, -0.18)}); border-color:{shade(cat.accent, -0.3)};">{cat.glyph}</span>
              <span class="rtext">
                <span class="rname">{r.name}</span>
                {#if r.sub && r.sub !== r.name}<span class="rsub">{r.sub}</span>{/if}
              </span>
              <span class="kind">{r.kind}</span>
              {#if i === hi}<span class="ret mono">↵</span>{/if}
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .bg {
    position: absolute;
    inset: 0;
    background: rgba(6, 6, 8, 0.66);
    backdrop-filter: blur(3px);
    z-index: 200;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 7vh 12px 12px;
    animation: axsOverlay 0.12s ease;
  }
  .card {
    width: 760px;
    max-width: 100%;
    max-height: 84vh;
    background: #161619;
    border: 1px solid #2e2e36;
    border-radius: 16px;
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: axsPalette 0.15s cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  .search {
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 18px 20px;
    border-bottom: 1px solid #232329;
  }
  .search input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    color: #f2f2f5;
    font-family: inherit;
    font-size: 17px;
    font-weight: 500;
  }
  .count {
    font-size: 12px;
    color: #5d5d66;
    white-space: nowrap;
  }
  .chips {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 16px;
    border-bottom: 1px solid #1f1f25;
  }
  .target {
    padding: 6px 11px;
    background: #11201f;
    border: 1px solid #244040;
    border-radius: 7px;
    font-size: 11px;
    font-weight: 600;
    color: #7fd8de;
    white-space: nowrap;
  }
  .rn {
    margin-left: auto;
    font-size: 11px;
    color: var(--text-mut);
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
  }
  .list {
    flex: 1;
    min-height: 140px;
    overflow-y: auto;
    padding: 8px 8px 10px;
  }
  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 11px 12px;
    border: 0;
    border-radius: 10px;
    background: transparent;
    cursor: pointer;
    text-align: left;
  }
  .row.hi {
    background: rgba(53, 201, 214, 0.1);
    box-shadow: inset 0 0 0 1px rgba(53, 201, 214, 0.3);
  }
  .chip {
    flex: none;
    width: 52px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    color: #fff;
    border: 1px solid;
  }
  .rtext {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .rname {
    font-size: 14px;
    font-weight: 600;
    color: #ededf2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rsub {
    font-size: 11.5px;
    color: #7a7a83;
  }
  .kind {
    flex: none;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-mut);
    padding: 4px 9px;
    background: #1a1a1f;
    border: 1px solid var(--border-2);
    border-radius: 6px;
    white-space: nowrap;
  }
  .ret {
    flex: none;
    font-size: 10px;
    font-weight: 600;
    color: var(--accent);
    background: #11201f;
    border: 1px solid #244040;
    border-radius: 5px;
    padding: 4px 6px;
  }
  .empty {
    padding: 40px 20px;
    text-align: center;
    color: var(--text-faint);
    font-size: 13px;
  }
</style>
