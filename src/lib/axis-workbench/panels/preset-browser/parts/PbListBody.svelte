<script lang="ts">
  import { axisPresetBrowserWorkbenchController } from '../../../presetBrowser/presetBrowserWorkbenchController';
  import { axisPbRowAnatomy } from '../../../presetBrowser/presetBrowserWorkbenchRowChips';
  import { axisPbRowDoubleClickIntent } from '../../../presetBrowser/presetBrowserWorkbenchRowGesture';
  import AxisPresetBrowserRowMain from '../../../presetBrowser/AxisPresetBrowserRowMain.svelte';
  import { longPress } from '../../../longPress';
  import type { AxisPresetBrowserPartView } from '../../../presetBrowser/presetBrowserWorkbenchView.svelte';

  let { view }: { view: AxisPresetBrowserPartView } = $props();
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
  <div class="list-cols">
    <span class="col-pad"></span>
    <button type="button" class="col-sort num" class:on={view.snapshot.sort === 'num'} aria-label={view.sortLabel('num', 'slot number')} onclick={() => view.toggleSort('num')}>#{view.sortArrow('num')}</button>
    <span class="col-mid">
      <button type="button" class="col-sort" class:on={view.snapshot.sort === 'name'} aria-label={view.sortLabel('name', 'name')} onclick={() => view.toggleSort('name')}>Name{view.sortArrow('name')}</button>
      <span class="col-count" class:filtered={view.rowCap.totalRows !== view.data.scopedTotal}>
        {view.rowCap.totalRows === view.data.scopedTotal ? `${view.data.scopedTotal} presets` : `${view.rowCap.totalRows} of ${view.data.scopedTotal}`}
      </span>
      <span class="col-sp"></span>
    </span>
    <span class="col-meta">
      <button type="button" class="col-sort" class:on={view.snapshot.sort === 'recent'} aria-label={view.sortLabel('recent', 'last loaded')} onclick={() => view.toggleSort('recent')}>Recent{view.sortArrow('recent')}</button>
      <button type="button" class="col-sort" class:on={view.snapshot.sort === 'cpu'} aria-label={view.sortLabel('cpu', 'estimated CPU')} onclick={() => view.toggleSort('cpu')}>CPU{view.sortArrow('cpu')}</button>
    </span>
  </div>
  <div class="axis-preset-list" role="listbox" aria-label="Preset list" aria-multiselectable="true">
    {#each view.rowCap.rows as entry}
      {@const anatomy = axisPbRowAnatomy(entry)}
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
        ondblclick={() => axisPbRowDoubleClickIntent({ canRename: view.canRename(entry) }) === 'load' && view.loadEntry(entry)}
        oncontextmenu={(e) => view.onRowContext(e, entry)}
        onkeydown={(e) => {
          if (e.key === 'Enter') view.loadEntry(entry);
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
        <span class="preset-meta">
          <span class="meta-top">
            <i class="scenes">{anatomy.sceneCount} scn</i>
          </span>
          <span class="cpu-meter" title="Estimated DSP load from block makeup — not the device's live CPU">
            <i class="cpu-l">~CPU</i>
            <i class="cpu-bar"><b style:width={`${anatomy.cpu.pct}%`} style:background={anatomy.cpu.color}></b></i>
            <i class="cpu-t" style:color={anatomy.cpu.color}>{anatomy.cpu.pct}%</i>
          </span>
        </span>
      </div>
    {/each}
  </div>
  {#if view.rowCap.capped}
    <button type="button" class="show-all" onclick={() => axisPresetBrowserWorkbenchController.setShowAllRows(true)}>
      Show all {view.rowCap.totalRows} presets
    </button>
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
  /* §4.3 row: checkbox | number | main(name+tags+block chips) | meta(scenes + CPU meter). */
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
  .preset-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 5px;
  }
  .meta-top {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .preset-meta i {
    font-style: normal;
  }
  .scenes {
    color: var(--textdim);
    font: 600 9.5px/1 var(--font-mono);
  }
  .cpu-meter {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .cpu-l {
    color: var(--textmuted, var(--textdim));
    font: 600 8px/1 var(--font-mono);
    letter-spacing: 0.06em;
  }
  .cpu-bar {
    width: 46px;
    height: 6px;
    display: block;
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
    background: var(--track, var(--bg));
  }
  .cpu-bar b {
    display: block;
    height: 100%;
  }
  .cpu-t {
    font: 700 10px/1 var(--font-mono);
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
  .list-cols {
    display: grid;
    grid-template-columns: 18px 34px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 0 13px 0 14px;
    min-height: 30px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 4px;
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
  .col-sp {
    flex: 1;
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
  .show-all {
    height: 40px;
    border-radius: 10px;
    border: 1px solid var(--border2, var(--border));
    background: var(--surface, var(--bg2));
    color: var(--text2);
    text-align: center;
    text-transform: none;
    font: 700 12px/1 var(--font-ui);
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
