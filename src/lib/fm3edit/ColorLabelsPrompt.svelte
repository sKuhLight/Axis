<script lang="ts">
  // One-time opt-in offer to import FM3-Edit's preset-color assignments as Axis tags (replicated-
  // purring-bachman). Mirrors CachePrompt.svelte: a dismissable bottom toast, "Later" is session-only
  // (asked again next launch), accepting is remembered forever (colorLabels.svelte.ts persists it).
  import { colorLabels } from './colorLabels.svelte';

  const offer = $derived(colorLabels.offer);
</script>

{#if offer}
  <div class="clp">
    <div class="row">
      <span class="ic">◐</span>
      <div class="msg">
        <b>Import FM3-Edit preset colors?</b>
        <span class="sub">
          Found color labels for {offer.presetCount} preset{offer.presetCount === 1 ? '' : 's'} in FM3-Edit — import them as Axis tags.
        </span>
      </div>
      <button class="go" onclick={() => colorLabels.accept()}>Import</button>
      <button class="later" onclick={() => colorLabels.dismiss()}>Later</button>
    </div>
  </div>
{/if}

<style>
  .clp {
    position: fixed;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    z-index: 400;
    max-width: 620px;
    width: calc(100% - 40px);
    background: var(--surface);
    border: 1px solid var(--border2);
    border-radius: 13px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
    padding: 12px 14px;
    animation: clpUp 0.18s ease-out;
  }
  @keyframes clpUp {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .ic {
    font-size: 20px;
    color: var(--accent, var(--accent));
    flex: none;
  }
  .msg {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .msg b {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
  }
  .sub {
    font-size: 11px;
    color: var(--textdim);
    line-height: 1.35;
  }
  .go {
    flex: none;
    height: 34px;
    padding: 0 15px;
    border-radius: 9px;
    border: none;
    background: var(--accent, var(--accent));
    color: var(--accentink);
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
  }
  .go:hover {
    filter: brightness(1.08);
  }
  .later {
    flex: none;
    height: 34px;
    padding: 0 11px;
    border-radius: 9px;
    border: 1px solid var(--border2);
    background: transparent;
    color: var(--textdim);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .later:hover {
    color: var(--text);
    border-color: var(--border3);
  }
</style>
