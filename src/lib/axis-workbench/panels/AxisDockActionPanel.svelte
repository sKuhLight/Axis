<script lang="ts">
  import { editor } from '../../editor.svelte';
  import type { PanelInstance } from '../../workbench';

  let { panel }: { panel: PanelInstance } = $props();

  function open() {
    if (panel.type === 'axis.account') editor.openAxis('account');
    else if (panel.type === 'axis.deviceTools') editor.deviceToolsOpen = true;
  }
</script>

<div class="dock-action">
  <strong>{panel.title ?? 'Axis Panel'}</strong>
  <span>This surface is available through the existing Axis modal while Workbench pane mode is being migrated.</span>
  <button onclick={open}>Open</button>
</div>

<style>
  .dock-action {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    gap: 10px;
    padding: 20px;
    text-align: center;
    background: var(--bg2);
    color: var(--textdim);
  }
  strong {
    color: var(--text);
    font-size: 15px;
  }
  span {
    max-width: 340px;
    font-size: 12px;
    line-height: 1.4;
  }
  button {
    justify-self: center;
    height: 34px;
    padding: 0 14px;
    border: 1px solid var(--accent-border);
    border-radius: 8px;
    background: var(--accent-tint);
    color: var(--accent);
    cursor: pointer;
    font-weight: 800;
  }
</style>
