<script lang="ts">
  // The search button opens a compact popover and focuses its input. Enter shows the results
  // as editable controls on the board. Escape returns focus to the search button.
  import { tick } from 'svelte';
  import { effectiveZoom, resolveAnchoredMenuPlacement } from '../workbench';
  import type { FindFilter, FindGroup, FindRow } from './findControls';
  import { KIND_ICON, KIND_NAME } from './findControls';
  import { FIXED_PAGE, pageLabel } from './boardModel';
  import { beLayer } from './overlayLayer';

  let {
    query = $bindable(''),
    filter = $bindable<FindFilter>('all'),
    open = $bindable(false),
    touch = false,
    groups,
    current,
    canPin,
    resultsOpen,
    preview,
    onJump,
    onPin,
    onShowAll,
    onOpen
  }: {
    query?: string;
    filter?: FindFilter;
    /** The popover is open. */
    open?: boolean;
    /** Phone: ≥ 40 px hit targets. */
    touch?: boolean;
    groups: FindGroup[];
    /** The board's current page (its chips are highlighted). */
    current: string;
    canPin: boolean;
    /** The flat results are showing in the board. */
    resultsOpen: boolean;
    /** Current value text of a control (meta line). */
    preview: (key: string) => string;
    onJump: (key: string, page?: string) => void;
    onPin: (key: string) => void;
    onShowAll: () => void;
    /** The popover opened by intent (ends arranging). */
    onOpen: () => void;
  } = $props();

  let wrapEl = $state<HTMLElement | null>(null);
  let popEl = $state<HTMLElement | null>(null);
  let iconEl = $state<HTMLButtonElement | null>(null);
  let popInputEl = $state<HTMLInputElement | null>(null);
  let pos = $state<{ left: number; top: number; width: number; maxH: number } | null>(null);

  const POP_W = 320;

  /** Place the popover under the header, right-aligned to the field (visual px → layout px). */
  function place() {
    const el = wrapEl;
    if (!el || typeof window === 'undefined') return;
    const head = el.closest<HTMLElement>('[data-be-head]') ?? el;
    const r = el.getBoundingClientRect();
    const z = effectiveZoom(r.width, el.offsetWidth) || 1;
    const vw = window.innerWidth;
    const width = Math.min(POP_W * z, vw - 16);
    const p = resolveAnchoredMenuPlacement({ left: r.right - width, bottom: r.bottom }, { width: vw, height: window.innerHeight }, { width, height: 0 }, z, 6, head.getBoundingClientRect().bottom);
    pos = { left: p.x, top: p.y, width: width / z, maxH: Math.max(160 / z, p.maxHeight) };
  }
  function openPop() {
    place();
    if (!open) {
      open = true;
      onOpen();
    }
  }
  function closePop(refocus = false) {
    open = false;
    if (refocus) iconEl?.focus();
  }
  async function toggleIcon() {
    if (open) {
      closePop();
      return;
    }
    openPop();
    await tick();
    popInputEl?.focus();
  }
  function showAll() {
    closePop(true);
    onShowAll();
  }
  function jump(r: FindRow, page?: string) {
    closePop();
    onJump(r.key, page);
  }
  function clear() {
    query = '';
    popInputEl?.focus();
  }
  const rowButtons = (): HTMLElement[] => (popEl ? Array.from(popEl.querySelectorAll<HTMLElement>('.be-fmain')) : []);
  function focusRow(delta: number) {
    const rows = rowButtons();
    if (!rows.length) return;
    const i = rows.indexOf(document.activeElement as HTMLElement);
    rows[i < 0 ? (delta > 0 ? 0 : rows.length - 1) : (i + delta + rows.length) % rows.length]?.focus();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      showAll();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusRow(1);
    } else if (e.key === 'Escape') {
      // owned here: the app's Escape chain (close the editor, restore a maximized panel) never sees it
      e.preventDefault();
      e.stopPropagation();
      closePop(true);
    }
  }
  /** Keys inside the popover: Escape closes it (focus back on the field), arrows walk the rows. */
  function popKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closePop(true);
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (e.target as HTMLElement | null)?.tagName !== 'INPUT') {
      e.preventDefault();
      focusRow(e.key === 'ArrowDown' ? 1 : -1);
    }
  }
  /** Focus left the field / popover for something else: close (a press elsewhere closes it too). */
  function onFocusOut(e: FocusEvent) {
    const to = e.relatedTarget as Node | null;
    if (!open || !to) return;
    if (popEl?.contains(to) || wrapEl?.contains(to)) return;
    closePop();
  }

  // close on a press outside the field / popover; follow the field while open (window and panel resizes)
  $effect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && (popEl?.contains(t) || wrapEl?.contains(t))) return;
      closePop();
    };
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('resize', schedule);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (ro && wrapEl) {
      ro.observe(wrapEl);
      const head = wrapEl.closest('[data-be-head]');
      if (head) ro.observe(head);
    }
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('resize', schedule);
      ro?.disconnect();
      cancelAnimationFrame(frame);
    };
  });
