<script lang="ts">
  import { getWorkbenchContext } from './context';
  import { normalizeRatios, type SplitDockNode } from '../core';

  let {
    split,
    index,
    inert = false
  }: {
    split: SplitDockNode;
    index: number;
    /**
     * A neighbour is a collapsed strip (fixed size): resizing would only change
     * ratios invisibly (and add undo steps), so the handle takes no input.
     */
    inert?: boolean;
  } = $props();

  const { controller } = getWorkbenchContext();

  function down(e: PointerEvent) {
    if (inert) return;
    e.preventDefault();
    const parent = (e.currentTarget as HTMLElement).parentElement;
    const rect = parent?.getBoundingClientRect();
    if (!rect) return;
    const total = split.axis === 'horizontal' ? rect.width : rect.height;
    const start = split.axis === 'horizontal' ? e.clientX : e.clientY;
    const base = normalizeRatios(split.ratio, split.children.length);
    const onMove = (ev: PointerEvent) => {
      const pos = split.axis === 'horizontal' ? ev.clientX : ev.clientY;
      const delta = (pos - start) / Math.max(1, total);
      const next = base.slice();
      const min = 0.08;
      next[index] = Math.max(min, base[index] + delta);
      next[index + 1] = Math.max(min, base[index + 1] - delta);
      controller.dispatch({ type: 'split.resize', splitId: split.id, ratio: next });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = split.axis === 'horizontal' ? 'ew-resize' : 'ns-resize';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    // pointercancel fires no pointerup — tear down and restore the cursor. Nothing is committed on
    // release (every move already resized), so cancelling is the same teardown.
    window.addEventListener('pointercancel', onUp);
  }
</script>

<div
  class="aw-split-handle"
  class:vertical={split.axis === 'horizontal'}
  class:horizontal={split.axis === 'vertical'}
  class:inert
  data-split-handle-inert={inert ? 'true' : undefined}
  role="separator"
  aria-orientation={split.axis === 'horizontal' ? 'vertical' : 'horizontal'}
  onpointerdown={down}
></div>

<style>
  .aw-split-handle {
    flex: none;
    z-index: 3;
    background: var(--aw-border);
    transition: background 0.12s ease;
  }
  .aw-split-handle.vertical {
    width: 4px;
    cursor: ew-resize;
  }
  .aw-split-handle.horizontal {
    height: 4px;
    cursor: ns-resize;
  }
  .aw-split-handle:hover {
    background: var(--aw-accent);
  }
  .aw-split-handle.inert {
    pointer-events: none;
    cursor: default;
  }
</style>
