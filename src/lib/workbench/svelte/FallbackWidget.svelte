<script lang="ts">
  import type { WidgetInstance, WorkbenchCommand } from '../core';

  let {
    widget,
    size
  }: {
    widget: WidgetInstance;
    size: WidgetInstance['size'];
    dispatch: (command: WorkbenchCommand) => void;
    editMode: boolean;
  } = $props();
</script>

<div class="aw-widget-fallback" data-size={size} title={widget.type}>
  <span>{widget.type}</span>
</div>

<style>
  .aw-widget-fallback {
    min-width: 0;
    max-width: 100%;
    height: var(--aw-widget-h, 34px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 10px;
    border: 1px solid var(--aw-border);
    border-radius: 8px;
    background: var(--aw-surface-2);
    color: var(--aw-text-muted);
    font: 700 10px/1 var(--aw-font-mono);
  }
  .aw-widget-fallback[data-size='mini'] {
    width: 34px;
    padding: 0;
  }
  .aw-widget-fallback[data-size='mini'] span {
    overflow: hidden;
    width: 1ch;
  }
</style>
