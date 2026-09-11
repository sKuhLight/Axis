<script lang="ts">
  import { editor } from '$lib/editor/editor.svelte';
  import { getOptionalWorkbenchContext } from '../../workbench';
  import { createAxisHoldRepeat } from './widgetControls';
  import { resolvePresetWidgetTarget } from './presetWidgetTarget';
  import type { AxisWorkbenchWidgetProps } from './widgetProps';

  let { size, dispatch }: AxisWorkbenchWidgetProps = $props();
  const mini = $derived(size === 'mini');
  const expanded = $derived(size === 'default');
  const pnumRaw = $derived(editor.preset && editor.preset.number >= 0 ? editor.preset.number : -1);
  const pnum = $derived(pnumRaw >= 0 ? String(pnumRaw).padStart(3, '0') : '---');
  const pname = $derived(editor.preset?.name || (editor.conn.state === 'online' ? 'DEBUG' : 'offline'));
  const workbench = getOptionalWorkbenchContext()?.controller ?? null;
  let activePageId = $state<string | undefined>(workbench?.activePage?.id);
  $effect(() => {
    if (!workbench) return;
    return workbench.subscribe((controller) => (activePageId = controller.activePage?.id));
  });
  const presetTarget = $derived(resolvePresetWidgetTarget(activePageId));

  function step(delta: number) {
    if (pnumRaw < 0) {
      editor.presetOpen = true;
      return;
    }
    void editor.selectPreset(Math.max(0, pnumRaw + delta));
  }
  function open() {
    if (presetTarget.type === 'openPresetSearch') editor.presetSearchOpen = true;
    else dispatch({ type: 'page.activate', pageId: presetTarget.pageId });
  }
  const previous = createAxisHoldRepeat(() => step(-1));
  const next = createAxisHoldRepeat(() => step(1));
  $effect(() => () => { previous.stop(); next.stop(); });
</script>

<div class="axis-widget axis-preset" data-size={size}>
  {#if !mini}<button class="preset-arrow" type="button" title="Previous preset (hold to scan)" onclick={() => step(-1)} onpointerdown={(event) => previous.start(event)} onpointerup={previous.stop} onpointerleave={previous.stop}>‹</button>{/if}
  <button class="preset-main" type="button" title={presetTarget.title} onclick={open}>
    <span class="mono token">PRE</span><span class="mono preset-num">{pnum}</span>{#if expanded}<span class="preset-name">{pname}</span>{/if}
  </button>
  {#if !mini}<button class="preset-arrow" type="button" title="Next preset (hold to scan)" onclick={() => step(1)} onpointerdown={(event) => next.start(event)} onpointerup={next.stop} onpointerleave={next.stop}>›</button>{/if}
</div>

<style>
  .axis-preset {
    width: 420px;
    padding: 0;
    gap: 0;
  }
  .preset-main,
  .preset-arrow {
    height: 100%;
    display: inline-flex;
    align-items: center;
    background: transparent;
    color: var(--textdim);
    cursor: pointer;
  }
  .preset-main {
    flex: 1 1 0;
    min-width: 0;
    gap: 9px;
    padding: 0 8px;
    color: var(--text2);
  }
  .preset-arrow {
    width: 24px;
    justify-content: center;
    font-size: 17px;
  }
  .preset-num {
    color: var(--amber);
    font-size: 14px;
    font-weight: 800;
  }
  .preset-name {
    flex: 1 1 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text);
    font-size: 16px;
    font-weight: 700;
  }
</style>
