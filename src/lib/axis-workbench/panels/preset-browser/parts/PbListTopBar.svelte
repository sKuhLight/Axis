<script lang="ts">
  import { deviceSession } from '$lib/editor/editorClients.svelte';
  import { library } from '$lib/preset/library.svelte';
  import { axisPresetBrowserWorkbenchController } from '../../../presetBrowser/presetBrowserWorkbenchController';
  import type { AxisPresetBrowserPartView } from '../../../presetBrowser/presetBrowserWorkbenchView.svelte';

  let { view }: { view: AxisPresetBrowserPartView } = $props();

  const activeScope = $derived(
    view.data.activePresenceView === 'computer' || ['local', 'file', 'converted'].includes(view.data.activeSourceId)
      ? 'computer'
      : view.data.activeSourceId === 'device' || view.data.activePresenceView === 'device'
        ? 'device'
        : 'all'
  );
  const computerSources = $derived(view.data.sources.filter((source) => ['local', 'file', 'converted'].includes(source.id)));
  const scopeCounts = $derived(Object.fromEntries(view.data.presenceViews.map((scope) => [scope.id, scope.count])));

  function selectScope(scope: 'all' | 'device' | 'computer') {
    view.selectSource(scope === 'device' ? 'device' : 'all');
    axisPresetBrowserWorkbenchController.setPresenceView(scope === 'computer' ? 'computer' : 'all');
  }

  function selectComputerSource(sourceId: string) {
    axisPresetBrowserWorkbenchController.setPresenceView('computer');
    view.selectSource(sourceId);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="query-bar"
  ondragenter={(e) => { e.preventDefault(); view.dragOver = true; }}
  ondragover={(e) => { e.preventDefault(); view.dragOver = true; }}
  ondragleave={(e) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) view.dragOver = false; }}
  ondrop={view.onFiltersDrop}
>
  <div class="scope-bar">
    <span class="scope-label">Search in</span>
    <div class="scope-tabs" role="tablist" aria-label="Preset location">
      <button type="button" role="tab" aria-selected={activeScope === 'all'} class:active={activeScope === 'all'} onclick={() => selectScope('all')}><strong>All</strong><span>{scopeCounts.all ?? 0}</span></button>
      <button type="button" role="tab" aria-selected={activeScope === 'device'} class:active={activeScope === 'device'} onclick={() => selectScope('device')}><strong>Device</strong><span>{scopeCounts.device ?? 0}/{deviceSession.presetCount}</span></button>
      <button type="button" role="tab" aria-selected={activeScope === 'computer'} class:active={activeScope === 'computer'} onclick={() => selectScope('computer')}><strong>Computer</strong><span>{scopeCounts.computer ?? 0}</span></button>
    </div>
    <div class="computer-tray" class:open={activeScope === 'computer'} aria-hidden={activeScope !== 'computer'}>
      <div class="computer-options">
        <button type="button" class:active={view.data.activeSourceId === 'all'} onclick={() => selectScope('computer')}>All computer</button>
        {#each computerSources as source}
          <button type="button" class:active={view.data.activeSourceId === source.id} onclick={() => selectComputerSource(source.id)}>{source.label}<span>{source.count}</span></button>
        {/each}
      </div>
    </div>
  </div>
  <div class="query-input" class:focus={view.acOpen}>
    <span class="magnifier" aria-hidden="true">⌕</span>
    <!-- One field, always: fuzzy free text, except `` `...` `` spans parse as structured filters
         (see parseUnifiedQuery) — no Simple/Advanced mode to toggle. -->
    <input
      bind:this={view.queryEl}
      type="text"
      spellcheck="false"
      autocomplete="off"
      placeholder={'Search presets, tags, amps… or `AMP(Type=5153)` for filters'}
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
    <button type="button" class="add-filter" onclick={view.onAddFilter}><span class="plus">+</span> Add filter</button>
    <button
      type="button"
      class="scroll-current"
      disabled={!view.data.entries.some((entry) => entry.sourceId === 'device' && entry.number === deviceSession.preset?.number)}
      onclick={view.scrollToCurrent}
    >Scroll to current</button>
    <!-- §2.2/§3.3 Save search → opens the inline name input in the sources sidebar. -->
    <button
      type="button"
      class="save-filter"
      class:on={view.snapshot.saving}
      title="Save the current query as a search"
      onclick={() => axisPresetBrowserWorkbenchController.setSaving(!view.snapshot.saving)}
    >
      ☆ Save search
    </button>
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
</div>

<style>
  /* query bar (§2) */
  .query-bar {
    display: grid;
    gap: 8px;
  }
  .scope-bar {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
  }
  .scope-label {
    flex: none;
    color: var(--textdim);
    font: 800 10px/1 var(--font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .scope-tabs {
    flex: none;
    display: flex;
    gap: 6px;
  }
  .scope-tabs button,
  .computer-options button {
    height: 42px;
    border-color: var(--border2);
    border-radius: 10px;
    background: var(--bg2);
    color: var(--textdim);
    text-align: left;
    text-transform: none;
    font-size: 12px;
  }
  .scope-tabs button {
    min-width: 112px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    padding: 0 12px;
  }
  .scope-tabs button strong {
    font-weight: 800;
  }
  .scope-tabs button span {
    color: var(--textfaint);
    font: 700 9px/1 var(--font-mono);
  }
  .scope-tabs button.active,
  .computer-options button.active {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border2));
    background: color-mix(in srgb, var(--accent) 9%, var(--bg2));
    color: var(--accent);
  }
  .scope-tabs button.active span {
    color: var(--accent);
    opacity: 0.72;
  }
  .computer-tray {
    min-width: 0;
    max-width: 0;
    overflow: hidden;
    opacity: 0;
    transform: translateX(-10px);
    transition: max-width 180ms ease, opacity 140ms ease, transform 180ms ease;
  }
  .computer-tray.open {
    max-width: 500px;
    opacity: 1;
    transform: translateX(0);
  }
  .computer-options {
    display: flex;
    gap: 3px;
    width: max-content;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--bg2);
  }
  .computer-options button {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 32px;
    padding: 0 9px;
    white-space: nowrap;
  }
  .computer-options span {
    color: var(--textfaint);
    font: 700 9px/1 var(--font-mono);
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
  /* One toolbar line: the query builder's own controls on the left, everything occasional behind ⋯. */
  .query-tools {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .tools-sp {
    flex: 1;
  }
  .add-filter {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    padding: 0 11px;
    border-radius: 999px;
    text-transform: none;
    font: 700 11px/1 var(--font-mono);
  }
  .add-filter .plus {
    color: var(--accent);
    font-size: 13px;
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
  .save-filter,
  .scroll-current {
    height: 30px;
    padding: 0 11px;
    border-radius: 999px;
    text-transform: none;
    font: 700 11px/1 var(--font-mono);
  }
  .scroll-current:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .save-filter.on {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accentink, var(--bg));
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
