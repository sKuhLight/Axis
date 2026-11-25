<script lang="ts">
  import { tick } from 'svelte';
  import { revealOffset } from './pageNavScroll';
  // Page navigation of the Block Editor: the page tabs in the header (top navigation) or the page list
  // beside the board (side navigation, no heading and no control counts). Both highlight every page in
  // view (the active one stronger); a click scrolls the board to the page. While arranging, a
  // double-click renames a page and "+" adds one.
  let {
    variant,
    pages,
    active,
    highlight,
    editMode,
    renaming,
    width = 0,
    touch = false,
    onGo,
    onStartRename,
    onRename,
    onCancelRename,
    onAdd
  }: {
    variant: 'tabs' | 'list';
    pages: readonly string[];
    active: string;
    highlight: ReadonlySet<string>;
    editMode: boolean;
    /** Page being renamed. */
    renaming: string | null;
    /** List width in px (side navigation). */
    width?: number;
    /** Phone: ≥ 40 px hit targets. */
    touch?: boolean;
    onGo: (page: string) => void;
    onStartRename: (page: string) => void;
    onRename: (page: string, name: string) => void;
    onCancelRename: () => void;
    onAdd: () => void;
  } = $props();

  let navEl = $state<HTMLDivElement | null>(null);
  let measuredWidth = $state(0);
  let measuredHeight = $state(0);
  let dragging = $state(false);
  let pointer: { id: number; x: number; scroll: number } | null = null;
  let suppressClick = false;

  // Scroll only this navigation viewport, never its ancestors or the editor board.
  $effect(() => {
    const page = active;
    pages; variant; measuredWidth; measuredHeight; renaming;
    let cancelled = false;
    void tick().then(() => {
      if (cancelled || !navEl) return;
      const tab = Array.from(navEl.querySelectorAll<HTMLElement>('[data-be-tab]')).find((el) => el.dataset.beTab === page);
      if (!tab) return;
      const nav = navEl.getBoundingClientRect();
      const rect = tab.getBoundingClientRect();
      if (variant === 'tabs') navEl.scrollLeft = revealOffset(navEl.scrollLeft, navEl.clientWidth, rect.left - nav.left + navEl.scrollLeft, rect.width);
      else navEl.scrollTop = revealOffset(navEl.scrollTop, navEl.clientHeight, rect.top - nav.top + navEl.scrollTop, rect.height);
    });
    return () => { cancelled = true; };
  });

  function pointerDown(e: PointerEvent) {
    suppressClick = false;
    if (variant !== 'tabs' || e.pointerType === 'touch' || e.button !== 0 || (e.target as HTMLElement).closest('input') || !navEl) return;
    pointer = { id: e.pointerId, x: e.clientX, scroll: navEl.scrollLeft };
  }
  function pointerMove(e: PointerEvent) {
    if (!pointer || pointer.id !== e.pointerId || !navEl) return;
    if (!dragging && Math.abs(e.clientX - pointer.x) < 5) return;
    dragging = true;
    suppressClick = true;
    navEl.setPointerCapture(e.pointerId);
    navEl.scrollLeft = pointer.scroll - (e.clientX - pointer.x);
    e.preventDefault();
  }
  function pointerEnd(e: PointerEvent) {
    if (pointer?.id !== e.pointerId) return;
    pointer = null;
    dragging = false;
    if (navEl?.hasPointerCapture(e.pointerId)) navEl.releasePointerCapture(e.pointerId);
  }
  function clickCapture(e: MouseEvent) {
    if (!suppressClick) return;
    suppressClick = false;
    e.preventDefault();
    e.stopPropagation();
  }
  function wheel(e: WheelEvent) {
    if (!navEl || variant !== 'tabs' || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || navEl.scrollWidth <= navEl.clientWidth) return;
    const before = navEl.scrollLeft;
    navEl.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? navEl.clientWidth : 1);
    if (navEl.scrollLeft !== before) e.preventDefault();
  }
  function keyboard(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input')) return;
    const keys = variant === 'tabs' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    if (![...keys, 'Home', 'End'].includes(e.key)) return;
    const index = pages.indexOf(active);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? pages.length - 1 : (index + (e.key === keys[0] ? -1 : 1) + pages.length) % pages.length;
    if (!pages[next]) return;
    e.preventDefault();
    onGo(pages[next]);
    const tabs = navEl?.querySelectorAll<HTMLButtonElement>('[data-be-tab]');
    tabs?.[next]?.focus({ preventScroll: true });
  }

  function focusEl(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
  function renameKey(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      // the field's own Escape: Arrange (and the app's Escape chain) never see it
      e.preventDefault();
      e.stopPropagation();
      onCancelRename();
    }
  }
  const title = (pg: string) => (editMode ? `${pg} · double-click to rename` : `Show ${pg}`);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  bind:this={navEl}
  bind:clientWidth={measuredWidth}
  bind:clientHeight={measuredHeight}
  class:dragging
  onpointerdown={pointerDown}
  onpointermove={pointerMove}
  onpointerup={pointerEnd}
  onpointercancel={pointerEnd}
  onlostpointercapture={pointerEnd}
  onclickcapture={clickCapture}
  onwheel={wheel}
  onkeydown={keyboard}
  class="be-pnav"
  class:tabs={variant === 'tabs'}
  class:list={variant === 'list'}
  class:touch
  role="tablist"
  tabindex="-1"
  aria-label="Pages"
  aria-orientation={variant === 'list' ? 'vertical' : 'horizontal'}
  data-be-pagenav={variant}
  style:width={variant === 'list' && width ? `${width}px` : null}
