<script lang="ts">
  import { onMount } from 'svelte';
  import { editor, baseName } from './editor.svelte';
  import { catFor, shade } from './catalog';
  import type { Cell } from './grid';

  // ── responsive metrics ──
  const gap = $derived(editor.isMobile ? 16 : 26);
  const cols = $derived(editor.layout.rows ? editor.layout.cols : 12);
  const rows = $derived(editor.layout.rows || 4);

  // cell lookup by "row,col"
  const cellAt = $derived.by(() => {
    const m = new Map<string, Cell>();
    for (const c of [...editor.layout.cells, ...editor.layout.shunts]) m.set(`${c.row},${c.col}`, c);
    return m;
  });

  // ── measurement → cables ──
  let innerEl = $state<HTMLDivElement | null>(null);
  let rects = $state<Record<string, { left: number; right: number; cx: number; cy: number }>>({});
  let innerW = $state(1);
  let innerH = $state(1);

  function measure() {
    if (!innerEl) return;
    const ir = innerEl.getBoundingClientRect();
    const map: Record<string, { left: number; right: number; cx: number; cy: number }> = {};
    for (const el of innerEl.querySelectorAll<HTMLElement>('[data-idx]')) {
      const r = el.getBoundingClientRect();
      map[el.dataset.idx!] = {
        left: r.left - ir.left,
        right: r.right - ir.left,
        cx: (r.left + r.right) / 2 - ir.left,
        cy: (r.top + r.bottom) / 2 - ir.top
      };
    }
    rects = map;
    innerW = ir.width;
    innerH = ir.height;
  }

  onMount(() => {
    measure();
    const ro = new ResizeObserver(() => measure());
    if (innerEl) ro.observe(innerEl);
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  });
  // re-measure whenever the grid contents change
  $effect(() => {
    void editor.layout;
    void editor.editorOpen;
    void editor.vw;
    requestAnimationFrame(measure);
  });

  function cableD(x1: number, y1: number, x2: number, y2: number) {
    const dx = Math.max(22, (x2 - x1) * 0.5);
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} C${(x1 + dx).toFixed(1)} ${y1.toFixed(1)},${(x2 - dx).toFixed(1)} ${y2.toFixed(1)},${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }

  type Cable = { key: string; srcRow: number; srcCol: number; destRow: number; d: string; mx: number; my: number; stroke: string };
  const cables = $derived.by(() => {
    const list: Cable[] = [];
    for (const c of [...editor.layout.cells, ...editor.layout.shunts]) {
      if (c.col === 0 || c.fromRows.length === 0) continue;
      const dst = rects[`${c.row},${c.col}`];
      if (!dst) continue;
      for (const fr of c.fromRows) {
        const src = rects[`${fr},${c.col - 1}`];
        if (!src) continue;
        const dim = cellAt.get(`${fr},${c.col - 1}`)?.bypassed;
        list.push({
          key: `${fr},${c.col - 1}->${c.row},${c.col}`,
          srcRow: fr,
          srcCol: c.col - 1,
          destRow: c.row,
          d: cableD(src.right, src.cy, dst.left, dst.cy),
          mx: (src.right + dst.left) / 2,
          my: (src.cy + dst.cy) / 2,
          stroke: dim ? '#4a4a52' : '#c7c7cf'
        });
      }
    }
    return list;
  });

  let hoverCable = $state<string | null>(null);

  // ── pointer gestures: tap / double-tap / long-press move / port connect ──
  let gesture: { cell: Cell; startX: number; startY: number; moved: boolean } | null = null;
  let lpTimer: ReturnType<typeof setTimeout> | null = null;
  let lastTap: { key: string; t: number } | null = null;

  let moveMode = $state(false);
  let moveCell = $state<Cell | null>(null);
  let movePos = $state({ x: 0, y: 0 });
  let overBin = $state(false);

  let connectSrc = $state<Cell | null>(null);
  let linkTo = $state<{ x: number; y: number } | null>(null);

  function startMove() {
    if (!gesture) return;
    moveMode = true;
    moveCell = gesture.cell;
    movePos = { x: gesture.startX, y: gesture.startY };
    overBin = false;
  }

  function onBlockDown(cell: Cell, e: PointerEvent) {
    if (connectSrc) return;
    gesture = { cell, startX: e.clientX, startY: e.clientY, moved: false };
    if (lpTimer) clearTimeout(lpTimer);
    lpTimer = setTimeout(() => {
      if (gesture && !gesture.moved && !moveMode) startMove();
    }, 380);
  }

  function onPortDown(cell: Cell, e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!innerEl) return;
    connectSrc = cell;
    const ir = innerEl.getBoundingClientRect();
    linkTo = { x: e.clientX - ir.left, y: e.clientY - ir.top };
    document.body.style.cursor = 'crosshair';
  }

  function cellFromPoint(x: number, y: number): { row: number; col: number } | null {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-idx]');
    if (!el?.dataset.idx) return null;
    const [row, col] = el.dataset.idx.split(',').map(Number);
    return { row, col };
  }

  onMount(() => {
    const move = (e: PointerEvent) => {
      if (moveMode) {
        movePos = { x: e.clientX, y: e.clientY };
        overBin = !!document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-bin]');
        return;
      }
      if (connectSrc && innerEl) {
        const ir = innerEl.getBoundingClientRect();
        linkTo = { x: e.clientX - ir.left, y: e.clientY - ir.top };
        return;
      }
      if (gesture) {
        const dx = e.clientX - gesture.startX;
        const dy = e.clientY - gesture.startY;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
          gesture.moved = true;
          if (lpTimer) clearTimeout(lpTimer);
        }
      }
    };
    const up = (e: PointerEvent) => {
      if (lpTimer) clearTimeout(lpTimer);
      if (connectSrc) {
        const src = connectSrc;
        const tgt = cellFromPoint(e.clientX, e.clientY);
        if (tgt) editor.connect(src, tgt.row, tgt.col);
        connectSrc = null;
        linkTo = null;
        document.body.style.cursor = '';
        return;
      }
      if (moveMode && moveCell) {
        const src = moveCell;
        if (document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-bin]')) {
          editor.removeAt(src.row, src.col);
          editor.showToast('Block deleted', '#d6543f');
        } else {
          const tgt = cellFromPoint(e.clientX, e.clientY);
          if (tgt && (tgt.row !== src.row || tgt.col !== src.col)) {
            // move anywhere empty; same-col keeps wires, cross-col lets them drop (device default)
            if (cellAt.get(`${tgt.row},${tgt.col}`)) editor.showToast('Cell occupied', '#d6543f');
            else editor.move(src, tgt.row, tgt.col);
          }
        }
        moveMode = false;
        moveCell = null;
        gesture = null;
        return;
      }
      if (gesture) {
        const g = gesture;
        gesture = null;
        if (!g.moved) tap(g.cell);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  });

  function tap(cell: Cell) {
    if (cell.kind === 'shunt') {
      editor.removeAt(cell.row, cell.col);
      editor.showToast('Shunt removed', '#9a9aa3');
      return;
    }
    const key = `${cell.row},${cell.col}`;
    const now = Date.now();
    if (lastTap && lastTap.key === key && now - lastTap.t < 300) {
      lastTap = null;
      editor.toggleBypass(cell);
    } else {
      lastTap = { key, t: now };
      setTimeout(() => {
        if (lastTap && lastTap.key === key) {
          lastTap = null;
          editor.openCell(cell);
        }
      }, 240);
    }
  }

  // tile visual helpers
  function tileBg(accent: string) {
    return `linear-gradient(180deg, ${shade(accent, -0.42)}, ${shade(accent, -0.62)})`;
  }
