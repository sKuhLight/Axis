<script lang="ts">
  // Quick Build sidecar (q → right slide-in) — all placeable blocks, dragged onto the live signal grid.
  // Persistent (no scrim) so multiple drag-drops can be chained; Esc / ✕ closes it. Drop hits the live
  // grid (`data-screen="Signal Grid"`) and routes through `editor.place`, which handles empty cells and
  // shunt replacement. Mirrors AxisConvertMinimapPanel's pointer-drag + elementFromPoint hit-testing.
  import { editor } from './editor.svelte';
  import { forgefx } from './forgefx';
  import { catFor, shade } from './catalog';
  import { categoryOf } from './blocks';
  import { quickBuildDropValid, packForSlug } from './quickBuild';
  import type { BlockSummary } from './types';

  const CAT_LABEL: Record<string, string> = { amp: 'Amp', cab: 'Cab', drive: 'Drive', eq: 'EQ', dynamics: 'Dynamics', mod: 'Mod', time: 'Time', pitch: 'Pitch', util: 'Util' };
  const CAT_ORDER = ['amp', 'cab', 'drive', 'eq', 'dynamics', 'mod', 'time', 'pitch', 'util'];

  let families = $state<BlockSummary[]>([]);
  let loading = $state(false);
  let fetched = false;
  let query = $state('');
  let cat = $state('all');

  const packOf = (f: BlockSummary) => packForSlug(f.slug);
  const chipFor = (f: BlockSummary) => catFor(packOf(f));
  const catOf = (f: BlockSummary) => categoryOf(packOf(f) ?? '');

  // effect ids already on the grid — placed instances are greyed out + non-draggable (no re-placing)
  const placedEids = $derived(new Set(editor.layout.cells.map((c) => c.effectId)));
  const isPlaced = (f: BlockSummary) => placedEids.has(f.page);

  const categories = $derived.by(() => {
    const seen = new Set<string>();
    for (const f of families) seen.add(catOf(f));
    return ['all', ...CAT_ORDER.filter((c) => seen.has(c))];
  });
  const rows = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const list = q ? families.filter((f) => (f.name + ' ' + f.slug).toLowerCase().includes(q)) : families;
    return list.filter((f) => cat === 'all' || catOf(f) === cat).slice(0, 120);
  });

  $effect(() => {
    if (!editor.quickBuildOpen) return;
    query = '';
    cat = 'all';
    if (fetched) return;
    fetched = true;
    loading = true;
    forgefx
      .blocks()
      .then((b) => (families = b))
      .catch(() => (families = []))
      .finally(() => (loading = false));
  });

  // ── pointer-drag: a block chip → a live-grid cell ──
  let ghost = $state<{ name: string; x: number; y: number } | null>(null);
  let dragging = $state<BlockSummary | null>(null);

  function startDrag(f: BlockSummary, e: PointerEvent) {
    if (isPlaced(f)) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    ghost = { name: f.name, x: e.clientX, y: e.clientY };
    dragging = f;
  }
  // Hit-test the pointer against a live grid cell — either the main Signal Grid or the block editor's
  // Grid Map navigator (both map to the same real (row,col)). Returns (row,col) or null when off-grid.
  function targetCellUnder(e: PointerEvent): { row: number; col: number } | null {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cellEl = el?.closest<HTMLElement>('[data-idx]');
    const overGrid = !!el?.closest('[data-screen="Signal Grid"], [data-screen="Grid Map"]');
    if (!cellEl?.dataset.idx || !overGrid) return null;
    const [row, col] = cellEl.dataset.idx.split(',').map(Number);
    return Number.isFinite(row) && Number.isFinite(col) ? { row, col } : null;
  }
  function moveDrag(e: PointerEvent) {
    if (!ghost || !dragging) return;
    ghost = { ...ghost, x: e.clientX, y: e.clientY };
    const t = targetCellUnder(e);
    if (t) editor.setExternalDrop(t.row, t.col, quickBuildDropValid(editor.layout.cells, editor.layout.shunts, t.row, t.col));
    else editor.clearExternalDrop();
  }
  function endDrag(e: PointerEvent) {
    const f = dragging;
    ghost = null;
    dragging = null;
    editor.clearExternalDrop();
    if (!f) return;
    const t = targetCellUnder(e);
    if (!t) return;
    if (!quickBuildDropValid(editor.layout.cells, editor.layout.shunts, t.row, t.col)) {
      editor.showToast('Cell occupied', '#d6543f');
      return;
    }
    void editor.place(t.row, t.col, f.page, f.name);
    editor.showToast(`Placed ${f.name}`, '#35c9d6');
  }

  function close() {
    editor.quickBuildOpen = false;
  }

  // Close on a pointerdown anywhere outside the sheet. Deliberately NOT a scrim: the sheet must stay
  // out of the way so a block can be dragged onto the grid — a scrim would intercept the drag. The drag
  // starts with a pointerdown INSIDE the sheet (and stopPropagation's it), so this never fires mid-drag.
  let rootEl = $state<HTMLDivElement | null>(null);
  function onOutsideDown(e: PointerEvent) {
    if (!editor.quickBuildOpen || !rootEl) return;
    if (!rootEl.contains(e.target as Node)) editor.quickBuildOpen = false;
  }

  // Esc / ✕ can close the sidecar mid-drag (pointer capture is released, so `endDrag` never fires) —
  // clear any lingering drop preview so the grid doesn't keep a stuck ＋/✕.
  $effect(() => {
    if (!editor.quickBuildOpen) editor.clearExternalDrop();
  });
