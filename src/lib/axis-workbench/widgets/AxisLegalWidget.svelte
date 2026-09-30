<script lang="ts">
  import { LEGAL, openExternal } from '$lib/ancillary/legal';
  import { COPYRIGHT } from '$lib/ancillary/support';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { size }: AxisWorkbenchWidgetProps = $props();
  const expanded = $derived(size === 'default');
</script>

<div class="axis-widget legal" data-size={size}>
  {#if expanded}<span class="cr">{COPYRIGHT}</span><span class="sep" aria-hidden="true"></span>{/if}<button class="lnk" type="button" onclick={() => openExternal(LEGAL.imprint)}>Imprint</button>
</div>

<style>
  .legal {
    gap: 10px;
    border-color: transparent;
    background: transparent;
    color: var(--textdim);
    cursor: default;
  }
  .legal .lnk {
    background: none;
    color: var(--textdim);
    font-size: 11px;
    cursor: pointer;
  }
  .legal .lnk:hover {
    color: var(--text2);
  }
  .legal .cr {
    color: var(--textmuted);
    font-size: 11px;
  }
  .legal .sep {
    width: 3px;
    height: 3px;
    flex: none;
    border-radius: 50%;
    background: var(--border3);
  }
</style>
