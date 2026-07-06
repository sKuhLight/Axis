<script lang="ts">
  import { onMount } from 'svelte';
  import { editor, baseName } from './editor.svelte';
  import { catFor, shade } from './catalog';
  import { fmtNumber, paramUnit } from './format';
  import type { Cell } from './grid';
  import { blockHelp, helpSlugForPack, resetHelpCache } from './help';
  import { theme } from './theme.svelte';
  import { resolveAxisGridMetrics, resolveAxisGridPresentation, type AxisGridView } from './axis-workbench/gridView';

  // optional grid-view override (workbench gridbar). 'full' fixes tiles at the block-size px and
  // scrolls; 'map' pins the glyph minimap; 'auto' fits to the pane and steps full → map as the pane
  // shrinks (04-fc-and-grid.md §2.2). The old shell renders <SignalGrid /> without it → stock fit
  // behavior. Desktop only; mobile keeps its own column-density paging.
  let { view = null }: { view?: AxisGridView | null } = $props();

  // Block tiles are tinted chips of the block-family color that adapt to the theme: darkened (dark ink) in
  // dark mode, softly lightened (dark family-tint ink) in light mode.
  const light = $derived(theme.cfg.base === 'light');
  const tileInk = (accent: string) => (light ? shade(accent, -0.52) : 'rgba(255,255,255,0.94)');
  const tileInkDim = (accent: string) => (light ? shade(accent, -0.3) : 'rgba(255,255,255,0.6)');

  // ── block help on hover → shown in the bottom status bar (editor.hint), like control hovers ──
  let helpToken = 0;
  $effect(() => {
    // clear cached help when the connected device changes (overrides differ)
    resetHelpCache(editor.detected?.short ?? null);
  });
  async function showBlockHelp(cell: Cell) {
    const name = cell.display || (cell.pack ? baseName(cell.pack) : 'Block');
    editor.setHint(name); // show the block name immediately while the blurb loads
    const slug = helpSlugForPack(cell.pack);
    if (!slug) return;
    const token = ++helpToken;
    const h = await blockHelp(slug);
    if (token !== helpToken) return; // a newer hover won
    editor.setHint(h ? `${name} — ${h.summary}` : name);
  }
  function clearBlockHelp() {
    helpToken++;
    editor.clearHint();
  }

  // ── responsive metrics (mobile = column-density + horizontal paging) ──
  const cols = $derived(editor.layout.rows ? editor.layout.cols : 12);
  const rows = $derived(editor.layout.rows || 4);
  const mob = $derived(editor.isMobile);
  // available grid area = the viewport CONTENT box (measured). It's flex-sized + overflow:hidden, so it
  // does NOT depend on tile size — sizing tiles to fit never feeds back into this measurement. Used for
  // the exact fillW/fitH px fit (Axis uses fixed-px tracks, unlike the design's CSS minmax/1fr).
  let availW = $state(1);
  let availH = $state(1);
  // pane-host box (the gridwrap: the grid pane body incl. its scroll padding + gridbar chrome). The design
  // resolves the grid MODE + the 4-row height cap from the raw pane-host rect (gpW/gpH) and bakes the
  // padding into its constants (fullMin/fullMinH +44/56, colCapH −_padV). Feeding the padding-stripped
  // viewport box there instead would double-count the chrome and collapse a comfortable pane into map with
  // ~30px tiles — so mode/cap resolution keys off THIS host rect, matching 04-fc-and-grid.md §2.2 verbatim.
  let paneW = $state(1);
  let paneH = $state(1);
  // ── workbench pane-relative resolution (04-fc-and-grid.md §2.2) ──
  // Whenever a gridbar view is supplied the presentation derives ONLY from the pane metrics — NEVER from
  // editor.isMobile (the old <1366 shell boundary, which would otherwise strip metrics/map/full off any
  // window under 1366 and collapse the workbench into the legacy pager). 'map'/'full' pin their mode at any
  // pane size (the user explicitly chose the chip); auto steps full → map → mobile by the pane rect. The
  // old shell (view == null) keeps its window-driven behavior via `mob`.
  const metrics = $derived(
    view ? resolveAxisGridMetrics(view, paneW > 1 ? paneW : 0, paneH > 1 ? paneH : 0) : null
  );
  // Workbench mobile TIER: a docked grid pane narrower than the design's mobile threshold (<620px) renders
  // the REAL paged presentation (page-width columns, page dots/arrows, swipe paging) instead of degrading
  // to shrunk map tiles. Driven purely by the PANE, not the window — so it must NOT read editor.isMobile
  // (the window may be a narrow desktop with a wide grid pane, OR a wide desktop with a narrow one). Only
  // AUTO reaches the mobile tier; an explicit 'map'/'full' chip pins its mode even at a tiny pane. Its
  // column density + page live in pane-local state below so editor.mobCols/gridPage (the real-mobile shell
  // state) stay untouched.
  // Presentation flags (paged / paneMobile / mapMode / fixedTile) come from the shared resolver so the
  // component and its tests can't drift. View active ⇒ every flag keys off the pane metrics; old shell ⇒
  // `mob` (editor.isMobile) drives paging. The resolver enforces that `mob` is never consulted with a view.
  const present = $derived(
    resolveAxisGridPresentation({ view, metricsMode: metrics?.mode ?? null, isMobile: mob })
  );
  const paneMobile = $derived(present.paneMobile);
  const paged = $derived(present.paged);
  // pane-local paging state for the workbench mobile tier (never touches the editor's real-mobile state).
  // Column density defaults to the design's mobile default (6 cols, 04-fc-and-grid.md §2.2 `S.mobCols||6`).
  let paneCols = $state(6);
  let panePage = $state(0);
  const paneColsCl = $derived(Math.max(3, Math.min(12, paneCols)));
  const panePageCount = $derived(Math.ceil(12 / paneColsCl));
  // unified column density: pane-local for the workbench mobile tier, the editor's real-mobile state for the
  // old shell, else the full 12. The editor.mobCols branch is old-shell only (view == null) — a workbench
  // view never reads the window's real-mobile density.
  const visCols = $derived(
    paneMobile ? paneColsCl : !view && mob ? Math.max(3, Math.min(12, editor.mobCols)) : 12
  );
  const mapMode = $derived(present.mapMode); // desktop glyph minimap (§2.5)
  const gap = $derived(
    paged ? (visCols <= 4 ? 16 : visCols <= 6 ? 12 : visCols <= 8 ? 9 : 6) : mapMode ? 7 : metrics ? metrics.fullGap : 26
  );
  const hCols = $derived(paged ? visCols : cols); // columns that fill the width (one page)
  const ASPECT = 0.95; // preferred tile height ÷ width (square-ish)
  const MAX_TILE = 150; // desktop: never let a tile grow past this — a full-screen 12-col row must not
  //                       stretch tiles to the whole monitor width (looks bad); center the grid instead.
  // Mobile fills the page width exactly (clean paging). Desktop fits BOTH axes as a square-ish tile and
  // caps the size, so on a wide/fullscreen window the grid stays a comfortable size and centers rather
  // than spanning edge-to-edge.
  // fixed-size tiles that pan in a scrolling pane — ONLY the explicit 'full' view mode. `auto` never
  // uses fixed tiles even when it RESOLVES to full: fixed tiles size purely off the height cap
  // (fullColMax), so the 12-col width routinely exceeds the pane and .viewport.free's overflow:auto
  // shows a scrollbar. The design invariant is that only 'full' scrolls; auto/map must always fit. So
  // auto-resolved-full falls through to the fit-both-axes path below (centers, never scrolls).
  const fixedTile = $derived(present.fixedTile);
  // desktop cell-width cap: map cells ≤42 (·colCapH), full cells ≤140 (·colCapH), else legacy MAX_TILE.
  const tileCap = $derived(metrics ? (mapMode ? metrics.mapColMax : metrics.fullColMax) : (view?.tilePx ?? MAX_TILE));
  const colW = $derived.by(() => {
    if (fixedTile) return Math.min(view!.tilePx, metrics!.fullColMax);
    if (availW <= 1) return paged ? 88 : mapMode ? 30 : 96;
    // exact (not floored): visCols tiles + gaps == availW precisely, so the next column sits exactly
    // off-screen — no partial-column sliver at the right edge.
    const fillW = (availW - (hCols - 1) * gap) / hCols;
    if (paged) return Math.max(24, fillW);
    // desktop: largest tile that fits the width, fits all rows in height, and stays ≤ the size cap.
    // The width term (fillW) is what keeps auto/auto-resolved-full from ever overflowing horizontally.
    const fitH = availH > 1 ? (availH - (rows - 1) * gap) / rows : Infinity;
    return Math.max(mapMode ? 24 : 24, Math.min(fillW, fitH / ASPECT, tileCap));
  });
  const cellH = $derived.by(() => {
    const sq = colW * ASPECT;
    if (fixedTile) return sq;
    if (availH <= 1) return sq;
    const fitH = (availH - (rows - 1) * gap) / rows;
    return Math.max(24, Math.min(sq, fitH));
  });
  // page count + current page: editor state for the real mobile shell, pane-local for the workbench tier.
  const pageCount = $derived(paneMobile ? panePageCount : editor.pageCount);
  const page = $derived(
    paneMobile
      ? Math.max(0, Math.min(panePageCount - 1, panePage))
      : Math.max(0, Math.min(editor.pageCount - 1, editor.gridPage))
  );
  const pageShift = $derived(visCols * (colW + gap));
  const dense = $derived(paged && visCols > 6); // blocks too small for per-block param swipe
  // map mode strips the type line, dots, label (§2.5); otherwise progressive disclosure by width.
  const showType = $derived(!mapMode && colW >= 56);
  // pane-local paging helpers (workbench mobile tier) — mirror editor.changePage/setPage without touching
  // the editor's real-mobile state. Clamp panePage when the density changes.
  $effect(() => {
    void panePageCount;
    if (panePage > panePageCount - 1) panePage = Math.max(0, panePageCount - 1);
  });
  function paneChangePage(d: number) {
    panePage = Math.max(0, Math.min(panePageCount - 1, panePage + d));
  }
  function gridChangePage(d: number) {
    if (paneMobile) paneChangePage(d);
    else editor.changePage(d);
  }
  function gridSetPage(p: number) {
    if (paneMobile) panePage = Math.max(0, Math.min(panePageCount - 1, p));
    else editor.setPage(p);
  }
  function gridChangeCols(d: number) {
    if (paneMobile) paneCols = Math.max(3, Math.min(12, paneCols + d));
    else editor.changeCols(d);
  }
  function gridColsFit() {
    if (paneMobile) paneCols = paneColsCl >= 12 ? 4 : 12;
    else editor.colsFit();
  }

  // cell lookup by "row,col"
  const cellAt = $derived.by(() => {
    const m = new Map<string, Cell>();
    for (const c of [...editor.layout.cells, ...editor.layout.shunts]) m.set(`${c.row},${c.col}`, c);
    return m;
  });

  // ── measurement → cables ──
  let wrapEl = $state<HTMLDivElement | null>(null);
  let vpEl = $state<HTMLDivElement | null>(null); // the clipping viewport (grid area between the page arrows)
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

  // Observe the grid inner element reactively: it lives behind the `status === 'loading'`
  // branch, so it does NOT exist at mount time — a mount-time `observe(innerEl)` attaches to
  // nothing and cable endpoints then never re-measure when the pane resizes (stale cables).
  $effect(() => {
    const el = innerEl;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  });

  onMount(() => {
    measure();
    // measure the available grid area from the viewport's content box (stable — see availW/availH note)
    const wro = new ResizeObserver((entries) => {
      const cr = entries[entries.length - 1]?.contentRect;
      if (cr) {
        availW = cr.width;
        availH = cr.height;
      }
    });
    if (vpEl) wro.observe(vpEl);
    // measure the pane-host box (gridwrap border-box: padding + gridbar chrome included) for mode/cap
    // resolution — matches the design's gpW/gpH (see paneW/paneH note). border-box so the padding the
    // design's constants already account for isn't stripped out.
    const pro = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.borderBoxSize?.[0];
      const el = wrapEl;
      const w = box ? box.inlineSize : el?.clientWidth ?? 0;
      const h = box ? box.blockSize : el?.clientHeight ?? 0;
      if (w) paneW = w;
      if (h) paneH = h;
    });
    if (wrapEl) pro.observe(wrapEl);
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => {
      wro.disconnect();
      pro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  });
  // re-measure whenever the grid contents, density, OR the bottom panel size change. The block editor
  // opening/closing (and its resize-drag, editorH) shrinks the grid area → tiles re-fit → cable
  // endpoints move. A single rAF can read mid-relayout, so we take a second pass on the next frame to
  // catch the settled geometry — otherwise cables render against stale block positions ("shifted").
  $effect(() => {
    void editor.layout;
    void editor.editorOpen;
    void editor.editorH;
    void editor.vw;
    void editor.mobCols;
    // tile geometry: a workbench PANE resize never touches the editor signals above
    // (editor.vw is the window width) — it reaches the DOM as new colW/cellH/gap, so
    // track those directly or cables keep their pre-resize endpoints.
    void colW;
    void cellH;
    void gap;
    void mapMode;
    requestAnimationFrame(() => {
      measure();
      requestAnimationFrame(measure);
    });
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

  // Cable "signal flow": driven by the live output level, but rAF-advanced with a SMOOTHED velocity
  // (not by swapping CSS animation-duration — that restarts the keyframe every level change and stutters,
  // and the level itself jitters). We ease a velocity toward the level-derived target each frame and step
  // stroke-dashoffset by it → continuous, smooth, never frantic. Silent → velocity eases to 0 (freezes).
  let flowOffset = $state(0);
  let flowVel = 0; // units/sec, eased (non-reactive)
  onMount(() => {
    let raf = 0;
    let last = 0;
    const tick = (ts: number) => {
      const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0;
      last = ts;
      const l = editor.levels;
      let target: number;
      if (!l) target = 4; // no live meters → gentle steady flow
      else {
        const pk = Math.max(l.out1L, l.out1R, l.out2L, l.out2R); // dB, −40…+6
        const norm = Math.max(0, Math.min(1, (pk + 40) / 46));
        target = norm < 0.05 ? 0 : 1.2 + norm * 4.3; // u/s: quiet slow → loud ≈5.5 (≈2.2s/cycle, calm)
      }
      flowVel += (target - flowVel) * Math.min(1, dt * 3); // ~300ms ease → smooths the jitter
      if (dt) flowOffset = (flowOffset - flowVel * dt) % 12; // 12 = dash period; wrap keeps it seamless
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

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
  // where the port pointerdown started — a pointerup within TAP_PX of it is a TAP (arm link mode,
  // editor.linkFrom) instead of a drag-connect. Drag stays the desktop-primary path.
  let portStart = { x: 0, y: 0 };
  const TAP_PX = 10;

  function startMove() {
    if (!gesture) return;
    moveMode = true;
    moveCell = gesture.cell;
    movePos = { x: gesture.startX, y: gesture.startY };
    overBin = false;
  }

  function onBlockDown(cell: Cell, e: PointerEvent) {
    if (connectSrc) return;
    if (editor.linkFrom) {
      // armed link mode: this tap picks the destination (any later column) — no gesture/select
      e.stopPropagation();
      editor.completeLink(cell.row, cell.col);
      return;
    }
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
    if (editor.linkFrom) {
      // already armed: the armed port cancels, any other cell's port completes to that cell
      if (editor.linkFrom.row === cell.row && editor.linkFrom.col === cell.col) editor.cancelLink();
      else editor.completeLink(cell.row, cell.col);
      return;
    }
    if (!innerEl) return;
    connectSrc = cell;
    portStart = { x: e.clientX, y: e.clientY };
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
        connectSrc = null;
        linkTo = null;
        document.body.style.cursor = '';
        // a barely-moved pointerup on the port = a TAP → arm link mode (tap-to-connect: pick the
        // destination with a second tap, on this grid or on the Grid Map — survives page swipes).
        // A real drag keeps the classic drag-a-cable connect.
        if (Math.hypot(e.clientX - portStart.x, e.clientY - portStart.y) < TAP_PX) {
          editor.armLink(src);
          return;
        }
        const tgt = cellFromPoint(e.clientX, e.clientY);
        if (tgt) editor.connect(src, tgt.row, tgt.col);
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
    return light
      ? `linear-gradient(180deg, ${shade(accent, 0.66)}, ${shade(accent, 0.5)})`
      : `linear-gradient(180deg, ${shade(accent, -0.42)}, ${shade(accent, -0.62)})`;
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
    const n = Math.round(pinch.cols * (pinch.dist / dist));
    // route pinch to the pane-local density on the workbench tier (touch on a desktop window) so the
    // editor's real-mobile state is never touched; real mobile keeps writing editor.setCols.
    if (paneMobile) paneCols = Math.max(3, Math.min(12, n));
    else editor.setCols(n);
  }
  function touchEnd() {
    pinch = null;
  }
  // true right after a page-swipe, so the empty-cell click that follows pointerup is suppressed
  let pageSwiped = $state(false);
  function bgDown(e: PointerEvent) {
    if (!paged) return;
    // only a placed block runs its own horizontal gesture (cycle control) — empty cells, shunts and
    // background all page. (Previously bailed on any [data-idx], i.e. the whole grid matrix, so paging
    // only worked in the padding around it.)
    if ((e.target as HTMLElement).closest('.cell.block')) return;
    pageSwipeX = e.clientX;
  }
  function bgUp(e: PointerEvent) {
    if (pageSwipeX == null) return;
    const dx = e.clientX - pageSwipeX;
    pageSwipeX = null;
    if (Math.abs(dx) > 50) {
      pageSwiped = true;
      gridChangePage(dx < 0 ? 1 : -1);
    }
  }
</script>

{#if editor.linkFrom}
  <div class="linkbar" data-screen="Link Bar">
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 8 H14 M10 4 L14 8 L10 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
    <span class="lb-text">Routing from {editor.linkFrom.display || baseName(editor.linkFrom.pack ?? '') || 'block'} — tap a destination block</span>
    <span class="lb-spacer"></span>
    <button class="lb-cancel" onclick={() => editor.cancelLink()}>Cancel</button>
  </div>
{/if}

<div
  data-tour="grid"
  class="gridwrap scroll"
  class:mob={paged}
  bind:this={wrapEl}
  data-screen="Signal Grid"
  role="group"
  aria-label="Signal grid"
  ontouchstart={touchStart}
  ontouchmove={touchMove}
  ontouchend={touchEnd}
  onpointerdown={bgDown}
  onpointerup={bgUp}
>
  {#if paged && editor.status === 'ready' && pageCount > 1}
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button class="pgarrow" aria-label="Previous page" disabled={page === 0} onpointerdown={(e) => e.stopPropagation()} onclick={() => gridChangePage(-1)}>‹</button>
  {/if}
  <div class="viewport" class:free={fixedTile} bind:this={vpEl}>
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
      class:mob={paged}
      bind:this={innerEl}
      style={paged
        ? `width:${cols * colW + (cols - 1) * gap}px; transform:translateX(${-page * pageShift}px); transition:transform .26s cubic-bezier(.3,.8,.3,1);`
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
              <path class="flow" d={cab.d} fill="none" stroke={cab.flowStroke} stroke-width="2.6" stroke-linecap="round" stroke-dasharray="0.1 12" stroke-dashoffset={flowOffset} />
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

      <div class="grid" class:map={mapMode} style="grid-template-columns:repeat({cols}, {colW}px); grid-template-rows:repeat({rows}, {cellH}px); gap:{gap}px;">
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
                style="background:{tileBg(cat.accent)}; border-color:{shade(cat.accent, light ? 0.3 : -0.05)}; --tile-ink:{tileInk(cat.accent)}; --tile-ink-dim:{tileInkDim(cat.accent)}; --tile-shadow:{light ? '0 1px 1px rgba(255,255,255,0.4)' : '0 1px 2px rgba(0,0,0,0.4)'};"
                onpointerdown={(e) => onBlockDown(cell, e)}
                onwheel={(e) => onBlockWheel(cell, e)}
                onmouseenter={() => showBlockHelp(cell)}
                onmouseleave={clearBlockHelp}
              >
                {#if meter && !mapMode}<span class="lvlfill" style="height:{Math.round(meter.norm * 100)}%; background:linear-gradient(180deg,{shade(cat.accent, 0.35)},{cat.accent});"></span>{/if}
                {#if cell.bypassed}<span class="hatch"></span>{/if}
                {#if swipeHud && swipeHud.key === `${r},${c}` && !mapMode}
                  <div class="swhud">
                    <div class="sh-val mono">{fmtNumber(swipeHud.m)}{#if paramUnit(swipeHud.m)}<span class="sh-unit">{paramUnit(swipeHud.m)}</span>{/if}</div>
                    <div class="sh-name">{swipeHud.m.name}</div>
                  </div>
                {/if}
                <span class="glyph">{cat.glyph}</span>
                {#if !mapMode}
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
              <button class="cell empty" data-idx="{r},{c}" onclick={() => { if (pageSwiped) { pageSwiped = false; return; } if (editor.linkFrom) { editor.completeLink(r, c); return; } editor.selectCellOnDevice(r, c); editor.openPaletteAt(r, c); }}>
                <span class="restdot"></span>
                <span class="plus">+</span>
              </button>
            {/if}
          {/each}
        {/each}
      </div>
    </div>

    {#if !fixedTile}
      <button class="regrid" class:unsaved={!editor.layout.crcValid} onclick={() => editor.load()} title="Re-read the grid from the device{editor.layout.crcValid ? '' : ' · edit buffer unsaved'}">↻</button>
    {/if}
  {/if}
  </div>
  {#if fixedTile && editor.status !== 'loading' && editor.status !== 'offline'}
    <!-- outside the scrolling viewport so it stays pinned while the fixed-size grid pans -->
    <button class="regrid pin" class:unsaved={!editor.layout.crcValid} onclick={() => editor.load()} title="Re-read the grid from the device{editor.layout.crcValid ? '' : ' · edit buffer unsaved'}">↻</button>
  {/if}
  {#if paged && editor.status === 'ready' && pageCount > 1}
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button class="pgarrow" aria-label="Next page" disabled={page === pageCount - 1} onpointerdown={(e) => e.stopPropagation()} onclick={() => gridChangePage(1)}>›</button>
  {/if}
</div>

<!-- mobile / workbench-tier column-density pager + page dots -->
{#if paged && editor.status === 'ready'}
  <div class="pager">
    <div class="density">
      <button class="step" disabled={visCols <= 3} title="Bigger blocks" onclick={() => gridChangeCols(-1)}>−</button>
      <button class="dnum" title="Tap for full overview" onclick={gridColsFit}>
        <span class="dn mono">{visCols}</span><span class="dl mono">COLS</span>
      </button>
      <button class="step" disabled={visCols >= 12} title="Fit more columns" onclick={() => gridChangeCols(1)}>+</button>
    </div>
    {#if pageCount > 1}
      <div class="dots">
        {#each Array(pageCount) as _, i (i)}
          <button class="pdot" class:on={i === page} aria-label="Page {i + 1}" onclick={() => gridSetPage(i)}></button>
        {/each}
      </div>
    {/if}
    <span class="phint mono">{pageCount > 1 ? (mob ? 'Swipe to pan · pinch to zoom' : 'Swipe / arrows to page') : mob ? 'Pinch to fit more' : 'Use ± to fit more'}</span>
  </div>
{/if}

<!-- move ghost + delete bin -->
{#if moveMode && moveCell}
  {@const cat = catFor(moveCell.pack, baseName(moveCell.display))}
  <div
    class="ghost"
    style="left:{movePos.x}px; top:{movePos.y}px; background:{tileBg(cat.accent)}; border-color:{shade(cat.accent, light ? 0.2 : -0.3)}; color:{tileInk(cat.accent)};"
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
  /* armed tap-to-connect bar (mock: gridLinkBar) — sits above the grid so it survives paging */
  .linkbar {
    flex: none;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 14px;
    background: var(--accent);
    color: var(--accentink);
    font: 700 12px/1.3 var(--font-ui);
  }
  .lb-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .lb-spacer {
    flex: 1;
  }
  .lb-cancel {
    flex: none;
    padding: 6px 12px;
    border: 0;
    border-radius: 8px;
    cursor: pointer;
    font: 700 12px/1 var(--font-ui);
    background: rgba(0, 0, 0, 0.16);
    color: var(--accentink);
  }
  .gridwrap {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    position: relative;
    padding: 22px;
    background: radial-gradient(120% 120% at 50% 0%, var(--bg2), var(--bg) 70%);
    touch-action: pan-y;
    display: flex;
    align-items: stretch;
  }
  .gridwrap.mob {
    /* side gutters come from the page-arrow columns instead of padding, so the grid area clips exactly
       at the viewport edge (no peeking column) while still leaving room + arrows on each side */
    padding: 14px 0;
  }
  /* the clipping grid area, between the page arrows. Sized by flex → stable regardless of tile size,
     so measuring it for the tile-fit never feeds back into a resize loop. */
  .viewport {
    flex: 1;
    min-width: 0;
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .gridwrap.mob .viewport {
    justify-content: flex-start; /* horizontal paging translates the grid from the left */
  }
  /* fixed-tile ('full') mode: the grid keeps its chosen size and pans instead of shrinking. Auto
     margins center it while it fits and collapse to 0 when it overflows, so no edge is clipped. */
  .viewport.free {
    overflow: auto;
    align-items: flex-start;
    justify-content: flex-start;
  }
  .viewport.free .inner {
    margin: auto;
  }
  .inner {
    position: relative;
    flex: none;
    width: fit-content; /* wraps the fixed-size grid so the cable overlay lines up + it can be centered */
    height: fit-content;
  }
  /* page-change arrows framing the grid (mobile paging) */
  .pgarrow {
    flex: none;
    width: 40px;
    align-self: stretch;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--textdim);
    font-size: 24px;
    line-height: 1;
    touch-action: manipulation;
  }
  .pgarrow:disabled {
    opacity: 0.22;
    cursor: default;
  }
  .pgarrow:not(:disabled):hover {
    color: var(--text);
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
    min-width: 0;
    min-height: 0;
    overflow: hidden; /* tile size is driven by the grid tracks (fit-to-area); clip content if a tile gets small */
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
    /* on-tile ink adapts to the theme (set per-block from the family color); see tileInk/tileBg */
    color: var(--tile-ink-dim, rgba(255, 255, 255, 0.82));
    position: relative;
    z-index: 2;
  }
  .b-label {
    position: relative;
    z-index: 2;
    font-weight: 700;
    font-size: 14px;
    color: var(--tile-ink, rgba(255, 255, 255, 0.94));
    letter-spacing: 0.01em;
    text-shadow: var(--tile-shadow, 0 1px 2px rgba(0, 0, 0, 0.4));
    text-align: center;
    line-height: 1.05;
  }
  .b-type {
    position: relative;
    z-index: 2;
    font: 500 9px/1.1 var(--font-mono);
    color: var(--tile-ink-dim, rgba(255, 255, 255, 0.62));
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
  /* .flow motion is driven by rAF via stroke-dashoffset (see the flow tick) — smoothed, level-reactive */
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

  /* map mode (§2.5): clean glyph minimap — bigger glyph, smaller ports, dim dashed empties */
  .grid.map .glyph {
    font-size: 16px;
    color: rgba(255, 255, 255, 0.9);
  }
  .grid.map .port {
    width: 11px;
    height: 11px;
    right: -5px;
    margin-top: -5px;
    border-width: 2px;
  }
  .grid.map .empty {
    border: 1px dashed var(--border2);
  }
  .grid.map .empty .plus {
    display: block;
    font-size: 12px;
    font-weight: 300;
    color: var(--textmuted);
    opacity: 0.45;
  }
  .grid.map .empty .restdot {
    display: none;
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

  /* compact re-read button, floated in the grid corner (replaces the old info line) */
  .regrid {
    position: absolute;
    right: 14px;
    bottom: 12px;
    z-index: 4;
    border: 1px solid var(--border2);
    background: color-mix(in srgb, var(--surface) 85%, transparent);
    color: var(--textdim);
    border-radius: 9px;
    width: 30px;
    height: 30px;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(4px);
  }
  .regrid.pin {
    right: 36px;
    bottom: 34px;
  }
  .regrid:hover {
    border-color: var(--accent);
    color: var(--text);
  }
  .regrid.unsaved {
    border-color: var(--amber-border);
    color: var(--amber);
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
    background: var(--danger-tint);
    border-color: var(--danger);
    color: var(--danger);
  }
</style>
