<script lang="ts">
  import { untrack } from 'svelte';
  import { setWorkbenchContext } from './context';
  import type { WorkbenchController } from './controller.svelte';
  import type { WorkbenchRenderRegistry } from './renderRegistry';

  let {
    controller,
    registry,
    children
  }: {
    controller: WorkbenchController;
    registry: WorkbenchRenderRegistry;
    children?: import('svelte').Snippet;
  } = $props();

  const initialController = untrack(() => controller);
  const initialRegistry = untrack(() => registry);
  setWorkbenchContext({ controller: initialController, registry: initialRegistry });
</script>

{@render children?.()}
