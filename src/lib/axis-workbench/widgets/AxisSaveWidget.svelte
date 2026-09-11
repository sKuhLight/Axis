<script lang="ts">
  import { editor } from '$lib/editor/editor.svelte';
  import { history } from '$lib/editor/history.svelte';
  import { isSaveDirty } from './saveDirtyState';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { size }: AxisWorkbenchWidgetProps = $props();
  const expanded = $derived(size === 'default');
  const saveDirty = $derived(isSaveDirty(history.entries, history.cursor));
</script>

<button class="axis-widget save" class:dirty={saveDirty} data-size={size} type="button" onclick={() => editor.openSave()} title={saveDirty ? 'Unsaved edits — click to Save' : 'No unsaved edits'}>
  <span class="save-dot"></span>
  {#if expanded}<span>{saveDirty ? 'Save' : 'Saved'}</span>{/if}
</button>

<style>
  .save-dot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 50%;
    box-shadow: 0 0 8px currentColor;
    color: var(--amber);
    background: var(--amber);
  }
  /* Clean = green "Saved" (green dot + ink); dirty = amber "Save" (02-widgets.md). */
  .save {
    color: var(--ok, #33c46b);
  }
  .save .save-dot {
    color: var(--ok, #33c46b);
    background: var(--ok, #33c46b);
  }
  .save.dirty {
    color: var(--amber, #f5a623);
  }
  .save.dirty .save-dot {
    color: var(--amber, #f5a623);
    background: var(--amber, #f5a623);
  }
</style>
