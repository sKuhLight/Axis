<script lang="ts">
  import { tick } from 'svelte';
  import {
    MENU_INTERACTION_IDLE,
    activateMenuRow,
    backMenuStep,
    cancelMenuRow,
    confirmMenuRow,
    editMenuDraft,
    effectiveZoom,
    escapeMenuStep,
    menuInputKey,
    menuItemKind,
    nextMenuItemIndex,
    resolveAnchoredMenuPlacement,
    resolveMenuPath,
    resolveMenuPlacement,
    submitMenuInput,
    type MenuFocusTarget,
    type MenuInteractionState,
    type MenuStep,
    type WorkbenchMenuItem,
    type WorkbenchMenuPosition
  } from './contextMenu';
  import { focusTrap, focusableWithin } from './focusTrap';

  let {
    open,
    position,
    anchor = null,
    items,
    label = 'Context menu',
    touch = false,
    overlay = false,
    onClose
  }: {
    open: boolean;
    /** Pointer position (context menus). Ignored when `anchor` is set. */
    position?: WorkbenchMenuPosition;
    /** Trigger element: the menu opens BELOW it, clamped inside the viewport (dropdowns). */
    anchor?: HTMLElement | null;
    items: WorkbenchMenuItem[];
    label?: string;
    /** Touch presentation: 44px rows. */
    touch?: boolean;
    /**
     * Stack in the shell-overlay band (above app chrome such as the nav sheet and
     * dock drawers, below toasts and the drag layer) — for menus opened from the
     * edit bar, which sits outside the app.
     */
    overlay?: boolean;
    onClose: () => void;
  } = $props();

  let menuEl = $state<HTMLElement | null>(null);
  // `position:fixed; inset:0` viewport-spanning probe: its visual/layout width
  // ratio is the cumulative ancestor CSS zoom (see contextMenu.ts). Used to
  // convert the visual-space clamped position into the layout-space left/top a
  // fixed element inside a zoomed subtree positions in. Identity at 100% scale.
  let scrimEl = $state<HTMLElement | null>(null);
  let left = $state(0);
  let top = $state(0);
  let maxHeight = $state<number | null>(null);

  // ── Drill-in / inline-row state (pure state machine in contextMenu.ts; reset
  //    whenever the menu closes) ─────────────────────────────────────────────
  let menu = $state.raw<MenuInteractionState>(MENU_INTERACTION_IDLE);

  const level = $derived(resolveMenuPath(items, menu.path));
  // The state with its path trimmed to the levels that still exist.
  const current = $derived<MenuInteractionState>({ ...menu, path: level.path });
  const BACK_ROW: WorkbenchMenuItem = { id: '__aw-menu-back__', label: 'Back', run: () => {} };
  // Every rendered row (Back first when drilled in). Row indexes drive roving focus.
  const rows = $derived(level.path.length ? [BACK_ROW, ...level.items] : level.items);
  const rowOffset = $derived(level.path.length ? 1 : 0);
  const levelTitle = $derived(level.trail.length ? level.trail[level.trail.length - 1].label : '');
  const levelKey = $derived(`${level.path.join('/')}|${menu.confirmingId ?? ''}|${menu.editingId ?? ''}`);

  $effect.pre(() => {
    if (!open) menu = MENU_INTERACTION_IDLE;
  });

  function focusRow(index: number) {
    if (!menuEl || index < 0) return;
    const rowEl = menuEl.querySelector<HTMLElement>(`[data-menu-row="${index}"]`);
    if (!rowEl) return;
    if (rowEl.matches('button')) {
      rowEl.focus();
      return;
    }
    focusableWithin(rowEl)[0]?.focus();
  }

  /** After a level / inline-row swap the focused node is gone — put focus back inside. */
  async function refocus(target: MenuFocusTarget) {
    await tick();
    if (!menuEl) return;
    switch (target.kind) {
      case 'first-child': {
        // First child row (skip the Back row) when there is one, else Back.
        const first = nextMenuItemIndex(rows, 0, 1);
        focusRow(first > 0 ? first : 0);
        break;
      }
      case 'row': {
        const index = level.items.findIndex((item) => item.id === target.id);
        focusRow(index >= 0 ? index + rowOffset : nextMenuItemIndex(rows, -1, 1));
        break;
      }
      case 'cancel':
        menuEl.querySelector<HTMLElement>('[data-menu-cancel]')?.focus();
        break;
      case 'input': {
        const input = menuEl.querySelector<HTMLInputElement>('[data-menu-input]');
        input?.focus();
        input?.select();
        break;
      }
    }
  }

  /** Apply a state-machine step: adopt the state, run / close, move focus. */
  function apply(step: MenuStep, item?: WorkbenchMenuItem) {
    menu = step.state;
    if (step.run && item) item.run();
    if (step.close) {
      onClose();
      return;
    }
    if (step.focus) void refocus(step.focus);
  }

  function currentRowIndex(): number {
    const active = document.activeElement as HTMLElement | null;
    const rowEl = active?.closest<HTMLElement>('[data-menu-row]');
    return rowEl && menuEl?.contains(rowEl) ? Number(rowEl.dataset.menuRow) : -1;
  }

  const activate = (item: WorkbenchMenuItem) => apply(activateMenuRow(current, item), item);
  const confirmRun = (item: WorkbenchMenuItem) => apply(confirmMenuRow(current, item), item);
  const cancelInline = () => apply(cancelMenuRow(current));
  const goBack = () => apply(backMenuStep(current));
  const submitInput = (item: WorkbenchMenuItem) => apply(submitMenuInput(current, item));
  const setDraft = (value: string) => (menu = editMenuDraft(menu, value));

  function inputKeydown(event: KeyboardEvent, item: WorkbenchMenuItem) {
    const step = menuInputKey(current, item, event.key);
    if (!step) return;
    event.preventDefault();
    // Escape cancels only the inline field; the menu (focusTrap) must not see it.
    if (event.key === 'Escape') event.stopPropagation();
    apply(step);
  }

  // Escape (routed through use:focusTrap): unwind one step — inline field /
  // confirm first, then one drill level — and close only at the root.
  const handleEscape = () => apply(escapeMenuStep(current));

  // Roving arrow-key navigation between the (enabled) rows — the platform
  // convention for a `role="menu"`. Tab-trap + Escape + focus-restore come from
  // `use:focusTrap`; here we add ↑/↓/Home/End, ←/→ for drill-in levels, and
  // Enter/Space activation (native on the row buttons).
  function menuKeydown(event: KeyboardEvent) {
    if ((event.target as HTMLElement | null)?.tagName === 'INPUT') return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusRow(nextMenuItemIndex(rows, currentRowIndex(), 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusRow(nextMenuItemIndex(rows, currentRowIndex(), -1));
        break;
      case 'Home':
        event.preventDefault();
        focusRow(nextMenuItemIndex(rows, -1, 1));
        break;
      case 'End':
        event.preventDefault();
        focusRow(nextMenuItemIndex(rows, -1, -1));
        break;
      case 'ArrowLeft':
        if (level.path.length) {
          event.preventDefault();
          goBack();
        }
        break;
      case 'ArrowRight': {
        const row = rows[currentRowIndex()];
        if (row && menuItemKind(row) === 'submenu' && !row.disabled) {
          event.preventDefault();
          activate(row);
        }
        break;
      }
    }
  }

  $effect(() => {
    if (!open) return;
    // Re-place whenever the drill level or an inline row changes the menu size.
    void levelKey;
    const anchorEl = anchor;
    // First paint: place at the raw anchor / pointer position divided by the
    // current best zoom estimate so a zoomed menu doesn't flash at the wrong spot
    // before the post-tick measure refines it.
    const preZoom = scrimEl ? effectiveZoom(scrimEl.getBoundingClientRect().width, scrimEl.offsetWidth) : 1;
    if (anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      left = rect.left / preZoom;
      top = (rect.bottom + 4) / preZoom;
    } else {
      left = (position?.x ?? 0) / preZoom;
      top = (position?.y ?? 0) / preZoom;
    }
    void tick().then(() => {
      if (!menuEl) return;
      const rect = menuEl.getBoundingClientRect();
      const zoom = scrimEl ? effectiveZoom(scrimEl.getBoundingClientRect().width, scrimEl.offsetWidth) : 1;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      if (anchorEl) {
        const next = resolveAnchoredMenuPlacement(
          anchorEl.getBoundingClientRect(),
          viewport,
          { width: rect.width, height: rect.height },
          zoom
        );
        left = next.x;
        top = next.y;
        maxHeight = next.maxHeight;
        return;
      }
      const next = resolveMenuPlacement(
        position ?? { x: 0, y: 0 },
        viewport,
        { width: rect.width, height: rect.height },
        zoom
      );
      left = next.x;
      top = next.y;
    });
  });
</script>

{#if open}
  <button class="aw-menu-scrim" class:overlay type="button" aria-label="Close menu" bind:this={scrimEl} onclick={onClose}></button>
  <div
    class="aw-context-menu"
    class:anchored={!!anchor}
    class:overlay
    class:touch
    bind:this={menuEl}
    use:focusTrap={{ onClose: handleEscape }}
    role="menu"
    aria-label={levelTitle ? `${label} · ${levelTitle}` : label}
    tabindex="-1"
    onkeydown={menuKeydown}
    style={`left:${left}px; top:${top}px;${anchor && maxHeight !== null ? ` max-height:${maxHeight}px;` : ''}`}
  >
    {#if level.path.length}
      <button class="aw-menu-item aw-menu-back" type="button" role="menuitem" data-menu-row="0" onclick={goBack}>
        <span class="aw-menu-glyph" aria-hidden="true">‹</span>
        <span>Back</span>
      </button>
      {#if !level.items[0] || menuItemKind(level.items[0]) !== 'header'}
        <!-- The level's own title, unless its rows already start with a header. -->
        <div class="aw-menu-header" role="presentation">{levelTitle}</div>
      {/if}
    {/if}
    {#each level.items as item, index (item.id)}
      {@const kind = menuItemKind(item)}
      {@const row = index + rowOffset}
      {#if kind === 'header'}
        <div class="aw-menu-header {item.className ?? ''}" class:separated={item.separatorBefore} role="presentation" data-menu-row={row}>
          {item.label}
        </div>
      {:else if item.confirm && menu.confirmingId === item.id}
        <div class="aw-menu-confirm" class:separated={item.separatorBefore} role="group" aria-label={item.confirm.prompt} data-menu-row={row}>
          <p class="aw-menu-confirm-prompt">{item.confirm.prompt}</p>
          <div class="aw-menu-confirm-actions">
            <button
              class="aw-menu-confirm-btn"
              class:danger={item.danger}
              type="button"
              role="menuitem"
              data-menu-confirm
              onclick={() => confirmRun(item)}
            >
              {item.confirm.confirmLabel ?? 'Confirm'}
            </button>
            <button class="aw-menu-confirm-btn" type="button" role="menuitem" data-menu-cancel onclick={cancelInline}>
              {item.confirm.cancelLabel ?? 'Cancel'}
            </button>
          </div>
        </div>
      {:else if kind === 'input' && menu.editingId === item.id}
        <div class="aw-menu-input" class:separated={item.separatorBefore} role="group" aria-label={item.label} data-menu-row={row}>
          <input
            value={menu.draft}
            oninput={(event) => setDraft(event.currentTarget.value)}
            type="text"
            aria-label={item.label}
            placeholder={item.placeholder ?? ''}
            data-menu-input
            onkeydown={(event) => inputKeydown(event, item)}
          />
          <button class="aw-menu-confirm-btn" type="button" role="menuitem" onclick={() => submitInput(item)}>Save</button>
        </div>
      {:else}
        <button
          class="aw-menu-item {item.className ?? ''}"
          class:danger={item.danger}
          class:separated={item.separatorBefore}
          type="button"
          role={kind === 'radio' ? 'menuitemradio' : 'menuitem'}
          aria-checked={kind === 'radio' ? !!item.checked : undefined}
          aria-haspopup={kind === 'submenu' ? 'menu' : undefined}
          disabled={item.disabled}
          data-menu-row={row}
          onclick={() => activate(item)}
        >
          {#if kind === 'radio'}<span class="aw-menu-check" class:on={item.checked} aria-hidden="true"></span>{/if}
          <span>{item.label}</span>
          {#if item.hint}<i>{item.hint}</i>{/if}
          {#if kind === 'submenu'}<b class="aw-menu-chev" aria-hidden="true">›</b>{/if}
        </button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .aw-menu-scrim {
    position: fixed;
    inset: 0;
    z-index: 119;
    border: 0;
    background: transparent;
  }
  .aw-context-menu {
    position: fixed;
    z-index: 120;
    min-width: 188px;
    max-width: min(280px, calc(100vw - 16px));
    padding: 6px;
    border: 1px solid var(--aw-border-2);
    border-radius: 8px;
    background: var(--aw-surface);
    box-shadow: 0 18px 54px rgba(0, 0, 0, 0.46);
    outline: none;
  }
  /* Shell-overlay band (edit-bar menus): above every piece of app chrome (the
     hamburger 120, dock openers 170, dock drawer 180, nav sheet 230, the
     Customize drawers 237/238), below toasts (300) and the drag layer (1000). */
  .aw-menu-scrim.overlay {
    z-index: 239;
  }
  .aw-context-menu.overlay {
    z-index: 240;
  }
  /* Dropdowns opened from a trigger (edit bar): a fixed comfortable width that
     still fits a phone, scrolling when taller than the space below the bar. */
  .aw-context-menu.anchored {
    width: 268px;
    max-width: calc(100vw - 16px);
    overflow-y: auto;
    border-color: var(--aw-border-3);
    border-radius: 12px;
  }
  .aw-menu-item {
    width: 100%;
    min-width: 0;
    min-height: 32px;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0 9px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--aw-text-2);
    cursor: pointer;
    text-align: left;
    font: 700 12px/1 var(--aw-font-ui);
  }
  .aw-menu-item:hover {
    background: color-mix(in srgb, var(--aw-accent) 12%, transparent);
    color: var(--aw-text);
  }
  .aw-menu-item:focus-visible {
    background: color-mix(in srgb, var(--aw-accent) 12%, transparent);
    color: var(--aw-text);
    outline: 2px solid var(--aw-accent);
    outline-offset: -2px;
  }
  .aw-menu-item:disabled {
    opacity: 0.42;
    cursor: default;
  }
  .aw-menu-item.danger {
    color: var(--aw-danger);
  }
  .aw-menu-item.separated,
  .aw-menu-header.separated,
  .aw-menu-confirm.separated,
  .aw-menu-input.separated {
    margin-top: 6px;
    border-top: 1px solid var(--aw-border);
    border-top-left-radius: 0;
    border-top-right-radius: 0;
    padding-top: 6px;
  }
  .aw-menu-item span {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .aw-menu-item i {
    flex: none;
    color: var(--aw-text-faint);
    font: 700 10px/1 var(--aw-font-mono);
    font-style: normal;
  }
  /* Radio rows: a leading check slot (CSS-drawn so the row text stays the label). */
  .aw-menu-item .aw-menu-check {
    flex: none;
    width: 12px;
    height: 12px;
    border: 1.5px solid var(--aw-border-3);
    border-radius: 50%;
  }
  .aw-menu-item .aw-menu-check.on {
    border-color: var(--aw-accent);
    background: radial-gradient(circle, var(--aw-accent) 0 3px, transparent 3.5px);
  }
  .aw-menu-item[aria-checked='true'] {
    color: var(--aw-text);
  }
  .aw-menu-chev {
    flex: none;
    color: var(--aw-text-muted);
    font: 600 15px/1 var(--aw-font-ui);
  }
  .aw-menu-item .aw-menu-glyph {
    flex: none;
    color: var(--aw-text-muted);
    font: 600 15px/1 var(--aw-font-ui);
  }
  .aw-menu-header {
    padding: 9px 9px 6px;
    color: var(--aw-text-faint);
    font: 700 10px/1.3 var(--aw-font-mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .aw-menu-confirm,
  .aw-menu-input {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 9px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--aw-danger) 7%, transparent);
  }
  .aw-menu-input {
    flex-direction: row;
    align-items: center;
    background: transparent;
  }
  .aw-menu-confirm-prompt {
    margin: 0;
    color: var(--aw-text);
    font: 600 12px/1.4 var(--aw-font-ui);
  }
  .aw-menu-confirm-actions {
    display: flex;
    gap: 6px;
  }
  .aw-menu-confirm-btn {
    flex: 1;
    min-height: 30px;
    padding: 0 10px;
    border: 1px solid var(--aw-border-2);
    border-radius: 6px;
    background: var(--aw-bg-2);
    color: var(--aw-text-2);
    cursor: pointer;
    font: 700 12px/1 var(--aw-font-ui);
  }
  .aw-menu-input .aw-menu-confirm-btn {
    flex: none;
  }
  .aw-menu-confirm-btn:hover {
    border-color: var(--aw-accent);
    color: var(--aw-text);
  }
  .aw-menu-confirm-btn.danger {
    border-color: var(--aw-danger);
    background: color-mix(in srgb, var(--aw-danger) 16%, var(--aw-bg-2));
    color: var(--aw-text);
  }
  .aw-menu-confirm-btn:focus-visible,
  .aw-menu-input input:focus-visible {
    outline: 2px solid var(--aw-accent);
    outline-offset: 1px;
  }
  .aw-menu-input input {
    flex: 1;
    min-width: 0;
    height: 30px;
    padding: 0 9px;
    border: 1px solid var(--aw-border-3);
    border-radius: 6px;
    background: var(--aw-bg);
    color: var(--aw-text);
    font: 600 12px/1 var(--aw-font-ui);
  }
  /* Touch presentation (edit bar below the phone breakpoint): 44px rows. */
  .aw-context-menu.touch .aw-menu-item,
  .aw-context-menu.touch .aw-menu-confirm-btn,
  .aw-context-menu.touch .aw-menu-input input {
    min-height: 44px;
    font-size: 14px;
  }
</style>
