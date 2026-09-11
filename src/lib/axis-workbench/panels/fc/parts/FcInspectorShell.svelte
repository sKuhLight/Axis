<script lang="ts">
  import type { Snippet } from 'svelte';
  import FcViewNav from './FcViewNav.svelte';
  import type { AxisFcPartView, AxisFcRuntimePart } from '../../../fc/fcPartView.svelte';

  let { view, part, children }: { view: AxisFcPartView; part: AxisFcRuntimePart; children: Snippet } = $props();
</script>

<!-- switch inspector (§3.3); part instances always show and fill the pane (§1.2) -->
<div class="fc-insp">
  <div class="fc-ihead">
    <span class="fc-ilab">SWITCH</span>
    <span class="fc-inum">{view.data.selectedSwitch == null ? '—' : view.data.selectedSwitch + 1}</span>
    {#if view.data.views.length > 1}
      <span class="fc-idiv"></span>
      <span class="fc-viewlab">VIEW</span>
      <FcViewNav views={view.data.views} />
    {/if}
    <span class="fc-spacer"></span>
    {#if view.runtimeSnapshot.present[view.cfg]}
      <span class="fc-present" title="Configured on the device (live read)">● on unit</span>
    {/if}
    {#if view.runtimeSnapshot.reading}
      <span class="fc-reading" title="Reading switch state from the connected unit">reading…</span>
    {/if}
  </div>

  {#if view.data.hasGeometry && view.data.selectedSwitch == null}
    <!-- inspector part shown without a selection: guide the user to the board (§3.1 hint) -->
    <div class="fc-empty">
      <strong>No switch selected</strong>
      <span>Pick a switch on the board to edit its Tap &amp; Hold actions</span>
    </div>
  {:else}
    <div class="fc-ibody" class:solo={part !== 'inspector'}>
      {@render children()}
    </div>
  {/if}
</div>

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
  .fc-insp {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--aw-bg-2);
  }
  .fc-ihead {
    flex: none;
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 16px 18px 13px;
    border-bottom: 1px solid var(--aw-surface-2);
  }
  .fc-ilab {
    font: 700 11px/1 var(--aw-font-mono);
    letter-spacing: 0.14em;
    color: var(--aw-text-faint);
  }
  .fc-inum {
    font: 700 17px/1 var(--aw-font-mono);
    color: var(--aw-text);
  }
  .fc-idiv {
    width: 1px;
    height: 18px;
    background: var(--aw-border);
    margin: 0 3px;
  }
  .fc-viewlab {
    font: 700 9px/1 var(--aw-font-mono);
    letter-spacing: 0.12em;
    color: var(--aw-text-muted);
  }
  .fc-present {
    font: 600 9px/1 var(--aw-font-mono);
    color: var(--ok, rgb(66, 211, 146));
  }
  .fc-reading {
    font: 600 10px/1 var(--aw-font-mono);
    color: var(--aw-text-faint);
  }
  .fc-ibody {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
  }
  .fc-ibody.solo {
    flex-wrap: nowrap;
    flex-direction: column;
  }
</style>
