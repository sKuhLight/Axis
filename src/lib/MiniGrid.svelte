<script lang="ts">
  // Read-only routing-grid preview for the Preset Browser. Renders a preset's PresetGrid (positions,
  // colors, routing cables) at a fixed compact size; clicking a block calls `onpick(effectId)`.
  import type { PresetGrid, GridCell } from './types';

  let {
    grid,
    selectedEid = null,
    color,
    onpick
  }: {
    grid: PresetGrid;
    selectedEid?: number | null;
    color: (cell: GridCell) => string;
    onpick: (eid: number) => void;
  } = $props();

  const CW = 62, CH = 32, GAP = 18;
  const rows = $derived(grid.rows || 4);
  const cols = $derived(Math.max(1, ...grid.cells.map((c) => c.col)));
  const W = $derived(cols * (CW + GAP) - GAP + 2);
  const H = $derived(rows * (CH + GAP) - GAP + 2);
  const px = (col: number) => (col - 1) * (CW + GAP);
  const py = (row: number) => (row - 1) * (CH + GAP);
  const cellAt = $derived.by(() => { const m = new Map<string, GridCell>(); for (const c of grid.cells) m.set(`${c.row},${c.col}`, c); return m; });
  // routing cables: each cell is fed from fromRows of the previous column
  // Cables run CENTRE-to-CENTRE so they form continuous wires: the segments under opaque block tiles
  // are hidden, while the parts crossing gaps and (transparent) shunt cells stay visible — including
  // the fork/merge diagonals of parallel rows.
  const cables = $derived.by(() => {
    const segs: { d: string }[] = [];
    for (const c of grid.cells) {
      if (c.col <= 1 || !c.fromRows.length) continue;
      const x2 = px(c.col) + CW / 2, y2 = py(c.row) + CH / 2;
      for (const fr of c.fromRows) {
        const x1 = px(c.col - 1) + CW / 2, y1 = py(fr) + CH / 2;
        const mx = (x1 + x2) / 2;
        segs.push({ d: y1 === y2 ? `M${x1},${y1} L${x2},${y2}` : `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}` });
      }
    }
    return segs;
  });
  const label = (c: GridCell) => c.name.replace(/\s+\d+$/, ''); // "Amp 1" → "Amp"
</script>

<div class="mg-scroll">
  <div class="mg" style="width:{W}px; height:{H}px;">
    <svg class="cables" width={W} height={H}>
      {#each cables as c}<path d={c.d} fill="none" stroke="#3a3a44" stroke-width="1.5" />{/each}
    </svg>
    {#each grid.cells as c}
      {#if c.isShunt}
        <div class="shunt" style="left:{px(c.col)}px; top:{py(c.row)}px; width:{CW}px; height:{CH}px;"><span class="dot"></span></div>
      {:else}
        <button
          class="tile"
          class:sel={selectedEid === c.effectId}
          style="left:{px(c.col)}px; top:{py(c.row)}px; width:{CW}px; height:{CH}px; --c:{color(c)};"
          title={c.name}
          onclick={() => onpick(c.effectId)}
        >{label(c)}</button>
      {/if}
    {/each}
  </div>
</div>

<style>
  .mg-scroll { width: 100%; height: 100%; overflow: auto; padding: 14px 18px; box-sizing: border-box; }
  .mg { position: relative; }
  .cables { position: absolute; inset: 0; pointer-events: none; }
  .tile {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    font: 600 10px/1 'JetBrains Mono', monospace;
    color: var(--c);
    background: color-mix(in srgb, var(--c) 16%, #0e0e11);
    border: 1px solid color-mix(in srgb, var(--c) 45%, transparent);
    cursor: pointer;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    padding: 0 4px;
    transition: background 0.1s;
  }
  .tile:hover { background: color-mix(in srgb, var(--c) 26%, #0e0e11); }
  .tile.sel { background: color-mix(in srgb, var(--c) 36%, #0e0e11); border-color: var(--c); box-shadow: 0 0 0 1px var(--c); color: #fff; }
  .shunt { position: absolute; display: flex; align-items: center; justify-content: center; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--border2); border: 1px solid var(--border3); }
</style>
