<script module lang="ts">
  export interface PaletteShellFilter {
    id: string;
    label: string;
    disabled?: boolean;
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { paletteRowMove } from './paletteGrid';

  /**
   * The shared palette chrome (extracted from CommandPalette): scrim + card,
   * search row with hit count, target chip row, filter chips, a scrollable
   * content area (the caller's snippet), a key-hint footer, the phone bottom
   * sheet, and ↑↓ ⏎ Esc on the search field. The caller owns the items: the
   * shell only moves the highlighted index (`hi`) and reports picks / close.
   *
   * CommandPalette (add block in the grid) and the workbench Add palette both
   * render through it; CommandPalette passes nothing beyond what it always
   * rendered, so it looks and behaves exactly as before.
   */
  let {
    open,
    mobile = false,
    overlay = false,
    wide = false,
    label,
    query = $bindable(''),
    placeholder,
    inputLabel,
    count,
    target,
    targetExtra,
    filters = [],
    filter,
    onFilter,
    hi = $bindable(0),
    itemCount,
    columns = 1,
    rowBreaks = [],
    onPick,
    onClose,
    hints = [],
    footEnd,
    escapeAnywhere = false,
    children
  }: {
    open: boolean;
    /** Phone: dock the card to the bottom as a slide-up sheet. */
    mobile?: boolean;
    /** Fixed over the whole window (above the workbench chrome) instead of inside the app root. */
    overlay?: boolean;
    /** A wider card (preview grids). */
    wide?: boolean;
    /** Accessible name of the dialog. */
    label?: string;
    query?: string;
    placeholder: string;
    /** Accessible name of the search field. */
    inputLabel?: string;
    /** Hit count text ("12 results"). */
    count: string;
    /** Target chip text; the chip row is omitted when undefined. */
    target?: string;
    /** Extra content of the chip row, after the target chip. */
    targetExtra?: Snippet;
    filters?: PaletteShellFilter[];
    filter?: string;
    onFilter?: (id: string) => void;
    /** Highlighted item index (keyboard). */
    hi?: number;
    itemCount: number;
    /** Items per row: ↑↓ move by a row; ←→ move by one while the search is empty. */
    columns?: number;
    /**
     * Item indices a full-width row (a section header, a note) sits before: a
     * grid row ends there, so ↑↓ follow the rows as drawn (`paletteGrid.ts`).
     */
    rowBreaks?: number[];
    onPick: (index: number) => void;
    onClose: () => void;
    /** Footer key hints. */
    hints?: string[];
    footEnd?: Snippet;
    /**
     * Escape closes the palette from anywhere inside the card (a chip, a card,
     * a button), not only from the search field — and is CONSUMED there (no
     * other Escape handler, e.g. the app's Escape chain, sees it). Off by
     * default: the app's own Escape chain closes CommandPalette.
     */
    escapeAnywhere?: boolean;
    children: Snippet;
  } = $props();

  function onCardKey(e: KeyboardEvent) {
    if (!escapeAnywhere || e.key !== 'Escape' || e.defaultPrevented) return;
    e.preventDefault();
    e.stopPropagation();
    onClose();
  }

  let inputEl = $state<HTMLInputElement | null>(null);

  // Focus the search field whenever the palette opens.
  $effect(() => {
    if (open && inputEl) setTimeout(() => inputEl?.focus(), 0);
  });

  function onKey(e: KeyboardEvent) {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && rowBreaks.length) {
      e.preventDefault();
      hi = paletteRowMove(hi, itemCount, columns, e.key, rowBreaks);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      hi = Math.min(itemCount - 1, hi + columns);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      hi = Math.max(0, hi - columns);
    } else if (columns > 1 && !query && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      e.preventDefault();
      hi = e.key === 'ArrowRight' ? Math.min(itemCount - 1, hi + 1) : Math.max(0, hi - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onPick(hi);
    } else if (e.key === 'Escape') {
      // Consumed: later Escape handlers (app chain, workbench maximize) skip it.
      e.preventDefault();
      // `escapeAnywhere` palettes own Escape outright: the app chain (a window
      // listener that ignores defaultPrevented) must not also close the tuner, a
      // dialog, the block editor … with the same key.
      if (escapeAnywhere) e.stopPropagation();
      onClose();
    }
  }

  function chooseFilter(id: string) {
    onFilter?.(id);
    hi = 0;
  }
</script>

{#if open}
  <div class="bg" class:mob={mobile} class:overlay role="presentation" onclick={() => onClose()}>
    <div class="card" class:mob={mobile} class:wide role="dialog" aria-label={label} tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={onCardKey}>
      <div class="search">
        <svg width="19" height="19" viewBox="0 0 16 16"><circle cx="7" cy="7" r="5.2" fill="none" style="stroke:var(--textfaint)" stroke-width="1.5" /><path d="M10.8 10.8 L14.5 14.5" style="stroke:var(--textfaint)" stroke-width="1.5" stroke-linecap="round" /></svg>
        <input bind:this={inputEl} bind:value={query} oninput={() => (hi = 0)} onkeydown={onKey} {placeholder} aria-label={inputLabel} />
        <span class="count mono">{count}</span>
      </div>

      {#if target !== undefined}
        <div class="chips">
          <span class="target">{target}</span>
          {@render targetExtra?.()}
        </div>
      {/if}

      {#if filters.length}
        <div class="cats scroll">
          {#each filters as f (f.id)}
            <button class="cat" class:on={filter === f.id} disabled={f.disabled} onclick={() => chooseFilter(f.id)}>{f.label}</button>
          {/each}
        </div>
      {/if}

      <div class="list scroll">
        {@render children()}
      </div>

      <div class="foot mono">
        {#each hints as hint, i (i)}<span>{hint}</span>{/each}{#if footEnd}<span class="foot-end">{@render footEnd()}</span>{/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .bg {
    position: absolute;
    inset: 0;
    background: rgba(6, 6, 8, 0.66);
    backdrop-filter: blur(3px);
    z-index: 200;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 7vh 12px 12px;
    animation: axsOverlay 0.12s ease;
  }
  /* Above the workbench chrome (edit bar, dock), below its drawers' menus. */
  .bg.overlay {
    position: fixed;
    z-index: 236;
  }
  .card {
    width: 760px;
    max-width: 100%;
    max-height: 84vh;
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 16px;
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: axsPalette 0.15s cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  .card.wide {
    width: 920px;
  }
  /* mobile: dock the palette to the bottom as a slide-up sheet */
  .bg.mob {
    align-items: flex-end;
    padding: 0;
  }
  .card.mob {
    width: 100%;
    max-width: 100%;
    max-height: 88vh;
    border-radius: 18px 18px 0 0;
    border-bottom: 0;
    padding-bottom: var(--axis-safe-bottom);
    animation: axsSheet 0.26s cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  .search {
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 18px 20px;
    border-bottom: 1px solid var(--surface2);
  }
  .search input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text);
    font-family: inherit;
    font-size: 17px;
    font-weight: 500;
  }
  .count {
    font-size: 12px;
    color: var(--textmuted);
    white-space: nowrap;
  }
  .chips {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 16px;
    border-bottom: 1px solid var(--surface2);
    flex: none; /* never let the flex column shrink/clip this row (tall "All" list did) */
  }
  .target {
    padding: 6px 11px;
    background: var(--accent-tint);
    border: 1px solid var(--accent-border);
    border-radius: 7px;
    font-size: 11px;
    font-weight: 600;
    color: var(--accentbright);
    white-space: nowrap;
  }
  .cats {
    display: flex;
    gap: 6px;
    padding: 10px 16px;
    overflow-x: auto;
    border-bottom: 1px solid var(--surface2);
    flex: none;
  }
  /* mobile: wrap categories onto multiple rows instead of a hidden horizontal scrollbar */
  .card.mob .cats {
    flex-wrap: wrap;
    overflow-x: visible;
  }
  .cat {
    flex: none;
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid var(--surface-3);
    background: var(--panel-2);
    color: var(--textdim);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    outline: none;
  }
  .cat:focus-visible {
    border-color: var(--accent);
  }
  .cat.on {
    background: rgba(53, 201, 214, 0.14);
    border-color: var(--accent-border);
    color: var(--accent);
  }
  .cat:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .list {
    flex: 1;
    min-height: 140px;
    overflow-y: auto;
    padding: 8px 8px 10px;
  }
  .foot {
    display: flex;
    gap: 16px;
    padding: 10px 16px;
    border-top: 1px solid var(--surface2);
    font-size: 10px;
    color: var(--text-faint);
    flex: none;
  }
  .foot-end {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
</style>
