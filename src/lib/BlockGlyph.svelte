<script lang="ts">
  import { trustedBlockGlyph } from './catalog';
  let { glyph }: { glyph: string | null | undefined } = $props();
  const svg = $derived(trustedBlockGlyph(glyph));
</script>

<span class="block-glyph" aria-hidden="true">
  {#if svg}{@html svg}{:else}{glyph ?? '◻'}{/if}
</span>

<style>
  .block-glyph { display: inline-flex; width: 1em; height: 1em; align-items: center; justify-content: center; vertical-align: middle; }
  .block-glyph :global(svg) { display: block; width: 100%; height: 100%; }
</style>
