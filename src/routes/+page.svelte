<script lang="ts">
  import { onMount } from 'svelte';
  import { editor } from '$lib/editor/editor.svelte';
  import { history } from '$lib/editor/history.svelte';
  import HistoryPanel from '$lib/editor/HistoryPanel.svelte';
  import ToolRail from '$lib/shell/ToolRail.svelte';
  import TopBar from '$lib/shell/TopBar.svelte';
  import SignalGrid from '$lib/editor/SignalGrid.svelte';
  import BlockEditor from '$lib/editor/BlockEditor.svelte';
  import VirtualScreen from '$lib/device/VirtualScreen.svelte';
  import PresetBrowser from '$lib/preset/PresetBrowser.svelte';
  import FcEditor from '$lib/device/FcEditor.svelte';
  import CommandPalette from '$lib/shell/CommandPalette.svelte';
  import CabPicker from '$lib/device/CabPicker.svelte';
  import DeviceTools from '$lib/device/DeviceTools.svelte';
  import ConvertDialog from '$lib/convert/ConvertDialog.svelte';
  import ConvertScratchView from '$lib/convert/ConvertScratchView.svelte';
  import PresetPicker from '$lib/preset/PresetPicker.svelte';
  import SaveDialog from '$lib/preset/SaveDialog.svelte';
  import TunerOverlay from '$lib/editor/TunerOverlay.svelte';
  import CachePrompt from '$lib/ui/CachePrompt.svelte';
  import ColorLabelsPrompt from '$lib/fm3edit/ColorLabelsPrompt.svelte';
  import DeviceDefsPrompt from '$lib/device/DeviceDefsPrompt.svelte';
  import AxisPanel from '$lib/ancillary/AxisPanel.svelte';
  import ThemePicker from '$lib/platform/ThemePicker.svelte';
  import Notices from '$lib/ancillary/Notices.svelte';
  import StatusBar from '$lib/shell/StatusBar.svelte';
  import Tour from '$lib/ancillary/Tour.svelte';
  import Toast from '$lib/ui/Toast.svelte';
  import AxisWorkbenchShell from '$lib/axis-workbench/AxisWorkbenchShell.svelte';
  import AxisPresetBrowserSearchOverlay from '$lib/axis-workbench/presetBrowser/AxisPresetBrowserSearchOverlay.svelte';
  import DirectGate from '$lib/platform/DirectGate.svelte';
  import MobileGate from '$lib/platform/MobileGate.svelte';
  import { directBoot } from '$lib/platform/direct.svelte';
  import { mobileBoot } from '$lib/platform/mobile.svelte';
  import { notifyReady as otaNotifyReady, checkForUpdate as otaCheck } from '$lib/platform/direct/ota';
  import { isAxisWorkbenchFeatureEnabled } from '$lib/axis-workbench/featureGate';
  import { pollIntervalsFor } from '$lib/editor/pollIntervals';
  import { colorLabels } from '$lib/fm3edit/colorLabels.svelte';
  import { overlays } from '$lib/overlay/overlays.svelte';
  import '$lib/overlay/overlayRegistrations';

  // In the web build, gate the app behind DirectGate; start the editor only once the in-page runtime is
  // live. In the desktop build (directBoot.active=false) it starts immediately.
  let started = $state(false);
  const workbenchEnabled = isAxisWorkbenchFeatureEnabled(import.meta.env);
  function startApp() {
    if (started) return;
    started = true;
    editor.init();
    editor.poll();
    void colorLabels.refresh(); // FM3-Edit preset-color import (replicated-purring-bachman); one-time-ever check, silent no-op if absent
  }
  // Poll/preset-watch loops. The interval depends on the active telemetry polling mode (META-17/AXIS-40):
  // faster modes reflect device changes sooner at the cost of traffic
  // (pollIntervals.ts). Rebuild BOTH intervals whenever the mode changes
  // (this $effect re-runs on editor.pollingMode / started) — clearing + re-creating the two setIntervals.
  $effect(() => {
    if (!started) return;
    const { pollMs, watchMs } = pollIntervalsFor(editor.pollingMode);
    const tp = setInterval(() => editor.poll(), pollMs);
    const tw = setInterval(() => editor.watchPreset(), watchMs);
    return () => { clearInterval(tp); clearInterval(tw); };
  });
  // Web build: start the app the moment the in-page runtime (direct)
  // goes live. Desktop starts immediately in onMount.
  $effect(() => { if (directBoot.active && directBoot.phase === 'ready') startApp(); });
  $effect(() => { if (mobileBoot.active && mobileBoot.phase === 'ready') startApp(); });

  onMount(() => {
    editor.setViewport(window.innerWidth, window.innerHeight);
    if (mobileBoot.active) {
      // Confirm the running web bundle so Capgo doesn't roll it back, then check for an OTA update.
      // MobileGate drives connect; startApp() fires when ready.
      void otaNotifyReady().then(() => otaCheck());
    } else if (directBoot.active) { /* DirectGate drives connect; startApp() fires when ready */ }
    else startApp();

    const onResize = () => editor.setViewport(window.innerWidth, window.innerHeight);
    const onKey = (e: KeyboardEvent) => {
      // never hijack undo/redo while typing (rename fields, search inputs)
      const t = e.target as HTMLElement | null;
      const editing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (!editing && (e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        void (e.shiftKey ? history.redo() : history.undo());
      } else if (!editing && (e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        void history.redo();
      } else if (!editing && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 't' || e.key === 'T')) {
        // Bare `t` toggles the tuner. Deliberately NOT ⌘T — Chrome/Safari reserve that for "new tab"
        // and a page can't preventDefault it, so it would only ever work in the desktop build.
        if (editor.tourActive) return; // Tour.svelte owns keys while the tour is up
        if (!editor.hasTuner) return; // same capability gate as the TopBar chip
        e.preventDefault();
        editor.toggleTuner();
      } else if (!editing && !e.metaKey && !e.ctrlKey && !e.altKey && e.code === 'Space') {
        // toggleBypass is a no-op unless a real block is selected.
        e.preventDefault();
        void editor.toggleBypass();
      } else if (!editing && !e.metaKey && !e.ctrlKey && !e.altKey && e.code === 'Backspace') {
        // removeHoveredOrSelected is a no-op unless a cell is hovered or selected.
        e.preventDefault();
        void editor.removeHoveredOrSelected();
      } else if (!editing && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'q' || e.key === 'Q')) {
        // Bare `q` toggles the Quick Build block sidecar (drag blocks onto the grid).
        if (editor.tourActive) return; // Tour.svelte owns keys while the tour is up
        e.preventDefault();
        editor.quickBuildOpen = !editor.quickBuildOpen;
      } else if (!editing && !e.metaKey && !e.ctrlKey && !e.altKey && e.key === '/') {
        if (editor.tourActive) return; // Tour.svelte owns keys while the tour is up
        e.preventDefault();
        window.dispatchEvent(new Event('axis:focus-control-search'));
      } else if (!editing && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'p' || e.key === 'P')) {
        if (editor.tourActive) return; // Tour.svelte owns keys while the tour is up
        e.preventDefault();
        editor.presetSearchOpen = true;
      } else if (e.key === 'Escape') {
        if (editor.tourActive) return; // Tour.svelte owns Escape while the tour is up
        // Priority order (and the tuner/link-arm/block-editor special cases) is data in
        // src/lib/overlay/overlays.svelte.ts — closes exactly the top overlay per press.
        overlays.escape();
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
    (window as unknown as { axisDesktop?: { setDirty?: (d: boolean) => void } }).axisDesktop?.setDirty?.(!editor.layout.crcValid);
  });
</script>

{#if mobileBoot.active && mobileBoot.phase !== 'ready'}
  <MobileGate />
{:else if directBoot.active && directBoot.phase !== 'ready'}
  <DirectGate />
{:else}
<div class="app">
  {#if workbenchEnabled}
    <AxisWorkbenchShell />
  {:else}
    <ToolRail />
    <div class="main">
      <TopBar />
      {#if editor.inLibrary}
        <PresetBrowser />
      {:else if editor.virtual?.slug === 'fc'}
        <FcEditor />
      {:else if editor.virtual}
        <VirtualScreen />
      {:else}
        <SignalGrid />
        <BlockEditor />
      {/if}
      <StatusBar />
    </div>
  {/if}
  <CommandPalette />
  <CabPicker />
  <DeviceTools />
  <ConvertDialog />
  <ConvertScratchView />
  <HistoryPanel />
  <PresetPicker />
  {#if workbenchEnabled}<AxisPresetBrowserSearchOverlay />{/if}
  <SaveDialog />
  <TunerOverlay />
  <CachePrompt />
  <ColorLabelsPrompt />
  <DeviceDefsPrompt />
  <AxisPanel />
  {#if editor.themeOpen}<ThemePicker onclose={() => (editor.themeOpen = false)} />{/if}
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
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    position: relative;
  }
</style>
