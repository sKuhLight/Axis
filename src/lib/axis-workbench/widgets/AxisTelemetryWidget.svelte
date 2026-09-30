<script lang="ts">
  import { deviceSession, telemetry } from '$lib/editor/editorClients.svelte';
  import { computeTrafficRates, formatRate, type TrafficRates } from './telemetryTraffic';
  import type { TrafficSnapshot } from '$lib/api/types';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';

  let { size }: AxisWorkbenchWidgetProps = $props();
  const notMini = $derived(size !== 'mini');
  const expanded = $derived(size === 'default');

  const hasTelemetry = $derived(deviceSession.hasTelemetryControl);
  // Previous cumulative snapshot kept locally (plain vars — NOT reactive, so updating them inside the
  // effect below can't loop). trafficRates is $state so the readout re-renders when it changes.
  let prevTraffic: TrafficSnapshot | null = null;
  let prevTrafficAt = 0;
  let trafficRates = $state<TrafficRates | null>(null);
  const trafficLoops = $derived(telemetry.traffic?.loops ?? []);
  $effect(() => {
    const snap = telemetry.traffic; // track the latest snapshot
    if (!snap) return;
    const now = Date.now();
    const rates = computeTrafficRates(prevTraffic, prevTrafficAt, snap, now);
    if (rates) trafficRates = rates;
    prevTraffic = snap;
    prevTrafficAt = now;
  });
</script>

{#if hasTelemetry}
  <div class="axis-widget axis-telemetry" data-size={size} title="Live device traffic">
    {#if expanded}<span class="mono token">TRAFFIC</span>{/if}
    {#if notMini}
      <span class="mono trate" title="TX / RX messages per second">
        <span class="trk">TX</span>{formatRate(trafficRates?.txMsgs ?? 0)}<span class="tru">/s</span>
        <span class="trk rx">RX</span>{formatRate(trafficRates?.rxMsgs ?? 0)}<span class="tru">/s</span>
      </span>
    {/if}
    {#if expanded}
      <span class="mono tkb" title="TX / RX kilobytes per second">{formatRate(trafficRates?.txKB ?? 0)}/{formatRate(trafficRates?.rxKB ?? 0)} KB/s</span>
      <span class="tloops" title={`Active poll loops: ${trafficLoops.join(', ') || 'none'}`} aria-label={`${trafficLoops.length} active poll loop${trafficLoops.length === 1 ? '' : 's'}`}>
        {#each trafficLoops as loop (loop)}<span class="tloop"></span>{/each}
      </span>
    {/if}
  </div>
{/if}

<style>
  /* telemetry monitor (META-17): live TX/RX rate + loop dots */
  .axis-telemetry {
    gap: 7px;
  }
  .axis-telemetry .trate {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    color: var(--text2);
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }
  .axis-telemetry .trk {
    color: var(--textfaint);
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.08em;
  }
  .axis-telemetry .trk.rx {
    margin-left: 4px;
  }
  .axis-telemetry .tru {
    color: var(--textmuted);
    font-size: 9px;
  }
  .axis-telemetry .tkb {
    color: var(--textfaint);
    font-size: 10px;
    white-space: nowrap;
  }
  .axis-telemetry .tloops {
    display: inline-flex;
    flex: none;
    gap: 2px;
    align-items: center;
  }
  .axis-telemetry .tloop {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--ok, #33c46b);
    box-shadow: 0 0 6px var(--ok, #33c46b);
  }
</style>
