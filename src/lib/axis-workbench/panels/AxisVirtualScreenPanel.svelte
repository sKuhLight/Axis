<script lang="ts">
  // Docks the shared virtual-effect editor (Setup / Controllers) as a Workbench pane.
  // The panel's target slug (state.slug) is opened through the normal editor.openVirtual
  // path — the same widget-grid Control Surface the old shell mounts via VirtualScreen —
  // so Setup/Controllers are reachable in the Workbench instead of dead-ending (T09).
  import { untrack } from 'svelte';
  import { editor } from '../../editor.svelte';
  import VirtualScreen from '../../VirtualScreen.svelte';
  import type { PanelInstance } from '../../workbench';

  let { panel }: { panel: PanelInstance } = $props();

  const slug = $derived(typeof panel.state?.slug === 'string' ? panel.state.slug : 'global');
  const fallbackName = $derived(typeof panel.title === 'string' && panel.title ? panel.title : slug);

  // Resolve the effect from live device caps; fall back to the known virtual-effect eids
  // (global=1, controllers=2, mod=3) when caps haven't populated yet.
  const FALLBACK_EID: Record<string, number> = { global: 1, controllers: 2, mod: 3 };

  function ensureOpen() {
    const cap = editor.caps?.virtualEffects?.find((effect) => effect.slug === slug);
    const eid = cap?.eid ?? FALLBACK_EID[slug] ?? 1;
    const name = cap?.name ?? fallbackName;
    if (editor.virtual?.slug === slug) return;
    void editor.openVirtual(eid, slug, name);
  }

  $effect(() => {
    const s = slug;
    // `ensureOpen` reads/writes `editor.virtual` itself — read it untracked so THIS
    // effect only depends on `slug` (mount/slug-change/destroy). Tracking it would
    // make the effect re-run every time `openVirtual` sets it below, tearing itself
    // down (nulling `editor.virtual` right back out) and reopening it — an infinite loop.
    untrack(ensureOpen);
    // Leaving this panel (page switch away from Setup/Controllers, or slug change)
    // must give up the virtual effect it opened — otherwise `editor.selected` keeps
    // synthesizing this panel's cell (editor.svelte.ts `get selected()`) after
    // navigating back to the Grid, and the Block Editor keeps showing it as if it
    // were still selected. Only clear if we're still the one holding it — a newer
    // panel (e.g. Setup opening right after Controllers) may have already taken over.
    return () => {
      if (untrack(() => editor.virtual?.slug) === s) editor.virtual = null;
    };
  });

  const showing = $derived(editor.virtual?.slug === slug);
</script>

<div class="vwrap">
  {#if showing}
    <VirtualScreen />
  {:else}
    <div class="msg">
      <p>{fallbackName} is open in another view.</p>
      <button type="button" onclick={ensureOpen}>Reopen {fallbackName}</button>
    </div>
  {/if}
</div>

<style>
  .vwrap {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg2);
    color: var(--text);
  }
  .msg {
    flex: 1;
    display: grid;
    place-items: center;
    gap: 12px;
    padding: 20px;
    text-align: center;
    color: var(--textdim);
    font-size: 13px;
  }
  .msg button {
    height: 34px;
    padding: 0 14px;
    border: 1px solid var(--accent-border, var(--accent-border1, var(--border2)));
    border-radius: 8px;
    background: var(--accent-tint, transparent);
    color: var(--accent);
    cursor: pointer;
    font-weight: 800;
  }
</style>
