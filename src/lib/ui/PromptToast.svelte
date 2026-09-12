<script lang="ts">
  /**
   * The bottom-anchored "one-time offer / status" toast shell shared by CachePrompt,
   * ColorLabelsPrompt and DeviceDefsPrompt — a self-dismissing card pinned to the bottom-center
   * of the viewport, distinct from `Dialog` (which scrims and traps focus for a blocking modal).
   * These toasts never block interaction with the rest of the app.
   *
   * `maxWidth` covers the narrower "building/busy" presentation some callers switch to.
   * Compose with `PromptRow` (icon + message + actions) or `PromptProgressRow` (busy/progress),
   * or pass arbitrary children for a bespoke layout (DeviceDefsPrompt's multi-action offer state).
   */
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';

  let {
    maxWidth = 620,
    class: klass = '',
    children,
    ...rest
  }: { maxWidth?: number; class?: string; children: Snippet } & HTMLAttributes<HTMLDivElement> = $props();
</script>

<div class="pt {klass}" style:--pt-max-w="{maxWidth}px" {...rest}>
  {@render children()}
</div>

<style>
  .pt {
    position: fixed;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    z-index: var(--z-prompt);
    max-width: var(--pt-max-w, 620px);
    width: calc(100% - 40px);
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 13px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
    padding: 12px 14px;
    animation: ptUp 0.18s ease-out;
  }
  @keyframes ptUp {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
</style>
