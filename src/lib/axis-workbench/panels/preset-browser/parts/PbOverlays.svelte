<script lang="ts">
  import { library } from '$lib/preset/library.svelte';
  import ContextMenu from '../../../../workbench/svelte/ContextMenu.svelte';
  import { TAG_SWATCH_COUNT, tagSwatchCss } from '$lib/preset/tagColors';
  import type { AxisPresetBrowserPartView } from '../../../presetBrowser/presetBrowserWorkbenchView.svelte';

  let { view }: { view: AxisPresetBrowserPartView } = $props();
</script>

<!-- §4.4 row context menu — rendered once, on the overlay-owner part (§1 rank rule: list < detail <
     sources < full) so split layouts never double-render the menu. Anchored in fixed/viewport coords so
     it works cross-panel. -->
{#if view.isOwner}
  <ContextMenu open={view.menuOpen} position={view.menuPos} items={view.menuItems} label="Preset actions" onClose={() => (view.menuOpen = false)} />
{/if}

<!-- Toolbar overflow menu (Re-scan device / Convert Preset…). Local to the query-bar owner. -->
<ContextMenu open={view.toolsOpen} position={view.toolsPos} items={view.toolsItems} label="Preset tools" onClose={() => (view.toolsOpen = false)} />

<!-- V13e add-filter / param / value picker popover (§2.5, §4.4). Local to the instance that owns the query
     bar (list/full); anchored in viewport coords. A window click or Esc closes it. -->
<svelte:window
  onclick={() => { if (view.picker) view.picker = null; if (view.tagMenu) view.tagMenu = null; }}
  onkeydown={view.onWindowKey}
  ondragend={() => (view.dragOver = false)}
/>
{#if view.picker}
  {@const picker = view.picker}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="pk-pop"
    bind:this={view.pickerEl}
    style:left={view.pickerPos.x + 'px'}
    style:top={view.pickerPos.y + 'px'}
    role="dialog"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={view.onPickerKey}
  >
    <div class="pk-h">
      <div class="pk-lbl">{picker.kind === 'addfilter' ? 'Add a filter' : picker.kind === 'tag' ? 'Pick a tag' : picker.kind === 'edittags' ? `Tags for ${picker.ctx.entryName ?? 'preset'}` : picker.kind === 'param' ? 'Pick a parameter' : 'Pick a value'}</div>
      <div class="pk-search">
        <span aria-hidden="true">⌕</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={view.pickerSearch} onkeydown={view.onPickerKey} placeholder="Search…" spellcheck="false" autocomplete="off" autofocus />
      </div>
    </div>
    <div class="pk-list">
      {#each view.pickerList as it, i}
        <button type="button" class="pk-item" class:hi={i === view.pickerHi} onclick={() => view.pickerPick(it.v)} onmouseenter={() => (view.pickerHi = i)}>
          {#if it.dot}<span class="fdot" style:background={it.color}></span>{/if}
          <span class="pk-l">{it.label}</span><span class="fsp"></span>
          {#if it.checked}<span class="pk-check" aria-hidden="true">✓</span>{/if}
          <span class="pk-s">{it.sub}</span>
        </button>
      {/each}
      {#if !view.pickerList.length}<div class="pk-empty">No matches</div>{/if}
    </div>
  </div>
{/if}

<!-- §4.5 tag color swatch grid — right-click (or long-press) a tag anywhere it renders. Rendered once,
     on the overlay-owner part, same rank rule as the row context menu. -->
{#if view.isOwner && view.tagMenu}
  {@const tagMenu = view.tagMenu}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="pk-pop tag-swatch-pop"
    bind:this={view.tagMenuEl}
    style:left={view.tagMenuPos.x + 'px'}
    style:top={view.tagMenuPos.y + 'px'}
    role="dialog"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={view.onWindowKey}
  >
    <div class="pk-h">
      <div class="pk-lbl">Rename</div>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="rename-in"
        type="text"
        maxlength="32"
        autofocus
        spellcheck="false"
        aria-label="Rename tag"
        bind:value={view.tagRenameValue}
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') view.commitTagRename();
          else if (e.key === 'Escape') view.tagMenu = null;
        }}
      />
    </div>
    <div class="pk-sub"><div class="pk-lbl">Change color</div></div>
    <div class="swatch-grid">
      {#each Array.from({ length: TAG_SWATCH_COUNT }, (_, i) => i) as i}
        <!-- The current swatch is the one whose CSS matches what colorOf resolves to, so the tick
             follows the same single resolver every render site uses rather than re-deriving the index. -->
        {@const on = tagSwatchCss(i) === library.colorOf(tagMenu.tag)}
        <button
          type="button"
          class="swatch"
          class:on
          style:background={tagSwatchCss(i)}
          aria-label={`Hue ${i * 18}°`}
          aria-pressed={on}
          title={`Hue ${i * 18}°`}
          onclick={() => view.pickTagSwatch(i)}
        >{#if on}<span class="swatch-tick" aria-hidden="true">✓</span>{/if}</button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .fsp {
    flex: 1;
  }
  .fdot {
    width: 8px;
    height: 8px;
    flex: none;
    border-radius: 3px;
  }
  .rename-in {
    width: 100%;
    box-sizing: border-box;
    height: 26px;
    border: 1px solid var(--accent);
    border-radius: 6px;
    background: var(--bg);
    color: var(--text);
    padding: 0 8px;
    font: 600 12px/1 var(--font-mono);
    outline: none;
    user-select: text;
  }
  /* V13e picker popover (§2.5, §4.4) */
  .pk-pop {
    position: fixed;
    z-index: 60;
    width: 300px;
    max-width: calc(100vw - 24px);
    border: 1px solid var(--border2, var(--border));
    border-radius: 12px;
    background: var(--surface, var(--bg2));
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }
  .pk-h {
    display: grid;
    gap: 7px;
    padding: 10px;
    border-bottom: 1px solid var(--border);
  }
  .pk-lbl {
    color: var(--textdim);
    font: 800 9px/1 var(--font-mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .pk-search {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 30px;
    padding: 0 9px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg2);
    color: var(--textdim);
  }
  .pk-search input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    color: var(--text);
    font: 500 12px/1 var(--font-mono);
    outline: none;
  }
  .pk-list {
    max-height: 280px;
    overflow-y: auto;
    padding: 5px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .pk-item {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 30px;
    padding: 0 9px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text2);
    text-transform: none;
  }
  .pk-item.hi {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
  }
  .pk-l {
    color: var(--text);
    font: 500 13px/1 var(--font-mono);
  }
  .pk-s {
    color: var(--textdim);
    font: 500 10px/1 var(--font-mono);
  }
  .pk-check {
    color: var(--accent);
    font: 700 12px/1 var(--font-mono);
  }
  .pk-empty {
    padding: 10px;
    color: var(--textdim);
    font: 500 11px/1.3 var(--font-mono);
    text-align: center;
  }

  /* §4.5 tag color swatch grid — reuses .pk-pop/.pk-h chrome, adds a 3-column grid of swatches
     (one per named color family — see the TAG_SWATCHES comment in tagColors.ts). */
  .tag-swatch-pop {
    width: auto;
  }
  .swatch-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    padding: 10px;
  }
  .pk-sub {
    padding: 10px 10px 0;
  }
  .swatch {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 999px;
  }
  .swatch:hover {
    border-color: var(--text);
  }
  .swatch.on {
    border-color: var(--text);
  }
  /* White glyph + dark shadow so the tick stays legible on every swatch in the table, light or dark,
     without needing a per-swatch contrast calculation. */
  .swatch-tick {
    color: var(--text-on-accent, white);
    font: 700 14px/1 var(--font-mono);
    text-shadow: 0 1px 2px rgb(0 0 0 / 0.55);
  }
</style>
