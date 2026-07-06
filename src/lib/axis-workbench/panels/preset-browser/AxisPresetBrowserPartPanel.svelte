<script lang="ts">
  import { onMount } from 'svelte';
  import { library } from '../../../library.svelte';
  import PresetBrowser from '../../../PresetBrowser.svelte';
  import type { PanelInstance } from '../../../workbench';
  import { bindAxisRuntimeHost } from '../../runtimeBinding';
  import {
    createAxisPresetBrowserDataView,
    type AxisPresetBrowserEntrySummary
  } from '../../presetBrowser/presetBrowserWorkbenchData';
  import {
    axisPresetBrowserPartFromPanelType,
    parseAxisPresetBrowserPart,
    type AxisPresetBrowserPart
  } from '../../presetBrowser/types';
  import {
    axisPresetBrowserWorkbenchController,
    type AxisPresetBrowserControllerSnapshot
  } from '../../presetBrowser/presetBrowserWorkbenchController';
  import {
    axisPresetBrowserWorkbenchRuntime,
    type AxisPresetBrowserRuntimeSnapshot
  } from '../../presetBrowser/presetBrowserWorkbenchRuntime';
  import { createAxisPresetBrowserWorkbenchHost } from '../../presetBrowser/presetBrowserWorkbenchHost';

  let { panel }: { panel: PanelInstance } = $props();
  let snapshot = $state<AxisPresetBrowserControllerSnapshot>(axisPresetBrowserWorkbenchController.snapshot);
  let runtimeSnapshot = $state<AxisPresetBrowserRuntimeSnapshot>(axisPresetBrowserWorkbenchRuntime.snapshot);
  let lastDetailEntryId: string | null = null;
  const part = $derived<AxisPresetBrowserPart>(
    parseAxisPresetBrowserPart(panel.state?.part, axisPresetBrowserPartFromPanelType(panel.type))
  );
  const data = $derived(createAxisPresetBrowserDataView({
    entries: library.entries,
    filteredEntries: library.filtered,
    sourceId: snapshot.sourceId,
    selectedEntryId: snapshot.entryId,
    tagsOf: library.tagsOf
  }));
  const selectedDetail = $derived(snapshot.entryId ? runtimeSnapshot.details[snapshot.entryId] : null);

  onMount(() => {
    return bindAxisRuntimeHost({
      runtime: axisPresetBrowserWorkbenchRuntime,
      host: createAxisPresetBrowserWorkbenchHost(),
      onSnapshot: (next) => (runtimeSnapshot = next)
    });
  });

  $effect(() => {
    axisPresetBrowserWorkbenchController.setPart(part);
  });

  $effect(() => axisPresetBrowserWorkbenchController.subscribe((next) => (snapshot = next)));

  $effect(() => {
    if (part !== 'detail' || !snapshot.entryId || snapshot.entryId === lastDetailEntryId) return;
    lastDetailEntryId = snapshot.entryId;
    void axisPresetBrowserWorkbenchRuntime.loadDetail(snapshot.entryId);
  });

  function selectSource(sourceId: string) {
    axisPresetBrowserWorkbenchController.openSource(sourceId);
  }

  function selectEntry(entry: AxisPresetBrowserEntrySummary) {
    axisPresetBrowserWorkbenchController.selectEntry(entry.id);
  }

  function loadEntry(entry: AxisPresetBrowserEntrySummary) {
    axisPresetBrowserWorkbenchController.selectEntry(entry.id);
    void axisPresetBrowserWorkbenchRuntime.loadEntry(entry.id);
  }

  function auditionEntry(entry: AxisPresetBrowserEntrySummary) {
    axisPresetBrowserWorkbenchController.selectEntry(entry.id);
    void axisPresetBrowserWorkbenchRuntime.auditionEntry(entry.id);
  }
</script>

