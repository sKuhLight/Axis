<script lang="ts">
  import { getWorkbenchContext } from './context';
  import type { WorkbenchCommand } from '../core';

  const { controller, registry } = getWorkbenchContext();
  const drag = $derived($controller.drag);
  // Valid/invalid drop intent: while a drag is active, an accepting target is
  // signalled either by an overlay `previewRect` (group-create, edge drop) or by
  // an IN-FLOW insertion target (`zoneInsert`/`groupInsert` — V14 follow-up: the
  // slot elements render inside the zone/group flow, not in this layer). Neither
  // ⇒ nothing will accept the drop, so the drag reads as rejected (design
  // language: danger-tinted, not-allowed cursor).
  // `previewRect` overlay is panel/widget-only (list drags feed back via the
  // in-flow slot instead, like widget positional inserts).
  const previewRect = $derived(drag && drag.kind !== 'list' ? drag.previewRect : undefined);
  const invalid = $derived(
    !!drag &&
      !previewRect &&
      !(drag.kind === 'widget' && (drag.zoneInsert || drag.groupInsert)) &&
      !(drag.kind === 'list' && drag.listInsert)
  );

  // Generic list-reorder ghost: the primitive captured a static CLONE of the
  // grabbed row (design ghost = the real element at the grab offset). The
  // framework needs no knowledge of the row's markup — this action just mounts
  // whatever node the caller cloned. Svelte's scoped-style attributes ride along
  // on the clone, so it renders styled here.
  const listGhost = $derived(drag?.kind === 'list' ? drag : null);
  function mountClone(node: HTMLElement, el: HTMLElement | undefined) {
    let current: HTMLElement | null = null;
    const set = (next: HTMLElement | undefined) => {
      if (current === next) return;
      if (current) current.remove();
      current = next ?? null;
      if (current) node.appendChild(current);
    };
    set(el);
    return {
      update: (next: HTMLElement | undefined) => set(next),
      destroy: () => set(undefined)
    };
  }

  // Full-size travelling ghost (design shell `<div ref=ghostRef><AxisWidget
  // w=ghostW/></div>` at `fixed; left:px-offx; top:py-offy; opacity:.5;
  // scale(1.03)`): the REAL widget component renders in a chrome chip that
  // follows the pointer, anchored at the grab offset. The origin is lifted
  // (display:none), so this ghost is what the operator sees travelling. For a
  // group drag the first member stands in for the unit (design ghostW).
  const ghost = $derived.by(() => {
    if (!drag || drag.kind !== 'widget') return null;
    const widget = $controller.activeLayout?.widgets[drag.widgetIds[0]];
    if (!widget) return null;
    const Component = registry.widget(widget.type);
    if (!Component) return null;
    return {
      widget,
      Component,
      size: drag.size ?? { width: 120, height: 38 },
      grabOffset: drag.grabOffset ?? { x: 12, y: 12 }
    };
  });
  const ghostDispatch = (_command: WorkbenchCommand) => {};

  let layerEl = $state<HTMLElement | null>(null);
  // An ancestor CSS `zoom` (the Axis UI-scale setting applies one on <html>) puts
  // this layer's own px units in LAYOUT space while pointer coords and
  // getBoundingClientRect values are VISUAL — rendering visual values inside the
  // zoomed subtree double-applies the factor, so preview + ghost drift and scale,
  // growing with distance from the origin. Hit-testing is untouched (visual vs
  // visual); only the rendering needs compensation. Self-calibrating: the layer
  // spans the viewport, so its visual/layout width ratio IS the cumulative
  // effective zoom. Identity (1) with no zoom; one gBCR per drag update.
  const zoom = $derived.by(() => {
    void drag;
    if (!layerEl || !layerEl.offsetWidth) return 1;
    const visual = layerEl.getBoundingClientRect().width;
    return visual > 0 ? visual / layerEl.offsetWidth : 1;
  });
</script>