</script>

<svelte:window onpointerdown={onOutsideDown} />

{#if editor.quickBuildOpen}
  <div class="qb" role="dialog" aria-label="Quick Build" bind:this={rootEl}>
    <div class="head">
      <div class="titlewrap">
        <span class="title">Quick Build</span>
        <span class="subtitle mono">DRAG A BLOCK ONTO THE GRID</span>
      </div>
      <span style="flex:1"></span>
      <button class="close" onclick={close} title="Close">✕</button>
    </div>

    <div class="search">
      <svg width="17" height="17" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5.2" fill="none" style="stroke:var(--textfaint)" stroke-width="1.5" /><path d="M10.8 10.8 L14.5 14.5" style="stroke:var(--textfaint)" stroke-width="1.5" stroke-linecap="round" /></svg>
      <input bind:value={query} placeholder="Search blocks…" spellcheck="false" autocomplete="off" />
      <span class="count mono">{rows.length}</span>
    </div>

    {#if categories.length > 1}
      <div class="cats">
        {#each categories as c (c)}
          <button class="cat" class:on={cat === c} onclick={() => (cat = c)}>{c === 'all' ? 'All' : CAT_LABEL[c] ?? c}</button>
        {/each}
      </div>
    {/if}

    <div class="list scroll">
      {#if loading}
        <div class="empty">Loading…</div>
      {:else if families.length === 0}
        <div class="empty">No blocks available.</div>
      {:else if rows.length === 0}
        <div class="empty">No matches for “{query}”.</div>
      {:else}
        <div class="grid">
          {#each rows as f (f.slug + ':' + f.page)}
            {@const chip = chipFor(f)}
            <div
              class="tile"
              class:dragging={dragging === f}
              class:isplaced={isPlaced(f)}
              style="background:linear-gradient(180deg,{shade(chip.accent, 0.16)},{shade(chip.accent, -0.18)}); border-color:{shade(chip.accent, -0.3)};"
              role="button"
              tabindex="0"
              aria-label={f.name}
              title={isPlaced(f) ? `${f.name} — already on the grid` : f.name}
              onpointerdown={(e) => startDrag(f, e)}
              onpointermove={moveDrag}
              onpointerup={endDrag}
            >
              <span class="glyph">{@html chip.glyph}</span>
              <span class="nm">{f.name}</span>
              {#if isPlaced(f)}<span class="placed" aria-hidden="true">✓</span>{/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="foot mono">
      <span>Drag to place</span><span>Esc Close</span>
    </div>
  </div>

  {#if ghost && dragging}
    {@const chip = chipFor(dragging)}
    <div
      class="ghost"
      style="left:{ghost.x}px; top:{ghost.y}px; background:linear-gradient(180deg,{shade(chip.accent, 0.16)},{shade(chip.accent, -0.18)}); border-color:{shade(chip.accent, -0.3)};"
    >
      <span class="ghost-glyph">{@html chip.glyph}</span>
      <span class="ghost-label">{ghost.name}</span>
    </div>
  {/if}
{/if}

<style>
  .qb {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 80%;
    z-index: 150;
    display: flex;
    flex-direction: column;
    background: var(--bg2);
    border-top: 1px solid var(--border);
    border-radius: 14px 14px 0 0;
    box-shadow: 0 -20px 50px rgba(0, 0, 0, 0.5);
    animation: qbSlide 0.24s cubic-bezier(0.2, 0.85, 0.25, 1);
    overflow: hidden;
  }
  @keyframes qbSlide {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 13px 16px;
    border-bottom: 1px solid var(--surface2);
    flex: none;
    background: linear-gradient(180deg, var(--surface), var(--bg2));
  }
  .titlewrap {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .title {
    font-weight: 700;
    font-size: 14px;
    color: var(--text);
  }
  .subtitle {
    font: 600 8px/1 var(--font-mono);
    letter-spacing: 0.1em;
    color: var(--textmuted);
  }
  .close {
    width: 30px;
    height: 30px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface2);
    border: 1px solid var(--border2);
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    color: var(--textdim);
  }
  .close:hover {
    border-color: var(--border3);
    color: var(--text);
  }
  .search {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--surface2);
    flex: none;
  }
  .search input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text);
    font-family: inherit;
    font-size: 14px;
    font-weight: 500;
  }
  .count {
    font-size: 11px;
    color: var(--textmuted);
    white-space: nowrap;
  }
  .cats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--surface2);
    flex: none;
  }
  .cat {
    flex: none;
    padding: 5px 10px;
    border-radius: 7px;
    border: 1px solid var(--border2);
    background: var(--surface2);
    color: var(--textdim);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }
  .cat.on {
    background: rgba(53, 201, 214, 0.14);
    border-color: var(--accent-border);
    color: var(--accent);
  }
  .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 8px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 56px);
    gap: 6px;
    justify-content: center;
    align-content: start;
  }
  .tile {
    position: relative;
    aspect-ratio: 1 / 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border-radius: 8px;
    border: 1px solid;
    cursor: grab;
    touch-action: none;
    user-select: none;
    overflow: hidden;
  }
  .tile:hover {
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
  }
  .tile:active {
    cursor: grabbing;
  }
  .tile.dragging {
    opacity: 0.4;
  }
  .tile.isplaced {
    opacity: 0.4;
    cursor: default;
  }
  .glyph {
    font-size: 16px;
    line-height: 1;
    color: var(--text);
  }
  .nm {
    max-width: 100%;
    padding: 0 3px;
    font: 600 9px/1.2 var(--font-ui);
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .placed {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    color: var(--bg);
    background: var(--amber);
    border-radius: 5px;
  }
  .empty {
    padding: 40px 20px;
    text-align: center;
    color: var(--text-faint);
    font-size: 13px;
  }
  .foot {
    display: flex;
    gap: 16px;
    padding: 9px 14px;
    border-top: 1px solid var(--surface2);
    font-size: 9.5px;
    color: var(--text-faint);
    flex: none;
  }
  .ghost {
    position: fixed;
    z-index: 9999;
    /* a tilted copy of the block tile, centered on the pointer (mirrors SignalGrid's move ghost) */
    transform: translate(-50%, -50%) rotate(-4deg);
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.55);
  }
  .ghost-glyph {
    font-size: 22px;
    line-height: 1;
    color: var(--text);
  }
  .ghost-label {
    font: 700 12px/1.2 var(--font-ui);
    color: var(--text);
    white-space: nowrap;
  }
  /* tokens used above that the app.css guarantees exist as vars */
</style>
