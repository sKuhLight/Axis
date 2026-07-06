<script lang="ts">
  import DockRegion from './DockRegion.svelte';
  import { getWorkbenchContext } from './context';
  import { focusTrap } from './focusTrap';
  import { bottomSheetSwipe } from './bottomSheet';
  import { sideSwipe } from './sideSwipe';
  import { isPagesLayout, resolveLayoutContentMode } from './contentMode';
  import {
    WORKBENCH_PARAMETER_SOURCE_EDGE_DROP_ACTION,
    WORKBENCH_PARAMETER_SOURCE_MIME,
    type DockRegionId
  } from '../core';

  const { controller, registry } = getWorkbenchContext();
  let mobileDock = $state<DockRegionId | null>(null);
  let edgeDropRegion = $state<DockRegionId | null>(null);
  const layout = $derived($controller.activeLayout);
  // 01-shell §11: `settings.contentMode==="pages"` (stage/tablet/mobile presets)
  // shows one content section full-bleed instead of the fixed multi-region dock.
  // Repair-safe read (unknown => fixed). Edit mode reverts to fixed so every
  // region stays reachable for rearranging (see contentMode.ts).
  const pagesMode = $derived(isPagesLayout(resolveLayoutContentMode(layout), $controller.editMode));

  // T23: phone flag (matches the 760px CSS breakpoint) — gates bottom-sheet
  // swipe-to-close on the dock drawers. matchMedia keeps it observer-free.
  let isPhone = $state(false);
  $effect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 760px)');
    const sync = () => (isPhone = mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  });

  function hasRegion(region: DockRegionId): boolean {
    return !!layout?.dock.root[region];
  }

  // R9c: LEFT/RIGHT dock drawers present as side overlays (partial-width panels
  // sliding in from their edge); TOP/BOTTOM keep the bottom-sheet presentation.
  const sideDrawer = $derived(mobileDock === 'left' || mobileDock === 'right');

  function toggleMobileDock(region: DockRegionId): void {
    mobileDock = mobileDock === region ? null : region;
  }

  // In pages mode the LEFT/RIGHT regions aren't inline (they're reachable via the
  // openers), so a top-drawer isn't part of that model; keep any stale top drawer
  // from surviving a mode switch. Left/right drawers still work in pages mode.
  $effect(() => {
    if (pagesMode && mobileDock === 'top') mobileDock = null;
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
  class:aw-workspace-pages={pagesMode}
  aria-label="Workbench dock workspace"
  ondragover={onParameterDragOver}
  ondragleave={onParameterDragLeave}
  ondrop={onParameterDrop}
>
  <!-- Pages mode (01-shell §3/§11): the active section's content fills the page.
       The LEFT/RIGHT regions stop being inline columns (so a section truly fills
       the width) and become edge openers — matching the design's mobile rule
       "left/right become overlay drawers … Bottom stays inline" (§11). TOP,
       MAIN and BOTTOM stay inline, so the main content (grid) plus the mobile
       control surfaces (block editor docked bottom, R9d phone flow) remain
       visible. Fixed mode (default) renders the full multi-region dock unchanged.
       Edit mode always resolves to fixed, so every region is rearrangeable. -->
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

  {#if hasRegion('left') && mobileDock !== 'left'}
    <button class="aw-mobile-dock-indicator left" class:pages-opener={pagesMode} type="button" title="Open left dock" onclick={() => toggleMobileDock('left')}>◧ Left</button>
  {/if}
  {#if hasRegion('right') && mobileDock !== 'right'}
    <button class="aw-mobile-dock-indicator right" class:pages-opener={pagesMode} type="button" title="Open right dock" onclick={() => toggleMobileDock('right')}>Right ◨</button>
  {/if}
  {#if !pagesMode && hasRegion('top') && mobileDock !== 'top'}
    <button class="aw-mobile-dock-indicator top" type="button" title="Open top dock" onclick={() => toggleMobileDock('top')}>▽ Top</button>
  {/if}

  {#if mobileDock}
    <button class="aw-mobile-dock-scrim" class:pages-active={pagesMode} type="button" aria-label="Close dock drawer" onclick={() => (mobileDock = null)}></button>
    {#if sideDrawer}
      <!-- R9c: LEFT/RIGHT present as partial-width side overlays that slide in
           from their edge and close on a horizontal swipe toward that edge. -->
      <div
        class="aw-mobile-dock-drawer side {mobileDock}"
        class:pages-active={pagesMode}
        role="dialog"
        aria-modal="true"
        aria-label={`${mobileDock} dock`}
        use:focusTrap={{ onClose: () => (mobileDock = null) }}
        use:sideSwipe={{
          side: mobileDock === 'left' ? 'left' : 'right',
          enabled: isPhone,
          onClose: () => (mobileDock = null)
        }}
      >
        <DockRegion region={mobileDock} overlay />
      </div>
    {:else}
      <!-- TOP/BOTTOM keep the T23 bottom-sheet presentation (grab bar, slide up,
           vertical swipe-to-close). -->
      <div
        class="aw-mobile-dock-drawer sheet {mobileDock}"
        role="dialog"
        aria-modal="true"
        aria-label={`${mobileDock} dock`}
        use:focusTrap={{ onClose: () => (mobileDock = null) }}
        use:bottomSheetSwipe={{ enabled: isPhone, onClose: () => (mobileDock = null) }}
      >
        <div class="aw-dock-sheet-grip" aria-hidden="true"></div>
        <DockRegion region={mobileDock} overlay />
      </div>
    {/if}
  {/if}

  {#if edgeDropRegion}
    <div class="aw-edge-drop-preview {edgeDropRegion}">
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
  .aw-mobile-dock-indicator,
  .aw-mobile-dock-scrim,
  .aw-mobile-dock-drawer {
    display: none;
  }
  .aw-dock-sheet-grip {
    display: none;
  }

  /* Pages mode (01-shell §3/§11): the LEFT/RIGHT regions leave the inline flow
     and become edge openers + a partial-width side overlay, at ANY viewport width
     (the stage preset is pages mode on desktop). These rules mirror the phone
     drawer presentation but are gated on the `.pages-*` classes instead of the
     760px media query so they apply on desktop/tablet too. The phone media query
     below still governs the fixed-mode mobile drawers. */
  .aw-mobile-dock-indicator.pages-opener {
    position: absolute;
    z-index: 170;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 40px;
    padding: 0 13px;
    border-radius: 11px;
    border: 1px solid color-mix(in srgb, var(--aw-accent) 42%, var(--aw-border));
    background: var(--aw-bg-2);
    color: color-mix(in srgb, var(--aw-accent) 78%, white);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
    cursor: pointer;
    font: 800 10px/1 var(--aw-font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .aw-mobile-dock-indicator.pages-opener:hover {
    border-color: var(--aw-accent);
  }
  .aw-mobile-dock-indicator.pages-opener:focus-visible {
    outline: 2px solid var(--aw-accent);
    outline-offset: 2px;
  }
  .aw-mobile-dock-indicator.pages-opener.left {
    left: calc(10px + var(--aw-safe-left, 0px));
    bottom: calc(64px + var(--aw-safe-bottom, 0px));
  }
  .aw-mobile-dock-indicator.pages-opener.right {
    right: calc(10px + var(--aw-safe-right, 0px));
    bottom: calc(64px + var(--aw-safe-bottom, 0px));
  }
  .aw-mobile-dock-scrim.pages-active {
    position: absolute;
    inset: 0;
    z-index: 150;
    display: block;
    border: 0;
    background: rgba(6, 6, 8, 0.5);
    backdrop-filter: blur(2px);
    animation: awDockFadeIn 0.16s ease;
  }
  .aw-mobile-dock-drawer.pages-active {
    position: absolute;
    z-index: 180;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--aw-bg-2);
    top: var(--aw-safe-top, 0px);
    bottom: 0;
    width: min(85%, 360px);
    padding-bottom: var(--aw-safe-bottom, 0px);
  }
  .aw-mobile-dock-drawer.pages-active.side.right {
    right: var(--aw-safe-right, 0px);
    left: auto;
    border-radius: 16px 0 0 16px;
    box-shadow: -14px 0 46px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    animation: awDockSideRight 0.24s cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  .aw-mobile-dock-drawer.pages-active.side.left {
    left: var(--aw-safe-left, 0px);
    right: auto;
    border-radius: 0 16px 16px 0;
    box-shadow: 14px 0 46px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    animation: awDockSideLeft 0.24s cubic-bezier(0.2, 0.8, 0.3, 1);
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
    /* Dock openers sit above the home-indicator inset; left/right also clear
       landscape safe-area edges (T21). */
    .aw-mobile-dock-indicator.left {
      left: calc(10px + var(--aw-safe-left, 0px));
      bottom: calc(64px + var(--aw-safe-bottom, 0px));
      height: 40px;
      padding: 0 13px;
      border-radius: 11px;
    }
    .aw-mobile-dock-indicator.right {
      right: calc(10px + var(--aw-safe-right, 0px));
      bottom: calc(64px + var(--aw-safe-bottom, 0px));
      height: 40px;
      padding: 0 13px;
      border-radius: 11px;
    }
    .aw-mobile-dock-indicator.top {
      top: calc(8px + var(--aw-safe-top, 0px));
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
    /* Shared drawer host defaults. TOP/BOTTOM present as bottom sheets; LEFT/
       RIGHT present as side overlays (see the .side rules below). The slide uses
       a keyframe `animation` (not a `transition`) so the geometry guard stays
       satisfied; swipe-to-close drives transform via JS. Safe-area insets keep
       the surface clear of the notch/home-indicator/landscape edges. */
    .aw-mobile-dock-drawer {
      position: absolute;
      z-index: 180;
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      background: var(--aw-bg-2);
    }
    /* R9c: TOP/BOTTOM bottom sheet — full width, pinned to the bottom edge,
       rounded top, grab bar, slide up. */
    .aw-mobile-dock-drawer.sheet {
      left: var(--aw-safe-left, 0px);
      right: var(--aw-safe-right, 0px);
      bottom: 0;
      top: auto;
      width: auto;
      max-height: min(90%, calc(100% - 40px - var(--aw-safe-top, 0px)));
      border-radius: 18px 18px 0 0;
      padding-bottom: var(--aw-safe-bottom, 0px);
      box-shadow: 0 -14px 46px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
      animation: awDockSheetUp 0.24s cubic-bezier(0.2, 0.8, 0.3, 1);
    }
    /* R9c: LEFT/RIGHT side overlay — partial-width panel under the top bar, full
       remaining height, anchored to its edge. Slides in horizontally; horizontal
       swipe toward the edge closes it. */
    .aw-mobile-dock-drawer.side {
      top: var(--aw-safe-top, 0px);
      bottom: 0;
      width: min(85%, 360px);
      padding-bottom: var(--aw-safe-bottom, 0px);
    }
    .aw-mobile-dock-drawer.side.right {
      right: var(--aw-safe-right, 0px);
      left: auto;
      border-radius: 16px 0 0 16px;
      box-shadow: -14px 0 46px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
      animation: awDockSideRight 0.24s cubic-bezier(0.2, 0.8, 0.3, 1);
    }
    .aw-mobile-dock-drawer.side.left {
      left: var(--aw-safe-left, 0px);
      right: auto;
      border-radius: 0 16px 16px 0;
      box-shadow: 14px 0 46px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
      animation: awDockSideLeft 0.24s cubic-bezier(0.2, 0.8, 0.3, 1);
    }
    .aw-dock-sheet-grip {
      flex: none;
      align-self: center;
      width: 40px;
      height: 4px;
      margin: 8px 0 6px;
      border-radius: 3px;
      display: block;
      background: var(--aw-border-3);
    }
  }
  @keyframes awDockFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes awDockSheetUp {
    from { transform: translateY(calc(100% + 24px)); }
    to { transform: translateY(0); }
  }
  @keyframes awDockSideRight {
    from { transform: translateX(calc(100% + 24px)); }
    to { transform: translateX(0); }
  }
  @keyframes awDockSideLeft {
    from { transform: translateX(calc(-100% - 24px)); }
    to { transform: translateX(0); }
  }
</style>
