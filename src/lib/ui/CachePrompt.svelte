<script lang="ts">
  // One-time offer to build the local library cache (names · blocks · models · params for every preset),
  // shown when connected and no cache exists yet. Powers the quick picker names, Preset Browser search,
  // and param queries — like the OG editor's index. Dismissable per session.
  import { editor } from '$lib/editor/editor.svelte';
  import { library } from '$lib/preset/library.svelte';
  import PromptToast from './PromptToast.svelte';
  import PromptRow from './PromptRow.svelte';
  import PromptProgressRow from './PromptProgressRow.svelte';
  import Button from './Button.svelte';

  let dismissed = $state(false);
  const show = $derived(!dismissed && !library.cacheBuilt && !library.scanning && editor.conn.state === 'online');
</script>

{#if library.scanning}
  <PromptToast maxWidth={420}>
    <PromptProgressRow label="Building library cache…" done={library.scanDone} total={library.scanTotal} />
  </PromptToast>
{:else if show}
  <PromptToast>
    <PromptRow icon="≣">
      {#snippet message()}
        <b>Build the library cache?</b>
        <span class="sub">Indexes every preset — names, blocks, models &amp; all params — so the browser, search and quick picker work instantly. One pass, stored locally.</span>
      {/snippet}
      {#snippet actions()}
        <Button variant="primary" size="sm" onclick={() => library.buildCache()}>Build cache</Button>
        <Button variant="secondary" size="sm" onclick={() => (dismissed = true)}>Later</Button>
      {/snippet}
    </PromptRow>
  </PromptToast>
{/if}