{#if part === 'full'}
  <div class="axis-pane-fill">
    <PresetBrowser />
  </div>
{:else}
  <section class="axis-part-pane" data-part={part}>
    <header>
      <span>Preset Browser</span>
      <strong>{part}</strong>
    </header>

    {#if part === 'sources'}
      <div class="axis-source-total">
        <strong>{data.entries.length}</strong>
        <span>indexed presets</span>
      </div>
      <div class="axis-part-list">
        {#each data.sources as source}
          <button type="button" class:active={data.activeSourceId === source.id} onclick={() => selectSource(source.id)}>
            <span class="source-main">
              <strong>{source.label}</strong>
              <i style:width={`${data.entries.length ? Math.max(4, (source.count / data.entries.length) * 100) : 0}%`}></i>
            </span>
            <em>{source.count}</em>
          </button>
        {/each}
      </div>
    {:else if part === 'list'}
      {#if data.visibleEntries.length}
        <div class="axis-list-summary">
          <span>{data.visibleEntries.length} presets</span>
          <strong>{data.sources.find((source) => source.id === data.activeSourceId)?.label ?? data.activeSourceId}</strong>
        </div>
        <div class="axis-preset-list" role="listbox" aria-label="Preset list">
          {#each data.visibleEntries.slice(0, 120) as entry}
            <button
              type="button"
              class:active={snapshot.entryId === entry.id}
              class:fav={entry.fav}
              onclick={() => selectEntry(entry)}
              ondblclick={() => loadEntry(entry)}
              role="option"
              aria-selected={snapshot.entryId === entry.id}
            >
              <span class="preset-number">{entry.number == null ? entry.sourceLabel : String(entry.number).padStart(3, '0')}</span>
              <span class="preset-main">
                <strong>{entry.name}</strong>
                <small>{entry.model || `${entry.blockCount} blocks`}</small>
              </span>
              <span class="preset-meta">
                <i>{entry.sceneCount} scn</i>
                <i>{entry.blockCount} blk</i>
              </span>
            </button>
          {/each}
        </div>
      {:else}
        <div class="axis-part-empty">
          <strong>{data.sources.find((source) => source.id === data.activeSourceId)?.label ?? data.activeSourceId}</strong>
          <span>No presets in this source</span>
        </div>
      {/if}
    {:else if part === 'detail'}
      {#if data.selectedEntry}
        <article class="axis-preset-detail">
          <div class="detail-title">
            <span>{data.selectedEntry.number == null ? data.selectedEntry.sourceLabel : `Preset ${String(data.selectedEntry.number).padStart(3, '0')}`}</span>
            <h3>{data.selectedEntry.name}</h3>
            {#if data.selectedEntry.model}<p>{data.selectedEntry.model}</p>{/if}
          </div>

          <div class="detail-status">
            <span class:on={selectedDetail?.gridLoaded}>Grid</span>
            <span class:on={selectedDetail?.paramsLoaded}>Params</span>
            <span class:on={(selectedDetail?.versions.length ?? 0) > 0}>Versions</span>
          </div>

          <dl>
            <div><dt>Source</dt><dd>{data.selectedEntry.sourceLabel}</dd></div>
            <div><dt>Scenes</dt><dd>{data.selectedEntry.sceneCount}</dd></div>
            <div><dt>Blocks</dt><dd>{data.selectedEntry.blockCount}</dd></div>
            {#if data.selectedEntry.folder}<div><dt>Folder</dt><dd>{data.selectedEntry.folder}</dd></div>{/if}
          </dl>

          {#if data.selectedEntry.tags.length}
            <div class="tag-row">
              {#each data.selectedEntry.tags as tag}<span>{tag}</span>{/each}
            </div>
          {/if}

          {#if data.selectedEntry.blocks.length}
            <div class="block-list">
              {#each data.selectedEntry.blocks as block, index}
                <button
                  type="button"
                  class:active={snapshot.focusedBlockEffectId != null && snapshot.focusedBlockEffectId === block.effectId}
                  onclick={() => axisPresetBrowserWorkbenchController.focusBlock(block.effectId ?? null)}
                >
                  <span>{block.name ?? block.slug ?? `Block ${index + 1}`}</span>
                  {#if block.slug}<em>{block.slug}</em>{/if}
                </button>
              {/each}
            </div>
          {/if}
          <div class="detail-actions">
            <button type="button" class="load-action" onclick={() => axisPresetBrowserWorkbenchRuntime.loadEntry(data.selectedEntry!.id)}>
              {runtimeSnapshot.loadingEntryId === data.selectedEntry.id ? 'Loading...' : 'Load preset'}
            </button>
            {#if data.selectedEntry.sourceId === 'device' && data.selectedEntry.number != null}
              <button type="button" class="load-action audition" onclick={() => auditionEntry(data.selectedEntry!)}>
                {runtimeSnapshot.auditioningEntryId === data.selectedEntry.id ? 'Auditioning...' : 'Audition'}
              </button>
            {/if}
            <button type="button" class="load-action secondary" onclick={() => axisPresetBrowserWorkbenchRuntime.loadDetail(data.selectedEntry!.id)}>
              {runtimeSnapshot.hydratingEntryId === data.selectedEntry.id ? 'Refreshing...' : 'Refresh detail'}
            </button>
          </div>

          {#if selectedDetail}
            <div class="runtime-detail">
              <span>{selectedDetail.paramsLoaded ? 'Params loaded' : 'Summary params only'}</span>
              <span>{selectedDetail.gridLoaded ? 'Grid preview ready' : 'No grid preview'}</span>
              <span>{selectedDetail.versions.length} version{selectedDetail.versions.length === 1 ? '' : 's'}</span>
            </div>
          {/if}

          {#if runtimeSnapshot.error}
            <p class="runtime-error">{runtimeSnapshot.error}</p>
          {/if}
        </article>
      {:else}
        <div class="axis-part-empty">
          <strong>No preset selected</strong>
          <span>Select a preset in the list pane</span>
        </div>
      {/if}
    {/if}
  </section>
{/if}

<style>
  .axis-pane-fill {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg);
  }
  .axis-part-pane {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    overflow: auto;
    background: var(--bg);
    color: var(--text2);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: var(--textdim);
    font: 800 10px/1 var(--font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  header strong {
    color: var(--accent);
  }
  .axis-part-list {
    display: grid;
    gap: 8px;
  }
  .axis-source-total,
  .axis-list-summary {
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
  .axis-source-total strong,
  .axis-list-summary strong {
    color: var(--text);
    font: 900 18px/1 var(--font-mono);
  }
  .axis-source-total span,
  .axis-list-summary span {
    color: var(--textdim);
    font: 800 10px/1 var(--font-mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .axis-list-summary strong {
    font-size: 12px;
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
  .axis-preset-list {
    display: grid;
    gap: 4px;
  }
  .axis-preset-list button {
    min-height: 42px;
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 5px 9px;
    text-transform: none;
  }
  .preset-number {
    color: var(--textdim);
    font: 800 11px/1 var(--font-mono);
  }
  .preset-main {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .preset-main strong,
  .preset-main small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .preset-main strong {
    color: var(--text);
    font-size: 12px;
  }
  .preset-main small,
  .preset-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
    color: var(--textdim);
    font-size: 10px;
  }
  .preset-meta i {
    font-style: normal;
  }
  .axis-preset-list button.fav .preset-number {
    color: var(--accent);
  }
  .axis-preset-detail {
    display: grid;
    gap: 14px;
  }
  .detail-title {
    display: grid;
    gap: 6px;
  }
  .detail-title span {
    color: var(--accent);
    font: 800 10px/1 var(--font-mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .detail-title h3 {
    margin: 0;
    color: var(--text);
    font-size: 18px;
    line-height: 1.2;
  }
  .detail-title p {
    margin: 0;
    color: var(--textdim);
    font-size: 12px;
  }
  .detail-status {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
  }
  .detail-status span {
    height: 28px;
    display: grid;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg2);
    color: var(--textdim);
    font: 800 10px/1 var(--font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .detail-status span.on {
    border-color: color-mix(in srgb, var(--accent) 48%, var(--border));
    color: var(--accent);
  }
  dl {
    margin: 0;
    display: grid;
    gap: 6px;
  }
  dl div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
    padding-bottom: 6px;
  }
  dt,
  dd {
    margin: 0;
    font-size: 11px;
  }
  dt {
    color: var(--textdim);
  }
  dd {
    color: var(--text2);
    text-align: right;
  }
  .tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .tag-row span {
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 4px 7px;
    color: var(--text2);
    font-size: 10px;
  }
  .block-list {
    display: grid;
    gap: 5px;
  }
  .detail-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
    gap: 7px;
  }
  .load-action {
    height: 34px;
    text-align: center;
    text-transform: none;
  }
  .load-action.audition {
    color: var(--accent);
  }
  .load-action.secondary {
    color: var(--textdim);
  }
  .runtime-detail {
    display: grid;
    gap: 5px;
    color: var(--textdim);
    font-size: 11px;
  }
  .runtime-error {
    margin: 0;
    color: var(--danger, #d6543f);
    font-size: 11px;
    line-height: 1.4;
  }
  .block-list button {
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 9px;
    text-transform: none;
  }
  .block-list span,
  .block-list em {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .block-list em {
    color: var(--textdim);
    font-style: normal;
    font-size: 10px;
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
