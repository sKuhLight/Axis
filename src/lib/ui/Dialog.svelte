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
   * `[data-autofocus]` element wins), traps Tab, closes on Escape, and restores focus to
   * the opener on close.
   *
   * Per-dialog differences are props, not forks:
   *   - `size` / `width` — card width
   *   - `sheet` — mobile bottom-sheet presentation (pass `editor.isMobile`)
   *   - `accent` — `'amber'` for destructive dialogs (Save)
   *   - `title` — render the standard header row; omit it to supply your own header markup
   */
  import type { Snippet } from 'svelte';
  import { focusTrap } from '$lib/workbench/svelte/focusTrap';

  let {
    open,
    onClose,
    title,
    size = 'md',
    width,
    sheet = false,
    accent = 'default',
    labelledBy,
    describedBy,
    class: klass = '',
    children,
    footer
  }: {
    open: boolean;
    onClose: () => void;
    title?: string;
    size?: 'sm' | 'md' | 'lg';
    width?: string;
    sheet?: boolean;
    accent?: 'default' | 'amber';
    labelledBy?: string;
    describedBy?: string;
    class?: string;
    children: Snippet;
    footer?: Snippet;
  } = $props();
</script>

{#if open}
  <div class="dlg-scrim-wrap" class:sheet role="presentation">
    <button type="button" class="dlg-scrim" aria-label="Close" onclick={onClose}></button>
    <div
      class="dlg-card {klass}"
      class:sheet
      data-size={size}
      data-accent={accent}
      style:--dlg-w={width ?? null}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      tabindex="-1"
      use:focusTrap={{ onClose }}
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
  .dlg-scrim-wrap.sheet {
    align-items: flex-end;
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
    width: var(--dlg-w, 560px);
    max-width: 100%;
    max-height: 88vh;
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
