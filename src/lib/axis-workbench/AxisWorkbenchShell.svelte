<script lang="ts">
  import { onMount } from 'svelte';
  import WorkbenchHost from '../workbench/svelte/WorkbenchHost.svelte';
  import { axisWorkbenchController, axisWorkbenchInit } from './axisWorkbenchStore.svelte';
  import { axisWorkbenchRegistry } from './axisWorkbenchRegistry';
  import { axisWorkbenchTheme } from './axisWorkbenchTheme';

  onMount(() => {
    void axisWorkbenchInit();
  });
</script>

<WorkbenchHost controller={axisWorkbenchController} registry={axisWorkbenchRegistry} theme={axisWorkbenchTheme} />
