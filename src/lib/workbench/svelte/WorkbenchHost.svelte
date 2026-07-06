<script lang="ts">
  import WorkbenchProvider from './WorkbenchProvider.svelte';
  import DockWorkspace from './DockWorkspace.svelte';
  import WidgetZone from './WidgetZone.svelte';
  import NavigationHost from './NavigationHost.svelte';
  import EditRibbon from './EditRibbon.svelte';
  import DragLayer from './DragLayer.svelte';
  import type { WorkbenchController } from './controller.svelte';
  import type { WorkbenchRenderRegistry } from './renderRegistry';
  import { workbenchThemeStyle, type WorkbenchTheme } from './theme';
  import type { Snippet } from 'svelte';

  let {
    controller,
    registry,
    theme,
    ribbonExtras
  }: {
    controller: WorkbenchController;
    registry: WorkbenchRenderRegistry;
    theme?: WorkbenchTheme;
    ribbonExtras?: Snippet;
  } = $props();

  const layout = $derived($controller.activeLayout);
  const topZones = ['top.left', 'top.center', 'top.right'];
  const rootClass = $derived(theme?.className ? `aw-root ${theme.className}` : 'aw-root');
  const rootStyle = $derived(workbenchThemeStyle(theme));
  let navDrawerOpen = $state(false);

  // Viewport observation lives in the svelte layer: watch the shell width and let
  // the controller switch the active profile when the viewport class changes. The
  // resolver never mutates layout contents — it only picks a profile id, and the
  // controller dispatches `profile.activate` solely when the resolved id differs.
  let rootEl = $state<HTMLElement | null>(null);
  $effect(() => {
    const el = rootEl;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const resolve = () => controller.resolveProfileForWidth(el.clientWidth);
    resolve();
    const observer = new ResizeObserver(resolve);
    observer.observe(el);
    return () => observer.disconnect();
  });
</script>

