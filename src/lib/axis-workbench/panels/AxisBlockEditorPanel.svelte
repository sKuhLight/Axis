<script lang="ts">
  import { editor } from '../../editor.svelte';
  import BlockEditor from '../../BlockEditor.svelte';
</script>

<div class="axis-pane-fill">
  {#if editor.selected}
    <BlockEditor embedded />
  {:else}
    <div class="axis-pane-empty">
      <strong>Block Editor</strong>
      <span>Select a block in the grid to edit its parameters.</span>
    </div>
  {/if}
</div>

<style>
  .axis-pane-fill {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg2);
  }
  .axis-pane-empty {
    flex: 1;
    display: grid;
    place-content: center;
    gap: 8px;
    text-align: center;
    color: var(--textdim);
  }
  strong {
    color: var(--text);
    font-size: 15px;
  }
  span {
    font-size: 12px;
  }
</style>
