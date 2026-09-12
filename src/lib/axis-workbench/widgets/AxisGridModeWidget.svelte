<script lang="ts">
  import { AXIS_GRID_MODES, cycleAxisGridMode, readAxisGridMode, type AxisGridMode } from '../gridView';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { widget, size, dispatch }: AxisWorkbenchWidgetProps = $props();
  const mini = $derived(size === 'mini');
  const expanded = $derived(size === 'default');
  const gridMode = $derived(readAxisGridMode(widget.state?.mode));
  function setMode(mode: AxisGridMode) { dispatch({ type: 'widget.state', widgetId: widget.id, state: { mode } }); }
</script>

<div class="axis-widget chips" data-size={size}>
  {#if expanded}<span class="mono token">GRID</span>{/if}
  <div class="chip-row">{#each AXIS_GRID_MODES as mode}{#if !mini || mode === gridMode}<button class="pill-chip" class:on={mode === gridMode || mini} type="button" title={mode === 'full' ? 'Blocks at the chosen size — grid pans' : mode === 'map' ? 'Glyph minimap' : 'Fit blocks to the pane'} onclick={() => setMode(mini ? cycleAxisGridMode(gridMode) : mode)}>{mode === 'full' ? 'Full' : mode === 'map' ? 'Map' : 'Auto'}</button>{/if}{/each}</div>
</div>
