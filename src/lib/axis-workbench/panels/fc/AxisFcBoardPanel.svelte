<script lang="ts">
  import type { PanelInstance } from '../../../workbench';
  import { axisFcWorkbenchController } from '../../fc/fcWorkbenchController';
  import { createAxisFcPartView } from '../../fc/fcPartView.svelte';
  import FcPanelChrome from './parts/FcPanelChrome.svelte';
  import FcLayoutsStrip from './parts/FcLayoutsStrip.svelte';
  import FcViewNav from './parts/FcViewNav.svelte';

  let { panel: _panel }: { panel: PanelInstance } = $props();
  const view = createAxisFcPartView('board');
</script>

<FcPanelChrome part="board" runtimeSnapshot={view.runtimeSnapshot} dataReady={view.data.ready}>
  <!-- header strip (§3.1) -->
  <div class="fc-head">
    <span class="fc-title">FC CONTROLLERS</span>
    {#if view.data.board.length}
      <div class="fc-devices">
        {#each ['FM3', 'FC-6', 'FC-12'] as device (device)}
          <span
            class="fc-dev"
            class:on={view.data.device === device}
            title={view.data.device === device
              ? `Connected FC device profile (${view.data.deviceNote})`
              : 'Device profile follows the connected unit'}>{device}</span
          >
        {/each}
      </div>
    {/if}
    <span class="fc-spacer"></span>
    {#if view.runtimeSnapshot.reading}
      <span class="fc-reading" title="Reading switch state from the connected unit">reading…</span>
    {/if}
    <span class="fc-devnote">{view.data.deviceNote}</span>
  </div>

  <FcLayoutsStrip data={view.data} />

  <!-- board hero (§3.1) -->
  <div class="fc-board-scroll">
    <div class="fc-hero" style={`max-width:${view.data.boardMaxWidth}px`}>
      <input
        class="fc-layname"
        value={view.data.layoutName}
        placeholder="Layout name"
        readonly
        title="Layout rename is not supported by this device's FC model"
      />
      {#if view.data.views.length > 1}
        <div class="fc-viewwrap">
          <span class="fc-viewlab">VIEW</span>
          <FcViewNav views={view.data.views} />
        </div>
      {/if}
    </div>
    {#if view.data.board.length}
      <div
        class="fc-board"
        style={`grid-template-columns:repeat(${view.data.boardCols},1fr); max-width:${view.data.boardMaxWidth}px`}
      >
        {#each view.data.board as tile (tile.index)}
          <button
            type="button"
            class="fc-tile"
            class:on={tile.active}
            class:empty={tile.empty}
            aria-pressed={tile.active}
            title={`Switch ${tile.num}${tile.empty ? ' · unassigned' : ` · ${tile.tapText}`}`}
            style={`--fc-led:${tile.ledHex ?? 'var(--aw-border)'}`}
            onclick={() => axisFcWorkbenchController.selectSwitch(tile.index, view.snapshot.side)}
          >
            <span class="fc-led" class:lit={!tile.empty}></span>
            <span class="fc-num">{tile.num}</span>
            {#if tile.onDevice}
              <span class="fc-ondev" title="Configured on the device (live read)">● on unit</span>
            {/if}
            <span class="fc-tilelbl">{tile.label}</span>
            <span class="fc-rows">
              <span class="fc-row"><i class="fc-badge tap">T</i><em class="fc-rowtxt">{tile.tapText}</em></span>
              <span class="fc-row"><i class="fc-badge hold">H</i><em class="fc-rowtxt hold">{tile.holdText}</em></span>
            </span>
          </button>
        {/each}
      </div>
      <div class="fc-hint">Tap a switch to edit its Tap &amp; Hold actions below</div>
    {:else}
      <div class="fc-empty">
        <strong>Flat FC config space</strong>
        <span>Select configs in the layouts pane</span>
      </div>
    {/if}
  </div>
</FcPanelChrome>

<style>
  .fc-spacer {
    flex: 1;
    min-width: 6px;
  }
  .fc-empty {
    flex: 1;
    min-height: 140px;
    display: grid;
    place-content: center;
    gap: 8px;
    text-align: center;
    color: var(--aw-text-muted);
  }
  .fc-empty strong {
    color: var(--aw-text);
    font-size: 13px;
  }
  .fc-empty span {
    font-size: 12px;
  }

  /* ── header strip (§3.1) ─────────────────────────────────────────────── */
  .fc-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 13px;
    flex-wrap: wrap;
    padding: 12px 18px;
    border-bottom: 1px solid var(--aw-surface-2);
  }
  .fc-title {
    font: 700 12px/1 var(--aw-font-mono);
    letter-spacing: 0.16em;
    color: var(--aw-text-2);
  }
  .fc-devices {
    display: flex;
    gap: 3px;
    background: var(--aw-bg-2);
    border: 1px solid var(--aw-border);
    border-radius: 9px;
    padding: 3px;
  }
  .fc-dev {
    height: 28px;
    padding: 0 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 7px;
    font-size: 12px;
    font-weight: 700;
    color: var(--aw-text-muted);
    background: transparent;
  }
  .fc-dev.on {
    background: var(--aw-accent);
    color: var(--aw-accent-ink);
  }
  .fc-reading {
    font: 600 10px/1 var(--aw-font-mono);
    color: var(--aw-text-faint);
  }
  .fc-devnote {
    font: 600 10px/1 var(--aw-font-mono);
    color: var(--aw-text-faint);
  }

  /* ── board hero (§3.1) ───────────────────────────────────────────────── */
  .fc-board-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px 20px 14px;
  }
  .fc-hero {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0 auto 14px;
  }
  .fc-layname {
    flex: 1;
    min-width: 0;
    background: var(--aw-bg-2);
    border: 1px solid var(--aw-border);
    border-radius: 11px;
    padding: 11px 14px;
    color: var(--aw-text);
    font: 700 15px/1 var(--aw-font-ui);
    outline: none;
  }
  .fc-viewwrap {
    flex: none;
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .fc-viewlab {
    font: 700 9px/1 var(--aw-font-mono);
    letter-spacing: 0.12em;
    color: var(--aw-text-muted);
  }
  .fc-board {
    display: grid;
    gap: 14px;
    width: 100%;
    margin: 0 auto;
  }
  .fc-tile {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-height: 112px;
    padding: 15px 13px 12px;
    border-radius: 14px;
    border: 1px solid rgb(40, 40, 47);
    background: linear-gradient(180deg, rgb(24, 24, 32), rgb(18, 18, 23));
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
    cursor: pointer;
    user-select: none;
    text-align: left;
    overflow: hidden;
    transition:
      border-color 0.12s,
      box-shadow 0.12s;
  }
  .fc-tile:hover:not(.on) {
    border-color: var(--aw-border-3);
  }
  .fc-tile.empty {
    background: var(--aw-bg-2);
    border-color: var(--aw-surface-2);
  }
  .fc-tile.on {
    border-color: var(--aw-accent);
    box-shadow:
      0 0 0 1px var(--aw-accent),
      0 8px 26px color-mix(in srgb, var(--aw-accent) 18%, transparent);
  }
  .fc-led {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 5px;
    background: var(--aw-border);
    opacity: 0.6;
  }
  .fc-led.lit {
    background: var(--fc-led);
    box-shadow: 0 0 12px var(--fc-led);
    opacity: 1;
  }
  .fc-num {
    position: absolute;
    top: 11px;
    right: 11px;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    font: 700 10px/1 var(--aw-font-mono);
    color: var(--aw-text-faint);
    background: rgba(12, 12, 14, 0.7);
    border: 1px solid var(--aw-border);
  }
  .fc-ondev {
    position: absolute;
    top: 13px;
    left: 13px;
    font: 600 9px/1 var(--aw-font-mono);
    letter-spacing: 0.02em;
    color: var(--ok, rgb(66, 211, 146));
  }
  .fc-tilelbl {
    padding-right: 20px;
    font: 700 13.5px/1.2 var(--aw-font-ui);
    color: var(--aw-text);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .fc-tile.empty .fc-tilelbl {
    font: 700 13.5px/1.2 var(--aw-font-mono);
    color: rgb(69, 69, 78);
  }
  .fc-rows {
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .fc-row {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }
  .fc-badge {
    flex: none;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    font: 700 8px/1 var(--aw-font-mono);
    font-style: normal;
  }
  .fc-badge.tap {
    color: rgb(10, 25, 26);
    background: var(--aw-accent);
  }
  .fc-badge.hold {
    color: rgb(28, 18, 6);
    background: var(--aw-amber);
  }
  .fc-rowtxt {
    font: 600 11px/1.2 var(--aw-font-mono);
    font-style: normal;
    color: var(--aw-text-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .fc-rowtxt.hold {
    color: rgb(126, 126, 136);
  }
  .fc-hint {
    margin-top: 14px;
    text-align: center;
    font: 600 11px/1.4 var(--aw-font-mono);
    color: var(--aw-text-muted);
  }
</style>