>
  {#each pages as pg (pg)}
    {#if renaming === pg}
      <input
        class="be-ptab edit"
        value={pg}
        aria-label="Page name"
        use:focusEl
        onkeydown={renameKey}
        onblur={(e) => (renaming === pg ? onRename(pg, e.currentTarget.value) : null)}
      />
    {:else}
      <button
        class="be-ptab"
        class:on={pg === active}
        class:vis={highlight.has(pg)}
        type="button"
        role="tab"
        aria-selected={pg === active}
        tabindex={pg === active ? 0 : -1}
        data-be-tab={pg}
        data-visible={highlight.has(pg) ? 'true' : 'false'}
        data-active={pg === active ? 'true' : 'false'}
        title={title(pg)}
        onclick={() => onGo(pg)}
        ondblclick={() => editMode && onStartRename(pg)}>{pg}</button
      >
    {/if}
  {/each}
  {#if editMode}
    <button class="be-ptab add" type="button" title="Add page" aria-label="Add page" onclick={onAdd}>＋</button>
  {/if}
</div>

<style>
  .be-pnav {
    scrollbar-width: none;
  }
  .be-pnav::-webkit-scrollbar {
    display: none;
  }
  /* ── tabs (header, top navigation) ── */
  .be-pnav.tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    max-width: 100%;
    padding: 2px;
    box-sizing: border-box;
    touch-action: pan-x;
    overscroll-behavior-x: contain;
    user-select: none;
    overflow-x: auto;
    border-radius: 9px;
    background: var(--input);
    border: 1px solid var(--border);
  }
  .be-pnav.dragging,
  .be-pnav.dragging .be-ptab { cursor: grabbing; }
  .tabs .be-ptab {
    flex: none;
    height: 30px;
    padding: 0 12px;
    border-radius: 7px;
    border: 0;
    cursor: pointer;
    white-space: nowrap;
    background: transparent;
    color: var(--textdim);
    font: 600 12px/1 var(--font-ui);
    transition:
      background 0.12s,
      color 0.12s;
  }
  .tabs .be-ptab:hover {
    color: var(--text);
  }
  .tabs .be-ptab.vis {
    color: var(--be-accent, var(--accent));
    background: color-mix(in srgb, var(--be-accent, var(--accent)) 8%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--be-accent, var(--accent)) 25%, transparent);
  }
  .tabs .be-ptab.on {
    color: var(--be-accent, var(--accent));
    background: color-mix(in srgb, var(--be-accent, var(--accent)) 16%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--be-accent, var(--accent)) 55%, transparent);
  }
  .tabs .be-ptab.add {
    color: var(--be-accent, var(--accent));
    font-size: 15px;
    padding: 0 9px;
  }
  .tabs .be-ptab.edit {
    width: 110px;
    background: var(--bg2);
    border: 1px solid var(--accent);
    color: var(--text);
    outline: none;
    cursor: text;
  }

  .tabs.touch .be-ptab {
    height: 40px;
  }
  .list.touch .be-ptab {
    height: 40px;
    line-height: 40px;
  }

  /* ── list (side navigation): no heading, no counts ── */
  .be-pnav.list {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
    padding: 10px 8px;
    overflow-y: auto;
    background: var(--input);
    border-right: 1px solid var(--surface2);
    box-sizing: border-box;
  }
  .list .be-ptab {
    flex: none;
    display: block;
    width: 100%;
    height: 32px;
    padding: 0 10px;
    border: 0;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: transparent;
    color: var(--textdim);
    font: 600 12.5px/32px var(--font-ui);
    transition:
      background 0.12s,
      color 0.12s;
  }
  .list .be-ptab:hover {
    background: var(--surface);
    color: var(--text);
  }
  .list .be-ptab.vis {
    color: var(--text);
    background: var(--surface);
    box-shadow: inset 2px 0 0 var(--accent);
  }
  .list .be-ptab.on {
    color: var(--be-accent, var(--accent));
    box-shadow: inset 2px 0 0 var(--be-accent, var(--accent));
  }
  .list .be-ptab.add {
    color: var(--be-accent, var(--accent));
    font-size: 15px;
    text-align: center;
  }
  .list .be-ptab.edit {
    background: var(--bg2);
    border: 1px solid var(--accent);
    color: var(--text);
    outline: none;
    cursor: text;
    line-height: 1;
  }
</style>
