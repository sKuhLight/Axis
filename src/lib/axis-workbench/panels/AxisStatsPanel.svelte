<script lang="ts">
  // Insights page (read-only). Folds the already-cached preset library into the two reviewed
  // anchors — the most-used model per block family, and a tag histogram — as two tabs. Pure
  // aggregation lives in ../axisStats.ts; this panel only reads `library` and renders.
  import { library } from '$lib/preset/library.svelte';
  import { deviceSession } from '$lib/editor/editorClients.svelte';
  import { catFor } from '$lib/device/catalog';
  import { deviceRealNames } from '$lib/device/deviceRealNames.svelte';
  import { axisPbCatColor, axisPbCatLabel } from '../presetBrowser/presetBrowserWorkbenchRowChips';
  import { axisPresetBrowserWorkbenchController } from '../presetBrowser/presetBrowserWorkbenchController';
  import { AXIS_PAGE_PRESET_BROWSER } from '../axisWorkbenchPages';
  import {
    collectLibraryModels,
    computeAxisStats,
    modelRowsForFamily,
    topAmpDrivePairings,
    type AxisStatsFamily
  } from '../axisStats';
  import { getOptionalWorkbenchContext, type PanelInstance } from '../../workbench';

  let { panel: _panel }: { panel: PanelInstance } = $props();

  // Device presets only — imported files, local-folder presets and conversions are excluded, so the
  // page reflects the hardware library rather than everything ever read into Axis.
  const deviceEntries = $derived(library.entries.filter((entry) => entry.source === 'device'));
  const stats = $derived(computeAxisStats(deviceEntries, library.tags));
  const families = $derived(stats.families);
  const topBoost = $derived(topAmpDrivePairings(deviceEntries)[0]);
  const scanning = $derived(library.scanning);
  const online = $derived(deviceSession.conn.state === 'online');

  let tab = $state<'blocks' | 'tags'>('blocks');
  let selectedSlug = $state<string | null>(null);

  const activeFamily = $derived.by<AxisStatsFamily | undefined>(
    () => families.find((family) => family.slug === selectedSlug) ?? families[0]
  );

  // The two rows under the histogram read the WHOLE library (every source), unlike the histogram
  // itself, which stays device-preset-only. `foreign` = library models the device lacks; `untried` =
  // device models no library preset uses.
  const libraryModels = $derived(collectLibraryModels(library.entries));
  const deviceTypes = $derived.by(() => {
    const slug = activeFamily?.slug;
    return slug ? deviceRealNames.typesFor(slug) : undefined;
  });
  const modelRows = $derived.by(() => {
    const slug = activeFamily?.slug;
    if (!slug || !Array.isArray(deviceTypes)) return null;
    return modelRowsForFamily(libraryModels.get(slug), deviceTypes);
  });
  // "Not used anywhere" can run to hundreds of models, so it renders as a compact name list capped
  // at this many, not as chips. The cap is per family and collapses when the family changes.
  const UNTRIED_VISIBLE_LIMIT = 32;
  let untriedExpanded = $state(false);
  const visibleUntried = $derived.by(() =>
    modelRows ? (untriedExpanded ? modelRows.untried : modelRows.untried.slice(0, UNTRIED_VISIBLE_LIMIT)) : []
  );
  // Fetch the active family's model catalog (idempotent; shares the cache with preset-browser search).
  $effect(() => {
    const slug = activeFamily?.slug;
    if (slug) deviceRealNames.loadTypes(slug);
  });
  $effect(() => {
    void activeFamily?.slug;
    untriedExpanded = false;
  });

  /** Find the library presets that reference a model the device can't play. */
  function searchModel(name: string) {
    axisPresetBrowserWorkbenchController.setQuery(name);
    getOptionalWorkbenchContext()?.controller.activatePage(AXIS_PAGE_PRESET_BROWSER);
  }

  // Catalogue keys differ only where the browser's display label differs from the catalog's pack key.
  const SLUG_PACK: Record<string, string> = { peq: 'Peq', geq: 'Geq', multitap: 'Multitap', megatap: 'Megatap' };
  const labelOf = (slug: string): string => axisPbCatLabel(slug);
  const colorOf = (slug: string): string => axisPbCatColor(slug);
  const glyphOf = (slug: string): string => catFor(SLUG_PACK[slug] ?? null, labelOf(slug)).glyph;
  const pct = (count: number, max: number): number => (max > 0 ? Math.round((count / max) * 100) : 0);
  // The tab bar reads alphabetically by block name; `families` stays usage-ordered for the default pick.
  const familyTabs = $derived(
    [...families].sort((a, b) => labelOf(a.slug).localeCompare(labelOf(b.slug), undefined, { sensitivity: 'base' }))
  );

  function build() {
    void library.buildCache();
  }
