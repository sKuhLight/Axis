<script lang="ts">
  import { LEGAL, openExternal } from '$lib/ancillary/legal';
  import { KOFI_URL, COPYRIGHT } from '$lib/ancillary/support';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { size }: AxisWorkbenchWidgetProps = $props();
  const notMini = $derived(size !== 'mini');
  const expanded = $derived(size === 'default');
</script>

<div class="axis-widget legal" data-size={size}>
  <button class="kofi" type="button" title="Support Axis development on Ko-fi" onclick={() => openExternal(KOFI_URL)}>☕{#if notMini}<span> Support on Ko-fi</span>{/if}</button>
  {#if expanded}<span class="sep" aria-hidden="true"></span><span class="cr">{COPYRIGHT}</span>{/if}
  <span class="sep" aria-hidden="true"></span><button class="lnk" type="button" onclick={() => openExternal(LEGAL.imprint)}>Imprint</button>
</div>

<style>
  .legal {
    gap: 10px;
    border-color: transparent;
    background: transparent;
    color: var(--textdim);
    cursor: default;
  }
  .legal .kofi {
    background: none;
    color: var(--blue, #13c3ff);
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }
  .legal .kofi:hover {
    filter: brightness(1.12);
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
