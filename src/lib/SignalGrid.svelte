<script lang="ts">
  import { onMount } from 'svelte';
  import { editor, baseName } from './editor.svelte';
  import { catFor, shade } from './catalog';
  import { fmtNumber, paramUnit } from './format';
  import type { Cell } from './grid';
  import { blockHelp, helpSlugForPack, resetHelpCache } from './help';

  // ── block help on hover (shown in the grid-bottom status line) ──
  let helpText = $state<string | null>(null);
  let helpToken = 0;
  $effect(() => {
    // clear cached help when the connected device changes (overrides differ)
    resetHelpCache(editor.detected?.short ?? null);
  });
  async function showBlockHelp(cell: Cell) {
    const slug = helpSlugForPack(cell.pack);
    if (!slug) {
      helpText = null;
      return;
    }
    const token = ++helpToken;
    const h = await blockHelp(slug);
    if (token !== helpToken) return; // a newer hover won
    helpText = h ? h.summary : null;
  }
  function clearBlockHelp() {
    helpToken++;
    helpText = null;
  }

  // ── responsive metrics (mobile = column-density + horizontal paging) ──
  const cols = $derived(editor.layout.rows ? editor.layout.cols : 12);
  const rows = $derived(editor.layout.rows || 4);
  const mob = $derived(editor.isMobile);
  const visCols = $derived(mob ? Math.max(3, Math.min(12, editor.mobCols)) : 12);
  const gap = $derived(mob ? (visCols <= 4 ? 16 : visCols <= 6 ? 12 : visCols <= 8 ? 9 : 6) : 26);
  const colW = $derived(mob ? Math.max(20, Math.floor((editor.vw - 24 - (visCols - 1) * gap) / visCols)) : 0);
  const page = $derived(Math.max(0, Math.min(editor.pageCount - 1, editor.gridPage)));
  const pageShift = $derived(visCols * (colW + gap));
  const dense = $derived(mob && visCols > 6); // blocks too small for per-block param swipe
  const showType = $derived(!mob || colW >= 56); // progressive disclosure

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
  // re-measure whenever the grid contents or column density change
  $effect(() => {
    void editor.layout;
    void editor.editorOpen;
    void editor.vw;
    void editor.mobCols;
    requestAnimationFrame(measure);
  });

  function cableD(x1: number, y1: number, x2: number, y2: number) {
    const dx = Math.max(22, (x2 - x1) * 0.5);
    return `M${x1.toFixed(1)} ${y1.toFixed(1)} C${(x1 + dx).toFixed(1)} ${y1.toFixed(1)},${(x2 - dx).toFixed(1)} ${y2.toFixed(1)},${x2.toFixed(1)} ${y2.toFixed(1)}`;
  }

  type Cable = { key: string; srcRow: number; srcCol: number; destRow: number; d: string; mx: number; my: number; stroke: string; flow: boolean; flowStroke: string };
  const cables = $derived.by(() => {
    const list: Cable[] = [];
    const seen = new Set<string>(); // guard: a duplicate edge (dup row in fromRows, or a cell+shunt overlap)
    for (const c of [...editor.layout.cells, ...editor.layout.shunts]) {
      if (c.col === 0 || c.fromRows.length === 0) continue;
      const dst = rects[`${c.row},${c.col}`];
      if (!dst) continue;
      for (const fr of c.fromRows) {
        const src = rects[`${fr},${c.col - 1}`];
        if (!src) continue;
        const key = `${fr},${c.col - 1}->${c.row},${c.col}`;
        if (seen.has(key)) continue; // never emit the same keyed cable twice → avoids each_key_duplicate
        seen.add(key);
        const srcByp = !!cellAt.get(`${fr},${c.col - 1}`)?.bypassed;
        list.push({
          key,
          srcRow: fr,
          srcCol: c.col - 1,
          destRow: c.row,
          d: cableD(src.right, src.cy, dst.left, dst.cy),
          mx: (src.right + dst.left) / 2,
          my: (src.cy + dst.cy) / 2,
          stroke: srcByp ? '#33333c' : '#46464f', // muted base; the animated flow rides on top
          flow: !srcByp, // signal flows when the source is engaged
          flowStroke: srcByp ? '#5a6b6e' : '#35c9d6'
        });
      }
    }
    return list;
  });

  let hoverCable = $state<string | null>(null);

  // ── pointer gestures: tap / double-tap / long-press move / port connect / swipe ──
  // On a block: horizontal swipe cycles the active control (continuous), vertical adjusts its value.
  let gesture: { cell: Cell; startX: number; startY: number; lastY: number; cycleX: number; moved: boolean; swiping: boolean; axis: '' | 'h' | 'v' } | null = null;
  const hasSwipe = (cell: Cell) => !dense && cell.kind === 'block' && !!cell.pack && editor.controlsFor(cell).length > 0;
  // live value/name overlay shown on the tile while swiping
  let swipeHud = $state<{ key: string; m: NonNullable<ReturnType<typeof editor.meterFor>> } | null>(null);
  function showHud(cell: Cell) {
    const m = editor.meterFor(cell);
    if (m) swipeHud = { key: `${cell.row},${cell.col}`, m };
  }
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
    gesture = { cell, startX: e.clientX, startY: e.clientY, lastY: e.clientY, cycleX: e.clientX, moved: false, swiping: false, axis: '' };
    if (lpTimer) clearTimeout(lpTimer);
    lpTimer = setTimeout(() => {
      if (gesture && !gesture.moved && !moveMode) startMove();
    }, 380);
  }

  // wheel over a block with controls nudges the active one (desktop)
  let hudTimer: ReturnType<typeof setTimeout> | null = null;
  function onBlockWheel(cell: Cell, e: WheelEvent) {
    if (!hasSwipe(cell)) return;
    e.preventDefault();
    editor.adjustSwipe(cell, -e.deltaY / 1600);
    showHud(cell);
    if (hudTimer) clearTimeout(hudTimer);
    hudTimer = setTimeout(() => (swipeHud = null), 800);
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
        if (!gesture.moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
          gesture.moved = true;
          gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
          if (lpTimer) clearTimeout(lpTimer);
        }
        // swipe on a block: vertical adjusts the active control, horizontal cycles (continuously)
        if (gesture.moved && hasSwipe(gesture.cell)) {
          gesture.swiping = true;
          if (gesture.axis === 'v') {
            editor.adjustSwipe(gesture.cell, (gesture.lastY - e.clientY) / 220);
          } else {
            // each ~90px of horizontal travel advances one control (deliberate, low overshoot);
            // keep moving to keep cycling. Right = previous, left = next (reversed per feedback).
            const STEP = 90;
            while (e.clientX - gesture.cycleX > STEP) {
              editor.cycleControl(gesture.cell, -1);
              gesture.cycleX += STEP;
            }
            while (e.clientX - gesture.cycleX < -STEP) {
              editor.cycleControl(gesture.cell, 1);
              gesture.cycleX -= STEP;
            }
          }
          showHud(gesture.cell);
        }
        gesture.lastY = e.clientY;
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
        swipeHud = null;
        if (!g.moved && !g.swiping) tap(g.cell);
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

  // ── mobile: pinch to change column density, swipe the background to page ──
  let pinch: { dist: number; cols: number } | null = null;
  let pageSwipeX: number | null = null;
  function touchStart(e: TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinch = { dist: Math.hypot(dx, dy) || 1, cols: visCols };
    }
  }
  function touchMove(e: TouchEvent) {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy) || 1;
    editor.setCols(Math.round(pinch.cols * (pinch.dist / dist)));
  }
  function touchEnd() {
    pinch = null;
  }
  function bgDown(e: PointerEvent) {
    if (!mob) return;
    if ((e.target as HTMLElement).closest('[data-idx]')) return; // started on a block
    pageSwipeX = e.clientX;
  }
  function bgUp(e: PointerEvent) {
    if (pageSwipeX == null) return;
    const dx = e.clientX - pageSwipeX;
    pageSwipeX = null;
    if (Math.abs(dx) > 50) editor.changePage(dx < 0 ? 1 : -1);
  }