</script>

<div class="gridwrap scroll" class:mob={editor.isMobile} data-screen="Signal Grid">
  {#if editor.status === 'loading'}
    <p class="hint">Connecting to ForgeFX…</p>
  {:else if editor.status === 'offline'}
    <div class="offline">
      <p class="hint">Device offline.</p>
      <p class="sub">Start the ForgeFX server (<code class="mono">localhost:5056</code>) and reconnect.</p>
      <button class="retry" onclick={() => editor.load()}>Retry</button>
    </div>
  {:else}
    <div
      class="inner"
      class:mob={editor.isMobile}
      bind:this={innerEl}
      style="--gap:{gap}px; --cols:{cols};"
    >
      <svg class="cables" width={innerW} height={innerH} style="width:{innerW}px;height:{innerH}px;">
        {#each cables as cab (cab.key)}
          <g
            role="presentation"
            onmouseenter={() => (hoverCable = cab.key)}
            onmouseleave={() => (hoverCable = null)}
          >
            <path d={cab.d} fill="none" stroke={cab.stroke} stroke-width="2" />
            <path
              d={cab.d}
              fill="none"
              stroke="rgba(0,0,0,0.001)"
              stroke-width="18"
              style="pointer-events:stroke; cursor:pointer;"
              role="button"
              tabindex="-1"
              aria-label="Remove connection"
              onclick={() => editor.disconnect(cab.srcRow, cab.srcCol, cab.destRow)}
              onkeydown={(e) => e.key === 'Enter' && editor.disconnect(cab.srcRow, cab.srcCol, cab.destRow)}
            />
            {#if hoverCable === cab.key}
              <g
                role="button"
                tabindex="-1"
                aria-label="Remove connection"
                style="cursor:pointer;"
                onclick={() => editor.disconnect(cab.srcRow, cab.srcCol, cab.destRow)}
                onkeydown={(e) => e.key === 'Enter' && editor.disconnect(cab.srcRow, cab.srcCol, cab.destRow)}
              >
                <circle cx={cab.mx} cy={cab.my} r="9" fill="#16161b" stroke="#6a6a74" stroke-width="1.5" />
                <text x={cab.mx} y={cab.my} text-anchor="middle" dominant-baseline="central" fill="#c7c7cf" font-size="13" font-weight="700" style="pointer-events:none;">×</text>
              </g>
            {/if}
          </g>
        {/each}
        {#if linkTo && connectSrc}
          {@const s = rects[`${connectSrc.row},${connectSrc.col}`]}
          {#if s}
            <path d={cableD(s.right, s.cy, linkTo.x, linkTo.y)} fill="none" stroke="#35c9d6" stroke-width="2.5" stroke-dasharray="6 5" />
          {/if}
        {/if}
      </svg>

      <div class="grid">
        {#each Array(rows) as _, r}
          {#each Array(cols) as _, c}
            {@const cell = cellAt.get(`${r},${c}`)}
            {#if cell?.kind === 'block'}
              {@const cat = catFor(cell.pack, baseName(cell.display))}
              {@const sel = editor.selKey === `${r},${c}`}
              {@const base = baseName(cell.display)}
              <div
                class="cell block"
                class:byp={cell.bypassed}
                class:sel
                class:moving={moveMode && moveCell === cell}
                data-idx="{r},{c}"
                role="button"
                tabindex="0"
                style="background:{tileBg(cat.accent)}; border-color:{shade(cat.accent, -0.05)};"
                onpointerdown={(e) => onBlockDown(cell, e)}
              >
                <span class="glyph">{cat.glyph}</span>
                <span class="b-label">{cat.short}</span>
                {#if base && base !== cat.short}<span class="b-type mono">{base}</span>{/if}
                {#if cell.pack === 'Amp' && cell.channel}<span class="chan mono">{cell.channel}</span>{/if}
                {#if cell.bypassed}<span class="bypb mono">BYP</span>{/if}
                {#if c < cols - 1 && cell.pack !== 'Output'}
                  <button
                    class="port"
                    class:sel
                    aria-label="Connect output"
                    onpointerdown={(e) => onPortDown(cell, e)}
                  ></button>
                {/if}
              </div>
            {:else if cell?.kind === 'shunt'}
              {@const sel = editor.selKey === `${r},${c}`}
              <div
                class="cell shunt"
                class:sel
                data-idx="{r},{c}"
                role="button"
                tabindex="0"
                onpointerdown={(e) => onBlockDown(cell, e)}
              >
                <span class="sh-bar"></span>
                {#if c < cols - 1}
                  <button class="port" aria-label="Connect output" onpointerdown={(e) => onPortDown(cell, e)}></button>
                {/if}
              </div>
            {:else}
              <button class="cell empty" data-idx="{r},{c}" onclick={() => { editor.selectCellOnDevice(r, c); editor.openPaletteAt(r, c); }}>
                <span class="plus">+</span>
              </button>
            {/if}
          {/each}
        {/each}
      </div>
    </div>

    <p class="preview mono">
      {editor.layout.model} · {editor.layout.name || 'unnamed'} · {rows}×{cols} grid · live decode
      {#if !editor.layout.crcValid}<span class="edit"> · edit buffer (unsaved)</span>{/if}
      <button class="refresh" onclick={() => editor.load()} title="Re-read the grid from the device">↻</button>
    </p>
  {/if}
</div>

<!-- move ghost + delete bin -->
{#if moveMode && moveCell}
  {@const cat = catFor(moveCell.pack, baseName(moveCell.display))}
  <div
    class="ghost"
    style="left:{movePos.x}px; top:{movePos.y}px; background:{tileBg(cat.accent)}; border-color:{shade(cat.accent, -0.3)};"
  >
    {moveCell.kind === 'shunt' ? 'Shunt' : cat.short}
  </div>
  <div class="bin" class:over={overBin} data-bin="1">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M4 7 H20" /><path d="M9 7 V5 H15 V7" /><rect x="6" y="7" width="12" height="13" rx="2" /><path d="M10 11 V16 M14 11 V16" />
    </svg>
    <span>Drop here to delete</span>
  </div>
{/if}

<style>
  .gridwrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 26px 22px;
    background: radial-gradient(120% 120% at 50% 0%, #131316, #0c0c0e 70%);
    -webkit-overflow-scrolling: touch;
  }
  .gridwrap.mob {
    padding: 14px 12px;
  }
  .inner {
    position: relative;
    width: 100%;
    max-width: 1680px;
    margin: 0 auto;
  }
  .inner.mob {
    width: max-content;
    max-width: none;
    margin: 0;
  }
  .cables {
    position: absolute;
    inset: 0;
    overflow: visible;
    z-index: 0;
    pointer-events: none;
  }
  .cables g {
    pointer-events: auto;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(72px, 1fr));
    gap: var(--gap);
    width: 100%;
    position: relative;
    z-index: 1;
  }
  .inner.mob .grid {
    grid-template-columns: repeat(var(--cols), 74px);
  }

  .cell {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    aspect-ratio: 1 / 0.95;
    border-radius: 11px;
    user-select: none;
  }

  .block {
    overflow: hidden;
    cursor: pointer;
    border: 1px solid transparent;
    touch-action: none;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 6px rgba(0, 0, 0, 0.35);
    transition: box-shadow 0.12s, transform 0.12s, opacity 0.12s;
  }
  .block:hover {
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 0 0 1px rgba(255, 255, 255, 0.22), 0 4px 10px rgba(0, 0, 0, 0.35);
  }
  .block.sel {
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 0 0 2px #f5a623, 0 0 22px rgba(245, 166, 35, 0.34);
  }
  .block.byp {
    opacity: 0.45;
    filter: grayscale(0.6);
  }
  .block.moving {
    opacity: 0.3;
  }
  .glyph {
    font-size: 15px;
    line-height: 1;
    color: rgba(255, 255, 255, 0.82);
    position: relative;
    z-index: 2;
  }
  .b-label {
    position: relative;
    z-index: 2;
    font-weight: 700;
    font-size: 14px;
    color: #fff;
    letter-spacing: 0.01em;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
    text-align: center;
    line-height: 1.05;
  }
  .b-type {
    position: relative;
    z-index: 2;
    font: 500 9px/1.1 var(--font-mono);
    color: rgba(255, 255, 255, 0.62);
    text-align: center;
    max-width: 92%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .chan {
    position: absolute;
    top: 6px;
    right: 7px;
    z-index: 3;
    font: 700 9px/1 var(--font-mono);
    color: rgba(255, 255, 255, 0.85);
    background: rgba(0, 0, 0, 0.28);
    border-radius: 4px;
    padding: 3px 4px;
  }
  .bypb {
    position: absolute;
    top: 6px;
    left: 7px;
    z-index: 3;
    font: 700 8px/1 var(--font-mono);
    color: #0c0c0e;
    background: var(--text-dim);
    border-radius: 4px;
    padding: 3px 4px;
    letter-spacing: 0.05em;
  }
  .port {
    position: absolute;
    right: -8px;
    top: 50%;
    margin-top: -10px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid #0c0c0e;
    background: #3a3a44;
    cursor: crosshair;
    z-index: 6;
    padding: 0;
    transition: transform 0.1s;
  }
  .port:hover {
    transform: scale(1.25);
  }
  .port.sel {
    background: var(--accent);
    box-shadow: 0 0 9px rgba(53, 201, 214, 0.6);
  }

  .empty {
    border: 1px dashed var(--surface-3);
    background: #121215;
    cursor: pointer;
    z-index: 1;
    padding: 0;
  }
  .empty:hover {
    border-color: var(--accent);
    background: #15191a;
  }
  .plus {
    font-size: 22px;
    color: #2f2f37;
    font-weight: 300;
    line-height: 1;
  }
  .shunt {
    background: var(--panel-2);
    border: 1px solid #20202a;
    cursor: grab;
    z-index: 1;
  }
  .shunt.sel {
    border-color: var(--amber);
  }
  .sh-bar {
    width: 62%;
    height: 2px;
    background: #4a4a55;
    border-radius: 1px;
  }

  .preview {
    margin-top: 16px;
    font-size: 10px;
    color: var(--text-faint);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .edit {
    color: var(--amber);
  }
  .refresh {
    border: 1px solid var(--border-2);
    background: var(--surface-2);
    color: var(--text-dim);
    border-radius: var(--r-sm);
    width: 22px;
    height: 20px;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
  }
  .refresh:hover {
    border-color: var(--accent);
    color: var(--text);
  }
  .hint {
    color: var(--text-dim);
  }
  .sub {
    color: var(--text-mut);
    font-size: 11px;
  }
  .offline {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }
  .retry {
    border: 1px solid var(--border-strong);
    background: var(--surface-2);
    color: var(--text);
    border-radius: var(--r-sm);
    padding: 7px 14px;
    cursor: pointer;
  }
  code {
    color: var(--accent);
  }

  .ghost {
    position: fixed;
    transform: translate(-50%, -50%) rotate(-3deg);
    z-index: 160;
    pointer-events: none;
    padding: 12px 18px;
    border-radius: 12px;
    border: 1px solid;
    color: #fff;
    font-weight: 700;
    font-size: 14px;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.55);
  }
  .bin {
    position: fixed;
    bottom: 26px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 155;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 22px;
    border-radius: 16px;
    background: rgba(22, 22, 27, 0.96);
    border: 1px solid #3a3a44;
    color: var(--text-dim);
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.5);
    transition: all 0.12s;
    font-weight: 600;
    font-size: 13px;
  }
  .bin.over {
    transform: translateX(-50%) scale(1.08);
    background: #3a1518;
    border-color: var(--danger);
    color: #ff7a68;
  }
</style>
