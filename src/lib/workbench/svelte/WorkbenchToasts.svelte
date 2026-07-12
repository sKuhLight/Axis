<script lang="ts">
  import { onDestroy } from 'svelte';
  import { workbenchToasts, type Toast, type ToastTone } from './toasts';

  // Generic toast surface for the workbench shell. Subscribes to the shared
  // queue (no Axis imports); the host renders one instance. Bottom-center,
  // above the bottom bar, safe-area aware, aria-live polite. Tone → token map
  // is the ONLY place a color is chosen, and it resolves to an --aw-* token.
  let toasts = $state<readonly Toast[]>([]);
  const unsubscribe = workbenchToasts.subscribe((next) => (toasts = next));
  onDestroy(unsubscribe);

  const TONE_VAR: Record<ToastTone, string> = {
    accent: 'var(--aw-accent)',
    warn: 'var(--aw-amber)',
    danger: 'var(--aw-danger)'
  };
</script>

<!-- aria-live=polite so a newly enqueued message is announced without stealing
     focus. The region is always present (empty until a toast fires). -->
<div class="aw-toasts" role="status" aria-live="polite" aria-atomic="false">
  {#each toasts as toast (toast.id)}
    <div
      class="aw-toast"
      style="--toast-accent: {TONE_VAR[toast.tone]};"
      role="button"
      tabindex="0"
      onpointerenter={() => workbenchToasts.pause(toast.id)}
      onpointerleave={() => workbenchToasts.resume(toast.id)}
      onfocusin={() => workbenchToasts.pause(toast.id)}
      onfocusout={() => workbenchToasts.resume(toast.id)}
      onclick={() => workbenchToasts.dismiss(toast.id)}
      onkeydown={(e) => {
        if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          workbenchToasts.dismiss(toast.id);
        }
      }}
    >
      <span class="aw-toast-dot" aria-hidden="true"></span>
      <span class="aw-toast-text">{toast.text}</span>
    </div>
  {/each}
</div>

<style>
  /* Bottom-center, floating above the bottom bar. `pointer-events:none` on the
     stack so it never blocks the shell; individual toasts re-enable it so they
     stay hoverable/clickable. Safe-area aware on the bottom + horizontal edges.
     No geometry transition — only transform/opacity animate (geometry guard). */
  .aw-toasts {
    position: fixed;
    left: 50%;
    bottom: calc(64px + var(--aw-safe-bottom, 0px));
    transform: translateX(-50%);
    z-index: 300;
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    gap: 8px;
    max-width: min(92vw, 440px);
    padding: 0 max(var(--aw-safe-left, 0px), var(--aw-safe-right, 0px));
    pointer-events: none;
  }
  .aw-toast {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: 9px;
    max-width: 100%;
    padding: 9px 14px;
    border: 1px solid color-mix(in srgb, var(--toast-accent) 42%, var(--aw-border-2));
    border-radius: 11px;
    background: color-mix(in srgb, var(--toast-accent) 10%, var(--aw-surface));
    color: var(--aw-text);
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.4);
    cursor: pointer;
    font: 600 12px/1.3 var(--aw-font-ui);
    text-align: left;
    /* Slide-up + fade-in entrance; transform/opacity only. */
    animation: awToastIn 0.22s cubic-bezier(0.2, 0.8, 0.3, 1);
  }
  .aw-toast:focus-visible {
    outline: 2px solid var(--toast-accent);
    outline-offset: 2px;
  }
  .aw-toast-dot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--toast-accent);
  }
  .aw-toast-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @keyframes awToastIn {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .aw-toast {
      animation: none;
    }
  }
</style>
