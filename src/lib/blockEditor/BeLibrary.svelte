<script lang="ts">
  // The "Add" library of Arrange: the block's controls grouped like the "Find a control…" popover (Knobs &
  // faders · Switches · Selectors · Graphs · meters · actions), each row marked when the control is already
  // on the current page. A click adds the control at the first free spot of the current page; dragging a
  // row places it at an exact spot (teal / red preview on the board, also on another page of the strip or in
  // the fixed area). While the fixed area is the selected target a click adds there.
  // It stays open while arranging (close: ✕, Escape, "+ Control" again, Done) and fades out of the way while
  // a row is dragged. It is rendered inside the editor's ONE overlay layer (BeSurface, overlayLayer.ts), so
  // the editor's menus stack above it; it opens under the arrange bar, right-aligned to its trigger — or
  // above the bar when there is more room there (a short panel at the bottom of the window;
  // `libraryPlacement`) — zoom-safe, and follows the bar when the panel resizes. Its search field takes the
  // focus when it opens, never again while it stays open.
  import { effectiveZoom } from '../workbench';
  import type { FindFilter, FindGroup } from './findControls';
  import { KIND_ICON, KIND_NAME } from './findControls';
  import { FIXED_PAGE, pageInText, pageLabel } from './boardModel';
  import { libraryPlacement, type LibraryPlacement } from './arrangeModel';

  let {
    open,
    anchor,
    floor,
    groups,
    page,
    query = $bindable(''),
    filter = $bindable<FindFilter>('all'),
    touch = false,
    fading = false,
    meta,
    onAdd,
    onPress,
    onEscape,
    onClose
  }: {
    open: boolean;
    /** The trigger ("+ Add", or the bar's ⋯): the library is right-aligned to it. */
    anchor: HTMLElement | null;
    /** The arrange bar: the library opens below it, or above it when there is more room there. */
    floor: HTMLElement | null;
    groups: FindGroup[];
    /** The page a click adds to (`FIXED_PAGE`: the fixed area, while it is the selected target). */
    page: string;
    query?: string;
    filter?: FindFilter;
    /** Tablet: ≥ 40 px targets. */
    touch?: boolean;
    /** A row is being dragged onto the board. */
    fading?: boolean;
    /** The meta line of a row (view and size). */
    meta: (key: string) => string;
    onAdd: (key: string) => void;
    onPress: (e: PointerEvent, key: string) => void;
    /** Escape inside the library: Arrange decides (a running drag is cancelled first, else the library
     *  closes) — true when the library closed. */
    onEscape: () => boolean;
    onClose: () => void;
  } = $props();

  let popEl = $state<HTMLElement | null>(null);
  let inputEl = $state<HTMLInputElement | null>(null);
  let pos = $state<LibraryPlacement | null>(null);
  const count = $derived(groups.reduce((n, g) => n + g.rows.length, 0));
  const fixed = $derived(page === FIXED_PAGE);

  /** Place under (or over) the bar, right-aligned to the trigger (visual px → layout px). */
  function place() {
    const a = anchor;
    if (!a || !a.isConnected || typeof window === 'undefined') return;
    const r = a.getBoundingClientRect();
    const f = floor?.isConnected ? floor.getBoundingClientRect() : r;
    pos = libraryPlacement(r, f, { width: window.innerWidth, height: window.innerHeight }, effectiveZoom(r.width, a.offsetWidth) || 1);
  }
  // the search field takes the focus when the library opens — not when its trigger moves (a selection
  // change can move "+ Control" into the bar's ⋯), so the board keeps the keys meanwhile
  let wasOpen = false;
  $effect(() => {
    const o = open;
    if (o && !wasOpen) requestAnimationFrame(() => inputEl?.focus({ preventScroll: true }));
    wasOpen = o;
  });
  $effect(() => {
    if (!open) {
      pos = null;
      return;
    }
    void anchor;
    void floor;
    place();
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    window.addEventListener('resize', schedule);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (ro) {
      if (floor) ro.observe(floor);
      if (anchor) ro.observe(anchor);
    }
    return () => {
      window.removeEventListener('resize', schedule);
      ro?.disconnect();
      cancelAnimationFrame(frame);
    };
  });

  const rowButtons = (): HTMLElement[] => (popEl ? Array.from(popEl.querySelectorAll<HTMLElement>('[data-be-lib-row]')) : []);
  function focusRow(delta: number) {
    const rows = rowButtons();
    if (!rows.length) return;
    const i = rows.indexOf(document.activeElement as HTMLElement);
    rows[i < 0 ? (delta > 0 ? 0 : rows.length - 1) : (i + delta + rows.length) % rows.length]?.focus();
  }
  /** Escape: a running drag is cancelled first, else the library closes (Arrange stays on; focus back on
   *  the trigger) — never the app's Escape chain; arrows walk the rows. */
  function popKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (onEscape()) anchor?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusRow(e.key === 'ArrowDown' ? 1 : -1);
    }
  }
  function inputKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = groups[0]?.rows[0];
      if (first) onAdd(first.key);
    }
  }
