<script lang="ts">
  import { onMount } from 'svelte';
  import { editor } from '$lib/editor.svelte';
  import { history } from '$lib/history.svelte';
  import { surfInit } from '$lib/surfaceStore.svelte';
  import HistoryPanel from '$lib/HistoryPanel.svelte';
  import ToolRail from '$lib/ToolRail.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import SignalGrid from '$lib/SignalGrid.svelte';
  import BlockEditor from '$lib/BlockEditor.svelte';
  import VirtualScreen from '$lib/VirtualScreen.svelte';
  import PresetBrowser from '$lib/PresetBrowser.svelte';
  import FcEditor from '$lib/FcEditor.svelte';
  import CommandPalette from '$lib/CommandPalette.svelte';
  import CabPicker from '$lib/CabPicker.svelte';
  import DeviceTools from '$lib/DeviceTools.svelte';
  import PresetPicker from '$lib/PresetPicker.svelte';
  import SaveDialog from '$lib/SaveDialog.svelte';
  import TunerOverlay from '$lib/TunerOverlay.svelte';
  import CachePrompt from '$lib/CachePrompt.svelte';
  import AxisPanel from '$lib/AxisPanel.svelte';
  import ThemePicker from '$lib/ThemePicker.svelte';
  import Notices from '$lib/Notices.svelte';
  import StatusBar from '$lib/StatusBar.svelte';
  import Tour from '$lib/Tour.svelte';
  import Toast from '$lib/Toast.svelte';
  import AxisWorkbenchShell from '$lib/axis-workbench/AxisWorkbenchShell.svelte';
  import RemoteGate from '$lib/RemoteGate.svelte';
  import DirectGate from '$lib/DirectGate.svelte';
  import MobileGate from '$lib/MobileGate.svelte';
  import { remoteBoot } from '$lib/remote.svelte';
  import { directBoot } from '$lib/direct.svelte';
  import { mobileBoot } from '$lib/mobile.svelte';
  import { notifyReady as otaNotifyReady, checkForUpdate as otaCheck } from '$lib/direct/ota';
  import { isAxisWorkbenchFeatureEnabled } from '$lib/axis-workbench/featureGate';
  import { pollIntervalsFor } from '$lib/pollIntervals';

  // In the remote web build, gate the app behind sign-in + relay-connect; start the editor only once the
  // remote transport is live. In the desktop build (remoteBoot.active=false) it starts immediately.
  let started = $state(false);
  const workbenchEnabled = isAxisWorkbenchFeatureEnabled(import.meta.env);
  function startApp() {
    if (started) return;
    started = true;
    void surfInit(); // load control-surface layouts from the config store (host: cache is already seeded)
    editor.init();
    editor.poll();
  }
  // Poll/preset-watch loops. The interval depends on the active telemetry polling mode (META-17/AXIS-40):
  // faster modes reflect device changes sooner at the cost of traffic; remote sessions are event-driven
  // and clamp to a slow relay floor (pollIntervals.ts). Rebuild BOTH intervals whenever the mode changes
  // (this $effect re-runs on editor.pollingMode / started) — clearing + re-creating the two setIntervals.
  $effect(() => {
    if (!started) return;
    const { pollMs, watchMs } = pollIntervalsFor(editor.pollingMode, remoteBoot.active);
    const tp = setInterval(() => editor.poll(), pollMs);
    const tw = setInterval(() => editor.watchPreset(), watchMs);
    return () => { clearInterval(tp); clearInterval(tw); };
  });
  // Web build: start the app the moment the relay session (remote) or the in-page runtime (direct)
  // goes live. Desktop starts immediately in onMount.
  $effect(() => { if (remoteBoot.active && remoteBoot.phase === 'ready') startApp(); });
  $effect(() => { if (directBoot.active && directBoot.phase === 'ready') startApp(); });
  $effect(() => { if (mobileBoot.active && mobileBoot.phase === 'ready') startApp(); });

  onMount(() => {
    editor.setViewport(window.innerWidth, window.innerHeight);
    if (mobileBoot.active) {
      // Confirm the running web bundle so Capgo doesn't roll it back, then check for an OTA update.
      // MobileGate drives connect; startApp() fires when ready.
      void otaNotifyReady().then(() => otaCheck());
    } else if (remoteBoot.active) remoteBoot.init(); // resume session / show the gate; startApp() fires when ready
    else if (directBoot.active) { /* DirectGate drives connect; startApp() fires when ready */ }
    else startApp();

    const onResize = () => editor.setViewport(window.innerWidth, window.innerHeight);
    const onKey = (e: KeyboardEvent) => {
      // never hijack undo/redo while typing (rename fields, search inputs)
      const t = e.target as HTMLElement | null;
      const editing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        editor.paletteMode = 'place';
        editor.placeTarget = null;
        editor.paletteOpen = true;
      } else if (!editing && (e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        void (e.shiftKey ? history.redo() : history.undo());
      } else if (!editing && (e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        void history.redo();
      } else if (e.key === 'Escape') {
        if (editor.tourActive) return; // Tour.svelte owns Escape while the tour is up
        if (editor.tuner.active) editor.toggleTuner();
        else if (history.panelOpen) history.panelOpen = false;
        else if (editor.cabPickerOpen) editor.cabPickerOpen = false;
        else if (editor.paletteOpen) editor.paletteOpen = false;
        else if (editor.presetOpen) editor.presetOpen = false;
        else if (editor.linkFrom) editor.cancelLink(); // disarm tap-to-connect before closing the editor
        else if (editor.editorOpen) editor.closeEditor();
      }
    };
    // Unsaved-changes guard, web mode only — in the desktop build the Electron main process owns the
    // close dialog (fed by the setDirty $effect below); double-blocking here would fight it.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if ((window as unknown as { axisDesktop?: { isDesktop?: boolean } }).axisDesktop?.isDesktop) return;
      if (!editor.layout.crcValid) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      // The poll/watch intervals are owned by the $effect above (it clears them on teardown).
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onBeforeUnload);
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
{:else if remoteBoot.active && remoteBoot.phase !== 'ready'}
  <RemoteGate />
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
  <HistoryPanel />
  <PresetPicker />
  <SaveDialog />
  <TunerOverlay />
  <CachePrompt />
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
