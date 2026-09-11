<script lang="ts">
  import { library } from '$lib/preset/library.svelte';
  import { isSavedFilterActive, savedFilterDotColor } from '../../../presetBrowser/presetBrowserWorkbenchSavedFilters';
  import { axisPresetBrowserWorkbenchController } from '../../../presetBrowser/presetBrowserWorkbenchController';
  import type { AxisPresetBrowserPartView } from '../../../presetBrowser/presetBrowserWorkbenchView.svelte';

  let { view }: { view: AxisPresetBrowserPartView } = $props();
</script>

<div class="axis-source-total">
  <strong>{view.data.entries.length}</strong>
  <span>indexed presets</span>
</div>

<!-- §3 LIBRARY: library views with live counts. Selecting one filters the list exactly like the
     monolith's equivalent (All presets / On this device). -->
<header class="section-head"><span>Library</span></header>
<div class="axis-part-list views-list">
  {#each view.data.presenceViews as pview}
    <button
      type="button"
      class="view-row"
      class:active={view.data.activePresenceView === pview.id}
      onclick={() => axisPresetBrowserWorkbenchController.setPresenceView(pview.id)}
    >
      <span class="view-glyph" style:color={pview.color} aria-hidden="true">{pview.glyph}</span>
      <strong>{pview.label}</strong>
      <em>{pview.count}</em>
    </button>
  {/each}
</div>

<header class="section-head"><span>Sources</span></header>
<div class="axis-part-list">
  {#each view.data.sources as source}
    <button type="button" class:active={view.data.activeSourceId === source.id} onclick={() => view.selectSource(source.id)}>
      <span class="source-main">
        <strong>{source.label}</strong>
        <i style:width={`${view.data.entries.length ? Math.max(4, (source.count / view.data.entries.length) * 100) : 0}%`}></i>
      </span>
      <em>{source.count}</em>
    </button>
  {/each}
</div>

<!-- §3.3 SAVED SEARCHES: name + query subtitle + active highlight (parsed-query equality) + delete ×.
     Applying one loads its query via applyQueryText. Persisted to the shared axs.pb.saved store. -->
<header class="section-head saved-head">
  <span>Saved searches</span>
  <em>{view.savedFilters.length}</em>
</header>
{#if view.snapshot.saving}
  <div class="save-in">
    <input
      type="text"
      bind:value={view.saveName}
      placeholder="Name this search…"
      spellcheck="false"
      onkeydown={(e) => {
        if (e.key === 'Enter') view.commitSaveFilter();
        else if (e.key === 'Escape') axisPresetBrowserWorkbenchController.setSaving(false);
      }}
    />
  </div>
{/if}
<div class="saved-list">
  {#each view.savedFilters as filter (filter.id)}
    {@const active = isSavedFilterActive(filter, view.activeConditions)}
    <div class="sv" class:active>
      <button type="button" class="sv-main" onclick={() => view.applySavedFilter(filter)}>
        <span class="sv-dot" style:background={savedFilterDotColor(filter)}></span>
        <span class="sv-txt">
          <strong>{filter.name}</strong>
          <small>{filter.query || '(empty)'}</small>
        </span>
      </button>
      <button type="button" class="sv-x" title="Delete search" onclick={() => view.deleteSavedFilter(filter.id)}>×</button>
    </div>
  {/each}
  {#if !view.savedFilters.length}
    <div class="empty-s">No saved searches yet. Build a query and hit Save search.</div>
  {/if}
</div>

<header class="section-head"><span>Frequent tags</span></header>
<div class="quick-tags">
  {#each view.tagRow as tag}
    {@const on = view.activeTags.has(tag.toLowerCase())}
    <button
      type="button"
      class="quick-tag"
      class:on
      style:--tag-col={library.colorOf(tag)}
      onclick={() => {
        if (!on) view.recordTagUsage(tag);
        axisPresetBrowserWorkbenchController.toggleTag(tag);
      }}
      oncontextmenu={(e) => view.openTagMenu(e, tag)}
    >
      {tag}
    </button>
  {/each}
</div>

<style>
  .axis-source-total {
    min-height: 42px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid color-mix(in srgb, var(--accent) 20%, var(--border));
    border-radius: 8px;
    padding: 0 11px;
    background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 9%, transparent), transparent);
  }
  .axis-source-total strong {
    color: var(--text);
    font: 900 18px/1 var(--font-mono);
  }
  .axis-source-total span {
    color: var(--textdim);
    font: 800 10px/1 var(--font-mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
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
  .axis-part-list button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 0 10px;
  }
  .source-main {
    min-width: 0;
    display: grid;
    gap: 6px;
    flex: 1;
  }
  .source-main strong {
    min-width: 0;
    overflow: hidden;
    color: var(--text2);
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }
  .source-main i {
    height: 3px;
    max-width: 100%;
    border-radius: 999px;
    background: var(--accent);
  }
  .axis-part-list em {
    color: var(--textdim);
    font-style: normal;
    font-size: 11px;
  }
  button.active {
    border-color: var(--accent);
    color: var(--accent);
  }
  .axis-part-list {
    display: grid;
    gap: 8px;
  }

  /* section head + quick tags (§3) */
  .section-head {
    margin-top: 4px;
  }
  .section-head.saved-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .section-head em {
    color: var(--textdim);
    font-style: normal;
    font: 800 10px/1 var(--font-mono);
  }

  /* §3 presence views (LIBRARY list) */
  .views-list button.view-row {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    padding: 0 10px;
    text-transform: none;
  }
  .view-glyph {
    display: grid;
    place-items: center;
    font-size: 13px;
  }
  .view-row strong {
    min-width: 0;
    overflow: hidden;
    color: var(--text2);
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 700 12.5px/1 var(--font-ui);
  }
  .view-row.active {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
    background: color-mix(in srgb, var(--accent) 8%, transparent);
    color: var(--accent);
  }
  .view-row.active strong {
    color: var(--accent);
  }
  /* §3.3 saved filters */
  .save-in input {
    width: 100%;
    height: 32px;
    border: 1px solid var(--accent);
    border-radius: 8px;
    background: var(--bg2);
    color: var(--text);
    padding: 0 10px;
    font: 500 12px/1 var(--font-mono);
    outline: none;
  }
  .saved-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .sv {
    display: flex;
    align-items: stretch;
    gap: 4px;
  }
  .sv-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    height: auto;
    min-height: 38px;
    padding: 6px 10px;
    text-transform: none;
  }
  .sv.active .sv-main {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .sv-dot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 999px;
    background: var(--textdim);
  }
  .sv-txt {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .sv-txt strong {
    min-width: 0;
    overflow: hidden;
    color: var(--text2);
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 700 12.5px/1 var(--font-ui);
  }
  .sv.active .sv-txt strong {
    color: var(--accent);
  }
  .sv-txt small {
    min-width: 0;
    overflow: hidden;
    color: var(--textdim);
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 500 9.5px/1.2 var(--font-mono);
  }
  .sv-x {
    width: 28px;
    flex: none;
    display: grid;
    place-items: center;
    color: var(--textdim);
    font-size: 15px;
    text-transform: none;
  }
  .empty-s {
    padding: 8px 10px;
    color: var(--textdim);
    font: 500 11px/1.3 var(--font-mono);
  }
  .quick-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .quick-tag {
    height: auto;
    padding: 5px 10px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--tag-col) 33%, transparent);
    background: color-mix(in srgb, var(--tag-col) 14%, transparent);
    color: var(--tag-col);
    font: 700 11px/1 var(--font-mono);
    text-transform: none;
  }
  .quick-tag.on {
    background: var(--tag-col);
    color: var(--bg);
  }
</style>
