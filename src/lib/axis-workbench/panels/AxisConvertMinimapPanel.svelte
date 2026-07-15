<script lang="ts">
  // Cross-device converter — read-only SOURCE-device grid + drag source (M4 · META-24 · AXIS-52).
  //
  // Renders the fully-decoded SOURCE preset (e.g. FM3) as a compact, read-only grid — all source blocks
  // + cables — adapting GridMap's visuals (NOT GridMap itself; that's shared with the live editor). Each
  // source block is a pointer-drag handle: drag it onto a cell of the CONVERTED TARGET grid (the main
  // SignalGrid, tagged `data-screen="Signal Grid"`) to place/move its converted equivalent there. The
  // auto-conversion of the target is unchanged; this panel is a reference + drag source only.
  import { convert } from '../../convert.svelte';
  import { convertEditor } from '../../convertEditor.svelte';
  import { convertScratch } from '../../convertScratch.svelte';
  import { gridLayoutFromConverterPreset, presetEffectKeyMap } from '../../convertGridAdapter';
  import { EMPTY_LAYOUT, titleCase } from '../../convertScratchAdapter';
  import { sourceOutcomeFor } from '../../convertDecorations';
  import { sevToken } from '../../convertConflicts';
  import { catFor } from '../../catalog';
  import { baseName } from '../../editor.svelte';
  import type { Cell } from '../../grid';
  import type { PanelInstance } from '../../workbench';

  let { panel: _panel }: { panel: PanelInstance } = $props();

  const src = $derived(convert.result?.sourcePreset ?? null);
  const events = $derived(convert.result?.events ?? []);

  // Per-source-block conversion outcome (carried ✓ / substituted ~ / clamped ± / merged ⤵ / unverified ?
  // / unresolved ! / unplaced ⇱ / dropped ✕). Recomputes as the user resolves (reads convertScratch.state).
  const outcomeFor = (key: string | null) =>
    key ? sourceOutcomeFor(events, convertScratch.state, key) : null;
  // Badge fill: carried = the neutral ok token, everything else its content-severity token.
  const badgeFill = (o: ReturnType<typeof sourceOutcomeFor>) =>
    o.outcome === 'carried' ? 'var(--ok)' : sevToken(o.sev);
  const layout = $derived(src ? gridLayoutFromConverterPreset(src) : EMPTY_LAYOUT);
  const keyMap = $derived(src ? presetEffectKeyMap(src) : new Map<number, string>());
  // gridCells present → render the 2-D grid; otherwise (slot/chain source) fall back to a block list.
  const hasGrid = $derived(layout.cells.length > 0 || layout.shunts.length > 0);

  // ── compact grid geometry (fixed cell; horizontal scroll on overflow) ──
  const rows = $derived(layout.rows || 4);
  const cols = $derived(layout.cols || 12);
  const CELL = 26;
  const GAP = 5;
  const canvasW = $derived(cols * CELL + (cols - 1) * GAP);
  const canvasH = $derived(rows * CELL + (rows - 1) * GAP);

  const cellAt = $derived.by(() => {
    const m = new Map<string, Cell>();
    for (const c of [...layout.cells, ...layout.shunts]) m.set(`${c.row},${c.col}`, c);
    return m;
  });

  // SVG wire overlay from the source routing (fromRows) — same technique GridMap uses.
  const wires = $derived.by(() => {
    const cx = (col: number) => col * (CELL + GAP);
    const cy = (row: number) => row * (CELL + GAP);
    const list: { key: string; d: string; stroke: string }[] = [];
    for (const c of [...layout.cells, ...layout.shunts]) {
      if (c.col === 0 || c.fromRows.length === 0) continue;
      const x2 = cx(c.col);
      const y2 = cy(c.row) + CELL / 2;
      for (const fr of c.fromRows) {
        const key = `${fr},${c.col - 1}->${c.row},${c.col}`;
        if (list.some((w) => w.key === key)) continue;
        const from = cellAt.get(`${fr},${c.col - 1}`);
        const x1 = cx(c.col - 1) + CELL;
        const y1 = cy(fr) + CELL / 2;
        const mx = (x1 + x2) / 2;
        list.push({
          key,
          d: `M${x1} ${y1} C${mx} ${y1},${mx} ${y2},${x2} ${y2}`,
          stroke: from && from.kind === 'block' ? from.color : 'var(--border3)'
        });
      }
    }
    return list;
  });

  const keyForCell = (cl: Cell): string | null => keyMap.get(cl.effectId) ?? null;

  // ── pointer-drag: a source block → a TARGET-grid cell ──
  // Floating ghost follows the pointer; drop hit-tests document.elementFromPoint for a target-grid cell.
  let ghost = $state<{ key: string; name: string; x: number; y: number } | null>(null);

  function startDrag(key: string | null, name: string, e: PointerEvent) {
    if (!key) return;
    // Dropped blocks (no target equivalent) are inert — never draggable.
    if (outcomeFor(key)?.outcome === 'dropped') return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    tip = null;
    ghost = { key, name, x: e.clientX, y: e.clientY };
  }
  // Hit-test the pointer against a TARGET-grid cell; returns its (row,col) or null when off-grid.
  function targetCellUnder(e: PointerEvent): { row: number; col: number } | null {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const cellEl = el?.closest<HTMLElement>('[data-idx]');
    const overTargetGrid = !!el?.closest('[data-screen="Signal Grid"]');
    if (!cellEl?.dataset.idx || !overTargetGrid) return null;
    const [row, col] = cellEl.dataset.idx.split(',').map(Number);
    return Number.isFinite(row) && Number.isFinite(col) ? { row, col } : null;
  }
  function dragMove(e: PointerEvent) {
    if (!ghost) return;
    ghost = { ...ghost, x: e.clientX, y: e.clientY };
    // Drive the target grid's drop-preview (same ＋/✕ the native move shows) via the shared surface.
    const t = targetCellUnder(e);
    if (t) convertEditor.setExternalDrop(ghost.key, t.row, t.col);
    else convertEditor.clearExternalDrop();
  }
  function dragEnd(e: PointerEvent) {
    const g = ghost;
    ghost = null;
    convertEditor.clearExternalDrop();
    if (!g) return;
    const t = targetCellUnder(e);
    if (t) convertEditor.placeSourceBlock(g.key, t.row, t.col);
  }

  // ── hover tooltip (rich, floating) ──
  // A real floating tooltip — the native `title` is unreliable on the small pointer-capture drag cells,
  // and the design calls for a styled tip (name + FAMILY · OUTCOME + what happened) like the live grid.
  let tip = $state<{ x: number; y: number; title: string; sub: string; desc: string; sev: string } | null>(null);
  const TIP_W = 260;
  // Position the tip near the pointer, flipping to the left / above when it would overflow the viewport
  // (the source panel hugs the right edge, so right-flip is the common case).
  const tipX = (clientX: number) => (clientX + 14 + TIP_W > window.innerWidth ? Math.max(6, clientX - 14 - TIP_W) : clientX + 14);
  const tipY = (clientY: number) => (clientY + 14 + 110 > window.innerHeight ? Math.max(6, clientY - 14 - 90) : clientY + 14);
  function showTip(e: MouseEvent, title: string, familyName: string, oc: ReturnType<typeof sourceOutcomeFor> | null) {
    if (ghost) return; // never over a drag
    tip = {
      x: tipX(e.clientX),
      y: tipY(e.clientY),
      title,
      sub: oc ? `${familyName.toUpperCase()} · ${oc.label.toUpperCase()}` : familyName.toUpperCase(),
      desc: oc?.desc ?? '',
      sev: oc ? (oc.outcome === 'carried' ? 'var(--ok)' : sevToken(oc.sev)) : 'var(--accent)'
    };
  }
  const moveTip = (e: MouseEvent) => {
    if (tip) tip = { ...tip, x: tipX(e.clientX), y: tipY(e.clientY) };
  };
  const hideTip = () => {
    tip = null;
  };
