<script lang="ts">
  import { onMount } from 'svelte';
  import { library } from '../../../library.svelte';
  import { editor } from '../../../editor.svelte';
  import { cloud, browseEntries } from '../../../cloud.svelte';
  import type { SyncState } from '../../../types';
  import type { PanelInstance } from '../../../workbench';
  import { bindAxisRuntimeHost } from '../../runtimeBinding';
  import {
    createAxisPresetBrowserDataView,
    type AxisPresetBrowserEntrySummary,
    type AxisPresetBrowserLibEntryLike
  } from '../../presetBrowser/presetBrowserWorkbenchData';
  import { presenceViewsForAuth } from '../../presetBrowser/presetBrowserWorkbenchPresence';
  import {
    loadSavedFilters,
    persistSavedFilters,
    addSavedFilter,
    removeSavedFilter,
    isSavedFilterActive,
    savedFilterDotColor,
    type AxisPbSavedFilter
  } from '../../presetBrowser/presetBrowserWorkbenchSavedFilters';
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
  import { applyRowCap } from '../../presetBrowser/presetBrowserWorkbenchLayout';
  import {
    AXIS_PB_QUICK_TAGS,
    condsToQuery
  } from '../../presetBrowser/presetBrowserWorkbenchQuery';

  let { panel }: { panel: PanelInstance } = $props();
  let snapshot = $state<AxisPresetBrowserControllerSnapshot>(axisPresetBrowserWorkbenchController.snapshot);
  let runtimeSnapshot = $state<AxisPresetBrowserRuntimeSnapshot>(axisPresetBrowserWorkbenchRuntime.snapshot);
  let lastDetailEntryId: string | null = null;
  const part = $derived<AxisPresetBrowserPart>(
    parseAxisPresetBrowserPart(panel.state?.part, axisPresetBrowserPartFromPanelType(panel.type))
  );
  // Live conditions the query filters by (advanced typed query, or simple chips + typed text).
  const activeConditions = $derived.by(() => {
    void snapshot; // re-derive on any snapshot change
    return axisPresetBrowserWorkbenchController.activeConditions;
  });
  // Cloud is live only when the engine has cloud enabled AND the user is signed in (mirrors the monolith's
  // `cloudOn`, PresetBrowser.svelte). Signed out → base library only + honest 'none' sync state (no dead
  // cloud rows); signed in → device library + cloud-only presets merged (browseEntries) so cloud-only rigs
  // are browseable, and each entry's sync state resolves through the reactive cloud store.
  const cloudOn = $derived(editor.cloud.enabled && !!editor.cloud.user);
  const baseEntries = $derived.by<AxisPresetBrowserLibEntryLike[]>(() => {
    void cloud.index; // re-derive when the cloud index refreshes
    return (cloudOn ? browseEntries() : library.entries) as AxisPresetBrowserLibEntryLike[];
  });
  function syncStateOf(entry: AxisPresetBrowserLibEntryLike): SyncState {
    if (!cloudOn) return 'none';
    if (entry.id.startsWith('cloud:')) return 'cloudOnly';
    // dev: entries came from a device scan — they ARE on the unit even without a comparable CRC; never let
    // those read as cloud-only (verbatim rule from the monolith syncStateOf).
    return cloud.stateOf(
      entry.summary.number ?? -1,
      entry.summary.crc ?? undefined,
      entry.id.startsWith('dev:') || entry.summary.crc != null
    );
  }
  const presenceViews = $derived(presenceViewsForAuth(cloudOn));
  const data = $derived(createAxisPresetBrowserDataView({
    entries: baseEntries,
    // When a presence view is active, filter over the full base set (the presence predicate needs the
    // cloud-only rows too); otherwise reuse the library's pre-filtered list.
    filteredEntries: snapshot.presenceView === 'all' && !cloudOn ? library.filtered : baseEntries,
    sourceId: snapshot.sourceId,
    selectedEntryId: snapshot.entryId,
    tagsOf: library.tagsOf,
    conditions: activeConditions,
    simpleQuery: snapshot.advanced ? '' : snapshot.simpleQ,
    sort: snapshot.sort,
    syncStateOf,
    presenceView: snapshot.presenceView,
    presenceViews
  }));

  // Saved filters — shared list (localStorage["axs.pb.saved"] + config mirror), reused from the monolith.
  let savedFilters = $state<AxisPbSavedFilter[]>(loadSavedFilters());
  let saveName = $state('');
  function commitSaveFilter() {
    const name = saveName.trim();
    if (!name) {
      axisPresetBrowserWorkbenchController.setSaving(false);
      saveName = '';
      return;
    }
    savedFilters = addSavedFilter(savedFilters, name, axisPresetBrowserWorkbenchController.currentQueryText());
    persistSavedFilters(savedFilters);
    axisPresetBrowserWorkbenchController.setSaving(false);
    saveName = '';
  }
  function deleteSavedFilter(id: string) {
    savedFilters = removeSavedFilter(savedFilters, id);
    persistSavedFilters(savedFilters);
  }
  function applySavedFilter(filter: AxisPbSavedFilter) {
    axisPresetBrowserWorkbenchController.applyQueryText(filter.query);
  }
  // 14-row soft cap + "Show all" expander (§4.1).
  const rowCap = $derived(applyRowCap(data.visibleEntries, snapshot.showAllRows));
  const activeTags = $derived(
    new Set(activeConditions.filter((c) => c.kind === 'tag').map((c) => c.val.toLowerCase()))
  );
  const isOwner = $derived(snapshot.owner === part);
  const selectedDetail = $derived(snapshot.entryId ? runtimeSnapshot.details[snapshot.entryId] : null);

  onMount(() => {
    return bindAxisRuntimeHost({
      runtime: axisPresetBrowserWorkbenchRuntime,
      host: createAxisPresetBrowserWorkbenchHost(),
      onSnapshot: (next) => (runtimeSnapshot = next)
    });
  });

  // Register this part for overlay-owner election (§1); unregister on unmount.
  $effect(() => axisPresetBrowserWorkbenchController.registerPart(part));

  $effect(() => {
    axisPresetBrowserWorkbenchController.setPart(part);
  });

  $effect(() => axisPresetBrowserWorkbenchController.subscribe((next) => (snapshot = next)));

  function onRowClick(entry: AxisPresetBrowserEntrySummary, event: MouseEvent) {
    if (event.metaKey || event.ctrlKey) {
      axisPresetBrowserWorkbenchController.toggleMark(entry.id);
    } else if (event.shiftKey) {
      axisPresetBrowserWorkbenchController.markRange(data.order, entry.id);
    } else {
      selectEntry(entry);
    }
  }

  // The detail region hydrates whenever it is actually shown — as a dedicated `detail` part OR as the
  // right column of the composed `full` panel (§"full" = sources | list | detail).
  const showsDetail = $derived(part === 'detail' || part === 'full');
  $effect(() => {
    if (!showsDetail || !snapshot.entryId || snapshot.entryId === lastDetailEntryId) return;
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

{#snippet sourcesBody()}
  <div class="axis-source-total">
    <strong>{data.entries.length}</strong>
    <span>indexed presets</span>
  </div>

  <!-- §3 LIBRARY: cloud-presence views with live counts. Selecting one filters the list exactly like the
       monolith's equivalent (In cloud / Cloud only / Not backed up / Needs upload / Needs update). Cloud
       views only render signed-in; signed-out we surface an honest "Sign in for cloud sync" row. -->
  <header class="section-head"><span>Library</span></header>
  <div class="axis-part-list views-list">
    {#each data.presenceViews as view}
      <button
        type="button"
        class="view-row"
        class:active={data.activePresenceView === view.id}
        onclick={() => axisPresetBrowserWorkbenchController.setPresenceView(view.id)}
      >
        <span class="view-glyph" style:color={view.color} aria-hidden="true">{view.glyph}</span>
        <strong>{view.label}</strong>
        <em>{view.count}</em>
      </button>
    {/each}
    {#if !cloudOn}
      <div class="cloud-signin" title="Cloud sync views appear once you sign in">
        <span aria-hidden="true">☁</span>
        <span>Sign in for cloud sync</span>
      </div>
    {/if}
  </div>

  <header class="section-head"><span>Sources</span></header>
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

  <!-- §3.3 SAVED FILTERS: name + query subtitle + active highlight (parsed-query equality) + delete ×.
       Applying one loads its query via applyQueryText. Persisted to the shared axs.pb.saved store. -->
  <header class="section-head saved-head">
    <span>Saved filters</span>
    <em>{savedFilters.length}</em>
  </header>
  {#if snapshot.saving}
    <div class="save-in">
      <input
        type="text"
        bind:value={saveName}
        placeholder="Name this filter…"
        spellcheck="false"
        onkeydown={(e) => {
          if (e.key === 'Enter') commitSaveFilter();
          else if (e.key === 'Escape') axisPresetBrowserWorkbenchController.setSaving(false);
        }}
      />
    </div>
  {/if}
  <div class="saved-list">
    {#each savedFilters as filter (filter.id)}
      {@const active = isSavedFilterActive(filter, activeConditions)}
      <div class="sv" class:active>
        <button type="button" class="sv-main" onclick={() => applySavedFilter(filter)}>
          <span class="sv-dot" style:background={savedFilterDotColor(filter)}></span>
          <span class="sv-txt">
            <strong>{filter.name}</strong>
            <small>{filter.query || '(empty)'}</small>
          </span>
        </button>
        <button type="button" class="sv-x" title="Delete filter" onclick={() => deleteSavedFilter(filter.id)}>×</button>
      </div>
    {/each}
    {#if !savedFilters.length}
      <div class="empty-s">No saved filters yet. Build a query and hit Save filter.</div>
    {/if}
  </div>

  <header class="section-head"><span>Quick tags</span></header>
  <div class="quick-tags">
    {#each AXIS_PB_QUICK_TAGS as tag}
      {@const on = activeTags.has(tag.label.toLowerCase())}
      <button
        type="button"
        class="quick-tag"
        class:on
        style:--tag-col={tag.color}
        onclick={() => axisPresetBrowserWorkbenchController.toggleTag(tag.label)}
      >
        {tag.label}
      </button>
    {/each}
  </div>
{/snippet}

{#snippet listTopBar()}
  <div class="query-bar">
    <div class="query-input">
      <span class="magnifier" aria-hidden="true">⌕</span>
      <input
        type="text"
        spellcheck="false"
        placeholder={snapshot.advanced ? 'AMP(TYPE=5153)  +  tag:Lead' : 'Search presets, tags, amps…'}
        value={snapshot.advanced ? snapshot.query : snapshot.simpleQ}
        oninput={(e) =>
          snapshot.advanced
            ? axisPresetBrowserWorkbenchController.setQuery((e.currentTarget as HTMLInputElement).value)
            : axisPresetBrowserWorkbenchController.setSimpleQuery((e.currentTarget as HTMLInputElement).value)}
      />
      {#if (snapshot.advanced ? snapshot.query : snapshot.simpleQ)}
        <button type="button" class="clear-btn" title="Clear" onclick={() => axisPresetBrowserWorkbenchController.clearQuery()}>×</button>
      {/if}
    </div>
    <div class="query-controls">
      <button
        type="button"
        class="adv-toggle"
        class:on={snapshot.advanced}
        onclick={() => axisPresetBrowserWorkbenchController.toggleAdvanced()}
        title="Toggle advanced query"
      >
        <i></i>{snapshot.advanced ? 'Advanced' : 'Simple'}
      </button>
      <div class="sort-seg" role="group" aria-label="Sort">
        <button type="button" class:on={snapshot.sort === 'num'} onclick={() => axisPresetBrowserWorkbenchController.setSort('num')}>#</button>
        <button type="button" class:on={snapshot.sort === 'name'} onclick={() => axisPresetBrowserWorkbenchController.setSort('name')}>A-Z</button>
        <button type="button" class:on={snapshot.sort === 'cpu'} onclick={() => axisPresetBrowserWorkbenchController.setSort('cpu')}>CPU</button>
      </div>
      <!-- §2.2/§3.3 Save filter → opens the inline name input in the sources sidebar. -->
      <button
        type="button"
        class="save-filter"
        class:on={snapshot.saving}
        title="Save the current query as a filter"
        onclick={() => axisPresetBrowserWorkbenchController.setSaving(!snapshot.saving)}
      >
        ☆ Save filter
      </button>
    </div>
    {#if activeConditions.length}
      <div class="chips-row">
        {#each activeConditions as cond}
          <span class="chip">{condsToQuery([cond])}</span>
        {/each}
        <button type="button" class="chip-clear" onclick={() => axisPresetBrowserWorkbenchController.clearQuery()}>Clear all</button>
      </div>
    {/if}
  </div>
{/snippet}

{#snippet listBody()}
  {#if data.visibleEntries.length}
    {@const markedCount = Object.keys(snapshot.marked).length}
    {#if markedCount}
      <div class="select-head">
        <span>{markedCount} selected</span>
        <button type="button" onclick={() => axisPresetBrowserWorkbenchController.clearMarks()}>Clear</button>
      </div>
    {:else}
      <div class="axis-list-summary">
        <span>{rowCap.totalRows} presets</span>
        <strong>{data.sources.find((source) => source.id === data.activeSourceId)?.label ?? data.activeSourceId}</strong>
      </div>
    {/if}
    <div class="axis-preset-list" role="listbox" aria-label="Preset list" aria-multiselectable="true">
      {#each rowCap.rows as entry}
        <button
          type="button"
          class:active={snapshot.entryId === entry.id}
          class:marked={snapshot.marked[entry.id]}
          class:fav={entry.fav}
          onclick={(e) => onRowClick(entry, e)}
          ondblclick={() => loadEntry(entry)}
          role="option"
          aria-selected={snapshot.entryId === entry.id}
        >
          <span class="checkbox" class:on={snapshot.marked[entry.id]}>{snapshot.marked[entry.id] ? '✓' : ''}</span>
          <span class="preset-number" class:sel={snapshot.entryId === entry.id}>{entry.number == null ? entry.sourceLabel : String(entry.number).padStart(3, '0')}</span>
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
    {#if rowCap.capped}
      <button type="button" class="show-all" onclick={() => axisPresetBrowserWorkbenchController.setShowAllRows(true)}>
        Show all {rowCap.totalRows} presets
      </button>
    {/if}
  {:else}
    <div class="axis-part-empty">
      <strong>{data.entries.length ? 'No presets match this filter' : 'Library is empty'}</strong>
      <span>{data.entries.length
        ? 'Loosen a parameter range or remove a block condition.'
        : 'Scan the connected device or import .syx files to populate the library.'}</span>
    </div>
  {/if}
{/snippet}

{#snippet detailBody()}
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

      {#if runtimeSnapshot.error && isOwner}
        <!-- shared runtime error renders only on the overlay-owner part (§1) so split layouts
             don't duplicate the banner across sources/list/detail. -->
        <p class="runtime-error">{runtimeSnapshot.error}</p>
      {/if}
    </article>
  {:else}
    <div class="axis-part-empty">
      <strong>Select a preset</strong>
      <span>Its full block + parameter breakdown shows up here.</span>
    </div>
  {/if}
{/snippet}

{#if part === 'full'}
  <!-- §"full": the docked panel composes the three parts (sources | list | detail) itself, backed by
       the shared controller + real library data — it does NOT embed the legacy monolith (which stays the
       standalone library surface, still reachable in the classic shell / via the .full sub-parts). -->
  <section class="axis-pb-full" data-part="full">
    <aside class="axis-pb-col axis-pb-sources">{@render sourcesBody()}</aside>
    <div class="axis-pb-col axis-pb-list">
      {@render listTopBar()}
      <div class="axis-pb-list-scroll">{@render listBody()}</div>
    </div>
    <aside class="axis-pb-col axis-pb-detail">{@render detailBody()}</aside>
  </section>
{:else}
  <section class="axis-part-pane" data-part={part}>
    <header>
      <span>Preset Browser</span>
      <strong>{part}</strong>
    </header>

    {#if part === 'sources'}
      {@render sourcesBody()}
    {:else if part === 'list'}
      {@render listTopBar()}
      {@render listBody()}
    {:else if part === 'detail'}
      {@render detailBody()}
    {/if}
  </section>
{/if}

<style>
  /* §"full": three-column split (sources | list | detail). Absolute-fills the panel body so it always
     has a resolved height even inside flex dock nodes; each column scrolls independently. */
  .axis-pb-full {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    overflow: hidden;
    background: var(--bg);
    color: var(--text2);
    container-type: inline-size;
  }
  .axis-pb-col {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .axis-pb-sources {
    width: 248px;
    flex: none;
    gap: 12px;
    padding: 14px;
    overflow-y: auto;
    border-right: 1px solid var(--border);
    background: var(--bg2);
  }
  .axis-pb-list {
    flex: 1;
    gap: 12px;
    padding: 14px;
    overflow: hidden;
  }
  .axis-pb-list-scroll {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }
  .axis-pb-detail {
    width: 368px;
    flex: none;
    gap: 14px;
    padding: 14px;
    overflow-y: auto;
    border-left: 1px solid var(--border);
    background: var(--bg2);
  }
  /* Below the sources sidebar width the detail column collapses first, then sources, so a narrow dock
     still shows the list. */
  @container (max-width: 860px) {
    .axis-pb-detail {
      display: none;
    }
  }
  @container (max-width: 620px) {
    .axis-pb-sources {
      display: none;
    }
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
  .axis-preset-list button {
    grid-template-columns: 18px 40px minmax(0, 1fr) auto;
  }
  .axis-preset-list button.active,
  .axis-preset-list button.marked {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 8%, var(--bg2));
  }
  .checkbox {
    width: 18px;
    height: 18px;
    display: grid;
    place-items: center;
    border: 1px solid var(--border3, var(--border));
    border-radius: 5px;
    color: var(--bg);
    font: 700 11px/1 var(--font-mono);
  }
  .checkbox.on {
    border-color: var(--accent);
    background: var(--accent);
  }
  .preset-number.sel {
    color: #f5a623;
  }

  /* query bar (§2) */
  .query-bar {
    display: grid;
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
  .query-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .adv-toggle {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 30px;
    padding: 0 11px;
    border-radius: 999px;
    text-transform: none;
  }
  .adv-toggle i {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--textdim);
  }
  .adv-toggle.on {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accentink, var(--bg));
  }
  .adv-toggle.on i {
    background: var(--accentink, var(--bg));
  }
  .sort-seg {
    display: flex;
    gap: 4px;
  }
  .sort-seg button {
    height: 28px;
    padding: 0 9px;
    border-radius: 7px;
    font: 700 11px/1 var(--font-mono);
    text-transform: none;
  }
  .sort-seg button.on {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accentink, var(--bg));
  }
  .chips-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .chip {
    border: 1px solid var(--border2, var(--border));
    border-radius: 7px;
    padding: 4px 8px;
    background: var(--surface2, var(--bg2));
    color: var(--text2);
    font: 600 11px/1 var(--font-mono);
  }
  .chip-clear {
    height: 24px;
    padding: 0 8px;
    border-radius: 7px;
    color: var(--textdim);
    font-size: 11px;
    text-transform: none;
    margin-left: auto;
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
  .cloud-signin {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px dashed var(--border);
    border-radius: 8px;
    color: var(--textdim);
    font: 600 11px/1.2 var(--font-mono);
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
  .save-filter {
    height: 30px;
    padding: 0 11px;
    border-radius: 999px;
    text-transform: none;
    font: 700 11px/1 var(--font-mono);
  }
  .save-filter.on {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accentink, var(--bg));
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

  /* selection header + expander (§4) */
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
