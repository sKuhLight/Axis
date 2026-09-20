<script lang="ts">
  // Insights page (read-only). Folds the already-cached preset library into the two reviewed
  // anchors — the most-used model per block family, and a tag histogram — as two tabs. Pure
  // aggregation lives in ../axisStats.ts; this panel only reads `library` and renders.
  import { library } from '$lib/preset/library.svelte';
  import { deviceSession } from '$lib/editor/editorClients.svelte';
  import { catFor } from '$lib/device/catalog';
  import { axisPbCatColor, axisPbCatLabel } from '../presetBrowser/presetBrowserWorkbenchRowChips';
  import { computeAxisStats, topAmpDrivePairings, type AxisStatsFamily } from '../axisStats';
  import type { PanelInstance } from '../../workbench';

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

  // Catalogue keys differ only where the browser's display label differs from the catalog's pack key.
  const SLUG_PACK: Record<string, string> = { peq: 'Peq', geq: 'Geq', multitap: 'Multitap', megatap: 'Megatap' };
  const labelOf = (slug: string): string => axisPbCatLabel(slug);
  const colorOf = (slug: string): string => axisPbCatColor(slug);
  const glyphOf = (slug: string): string => catFor(SLUG_PACK[slug] ?? null, labelOf(slug)).glyph;
  const pct = (count: number, max: number): number => (max > 0 ? Math.round((count / max) * 100) : 0);

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
              {#each families as family (family.slug)}
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
