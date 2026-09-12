<script lang="ts">
  /**
   * The one modal-dialog shell. Owns the scrim, the card chrome, the focus trap and
   * Escape-to-close, so no dialog hand-rolls a `position:fixed; inset:0` backdrop or its
   * own `.card` rule any more.
   *
   * Mount it (gated on `open`) below the shell `{#if}` branch in `+page.svelte` like every
   * other overlay. Drive `open` from the overlay registry (`overlays.isOpen(...)`) or a
   * domain store, and point `onClose` at `overlays.close(...)` / the store's close method.
   *
   * The focus trap is `src/lib/workbench/svelte/focusTrap.ts` — app → workbench is the
   * allowed dependency direction. It moves focus into the card on open (an explicit
   * `[data-autofocus]` element wins), traps Tab, and restores focus to the opener on close.
   *
   * Per-dialog differences are props, not forks:
   *   - `size` / `width` — card width
   *   - `align` — `'top'` anchors the card near the top of the viewport (search palettes)
   *   - `sheet` — mobile bottom-sheet presentation (pass `editor.isMobile`)
   *   - `mobileFull` — mobile full-screen presentation (pass `editor.isMobile`)
   *   - `accent` — `'amber'` for destructive dialogs (Save)
   *   - `title` — render the standard header row; omit it to supply your own header markup
   */
  import type { Snippet } from 'svelte';
  import { focusTrap } from '$lib/workbench/svelte/focusTrap';
  import { overlays, type OverlayId } from '$lib/overlay/overlays.svelte';

  let {
    open,
    onClose,
    overlay,
    title,
    size = 'md',
    width,
    maxHeight,
    align = 'center',
    sheet = false,
    mobileFull = false,
    dismissible = true,
    accent = 'default',
    labelledBy,
    describedBy,
    class: klass = '',
    children,
    footer
  }: {
    open: boolean;
    onClose: () => void;
    overlay?: OverlayId;
    title?: string;
    size?: 'sm' | 'md' | 'lg';
    width?: string;
    maxHeight?: string;
    align?: 'center' | 'top';
    sheet?: boolean;
    mobileFull?: boolean;
    /** When false, neither the scrim nor Escape closes the dialog (first-run prompts that
     *  require an explicit choice). Defaults to true. */
    dismissible?: boolean;
    accent?: 'default' | 'amber';
    labelledBy?: string;
    describedBy?: string;
    class?: string;
    children: Snippet;
    footer?: Snippet;
  } = $props();

  const trapEnabled = $derived(!overlay || overlays.isTop(overlay));

  function keepTopFocus(node: HTMLElement, enabled: boolean) {
    function onFocus(event: FocusEvent) {
      if (enabled && !node.contains(event.target as Node)) queueMicrotask(() => node.focus());
    }
    document.addEventListener('focusin', onFocus, true);
    return {
      update(next: boolean) { enabled = next; },
      destroy() { document.removeEventListener('focusin', onFocus, true); }
    };
  }
</script>

{#if open}
  <div
    class="dlg-scrim-wrap"
    class:sheet
    class:mobile-full={mobileFull}
    data-align={align}
    data-overlay={overlay}
    style:z-index={overlay ? overlays.zIndex(overlay) : null}
    role="presentation"
  >
    {#if dismissible}
      <button type="button" class="dlg-scrim" aria-label="Close" onclick={onClose}></button>
    {:else}
      <div class="dlg-scrim" aria-hidden="true"></div>
    {/if}
    <div
      class="dlg-card {klass}"
      class:sheet
      class:mobile-full={mobileFull}
      data-size={size}
      data-accent={accent}
      style:--dlg-w={width ?? null}
      style:--dlg-max-h={maxHeight ?? null}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      tabindex="-1"
      use:focusTrap={{ enabled: trapEnabled, onClose: overlay ? undefined : dismissible ? onClose : undefined }}
      use:keepTopFocus={!!overlay && trapEnabled}
    >
      {#if title}
        <header class="dlg-head">
          <span class="dlg-title">{title}</span>
          <button type="button" class="dlg-x" aria-label="Close" onclick={onClose}>✕</button>
        </header>
      {/if}
      {@render children()}
      {#if footer}
        <footer class="dlg-foot">{@render footer()}</footer>
      {/if}
    </div>
  </div>
{/if}

<style>
  .dlg-scrim-wrap {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    animation: axsOverlay 0.16s ease-out;
  }
  .dlg-scrim-wrap[data-align='top'] {
    align-items: flex-start;
    padding-top: 7vh;
  }
  .dlg-scrim-wrap.sheet {
    align-items: flex-end;
    padding: 0;
  }
  .dlg-scrim-wrap.mobile-full {
    padding: 0;
  }
  .dlg-scrim {
    position: absolute;
    inset: 0;
    border: 0;
    padding: 0;
    background: var(--overlay-scrim);
    backdrop-filter: blur(var(--overlay-blur));
    cursor: default;
  }
  .dlg-card {
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    width: var(--dlg-w, 560px);
    max-width: 100%;
    max-height: var(--dlg-max-h, 88vh);
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 16px;
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.55);
    color: var(--text);
    animation: axsPalette 0.16s cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  .dlg-card[data-size='sm'] {
    width: var(--dlg-w, 420px);
  }
  .dlg-card[data-size='lg'] {
    width: var(--dlg-w, 720px);
  }
  .dlg-card[data-accent='amber'] {
    border-color: var(--amber-border);
  }
  .dlg-card.sheet {
    width: 100%;
    max-width: 100%;
    max-height: 92vh;
    border-radius: 18px 18px 0 0;
    padding-bottom: var(--axis-safe-bottom);
    animation: axsSheet 0.28s cubic-bezier(0.2, 0.85, 0.25, 1);
  }
  .dlg-card.mobile-full {
    width: 100%;
    max-width: 100%;
    height: 100%;
    max-height: none;
    border-radius: 0;
    border: 0;
    animation: axsSheet 0.26s cubic-bezier(0.2, 0.8, 0.3, 1);
  }

  .dlg-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px 12px 18px;
    border-bottom: 1px solid var(--border2);
  }
  .dlg-title {
    flex: 1;
    font-size: 16px;
    font-weight: 700;
    color: var(--text);
  }
  .dlg-x {
    flex: none;
    width: 30px;
    height: 30px;
    border: 1px solid var(--border2);
    background: var(--bg2);
    border-radius: 8px;
    color: var(--textdim);
    font-size: 13px;
    cursor: pointer;
  }
  .dlg-x:hover {
    color: var(--text);
    background: var(--surface2);
  }
  .dlg-foot {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 18px;
    border-top: 1px solid var(--border2);
  }
</style>
