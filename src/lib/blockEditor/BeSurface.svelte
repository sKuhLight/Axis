<script lang="ts">
  // Block Editor surface (board model v2): the board of a block's controls with every page at once
  // (top strip or side stack), always fitted to the panel, plus the interim chrome around it — tab row
  // (search, page tabs, navigation / control-size toggles, layout profiles, Arrange), arrange bar and
  // "Add control" tray, value bubble, select popover, modifier flyout and the workbench pin paths.
  // All device reads / writes go through getEditorSurface() (live editor or offline convert buffer);
  // boards persist per block family, profile and device class (BeState → boardPersistence).
  import { untrack } from 'svelte';
  import { getEditorSurface } from '../editorSurface';
  import type { EQBand } from '../EQGraph.svelte';
  import ModifierFlyout from '../ModifierFlyout.svelte';
  import { idealIds } from '../layouts';
  import { surfGet, surfSet, surfRemove, surfRev } from '../surfaceStore.svelte';
  import { paramHelp, helpSlugForPack } from '../help';
  import { layoutVariantSig } from '../deviceLayoutBoard';
  import type { NamedParam } from '../types';
  import { AXIS_PIN_SELECTED_PARAMETERS_ACTION, AXIS_PARAMETER_SOURCE_EDGE_DROP_ACTION } from '../axis-workbench/axisParameterActions';
  import { axisParameterSourceFromEditorParamId } from '../axis-workbench/axisParameterSources';
  import {
    createParameterWidgetCommand,
    effectiveZoom,
    getOptionalWorkbenchContext,
    menuPositionFromPointer,
    panelWidgetZoneId,
    selectVisibleWidgetsByZone,
    serializeWorkbenchParameterSource,
    type WorkbenchMenuItem,
    type WorkbenchMenuPosition,
    type WorkbenchParameterSource
  } from '../workbench';
  import ContextMenu from '../workbench/svelte/ContextMenu.svelte';
  import { buildAxisPinMenuItems } from '../axis-workbench/pinMenu';
  import type { AxisPinTarget } from '../axis-workbench/pinTargets';
  import { axisBlockEditorModifierController } from '../axis-workbench/blockEditor/blockEditorModifierController';
  import BeBoard from './BeBoard.svelte';
  import BeControl from './BeControl.svelte';
  import { setBeHost, type BeGhost, type BeHost } from './beHost';
  import { BeState } from './beState.svelte';
  import { trackDeviceClass } from './deviceClass.svelte';
  import { effectiveNav, SIDE_NAV_MIN_W, type BeDensity, type BeNav } from './boardGeometry';
  import {
    addControl,
    addPage as addPageOp,
    BE_SPEC,
    isDivider,
    locate,
    MAXC,
    moveItem,
    pageItems,
    removeItem as removeItemOp,
    renamePage as renamePageOp,
    resizeItem,
    setView,
    tidy,
    type BeBoard as BoardModel,
    type BeControl as BeControlItem,
    type BeItem
  } from './boardModel';
  import { BLANK_PROFILE, DEFAULT_PROFILE } from './boardPersistence';
  import { buildCatalog, type BeCtl, type BeKind } from './catalog';
  import { buildCuratedBoardV2, buildDeviceLayoutBoardV2 } from './deviceLayoutBoardV2';
  import { exceedsPinHold, PIN_HOLD_MS, resolvePinTarget, type PinTarget } from './pinDrag';
  import {
    activeAfterScroll,
    dragNorm,
    DRAG_START_PX,
    dropCell,
    grabCell,
    highlightedPages,
    isPinnableKind,
    keySteps,
    layoutBoardPages,
    nextView,
    NUDGE_STEP,
    onDrawnItems,
    pagePinIds,
    resizeBy,
    sharedCell,
    waveBars,
    type BoardPage
  } from './boardView';
  import { formatCentre, formatFull, parseTyped, stepNorm } from './valueFormat';

  let {
    slug = '',
    accent = undefined,
    eqBands = [] as EQBand[],
    eqGainRange = 20,
    eqTitle = 'EQ',
    hideIds = [] as number[]
  }: { slug?: string; accent?: string; eqBands?: EQBand[]; eqGainRange?: number; eqTitle?: string; hideIds?: number[] } = $props();

  const editor = getEditorSurface();
  const workbench = getOptionalWorkbenchContext();
  const workbenchCanPin = $derived(!!workbench?.registry.hasAction(AXIS_PIN_SELECTED_PARAMETERS_ACTION));
  let rootEl = $state<HTMLElement | null>(null);

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  /** Visual / layout px of the editor (an ancestor CSS zoom, e.g. the Axis UI scale). */
  function zoom(): number {
    if (!rootEl) return 1;
    return effectiveZoom(rootEl.getBoundingClientRect().width, rootEl.offsetWidth);
  }

  // ── live data ──
  const knobById = $derived(new Map(editor.params.filter((p) => p.id != null).map((p) => [p.id as number, p])));
  const enumById = $derived(new Map(editor.enums.map((e) => [e.id, e])));
  const mons = $derived(editor.monitorsFor(editor.selected?.effectId ?? -1));
  const NWAVE = 110;
  const wave = $derived(waveBars(editor.looperWave?.wave, NWAVE));
  const wavePos = $derived(clamp01(editor.looperWave?.position ?? 0));
  // the catalog only cares whether (and as what) the block meters, not about every level poll
  const monRole = $derived(mons[0]?.role ?? null);
  const hasWave = $derived(wave.length > 0);
  // The catalog only changes with the block's parameter SET (ids, names, option counts), not with their
  // values, but a device parameter event replaces the params array. Keep the previous catalog (same
  // array, same entries) while its structure is unchanged, so the board, the page layouts and every
  // tile's derived values are not rebuilt per event; values still reach the tiles through the host.
  let catMemo: { sig: string; cat: BeCtl[] } | null = null;
  const catalog = $derived.by(() => {
    const next = buildCatalog({ params: editor.params, enums: editor.enums, eqBandCount: eqBands.length, eqTitle, hideIds, monitors: monRole ? [{ role: monRole }] : [], hasWave });
    const sig = JSON.stringify(next);
    if (catMemo && catMemo.sig === sig) return catMemo.cat;
    catMemo = { sig, cat: next };
    return next;
  });
  const catByKey = $derived(new Map(catalog.map((c) => [c.key, c])));
  const variantSig = $derived(layoutVariantSig(editor.blockLayout));

  // ── device class: one value for the board key AND every phone decision (chrome, arrange, hover) ──
  const dc = trackDeviceClass();
  const deviceClass = $derived(dc.current);
  const isPhone = $derived(deviceClass === 'phone');

  // ── board state + persistence (surface document; the pre-profile legacy board lived in localStorage) ──
  const legacyStorage = {
    get: (k: string): string | null => {
      try {
        return typeof localStorage === 'undefined' ? null : localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: () => {}
  };
  const be = new BeState({ get: surfGet, set: surfSet, remove: surfRemove }, legacyStorage);
  function deviceSeed(): BoardModel {
    return buildDeviceLayoutBoardV2(editor.blockLayout, catalog) ?? buildCuratedBoardV2(catalog, new Set(idealIds(editor.params)));
  }
  $effect(() => {
    const src = { slug, deviceClass, catalog, variantSig, deviceSeed, rev: surfRev() };
    untrack(() => {
      // a (re)load can swap the board under the scroll position: keep its stored page active until the
      // load effect below has brought it into view
      if (be.sync(src)) holdActive(400);
    });
  });

  // ── layout ──
  let bodyW = $state(0);
  let bodyH = $state(0);
  const prefs = $derived(be.prefs);
  const nav = $derived(effectiveNav(prefs.nav, bodyW));
  /** The Top / Side toggle only shows where the side navigation can take effect (or is the stored choice). */
  const navToggle = $derived(bodyW === 0 || bodyW >= SIDE_NAV_MIN_W || prefs.nav === 'side');
  const board = $derived(be.board);
  /** Items drawn per page: dividers, and controls whose key the catalog lists right now. */
  const pages = $derived.by<BoardPage[]>(() => {
    const b = board;
    if (!b) return [];
    return b.pageOrder.map((page) => ({ page, items: pageItems(b, page).filter((it) => isDivider(it) || catByKey.has(it.key)) }));
  });
  const layoutBase = $derived({ bodyW, bodyH, nav, density: prefs.density });
  const layouts = $derived(layoutBoardPages(pages, { ...layoutBase, editMode: be.editMode, frozenCell: be.frozenCell ?? undefined }));
  const liveCell = (): number | null => sharedCell(layoutBoardPages(pages, { ...layoutBase, editMode: false }));
  const layoutSig = $derived(
    nav + '|' + prefs.density + '|' + pages.map((p) => (layouts[p.page] ? `${layouts[p.page]!.c}:${layouts[p.page]!.W}:${layouts[p.page]!.H}` : '')).join(',')
  );

  // ── visible / active page ──
  let boardRef = $state<ReturnType<typeof BeBoard> | null>(null);
  let visible = $state<string[]>([]);
  let lockUntil = 0;
  /** Keep the active page for a moment: scroll reports meanwhile do not move it. Set synchronously
   *  BEFORE a change that moves the sections (navigation, control size, profile, reload), because the
   *  board reports what is in view before the effects that scroll the page back run. */
  function holdActive(ms: number) {
    lockUntil = Math.max(lockUntil, Date.now() + ms);
  }
  let flashPage = $state<string | null>(null);
  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  const active = $derived(board?.page ?? '');
  const highlight = $derived(highlightedPages(visible, active));

  // called from the board's measuring effect: untracked, so that effect depends on its sections only
  function onVisible(vis: string[]) {
    untrack(() => {
      if (vis.join('|') !== visible.join('|')) visible = vis;
      const b = be.board;
      if (!b) return;
      const next = activeAfterScroll(vis, b.page, Date.now(), lockUntil);
      if (next) be.setPage(next);
    });
  }
  function scrollSoon(page: string, smooth: boolean, lockMs: number) {
    holdActive(lockMs);
    requestAnimationFrame(() => boardRef?.scrollToPage(page, smooth));
  }
  function goPage(pg: string) {
    be.setPage(pg);
    sel = null;
    editingId = null;
    scrollSoon(pg, true, 800);
    flashPage = pg;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flashPage = null), 900);
  }
  // a fresh load (family / profile) brings its stored page into view
  $effect(() => {
    void be.loads;
    const pg = untrack(() => be.board?.page);
    if (pg) scrollSoon(pg, false, 400);
  });
  // a navigation switch keeps the current page in view
  let lastNav = '';
  $effect(() => {
    const n = nav;
    if (lastNav && n !== lastNav) {
      const pg = untrack(() => be.board?.page);
      if (pg) scrollSoon(pg, false, 500);
    }
    lastNav = n;
  });

  // ── arrange mode (interim) ──
  function setEdit(on: boolean) {
    if (on === be.editMode) return;
    // arranging widens every page to the full 24 cells: keep the current page in view across the switch
    const pg = be.board?.page;
    if (pg) scrollSoon(pg, false, 400);
    be.setEditMode(on, on ? liveCell() : null);
    drag = null;
    mv = null;
    rz = null;
    editingId = null;
    sel = null;
  }
  // arrange is a desktop affordance (never on the phone layout); a search shows live results instead
  $effect(() => {
    if (isPhone && be.editMode) untrack(() => setEdit(false));
  });
  let q = $state('');
  const searching = $derived(q.trim().length > 0);
  $effect(() => {
    if (searching && be.editMode) untrack(() => setEdit(false));
  });
  function setNav(n: BeNav) {
    holdActive(500);
    be.setPrefs({ nav: n });
    be.refreeze(liveCell());
  }
  function setDensity(d: BeDensity) {
    holdActive(500);
    be.setPrefs({ density: d });
    be.refreeze(liveCell());
  }

  // ── search results (flat, live, each control in its configured view) ──
  const matches = $derived.by(() => {
    const s = q.trim().toLowerCase();
    return s ? catalog.filter((c) => c.kind !== 'eq' && c.label.toLowerCase().includes(s)) : [];
  });
  const viewByKey = $derived.by(() => {
    const m = new Map<string, BeControlItem['view']>();
    const b = board;
    if (b) for (const pg of b.pageOrder) for (const it of pageItems(b, pg)) if (!isDivider(it) && !m.has(it.key)) m.set(it.key, it.view);
    return m;
  });
  function resultItem(c: BeCtl): BeControlItem {
    const view = viewByKey.get(c.key) ?? c.view;
    const sp = BE_SPEC[view];
    return { id: 'res:' + c.key, key: c.key, view, x: 0, y: 0, w: sp.w, h: sp.h };
  }

  // ── parameter help on hover (status bar) ──
  let helpToken = 0;
  async function showParamHelp(id: number, label: string) {
    const token = ++helpToken;
    editor.setHint(label);
    const h = await paramHelp(helpSlugForPack(slug), id);
    if (token !== helpToken) return;
    editor.setHint(h ? `${label} — ${h.blurb}${h.tip ? '  ·  Tip: ' + h.tip : ''}` : label);
  }
  function clearParamHelp() {
    helpToken++;
    editor.clearHint();
  }

  // ── values ──
  function setNorm(pid: number, n: number) {
    const p = knobById.get(pid);
    if (p) editor.setParam(p, clamp01(n));
  }
  let editingId = $state<string | null>(null);
  let editBuf = $state('');
  /** The text the input was opened with: committing it unchanged writes nothing. */
  let editInit = '';
  let tip = $state<{ pid: number; cx: number; cy: number } | null>(null);
  let adjusting = false;
  function tipAt(el: HTMLElement, pid: number) {
    const r = el.getBoundingClientRect();
    const z = zoom();
    tip = { pid, cx: (r.left + r.width / 2) / z, cy: r.top / z };
  }
  function startType(itemId: string, ctl: BeCtl) {
    if (be.editMode || ctl.kind !== 'cont') return;
    const p = knobById.get(ctl.id);
    editBuf = p ? formatCentre(p) : '';
    editInit = editBuf;
    editingId = itemId;
    tip = null;
  }
  function commitType(itemId: string, ctl: BeCtl) {
    if (editingId !== itemId) return;
    const p = knobById.get(ctl.id);
    const text = editBuf.trim();
    editingId = null;
    if (!p || text === editInit.trim()) return; // opened and left as shown (click, then click away): no write
    const n = parseTyped(p, text);
    if (n != null) setNorm(ctl.id, n); // invalid input keeps the old value
  }

  // gestures (plain refs; not reactive)
  type ValueDrag = { pid: number; itemId: string; sx: number; sy: number; ly: number; n: number; moved: boolean; clickVal: boolean; ctl: BeCtl };
  let vd: ValueDrag | null = null;
  let tk: { pid: number; rect: DOMRect; vertical: boolean } | null = null;
  let mv: { id: string; fromPage: string; w: number; h: number; grab: { cx: number; cy: number }; sx: number; sy: number; started: boolean } | null = null;
  let rz: { id: string; sx: number; sy: number; ow: number; oh: number; step: number; z: number; before: BoardModel; changed: boolean } | null = null;
  let drag = $state<{ id: string; target: BeGhost | null } | null>(null);

  function tileDown(e: PointerEvent, item: BeItem, ctl: BeCtl | undefined, page: string, tile: HTMLElement) {
    if (be.editMode) {
      if (!page || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const grid = tile.closest<HTMLElement>('[data-be-grid]');
      if (!grid) return;
      const c = Number(grid.dataset.c);
      const g = Number(grid.dataset.g);
      const gr = grid.getBoundingClientRect();
      const z = effectiveZoom(gr.width, grid.offsetWidth);
      mv = { id: item.id, fromPage: page, w: item.w, h: item.h, grab: grabCell(e.clientX, e.clientY, tile.getBoundingClientRect(), z, c + g, item), sx: e.clientX, sy: e.clientY, started: false };
      return;
    }
    if (!ctl || ctl.kind !== 'cont' || isDivider(item) || (item.view !== 'knob' && item.view !== 'number')) return;
    if (e.button !== 0 || editingId === item.id) return;
    e.stopPropagation();
    vd = {
      pid: ctl.id,
      itemId: item.id,
      sx: e.clientX,
      sy: e.clientY,
      ly: e.clientY,
      n: knobById.get(ctl.id)?.norm ?? 0,
      moved: false,
      clickVal: !!(e.target as HTMLElement | null)?.closest?.('[data-be-value]'),
      ctl
    };
    adjusting = true;
    tipAt(tile.querySelector<HTMLElement>('.be-dial, .be-nval') ?? tile, ctl.id);
  }
  function trackDown(e: PointerEvent, ctl: BeCtl, vertical: boolean) {
    if (be.editMode || e.button !== 0) return;
    e.stopPropagation();
    tk = { pid: ctl.id, rect: (e.currentTarget as HTMLElement).getBoundingClientRect(), vertical };
    trackMove(e);
  }
  function trackMove(e: PointerEvent) {
    const t = tk;
    if (!t) return;
    const frac = t.vertical ? 1 - (e.clientY - t.rect.top) / t.rect.height : (e.clientX - t.rect.left) / t.rect.width;
    setNorm(t.pid, clamp01(frac));
  }
  function valueKey(e: KeyboardEvent, ctl: BeCtl, itemId: string) {
    if (be.editMode || (e.target as HTMLElement | null)?.tagName === 'INPUT') return;
    if (e.key === 'Enter') {
      e.preventDefault();
      startType(itemId, ctl);
      return;
    }
    const steps = keySteps(e.key);
    const p = knobById.get(ctl.id);
    if (steps == null || !p) return;
    e.preventDefault();
    e.stopPropagation();
    setNorm(ctl.id, stepNorm(p, steps, e.shiftKey));
  }

  // ── arrange gestures (interim) ──
  function dropTargetAt(px: number, py: number): BeGhost | null {
    const m = mv;
    const b = be.board;
    if (!m || !b || !rootEl || typeof document === 'undefined') return null;
    let grid: HTMLElement | null = null;
    for (const el of document.elementsFromPoint(px, py)) {
      const g = el.closest<HTMLElement>('[data-be-grid]');
      if (g && rootEl.contains(g)) {
        grid = g;
        break;
      }
    }
    if (!grid) return null;
    const d = grid.dataset;
    const page = d.page ?? '';
    const r = grid.getBoundingClientRect();
    const hit = { left: r.left, top: r.top, zoom: effectiveZoom(r.width, grid.offsetWidth), c: Number(d.c), g: Number(d.g), cols: Number(d.cols), rows: Number(d.rows) };
    const { x, y } = dropCell(px, py, hit, m, m.grab);
    return { page, x, y, w: m.w, h: m.h, valid: drawnOp(b, (d) => moveItem(d, m.id, page, x, y)).ok };
  }
  /** Items drawn right now: dividers, and controls whose key the catalog lists. */
  const isDrawn = (it: BeItem): boolean => isDivider(it) || catByKey.has(it.key);
  /** Arrange operations see only drawn items: a kept, not-drawn control blocks no cells. */
  function drawnOp<R extends { board: BoardModel; ok: boolean }>(b: BoardModel, op: (d: BoardModel) => R): R {
    return onDrawnItems(b, isDrawn, op);
  }
  /** Gravity-tidy the given pages (Auto-pack). */
  function tidyPages(b: BoardModel, pgs: string[]): BoardModel {
    return drawnOp(b, (d) => {
      let out = d;
      for (const pg of new Set(pgs)) {
        const list = pageItems(out, pg);
        const t = tidy(list);
        if (t !== list) out = { ...out, boards: { ...out.boards, [pg]: t } };
      }
      return { board: out, ok: true };
    }).board;
  }
  function resizeDown(e: PointerEvent, id: string, tile: HTMLElement) {
    const b = be.board;
    if (!be.editMode || !b || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const f = locate(b, id);
    const grid = tile.closest<HTMLElement>('[data-be-grid]');
    if (!f || !grid) return;
    const r = grid.getBoundingClientRect();
    rz = { id, sx: e.clientX, sy: e.clientY, ow: f.item.w, oh: f.item.h, step: Number(grid.dataset.c) + Number(grid.dataset.g), z: effectiveZoom(r.width, grid.offsetWidth), before: b, changed: false };
  }
  function cancelGestures() {
    vd = null;
    tk = null;
    adjusting = false;
    if (tip) tip = null;
    if (mv) {
      mv = null;
      drag = null;
    }
    if (rz) {
      if (rz.changed) be.preview(rz.before);
      rz = null;
    }
    if (pinDrag) pinDrag = null;
    cancelPinHold();
  }

  $effect(() => {
    const onMove = (e: PointerEvent) => {
      if (pinDrag) {
        e.preventDefault();
        pinDrag = { ...pinDrag, x: e.clientX, y: e.clientY, target: resolvePinTarget(e.clientX, e.clientY) };
        return;
      }
      if (pinHold && exceedsPinHold(pinHold.x, pinHold.y, e.clientX, e.clientY)) cancelPinHold(); // early movement = value adjust
      if (mv) {
        if (!mv.started) {
          if (Math.abs(e.clientX - mv.sx) + Math.abs(e.clientY - mv.sy) < DRAG_START_PX) return;
          mv.started = true;
        }
        e.preventDefault();
        drag = { id: mv.id, target: dropTargetAt(e.clientX, e.clientY) };
        boardRef?.autoScroll(e.clientX, e.clientY);
        return;
      }
      if (rz) {
        e.preventDefault();
        const b = be.board;
        const f = b && locate(b, rz.id);
        if (!b || !f) return;
        const s = resizeBy({ w: rz.ow, h: rz.oh }, e.clientX - rz.sx, e.clientY - rz.sy, rz.step, rz.z);
        const id = rz.id;
        const r = drawnOp(b, (d) => resizeItem(d, id, Math.min(s.w, MAXC - f.item.x), s.h));
        if (r.ok && r.board !== b) {
          be.preview(r.board);
          rz.changed = true;
        }
        return;
      }
      if (tk) {
        e.preventDefault();
        trackMove(e);
        return;
      }
      if (vd) {
        if (!vd.moved && Math.abs(e.clientY - vd.sy) + Math.abs(e.clientX - vd.sx) < 3) return;
        vd.moved = true;
        e.preventDefault();
        vd.n = dragNorm(vd.n, vd.ly - e.clientY, e.shiftKey);
        vd.ly = e.clientY;
        setNorm(vd.pid, vd.n);
      }
    };
    const onUp = () => {
      if (pinDrag) {
        const pin = pinDrag;
        pinDrag = null;
        cancelPinHold();
        dropPin(pin);
        suppressNextClick();
        return;
      }
      cancelPinHold(); // a press that never became a drag must clear the pending hold timer
      if (mv) {
        const m = mv;
        const t = drag?.target;
        mv = null;
        drag = null;
        const b = be.board;
        if (m.started && t?.valid && b) {
          const r = drawnOp(b, (d) => moveItem(d, m.id, t.page, t.x, t.y));
          if (r.ok) be.commit(be.autoPack ? tidyPages(r.board, [m.fromPage, t.page]) : r.board);
        }
      }
      if (rz) {
        const r = rz;
        rz = null;
        const b = be.board;
        if (r.changed && b) {
          const f = locate(b, r.id);
          const next = be.autoPack && f ? tidyPages(b, [f.page]) : b;
          if (next !== b) be.commit(next);
          else be.flush();
        }
      }
      tk = null;
      if (vd) {
        const v = vd;
        vd = null;
        adjusting = false;
        if (tip) tip = null;
        if (!v.moved && v.clickVal) startType(v.itemId, v.ctl);
      }
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cancelGestures);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', cancelGestures);
    };
  });

  // ── arrange actions (interim) ──
  function commitOp(r: { board: BoardModel; ok: boolean }) {
    if (r.ok) be.commit(r.board);
  }
  function removeTile(id: string) {
    const b = be.board;
    if (b) commitOp(removeItemOp(b, id));
  }
  function cycleView(id: string) {
    const b = be.board;
    const f = b && locate(b, id);
    if (!b || !f || isDivider(f.item)) return;
    const c = catByKey.get(f.item.key);
    if (!c || c.views.length < 2) return;
    const view = nextView(c.views, f.item.view);
    const r = drawnOp(b, (d) => setView(d, id, view));
    commitOp(r);
    if (r.ok && r.moved) editor.showToast('Moved to the next free spot to fit', 'var(--textdim)');
  }
  function tidyUp() {
    const b = be.board;
    if (!b) return;
    be.commit(tidyPages(b, [b.page]));
    editor.showToast('Board tidied', 'var(--accent)');
  }
  function addPage() {
    const b = be.board;
    if (!b) return;
    const r = addPageOp(b);
    be.commit(r.board);
    scrollSoon(r.page, true, 800);
  }
  let renamingPage = $state<string | null>(null);
  function renamePage(from: string, raw: string) {
    renamingPage = null;
    const b = be.board;
    if (!b) return;
    const r = renamePageOp(b, from, raw);
    if (r.ok) be.commit(r.board);
    else if (r.reason === 'duplicate') editor.showToast(`A page called “${raw.trim()}” already exists`, 'var(--danger)');
  }
  function focusEl(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
  const onPageKeys = $derived(new Set(board ? pageItems(board, board.page).flatMap((it) => (isDivider(it) ? [] : [it.key])) : []));
  const tray = $derived(catalog.filter((c) => !onPageKeys.has(c.key)));
  const TRAY_ICON: Record<string, string> = { knob: '◉', fader: '⇕', slider: '⇔', number: '#', button: '⏻', switch: '⊙', select: '▾', eq: '∿', action: '⏼', meter: '▊', wave: '⌇' };
  let trayEl = $state<HTMLElement | null>(null);
  // one row of chips: a vertical wheel scrolls it sideways
  $effect(() => {
    const node = trayEl;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY) || node.scrollWidth <= node.clientWidth + 1) return;
      e.preventDefault();
      node.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 16 : 1);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  });
  function trayAdd(c: BeCtl) {
    const b = be.board;
    if (!b) return;
    const r = drawnOp(b, (d) => addControl(d, b.page, { key: c.key, view: c.view }));
    if (r.ok) be.commit(be.autoPack ? tidyPages(r.board, [b.page]) : r.board);
    else editor.showToast('No room for that control here', 'var(--danger)');
  }

  // ── layout profiles (Default = device-authentic, Blank, custom copies) ──
  let profMenuOpen = $state(false);
  let profMenuPos = $state<{ top: number; right: number } | null>(null);
  function toggleProfMenu(e: MouseEvent) {
    if (profMenuOpen) {
      profMenuOpen = false;
      return;
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const z = zoom();
    profMenuPos = { top: (r.bottom + 4) / z, right: Math.max(8, (window.innerWidth - r.right) / z) };
    profMenuOpen = true;
  }
  function setProfile(name: string) {
    profMenuOpen = false;
    holdActive(400);
    be.setProfile(name);
  }
  function addProfile() {
    profMenuOpen = false;
    holdActive(400);
    be.addProfile();
  }
  function deleteProfile(name: string) {
    holdActive(400);
    be.deleteProfile(name);
  }
  function resetToDevice() {
    profMenuOpen = false;
    holdActive(400);
    be.resetToDevice();
  }

  // ── select popover: measured from the trigger, zoom-safe, closes on reflow / scroll ──
  let sel = $state<{ id: string; enumId: number; left: number; top: number; width: number; up: boolean } | null>(null);
  const selEnum = $derived(sel ? enumById.get(sel.enumId) : undefined);
  function openSelect(e: MouseEvent, itemId: string, ctl: BeCtl) {
    if (be.editMode) return;
    if (sel?.id === itemId) {
      sel = null;
      return;
    }
    const t = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const z = zoom();
    const below = window.innerHeight - t.bottom;
    const up = below < 240 && t.top > below;
    sel = { id: itemId, enumId: ctl.id, left: t.left / z, top: (up ? t.top - 2 : t.bottom + 2) / z, width: Math.max(t.width / z, 160), up };
  }
  $effect(() => {
    void layoutSig;
    untrack(() => {
      sel = null;
    });
  });
  function onBoardScroll() {
    if (sel) sel = null;
    if (tip && !adjusting) tip = null;
  }

  // ── modifier (∿): the docked modifier panel when one is mounted, else the flyout ──
  let modOpen = $state(false);
  let modLabel = $state('');
  let modTargetEid = $state<number | null>(null);
  let modTargetParam = $state<number | null>(null);
  function openMod(c: BeCtl) {
    if (be.editMode) return;
    const targetEid = editor.selected?.effectId ?? null;
    const blockName = editor.selected?.display ?? 'Block';
    if (axisBlockEditorModifierController.modPartMounted) {
      axisBlockEditorModifierController.targetParameter({ label: c.label, block: blockName, targetEffectId: targetEid, targetParam: c.id, slot: 1 });
      editor.showToast(`∿ ${c.label} → Modifier panel`, 'var(--amber)');
      return;
    }
    modLabel = c.label;
    modTargetParam = c.id;
    modTargetEid = targetEid;
    modOpen = true;
  }

  // ── looper transport (record/play/overdub/reverse/half latch; stop/undo are momentary) ──
  const LOOP_MOMENTARY = new Set(['stop', 'undo']);
  let loopLatch = $state<Record<string, boolean>>({});
  function pressLoop(action: string) {
    if (be.editMode) return;
    if (LOOP_MOMENTARY.has(action)) {
      editor.looperControl(action, true);
      return;
    }
    const next = !loopLatch[action];
    loopLatch = { ...loopLatch, [action]: next };
    editor.looperControl(action, next);
  }

  // ── pin to the workbench ──
  const pinnable = (c: BeCtl | undefined): c is BeCtl => !!c && isPinnableKind(c);
  function parameterSourceForControl(c: BeCtl): WorkbenchParameterSource | null {
    if (!pinnable(c)) return null;
    return axisParameterSourceFromEditorParamId({ selected: editor.selected, params: editor.params, enums: editor.enums }, c.id);
  }
  /** Glyph (18 px) that recalls the control's kind on the drag chip; drawn in the current text colour. */
  function paramChipGlyph(kind: BeKind): string {
    if (kind === 'toggle') {
      return `<svg width="20" height="18" viewBox="0 0 40 24" aria-hidden="true"><rect x="2" y="4" width="36" height="16" rx="8" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="28" cy="12" r="6" fill="currentColor"/></svg>`;
    }
    if (kind === 'select') {
      return `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h13 M4 12h13 M4 17h9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
    }
    return `<svg width="18" height="18" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="40 100" transform="rotate(135 16 16)"/><circle cx="16" cy="16" r="2.4" fill="currentColor"/></svg>`;
  }
  async function pinControlToWorkbench(c: BeCtl, target?: AxisPinTarget) {
    if (!workbenchCanPin || !workbench || !pinnable(c)) return;
    const result = await workbench.registry.runActionResult(AXIS_PIN_SELECTED_PARAMETERS_ACTION, {
      controller: workbench.controller,
      source: 'menu',
      args: { paramId: c.id, title: c.label, ...(target?.panelId ? { panelId: target.panelId } : {}) }
    });
    if (result.success) editor.showToast(`Pinned ${c.label}${target?.panelId ? ` to ${target.label}` : ''}`, 'var(--accent)');
  }

  // hold-to-drag pin (mouse / pen): a still hold arms a pointer drag onto a panel, tab bar or dock edge
  let pinHold: { c: BeCtl; x: number; y: number } | null = null;
  let pinHoldTimer: ReturnType<typeof setTimeout> | null = null;
  let pinDrag = $state<{ c: BeCtl; source: WorkbenchParameterSource; x: number; y: number; target: PinTarget | null } | null>(null);
  let pinLayerEl = $state<HTMLElement | null>(null);
  // the fixed layer's px are layout px under an ancestor zoom while pointer coords are visual
  const pinZoom = $derived.by(() => {
    void pinDrag;
    if (!pinLayerEl || !pinLayerEl.offsetWidth) return 1;
    const visual = pinLayerEl.getBoundingClientRect().width;
    return visual > 0 ? visual / pinLayerEl.offsetWidth : 1;
  });
  function pinArm(e: PointerEvent, c: BeCtl) {
    if (!workbenchCanPin || be.editMode || !pinnable(c)) return;
    if (e.pointerType === 'touch' || e.button !== 0) return; // touch = long-press menu
    pinHold = { c, x: e.clientX, y: e.clientY };
    if (pinHoldTimer) clearTimeout(pinHoldTimer);
    pinHoldTimer = setTimeout(() => {
      pinHoldTimer = null;
      if (pinHold && !pinDrag) startPinDrag();
    }, PIN_HOLD_MS);
  }
  function cancelPinHold() {
    if (pinHoldTimer) {
      clearTimeout(pinHoldTimer);
      pinHoldTimer = null;
    }
    pinHold = null;
  }
  // no timer outlives the editor (a hold that crosses a block switch must not fire on a gone instance)
  $effect(() => () => {
    cancelPinHold();
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = null;
  });
  function startPinDrag() {
    if (!pinHold) return;
    const c = pinHold.c;
    const source = parameterSourceForControl(c);
    if (!source) {
      pinHold = null;
      return;
    }
    // the same press armed a value adjust + bubble: drop them (nothing was written yet)
    vd = null;
    tk = null;
    adjusting = false;
    if (tip) tip = null;
    pinDrag = { c, source, x: pinHold.x, y: pinHold.y, target: resolvePinTarget(pinHold.x, pinHold.y) };
    pinHold = null;
  }
  function dropPin(pin: { c: BeCtl; source: WorkbenchParameterSource; target: PinTarget | null }) {
    const { c, source, target } = pin;
    if (!workbench || !target) return;
    if (target.kind === 'panel') {
      const zone = panelWidgetZoneId(target.panelId);
      const index = selectVisibleWidgetsByZone(workbench.controller.document, zone).length;
      const command = createParameterWidgetCommand(workbench.controller.document, source, { zone, index });
      if (command) {
        workbench.controller.dispatch(command);
        editor.showToast(`Pinned ${c.label}`, 'var(--accent)');
      }
      return;
    }
    const serialized = serializeWorkbenchParameterSource(source);
    const args =
      target.kind === 'tab'
        ? { source: serialized, tabStackId: target.tabStackId, index: target.index, ...(target.region ? { region: target.region } : {}) }
        : { source: serialized, region: target.region };
    void workbench.registry.runActionResult(AXIS_PARAMETER_SOURCE_EDGE_DROP_ACTION, { controller: workbench.controller, source: 'host', args }).then((res) => {
      if (res.success) editor.showToast(`Pinned ${c.label}`, 'var(--accent)');
    });
  }
  // a hold-drag on a clickable control must not also activate it on release
  function suppressNextClick() {
    if (typeof window === 'undefined') return;
    const swallow = (ev: MouseEvent) => {
      ev.stopPropagation();
      ev.preventDefault();
      window.removeEventListener('click', swallow, true);
    };
    window.addEventListener('click', swallow, true);
    setTimeout(() => window.removeEventListener('click', swallow, true), 350);
  }

  // touch / right-click pin menu
  let pinMenuOpen = $state(false);
  let pinMenuPos = $state<WorkbenchMenuPosition>({ x: 0, y: 0 });
  let pinMenuCtl = $state<BeCtl | null>(null);
  const pinMenuItems = $derived.by<WorkbenchMenuItem[]>(() => {
    if (!pinMenuOpen || !workbench || !pinMenuCtl) return [];
    const c = pinMenuCtl;
    return buildAxisPinMenuItems(workbench.controller.document, (target) => void pinControlToWorkbench(c, target));
  });
  function openPinMenuAt(c: BeCtl, pos: WorkbenchMenuPosition) {
    if (!workbenchCanPin || !pinnable(c)) return;
    pinMenuCtl = c;
    pinMenuPos = pos;
    pinMenuOpen = true;
  }
  function closePinMenu() {
    pinMenuOpen = false;
    pinMenuCtl = null;
  }
  async function pinPageToWorkbench() {
    const b = be.board;
    if (!workbenchCanPin || !workbench || !b) return;
    const paramIds = pagePinIds(pages.find((p) => p.page === b.page)?.items ?? [], catByKey);
    if (!paramIds.length) return;
    const block = editor.selected?.display ?? 'Block';
    const result = await workbench.registry.runActionResult(AXIS_PIN_SELECTED_PARAMETERS_ACTION, {
      controller: workbench.controller,
      source: 'host',
      args: { paramIds, title: `${block} Controls` }
    });
    if (result.success) editor.showToast(`Pinned ${paramIds.length} controls`, 'var(--accent)');
  }

  // ── the tiles' host ──
  const host: BeHost = {
    get editMode() {
      return be.editMode;
    },
    get isPhone() {
      return isPhone;
    },
    get accent() {
      return accent ?? '';
    },
    get editingId() {
      return editingId;
    },
    get editBuf() {
      return editBuf;
    },
    set editBuf(v: string) {
      editBuf = v;
    },
    get openSelectId() {
      return sel?.id ?? null;
    },
    get dragId() {
      return drag?.id ?? null;
    },
    get canPin() {
      return workbenchCanPin;
    },
    get eqBands() {
      return eqBands;
    },
    get eqGainRange() {
      return eqGainRange;
    },
    get bypassed() {
      return !!editor.selected?.bypassed;
    },
    get mons() {
      return mons;
    },
    get wave() {
      return wave;
    },
    get wavePos() {
      return wavePos;
    },
    get waveLevel() {
      return editor.looperWave?.level ?? null;
    },
    knob: (id) => knobById.get(id),
    enm: (id) => enumById.get(id),
    loopOn: (a) => !!loopLatch[a],
    isSwipe: (id) => editor.isSwipeControl(id),
    tileDown,
    trackDown,
    valueKey,
    startType,
    commitType,
    cancelType: () => (editingId = null),
    nudge: (c, dir) => setNorm(c.id, (knobById.get(c.id)?.norm ?? 0) + dir * NUDGE_STEP),
    toggle: (c) => {
      const e = enumById.get(c.id);
      if (!e) return;
      const off = e.options[0]?.value ?? 0;
      const on = e.options[1]?.value ?? 1;
      editor.setEnum(e, e.value === on ? off : on);
    },
    openSelect,
    bypass: () => void editor.toggleBypass(),
    loop: pressLoop,
    eqSet: (p: NamedParam, n: number) => editor.setParam(p, n),
    tipShow: (el, c) => {
      if (!isPhone && !be.editMode && c.kind === 'cont') tipAt(el, c.id);
    },
    tipHide: () => {
      if (!adjusting) tip = null;
    },
    hover: (c) => {
      if (!isPhone && !be.editMode && c.id >= 0) void showParamHelp(c.id, c.label);
    },
    unhover: clearParamHelp,
    openMod,
    pinArm,
    pinMenu: (e, c) => {
      if (!workbenchCanPin || !pinnable(c)) return;
      e.preventDefault();
      openPinMenuAt(c, menuPositionFromPointer(e));
    },
    pinLongPress: (c, at) => openPinMenuAt(c, at),
    pinnable,
    remove: removeTile,
    cycleView,
    resizeDown,
    toggleSwipe: (c) => {
      const p = knobById.get(c.id);
      if (p) editor.toggleSwipeControl(p);
    },
    pinToWorkbench: (c) => void pinControlToWorkbench(c)
  };
  setBeHost(host);

  const tipValue = $derived(tip ? knobById.get(tip.pid) : undefined);
  const RESULT_CELL = 40;
  const RESULT_GAP = 4;
</script>

<div class="be-root" class:phone={isPhone} bind:this={rootEl}>
  <!-- tab row: search, page tabs, navigation / control size, layout profile, arrange (interim chrome) -->
  <div class="be-tabs">
    <div class="be-search" class:active={searching}>
      <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M10.8 10.8 L14.5 14.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
      <input class="be-searchin" placeholder="Find a control…" aria-label="Find a control" bind:value={q} />
      {#if searching}<button class="be-searchx" type="button" aria-label="Clear search" onclick={() => (q = '')}>✕</button>{/if}
    </div>
    {#if !searching}
      {#if board}
        <div class="be-pagetabs" role="tablist" aria-label="Pages">
          {#each board.pageOrder as pg (pg)}
            {#if renamingPage === pg}
              <input
                class="be-tab edit"
                value={pg}
                aria-label="Page name"
                use:focusEl
                onkeydown={(e) => (e.key === 'Enter' ? e.currentTarget.blur() : e.key === 'Escape' ? (renamingPage = null) : null)}
                onblur={(e) => (renamingPage === pg ? renamePage(pg, e.currentTarget.value) : null)}
              />
            {:else}
              <button
                class="be-tab"
                class:on={pg === board.page}
                class:vis={highlight.has(pg)}
                type="button"
                role="tab"
                aria-selected={pg === board.page}
                data-be-tab={pg}
                data-visible={highlight.has(pg) ? 'true' : 'false'}
                data-active={pg === board.page ? 'true' : 'false'}
                title={be.editMode ? 'Double-click to rename' : `Show ${pg}`}
                onclick={() => goPage(pg)}
                ondblclick={() => be.editMode && (renamingPage = pg)}>{pg}</button
              >
            {/if}
          {/each}
          {#if be.editMode}
            <button class="be-tab add" type="button" title="Add page" aria-label="Add page" onclick={addPage}>＋</button>
          {/if}
        </div>
      {/if}
      <span class="be-tabsp"></span>
      {#if navToggle}
      <div class="be-seg" role="group" aria-label="Page navigation">
        <button type="button" class:on={prefs.nav === 'top'} data-be-nav="top" aria-pressed={prefs.nav === 'top'} title="Pages side by side" onclick={() => setNav('top')}>Top</button>
        <button
          type="button"
          class:on={prefs.nav === 'side'}
          data-be-nav="side"
          aria-pressed={prefs.nav === 'side'}
          title={nav === 'side' || prefs.nav !== 'side' ? 'Pages stacked' : 'Pages stacked — needs a wider editor'}
          onclick={() => setNav('side')}>Side</button
        >
      </div>
      {/if}
      <div class="be-seg" role="group" aria-label="Control size">
        {#each ['s', 'm', 'l'] as const as d (d)}
          <button type="button" class:on={prefs.density === d} data-be-density={d} aria-pressed={prefs.density === d} title={d === 's' ? 'Compact' : d === 'm' ? 'Normal' : 'Large'} onclick={() => setDensity(d)}>{d.toUpperCase()}</button>
        {/each}
      </div>
      <div class="be-profwrap">
        <button class="be-profbtn" class:on={profMenuOpen} type="button" title="Layout profile" onclick={toggleProfMenu}>
          <span class="be-profic">▤</span><span class="be-profname">{be.profile}</span><span class="be-profcaret">▾</span>
        </button>
      </div>
      {#if !isPhone}
        <button class="be-arrange" class:on={be.editMode} type="button" data-be-arrange title="Lock = use · Unlock = arrange" onclick={() => setEdit(!be.editMode)}>
          <span>{be.editMode ? '🔓' : '🔒'}</span>{be.editMode ? 'Arranging' : 'Arrange'}
        </button>
      {/if}
    {/if}
  </div>

  {#if searching}
    <!-- live search results: every matching control, flat, each in its configured view -->
    <div class="be-results">
      {#each matches as c (c.key)}
        {@const it = resultItem(c)}
        <BeControl item={it} ctl={c} pos={it} c={RESULT_CELL} g={RESULT_GAP} standalone />
      {/each}
      {#if matches.length === 0}<div class="be-nores">No controls match “{q}”.</div>{/if}
    </div>
  {:else}
    {#if be.editMode}
      <div class="be-arrbar">
        <span class="be-abtag">✥ ARRANGE</span>
        {#if !isPhone}<span class="be-abnote">a page is 12 controls wide · drag tiles to any free spot · ⌟ resizes</span>{/if}
        <span class="be-absp"></span>
        {#if workbenchCanPin}
          <button class="be-abbtn" type="button" title="Pin this page to a Workbench custom panel" onclick={pinPageToWorkbench}>⌖ Pin page</button>
        {/if}
        <button class="be-abbtn" class:on={be.autoPack} type="button" data-be-autopack aria-pressed={be.autoPack} title="Tidy the page after every move or resize" onclick={() => be.setAutoPack(!be.autoPack)}>
          {be.autoPack ? '⊞ Auto-pack' : '⊡ Free'}
        </button>
        <button class="be-abbtn" type="button" onclick={tidyUp}>⤢ Tidy up</button>
      </div>
    {/if}

    <div class="be-body">
      <BeBoard
        bind:this={boardRef}
        {pages}
        {layouts}
        {nav}
        editMode={be.editMode}
        {highlight}
        {active}
        {flashPage}
        catalog={catByKey}
        ghost={drag?.target ?? null}
        dragging={!!drag}
        canArrange={!isPhone}
        onMeasure={(w, h) => {
          bodyW = w;
          bodyH = h;
        }}
        {onVisible}
        onScroll={onBoardScroll}
        onBackgroundDown={() => {
          if (tip && !adjusting) tip = null;
        }}
        onArrange={() => setEdit(true)}
      />
    </div>

    {#if be.editMode}
      <div class="be-tray">
        <span class="be-traytag" title="Tap a control to drop it into the first free slot of this page">ADD</span>
        <div class="be-trayrow" bind:this={trayEl}>
          {#each tray as t (t.key)}
            <button class="be-traychip" type="button" data-be-add={t.key} title="Add {t.label} to {board?.page ?? 'this page'}" onclick={() => trayAdd(t)}>
              <span class="be-tcic">{TRAY_ICON[t.view] ?? '＋'}</span>
              <span class="be-tctxt"><span class="be-tcname">{t.label}</span><span class="be-tcmeta">{t.kind} · {t.w}×{t.h}</span></span>
            </button>
          {/each}
          {#if tray.length === 0}<div class="be-trayempty">All controls are on this page.</div>{/if}
        </div>
      </div>
    {/if}
  {/if}
</div>

<!-- layout profile menu (fixed: escapes the tab row's clipping) -->
{#if profMenuOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="be-profmenu" style:top="{profMenuPos?.top ?? 100}px" style:right="{profMenuPos?.right ?? 8}px" onpointerleave={() => (profMenuOpen = false)}>
    {#each be.profileNames as p (p)}
      <div class="be-profitem-row">
        <button class="be-profitem" class:on={p === be.profile} type="button" onclick={() => setProfile(p)}>
          <span class="be-piname">{p === DEFAULT_PROFILE ? '✦ Default' : p === BLANK_PROFILE ? '▢ Blank' : p}</span>
          {#if p === DEFAULT_PROFILE}<span class="be-pihint">device</span>{/if}
        </button>
        {#if p !== DEFAULT_PROFILE && p !== BLANK_PROFILE}
          <button class="be-pidel" type="button" title="Delete layout" aria-label="Delete layout {p}" onclick={() => deleteProfile(p)}>✕</button>
        {/if}
      </div>
    {/each}
    <div class="be-profsep"></div>
    <button class="be-profitem act" type="button" onclick={addProfile}>＋ New layout (copy)</button>
    <button class="be-profitem act" type="button" title="Discard customization, reseed from the device layout" onclick={resetToDevice}>↺ Reset to device</button>
  </div>
{/if}

<!-- value bubble: full value with unit, above everything -->
{#if tip}
  <div class="be-tip" style:left="{tip.cx}px" style:top="{tip.cy}px">{tipValue ? formatFull(tipValue) : '–'}</div>
{/if}

<!-- select popover -->
{#if sel && selEnum}
  {@const en = selEnum}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="be-selbg" onpointerdown={() => (sel = null)}></div>
  <div class="be-selmenu" class:up={sel.up} role="listbox" data-be-select-menu style:left="{sel.left}px" style:top="{sel.top}px" style:width="{sel.width}px">
    {#each en.options as o (o.value)}
      <button
        class="be-selopt"
        class:on={o.value === en.value}
        type="button"
        role="option"
        aria-selected={o.value === en.value}
        data-be-option={o.label}
        onclick={() => {
          editor.setEnum(en, o.value);
          sel = null;
        }}>{o.label}</button
      >
    {/each}
  </div>
{/if}

<!-- modifier editor flyout (opened from a control's ∿ badge) -->
<ModifierFlyout open={modOpen} label={modLabel} targetEffectId={modTargetEid} targetParam={modTargetParam} onClose={() => (modOpen = false)} />

<!-- pin-to-panel menu: touch (long-press) + mouse (right-click) alternative to the hold-drag -->
{#if workbenchCanPin}
  <ContextMenu open={pinMenuOpen} position={pinMenuPos} items={pinMenuItems} label="Pin to custom panel" onClose={closePinMenu} />
{/if}

<!-- hold-to-drag pin overlay: inert, so elementFromPoint reaches the real drop zones -->
{#if pinDrag}
  <div class="be-pinlayer" bind:this={pinLayerEl}>
    {#if pinDrag.target}
      <div
        class="be-pinhi"
        style:left="{pinDrag.target.rect.left / pinZoom}px"
        style:top="{pinDrag.target.rect.top / pinZoom}px"
        style:width="{pinDrag.target.rect.width / pinZoom}px"
        style:height="{pinDrag.target.rect.height / pinZoom}px"
      ></div>
    {/if}
    <div class="be-pinchip" class:reject={!pinDrag.target} style:transform="translate({(pinDrag.x + 12) / pinZoom}px, {(pinDrag.y + 12) / pinZoom}px)">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      <span class="be-pinglyph">{@html paramChipGlyph(pinDrag.c.kind)}</span>
      <span class="be-pinname">{pinDrag.c.label}</span>
      {#if pinDrag.target}
        <span class="be-pintarget">{pinDrag.target.label}</span>
      {:else}
        <span class="be-pintarget reject">⊘ hold &amp; drag to a panel</span>
      {/if}
    </div>
  </div>
{/if}

<style>
  .be-root {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .be-body {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
  }

  /* ── tab row ── */
  .be-tabs {
    flex: none;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 8px;
    padding: 6px 12px 4px;
  }
  /* phone device class: search + control size + layout on the first line, the page tabs wrap below */
  .be-root.phone .be-search {
    flex: 1 1 130px;
  }
  .be-root.phone .be-pagetabs {
    order: 2;
    flex-basis: 100%;
  }
  .be-root.phone .be-tabsp {
    display: none;
  }
  .be-search {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    min-width: 140px;
    padding: 0 10px;
    border-radius: 9px;
    background: var(--bg2);
    border: 1px solid var(--border);
    color: var(--textfaint);
  }
  .be-search.active {
    flex: 1;
    border-color: var(--accent);
    color: var(--accent);
  }
  .be-searchin {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    outline: none;
    color: var(--text);
    font: 500 13px/1 var(--font-ui);
  }
  .be-searchx {
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    border: 0;
    background: var(--surface2);
    color: var(--text2);
    cursor: pointer;
    font-size: 11px;
  }
  .be-pagetabs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border-radius: 9px;
    background: var(--input);
    border: 1px solid var(--border);
  }
  .be-tab {
    flex: none;
    height: 24px;
    padding: 0 11px;
    border-radius: 7px;
    border: 0;
    cursor: pointer;
    white-space: nowrap;
    background: transparent;
    color: var(--textdim);
    font: 600 12.5px/1 var(--font-ui);
    transition: background 0.12s, color 0.12s;
  }
  .be-tab:hover {
    color: var(--text);
  }
  .be-tab.vis {
    color: var(--accentbright);
    background: var(--accent-tint);
    box-shadow: inset 0 0 0 1px var(--accent-border);
  }
  .be-tab.on {
    color: var(--amber);
    background: var(--amber-tint);
    box-shadow: inset 0 0 0 1px var(--amber-border);
  }
  .be-tab.add {
    color: var(--accentbright);
    font-size: 15px;
    padding: 0 9px;
  }
  .be-tab.edit {
    width: 110px;
    background: var(--bg2);
    border: 1px solid var(--accent);
    color: var(--amber);
    outline: none;
    cursor: text;
  }
  .be-tabsp {
    flex: 1;
  }
  .be-seg {
    flex: none;
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: 9px;
    background: var(--input);
    border: 1px solid var(--border);
  }
  .be-seg button {
    height: 24px;
    min-width: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: 7px;
    cursor: pointer;
    background: transparent;
    color: var(--textdim);
    font: 600 11.5px/1 var(--font-mono);
  }
  .be-seg button.on {
    color: var(--accentbright);
    background: var(--accent-tint);
    box-shadow: inset 0 0 0 1px var(--accent-border);
  }
  .be-profwrap {
    position: relative;
    flex: none;
  }
  .be-profbtn {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 10px;
    border-radius: 9px;
    cursor: pointer;
    white-space: nowrap;
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--text2);
    font: 700 12px/1 var(--font-ui);
  }
  .be-profbtn.on,
  .be-profbtn:hover {
    border-color: var(--blue);
    color: var(--text);
  }
  .be-profic,
  .be-profcaret {
    opacity: 0.7;
  }
  .be-profcaret {
    font-size: 9px;
  }
  .be-profname {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .be-arrange {
    flex: none;
    display: flex;
    align-items: center;
    gap: 7px;
    height: 30px;
    padding: 0 12px;
    border-radius: 9px;
    cursor: pointer;
    white-space: nowrap;
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--textdim);
    font: 700 12px/1 var(--font-ui);
  }
  .be-arrange.on {
    background: var(--accent-tint);
    border-color: var(--accent);
    color: var(--accentbright);
  }
  .be-profmenu {
    position: fixed;
    z-index: 80;
    min-width: 210px;
    padding: 5px;
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 12px;
    box-shadow: 0 14px 36px color-mix(in srgb, var(--bg) 70%, transparent);
  }
  .be-profitem-row {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .be-profitem {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text2);
    font: 600 13px/1.2 var(--font-ui);
    text-align: left;
    cursor: pointer;
  }
  .be-profitem:hover {
    background: var(--surface2);
  }
  .be-profitem.on {
    color: var(--text);
    background: color-mix(in srgb, var(--blue) 14%, transparent);
  }
  .be-profitem.act {
    color: var(--textdim);
    font-weight: 500;
  }
  .be-piname {
    flex: 1;
  }
  .be-pihint {
    font-size: 10px;
    color: var(--textfaint);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .be-pidel {
    flex: none;
    padding: 4px 7px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--textfaint);
    font-size: 11px;
    cursor: pointer;
  }
  .be-pidel:hover {
    color: var(--danger);
    background: var(--danger-tint);
  }
  .be-profsep {
    height: 1px;
    margin: 5px 2px;
    background: var(--border2);
  }

  /* ── arrange bar + tray (interim) ── */
  .be-arrbar {
    flex: none;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 6px 12px;
    background: color-mix(in srgb, var(--accent) 5%, var(--bg2));
    border-top: 1px solid color-mix(in srgb, var(--accent) 14%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--accent) 14%, transparent);
  }
  .be-abtag {
    font: 700 9.5px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: var(--accentbright);
  }
  .be-abnote {
    font: 500 11px/1.3 var(--font-ui);
    color: var(--textdim);
  }
  .be-absp {
    flex: 1;
  }
  .be-abbtn {
    height: 28px;
    padding: 0 11px;
    border-radius: 8px;
    cursor: pointer;
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--text2);
    font: 600 12px/1 var(--font-ui);
  }
  .be-abbtn.on {
    background: var(--accent-tint);
    border-color: var(--accent);
    color: var(--accentbright);
  }
  .be-tray {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
    border-top: 1px solid var(--surface2);
    background: linear-gradient(180deg, var(--bg2), var(--bg));
  }
  .be-traytag {
    flex: none;
    font: 700 9.5px/1 var(--font-mono);
    letter-spacing: 0.12em;
    color: var(--textfaint);
  }
  .be-trayrow {
    flex: 1;
    min-width: 0;
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .be-trayrow::-webkit-scrollbar {
    display: none;
  }
  .be-traychip {
    flex: none;
    display: flex;
    align-items: center;
    gap: 7px;
    height: 34px;
    padding: 0 10px 0 5px;
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 9px;
    cursor: pointer;
  }
  .be-traychip:hover {
    border-color: var(--accent);
  }
  .be-tcic {
    width: 24px;
    height: 24px;
    flex: none;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: var(--accentbright);
    border: 1px solid var(--accent-border);
  }
  .be-tctxt {
    display: flex;
    flex-direction: column;
    gap: 2px;
    line-height: 1.15;
    text-align: left;
  }
  .be-tcname {
    font: 600 12px/1.15 var(--font-ui);
    color: var(--text);
    white-space: nowrap;
  }
  .be-tcmeta {
    font: 500 8.5px/1 var(--font-mono);
    color: var(--textfaint);
  }
  .be-trayempty {
    display: flex;
    align-items: center;
    height: 34px;
    color: var(--textfaint);
    font-size: 12px;
  }

  /* ── search results ── */
  .be-results {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: 10px;
    padding: 10px 14px;
    scrollbar-width: none;
  }
  .be-results::-webkit-scrollbar {
    display: none;
  }
  .be-nores {
    width: 100%;
    padding: 30px 10px;
    text-align: center;
    color: var(--textfaint);
    font-size: 13px;
  }

  /* ── value bubble ── */
  .be-tip {
    position: fixed;
    z-index: 9999;
    transform: translate(-50%, calc(-100% - 11px));
    padding: 7px 12px;
    border-radius: 10px;
    background: var(--input);
    border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border2));
    color: var(--text);
    font: 700 15px/1 var(--font-mono);
    white-space: nowrap;
    pointer-events: none;
    box-shadow: 0 8px 24px color-mix(in srgb, var(--bg) 70%, transparent);
  }
  .be-tip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: var(--input);
  }

  /* ── select popover ── */
  .be-selbg {
    position: fixed;
    inset: 0;
    z-index: 9997;
  }
  .be-selmenu {
    position: fixed;
    z-index: 9998;
    max-height: 230px;
    overflow-y: auto;
    padding: 6px;
    border-radius: 11px;
    background: var(--surface);
    border: 1px solid var(--border2);
    box-shadow: 0 18px 44px color-mix(in srgb, var(--bg) 75%, transparent);
  }
  .be-selmenu.up {
    transform: translateY(-100%);
  }
  .be-selopt {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text2);
    font: 600 13px/1.2 var(--font-ui);
    text-align: left;
    cursor: pointer;
  }
  .be-selopt:hover {
    background: var(--surface2);
  }
  .be-selopt.on {
    color: var(--accentbright);
    background: var(--accent-tint);
  }

  /* ── hold-to-drag pin overlay ── */
  .be-pinlayer {
    position: fixed;
    inset: 0;
    z-index: 10000;
    pointer-events: none;
  }
  .be-pinhi {
    position: absolute;
    box-sizing: border-box;
    border: 2px dashed var(--accent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 26%, transparent);
  }
  .be-pinchip {
    position: absolute;
    top: 0;
    left: 0;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 32px;
    max-width: 240px;
    padding: 0 12px;
    box-sizing: border-box;
    border: 1px solid var(--accent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    color: var(--text);
    opacity: 0.92;
    box-shadow: 0 12px 30px color-mix(in srgb, var(--bg) 60%, transparent);
    font: 800 11px/1 var(--font-ui);
    white-space: nowrap;
  }
  .be-pinchip.reject {
    border-color: var(--textmuted);
  }
  .be-pinglyph {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    color: var(--c, var(--accent));
  }
  .be-pinname {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .be-pintarget {
    color: var(--accent);
    font: 700 10px/1 var(--font-mono);
    text-transform: uppercase;
  }
  .be-pintarget.reject {
    color: var(--textmuted);
    text-transform: none;
  }
</style>