<WorkbenchProvider {controller} {registry}>
  <div
    bind:this={rootEl}
    class={rootClass}
    class:aw-editing={$controller.editMode}
    class:aw-dragging-panel={$controller.drag?.kind === 'panel'}
    class:aw-dragging-widget={$controller.drag?.kind === 'widget'}
    style={rootStyle}
  >
    {#if navDrawerOpen}
      <button class="aw-mobile-nav-scrim" type="button" aria-label="Close navigation" onclick={() => (navDrawerOpen = false)}></button>
    {/if}

    {#if !navDrawerOpen}
      <button class="aw-mobile-menu" type="button" title="Menu" aria-label="Open navigation" onclick={() => (navDrawerOpen = true)}>
        <span></span><span></span><span></span>
      </button>
    {/if}

    <aside class="aw-rail" class:open={navDrawerOpen} data-zone-shell="rail">
      <div class="aw-mark" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
      <NavigationHost />
      <WidgetZone zone="rail" />
    </aside>

    <main class="aw-frame">
      <header class="aw-topbar">
        <!-- Design §8: tl+tc+tr fit jointly against the shared top-bar width (12px gap). -->
        <WidgetZone zone="top.left" fitGroup={topZones} fitGap={12} />
        <WidgetZone zone="top.center" fitGroup={topZones} fitGap={12} />
        <WidgetZone zone="top.right" fitGroup={topZones} fitGap={12} />
      </header>

      <DockWorkspace />

      <footer class="aw-bottombar">
        <WidgetZone zone="bottom" fitGap={10} />
      </footer>
    </main>

    {#if layout?.widgets}
      <WidgetZone zone="floating" floating />
    {/if}

    <EditRibbon extras={ribbonExtras} />
    <DragLayer />
  </div>
</WorkbenchProvider>

<style>
  :global(.aw-root) {
    --aw-bg: var(--bg, #0c0c0e);
    --aw-bg-2: var(--bg2, #0e0e10);
    --aw-surface: var(--surface, #141417);
    --aw-surface-2: var(--surface2, #1c1c21);
    --aw-border: var(--border, #26262c);
    --aw-border-2: var(--border2, #2a2a31);
    --aw-border-3: var(--border3, #3a3a44);
    --aw-text: var(--text, #e9e9ee);
    --aw-text-2: var(--text2, #cfcfd6);
    --aw-text-muted: var(--textdim, #9a9aa3);
    --aw-text-faint: var(--textfaint, #6e6e78);
    --aw-accent: var(--accent, #35c9d6);
    --aw-accent-ink: var(--accentink, #0a1416);
    --aw-amber: var(--amber, #f5a623);
    --aw-danger: var(--danger, #d6543f);
    --aw-font-ui: var(--font-ui, system-ui, sans-serif);
    --aw-font-mono: var(--font-mono, ui-monospace, monospace);
    --aw-widget-h: 38px;
  }

  .aw-root {
    position: fixed;
    inset: 0;
    display: flex;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--aw-bg);
    color: var(--aw-text);
    font-family: var(--aw-font-ui);
  }

  .aw-rail {
    width: var(--rail-w, 66px);
    flex: none;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 10px 8px 12px;
    background: var(--aw-bg-2);
    border-right: 1px solid var(--aw-border);
    box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.025);
  }

  .aw-mark {
    width: 46px;
    height: 42px;
    flex: none;
    align-self: center;
    position: relative;
    display: grid;
    place-items: center;
    border-bottom: 1px solid var(--aw-border);
    margin-bottom: 1px;
  }
  .aw-mark span {
    position: absolute;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--aw-accent);
  }
  .aw-mark span:nth-child(1) {
    transform: translate(-9px, -7px);
  }
  .aw-mark span:nth-child(2) {
    background: #4f6bed;
    transform: translate(9px, -7px);
  }
  .aw-mark span:nth-child(3) {
    background: var(--aw-amber);
    transform: translate(0, 10px);
  }

  .aw-frame {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  :global(.aw-root.aw-editing .aw-workspace) {
    padding-top: 52px;
  }

  .aw-topbar,
  .aw-bottombar {
    flex: none;
    min-width: 0;
    display: grid;
    align-items: center;
    gap: 10px;
    background: var(--aw-bg-2);
  }

  .aw-topbar {
    height: calc(58px + var(--aw-safe-top, 0px));
    padding: var(--aw-safe-top, 0px) 12px 0;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    border-bottom: 1px solid var(--aw-border);
    box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.025);
  }

  .aw-bottombar {
    min-height: calc(38px + var(--aw-safe-bottom, 0px));
    padding: 4px 12px var(--aw-safe-bottom, 0px);
    border-top: 1px solid var(--aw-border);
  }

  @media (max-width: 760px) {
    .aw-root {
      flex-direction: row;
    }
    .aw-rail {
      position: fixed;
      top: 0;
      left: 0;
      bottom: 0;
      z-index: 230;
      width: 80px;
      height: auto;
      flex-direction: column;
      border-right: 1px solid var(--aw-border);
      border-top: 0;
      padding: calc(14px + var(--aw-safe-top, 0px)) 8px calc(14px + var(--aw-safe-bottom, 0px));
      box-shadow: 10px 0 40px rgba(0, 0, 0, 0.55);
      transform: translateX(-96px);
      transition: transform 0.26s cubic-bezier(0.2, 0.8, 0.3, 1);
    }
    .aw-rail.open {
      transform: translateX(0);
    }
    .aw-mark {
      width: 48px;
      height: 38px;
      display: grid;
    }
    .aw-frame {
      flex: 1;
      order: 0;
    }
    :global(.aw-root.aw-editing .aw-workspace) {
      padding-top: 72px;
    }
    .aw-topbar {
      padding-left: 62px;
      grid-template-columns: minmax(0, 1fr) minmax(0, auto) minmax(0, 1fr);
    }
    .aw-mobile-menu {
      position: absolute;
      top: calc(11px + var(--aw-safe-top, 0px));
      left: 11px;
      z-index: 120;
      width: 42px;
      height: 42px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      border: 1px solid var(--aw-border-2);
      border-radius: 11px;
      background: var(--aw-bg-2);
      cursor: pointer;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
    }
    .aw-mobile-menu:hover {
      border-color: var(--aw-border-3);
    }
    .aw-mobile-menu span {
      width: 18px;
      height: 2px;
      border-radius: 2px;
      background: var(--aw-text-2);
    }
    .aw-mobile-nav-scrim {
      position: absolute;
      inset: 0;
      z-index: 225;
      border: 0;
      background: rgba(6, 6, 8, 0.52);
      backdrop-filter: blur(2px);
      animation: awFadeIn 0.16s ease;
    }
  }

  @media (min-width: 761px) {
    .aw-mobile-menu,
    .aw-mobile-nav-scrim {
      display: none;
    }
  }

  @keyframes awFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
