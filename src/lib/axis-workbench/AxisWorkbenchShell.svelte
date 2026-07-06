<script lang="ts">
  import { onMount } from 'svelte';
  import WorkbenchHost from '../workbench/svelte/WorkbenchHost.svelte';
  import AxisLayoutPresetPicker from './AxisLayoutPresetPicker.svelte';
  import { axisWorkbenchController, axisWorkbenchInit } from './axisWorkbenchStore.svelte';
  import { axisWorkbenchRegistry } from './axisWorkbenchRegistry';
  import { axisWorkbenchTheme } from './axisWorkbenchTheme';
  import { seedAxisProfiles } from './axisWorkbenchLayoutActions';

  // Ensure the tablet/mobile profiles exist (seeded from their presets) so the
  // profile switcher always has a layout to show. Idempotent.
  seedAxisProfiles(axisWorkbenchController);

  onMount(() => {
    void axisWorkbenchInit();
  });
</script>

{#snippet ribbonExtras()}
  <AxisLayoutPresetPicker />
{/snippet}

<WorkbenchHost
  controller={axisWorkbenchController}
  registry={axisWorkbenchRegistry}
  theme={axisWorkbenchTheme}
  {ribbonExtras}
/>
