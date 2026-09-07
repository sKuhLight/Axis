<script lang="ts">
  // GRID MAP — a collapsible miniature of the WHOLE routing grid shown with the Block Editor
  // (design/Axis Editor.dc.html "GRID MAP NAVIGATOR"). Lets you hop between blocks without leaving
  // the editor (especially on mobile, where the main grid is paginated), add blocks, and route:
  // tap a port (◉) to arm link mode, then tap ANY cell in a later column — editor.connect() lays
  // shunts through the gaps, so the destination is never restricted to the adjacent column.
  // Arm state is editor.linkFrom (shared with the SignalGrid: arm here, complete there — or vice versa).
  import { onMount } from 'svelte';
  import { baseName } from './editor.svelte';
  import { getEditorSurface } from './editorSurface';
  const editor = getEditorSurface();
  import { catFor } from './catalog';
  import { setGridHover, clearGridHover } from './gridHover.svelte';
  import type { Cell } from './grid';

  const COLLAPSE_KEY = 'axs.gridmap.collapsed';
  const ZOOM_KEY = 'axs.gridmap.zoom';
  const loadCollapsed = (): boolean => {
    // Start focused on block controls; only an explicit user expansion opens the map.
    try { return localStorage.getItem(COLLAPSE_KEY) !== '0'; }
    catch { return true; }
  };
  let collapsed = $state(loadCollapsed());
  // Hold H for a quick name legend without permanently crowding the compact map.
  let showBlockTags = $state(false);
  const toggle = () => {
    collapsed = !collapsed;
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* */ }
  };

  onMount(() => {
    const isEditing = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditing(event.target) || event.metaKey || event.ctrlKey || event.altKey || event.key.toLowerCase() !== 'h') return;
      showBlockTags = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'h') showBlockTags = false;
    };
    const clearTags = () => { showBlockTags = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearTags);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearTags);
    };
  });

  // ── fit-to-width sizing + zoom ──
  // zoom 1 = the comfortable default (fit, cells capped at 32px); zooming IN grows the cells ONLY
  // as far as the whole grid still fits the band — the dynamic `zoomMax` below stops exactly at
  // fill-the-width, so tiles can never grow past the viewport.
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 2.5; // absolute ceiling; the effective max is min(this, fill-the-band)
  const ZOOM_STEP = 0.25;
  const loadZoom = (): number => {
    try {
      const z = Number(localStorage.getItem(ZOOM_KEY));
      return Number.isFinite(z) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) : 1;
    } catch { return 1; }
  };
  let zoom = $state(loadZoom());
  const setZoom = (dir: 1 | -1) => {
    // clamp against the DYNAMIC ceiling so + can never push tiles past the band width; also pull a
    // persisted zoom that exceeds the current band's ceiling back down on the first adjustment
    zoom = Math.min(zoomMax, Math.max(ZOOM_MIN, Math.round((Math.min(zoom, zoomMax) + dir * ZOOM_STEP) * 100) / 100));
    try { localStorage.setItem(ZOOM_KEY, String(zoom)); } catch { /* */ }
  };

  const rows = $derived(editor.layout.rows || 4);
  const cols = $derived(editor.layout.cols || 12);
  const GAP = 15;
  const PAD_X = 28; // .body horizontal padding (14 + 14)
  // Selected cells add a 2px outer ring and scale slightly, so the scroll body
  // needs clearance above row zero to avoid clipping that treatment.
  const PAD_TOP = 5;
  let bodyEl = $state<HTMLDivElement | null>(null);
  let bodyW = $state(0); // measured band width (Svelte resize-observes bind:clientWidth)
  /** Uncapped per-cell space: at this size the grid EXACTLY fills the band width. */
  const rawFit = $derived.by(() => {
    const inner = bodyW - PAD_X;
    return inner > 0 ? (inner - (cols - 1) * GAP) / cols : 0;
  });
  const fitCell = $derived.by(() => {
    if (rawFit <= 0) return editor.isMobile ? 30 : 28; // pre-measure fallback (one frame)
    // phones: below ~22px tiles get too small to tap — hold the 30px touch target and let
    // auto-centering deal with the overflow instead of shrinking further
    if (editor.isMobile && rawFit < 22) return 30;
    return Math.min(Math.max(rawFit, 16), 32);
  });
  /** Effective zoom ceiling: cells stop growing when the grid fills the band (never overflow).
   *  1 when the band is already full (or overflowing via the phone touch-target guard). */
  const zoomMax = $derived(rawFit > fitCell ? Math.min(ZOOM_MAX, rawFit / fitCell) : 1);
  const cell = $derived(Math.round(fitCell * Math.min(zoom, zoomMax)));
  const canvasW = $derived(cols * cell + (cols - 1) * GAP);
  const canvasH = $derived(rows * cell + (rows - 1) * GAP);

  const cellAt = $derived.by(() => {
    const m = new Map<string, Cell>();
    for (const c of [...editor.layout.cells, ...editor.layout.shunts]) m.set(`${c.row},${c.col}`, c);
    return m;
  });

  const armed = $derived(editor.linkFrom);
  const armedName = $derived(armed ? armed.display || baseName(armed.pack ?? '') || 'block' : '');
  const hint = $derived(
    armed
      ? `Routing from ${armedName} — tap a destination block (any later column) · tap again to cancel`
      : editor.canGridRoute
        ? 'tap a block to edit · + to add · ◉ to route'
        : 'tap a block to edit'
  );

  // SVG wire overlay from the real routing (fromRows — the same data the SignalGrid renders)
  const wires = $derived.by(() => {
    const cx = (col: number) => col * (cell + GAP);
    const cy = (row: number) => row * (cell + GAP);
    const list: { key: string; d: string; stroke: string }[] = [];
    for (const c of [...editor.layout.cells, ...editor.layout.shunts]) {
      if (c.col === 0 || c.fromRows.length === 0) continue;
      const x2 = cx(c.col);
      const y2 = cy(c.row) + cell / 2;
      for (const fr of c.fromRows) {
        const key = `${fr},${c.col - 1}->${c.row},${c.col}`;
        if (list.some((w) => w.key === key)) continue;
        const x1 = cx(c.col - 1) + cell;
        const y1 = cy(fr) + cell / 2;
        const mx = (x1 + x2) / 2;
        list.push({
          key,
          d: `M${x1} ${y1} C${mx} ${y1},${mx} ${y2},${x2} ${y2}`,
          stroke: 'var(--text2)'
        });
      }
    }
    return list;
  });
  const bypasses = $derived(
    [...editor.layout.cells, ...editor.layout.shunts].filter(
      (cell) => cell.kind === 'block' && cell.bypassed
    )
  );

  // ✛ Quick Build — opens the Quick Build bottom sheet (the block palette) instead of the old palette flow
  function openAdd() {
    editor.quickBuildOpen = true;
  }

  type Drag = { cell: Cell; startX: number; startY: number; x: number; y: number };
  let dragStart = $state<Drag | null>(null);
  let drag = $state<Drag | null>(null);
  let dragTarget = $state<{ row: number; col: number } | null>(null);
  let ignoreClick = $state<string | null>(null);

  function cellFromPoint(x: number, y: number): { row: number; col: number } | null {
    const el = document.elementFromPoint(x, y);
    if (!el?.closest('.map')) return null;
    const cell = el.closest<HTMLElement>('[data-idx]');
    if (!cell?.dataset.idx) return null;
    const [row, col] = cell.dataset.idx.split(',').map(Number);
    return Number.isFinite(row) && Number.isFinite(col) ? { row, col } : null;
  }

  function onBlockDown(cl: Cell, e: PointerEvent) {
    // Keep touch free for scrolling and tapping the compact map; desktop uses drag-to-move.
    if (e.pointerType !== 'mouse' || e.button !== 0 || editor.linkFrom) return;
    dragStart = { cell: cl, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY };
  }

  function onCell(r: number, c: number) {
    if (ignoreClick === `${r},${c}`) return;
    if (editor.linkFrom) {
      editor.completeLink(r, c); // any later column — blocks, shunts or empty (connect lays shunts)
      return;
    }
    const cl = cellAt.get(`${r},${c}`);
    if (cl?.kind === 'block') editor.openCell(cl); // fast swap — stays in the editor
    else if (cl?.kind === 'shunt') editor.openCell(cl); // select the shunt (no editor) — Backspace removes it
    else if (!cl) {
      editor.selectCellOnDevice(r, c);
      editor.openPaletteAt(r, c);
    }
  }

  function onPort(cl: Cell, e: Event) {
    e.stopPropagation();
    editor.armLink(cl); // tapping the armed port again cancels
  }

  const showPort = (cl: Cell) => editor.canGridRoute && cl.col < cols - 1 && cl.pack !== 'Output';
  // while armed, every cell in a LATER column is a valid destination
  const isTarget = (c: number) => !!armed && c > armed.col;

  onMount(() => {
    const move = (e: PointerEvent) => {
      if (!drag) {
        if (!dragStart || Math.hypot(e.clientX - dragStart.startX, e.clientY - dragStart.startY) < 6) return;
        drag = dragStart;
        dragStart = null;
      }
      drag = { ...drag, x: e.clientX, y: e.clientY };
      dragTarget = cellFromPoint(e.clientX, e.clientY);
    };
    const up = (e: PointerEvent) => {
      const source = drag;
      const target = dragTarget;
      dragStart = null;
      drag = null;
      dragTarget = null;
      if (!source || !target) return;
      ignoreClick = `${target.row},${target.col}`;
      setTimeout(() => (ignoreClick = null), 0);
      const occupied = cellAt.get(`${target.row},${target.col}`);
      if (occupied?.kind === 'block') {
        editor.showToast('Cell occupied', '#d6543f');
        return;
      }
      editor.move(source.cell, target.row, target.col);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  });

  // auto-center the relevant cell — the armed link source while routing, else the open block —
  // whenever it, the cell size (zoom/fit) or the band width changes, so overflow never needs
  // manual scrolling to find the part that matters
  $effect(() => {
    const key = armed ? `${armed.row},${armed.col}` : editor.selKey;
    const el = bodyEl;
    const size = cell; // tracked: re-center on zoom / fit changes
    if (!el || !key || bodyW <= 0) return;
    const [row, col] = key.split(',').map(Number);
    if (!Number.isFinite(col) || col < 0) return;
    const x = PAD_X / 2 + col * (size + GAP) + size / 2; // cell center incl. left padding
    // `.body` scrolls vertically too now (the map shrinks on a short pane rather than pushing the
    // rest of the editor off), so centre on both axes — otherwise the open block can sit below the
    // fold with nothing to point at it.
    const y = PAD_TOP + (Number.isFinite(row) && row >= 0 ? row : 0) * (size + GAP) + size / 2;
    el.scrollTo({
      left: Math.max(0, x - el.clientWidth / 2),
      top: Math.max(0, y - el.clientHeight / 2),
      behavior: 'smooth'
    });
  });
</script>

<div class="map" data-screen="Grid Map">
  <div class="head">
    <span class="ttl mono">GRID MAP</span>
    <span class="hint mono" class:armed={!!armed}>{hint}</span>
    <span class="sp"></span>
    {#if !collapsed}
      <button class="fold" title="Zoom out" aria-label="Zoom out" disabled={Math.min(zoom, zoomMax) <= ZOOM_MIN} onclick={() => setZoom(-1)}>−</button>
      <button class="fold" title="Zoom in (max = grid fills the map)" aria-label="Zoom in" disabled={Math.min(zoom, zoomMax) >= zoomMax} onclick={() => setZoom(1)}>+</button>
    {/if}
    {#if editor.canGridRoute}
      <button class="add" title="Quick Build" onclick={openAdd}>Quick Build</button>
    {/if}
    <button class="fold" title={collapsed ? 'Expand map' : 'Collapse map'} aria-label={collapsed ? 'Expand map' : 'Collapse map'} onclick={toggle}>{collapsed ? '▾' : '▴'}</button>
  </div>
  {#if !collapsed}
    <div class="body" bind:this={bodyEl} bind:clientWidth={bodyW}>
      <div class="canvas" style="width:{canvasW}px; height:{canvasH}px;">
        <svg class="wires" width={canvasW} height={canvasH}>
          {#each wires as w (w.key)}
            <path d={w.d} fill="none" stroke={w.stroke} stroke-width="2" opacity="0.85" />
          {/each}
        </svg>
        <div class="cells" style="grid-template-columns:repeat({cols}, {cell}px); grid-template-rows:repeat({rows}, {cell}px); gap:{GAP}px;">
          {#each Array(rows) as _, r}
            {#each Array(cols) as _, c}
              {@const cl = cellAt.get(`${r},${c}`)}
              {#if cl?.kind === 'block'}
                {@const cat = catFor(cl.pack, baseName(cl.display))}
                {@const open = editor.selKey === `${r},${c}`}
                <div
                  class="mc block"
                  class:open
                  class:byp={cl.bypassed}
                  class:tgt={isTarget(c)}
                  class:dragging={drag?.cell === cl}
                  class:drop-target={dragTarget?.row === r && dragTarget?.col === c}
                  style="--c:{cat.accent}; --glyph-size:{Math.max(13, Math.round(cell * 0.42))}px;"
                  data-idx="{r},{c}"
                  role="button"
                  tabindex="0"
                  title={cl.display}
                  onclick={() => onCell(r, c)}
                  onpointerdown={(e) => onBlockDown(cl, e)}
                  onkeydown={(e) => e.key === 'Enter' && onCell(r, c)}
                  onmouseenter={() => setGridHover(r, c)}
                  onmouseleave={() => clearGridHover(r, c)}
                >
                  {#if showBlockTags}<span class="block-tag">{baseName(cl.display || cl.pack || '') || 'Block'}</span>{/if}
                  <span class="glyph">{@html cat.glyph}</span>
                  {#if showPort(cl)}
                    <button
                      class="port"
                      class:armed={!!armed && armed.row === r && armed.col === c}
                      title="Route from here"
                      aria-label="Route from {cl.display}"
                      onpointerdown={(e) => e.stopPropagation()}
                      onclick={(e) => onPort(cl, e)}
                    ></button>
                  {/if}
                </div>
              {:else if cl?.kind === 'shunt'}
                <div
                  class="mc shunt"
                  class:open={editor.selKey === `${r},${c}`}
                  class:tgt={isTarget(c)}
                  class:drop-target={dragTarget?.row === r && dragTarget?.col === c}
                  data-idx="{r},{c}"
                  role="button"
                  tabindex="0"
                  title="Shunt"
                  onclick={() => onCell(r, c)}
                  onkeydown={(e) => e.key === 'Enter' && onCell(r, c)}
                  onmouseenter={() => setGridHover(r, c)}
                  onmouseleave={() => clearGridHover(r, c)}
                >
                  <span class="dash"></span>
                  {#if showPort(cl)}
                    <button
                      class="port"
                      class:armed={!!armed && armed.row === r && armed.col === c}
                      title="Route from here"
                      aria-label="Route from shunt"
                      onclick={(e) => onPort(cl, e)}
                    ></button>
                  {/if}
                </div>
              {:else}
                <button class="mc empty" class:tgt={isTarget(c)} class:drop-target={dragTarget?.row === r && dragTarget?.col === c} data-idx="{r},{c}" title="Add a block here" onclick={() => onCell(r, c)}>
                  <span class="plus">+</span>
                </button>
              {/if}
            {/each}
          {/each}
        </div>
        <svg class="bypass-wires" width={canvasW} height={canvasH}>
          {#each bypasses as bypass (`${bypass.row},${bypass.col}`)}
            <path
              d="M{bypass.col * (cell + GAP)} {bypass.row * (cell + GAP) + cell / 2} H{bypass.col * (cell + GAP) + cell}"
              fill="none"
              stroke="var(--text2)"
              stroke-width="2"
              opacity="0.85"
            />
          {/each}
        </svg>
      </div>
    </div>
  {/if}
</div>

{#if drag}
  {@const cat = catFor(drag.cell.pack, baseName(drag.cell.display))}
  <div class="drag-ghost" style="left:{drag.x}px; top:{drag.y}px; --c:{cat.accent}; --gridmap-cell:{cell}px; --glyph-size:{Math.max(13, Math.round(cell * 0.42))}px;">
    <span class="glyph">{@html cat.glyph}</span>
  </div>
{/if}

<style>
  .map {
    /* Shrinkable, NOT `flex: none`. The canvas is `rows × cell` and `cell` is fit-to-WIDTH times a
       persisted zoom (`zoomMax` only ever clamped against the band's width), so on a wide-but-short pane
       the map can want more height than the whole Block Editor has. As a rigid flex item it won its
       claim and pushed the control surface below it out the bottom of the card's `overflow: hidden` —
       that content silently vanished with no scrollbar to reveal it. Shrinking here lets flexbox settle
       the card within its pane; `.body` scrolls whatever doesn't fit. */
    flex: 0 1 auto;
    min-height: 0;
    /* a column, so the height flexbox hands `.map` propagates to `.body` as a scroll budget instead of
       simply overflowing it */
    display: flex;
    flex-direction: column;
    background: var(--bg2);
    border-bottom: 1px solid var(--surface2);
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--d-gap);
    padding: var(--d-pad-y) var(--d-pad-x) calc(var(--d-pad-y) * 0.7);
    /* `.map` is a flex column now — the title/zoom/collapse row keeps its height, `.body` absorbs */
    flex: none;
  }
  .ttl {
    font: 700 calc(var(--d-font-sm) * 0.9) / 1 var(--font-mono);
    letter-spacing: 0.14em;
    color: var(--textfaint);
    flex: none;
  }
  .hint {
    font: 500 calc(var(--d-font-sm) * 0.9) / 1.3 var(--font-mono);
    color: var(--textmuted);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hint.armed {
    font-weight: 600;
    color: var(--accent);
  }
  .sp {
    flex: 1;
    min-width: 6px;
  }
  .add {
    display: flex;
    align-items: center;
    gap: 5px;
    height: var(--d-ctl-h-xs);
    padding: 0 calc(var(--d-pad-x) * 0.8);
    border-radius: 8px;
    cursor: pointer;
    font: 700 var(--d-font-sm) / 1 var(--font-ui);
    background: var(--accent-tint);
    border: 1px solid var(--accent-border);
    color: var(--accent);
    white-space: nowrap;
  }
  .fold {
    width: var(--d-ctl-h-xs);
    height: var(--d-ctl-h-xs);
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    cursor: pointer;
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--textdim);
    font-size: 11px;
  }
  .fold:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .body {
    overflow-x: auto;
    /* vertical too, now that `.map` can be shrunk below the canvas height — the map pans instead of
       being clipped, which is the same gesture zoomed-in horizontal overflow already uses */
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    padding: 5px var(--d-pad-x) var(--d-pad-x);
    /* zoomed-in overflow pans by touch/wheel — no scrollbar chrome (auto-centering finds the open block) */
    scrollbar-width: none;
  }
  .body::-webkit-scrollbar {
    display: none;
  }
  .canvas {
    position: relative;
    margin: 0 auto; /* center the mini-grid when it's narrower than the band */
  }
  .wires {
    position: absolute;
    inset: 0;
    overflow: visible;
    pointer-events: none;
    z-index: 0;
  }
  .bypass-wires {
    position: absolute;
    inset: 0;
    overflow: visible;
    pointer-events: none;
    z-index: 3;
  }
  .cells {
    position: relative;
    z-index: 1;
    display: grid;
  }
  .mc {
    position: relative;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-sizing: border-box;
    padding: 0;
    user-select: none;
    -webkit-user-select: none;
    transition: transform 0.1s, box-shadow 0.1s;
  }
  .mc.block {
    background: color-mix(in srgb, var(--c) 26%, var(--bg2));
    border: 1px solid color-mix(in srgb, var(--c) 55%, transparent);
  }
  .mc.block:hover {
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent);
  }
  .mc.block.dragging {
    opacity: 0.45;
    cursor: grabbing;
  }
  .mc.drop-target {
    box-shadow: 0 0 0 2px var(--accent);
  }
  .drag-ghost {
    position: fixed;
    z-index: 9999;
    width: var(--gridmap-cell, 28px);
    height: var(--gridmap-cell, 28px);
    transform: translate(-50%, -50%) rotate(-4deg);
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid color-mix(in srgb, var(--c) 55%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--c) 26%, var(--bg2));
    box-shadow: 0 16px 36px color-mix(in srgb, var(--bg) 65%, transparent);
    color: var(--text);
    font-size: var(--glyph-size, 13px);
    line-height: 1;
    pointer-events: none;
  }
  .mc.block .glyph {
    font-size: var(--glyph-size, 13px);
    line-height: 1;
    color: var(--text);
  }
  .block-tag {
    position: absolute;
    /* Center the label on the tile edge so every floating label has an unambiguous owner. */
    bottom: 100%;
    transform: translateY(50%);
    z-index: 5;
    max-width: 120px;
    overflow: hidden;
    padding: 2px 5px;
    border: 1px solid var(--border2);
    border-radius: 4px;
    background: var(--surface);
    color: var(--text);
    font: 600 9px/1.1 var(--font-mono);
    pointer-events: none;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
    box-shadow: 0 2px 5px color-mix(in srgb, var(--bg) 65%, transparent);
  }
  .mc.block.byp {
    opacity: 0.45;
  }
  .mc.block.open {
    box-shadow: 0 0 0 2px var(--accent), 0 0 10px color-mix(in srgb, var(--accent) 45%, transparent);
    transform: scale(1.04);
    z-index: 2;
  }
  .mc.shunt {
    background: var(--surface);
    border: 1px solid var(--border2);
  }
  .mc.shunt.open {
    box-shadow: 0 0 0 2px var(--amber), 0 0 10px color-mix(in srgb, var(--amber) 45%, transparent);
    transform: scale(1.04);
    z-index: 2;
  }
  .dash {
    width: 52%;
    height: 2px;
    background: var(--textmuted);
    border-radius: 1px;
  }
  .mc.empty {
    background: transparent;
    border: 1px dashed var(--border2);
  }
  .mc.empty:hover {
    border-color: var(--border3);
  }
  .plus {
    font-size: 13px;
    line-height: 1;
    color: var(--textmuted);
    font-weight: 600;
  }
  /* while armed, every later-column cell is a valid destination */
  .mc.block.tgt,
  .mc.shunt.tgt {
    box-shadow: 0 0 0 2px var(--accent);
  }
  .mc.empty.tgt {
    border: 1px dashed var(--accent);
    background: var(--accent-tint);
  }
  .mc.empty.tgt .plus {
    color: var(--accent);
  }
  .port {
    position: absolute;
    right: -4px;
    top: 50%;
    transform: translateY(-50%);
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: var(--border3);
    border: 1.5px solid var(--bg2);
    cursor: crosshair;
    z-index: 4;
    padding: 0;
    transition: transform 0.1s;
  }
  .mc.block .port {
    background: color-mix(in srgb, var(--c) 80%, #fff);
  }
  .port:hover {
    transform: translateY(-50%) scale(1.3);
  }
  .port.armed {
    background: var(--accent);
    transform: translateY(-50%) scale(1.3);
    box-shadow: 0 0 7px color-mix(in srgb, var(--accent) 60%, transparent);
  }
</style>
