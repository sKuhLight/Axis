<script lang="ts">
  // Placeholder pane for navigation areas that don't yet have a real Workbench editor
  // (Scenes / Live). Ports the design's stub-panel block (01-shell.md §2.2): centered
  // glyph / title / description / meta line. This exists so every nav entry opens a real
  // pane instead of a dead "coming soon" toast (design rule: no dead no-op nav entries).
  import type { PanelInstance } from '../../workbench';

  let { panel }: { panel: PanelInstance } = $props();

  const glyph = $derived(typeof panel.state?.glyph === 'string' ? panel.state.glyph : '◪');
  const heading = $derived(typeof panel.state?.heading === 'string' ? panel.state.heading : (panel.title ?? 'Coming soon'));
  const description = $derived(
    typeof panel.state?.description === 'string'
      ? panel.state.description
      : 'This area is being migrated into the Axis Workbench and will dock here in a later phase.'
  );
  const meta = $derived(typeof panel.state?.meta === 'string' ? panel.state.meta : null);
</script>

<section class="stub">
  <div class="inner">
    <span class="glyph" aria-hidden="true">{glyph}</span>
    <h2>{heading}</h2>
    <p>{description}</p>
    {#if meta}<span class="meta">{meta}</span>{/if}
  </div>
</section>

<style>
  .stub {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--bg2);
    color: var(--textdim);
    text-align: center;
  }
  .inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    max-width: 360px;
  }
  .glyph {
    font-size: 34px;
    line-height: 1;
    color: var(--textfaint);
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
  }
  p {
    margin: 0;
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--textdim);
  }
  .meta {
    margin-top: 4px;
    font-family: var(--font-mono);
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--textmuted);
  }
</style>