</script>

<div class="be-find" class:touch bind:this={wrapEl} onfocusout={onFocusOut}>
    <button
      bind:this={iconEl}
      class="be-find-ic"
      class:on={open || resultsOpen}
      type="button"
      aria-label="Find a control"
      title="Find a control"
      aria-haspopup="dialog"
      aria-expanded={open}
      data-be-find-toggle
      onclick={toggleIcon}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6" /><path d="M10.6 10.6 L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
    </button>
</div>

<!-- the popover floats in the overlay layer (moved to the workbench shell root, see overlayLayer.ts) -->
<div class="be-layer-src">
  <div class="be-layer" use:beLayer={'overlay'}>
    {#if open && pos}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div
        bind:this={popEl}
        class="be-find-pop"
        class:touch
        role="dialog"
        aria-label="Find a control"
        tabindex="-1"
        data-be-find
        style:left="{pos.left}px"
        style:top="{pos.top}px"
        style:width="{pos.width}px"
        style:max-height="{pos.maxH}px"
        onkeydown={popKey}
        onfocusout={onFocusOut}
      >
        <div class="be-fhead">
          <div class="be-find-field">
            <input bind:this={popInputEl} bind:value={query} class="be-find-in" placeholder="Find a control…" aria-label="Find a control" data-be-find-input onkeydown={onKey} />
            {#if query}<button class="be-find-x" type="button" aria-label="Clear search" onclick={clear}>✕</button>{/if}
          </div>
          <div class="be-fseg" role="group" aria-label="Filter">
            <button type="button" class:on={filter === 'all'} aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>All</button>
            <button type="button" class:on={filter === 'unused'} aria-pressed={filter === 'unused'} title="Controls on no page" onclick={() => (filter = 'unused')}>Unused</button>
          </div>
          <button class="be-fall" type="button" title="Show every match as live controls (Enter)" data-be-find-all onclick={showAll}>Show all</button>
          <button class="be-fclose" type="button" aria-label="Close" title="Close" onclick={() => closePop(true)}>✕</button>
        </div>
        <div class="be-fhint">Click to jump to a control{canPin ? ' · ⚡ pins it to a panel' : ''} · Enter shows every match</div>
        <div class="be-flist">
          {#each groups as g (g.id)}
            <div class="be-fgroup">{g.title}</div>
            {#each g.rows as r (r.key)}
              {@const val = preview(r.key)}
              <div class="be-frow" data-be-find-row={r.key}>
                <button class="be-fmain" type="button" title={r.pages.length ? `Jump to ${r.label}` : `${r.label} is on no page — Show all to use it`} onclick={() => jump(r)}>
                  <span class="be-fic" aria-hidden="true">{KIND_ICON[r.kind]}</span>
                  <span class="be-ftxt">
                    <span class="be-fname">{r.label}</span>
                    <span class="be-fmeta">{KIND_NAME[r.kind]}{val ? ` · ${val}` : ''}{r.pages.length ? '' : ' · not on a page'}</span>
                  </span>
                </button>
                {#if r.pages.length}
                  <div class="be-fchips">
                    {#each r.pages as pg (pg)}
                      <button class="be-fchip" class:cur={pg === current} type="button" title={pg === FIXED_PAGE ? 'Show in the fixed area' : `Show on ${pg}`} data-be-find-page={pg === FIXED_PAGE ? 'fixed' : pg} onclick={() => jump(r, pg)}>{pageLabel(pg)}</button>
                    {/each}
                  </div>
                {/if}
                {#if canPin && r.pinnable}
                  <button class="be-fpin" type="button" title="Pin as a quick control" aria-label="Pin {r.label}" data-be-find-pin onclick={() => onPin(r.key)}>
                    <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.2 1 L3 9.2 H7.4 L6.4 15 L13 6.6 H8.6 Z" fill="currentColor" /></svg>
                  </button>
                {/if}
              </div>
            {/each}
          {/each}
          {#if !groups.length}
            <div class="be-fnone">{query.trim() ? `No controls match “${query.trim()}”.` : filter === 'unused' ? 'Every control is on a page.' : 'No controls.'}</div>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .be-layer-src {
    display: contents;
  }
  /* the overlay layer: a fixed, zero-size box; its band comes from overlayLayer.ts */
  .be-layer {
    position: fixed;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
  }
  .be-find {
    display: flex;
    align-items: center;
    min-width: 0;
  }
  .be-find-field {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    height: 36px;
    padding: 0 8px 0 9px;
    border-radius: 8px;
    box-sizing: border-box;
    background: var(--input);
    border: 1px solid var(--accent-border);
  }
  .be-find-in {
    flex: 1;
    min-width: 0;
    height: 100%;
    background: transparent;
    border: 0;
    outline: none;
    color: var(--text);
    font: 500 12.5px/1 var(--font-ui);
  }
  .be-find-x {
    flex: none;
    width: 18px;
    height: 18px;
    border-radius: 5px;
    border: 0;
    background: transparent;
    color: var(--textdim);
    font-size: 10px;
    cursor: pointer;
  }
  .be-find-x:hover {
    color: var(--text);
    background: var(--surface2);
  }
  .be-find-ic {
    width: 36px;
    height: 36px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    cursor: pointer;
    background: var(--surface);
    border: 1px solid var(--border2);
    color: var(--textdim);
  }
  /* phone: ≥ 40 px hit targets */
  .be-find-pop.touch .be-find-field {
    height: 40px;
  }
  .be-find.touch .be-find-ic {
    width: 40px;
    height: 40px;
  }
  .be-find-pop.touch .be-fmain,
  .be-find-pop.touch .be-fpin,
  .be-find-pop.touch .be-fchip,
  .be-find-pop.touch .be-fseg button,
  .be-find-pop.touch .be-fall,
  .be-find-pop.touch .be-fclose {
    min-height: 40px;
  }
  .be-find-pop.touch .be-fpin,
  .be-find-pop.touch .be-fclose {
    min-width: 40px;
  }
  .be-find-ic.on,
  .be-find-ic:hover {
    border-color: var(--accent-border);
    color: var(--accentbright);
  }

  /* ── popover ── */
  .be-find-pop {
    position: fixed;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid var(--border2);
    box-shadow: 0 24px 60px color-mix(in srgb, var(--bg) 75%, transparent);
  }
  .be-fhead {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 9px 10px 8px 12px;
    border-bottom: 1px solid var(--surface2);
  }
  .be-fseg {
    flex: none;
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: 8px;
    background: var(--input);
    border: 1px solid var(--border);
  }
  .be-fseg button {
    height: 22px;
    padding: 0 9px;
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    background: transparent;
    color: var(--textdim);
    font: 600 11px/1 var(--font-ui);
  }
  .be-fseg button.on {
    color: var(--accentbright);
    background: var(--accent-tint);
    box-shadow: inset 0 0 0 1px var(--accent-border);
  }
  .be-fall,
  .be-fclose {
    flex: none;
    height: 26px;
    border-radius: 7px;
    cursor: pointer;
    background: var(--bg2);
    border: 1px solid var(--border2);
    color: var(--text2);
    font: 600 11.5px/1 var(--font-ui);
  }
  .be-fall {
    padding: 0 9px;
    color: var(--accentbright);
    border-color: var(--accent-border);
  }
  .be-fclose {
    width: 26px;
    font-size: 11px;
  }
  .be-fall:hover,
  .be-fclose:hover {
    border-color: var(--accent);
    color: var(--text);
  }
  .be-fhint {
    flex: none;
    padding: 7px 12px;
    border-bottom: 1px solid var(--surface2);
    font: 500 11px/1.35 var(--font-ui);
    color: var(--textdim);
  }
  .be-flist {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 6px 8px;
    scrollbar-width: thin;
  }
  .be-fgroup {
    padding: 10px 8px 6px;
    font: 700 9px/1 var(--font-mono);
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: var(--textfaint);
  }
  .be-frow {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 4px 2px 2px;
    border-radius: 9px;
  }
  .be-frow:hover {
    background: var(--surface2);
  }
  .be-fmain {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 4px 4px 6px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .be-fic {
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
  .be-ftxt {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    line-height: 1.2;
  }
  .be-fname {
    font: 600 12.5px/1.2 var(--font-ui);
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .be-fmeta {
    font: 500 9.5px/1.3 var(--font-mono);
    color: var(--textfaint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .be-fchips {
    flex: none;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 3px;
    max-width: 46%;
  }
  .be-fchip {
    height: 20px;
    padding: 0 7px;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
    background: var(--bg2);
    border: 1px solid var(--border2);
    color: var(--textdim);
    font: 600 9.5px/1 var(--font-mono);
  }
  .be-fchip.cur {
    color: var(--accentbright);
    background: var(--accent-tint);
    border-color: var(--accent-border);
  }
  .be-fchip:hover {
    border-color: var(--accent);
    color: var(--text);
  }
  .be-fpin {
    flex: none;
    width: 26px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    cursor: pointer;
    background: var(--bg2);
    border: 1px solid var(--border2);
    color: var(--textdim);
  }
  .be-fpin:hover {
    color: var(--amber);
    border-color: var(--amber-border);
    background: var(--amber-tint);
  }
  .be-fnone {
    padding: 28px 16px;
    text-align: center;
    color: var(--textdim);
    font: 500 12.5px/1.5 var(--font-ui);
  }
</style>
