<script lang="ts">
  import { editor } from '../../editor.svelte';
  import BlockEditor from '../../BlockEditor.svelte';
  import { getWorkbenchContext } from '../../workbench/svelte/context';

  const { controller } = getWorkbenchContext();
  // Phone-profile only: the block editor expands to ~75% of the height with the grid
  // in map mode above it (axisMobileBlockFlow). The minimize chip is the explicit
  // affordance that collapses it back to the column layout — it closes the editor
  // (keeps the block selected so quick actions stay reachable), which flips the flow's
  // blockOpen signal false and triggers the restore. Hidden on tablet/desktop.
  const isPhone = $derived($controller.activeProfile?.breakpoint === 'phone');
  const minimize = () => editor.closeEditor();
</script>

<div class="axis-pane-fill">
  {#if editor.selected}
    {#if isPhone && editor.editorOpen}
      <div class="axis-be-minbar">
        <button
          type="button"
          class="axis-be-minimize"
          title="Minimize block editor"
          aria-label="Minimize block editor"
          onclick={minimize}
        >
          <span class="axis-be-chevron" aria-hidden="true"></span>
          Minimize
        </button>
      </div>
    {/if}
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
  .axis-be-minbar {
    flex: none;
    display: flex;
    justify-content: center;
    padding: 4px 0 2px;
    background: var(--bg2);
  }
  .axis-be-minimize {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 12px;
    border: 1px solid var(--border, #26262c);
    border-radius: 999px;
    background: var(--surface, #141417);
    color: var(--text2, #cfcfd6);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .axis-be-minimize:hover {
    border-color: var(--border3, #3a3a44);
  }
  .axis-be-minimize:focus-visible {
    outline: 2px solid var(--accent, #35c9d6);
    outline-offset: 2px;
  }
  .axis-be-chevron {
    width: 8px;
    height: 8px;
    border-right: 2px solid currentColor;
    border-bottom: 2px solid currentColor;
    transform: rotate(45deg);
    margin-top: -3px;
  }
  strong {
    color: var(--text);
    font-size: 15px;
  }
  span {
    font-size: 12px;
  }
</style>
