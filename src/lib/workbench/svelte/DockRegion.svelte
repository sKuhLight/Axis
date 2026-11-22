<script lang="ts">
  import DockNodeView from './DockNode.svelte';
  import { getWorkbenchContext } from './context';
  import { collapsedNodeExtent, isDockNodeCollapsed, stackCollapsedIn } from './dockLayout';
  import type { DockRegionId } from '../core';

  let {
    region,
    mobileInlineHidden = false,
    overlay = false
  }: {
    region: DockRegionId;
    mobileInlineHidden?: boolean;
    overlay?: boolean;
  } = $props();
  const { controller } = getWorkbenchContext();
  // Pages: the dock rendered here is the ACTIVE page's — switching pages swaps
  // the whole region tree. During a panel drag it is the LIFTED page (the
  // dragged panel taken out), so its slot collapses and the rest fills in.
  const page = $derived($controller.renderedPage);
  const node = $derived(page?.dock.root[region] ?? null);
  const state = $derived(page?.dock.regions[region]);
  const empty = $derived(!node);
  const hidden = $derived(empty && !$controller.editMode && region !== 'main');
  const horizontalRegion = $derived(region === 'top' || region === 'bottom');
  const sideRegion = $derived(region === 'left' || region === 'right');
  // Edit mode: an empty side region is a slim labelled strip (a drop target),
  // not a full-size block; main keeps its placeholder.
  const emptyStrip = $derived(empty && region !== 'main' && !overlay);
  // Every stack in the region is a collapsed strip: a side region shrinks to
  // the strips (its neighbours take the space); main pins them to its top edge.
  const collapsedExtent = $derived.by(() => {
    if (!node || overlay) return null;
    const isCollapsed = stackCollapsedIn($controller.activeLayout?.panels ?? {});
    if (!isDockNodeCollapsed(node, isCollapsed)) return null;
    return collapsedNodeExtent(node, sideRegion ? 'horizontal' : 'vertical', isCollapsed);
  });

  const regionStyle = $derived.by(() => {
    if (overlay) return '';
    if (region === 'main') return '';
    if (emptyStrip) return '';
    if (collapsedExtent != null && !state?.collapsed) return horizontalRegion ? `height:${collapsedExtent}px;` : `width:${collapsedExtent}px;`;
    const px = state?.sizePx;
    if (!px || state?.collapsed) return '';
    return horizontalRegion ? `height:${px}px;` : `width:${px}px;`;
  });
  const bodyStyle = $derived(region === 'main' && collapsedExtent != null ? `bottom:auto; height:${collapsedExtent}px;` : '');

  function toggleCollapse() {
    controller.dispatch({ type: 'region.collapse', region, collapsed: !state?.collapsed });
  }

  function resizeDown(e: PointerEvent) {
    if (region === 'main') return;
    e.preventDefault();
    const start = horizontalRegion ? e.clientY : e.clientX;
    const current = state?.sizePx ?? (horizontalRegion ? 260 : 320);
    const sign = region === 'right' || region === 'bottom' ? -1 : 1;
    const onMove = (ev: PointerEvent) => {
      const delta = (horizontalRegion ? ev.clientY : ev.clientX) - start;
      controller.dispatch({ type: 'region.resize', region, sizePx: Math.max(120, current + delta * sign) });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = horizontalRegion ? 'ns-resize' : 'ew-resize';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    // pointercancel fires no pointerup — without it the resize stays "live" and the cursor stuck.
    // Nothing is committed on release (every move already resized), so cancelling is the same teardown.
    window.addEventListener('pointercancel', onUp);
  }
</script>

{#if !hidden}
  <section
    class="aw-region aw-region-{region}"
    class:collapsed={state?.collapsed}
    class:empty
    class:empty-strip={emptyStrip}
    class:all-collapsed={collapsedExtent != null}
    class:mobile-inline-hidden={mobileInlineHidden}
    class:overlay
    data-region={region}
    style={regionStyle}
  >
    {#if state?.collapsed}
      <button class="aw-region-strip" type="button" onclick={toggleCollapse}>{region}</button>
    {:else if node}
      <div class="aw-region-body" style={bodyStyle}>
        <DockNodeView {node} {region} stripVertical={sideRegion} {overlay} />
      </div>
      {#if region !== 'main' && !overlay && collapsedExtent == null}
        <button class="aw-region-collapse" type="button" title="Collapse {region}" onclick={toggleCollapse}>−</button>
        <div class="aw-region-resize" role="separator" onpointerdown={resizeDown}></div>
      {/if}
    {:else if emptyStrip}
      <div class="aw-region-empty-strip" class:vertical={sideRegion} data-empty-region={region}>
        <span>{region}</span>
      </div>
    {:else}
      <div class="aw-region-empty" data-empty-region={region}>Drop panels in {region}</div>
    {/if}
  </section>
{/if}

<style>
  .aw-region {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--aw-bg);
  }
  .aw-region.overlay {
    width: 100%;
    height: 100%;
    flex: 1;
    background: var(--aw-bg-2);
  }
  .aw-region-main {
    flex: 1;
  }
  .aw-region-left,
  .aw-region-right {
    width: 320px;
    flex: none;
    border-color: var(--aw-border);
    background: var(--aw-bg-2);
  }
  .aw-region-left {
    border-right: 1px solid color-mix(in srgb, var(--aw-border) 64%, transparent);
  }
  .aw-region-right {
    border-left: 1px solid color-mix(in srgb, var(--aw-border) 64%, transparent);
  }
  .aw-region-top,
  .aw-region-bottom {
    height: 240px;
    flex: none;
    border-color: var(--aw-border);
    background: var(--aw-bg-2);
  }
  .aw-region-top {
    border-bottom: 1px solid color-mix(in srgb, var(--aw-border) 64%, transparent);
  }
  .aw-region-bottom {
    border-top: 1px solid color-mix(in srgb, var(--aw-border) 64%, transparent);
  }
  .aw-region.collapsed {
    width: 32px;
    height: 32px;
    flex: none;
  }
  .aw-region-strip,
  .aw-region-collapse {
    border: 1px solid var(--aw-border);
    background: var(--aw-surface);
    color: var(--aw-text-muted);
    cursor: pointer;
  }
  .aw-region-strip {
    position: absolute;
    inset: 0;
    border-radius: 8px;
    font: 700 9px/1 var(--aw-font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .aw-region-collapse {
    position: absolute;
    bottom: 6px;
    right: 6px;
    z-index: 5;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    opacity: 0;
    transition: opacity 0.12s ease;
  }
  .aw-region:hover .aw-region-collapse,
  .aw-root.aw-editing .aw-region-collapse {
    opacity: 1;
  }
  .aw-region-resize {
    position: absolute;
    z-index: 4;
  }
  .aw-region-left .aw-region-resize,
  .aw-region-right .aw-region-resize {
    top: 0;
    bottom: 0;
    width: 10px;
    cursor: ew-resize;
  }
  .aw-region-left .aw-region-resize {
    right: -4px;
  }
  .aw-region-right .aw-region-resize {
    left: -4px;
  }
  .aw-region-top .aw-region-resize,
  .aw-region-bottom .aw-region-resize {
    left: 0;
    right: 0;
    height: 10px;
    cursor: ns-resize;
  }
  .aw-region-top .aw-region-resize {
    bottom: -4px;
  }
  .aw-region-bottom .aw-region-resize {
    top: -4px;
  }
  /* Region body: fills the region (the dock tree lays out inside it). A fully
     collapsed main pins it to the top edge at the strips' height. */
  .aw-region-body {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
  }
  /* Edit mode: an empty side region is a slim labelled strip, not a 320/240px
     block — still a drop target (dock to that edge). */
  .aw-region.empty-strip.aw-region-left,
  .aw-region.empty-strip.aw-region-right {
    width: 44px;
  }
  .aw-region.empty-strip.aw-region-top,
  .aw-region.empty-strip.aw-region-bottom {
    height: 48px;
  }
  .aw-region-empty-strip {
    position: absolute;
    inset: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px dashed color-mix(in srgb, var(--aw-accent) 32%, var(--aw-border-2));
    border-radius: 9px;
    color: var(--aw-text-faint);
    font: 600 10px/1 var(--aw-font-mono);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .aw-region-empty-strip.vertical span {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
  }
  .aw-region-empty {
    position: absolute;
    inset: 8px;
    display: grid;
    place-items: center;
    border: 1px dashed var(--aw-border-2);
    border-radius: 10px;
    color: var(--aw-text-faint);
    background: color-mix(in srgb, var(--aw-surface) 34%, transparent);
    font: 700 9px/1 var(--aw-font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  /* Panel drags: the dock-drop overlay (zones, edge bars, landing shape) is the
     only target chrome; empty placeholders just brighten so they read as targets. */
  :global(.aw-root.aw-dragging-panel) .aw-region-empty-strip,
  :global(.aw-root.aw-dragging-panel) .aw-region-empty {
    border-color: color-mix(in srgb, var(--aw-accent) 55%, transparent);
    color: color-mix(in srgb, var(--aw-accent) 70%, var(--aw-text-muted));
  }
  @media (max-width: 760px) {
    .aw-region.mobile-inline-hidden {
      display: none;
    }
    .aw-region-bottom {
      max-height: 90%;
    }
    .aw-region-main {
      min-height: 90px;
    }
  }
</style>
