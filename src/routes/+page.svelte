<script lang="ts">
  import { onMount } from 'svelte';
  import {
    deviceSession,
    editorLifecycle,
    editorOnboarding,
    editorOverlays,
    editorViewport,
    gridEditing,
    paramEditing,
    presetBuffer,
    telemetry
  } from '$lib/editor/editorClients.svelte';
  import { history } from '$lib/editor/history.svelte';
  import { tapTempo } from '$lib/editor/tapTempo.svelte';
  import HistoryPanel from '$lib/editor/HistoryPanel.svelte';
  import CommandPalette from '$lib/shell/CommandPalette.svelte';
  import CabPicker from '$lib/device/CabPicker.svelte';
  import DeviceTools from '$lib/device/DeviceTools.svelte';
  import ConvertDialog from '$lib/convert/ConvertDialog.svelte';
  import PresetPicker from '$lib/preset/PresetPicker.svelte';
  import TunerOverlay from '$lib/editor/TunerOverlay.svelte';
  import TapTempoOverlay from '$lib/editor/TapTempoOverlay.svelte';
  import ShortcutsOverlay from '$lib/ancillary/ShortcutsOverlay.svelte';
  import CachePrompt from '$lib/ui/CachePrompt.svelte';
  import ColorLabelsPrompt from '$lib/fm3edit/ColorLabelsPrompt.svelte';
  import DeviceDefsPrompt from '$lib/device/DeviceDefsPrompt.svelte';
  import AxisPanel from '$lib/ancillary/AxisPanel.svelte';
  import Notices from '$lib/ancillary/Notices.svelte';
  import Tour from '$lib/ancillary/Tour.svelte';
  import Toast from '$lib/ui/Toast.svelte';
  import AxisWorkbenchShell from '$lib/axis-workbench/AxisWorkbenchShell.svelte';
  import AxisPresetBrowserSearchOverlay from '$lib/axis-workbench/presetBrowser/AxisPresetBrowserSearchOverlay.svelte';
  import DirectGate from '$lib/platform/DirectGate.svelte';
  import MobileGate from '$lib/platform/MobileGate.svelte';
  import { directBoot } from '$lib/platform/direct.svelte';
  import { mobileBoot } from '$lib/platform/mobile.svelte';
  import { notifyReady as otaNotifyReady, checkForUpdate as otaCheck } from '$lib/platform/direct/ota';
  import { pollIntervalsFor } from '$lib/editor/pollIntervals';
  import { colorLabels } from '$lib/fm3edit/colorLabels.svelte';
  import { overlays } from '$lib/overlay/overlays.svelte';
  import { axisWorkbenchController } from '$lib/axis-workbench/axisWorkbenchStore.svelte';
  import { AXIS_PAGE_GRID } from '$lib/axis-workbench/axisWorkbenchPages';
  import '$lib/overlay/overlayRegistrations';

  // In the web build, gate the app behind DirectGate; start the editor only once the in-page runtime is
  // live. In the desktop build (directBoot.active=false) it starts immediately.
  let started = $state(false);
  function startApp() {
    if (started) return;
    started = true;
    editorLifecycle.init();
    deviceSession.poll();
    void colorLabels.refresh(); // FM3-Edit preset-color import (replicated-purring-bachman); one-time-ever check, silent no-op if absent
  }
  // Poll/preset-watch loops. The interval depends on the active telemetry polling mode (META-17/AXIS-40):
  // faster modes reflect device changes sooner at the cost of traffic
  // (pollIntervals.ts). Rebuild BOTH intervals whenever the mode changes
  // (this $effect re-runs on editor.pollingMode / started) — clearing + re-creating the two setIntervals.
  $effect(() => {
    if (!started) return;
    const { pollMs, watchMs } = pollIntervalsFor(telemetry.pollingMode);
    const tp = setInterval(() => deviceSession.poll(), pollMs);
    const tw = setInterval(() => presetBuffer.watchPreset(), watchMs);
    return () => { clearInterval(tp); clearInterval(tw); };
  });
  // Web build: start the app the moment the in-page runtime (direct)
  // goes live. Desktop starts immediately in onMount.
  $effect(() => { if (directBoot.active && directBoot.phase === 'ready') startApp(); });
  $effect(() => { if (mobileBoot.active && mobileBoot.phase === 'ready') startApp(); });

  onMount(() => {
    editorViewport.setViewport(window.innerWidth, window.innerHeight);
    if (mobileBoot.active) {
      // Confirm the running web bundle so Capgo doesn't roll it back, then check for an OTA update.
      // MobileGate drives connect; startApp() fires when ready.
      void otaNotifyReady().then(() => otaCheck());
    } else if (directBoot.active) { /* DirectGate drives connect; startApp() fires when ready */ }
    else startApp();

    const onResize = () => editorViewport.setViewport(window.innerWidth, window.innerHeight);
    const onKey = (e: KeyboardEvent) => {
      // never hijack undo/redo while typing (rename fields, search inputs)
      const t = e.target as HTMLElement | null;
      const editing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      // Every shortcut below except the tuner toggle, the `?` cheat sheet and Escape is scoped to
      // the Grid page, so grid-editing keys can't fire while another workbench page is in view.
      // Escape and `?` stay global: Escape closes registry-backed dialogs from any page, and `?`
      // opens a cheat sheet that itself lists only the keys available at that moment.
      const onGrid = axisWorkbenchController.activePage?.id === AXIS_PAGE_GRID;
      if (!editing && onGrid && (e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        void (e.shiftKey ? history.redo() : history.undo());
      } else if (!editing && onGrid && (e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        void history.redo();
      } else if (!editing && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 't' || e.key === 'T')) {
        // Bare `t` toggles the tuner. Deliberately NOT ⌘T — Chrome/Safari reserve that for "new tab"
        // and a page can't preventDefault it, so it would only ever work in the desktop build.
        if (editorOnboarding.tourActive) return; // Tour.svelte owns keys while the tour is up
        if (!deviceSession.hasTuner) return; // same capability gate as the TopBar chip
        e.preventDefault();
        telemetry.toggleTuner();
      } else if (!editing && onGrid && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'b' || e.key === 'B')) {
        // Bare `b` taps tempo, the way `t` toggles the tuner. The first tap opens the "keep
        // tapping" prompt, which re-arms on each tap and dismisses itself after a pause.
        if (editorOnboarding.tourActive) return; // Tour.svelte owns keys while the tour is up
        if (!deviceSession.hasTempo) return; // same capability gate as the tempo widget
        e.preventDefault();
        tapTempo.tap();
        void deviceSession.tapTempo();
      } else if (!editing && onGrid && !e.metaKey && !e.ctrlKey && !e.altKey && e.code === 'Space') {
        // toggleBypass is a no-op unless a real block is selected.
        e.preventDefault();
        void paramEditing.toggleBypass();
      } else if (!editing && onGrid && !e.metaKey && !e.ctrlKey && !e.altKey && e.code === 'Backspace') {
        // removeHoveredOrSelected is a no-op unless a cell is hovered or selected.
        e.preventDefault();
        void gridEditing.removeHoveredOrSelected();
      } else if (!editing && onGrid && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'q' || e.key === 'Q')) {
        // Bare `q` toggles the Quick Build block sidecar (drag blocks onto the grid).
        if (editorOnboarding.tourActive) return; // Tour.svelte owns keys while the tour is up
        e.preventDefault();
        editorOverlays.quickBuildOpen = !editorOverlays.quickBuildOpen;
      } else if (!editing && onGrid && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === '/') {
        if (editorOnboarding.tourActive) return; // Tour.svelte owns keys while the tour is up
        e.preventDefault();
        window.dispatchEvent(new Event('axis:focus-control-search'));
      } else if (!editing && onGrid && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'p' || e.key === 'P')) {
        if (editorOnboarding.tourActive) return; // Tour.svelte owns keys while the tour is up
        e.preventDefault();
        editorOverlays.presetSearchOpen = true;
      } else if (!editing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === '?') {
        // Bare `?` (Shift+/ on most layouts) opens the shortcut cheat sheet from any page — the
        // sheet filters itself to the keys that work where the user is; Escape closes it.
        if (editorOnboarding.tourActive) return; // Tour.svelte owns keys while the tour is up
        e.preventDefault();
        overlays.open('shortcuts');
      } else if (e.key === 'Escape') {
        if (editorOnboarding.tourActive) return; // Tour.svelte owns Escape while the tour is up
        // The registry is the *fallback* owner of Escape, not its first responder: whatever is
        // innermost gets first refusal. A sub-popover (query autocomplete, tag menu), an inline
        // rename input, or a focus-trapped menu/drawer claims the key itself — by stopping
        // propagation before it reaches this bubble-phase listener, or by calling
        // preventDefault. Listening in the capture phase would take that first look away from
        // them and close an unrelated overlay instead of the thing the user was looking at.
        if (e.defaultPrevented) return;
        // Priority order (and the tuner/link-arm/block-editor special cases) is data in
        // src/lib/overlay/overlays.svelte.ts — closes exactly the top overlay per press.
        if (overlays.escape()) e.preventDefault();
      }
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      // The poll/watch intervals are owned by the $effect above (it clears them on teardown).
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  });

  // Desktop: push the edit-buffer dirty flag to the Electron main process, which shows the native
  // "Unsaved changes" dialog on window close (crcValid = device CRC matches the stored preset).
  $effect(() => {
    (window as unknown as { axisDesktop?: { setDirty?: (d: boolean) => void } }).axisDesktop?.setDirty?.(!gridEditing.layout.crcValid);
  });
</script>

{#if mobileBoot.active && mobileBoot.phase !== 'ready'}
  <MobileGate />
{:else if directBoot.active && directBoot.phase !== 'ready'}
  <DirectGate />
{:else}
<div class="app">
  <AxisWorkbenchShell />
  <CommandPalette />
  <CabPicker />
  <DeviceTools />
  <ConvertDialog />
  <HistoryPanel />
  <PresetPicker />
  <AxisPresetBrowserSearchOverlay />
  <TunerOverlay />
  <TapTempoOverlay />
  <ShortcutsOverlay />
  <CachePrompt />
  <ColorLabelsPrompt />
  <DeviceDefsPrompt />
  <AxisPanel />
  <Notices />
  <Tour />
  <Toast />
</div>
{/if}

<style>
  .app {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: row;
    background: var(--bg);
    color: var(--text);
    overflow: hidden;
  }
</style>
