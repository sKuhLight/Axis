<script lang="ts">
  import ContextMenu from '../../workbench/svelte/ContextMenu.svelte';
  import { menuPositionBelowRect, type WorkbenchMenuItem, type WorkbenchMenuPosition } from '../../workbench/svelte/contextMenu';
  import { overlays } from '$lib/overlay/overlays.svelte';
  import { startBlankPreset } from '$lib/preset/newPreset';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';

  let { size, editMode = false }: AxisWorkbenchWidgetProps = $props();

  let menuOpen = $state(false);
  let menuPos = $state<WorkbenchMenuPosition>({ x: 0, y: 0 });

  // "New preset": start from a saved template, start from zero (a clean blank preset), or save the
  // current buffer back into the templates folder.
  const items: WorkbenchMenuItem[] = [
    { id: 'template', label: 'New from template…', run: () => overlays.open('presetTemplates') },
    { id: 'saveTemplate', label: 'Save preset as template…', separatorBefore: true, run: () => overlays.open('presetTemplateSave') },
    { id: 'blank', label: 'Clear grid', separatorBefore: true, run: () => void startBlankPreset() }
  ];

  function openMenu(event: MouseEvent) {
    if (editMode) return;
    event.stopPropagation();
    menuPos = menuPositionBelowRect((event.currentTarget as HTMLElement).getBoundingClientRect());
    menuOpen = true;
  }
</script>

<!-- "New preset": a bare + beside the preset/scene cluster. It opens a menu — start from a template,
     save the current buffer as a template, or clear the buffer to a blank preset. -->
<button
  class="axis-widget new-preset"
  class:clickable={!editMode}
  data-size={size}
  type="button"
  title="New preset"
  aria-label="New preset"
  aria-haspopup="menu"
  aria-expanded={menuOpen}
  onclick={openMenu}
>+</button>

<ContextMenu open={menuOpen} position={menuPos} {items} label="New preset" onClose={() => (menuOpen = false)} />

<style>
  /* Neutral chrome, same weight as the preset/scene widgets beside it — the + is a quiet
     affordance, not a highlighted call-to-action. */
  .new-preset {
    width: 38px;
    height: 38px;
    flex: none;
    padding: 0;
    display: inline-grid;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg2);
    color: var(--textdim);
    font: 800 20px/1 var(--font-ui);
  }
  .new-preset.clickable {
    cursor: pointer;
  }
  .new-preset:hover {
    border-color: var(--border3);
    color: var(--text2);
  }
  [data-size='compact'],
  [data-size='mini'] {
    width: 32px;
    height: 32px;
    font-size: 18px;
  }
</style>
