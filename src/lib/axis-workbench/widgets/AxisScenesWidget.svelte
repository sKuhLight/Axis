<script lang="ts">
  import { tick } from 'svelte';
  import { deviceSession } from '$lib/editor/editorClients.svelte';
  import { effectiveZoom } from '$lib/workbench/svelte/contextMenu';
  import { SCENE_NAME_MAX, sceneNameDisplay, storedSceneName } from './sceneNameState';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';

  let { size, editMode = false }: AxisWorkbenchWidgetProps = $props();
  const mini = $derived(size === 'mini');
  const sceneCount = $derived(Math.max(1, deviceSession.sceneCount || 8));
  const activeScene = $derived(Math.max(1, Math.min(sceneCount, deviceSession.scene || 1)));
  const sceneLabel = $derived(sceneNameDisplay(deviceSession.sceneNames, activeScene));
  const scenes = $derived(Array.from({ length: sceneCount }, (_, index) => ({
    number: index + 1,
    label: sceneNameDisplay(deviceSession.sceneNames, index + 1)
  })));
  let open = $state(false);
  let menu = $state<{ left: number; top: number; minWidth: number } | null>(null);
  let triggerEl = $state<HTMLButtonElement | null>(null);
  let menuEl = $state<HTMLDivElement | null>(null);
  let scrimEl = $state<HTMLButtonElement | null>(null);
  let editingScene = $state(false);
  let draftScene = $state('');
  let renameTarget = $state(1);
  const focusSel = (element: HTMLInputElement) => { element.focus(); element.select(); };

  const zoomNow = () => (scrimEl ? effectiveZoom(scrimEl.getBoundingClientRect().width, scrimEl.offsetWidth) : 1);
  function place() {
    const rect = triggerEl?.getBoundingClientRect();
    if (!rect) return null;
    const zoom = zoomNow();
    const menuRect = menuEl?.getBoundingClientRect();
    const menuWidth = menuRect?.width ?? Math.max(rect.width, 360);
    const menuHeight = menuRect?.height ?? sceneCount * 38 + 12;
    const below = window.innerHeight - rect.bottom;
    const visualTop = below < menuHeight + 8 && rect.top > below ? rect.top - menuHeight - 4 : rect.bottom + 4;
    return {
      left: Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8)) / zoom,
      top: Math.max(8, visualTop) / zoom,
      minWidth: rect.width / zoom
    };
  }
  function toggle() {
    if (editMode) return;
    if (open) {
      open = false;
      return;
    }
    menu = place();
    open = true;
    void tick().then(() => {
      if (open) menu = place();
    });
  }
  function select(scene: number) {
    open = false;
    void deviceSession.selectScene(scene);
  }
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        if (node.parentNode === document.body) document.body.removeChild(node);
      }
    };
  }
  function startRename() {
    if (editMode || !deviceSession.canRenameScenes) return;
    open = false;
    renameTarget = activeScene;
    draftScene = storedSceneName(deviceSession.sceneNames, renameTarget);
    editingScene = true;
  }
  function commitName() {
    if (!editingScene) return;
    editingScene = false;
    const next = draftScene.trim();
    if (next !== storedSceneName(deviceSession.sceneNames, renameTarget)) void deviceSession.renameScene(renameTarget, next);
  }
  function inputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') (event.currentTarget as HTMLInputElement).blur();
    else if (event.key === 'Escape') editingScene = false;
  }
  function windowKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) open = false;
  }
</script>

<svelte:window onkeydown={windowKeydown} />

