<script lang="ts">
  import DockRegion from './DockRegion.svelte';
  import { getWorkbenchContext } from './context';
  import { isPagesLayout, resolveLayoutContentMode } from './contentMode';
  import {
    WORKBENCH_PARAMETER_SOURCE_EDGE_DROP_ACTION,
    WORKBENCH_PARAMETER_SOURCE_MIME,
    type DockRegionId
  } from '../core';
  import { fullRegionHighlightRect, type WorkbenchRect } from './drag';

  const { controller, registry } = getWorkbenchContext();
  let edgeDropRegion = $state<DockRegionId | null>(null);
  // Full-region highlight rect for the current edge-drop target (T21 directive
  // #1): the whole region frame lights up, not a small labelled box.
  let edgeDropRect = $state<WorkbenchRect | null>(null);
  const layout = $derived($controller.activeLayout);
  // 01-shell §11: `settings.contentMode==="pages"` (stage/tablet/mobile presets)
  // shows one content section full-bleed instead of the fixed multi-region dock.
  // Repair-safe read (unknown => fixed). Edit mode reverts to fixed so every
  // region stays reachable for rearranging (see contentMode.ts).
  const pagesMode = $derived(isPagesLayout(resolveLayoutContentMode(layout), $controller.editMode));

  // A parameter drag ends in one of three ways the workspace's own drop handler
  // does NOT observe: it is dropped onto a panel (which stopPropagation()s the
  // drop so it can claim it), it is cancelled with Escape, or it is released over
  // a non-target. In every case `dragend` fires on the drag source and bubbles to
  // the window, so a window-level listener is the one reliable place to clear the
  // edge-drop overlay (T20 bug #2 — otherwise the "Dock left" preview stuck until
  // a reload). `drop` is a belt-and-braces clear for drops the workspace does see.
  $effect(() => {
    if (typeof window === 'undefined') return;
    const clear = () => { edgeDropRegion = null; edgeDropRect = null; };
    window.addEventListener('dragend', clear);
    window.addEventListener('drop', clear);
    return () => {
      window.removeEventListener('dragend', clear);
      window.removeEventListener('drop', clear);
    };
  });

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
    const region = regionFromPointer(event);
    edgeDropRegion = region;
    edgeDropRect = fullRegionHighlightRect(region);
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  function onParameterDragLeave(event: DragEvent) {
    if (event.currentTarget instanceof HTMLElement && event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    edgeDropRegion = null;
    edgeDropRect = null;
  }

  async function onParameterDrop(event: DragEvent) {
    if (!hasParameterSource(event) || !registry.hasAction(WORKBENCH_PARAMETER_SOURCE_EDGE_DROP_ACTION)) return;
    const source = event.dataTransfer?.getData(WORKBENCH_PARAMETER_SOURCE_MIME);
    if (!source) return;
    const region = edgeDropRegion ?? regionFromPointer(event);
    event.preventDefault();
    edgeDropRegion = null;
    edgeDropRect = null;
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
  class:aw-workspace-pages={pagesMode}
  aria-label="Workbench dock workspace"
  ondragover={onParameterDragOver}
  ondragleave={onParameterDragLeave}
  ondrop={onParameterDrop}
>
  <!-- Pages mode (01-shell §3/§11): the active section's content fills the page.
       The LEFT/RIGHT regions leave the inline flow so a section truly fills the
       width. TOP, MAIN and BOTTOM stay inline, so the main content (grid) plus
       the mobile control surfaces (block editor docked bottom, R9d phone flow)
       remain visible. Fixed mode (default) renders the full multi-region dock
       unchanged. Edit mode always resolves to fixed, so every region is
       rearrangeable. -->
  {#if !pagesMode}
    <DockRegion region="left" mobileInlineHidden />
  {/if}
  <div class="aw-workspace-center">
    <DockRegion region="top" mobileInlineHidden />
    <DockRegion region="main" />
    <DockRegion region="bottom" />
  </div>
  {#if !pagesMode}
    <DockRegion region="right" mobileInlineHidden />
  {/if}

  {#if edgeDropRegion && edgeDropRect}
    <!-- T21 directive #1: the ENTIRE target region frame lights up (full drop
         area), positioned from the measured region rect; the label is kept but
         anchored top-left so the highlight surface reads as the whole region. -->
    <div
      class="aw-edge-drop-preview {edgeDropRegion}"
      style="left:{edgeDropRect.left}px; top:{edgeDropRect.top}px; width:{edgeDropRect.width}px; height:{edgeDropRect.height}px;"
    >
      <span>{edgeDropRegion === 'main' ? 'New Custom Panel' : `Dock ${edgeDropRegion}`}</span>
    </div>
  {/if}
</section>

<style>
  /* R9d: LEFT and RIGHT regions run the FULL height of the workspace; TOP, MAIN
     and BOTTOM stack in the center column between them. So the workspace is a ROW
     (left | center | right) and the center is a COLUMN (top / main / bottom). */
  .aw-workspace {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: row;
    position: relative;
    overflow: hidden;
    background:
      linear-gradient(rgba(255, 255, 255, 0.015), transparent 120px),
      var(--aw-bg);
  }
  .aw-workspace-center {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  /* T21 directive #1: the highlight surface is the WHOLE target region. Geometry
     comes from an inline style (measured region rect / full-cross-axis band), so
     this rule only carries the look. `position: fixed` matches the DragLayer drop
     preview so the measured viewport rect maps 1:1 (default UI scale). The label
     is anchored top-left rather than centred so it reads as a region tag on the
     full frame, not a standalone box. */
  .aw-edge-drop-preview {
    position: fixed;
    z-index: 140;
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    box-sizing: border-box;
    pointer-events: none;
    border: 2px dashed color-mix(in srgb, var(--aw-accent) 68%, transparent);
    border-radius: 12px;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--aw-accent) 14%, transparent), transparent),
      color-mix(in srgb, var(--aw-accent) 8%, transparent);
    color: color-mix(in srgb, var(--aw-accent) 82%, white);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--aw-accent) 26%, transparent), 0 18px 55px rgba(0, 0, 0, 0.35);
    font: 800 10px/1 var(--aw-font-mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    animation: awEdgeDropIn 0.12s ease;
  }
  .aw-edge-drop-preview span {
    margin: 10px 0 0 12px;
    color: color-mix(in srgb, var(--aw-accent) 88%, white);
  }
  @keyframes awEdgeDropIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