</script>

{#if open && pos}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    bind:this={popEl}
    class="be-lib"
    class:touch
    class:fading
    class:up={pos.bottom != null}
    role="dialog"
    aria-label="Add a control"
    tabindex="-1"
    data-be-library
    style:left="{pos.left}px"
    style:top={pos.top != null ? `${pos.top}px` : null}
    style:bottom={pos.bottom != null ? `${pos.bottom}px` : null}
    style:width="{pos.width}px"
    style:max-height="{pos.maxH}px"
    onkeydown={popKey}
  >
    <div class="be-lhead">
      <div class="be-lfield">
        <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M10.6 10.6 L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
        <input bind:this={inputEl} bind:value={query} class="be-lin" placeholder="Find a control to add…" aria-label="Find a control to add" data-be-lib-input onkeydown={inputKey} />
      </div>
      <span class="be-lcount">{count}</span>
      <div class="be-lseg" role="group" aria-label="Filter">
        <button type="button" class:on={filter === 'all'} aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>All</button>
        <button type="button" class:on={filter === 'unused'} aria-pressed={filter === 'unused'} title="Controls on no page" onclick={() => (filter = 'unused')}>Unused</button>
      </div>
      <button class="be-lclose" type="button" aria-label="Close the library" title="Close (Esc)" data-be-lib-close onclick={onClose}>✕</button>
    </div>
    <div class="be-lhint"><span>Adds to</span><b>{pageLabel(page)}</b><span class="be-lsp"></span><span>click = first free spot · drag = exact spot</span></div>
    <div class="be-llist">
      {#each groups as g (g.id)}
        <div class="be-lgroup">{g.title}</div>
        {#each g.rows as r (r.key)}
          <button
            class="be-lrow"
            class:here={r.onCurrent}
            type="button"
            title={r.onCurrent ? `${r.label} is already ${fixed ? 'in' : 'on'} ${pageInText(page)}` : `Add ${r.label} to ${pageInText(page)} — or drag it to a spot`}
            data-be-lib-row={r.key}
            data-on-page={r.onCurrent ? 'true' : 'false'}
            onpointerdown={(e) => onPress(e, r.key)}
            onclick={() => onAdd(r.key)}
          >
            <span class="be-lic" aria-hidden="true">{KIND_ICON[r.kind]}</span>
            <span class="be-ltxt">
              <span class="be-lname">{r.label}</span>
              <span class="be-lmeta">{KIND_NAME[r.kind]} · {meta(r.key)}</span>
            </span>
            {#if r.onCurrent}
              <span class="be-lmark here">{fixed ? 'in this area' : 'on this page'}</span>
            {:else if r.pages.length}
              <span class="be-lmark" title={r.pages.map(pageLabel).join(', ')}>{r.pages.length === 1 ? (r.pages[0] === FIXED_PAGE ? 'in Fixed area' : `on ${r.pages[0]}`) : `on ${r.pages.length} pages`}</span>
            {/if}
            <span class="be-ladd" aria-hidden="true">+</span>
          </button>
        {/each}
      {/each}
      {#if !groups.length}
        <div class="be-lnone">{query.trim() ? `No controls match “${query.trim()}”.` : filter === 'unused' ? 'Every control is on a page.' : 'No controls.'}</div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .be-lib {
    position: fixed;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid var(--border2);
    box-shadow: 0 24px 60px color-mix(in srgb, var(--bg) 75%, transparent);
    transition: opacity 0.12s;
  }
  /* a row is being dragged onto the board: out of the way */
  .be-lib.fading {
    opacity: 0.22;
    pointer-events: none;
  }
  .be-lhead {
    flex: none;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 9px 9px 8px 10px;
    border-bottom: 1px solid var(--surface2);
  }
  .be-lfield {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 7px;
    height: 30px;
    padding: 0 9px;
    box-sizing: border-box;
    border-radius: 8px;
    background: var(--input);
    border: 1px solid var(--accent-border);
    color: var(--textfaint);
  }
  .be-lin {
    flex: 1;
    min-width: 0;
    height: 100%;
    background: transparent;
    border: 0;
    outline: none;
    color: var(--text);
    font: 500 12.5px/1 var(--font-ui);
  }
  .be-lcount {
    font: 600 9.5px/1 var(--font-mono);
    color: var(--textfaint);
  }
  .be-lseg {
    flex: none;
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: 8px;
    background: var(--input);
    border: 1px solid var(--border);
  }
  .be-lseg button {
    height: 22px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    background: transparent;
    color: var(--textdim);
    font: 600 11px/1 var(--font-ui);
  }
  .be-lseg button.on {
    color: var(--accentbright);
    background: var(--accent-tint);
    box-shadow: inset 0 0 0 1px var(--accent-border);
  }
  .be-lclose {
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 7px;
    cursor: pointer;
    background: var(--bg2);
    border: 1px solid var(--border2);
    color: var(--text2);
    font-size: 11px;
  }
  .be-lclose:hover {
    border-color: var(--accent);
    color: var(--text);
  }
  .be-lhint {
    flex: none;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-bottom: 1px solid var(--surface2);
    font: 500 11px/1.35 var(--font-ui);
    color: var(--textdim);
    white-space: nowrap;
    overflow: hidden;
  }
  .be-lhint b {
    font: 700 11px/1 var(--font-mono);
    color: var(--accentbright);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .be-lsp {
    flex: 1;
  }
  .be-llist {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 6px 8px;
    scrollbar-width: thin;
  }
  .be-lgroup {
    padding: 10px 8px 6px;
    font: 700 9px/1 var(--font-mono);
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: var(--textfaint);
  }
  .be-lrow {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px 4px 6px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: grab;
    user-select: none;
    touch-action: pan-y;
  }
  .be-lrow:hover,
  .be-lrow:focus-visible {
    background: var(--surface2);
    outline: none;
  }
  .be-lic {
    width: 28px;
    height: 28px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    font-size: 13px;
    color: var(--accentbright);
    background: var(--accent-tint);
    border: 1px solid var(--accent-border);
  }
  .be-lrow.here .be-lic {
    color: var(--textdim);
    background: var(--bg2);
    border-color: var(--border2);
  }
  .be-ltxt {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    line-height: 1.2;
  }
  .be-lname {
    font: 600 12.5px/1.2 var(--font-ui);
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .be-lrow.here .be-lname {
    color: var(--textdim);
  }
  .be-lmeta {
    font: 500 9.5px/1.3 var(--font-mono);
    color: var(--textfaint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .be-lmark {
    flex: none;
    max-width: 38%;
    padding: 3px 6px;
    border-radius: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    background: var(--bg2);
    border: 1px solid var(--border2);
    color: var(--textdim);
    font: 600 9.5px/1 var(--font-mono);
  }
  .be-lmark.here {
    color: var(--accentbright);
    background: var(--accent-tint);
    border-color: var(--accent-border);
  }
  .be-ladd {
    flex: none;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    color: var(--accentbright);
    border: 1px solid var(--accent-border);
    font: 700 14px/1 var(--font-ui);
  }
  .be-lrow.here .be-ladd {
    visibility: hidden;
  }
  .be-lnone {
    padding: 28px 16px;
    text-align: center;
    color: var(--textdim);
    font: 500 12.5px/1.5 var(--font-ui);
  }
  /* tablet: ≥ 40 px targets */
  .be-lib.touch .be-lrow,
  .be-lib.touch .be-lseg button,
  .be-lib.touch .be-lclose {
    min-height: 40px;
  }
  .be-lib.touch .be-lclose {
    width: 40px;
  }
  .be-lib.touch .be-lfield {
    height: 40px;
  }
</style>
