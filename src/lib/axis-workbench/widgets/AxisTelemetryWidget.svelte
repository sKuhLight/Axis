<script lang="ts">
  import { editor } from '$lib/editor/editor.svelte';
  import { computeTrafficRates, formatRate, type TrafficRates } from './telemetryTraffic';
  import type { TelemetryMode, TrafficSnapshot } from '$lib/api/types';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';

  let { size }: AxisWorkbenchWidgetProps = $props();
  const notMini = $derived(size !== 'mini');
  const expanded = $derived(size === 'default');

  const hasTelemetry = $derived(editor.hasTelemetryControl);
  const POLL_MODE_KEYS: { key: TelemetryMode; short: string; label: string }[] = [
    { key: 'performance', short: 'P', label: 'Performance' },
    { key: 'balanced', short: 'B', label: 'Balanced' },
    { key: 'reduced', short: 'R', label: 'Reduced (Live)' }
  ];
  // Previous cumulative snapshot kept locally (plain vars — NOT reactive, so updating them inside the
  // effect below can't loop). trafficRates is $state so the readout re-renders when it changes.
  let prevTraffic: TrafficSnapshot | null = null;
  let prevTrafficAt = 0;
  let trafficRates = $state<TrafficRates | null>(null);
  const trafficLoops = $derived(editor.traffic?.loops ?? []);
  $effect(() => {
    const snap = editor.traffic; // track the latest snapshot
    if (!snap) return;
    const now = Date.now();
    const rates = computeTrafficRates(prevTraffic, prevTrafficAt, snap, now);
    if (rates) trafficRates = rates;
    prevTraffic = snap;
    prevTrafficAt = now;
  });
</script>

{#if hasTelemetry}
  <div class="axis-widget axis-telemetry" data-size={size} data-mode={editor.pollingMode} title="Device polling mode & live traffic">
    {#if expanded}<span class="mono token">POLL</span>{/if}
    <div class="tmode-row" role="group" aria-label="Polling mode">
      {#each POLL_MODE_KEYS as m}
        <button
          class="tmode"
          class:on={editor.pollingMode === m.key}
          type="button"
          aria-pressed={editor.pollingMode === m.key}
          title={`Polling: ${m.label}`}
          onclick={() => editor.setPollingMode(m.key)}
        >{m.short}</button>
      {/each}
    </div>
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
  /* telemetry monitor (META-17): P/B/R quick-switch + live TX/RX rate + loop dots */
  .axis-telemetry {
    gap: 7px;
  }
  .axis-telemetry .tmode-row {
    display: flex;
    flex: none;
    gap: 2px;
  }
  .axis-telemetry .tmode {
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 5px;
    background: var(--surface2);
    color: var(--textfaint);
    cursor: pointer;
    font: 800 10px/1 var(--font-mono);
  }
  .axis-telemetry .tmode:hover {
    color: var(--text2);
  }
  .axis-telemetry .tmode.on {
    background: var(--accent);
    color: var(--accentink);
  }
  [data-size='mini'].axis-telemetry .tmode {
    width: 18px;
    height: 18px;
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
