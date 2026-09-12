<script lang="ts">
  /**
   * Busy/progress row inside `PromptToast` — a pulsing dot, a label (+ optional done/total count
   * and phase tag), an optional progress bar, and an optional cancel button. Shared by
   * CachePrompt's and DeviceDefsPrompt's "building" states.
   *
   * `grow` matches DeviceDefsPrompt's layout, where the label can carry a phase tag and a Cancel
   * button sits alongside the bar, so the label and bar split the row's remaining space evenly.
   * CachePrompt's simpler label has no phase/cancel, so it keeps its natural width and lets the
   * bar fill the rest — the two toasts were never pixel-identical here, only their dot/bar/fill
   * mechanics were.
   */
  import Button from '$lib/ui/Button.svelte';

  let {
    label,
    done,
    total,
    phase,
    onCancel,
    cancelLabel = 'Cancel',
    grow = false
  }: {
    label: string;
    done?: number;
    total?: number;
    phase?: string;
    onCancel?: () => void;
    cancelLabel?: string;
    grow?: boolean;
  } = $props();

  const pct = $derived(total ? Math.round(((done ?? 0) / total) * 100) : 0);
</script>

<div class="row">
  <span class="dot"></span>
  <span class="txt" class:grow>
    {label}
    {#if total}<b>{done}/{total}</b>{/if}
    {#if phase}<span class="phase">{phase}</span>{/if}
  </span>
  {#if total}<div class="bar"><div class="fill" style:width="{pct}%"></div></div>{/if}
  {#if onCancel}<Button variant="secondary" size="sm" height="30px" onclick={onCancel}>{cancelLabel}</Button>{/if}
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--accent);
    flex: none;
    animation: pprPulse 1s ease-in-out infinite;
  }
  @keyframes pprPulse {
    50% {
      opacity: 0.3;
    }
  }
  .txt {
    font-size: 12px;
    color: var(--text2);
    flex: none;
  }
  .txt.grow {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .txt b {
    font-weight: 700;
  }
  .phase {
    font-size: 10.5px;
    color: var(--textdim);
    text-transform: capitalize;
  }
  .bar {
    flex: 1;
    height: 6px;
    background: var(--track);
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.2s;
  }
</style>
