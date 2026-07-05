<script lang="ts">
  import type { PanelInstance, WorkbenchCommand } from '../core';

  let {
    panel
  }: {
    panel: PanelInstance;
    dispatch: (command: WorkbenchCommand) => void;
    editMode: boolean;
  } = $props();
</script>

<div class="aw-fallback">
  <strong>{panel.title ?? panel.type}</strong>
  <span>{panel.type}</span>
</div>

<style>
  .aw-fallback {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    gap: 6px;
    text-align: center;
    color: var(--aw-text-muted);
    background: var(--aw-surface);
  }
  strong {
    color: var(--aw-text);
    font-size: 13px;
  }
  span {
    font: 600 10px/1 var(--aw-font-mono);
  }
</style>
