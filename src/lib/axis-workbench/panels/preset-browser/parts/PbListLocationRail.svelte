<script lang="ts">
  import { deviceSession } from '$lib/editor/editorClients.svelte';
  import { axisPresetBrowserWorkbenchController } from '../../../presetBrowser/presetBrowserWorkbenchController';
  import type { AxisPresetBrowserPartView } from '../../../presetBrowser/presetBrowserWorkbenchView.svelte';

  let { view }: { view: AxisPresetBrowserPartView } = $props();

  const activeScope = $derived(
    view.data.activePresenceView === 'computer' || ['local', 'file', 'converted'].includes(view.data.activeSourceId)
      ? 'computer'
      : view.data.activeSourceId === 'device' || view.data.activePresenceView === 'device'
        ? 'device'
        : 'all'
  );
  const scopeCounts = $derived(Object.fromEntries(view.data.presenceViews.map((scope) => [scope.id, scope.count])));
  const activeCount = $derived(
    activeScope === 'device'
      ? `${scopeCounts.device ?? 0}/${deviceSession.presetCount}`
      : String(scopeCounts[activeScope] ?? 0)
  );

  function selectScope(event: Event) {
    const scope = (event.currentTarget as HTMLSelectElement).value as 'all' | 'device' | 'computer';
    view.selectSource(scope === 'device' ? 'device' : 'all');
    axisPresetBrowserWorkbenchController.setPresenceView(scope === 'computer' ? 'computer' : 'all');
  }
</script>

<label class="location-select">
  <span class="location-copy">
    <strong>{activeScope === 'all' ? 'All' : activeScope === 'device' ? 'Device' : 'Computer'}</strong>
    <small>{activeCount}</small>
  </span>
  <select aria-label="Preset location" value={activeScope} onchange={selectScope}>
    <option value="all">All ({scopeCounts.all ?? 0})</option>
    <option value="device">Device ({scopeCounts.device ?? 0}/{deviceSession.presetCount})</option>
    <option value="computer">Computer ({scopeCounts.computer ?? 0})</option>
  </select>
  <span class="chevron" aria-hidden="true">⌄</span>
</label>

<style>
  .location-select {
    position: relative;
    flex: none;
    height: 40px;
    min-width: 150px;
    display: flex;
    align-items: center;
    padding: 0 30px 0 11px;
    border: 1px solid var(--border2, var(--border));
    border-radius: 12px;
    background: var(--bg2);
    cursor: pointer;
  }
  .location-copy {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    pointer-events: none;
  }
  .location-copy strong {
    color: var(--accent);
    font-size: 12px;
    font-weight: 800;
  }
  .location-copy small {
    color: var(--textfaint);
    font: 700 9px/1 var(--font-mono);
  }
  select {
    position: absolute;
    inset: 0;
    width: 100%;
    opacity: 0;
    cursor: pointer;
  }
  .chevron {
    position: absolute;
    right: 10px;
    color: var(--textdim);
    font-size: 12px;
    pointer-events: none;
  }
  .location-select:focus-within {
    border-color: var(--accent);
  }
</style>
