<script lang="ts">
  /**
   * Shared pill action button — the `.go`/`.later`/`.cta`/dialog-footer `.btn` shape repeated
   * across the bottom-toast prompts and the small save dialogs. Per-instance differences are
   * props, not forks:
   *   - `variant` — `primary` (accent fill), `secondary` (bordered, dim text), `amber` (the
   *     Save dialog's destructive-but-not-danger accent)
   *   - `size` — `sm` (34px, `--d-ctl-h-sm`), `md` (40px), `lg` (44px, `--d-ctl-h`)
   *   - `height` — raw override for a legacy one-off value that predates this component and
   *     isn't worth changing pixel-for-pixel (e.g. DeviceDefsPrompt's 30px Cancel)
   */
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  let {
    variant = 'secondary',
    size = 'md',
    height,
    disabled = false,
    type = 'button',
    onclick,
    class: klass = '',
    children,
    ...rest
  }: {
    variant?: 'primary' | 'secondary' | 'amber';
    size?: 'sm' | 'md' | 'lg';
    height?: string;
    class?: string;
    children: Snippet;
  } & HTMLButtonAttributes = $props();
</script>

<button
  {type}
  class="b {klass}"
  data-variant={variant}
  data-size={size}
  style:height={height ?? null}
  {disabled}
  {onclick}
  {...rest}
>
  {@render children()}
</button>

<style>
  .b {
    border-radius: 9px;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid var(--border2);
  }
  .b:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .b[data-size='sm'] {
    height: var(--d-ctl-h-sm);
    padding: 0 15px;
    font-size: 12.5px;
  }
  /* the small secondary ("Later"/"Cancel") toast button is transparent (it sits on the toast's
     own --surface background) and lighter than its primary sibling — observed as-is across
     CachePrompt/ColorLabelsPrompt/DeviceDefsPrompt, not a new variant. */
  .b[data-size='sm'][data-variant='secondary'] {
    padding: 0 11px;
    font-size: 12px;
    font-weight: 600;
    background: transparent;
  }
  .b[data-size='md'] {
    height: 40px;
    padding: 0 18px;
    border-radius: 10px;
    font-size: 13px;
  }
  .b[data-size='lg'] {
    height: var(--d-ctl-h);
    padding: 0 16px;
    border-radius: 10px;
    font-size: var(--d-font);
  }

  .b[data-variant='secondary'] {
    background: var(--bg2);
    color: var(--textdim);
  }
  .b[data-variant='secondary']:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--border3);
  }

  .b[data-variant='primary'] {
    background: var(--accent);
    color: var(--accentink);
    border-color: transparent;
  }
  .b[data-variant='primary']:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  .b[data-variant='amber'] {
    background: var(--surface2);
    border-color: var(--amber-border);
    color: var(--amberink);
  }
  .b[data-variant='amber']:hover:not(:disabled) {
    border-color: var(--amber-border);
  }
</style>
