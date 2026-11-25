<script lang="ts">
  // The cell grid of one page (BeBoard) or of the fixed area (BeFixed): its tiles, the dots and outline of
  // Arrange, and the drop preview of an arrange drag. The grid carries its geometry as data attributes
  // (`data-be-grid`, `data-page`, `data-c`, …): Arrange hit-tests it under the pointer.
  import BeControl from './BeControl.svelte';
  import type { BeGhost } from './beHost';
  import type { PageLayout } from './boardGeometry';
  import { isDivider, type BeItem, type BeRect } from './boardModel';
  import type { BeCtl } from './catalog';

  let {
    page,
    items,
    layout,
    editMode,
    catalog,
    ghost = null,
    target = false
  }: {
    /** Page name, or the fixed area's id. */
    page: string;
    items: readonly BeItem[];
    layout: Pick<PageLayout, 'c' | 'g' | 'cols' | 'rows' | 'W' | 'H'> & { pos?: Record<string, BeRect> };
    editMode: boolean;
    catalog: ReadonlyMap<string, BeCtl>;
    ghost?: BeGhost | null;
    /** Arrange: the bar's tools and the library act here. */
    target?: boolean;
  } = $props();
</script>

<div
  class="be-grid"
  class:arrange={editMode}
  class:target={editMode && target}
  data-be-grid
  data-page={page}
  data-c={layout.c}
  data-g={layout.g}
  data-cols={layout.cols}
  data-rows={layout.rows}
  style:grid-template-columns="repeat({layout.cols}, {layout.c}px)"
  style:grid-template-rows="repeat({layout.rows}, {layout.c}px)"
  style:gap="{layout.g}px"
  style:width="{layout.W}px"
  style:height="{layout.H}px"
  style:--st="{layout.c + layout.g}px"
  style:--ctr="{(layout.c + layout.g / 2).toFixed(1)}px"
>
  {#each items as it (it.id)}
    {@const pos = layout.pos ? layout.pos[it.id] : it}
    {#if pos}
      <BeControl item={it} ctl={isDivider(it) ? undefined : catalog.get(it.key)} {pos} c={layout.c} g={layout.g} {page} />
    {/if}
  {/each}
  {#if ghost && ghost.page === page}
    {#if ghost.h === 0 || ghost.w === 0}
      <!-- a divider drops onto a grid LINE: the line, not a cell, is what it will occupy -->
      {@const st = layout.c + layout.g}
      {#if ghost.h === 0}
        <div
          class="be-ghost line"
          class:bad={!ghost.valid}
          style:left="{ghost.x * st}px"
          style:top="{ghost.y * st - layout.g / 2 - 1.5}px"
          style:width="{Math.max(8, ghost.w * st - layout.g)}px"
        ></div>
      {:else}
        <div
          class="be-ghost line vert"
          class:bad={!ghost.valid}
          style:left="{ghost.x * st - layout.g / 2 - 1.5}px"
          style:top="{ghost.y * st}px"
          style:height="{Math.max(8, ghost.h * st - layout.g)}px"
        ></div>
      {/if}
    {:else}
      <div class="be-ghost" class:bad={!ghost.valid} style:grid-column="{ghost.x + 1} / span {ghost.w}" style:grid-row="{ghost.y + 1} / span {ghost.h}"></div>
    {/if}
  {/if}
</div>

<style>
  .be-grid {
    position: relative;
    display: grid;
    flex: none;
  }
  .be-grid.arrange {
    background-image: radial-gradient(circle at var(--ctr) var(--ctr), color-mix(in srgb, var(--accent) 30%, transparent) 1.2px, transparent 1.7px);
    background-size: var(--st) var(--st);
    outline: 1px dashed color-mix(in srgb, var(--accent) 22%, transparent);
    outline-offset: 5px;
    border-radius: 2px;
  }
  .be-grid.target {
    outline-color: color-mix(in srgb, var(--accent) 75%, transparent);
  }
  .be-ghost {
    z-index: 9;
    pointer-events: none;
    border-radius: 8px;
    border: 2px dashed var(--accent);
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .be-ghost.bad {
    border-color: var(--danger);
    background: color-mix(in srgb, var(--danger) 12%, transparent);
  }
  /* A divider's drop preview is the line it will become. */
  .be-ghost.line {
    position: absolute;
    height: 3px;
    border: 0;
    border-radius: 2px;
    background: var(--accent);
  }
  .be-ghost.line.vert {
    width: 3px;
    height: auto;
  }
  .be-ghost.line.bad {
    background: var(--danger);
  }
</style>
