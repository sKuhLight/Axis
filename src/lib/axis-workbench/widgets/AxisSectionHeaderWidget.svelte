<script lang="ts">
  import { onMount } from 'svelte';
  import { takeAxisPendingSectionEditId } from '../myControlsSections';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { widget, size, dispatch, editMode = false }: AxisWorkbenchWidgetProps = $props();
  const label = $derived(typeof widget.state?.label === 'string' ? widget.state.label : '');
  let editing = $state(false);
  let draft = $state('');
  let input = $state<HTMLInputElement | null>(null);
  $effect(() => { if (editing && input) { input.focus(); input.select(); } });
  function startEdit() { if (!editMode) { draft = label; editing = true; } }
  function commit() {
    if (!editing) return;
    editing = false;
    const next = draft.trim();
    if (next !== label) dispatch({ type: 'widget.state', widgetId: widget.id, state: { label: next } });
  }
  function keydown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === 'Enter') { event.preventDefault(); commit(); }
    else if (event.key === 'Escape') { event.preventDefault(); editing = false; }
  }
  onMount(() => { if (takeAxisPendingSectionEditId() === widget.id) startEdit(); });
</script>

<div class="axis-widget section-header" class:divider={!label} data-size={size}>
  {#if editing}<input class="section-input mono" bind:this={input} bind:value={draft} onblur={commit} onkeydown={keydown} placeholder="Section name" aria-label="Section name" /><span class="section-rule"></span>
  {:else if label}<button class="section-name mono" type="button" title="Rename section" onclick={startEdit}>{label}</button><span class="section-rule"></span>
  {:else}<button class="section-bar" type="button" title="Name this divider" aria-label="Name this divider" onclick={startEdit}><span class="section-rule"></span></button>{/if}
</div>

<style>
  /* Full-row band inside the My Controls grid (the full-width span itself comes
     from `state.grid.colSpan: 'full'`, read by WidgetZone). Height is free rather
     than the widget height so a bare divider stays a thin rule. */
  .section-header {
    width: 100%;
    height: auto;
    min-height: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .section-name,
  .section-input {
    flex: none;
    max-width: 60%;
    border: 0;
    background: transparent;
    color: var(--textdim);
    font: 700 9px/1 var(--font-mono);
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .section-name {
    padding: 2px 0;
    cursor: text;
    text-align: left;
  }
  .section-name:hover {
    color: var(--text);
  }
  .section-input {
    min-width: 0;
    padding: 2px 0;
    border-bottom: 1px solid var(--accent);
    color: var(--text);
    outline: none;
  }
  .section-rule {
    flex: 1;
    height: 1px;
    background: var(--border);
  }
  /* A bare divider is all rule, so the rule itself is the rename target. */
  .section-bar {
    flex: 1;
    display: flex;
    align-items: center;
    padding: 8px 0;
    border: 0;
    background: transparent;
    cursor: pointer;
  }
  .section-bar:hover .section-rule {
    background: var(--accent);
  }
</style>
