<script lang="ts">
  import type { NavigationEntryState, WorkbenchCommand } from '../core';

  let {
    entry,
    runAction
  }: {
    entry: NavigationEntryState;
    dispatch: (command: WorkbenchCommand) => void;
    runAction: () => void;
    editMode: boolean;
  } = $props();
</script>

<button class="aw-nav-fallback" type="button" title={entry.label ?? entry.id} onclick={runAction}>
  <span>{entry.label ?? entry.id}</span>
</button>

<style>
  .aw-nav-fallback {
    width: 100%;
    min-width: 0;
    height: 44px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--aw-text-muted);
    cursor: pointer;
    font: 700 10px/1 var(--aw-font-ui);
  }
  .aw-nav-fallback:hover {
    color: var(--aw-text);
    background: var(--aw-surface);
  }
</style>
