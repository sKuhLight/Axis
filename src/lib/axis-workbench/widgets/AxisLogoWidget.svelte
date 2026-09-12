<script lang="ts">
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { size }: AxisWorkbenchWidgetProps = $props();
</script>

<div class="axis-widget square logo" data-size={size} title="Axis">
  <svg width="26" height="26" viewBox="0 0 30 30" aria-hidden="true">
    <circle cx="9" cy="9" r="3.4" class="logo-a"></circle>
    <circle cx="21" cy="9" r="3.4" class="logo-b"></circle>
    <circle cx="15" cy="21" r="3.4" class="logo-c"></circle>
    <path d="M9 9 L21 9 L15 21 Z" fill="none" class="logo-tri"></path>
  </svg>
</div>

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
  .logo {
    cursor: default;
  }
  .logo .logo-a {
    fill: var(--aw-accent);
  }
  .logo .logo-b {
    fill: var(--blue, var(--aw-accent));
  }
  .logo .logo-c {
    fill: var(--aw-amber);
  }
  .logo .logo-tri {
    stroke: var(--aw-border-3);
    stroke-width: 1.6;
  }
</style>
