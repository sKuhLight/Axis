<script lang="ts">
  import { onMount } from 'svelte';
  import { editor } from '$lib/editor.svelte';
  import ToolRail from '$lib/ToolRail.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import SignalGrid from '$lib/SignalGrid.svelte';
  import BlockEditor from '$lib/BlockEditor.svelte';
  import VirtualScreen from '$lib/VirtualScreen.svelte';
  import PresetBrowser from '$lib/PresetBrowser.svelte';
  import FcEditor from '$lib/FcEditor.svelte';
  import CommandPalette from '$lib/CommandPalette.svelte';
  import CabPicker from '$lib/CabPicker.svelte';
  import PresetPicker from '$lib/PresetPicker.svelte';
  import SaveDialog from '$lib/SaveDialog.svelte';
  import TunerOverlay from '$lib/TunerOverlay.svelte';
  import CachePrompt from '$lib/CachePrompt.svelte';
  import AxisPanel from '$lib/AxisPanel.svelte';
  import Notices from '$lib/Notices.svelte';
  import StatusBar from '$lib/StatusBar.svelte';
  import Tour from '$lib/Tour.svelte';
  import Toast from '$lib/Toast.svelte';
  import RemoteGate from '$lib/RemoteGate.svelte';
  import { remoteBoot } from '$lib/remote.svelte';

  // In the remote web build, gate the app behind sign-in + relay-connect; start the editor only once the
  // remote transport is live. In the desktop build (remoteBoot.active=false) it starts immediately.
  let started = false;
  let tp: ReturnType<typeof setInterval> | null = null;
  let tw: ReturnType<typeof setInterval> | null = null;
  function startApp() {
    if (started) return;
    started = true;
    editor.init();
    editor.poll();
    tp = setInterval(() => editor.poll(), 5000);
    tw = setInterval(() => editor.watchPreset(), 4000);
  }
  // Remote build: start the app the moment the relay session goes live.
  $effect(() => { if (remoteBoot.active && remoteBoot.phase === 'ready') startApp(); });

  onMount(() => {
    editor.setViewport(window.innerWidth, window.innerHeight);
    if (remoteBoot.active) remoteBoot.init(); // resume session / show the gate; startApp() fires when ready
    else startApp();

    const onResize = () => editor.setViewport(window.innerWidth, window.innerHeight);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        editor.paletteMode = 'place';
        editor.placeTarget = null;
        editor.paletteOpen = true;
      } else if (e.key === 'Escape') {
        if (editor.tourActive) return; // Tour.svelte owns Escape while the tour is up
        if (editor.tuner.active) editor.toggleTuner();
        else if (editor.cabPickerOpen) editor.cabPickerOpen = false;
        else if (editor.paletteOpen) editor.paletteOpen = false;
        else if (editor.presetOpen) editor.presetOpen = false;
        else if (editor.editorOpen) editor.closeEditor();
      }
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      if (tp) clearInterval(tp);
      if (tw) clearInterval(tw);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

{#if remoteBoot.active && remoteBoot.phase !== 'ready'}
  <RemoteGate />
{:else}
<div class="app">
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
  <CommandPalette />
  <CabPicker />
  <PresetPicker />
  <SaveDialog />
  <TunerOverlay />
  <CachePrompt />
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
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    position: relative;
  }
</style>
