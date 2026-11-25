<script lang="ts">
  import type { DockDropOverlayModel } from './dockDropOverlay';
  import type { WorkbenchRect } from './drag';

  // Rendered by DragLayer for panel drags. Every rect in the model is visual
  // (client) px; `zoom` is DragLayer's effective ancestor zoom, so dividing
  // puts each box where the measured rect is.
  let { model, zoom = 1 }: { model: DockDropOverlayModel; zoom?: number } = $props();

  const box = (rect: WorkbenchRect) =>
    `left:${rect.left / zoom}px; top:${rect.top / zoom}px; width:${rect.width / zoom}px; height:${rect.height / zoom}px;`;
</script>

<div class="aw-dock-overlay" data-dock-overlay>
  {#each model.edgeBars as bar (bar.id)}
    <div class="aw-dock-edge-bar" data-dock-edge={bar.id} style={box(bar.rect)}></div>
  {/each}
  {#each model.zones as zone (zone.id)}
    <div class="aw-dock-zone" data-dock-zone={zone.id} style={box(zone.rect)}></div>
  {/each}
  {#if model.landing}
    <!-- The ONE highlighted shape: exactly where the panel will land. -->
    <div class="aw-dock-landing" data-dock-landing={model.landing.key} style={box(model.landing.rect)}></div>
  {/if}
  {#each model.zoneLabels as label (label.id)}
    <div class="aw-dock-zone-label" class:over={label.over} data-dock-zone-label={label.id} style={box(label.rect)}>
      {label.text}
    </div>
  {/each}
  {#if model.landing}
    <div
      class="aw-dock-landing-label"
      data-dock-landing-label={model.landing.key}
      style={box(model.landing.labelRect)}
    >
      <b>{model.landing.label}</b>
      {#if model.landing.sub}<span>{model.landing.sub}</span>{/if}
    </div>
  {/if}
  {#if model.caret}
    <div class="aw-dock-caret" style={box(model.caret)}></div>
  {/if}
  {#if model.page}
    <div
      class="aw-dock-page"
      class:refused={!model.page.accepts}
      data-dock-page={model.page.pageId}
      data-accepts={model.page.accepts ? 'true' : 'false'}
      style={box(model.page.rect)}
    ></div>
  {/if}
  <div class="aw-dock-card" class:invalid={model.invalid} data-dock-card style={box(model.card.rect)}>
    <b>{model.card.title}</b>
    <span>{model.card.hint}</span>
  </div>
</div>

<style>
  .aw-dock-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .aw-dock-overlay > div {
    position: fixed;
    box-sizing: border-box;
  }
  .aw-dock-edge-bar {
    border-radius: 4px;
    background: color-mix(in srgb, var(--aw-accent) 40%, transparent);
  }
  /* Inactive zones: faint dashed boxes, clipped to what the landing shape leaves free. */
  .aw-dock-zone {
    border: 1px dashed color-mix(in srgb, var(--aw-accent) 50%, transparent);
    border-radius: 8px;
  }
  /* The landing shape: opaque accent tint so nothing underneath competes. */
  .aw-dock-landing {
    border: 2px solid var(--aw-accent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--aw-accent) 14%, var(--aw-bg));
    box-shadow:
      0 0 0 4px color-mix(in srgb, var(--aw-accent) 14%, transparent),
      inset 0 0 48px color-mix(in srgb, var(--aw-accent) 14%, transparent);
    animation: awDockIn 0.1s ease;
  }
  .aw-dock-landing-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    overflow: hidden;
    border-radius: 8px;
    background: var(--aw-accent);
    color: var(--aw-accent-ink);
    white-space: nowrap;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
  }
  .aw-dock-landing-label b {
    font: 700 13px/1.2 var(--aw-font-mono);
  }
  .aw-dock-landing-label span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    font: 600 11px/1.2 var(--aw-font-ui);
  }
  .aw-dock-zone-label {
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 6px;
    background: color-mix(in srgb, var(--aw-bg) 94%, transparent);
    color: color-mix(in srgb, var(--aw-accent) 70%, var(--aw-text));
    white-space: nowrap;
    font: 500 12px/1.2 var(--aw-font-mono);
  }
  .aw-dock-zone-label.over {
    border: 1px solid color-mix(in srgb, var(--aw-accent) 40%, var(--aw-border));
    background: var(--aw-bg);
    color: var(--aw-text-2);
  }
  .aw-dock-caret {
    border-radius: 2px;
    background: var(--aw-accent);
    box-shadow: 0 0 10px color-mix(in srgb, var(--aw-accent) 60%, transparent);
  }
  /* A nav page under the pointer: accent when it accepts the panel, danger when refused. */
  .aw-dock-page {
    border: 2px solid var(--aw-accent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--aw-accent) 18%, transparent);
  }
  .aw-dock-page.refused {
    border-color: var(--aw-danger);
    background: color-mix(in srgb, var(--aw-danger) 18%, transparent);
  }
  /* Pointer card: what is dragged + what a release does here. Never covers the
     active label (placement in dockDropOverlay.ts). */
  .aw-dock-card {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    padding: 0 12px;
    overflow: hidden;
    border: 2px solid var(--aw-amber);
    border-radius: 9px;
    background: var(--aw-surface);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.6);
  }
  .aw-dock-card b,
  .aw-dock-card span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .aw-dock-card b {
    color: var(--aw-amber);
    font: 600 12px/1.2 var(--aw-font-mono);
  }
  .aw-dock-card span {
    color: var(--aw-text-2);
    font: 500 11.5px/1.3 var(--aw-font-ui);
  }
  .aw-dock-card.invalid {
    border-color: var(--aw-danger);
  }
  .aw-dock-card.invalid b {
    color: var(--aw-danger);
  }
  @keyframes awDockIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
