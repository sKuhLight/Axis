<script lang="ts">
  // The fixed area: the controls that stay in view beside every page (fixedLayout.ts decides where and how
  // big). Outside the pages' scroller in both forms:
  //   column — at the far right of the board area: a divider line, a slightly set-off background, the muted
  //            label "Fixed" where the pages have their names (a spine, or a heading). Contents taller than
  //            the board scroll inside it; a wheel over it never reaches the pages.
  //   band   — at the bottom (phone, a very narrow editor): the first line of controls (at most four knobs),
  //            the rest behind a toggle that is closed again for the next block.
  // While arranging it shows its own grid (drag within it, from and to the pages), a handle on its edge for
  // its width (a keyboard-operable separator) and, once emptied, a button that removes it.
  import { untrack } from 'svelte';
  import { effectiveZoom } from '../workbench';
  import BeGrid from './BeGrid.svelte';
  import type { BeGhost } from './beHost';
  import { PAD_Y, SEC_HEAD, type BeNav } from './boardGeometry';
  import { FIXED_MAX_COLS, FIXED_PAGE, fixedMinCols, type BeItem } from './boardModel';
  import { autoScrollDelta, SPINE_W } from './boardView';
  import type { BeCtl } from './catalog';
  import { BAND_MAX_SHARE, BAND_PAD, FIXED_PAD_LEFT, FIXED_PAD_SIDE, FIXED_SPINE_GAP, fixedRightPad, fixedViewportInset, type FixedLayout } from './fixedLayout';

  let {
    layout,
    items,
    cols,
    allItems,
    nav,
    editMode,
    target = false,
    catalog,
    ghost = null,
    sizing = false,
    touch = false,
    dockGutter = false,
    avoidDockOpener = false,
    safeBottom = false,
    maxCols = FIXED_MAX_COLS,
    mainH = 0,
    resetKey = '',
    height = $bindable(0),
    overflowY = $bindable(false),
    onBackgroundDown,
    onScroll,
    onColsDown,
    onColsKey,
    onRemove
  }: {
    layout: FixedLayout;
    /** Items drawn right now. */
    items: BeItem[];
    /** The area's width in cells, and everything in it (also what is not drawn now). */
    cols: number;
    allItems: BeItem[];
    nav: BeNav;
    editMode: boolean;
    /** Arrange: the bar's tools and the library act here. */
    target?: boolean;
    catalog: ReadonlyMap<string, BeCtl>;
    ghost?: BeGhost | null;
    /** The edge is being dragged. */
    sizing?: boolean;
    /** Tablet: ≥ 40 px targets. */
    touch?: boolean;
    dockGutter?: boolean;
    avoidDockOpener?: boolean;
    safeBottom?: boolean;
    maxCols?: number;
    /** Height of the editor's board area (the open band takes at most half of it). */
    mainH?: number;
    /** Identity of the block shown: the next block starts with a closed band. */
    resetKey?: string;
    /** Rendered height (px): the phone's pages keep less clearance above a band. */
    height?: number;
    /** Vertical scroll available to the controls, excluding any padding or floating button. */
    overflowY?: boolean;
    onBackgroundDown: () => void;
    onScroll: () => void;
    onColsDown: (e: PointerEvent, el: HTMLElement, limits: { min: number; max: number }) => void;
    onColsKey: (e: KeyboardEvent, limits: { min: number; max: number }) => void;
    onRemove: () => void;
  } = $props();

  const uid = $props.id();
  let el = $state<HTMLElement | null>(null);
  let scrollEl = $state<HTMLElement | null>(null);
  let contentEl = $state<HTMLElement | null>(null);
  const column = $derived(layout.place === 'column');
  const minCols = $derived(fixedMinCols(allItems));
  const limits = $derived({ min: minCols, max: Math.max(minCols, maxCols) });
  const rightPad = $derived(fixedRightPad(nav, dockGutter));
  let viewportInset = $state(0);

  // ── the band's toggle (remembers nothing) ──
  let open = $state(false);
  $effect(() => {
    void resetKey;
    untrack(() => (open = false));
  });
  const folded = $derived(!column && !editMode && !open && layout.more > 0);
  /** The closed band draws its first line only: what is behind the toggle is out of the Tab order too. */
  const shown = $derived(folded && layout.pos ? items.filter((it) => (layout.pos![it.id]?.y ?? Infinity) + (layout.pos![it.id]?.h ?? 0) <= layout.firstRows) : items);
  const rows = $derived(folded ? layout.firstRows : layout.rows);
  const grid = $derived({ ...layout, rows, H: rows * (layout.c + layout.g) - layout.g });
  const bandMaxH = $derived(mainH > 0 ? Math.max(120, Math.floor(mainH * BAND_MAX_SHARE)) : null);

  $effect(() => {
    const area = el;
    const workspace = area?.closest('.aw-workspace');
    if (!column || !avoidDockOpener || !area || !workspace || typeof ResizeObserver === 'undefined') {
      viewportInset = 0;
      return;
    }
    function measure() {
      if (!area || !workspace) return;
      const opener = workspace.querySelector<HTMLElement>(':scope > .aw-mobile-dock-indicator.right');
      const bounds = area.getBoundingClientRect();
      const zoom = effectiveZoom(bounds.width, area.offsetWidth) || 1;
      viewportInset = opener?.getClientRects().length ? fixedViewportInset(bounds, opener.getBoundingClientRect(), zoom) : 0;
    }
    const resize = new ResizeObserver(measure);
    resize.observe(area);
    resize.observe(workspace);
    const mutation = new MutationObserver(measure);
    mutation.observe(workspace, { childList: true, attributes: true, attributeFilter: ['class'] });
    measure();
    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  });

  $effect(() => {
    const viewport = scrollEl;
    const content = contentEl;
    if (!viewport || !content || typeof ResizeObserver === 'undefined') {
      overflowY = false;
      return;
    }
    function measure() {
      // The scroll box's trailing padding can scroll too. Only a clipped control changes the gesture axis.
      if (viewport && content) overflowY = content.offsetTop + content.offsetHeight > viewport.clientHeight + 1;
    }
    const resize = new ResizeObserver(measure);
    resize.observe(viewport);
    resize.observe(content);
    measure();
    return () => resize.disconnect();
  });

  /** Show an item (a "Find a control…" jump, a new one from the library): the closed band opens when it is
   *  behind the toggle, then the area scrolls as far as needed. True when the item is in here. */
  export function revealItem(id: string): boolean {
    if (!items.some((it) => it.id === id)) return false;
    if (folded && !shown.some((it) => it.id === id)) open = true;
    requestAnimationFrame(() => {
      const node = scrollEl;
      const tile = node?.querySelector<HTMLElement>(`[data-be-item="${CSS.escape(id)}"]`);
      if (!node || !tile) return;
      const b = node.getBoundingClientRect();
      const t = tile.getBoundingClientRect();
      const z = effectiveZoom(b.width, node.offsetWidth) || 1;
      const top = b.top + (column && nav === 'side' ? PAD_Y + SEC_HEAD : 4) * z;
      if (t.top < top) node.scrollTop -= (top - t.top) / z;
      else if (t.bottom > b.bottom - 4 * z) node.scrollTop += (t.bottom - b.bottom + 4 * z) / z;
    });
    return true;
  }
  /** A point over the area scrolls the area while an arrange drag nears its edges; false elsewhere. */
  export function autoScroll(px: number, py: number): boolean {
    const r = el?.getBoundingClientRect();
    if (!r || px < r.left || px > r.right || py < r.top || py > r.bottom) return false;
    if (scrollEl) {
      const viewport = scrollEl.getBoundingClientRect();
      scrollEl.scrollTop += autoScrollDelta(py, viewport.top, viewport.bottom);
    }
    return true;
  }

  function onDown(e: PointerEvent) {
    const t = e.target as HTMLElement | null;
    if (!t?.closest?.('[data-be-item], button, [role="separator"]')) onBackgroundDown();
  }
