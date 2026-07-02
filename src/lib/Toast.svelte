<script lang="ts">
  import { editor } from './editor.svelte';
</script>

{#if editor.toast}
  {#key editor.toast.text + editor.toast.accent}
    <div class="toast">
      <span class="dot" style="background:{editor.toast.accent}; box-shadow:0 0 8px {editor.toast.accent}"></span>
      <span class="txt">{editor.toast.text}</span>
    </div>
  {/key}
{/if}

<style>
  .toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    z-index: 300;
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 12px 17px;
    background: var(--surface-2);
    border: 1px solid var(--border2);
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
    animation: axsToast 2.2s ease forwards;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex: none;
  }
  .txt {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
  }
</style>
