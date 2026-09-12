<script lang="ts">
  import { editor } from '$lib/editor/editor.svelte';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { size }: AxisWorkbenchWidgetProps = $props();
</script>

<button class="axis-widget square account" data-size={size} type="button" onclick={() => editor.openAxis('about')} title="Axis — storage, privacy &amp; about">
  <span>AX</span>
</button>

<style>
  .square {
    width: 38px;
    justify-content: center;
    padding: 0;
    color: var(--textdim);
  }
  .square[data-size='compact'] {
    width: 34px;
  }
  .square[data-size='mini'] {
    width: 28px;
    justify-content: center;
    padding: 0;
  }
  .account span {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--accent), #4f6bed);
    color: var(--accentink);
    font-weight: 800;
    font-size: 10px;
  }
</style>
