<script lang="ts">
  // GRID MAP — a collapsible miniature of the WHOLE routing grid shown with the Block Editor
  // (design/Axis Editor.dc.html "GRID MAP NAVIGATOR"). Lets you hop between blocks without leaving
  // the editor (especially on mobile, where the main grid is paginated), add blocks, and route:
  // tap a port (◉) to arm link mode, then tap ANY cell in a later column — editor.connect() lays
  // shunts through the gaps, so the destination is never restricted to the adjacent column.
  // Arm state is editor.linkFrom (shared with the SignalGrid: arm here, complete there — or vice versa).
  import { editor, baseName } from './editor.svelte';
  import { catFor } from './catalog';
  import type { Cell } from './grid';

  const COLLAPSE_KEY = 'axs.gridmap.collapsed';
  const loadCollapsed = (): boolean => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; }
    catch { return false; }
  };
  let collapsed = $state(loadCollapsed());
  const toggle = () => {
    collapsed = !collapsed;
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* */ }
  };

  const rows = $derived(editor.layout.rows || 4);
  const cols = $derived(editor.layout.cols || 12);
  const cell = $derived(editor.isMobile ? 30 : 26);
  const GAP = 4;
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
        const src = cellAt.get(`${fr},${c.col - 1}`);
        const x1 = cx(c.col - 1) + cell;
        const y1 = cy(fr) + cell / 2;
        const mx = (x1 + x2) / 2;
        list.push({
          key,
          d: `M${x1} ${y1} C${mx} ${y1},${mx} ${y2},${x2} ${y2}`,
          stroke: src && src.kind === 'block' ? src.color : 'var(--border3)'
        });
      }
    }
    return list;
  });

  // ✛ Add — same palette flow the grid uses; no explicit cell = the palette targets the first free one
  function openAdd() {
    editor.paletteMode = 'place';
    editor.placeTarget = null;
    editor.paletteOpen = true;
  }

  function onCell(r: number, c: number) {
    if (editor.linkFrom) {
      editor.completeLink(r, c); // any later column — blocks, shunts or empty (connect lays shunts)
      return;
    }
    const cl = cellAt.get(`${r},${c}`);
    if (cl?.kind === 'block') editor.openCell(cl); // fast swap — stays in the editor
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
</script>

<div class="map" data-screen="Grid Map">
  <div class="head">
    <span class="ttl mono">GRID MAP</span>
    <span class="hint mono" class:armed={!!armed}>{hint}</span>
    <span class="sp"></span>
    {#if editor.canGridRoute}
      <button class="add" title="Add a block" onclick={openAdd}>✛ Add</button>
    {/if}
    <button class="fold" title={collapsed ? 'Expand map' : 'Collapse map'} aria-label={collapsed ? 'Expand map' : 'Collapse map'} onclick={toggle}>{collapsed ? '▾' : '▴'}</button>
  </div>
  {#if !collapsed}
    <div class="body scroll">
      <div class="canvas" style="width:{canvasW}px; height:{canvasH}px;">
        <svg class="wires" width={canvasW} height={canvasH}>
          {#each wires as w (w.key)}
            <path d={w.d} fill="none" stroke={w.stroke} stroke-width="1.6" opacity="0.6" />
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
                  style="--c:{cat.accent};"
                  role="button"
                  tabindex="0"
                  title={cl.display}
                  onclick={() => onCell(r, c)}
                  onkeydown={(e) => e.key === 'Enter' && onCell(r, c)}
                >
                  <span class="glyph">{cat.glyph}</span>
                  {#if showPort(cl)}
                    <button
                      class="port"
                      class:armed={!!armed && armed.row === r && armed.col === c}
                      title="Route from here"
                      aria-label="Route from {cl.display}"
                      onclick={(e) => onPort(cl, e)}
                    ></button>
                  {/if}
                </div>
              {:else if cl?.kind === 'shunt'}
                <div
                  class="mc shunt"
                  class:tgt={isTarget(c)}
                  role="button"
                  tabindex="0"
                  title="Shunt"
                  onclick={() => onCell(r, c)}
                  onkeydown={(e) => e.key === 'Enter' && onCell(r, c)}
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
                <button class="mc empty" class:tgt={isTarget(c)} title="Add a block here" onclick={() => onCell(r, c)}>
                  <span class="plus">+</span>
                </button>
              {/if}
            {/each}
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .map {
    flex: none;
    background: var(--bg2);
    border-bottom: 1px solid var(--surface2);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 14px 7px;
  }
  .ttl {
    font: 700 10px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: var(--textfaint);
    flex: none;
  }
  .hint {
    font: 500 10px/1.3 var(--font-mono);
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
    height: 28px;
    padding: 0 11px;
    border-radius: 8px;
    cursor: pointer;
    font: 700 11px/1 var(--font-ui);
    background: var(--accent-tint);
    border: 1px solid var(--accent-border);
    color: var(--accent);
    white-space: nowrap;
  }
  .fold {
    width: 28px;
    height: 28px;
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
  .body {
    overflow-x: auto;
    padding: 1px 14px 12px;
  }
  .canvas {
    position: relative;
    flex: none;
  }
  .wires {
    position: absolute;
    inset: 0;
    overflow: visible;
    pointer-events: none;
    z-index: 0;
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
    transition: transform 0.1s, box-shadow 0.1s;
  }
  .mc.block {
    background: color-mix(in srgb, var(--c) 26%, var(--bg2));
    border: 1px solid color-mix(in srgb, var(--c) 55%, transparent);
  }
  .mc.block:hover {
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent);
  }
  .mc.block .glyph {
    font-size: 13px;
    line-height: 1;
    color: var(--text);
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
