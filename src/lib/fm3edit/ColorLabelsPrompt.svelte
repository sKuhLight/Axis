<script lang="ts">
  // One-time opt-in offer to import FM3-Edit's preset-color assignments as Axis tags (replicated-
  // purring-bachman). Mirrors CachePrompt.svelte: a dismissable bottom toast, "Later" is session-only
  // (asked again next launch), accepting is remembered forever (colorLabels.svelte.ts persists it).
  import { colorLabels } from './colorLabels.svelte';
  import PromptToast from '$lib/ui/PromptToast.svelte';
  import PromptRow from '$lib/ui/PromptRow.svelte';
  import Button from '$lib/ui/Button.svelte';

  const offer = $derived(colorLabels.offer);
</script>

{#if offer}
  <PromptToast>
    <PromptRow icon="◐">
      {#snippet message()}
        <b>Import FM3-Edit preset colors?</b>
        <span class="sub">
          Found color labels for {offer.presetCount} preset{offer.presetCount === 1 ? '' : 's'} in FM3-Edit — import them as Axis tags.
        </span>
      {/snippet}
      {#snippet actions()}
        <Button variant="primary" size="sm" onclick={() => colorLabels.accept()}>Import</Button>
        <Button variant="secondary" size="sm" onclick={() => colorLabels.dismiss()}>Later</Button>
      {/snippet}
    </PromptRow>
  </PromptToast>
{/if}
