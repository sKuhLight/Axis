<script lang="ts">
  import DockRegion from './DockRegion.svelte';
  import { getWorkbenchContext } from './context';
  import { focusTrap } from './focusTrap';
  import {
    WORKBENCH_PARAMETER_SOURCE_EDGE_DROP_ACTION,
    WORKBENCH_PARAMETER_SOURCE_MIME,
    type DockRegionId
  } from '../core';

  const { controller, registry } = getWorkbenchContext();
  let mobileDock = $state<DockRegionId | null>(null);
  let edgeDropRegion = $state<DockRegionId | null>(null);
  const layout = $derived($controller.activeLayout);

  function hasRegion(region: DockRegionId): boolean {
    return !!layout?.dock.root[region];
  }

  function toggleMobileDock(region: DockRegionId): void {
    mobileDock = mobileDock === region ? null : region;
  }

  function hasParameterSource(event: DragEvent): boolean {
    return Array.from(event.dataTransfer?.types ?? []).includes(WORKBENCH_PARAMETER_SOURCE_MIME);
  }

  function regionFromPointer(event: DragEvent): DockRegionId {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5;
    const y = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
    const edge = 0.18;
    if (x < edge) return 'left';
    if (x > 1 - edge) return 'right';
    if (y < edge) return 'top';
    if (y > 1 - edge) return 'bottom';
    return 'main';
  }

  function onParameterDragOver(event: DragEvent) {
    if (!hasParameterSource(event) || !registry.hasAction(WORKBENCH_PARAMETER_SOURCE_EDGE_DROP_ACTION)) return;
    event.preventDefault();
    edgeDropRegion = regionFromPointer(event);
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  function onParameterDragLeave(event: DragEvent) {
    if (event.currentTarget instanceof HTMLElement && event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    edgeDropRegion = null;
  }

  async function onParameterDrop(event: DragEvent) {
    if (!hasParameterSource(event) || !registry.hasAction(WORKBENCH_PARAMETER_SOURCE_EDGE_DROP_ACTION)) return;
    const source = event.dataTransfer?.getData(WORKBENCH_PARAMETER_SOURCE_MIME);
    if (!source) return;
    const region = edgeDropRegion ?? regionFromPointer(event);
    event.preventDefault();
    edgeDropRegion = null;
    await registry.runActionResult(WORKBENCH_PARAMETER_SOURCE_EDGE_DROP_ACTION, {
      controller,
      source: 'host',
      args: { source, region }
    });
  }
</script>

<section
  class="aw-workspace"
  class:parameter-edge-drop={!!edgeDropRegion}
  aria-label="Workbench dock workspace"
  ondragover={onParameterDragOver}
  ondragleave={onParameterDragLeave}
  ondrop={onParameterDrop}
>
  <DockRegion region="top" mobileInlineHidden />
  <div class="aw-workspace-mid">
    <DockRegion region="left" mobileInlineHidden />
    <DockRegion region="main" />
    <DockRegion region="right" mobileInlineHidden />
  </div>
  <DockRegion region="bottom" />

  {#if hasRegion('left') && mobileDock !== 'left'}
    <button class="aw-mobile-dock-indicator left" type="button" title="Open left dock" onclick={() => toggleMobileDock('left')}>◧ Left</button>
  {/if}
  {#if hasRegion('right') && mobileDock !== 'right'}
    <button class="aw-mobile-dock-indicator right" type="button" title="Open right dock" onclick={() => toggleMobileDock('right')}>Right ◨</button>
  {/if}
  {#if hasRegion('top') && mobileDock !== 'top'}
    <button class="aw-mobile-dock-indicator top" type="button" title="Open top dock" onclick={() => toggleMobileDock('top')}>▽ Top</button>
  {/if}

  {#if mobileDock}
    <button class="aw-mobile-dock-scrim" type="button" aria-label="Close dock drawer" onclick={() => (mobileDock = null)}></button>
    <div
      class="aw-mobile-dock-drawer {mobileDock}"
      role="dialog"
      aria-modal="true"
      aria-label={`${mobileDock} dock`}
      use:focusTrap={{ onClose: () => (mobileDock = null) }}
    >
      <DockRegion region={mobileDock} overlay />
    </div>
  {/if}

  {#if edgeDropRegion}
    <div class="aw-edge-drop-preview {edgeDropRegion}">
      <span>{edgeDropRegion === 'main' ? 'New Custom Panel' : `Dock ${edgeDropRegion}`}</span>
    </div>
  {/if}
</section>

<style>
  .aw-workspace {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
    background:
      linear-gradient(rgba(255, 255, 255, 0.015), transparent 120px),
      var(--aw-bg);
  }
  .aw-workspace-mid {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    overflow: hidden;
  }
  .aw-mobile-dock-indicator,
  .aw-mobile-dock-scrim,
  .aw-mobile-dock-drawer {
    display: none;
  }
  .aw-edge-drop-preview {
    position: absolute;
    z-index: 140;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    border: 1px solid color-mix(in srgb, var(--aw-accent) 68%, transparent);
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--aw-accent) 16%, transparent), transparent),
      color-mix(in srgb, var(--aw-bg-2) 74%, transparent);
    color: color-mix(in srgb, var(--aw-accent) 82%, white);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 18px 55px rgba(0, 0, 0, 0.35);
    font: 800 10px/1 var(--aw-font-mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .aw-edge-drop-preview.left {
    left: 8px;
    top: 8px;
    bottom: 8px;
    width: min(24%, 220px);
    border-radius: 12px 6px 6px 12px;
  }
  .aw-edge-drop-preview.right {
    right: 8px;
    top: 8px;
    bottom: 8px;
    width: min(24%, 220px);
    border-radius: 6px 12px 12px 6px;
  }
  .aw-edge-drop-preview.top {
    left: 8px;
    right: 8px;
    top: 8px;
    height: min(22%, 150px);
    border-radius: 12px 12px 6px 6px;
  }
  .aw-edge-drop-preview.bottom {
    left: 8px;
    right: 8px;
    bottom: 8px;
    height: min(22%, 150px);
    border-radius: 6px 6px 12px 12px;
  }
  .aw-edge-drop-preview.main {
    inset: 18%;
    border-radius: 14px;
  }
  @media (max-width: 760px) {
    .aw-mobile-dock-indicator {
      position: absolute;
      z-index: 170;
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 1px solid color-mix(in srgb, var(--aw-accent) 42%, var(--aw-border));
      background: var(--aw-bg-2);
      color: color-mix(in srgb, var(--aw-accent) 78%, white);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
      cursor: pointer;
      font: 800 10px/1 var(--aw-font-mono);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .aw-mobile-dock-indicator:hover {
      border-color: var(--aw-accent);
    }
    /* T18: keyboard focus ring for the dock drawer openers (focus-visible only). */
    .aw-mobile-dock-indicator:focus-visible {
      outline: 2px solid var(--aw-accent);
      outline-offset: 2px;
    }
    .aw-mobile-dock-indicator.left {
      left: 10px;
      bottom: 64px;
      height: 40px;
      padding: 0 13px;
      border-radius: 11px;
    }
    .aw-mobile-dock-indicator.right {
      right: 10px;
      bottom: 64px;
      height: 40px;
      padding: 0 13px;
      border-radius: 11px;
    }
    .aw-mobile-dock-indicator.top {
      top: 8px;
      left: 50%;
      height: 26px;
      padding: 0 16px;
      border-radius: 0 0 12px 12px;
      transform: translateX(-50%);
    }
    .aw-mobile-dock-scrim {
      position: absolute;
      inset: 0;
      z-index: 150;
      display: block;
      border: 0;
      background: rgba(6, 6, 8, 0.5);
      backdrop-filter: blur(2px);
      animation: awDockFadeIn 0.16s ease;
    }
    .aw-mobile-dock-drawer {
      position: absolute;
      z-index: 180;
      display: flex;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background: var(--aw-bg-2);
      box-shadow: 0 0 46px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    }
    .aw-mobile-dock-drawer.left {
      left: 0;
      top: 0;
      bottom: 0;
      width: min(88vw, 320px);
      animation: awDockSlideLeft 0.24s cubic-bezier(0.2, 0.8, 0.3, 1);
    }
    .aw-mobile-dock-drawer.right {
      top: 0;
      right: 0;
      bottom: 0;
      width: min(88vw, 340px);
      animation: awDockSlideRight 0.24s cubic-bezier(0.2, 0.8, 0.3, 1);
    }
    .aw-mobile-dock-drawer.top {
      left: 0;
      top: 0;
      right: 0;
      height: min(72%, 260px);
      animation: awDockSlideTop 0.24s cubic-bezier(0.2, 0.8, 0.3, 1);
    }
  }
  @keyframes awDockFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes awDockSlideLeft {
    from { transform: translateX(calc(-100% - 60px)); }
    to { transform: translateX(0); }
  }
  @keyframes awDockSlideRight {
    from { transform: translateX(calc(100% + 60px)); }
    to { transform: translateX(0); }
  }
  @keyframes awDockSlideTop {
    from { transform: translateY(calc(-100% - 60px)); }
    to { transform: translateY(0); }
  }
</style>