</script>

<div class="axis-stats">
  <header class="head">
    <div class="titles">
      <h1>Insights</h1>
      <p>{stats.presetCount} device presets · {stats.tags.length} tags · {stats.untagged} untagged</p>
    </div>
    {#if scanning}<span class="scanning">Scanning {library.scanDone}/{library.scanTotal}…</span>{/if}
  </header>

  {#if deviceEntries.length === 0}
    <div class="empty">
      <p class="empty-big">No device presets yet</p>
      <p class="empty-copy">Insights are computed from your device presets. Build the library cache to fill this page.</p>
      {#if online}
        <button class="build" type="button" onclick={build} disabled={scanning}>{scanning ? 'Building…' : 'Build library cache'}</button>
      {:else}
        <p class="empty-hint">Connect a device, then build the library cache.</p>
      {/if}
      {#if library.scanError}<p class="empty-err">{library.scanError}</p>{/if}
    </div>
  {:else}
    <div class="tiles">
      <div class="tile"><span class="k">Device presets</span><span class="v">{stats.presetCount}</span></div>
      <div class="tile"><span class="k">Amp models used</span><span class="v">{families.find((f) => f.slug === 'amp')?.models.length ?? 0}</span></div>
      <div class="tile"><span class="k">Drive models used</span><span class="v">{families.find((f) => f.slug === 'drive')?.models.length ?? 0}</span></div>
      <div class="tile"><span class="k">Tags</span><span class="v">{stats.tags.length}</span></div>
      <div class="tile"><span class="k">Favourites</span><span class="v">{stats.favorites}</span></div>
    </div>

    {#if topBoost}
      <div class="insights">
        <article class="ins">
          <span class="ins-id">Go-to boost</span>
          <p class="ins-big">{topBoost.drive} into {topBoost.amp}</p>
          <p class="ins-copy">Your most repeated drive + amp pairing, in {topBoost.count} presets.</p>
        </article>
      </div>
    {/if}

    <div class="tabs" role="tablist">
      <button class="tab" class:on={tab === 'blocks'} type="button" role="tab" aria-selected={tab === 'blocks'} onclick={() => (tab = 'blocks')}>Blocks</button>
      <button class="tab" class:on={tab === 'tags'} type="button" role="tab" aria-selected={tab === 'tags'} onclick={() => (tab = 'tags')}>Tags</button>
    </div>

    {#if tab === 'blocks'}
      {#if families.length === 0}
        <p class="none">No block models are decoded in the cached library yet.</p>
      {:else}
        {#if activeFamily}
          <section class="detail">
            <div class="detail-tabs" role="tablist" aria-label="Block family">
              {#each familyTabs as family (family.slug)}
                <button
                  class="fam-tab"
                  class:on={activeFamily.slug === family.slug}
                  type="button"
                  role="tab"
                  aria-selected={activeFamily.slug === family.slug}
                  style={`--fa:${colorOf(family.slug)}`}
                  onclick={() => (selectedSlug = family.slug)}
                >
                  <span class="glyph" aria-hidden="true">{@html glyphOf(family.slug)}</span>
                  <span class="fam-tab-name">{labelOf(family.slug)}</span>
                  <span class="fam-tab-count">{family.used}</span>
                </button>
              {/each}
            </div>
            <header class="detail-head">
              <h2>Every {labelOf(activeFamily.slug)} model</h2>
              <span class="detail-sub">{activeFamily.models.length} models used · in {activeFamily.used} of {stats.presetCount} presets</span>
            </header>
            {#if activeFamily.models.length}
              <div class="scale"><span>0</span><span>{activeFamily.models[0].count} presets</span></div>
              <div class="bars">
                {#each activeFamily.models as model (model.name)}
                  <div class="bar-row">
                    <span class="bar-label"><span class="dot" style={`background:${colorOf(activeFamily.slug)}`}></span><span class="bar-name">{model.name}</span></span>
                    <span class="bar-track"><i style={`width:${pct(model.count, activeFamily.models[0].count)}%;background:${colorOf(activeFamily.slug)}`}></i></span>
                    <span class="bar-count">{model.count}</span>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="none">No model names were decoded for this family.</p>
            {/if}

            <div class="model-rows">
              {#if Array.isArray(deviceTypes) && modelRows}
                <div class="mrow foreign">
                  <div class="mrow-head">
                    <span class="mrow-dot" style={`background:${colorOf(activeFamily.slug)}`}></span>
                    <span class="mrow-title">In your library but not this device</span>
                    <span class="mrow-sub">{modelRows.foreign.length} {modelRows.foreign.length === 1 ? 'model' : 'models'}</span>
                  </div>
                  {#if modelRows.foreign.length}
                    <div class="chips">
                      {#each modelRows.foreign as model (model.name)}
                        <button class="mchip foreign" type="button" title={`Search presets using ${model.name}`} onclick={() => searchModel(model.name)}>
                          <span class="nm">{model.name}</span><span class="why">{model.count}</span><span class="go">↗</span>
                        </button>
                      {/each}
                    </div>
                  {:else}
                    <p class="mrow-empty">Nothing foreign — every model your library references is available here.</p>
                  {/if}
                </div>
                <div class="mrow untried">
                  <div class="mrow-head">
                    <span class="mrow-dot" style={`background:${colorOf(activeFamily.slug)}`}></span>
                    <span class="mrow-title">Not used anywhere</span>
                    <span class="mrow-sub">{modelRows.untried.length} of {deviceTypes.length} {labelOf(activeFamily.slug)} models</span>
                  </div>
                  {#if modelRows.untried.length}
                    <div class="model-list">
                      {#each visibleUntried as model, i (model.name)}
                        <span class="ml-name" title={model.realName || model.name}>{model.name}</span>{#if i < visibleUntried.length - 1}<span class="ml-sep">·</span>{/if}
                      {/each}
                      {#if modelRows.untried.length > UNTRIED_VISIBLE_LIMIT}
                        <button class="ml-more" type="button" onclick={() => (untriedExpanded = !untriedExpanded)}>
                          {untriedExpanded ? 'Show less' : `+${modelRows.untried.length - UNTRIED_VISIBLE_LIMIT} more`}
                        </button>
                      {/if}
                    </div>
                  {:else}
                    <p class="mrow-empty">You've used every {labelOf(activeFamily.slug)} model on this device.</p>
                  {/if}
                </div>
              {:else if deviceTypes === 'error'}
                <p class="none">Couldn't load this device's model list. The rows above are unaffected.</p>
              {:else}
                <div class="mrow">
                  <div class="mrow-head"><span class="spinner" aria-hidden="true"></span><span class="mrow-title loading">In your library but not this device</span><span class="mrow-sub">looking up models…</span></div>
                  <div class="chips"><span class="skel" style="width:150px"></span><span class="skel" style="width:120px"></span><span class="skel" style="width:96px"></span></div>
                </div>
                <div class="mrow">
                  <div class="mrow-head"><span class="spinner" aria-hidden="true"></span><span class="mrow-title loading">Not used anywhere</span><span class="mrow-sub">looking up models…</span></div>
                  <div class="chips"><span class="skel" style="width:128px"></span><span class="skel" style="width:160px"></span><span class="skel" style="width:104px"></span></div>
                </div>
              {/if}
            </div>
          </section>
        {/if}
      {/if}
    {:else}
      <div class="tag-stats">
        <div class="tag-stat"><span class="k">Distinct tags</span><span class="v">{stats.tags.length}</span></div>
        <div class="tag-stat"><span class="k">Assignments</span><span class="v">{stats.tagAssignments}</span></div>
        <div class="tag-stat"><span class="k">Untagged presets</span><span class="v">{stats.untagged}</span></div>
        <div class="tag-stat"><span class="k">Used 10+ times</span><span class="v">{stats.tags.filter((t) => t.count >= 10).length}</span></div>
      </div>
      {#if stats.tags.length === 0}
        <p class="none">No tags assigned yet. Tag presets in the Preset Browser to see a histogram here.</p>
      {:else}
        <div class="scale"><span>0</span><span>{stats.tags[0].count} presets</span></div>
        <div class="bars">
          {#each stats.tags as tag (tag.tag)}
            <div class="bar-row">
              <span class="bar-label"><span class="dot" style={`background:${library.colorOf(tag.tag)}`}></span><span class="bar-name">{tag.tag}</span></span>
              <span class="bar-track"><i style={`width:${pct(tag.count, stats.tags[0].count)}%;background:${library.colorOf(tag.tag)}`}></i></span>
              <span class="bar-count">{tag.count}</span>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .axis-stats {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    padding: 18px 20px 28px;
    background: var(--bg2);
    color: var(--text);
  }
  .head {
    display: flex;
    align-items: flex-end;
    gap: 14px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }
  .titles h1 {
    margin: 0;
    font-size: 22px;
    letter-spacing: -0.02em;
  }
  .titles p {
    margin: 4px 0 0;
    color: var(--textdim);
    font-size: 12.5px;
  }
  .scanning {
    margin-left: auto;
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    color: var(--accent);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 72px 20px;
    text-align: center;
    border: 1px dashed var(--border2, var(--border));
    border-radius: 14px;
  }
  .empty-big {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
  }
  .empty-copy {
    margin: 0;
    max-width: 360px;
    font-size: 12.5px;
    color: var(--textdim);
  }
  .empty-hint {
    margin: 0;
    font-size: 12px;
    color: var(--textmuted, var(--textdim));
  }
  .empty-err {
    margin: 0;
    font-size: 12px;
    color: var(--danger);
  }
  .build {
    margin-top: 4px;
    padding: 9px 16px;
    border: 1px solid var(--accent-border, var(--border2, var(--border)));
    border-radius: 9px;
    background: var(--accent-tint, transparent);
    color: var(--accent);
    font-weight: 800;
    cursor: pointer;
  }
  .build:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    padding: 11px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
  }
  .k {
    font-family: var(--font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--textfaint, var(--textdim));
  }
  .v {
    font-size: 20px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .insights {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 14px;
  }
  .ins {
    flex: 1 1 300px;
    max-width: 480px;
    min-width: 0;
    padding: 12px 13px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
  }
  .ins-id {
    font-family: var(--font-mono, monospace);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--amber);
  }
  .ins-big {
    margin: 7px 0 4px;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .ins-copy {
    margin: 0;
    font-size: 12px;
    color: var(--textdim);
  }

  .tabs {
    display: flex;
    gap: 4px;
    margin: 22px 0 2px;
    border-bottom: 1px solid var(--border);
  }
  .tab {
    padding: 9px 15px;
    margin-bottom: -1px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--textdim);
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }
  .tab:hover {
    color: var(--text2, var(--text));
  }
  .tab.on {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  .glyph {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    font-size: 17px;
    color: var(--fa);
    background: color-mix(in srgb, var(--fa) 15%, var(--surface));
    border: 1px solid color-mix(in srgb, var(--fa) 34%, var(--border));
  }
  .detail {
    margin-top: 16px;
  }
  .detail-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 16px;
  }
  .fam-tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 6px 11px 6px 7px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--textdim);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
  }
  .fam-tab:hover {
    border-color: var(--border3, var(--border2, var(--border)));
    color: var(--text2, var(--text));
  }
  .fam-tab.on {
    color: var(--fa);
    background: color-mix(in srgb, var(--fa) 13%, var(--surface));
    border-color: color-mix(in srgb, var(--fa) 45%, var(--border));
  }
  .fam-tab .glyph {
    width: 20px;
    height: 20px;
    border-radius: 6px;
    font-size: 13px;
  }
  .fam-tab-count {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    font-weight: 600;
    opacity: 0.7;
  }
  .detail-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }
  .detail-head h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
  }
  .detail-sub {
    font-size: 12px;
    color: var(--textdim);
  }
  .scale {
    display: flex;
    justify-content: space-between;
    padding: 0 0 5px;
    margin-bottom: 2px;
    border-bottom: 1px solid var(--border);
    font-family: var(--font-mono, monospace);
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--textfaint, var(--textdim));
  }
  .bars {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .bar-row {
    display: grid;
    grid-template-columns: 190px minmax(0, 1fr) 52px;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .bar-label {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }
  .dot {
    flex: none;
    width: 9px;
    height: 9px;
    border-radius: 2.5px;
  }
  .bar-name {
    font-size: 12.5px;
    color: var(--text2, var(--textdim));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar-track {
    height: 12px;
    border-radius: 3px;
    background: var(--border);
    overflow: hidden;
  }
  .bar-track i {
    display: block;
    height: 100%;
    border-radius: 3px;
  }
  .bar-count {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    font-weight: 600;
    color: var(--textdim);
    text-align: right;
  }

  .tag-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin: 14px 0 10px;
  }
  .tag-stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
  }
  .tag-stat .v {
    font-size: 17px;
  }

  .none {
    margin: 16px 0 0;
    font-size: 12.5px;
    color: var(--textdim);
  }

  .model-rows {
    margin-top: 16px;
    border-top: 1px solid var(--border);
  }
  .mrow {
    padding: 12px 0 11px;
    border-bottom: 1px solid var(--border);
    min-width: 0;
  }
  .mrow:last-child {
    border-bottom: 0;
  }
  .mrow-head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .mrow-dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 2px;
    align-self: center;
    opacity: 0.85;
  }
  .mrow-title {
    font-family: var(--font-mono, monospace);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: var(--amber);
  }
  .mrow.untried .mrow-title {
    color: var(--accent);
  }
  .mrow-title.loading {
    color: var(--textdim);
  }
  .mrow-sub {
    font-size: 11.5px;
    color: var(--textdim);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
  }
  .mchip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    max-width: 100%;
    min-width: 0;
    padding: 5px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--text2, var(--text));
    font-size: 12px;
  }
  .mchip .nm {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mchip .why {
    font-family: var(--font-mono, monospace);
    font-size: 9.5px;
    font-weight: 600;
    color: var(--textdim);
    white-space: nowrap;
  }
  .mchip .go {
    font-family: var(--font-mono, monospace);
    font-size: 10px;
    font-weight: 700;
    color: var(--amber);
    opacity: 0.85;
  }
  .mrow.foreign .mchip {
    border-color: color-mix(in srgb, var(--amber) 38%, var(--border));
    background: color-mix(in srgb, var(--amber) 8%, var(--surface));
  }
  button.mchip {
    font: inherit;
    cursor: pointer;
    text-align: left;
  }
  button.mchip:hover {
    border-color: var(--amber);
    color: var(--text);
    background: color-mix(in srgb, var(--amber) 16%, var(--surface));
  }
  .model-list {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 3px 7px;
    min-width: 0;
    font-size: 12.5px;
    line-height: 1.6;
  }
  .ml-name {
    color: var(--text2, var(--text));
    overflow-wrap: anywhere;
  }
  .ml-sep {
    color: var(--textfaint, var(--textdim));
  }
  .ml-more {
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .ml-more:hover {
    text-decoration: underline;
  }
  .mrow-empty {
    margin: 0;
    font-size: 12.5px;
    color: var(--textdim);
    font-style: italic;
  }
  .spinner {
    flex: none;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    animation: stats-spin 0.7s linear infinite;
  }
  @keyframes stats-spin {
    to {
      transform: rotate(360deg);
    }
  }
  .skel {
    display: inline-block;
    height: 30px;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--border) 24%, var(--border2, var(--border)) 38%, var(--border) 62%);
    background-size: 420px 100%;
    animation: stats-shimmer 1.25s ease-in-out infinite;
  }
  @keyframes stats-shimmer {
    0% {
      background-position: -210px 0;
    }
    100% {
      background-position: 210px 0;
    }
  }

  @media (max-width: 980px) {
    .tiles {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .tag-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .bar-row {
      grid-template-columns: 140px minmax(0, 1fr) 44px;
    }
  }
</style>
