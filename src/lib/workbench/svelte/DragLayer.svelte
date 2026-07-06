<script lang="ts">
  import { getWorkbenchContext } from './context';

  const { controller } = getWorkbenchContext();
  const drag = $derived($controller.drag);
</script>

{#if drag}
  <div class="aw-drag-layer">
    {#if drag.previewRect}
      <div
        class="aw-drop-preview"
        class:tab={drag.kind === 'panel' && drag.previewKind === 'tab'}
        class:split={drag.kind === 'panel' && drag.previewKind === 'split'}
        class:insert={drag.kind === 'widget' && drag.previewKind === 'insert'}
        class:group={drag.kind === 'widget' && drag.previewKind === 'group'}
        style="
          left:{drag.previewRect.left}px;
          top:{drag.previewRect.top}px;
          width:{drag.previewRect.width}px;
          height:{drag.previewRect.height}px;
        "
      ></div>
    {/if}
    <div class="aw-drag-ghost" style="transform:translate({drag.pointer.x + 10}px, {drag.pointer.y + 10}px)">
      {#if drag.kind === 'panel'}
        <span class="aw-drag-kind">Panel</span>
      {:else}
        <span class="aw-drag-kind">Widget</span>
      {/if}
      {#if drag.targetLabel}<span class="aw-drag-target">{drag.targetLabel}</span>{/if}
    </div>
  </div>
{/if}

<style>
  .aw-drag-layer {
    position: fixed;
    inset: 0;
    z-index: 1000;
    pointer-events: none;
  }
  .aw-drag-ghost {
    position: absolute;
    top: 0;
    left: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    height: 32px;
    padding: 0 12px;
    border: 1px solid var(--aw-accent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--aw-bg-2) 92%, transparent);
    color: var(--aw-text);
    opacity: 0.72;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
    font: 800 11px/1 var(--aw-font-ui);
  }
  .aw-drag-kind {
    color: var(--aw-text);
  }
  .aw-drag-target {
    color: var(--aw-accent);
    font: 700 10px/1 var(--aw-font-mono);
    text-transform: uppercase;
  }
  .aw-drop-preview {
    position: fixed;
    box-sizing: border-box;
    border: 2px dashed var(--aw-accent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--aw-accent) 14%, transparent);
    animation: awPreviewIn 0.12s ease;
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--aw-accent) 26%, transparent),
      0 0 24px color-mix(in srgb, var(--aw-accent) 18%, transparent);
  }
  .aw-drop-preview.tab {
    border-style: solid;
    border-radius: 0;
    background: color-mix(in srgb, var(--aw-accent) 24%, transparent);
  }
  .aw-drop-preview.split {
    border-style: solid;
    border-radius: 0;
  }
  .aw-drop-preview.insert {
    border: 0;
    border-radius: 999px;
    background: var(--aw-accent);
    box-shadow: 0 0 14px color-mix(in srgb, var(--aw-accent) 52%, transparent);
  }
  .aw-drop-preview.group {
    border-style: solid;
    background: color-mix(in srgb, var(--aw-accent) 16%, transparent);
  }
  @keyframes awPreviewIn {
    from { opacity: 0; transform: scale(0.992); }
    to { opacity: 1; transform: scale(1); }
  }
</style>