{#if drag}
  <div class="aw-drag-layer" class:invalid bind:this={layerEl}>
    {#if previewRect}
      <div
        class="aw-drop-preview"
        class:tab={drag.kind === 'panel' && drag.previewKind === 'tab'}
        class:split={drag.kind === 'panel' && drag.previewKind === 'split'}
        class:insert={drag.kind === 'widget' && drag.previewKind === 'insert'}
        class:group={drag.kind === 'widget' && drag.previewKind === 'group'}
        style="
          left:{previewRect.left / zoom}px;
          top:{previewRect.top / zoom}px;
          width:{previewRect.width / zoom}px;
          height:{previewRect.height / zoom}px;
        "
      ></div>
    {/if}
    {#if ghost}
      {@const GhostWidget = ghost.Component}
      <!-- The dragged widget itself travels with the pointer (design ghost:
           full AxisWidget render, half-opaque, slightly scaled, accent chrome),
           anchored where it was grabbed. Inert — pointer-events:none layer. -->
      <div
        class="aw-drag-widget-ghost"
        class:invalid
        style="transform:translate({(drag.pointer.x - ghost.grabOffset.x) / zoom}px, {(drag.pointer.y - ghost.grabOffset.y) / zoom}px) scale(1.03)"
      >
        <div style="width:{ghost.size.width}px;">
          <GhostWidget widget={ghost.widget} size={ghost.widget.size ?? 'default'} dispatch={ghostDispatch} editMode={false} />
        </div>
      </div>
    {/if}
    {#if listGhost && listGhost.ghostEl}
      {@const grab = listGhost.grabOffset ?? { x: 12, y: 12 }}
      <!-- List-reorder ghost: the cloned row travels with the pointer, anchored
           where it was grabbed (same model as the widget ghost, but the node is
           whatever the caller cloned). Inert — the layer is pointer-events:none. -->
      <div
        class="aw-drag-list-ghost"
        class:invalid
        style="transform:translate({(drag.pointer.x - grab.x) / zoom}px, {(drag.pointer.y - grab.y) / zoom}px) scale(1.02); width:{(listGhost.size?.width ?? 240)}px;"
        use:mountClone={listGhost.ghostEl}
      ></div>
    {/if}
    <div
      class="aw-drag-ghost"
      class:invalid
      style="transform:translate({(drag.pointer.x + 10) / zoom}px, {ghost
        ? (drag.pointer.y - ghost.grabOffset.y) / zoom + ghost.size.height + 12
        : (drag.pointer.y + 10) / zoom}px)"
    >
      {#if drag.kind === 'panel'}
        <span class="aw-drag-kind">Panel</span>
      {:else if drag.kind === 'list'}
        <span class="aw-drag-kind">Reorder</span>
      {:else}
        <span class="aw-drag-kind">Widget</span>
      {/if}
      {#if invalid}
        <span class="aw-drag-target reject" aria-hidden="true">⊘ No drop</span>
      {:else if drag.targetLabel}
        <span class="aw-drag-target">{drag.targetLabel}</span>
      {/if}
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
  /* Viewport-edge danger frame while no target accepts the drop. Kept
     pointer-events:none — the drag hit-tests via elementFromPoint, so the
     overlay must never shadow the real drop targets. */
  .aw-drag-layer.invalid::after {
    content: '';
    position: absolute;
    inset: 4px;
    border: 2px dashed color-mix(in srgb, var(--aw-danger) 55%, transparent);
    border-radius: 14px;
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
  /* No accepting target under the pointer: recolor the ghost to danger and flag
     the cursor as not-allowed so the rejected drop reads at a glance. */
  .aw-drag-ghost.invalid {
    border-color: var(--aw-danger);
    background: color-mix(in srgb, var(--aw-danger) 18%, var(--aw-bg-2));
    cursor: not-allowed;
  }
  .aw-drag-kind {
    color: var(--aw-text);
  }
  .aw-drag-ghost.invalid .aw-drag-kind {
    color: color-mix(in srgb, var(--aw-danger) 60%, var(--aw-text));
  }
  .aw-drag-target {
    color: var(--aw-accent);
    font: 700 10px/1 var(--aw-font-mono);
    text-transform: uppercase;
  }
  .aw-drag-target.reject {
    color: var(--aw-danger);
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
  /* Full-size travelling widget ghost (design ghostStyle: fixed, half-opaque,
     scale 1.03, accent border, radius 11, padding 6px 8px, deep shadow). The
     in-flow insertion slots render inside the zones/groups themselves — this
     layer only carries the moving widget + the target chip. */
  .aw-drag-widget-ghost {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2;
    transform-origin: top left;
    padding: 6px 8px;
    border: 1px solid var(--aw-accent);
    border-radius: 11px;
    background: var(--aw-bg-2);
    opacity: 0.5;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
    pointer-events: none;
  }
  .aw-drag-widget-ghost.invalid {
    border-color: var(--aw-danger);
  }
  /* Generic list-reorder ghost: the cloned row, lifted (half-opaque, slight
     scale, accent frame + shadow) and anchored at the grab offset. The clone
     carries its own (tokenised) styling; this wrapper only lifts it. */
  .aw-drag-list-ghost {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2;
    transform-origin: top left;
    border: 1px solid var(--aw-accent);
    border-radius: 10px;
    opacity: 0.85;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
    pointer-events: none;
  }
  .aw-drag-list-ghost.invalid {
    border-color: var(--aw-danger);
  }
  @keyframes awPreviewIn {
    from { opacity: 0; transform: scale(0.992); }
    to { opacity: 1; transform: scale(1); }
  }
</style>
