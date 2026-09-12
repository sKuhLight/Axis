<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { AxisPresetBrowserPart } from '../../../presetBrowser/types';

  let { part, children }: { part: Exclude<AxisPresetBrowserPart, 'full'>; children: Snippet } = $props();
</script>

<section class="axis-part-pane" data-part={part}>
  <header>
    <span>Preset Browser</span>
    <strong>{part}</strong>
  </header>

  {@render children()}
</section>

<style>
  .axis-part-pane {
    position: absolute;
    inset: 0;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    overflow: auto;
    background: var(--bg);
    color: var(--text2);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: var(--textdim);
    font: 800 10px/1 var(--font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  header strong {
    color: var(--accent);
  }
</style>
