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
  import { focusTrap } from './focusTrap';
  import { bottomSheetSwipe } from './bottomSheet';
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
  // Design 01-shell §9: `navMode:"bottom"` moves the nav out of the left rail and
  // into the bottom bar (horizontal row of icon+label items), divided from the
  // bottom-zone widgets. `side` (default) keeps it in the vertical left rail.
  const navMode = $derived(layout?.navigation.mode ?? 'side');
  const topZones = ['top.left', 'top.center', 'top.right'];
  const rootClass = $derived(theme?.className ? `aw-root ${theme.className}` : 'aw-root');
  const rootStyle = $derived(workbenchThemeStyle(theme));
  let navDrawerOpen = $state(false);
  // The <760px hamburger drawer is a `side`-mode affordance only. In bottom mode
  // the nav is always reachable in the bottom bar, so the drawer/scrim/menu are
  // suppressed (matches design §9 `railOverlay = … && navMode!=="bottom"`).
  const showMobileDrawer = $derived(navMode !== 'bottom');
  $effect(() => {
    // Keep the drawer from getting stuck open if the mode flips to bottom.
    if (navMode === 'bottom' && navDrawerOpen) navDrawerOpen = false;
  });

  // Viewport observation lives in the svelte layer: watch the shell width and let
  // the controller switch the active profile when the viewport class changes. The
  // resolver never mutates layout contents — it only picks a profile id, and the
  // controller dispatches `profile.activate` solely when the resolved id differs.
  let rootEl = $state<HTMLElement | null>(null);
  // T23: phone-width flag (matches the 760px CSS breakpoint) gates bottom-sheet
  // swipe-to-close so the gesture is inert on tablet/desktop.
  let isPhone = $state(false);
  $effect(() => {
    const el = rootEl;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const resolve = () => {
      controller.resolveProfileForWidth(el.clientWidth);
      isPhone = el.clientWidth <= 760;
    };
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
    class:aw-nav-bottom={navMode === 'bottom'}
    style={rootStyle}
  >
    {#if showMobileDrawer && navDrawerOpen}
      <button class="aw-mobile-nav-scrim" type="button" aria-label="Close navigation" onclick={() => (navDrawerOpen = false)}></button>
    {/if}

    {#if showMobileDrawer && !navDrawerOpen}
      <button class="aw-mobile-menu" type="button" title="Menu" aria-label="Open navigation" onclick={() => (navDrawerOpen = true)}>
        <span></span><span></span><span></span>
      </button>
    {/if}

    <aside
      class="aw-rail"
      class:open={navDrawerOpen}
      class:aw-sheet={isPhone && navDrawerOpen}
      data-zone-shell="rail"
      use:focusTrap={{ enabled: showMobileDrawer && navDrawerOpen, onClose: () => (navDrawerOpen = false) }}
      use:bottomSheetSwipe={{ enabled: isPhone, open: navDrawerOpen, onClose: () => (navDrawerOpen = false) }}
    >
      <!-- T23: grab bar for the phone bottom-sheet presentation (CSS hides it
           outside phone width). Swipe it (or the sheet) down to close. -->
      <div class="aw-sheet-grip" aria-hidden="true"></div>
      <div class="aw-mark" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
      {#if navMode !== 'bottom'}
        <NavigationHost />
      {/if}
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
        {#if navMode === 'bottom'}
          <!-- Bottom-nav mode: nav row sits to the left of the bottom-zone widgets,
               divided by a 1px separator (design §9). -->
          <div class="aw-bottom-nav" data-zone-shell="bottom-nav">
            <NavigationHost />
          </div>
        {/if}
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
    --aw-accent-indigo: var(--accent-indigo, #4f6bed);
    --aw-amber: var(--amber, #f5a623);
    --aw-danger: var(--danger, #d6543f);
    --aw-font-ui: var(--font-ui, system-ui, sans-serif);
    --aw-font-mono: var(--font-mono, ui-monospace, monospace);
    /* T21: neutral safe-area inset fallbacks. The Axis theme maps these to the
       real env(safe-area-inset-*) via axisWorkbenchTheme; 0px here keeps the
       generic shell correct with no host. */
    --aw-safe-top: 0px;
    --aw-safe-right: 0px;
    --aw-safe-bottom: 0px;
    --aw-safe-left: 0px;
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

  /* T18: keyboard focus ring for the shell's own chrome (hamburger + scrims).
     focus-visible only, so pointer interaction shows no outline. Tokenized. */
  .aw-mobile-menu:focus-visible,
  .aw-mobile-nav-scrim:focus-visible {
    outline: 2px solid var(--aw-accent);
    outline-offset: 2px;
  }

  .aw-rail {
    /* T21: the docked rail sits on the screen's left edge — pad by the left
       safe-area inset (landscape notch) and top/bottom insets. */
    width: calc(var(--rail-w, 66px) + var(--aw-safe-left, 0px));
    flex: none;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: calc(10px + var(--aw-safe-top, 0px)) 8px calc(12px + var(--aw-safe-bottom, 0px)) calc(8px + var(--aw-safe-left, 0px));
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
    background: var(--aw-accent-indigo);
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
    /* T21: the top bar's right edge is the screen's right edge (the rail owns
       the left inset); respect the top + right insets. */
    height: calc(58px + var(--aw-safe-top, 0px));
    padding: var(--aw-safe-top, 0px) calc(12px + var(--aw-safe-right, 0px)) 0 12px;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    border-bottom: 1px solid var(--aw-border);
    box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.025);
  }

  /* Pin each top zone to its own grid column so alignment stays stable no
     matter which zones are present. Without this, an omitted zone (empty +
     not editing) lets the remaining zones auto-flow into the wrong cells —
     e.g. an empty center collapses and top.right slides into the middle
     `auto` column instead of the right `1fr` column. */
  .aw-topbar > :global([data-zone='top.left']) {
    grid-column: 1;
  }
  .aw-topbar > :global([data-zone='top.center']) {
    grid-column: 2;
  }
  .aw-topbar > :global([data-zone='top.right']) {
    grid-column: 3;
  }

  .aw-bottombar {
    /* T21: bottom bar hugs the home-indicator (bottom inset) and screen right
       edge (right inset); left inset belongs to the rail. */
    min-height: calc(38px + var(--aw-safe-bottom, 0px));
    padding: 4px calc(12px + var(--aw-safe-right, 0px)) var(--aw-safe-bottom, 0px) 12px;
    border-top: 1px solid var(--aw-border);
  }

  /* Bottom-nav mode (design §9): the bottom bar becomes a flex row — the nav
     block on the left, a 1px divider, then the bottom-zone widgets. The nav
     itself lays its entries out horizontally (52×44, radius 10) via the
     `[data-nav-mode='bottom']` rules inside NavigationHost. */
  .aw-root.aw-nav-bottom .aw-bottombar {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
    min-height: calc(52px + var(--aw-safe-bottom, 0px));
  }
  .aw-bottom-nav {
    flex: none;
    display: flex;
    align-items: center;
    padding-right: 12px;
    border-right: 1px solid var(--aw-border);
  }
  .aw-root.aw-nav-bottom .aw-bottombar > :global([data-zone='bottom']) {
    flex: 1;
    min-width: 0;
  }

  @media (max-width: 760px) {
    .aw-root {
      flex-direction: row;
    }
    /* T23: on phone the nav drawer is a bottom sheet — full width, pinned to the
       bottom edge, rounded top, slides up from below. Safe-area insets keep it
       clear of the notch/home-indicator and landscape edges. Transform-only
       transition (geometry-safe) drives the slide; swipe-to-close is layered by
       the bottomSheetSwipe action (JS transform, no CSS transition). */
    .aw-rail {
      position: fixed;
      left: var(--aw-safe-left, 0px);
      right: var(--aw-safe-right, 0px);
      bottom: 0;
      top: auto;
      z-index: 230;
      width: auto;
      max-height: 82vh;
      height: auto;
      flex-direction: column;
      border: 0;
      border-top: 1px solid var(--aw-border);
      border-radius: 18px 18px 0 0;
      padding: 6px 12px calc(16px + var(--aw-safe-bottom, 0px));
      box-shadow: 0 -14px 44px rgba(0, 0, 0, 0.55);
      overflow-y: auto;
      transform: translateY(calc(100% + 24px));
      transition: transform 0.26s cubic-bezier(0.2, 0.8, 0.3, 1);
    }
    .aw-rail.open {
      transform: translateY(0);
    }
    .aw-sheet-grip {
      flex: none;
      align-self: center;
      width: 40px;
      height: 4px;
      margin: 2px 0 8px;
      border-radius: 3px;
      background: var(--aw-border-3);
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
      /* Leave room for the hamburger (offset by the left inset). */
      padding-left: calc(62px + var(--aw-safe-left, 0px));
      grid-template-columns: minmax(0, 1fr) minmax(0, auto) minmax(0, 1fr);
    }
    .aw-mobile-menu {
      position: absolute;
      top: calc(11px + var(--aw-safe-top, 0px));
      left: calc(11px + var(--aw-safe-left, 0px));
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

  .aw-sheet-grip {
    display: none;
  }

  @media (max-width: 760px) {
    .aw-sheet-grip {
      display: block;
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
