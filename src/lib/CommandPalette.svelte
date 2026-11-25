<script lang="ts">
  import BlockGlyph from './BlockGlyph.svelte';
  import { tick } from 'svelte';
  import { editor, baseName } from './editor.svelte';
  import { forgefx } from './forgefx';
  import { catFor, shade } from './catalog';
  import { categoryOf, packFor } from './blocks';
  import PaletteShell, { type PaletteShellFilter } from './PaletteShell.svelte';
  import {
    BLOCK_LIBRARY_NAME_LIMIT,
    compatibleLibraryEntry,
    putBlockLibraryEntry,
    readBlockLibrary,
    removeBlockLibraryEntry,
    type BlockLibraryEntry
  } from './blockLibrary';

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
  // effect ids already on the grid — placed instances are greyed out + non-pickable (no point re-placing)
  const placedEids = $derived(new Set(editor.layout.cells.map((c) => c.effectId)));
  const isPlaced = (r: { kind: string; page: number }) => r.kind === 'Block' && placedEids.has(r.page);

  const retype = $derived(editor.paletteMode === 'retype');
  const libraryTarget = $derived(retype ? editor.blockLibraryTarget : null);
  const libraryMode = $derived(retype ? editor.blockLibraryMode : null);
  let libraryEntries = $state<BlockLibraryEntry[]>([]);
  let selectedLibraryEntry = $state<BlockLibraryEntry | null>(null);
  let libraryName = $state('');
  let libraryNameInput = $state<HTMLInputElement | null>(null);
  let libraryError = $state('');
  let confirmRemoval = $state(false);
  const libraryMatches = $derived(libraryEntries.filter((entry) =>
    entry.family === libraryTarget?.family &&
    `${entry.name} ${entry.type?.name ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())
  ));

  $effect(() => {
    if (!editor.paletteOpen || !libraryMode) return;
    void libraryTarget?.key;
    libraryEntries = readBlockLibrary(localStorage);
    selectedLibraryEntry = null;
    confirmRemoval = false;
    libraryError = '';
    libraryName = '';
    query = '';
    hi = 0;
  });
  $effect(() => {
    if (editor.paletteOpen && libraryMode === 'save') {
      void tick().then(() => libraryNameInput?.focus());
    }
  });

  function selectLibraryEntry(entry: BlockLibraryEntry | undefined) {
    if (!entry || editor.blockLibraryBusy) return;
    selectedLibraryEntry = entry;
    confirmRemoval = false;
    libraryError = '';
  }

  async function saveLibraryEntry(event: SubmitEvent) {
    event.preventDefault();
    const target = libraryTarget;
    const name = libraryName.trim();
    if (!name || !target || editor.blockLibraryBusy) return;
    libraryError = '';
    try {
      const entry = await editor.captureBlockLibrary(name, target);
      putBlockLibraryEntry(localStorage, entry);
      editor.showToast(`Saved “${entry.name}” to the block library`);
      editor.blockLibraryMode = 'browse';
    } catch (error) {
      libraryError = error instanceof Error ? error.message : 'Could not save this block.';
    }
  }

  async function loadLibraryEntry(entry: BlockLibraryEntry) {
    const target = libraryTarget;
    if (!target || editor.blockLibraryBusy) return;
    libraryError = '';
    try {
      await editor.applyBlockLibrary(entry, target);
      editor.showToast(`Loaded “${entry.name}” into ${target.display}`);
      editor.paletteOpen = false;
    } catch (error) {
      libraryError = error instanceof Error ? error.message : 'Could not load this block.';
    }
  }

  function deleteLibraryEntry(entry: BlockLibraryEntry) {
    try {
      removeBlockLibraryEntry(localStorage, entry.id);
      libraryEntries = readBlockLibrary(localStorage);
      selectedLibraryEntry = null;
      confirmRemoval = false;
    } catch {
      libraryError = 'Could not remove this entry.';
    }
  }

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

  // Filter chips: block categories (place), or brands (retype with real names).
  const shellFilters = $derived.by<PaletteShellFilter[]>(() => {
    if (!retype) return categories.map((c) => ({ id: c, label: c === 'all' ? 'All' : CAT_LABEL[c] ?? c }));
    if (realNames && brands.length > 1) return brands.map((b) => ({ id: b, label: b === 'all' ? 'All' : b }));
    return [];
  });
  function setFilter(id: string) {
    if (retype) brand = id;
    else cat = id;
  }

  function chipFor(r: { sub: string; kind: string; name?: string }) {
    // grid blocks: the same family catalog the Signal Grid tiles use (name -> pack), so the block's own accent + glyph show
    if (r.kind === 'Block') return catFor(packFor(r.name ?? r.sub), r.name ?? r.sub);
    const c = editor.selected;
    return catFor(c?.pack ?? null, baseName(c?.display ?? ''));
  }
</script>

{#snippet realNamesToggle()}
  {#if retype}
    <div class="type-extras">
      {#if !libraryMode}<label class="rn"><input type="checkbox" bind:checked={realNames} /> real names</label>{/if}
      {#if libraryMode || libraryTarget}
        <button
          class="library-button"
          type="button"
          disabled={editor.blockLibraryBusy}
          onclick={() => {
            if (libraryMode) {
              editor.blockLibraryMode = null;
              query = '';
              hi = 0;
            } else editor.openBlockLibrary('browse');
          }}
        >{libraryMode ? 'Types' : 'Library'}</button>
      {/if}
    </div>
  {/if}
{/snippet}

<PaletteShell
  open={editor.paletteOpen}
  mobile={editor.isMobile}
  label={libraryMode ? 'Block library' : undefined}
  bind:query
  bind:hi
  placeholder={libraryMode ? 'Search saved blocks…' : retype ? 'Search types…' : 'Search amps, drives, delays, reverbs…'}
  inputLabel={libraryMode ? 'Search saved blocks' : undefined}
  count={libraryMode ? `${libraryMatches.length} saved` : `${results.length} result${results.length === 1 ? '' : 's'}`}
  target={libraryMode ? 'Block library' : retype ? '↻ Change type' : undefined}
  targetExtra={realNamesToggle}
  filters={libraryMode ? [] : shellFilters}
  filter={retype ? brand : cat}
  onFilter={setFilter}
  itemCount={libraryMode === 'browse' ? libraryMatches.length : libraryMode === 'save' ? 0 : view.flat.length}
  onPick={(index) => libraryMode === 'browse' ? selectLibraryEntry(libraryMatches[index]) : libraryMode === null ? pick(view.flat[index]) : undefined}
  onClose={() => { if (!editor.blockLibraryBusy) editor.paletteOpen = false; }}
  escapeAnywhere={!!libraryMode}
  hints={libraryMode ? ['↑↓ Navigate', 'Esc Close'] : ['↑↓ Navigate', `⏎ ${retype ? 'Change' : 'Place'}`, ...(retype ? [] : ['★ Favorite']), 'Esc Close']}
>
  {#if libraryMode}
    <div class="library-panel">
      {#if libraryError}<p class="library-error" role="alert">{libraryError}</p>{/if}
      {#if !libraryTarget}
        <p>Open a block on the connected device to use the library.</p>
      {:else if libraryMode === 'save'}
        <form class="library-save" onsubmit={saveLibraryEntry}>
          <p>Save the current settings of {libraryTarget.display}{libraryTarget.channel ? `, channel ${libraryTarget.channel}` : ''}.</p>
          <label>
            Name
            <input bind:this={libraryNameInput} bind:value={libraryName} maxlength={BLOCK_LIBRARY_NAME_LIMIT} required placeholder={editor.blockType?.name ?? libraryTarget.display} />
          </label>
          <div class="library-actions">
            <button type="submit" class="library-button primary" disabled={!libraryName.trim() || editor.blockLibraryBusy}>{editor.blockLibraryBusy ? 'Saving…' : 'Save'}</button>
            <button type="button" class="library-button" disabled={editor.blockLibraryBusy} onclick={() => (editor.blockLibraryMode = 'browse')}>Back to library</button>
          </div>
        </form>
      {:else}
        <button type="button" class="library-button" disabled={editor.blockLibraryBusy} onclick={() => (editor.blockLibraryMode = 'save')}>Save current block</button>
        {#each libraryMatches as entry, i (entry.id)}
          <button
            type="button"
            class="library-row"
            class:hi={hi === i}
            aria-pressed={selectedLibraryEntry?.id === entry.id}
            onmouseenter={() => (hi = i)}
            onclick={() => selectLibraryEntry(entry)}
          >
            <strong>{entry.name}</strong>
            <span>{entry.type?.name ?? libraryTarget.display} · firmware {entry.firmware}</span>
          </button>
        {:else}
          <p>{query.trim() ? 'No matching saved blocks.' : 'No saved settings for this block family.'}</p>
        {/each}
        {#if selectedLibraryEntry}
          {@const selected = selectedLibraryEntry}
          <div class="library-selection">
            {#if compatibleLibraryEntry(selected, libraryTarget)}
              <p>Load “{selected.name}” into {libraryTarget.display}{libraryTarget.channel ? `, channel ${libraryTarget.channel}` : ''}.</p>
            {:else}
              <p>This entry needs its original device model and firmware.</p>
            {/if}
            <div class="library-actions">
              <button type="button" class="library-button primary" disabled={editor.blockLibraryBusy || !compatibleLibraryEntry(selected, libraryTarget)} onclick={() => loadLibraryEntry(selected)}>{editor.blockLibraryBusy ? 'Loading…' : 'Load'}</button>
              {#if confirmRemoval}
                <button type="button" class="library-button" disabled={editor.blockLibraryBusy} onclick={() => deleteLibraryEntry(selected)}>Confirm removal</button>
                <button type="button" class="library-button" disabled={editor.blockLibraryBusy} onclick={() => (confirmRemoval = false)}>Cancel</button>
              {:else}
                <button type="button" class="library-button" disabled={editor.blockLibraryBusy} onclick={() => (confirmRemoval = true)}>Remove entry</button>
              {/if}
            </div>
          </div>
        {/if}
      {/if}
    </div>
  {:else if loading}
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
            <span class="chip" style="background:linear-gradient(180deg,{shade(cat.accent, 0.16)},{shade(cat.accent, -0.18)}); border-color:{shade(cat.accent, -0.3)};"><BlockGlyph glyph={cat.glyph} /></span>
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
</PaletteShell>

<style>
  .type-extras {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .library-panel {
    display: grid;
    gap: 8px;
    padding: 10px;
  }
  .library-panel p {
    margin: 0;
    color: var(--textdim);
    font-size: 13px;
  }
  .library-panel .library-error { color: var(--danger); }
  .library-button,
  .library-row,
  .library-save input {
    min-height: 36px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    padding: 6px 10px;
    color: var(--text);
    font: inherit;
  }
  .library-button { justify-self: start; cursor: pointer; }
  .library-button:disabled { opacity: 0.55; cursor: default; }
  .library-button.primary,
  .library-row[aria-pressed='true'] { border-color: var(--accent-border); color: var(--accent); }
  .library-row {
    display: grid;
    gap: 4px;
    text-align: left;
    cursor: pointer;
  }
  .library-row span { color: var(--textdim); font-size: 11px; }
  .library-row.hi { background: var(--surface2); }
  .library-selection,
  .library-save,
  .library-save label { display: grid; gap: 8px; }
  .library-selection { padding-top: 8px; }
  .library-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .rn {
    margin-left: auto;
    font-size: 11px;
    color: var(--text-mut);
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
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
