<script lang="ts">
  import { deviceSession, editorOverlays, presetBuffer } from '$lib/editor/editorClients.svelte';
  import { getOptionalWorkbenchContext } from '../../workbench';
  import { createAxisHoldRepeat } from './widgetControls';
  import { resolvePresetWidgetTarget } from './presetWidgetTarget';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';

  let { size, dispatch }: AxisWorkbenchWidgetProps = $props();
  const mini = $derived(size === 'mini');
  const pnumRaw = $derived(deviceSession.preset && deviceSession.preset.number >= 0 ? deviceSession.preset.number : -1);
  const pnum = $derived(pnumRaw >= 0 ? String(pnumRaw).padStart(3, '0') : '---');
  const pname = $derived(deviceSession.preset?.name || (deviceSession.conn.state === 'online' ? 'DEBUG' : 'offline'));
  const workbench = getOptionalWorkbenchContext()?.controller ?? null;
  let activePageId = $state<string | undefined>(workbench?.activePage?.id);
  $effect(() => {
    if (!workbench) return;
    return workbench.subscribe((controller) => (activePageId = controller.activePage?.id));
  });
  const presetTarget = $derived(resolvePresetWidgetTarget(activePageId));

  function step(delta: number) {
    if (pnumRaw < 0) {
      editorOverlays.presetOpen = true;
      return;
    }
    void presetBuffer.selectPreset(Math.max(0, pnumRaw + delta));
  }
  function open() {
    if (presetTarget.type === 'openPresetSearch') editorOverlays.presetSearchOpen = true;
    else dispatch({ type: 'page.activate', pageId: presetTarget.pageId });
  }
  const previous = createAxisHoldRepeat(() => step(-1));
  const next = createAxisHoldRepeat(() => step(1));
  $effect(() => () => { previous.stop(); next.stop(); });
</script>

<div class="axis-widget axis-preset" data-size={size}>
  <div class="preset-pager">
    {#if !mini}<button class="preset-arrow" type="button" title="Previous preset (hold to scan)" aria-label="Previous preset" onclick={() => step(-1)} onpointerdown={(event) => previous.start(event)} onpointerup={previous.stop} onpointerleave={previous.stop}>‹</button>{/if}
    <span class="mono preset-num">{pnum}</span>
    {#if !mini}<button class="preset-arrow" type="button" title="Next preset (hold to scan)" aria-label="Next preset" onclick={() => step(1)} onpointerdown={(event) => next.start(event)} onpointerup={next.stop} onpointerleave={next.stop}>›</button>{/if}
  </div>
  <button class="preset-main" type="button" title={presetTarget.title} onclick={open}>
    <span class="preset-name">{pname}</span>
  </button>
</div>

<style>
  .axis-preset {
    width: max-content;
    padding: 0;
    gap: 6px;
    overflow: visible;
    border-color: transparent;
    background: transparent;
  }
  .preset-pager,
  .preset-main {
    height: 100%;
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--bg2);
  }
  .preset-pager {
    flex: none;
    overflow: hidden;
  }
  .preset-main,
  .preset-arrow {
    color: var(--textdim);
    cursor: pointer;
  }
  .preset-main {
    flex: none;
    padding: 0 12px;
    color: var(--text2);
  }
  .preset-main:hover,
  .preset-pager:has(.preset-arrow:hover) {
    border-color: var(--border3);
  }
  .preset-arrow {
    width: 36px;
    height: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--surface);
    font-size: 17px;
  }
  .preset-arrow:first-child {
    border-right: 1px solid var(--border);
  }
  .preset-arrow:last-child {
    border-left: 1px solid var(--border);
  }
  .preset-num {
    width: 42px;
    text-align: center;
    color: var(--amber);
    font-size: 14px;
    font-weight: 800;
  }
  .preset-name {
    color: var(--text);
    font-size: 15px;
    font-weight: 700;
    white-space: nowrap;
  }
  [data-size='compact'] .preset-arrow {
    width: 32px;
  }
  [data-size='compact'] .preset-num {
    width: 38px;
    font-size: 13px;
  }
  [data-size='compact'] .preset-main {
    padding-inline: 10px;
  }
  [data-size='compact'] .preset-name {
    font-size: 13px;
  }
  [data-size='mini'] .preset-pager {
    padding-inline: 7px;
  }
  [data-size='mini'] .preset-num {
    width: auto;
    font-size: 12px;
  }
  [data-size='mini'] .preset-main {
    padding-inline: 8px;
  }
  [data-size='mini'] .preset-name {
    font-size: 11px;
  }
</style>
