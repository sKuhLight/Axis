<script lang="ts">
  import { getWorkbenchContext } from './context';
  import { describeSpot, type PlacementSpot } from './placement';
  import type { WorkbenchRect } from './drag';

  // Click-to-place highlights (placementSession.ts): every valid spot is
  // outlined, the active one (pointer or keyboard) is solid with its label.
  // The landing preview itself is DragLayer's (the session publishes the same
  // drag state a real drag does). Pointer-transparent: the session reads the
  // pointer from window listeners.
  const { controller } = getWorkbenchContext();
  const placement = $derived($controller.placement);

  let layerEl = $state<HTMLElement | null>(null);
  // Same zoom compensation as DragLayer: rects are visual px; this layer's px
  // are layout px under an ancestor CSS zoom.
  const zoom = $derived.by(() => {
    void placement;
    if (!layerEl || !layerEl.offsetWidth) return 1;
    const visual = layerEl.getBoundingClientRect().width;
    return visual > 0 ? visual / layerEl.offsetWidth : 1;
  });
  const box = (rect: WorkbenchRect) =>
    `left:${rect.left / zoom}px; top:${rect.top / zoom}px; width:${rect.width / zoom}px; height:${rect.height / zoom}px;`;
  const labelFor = (spot: PlacementSpot) => describeSpot(spot, placement?.zone ?? 'center');
</script>

{#if placement}
  <div class="aw-place-layer" bind:this={layerEl} data-placement={placement.kind} aria-hidden="true">
    {#each placement.spots as spot (spot.id)}
      {@const active = spot.id === placement.activeSpotId}
      <div
        class="aw-place-spot {spot.kind}"
        class:active
        data-place-spot={spot.id}
        data-active={active ? 'true' : undefined}
        style={box(spot.rect)}
      >
        {#if active && spot.kind !== 'nav'}<span class="aw-place-label">{labelFor(spot)}</span>{/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .aw-place-layer {
    position: fixed;
    inset: 0;
    z-index: 999;
    pointer-events: none;
  }
  .aw-place-spot {
    position: fixed;
    box-sizing: border-box;
    border: 1.5px dashed color-mix(in srgb, var(--aw-accent) 62%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--aw-accent) 6%, transparent);
    animation: awPlaceIn 0.14s ease;
  }
  /* Stacks: an inset outline so neighbouring stacks never merge into one box. */
  .aw-place-spot.stack {
    border-radius: 9px;
    box-shadow: inset 0 0 0 4px color-mix(in srgb, var(--aw-bg) 40%, transparent);
  }
  .aw-place-spot.active {
    border-style: solid;
    border-color: var(--aw-accent);
    background: color-mix(in srgb, var(--aw-accent) 10%, transparent);
  }
  /* Navigation gaps: thin insertion bars, the active one bright. */
  .aw-place-spot.nav {
    border: 0;
    border-radius: 3px;
    background: color-mix(in srgb, var(--aw-accent) 30%, transparent);
  }
  .aw-place-spot.nav.active {
    background: var(--aw-accent);
    box-shadow: 0 0 12px color-mix(in srgb, var(--aw-accent) 60%, transparent);
  }
  .aw-place-label {
    position: absolute;
    left: 8px;
    top: 8px;
    max-width: calc(100% - 16px);
    overflow: hidden;
    padding: 3px 8px;
    border-radius: 6px;
    background: var(--aw-accent);
    color: var(--aw-accent-ink);
    white-space: nowrap;
    text-overflow: ellipsis;
    font: 700 11px/1.3 var(--aw-font-ui);
  }
  @keyframes awPlaceIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .aw-place-spot {
      animation: none;
    }
  }
</style>
