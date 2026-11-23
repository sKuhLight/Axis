<script lang="ts">
  // Page navigation of the Block Editor: the page tabs in the header (top navigation) or the page list
  // beside the board (side navigation, no heading and no control counts). Both highlight every page in
  // view (the active one stronger); a click scrolls the board to the page. While arranging, a
  // double-click renames a page and "+" adds one.
  let {
    variant,
    pages,
    active,
    highlight,
    editMode,
    renaming,
    width = 0,
    touch = false,
    onGo,
    onStartRename,
    onRename,
    onCancelRename,
    onAdd
  }: {
    variant: 'tabs' | 'list';
    pages: readonly string[];
    active: string;
    highlight: ReadonlySet<string>;
    editMode: boolean;
    /** Page being renamed. */
    renaming: string | null;
    /** List width in px (side navigation). */
    width?: number;
    /** Phone: ≥ 40 px hit targets. */
    touch?: boolean;
    onGo: (page: string) => void;
    onStartRename: (page: string) => void;
    onRename: (page: string, name: string) => void;
    onCancelRename: () => void;
    onAdd: () => void;
  } = $props();

  function focusEl(node: HTMLInputElement) {
    node.focus();
    node.select();
  }
  function renameKey(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (e.key === 'Enter') e.currentTarget.blur();
    else if (e.key === 'Escape') onCancelRename();
  }
  const title = (pg: string) => (editMode ? `${pg} · double-click to rename` : `Show ${pg}`);
</script>

<div
  class="be-pnav"
  class:tabs={variant === 'tabs'}
  class:list={variant === 'list'}
  class:touch
  role="tablist"
  aria-label="Pages"
  aria-orientation={variant === 'list' ? 'vertical' : 'horizontal'}
  data-be-pagenav={variant}
  style:width={variant === 'list' && width ? `${width}px` : null}
>
  {#each pages as pg (pg)}
    {#if renaming === pg}
      <input
        class="be-ptab edit"
        value={pg}
        aria-label="Page name"
        use:focusEl
        onkeydown={renameKey}
        onblur={(e) => (renaming === pg ? onRename(pg, e.currentTarget.value) : null)}
      />
    {:else}
      <button
        class="be-ptab"
        class:on={pg === active}
        class:vis={highlight.has(pg)}
        type="button"
        role="tab"
        aria-selected={pg === active}
        data-be-tab={pg}
        data-visible={highlight.has(pg) ? 'true' : 'false'}
        data-active={pg === active ? 'true' : 'false'}
        title={title(pg)}
        onclick={() => onGo(pg)}
        ondblclick={() => editMode && onStartRename(pg)}>{pg}</button
      >
    {/if}
  {/each}
  {#if editMode}
    <button class="be-ptab add" type="button" title="Add page" aria-label="Add page" onclick={onAdd}>＋</button>
  {/if}
</div>

<style>
  .be-pnav {
    scrollbar-width: none;
  }
  .be-pnav::-webkit-scrollbar {
    display: none;
  }
  /* ── tabs (header, top navigation) ── */
  .be-pnav.tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    max-width: 100%;
    padding: 2px;
    overflow-x: auto;
    border-radius: 9px;
    background: var(--input);
    border: 1px solid var(--border);
  }
  .tabs .be-ptab {
    flex: none;
    height: 26px;
    padding: 0 12px;
    border-radius: 7px;
    border: 0;
    cursor: pointer;
    white-space: nowrap;
    background: transparent;
    color: var(--textdim);
    font: 600 12px/1 var(--font-ui);
    transition:
      background 0.12s,
      color 0.12s;
  }
  .tabs .be-ptab:hover {
    color: var(--text);
  }
  .tabs .be-ptab.vis {
    color: var(--accentbright);
    background: var(--accent-tint);
    box-shadow: inset 0 0 0 1px var(--accent-border);
  }
  .tabs .be-ptab.on {
    color: var(--amber);
    background: var(--amber-tint);
    box-shadow: inset 0 0 0 1px var(--amber-border);
  }
  .tabs .be-ptab.add {
    color: var(--accentbright);
    font-size: 15px;
    padding: 0 9px;
  }
  .tabs .be-ptab.edit {
    width: 110px;
    background: var(--bg2);
    border: 1px solid var(--accent);
    color: var(--text);
    outline: none;
    cursor: text;
  }

  .tabs.touch .be-ptab {
    height: 40px;
  }
  .list.touch .be-ptab {
    height: 40px;
    line-height: 40px;
  }

  /* ── list (side navigation): no heading, no counts ── */
  .be-pnav.list {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
    padding: 10px 8px;
    overflow-y: auto;
    background: var(--input);
    border-right: 1px solid var(--surface2);
    box-sizing: border-box;
  }
  .list .be-ptab {
    flex: none;
    display: block;
    width: 100%;
    height: 32px;
    padding: 0 10px;
    border: 0;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    background: transparent;
    color: var(--textdim);
    font: 600 12.5px/32px var(--font-ui);
    transition:
      background 0.12s,
      color 0.12s;
  }
  .list .be-ptab:hover {
    background: var(--surface);
    color: var(--text);
  }
  .list .be-ptab.vis {
    color: var(--text);
    background: var(--surface);
    box-shadow: inset 2px 0 0 var(--accent);
  }
  .list .be-ptab.on {
    color: var(--amber);
    box-shadow: inset 2px 0 0 var(--amber);
  }
  .list .be-ptab.add {
    color: var(--accentbright);
    font-size: 15px;
    text-align: center;
  }
  .list .be-ptab.edit {
    background: var(--bg2);
    border: 1px solid var(--accent);
    color: var(--text);
    outline: none;
    cursor: text;
    line-height: 1;
  }
</style>
