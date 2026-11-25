<script lang="ts">
  // Block Editor surface (board model v2): the header (type chip, page tabs, "Find a control…",
  // Engaged | Bypass mode | Scene Ignore, the ⋯ menu — or, without a block, the compact row of the virtual-effect
  // screens), the side page list, and the board of a block's controls with every page at once (top strip
  // or side stack), always fitted to the panel, beside the fixed area (the controls that stay in view: a
  // column at the far right, a band at the bottom of a phone or a very narrow editor); Arrange (the arrange
  // bar, the "Add" library, the page
  // menu — beArrange.svelte.ts drives selection, gestures, keys and undo), value bubble, select popover,
  // flat search results, modifier flyout, the control menu (right-click / long-press / Shift+F10) and the
  // workbench pin paths (⚡ click / press-drag, 380 ms hold-drag).
  // All device reads / writes go through getEditorSurface() (live editor or offline convert buffer);
  // boards persist per block family, profile and device class (BeState → boardPersistence).
  import { tick, untrack, type Snippet } from 'svelte';
  import { getEditorSurface } from '../editorSurface';
  import type { EQBand } from '../EQGraph.svelte';
  import ModifierFlyout from '../ModifierFlyout.svelte';
  import { idealIds } from '../layouts';
  import { surfGet, surfSet, surfRemove, surfRemovePrefix, surfRev } from '../surfaceStore.svelte';
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
    selectActiveLayout,
    selectActivePage,
    selectPanelLocation,
    selectPanelPlacement,
    selectVisibleWidgetsByZone,
    serializeWorkbenchParameterSource,
    type WorkbenchDocument,
    type WorkbenchMenuItem,
    type WorkbenchMenuPosition,
    type WorkbenchParameterSource
  } from '../workbench';
  import { buildAxisPinMenuItems } from '../axis-workbench/pinMenu';
  import type { AxisPinTarget } from '../axis-workbench/pinTargets';
  import { axisBlockEditorModifierController } from '../axis-workbench/blockEditor/blockEditorModifierController';
  import BeArrangeBar from './BeArrangeBar.svelte';
  import BeBoard from './BeBoard.svelte';
  import BeControl from './BeControl.svelte';
  import BeFind from './BeFind.svelte';
  import BeFixed from './BeFixed.svelte';
  import BeHeader from './BeHeader.svelte';
  import BeLibrary from './BeLibrary.svelte';
  import BeMenu from './BeMenu.svelte';
  import BePageNav from './BePageNav.svelte';
  import { findGroups, flatMatches, itemIdOn, jumpPage, pagesOf, type FindFilter } from './findControls';
  import { beLayer } from './overlayLayer';
  import { bypassModeInMenu, bypassModeMenu, type BeBlockChrome } from './headerModel';
  import { buildMoreMenu, builtInName, canArrangeOn, resetAllToast } from './moreMenu';
  import { buildControlMenu, placePinTargets, VIEW_NAME, type PinPanelPlace } from './controlMenu';
  import { isForeignOverlay } from './arrangeModel';
  import {
    ESCAPE_OVERLAYS,
    flyoutTakesEscape,
    isControlMenuKey,
    isEchoContextMenu,
    isEditableTarget,
    longPressOpensMenu,
    menuAtTile
  } from './controlMenuInput';
  import { setBeHost, type BeHost } from './beHost';
  import { graphPlot } from './visuals/graphModel';
  import { BeArrange, type ArrangeTone } from './beArrange.svelte';
  import { arrangeSelection, buildBarOverflow, type BarActions, type BarPart } from './arrangeBar';
  import { buildPageMenu } from './pageMenu';
  import { BeState } from './beState.svelte';
  import { trackDeviceClass } from './deviceClass.svelte';
  import { effectiveNav, minimumBoardHeight, PHONE_END_PAD, SIDE_NAV_MIN_W, type BeDensity, type BeNav } from './boardGeometry';
  import {
    BE_SPEC,
    FIXED_MAX_COLS,
    FIXED_PAGE,
    isDivider,
    locate,
    pageInText,
    pageItems,
    pageLabel,
    regions,
    type BeBoard as BoardModel,
    type BeControl as BeControlItem,
    type BeItem,
    type BeView
  } from './boardModel';
  import { boardDiffersFromSeed, fixedDiffersFromSeed, pageDiffersFromSeed, type PreviousSeeds } from './boardPersistence';
  import { buildCatalog, type BeCtl, type BeKind } from './catalog';
  import type { EqStyleData } from './eqStyles';
  import { builtInSeed, previousSeeds, type SeedInput } from './boardSeeds';
  import { hasDeviceLayoutBoard } from './deviceLayoutBoardV2';
  import { endPadOver, fixedColumnMax, layoutEditor, type FixedLayout } from './fixedLayout';
  import { headerKeys, type HeaderBlockState } from './headerControls';
  import {
    edgeDropArgs,
    editorTabTarget,
    exceedsPinHold,
    PIN_HOLD_MS,
    PIN_PRESS_DRAG,
    pinActionArgs,
    resolvePinTarget,
    type PinTabTarget,
    type PinTarget
  } from './pinDrag';
  import {
    activeAfterScroll,
    arrangeWantsMaximize,
    dragNorm,
    highlightedPages,
    isPinnableKind,
    keySteps,
    NUDGE_STEP,
    pagePinIds,
    revealScroll,
    sharedCell,
    waveBars,
    type BoardPage
  } from './boardView';
  import { formatCentre, formatFull, parseTyped, stepNorm } from './valueFormat';
  import { isDirect, isValueView, lockGesture, restoreOnCancel, scrollAxisOf, trackNorm, valueAxis, valueDelta, type Axis, type GestureLock } from './touchGesture';

  let {
    slug = '',
    accent = undefined,
    eqBands = [] as EQBand[],
    eqGainRange = 20,
    eqTitle = 'EQ',
    eqStyles = [] as EqStyleData[],
    hideIds = [] as number[],
    block = null,
    typeName = '',
    status = 'ready',
    message = '',
    headerEnd = undefined,
    resetKey = ''
  }: {
    slug?: string;
    accent?: string;
    eqBands?: EQBand[];
    eqGainRange?: number;
    eqTitle?: string;
    /** The block's served EQ styles (Input EQ / Output EQ / PEQ): the eq tile's view variants, each with its
     *  own bands. Empty = the tile draws `eqBands`. */
    eqStyles?: EqStyleData[];
    hideIds?: number[];
    /** A grid block's header data and actions; null = the compact row (virtual-effect screens). */
    block?: BeBlockChrome | null;
    /** Name in "Save as default for …" when there is no block (the screen's name). */
    typeName?: string;
    /** Parameter state of the block: the board loads only when ready; otherwise `message` shows in the
     *  board area (while reloading a block that already has a board, the board stays). */
    status?: 'ready' | 'loading' | 'error' | 'nopack';
    message?: string;
    /** End of the header row (the monolith's close button). */
    headerEnd?: Snippet;
    /** Identity of the block shown (another block = a fresh editor view: no search, no arrange, …). */
    resetKey?: string;
  } = $props();

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
  /** Live block metering is on (an offline buffer says nothing: its monitors are empty anyway). */
  const meteringOn = $derived(editor.meteringOn ?? true);
  // the block's live monitors only while metering is on: the meter tile and a graph's gain-reduction bar
  // never show a stale reading after METER OFF
  const blockMons = $derived(editor.monitorsFor(editor.selected?.effectId ?? -1));
  const mons = $derived(meteringOn ? blockMons : []);
  const NWAVE = 110;
  const wave = $derived(waveBars(editor.looperWave?.wave, NWAVE));
  const wavePos = $derived(clamp01(editor.looperWave?.position ?? 0));
  // the catalog only cares whether (and as what) the block meters, not about every level poll — and not
  // about METER ON/OFF either (the ungated list): toggling metering must not change the catalog, reload
  // the board or drop the Arrange undo history; the meter tile just shows no reading while it is off
  const monRole = $derived(editor.blockMonitorRole ?? blockMons[0]?.role ?? null);
  const hasWave = $derived(!!editor.hasLooperWaveform);
  // The catalog only changes with the block's parameter SET (ids, names, option counts), not with their
  // values, but a device parameter event replaces the params array. Keep the previous catalog (same
  // array, same entries) while its structure is unchanged, so the board, the page layouts and every
  // tile's derived values are not rebuilt per event; values still reach the tiles through the host.
  let catMemo: { sig: string; cat: BeCtl[] } | null = null;
  const catalog = $derived.by(() => {
    const next = buildCatalog({
      layout: editor.blockLayout,
      effectId: editor.selected?.effectId,
      params: editor.params,
      enums: editor.enums,
      eqBandCount: eqBands.length,
      eqTitle,
      eqViews: eqStyles.map((style) => style.view),
      hideIds,
      monitors: monRole ? [{ role: monRole }] : [],
      hasWave,
      visuals: editor.blockVisuals ?? []
    });
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

  // ── graph tiles: the shared clock of the LFO playheads (≤ 30 fps, only while one is moving on screen) ──
  const PLAYHEAD_FPS = 30;
  let clock = $state(0);
  let reducedMotion = $state(false);
  let pageHidden = $state(false);
  const playheads = new Set<string>();
  let playheadCount = $state(0);
  let raf = 0;
  let lastFrame = 0;
  const animate = $derived(!be.editMode && !reducedMotion && !pageHidden);
  function frame(now: number) {
    raf = 0;
    if (!animate || playheadCount === 0) return;
    if (now - lastFrame >= 1000 / PLAYHEAD_FPS - 1) {
      lastFrame = now;
      clock = now / 1000;
    }
    raf = requestAnimationFrame(frame);
  }
  $effect(() => {
    if (animate && playheadCount > 0 && !raf && typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(frame);
  });
  $effect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const syncMotion = () => (reducedMotion = !!mq?.matches);
    const syncHidden = () => (pageHidden = document.hidden);
    syncMotion();
    syncHidden();
    mq?.addEventListener?.('change', syncMotion);
    document.addEventListener('visibilitychange', syncHidden);
    return () => {
      mq?.removeEventListener?.('change', syncMotion);
      document.removeEventListener('visibilitychange', syncHidden);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
  });
  /** Register / drop a moving playhead. Writes the reactive count only (never reads it), so a tile's
   *  registering effect never depends on it. */
  function setPlayhead(id: string, on: boolean) {
    const had = playheads.size;
    if (on) playheads.add(id);
    else playheads.delete(id);
    if (playheads.size !== had) playheadCount = playheads.size;
  }
  /** The open block, for the cross-block guard: a layout control of another block never binds to this
   *  block's param with the same id (deviceLayoutBoard `isForeignControl`). */
  const layoutOwnerEid = $derived(editor.selected?.effectId ?? null);
  // the params the server tags as the block state: the header shows them, no default board does. Their ids
  // only (the tag's values change with every edit).
  const bsTagged = $derived(!!editor.blockState);
  const bsScene = $derived(editor.blockState?.sceneIgnore?.paramId ?? null);
  const bsMode = $derived(editor.blockState?.bypassMode?.paramId ?? null);
  const headerState = $derived<HeaderBlockState | null>(
    bsTagged ? { sceneIgnore: bsScene == null ? null : { paramId: bsScene }, bypassMode: bsMode == null ? null : { paramId: bsMode } } : null
  );
  const seedInput = (): SeedInput => ({ layout: editor.blockLayout, catalog, effectId: layoutOwnerEid, blockState: headerState, mainParamIds: new Set(idealIds(editor.params)) });
  const deviceSeed = (): BoardModel => builtInSeed(seedInput());
  /** The defaults of earlier versions and servers (boardSeeds.ts; built only when a stored board needs them). */
  const previousSeed = (): PreviousSeeds => previousSeeds(seedInput());
  /** The built-in seed comes from the device layout (else the curated fallback; the ⋯ wording follows). */
  const hasDeviceLayout = $derived(hasDeviceLayoutBoard(editor.blockLayout, catalog, { effectId: layoutOwnerEid, blockState: headerState }));
  $effect(() => {
    const header = `${bsTagged}:${bsScene ?? ''}:${bsMode ?? ''}`;
    const src = { slug, deviceClass, catalog, variantSig, owner: layoutOwnerEid, header, deviceSeed, previousSeed, rev: surfRev() };
    if (status !== 'ready') return; // the parameters of another block / channel may still be in place
    untrack(() => {
      // a (re)load can swap the board under the scroll position: keep its stored page active until the
      // load effect below has brought it into view
      if (be.sync(src)) holdActive(400);
    });
  });

  // ── layout ──
  let bodyW = $state(0);
  let bodyH = $state(0);
  /** The board area: the pages and the fixed area together. */
  let mainW = $state(0);
  let mainH = $state(0);
  let rootH = $state(0);
  /** Editor width (the side navigation and the header row break depend on it, not on the board's). */
  let rootW = $state(0);
  const prefs = $derived(be.prefs);
  /** Navigation of the header (tabs vs the side list). */
  const nav = $derived(effectiveNav(prefs.nav, rootW));
  /** How the board lays the pages out: as the navigation, except on the phone layout, whose pages
   *  (re-wrapped to 8 cells: at most four knobs a row) always stack and scroll vertically — the header tabs
   *  still navigate them. Reading the phone view never writes a board (display positions only). */
  const phoneBoard = $derived(isPhone && !be.editMode);
  const boardNav = $derived<BeNav>(phoneBoard ? 'side' : nav);
  $effect(() => {
    const root = rootEl;
    const boardHeight = mainH;
    const chrome = rootH - boardHeight;
    if (!root || !boardHeight || chrome < 0 || isPhone || be.editMode) return;
    const dock = root.closest<HTMLElement>('.aw-region');
    const panel = root.closest<HTMLElement>('.ed:not(.embedded)');
    const container = dock?.matches('.aw-region-bottom:not(.overlay), .aw-region-top:not(.overlay)') ? dock : panel;
    if (!container) return;
    const overhead = Math.max(0, container.offsetHeight - root.offsetHeight);
    const minimum = minimumBoardHeight(prefs.density, boardNav) + chrome + overhead;
    const previous = container.style.minHeight;
    container.style.minHeight = dock ? `min(${minimum}px, max(0px, calc(100% - 120px)))` : `min(${minimum}px, max(0px, calc(100dvh - 150px)))`;
    return () => { container.style.minHeight = previous; };
  });
  /** The side list can take effect at this editor width (the ⋯ menu offers it). */
  const sideFits = $derived(rootW === 0 || rootW >= SIDE_NAV_MIN_W);
  /** Side page list width at this editor width. */
  const listW = $derived(rootW >= 1000 ? 172 : rootW >= 760 ? 148 : 128);
  const board = $derived(be.board);
  /** The block whose parameters the board last loaded with (a reload of the same block keeps its board). */
  let readyKey = $state<string | null>(null);
  $effect(() => {
    if (status === 'ready') readyKey = resetKey;
  });
  /** The board area shows the status message instead of the board. */
  const showMessage = $derived(status === 'nopack' || status === 'error' || (status === 'loading' && (!board || readyKey !== resetKey)));
  /** Items drawn per page: dividers, and controls whose key the catalog lists right now. */
  const pages = $derived.by<BoardPage[]>(() => {
    const b = board;
    if (!b) return [];
    return b.pageOrder.map((page) => ({ page, items: pageItems(b, page).filter((it) => isDivider(it) || catByKey.has(it.key)) }));
  });
  /** The fixed area's drawn items. An emptied area shows only while arranging. */
  const fixedItems = $derived((board?.fixed?.items ?? []).filter((it) => isDivider(it) || catByKey.has(it.key)));
  const fixedArea = $derived(board?.fixed && (be.editMode || fixedItems.length) ? { cols: board.fixed.cols, items: fixedItems } : null);
  const inWorkbench = !!workbench;
  let arrangePlace = $state<FixedLayout['place']>();
  const layoutBase = $derived({
    bodyW, bodyH, mainW, nav: boardNav, density: prefs.density, phone: phoneBoard,
    clearCorner: deviceClass !== 'desktop' && inWorkbench,
    dockGutter: inWorkbench
  });
  const laidOut = $derived(layoutEditor(pages, fixedArea, { ...layoutBase, arrangePlace, editMode: be.editMode, frozenCell: be.frozenCell ?? undefined }));
  const layouts = $derived(laidOut.layouts);
  const fixedLay = $derived(laidOut.fixed);
  const fixedMaxCols = $derived(fixedLay?.place === 'column' ? fixedColumnMax(mainW, fixedLay.c, fixedLay.g, boardNav, inWorkbench) : FIXED_MAX_COLS);
  $effect(() => {
    if (be.editMode && !arrangePlace && fixedLay) arrangePlace = fixedLay.place;
  });
  const liveCell = (): number | null => sharedCell(layoutEditor(pages, fixedItems.length ? fixedArea : null, { ...layoutBase, editMode: false }).layouts);
  const layoutSig = $derived(
    boardNav +
      '|' +
      prefs.density +
      '|' +
      pages.map((p) => (layouts[p.page] ? `${layouts[p.page]!.c}:${layouts[p.page]!.W}:${layouts[p.page]!.H}` : '')).join(',') +
      (fixedLay ? `|${fixedLay.place}:${fixedLay.c}:${fixedLay.W}:${fixedLay.H}` : '')
  );
  /** Rendered height of a band at the bottom (0 without one). */
  let fixedH = $state(0);
  let fixedOverflows = $state(false);
  const bandH = $derived(fixedLay?.place === 'band' ? fixedH : 0);

  // ── visible / active page ──
  let boardRef = $state<ReturnType<typeof BeBoard> | null>(null);
  let fixedRef = $state<ReturnType<typeof BeFixed> | null>(null);
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
  function observeTileTelemetry(el: HTMLElement, needs: { waveform: boolean; monitors: boolean }) {
    const eid = layoutOwnerEid;
    if (!block || eid == null || status !== 'ready' || pageHidden || !editor.observeBlockTelemetry || typeof IntersectionObserver === 'undefined') return;
    let stop: (() => void) | undefined;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries.at(-1);
      if (entry?.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0) {
        stop ??= editor.observeBlockTelemetry?.(eid, needs);
      } else {
        stop?.();
        stop = undefined;
      }
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      observer.takeRecords();
      stop?.();
    };
  }

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
  /** Show a page (a tab, a jump); with `itemId` the board scrolls to that item of it (stacked pages). */
  function goPage(pg: string, itemId: string | null = null) {
    resultsOpen = false; // the board is what a page tab points at
    be.setPage(pg);
    if (be.editMode) arr.fixedTarget = false; // and what the arrange tools act on
    sel = null;
    editingId = null;
    if (itemId) {
      holdActive(800);
      requestAnimationFrame(() => boardRef?.scrollToItem(pg, itemId, true));
    } else scrollSoon(pg, true, 800);
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
    const n = boardNav;
    if (lastNav && n !== lastNav) {
      const pg = untrack(() => be.board?.page);
      if (pg) scrollSoon(pg, false, 500);
    }
    lastNav = n;
  });

  // ── Arrange: selection, gestures, keys and undo in beArrange.svelte.ts; the bar, library and page menu
  //    in their own components ──
  const TONE: Record<ArrangeTone, string> = { ok: 'var(--accent)', info: 'var(--textdim)', bad: 'var(--danger)' };
  const arr = new BeArrange({
    be,
    root: () => rootEl,
    layer: () => layerEl,
    isDrawn: (it) => isDrawn(it),
    ctl: (key) => catByKey.get(key),
    autoScroll: (x, y) => {
      // over the fixed area only the area scrolls, never the pages beside it; on the way there the pages wait
      if (fixedRef?.autoScroll(x, y)) boardRef?.resetEdgeDwell();
      else boardRef?.autoScroll(x, y, fixedLay ? (fixedLay.place === 'column' ? 'right' : 'bottom') : null);
    },
    holdPage: () => {
      const pg = be.board?.page;
      holdActive(600);
      if (pg) boardRef?.holdPage(pg);
    },
    showPage: (pg) => scrollSoon(pg, true, 800),
    setPage: (pg) => be.setPage(pg),
    focusBoard: () => boardRef?.focusBoard(),
    reveal: (id) => {
      if (!fixedRef?.revealItem(id)) boardRef?.revealItem(id);
    },
    toast: (text, tone) => editor.showToast(text, TONE[tone]),
    leave: () => setEdit(false)
  });
  // the window listeners of Arrange (pointer gestures, Ctrl/⌘+Z, the arrow keys' release) live only while
  // arranging — every editor instance (VirtualScreen too) has its own
  $effect(() => {
    if (!be.editMode) return;
    return arr.attach();
  });
  /** The editor's one floating layer (overlayLayer.ts): its menus and the library live in it. */
  let layerEl = $state<HTMLElement | null>(null);
  function setEdit(on: boolean) {
    if (on) resultsOpen = false; // arranging needs the board
    if (on === be.editMode) return;
    // arranging widens every page to the full 24 cells: keep the current page in view across the switch
    const pg = be.board?.page;
    if (pg) scrollSoon(pg, false, 400);
    arrangePlace = on ? fixedLay?.place : undefined;
    be.setEditMode(on, on ? liveCell() : null);
    arr.reset();
    barMenu = null;
    renamingPage = null;
    editingId = null;
    sel = null;
    if (on) void roomForArrange();
    else restoreAfterArrange();
  }
  /** The workbench panel the editor sits in (null in the monolith, or outside a panel). */
  function hostPanelId(): string | null {
    return rootEl?.closest<HTMLElement>('[data-panel]')?.dataset.panel ?? null;
  }
  /** The panel the editor maximized itself for Arrange (restored on Done only then). */
  let autoMaximized: string | null = null;
  /** Tablet: Arrange in a board shorter than three knob rows maximizes the hosting workbench panel (the
   *  arrange bar measured first). A panel the user maximized stays as it is. */
  async function roomForArrange() {
    await tick(); // the arrange bar is in
    const ctl = workbench?.controller;
    const panel = hostPanelId();
    const L = be.board ? layouts[be.board.page] : undefined;
    if (!be.editMode || !ctl || !panel || !L) return;
    const want = arrangeWantsMaximize({ deviceClass, bodyH: boardRef?.clientHeight() ?? bodyH, c: L.c, g: L.g, hasPanel: true, maximized: ctl.maximizedPanelId === panel });
    if (!want) return;
    autoMaximized = panel;
    ctl.setMaximizedPanel(panel);
  }
  function restoreAfterArrange() {
    const ctl = workbench?.controller;
    const panel = autoMaximized;
    autoMaximized = null;
    if (ctl && panel && ctl.maximizedPanelId === panel) ctl.setMaximizedPanel(null);
  }
  // The cell is frozen while arranging (a drag never sees the grid change under it); a new panel width
  // (maximize, a split resize — not the fixed area taking its share of it) freezes it again at the new fitted
  // size between gestures — a width change during a drag or resize is picked up when the gesture ends (the
  // effect re-runs on its end).
  let frozenW = 0;
  $effect(() => {
    const on = be.editMode;
    const w = mainW;
    const gesture = !!arr.drag || !!arr.resizing || arr.sizingFixed;
    untrack(() => {
      if (!on) {
        frozenW = 0;
        return;
      }
      if (gesture || arr.busy) return;
      if (frozenW && w && w !== frozenW) be.refreeze(liveCell());
      frozenW = w;
    });
  });
  // arrange is a desktop affordance (never on the phone layout); a search ends it
  $effect(() => {
    if (isPhone && be.editMode) untrack(() => setEdit(false));
  });
  let q = $state('');
  let findFilter = $state<FindFilter>('all');
  /** The flat, operable search results replace the board ("Show all" / Enter). */
  let resultsOpen = $state(false);
  $effect(() => {
    if (resultsOpen && be.editMode) untrack(() => setEdit(false));
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

  // ── find a control (F5): popover groups; Enter / "Show all" = the flat results ──
  let findOpen = $state(false);
  const findList = $derived(findOpen ? findGroups(catalog, board, q, findFilter) : []);
  const catKeys = $derived(new Set(catalog.map((c) => c.key)));
  function findPreview(key: string): string {
    const c = catByKey.get(key);
    if (!c) return '';
    if (c.kind === 'cont') {
      const p = knobById.get(c.id);
      return p ? formatCentre(p) : '';
    }
    if (c.kind === 'toggle' || c.kind === 'select') {
      const e = enumById.get(c.id);
      return e?.options.find((o) => o.value === e.value)?.label ?? '';
    }
    return '';
  }
  let flashId = $state<string | null>(null);
  let flashItemTimer: ReturnType<typeof setTimeout> | null = null;
  /** Jump to a control: its page scrolls into view and the tile flashes. */
  function jumpTo(key: string, page?: string) {
    const b = be.board;
    const label = catByKey.get(key)?.label ?? key;
    const pg = jumpPage(b, key, page);
    if (!b || !pg) {
      editor.showToast(`“${label}” is on no page — Show all to use it`, 'var(--textdim)');
      return;
    }
    resultsOpen = false;
    const id = itemIdOn(b, pg, key);
    if (pg === FIXED_PAGE) {
      // in view on every page: no page changes; the area shows the control (an open band, a scrolled column)
      sel = null;
      editingId = null;
      if (id) void tick().then(() => fixedRef?.revealItem(id));
    } else goPage(pg, id);
    flashId = id;
    if (flashItemTimer) clearTimeout(flashItemTimer);
    flashItemTimer = setTimeout(() => (flashId = null), 1400);
  }
  function findPin(key: string) {
    const c = catByKey.get(key);
    if (c) void pinControlToWorkbench(c);
  }
  // ── search results (flat, live, each control in its configured view) ──
  const matches = $derived(resultsOpen ? flatMatches(catalog, q, findFilter, board) : []);
  const viewByKey = $derived.by(() => {
    const m = new Map<string, BeControlItem['view']>();
    const b = board;
    if (b) for (const pg of regions(b)) for (const it of pageItems(b, pg)) if (!isDivider(it) && !m.has(it.key)) m.set(it.key, it.view);
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
  const popupMargin = 8;
  const popupLeft = (left: number, width: number, z: number) =>
    Math.max(popupMargin, Math.min(left, window.innerWidth / z - width - popupMargin));
  function startType(itemId: string, ctl: BeCtl) {
    if (be.editMode || ctl.kind !== 'cont') return;
    const p = knobById.get(ctl.id);
    editBuf = p ? formatCentre(p) : '';
    editInit = editBuf;
    editingId = itemId;
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
  // A value drag: mouse and pen — a knob / number dragged vertically (faders / sliders follow their track:
  // `tk`); touch — any continuous control, along the axis the board does not scroll (touchGesture.ts),
  // decided once the drag leaves the slop: a drag along the scroll axis is a scroll and changes nothing,
  // a tap on a fader / slider track sets the tapped value, a tap on the value types it.
  // One value gesture at a time, owned by its pointer: another finger's moves, release and cancel never
  // reach it, and a press while another pointer drags is ignored.
  type ValueDrag = {
    /** The pointer that owns the drag. */
    pointerId: number;
    pid: number;
    itemId: string;
    sx: number;
    sy: number;
    lx: number;
    ly: number;
    n: number;
    /** The value when the press began (a touch drag the browser takes over right away goes back to it). */
    start: number;
    moved: boolean;
    clickVal: boolean;
    ctl: BeCtl;
    direct: boolean;
    axis: Axis;
    /** touch: undecided (null) until the drag leaves the slop; mouse / pen: always 'value'. */
    lock: GestureLock | null;
    /** When a touch drag locked to 'value' (ms). */
    lockedAt: number;
    /** touch pressed on a fader / slider track: where a tap sets the value. */
    track: { rect: DOMRect; vertical: boolean } | null;
    tipEl: HTMLElement;
  };
  let vd: ValueDrag | null = null;
  let tk: { pointerId: number; pid: number; rect: DOMRect; vertical: boolean } | null = null;
  /** The pointer of the running value gesture (drag or track), if any. */
  const valueOwner = (): number | null => vd?.pointerId ?? tk?.pointerId ?? null;
  /** Another pointer owns a value gesture: this one starts none. */
  const ownedByOther = (pointerId: number): boolean => {
    const o = valueOwner();
    return o != null && o !== pointerId;
  };

  function tileDown(e: PointerEvent, item: BeItem, ctl: BeCtl | undefined, page: string, tile: HTMLElement) {
    if (be.editMode) {
      arr.tileDown(e, item, page, tile);
      return;
    }
    if (!ctl || isDivider(item) || !isValueView(ctl.kind, item.view)) return;
    if (e.button !== 0 || editingId === item.id || ownedByOther(e.pointerId)) return;
    const direct = isDirect(e.pointerType);
    if (!direct && item.view !== 'knob' && item.view !== 'number') return; // mouse / pen follow a fader / slider track
    e.stopPropagation();
    const target = e.target as HTMLElement | null;
    const trackEl = direct ? target?.closest?.<HTMLElement>('.be-vtrack, .be-htrack') : null;
    // tiles of the flat search results scroll with their list (vertically), the board's with the board, the
    // fixed area's with the area when it scrolls
    const scroll: Axis = tile.closest('[data-be-results]') ? 'y' : page === FIXED_PAGE ? fixedAxis : scrollAxisOf(boardNav);
    const n = knobById.get(ctl.id)?.norm ?? 0;
    vd = {
      pointerId: e.pointerId,
      pid: ctl.id,
      itemId: item.id,
      sx: e.clientX,
      sy: e.clientY,
      lx: e.clientX,
      ly: e.clientY,
      n,
      start: n,
      moved: false,
      clickVal: !!target?.closest?.('[data-be-value]'),
      ctl,
      direct,
      axis: valueAxis(item.view, e.pointerType, scroll),
      lock: direct ? null : 'value',
      lockedAt: 0,
      track: trackEl ? { rect: trackEl.getBoundingClientRect(), vertical: trackEl.classList.contains('be-vtrack') } : null,
      tipEl: tile.querySelector<HTMLElement>('.be-dial, .be-nval, .be-vtrack, .be-htrack') ?? tile
    };
    if (direct) return; // the bubble shows once the drag is a value drag
  }
  /** Mouse or pen on a fader / slider track: the value follows the pointer (touch goes through tileDown). */
  function trackDown(e: PointerEvent, ctl: BeCtl, vertical: boolean) {
    if (be.editMode || e.button !== 0 || isDirect(e.pointerType) || ownedByOther(e.pointerId)) return;
    e.stopPropagation();
    tk = { pointerId: e.pointerId, pid: ctl.id, rect: (e.currentTarget as HTMLElement).getBoundingClientRect(), vertical };
    trackMove(e);
  }
  function trackMove(e: PointerEvent) {
    const t = tk;
    if (!t) return;
    setNorm(t.pid, trackNorm(e.clientX, e.clientY, t.rect, t.vertical));
  }
  /** A pointer move of a value drag. */
  function valueMove(e: PointerEvent, v: ValueDrag) {
    if (v.direct) {
      if (!v.lock) {
        const lock = lockGesture(e.clientX - v.sx, e.clientY - v.sy, v.axis);
        if (!lock) return; // still a tap
        if (lock === 'scroll') {
          // a swipe along the scroll axis: the board scrolls (the browser pans and cancels), no value changes
          vd = null;
          return;
        }
        v.lock = lock;
        v.lockedAt = Date.now();
        v.moved = true;
        v.lx = e.clientX;
        v.ly = e.clientY;
        return;
      }
    } else if (!v.moved) {
      if (Math.abs(e.clientY - v.sy) + Math.abs(e.clientX - v.sx) < 3) return;
      v.moved = true;
    }
    e.preventDefault();
    v.n = dragNorm(v.n, valueDelta(e.clientX - v.lx, e.clientY - v.ly, v.axis), e.shiftKey);
    v.lx = e.clientX;
    v.ly = e.clientY;
    setNorm(v.pid, v.n);
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

  /** The axis the fixed area's tiles leave to scrolling (touch): the board's, or the area's own. */
  const fixedAxis = $derived<Axis>(fixedOverflows ? 'y' : scrollAxisOf(boardNav));

  /** Items drawn right now: dividers, and controls whose key the catalog lists. */
  const isDrawn = (it: BeItem): boolean => isDivider(it) || catByKey.has(it.key);
  /** The pointer of the running gesture — a value drag or track, or a pin hold / ⚡ press / pin drag (mouse,
   *  pen) — if any. */
  const gestureOwner = (): number | null => valueOwner() ?? pinDrag?.pointerId ?? pinPressAt?.pointerId ?? pinHold?.pointerId ?? null;
  /** The browser took a pointer (a pan, a pinch): only that pointer's gesture ends — never another
   *  finger's value drag (Arrange cancels its own gestures, per pointer as well). A touch value drag
   *  the browser takes right after it locked goes back to its start value (touchGesture restoreOnCancel). */
  function cancelPointer(e: PointerEvent) {
    const v = vd;
    if (v && v.pointerId === e.pointerId) {
      vd = null;
      const back = v.direct ? restoreOnCancel(v, Date.now(), v.n) : null;
      if (back != null) setNorm(v.pid, back);
    }
    if (tk && tk.pointerId === e.pointerId) tk = null;
    if (pinDrag && pinDrag.pointerId === e.pointerId) pinDrag = null;
    if (pinPressAt && pinPressAt.pointerId === e.pointerId) pinPressAt = null;
    if (pinHold && pinHold.pointerId === e.pointerId) cancelPinHold();
  }
  /** Stop every gesture (a menu opens over the board, another block). */
  function cancelGestures() {
    vd = null;
    tk = null;
    arr.cancel();
    if (pinDrag) pinDrag = null;
    pinPressAt = null;
    cancelPinHold();
  }

  $effect(() => {
    const onMove = (e: PointerEvent) => {
      const owner = gestureOwner();
      if (owner != null && e.pointerId !== owner) return; // another finger: never part of this gesture
      if (pinDrag) {
        e.preventDefault();
        pinDrag = { ...pinDrag, x: e.clientX, y: e.clientY, target: resolvePinTarget(e.clientX, e.clientY) };
        return;
      }
      if (pinPressAt) {
        // a press on ⚡: a few px of movement start the pin drag at once (no hold)
        e.preventDefault();
        if (exceedsPinHold(pinPressAt.x, pinPressAt.y, e.clientX, e.clientY, PIN_PRESS_DRAG)) {
          const c = pinPressAt.c;
          pinPressAt = null;
          beginPinDrag(c, e.clientX, e.clientY, e.pointerId);
        }
        return;
      }
      if (pinHold && exceedsPinHold(pinHold.x, pinHold.y, e.clientX, e.clientY)) cancelPinHold(); // early movement = value adjust
      if (tk) {
        e.preventDefault();
        trackMove(e);
        return;
      }
      if (vd) valueMove(e, vd);
    };
    const onUp = (e: PointerEvent) => {
      const owner = gestureOwner();
      if (owner != null && e.pointerId !== owner) return; // another finger lifted: this gesture goes on
      if (pinDrag) {
        const pin = pinDrag;
        pinDrag = null;
        cancelPinHold();
        dropPin(pin);
        suppressNextClick();
        return;
      }
      pinPressAt = null; // a ⚡ press that never moved: its click pins to the default target
      cancelPinHold(); // a press that never became a drag must clear the pending hold timer
      tk = null;
      if (vd) {
        const v = vd;
        vd = null;
        if (v.moved) return;
        if (v.track) setNorm(v.pid, trackNorm(v.sx, v.sy, v.track.rect, v.track.vertical)); // a tap on a track
        else if (v.clickVal) startType(v.itemId, v.ctl);
      }
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', cancelPointer);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', cancelPointer);
    };
  });

  // ── pages: rename (double-click on a tab / list entry while arranging, or Page ▾) and "+" ──
  let renamingPage = $state<string | null>(null);
  function renamePage(from: string, raw: string) {
    renamingPage = null;
    arr.renamePage(from, raw);
  }
  function addPage() {
    arr.addPage();
  }

  // ── layout profiles (Default = device-authentic, Blank, custom copies) and the layout status ──
  function setProfile(name: string) {
    holdActive(400);
    be.setProfile(name);
  }
  function addProfile() {
    holdActive(400);
    const name = be.addProfile();
    if (name) editor.showToast(`New layout “${name}”`, 'var(--accent)');
  }
  function deleteProfile(name: string) {
    holdActive(400);
    be.deleteProfile(name);
  }
  /** The active layout differs from its seed (amber dot on ⋯, "Custom"); only drawn controls count. */
  const custom = $derived(!!board && !!be.seed && boardDiffersFromSeed(board, be.seed, catKeys));
  const pageCustom = $derived(!!board && !!be.seed && pageDiffersFromSeed(board, be.seed, board.page, catKeys));
  const pageInSeed = $derived(!!board && !!be.seed && be.seed.pageOrder.includes(board.page));
  const fixedStatus = $derived.by(() => {
    if (!board || !be.seed || (!board.fixed && !be.seed.fixed)) return null;
    const custom = fixedDiffersFromSeed(board, be.seed, catKeys);
    return { inSeed: !!be.seed.fixed, custom, lost: moreOpen && custom ? lostNames(be.lostByFixedReset()) : [] };
  });
  /** What the page reset of the ⋯ menu does beside the page (worked out while the menu is open). */
  const pageReset = $derived.by(() => {
    const plan = moreOpen && pageCustom && pageInSeed ? be.planResetPage() : null;
    return plan && { toFixed: plan.toFixed.map(ctlName), addsFixed: plan.addsFixed, lost: lostNames(plan.lost) };
  });
  const saveName = $derived(block?.family || typeName || slug || 'this block');
  /** Names of the controls a reset takes off the board (the header shows its own controls anyway). */
  function lostNames(keys: readonly string[]): string[] {
    const header = headerKeys(catalog, { layout: editor.blockLayout, blockState: headerState, effectId: layoutOwnerEid });
    return keys.filter((k) => !header.has(k)).map(ctlName);
  }
  const ctlName = (key: string): string => (catByKey.get(key)?.label ?? key).replace(/\s+/g, ' ').trim();

  // another block: a fresh view of the editor (the surface stays mounted)
  let lastResetKey = untrack(() => resetKey);
  $effect(() => {
    const k = resetKey;
    untrack(() => {
      if (k === lastResetKey) return;
      lastResetKey = k;
      setEdit(false);
      q = '';
      resultsOpen = false;
      findOpen = false;
      moreOpen = false;
      bmOpen = false;
      barMenu = null;
      renamingPage = null;
      sel = null;
      editingId = null;
      flashId = null;
      modOpen = false;
      closeCtx();
      cancelGestures();
    });
  });

  // ── Bypass mode menu: opens under the header's Bypass mode control (radio rows, one per device mode);
  // on a phone-width editor the control is a ⋯ submenu instead ──
  let bmOpen = $state(false);
  let bmAnchor = $state<HTMLElement | null>(null);
  // one measurement: the header's own width (bound below), with the same ✕ / touch inputs BeHeader uses
  let headW = $state(0);
  const bmInMore = $derived(bypassModeInMenu(headW, { hasEnd: !!headerEnd, touch: deviceClass !== 'desktop' }));
  const bmRows = (b: BeBlockChrome) => bypassModeMenu(b.blockState.bypassMode, b.channel, (v) => b.onBypassMode(v));
  const bmItems = $derived(bmOpen && block && !bmInMore ? bmRows(block) : []);
  $effect(() => {
    if (bmInMore || !block?.blockState.bypassMode.enabled) untrack(() => (bmOpen = false));
  });

  // ── ⋯ menu ──
  let moreOpen = $state(false);
  let moreAnchor = $state<HTMLElement | null>(null);
  let blockLibraryOpen = $state(false);
  let blockLibraryAnchor = $state<HTMLElement | null>(null);
  const blockLibraryAvailable = $derived(!!block && !!editor.blockLibraryTarget && !!editor.openBlockLibrary);
  $effect(() => {
    void editor.blockLibraryTarget?.key;
    blockLibraryOpen = false;
  });
  function toggleBlockLibrary() {
    moreOpen = false;
    bmOpen = false;
    findOpen = false;
    blockLibraryOpen = !blockLibraryOpen;
  }
  const moreItems = $derived(
    moreOpen
      ? buildMoreMenu(
          {
            deviceClass,
            editMode: be.editMode,
            nav: prefs.nav,
            sideFits,
            density: prefs.density,
            profiles: be.profileNames,
            profile: be.profile,
            custom,
            page: board?.page ?? '',
            pageCustom,
            pageInSeed,
            pageReset,
            fixed: fixedStatus,
            hasBoard: !!board,
            hasUserSeed: be.userSeed,
            hasDeviceLayout,
            typeName: saveName,
            block: block
              ? {
                  isCab: block.isCab,
                  canRetype: !!block.pack,
                  bypassMode: bmInMore
                    ? {
                        label: block.blockState.bypassMode.label,
                        reason: block.blockState.bypassMode.reason,
                        muting: block.blockState.bypassMode.muting,
                        rows: bmRows(block)
                      }
                    : null
                }
              : null
          },
          {
            arrange: (on) => setEdit(on),
            nav: setNav,
            density: setDensity,
            profile: setProfile,
            resetPage: () => {
              holdActive(400);
              const pg = be.board?.page ?? 'Page';
              const done = be.resetPage();
              if (done) editor.showToast(`“${pg}” reset${done.addsFixed ? ', fixed area added' : ''}`, 'var(--accent)');
            },
            resetFixed: () => {
              holdActive(400);
              const back = !!be.seed?.fixed;
              if (be.resetFixed()) editor.showToast(back ? 'Fixed area reset' : 'Fixed area removed', 'var(--accent)');
            },
            resetAll: () => {
              holdActive(400);
              be.resetAll();
              editor.showToast(resetAllToast(be.profile, be.userSeed, hasDeviceLayout), 'var(--accent)');
            },
            resetDevice: () => {
              holdActive(400);
              be.resetToDevice();
              editor.showToast(`Reset to ${builtInName(hasDeviceLayout)}`, 'var(--accent)');
            },
            newCopy: addProfile,
  resetAllLayouts: () => {
    // every block family: drop the stored boards, their meta (active profile + prefs) and the saved family
    // seeds, so each regenerates from its device layout with the built-in navigation (side list)
    const n =
      surfRemovePrefix('axs.be1meta.') + surfRemovePrefix('axs.be1seed.') + surfRemovePrefix('axs.be1.');
    editor.showToast(n ? `Reset every editor layout (${n} stored entries)` : 'Every editor layout was already the default', 'var(--accent)');
  },
            deleteCopy: deleteProfile,
            saveDefault: () => {
              be.saveAsDefault();
              editor.showToast(`Saved as the default layout for ${saveName}`, 'var(--accent)');
            },
            forgetDefault: () => {
              be.forgetDefault();
              editor.showToast(`${saveName} starts from ${builtInName(hasDeviceLayout)} again`, 'var(--accent)');
            },
            changeType: () => block?.onType(),
            remove: () => block?.onRemove()
          }
        )
      : []
  );

  // ── select popover: measured from the trigger, zoom-safe, closes on reflow / scroll; a listbox the
  //    keyboard walks (↑ / ↓ / Home / End, Enter picks, Escape closes back to the field) ──
  const uid = $props.id();
  const selMenuId = `be-sel-${uid}`;
  let sel = $state<{ id: string; enumId: number; left: number; top: number; width: number; up: boolean; trigger: HTMLElement } | null>(null);
  let selMenuEl = $state<HTMLElement | null>(null);
  /** The option that holds the list's one tab stop (roving tabindex): the focused one, else the current. */
  let selFocus = $state<number | null>(null);
  const selEnum = $derived(sel ? enumById.get(sel.enumId) : undefined);
  function openSelect(e: MouseEvent, itemId: string, ctl: BeCtl) {
    if (be.editMode) return;
    if (sel?.id === itemId) {
      sel = null;
      return;
    }
    const trigger = e.currentTarget as HTMLElement;
    const t = trigger.getBoundingClientRect();
    const z = zoom();
    const below = window.innerHeight - t.bottom;
    const up = below < 240 && t.top > below;
    const width = Math.min(Math.max(t.width / z, 160), Math.max(0, window.innerWidth / z - 2 * popupMargin));
    selFocus = null;
    sel = { id: itemId, enumId: ctl.id, left: popupLeft(t.left / z, width, z), top: (up ? t.top - 2 : t.bottom + 2) / z, width, up, trigger };
  }
  function closeSelect(focusField: boolean) {
    const t = sel?.trigger;
    sel = null;
    if (focusField) t?.focus({ preventScroll: true });
  }
  /** Focus an option and scroll the list (only) as far as needed to show it. */
  function focusOption(list: HTMLElement, opt: HTMLElement | null | undefined) {
    if (!opt) return;
    opt.focus({ preventScroll: true });
    list.scrollTop = revealScroll(list.scrollTop, list.clientHeight, opt.offsetTop, opt.offsetHeight);
  }
  // the open popover takes the focus on its current option (the first one when none is current)
  $effect(() => {
    const el = selMenuEl;
    if (!el) return;
    untrack(() => focusOption(el, el.querySelector<HTMLElement>('[aria-selected="true"]') ?? el.querySelector<HTMLElement>('[role="option"]')));
  });
  function selKey(e: KeyboardEvent) {
    const list = e.currentTarget as HTMLElement;
    const opts = Array.from(list.querySelectorAll<HTMLElement>('[role="option"]'));
    const i = opts.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => focusOption(list, opts[Math.max(0, Math.min(opts.length - 1, n))]);
    if (e.key === 'Escape') closeSelect(true);
    else if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i < 0 ? opts.length - 1 : i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(opts.length - 1);
    else {
      // Tab: the list closes back to its field and the key goes on from there (to the next / previous
      // stop after the field) — no preventDefault
      if (e.key === 'Tab') closeSelect(true);
      return;
    }
    // the popover owns these keys: none reaches the board, the arrange keys or the app's Escape chain
    e.preventDefault();
    e.stopPropagation();
  }
  $effect(() => {
    void layoutSig;
    untrack(() => {
      sel = null;
    });
  });
  function onBoardScroll() {
    if (sel) sel = null;
  }

  // ── modifier (∿ on hover, "Edit modifier…" in the control menu): the docked modifier panel when one is
  //    mounted (same controller as before), else the flyout ──
  let modOpen = $state(false);
  let modLabel = $state('');
  let modTargetEid = $state<number | null>(null);
  let modTargetParam = $state<number | null>(null);
  function openMod(c: BeCtl) {
    if (c.kind !== 'cont') return;
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
  // Escape closes the flyout when nothing else took it. On the document in the bubble phase: after every
  // element that handles its own Escape (a menu, a field, a popover — they stop it or mark it handled), and
  // before the app's window Escape chain (close the editor in the monolith, restore a maximized panel),
  // which then never sees it. Focus usually stays on the ∿ button or the menu's opener, outside the flyout,
  // so the flyout cannot listen on itself. Another overlay open on top (a palette, a dialog) keeps the key.
  // While arranging the same listener then gives Escape to Arrange (close the library, cancel a drag,
  // leave Arrange — beArrange.escape) and the arrows / Delete to the selection; the flyout goes first.
  $effect(() => {
    if (!modOpen && !be.editMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (modOpen && e.key === 'Escape') {
        const flyout = document.querySelector('[data-screen-label="Modifier Editor"].flyout');
        const target = e.target instanceof Node ? e.target : null;
        const overlayOpen = Array.from(document.querySelectorAll(ESCAPE_OVERLAYS)).some((el) => !flyout?.contains(el) && isForeignOverlay(el, rootEl, layerEl));
        if (flyoutTakesEscape({ key: e.key, defaultPrevented: e.defaultPrevented, inFlyout: !!target && !!flyout?.contains(target), overlayOpen })) {
          e.preventDefault();
          e.stopPropagation();
          modOpen = false;
          return;
        }
      }
      if (!be.editMode || arr.escape(e)) return;
      arr.keydown(e);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

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
  /** Pin a control through the workbench pin action. No target = the default (⚡ click): a new custom panel
   *  named after the control, as the arrange ⌖ of the previous editor did (pinActionArgs). */
  async function pinControlToWorkbench(c: BeCtl, target?: AxisPinTarget) {
    if (!workbenchCanPin || !workbench || !pinnable(c)) return;
    const result = await workbench.registry.runActionResult(AXIS_PIN_SELECTED_PARAMETERS_ACTION, {
      controller: workbench.controller,
      source: 'menu',
      args: pinActionArgs(c, target)
    });
    if (result.success) editor.showToast(`Pinned ${c.label}${target?.panelId ? ` to ${target.label}` : ''}`, 'var(--accent)');
  }
  /** "New tab" beside the editor (control menu): the same action as a pin drag released on a tab bar. */
  function pinControlToTab(c: BeCtl, tab: PinTabTarget) {
    const source = parameterSourceForControl(c);
    if (!workbench || !source) return;
    const args = edgeDropArgs(serializeWorkbenchParameterSource(source), tab);
    void workbench.registry.runActionResult(AXIS_PARAMETER_SOURCE_EDGE_DROP_ACTION, { controller: workbench.controller, source: 'menu', args }).then((res) => {
      if (res.success) editor.showToast(`Pinned ${c.label} to a new tab`, 'var(--accent)');
    });
  }

  // hold-to-drag pin (mouse / pen): a still hold arms a pointer drag onto a panel, tab bar or dock edge;
  // a press on the tile's ⚡ starts the same drag after a few px of movement (no hold)
  let pinHold: { pointerId: number; c: BeCtl; x: number; y: number } | null = null;
  let pinHoldTimer: ReturnType<typeof setTimeout> | null = null;
  let pinPressAt: { pointerId: number; c: BeCtl; x: number; y: number } | null = null;
  let pinDrag = $state<{ pointerId: number; c: BeCtl; source: WorkbenchParameterSource; x: number; y: number; target: PinTarget | null } | null>(null);
  let pinLayerEl = $state<HTMLElement | null>(null);
  // the fixed layer's px are layout px under an ancestor zoom while pointer coords are visual
  const pinZoom = $derived.by(() => {
    void pinDrag;
    if (!pinLayerEl || !pinLayerEl.offsetWidth) return 1;
    const visual = pinLayerEl.getBoundingClientRect().width;
    return visual > 0 ? visual / pinLayerEl.offsetWidth : 1;
  });
  /** The pointer of the latest press on a tile (its long-press release is the one whose click is swallowed). */
  let pressPointer = -1;
  /** Capture phase of every press on a tile (outside Arrange): the press pointer, and the hold-to-drag pin. */
  function pinArm(e: PointerEvent, c: BeCtl) {
    pressPointer = e.pointerId;
    if (!workbenchCanPin || be.editMode || !pinnable(c)) return;
    if (e.pointerType === 'touch' || e.button !== 0) return; // touch = long-press menu
    if (ownedByOther(e.pointerId)) return;
    pinHold = { pointerId: e.pointerId, c, x: e.clientX, y: e.clientY };
    if (pinHoldTimer) clearTimeout(pinHoldTimer);
    pinHoldTimer = setTimeout(() => {
      pinHoldTimer = null;
      const h = pinHold;
      pinHold = null;
      if (h && !pinDrag) beginPinDrag(h.c, h.x, h.y, h.pointerId);
    }, PIN_HOLD_MS);
  }
  function cancelPinHold() {
    if (pinHoldTimer) {
      clearTimeout(pinHoldTimer);
      pinHoldTimer = null;
    }
    pinHold = null;
  }
  /** Press on a tile's ⚡ (any pointer): the tile's value drag and hold never start; movement past
   *  PIN_PRESS_DRAG begins the pin drag, a release without it leaves the click (pinClick) to pin. */
  function pinPress(e: PointerEvent, c: BeCtl) {
    e.stopPropagation();
    if (!workbenchCanPin || !pinnable(c) || e.button !== 0) return;
    e.preventDefault(); // no focus ring / text selection; the click still follows
    cancelPinHold(); // armed by the tile's capture handler
    pinPressAt = { pointerId: e.pointerId, c, x: e.clientX, y: e.clientY };
  }
  // no timer outlives the editor (a hold that crosses a block switch must not fire on a gone instance)
  $effect(() => () => {
    cancelPinHold();
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = null;
    if (flashItemTimer) clearTimeout(flashItemTimer);
    flashItemTimer = null;
  });
  function beginPinDrag(c: BeCtl, x: number, y: number, pointerId: number) {
    const source = parameterSourceForControl(c);
    if (!source) return;
    // the same press may have armed a value adjust + bubble: drop them (nothing was written yet)
    vd = null;
    tk = null;
    ctxMenu = null;
    pinDrag = { pointerId, c, source, x, y, target: resolvePinTarget(x, y) };
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
    const args = edgeDropArgs(serializeWorkbenchParameterSource(source), target);
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
  /** The finger that held a long-press is still down: the click its release may produce (a browser that
   *  saw no long-press of its own sends one) must not land on the menu's scrim and close the menu again.
   *  Only that click: the release of THIS pointer arms it, and a new press (a quick tap on a menu row)
   *  or 350 ms disarm it — the next click is swallowed only when it comes straight from the release. */
  function suppressClickAfterRelease(pointerId: number) {
    if (typeof window === 'undefined') return;
    const done = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return; // another finger's release
      window.removeEventListener('pointerup', done, true);
      window.removeEventListener('pointercancel', done, true);
      if (e.type !== 'pointerup') return;
      const off = () => {
        window.removeEventListener('click', swallow, true);
        window.removeEventListener('pointerdown', off, true);
        clearTimeout(timer);
      };
      const swallow = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
        off();
      };
      window.addEventListener('click', swallow, true);
      window.addEventListener('pointerdown', off, true);
      const timer = setTimeout(off, 350);
    };
    window.addEventListener('pointerup', done, true);
    window.addEventListener('pointercancel', done, true);
  }

  // ── control menu: right-click, long-press (touch), Shift+F10 / the ContextMenu key on a focused tile ──
  let ctxMenu = $state<{ itemId: string; key: string; pos: WorkbenchMenuPosition; tab: PinTabTarget | null } | null>(null);
  /** When the last menu opened: the contextmenu event a long-press or the menu key also fires is ignored. */
  let ctxOpenedAt = 0;
  const ctxItems = $derived.by<WorkbenchMenuItem[]>(() => {
    const m = ctxMenu;
    const c = m ? catByKey.get(m.key) : undefined;
    return m && c ? controlMenuItems(c, m.itemId, m.tab) : [];
  });
  function controlMenuItems(c: BeCtl, itemId: string, tab: PinTabTarget | null): WorkbenchMenuItem[] {
    const b = be.board;
    const f = b ? locate(b, itemId) : null;
    const it = f && !isDivider(f.item) ? f.item : null;
    const canPinIt = workbenchCanPin && !!workbench && pinnable(c);
    return buildControlMenu(
      {
        ctl: c,
        item: it ? { id: it.id, view: it.view, w: it.w, h: it.h } : null,
        page: f?.page ?? '',
        pageOrder: b?.pageOrder ?? [],
        pagesWithKey: new Set(pagesOf(b, c.key)),
        fixedCols: b?.fixed?.cols ?? null,
        canLayout: canArrangeOn(deviceClass),
        pinTargets: canPinIt && workbench ? pinTargetsFor(workbench.controller.document, c) : null,
        newTab: canPinIt && !!tab,
        canSwipe: c.kind === 'cont' && knobById.has(c.id),
        swipe: c.kind === 'cont' && editor.isSwipeControl(c.id),
        swipeSupported: !!editor.canSwipeControl,
        // a graph's notes (what it draws and what not): the tooltip does not reach touch
        notes: c.kind === 'graph' && c.visual ? graphPlot(c.visual, { knob: host.knob, enm: host.enm, typeName: host.typeName, bpm: host.bpm, hasTempo: host.hasTempo }).notes : undefined
      },
      {
        pinNewTab: () => {
          if (tab) pinControlToTab(c, tab);
        },
        modifier: () => openMod(c),
        view: (v) => arr.view(v, itemId),
        size: (w, h) => arr.size(w, h, itemId),
        move: (pg) => arr.moveTo(itemId, pg),
        swipe: () => toggleSwipe(c),
        remove: () => arr.remove(itemId)
      }
    );
  }
  /** "Pin to ▸" targets: the workbench's custom panels (each told apart by where it is) and a new one. */
  function pinTargetsFor(doc: WorkbenchDocument, c: BeCtl): WorkbenchMenuItem[] {
    return placePinTargets(
      buildAxisPinMenuItems(doc, (target) => void pinControlToWorkbench(c, target)),
      (panelId) => pinPanelPlace(doc, panelId)
    );
  }
  function pinPanelPlace(doc: WorkbenchDocument, panelId: string): PinPanelPlace {
    const layout = selectActiveLayout(doc);
    const at = selectPanelPlacement(layout, panelId);
    if (!at || at.kind === 'parked') return { kind: 'parked' };
    if (at.pageId === selectActivePage(doc)?.id) return { kind: 'here', region: selectPanelLocation(doc, panelId)?.region };
    return { kind: 'page', page: layout?.pages[at.pageId]?.label || at.pageId };
  }
  function openCtx(item: BeItem, c: BeCtl, pos: WorkbenchMenuPosition): boolean {
    if (isDivider(item)) return false;
    const tab = workbenchCanPin && pinnable(c) ? editorTabTarget(rootEl) : null;
    if (!controlMenuItems(c, item.id, tab).length) return false; // nothing to offer (e.g. a meter on a phone)
    cancelGestures();
    sel = null;
    moreOpen = false;
    modOpen = false; // the menu takes over from an open modifier flyout (and its Escape)
    ctxOpenedAt = Date.now();
    ctxMenu = { itemId: item.id, key: c.key, pos, tab };
    return true;
  }
  /** Long-press (touch / pen): the menu only on a still press that started nothing else — never while
   *  arranging, during the pen's hold-drag or a ⚡ press, or once a value drag moved. */
  function ctxHold(item: BeItem, c: BeCtl, at: WorkbenchMenuPosition) {
    if (!longPressOpensMenu({ editMode: be.editMode, pinDrag: !!pinDrag, pinPress: !!pinPressAt, arrange: arr.busy, valueMoved: !!vd?.moved })) return;
    if (openCtx(item, c, at)) suppressClickAfterRelease(pressPointer);
  }
  // a menu whose rows are gone (the control left the catalog, the board reloaded) closes for good
  $effect(() => {
    if (ctxMenu && ctxItems.length === 0) ctxMenu = null;
  });
  /** The menu at a tile (keyboard, or a contextmenu event without pointer coordinates). */
  function tilePos(tile: HTMLElement): WorkbenchMenuPosition {
    const r = tile.getBoundingClientRect();
    return { x: r.left + Math.min(16, r.width / 2), y: r.bottom - 4 };
  }
  function ctxContext(e: MouseEvent, item: BeItem, c: BeCtl, tile: HTMLElement) {
    if (isDivider(item) || isEditableTarget(e.target as HTMLElement | null)) return; // a value field keeps the browser menu
    e.preventDefault();
    if (isEchoContextMenu(!!ctxMenu, ctxOpenedAt, Date.now())) return; // the long-press / menu key already opened it
    openCtx(item, c, menuAtTile(e) ? tilePos(tile) : menuPositionFromPointer(e));
  }
  function ctxKey(e: KeyboardEvent, item: BeItem, c: BeCtl, tile: HTMLElement) {
    if (!isControlMenuKey(e) || isEditableTarget(e.target as HTMLElement | null)) return;
    e.preventDefault();
    e.stopPropagation();
    openCtx(item, c, tilePos(tile));
  }
  function closeCtx() {
    ctxMenu = null;
  }

  // the menu's board changes (View / Size / Move / Remove) go through the Arrange controller in both modes:
  // one save each (BeState.commit; an undo step only while arranging), Auto-packed where it applies, the
  // active page kept where it is on screen.
  function toggleSwipe(c: BeCtl) {
    const p = knobById.get(c.id);
    if (!p) return;
    const was = editor.isSwipeControl(c.id);
    editor.toggleSwipeControl(p);
    const now = editor.isSwipeControl(c.id);
    if (now === was) return; // the surface kept nothing (no block family): no toast that claims otherwise
    editor.showToast(now ? `${c.label} is now a grid swipe control` : `${c.label} is no longer a grid swipe control`, 'var(--amber)');
  }
  /** Pinnable parameter ids of a page (drawn controls only). */
  const pagePins = (page: string): number[] => pagePinIds(pages.find((p) => p.page === page)?.items ?? [], catByKey);
  /** "Pin page as panel" (Page ▾): the page's controls into a new workbench custom panel — the action the
   *  previous editor's "Pin page" button used. */
  async function pinPageToWorkbench(page: string) {
    if (!workbenchCanPin || !workbench) return;
    const paramIds = pagePins(page);
    if (!paramIds.length) return;
    const block = editor.selected?.display ?? (typeName || 'Block');
    const result = await workbench.registry.runActionResult(AXIS_PIN_SELECTED_PARAMETERS_ACTION, {
      controller: workbench.controller,
      source: 'host',
      args: { paramIds, title: `${block} · ${page}` }
    });
    if (result.success) editor.showToast(`Pinned ${paramIds.length} controls of ${page} as a panel`, 'var(--accent)');
  }

  // ── the arrange bar: the selection's tools, the page menu, the "Add" library ──
  const arrSel = $derived.by(() => {
    const id = arr.sel;
    const b = board;
    if (!be.editMode || !id || !b) return null;
    const it = locate(b, id)?.item ?? null;
    const c = it && !isDivider(it) ? catByKey.get(it.key) : undefined;
    const cont = !!c && c.kind === 'cont' && knobById.has(c.id);
    return arrangeSelection({
      item: it,
      ctl: c,
      canPin: workbenchCanPin && !!workbench && pinnable(c),
      canSwipe: cont && !!editor.canSwipeControl,
      swipe: cont && !!c && editor.isSwipeControl(c.id)
    });
  });
  function selCtl(): BeCtl | undefined {
    return arrSel?.kind === 'control' ? catByKey.get(arrSel.key) : undefined;
  }
  const barActions: BarActions = {
    view: (v) => arr.view(v),
    size: (w, h) => arr.size(w, h),
    pin: () => {
      const c = selCtl();
      if (c) void pinControlToWorkbench(c);
    },
    swipe: () => {
      const c = selCtl();
      if (c) toggleSwipe(c);
    },
    remove: () => arr.remove(),
    label: (id, text) => arr.label(id, text),
    rotate: () => arr.rotate(),
    undo: () => arr.undo(),
    add: () => (arr.libOpen = !arr.libOpen),
    divider: (kind) => arr.addDivider(kind),
    closeGaps: () => arr.closeGaps(),
    tidy: () => arr.tidyUp(),
    autoPack: (on) => be.setAutoPack(on),
    addFixed: () => arr.addFixedArea()
  };
  /** Where the bar's tools and the library act: the current page, or the fixed area while it is selected. */
  const barTarget = $derived(arr.target || (board?.page ?? ''));
  const selFixed = $derived(!!arr.sel && !!board && locate(board, arr.sel)?.page === FIXED_PAGE);
  const pageMenuItems = $derived.by<WorkbenchMenuItem[]>(() => {
    const b = board;
    if (!be.editMode || !b) return [];
    const page = b.page;
    return buildPageMenu(
      { page, pageOrder: b.pageOrder, nav, canPin: workbenchCanPin && !!workbench, pinCount: pagePins(page).length },
      {
        rename: (name) => arr.renamePage(page, name),
        duplicate: () => arr.duplicatePage(page),
        pin: () => void pinPageToWorkbench(page),
        move: (delta) => arr.movePage(delta, page),
        remove: () => arr.deletePage(page),
        add: () => arr.addPage()
      }
    );
  });
  // the bar's Page ▾ / ⋯ menus (rendered in the overlay layer below)
  let barMenu = $state<'page' | 'more' | null>(null);
  let barPageAnchor = $state<HTMLElement | null>(null);
  let barMoreAnchor = $state<HTMLElement | null>(null);
  let barOverflow = $state<BarPart[]>([]);
  const barMoreItems = $derived(
    barMenu === 'more' && be.editMode ? buildBarOverflow(barOverflow, { sel: arrSel, canUndo: be.canUndo, autoPack: be.autoPack, pageItems: pageMenuItems, page: board?.page ?? '', target: pageLabel(barTarget), selFixed }, barActions) : []
  );
  let libQuery = $state('');
  let libFilter = $state<FindFilter>('all');
  let libAnchor = $state<HTMLElement | null>(null);
  let barEl = $state<HTMLElement | null>(null);
  const libGroups = $derived(arr.libOpen && be.editMode ? findGroups(catalog, board, libQuery, libFilter, barTarget) : []);
  function libMeta(key: string): string {
    const c = catByKey.get(key);
    return c ? `${VIEW_NAME[c.view]} ${c.w}×${c.h}` : '';
  }
  /** The empty page's "Arrange": start arranging with the library open (something to add). */
  function arrangeAndAdd() {
    setEdit(true);
    arr.libOpen = true;
  }

  // ── the tiles' host ──
  const host: BeHost = {
    get editMode() {
      return be.editMode;
    },
    get flashId() {
      return flashId;
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
    selectMenuId: selMenuId,
    get dragId() {
      return arr.drag?.id ?? null;
    },
    get selectedId() {
      return be.editMode ? arr.sel : null;
    },
    get resizingId() {
      return arr.resizing;
    },
    get touchArrange() {
      return deviceClass === 'tablet';
    },
    get touchTargets() {
      return deviceClass !== 'desktop';
    },
    get scrollAxis() {
      return scrollAxisOf(boardNav);
    },
    get fixedScrollAxis() {
      return fixedAxis;
    },
    get canPin() {
      return workbenchCanPin;
    },
    get eqBands() {
      return eqBands;
    },
    eqBandsFor: (view) => eqStyles.find((style) => style.view === view)?.bands,
    eqTitleFor: (view) => eqStyles.find((style) => style.view === view)?.title,
    eqGainRangeFor: (view) => eqStyles.find((style) => style.view === view)?.gainRange,
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
    get bpm() {
      return editor.bpm;
    },
    get hasTempo() {
      return editor.hasTempo;
    },
    get typeName() {
      return editor.blockType?.name ?? null;
    },
    get clock() {
      return clock;
    },
    get animate() {
      return animate;
    },
    playhead: setPlayhead,
    isLiveMeter: (ctl) => ctl.id < 0 || (!!ctl.meterParamName && !!editor.hasBlockMonitor?.(ctl.meterParamName)),
    observeTileTelemetry,
    get meteringOn() {
      return meteringOn;
    },
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
    hover: (c) => {
      if (!isPhone && !be.editMode && c.id >= 0) void showParamHelp(c.id, c.label);
    },
    unhover: clearParamHelp,
    openMod,
    pinArm,
    pinPress,
    pinClick: (c) => void pinControlToWorkbench(c),
    pinnable,
    ctxMenu: ctxContext,
    ctxLongPress: ctxHold,
    ctxKey,
    resizeDown: (e, id, tile) => arr.resizeDown(e, id, tile)
  };
  setBeHost(host);

    const RESULT_CELL = 40;
  const RESULT_GAP = 4;
</script>

<div class="be-root" style:--be-accent={accent || undefined} class:phone={isPhone} bind:this={rootEl} bind:clientWidth={rootW} bind:clientHeight={rootH}>
  <BeHeader
    {block}
    {nav}
    phone={isPhone}
    touch={deviceClass !== 'desktop'}
    bind:width={headW}
    pages={board?.pageOrder ?? []}
    {active}
    {highlight}
    editMode={be.editMode}
    renaming={renamingPage}
    onGo={goPage}
    onStartRename={(pg) => (renamingPage = pg)}
    onRename={renamePage}
    onCancelRename={() => (renamingPage = null)}
    onAdd={addPage}
    {moreOpen}
    moreDot={custom}
    bind:moreAnchor
    onMore={() => (moreOpen = !moreOpen)}
    bypassModeOpen={bmOpen}
    bind:bypassModeAnchor={bmAnchor}
    onBypassMode={() => (bmOpen = !bmOpen)}
    {blockLibraryOpen}
    bind:blockLibraryAnchor
    onBlockLibrary={blockLibraryAvailable ? toggleBlockLibrary : undefined}
    search={findField}
    end={headerEnd}
  />
  {#snippet findField()}
    <BeFind
      bind:query={q}
      bind:filter={findFilter}
      bind:open={findOpen}
      touch={deviceClass !== 'desktop'}
      groups={findList}
      current={board?.page ?? ''}
      canPin={workbenchCanPin}
      {resultsOpen}
      preview={findPreview}
      onJump={jumpTo}
      onPin={findPin}
      onShowAll={() => (resultsOpen = true)}
      onOpen={() => setEdit(false)}
    />
  {/snippet}

  {#if showMessage}
    <div class="be-msg" data-be-message><p>{message}</p></div>
  {:else if resultsOpen}
    <!-- flat search results: every matching control, each in its configured view, operable in place -->
    <div class="be-resbar">
      <span class="be-restag">RESULTS</span>
      <span class="be-resnote">{matches.length} control{matches.length === 1 ? '' : 's'}{q.trim() ? ` matching “${q.trim()}”` : ''}</span>
      <span class="be-absp"></span>
      <button class="be-abbtn" type="button" data-be-results-close onclick={() => (resultsOpen = false)}>✕ Back to the board</button>
    </div>
    <div class="be-results" data-be-results>
      {#each matches as c (c.key)}
        {@const it = resultItem(c)}
        <BeControl item={it} ctl={c} pos={it} c={RESULT_CELL} g={RESULT_GAP} standalone />
      {/each}
      {#if matches.length === 0}<div class="be-nores">No controls match “{q.trim()}”.</div>{/if}
    </div>
  {:else}
    {#if be.editMode}
      <BeArrangeBar
        sel={arrSel}
        canUndo={be.canUndo}
        autoPack={be.autoPack}
        page={board?.page ?? ''}
        target={pageInText(barTarget)}
        {selFixed}
        canAddFixed={!!board && !board.fixed}
        touch={deviceClass === 'tablet'}
        libOpen={arr.libOpen}
        labelFocus={arr.labelFocus}
        actions={barActions}
        onDone={() => setEdit(false)}
        bind:menu={barMenu}
        bind:pageAnchor={barPageAnchor}
        bind:moreAnchor={barMoreAnchor}
        bind:overflow={barOverflow}
        bind:libAnchor
        bind:barEl
      />
    {/if}

    <div class="be-body" class:side={nav === 'side'}>
      {#if nav === 'side' && board}
        <BePageNav
          variant="list"
          pages={board.pageOrder}
          {active}
          {highlight}
          editMode={be.editMode}
          renaming={renamingPage}
          width={listW}
          onGo={goPage}
          onStartRename={(pg) => (renamingPage = pg)}
          onRename={renamePage}
          onCancelRename={() => (renamingPage = null)}
          onAdd={addPage}
        />
      {/if}
      <!-- pages and fixed area: the area sits outside the pages' scroller (never scrolls with them) -->
      <div class="be-main" class:band={fixedLay?.place === 'band'} bind:clientWidth={mainW} bind:clientHeight={mainH}>
        <div class="be-pages">
          <BeBoard
            bind:this={boardRef}
            {pages}
            {layouts}
            nav={boardNav}
            phone={phoneBoard}
            endPad={endPadOver(PHONE_END_PAD, bandH)}
            anchorWidth={fixedLay?.place === 'column' && be.editMode ? mainW : undefined}
            preserveStripOffset={fixedLay?.place === 'band'}
            editMode={be.editMode}
            {highlight}
            {active}
            {flashPage}
            catalog={catByKey}
            ghost={arr.drag?.target ?? null}
            dragging={!!arr.drag || arr.sizingFixed}
            canArrange={!isPhone}
            onMeasure={(w, h) => {
              bodyW = w;
              bodyH = h;
            }}
            {onVisible}
            onScroll={onBoardScroll}
            onBackgroundDown={() => {
              if (be.editMode) arr.select(null); // a press on empty grid clears the selection
            }}
            onArrange={arrangeAndAdd}
          />
        </div>
        {#if fixedLay && board?.fixed}
          <BeFixed
            bind:this={fixedRef}
            bind:height={fixedH}
            bind:overflowY={fixedOverflows}
            layout={fixedLay}
            items={fixedItems}
            cols={board.fixed.cols}
            allItems={board.fixed.items}
            nav={boardNav}
            editMode={be.editMode}
            target={barTarget === FIXED_PAGE}
            catalog={catByKey}
            ghost={arr.drag?.target ?? null}
            sizing={arr.sizingFixed}
            touch={deviceClass === 'tablet'}
            dockGutter={inWorkbench}
            avoidDockOpener={deviceClass === 'tablet' && inWorkbench}
            safeBottom={isPhone && !inWorkbench}
            maxCols={fixedMaxCols}
            {mainH}
            {resetKey}
            onScroll={onBoardScroll}
            onBackgroundDown={() => {
              if (be.editMode) arr.select(null, true); // the area becomes the target of the tools
            }}
            onColsDown={(e, el, limits) => fixedLay && arr.colsDown(e, el, fixedLay.c + fixedLay.g, fixedLay.place === 'column' ? -1 : 1, limits)}
            onColsKey={(e, limits) => arr.colsKey(e, fixedLay?.place === 'band' ? 1 : -1, limits)}
            onRemove={() => arr.removeFixedArea()}
          />
        {/if}
      </div>
    </div>

  {/if}
</div>

<!-- floating parts: one fixed layer in the OVERLAY band, the pin-drag chip in the DRAG band; in the
     workbench both move to the shell root (overlayLayer.ts). Inside a layer the parts order themselves
     with small local z-indexes. -->
<div class="be-layer-src">
  <div class="be-layer" bind:this={layerEl} use:beLayer={'overlay'}>
    <!-- the "Add" library of Arrange (the menus below stack above it) -->
    {#if be.editMode}
      <BeLibrary
        open={arr.libOpen}
        anchor={libAnchor}
        floor={barEl}
        groups={libGroups}
        page={barTarget}
        bind:query={libQuery}
        bind:filter={libFilter}
        touch={deviceClass === 'tablet'}
        fading={!!arr.drag && arr.drag.id == null}
        meta={libMeta}
        onAdd={(key) => arr.add(key)}
        onPress={(e, key) => arr.libPress(e, key)}
        onEscape={() => arr.libraryEscape() === 'library'}
        onClose={() => (arr.libOpen = false)}
      />
    {/if}

    <!-- ⋯ menu: arrange · navigation · control size · layout · block (opens under the trigger) -->
    <BeMenu open={moreOpen} items={moreItems} anchor={moreAnchor} touch={isPhone} label="Block and layout options" onClose={() => (moreOpen = false)} />
    <BeMenu
      open={blockLibraryOpen && blockLibraryAvailable}
      items={[
        { id: 'load', label: 'Load from Library', run: () => editor.openBlockLibrary?.('browse') },
        { id: 'save', label: 'Save to Library', run: () => editor.openBlockLibrary?.('save') }
      ]}
      anchor={blockLibraryAnchor}
      touch={deviceClass !== 'desktop'}
      label="Block library"
      onClose={() => (blockLibraryOpen = false)}
    />

    <!-- Bypass mode ▾ (header): the block's own modes as radio rows, opens under the control -->
    <BeMenu open={bmOpen && bmItems.length > 0} items={bmItems} anchor={bmAnchor} touch={deviceClass !== 'desktop'} label="Bypass mode" onClose={() => (bmOpen = false)} />

    <!-- the arrange bar's Page ▾ and ⋯ (the tools that did not fit the row) -->
    <BeMenu open={barMenu === 'page'} items={pageMenuItems} anchor={barPageAnchor} touch={deviceClass === 'tablet'} label="Page options" onClose={() => (barMenu = null)} />
    <BeMenu open={barMenu === 'more'} items={barMoreItems} anchor={barMoreAnchor} touch={deviceClass === 'tablet'} label="More arrange tools" onClose={() => (barMenu = null)} />


    <!-- select popover -->
    {#if sel && selEnum}
      {@const en = selEnum}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="be-selbg" onpointerdown={() => (sel = null)}></div>
      <div
        bind:this={selMenuEl}
        id={selMenuId}
        class="be-selmenu"
        class:up={sel.up}
        class:touch={host.touchTargets}
        role="listbox"
        tabindex="-1"
        aria-label={catByKey.get(`e${en.id}`)?.label ?? en.name}
        data-be-select-menu
        style:left="{sel.left}px"
        style:top="{sel.top}px"
        style:width="{sel.width}px"
        onkeydown={selKey}
      >
        {#each en.options as o (o.value)}
          <button
            class="be-selopt"
            class:on={o.value === en.value}
            type="button"
            role="option"
            aria-selected={o.value === en.value}
            tabindex={o.value === (selFocus ?? en.value) ? 0 : -1}
            data-be-option={o.label}
            onfocus={() => (selFocus = o.value)}
            onclick={() => {
              editor.setEnum(en, o.value);
              closeSelect(true);
            }}>{o.label}</button
          >
        {/each}
      </div>
    {/if}

    <!-- modifier editor flyout (opened from a control's ∿ badge) -->
    <ModifierFlyout open={modOpen} label={modLabel} targetEffectId={modTargetEid} targetParam={modTargetParam} onClose={() => (modOpen = false)} />

    <!-- control menu: right-click, long-press (touch), Shift+F10 / the ContextMenu key on a focused tile -->
    <BeMenu open={!!ctxMenu && ctxItems.length > 0} items={ctxItems} position={ctxMenu?.pos ?? { x: 0, y: 0 }} touch={isPhone} label="Control options" onClose={closeCtx} />
  </div>

  <!-- pin-drag overlay (380 ms hold on a tile, or a press-drag on ⚡): inert, so elementFromPoint reaches
       the real drop zones -->
  <div class="be-layer" use:beLayer={'drag'}>
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
            <span class="be-pintarget reject">⊘ drop on a panel, tab bar or dock edge</span>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

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
    /* in-panel z-indexes (tiles, reflow hint) stay local to the board */
    isolation: isolate;
  }
  .be-main {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: row;
  }
  .be-main.band {
    flex-direction: column;
  }
  .be-pages {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
  }
  .be-layer-src {
    display: contents;
  }
  /* a floating layer: a fixed, zero-size box; its band comes from overlayLayer.ts */
  .be-layer {
    position: fixed;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
  }

  .be-body.side {
    flex-direction: row;
  }
  .be-msg {
    flex: 1;
    min-height: 0;
    display: grid;
    place-items: center;
    padding: 16px;
    color: var(--textdim);
    font: 500 13px/1.5 var(--font-ui);
    text-align: center;
  }

  /* ── flat search results bar ── */
  .be-resbar {
    flex: none;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--surface2);
  }
  .be-restag {
    font: 700 9.5px/1 var(--font-mono);
    letter-spacing: 0.14em;
    color: var(--accentbright);
  }
  .be-resnote {
    font: 500 11.5px/1.3 var(--font-ui);
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

  /* ── search results ── */
  .be-results {
    isolation: isolate;
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


  /* ── select popover ── */
  .be-selbg {
    position: fixed;
    inset: 0;
    z-index: 1;
  }
  .be-selmenu {
    position: fixed;
    box-sizing: border-box;
    z-index: 2;
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
  /* phone / tablet: 40 px rows */
  .be-selmenu.touch .be-selopt {
    min-height: 40px;
  }
  .be-selopt:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .be-selmenu:focus {
    outline: none;
  }
  .be-selopt.on {
    color: var(--accentbright);
    background: var(--accent-tint);
  }

  /* ── hold-to-drag pin overlay ── */
  .be-pinlayer {
    position: fixed;
    inset: 0;
    z-index: 1;
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