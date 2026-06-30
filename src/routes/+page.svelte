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
  import Toast from '$lib/Toast.svelte';

  onMount(() => {
    editor.setViewport(window.innerWidth, window.innerHeight);
    editor.init();
    editor.poll();
    const tp = setInterval(() => editor.poll(), 5000);
    const tw = setInterval(() => editor.watchPreset(), 4000);

    const onResize = () => editor.setViewport(window.innerWidth, window.innerHeight);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        editor.paletteMode = 'place';
        editor.placeTarget = null;
        editor.paletteOpen = true;
      } else if (e.key === 'Escape') {
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
      clearInterval(tp);
      clearInterval(tw);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  });
</script>

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
  </div>
  <CommandPalette />
  <CabPicker />
  <PresetPicker />
  <SaveDialog />
  <TunerOverlay />
  <CachePrompt />
  <Toast />
</div>

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
