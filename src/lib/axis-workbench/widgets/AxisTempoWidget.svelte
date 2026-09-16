<script lang="ts">
  import { deviceSession } from '$lib/editor/editorClients.svelte';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';
  let { size, editMode = false }: AxisWorkbenchWidgetProps = $props();
  const notMini = $derived(size !== 'mini');
  let editing = $state(false);
  let draft = $state<string | number>('');
  let input = $state<HTMLInputElement | null>(null);
  // A click that lands outside the field first blurs it (committing the edit), then
  // bubbles to the widget as a tap. Swallow that one tap so committing never also
  // fires tap tempo. Set on pointerdown (not blur) so leaving the field with Tab
  // doesn't eat the next tap.
  let skipTap = false;
  $effect(() => {
    if (editing && input) {
      input.focus();
      input.select();
    }
  });
  function startEdit(event: MouseEvent) {
    event.stopPropagation();
    if (editMode) return;
    draft = deviceSession.bpm;
    editing = true;
  }
  function commit() {
    if (!editing) return;
    editing = false;
    deviceSession.setBpm(Number(draft));
  }
  function cancel() {
    editing = false;
  }
  function rootPointerDown(event: PointerEvent) {
    if (editing && event.target !== input) skipTap = true;
  }
  function keydown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  }
  function tap() {
    if (skipTap) {
      skipTap = false;
      return;
    }
    void deviceSession.tapTempo();
  }
  function rootKeydown(event: KeyboardEvent) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      tap();
    }
  }
</script>

<div
  class="axis-widget tempo"
  data-size={size}
  role="button"
  tabindex="0"
  title="Tap tempo · B · click the number to type"
  aria-label="Tempo — tap to tap tempo"
  onclick={tap}
  onpointerdown={rootPointerDown}
  onkeydown={rootKeydown}
>
  {#if editing}
    <input
      class="bpm-input mono"
      type="number"
      min="20"
      max="250"
      inputmode="numeric"
      bind:this={input}
      bind:value={draft}
      onblur={commit}
      onkeydown={keydown}
      onclick={(event) => event.stopPropagation()}
      aria-label="Tempo in BPM"
    />
  {:else}
    <button class="bpm-value mono" type="button" title="Click to type" onclick={startEdit}>{deviceSession.bpm}</button>
  {/if}
  {#if notMini}<span class="mono token">BPM</span>{/if}
</div>

<style>
  .axis-widget.tempo {
    cursor: pointer;
  }
  .bpm-value,
  .bpm-input {
    flex: none;
    width: 4ch;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text);
    font-size: 14px;
    font-weight: 800;
    line-height: 1;
    text-align: left;
  }
  .bpm-value {
    appearance: none;
    cursor: text;
  }
  .bpm-value:hover {
    color: var(--accent);
  }
  .bpm-input {
    color: var(--accent);
    outline: none;
    appearance: textfield;
    -moz-appearance: textfield;
  }
  .bpm-input::-webkit-outer-spin-button,
  .bpm-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  [data-size='compact'] .bpm-value,
  [data-size='compact'] .bpm-input {
    font-size: 13px;
  }
</style>
