<script lang="ts">
  // Docked Modifier part (`be-part="modifier"`, design §3 of 05-block-editor.md). Fills its pane and
  // binds to whatever parameter an editor's ∿ badge last targeted, via the typed shared controller
  // (the production replacement for the design's `__BEBus` modParam/modBlock + modPartMounted rule).
  // The overlay flyout in the old shell (ModifierFlyout) is untouched — both reuse ModifierEditorCore.
  import ModifierEditorCore from '../../../ModifierEditorCore.svelte';
  import type { PanelInstance } from '../../../workbench';
  import { parseAxisBlockEditorPart, type AxisBlockEditorPart } from '../../blockEditor/types';
  import {
    axisBlockEditorModifierController,
    type AxisBlockEditorModifierSnapshot
  } from '../../blockEditor/blockEditorModifierController';

  let { panel }: { panel: PanelInstance } = $props();
  const part = $derived<AxisBlockEditorPart>(parseAxisBlockEditorPart(panel.state?.part, 'modifier'));

  let snapshot = $state<AxisBlockEditorModifierSnapshot>(axisBlockEditorModifierController.snapshot);

  // Register this docked part so the editor's ∿ badge targets the panel (not the flyout) while mounted.
  $effect(() => axisBlockEditorModifierController.registerPart());
  $effect(() => axisBlockEditorModifierController.subscribe((next) => (snapshot = next)));

  const target = $derived(snapshot.target);
</script>

<div class="axis-modifier-part" data-part={part}>
  <ModifierEditorCore
    variant="dock"
    hasTarget={target != null}
    label={target?.label ?? ''}
    block={target?.block ?? ''}
    targetEffectId={target?.targetEffectId ?? null}
    targetParam={target?.targetParam ?? null}
    slot={target?.slot ?? 1}
  />
</div>

<style>
  .axis-modifier-part {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg2);
  }
</style>