<div class="axis-widget scenes" data-size={size}>
  {#if editingScene}
    <input class="scene-name-in" bind:value={draftScene} maxlength={SCENE_NAME_MAX} placeholder="Scene {activeScene} name" use:focusSel onkeydown={inputKeydown} onblur={commitName} />
  {:else}
    <button class="scene-trigger" class:open class:empty={sceneLabel.empty} type="button" aria-haspopup="listbox" aria-expanded={open} bind:this={triggerEl} onclick={toggle}>
      {#if !mini}<span class="mono token">SCN</span>{/if}
      <span class="mono scene-num">{activeScene}</span>
      <span class="scene-name">{sceneLabel.text}</span>
      <span class="scene-caret">⌄</span>
    </button>
    {#if !mini && deviceSession.canRenameScenes}
      <button class="scene-rename" type="button" title="Rename scene {activeScene}" aria-label="Rename scene {activeScene}" onclick={startRename}>✎</button>
    {/if}
  {/if}
</div>

{#if open && menu}
  <div class="scene-portal" use:portal>
    <button class="scene-backdrop" bind:this={scrimEl} type="button" aria-label="Close scenes" onclick={() => (open = false)}></button>
    <div class="scene-menu" role="listbox" aria-label="Scenes" bind:this={menuEl} style:left="{menu.left}px" style:top="{menu.top}px" style:min-width="{menu.minWidth}px">
      {#each scenes as scene (scene.number)}
        <button class="scene-option" class:active={scene.number === activeScene} type="button" role="option" aria-selected={scene.number === activeScene} onclick={() => select(scene.number)}>
          <span class="mono option-num">{scene.number}</span>
          <span class:empty={scene.label.empty}>{scene.label.text}</span>
          <span class="option-check">{scene.number === activeScene ? '✓' : ''}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .axis-widget.scenes {
    width: max-content;
    padding: 0;
    gap: 4px;
    overflow: visible;
    border-color: transparent;
    background: transparent;
  }
  .scene-trigger,
  .scene-name-in {
    height: 100%;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg2);
    color: var(--text);
  }
  .scene-trigger {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px;
    cursor: pointer;
  }
  .scene-trigger:hover,
  .scene-trigger.open {
    border-color: var(--border3);
  }
  .scene-trigger.empty .scene-name,
  .scene-option .empty {
    color: var(--textfaint);
    font-style: italic;
  }
  .scene-num {
    width: 26px;
    height: 26px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    border-radius: 7px;
    background: var(--accent);
    color: var(--accentink);
    font-size: 11px;
    font-weight: 800;
  }
  .scene-name {
    white-space: nowrap;
    font-size: 14px;
    font-weight: 700;
  }
  .scene-caret {
    flex: none;
    color: var(--textfaint);
    font-size: 12px;
    transition: transform 0.12s ease;
  }
  .scene-trigger.open .scene-caret {
    transform: rotate(180deg);
  }
  .scene-rename {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    border-radius: 7px;
    background: transparent;
    color: var(--textfaint);
    cursor: pointer;
    font-size: 12px;
  }
  .scene-rename:hover {
    background: var(--surface);
    color: var(--text);
  }
  .scene-name-in {
    width: 32ch;
    padding: 0 10px;
    border-color: var(--accent);
    outline: none;
    font-size: 14px;
    font-weight: 700;
  }
  .scene-backdrop {
    position: fixed;
    inset: 0;
    z-index: 239;
    border: 0;
    background: transparent;
    cursor: default;
  }
  .scene-portal {
    display: contents;
  }
  .scene-menu {
    position: fixed;
    z-index: 240;
    width: max-content;
    max-height: calc(100vh - 16px);
    overflow-y: auto;
    padding: 6px;
    border: 1px solid var(--border2);
    border-radius: 11px;
    background: var(--surface2);
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55);
  }
  .scene-option {
    width: 100%;
    min-width: 0;
    height: 34px;
    display: grid;
    grid-template-columns: 24px max-content 18px;
    align-items: center;
    gap: 9px;
    padding: 0 9px;
    appearance: none;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text2);
    cursor: pointer;
    text-align: left;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }
  .scene-option:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  .scene-option.active {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--text);
  }
  .option-num {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: var(--surface);
    color: var(--textfaint);
    font-size: 10px;
    font-weight: 800;
  }
  .scene-option.active .option-num {
    background: var(--accent);
    color: var(--accentink);
  }
  .option-check {
    color: var(--accent);
  }
  [data-size='compact'] .scene-trigger {
    gap: 6px;
    padding-inline: 8px;
  }
  [data-size='compact'] .scene-num {
    width: 23px;
    height: 23px;
    font-size: 10px;
  }
  [data-size='compact'] .scene-name,
  [data-size='compact'] .scene-name-in {
    font-size: 12px;
  }
  [data-size='mini'] .scene-trigger {
    gap: 5px;
    padding-inline: 7px;
  }
  [data-size='mini'] .scene-num {
    width: 22px;
    height: 22px;
    font-size: 10px;
  }
  [data-size='mini'] .scene-name {
    font-size: 11px;
  }
</style>
