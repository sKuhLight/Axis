<script lang="ts">
  import DockNodeView from './DockNode.svelte';
  import { getWorkbenchContext } from './context';
  import type { DockRegionId } from '../core';

  let { region }: { region: DockRegionId } = $props();
  const { controller } = getWorkbenchContext();
  const layout = $derived($controller.activeLayout);
  const node = $derived(layout?.dock.root[region] ?? null);
  const state = $derived(layout?.dock.regions[region]);
  const empty = $derived(!node);
  const hidden = $derived(empty && !$controller.editMode && region !== 'main');
  const horizontalRegion = $derived(region === 'top' || region === 'bottom');

  const regionStyle = $derived.by(() => {
    if (region === 'main') return '';
    const px = state?.sizePx;
    if (!px || state?.collapsed) return '';
    return horizontalRegion ? `height:${px}px;` : `width:${px}px;`;
  });

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
      document.body.style.cursor = '';
    };
    document.body.style.cursor = horizontalRegion ? 'ns-resize' : 'ew-resize';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
</script>

{#if !hidden}
  <section
    class="aw-region aw-region-{region}"
    class:collapsed={state?.collapsed}
    class:empty
    data-region={region}
    style={regionStyle}
  >
    {#if state?.collapsed}
      <button class="aw-region-strip" type="button" onclick={toggleCollapse}>{region}</button>
    {:else if node}
      <DockNodeView {node} {region} />
      {#if region !== 'main'}
        <button class="aw-region-collapse" type="button" title="Collapse {region}" onclick={toggleCollapse}>−</button>
        <div class="aw-region-resize" role="separator" onpointerdown={resizeDown}></div>
      {/if}
    {:else}
      <div class="aw-region-empty">Drop panels in {region}</div>
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
    top: 6px;
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
</style>
