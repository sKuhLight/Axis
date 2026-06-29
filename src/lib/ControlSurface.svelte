<script lang="ts">
  // Reusable widget-grid control surface (ported from design/Control Surface (Widget Grid).dc.html).
  // Pages instead of tabs (still a tab strip), per-control view types (knob/fader/slider/number,
  // button/switch, select, eq, action), an Arrange mode (move/resize/retype/remove/add/tidy), and
  // a square responsive grid. Driven by the live editor params; layouts persist per block family.
  import { editor } from './editor.svelte';
  import EQGraph, { type EQBand } from './EQGraph.svelte';
  import { fmtCompact, normFromValue, paramValue, paramUnit } from './format';
  import { idealIds } from './layouts';
  import type { NamedParam, EnumParam } from './types';

  let {
    slug = '',
    accent = '#35c9d6',
    eqBands = [] as EQBand[],
    eqGainRange = 20,
    eqTitle = 'EQ',
    hideIds = [] as number[]
  }: { slug?: string; accent?: string; eqBands?: EQBand[]; eqGainRange?: number; eqTitle?: string; hideIds?: number[] } = $props();

  const GAP = 8;
  const CONT_VIEWS = ['knob', 'fader', 'slider', 'number'] as const;
  const TOG_VIEWS = ['button', 'switch'] as const;
  const VIEW_ICON: Record<string, string> = { knob: '◉', fader: '⇕', slider: '⇔', number: '#', button: '⏻', switch: '⊙', select: '▾', eq: '∿', action: '⏼' };

  type Kind = 'cont' | 'toggle' | 'select' | 'eq' | 'action';
  type Ctl = { key: string; kind: Kind; label: string; id: number; w: number; h: number; view: string; views: readonly string[] };
  type Widget = { id: string; key: string; x: number; y: number; w: number; h: number; view: string };
  type Board = { pageOrder: string[]; page: string; boards: Record<string, Widget[]> };

  // ── live control catalog (rebuilt from the device params; widgets reference these by key) ──
  const knobById = $derived(new Map(editor.params.filter((p) => p.id != null).map((p) => [p.id as number, p])));
  const enumById = $derived(new Map(editor.enums.map((e) => [e.id, e])));
  const catalog = $derived.by<Ctl[]>(() => {
    const hidden = new Set(hideIds);
    const out: Ctl[] = [];
    if (eqBands.length) out.push({ key: 'eq', kind: 'eq', label: eqTitle, id: -1, w: 4, h: 2, view: 'eq', views: ['eq'] });
    for (const p of editor.params) {
      if (p.id == null || hidden.has(p.id)) continue;
      out.push({ key: `k${p.id}`, kind: 'cont', label: p.name, id: p.id, w: 1, h: 1, view: 'knob', views: CONT_VIEWS });
    }
    for (const e of editor.enums) {
      if (hidden.has(e.id)) continue;
      const tog = e.options.length <= 2;
      out.push({ key: `e${e.id}`, kind: tog ? 'toggle' : 'select', label: e.name, id: e.id, w: tog ? 1 : 2, h: 1, view: tog ? 'button' : 'select', views: tog ? TOG_VIEWS : ['select'] });
    }
    out.push({ key: 'bypass', kind: 'action', label: 'Bypass', id: -2, w: 2, h: 1, view: 'action', views: ['action'] });
    return out;
  });
  const catByKey = $derived(new Map(catalog.map((c) => [c.key, c])));

  // ── grid + board state ──
  let containerEl = $state<HTMLElement | null>(null);
  let boardEl = $state<HTMLElement | null>(null);
  let containerW = $state(900);
  let vw = $state(typeof window !== 'undefined' ? window.innerWidth : 1100);
  let cols = $state(12);
  let rows = $state(4);
  let compact = $state(false);
  let editMode = $state(false);
  let bySlug = $state<Record<string, Board>>({});
  let editingKey = $state<string | null>(null);
  let editBuf = $state('');
  let openSelect = $state<string | null>(null);
  let renamingPage = $state<string | null>(null);
  // value bubble: a single fixed-position tooltip (escapes the editor's scroll clipping + stays on top)
  let tip = $state<{ id: number; cx: number; cy: number; edit: boolean } | null>(null);
  let dragging = $state(false);
  let drag = $state<{ id: string; x: number; y: number; w: number; h: number; valid: boolean } | null>(null);
  let q = $state(''); // live control-search query
  let resSel = $state<{ id: number; left: number; top: number; width: number } | null>(null); // results select popover

  // ── live control search: flat list of every matching control, ignoring tabs/groupings ──
  const searching = $derived(q.trim().length > 0);
  const matches = $derived.by(() => {
    const s = q.trim().toLowerCase();
    return s ? catalog.filter((c) => c.kind !== 'eq' && c.label.toLowerCase().includes(s)) : [];
  });
  // honor each control's configured view (knob/fader/slider/number · button/switch) in the results,
  // falling back to the catalog default when the control isn't placed on any page yet
  const viewByKey = $derived.by(() => {
    const m = new Map<string, string>();
    const b = bySlug[slug];
    if (b) for (const pg of b.pageOrder) for (const w of b.boards[pg] ?? []) if (!m.has(w.key)) m.set(w.key, w.view);
    return m;
  });
  const viewOf = (c: Ctl) => viewByKey.get(c.key) ?? c.view;
  function resKnobDown(e: PointerEvent, id: number) {
    vd = { id, sy: e.clientY, sn: knob(id)?.norm ?? 0 };
    dragging = true;
    showTip(e.currentTarget as HTMLElement, id, false);
  }
  function openResSel(e: MouseEvent, id: number) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    resSel = resSel?.id === id ? null : { id, left: r.left, top: r.bottom + 4, width: Math.max(r.width, 180) };
  }

  const isMobile = $derived(vw < 760);
  const board = $derived(bySlug[slug]);
  const widgets = $derived(board ? (board.boards[board.page] ?? []) : []);
  const onPage = $derived(new Set(widgets.map((w) => w.key)));
  const tray = $derived(catalog.filter((c) => !onPage.has(c.key)));

  // Display grid: on a phone the saved (wide) layout is re-packed into however many columns
  // actually fit the width — so controls reflow & stay legible instead of overflowing sideways.
  // Desktop renders the real layout (cols), with the cell sized to fill the width.
  const fitCols = $derived(Math.max(2, Math.floor((containerW + GAP) / (76 + GAP))));
  const displayCols = $derived(isMobile ? Math.min(cols, Math.max(2, Math.min(6, fitCols))) : cols);
  const cell = $derived(clamp(Math.floor((containerW - (displayCols - 1) * GAP) / displayCols), isMobile ? 60 : 48, 230));
  const viewWidgets = $derived(isMobile ? packInto(widgets, displayCols, 256) : widgets);
  const viewRows = $derived(isMobile ? Math.max(1, ...viewWidgets.map((w) => w.y + w.h)) : rows);
  const effCompact = $derived(compact || isMobile);

  // persisted global grid prefs
  const GKEY = 'axs.surface2.grid';
  function loadGrid() {
    try {
      const j = JSON.parse(localStorage.getItem(GKEY) || 'null');
      if (j) {
        cols = clamp(j.cols ?? cols, 4, 24);
        rows = clamp(j.rows ?? rows, 4, 8);
        compact = !!j.compact;
      } else {
        cols = vw < 760 ? clamp(Math.round((vw - 32) / 84), 4, 8) : clamp(Math.round((vw - 32) / 108), 6, 16);
      }
    } catch {
      /* */
    }
  }
  function saveGrid() {
    try {
      localStorage.setItem(GKEY, JSON.stringify({ cols, rows, compact }));
    } catch {
      /* */
    }
  }
  const sKey = (s: string) => `axs.surface2.${s}`;
  function saveBoard(s: string) {
    if (!s || !bySlug[s]) return;
    try {
      localStorage.setItem(sKey(s), JSON.stringify(bySlug[s]));
    } catch {
      /* */
    }
  }

  function clamp(v: number, a: number, b: number) {
    return Math.max(a, Math.min(b, v));
  }

  const mk = (c: Ctl): Widget => ({ id: 'w' + c.key, key: c.key, x: 0, y: 0, w: c.w, h: c.h, view: c.view });
  // catalog key for a layout control's paramId (cont → k<id>, enum → e<id>); null if not on this device
  function keyForParam(pid: number | null): string | null {
    if (pid == null) return null;
    if (knobById.has(pid)) return `k${pid}`;
    if (enumById.has(pid)) return `e${pid}`;
    return null;
  }
  // Device-authentic Default layout: pages/labels/columns straight from the editor layout the server
  // serves (blockLayout). Controls land at their editor column (x), stacked vertically per column.
  // Anything the layout doesn't reference gets swept onto a trailing "More" page so nothing is lost.
  function layoutBoard(): Board | null {
    const lay = editor.blockLayout;
    if (!lay?.pages?.length) return null;
    const boards: Record<string, Widget[]> = {};
    const pageOrder: string[] = [];
    for (const pg of lay.pages) {
      const colY: Record<number, number> = {};
      const ws: Widget[] = [];
      for (const ctl of pg.controls) {
        const key = keyForParam(ctl.paramId);
        const cat = key ? catByKey.get(key) : undefined;
        if (!cat) continue;
        const x = clamp(ctl.col ?? 0, 0, Math.max(0, cols - cat.w));
        const y = colY[x] ?? 0;
        ws.push({ id: 'w' + key, key: key!, x, y, w: cat.w, h: cat.h, view: cat.view });
        colY[x] = y + cat.h;
      }
      if (!ws.length) continue;
      const name = pg.name?.trim() || `Page ${pageOrder.length + 1}`;
      boards[name] = ws;
      pageOrder.push(name);
    }
    if (!pageOrder.length) return null;
    const placed = new Set(pageOrder.flatMap((p) => boards[p]!.map((w) => w.key)));
    const rest = catalog.filter((c) => !placed.has(c.key));
    if (rest.length) {
      boards['More'] = packList(rest.map(mk));
      pageOrder.push('More');
    }
    return { pageOrder, page: pageOrder[0]!, boards };
  }
  // Default board: device-authentic editor pages when the server supplies a layout; otherwise a curated
  // "Main" page (EQ + the ~8 musician-facing knobs + bypass) and an "Advanced" page with everything else.
  function defaultBoard(): Board {
    const lay = layoutBoard();
    if (lay) return lay;
    const ideal = new Set(idealIds(editor.params));
    const main = catalog.filter((c) => c.key === 'eq' || c.key === 'bypass' || (c.kind === 'cont' && ideal.has(c.id)));
    const rest = catalog.filter((c) => !main.includes(c));
    const boards: Record<string, Widget[]> = { Main: packList(main.map(mk)) };
    const pageOrder = ['Main'];
    if (rest.length) {
      boards.Advanced = packList(rest.map(mk));
      pageOrder.push('Advanced');
    }
    return { pageOrder, page: 'Main', boards };
  }
  // reconcile a saved board against the current catalog (drop vanished controls, clamp sizes)
  function reconcile(b: Board): Board {
    const valid = new Set(catalog.map((c) => c.key));
    const boards: Record<string, Widget[]> = {};
    for (const pg of b.pageOrder) {
      boards[pg] = (b.boards[pg] ?? []).filter((w) => valid.has(w.key)).map((w) => ({ ...w, w: clamp(w.w, 1, cols), h: clamp(w.h, 1, rows) }));
    }
    const page = b.pageOrder.includes(b.page) ? b.page : b.pageOrder[0] ?? 'Main';
    return { pageOrder: b.pageOrder.length ? b.pageOrder : ['Main'], page, boards };
  }

  // load a slug's board (storage → reconcile, else default) when it first appears or the catalog changes
  let loadedSig = '';
  $effect(() => {
    const sig = slug + '|' + catalog.map((c) => c.key).join(',');
    if (!slug || catalog.length <= 1 || sig === loadedSig) return;
    loadedSig = sig;
    let b: Board | null = null;
    try {
      const raw = localStorage.getItem(sKey(slug));
      if (raw) b = reconcile(JSON.parse(raw));
    } catch {
      /* */
    }
    if (!b || !b.boards[b.page]?.length) {
      const existing = bySlug[slug];
      b = existing ? reconcile(existing) : defaultBoard();
    }
    bySlug = { ...bySlug, [slug]: b };
  });

  // arrange is a desktop affordance — never leave it on when we drop to the phone layout
  $effect(() => {
    if (isMobile && editMode) editMode = false;
  });
  // searching shows a flat, live results list — leave arrange mode so results stay interactive
  $effect(() => {
    if (searching && editMode) editMode = false;
  });

  // viewport + container measurement
  $effect(() => {
    loadGrid();
    const onResize = () => (vw = window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });
  $effect(() => {
    if (!containerEl || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const w = (containerEl?.clientWidth ?? 0) - 32;
      if (w > 0 && Math.abs(w - containerW) > 1) containerW = w;
    });
    ro.observe(containerEl);
    return () => ro.disconnect();
  });

  // ── board mutation helpers ──
  function setWidgets(list: Widget[]) {
    if (!board) return;
    bySlug = { ...bySlug, [slug]: { ...board, boards: { ...board.boards, [board.page]: list } } };
    saveBoard(slug);
  }
  function setPage(pg: string) {
    if (!board) return;
    bySlug = { ...bySlug, [slug]: { ...board, page: pg } };
    openSelect = null;
    editingKey = null;
  }
  function find(id: string) {
    return widgets.find((w) => w.id === id);
  }
  // rename a page (double-click its tab in arrange mode)
  function renamePage(oldName: string, raw: string) {
    renamingPage = null;
    const name = raw.trim();
    if (!board || !name || name === oldName || board.pageOrder.includes(name)) return;
    const pageOrder = board.pageOrder.map((p) => (p === oldName ? name : p));
    const boards: Record<string, Widget[]> = {};
    for (const p of board.pageOrder) boards[p === oldName ? name : p] = board.boards[p] ?? [];
    bySlug = { ...bySlug, [slug]: { pageOrder, page: board.page === oldName ? name : board.page, boards } };
    saveBoard(slug);
  }
  // focus + select an input as soon as it mounts (page rename field)
  function focusEl(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  function occupancy(except?: string) {
    const m = Array.from({ length: rows }, () => new Array(cols).fill(false));
    for (const w of widgets) {
      if (w.id === except) continue;
      for (let y = w.y; y < w.y + w.h; y++) for (let x = w.x; x < w.x + w.w; x++) if (y < rows && x < cols) m[y][x] = true;
    }
    return m;
  }
  function fits(m: boolean[][], x: number, y: number, w: number, h: number) {
    if (x < 0 || y < 0 || x + w > cols || y + h > rows) return false;
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (m[j][i]) return false;
    return true;
  }
  function firstFit(m: boolean[][], w: number, h: number) {
    for (let y = 0; y <= rows - h; y++) for (let x = 0; x <= cols - w; x++) if (fits(m, x, y, w, h)) return { x, y };
    return null;
  }
  // gravity-pack a list into a c×r grid (used for the arrange board AND the mobile reflow)
  function packInto(list: Widget[], c: number, r: number) {
    const m = Array.from({ length: r }, () => new Array(c).fill(false));
    const fit = (x: number, y: number, w: number, h: number) => {
      if (x < 0 || y < 0 || x + w > c || y + h > r) return false;
      for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (m[j][i]) return false;
      return true;
    };
    const out: Widget[] = [];
    for (const w of list.slice().sort((a, b) => a.y - b.y || a.x - b.x)) {
      const pw = Math.min(w.w, c),
        ph = Math.min(w.h, r);
      let pos: { x: number; y: number } | null = null;
      for (let y = 0; y <= r - ph && !pos; y++) for (let x = 0; x <= c - pw && !pos; x++) if (fit(x, y, pw, ph)) pos = { x, y };
      if (!pos) pos = { x: 0, y: 0 };
      for (let j = pos.y; j < pos.y + ph; j++) for (let i = pos.x; i < pos.x + pw; i++) if (m[j]) m[j][i] = true;
      out.push({ ...w, x: pos.x, y: pos.y, w: pw, h: ph });
    }
    return out;
  }
  const packList = (list: Widget[]) => packInto(list, cols, rows);

  // ── arrange-mode actions ──
  const toggleEdit = () => {
    editMode = !editMode;
    drag = null;
    editingKey = null;
    openSelect = null;
  };
  function toggleCompact() {
    compact = !compact;
    saveGrid();
    if (compact) setWidgets(packList(widgets));
  }
  function gridResize(dim: 'cols' | 'rows', d: number) {
    const v = clamp((dim === 'cols' ? cols : rows) + d, 4, dim === 'cols' ? 24 : 8);
    if (dim === 'cols') cols = v;
    else rows = v;
    saveGrid();
    // clamp every page of every slug to the new grid
    const next: Record<string, Board> = {};
    for (const s of Object.keys(bySlug)) {
      const b = bySlug[s];
      const boards: Record<string, Widget[]> = {};
      for (const pg of b.pageOrder) boards[pg] = (b.boards[pg] ?? []).map((w) => ({ ...w, w: Math.min(w.w, cols), h: Math.min(w.h, rows), x: clamp(w.x, 0, cols - Math.min(w.w, cols)), y: clamp(w.y, 0, rows - Math.min(w.h, rows)) }));
      next[s] = { ...b, boards };
    }
    bySlug = next;
    if (effCompact) setTimeout(() => setWidgets(packList(widgets)), 0);
    saveBoard(slug);
  }
  function tidyUp() {
    setWidgets(packList(widgets));
    editor.showToast('Board tidied', accent);
  }
  function addPage() {
    if (!board) return;
    const n = 'Page ' + (board.pageOrder.length + 1);
    bySlug = { ...bySlug, [slug]: { pageOrder: [...board.pageOrder, n], page: n, boards: { ...board.boards, [n]: [] } } };
    saveBoard(slug);
  }
  function trayAdd(key: string) {
    const c = catByKey.get(key);
    if (!c) return;
    const m = occupancy();
    const pos = firstFit(m, c.w, c.h) || firstFit(m, 1, 1);
    if (!pos) {
      editor.showToast('No room — enlarge the grid', '#d6543f');
      return;
    }
    const w = Math.min(c.w, cols - pos.x),
      h = Math.min(c.h, rows - pos.y);
    setWidgets([...widgets, { id: 'w' + key + Date.now().toString(36), key, x: pos.x, y: pos.y, w, h, view: c.view }]);
  }
  function removeWidget(id: string) {
    setWidgets(widgets.filter((w) => w.id !== id));
  }
  function cycleView(id: string) {
    const w = find(id);
    const c = w && catByKey.get(w.key);
    if (!w || !c) return;
    const i = c.views.indexOf(w.view);
    setWidgets(widgets.map((x) => (x.id === id ? { ...x, view: c.views[(i + 1) % c.views.length] } : x)));
  }

  // ── value plumbing (live refs resolved by id each call) ──
  const knob = (id: number) => knobById.get(id);
  const enm = (id: number) => enumById.get(id);
  const pct = (id: number) => Math.round((knob(id)?.norm ?? 0) * 100);
  const valText = (id: number) => {
    const p = knob(id);
    return p ? fmtCompact(p) : '–';
  };
  function setNorm(id: number, n: number) {
    const p = knob(id);
    if (p) editor.setParam(p, clamp(n, 0, 1));
  }
  function togOn(id: number) {
    const e = enm(id);
    return e ? e.value === (e.options[1]?.value ?? 1) : false;
  }
  function togLabel(id: number) {
    const e = enm(id);
    if (!e) return '';
    return e.options.find((o) => o.value === e.value)?.label ?? (togOn(id) ? 'On' : 'Off');
  }
  function toggleEnum(id: number) {
    const e = enm(id);
    if (!e) return;
    const off = e.options[0]?.value ?? 0,
      on = e.options[1]?.value ?? 1;
    editor.setEnum(e, e.value === on ? off : on);
  }

  // a widget's pixel footprint + the knob dial size that fits it (reserves room for the label)
  const pxOf = (n: number) => n * cell + (n - 1) * GAP;
  // the value lives in the hover/tap bubble now, so the dial fills the tile — but leave room for the
  // card padding (16) + gap (5) + the label (~16) so the label never clips.
  const dialFor = (w: Widget) => clamp(Math.min(pxOf(w.w) - 14, pxOf(w.h) - 38), 30, 260);
  // anchor the value bubble above an element (knob/card), in screen coords (fixed-position)
  function showTip(el: HTMLElement, id: number, edit: boolean) {
    const r = el.getBoundingClientRect();
    tip = { id, cx: r.left + r.width / 2, cy: r.top, edit };
    if (edit) {
      editBuf = valText(id);
      setTimeout(() => {
        const i = document.getElementById('cs-input') as HTMLInputElement | null;
        i?.focus();
        i?.select();
      }, 0);
    }
  }
  function commitTip() {
    if (tip) {
      const p = knob(tip.id);
      const n = parseFloat(editBuf);
      if (p && !isNaN(n)) setNorm(tip.id, p.min != null && p.max != null ? normFromValue(n, p) : clamp(n / 100, 0, 1));
    }
    tip = null;
  }
  // full, readable value for the bubble — with units (4.0 dB, 470 Hz, 12 kHz, 63%)
  const fullVal = (id: number): string => {
    const p = knob(id);
    if (!p) return '–';
    const v = paramValue(p);
    if (p.unit === 'Hz' && Math.abs(v) >= 1000) return (v / 1000).toFixed(v >= 10000 ? 1 : 2).replace(/\.?0+$/, '') + ' kHz';
    const u = paramUnit(p);
    const num = Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
    return u ? `${num} ${u}` : num;
  };

  // move a widget to an adjacent page (drag to the left/right edge of the board)
  function migrateWidget(id: string, dir: number) {
    if (!board) return false;
    const o = board.pageOrder;
    const ni = o.indexOf(board.page) + dir;
    if (ni < 0 || ni >= o.length) return false;
    const target = o[ni];
    const w = widgets.find((x) => x.id === id);
    if (!w) return false;
    const tgt = board.boards[target] ?? [];
    const m = Array.from({ length: rows }, () => new Array(cols).fill(false));
    for (const tw of tgt) for (let y = tw.y; y < tw.y + tw.h; y++) for (let x = tw.x; x < tw.x + tw.w; x++) if (y < rows && x < cols) m[y][x] = true;
    const ww = Math.min(w.w, cols), wh = Math.min(w.h, rows);
    const pos = firstFit(m, ww, wh) || { x: 0, y: 0 };
    const moved = { ...w, x: pos.x, y: pos.y, w: ww, h: wh };
    bySlug = { ...bySlug, [slug]: { ...board, page: target, boards: { ...board.boards, [board.page]: widgets.filter((x) => x.id !== id), [target]: [...tgt, moved] } } };
    saveBoard(slug);
    return true;
  }

  // ── gestures (temp state in plain refs; not reactive) ──
  let vd: { id: number; sy: number; sn: number } | null = null; // cont vertical drag
  let tk: { id: number; rect: DOMRect; vertical: boolean } | null = null; // track drag
  let mv: { id: string; w: number; h: number; grabDX: number; grabDY: number; left: number; top: number; armed: boolean } | null = null; // move (grabDX/Y = px from tile's top-left to the grab point)
  let rz: { id: string; sx: number; sy: number; ow: number; oh: number } | null = null; // resize
  let sw: { sx: number; moved: boolean } | null = null; // page swipe

  function metrics() {
    const r = boardEl?.getBoundingClientRect() ?? ({ left: 0, top: 0 } as DOMRect);
    return { left: r.left, top: r.top, step: cell + GAP };
  }
  function onWidgetDown(e: PointerEvent, id: string, kind: Kind, pid: number, key: string) {
    if (editMode) {
      e.stopPropagation();
      const w = find(id);
      if (!w) return;
      const m = metrics();
      // px offset from the tile's own top-left to the grab point → the grabbed point stays under the cursor
      mv = { id, w: w.w, h: w.h, grabDX: e.clientX - (m.left + w.x * m.step), grabDY: e.clientY - (m.top + w.y * m.step), left: m.left, top: m.top, armed: false };
      drag = { id, x: w.x, y: w.y, w: w.w, h: w.h, valid: true };
      return;
    }
    if (kind === 'cont') {
      vd = { id: pid, sy: e.clientY, sn: knob(pid)?.norm ?? 0 };
      dragging = true; // keep the value bubble alive for the whole adjust, even if the cursor leaves
      showTip(e.currentTarget as HTMLElement, pid, false);
      e.stopPropagation();
    }
  }
  function onTrackDown(e: PointerEvent, id: string, pid: number, vertical: boolean) {
    if (editMode) return;
    e.stopPropagation();
    tk = { id: pid, rect: (e.currentTarget as HTMLElement).getBoundingClientRect(), vertical };
    trackMove(e);
  }
  function trackMove(e: PointerEvent) {
    if (!tk) return;
    const frac = tk.vertical ? clamp(1 - (e.clientY - tk.rect.top) / tk.rect.height, 0, 1) : clamp((e.clientX - tk.rect.left) / tk.rect.width, 0, 1);
    setNorm(tk.id, frac);
  }
  function onResizeDown(e: PointerEvent, id: string) {
    e.stopPropagation();
    const w = find(id);
    if (!w) return;
    rz = { id, sx: e.clientX, sy: e.clientY, ow: w.w, oh: w.h };
  }
  function onBoardDown(e: PointerEvent) {
    if (editMode) return;
    if (!tip?.edit) tip = null; // tapping empty board dismisses the value bubble
    sw = { sx: e.clientX, moved: false };
  }

  $effect(() => {
    const onMove = (e: PointerEvent) => {
      if (mv) {
        e.preventDefault();
        // drag past the left/right edge of the board → carry the widget to the adjacent page
        const br = boardEl?.getBoundingClientRect();
        if (br) {
          const EDGE = 44;
          const dir = e.clientX > br.right - EDGE ? 1 : e.clientX < br.left + EDGE ? -1 : 0;
          if (dir === 0) mv.armed = true;
          else if (mv.armed && migrateWidget(mv.id, dir)) {
            const w = find(mv.id);
            if (w) {
              // re-grab from the tile centre so it sits under the cursor on the new page
              const step = cell + GAP;
              mv = { ...mv, w: w.w, h: w.h, grabDX: (w.w * step) / 2, grabDY: (w.h * step) / 2, armed: false };
              drag = { id: mv.id, x: w.x, y: w.y, w: w.w, h: w.h, valid: true };
            }
            return;
          }
        }
        const step = cell + GAP;
        let nx = Math.round((e.clientX - mv.left - mv.grabDX) / step);
        let ny = Math.round((e.clientY - mv.top - mv.grabDY) / step);
        nx = clamp(nx, 0, cols - mv.w);
        ny = clamp(ny, 0, rows - mv.h);
        const occ = occupancy(mv.id);
        const valid = effCompact ? true : fits(occ, nx, ny, mv.w, mv.h);
        if (!drag || drag.x !== nx || drag.y !== ny || drag.valid !== valid) drag = { id: mv.id, x: nx, y: ny, w: mv.w, h: mv.h, valid };
        return;
      }
      if (rz) {
        e.preventDefault();
        const step = cell + GAP;
        const dw = Math.round((e.clientX - rz.sx) / step),
          dh = Math.round((e.clientY - rz.sy) / step);
        const w = find(rz.id);
        if (!w) return;
        const nw = clamp(rz.ow + dw, 1, cols - w.x),
          nh = clamp(rz.oh + dh, 1, rows - w.y);
        if (nw === w.w && nh === w.h) return;
        if (!effCompact && !fits(occupancy(rz.id), w.x, w.y, nw, nh)) return;
        setWidgets(widgets.map((x) => (x.id === rz!.id ? { ...x, w: nw, h: nh } : x)));
        return;
      }
      if (tk) {
        e.preventDefault();
        trackMove(e);
        return;
      }
      if (vd) {
        e.preventDefault();
        setNorm(vd.id, vd.sn + (vd.sy - e.clientY) * 0.005);
        return;
      }
      if (sw && Math.abs(e.clientX - sw.sx) > 8) sw.moved = true;
    };
    const onUp = (e: PointerEvent) => {
      if (mv) {
        if (drag?.valid) {
          let b = widgets.map((x) => (x.id === mv!.id ? { ...x, x: drag!.x, y: drag!.y } : x));
          if (effCompact) b = packList(b);
          setWidgets(b);
        }
        mv = null;
        drag = null;
      }
      if (rz) {
        rz = null;
        if (effCompact) setWidgets(packList(widgets));
      }
      tk = null;
      if (vd) {
        vd = null;
        dragging = false;
        if (tip && !tip.edit) tip = null; // adjust released → hide the value bubble
      }
      if (sw) {
        const moved = sw.moved,
          dx = e.clientX - sw.sx;
        sw = null;
        if (moved && Math.abs(dx) > 60 && board) {
          const o = board.pageOrder,
            i = o.indexOf(board.page);
          const ni = clamp(i + (dx < 0 ? 1 : -1), 0, o.length - 1);
          if (ni !== i) setPage(o[ni]);
        }
      }
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  });

  // value typing
  function startType(key: string, pid: number) {
    if (editMode) return;
    editingKey = key;
    editBuf = valText(pid);
    setTimeout(() => {
      const el = document.getElementById('cs-input') as HTMLInputElement | null;
      el?.focus();
      el?.select();
    }, 0);
  }
  function commitType(pid: number) {
    const p = knob(pid);
    const n = parseFloat(editBuf);
    if (p && !isNaN(n)) setNorm(pid, p.min != null && p.max != null ? normFromValue(n, p) : clamp(n / 100, 0, 1));
    editingKey = null;
  }
  function nudge(pid: number, dir: number) {
    setNorm(pid, (knob(pid)?.norm ?? 0) + dir * 0.02);
  }

  // dropdown popover geometry
  const selMenu = $derived.by(() => {
    if (!openSelect) return null;
    const w = find(openSelect);
    const c = w && catByKey.get(w.key);
    const e = c && enm(c.id);
    if (!w || !c || !e) return null;
    const step = cell + GAP;
    return { id: w.id, e, left: w.x * step, top: (w.y + w.h) * step + 2, width: Math.max(w.w * cell + (w.w - 1) * GAP, 160) };
  });

  // svg knob pointer transform
  const knobRot = (p: number) => (-135 + 2.7 * p).toFixed(1);
</script>

<!-- page tabs + live control search -->
<div class="tabs ws-scroll">
  <div class="csearch" class:active={searching}>
    <svg width="15" height="15" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M10.8 10.8 L14.5 14.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
    <input class="csin" placeholder="Find a control…" bind:value={q} />
    {#if searching}<button class="csx" aria-label="Clear search" onclick={() => { q = ''; resSel = null; }}>✕</button>{/if}
  </div>
  {#if !searching}
    {#if board}
      {#each board.pageOrder as pg (pg)}
        {#if renamingPage === pg}
          <input class="tab tabedit" value={pg} use:focusEl onkeydown={(e) => (e.key === 'Enter' ? e.currentTarget.blur() : e.key === 'Escape' ? (renamingPage = null) : null)} onblur={(e) => renamePage(pg, e.currentTarget.value)} />
        {:else}
          <button class="tab" class:on={pg === board.page} onclick={() => setPage(pg)} ondblclick={() => editMode && (renamingPage = pg)} title={editMode ? 'Double-click to rename' : ''}>{pg}</button>
        {/if}
      {/each}
    {/if}
    {#if editMode}
      <button class="tab addp" title="Add page" onclick={addPage}>＋</button>
    {/if}
    <span class="tab-sp"></span>
    {#if !isMobile}
      <button class="arrange" class:on={editMode} onclick={toggleEdit} title="Lock = use · Unlock = arrange">
        <span>{editMode ? '🔓' : '🔒'}</span>{editMode ? 'Arranging' : 'Arrange'}
      </button>
    {/if}
  {/if}
</div>

{#if searching}
  <!-- live search results: every matching control, flat, ignoring tabs -->
  <div class="content scroll">
    <div class="results">
      {#each matches as c (c.key)}
        {@const view = viewOf(c)}
        <div class="restile" class:wide={c.kind === 'select' || (c.kind === 'cont' && view === 'slider')} class:nobg={c.kind === 'action'}>
          {#if c.kind === 'cont' && view === 'knob'}
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
            <div class="dialwrap" style:width="60px" style:height="60px"
              onpointerdown={(e) => resKnobDown(e, c.id)}
              onmouseenter={(e) => { if (!isMobile) showTip(e.currentTarget, c.id, false); }}
              onmouseleave={() => { if (!dragging && !tip?.edit) tip = null; }}
              ondblclick={(e) => showTip(e.currentTarget, c.id, true)}>
              <svg width="60" height="60" viewBox="0 0 64 64" style="display:block">
                <circle cx="32" cy="32" r="25" fill="none" stroke="#2a2a31" stroke-width="5" stroke-linecap="round" stroke-dasharray="117.8 300" transform="rotate(135 32 32)" />
                <circle cx="32" cy="32" r="25" fill="none" stroke={accent} stroke-width="5" stroke-linecap="round" stroke-dasharray="{((pct(c.id) / 100) * 117.8).toFixed(1)} 300" transform="rotate(135 32 32)" />
                <circle cx="32" cy="32" r="15" fill="#141417" stroke="#000" stroke-width="1" />
                <g transform="rotate({knobRot(pct(c.id))} 32 32)"><circle cx="32" cy="20" r="2.8" fill="#f5a623" /></g>
              </svg>
            </div>
            <div class="lbl">{c.label}</div>
          {:else if c.kind === 'cont' && view === 'fader'}
            {#if editingKey === c.key}
              <input id="cs-input" class="kinput rel" value={editBuf} oninput={(e) => (editBuf = e.currentTarget.value)} onkeydown={(e) => (e.key === 'Enter' ? commitType(c.id) : e.key === 'Escape' ? (editingKey = null) : null)} onblur={() => commitType(c.id)} />
            {:else}
              <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
              <div class="kval rel" ondblclick={() => startType(c.key, c.id)} title="Double-click to type">{valText(c.id)}</div>
            {/if}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="vtrack" onpointerdown={(e) => onTrackDown(e, c.key, c.id, true)}>
              <div class="vfill" style:height="{pct(c.id)}%"></div>
              <div class="vhandle" style:bottom="calc({pct(c.id)}% - 8px)"></div>
            </div>
            <div class="lbl">{c.label}</div>
          {:else if c.kind === 'cont' && view === 'number'}
            <div class="numrow">
              <button class="step" onclick={() => nudge(c.id, -1)}>−</button>
              {#if editingKey === c.key}
                <input id="cs-input" class="kinput big" value={editBuf} oninput={(e) => (editBuf = e.currentTarget.value)} onkeydown={(e) => (e.key === 'Enter' ? commitType(c.id) : e.key === 'Escape' ? (editingKey = null) : null)} onblur={() => commitType(c.id)} />
              {:else}
                <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
                <div class="kval big" ondblclick={() => startType(c.key, c.id)} title="Double-click to type">{valText(c.id)}</div>
              {/if}
              <button class="step" onclick={() => nudge(c.id, 1)}>＋</button>
            </div>
            <div class="lbl">{c.label}</div>
          {:else if c.kind === 'cont'}
            <!-- slider (default for cont) -->
            <div class="srow">
              <span class="slbl">{c.label}</span>
              {#if editingKey === c.key}
                <input id="cs-input" class="kinput" value={editBuf} oninput={(e) => (editBuf = e.currentTarget.value)} onkeydown={(e) => (e.key === 'Enter' ? commitType(c.id) : e.key === 'Escape' ? (editingKey = null) : null)} onblur={() => commitType(c.id)} />
              {:else}
                <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
                <div class="kval cy" ondblclick={() => startType(c.key, c.id)} title="Double-click to type">{valText(c.id)}</div>
              {/if}
            </div>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="htrack" onpointerdown={(e) => onTrackDown(e, c.key, c.id, false)}>
              <div class="hfill" style:width="{pct(c.id)}%"></div>
              <div class="hhandle" style:left="calc({pct(c.id)}% - 8px)"></div>
            </div>
          {:else if c.kind === 'toggle' && view === 'switch'}
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
            <div class="switch" class:on={togOn(c.id)} onclick={() => toggleEnum(c.id)}><div class="snob"></div></div>
            <div class="lbl">{c.label}</div>
          {:else if c.kind === 'toggle'}
            <!-- button (default for toggle) -->
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
            <div class="onoff" class:on={togOn(c.id)} onclick={() => toggleEnum(c.id)} title={togLabel(c.id)}>
              <span class="dot"></span><span class="onoff-l">{c.label}</span>
            </div>
          {:else if c.kind === 'select'}
            <div class="seltop">{c.label}</div>
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
            <div class="selfield" class:open={resSel?.id === c.id} onclick={(e) => openResSel(e, c.id)}>
              <span class="seltxt">{enm(c.id)?.options.find((o) => o.value === enm(c.id)?.value)?.label ?? '–'}</span>
              <span class="caret">▾</span>
            </div>
          {:else if c.kind === 'action'}
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
            <div class="action" class:byp={editor.selected?.bypassed} onclick={() => editor.toggleBypass()}>{editor.selected?.bypassed ? 'Bypassed' : 'Engaged'}</div>
          {/if}
        </div>
      {/each}
      {#if matches.length === 0}<div class="nores">No controls match “{q}”.</div>{/if}
    </div>
  </div>
{:else}
<!-- arrange toolbar -->
{#if editMode}
  <div class="arrbar">
    <span class="ab-tag">ARRANGE</span>
    <div class="stepper"><span class="sl">COLS</span><button onclick={() => gridResize('cols', -1)}>−</button><span class="sv">{cols}</span><button onclick={() => gridResize('cols', 1)}>＋</button></div>
    <div class="stepper"><span class="sl">ROWS</span><button onclick={() => gridResize('rows', -1)}>−</button><span class="sv">{rows}</span><button onclick={() => gridResize('rows', 1)}>＋</button></div>
    <span class="ab-note">applies to every block</span>
    <span class="ab-sp"></span>
    <button class="ab-btn" class:on={effCompact} onclick={toggleCompact} title="Free = leave gaps · Packed = no holes">{effCompact ? '⊞ Packed' : '⊡ Free'}</button>
    <button class="ab-btn" onclick={tidyUp}>⤢ Tidy up</button>
  </div>
{/if}

<!-- board -->
<div class="content scroll" bind:this={containerEl}>
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div class="boardwrap" bind:this={boardEl} onpointerdown={onBoardDown} style:width="{displayCols * cell + (displayCols - 1) * GAP}px" style:height="{viewRows * cell + (viewRows - 1) * GAP}px">
    {#if editMode}
      <div class="gridlayer" style:grid-template-columns="repeat({cols}, {cell}px)" style:grid-template-rows="repeat({rows}, {cell}px)" style:gap="{GAP}px">
        {#each Array(cols * rows) as _, i (i)}<div class="gcell"></div>{/each}
      </div>
    {/if}

    <div class="gridlayer" style:grid-template-columns="repeat({displayCols}, {cell}px)" style:grid-template-rows="repeat({viewRows}, {cell}px)" style:gap="{GAP}px">
      {#if drag}
        <div class="ghost" class:bad={!drag.valid} style:grid-column="{drag.x + 1} / span {drag.w}" style:grid-row="{drag.y + 1} / span {drag.h}"></div>
      {/if}

      {#each viewWidgets as w (w.id)}
        {@const c = catByKey.get(w.key)}
        {#if c}
          <div style:grid-column="{w.x + 1} / span {w.w}" style:grid-row="{w.y + 1} / span {w.h}" style:min-width="0" style:min-height="0" style:position="relative">
            <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
            <div
              class="card"
              class:editing={editMode}
              class:nobg={w.view === 'action' || w.view === 'eq'}
              class:dragging={drag?.id === w.id}
              onpointerdown={(e) => onWidgetDown(e, w.id, c.kind, c.id, c.key)}
            >
              {#if c.kind === 'cont' && w.view === 'knob'}
                {@const d = dialFor(w)}
                <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
                <div
                  class="dialwrap"
                  style:width="{d}px"
                  style:height="{d}px"
                  onmouseenter={(e) => { if (!isMobile && !editMode) showTip(e.currentTarget, c.id, false); }}
                  onmouseleave={() => { if (!dragging && !tip?.edit) tip = null; }}
                  ondblclick={(e) => { if (!editMode) showTip(e.currentTarget, c.id, true); }}
                >
                  <svg width={d} height={d} viewBox="0 0 64 64" style="display:block">
                    <circle cx="32" cy="32" r="25" fill="none" stroke="#2a2a31" stroke-width="5" stroke-linecap="round" stroke-dasharray="117.8 300" transform="rotate(135 32 32)" />
                    <circle cx="32" cy="32" r="25" fill="none" stroke={accent} stroke-width="5" stroke-linecap="round" stroke-dasharray="{((pct(c.id) / 100) * 117.8).toFixed(1)} 300" transform="rotate(135 32 32)" />
                    <circle cx="32" cy="32" r="15" fill="#141417" stroke="#000" stroke-width="1" />
                    <g transform="rotate({knobRot(pct(c.id))} 32 32)"><circle cx="32" cy="20" r="2.8" fill="#f5a623" /></g>
                  </svg>
                </div>
                <div class="lbl">{c.label}</div>
              {:else if c.kind === 'cont' && w.view === 'fader'}
                {#if editingKey === w.key}
                  <input id="cs-input" class="kinput rel" value={editBuf} oninput={(e) => (editBuf = e.currentTarget.value)} onkeydown={(e) => e.key === 'Enter' ? commitType(c.id) : e.key === 'Escape' ? (editingKey = null) : null} onblur={() => commitType(c.id)} onpointerdown={(e) => e.stopPropagation()} />
                {:else}
                  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
                  <div class="kval rel" ondblclick={() => startType(w.key, c.id)} title="Double-click to type">{valText(c.id)}</div>
                {/if}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="vtrack" onpointerdown={(e) => onTrackDown(e, w.id, c.id, true)}>
                  <div class="vfill" style:height="{pct(c.id)}%"></div>
                  <div class="vhandle" style:bottom="calc({pct(c.id)}% - 8px)"></div>
                </div>
                <div class="lbl">{c.label}</div>
              {:else if c.kind === 'cont' && w.view === 'slider'}
                <div class="srow">
                  <span class="slbl">{c.label}</span>
                  {#if editingKey === w.key}
                    <input id="cs-input" class="kinput" value={editBuf} oninput={(e) => (editBuf = e.currentTarget.value)} onkeydown={(e) => e.key === 'Enter' ? commitType(c.id) : e.key === 'Escape' ? (editingKey = null) : null} onblur={() => commitType(c.id)} onpointerdown={(e) => e.stopPropagation()} />
                  {:else}
                    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
                    <div class="kval cy" ondblclick={() => startType(w.key, c.id)} title="Double-click to type">{valText(c.id)}</div>
                  {/if}
                </div>
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="htrack" onpointerdown={(e) => onTrackDown(e, w.id, c.id, false)}>
                  <div class="hfill" style:width="{pct(c.id)}%"></div>
                  <div class="hhandle" style:left="calc({pct(c.id)}% - 8px)"></div>
                </div>
              {:else if c.kind === 'cont' && w.view === 'number'}
                <div class="numrow">
                  <button class="step" onpointerdown={(e) => e.stopPropagation()} onclick={() => nudge(c.id, -1)}>−</button>
                  {#if editingKey === w.key}
                    <input id="cs-input" class="kinput big" value={editBuf} oninput={(e) => (editBuf = e.currentTarget.value)} onkeydown={(e) => e.key === 'Enter' ? commitType(c.id) : e.key === 'Escape' ? (editingKey = null) : null} onblur={() => commitType(c.id)} onpointerdown={(e) => e.stopPropagation()} />
                  {:else}
                    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
                    <div class="kval big" ondblclick={() => startType(w.key, c.id)} title="Double-click to type">{valText(c.id)}</div>
                  {/if}
                  <button class="step" onpointerdown={(e) => e.stopPropagation()} onclick={() => nudge(c.id, 1)}>＋</button>
                </div>
                <div class="lbl">{c.label}</div>
              {:else if c.kind === 'toggle' && w.view === 'button'}
                <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
                <div class="onoff" class:on={togOn(c.id)} onpointerdown={(e) => e.stopPropagation()} onclick={() => !editMode && toggleEnum(c.id)} title={togLabel(c.id)}>
                  <span class="dot"></span><span class="onoff-l">{c.label}</span>
                </div>
              {:else if c.kind === 'toggle' && w.view === 'switch'}
                <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
                <div class="switch" class:on={togOn(c.id)} onpointerdown={(e) => e.stopPropagation()} onclick={() => !editMode && toggleEnum(c.id)}><div class="snob"></div></div>
                <div class="lbl">{c.label}</div>
              {:else if c.kind === 'select'}
                <div class="seltop">{c.label}</div>
                <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
                <div class="selfield" class:open={openSelect === w.id} onpointerdown={(e) => e.stopPropagation()} onclick={() => !editMode && (openSelect = openSelect === w.id ? null : w.id)}>
                  <span class="seltxt">{enm(c.id)?.options.find((o) => o.value === enm(c.id)?.value)?.label ?? '–'}</span>
                  <span class="caret">▾</span>
                </div>
              {:else if c.kind === 'eq'}
                <div class="eqtitle" style:left="{editMode ? 34 : 12}px">{c.label}</div>
                <div class="eqbox" style:pointer-events={editMode ? 'none' : 'auto'}>
                  <EQGraph bands={eqBands} gainRange={eqGainRange} {accent} onSet={(p, n) => editor.setParam(p, n)} />
                </div>
              {:else if c.kind === 'action'}
                <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
                <div class="action" class:byp={editor.selected?.bypassed} onpointerdown={(e) => e.stopPropagation()} onclick={() => !editMode && editor.toggleBypass()}>{editor.selected?.bypassed ? 'Bypassed' : 'Engaged'}</div>
              {/if}

              {#if editMode}
                <div class="chrome"></div>
                <div class="dims">{w.w}×{w.h}</div>
                <button class="wx" onpointerdown={(e) => e.stopPropagation()} onclick={() => removeWidget(w.id)}>✕</button>
                {#if c.views.length > 1}
                  <button class="vcyc" onpointerdown={(e) => e.stopPropagation()} onclick={() => cycleView(w.id)} title="Change control type"><span>{VIEW_ICON[w.view]}</span>{w.view}</button>
                {/if}
                {#if c.kind === 'cont'}
                  {@const sp = knob(c.id)}
                  <button class="qbadge" class:on={editor.isSwipeControl(c.id)} onpointerdown={(e) => e.stopPropagation()} onclick={() => sp && editor.toggleSwipeControl(sp)} title="Map to grid swipe control (adjust from the Signal Grid tile)">⚡</button>
                {/if}
                <button class="rsz" onpointerdown={(e) => onResizeDown(e, w.id)} aria-label="Resize">
                  <svg width="13" height="13" viewBox="0 0 13 13"><path d="M12 5 L5 12 M12 9 L9 12 M12 1 L1 12" stroke={accent} stroke-width="1.6" stroke-linecap="round" /></svg>
                </button>
              {/if}
            </div>
          </div>
        {/if}
      {/each}
    </div>

    {#if selMenu}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="selbg" onpointerdown={() => (openSelect = null)}></div>
      <div class="selmenu" style:left="{selMenu.left}px" style:top="{selMenu.top}px" style:width="{selMenu.width}px">
        {#each selMenu.e.options as o (o.value)}
          <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
          <div class="selopt" class:on={o.value === selMenu.e.value} onpointerdown={(e) => e.stopPropagation()} onclick={() => { editor.setEnum(selMenu!.e, o.value); openSelect = null; }}>{o.label}</div>
        {/each}
      </div>
    {/if}
  </div>

  {#if widgets.length === 0}
    <div class="boardempty">{editMode ? 'Empty page — add controls below' : 'Empty page — unlock to arrange'}</div>
  {/if}
</div>

<!-- widget tray -->
{#if editMode}
  <div class="tray">
    <div class="tray-h"><span class="th-tag">ADD CONTROL</span><span class="th-note">tap to drop into the first free slot</span></div>
    <div class="tray-row ws-scroll">
      {#each tray as t (t.key)}
        <button class="traychip" onclick={() => trayAdd(t.key)}>
          <span class="tc-ic">{VIEW_ICON[t.view]}</span>
          <span class="tc-txt"><span class="tc-name">{t.label}</span><span class="tc-meta">{t.kind} · {t.w}×{t.h}</span></span>
          <span class="tc-plus">＋</span>
        </button>
      {/each}
      {#if tray.length === 0}<div class="tray-empty">All controls are on the board.</div>{/if}
    </div>
  </div>
{/if}
{/if}

<!-- value bubble: one fixed-position tooltip, above everything, never clipped -->
{#if tip}
  <div class="tip" style:left="{tip.cx}px" style:top="{tip.cy}px">
    {#if tip.edit}
      <input id="cs-input" class="tipinput" value={editBuf} oninput={(e) => (editBuf = e.currentTarget.value)} onkeydown={(e) => (e.key === 'Enter' ? commitTip() : e.key === 'Escape' ? (tip = null) : null)} onblur={commitTip} onpointerdown={(e) => e.stopPropagation()} />
    {:else}
      {fullVal(tip.id)}
    {/if}
  </div>
{/if}

<!-- results select popover: fixed-position, anchored to the field (escapes the scroll container) -->
{#if resSel}
  {@const re = enm(resSel.id)}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="respop-bg" onpointerdown={() => (resSel = null)}></div>
  {#if re}
    <div class="respop" style:left="{resSel.left}px" style:top="{resSel.top}px" style:width="{resSel.width}px">
      {#each re.options as o (o.value)}
        <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
        <div class="selopt" class:on={o.value === re.value} onpointerdown={(e) => e.stopPropagation()} onclick={() => { editor.setEnum(re, o.value); resSel = null; }}>{o.label}</div>
      {/each}
    </div>
  {/if}
{/if}

<style>
  .tabs {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px 6px;
    overflow-x: auto;
    flex: none;
  }
  .tab {
    flex: none;
    padding: 8px 14px;
    border-radius: 9px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    background: #15151a;
    border: 1px solid #26262c;
    color: #8a8a93;
  }
  .tab.on {
    background: rgba(245, 166, 35, 0.12);
    border-color: #5a3f1f;
    color: #f5a623;
  }
  .tab.addp {
    border-style: dashed;
    color: #6e6e78;
  }
  .tabedit {
    width: 110px;
    background: #0d0d10;
    border-color: #35c9d6;
    color: #f5a623;
    outline: none;
    font-family: inherit;
  }
  .tab-sp {
    flex: 1;
  }
  .arrange {
    flex: none;
    display: flex;
    align-items: center;
    gap: 7px;
    height: 36px;
    padding: 0 13px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    background: #15151a;
    border: 1px solid #2a2a31;
    color: #9a9aa3;
  }
  .arrange.on {
    background: linear-gradient(180deg, #1d2a2c, #16201f);
    border-color: #35c9d6;
    color: #bfeef2;
  }
  .arrbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    padding: 9px 14px;
    flex: none;
    background: rgba(53, 201, 214, 0.05);
    border-top: 1px solid rgba(53, 201, 214, 0.14);
    border-bottom: 1px solid rgba(53, 201, 214, 0.14);
  }
  .ab-tag {
    font: 700 10px/1 var(--font-mono);
    letter-spacing: 0.1em;
    color: #7fd8de;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 34px;
    padding: 0 7px 0 11px;
    background: #0e0e10;
    border: 1px solid #26262c;
    border-radius: 10px;
  }
  .stepper .sl {
    font: 600 9px/1 var(--font-mono);
    color: #6e6e78;
    letter-spacing: 0.06em;
  }
  .stepper .sv {
    font: 700 13px/1 var(--font-mono);
    color: #e9e9ee;
    width: 16px;
    text-align: center;
  }
  .stepper button {
    width: 26px;
    height: 26px;
    border-radius: 7px;
    border: 0;
    cursor: pointer;
    font-size: 15px;
    color: #cfcfd6;
    background: #1c1c21;
  }
  .ab-note {
    font: 500 10px/1 var(--font-mono);
    color: #5b5b64;
  }
  .ab-sp {
    flex: 1;
  }
  .ab-btn {
    height: 34px;
    padding: 0 13px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    background: #15151a;
    border: 1px solid #2a2a31;
    color: #cfcfd6;
  }
  .ab-btn.on {
    background: #1d2a2c;
    border-color: #35c9d6;
    color: #7fd8de;
  }
  .content {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: auto;
    padding: 16px;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }
  .boardwrap {
    position: relative;
    flex: none;
    touch-action: none;
  }
  .gridlayer {
    position: absolute;
    inset: 0;
    display: grid;
  }
  .gcell {
    border-radius: 8px;
    border: 1px dashed #1f1f26;
    background: rgba(255, 255, 255, 0.012);
  }
  .ghost {
    border-radius: 11px;
    z-index: 5;
    border: 2px dashed #35c9d6;
    background: rgba(53, 201, 214, 0.12);
  }
  .ghost.bad {
    border-color: #d6543f;
    background: rgba(214, 84, 63, 0.12);
  }
  .card {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 11px;
    box-sizing: border-box;
    background: linear-gradient(180deg, #17171c, #101015);
    border: 1px solid #212129;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 8px;
    overflow: visible; /* let the value bubble pop above the tile */
    user-select: none;
    touch-action: none;
    cursor: ns-resize;
  }
  .card.nobg {
    background: transparent;
    border-color: transparent;
    padding: 0;
  }
  .card.editing {
    cursor: grab;
    border-color: #2c2c34;
    /* reserve the top + bottom bands so the ✕ / type-chip / ⚡ / resize don't sit on the label */
    padding-top: 22px;
    padding-bottom: 26px;
  }
  /* in arrange mode the whole tile is grabbable — the controls don't intercept the pointer,
     only the chrome buttons (remove / retype / resize) stay interactive */
  .card.editing > :not(.wx):not(.vcyc):not(.rsz):not(.qbadge) {
    pointer-events: none;
  }
  .card.dragging {
    opacity: 0.28;
  }
  .dialwrap {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  /* value speech-bubble — fixed-position so it floats above everything and is never clipped */
  .tip {
    position: fixed;
    transform: translate(-50%, calc(-100% - 11px));
    z-index: 9999;
    padding: 8px 14px;
    border-radius: 10px;
    background: #0a0a0c;
    border: 1px solid color-mix(in srgb, var(--accent, #35c9d6) 55%, #2a2a31);
    color: #f2f2f5;
    font: 700 17px/1 var(--font-mono);
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  }
  .tip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: #0a0a0c;
  }
  .tipinput {
    width: 90px;
    text-align: center;
    background: transparent;
    border: 0;
    outline: none;
    color: #fff;
    font: 700 17px/1 var(--font-mono);
    pointer-events: auto;
  }
  .kval {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font: 600 15px/1 var(--font-mono);
    color: #e9e9ee;
    cursor: text;
  }
  .kval.rel,
  .kinput.rel {
    position: relative;
    inset: auto;
  }
  .kval.cy {
    color: #7fd8de;
  }
  .kval.big {
    font-size: 28px;
    font-weight: 700;
    min-width: 44px;
  }
  .kinput {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 70%;
    text-align: center;
    background: #0a0a0c;
    border: 1px solid #35c9d6;
    border-radius: 6px;
    color: #fff;
    font: 600 15px/1 var(--font-mono);
    outline: none;
    padding: 3px 0;
  }
  .kinput.rel {
    position: relative;
    left: auto;
    top: auto;
    transform: none;
    width: 70%;
  }
  .kinput.big {
    position: relative;
    left: auto;
    top: auto;
    transform: none;
    width: 64px;
    font-size: 24px;
    font-weight: 700;
  }
  .lbl {
    font-weight: 600;
    font-size: 12px;
    color: #bdbdc6;
    text-align: center;
    line-height: 1.1;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .vtrack {
    position: relative;
    width: 14px;
    flex: 1;
    min-height: 18px;
    margin: 7px 0;
    border-radius: 8px;
    background: #16161b;
    border: 1px solid #26262c;
    cursor: ns-resize;
  }
  .vfill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(180deg, #5fe0ea, #35c9d6);
    border-radius: 8px;
  }
  .vhandle {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    width: 28px;
    height: 14px;
    border-radius: 5px;
    background: #f5a623;
    border: 3px solid #0d0d10;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.5);
  }
  .srow {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    width: 100%;
    gap: 8px;
    margin-bottom: auto;
    padding: 2px 2px 0;
  }
  .slbl {
    font-weight: 600;
    font-size: 12px;
    color: #bdbdc6;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .htrack {
    position: relative;
    width: 100%;
    height: 10px;
    margin: auto 0;
    border-radius: 6px;
    background: #16161b;
    border: 1px solid #26262c;
    cursor: ew-resize;
  }
  .hfill {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    background: linear-gradient(90deg, #35c9d6, #5fe0ea);
    border-radius: 6px;
  }
  .hhandle {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #f5a623;
    border: 3px solid #0d0d10;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.5);
  }
  .numrow {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .step {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #1c1c21;
    border: 1px solid #33333c;
    color: #cfcfd6;
    cursor: pointer;
    font-size: 16px;
    flex: none;
  }
  .onoff {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    width: 100%;
    min-height: 30px;
    padding: 0 10px;
    border-radius: 9px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 700;
    background: #16161b;
    border: 1px solid #2a2a31;
    color: #7a7a83;
  }
  .onoff.on {
    background: #142417;
    border-color: #2c4a31;
    color: #5fc46b;
  }
  .onoff-l {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .onoff .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
    background: #55555d;
  }
  .onoff.on .dot {
    background: #46d17f;
    box-shadow: 0 0 7px rgba(70, 209, 127, 0.8);
  }
  .switch {
    position: relative;
    width: 54px;
    height: 30px;
    border-radius: 15px;
    cursor: pointer;
    background: #16161b;
    border: 1px solid #2a2a31;
  }
  .switch.on {
    background: #173a26;
    border-color: #3a7d4f;
  }
  .snob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #5a5a62;
    transition: left 0.16s, background 0.15s;
  }
  .switch.on .snob {
    left: 27px;
    background: #46d17f;
    box-shadow: 0 0 8px rgba(70, 209, 127, 0.7);
  }
  .seltop {
    font-weight: 600;
    font-size: 11px;
    color: #9a9aa3;
    align-self: flex-start;
    margin-bottom: 6px;
  }
  .selfield {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 36px;
    padding: 0 11px;
    background: #0d0d10;
    border: 1px solid #2c2c34;
    border-radius: 9px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    color: #ededf2;
  }
  .selfield.open {
    border-color: #35c9d6;
  }
  .seltxt {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .caret {
    font-size: 10px;
    color: #6e6e78;
    flex: none;
    margin-left: 8px;
  }
  .eqtitle {
    position: absolute;
    top: 9px;
    left: 12px;
    z-index: 2;
    font-weight: 700;
    font-size: 12px;
    color: #c3c3cb;
  }
  .eqbox {
    width: 100%;
    height: 100%;
    display: flex;
  }
  .action {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    border-radius: 11px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 700;
    background: #142417;
    border: 1px solid #2c4a31;
    color: #5fc46b;
  }
  .action.byp {
    background: #241516;
    border-color: #5a2f33;
    color: #d6543f;
  }
  .chrome {
    position: absolute;
    inset: 0;
    z-index: 6;
    border-radius: 11px;
    border: 1px dashed rgba(53, 201, 214, 0.45);
    background: rgba(53, 201, 214, 0.04);
    pointer-events: none;
  }
  .dims {
    position: absolute;
    top: 5px;
    right: 5px;
    z-index: 8;
    font: 700 8px/1 var(--font-mono);
    color: #5b5b64;
    background: rgba(0, 0, 0, 0.4);
    border-radius: 5px;
    padding: 3px 4px;
    pointer-events: none;
  }
  .wx {
    position: absolute;
    top: 4px;
    left: 4px;
    z-index: 8;
    width: 21px;
    height: 21px;
    border-radius: 7px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(214, 84, 63, 0.16);
    border: 1px solid rgba(214, 84, 63, 0.5);
    color: #ff7a68;
    cursor: pointer;
    font-size: 12px;
  }
  .qbadge {
    position: absolute;
    bottom: 4px;
    right: 30px;
    z-index: 8;
    width: 21px;
    height: 21px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    cursor: pointer;
    font-size: 11px;
    background: rgba(245, 166, 35, 0.12);
    border: 1px solid rgba(245, 166, 35, 0.4);
    color: #6a6a72;
  }
  .qbadge.on {
    background: rgba(245, 166, 35, 0.22);
    border-color: #f5a623;
    color: #f5a623;
  }
  .vcyc {
    position: absolute;
    bottom: 4px;
    left: 4px;
    z-index: 8;
    display: flex;
    align-items: center;
    gap: 5px;
    height: 21px;
    padding: 0 8px;
    border-radius: 7px;
    background: rgba(53, 201, 214, 0.14);
    border: 1px solid rgba(53, 201, 214, 0.5);
    color: #9fe9ef;
    cursor: pointer;
    font: 700 9px/1 var(--font-mono);
  }
  .rsz {
    position: absolute;
    bottom: 2px;
    right: 2px;
    z-index: 8;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    padding: 4px;
    cursor: nwse-resize;
    background: transparent;
    border: 0;
    touch-action: none;
  }
  .selbg {
    position: absolute;
    inset: 0;
    z-index: 40;
  }
  .selmenu {
    position: absolute;
    z-index: 50;
    background: #161619;
    border: 1px solid #2e2e36;
    border-radius: 11px;
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.6);
    padding: 6px;
    max-height: 230px;
    overflow-y: auto;
  }
  .selopt {
    display: flex;
    align-items: center;
    padding: 9px 11px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    color: #cfcfd6;
  }
  .selopt.on {
    color: #7fd8de;
    background: rgba(53, 201, 214, 0.12);
  }
  .boardempty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #3c3c44;
    font-size: 13px;
    pointer-events: none;
  }
  .tray {
    flex: none;
    padding: 11px 14px 13px;
    border-top: 1px solid #1c1c22;
    background: linear-gradient(180deg, #101013, #0c0c0e);
  }
  .tray-h {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 9px;
  }
  .th-tag {
    font: 700 10px/1 var(--font-mono);
    letter-spacing: 0.1em;
    color: #6e6e78;
  }
  .th-note {
    font: 500 10px/1 var(--font-mono);
    color: #46464f;
  }
  .tray-row {
    display: flex;
    gap: 9px;
    overflow-x: auto;
    padding-bottom: 3px;
  }
  .traychip {
    flex: none;
    display: flex;
    align-items: center;
    gap: 9px;
    height: 46px;
    padding: 0 13px;
    background: #15151a;
    border: 1px solid #2a2a31;
    border-radius: 11px;
    cursor: pointer;
  }
  .traychip:hover {
    border-color: #35c9d6;
  }
  .tc-ic {
    width: 30px;
    height: 30px;
    flex: none;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    color: #7fd8de;
    background: #0e1718;
    border: 1px solid #234142;
  }
  .tc-txt {
    display: flex;
    flex-direction: column;
    gap: 3px;
    line-height: 1.2;
    text-align: left;
  }
  .tc-name {
    font-size: 13px;
    font-weight: 600;
    color: #e3e3e8;
    white-space: nowrap;
  }
  .tc-meta {
    font: 500 9px/1 var(--font-mono);
    color: #6e6e78;
  }
  .tc-plus {
    font-size: 16px;
    color: #56565e;
  }
  .tray-empty {
    display: flex;
    align-items: center;
    height: 46px;
    padding: 0 14px;
    color: #46464f;
    font-size: 12px;
  }

  /* live control search */
  .csearch {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    padding: 0 11px;
    border-radius: 10px;
    background: #0d0d10;
    border: 1px solid #26262c;
    color: #6a6a74;
    min-width: 140px;
  }
  .csearch.active {
    flex: 1;
    border-color: var(--accent, #35c9d6);
    color: var(--accent, #35c9d6);
  }
  .csin {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    outline: none;
    color: #ededf2;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
  }
  .csx {
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    border: 0;
    background: #1c1c21;
    color: #cfcfd6;
    cursor: pointer;
    font-size: 11px;
  }
  /* results = a flat wrap of control tiles (same look as the board cells), respecting each view */
  .results {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    width: 100%;
    align-content: flex-start;
  }
  .restile {
    flex: none;
    width: 118px;
    min-height: 112px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px;
    border-radius: 11px;
    background: linear-gradient(180deg, #17171c, #101015);
    border: 1px solid #212129;
    overflow: visible;
  }
  .restile.wide {
    width: 240px;
  }
  .restile.nobg {
    background: transparent;
    border-color: transparent;
  }
  .nores {
    width: 100%;
    padding: 30px 10px;
    text-align: center;
    color: #56565e;
    font-size: 13px;
  }
  .respop-bg {
    position: fixed;
    inset: 0;
    z-index: 9998;
  }
  .respop {
    position: fixed;
    z-index: 9999;
    max-height: 280px;
    overflow-y: auto;
    background: #161619;
    border: 1px solid #2e2e36;
    border-radius: 11px;
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.6);
    padding: 6px;
  }
</style>
