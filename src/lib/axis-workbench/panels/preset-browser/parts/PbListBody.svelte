<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { deviceSession } from '$lib/editor/editorClients.svelte';
  import { axisPresetBrowserWorkbenchController } from '../../../presetBrowser/presetBrowserWorkbenchController';
  import { isDevicePreset } from '../../../presetBrowser/presetBrowserWorkbenchLoadAction';
  import AxisPresetBrowserRowMain from '../../../presetBrowser/AxisPresetBrowserRowMain.svelte';
  import { longPress } from '../../../longPress';
  import {
    AXIS_PB_INITIAL_ROWS,
    axisPbPresetReveal,
    nextAxisPbVisibleCount
  } from '../../../presetBrowser/presetBrowserWorkbenchLayout';
  import type { AxisPresetBrowserPartView } from '../../../presetBrowser/presetBrowserWorkbenchView.svelte';

  let { view }: { view: AxisPresetBrowserPartView } = $props();
  let listEl = $state<HTMLDivElement | null>(null);
  let sentinelEl = $state<HTMLDivElement | null>(null);

  // §4.1 Lazy scroll batching — mount the first screenful, append the next batch as the sentinel
  // enters view. Same model as the Grid page's quick-search overlay (AxisPresetBrowserSearchOverlay):
  // the full library is reachable, but only the rows on screen are ever mounted.
  let visibleCount = $state(AXIS_PB_INITIAL_ROWS);
  const total = $derived(view.data.visibleEntries.length);
  const rows = $derived(view.data.visibleEntries.slice(0, visibleCount));
  const remaining = $derived(total - rows.length);

  // A new result set (query/sort/source change) starts back at the first batch. Created BEFORE the
  // reveal effect below so an explicit scrollToCurrent resets first, then re-expands to the preset.
  $effect(() => {
    void view.snapshot.queryText;
    void view.snapshot.sort;
    void view.snapshot.sortDir;
    void view.snapshot.presenceView;
    void view.snapshot.sourceId;
    visibleCount = AXIS_PB_INITIAL_ROWS;
  });

  // Reveal the current preset: grow the window past its index, then center it. Replaces the old
  // show-all expansion (`scrollToCurrentRequest` still signals the request). Only the request token is
  // tracked — the entry/data reads are untracked so a later library refresh doesn't re-scroll the list.
  $effect(() => {
    if (!view.scrollToCurrentRequest) return;
    untrack(() => {
      const entries = view.data.visibleEntries;
      const currentIndex = entries.findIndex((entry) => entry.id === view.snapshot.entryId);
      visibleCount = axisPbPresetReveal(entries.length, currentIndex, AXIS_PB_INITIAL_ROWS).visibleCount;
      void tick().then(() => {
        listEl?.querySelector<HTMLElement>('.preset-row.active')?.scrollIntoView({ block: 'center' });
      });
    });
  });

  // Grow when the trailing sentinel scrolls into view. Uses the viewport as root (no scroll-parent
  // lookup) so it works in both the full panel's `.axis-pb-list-scroll` and the list part's chrome.
  $effect(() => {
    const el = sentinelEl;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          visibleCount = nextAxisPbVisibleCount(visibleCount, total);
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  });

  // A tall viewport can fit the whole first batch with no scrollbar to drive the observer, so keep
  // growing after each append while the sentinel is still within the viewport. Clamps at `total`.
  $effect(() => {
    void rows.length;
    if (visibleCount >= total) return;
    void tick().then(() => {
      const rect = sentinelEl?.getBoundingClientRect();
      if (rect && rect.top < window.innerHeight + 300) {
        visibleCount = nextAxisPbVisibleCount(visibleCount, total);
      }
    });
  });
</script>

