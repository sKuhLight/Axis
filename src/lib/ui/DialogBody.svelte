<script lang="ts">
  /**
   * The scrollable body inside a `Dialog` card. Since M3 moved the card frame itself onto
   * `Dialog`, several dialogs kept a local `.card` rule that was really just this — a
   * position:relative, full-width, vertically-scrolling wrapper with matching scrollbar styling
   * (AxisPanel, Notices). Not every `Dialog` consumer needs it — only the ones whose content can
   * outgrow `maxHeight`.
   */
  import type { Snippet } from 'svelte';

  let { class: klass = '', children }: { class?: string; children: Snippet } = $props();
</script>

<div class="db {klass}">
  {@render children()}
</div>

<style>
  .db {
    position: relative;
    width: 100%;
    overflow-y: auto;
    color: var(--text);
    font-family: var(--font, 'Hanken Grotesk', system-ui, sans-serif);
  }
  .db::-webkit-scrollbar {
    width: 9px;
  }
  .db::-webkit-scrollbar-track {
    background: transparent;
  }
  .db::-webkit-scrollbar-thumb {
    background: var(--border2);
    border-radius: 6px;
    border: 2px solid transparent;
    background-clip: padding-box;
  }
</style>