</script>

{#snippet handle()}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
  <div
    class="be-fx-handle"
    class:on={sizing}
    class:touch
    role="separator"
    aria-orientation="vertical"
    aria-label="Width of the fixed area"
    aria-valuemin={minCols}
    aria-valuemax={Math.max(cols, limits.max)}
    aria-valuenow={cols}
    aria-valuetext="{cols} cells"
    tabindex="0"
    title="Drag to change the width of the fixed area (arrow keys too)"
    data-be-fixed-handle
    onpointerdown={(e) => onColsDown(e, e.currentTarget, limits)}
    onkeydown={(e) => onColsKey(e, limits)}
  >
    <span class="be-fx-grip"></span>
  </div>
{/snippet}

{#snippet emptied()}
  {#if editMode && !items.length}
    <div class="be-fx-empty">
      <span>Drag controls here</span>
      {#if !allItems.length}<button type="button" class="be-fx-remove" class:touch data-be-fixed-remove aria-label="Remove the fixed area" onclick={onRemove}>Remove</button>{/if}
    </div>
  {/if}
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
  bind:this={el}
  bind:clientHeight={height}
  class="be-fixed"
  class:column
  class:band={!column}
  class:top={nav === 'top'}
  class:edit={editMode}
  class:safe-bottom={safeBottom}
  class:dock-gutter={dockGutter}
  aria-label="Fixed controls"
  data-be-fixed={layout.place}
  style:width={column ? `${layout.width}px` : null}
  onpointerdown={onDown}
>
  {#if column}
    {#if editMode}{@render handle()}{/if}
    <div
      bind:this={scrollEl}
      class="be-fx-scroll"
      style:padding={`${PAD_Y}px ${rightPad}px ${PAD_Y}px ${nav === 'top' ? FIXED_PAD_LEFT : FIXED_PAD_SIDE}px`}
      style:margin-bottom={viewportInset ? `${viewportInset}px` : null}
      onscroll={onScroll}
    >
      {#if nav === 'top'}
        <div class="be-fx-spine" style:width="{SPINE_W}px" style:margin-right="{FIXED_SPINE_GAP}px">
          <span class="be-fx-label vert">Fixed</span>
        </div>
      {:else}
        <div class="be-fx-head" style:height="{SEC_HEAD - 10}px"><span class="be-fx-label">Fixed</span></div>
      {/if}
      <div class="be-fx-inner" bind:this={contentEl}>
        <BeGrid page={FIXED_PAGE} {items} layout={grid} {editMode} {catalog} {ghost} {target} />
        {@render emptied()}
      </div>
    </div>
  {:else}
    <div bind:this={scrollEl} id="be-fx-{uid}" class="be-fx-scroll" style:padding="{BAND_PAD}px" style:max-height={bandMaxH ? `${bandMaxH}px` : null} onscroll={onScroll}>
      <div class="be-fx-inner" bind:this={contentEl} style:padding={editMode ? '5px' : null}>
        <BeGrid page={FIXED_PAGE} items={shown} layout={grid} {editMode} {catalog} {ghost} {target} />
        {@render emptied()}
        {#if editMode}{@render handle()}{/if}
      </div>
    </div>
    <div class="be-fx-side" style:width={editMode ? null : `${layout.side}px`}>
      <span class="be-fx-label">Fixed</span>
      {#if layout.more > 0 && !editMode}
        <button
          type="button"
          class="be-fx-more"
          aria-expanded={open}
          aria-controls="be-fx-{uid}"
          aria-label={open ? 'Show fewer fixed controls' : `Show ${layout.more} more fixed control${layout.more === 1 ? '' : 's'}`}
          data-be-fixed-toggle
          onclick={() => (open = !open)}
        >{open ? '▾' : `+${layout.more} ▴`}</button>
      {/if}
    </div>
  {/if}
</section>

<style>
  .be-fixed {
    position: relative;
    flex: none;
    box-sizing: border-box;
    min-width: 0;
    min-height: 0;
    display: flex;
    background: color-mix(in srgb, var(--surface2) 34%, transparent);
  }
  .be-fixed.column {
    flex-direction: column;
    border-left: 1px solid var(--border);
  }
  .be-fixed.band {
    flex-direction: row;
    border-top: 1px solid var(--border);
  }
  .be-fixed.band.safe-bottom {
    padding-bottom: var(--axis-safe-bottom, 0px);
  }
  .be-fixed.edit {
    background: color-mix(in srgb, var(--accent) 4%, var(--bg2));
  }
  .be-fx-scroll {
    position: relative;
    box-sizing: border-box;
    min-width: 0;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    /* a wheel (or a swipe) that reaches the end never goes on to anything behind */
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--border3) transparent;
  }
  .be-fixed.column .be-fx-scroll {
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .be-fixed.column.top .be-fx-scroll {
    flex-direction: row;
    align-items: flex-start;
  }
  .be-fixed.band .be-fx-scroll {
    flex: 1;
  }
  .be-fixed.band.edit .be-fx-scroll {
    overflow-x: auto;
  }
  .be-fx-spine {
    position: sticky;
    top: 0;
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .be-fx-head {
    position: sticky;
    top: 0;
    z-index: 1;
    flex: none;
    display: flex;
    align-items: center;
    margin-bottom: 10px;
    background: color-mix(in srgb, var(--surface2) 34%, var(--bg2));
  }
  .be-fx-label {
    font: 700 11px/1 var(--font-ui);
    letter-spacing: 0.06em;
    white-space: nowrap;
    color: var(--textfaint);
  }
  .be-fx-label.vert {
    writing-mode: vertical-rl;
  }
  .be-fx-inner {
    position: relative;
    flex: none;
    width: max-content;
  }
  .be-fx-empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    padding: 14px 4px;
    text-align: center;
    font: 600 11.5px/1.35 var(--font-ui);
    color: var(--textfaint);
    pointer-events: none;
  }
  .be-fx-remove {
    pointer-events: auto;
    height: 28px;
    padding: 0 10px;
    border-radius: 8px;
    cursor: pointer;
    background: var(--danger-tint);
    border: 1px solid var(--danger-border);
    color: var(--danger);
    font: 700 11.5px/1 var(--font-ui);
  }
  .be-fx-remove.touch {
    height: 40px;
  }

  /* the edge: a thin line that widens on hover / focus, with a wide invisible hit area */
  .be-fx-handle {
    position: absolute;
    z-index: 6;
    top: 0;
    bottom: 0;
    width: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: ew-resize;
    touch-action: none;
    outline: none;
  }
  .be-fixed.column .be-fx-handle {
    left: -6px;
  }
  .be-fixed.band .be-fx-handle {
    right: -8px;
  }
  .be-fx-handle.touch {
    width: 40px;
    height: min(80px, 100%);
    top: 50%;
    bottom: auto;
    transform: translateY(-50%);
  }
  .be-fixed.column .be-fx-handle.touch {
    left: -30px;
    justify-content: flex-end;
    padding-right: 9px;
    box-sizing: border-box;
  }
  .be-fixed.band .be-fx-handle.touch {
    right: -34px;
    justify-content: flex-start;
    padding-left: 5px;
    box-sizing: border-box;
  }
  .be-fx-grip {
    width: 3px;
    height: min(44px, 60%);
    border-radius: 2px;
    background: var(--border3);
    transition: background 0.12s;
  }
  .be-fx-handle:hover .be-fx-grip,
  .be-fx-handle.on .be-fx-grip {
    background: var(--accent);
  }
  .be-fx-handle:focus-visible .be-fx-grip {
    background: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 35%, transparent);
  }

  /* band: the label and the toggle in the room on the right, at its bottom */
  .be-fx-side {
    flex: none;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    padding: 8px 6px;
  }
  .be-fixed.band.dock-gutter .be-fx-side {
    padding-right: 16px;
  }
  .be-fx-more {
    min-width: 44px;
    height: 40px;
    padding: 0 8px;
    border-radius: 9px;
    cursor: pointer;
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--text2);
    font: 700 12px/1 var(--font-ui);
    white-space: nowrap;
  }
  .be-fx-more:hover {
    border-color: var(--accent);
    color: var(--text);
  }
  .be-fx-more:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
</style>
