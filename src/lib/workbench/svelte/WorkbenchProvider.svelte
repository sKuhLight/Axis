<script lang="ts">
  import { untrack } from 'svelte';
  import { setWorkbenchContext } from './context';
  import type { WorkbenchController } from './controller.svelte';
  import type { WorkbenchRenderRegistry } from './renderRegistry';
  import type { WorkbenchEditBarExtension } from './editBarMenus';

  let {
    controller,
    registry,
    editBar,
    children
  }: {
    controller: WorkbenchController;
    registry: WorkbenchRenderRegistry;
    editBar?: WorkbenchEditBarExtension;
    children?: import('svelte').Snippet;
  } = $props();

  const initialController = untrack(() => controller);
  const initialRegistry = untrack(() => registry);
  const initialEditBar = untrack(() => editBar);
  setWorkbenchContext({ controller: initialController, registry: initialRegistry, editBar: initialEditBar });
</script>

{@render children?.()}
