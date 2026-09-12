<script lang="ts">
  import './fcFocusRing.css';
  import type { Snippet } from 'svelte';
  import type { AxisFcRuntimeSnapshot } from '../../../fc/fcWorkbenchRuntime';
  import type { AxisFcRuntimePart } from '../../../fc/fcPartView.svelte';

  let {
    part,
    runtimeSnapshot,
    dataReady,
    inspBg = false,
    children
  }: {
    part: AxisFcRuntimePart;
    runtimeSnapshot: AxisFcRuntimeSnapshot;
    dataReady: boolean;
    inspBg?: boolean;
    children: Snippet;
  } = $props();
</script>

<section class="fc-part" class:insp-bg={inspBg} data-part={part}>
  {#if runtimeSnapshot.error}
    <div class="fc-empty">
      <strong>FC model unavailable</strong>
      <span>{runtimeSnapshot.error}</span>
    </div>
  {:else if !dataReady || runtimeSnapshot.loading}
    <div class="fc-empty">
      <strong>Loading FC model</strong>
      <span>Reading Foot Controller address model</span>
    </div>
  {:else}
    {@render children()}
  {/if}
</section>

<style>
  .fc-part {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--aw-bg);
    color: var(--aw-text-2);
    font-family: var(--aw-font-ui);
  }
  /* §1.2 part-container override: inspector parts fill the pane on bg2 */
  .fc-part.insp-bg {
    background: var(--aw-bg-2);
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
</style>
