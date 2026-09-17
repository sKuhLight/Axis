<script lang="ts">
  import { editorOverlays, presetBuffer } from '$lib/editor/editorClients.svelte';
  import { history } from '$lib/editor/history.svelte';
  import { isSaveDirty } from './saveDirtyState';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { size }: AxisWorkbenchWidgetProps = $props();
  const expanded = $derived(size === 'default');
  const auditioning = $derived(presetBuffer.auditioned !== null);
  const saveDirty = $derived(isSaveDirty(history.entries, history.cursor));
  // An audition is also "not saved to a slot", so it shares the loud amber pill with a dirty
  // edit — only the label distinguishes them ("AUDITIONING · Save to…" vs "EDITED · Save").
  const hot = $derived(saveDirty || auditioning);

  // An auditioned computer preset has no destination yet, so Save opens the slot picker instead of
  // overwriting whatever slot the device happens to be sitting on. An ordinary dirty edit still
  // fast-saves to its own slot — the destination is unambiguous there.
  function onSave() {
    if (auditioning) {
      editorOverlays.openSlotPicker(
        (slot) => void presetBuffer.saveToSlot(slot),
        { name: presetBuffer.auditioned?.name ?? 'preset' }
      );
      return;
    }
    void presetBuffer.save();
  }
</script>

<!-- Save lives beside the preset/scene names (top.left), not in the far-right
     status cluster. Clean = quiet green "Saved"; dirty = a FILLED amber pill so
     an unsaved preset reads at a glance; auditioning = the same amber pill reading
     "AUDITIONING · Save". -->
<button
  class="axis-widget save"
  class:dirty={hot}
  data-size={size}
  data-dirty={hot ? 'true' : 'false'}
  data-auditioning={auditioning ? 'true' : 'false'}
  type="button"
  onclick={onSave}
  title={auditioning ? 'Auditioning — choose a slot to save it to' : saveDirty ? 'Save edits to the current preset' : 'No unsaved edits'}
>
  <span class="save-dot"></span>
  {#if expanded}<span class="save-label">{auditioning ? 'AUDITIONING · Save to…' : saveDirty ? 'EDITED · Save' : '✓ Saved'}</span>{/if}
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
