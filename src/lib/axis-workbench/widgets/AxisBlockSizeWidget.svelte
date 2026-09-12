<script lang="ts">
  import { cycleAxisBlockSize, readAxisBlockSize, stepAxisBlockSize, type AxisBlockSize } from '../gridView';
  import { createAxisHoldRepeat } from './widgetControls';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { widget, size, dispatch }: AxisWorkbenchWidgetProps = $props();
  const mini = $derived(size === 'mini');
  const expanded = $derived(size === 'default');
  const blockSize = $derived(readAxisBlockSize(widget.state?.size));
  function setSize(next: AxisBlockSize) { dispatch({ type: 'widget.state', widgetId: widget.id, state: { size: next } }); }
  const less = createAxisHoldRepeat(() => setSize(stepAxisBlockSize(blockSize, -1)));
  const more = createAxisHoldRepeat(() => setSize(stepAxisBlockSize(blockSize, 1)));
  $effect(() => () => { less.stop(); more.stop(); });
</script>

<div class="axis-widget block-size" data-size={size}>
  {#if expanded}<span class="mono token">SIZE</span>{/if}
  {#if mini}<button class="mono strong size-cycle" type="button" title="Cycle block size" onclick={() => setSize(cycleAxisBlockSize(blockSize))}>{blockSize}</button>
  {:else}<button class="step" type="button" title="Smaller blocks (hold)" disabled={blockSize === 'S'} onclick={() => setSize(stepAxisBlockSize(blockSize, -1))} onpointerdown={(event) => less.start(event)} onpointerup={less.stop} onpointerleave={less.stop}>−</button><span class="mono strong">{blockSize}</span><button class="step" type="button" title="Bigger blocks (hold)" disabled={blockSize === 'L'} onclick={() => setSize(stepAxisBlockSize(blockSize, 1))} onpointerdown={(event) => more.start(event)} onpointerup={more.stop} onpointerleave={more.stop}>+</button>{/if}
</div>

<style>
  .step {
    width: 22px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: var(--surface2);
    color: var(--textdim);
    cursor: pointer;
    font-size: 15px;
    font-weight: 700;
  }
  .step:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .size-cycle {
    background: transparent;
    cursor: pointer;
    font-size: 12px;
  }
</style>
