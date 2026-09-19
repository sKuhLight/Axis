<script lang="ts">
  import { library } from '$lib/preset/library.svelte';
  import { axisPresetBrowserWorkbenchController } from '../../../presetBrowser/presetBrowserWorkbenchController';
  import type { AxisPresetBrowserPartView } from '../../../presetBrowser/presetBrowserWorkbenchView.svelte';
  import PbListLocationRail from './PbListLocationRail.svelte';

  let { view }: { view: AxisPresetBrowserPartView } = $props();

  // Narrow refinement is a collapsible "Filters" band under the query bar (moved out of the sources
  // sidebar), collapsed by default so it does not push the results down until asked for.
  let narrowOpen = $state(false);
  const narrowSelCount = $derived(
    view.narrowGroups.reduce((n, group) => n + group.values.filter((v) => v.selected).length, 0)
  );
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="query-bar"
  ondragenter={(e) => { e.preventDefault(); view.dragOver = true; }}
  ondragover={(e) => { e.preventDefault(); view.dragOver = true; }}
  ondragleave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) view.dragOver = false; }}
  ondrop={view.onFiltersDrop}
>
  <PbListLocationRail {view} />
  <div class="query-input" class:focus={view.acOpen}>
    <span class="magnifier" aria-hidden="true">⌕</span>
    <!-- One field, always: fuzzy free text, except `` `...` `` spans parse as structured filters
         (see parseUnifiedQuery) — no Simple/Advanced mode to toggle. -->
    <input
      bind:this={view.queryEl}
      type="text"
      spellcheck="false"
      autocomplete="off"
      placeholder={'Search presets, tags, amps — type ` to add a filter'}
      value={view.snapshot.queryText}
      oninput={view.onQueryInput}
      onkeydown={view.onQueryKey}
      onfocus={view.onQueryFocus}
      onblur={view.onQueryBlur}
      onclick={view.onQuerySelect}
      onkeyup={view.onQuerySelect}
    />
    {#if view.snapshot.queryText}
      <button type="button" class="clear-btn" title="Clear" onclick={() => axisPresetBrowserWorkbenchController.clearQuery()}>×</button>
    {/if}
    <!-- §2.2/§3.3 Save search → opens the inline name input in the sources sidebar. The query field is
         the only way in for filters (the backtick), so Save search lives inside the field it reads
         instead of as a peer toolbar control. -->
    <button
      type="button"
      class="save-star"
      class:on={view.snapshot.saving}
      title="Save the current query as a search"
      aria-label="Save search"
      onclick={() => axisPresetBrowserWorkbenchController.setSaving(!view.snapshot.saving)}
    >☆</button>
    {#if view.acOpen}
      <!-- V13e autocomplete dropdown (§2.4) -->
      <div class="ac">
        {#if view.acLabel}<div class="ac-ctx">{view.acLabel}</div>{/if}
        {#each view.acItems as a, i}
          <button
            type="button"
            class="ac-item"
            class:hi={i === view.acIndex}
            onmousedown={(e) => { e.preventDefault(); void view.acceptAc(i); }}
            onmouseenter={() => (view.acIndex = i)}
          >
            <span class="ac-dot" style:background={a.dot ? a.color : 'transparent'} style:border={a.dot ? 'none' : `1px solid ${a.color}`}></span>
            <span class="ac-l">{a.label}</span><span class="ac-sp"></span><span class="ac-h">{a.hint}</span>
          </button>
        {/each}
        {#if !view.acItems.length}<div class="ac-empty">No matches — keep typing</div>{/if}
        <div class="ac-foot"><span>↑↓ move</span><span>↵ insert</span><span>esc close</span></div>
      </div>
    {/if}
  </div>
  <div class="query-tools">
    <span class="tools-sp"></span>
    {#if library.scanning}
      <span class="scan-progress">Scanning {library.scanDone}/{library.scanTotal}…</span>
    {/if}
    <!-- Re-scanning the device and converting a preset are occasional maintenance/tooling, not browsing:
         they live one click deep so the toolbar only carries controls used while searching. -->
    <button
      type="button"
      class="tools-more"
      aria-label="More preset tools"
      aria-haspopup="menu"
      aria-expanded={view.toolsOpen}
      title="More preset tools"
      onclick={(e) => view.openToolsMenu(e)}
    >⋯</button>
  </div>
  <!-- V13e FILTERS builder-chips row (§2.5) — also a drop target for params/blocks dragged from detail.
       Only rendered once it has chips to hold (or a drag in flight): an empty bordered row carrying a
       hint sentence was a whole band of chrome for a tooltip. -->
  {#if view.activeConditions.length || view.dragOver}
  <div class="filters-row" class:dragover={view.dragOver} role="group">
    {#if view.dragOver}<span class="drop-hint">Drop to add a filter</span>{/if}
    {#each view.chipDescriptors as item, ci}
      <div class="fchip">
        {#if item.desc.kind === 'block'}
          <button type="button" class="fchip-head blk" style:--c={item.desc.color} onclick={(e) => view.onAddParam(e, ci, item.desc.kind === 'block' ? item.desc.block : '')} title="Add a parameter condition">
            <span class="fdot" style:background={item.desc.color}></span>{item.desc.label}
          </button>
          {#each item.desc.params as p, pi}
            <span class="fparam">{p.name} {p.glyph} {p.val}<button type="button" class="fpx" onclick={() => view.removeParamAt(ci, pi)}>×</button></span>
          {/each}
          <button type="button" class="faddp" onclick={(e) => view.onAddParam(e, ci, item.desc.kind === 'block' ? item.desc.block : '')}>+ param</button>
        {:else}
          <span
            class="fchip-head"
            oncontextmenu={(e) => item.cond.kind === 'tag' && view.openTagMenu(e, item.cond.val)}
          >
            <span class="fdot" style:background={item.desc.color}></span>{item.desc.text}
          </span>
        {/if}
        <button type="button" class="fcx" onclick={() => view.removeCondAt(ci)}>×</button>
      </div>
    {/each}
    <span class="fsp"></span>
    <button type="button" class="fclrall" onclick={() => axisPresetBrowserWorkbenchController.clearQuery()}>Clear all</button>
  </div>
  {/if}
  <!-- FILTERS (the "narrow" model): the clickable ways to narrow the current results, one group per
       dimension, each value carrying a live count. Relocated from the sources sidebar to sit under
       the query bar as a collapsible band, next to the search it refines. Only shown once something
       has been searched — with no query it would just enumerate the whole library. -->
  {#if view.narrowVisible}
  <div class="narrow-sec">
    <div class="narrow-bar">
      <button
        type="button"
        class="narrow-toggle"
        aria-expanded={narrowOpen}
        onclick={() => (narrowOpen = !narrowOpen)}
      >
        <span class="narrow-chev" class:open={narrowOpen} aria-hidden="true">›</span>
        <span>Filters</span>
        {#if narrowSelCount}<span class="narrow-badge">{narrowSelCount}</span>{/if}
      </button>
      <span class="narrow-sp"></span>
      {#if view.hasNarrow}
        <button type="button" class="narrow-clear" onclick={view.clearAllNarrow}>Clear</button>
      {/if}
    </div>
    {#if narrowOpen}
      {#if view.narrowGroups.length}
        <div class="narrow">
          {#each view.narrowGroups as group (group.key)}
            <div class="ngroup">
              <header class="ng-head">
                <span>{group.label}</span>
                {#if view.narrowActive(group)}
                  <button type="button" class="ng-x" title={`Clear ${group.label}`} aria-label={`Clear ${group.label}`} onclick={() => view.clearNarrow(group)}>×</button>
                {/if}
              </header>
              <div class="ng-list">
                {#each group.values as v (v.value)}
                  <button
                    type="button"
                    class="nv"
                    class:on={v.selected}
                    title={`${v.count} match${v.count === 1 ? '' : 'es'}`}
                    onclick={() => view.toggleNarrow(group, v.value)}
                  >
                    <span class="nv-box">{v.selected ? '✓' : ''}</span>
                    {#if group.kind === 'tag'}<span class="nv-dot" style:background={library.colorOf(v.value)}></span>{/if}
                    <span class="nv-lbl">{v.value}</span>
                    <span class="nv-cnt">{v.count}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="narrow-empty">No further refinement for these results.</div>
      {/if}
    {/if}
  </div>
  {/if}
</div>

<style>
  /* query bar (§2) */
  .query-bar {
    display: grid;
    grid-template-columns: auto minmax(260px, 1fr) auto;
    align-items: center;
    gap: 8px;
  }
  .query-input {
    position: relative;
    display: flex;
    align-items: center;
    height: 40px;
    border: 1px solid var(--border2, var(--border));
    border-radius: 12px;
    background: var(--bg2);
    padding: 0 8px 0 30px;
  }
  .magnifier {
    position: absolute;
    left: 10px;
    color: var(--textdim);
    font-size: 15px;
  }
  .query-input input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--text);
    font: 500 13px/1 var(--font-mono);
    outline: none;
  }
  .clear-btn {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--textdim);
    font-size: 15px;
  }
  /* The query field carries its own controls (clear, save); only occasional tooling trails it. */
  .query-tools {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tools-sp {
    flex: 1;
  }
  .tools-more {
    width: 30px;
    height: 30px;
    padding: 0;
    display: grid;
    place-items: center;
    border-radius: 999px;
    color: var(--textdim);
    font: 700 14px/1 var(--font-mono);
  }
  .scan-progress {
    color: var(--accent);
    font: 700 10px/1 var(--font-mono);
    letter-spacing: 0.06em;
  }
  /* V13e autocomplete dropdown (§2.4) */
  .query-input.focus {
    border-color: var(--accent);
  }
  .ac {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(100% + 6px);
    z-index: 40;
    max-height: 320px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border2, var(--border));
    border-radius: 13px;
    background: var(--surface, var(--bg2));
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
    padding: 5px;
  }
  .ac-ctx {
    padding: 5px 9px 4px;
    color: var(--textdim);
    font: 800 9px/1 var(--font-mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .ac-item {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 30px;
    padding: 0 9px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text2);
    text-transform: none;
  }
  .ac-item.hi {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .ac-dot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 3px;
  }
  .ac-l {
    color: var(--text);
    font: 500 13px/1 var(--font-mono);
  }
  .ac-sp,
  .fsp {
    flex: 1;
  }
  .ac-h {
    color: var(--textdim);
    font: 500 10px/1 var(--font-mono);
  }
  .ac-empty {
    padding: 10px;
    color: var(--textdim);
    font: 500 11px/1.3 var(--font-mono);
    text-align: center;
  }
  .ac-foot {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 9px 3px;
    color: var(--textdim);
    font: 600 9px/1 var(--font-mono);
  }

  /* V13e FILTERS builder-chips row (§2.5) */
  .filters-row {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    padding: 0;
    border: 1px dashed transparent;
    border-radius: 10px;
  }
  .filters-row.dragover {
    padding: 6px 8px;
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--bg2));
  }
  .drop-hint {
    color: var(--accent);
    font: 700 10px/1 var(--font-mono);
  }
  .fchip {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 4px 3px 6px;
    border: 1px solid var(--border2, var(--border));
    border-radius: 8px;
    background: var(--bg2);
  }
  .fchip-head {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text2);
    font: 700 11px/1 var(--font-mono);
    text-transform: none;
  }
  .fchip-head.blk {
    border: 1px solid color-mix(in srgb, var(--c) 55%, transparent);
    background: color-mix(in srgb, var(--c) 15%, transparent);
    color: var(--c);
  }
  .fdot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 3px;
  }
  .fparam {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px 2px 7px;
    border-radius: 6px;
    background: var(--surface2, color-mix(in srgb, var(--accent) 8%, var(--bg)));
    color: var(--text2);
    font: 600 11px/1 var(--font-mono);
  }
  .fpx,
  .fcx {
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--textdim);
    font-size: 13px;
  }
  .fcx {
    border-left: 1px solid var(--border);
    border-radius: 0;
  }
  .faddp {
    height: 22px;
    padding: 0 7px;
    border: 1px dashed var(--border2, var(--border));
    border-radius: 6px;
    background: transparent;
    color: var(--textdim);
    font: 600 10px/1 var(--font-mono);
    text-transform: none;
  }
  .fclrall {
    height: 24px;
    padding: 0 8px;
    border-radius: 7px;
    color: var(--textdim);
    font-size: 11px;
    text-transform: none;
  }
  /* FILTERS (narrow model) — collapsible band under the query bar, moved from the sources sidebar. */
  .narrow-sec {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .narrow-bar {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .narrow-toggle {
    height: 26px;
    padding: 0 8px 0 5px;
    display: flex;
    align-items: center;
    gap: 6px;
    border: 1px solid transparent;
    border-radius: 7px;
    background: transparent;
    color: var(--textdim);
    font: 800 10px/1 var(--font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .narrow-toggle:hover {
    color: var(--text2);
    background: color-mix(in srgb, var(--accent) 7%, transparent);
  }
  .narrow-chev {
    display: inline-block;
    font-size: 13px;
    line-height: 1;
    transition: transform 120ms ease;
  }
  .narrow-chev.open {
    transform: rotate(90deg);
  }
  .narrow-badge {
    min-width: 16px;
    height: 16px;
    padding: 0 5px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    background: var(--accent);
    color: var(--bg);
    font: 800 9px/1 var(--font-mono);
    letter-spacing: 0;
  }
  .narrow-sp {
    flex: 1;
  }
  .narrow-clear {
    height: 22px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--textdim);
    font: 700 10px/1 var(--font-mono);
    text-transform: none;
  }
  .narrow-clear:hover {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 12%, transparent);
  }
  .narrow {
    border: 1px solid color-mix(in srgb, var(--accent) 34%, var(--border));
    border-radius: 11px;
    background: color-mix(in srgb, var(--accent) 4%, var(--bg2));
    padding: 9px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 9px 14px;
  }
  .narrow-empty {
    padding: 8px 10px;
    border: 1px dashed var(--border);
    border-radius: 9px;
    color: var(--textdim);
    font: 500 11px/1.3 var(--font-mono);
  }
  .ngroup {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ng-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 1px 4px 3px;
    color: var(--textfaint);
    font: 800 8.5px/1 var(--font-mono);
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }
  .ng-x {
    margin-left: auto;
    width: 15px;
    height: 15px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--textfaint);
    font-size: 11px;
    text-transform: none;
  }
  .ng-x:hover {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 14%, transparent);
  }
  .ng-list {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .nv {
    height: auto;
    min-height: 28px;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 7px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--text2);
    text-align: left;
    text-transform: none;
    font: 600 12px/1.2 var(--font-ui);
  }
  .nv:hover {
    background: color-mix(in srgb, var(--accent) 7%, transparent);
  }
  .nv-box {
    width: 14px;
    height: 14px;
    flex: none;
    display: grid;
    place-items: center;
    border: 1px solid var(--border3);
    border-radius: 4px;
    color: var(--bg);
    font: 800 9px/1 var(--font-mono);
  }
  .nv-dot {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 2px;
  }
  .nv-lbl {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nv-cnt {
    margin-left: auto;
    flex: none;
    color: var(--textfaint);
    font: 700 10px/1 var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .nv.on {
    border-color: color-mix(in srgb, var(--accent) 52%, var(--border));
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .nv.on .nv-box {
    background: var(--accent);
    border-color: var(--accent);
  }
  .nv.on .nv-lbl {
    color: var(--accent);
    font-weight: 700;
  }
  .nv.on .nv-cnt {
    color: var(--accent);
  }
  /* Trailing control inside the query field: one click, adjacent to the query it saves. */
  .save-star {
    width: 26px;
    height: 26px;
    flex: none;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--textdim);
    font-size: 15px;
  }
  .save-star.on {
    color: var(--accent);
  }
  @media (max-width: 760px) {
    .query-bar {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }
  }
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
</style>
