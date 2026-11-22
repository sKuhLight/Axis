<script lang="ts">
  // The Block Editor board: every page of the board at once, as one scroll area.
  //   top  — pages side by side in a horizontal strip, the page name on a vertical spine in front of each;
  //          a vertical wheel scrolls sideways, no snapping.
  //   side — pages stacked, each at least one board high, snapping page by page; the name as a rule.
  // Scrollbars are hidden; a mouse / pen drag on empty board area pans (touch scrolls natively). The
  // pages at least half in view are reported up (tab highlight, active page).
  import BeControl from './BeControl.svelte';
  import type { BeNav, PageLayout } from './boardGeometry';
  import { PAD_X, PAD_Y } from './boardGeometry';
  import { isDivider, type BeItem } from './boardModel';
  import type { BeCtl } from './catalog';
  import { untrack } from 'svelte';
  import { anchorKey, scrollTargetFor, sectionExtents, SPINE_GAP, SPINE_W, STRIP_PAD_FIRST, STRIP_PAD_LEFT, STRIP_PAD_RIGHT, visiblePages, wheelToStrip, autoScrollDelta, type BoardPage } from './boardView';
  import { effectiveZoom } from '../workbench';
  import type { BeGhost } from './beHost';

  let {
    pages,
    layouts,
    nav,
    editMode,
    highlight,
    active = '',
    flashPage = null,
    catalog,
    ghost = null,
    dragging = false,
    canArrange = true,
    onMeasure,
    onVisible,
    onScroll,
    onBackgroundDown,
    onArrange
  }: {
    pages: BoardPage[];
    layouts: Record<string, PageLayout>;
    nav: BeNav;
    editMode: boolean;
    /** Pages highlighted as visible. */
    highlight: Set<string>;
    /** Current page: brought into view when the board first mounts. */
    active?: string;
    flashPage?: string | null;
    catalog: ReadonlyMap<string, BeCtl>;
    ghost?: BeGhost | null;
    /** An arrange drag is running (no snapping meanwhile). */
    dragging?: boolean;
    /** The empty-page hint offers "Arrange" (not on the phone layout). */
    canArrange?: boolean;
    onMeasure: (w: number, h: number) => void;
    onVisible: (pages: string[]) => void;
    onScroll: () => void;
    onBackgroundDown: () => void;
    onArrange: () => void;
  } = $props();

  let el = $state<HTMLElement | null>(null);
  let bodyW = $state(0);
  let bodyH = $state(0);
  let panning = $state(false);

  /** An empty page (normal mode) shows a hint instead of its one-cell grid, so it gets room for it. */
  const EMPTY_PAGE_W = 260;
  const emptyHint = (p: BoardPage): boolean => !p.items.length && !editMode;
  const secInputs = $derived(
    pages.map((p) => ({ page: p.page, W: emptyHint(p) ? EMPTY_PAGE_W : (layouts[p.page]?.W ?? 0), H: layouts[p.page]?.H ?? 0 }))
  );
  const sections = $derived(sectionExtents(nav, secInputs, bodyH));
  const sizeOf = $derived(new Map(sections.map((s) => [s.page, s.size])));
  const anyOverflowX = $derived(Object.values(layouts).some((L) => L.overflowX));
  const anyOverflowY = $derived(Object.values(layouts).some((L) => L.overflowY));
  const anyReflow = $derived(Object.values(layouts).some((L) => L.reflow));
  const drawn = (p: BoardPage): BeItem[] => p.items as BeItem[];

  function viewport(): { start: number; size: number } {
    if (!el) return { start: 0, size: 0 };
    return nav === 'top' ? { start: el.scrollLeft, size: el.clientWidth } : { start: el.scrollTop, size: el.clientHeight };
  }
  // Nothing is reported before the first measure has scrolled the current page into view, so mounting
  // (or re-mounting after a search) never moves the active page to whatever sits at scroll position 0.
  let positioned = false;
  function report() {
    if (!el || !positioned) return;
    onVisible(visiblePages(sections, viewport()));
  }

  /** Bring a page to the start of the board. */
  export function scrollToPage(page: string, smooth: boolean): void {
    if (!el) return;
    const t = scrollTargetFor(sections, page, nav === 'top' ? el.clientWidth : el.clientHeight);
    if (t == null) return;
    const opt: ScrollToOptions = nav === 'top' ? { left: t } : { top: t };
    try {
      el.scrollTo({ ...opt, behavior: smooth ? 'smooth' : 'auto' });
    } catch {
      if (nav === 'top') el.scrollLeft = t;
      else el.scrollTop = t;
    }
  }

  /** Scroll a little while an arrange drag nears an edge of the board. */
  export function autoScroll(px: number, py: number): void {
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.scrollLeft += autoScrollDelta(px, r.left, r.right);
    el.scrollTop += autoScrollDelta(py, r.top, r.bottom);
  }

  // measure the board (layout px: client sizes are unaffected by an ancestor zoom)
  $effect(() => {
    const node = el;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      bodyW = node.clientWidth;
      bodyH = node.clientHeight;
      onMeasure(node.clientWidth, node.clientHeight);
      if (!positioned) {
        requestAnimationFrame(() => {
          scrollToPage(active, false);
          positioned = true;
          report();
        });
      }
      // otherwise nothing is reported here: the sections are still the old ones; the effect below
      // re-anchors and reports once the layout has followed the new size
    });
    ro.observe(node);
    return () => ro.disconnect();
  });

  // Sections moved (layout change, page switch, navigation switch) → recompute what is in view. When the
  // geometry the scroll offset belongs to changed (navigation, board size, cell size: a panel resize, the
  // control size, a reload), the active page is first brought back to the start of the board — else the
  // old offset lands between pages and the active tab drifts to a neighbour. Not while a pan or an
  // arrange drag runs.
  let anchor = '';
  $effect(() => {
    void sections;
    const key = anchorKey(nav, bodyW, bodyH, layouts);
    untrack(() => {
      if (positioned && anchor && key !== anchor && !pan && !dragging) scrollToPage(active, false);
      anchor = key;
      report();
    });
  });

  // a vertical wheel scrolls the strip sideways (non-passive: it may prevent the default)
  $effect(() => {
    const node = el;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      const d = wheelToStrip(nav, e, node);
      if (d == null) return;
      e.preventDefault();
      node.scrollLeft += d;
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  });

  // mouse / pen: drag on empty board area pans; touch keeps native scrolling
  let pan: { sx: number; sy: number; sl: number; st: number; z: number; moved: boolean } | null = null;
  function onDown(e: PointerEvent) {
    const t = e.target as HTMLElement | null;
    if (!t?.closest?.('[data-be-item]')) onBackgroundDown();
    if (!el || e.pointerType === 'touch' || e.button !== 0) return;
    if (t?.closest?.('[data-be-item], button, input, select, [role="slider"]')) return;
    if (el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1) return;
    const r = el.getBoundingClientRect();
    pan = { sx: e.clientX, sy: e.clientY, sl: el.scrollLeft, st: el.scrollTop, z: effectiveZoom(r.width, el.offsetWidth), moved: false };
  }
  $effect(() => {
    const move = (e: PointerEvent) => {
      const p = pan;
      if (!p || !el) return;
      const dx = e.clientX - p.sx;
      const dy = e.clientY - p.sy;
      if (!p.moved) {
        if (Math.abs(dx) + Math.abs(dy) < 4) return;
        p.moved = true;
        panning = true;
      }
      e.preventDefault();
      el.scrollLeft = p.sl - dx / p.z;
      el.scrollTop = p.st - dy / p.z;
    };
    const end = () => {
      if (!pan) return;
      pan = null;
      panning = false;
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  });

  const scrollable = $derived(anyOverflowX || anyOverflowY || pages.length > 1);
  const allFit = $derived(!anyOverflowY);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={el}
  class="be-board"
  class:top={nav === 'top'}
  class:side={nav === 'side'}
  class:panning
  class:grab={scrollable}
  class:ovx={anyOverflowX}
  class:ovy={anyOverflowY}
  class:snap={nav === 'side' && !dragging && !panning}
  class:snapfit={allFit}
  data-be-board
  data-nav={nav}
  onscroll={() => {
    onScroll();
    report();
  }}
  onpointerdown={onDown}
>
  {#each pages as p, i (p.page)}
    {@const L = layouts[p.page]}
    {@const seen = highlight.has(p.page)}
    {#if L}
      <section
        class="be-sec"
        class:flash={flashPage === p.page}
        class:seen
        data-be-page={p.page}
        aria-label={p.page}
        style:width={nav === 'top' ? `${sizeOf.get(p.page) ?? 0}px` : null}
        style:height={nav === 'side' ? `${sizeOf.get(p.page) ?? 0}px` : null}
        style:padding={nav === 'top' ? `${PAD_Y}px ${STRIP_PAD_RIGHT}px ${PAD_Y}px ${i === 0 ? STRIP_PAD_FIRST : STRIP_PAD_LEFT}px` : `${PAD_Y}px ${PAD_X}px`}
      >
        {#if nav === 'top'}
          <div class="be-spine" style:width="{SPINE_W}px" style:margin-right="{SPINE_GAP}px">
            <span class="be-spine-name">{p.page}</span>
            <span class="be-spine-line"></span>
          </div>
        {:else}
          <div class="be-sechead">
            <span class="be-secname">{p.page}</span>
            <span class="be-secline"></span>
          </div>
        {/if}
        <div class="be-inner" class:empty={emptyHint(p)}>
          {#if emptyHint(p)}
            <div class="be-empty" data-be-empty>
              <span>This page is empty.</span>
              {#if canArrange}<button type="button" class="be-empty-btn" onclick={onArrange}>✥ Arrange</button>{/if}
            </div>
          {:else}
          <div
            class="be-grid"
            class:arrange={editMode}
            data-be-grid
            data-page={p.page}
            data-c={L.c}
            data-g={L.g}
            data-cols={L.cols}
            data-rows={L.rows}
            style:grid-template-columns="repeat({L.cols}, {L.c}px)"
            style:grid-template-rows="repeat({L.rows}, {L.c}px)"
            style:gap="{L.g}px"
            style:width="{L.W}px"
            style:height="{L.H}px"
            style:--st="{L.c + L.g}px"
            style:--ctr="{(L.c + L.g / 2).toFixed(1)}px"
          >
            {#each drawn(p) as it (it.id)}
              {@const pos = L.pos ? L.pos[it.id] : it}
              {#if pos}
                <BeControl item={it} ctl={isDivider(it) ? undefined : catalog.get(it.key)} {pos} c={L.c} g={L.g} page={p.page} />
              {/if}
            {/each}
            {#if ghost && ghost.page === p.page}
              <div class="be-ghost" class:bad={!ghost.valid} style:grid-column="{ghost.x + 1} / span {ghost.w}" style:grid-row="{ghost.y + 1} / span {ghost.h}"></div>
            {/if}
          </div>
          {#if !p.items.length}<div class="be-empty arr">Empty page — add controls below</div>{/if}
          {/if}
        </div>
      </section>
    {/if}
  {/each}
</div>
{#if anyReflow && !editMode}
  <div class="be-reflow">COMPACT VIEW · WIDEN FOR FULL LAYOUT</div>
{/if}

<style>
  .be-board {
    flex: 1;
    min-width: 0;
    min-height: 0;
    position: relative;
    scrollbar-width: none;
  }
  .be-board::-webkit-scrollbar {
    display: none;
  }
  .be-board.top {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .be-board.top.ovy {
    overflow-y: auto;
  }
  .be-board.side {
    overflow-y: auto;
    overflow-x: hidden;
  }
  .be-board.side.ovx {
    overflow-x: auto;
  }
  .be-board.side.snap {
    scroll-snap-type: y proximity;
  }
  .be-board.side.snap.snapfit {
    scroll-snap-type: y mandatory;
  }
  .be-board.grab {
    cursor: grab;
  }
  .be-board.panning {
    cursor: grabbing;
    user-select: none;
  }
  .be-sec {
    flex: none;
    box-sizing: border-box;
    display: flex;
    border-radius: 10px;
  }
  .be-board.top .be-sec {
    flex-direction: row;
    min-height: 100%;
  }
  .be-board.side .be-sec {
    flex-direction: column;
    scroll-snap-align: start;
  }
  .be-sec.flash {
    animation: beFlash 1.2s ease;
  }
  @keyframes beFlash {
    0% {
      box-shadow: inset 0 0 0 0 transparent;
    }
    18% {
      box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 60%, transparent);
    }
    100% {
      box-shadow: inset 0 0 0 0 transparent;
    }
  }
  .be-spine {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .be-spine-name {
    writing-mode: vertical-rl;
    font: 700 11px/1 var(--font-ui);
    letter-spacing: 0.06em;
    white-space: nowrap;
    color: var(--textfaint);
    transition: color 0.3s;
  }
  .be-sec.seen .be-spine-name {
    color: var(--text);
  }
  .be-sec.flash .be-spine-name,
  .be-sec.flash .be-secname {
    color: var(--accentbright);
  }
  .be-spine-line {
    flex: 1;
    width: 1px;
    min-height: 12px;
    background: var(--border);
  }
  .be-sec.seen .be-spine-line {
    background: var(--border2);
  }
  .be-sechead {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 18px;
    margin-bottom: 10px;
  }
  .be-secname {
    font: 700 12px/1 var(--font-ui);
    letter-spacing: 0.02em;
    white-space: nowrap;
    color: var(--textdim);
    transition: color 0.3s;
  }
  .be-sec.seen .be-secname {
    color: var(--text);
  }
  .be-secline {
    flex: 1;
    height: 1px;
    background: var(--border);
  }
  .be-inner {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  /* an empty page centres its hint in the page area */
  .be-inner.empty {
    flex: 1;
    align-items: center;
    justify-content: center;
  }
  .be-inner.empty .be-empty {
    align-self: center;
  }
  .be-grid {
    position: relative;
    display: grid;
    flex: none;
  }
  .be-grid.arrange {
    background-image: radial-gradient(circle at var(--ctr) var(--ctr), color-mix(in srgb, var(--accent) 30%, transparent) 1.2px, transparent 1.7px);
    background-size: var(--st) var(--st);
    outline: 1px dashed color-mix(in srgb, var(--accent) 22%, transparent);
    outline-offset: 5px;
    border-radius: 2px;
  }
  .be-ghost {
    z-index: 9;
    pointer-events: none;
    border-radius: 8px;
    border: 2px dashed var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .be-ghost.bad {
    border-color: var(--danger);
    background: color-mix(in srgb, var(--danger) 12%, transparent);
  }
  .be-empty {
    display: flex;
    align-self: flex-start;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border: 1px dashed var(--border);
    border-radius: 12px;
    white-space: nowrap;
    font: 600 12.5px/1.4 var(--font-ui);
    color: var(--textdim);
  }
  .be-empty.arr {
    position: absolute;
    left: 0;
    top: 0;
    border: 0;
    color: var(--textfaint);
    pointer-events: none;
  }
  .be-empty-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 11px;
    border-radius: 8px;
    cursor: pointer;
    background: var(--accent-tint);
    border: 1px solid var(--accent-border);
    color: var(--accentbright);
    font: 700 12px/1 var(--font-ui);
  }
  .be-reflow {
    position: absolute;
    right: 10px;
    bottom: 8px;
    z-index: 5;
    padding: 5px 7px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--bg2) 90%, transparent);
    border: 1px solid var(--border);
    font: 600 9.5px/1 var(--font-mono);
    letter-spacing: 0.06em;
    color: var(--textfaint);
    pointer-events: none;
  }
</style>