</script>

<div class="src-map" data-screen="Convert Source">
  <div class="head">
    <span class="ttl mono">SOURCE · {src?.sourceDevice ?? '—'}</span>
    <span class="hint mono">{src ? 'drag a block onto the converted grid' : ''}</span>
  </div>

  {#if !src}
    <div class="empty mono">Run a conversion to see the source layout.</div>
  {:else if hasGrid}
    <div class="body">
      <div class="canvas" style="width:{canvasW}px; height:{canvasH}px;">
        <svg class="wires" width={canvasW} height={canvasH}>
          {#each wires as w (w.key)}
            <path d={w.d} fill="none" stroke={w.stroke} stroke-width="1.6" opacity="0.55" />
          {/each}
        </svg>
        <div class="cells" style="grid-template-columns:repeat({cols}, {CELL}px); grid-template-rows:repeat({rows}, {CELL}px); gap:{GAP}px;">
          {#each Array(rows) as _, r}
            {#each Array(cols) as _, c}
              {@const cl = cellAt.get(`${r},${c}`)}
              {#if cl?.kind === 'block'}
                {@const cat = catFor(cl.pack, baseName(cl.display))}
                {@const key = keyForCell(cl)}
                {@const oc = outcomeFor(key)}
                <div
                  class="mc block"
                  class:byp={cl.bypassed}
                  class:drag={ghost?.key === key}
                  class:dropped={oc?.outcome === 'dropped'}
                  style="--c:{cat.accent};"
                  role="button"
                  tabindex="0"
                  aria-label={oc ? `${cl.display} · ${oc.label}` : cl.display}
                  onpointerdown={(e) => startDrag(key, cl.display, e)}
                  onpointermove={dragMove}
                  onpointerup={dragEnd}
                  onmouseenter={(e) => showTip(e, cl.display, cl.pack ?? '', oc)}
                  onmousemove={moveTip}
                  onmouseleave={hideTip}
                >
                  <span class="glyph">{cat.glyph}</span>
                  {#if oc}<span class="src-badge" style="background:{badgeFill(oc)};">{oc.icon}</span>{/if}
                </div>
              {:else if cl?.kind === 'shunt'}
                <div class="mc shunt" title="Shunt">
                  <span class="dash"></span>
                </div>
              {:else}
                <div class="mc empty-cell"></div>
              {/if}
            {/each}
          {/each}
        </div>
      </div>
    </div>
  {:else}
    <!-- slot/chain source (AM4/VP4): no 2-D grid → a draggable block list -->
    <div class="list">
      {#each src.blocks as b (b.key)}
        {@const name = b.typeName ?? titleCase(b.family)}
        {@const cat = catFor(titleCase(b.family), baseName(name))}
        {@const oc = outcomeFor(b.key)}
        <div
          class="row"
          class:drag={ghost?.key === b.key}
          class:dropped={oc?.outcome === 'dropped'}
          style="--c:{cat.accent};"
          role="button"
          tabindex="0"
          aria-label={oc ? `${name} · ${oc.label}` : name}
          onpointerdown={(e) => startDrag(b.key, name, e)}
          onpointermove={dragMove}
          onpointerup={dragEnd}
          onmouseenter={(e) => showTip(e, name, titleCase(b.family), oc)}
          onmousemove={moveTip}
          onmouseleave={hideTip}
        >
          <span class="glyph">{cat.glyph}</span>
          <span class="nm">{name}</span>
          {#if oc}<span class="src-badge row-badge" style="background:{badgeFill(oc)};">{oc.icon}</span>{/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if ghost}
  <div class="ghost mono" style="left:{ghost.x}px; top:{ghost.y}px;">{ghost.name}</div>
{/if}

{#if tip}
  <div class="tip" style="left:{tip.x}px; top:{tip.y}px;">
    <div class="tip-title">{tip.title}</div>
    <div class="tip-sub mono">{tip.sub}</div>
    {#if tip.desc}
      <div class="tip-line">
        <span class="tip-dot" style="background:{tip.sev};"></span>
        <span>{tip.desc}</span>
      </div>
    {/if}
  </div>
{/if}

<style>
  .src-map {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--bg2);
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 9px 12px 7px;
    flex: none;
  }
  .ttl {
    font: 700 10px/1 var(--font-mono);
    letter-spacing: 0.12em;
    color: var(--textdim);
    flex: none;
  }
  .hint {
    font: 500 10px/1.3 var(--font-mono);
    color: var(--textfaint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    padding: 16px;
    text-align: center;
    font: 500 11px/1.5 var(--font-mono);
    color: var(--textfaint);
  }
  .body {
    flex: 1;
    overflow: auto;
    padding: 2px 12px 12px;
    scrollbar-width: thin;
  }
  .canvas {
    position: relative;
    margin: 0 auto;
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
    box-sizing: border-box;
    padding: 0;
  }
  .mc.block {
    cursor: grab;
    background: color-mix(in srgb, var(--c) 26%, var(--bg2));
    border: 1px solid color-mix(in srgb, var(--c) 55%, transparent);
    touch-action: none;
  }
  .mc.block:hover {
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent);
  }
  .mc.block:active {
    cursor: grabbing;
  }
  .mc.block.byp {
    opacity: 0.45;
  }
  .mc.block.drag {
    opacity: 0.4;
  }
  .mc.block.dropped {
    opacity: 0.42;
    filter: grayscale(0.4);
    cursor: not-allowed;
  }
  .src-badge {
    position: absolute;
    top: 3px;
    right: 3px;
    z-index: 4;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    font: 800 9px/1 var(--font-mono, monospace);
    /* dark ink reads on every (saturated) severity fill in both themes — matches the design badges */
    color: #10121a;
    box-shadow: 0 0 5px rgba(0, 0, 0, 0.25);
  }
  .row-badge {
    position: static;
    flex: none;
    margin-left: auto;
  }
  .row.dropped {
    opacity: 0.5;
    filter: grayscale(0.4);
    cursor: not-allowed;
  }
  .mc.block .glyph {
    font-size: 13px;
    line-height: 1;
    color: var(--text);
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
  .mc.empty-cell {
    background: transparent;
    border: 1px dashed var(--border2);
    opacity: 0.5;
  }
  .list {
    flex: 1;
    overflow: auto;
    padding: 4px 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    scrollbar-width: thin;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 7px 10px;
    border-radius: 7px;
    cursor: grab;
    touch-action: none;
    background: color-mix(in srgb, var(--c) 16%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--c) 40%, transparent);
  }
  .row:hover {
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent);
  }
  .row:active {
    cursor: grabbing;
  }
  .row.drag {
    opacity: 0.4;
  }
  .row .glyph {
    font-size: 14px;
    line-height: 1;
    color: var(--text);
    flex: none;
  }
  .row .nm {
    font: 600 12px/1.2 var(--font-ui);
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ghost {
    position: fixed;
    z-index: 9999;
    transform: translate(10px, 10px);
    padding: 4px 9px;
    border-radius: 7px;
    pointer-events: none;
    font: 700 11px/1 var(--font-mono);
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--accent-border);
    box-shadow: 0 6px 20px color-mix(in srgb, var(--accent) 25%, transparent);
    white-space: nowrap;
  }
  .tip {
    position: fixed;
    z-index: 9998;
    pointer-events: none;
    max-width: 260px;
    padding: 8px 11px;
    border-radius: 10px;
    background: var(--surface);
    border: 1px solid var(--border3, var(--border));
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.45);
  }
  .tip-title {
    font: 800 12.5px/1.2 var(--font-ui, sans-serif);
    color: var(--text);
  }
  .tip-sub {
    margin-top: 3px;
    font: 600 8.5px/1 var(--font-mono, monospace);
    letter-spacing: 0.08em;
    color: var(--textfaint, var(--textdim));
  }
  .tip-line {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-top: 7px;
    font-size: 11px;
    color: var(--text2, var(--text));
  }
  .tip-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: none;
  }
</style>
