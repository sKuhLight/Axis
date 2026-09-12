<script lang="ts">
  import { editor } from '$lib/editor/editor.svelte';
  import { SCENE_NAME_MAX, sceneNameDisplay, storedSceneName } from './sceneNameState';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { size, editMode = false }: AxisWorkbenchWidgetProps = $props();
  const mini = $derived(size === 'mini');
  const expanded = $derived(size === 'default');
  const notMini = $derived(size !== 'mini');
  const sceneCount = $derived(Math.max(1, editor.sceneCount || 8));
  const activeScene = $derived(Math.max(1, Math.min(sceneCount, editor.scene || 1)));
  const sceneLabel = $derived(sceneNameDisplay(editor.sceneNames, activeScene));
  let editingScene = $state(false);
  let draftScene = $state('');
  let renameTarget = $state(1);
  const focusSel = (element: HTMLInputElement) => { element.focus(); element.select(); };
  function startRename() {
    if (editMode || !editor.canRenameScenes) return;
    renameTarget = activeScene;
    draftScene = storedSceneName(editor.sceneNames, renameTarget);
    editingScene = true;
  }
  function commitName() {
    if (!editingScene) return;
    editingScene = false;
    const next = draftScene.trim();
    if (next !== storedSceneName(editor.sceneNames, renameTarget)) void editor.renameScene(renameTarget, next);
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Enter') (event.currentTarget as HTMLInputElement).blur();
    else if (event.key === 'Escape') editingScene = false;
  }
</script>

<div class="axis-widget chips scenes" data-size={size}>
  {#if expanded}<span class="mono token">SCN</span>{/if}
  <div class="chip-row">
    {#each Array(sceneCount) as _, i}{@const scene = i + 1}{#if !mini || activeScene === scene}<button class="num-chip" class:on={activeScene === scene} type="button" title={editor.sceneName(scene)} onclick={() => editor.selectScene(mini ? (activeScene % sceneCount) + 1 : scene)}>{scene}</button>{/if}{/each}
  </div>
  {#if notMini}
    {#if editor.canRenameScenes}
      {#if editingScene}<input class="scene-name-in mono" bind:value={draftScene} maxlength={SCENE_NAME_MAX} placeholder="Scene {activeScene} name" use:focusSel onkeydown={keydown} onblur={commitName} />
      {:else}<button class="scene-name" class:empty={sceneLabel.empty} type="button" title="Rename scene {activeScene}" onclick={startRename}>{sceneLabel.text}</button>{/if}
    {:else if !sceneLabel.empty}<span class="scene-name readonly">{sceneLabel.text}</span>{/if}
  {/if}
</div>

<style>
  .axis-widget.scenes {
    flex: 1 1 0;
  }
  /* Active scene name shares the top-bar space with the preset name. */
  .axis-widget .scene-name {
    flex: 1 1 0;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--text2);
    font-size: 15px;
    font-weight: 700;
    background: none;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 3px 6px;
    cursor: text;
  }
  .axis-widget .scene-name:hover {
    border-color: var(--border3);
    color: var(--text);
  }
  .axis-widget .scene-name.readonly {
    cursor: default;
  }
  .axis-widget .scene-name.readonly:hover {
    border-color: transparent;
    color: var(--text2);
  }
  .axis-widget .scene-name.empty {
    color: var(--textfaint);
    font-style: italic;
  }
  .axis-widget .scene-name-in {
    flex: 1 1 0;
    min-width: 0;
    color: var(--text);
    background: var(--bg2);
    border: 1px solid var(--accent);
    border-radius: 6px;
    padding: 3px 6px;
    font-size: 15px;
    font-weight: 700;
    outline: none;
  }
  /* must follow the .axis-widget rules above — equal specificity, later wins */
  [data-size='compact'] .scene-name,
  [data-size='compact'] .scene-name-in {
    font-size: 13px;
    padding: 2px 5px;
  }
</style>