{#if view.data.visibleEntries.length}
  {@const markedCount = Object.keys(view.snapshot.marked).length}
  {#if markedCount}
    <div class="select-head">
      <span>{markedCount} selected</span>
      <button type="button" onclick={() => axisPresetBrowserWorkbenchController.clearMarks()}>Clear</button>
    </div>
  {/if}
  <!-- §4.1 Sorting is a property of this list, not of the search above it: each column header IS its
       sort control, and the active one carries the direction. The result count rides here too — plain
       while it just states the library size, accent only once it reports a filtered subset. -->
  <div class="result-rail">
    <div class="list-cols">
      <span class="col-pad"></span>
      <button type="button" class="col-sort num" class:on={view.snapshot.sort === 'num'} aria-label={view.sortLabel('num', 'slot number')} onclick={() => view.toggleSort('num')}>#{view.sortArrow('num')}</button>
      <span class="col-mid">
        <button type="button" class="col-sort" class:on={view.snapshot.sort === 'name'} aria-label={view.sortLabel('name', 'name')} onclick={() => view.toggleSort('name')}>Name{view.sortArrow('name')}</button>
        <span class="col-count" class:filtered={total !== view.data.scopedTotal}>
          {total === view.data.scopedTotal ? `${view.data.scopedTotal} presets` : `${total} of ${view.data.scopedTotal}`}
        </span>
        <span class="col-sp"></span>
      </span>
      <span class="col-meta">
        <button type="button" class="col-sort" class:on={view.snapshot.sort === 'recent'} aria-label={view.sortLabel('recent', 'last loaded')} onclick={() => view.toggleSort('recent')}>Recent{view.sortArrow('recent')}</button>
        <span class="meta-div" aria-hidden="true"></span>
        <button
          type="button"
          class="scroll-current"
          aria-label="Scroll to current preset"
          title="Scroll to current preset"
          disabled={!view.data.entries.some((entry) => entry.sourceId === 'device' && entry.number === deviceSession.preset?.number)}
          onclick={view.scrollToCurrent}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="6"></circle>
            <circle cx="12" cy="12" r="1.5"></circle>
            <path d="M12 2v5M12 17v5M2 12h5M17 12h5"></path>
          </svg>
        </button>
      </span>
    </div>
  </div>
  <div bind:this={listEl} class="axis-preset-list" role="listbox" aria-label="Preset list" aria-multiselectable="true">
    {#each rows as entry}
      <div
        class="preset-row"
        class:active={view.snapshot.entryId === entry.id}
        class:marked={view.snapshot.marked[entry.id]}
        class:fav={entry.fav}
        class:empty={entry.empty}
        role="option"
        aria-selected={view.snapshot.entryId === entry.id}
        tabindex="0"
        onclick={(e) => view.onRowClick(entry, e)}
        ondblclick={() => view.doubleClickRow(entry)}
        oncontextmenu={(e) => view.onRowContext(e, entry)}
        onkeydown={(e) => {
          if (e.key === 'Enter' && isDevicePreset(entry)) view.loadEntry(entry);
        }}
        use:longPress={{ onLongPress: (d) => view.rowLongPress(entry, d) }}
      >
        <button
          type="button"
          class="checkbox"
          class:on={view.snapshot.marked[entry.id]}
          aria-label={view.snapshot.marked[entry.id] ? 'Unmark preset' : 'Mark preset'}
          onclick={(e) => {
            e.stopPropagation();
            axisPresetBrowserWorkbenchController.toggleMark(entry.id);
          }}
        >{view.snapshot.marked[entry.id] ? '✓' : ''}</button>
        <span class="preset-number" class:sel={view.snapshot.entryId === entry.id}>{entry.number == null ? entry.sourceLabel : String(entry.number).padStart(3, '0')}</span>
        <span class="preset-main">
          <AxisPresetBrowserRowMain {entry} onTagContextMenu={view.openTagMenu}>
            {#snippet name()}
              {#if view.renamingId === entry.id}
                <!-- svelte-ignore a11y_autofocus -->
                <input
                  class="rename-in"
                  type="text"
                  maxlength="32"
                  autofocus
                  spellcheck="false"
                  bind:value={view.renameValue}
                  onclick={(e) => e.stopPropagation()}
                  ondblclick={(e) => e.stopPropagation()}
                  onkeydown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') view.commitRename(entry);
                    else if (e.key === 'Escape') view.cancelRename();
                  }}
                  onblur={() => view.commitRename(entry)}
                />
              {:else}
                <strong class="row-name" class:dim={entry.empty}>{entry.name}</strong>
              {/if}
            {/snippet}
          </AxisPresetBrowserRowMain>
        </span>
      </div>
    {/each}
  </div>
  {#if remaining > 0}
    <div class="more-hint" bind:this={sentinelEl}>+{remaining} more — scroll to load</div>
  {/if}
{:else}
  <div class="axis-part-empty">
    <strong>{view.data.entries.length ? 'No presets match this filter' : 'Library is empty'}</strong>
    <span>{view.data.entries.length
      ? 'Loosen a parameter range or remove a block condition.'
      : 'Scan the connected device or import .syx files to populate the library.'}</span>
  </div>
{/if}

<style>
  button {
    height: 34px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg2);
    color: var(--text2);
    cursor: pointer;
    text-align: left;
    text-transform: capitalize;
    font: 700 12px/1 var(--font-ui);
  }
  .axis-preset-list {
    display: grid;
    gap: 4px;
  }
  /* §4.3 row: checkbox | number | main(name+tags+block chips) | meta(empty; Recent header sits here). */
  .preset-row {
    min-height: 42px;
    display: grid;
    grid-template-columns: 18px 34px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-left: 2px solid transparent;
    border-radius: 8px;
    background: var(--bg2);
    cursor: pointer;
    /* Double click is the load gesture, so it must not also select the row's text. */
    user-select: none;
  }
  .preset-row:hover {
    background: color-mix(in srgb, var(--accent) 4%, var(--bg2));
  }
  .preset-row:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .preset-number {
    color: var(--textdim);
    font: 800 11px/1 var(--font-mono);
  }
  .preset-main {
    min-width: 0;
    display: grid;
    gap: 4px;
  }
  .rename-in {
    width: 100%;
    /* The row's head is a flex line (name + tags); let the rename field take the name's slot and
       shrink beside any tag pills instead of forcing them off the row. */
    flex: 1 1 auto;
    min-width: 0;
    box-sizing: border-box;
    height: 26px;
    border: 1px solid var(--accent);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    padding: 0 8px;
    font: 600 12px/1 var(--font-mono);
    outline: none;
    /* Opt back in — the row suppresses selection, but the rename field is real text entry. */
    user-select: text;
  }
  /* Cleared/empty device slot row — muted. AxisPresetBrowserRowMain.svelte owns the name/tag-pill/
     chain-strip dimming for `entry.empty`; this rule is the row-level opacity on everything else. */
  .preset-row.empty {
    opacity: 0.55;
  }
  .preset-row.fav .preset-number {
    color: var(--accent);
  }
  .preset-row.active {
    border-left-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 6%, var(--bg2));
  }
  .preset-row.marked {
    border-color: var(--accent);
    border-left-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, var(--bg2));
  }
  .checkbox {
    width: 18px;
    height: 18px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 1px solid var(--border3, var(--border));
    border-radius: 5px;
    background: transparent;
    color: var(--bg);
    cursor: pointer;
    font: 700 11px/1 var(--font-mono);
  }
  .checkbox.on {
    border-color: var(--accent);
    background: var(--accent);
  }
  .preset-number.sel {
    color: var(--amber);
  }

  /* selection header + expander (§4) */
  /* Mirrors .preset-row's grid (18px checkbox | 34px number | main | meta) so each header sits over the
     column it sorts. The row's 1px border + 2px accent rail are absorbed by the asymmetric padding. */
  .result-rail {
    min-width: 0;
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--border);
    margin-bottom: 4px;
  }
  .list-cols {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: 18px 34px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 0 13px 0 14px;
    min-height: 40px;
  }
  .col-mid,
  .col-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .col-meta {
    justify-content: flex-end;
  }
  /* The scroll-to-current control is navigation, not a sort column — a hairline sets it apart from
     the trailing RECENT sort so it doesn't read as a fourth sortable header. */
  .meta-div {
    width: 1px;
    height: 16px;
    flex: none;
    background: var(--border);
  }
  .col-sp {
    flex: 1;
  }
  .scroll-current {
    width: 26px;
    height: 26px;
    flex: none;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: transparent;
    color: var(--accent);
  }
  .scroll-current svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
  }
  .scroll-current:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .list-cols .col-sort {
    height: 24px;
    padding: 0 5px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--textfaint, var(--textdim));
    font: 800 9px/1 var(--font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .list-cols .col-sort:hover {
    color: var(--text2);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .list-cols .col-sort.on {
    color: var(--accent);
  }
  .list-cols .col-sort.num {
    padding-left: 0;
    justify-self: start;
  }
  .col-count {
    color: var(--textdim);
    font: 700 10px/1 var(--font-mono);
    letter-spacing: 0.06em;
    white-space: nowrap;
  }
  /* Accent is reserved for a count that is actually a RESULT — never for the library's resting size. */
  .col-count.filtered {
    color: var(--accent);
  }
  .select-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 42px;
    padding: 0 11px;
    border: 1px solid var(--accent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--accent);
    font: 700 11px/1 var(--font-mono);
    text-transform: uppercase;
  }
  .select-head button {
    height: 28px;
    padding: 0 10px;
    text-transform: none;
  }
  .more-hint {
    padding: 22px 12px;
    text-align: center;
    color: var(--textdim);
    font: 600 11px/1 var(--font-mono);
    letter-spacing: 0.04em;
  }
  .axis-part-empty {
    flex: 1;
    min-height: 140px;
    display: grid;
    place-content: center;
    gap: 8px;
    text-align: center;
    color: var(--textdim);
  }
  .axis-part-empty strong {
    color: var(--text);
    font-size: 13px;
  }
  .axis-part-empty span {
    font-size: 12px;
  }
</style>
