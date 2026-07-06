<script lang="ts">
  // Modifier editor flyout — the old-shell overlay presentation. All behavior lives in the shared
  // ModifierEditorCore (also used by the docked `be-part="modifier"` panel, 05-block-editor.md §3);
  // this wrapper just pins the public props the ControlSurface / BlockEditor overlay relies on and
  // renders the core in its right-anchored, scrim-backed slide-in variant. Behavior is unchanged.
  import ModifierEditorCore from './ModifierEditorCore.svelte';
  import type { ModModel } from './types';

  let {
    open = false,
    label = '',
    targetEffectId = null,
    targetParam = null,
    slot = 1,
    model = undefined,
    onClose
  }: {
    open?: boolean;
    label?: string;
    /** The control this flyout was opened for: target block eid + paramId (for binding). */
    targetEffectId?: number | null;
    targetParam?: number | null;
    /** Modifier slot to use (1-based). */
    slot?: number;
    /** Pre-fetched address map; if omitted the core fetches /mod/model on first open. */
    model?: ModModel | null;
    onClose: () => void;
  } = $props();
</script>

<ModifierEditorCore
  variant="flyout"
  {open}
  {label}
  {targetEffectId}
  {targetParam}
  {slot}
  {model}
  {onClose}
/>
