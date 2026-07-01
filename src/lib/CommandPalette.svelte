<script lang="ts">
  import { editor, baseName } from './editor.svelte';
  import { forgefx } from './forgefx';
  import { catFor, shade } from './catalog';
  import { categoryOf, packFor } from './blocks';

  const CAT_LABEL: Record<string, string> = { amp: 'Amp', cab: 'Cab', drive: 'Drive', eq: 'EQ', dynamics: 'Dynamics', mod: 'Mod', time: 'Time', pitch: 'Pitch', util: 'Util' };
  const catOf = (name: string) => categoryOf(packFor(name) ?? name);

  type Family = { slug: string; name: string; page: number };
  type TypeOpt = { value: number; name: string; manufacturer: string | null; basedOn: string | null };

  let families = $state<Family[]>([]);
  let types = $state<TypeOpt[]>([]);
  let loading = $state(false);
  let query = $state('');
  let hi = $state(0);
  let realNames = $state(false);
  let inputEl = $state<HTMLInputElement | null>(null);
  // effect ids already on the grid — placed instances are greyed out + non-pickable (no point re-placing)
  const placedEids = $derived(new Set(editor.layout.cells.map((c) => c.effectId)));
  const isPlaced = (r: { kind: string; page: number }) => r.kind === 'Block' && placedEids.has(r.page);

  const retype = $derived(editor.paletteMode === 'retype');
  const target = $derived(editor.placeTarget ?? editor.firstEmptyCell);
  let cat = $state('all');
  const categories = $derived.by(() => {
    const seen = new Set<string>();
    for (const f of families) seen.add(catOf(f.name));
    return ['all', ...['amp', 'cab', 'drive', 'eq', 'dynamics', 'mod', 'time', 'pitch', 'util'].filter((c) => seen.has(c))];
  });

  // block recents + favorites (slugs), persisted client-side
  let recents = $state<string[]>([]);
  let favs = $state<string[]>([]);
  const BKEY = 'axs.blocks';
  function loadBlockStore() {
    try {
      const j = JSON.parse(localStorage.getItem(BKEY) || 'null');
      if (Array.isArray(j?.rec)) recents = j.rec;
      if (Array.isArray(j?.fav)) favs = j.fav;
    } catch {
      /* */
    }
  }
  function persistBlocks() {
    try {
      localStorage.setItem(BKEY, JSON.stringify({ rec: recents, fav: favs }));
    } catch {
      /* */
    }
  }
  function pushBlockRecent(slug: string) {
    recents = [slug, ...recents.filter((s) => s !== slug)].slice(0, 10);
    persistBlocks();
  }
  const isFav = (slug: string) => favs.includes(slug);
  function toggleFav(slug: string) {
    favs = isFav(slug) ? favs.filter((s) => s !== slug) : [slug, ...favs].slice(0, 60);
    persistBlocks();
  }

  // per-family TYPE recents + favorites (retype mode), keyed by block slug
  const blockSlug = $derived(retype ? (editor.selected?.pack?.toLowerCase() ?? '') : '');
  let typeRec = $state<number[]>([]);
  let typeFav = $state<number[]>([]);
  let brand = $state('all');
  const TKEY = 'axs.types';
  function loadTypeStore(slug: string) {
    typeRec = [];
    typeFav = [];
    try {
      const j = JSON.parse(localStorage.getItem(TKEY) || 'null');
      if (Array.isArray(j?.[slug]?.rec)) typeRec = j[slug].rec;
      if (Array.isArray(j?.[slug]?.fav)) typeFav = j[slug].fav;
    } catch {
      /* */
    }
  }
  function persistTypes(slug: string) {
    try {
      const j = JSON.parse(localStorage.getItem(TKEY) || '{}') || {};
      j[slug] = { rec: typeRec, fav: typeFav };
      localStorage.setItem(TKEY, JSON.stringify(j));
    } catch {
      /* */
    }
  }
  function pushTypeRecent(v: number) {
    typeRec = [v, ...typeRec.filter((x) => x !== v)].slice(0, 10);
    persistTypes(blockSlug);
  }
  const isTypeFav = (v: number) => typeFav.includes(v);
  function toggleTypeFav(v: number) {
    typeFav = isTypeFav(v) ? typeFav.filter((x) => x !== v) : [v, ...typeFav].slice(0, 60);
    persistTypes(blockSlug);
  }
  // brand filter tabs (retype + real names)
  const brands = $derived.by(() => {
    if (!retype || !realNames) return [] as string[];
    const seen = new Set<string>();
    for (const t of types) if (t.manufacturer) seen.add(t.manufacturer);
    return ['all', ...[...seen].sort()];
  });

  // load catalog when opened
  $effect(() => {
    if (!editor.paletteOpen) return;
    query = '';
    hi = 0;
    cat = 'all';
    brand = 'all';
    loadBlockStore();
    setTimeout(() => inputEl?.focus(), 0);
    if (retype) {
      const c = editor.selected;
      if (!c?.pack) return;
      loadTypeStore(c.pack.toLowerCase());
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
      return list.slice(0, 80).map((t) => ({ key: String(t.value), name: typeLabel(t), sub: t.name, kind: 'Model', value: t.value, page: 0, mfr: t.manufacturer ?? '' }));
    }
    const list = q ? families.filter((f) => (f.name + ' ' + f.slug).toLowerCase().includes(q)) : families;
    return list.slice(0, 80).map((f) => ({ key: f.slug, name: f.name, sub: f.slug, kind: 'Block', value: 0, page: f.page, mfr: '' }));
  });

  type Row = { key: string; name: string; sub: string; kind: string; value: number; page: number; mfr: string; fi: number };
  // sectioned view: query overrides; retype = Fav/Recent/All of models (or brand-filtered);
  // block-mode = Fav/Recent/All of blocks (or category-filtered)
  const view = $derived.by(() => {
    let i = 0;
    const seq = (rows: Omit<Row, 'fi'>[]) => rows.map((r) => ({ ...r, fi: i++ }));
    if (query.trim()) {
      const rows = seq(results);
      return { sections: [{ label: `${rows.length} result${rows.length === 1 ? '' : 's'}`, rows }], flat: rows };
    }
    if (retype) {
      if (realNames && brand !== 'all') {
        const rows = seq(results.filter((r) => r.mfr === brand));
        return { sections: [{ label: brand.toUpperCase(), rows }], flat: rows };
      }
      const byVal = new Map(results.map((r) => [r.value, r]));
      const mk = (vals: number[]) => vals.map((v) => byVal.get(v)).filter((r): r is Omit<Row, 'fi'> => !!r);
      const raw: { label: string; rows: Omit<Row, 'fi'>[] }[] = [];
      const fr = mk(typeFav);
      if (fr.length) raw.push({ label: 'FAVORITES', rows: fr });
      const rr = mk(typeRec);
      if (rr.length) raw.push({ label: 'RECENT', rows: rr });
      raw.push({ label: 'ALL MODELS', rows: results });
      const sections = raw.map((s) => ({ label: s.label, rows: seq(s.rows) }));
      return { sections, flat: sections.flatMap((s) => s.rows) };
    }
    if (cat !== 'all') {
      const rows = seq(results.filter((r) => catOf(r.name) === cat));
      return { sections: [{ label: CAT_LABEL[cat] ?? cat, rows }], flat: rows };
    }
    const bySlug = new Map<string, Family>(); // family slug → its first instance (for Fav/Recent rows)
    for (const f of families) if (!bySlug.has(f.slug)) bySlug.set(f.slug, f);
    const toRow = (f: Family): Omit<Row, 'fi'> => ({ key: f.slug, name: f.name, sub: f.slug, kind: 'Block', value: 0, page: f.page, mfr: '' });
    const mk = (slugs: string[]) => slugs.map((s) => bySlug.get(s)).filter((f): f is Family => !!f).map(toRow);
    const raw: { label: string; rows: Omit<Row, 'fi'>[] }[] = [];
    const fr = mk(favs);
    if (fr.length) raw.push({ label: 'FAVORITES', rows: fr });
    const rr = mk(recents);
    if (rr.length) raw.push({ label: 'RECENT', rows: rr });
    raw.push({ label: 'ALL BLOCKS', rows: results });
    const sections = raw.map((s) => ({ label: s.label, rows: seq(s.rows) }));
    return { sections, flat: sections.flatMap((s) => s.rows) };
  });

  function pick(r: Row | undefined) {
    if (!r) return;
    if (isPlaced(r)) {
      editor.showToast(`${r.name} is already on the grid`, '#d6543f');
      return;
    }
    if (retype) {
      editor.retype(r.value);
      pushTypeRecent(r.value);
      editor.showToast('Type changed', '#35c9d6');
    } else {
      const t = target;
      if (!t) {
        editor.showToast('Grid is full', '#d6543f');
      } else {
        editor.place(t.row, t.col, r.page, r.name);
        pushBlockRecent(r.sub);
        editor.showToast(`Placed ${r.name}`, '#35c9d6');
      }
    }
    editor.placeTarget = null;
    editor.paletteOpen = false;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      hi = Math.min(view.flat.length - 1, hi + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      hi = Math.max(0, hi - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(view.flat[hi]);
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
  <div class="bg" class:mob={editor.isMobile} role="presentation" onclick={() => (editor.paletteOpen = false)}>
    <div class="card" class:mob={editor.isMobile} role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
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

      {#if !retype}
        <div class="cats scroll">
          {#each categories as c (c)}
            <button class="cat" class:on={cat === c} onclick={() => { cat = c; hi = 0; }}>{c === 'all' ? 'All' : CAT_LABEL[c] ?? c}</button>
          {/each}
        </div>
      {:else if realNames && brands.length > 1}
        <div class="cats scroll">
          {#each brands as b (b)}
            <button class="cat" class:on={brand === b} onclick={() => { brand = b; hi = 0; }}>{b === 'all' ? 'All' : b}</button>
          {/each}
        </div>
      {/if}

      <div class="list scroll">
        {#if loading}
          <div class="empty">Loading…</div>
        {:else if view.flat.length === 0}
          <div class="empty">No matches for “{query}”.</div>
        {:else}
          {#each view.sections as s (s.label)}
            {#if s.label}<div class="section mono">{s.label}</div>{/if}
            {#each s.rows as r (`${r.key}#${r.fi}`)}
              {@const cat = chipFor(r)}
              <div class="rowwrap" class:hi={r.fi === hi} class:isplaced={isPlaced(r)}>
                <button class="row" disabled={isPlaced(r)} onmouseenter={() => (hi = r.fi)} onclick={() => pick(r)}>
                  <span class="chip" style="background:linear-gradient(180deg,{shade(cat.accent, 0.16)},{shade(cat.accent, -0.18)}); border-color:{shade(cat.accent, -0.3)};">{cat.glyph}</span>
                  <span class="rtext">
                    <span class="rname">{r.name}</span>
                    {#if r.sub && r.sub !== r.name}<span class="rsub">{r.sub}</span>{/if}
                  </span>
                  {#if isPlaced(r)}<span class="placed" title="This instance is already on the grid">on grid</span>{/if}
                  <span class="kind">{r.kind}</span>
                  {#if r.fi === hi && !isPlaced(r)}<span class="ret mono">↵</span>{/if}
                </button>
                {#if retype}
                  <button class="star" class:on={isTypeFav(r.value)} title={isTypeFav(r.value) ? 'Unfavorite' : 'Favorite'} aria-label="Favorite" onclick={() => toggleTypeFav(r.value)}>{isTypeFav(r.value) ? '★' : '☆'}</button>
                {:else}
                  <button class="star" class:on={isFav(r.sub)} title={isFav(r.sub) ? 'Unfavorite' : 'Favorite'} aria-label="Favorite" onclick={() => toggleFav(r.sub)}>{isFav(r.sub) ? '★' : '☆'}</button>
                {/if}
              </div>
            {/each}
          {/each}
        {/if}
      </div>

      <div class="foot mono">
        <span>↑↓ Navigate</span><span>⏎ {retype ? 'Change' : 'Place'}</span>{#if !retype}<span>★ Favorite</span>{/if}<span>Esc Close</span>
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
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 16px;
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: axsPalette 0.15s cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  /* mobile: dock the palette to the bottom as a slide-up sheet */
  .bg.mob {
    align-items: flex-end;
    padding: 0;
  }
  .card.mob {
    width: 100%;
    max-width: 100%;
    max-height: 88vh;
    border-radius: 18px 18px 0 0;
    border-bottom: 0;
    padding-bottom: env(safe-area-inset-bottom);
    animation: axsSheet 0.26s cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  .search {
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 18px 20px;
    border-bottom: 1px solid var(--surface2);
  }
  .search input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text);
    font-family: inherit;
    font-size: 17px;
    font-weight: 500;
  }
  .count {
    font-size: 12px;
    color: var(--textmuted);
    white-space: nowrap;
  }
  .chips {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 16px;
    border-bottom: 1px solid var(--surface2);
  }
  .target {
    padding: 6px 11px;
    background: var(--accent-tint);
    border: 1px solid var(--accent-border);
    border-radius: 7px;
    font-size: 11px;
    font-weight: 600;
    color: var(--accentbright);
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
  .cats {
    display: flex;
    gap: 6px;
    padding: 10px 16px;
    overflow-x: auto;
    border-bottom: 1px solid var(--surface2);
  }
  .cat {
    flex: none;
    padding: 6px 12px;
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
  .cat:focus-visible {
    border-color: var(--accent);
  }
  .cat.on {
    background: rgba(53, 201, 214, 0.14);
    border-color: var(--accent-border);
    color: var(--accent);
  }
  .list {
    flex: 1;
    min-height: 140px;
    overflow-y: auto;
    padding: 8px 8px 10px;
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
    padding: 13px 10px 8px;
  }
  .rowwrap {
    display: flex;
    align-items: center;
    border-radius: 10px;
  }
  .rowwrap.hi {
    background: rgba(53, 201, 214, 0.1);
    box-shadow: inset 0 0 0 1px rgba(53, 201, 214, 0.3);
  }
  .row {
    flex: 1;
    min-width: 0;
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
  /* already on the grid → greyed + non-interactive (the instance can't be placed twice) */
  .rowwrap.isplaced .rname,
  .rowwrap.isplaced .rsub,
  .rowwrap.isplaced .chip {
    opacity: 0.4;
  }
  .rowwrap.isplaced {
    background: transparent;
    box-shadow: none;
  }
  .row:disabled {
    cursor: default;
  }
  .star {
    flex: none;
    width: 40px;
    height: 40px;
    margin-right: 6px;
    border: 0;
    background: transparent;
    color: var(--border3);
    font-size: 17px;
    cursor: pointer;
    border-radius: 9px;
  }
  .star:hover,
  .star.on {
    color: var(--amber);
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
    color: var(--text);
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
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rsub {
    font-size: 11.5px;
    color: var(--textfaint);
  }
  .kind {
    flex: none;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-mut);
    padding: 4px 9px;
    background: var(--surface2);
    border: 1px solid var(--border-2);
    border-radius: 6px;
    white-space: nowrap;
  }
  .placed {
    flex: none;
    font-size: 10px;
    font-weight: 600;
    color: var(--amber);
    padding: 3px 8px;
    background: rgba(245, 166, 35, 0.12);
    border: 1px solid rgba(245, 166, 35, 0.3);
    border-radius: 6px;
    white-space: nowrap;
  }
  .ret {
    flex: none;
    font-size: 10px;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-tint);
    border: 1px solid var(--accent-border);
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
