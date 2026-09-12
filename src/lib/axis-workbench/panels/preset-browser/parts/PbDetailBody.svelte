<script lang="ts">
  import { library } from '$lib/preset/library.svelte';
  import { axisPresetBrowserWorkbenchController } from '../../../presetBrowser/presetBrowserWorkbenchController';
  import { axisPresetBrowserWorkbenchRuntime } from '../../../presetBrowser/presetBrowserWorkbenchRuntime';
  import { detailBlockNodes, nextBlockFocus } from '../../../presetBrowser/presetBrowserWorkbenchDetailBlockChips';
  import { detailStatusItems } from '../../../presetBrowser/presetBrowserWorkbenchDetailStatus';
  import type { AxisPresetBrowserPartView } from '../../../presetBrowser/presetBrowserWorkbenchView.svelte';

  let { view }: { view: AxisPresetBrowserPartView } = $props();
</script>

{#if view.data.selectedEntry}
  {@const blockNodes = detailBlockNodes(view.data.selectedEntry.blocks, view.snapshot.focusedBlockEffectId)}
  <article class="axis-preset-detail">
    <div class="detail-title">
      <span>{view.data.selectedEntry.number == null ? view.data.selectedEntry.sourceLabel : `Preset ${String(view.data.selectedEntry.number).padStart(3, '0')}`}</span>
      <h3>{view.data.selectedEntry.name}</h3>
      {#if view.data.selectedEntry.model}<p>{view.data.selectedEntry.model}</p>{/if}
    </div>

    <div class="detail-status">
      {#each detailStatusItems(view.selectedDetail) as item}
        <span
          class:on={item.loaded}
          data-status={item.key}
          data-loaded={item.loaded}
          title={item.title}
          aria-label={item.title}
        >
          <i class="dot"></i>{item.label}
        </span>
      {/each}
    </div>

    <dl>
      <div><dt>Source</dt><dd>{view.data.selectedEntry.sourceLabel}</dd></div>
      {#if view.data.selectedEntry.converted && view.data.selectedEntry.provenance}<div><dt>Converted</dt><dd>{view.data.selectedEntry.provenance}</dd></div>{/if}
      <div><dt>Scenes</dt><dd>{view.data.selectedEntry.sceneCount}</dd></div>
      <div><dt>Blocks</dt><dd>{view.data.selectedEntry.blockCount}</dd></div>
      {#if view.data.selectedEntry.folder}<div><dt>Folder</dt><dd>{view.data.selectedEntry.folder}</dd></div>{/if}
    </dl>

    {#if view.data.selectedEntry.tags.length}
      <div class="tag-row">
        {#each view.data.selectedEntry.tags as tag}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <span style:--tag-col={library.colorOf(tag)} oncontextmenu={(e) => view.openTagMenu(e, tag)}>{tag}</span>
        {/each}
      </div>
    {/if}

    <div class="detail-actions">
      {#if view.data.selectedEntry.converted}
        <!-- A saved conversion re-opens in the converter (not a device load). True .syx export is wired in
             the separate codec-authoring task. -->
        <button type="button" class="load-action" data-action="open-converter" onclick={() => view.openConverter(view.data.selectedEntry!.id)}>
          Open in converter
        </button>
        <button type="button" class="load-action secondary danger" data-action="delete" onclick={() => view.deleteConverted(view.data.selectedEntry!.id)}>
          Delete
        </button>
      {:else}
        <button
          type="button"
          class="load-action"
          class:warn={view.loadWarning.warn}
          data-action="load"
          title={view.loadWarning.tooltip}
          aria-label={view.loadWarning.warn ? `Load preset. ${view.loadWarning.tooltip}` : null}
          onclick={() => view.loadEntry(view.data.selectedEntry!)}
        >
          {#if view.loadWarning.warn}<span class="warn-glyph" aria-hidden="true">⚠</span>{/if}
          {view.runtimeSnapshot.loadingEntryId === view.data.selectedEntry.id ? 'Loading...' : 'Load preset'}
        </button>
        {#if view.data.selectedEntry.sourceId === 'device' && view.data.selectedEntry.number != null && !view.data.selectedEntry.empty}
          <button
            type="button"
            class="load-action"
            class:warn={view.auditionWarning.warn}
            data-action="audition"
            title={view.auditionWarning.tooltip}
            aria-label={view.auditionWarning.warn ? `Audition. ${view.auditionWarning.tooltip}` : null}
            onclick={() => view.auditionEntry(view.data.selectedEntry!)}
          >
            {#if view.auditionWarning.warn}<span class="warn-glyph" aria-hidden="true">⚠</span>{/if}
            {view.runtimeSnapshot.auditioningEntryId === view.data.selectedEntry.id ? 'Auditioning...' : 'Audition'}
          </button>
        {/if}
        {#if !view.data.selectedEntry.empty}
          <button type="button" class="load-action secondary" data-action="refresh" onclick={() => axisPresetBrowserWorkbenchRuntime.loadDetail(view.data.selectedEntry!.id)}>
            {view.runtimeSnapshot.hydratingEntryId === view.data.selectedEntry.id ? 'Refreshing...' : 'Refresh detail'}
          </button>
          <button type="button" class="load-action secondary" data-action="convert" title="Port this preset to another Fractal device — best-effort, with a full diff report" onclick={() => view.crossConvert(view.data.selectedEntry!.id)}>
            ⇄ Convert…
          </button>
        {/if}
      {/if}
    </div>

    <!-- Cleared/empty slot: no blocks or params to list — surface the load affordance instead. -->
    {#if view.data.selectedEntry.empty}
      <div class="d-blocks-empty">Empty slot — load to start a fresh preset.</div>
    {:else}
    <!-- Filter strip for the BLOCK PARAMETERS list below (§4). The All node clears the filter —
         previously, once a block was selected, there was no way to get back to the unfiltered
         list from this control. -->
    {#if blockNodes.length}
      <div class="block-filter">
        <span class="d-blocks-lbl">Blocks</span>
        <div class="block-strip" class:filtered={view.snapshot.focusedBlockEffectId != null}>
          {#each blockNodes as node (node.key)}
            <button
              type="button"
              class:on={node.active}
              disabled={!node.selectable}
              aria-pressed={node.active}
              data-block-node={node.key}
              style:--c={node.color}
              onclick={() => axisPresetBrowserWorkbenchController.focusBlock(nextBlockFocus(node, view.snapshot.focusedBlockEffectId))}
            >
              {#if node.color}<i class="dot"></i>{/if}
              {node.label}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- V13f BLOCK PARAMETERS (§"detail" step 4): every param of every non-IO block with its value.
         Drag or double-click a block header / param cell to add it to the FILTERS row. Cells matched
         by an active block-param condition are highlighted. Reaches the same decoded blocks as the
         monolith via library.paramsOf; when unhydrated, "Load params" pulls them through the runtime. -->
    <div class="d-blocks">
      {#if !view.selectedDecodedBlocks}
        <div class="d-blocks-empty">
          Full params not loaded for this preset.
          <button type="button" class="link" onclick={() => axisPresetBrowserWorkbenchRuntime.loadDetail(view.data.selectedEntry!.id)}>
            {view.runtimeSnapshot.hydratingEntryId === view.data.selectedEntry.id ? 'Loading…' : 'Load params'}
          </button>
        </div>
      {:else if view.detailBlockCards && view.detailBlockCards.length}
        {#each view.detailBlockCards as card}
          <div class="d-blk">
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="d-blk-h"
              draggable="true"
              ondragstart={(e) => view.startDrag(e, card.blockPayload)}
              ondblclick={() => view.addPayload(card.blockPayload)}
              title="Drag or double-click to filter by this block"
            >
              <span class="fdot" style:background={card.color}></span>
              <span class="d-blk-n">{card.category}{card.title ? ` · ${card.title}` : ''}</span>
              <span class="fsp"></span>
              <span class="d-blk-grip">⠿</span>
              <span class="d-blk-i">{card.instanceLabel}</span>
            </div>
            <div class="d-blk-grid">
              {#each card.cells as cell}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="d-pr"
                  class:hit={cell.hit}
                  draggable="true"
                  ondragstart={(e) => view.startDrag(e, cell.payload)}
                  ondblclick={() => view.addPayload(cell.payload)}
                  title="Drag or double-click to filter on this param"
                >
                  <span class="d-pk">{cell.key}</span>
                  <span class="d-pv">{cell.value}</span>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      {:else}
        <div class="d-blocks-empty">No filterable block parameters in this preset.</div>
      {/if}
    </div>
    {/if}

    {#if view.runtimeSnapshot.error && view.isOwner}
      <!-- shared runtime error renders only on the overlay-owner part (§1) so split layouts
           don't duplicate the banner across sources/list/detail. -->
      <p class="runtime-error">{view.runtimeSnapshot.error}</p>
    {/if}
  </article>
{:else}
  <div class="axis-part-empty">
    <strong>Select a preset</strong>
    <span>Its full block + parameter breakdown shows up here.</span>
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
  .fsp {
    flex: 1;
  }
  .fdot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 3px;
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
  /* Passive status readout, not a control — deliberately not styled like the segmented
     tab/gate controls elsewhere in this app. Dots inherit currentColor from the pending/on
     state instead of the accent-bordered pill look, so it doesn't read as an active tab strip. */
  .detail-status {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  .detail-status span {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--textfaint);
    font: 800 10px/1 var(--font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .detail-status span.on {
    color: var(--ok);
  }
  .detail-status .dot {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 50%;
    background: currentColor;
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
    border: 1px solid color-mix(in srgb, var(--tag-col) 40%, transparent);
    border-radius: 999px;
    padding: 4px 7px;
    color: var(--tag-col);
    font-size: 10px;
  }
  .detail-actions {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(124px, 1fr));
    gap: 7px;
  }
  .load-action {
    height: 34px;
    text-align: center;
    font: 800 10px/1 var(--font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .load-action:hover {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    background: color-mix(in srgb, var(--accent) 4%, var(--bg2));
  }
  .load-action:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  /* Load preset and Audition both replace the edit buffer. When the current preset has unsaved
     edits, both turn amber with a ⚠ — the same dirty language as the Save widget chip. */
  .load-action.warn {
    color: var(--amber);
    border-color: color-mix(in srgb, var(--amber) 40%, var(--border));
  }
  .load-action.warn:hover {
    border-color: color-mix(in srgb, var(--amber) 60%, var(--border));
    background: color-mix(in srgb, var(--amber) 6%, var(--bg2));
  }
  .warn-glyph {
    margin-right: 5px;
  }
  .load-action.secondary {
    color: var(--textdim);
  }
  .load-action.danger {
    color: var(--danger);
    border-color: color-mix(in srgb, var(--danger) 40%, var(--border));
  }
  .runtime-error {
    margin: 0;
    color: var(--danger);
    font-size: 11px;
    line-height: 1.4;
  }
  /* The label belongs to the strip, so they share a tight wrapper rather than sitting as two
     separate children of .axis-preset-detail's 14px grid gap. */
  .block-filter {
    display: grid;
    gap: 6px;
  }
  .d-blocks-lbl {
    color: var(--textdim);
    font: 800 10px/1 var(--font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .block-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px 10px;
  }
  .block-strip button {
    height: auto;
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 2px 1px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    text-transform: none;
    font: 700 10px/1.2 var(--font-mono);
    color: var(--c, var(--text2));
    border-bottom: 2px solid transparent;
  }
  .block-strip .dot {
    flex: none;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--c);
  }
  .block-strip button:hover:not(:disabled) {
    color: var(--text);
  }
  .block-strip button.on {
    border-bottom-color: var(--accent);
  }
  .block-strip.filtered button:not(.on) {
    color: var(--textfaint);
  }
  .block-strip.filtered button:not(.on) .dot {
    opacity: 0.5;
  }
  .block-strip button:disabled {
    cursor: default;
    opacity: 0.5;
  }
  .block-strip button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  /* V13f BLOCK PARAMETERS listing (detail §4) */
  .d-blocks {
    display: grid;
    gap: 8px;
  }
  .d-blocks-empty {
    padding: 8px 10px;
    color: var(--textdim);
    font: 500 11px/1.4 var(--font-mono);
  }
  .d-blocks-empty .link {
    height: auto;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--accent);
    font: 700 11px/1 var(--font-mono);
    text-transform: none;
  }
  .d-blk {
    border: 1px solid var(--surface2, var(--border));
    border-radius: 12px;
    background: var(--bg2);
    overflow: hidden;
  }
  .d-blk-h {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    cursor: grab;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  }
  .d-blk-n {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
    font: 700 12px/1 var(--font-mono);
  }
  .d-blk-grip {
    color: var(--textdim);
    font-size: 11px;
  }
  .d-blk-i {
    color: var(--textdim);
    font: 600 10px/1 var(--font-mono);
  }
  .d-blk-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 1px;
    background: var(--surface2, var(--border));
  }
  .d-pr {
    flex: 1 1 calc(50% - 1px);
    min-width: 0;
    display: grid;
    gap: 3px;
    padding: 7px 9px;
    background: var(--bg2);
    cursor: grab;
  }
  .d-pr.hit {
    background: color-mix(in srgb, var(--accent) 10%, var(--bg2));
  }
  .d-pk {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--textdim);
    font: 500 9px/1 var(--font-mono);
  }
  .d-pv {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
    font: 700 12.5px/1 var(--font-mono);
  }
  .d-pr.hit .d-pv {
    color: var(--accent);
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
