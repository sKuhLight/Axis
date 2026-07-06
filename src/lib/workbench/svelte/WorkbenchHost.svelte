<script lang="ts">
  import WorkbenchProvider from './WorkbenchProvider.svelte';
  import DockWorkspace from './DockWorkspace.svelte';
  import WidgetZone from './WidgetZone.svelte';
  import NavigationHost from './NavigationHost.svelte';
  import EditRibbon from './EditRibbon.svelte';
  import DragLayer from './DragLayer.svelte';
  import WorkbenchToasts from './WorkbenchToasts.svelte';
  import { selectVisibleWidgetsByZone } from '../core';
  import { shouldRenderRail, shouldRenderRailNav } from './navigation';
  import type { WorkbenchController } from './controller.svelte';
  import type { WorkbenchRenderRegistry } from './renderRegistry';
  import { workbenchThemeStyle, workbenchTokenDefaultsCss, type WorkbenchTheme } from './theme';
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
  // V14c — Rail render rule (design §9): "Rail is visible when navMode==='side'
  // OR rail-zone widgets exist OR edit mode." In `bottom` mode the nav moves to
  // the bottom bar, so the rail must NOT render *for nav* — but any rail-zone
  // widget it still carries (the connection-status widget, seeded on the rail by
  // the Axis default doc) keeps it alive as a widget-only strip. When there are
  // no rail widgets and we're not editing, `bottom` mode drops the rail entirely
  // (fixes "the full sidebar is always visible in bottom mode").
  const hasRailWidgets = $derived(selectVisibleWidgetsByZone($controller.document, 'rail').length > 0);
  const showRail = $derived(
    shouldRenderRail({ mode: navMode, hasRailWidgets, editMode: $controller.editMode })
  );
  const showRailNav = $derived(shouldRenderRailNav(navMode));
  const rootClass = $derived(theme?.className ? `aw-root ${theme.className}` : 'aw-root');
  // The `--aw-*` token defaults live once in theme.ts; inject them here (before
  // the host theme's overrides so the host still wins). This is the single
  // source of truth — the component no longer redeclares any hex literal.
  const rootStyle = $derived([workbenchTokenDefaultsCss(), workbenchThemeStyle(theme)].filter(Boolean).join(' '));
  let navDrawerOpen = $state(false);
  // The <760px hamburger drawer is a `side`-mode affordance only (design §9:
  // `railOverlay = (mobVP || isMobile) && navMode!=="bottom"`). In bottom mode the
  // nav is always reachable in the bottom bar (V14d), so the drawer/scrim/menu are
  // suppressed. It only makes sense while the rail actually carries the nav.
  const showMobileDrawer = $derived(showRailNav);
  $effect(() => {
    // Keep the drawer from getting stuck open if the rail stops carrying the nav.
    if (!showRailNav && navDrawerOpen) navDrawerOpen = false;
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

  // Directive 4: the desktop rail is icon-only at rest and expands (overlaying
  // the dock — no geometry reflow) on hover with a small intent delay, or
  // immediately on keyboard focus-within. State drives a class on the rail; the
  // width change is on an absolutely-positioned inner layer only.
  let railExpanded = $state(false);
  let railHoverTimer: ReturnType<typeof setTimeout> | null = null;
  const RAIL_HOVER_INTENT_MS = 150;
  function railEnter() {
    if (railHoverTimer) clearTimeout(railHoverTimer);
    railHoverTimer = setTimeout(() => {
      railExpanded = true;
      railHoverTimer = null;
    }, RAIL_HOVER_INTENT_MS);
  }
  function railLeave() {
    if (railHoverTimer) {
      clearTimeout(railHoverTimer);
      railHoverTimer = null;
    }
    railExpanded = false;
  }
  // Keyboard focus expands immediately (no intent delay) so tabbing into the
  // rail reveals labels; blur collapses unless the pointer is still hovering.
  function railFocusIn() {
    if (railHoverTimer) {
      clearTimeout(railHoverTimer);
      railHoverTimer = null;
    }
    railExpanded = true;
  }
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

    {#if showRail}
    <aside
      class="aw-rail"
      class:open={navDrawerOpen}
      class:aw-sheet={isPhone && navDrawerOpen}
      class:aw-rail-expanded={railExpanded}
      class:aw-rail-widgets-only={!showRailNav}
      data-zone-shell="rail"
      data-rail-nav={showRailNav ? 'true' : 'false'}
      onpointerenter={railEnter}
      onpointerleave={railLeave}
      onfocusin={railFocusIn}
      onfocusout={railLeave}
      use:focusTrap={{ enabled: showMobileDrawer && navDrawerOpen, onClose: () => (navDrawerOpen = false) }}
      use:bottomSheetSwipe={{ enabled: isPhone, open: navDrawerOpen, onClose: () => (navDrawerOpen = false) }}
    >
      <!-- Directive 4: the rail body is an absolutely-positioned overlay layer.
           At rest it is icon-only (--aw-rail-w); on hover/focus it widens to
           --aw-rail-w-expanded, floating OVER the dock. The outer <aside> keeps
           its fixed width in the flex layout so the dock never reflows (geometry
           guard safe). -->
      <div class="aw-rail-inner">
        <!-- T23: grab bar for the phone bottom-sheet presentation (CSS hides it
             outside phone width). Swipe it (or the sheet) down to close. -->
        <div class="aw-sheet-grip" aria-hidden="true"></div>
        <div class="aw-mark" aria-hidden="true">
          <span></span><span></span><span></span>
        </div>
        {#if showRailNav}
          <NavigationHost />
        {/if}
        <WidgetZone zone="rail" />
      </div>
    </aside>
    {/if}

    <main class="aw-frame">
      <header class="aw-topbar">
        <!-- Design §8: tl+tc+tr fit jointly against the shared top-bar width (12px gap). -->
        <WidgetZone zone="top.left" fitGroup={topZones} fitGap={12} />
        <WidgetZone zone="top.center" fitGroup={topZones} fitGap={12} />
        <WidgetZone zone="top.right" fitGroup={topZones} fitGap={12} />
      </header>

      <DockWorkspace />

      <footer class="aw-bottombar">
        <!-- Directive 3: the collapsed Customize control is the bottom bar's
             leftmost element in BOTH nav modes. Toggling opens the expanded
             EditRibbon overlay. Icon-only below a narrow width (label hidden by
             CSS) so it never forces the bar to overflow. -->
        <button
          class="aw-bottom-customize"
          class:active={$controller.editMode}
          type="button"
          title={$controller.editMode ? 'Finish editing layout' : 'Customize layout'}
          aria-pressed={$controller.editMode}
          onclick={() => controller.toggleEditMode()}
        >
          <span class="aw-bottom-customize-glyph" aria-hidden="true">◆</span>
          <span class="aw-bottom-customize-label">{$controller.editMode ? 'Done' : 'Customize'}</span>
        </button>
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
    <WorkbenchToasts />
  </div>
</WorkbenchProvider>

<style>
  /* The `--aw-*` token DEFAULTS are the single source of truth in theme.ts
     (WORKBENCH_TOKEN_DEFAULTS) and are injected onto `.aw-root` via the inline
     `style` attribute (see `rootStyle`). No hex literal is declared here — the
     noHexColors guard enforces this file with no tolerance. */

  /* Directive 1: themed scrollbars for EVERY scrollable descendant under the
     root (preset list, history, bottom bar, dock panels, drawers). One global
     block so panels inherit it; tokens only — transparent track, border-token
     thumb that mixes toward the accent on hover, ~8px thin. */
  :global(.aw-root *) {
    scrollbar-width: thin;
    scrollbar-color: var(--aw-border-3) transparent;
  }
  :global(.aw-root *::-webkit-scrollbar) {
    width: 8px;
    height: 8px;
  }
  :global(.aw-root *::-webkit-scrollbar-track) {
    background: transparent;
  }
  :global(.aw-root *::-webkit-scrollbar-thumb) {
    border-radius: 8px;
    background: var(--aw-border-3);
    border: 2px solid transparent;
    background-clip: padding-box;
  }
  :global(.aw-root *::-webkit-scrollbar-thumb:hover) {
    background: color-mix(in srgb, var(--aw-accent) 45%, var(--aw-border-3));
    background-clip: padding-box;
  }
  :global(.aw-root *::-webkit-scrollbar-corner) {
    background: transparent;
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
    /* T21: the docked rail sits on the screen's left edge — its FIXED slot width
       (icon-only) is `--aw-rail-w` + the left safe-area inset. This width never
       changes on hover (directive 4): the inner layer overlays instead, so the
       dock grid never reflows. */
    position: relative;
    width: calc(var(--aw-rail-w, 58px) + var(--aw-safe-left, 0px));
    flex: none;
    min-height: 0;
    background: var(--aw-bg-2);
    border-right: 1px solid var(--aw-border);
    box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.025);
  }
  /* The rail body is an overlay layer: absolutely positioned over the fixed
     slot, icon-only at rest, expanding rightward on hover/focus. Width is the
     only animated property and it's on this layer alone. */
  .aw-rail-inner {
    position: absolute;
    inset: 0;
    width: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: calc(10px + var(--aw-safe-top, 0px)) 8px calc(12px + var(--aw-safe-bottom, 0px)) calc(8px + var(--aw-safe-left, 0px));
    background: var(--aw-bg-2);
    border-right: 1px solid transparent;
    overflow: hidden;
    transition: width 0.16s ease, box-shadow 0.16s ease;
  }
  .aw-rail.aw-rail-expanded .aw-rail-inner {
    width: calc(var(--aw-rail-w-expanded, 200px) + var(--aw-safe-left, 0px));
    z-index: 60;
    /* Allow the per-entry edit affordances (hide/menu badges at negative
       offsets) to show once expanded; clip only during the resting/collapse. */
    overflow: visible;
    border-right: 1px solid var(--aw-border);
    box-shadow: 6px 0 26px rgba(0, 0, 0, 0.4);
  }
  /* At rest the nav entries are icon-only: hide the label and center the glyph.
     When expanded, labels reappear and entries become icon+label rows. The
     entry component is app-owned; these :global rules drive its layout by rail
     state without the entry needing to know it. */
  .aw-rail:not(.aw-rail-expanded) :global(.axis-nav-entry .lbl) {
    display: none;
  }
  /* V13c: at rest (icon-only) every rail nav item renders as a square, centered
     in the rail's fixed column, so the active/hover tint is a square rounded
     tile rather than a wide rounded rect. The rail body is `--aw-rail-w` wide
     with 8px side padding; the square is sized to fit that content box and
     centered so it stays square whatever the surrounding widths are. */
  .aw-rail:not(.aw-rail-expanded) :global(.axis-nav-entry) {
    width: calc(var(--aw-rail-w, 58px) - 16px);
    height: calc(var(--aw-rail-w, 58px) - 16px);
    margin-inline: auto;
    aspect-ratio: 1 / 1;
  }
  .aw-rail.aw-rail-expanded :global(.axis-nav-entry) {
    flex-direction: row;
    justify-content: flex-start;
    gap: 12px;
    padding: 0 12px;
    text-align: left;
    /* Same height as the rest-state square: hover/focus expansion must never
       shift entries vertically, or a press that triggers the expansion moves
       the button out from under the pointer mid-click and the click never
       fires on it (mousedown target ≠ mouseup target). */
    height: calc(var(--aw-rail-w, 58px) - 16px);
  }
  .aw-rail.aw-rail-expanded :global(.axis-nav-entry .lbl) {
    max-width: none;
    font-size: 12px;
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

  /* Directive 2: the bottom bar is ALWAYS a flex row and must NEVER scroll
     horizontally. Every zone flexes with `min-width: 0` so it can shrink; the
     Customize control is fixed-size and leftmost; the nav (bottom mode) shrinks
     to icon-only and finally sheds into its own ⋯ overflow rather than
     overflowing the bar. `overflow: hidden` is the hard guarantee. */
  .aw-bottombar {
    /* T21: bottom bar hugs the home-indicator (bottom inset) and screen right
       edge (right inset); left inset belongs to the rail. */
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
    min-width: 0;
    overflow: hidden;
    min-height: calc(38px + var(--aw-safe-bottom, 0px));
    padding: 4px calc(12px + var(--aw-safe-right, 0px)) var(--aw-safe-bottom, 0px) 12px;
    border-top: 1px solid var(--aw-border);
  }

  /* Directive 3: the collapsed Customize control, leftmost, in both nav modes.
     Design 01-shell §5 pill styling — accent ink on a dark accent fill. */
  .aw-bottom-customize {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 30px;
    padding: 0 13px;
    border: 1px solid color-mix(in srgb, var(--aw-accent) 34%, var(--aw-border));
    border-radius: 9px;
    background: color-mix(in srgb, var(--aw-accent) 12%, var(--aw-bg-2));
    color: color-mix(in srgb, var(--aw-accent) 82%, white);
    cursor: pointer;
    font: 700 12px/1 var(--aw-font-ui);
  }
  .aw-bottom-customize:hover {
    border-color: var(--aw-accent);
  }
  .aw-bottom-customize.active {
    border-color: var(--aw-accent);
    background: var(--aw-accent);
    color: var(--aw-accent-ink);
  }
  .aw-bottom-customize:focus-visible {
    outline: 2px solid var(--aw-accent);
    outline-offset: 2px;
  }
  .aw-bottom-customize-glyph {
    font-size: 11px;
    line-height: 1;
  }

  /* Bottom-nav mode (design §9): the nav block sits after Customize, divided by
     a 1px separator, before the bottom-zone widgets. It shrinks (min-width:0)
     and its entries compress to icon-only / shed into the nav's own overflow. */
  .aw-root.aw-nav-bottom .aw-bottombar {
    min-height: calc(52px + var(--aw-safe-bottom, 0px));
  }
  .aw-bottom-nav {
    flex: 0 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    padding-right: 12px;
    border-right: 1px solid var(--aw-border);
    overflow: hidden;
  }
  .aw-bottombar > :global([data-zone='bottom']) {
    flex: 1 1 auto;
    min-width: 0;
  }

  /* V14c — widgets-only rail (bottom-nav mode, rail kept alive only by rail-zone
     widgets such as the connection status). It has no nav, so it never expands on
     hover; it stays a slim fixed strip (design §9: 64px when the rail exists only
     for rail widgets). */
  .aw-rail.aw-rail-widgets-only {
    width: calc(var(--aw-rail-w-widgets, 64px) + var(--aw-safe-left, 0px));
  }
  .aw-rail.aw-rail-widgets-only.aw-rail-expanded .aw-rail-inner {
    width: 100%;
    z-index: auto;
    overflow: hidden;
    box-shadow: none;
    border-right: 1px solid transparent;
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
      border: 0;
      border-top: 1px solid var(--aw-border);
      border-radius: 18px 18px 0 0;
      box-shadow: 0 -14px 44px rgba(0, 0, 0, 0.55);
      transform: translateY(calc(100% + 24px));
      transition: transform 0.26s cubic-bezier(0.2, 0.8, 0.3, 1);
    }
    .aw-rail.open {
      transform: translateY(0);
    }
    /* V14c/V14d — a widgets-only rail (bottom-nav mode) has no nav and no
       hamburger to open it, so it must NOT become a hidden bottom sheet on phone.
       Keep it as a slim static left strip so the connection widget stays visible
       and reachable, with the persistent bottom-nav bar below. */
    .aw-rail.aw-rail-widgets-only {
      position: relative;
      left: auto;
      right: auto;
      bottom: auto;
      top: auto;
      z-index: auto;
      width: calc(var(--aw-rail-w-widgets, 64px) + var(--aw-safe-left, 0px));
      max-height: none;
      height: auto;
      border: 0;
      border-right: 1px solid var(--aw-border);
      border-radius: 0;
      box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.025);
      transform: none;
      transition: none;
    }
    .aw-rail.aw-rail-widgets-only .aw-rail-inner {
      position: absolute;
      inset: 0;
      width: 100%;
      flex-direction: column;
      padding: calc(10px + var(--aw-safe-top, 0px)) 8px calc(12px + var(--aw-safe-bottom, 0px)) calc(8px + var(--aw-safe-left, 0px));
      overflow: hidden;
    }
    .aw-rail.aw-rail-widgets-only .aw-sheet-grip {
      display: none;
    }
    /* On phone the rail is a bottom sheet — the inner layer stops being a
       resting-width overlay and simply fills the sheet (static flow, scrolls). */
    .aw-rail-inner {
      position: static;
      width: auto;
      flex-direction: column;
      border-right: 0;
      box-shadow: none;
      padding: 6px 12px calc(16px + var(--aw-safe-bottom, 0px));
      overflow-y: auto;
      transition: none;
    }
    .aw-rail.aw-rail-expanded .aw-rail-inner {
      width: auto;
      border-right: 0;
      box-shadow: none;
    }
    /* The icon-only rule is a desktop hover affordance; on the phone bottom
       sheet the nav is a full-width horizontal row that always shows labels. */
    .aw-rail :global(.axis-nav-entry .lbl) {
      display: block;
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
      grid-template-columns: minmax(0, 1fr) minmax(0, auto) minmax(0, 1fr);
    }
    /* Only reserve hamburger space in side-nav mode (where the hamburger is
       rendered). In bottom-nav mode the drawer/hamburger are suppressed, so the
       reserved gap (screenshot 3) is removed. */
    .aw-root:not(.aw-nav-bottom) .aw-topbar {
      padding-left: calc(62px + var(--aw-safe-left, 0px));
    }
    /* Directive 3: below phone width the Customize control is icon-only so it
       never forces the bottom bar to overflow. */
    .aw-bottom-customize {
      padding: 0 9px;
    }
    .aw-bottom-customize-label {
      display: none;
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
