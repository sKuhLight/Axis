<script lang="ts">
  import { presetBuffer } from '$lib/editor/editorClients.svelte';
  import { history } from '$lib/editor/history.svelte';
  import { isSaveDirty } from './saveDirtyState';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { size }: AxisWorkbenchWidgetProps = $props();
  const expanded = $derived(size === 'default');
  const saveDirty = $derived(isSaveDirty(history.entries, history.cursor));
</script>

<!-- Save lives beside the preset/scene names (top.left), not in the far-right
     status cluster. Clean = quiet green "Saved"; dirty = a FILLED amber pill so
     an unsaved preset reads at a glance. -->
<button
  class="axis-widget save"
  class:dirty={saveDirty}
  data-size={size}
  data-dirty={saveDirty ? 'true' : 'false'}
  type="button"
  onclick={() => presetBuffer.save()}
  title={saveDirty ? 'Save edits to the current preset' : 'No unsaved edits'}
>
  <span class="save-dot"></span>
  {#if expanded}<span class="save-label">{saveDirty ? 'EDITED · Save' : '✓ Saved'}</span>{/if}
</button>

<style>
  .save {
    border-color: transparent;
    background: transparent;
    color: var(--ok);
  }
  .save-dot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 6px color-mix(in srgb, var(--ok) 55%, transparent);
  }
  /* Dirty: a filled amber pill with dark ink — the loud counterpart to the quiet
     green clean state. */
  .save.dirty {
    border-color: var(--amber);
    background: var(--amber);
    color: var(--bg);
  }
  .save.dirty .save-dot {
    background: var(--bg);
    box-shadow: none;
  }
  .save.dirty:hover {
    border-color: var(--amber);
    background: color-mix(in srgb, var(--amber) 88%, white);
    color: var(--bg);
  }
  .save-label {
    font-weight: 800;
  }
</style>
