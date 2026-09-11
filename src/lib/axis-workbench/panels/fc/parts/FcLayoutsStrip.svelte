<script lang="ts">
  import { axisFcWorkbenchController } from '../../../fc/fcWorkbenchController';
  import type { AxisFcDataView } from '../../../fc/fcWorkbenchData';

  let { data }: { data: AxisFcDataView } = $props();
</script>

<!-- LAYOUTS strip (§3.2) -->
{#if data.layouts.length}
  <div class="fc-strip">
    <span class="fc-striplab">LAYOUTS</span>
    {#each data.layouts as layout (layout.index)}
      <button
        type="button"
        class="fc-laychip"
        class:on={layout.active}
        class:master={layout.label === 'Master'}
        class:assigned={layout.assigned}
        aria-pressed={layout.active}
        title={`${layout.label === 'Master' ? 'Master layout' : `Layout ${layout.label}`}${layout.assigned ? ' · has assigned switches' : ''}`}
        onclick={() => axisFcWorkbenchController.selectLayout(layout.index)}
      >
        {layout.label === 'Master' ? 'MASTER' : layout.label}
        {#if layout.assigned && !layout.active}<span class="fc-dot"></span>{/if}
      </button>
    {/each}
  </div>
{:else}
  <div class="fc-strip fc-strip-flat">
    <span class="fc-striplab">CONFIGS</span>
    {#each data.configs.slice(0, 64) as config (config.index)}
      <button
        type="button"
        class="fc-laychip"
        class:on={config.active}
        aria-pressed={config.active}
        title={`Config ${config.label}`}
        onclick={() => axisFcWorkbenchController.selectSwitch(config.index)}>{config.label}</button>
    {/each}
    {#if data.configs.length > 64}
      <span class="fc-more" title="This device exposes a flat FC config space with no decoded geometry"
        >+{data.configs.length - 64} more</span>
    {/if}
  </div>
{/if}

<style>
  .fc-strip {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 11px 14px;
    border-bottom: 1px solid var(--aw-surface-2);
    overflow-x: auto;
  }
  .fc-striplab {
    flex: none;
    margin-right: 2px;
    font: 700 10px/1 var(--aw-font-mono);
    letter-spacing: 0.14em;
    color: var(--aw-text-muted);
  }
  .fc-laychip {
    position: relative;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 34px;
    min-width: 34px;
    padding: 0;
    border-radius: 9px;
    border: 1px solid var(--aw-border-2);
    background: var(--aw-surface);
    color: rgb(92, 92, 100);
    font: 700 14px/1 var(--aw-font-mono);
    cursor: pointer;
  }
  .fc-laychip.assigned {
    color: rgb(220, 220, 226);
  }
  .fc-laychip.master {
    min-width: 80px;
    padding: 0 13px;
    font: 700 11px/1 var(--aw-font-mono);
    letter-spacing: 0.08em;
  }
  .fc-laychip:hover:not(.on) {
    border-color: var(--aw-border-3);
    color: var(--aw-text);
  }
  .fc-laychip.on {
    background: var(--aw-accent);
    border-color: var(--aw-accent);
    color: var(--aw-accent-ink);
  }
  .fc-more {
    flex: none;
    align-self: center;
    font: 600 10px/1 var(--aw-font-mono);
    color: var(--aw-text-muted);
  }
  .fc-dot {
    position: absolute;
    top: 5px;
    right: 5px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--aw-accent);
  }
</style>
