<script lang="ts">
  /**
   * Icon + message + trailing actions row — the simple layout inside `PromptToast` used by
   * CachePrompt's and ColorLabelsPrompt's offer states and DeviceDefsPrompt's "succeeded" state.
   * `message` renders the title/sub-line text; `actions` renders the trailing button(s)
   * (typically `Button` instances).
   */
  import type { Snippet } from 'svelte';

  let {
    icon,
    iconVariant = 'default',
    message,
    actions
  }: {
    icon: string;
    iconVariant?: 'default' | 'ok';
    message: Snippet;
    actions?: Snippet;
  } = $props();
</script>

<div class="row">
  <span class="ic" class:ok={iconVariant === 'ok'}>{icon}</span>
  <div class="msg">{@render message()}</div>
  {@render actions?.()}
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .ic {
    font-size: 20px;
    color: var(--accent);
    flex: none;
    line-height: 1.3;
  }
  .ic.ok {
    color: var(--ok);
  }
  .msg {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .msg :global(b) {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
  }
  .msg :global(.sub) {
    font-size: 11px;
    color: var(--textdim);
    line-height: 1.35;
  }
</style>
