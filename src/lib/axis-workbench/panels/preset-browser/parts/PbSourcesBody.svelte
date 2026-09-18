<script lang="ts">
  import { library } from '$lib/preset/library.svelte';
  import { isSavedFilterActive, savedFilterDotColor } from '../../../presetBrowser/presetBrowserWorkbenchSavedFilters';
  import { axisPresetBrowserWorkbenchController } from '../../../presetBrowser/presetBrowserWorkbenchController';
  import type { AxisPresetBrowserPartView } from '../../../presetBrowser/presetBrowserWorkbenchView.svelte';

  let { view }: { view: AxisPresetBrowserPartView } = $props();
</script>

<!-- NARROW: the clickable ways to narrow the current results, one group per dimension, each value
     carrying a live count. Clicking builds the same condition the typed language would (see
     presetBrowserWorkbenchNarrow.ts). Only shown once something has been searched — with no query it
     would just enumerate the whole library. -->
{#if view.narrowVisible}
  <header class="section-head narrow-head">
    <span>Narrow</span>
    {#if view.hasNarrow}<button type="button" class="narrow-clear" onclick={view.clearAllNarrow}>Clear</button>{/if}
  </header>
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

  /* NARROW refinement panel */
  .narrow-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .narrow-clear {
    height: 20px;
    padding: 0 7px;
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
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .narrow-empty {
    padding: 8px 10px;
    border: 1px dashed var(--border);
    border-radius: 9px;
    color: var(--textdim);
    font: 500 11px/1.3 var(--font-mono);
  }
  .ngroup {
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