</script>

<div
  data-tour="grid"
  class="gridwrap scroll"
  class:mob={editor.isMobile}
  data-screen="Signal Grid"
  role="group"
  aria-label="Signal grid"
  ontouchstart={touchStart}
  ontouchmove={touchMove}
  ontouchend={touchEnd}
  onpointerdown={bgDown}
  onpointerup={bgUp}
>
  {#if editor.status === 'loading'}
    <p class="hint">Connecting to ForgeFX…</p>
  {:else if editor.status === 'offline'}
    <div class="offline">
      <p class="hint">Device offline.</p>
      <p class="sub">Connect your device and make sure the ForgeFX engine is running, then reconnect.</p>
      <button class="retry" onclick={() => editor.load()}>Retry</button>
    </div>
  {:else}
    <div
      class="inner"
      class:mob={editor.isMobile}
      bind:this={innerEl}
      style={mob
        ? `width:${12 * colW + 11 * gap}px; transform:translateX(${-page * pageShift}px); transition:transform .26s cubic-bezier(.3,.8,.3,1);`
        : ''}
    >
      <svg class="cables" width={innerW} height={innerH} style="width:{innerW}px;height:{innerH}px;">
        {#each cables as cab (cab.key)}
          <g
            role="presentation"
            onmouseenter={() => (hoverCable = cab.key)}
            onmouseleave={() => (hoverCable = null)}
          >
            <path d={cab.d} fill="none" stroke={cab.stroke} stroke-width="2" />
            {#if cab.flow}
              <path class="flow" d={cab.d} fill="none" stroke={cab.flowStroke} stroke-width="2.6" stroke-linecap="round" stroke-dasharray="0.1 12" />
            {/if}
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

      <div class="grid" style="grid-template-columns:{mob ? `repeat(${cols}, ${colW}px)` : `repeat(${cols}, minmax(72px, 1fr))`}; gap:{gap}px;">
        {#each Array(rows) as _, r}
          {#each Array(cols) as _, c}
            {@const cell = cellAt.get(`${r},${c}`)}
            {#if cell?.kind === 'block'}
              {@const cat = catFor(cell.pack, baseName(cell.display))}
              {@const sel = editor.selKey === `${r},${c}`}
              {@const base = baseName(cell.display)}
              {@const inst = cell.display.match(/\s(\d+)$/)?.[1] ?? ''}
              {@const sameFam = editor.layout.cells.filter((x) => baseName(x.display) === base).length}
              {@const label = inst && (inst !== '1' || sameFam > 1) ? `${cat.short} ${inst}` : cat.short}
              {@const meter = editor.meterFor(cell)}
              <div
                class="cell block"
                class:byp={cell.bypassed}
                class:sel
                class:moving={moveMode && moveCell === cell}
                class:swipe={!!meter}
                data-idx="{r},{c}"
                role="button"
                tabindex="0"
                style="background:{tileBg(cat.accent)}; border-color:{shade(cat.accent, -0.05)};"
                onpointerdown={(e) => onBlockDown(cell, e)}
                onwheel={(e) => onBlockWheel(cell, e)}
                onmouseenter={() => showBlockHelp(cell)}
                onmouseleave={clearBlockHelp}
              >
                {#if meter}<span class="lvlfill" style="height:{Math.round(meter.norm * 100)}%; background:linear-gradient(180deg,{shade(cat.accent, 0.35)},{cat.accent});"></span>{/if}
                {#if cell.bypassed}<span class="hatch"></span>{/if}
                {#if swipeHud && swipeHud.key === `${r},${c}`}
                  <div class="swhud">
                    <div class="sh-val mono">{fmtNumber(swipeHud.m)}{#if paramUnit(swipeHud.m)}<span class="sh-unit">{paramUnit(swipeHud.m)}</span>{/if}</div>
                    <div class="sh-name">{swipeHud.m.name}</div>
                  </div>
                {/if}
                <span class="glyph">{cat.glyph}</span>
                <span class="b-label">{label}</span>
                {#if showType}{@const tn = editor.typeNameFor(cell.effectId) || (base !== cat.short ? base : '')}{#if tn}<span class="b-type mono">{tn}</span>{/if}{/if}
                {#if cell.channel && cell.channel !== 'A'}<span class="chan mono">{cell.channel}</span>{/if}
                {#if cell.pack}
                  <button
                    class="bypdot"
                    class:on={!cell.bypassed}
                    title="On / Off"
                    aria-label="Toggle bypass"
                    onpointerdown={(e) => e.stopPropagation()}
                    onclick={(e) => {
                      e.stopPropagation();
                      editor.toggleBypass(cell);
                    }}
                  ><span class="bypdot-i"></span></button>
                {/if}
                {#if meter && meter.count > 0}
                  <span class="dots">
                    {#each Array(meter.count) as _, di (di)}<span class="dot" class:on={di === meter.active}></span>{/each}
                  </span>
                {/if}
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
                <span class="restdot"></span>
                <span class="plus">+</span>
              </button>
            {/if}
          {/each}
        {/each}
      </div>
    </div>

    <p class="preview mono" class:help={!!helpText}>
      {#if helpText}
        {helpText}
      {:else}
        {editor.layout.model} · {editor.layout.name || 'unnamed'} · {rows}×{cols} grid · live decode
        {#if !editor.layout.crcValid}<span class="edit"> · edit buffer (unsaved)</span>{/if}
      {/if}
      <button class="refresh" onclick={() => editor.load()} title="Re-read the grid from the device">↻</button>
    </p>
  {/if}
</div>

<!-- mobile column-density pager + page dots -->
{#if editor.isMobile && editor.status === 'ready'}
  <div class="pager">
    <div class="density">
      <button class="step" disabled={visCols <= 3} title="Bigger blocks" onclick={() => editor.changeCols(-1)}>−</button>
      <button class="dnum" title="Tap for full overview" onclick={() => editor.colsFit()}>
        <span class="dn mono">{visCols}</span><span class="dl mono">COLS</span>
      </button>
      <button class="step" disabled={visCols >= 12} title="Fit more columns" onclick={() => editor.changeCols(1)}>+</button>
    </div>
    {#if editor.pageCount > 1}
      <div class="dots">
        {#each Array(editor.pageCount) as _, i (i)}
          <button class="pdot" class:on={i === page} aria-label="Page {i + 1}" onclick={() => editor.setPage(i)}></button>
        {/each}
      </div>
    {/if}
    <span class="phint mono">{editor.pageCount > 1 ? 'Swipe to pan · pinch to zoom' : 'Pinch to fit more'}</span>
  </div>
{/if}

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
    background: radial-gradient(120% 120% at 50% 0%, var(--bg2), var(--bg) 70%);
    -webkit-overflow-scrolling: touch;
  }
  .gridwrap.mob {
    padding: 14px 12px;
    overflow-x: hidden;
  }
  .inner {
    position: relative;
    width: 100%;
    max-width: 1680px;
    margin: 0 auto;
  }
  .inner.mob {
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
    width: 100%;
    position: relative;
    z-index: 1;
  }

  /* mobile column-density pager */
  .pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 14px 13px;
    background: var(--bg2);
    border-top: 1px solid var(--surface2);
    flex: none;
  }
  .density {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 12px;
    padding: 4px;
  }
  .step {
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    border: 0;
    background: var(--surface2);
    color: var(--text2);
    font-size: 19px;
    font-weight: 600;
    cursor: pointer;
  }
  .step:disabled {
    background: transparent;
    color: var(--border3);
    cursor: default;
  }
  .dnum {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1;
    min-width: 30px;
    border: 0;
    background: transparent;
    cursor: pointer;
  }
  .dn {
    font: 700 14px/1 var(--font-mono);
    color: var(--text);
  }
  .dl {
    font: 600 7px/1 var(--font-mono);
    color: var(--textfaint);
    letter-spacing: 0.12em;
    margin-top: 3px;
  }
  .dots {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .pdot {
    width: 7px;
    height: 7px;
    border-radius: 4px;
    background: var(--border2);
    border: 0;
    cursor: pointer;
    transition: all 0.2s;
  }
  .pdot.on {
    width: 20px;
    background: var(--accent);
  }
  .phint {
    font: 600 8.5px/1.25 var(--font-mono);
    color: var(--textmuted);
    max-width: 110px;
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
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 0 0 2px var(--amber), 0 0 22px rgba(245, 166, 35, 0.34);
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
    /* tiles are always a darkened family color (see tileBg), so the label is fixed-light in every theme */
    color: rgba(255, 255, 255, 0.94);
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
  .lvlfill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 0;
    opacity: 0.5;
    border-top: 2px solid rgba(255, 255, 255, 0.55);
    pointer-events: none;
    transition: height 0.06s linear;
  }
  .swhud {
    position: absolute;
    inset: 0;
    z-index: 6;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    background: rgba(8, 8, 10, 0.55);
    backdrop-filter: blur(1px);
    border-radius: 10px;
    pointer-events: none;
  }
  .sh-val {
    font: 800 28px/1 var(--font-mono);
    color: var(--text);
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
  }
  .sh-unit {
    font-size: 12px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.6);
    margin-left: 3px;
  }
  .sh-name {
    font: 700 10px/1 var(--font-mono);
    color: var(--accent);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    max-width: 92%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dots {
    position: absolute;
    bottom: 5px;
    left: 0;
    right: 0;
    z-index: 3;
    display: flex;
    gap: 3px;
    justify-content: center;
    pointer-events: none;
  }
  .dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.28);
  }
  .dot.on {
    background: rgba(255, 255, 255, 0.92);
  }
  .hatch {
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: 10px;
    background: repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.07) 0 5px, rgba(0, 0, 0, 0) 5px 11px);
    pointer-events: none;
  }
  .bypdot {
    position: absolute;
    top: 6px;
    left: 7px;
    z-index: 5;
    width: 17px;
    height: 17px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    cursor: pointer;
    padding: 0;
    background: rgba(0, 0, 0, 0.34);
    border: 1px solid rgba(160, 160, 170, 0.45);
    transition: all 0.12s;
  }
  .bypdot.on {
    background: rgba(70, 209, 127, 0.16);
    border-color: rgba(70, 209, 127, 0.6);
  }
  .bypdot-i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--textfaint);
    transition: all 0.12s;
  }
  .bypdot.on .bypdot-i {
    background: var(--ok);
    box-shadow: 0 0 6px rgba(70, 209, 127, 0.85);
  }
  .flow {
    animation: axsFlow 1.15s linear infinite;
  }
  .port {
    position: absolute;
    right: -8px;
    top: 50%;
    margin-top: -10px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid var(--bg);
    background: var(--border3);
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
    border: 1px dashed transparent;
    background: transparent;
    cursor: pointer;
    z-index: 1;
    padding: 0;
    transition: background 0.15s, border-color 0.15s;
  }
  .empty:hover {
    border-color: var(--accent);
    background: rgba(53, 201, 214, 0.06);
  }
  .restdot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--border3);
    transition: opacity 0.15s;
  }
  .empty:hover .restdot {
    opacity: 0;
    position: absolute;
  }
  .plus {
    display: none;
    font-size: 19px;
    color: var(--accent);
    font-weight: 300;
    line-height: 1;
  }
  .empty:hover .plus {
    display: block;
  }
  .shunt {
    background: var(--panel-2);
    border: 1px solid var(--surface2);
    cursor: grab;
    z-index: 1;
  }
  .shunt.sel {
    border-color: var(--amber);
  }
  .sh-bar {
    width: 62%;
    height: 2px;
    background: var(--textmuted);
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
  .preview.help {
    color: var(--text-dim);
    font-style: normal;
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

  .ghost {
    position: fixed;
    transform: translate(-50%, -50%) rotate(-3deg);
    z-index: 160;
    pointer-events: none;
    padding: 12px 18px;
    border-radius: 12px;
    border: 1px solid;
    color: var(--text);
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
    border: 1px solid var(--border3);
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
