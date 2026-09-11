<script lang="ts">
  import { axisFcDeviceForSwitchCount } from '../fc/fcWorkbenchData';
  import { AXIS_FC_DEVICES, cycleAxisFcDevice, readAxisFcDevice, type AxisFcDevice } from './widgetControls';
  import { createAxisFcWidgetSnapshot } from './fcWidgetSnapshot.svelte';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';

  let { widget, size, dispatch }: AxisWorkbenchWidgetProps = $props();
  const mini = $derived(size === 'mini');
  const expanded = $derived(size === 'default');
  const fc = createAxisFcWidgetSnapshot();

  // With a live FC model the device chip mirrors the connected unit's switch count
  // (04-fc-and-grid.md §3.1/§5 — the selector is display-only then); widget state
  // only drives it while no model is loaded.
  const fcDevice = $derived(
    fc.model?.switches != null
      ? readAxisFcDevice(axisFcDeviceForSwitchCount(fc.model.switches))
      : readAxisFcDevice(widget.state?.device)
  );

  function setFcDevice(device: AxisFcDevice) {
    dispatch({ type: 'widget.state', widgetId: widget.id, state: { device } });
  }
</script>

<div class="axis-widget chips" data-size={size}>
  {#if expanded}<span class="mono token">FC</span>{/if}
  <div class="chip-row">
    {#if mini}
      <button
        class="pill-chip on"
        type="button"
        title={`FC device ${fcDevice} · tap for next`}
        onclick={() => setFcDevice(cycleAxisFcDevice(fcDevice))}
      >
        {fcDevice}
      </button>
    {:else}
      {#each AXIS_FC_DEVICES as device (device)}
        <button
          class="pill-chip"
          class:on={device === fcDevice}
          type="button"
          title={`FC device ${device}`}
          onclick={() => setFcDevice(device)}
        >
          {device}
        </button>
      {/each}
    {/if}
  </div>
</div>
