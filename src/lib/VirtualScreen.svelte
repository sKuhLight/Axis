<script lang="ts">
  // Full-view rail screen for a virtual effect (Setup / Controllers / Modifier / FC). It's the same
  // widget-grid Control Surface as a block, pointed at effectId 1/2/3/199 — device-authentic editor
  // pages come from the served layout, reads/writes go through the normal param path.
  import { editor } from './editor.svelte';
  import ControlSurface from './ControlSurface.svelte';

  // accent per context (matches the rail's visual language)
  const ACCENT: Record<string, string> = {
    global: '#35c9d6',
    controllers: '#4f6bed',
    mod: '#a06bed',
    fc: '#f5a623'
  };
  const accent = $derived(ACCENT[editor.virtual?.slug ?? ''] ?? '#35c9d6');
</script>

{#if editor.virtual}
  <section class="vscreen" style="--c:{accent}">
    <header class="vhead">
      <span class="dot" style="background:{accent}"></span>
      <h2>{editor.virtual.name}</h2>
      <span class="sub mono">effect {editor.virtual.eid}</span>
      <span class="spacer"></span>
      <button class="back" onclick={() => editor.openBuild()}>← Grid</button>
    </header>

    {#if editor.sheetState === 'loading'}
      <div class="msg"><p>Reading {editor.virtual.name}…</p></div>
    {:else if editor.sheetState === 'error'}
      <div class="msg"><p>Couldn't read {editor.virtual.name}. Check the connection.</p></div>
    {:else if editor.sheetState === 'nopack' || (editor.params.length === 0 && editor.enums.length === 0)}
      <div class="msg"><p>No parameters available for {editor.virtual.name}.</p></div>
    {:else}
      <div class="vbody">
        <ControlSurface slug={editor.virtual.slug} {accent} />
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
  .spacer {
    flex: 1;
  }
  .back {
    background: transparent;
    border: 1px solid var(--line, var(--border2));
    color: var(--text);
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 13px;
    cursor: pointer;
  }
  .back:hover {
    border-color: var(--c);
    color: var(--c);
  }
  .vbody {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden; /* the ControlSurface scrolls internally (vertical only) — no sideways scroll here */
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
