<script lang="ts">
  // Full-view rail screen for a virtual effect (Setup / Controllers / Modifier / FC). It's the same
  // device-canvas editor as a block, pointed at effectId 1/2/3/199 — device-authentic editor pages
  // come from the served layout, reads/writes go through the normal param path.
  import { paramEditing } from '$lib/editor/editorClients.svelte';
  import DeviceCanvas from './DeviceCanvas.svelte';
  import { deriveModulationGraphs } from '$lib/graphs/modulationGraphs';
  import { deriveAdsrGraphs } from '$lib/graphs/adsrGraphs';

  // accent per context (matches the rail's visual language)
  const ACCENT: Record<string, string> = {
    global: '#35c9d6',
    controllers: '#4f6bed',
    mod: '#a06bed',
    fc: '#f5a623'
  };
  const accent = $derived(ACCENT[paramEditing.virtual?.slug ?? ''] ?? '#35c9d6');
  // Virtual Controllers uses the same served layout and live params as a block paramEditing.
  const modulationGraphs = $derived.by(() => {
    for (const option of paramEditing.enums) void option.value;
    return deriveModulationGraphs({ layout: paramEditing.blockLayout, params: paramEditing.params, enums: paramEditing.enums });
  });
  const adsrGraphs = $derived(deriveAdsrGraphs({ layout: paramEditing.blockLayout, params: paramEditing.params }));
</script>

{#if paramEditing.virtual}
  <section class="vscreen" style="--c:{accent}">
    <header class="vhead">
      <span class="dot" style="background:{accent}"></span>
      <h2>{paramEditing.virtual.name}</h2>
      <span class="sub mono">effect {paramEditing.virtual.eid}</span>
    </header>

    {#if paramEditing.sheetState === 'loading'}
      <div class="msg"><p>Reading {paramEditing.virtual.name}…</p></div>
    {:else if paramEditing.sheetState === 'error'}
      <div class="msg"><p>Couldn't read {paramEditing.virtual.name}. Check the connection.</p></div>
    {:else if paramEditing.sheetState === 'nopack' || (paramEditing.params.length === 0 && paramEditing.enums.length === 0)}
      <div class="msg"><p>No parameters available for {paramEditing.virtual.name}.</p></div>
    {:else}
      <div class="vbody">
        <DeviceCanvas slug={paramEditing.virtual.slug} {accent} {modulationGraphs} {adsrGraphs} />
      </div>
    {/if}
  </section>
{/if}

<style>
  .vscreen {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .vhead {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 18px;
    border-bottom: 1px solid var(--line, var(--border2));
  }
  .vhead h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
    color: var(--text);
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .sub {
    font-size: 11px;
    color: var(--muted, var(--textdim));
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .vbody {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden; /* the DeviceCanvas scrolls internally — no sideways scroll of the rail itself */
  }
  .msg {
    flex: 1;
    display: grid;
    place-items: center;
    color: var(--muted, var(--textdim));
    font-size: 14px;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
</style>
