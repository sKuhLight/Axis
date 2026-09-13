<script lang="ts">
  import { editorNotifications } from '$lib/editor/editorClients.svelte';
</script>

{#if editorNotifications.toast}
  {#key editorNotifications.toast.text + editorNotifications.toast.accent}
    <div class="toast">
      <span class="dot" style="background:{editorNotifications.toast.accent}; box-shadow:0 0 8px {editorNotifications.toast.accent}"></span>
      <span class="txt">{editorNotifications.toast.text}</span>
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
