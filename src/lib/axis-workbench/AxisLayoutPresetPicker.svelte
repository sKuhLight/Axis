<script lang="ts">
  import { getWorkbenchContext } from '../workbench';
  import { AXIS_LAYOUT_TAB_KINDS, axisLayoutPresetLabel } from './axisWorkbenchLayoutPresets';
  import { applyAxisLayoutPreset } from './axisWorkbenchLayoutActions';

  // Axis LAYOUT preset tabs for the edit ribbon (design §5 "LAYOUT" tabs:
  // Default / Stage / Studio / Compact). Applying a tab replaces the active
  // profile's layout with that preset, preserving the current rightW.
  const { controller } = getWorkbenchContext();
  const activeKind = $derived(
    (($controller.activeLayout?.settings?.activePreset as string | undefined) ?? 'default')
  );

  function apply(kind: (typeof AXIS_LAYOUT_TAB_KINDS)[number]) {
    applyAxisLayoutPreset(controller, kind);
  }
</script>

<span class="axis-preset-label">Layout</span>
<div class="axis-preset-tabs" role="group" aria-label="Layout presets">
  {#each AXIS_LAYOUT_TAB_KINDS as kind (kind)}
    <button
      class="axis-preset-tab"
      class:active={activeKind === kind}
      type="button"
      aria-pressed={activeKind === kind}
      onclick={() => apply(kind)}
    >
      {axisLayoutPresetLabel(kind)}
    </button>
  {/each}
</div>

<style>
  .axis-preset-label {
    flex: 0 0 auto;
    color: var(--aw-text-faint);
    font: 700 10px/1 var(--aw-font-mono);
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .axis-preset-tabs {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px;
    border: 1px solid var(--aw-border-2);
    border-radius: 9px;
    background: var(--aw-bg-2);
  }
  .axis-preset-tab {
    height: 28px;
    padding: 0 12px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--aw-text-muted);
    cursor: pointer;
    font: 600 11px/1 var(--aw-font-ui);
  }
  .axis-preset-tab:hover {
    color: var(--aw-text);
  }
  .axis-preset-tab.active {
    background: var(--aw-accent);
    color: var(--aw-accent-ink);
  }
</style>
