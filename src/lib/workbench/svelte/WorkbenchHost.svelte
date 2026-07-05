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

  let {
    controller,
    registry,
    theme
  }: {
    controller: WorkbenchController;
    registry: WorkbenchRenderRegistry;
    theme?: WorkbenchTheme;
  } = $props();

  const layout = $derived($controller.activeLayout);
  const rootClass = $derived(theme?.className ? `aw-root ${theme.className}` : 'aw-root');
  const rootStyle = $derived(workbenchThemeStyle(theme));
</script>

<WorkbenchProvider {controller} {registry}>
  <div class={rootClass} class:aw-editing={$controller.editMode} style={rootStyle}>
    <aside class="aw-rail" data-zone-shell="rail">
      <div class="aw-mark" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
      <NavigationHost />
      <WidgetZone zone="rail" />
    </aside>

    <main class="aw-frame">
      <header class="aw-topbar">
        <WidgetZone zone="top.left" />
        <WidgetZone zone="top.center" />
        <WidgetZone zone="top.right" />
      </header>

      <DockWorkspace />

      <footer class="aw-bottombar">
        <WidgetZone zone="bottom" />
      </footer>
    </main>

    {#if layout?.widgets}
      <WidgetZone zone="floating" floating />
    {/if}

    <EditRibbon />
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
      flex-direction: column;
    }
    .aw-rail {
      width: 100%;
      height: 58px;
      flex-direction: row;
      order: 2;
      border-right: 0;
      border-top: 1px solid var(--aw-border);
      padding: 6px 8px calc(6px + var(--aw-safe-bottom, 0px));
    }
    .aw-mark {
      display: none;
    }
    .aw-frame {
      order: 1;
    }
    :global(.aw-root.aw-editing .aw-workspace) {
      padding-top: 72px;
    }
    .aw-topbar {
      grid-template-columns: minmax(0, 1fr) minmax(0, auto) minmax(0, 1fr);
    }
  }
</style>
