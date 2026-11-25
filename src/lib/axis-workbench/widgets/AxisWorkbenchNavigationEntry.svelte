<script lang="ts">
  import type { NavigationEntryState, WorkbenchCommand } from '../../workbench';

  let {
    entry,
    runAction,
    active = false
  }: {
    entry: NavigationEntryState;
    dispatch: (command: WorkbenchCommand) => void;
    runAction: () => void;
    editMode: boolean;
    active?: boolean;
  } = $props();

</script>

{#snippet glyph(id: string)}
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {#if id === 'grid'}
      <rect x="2.5" y="8.5" width="6.5" height="6.5" rx="1.3" />
      <rect x="15" y="2.5" width="6.5" height="6.5" rx="1.3" />
      <rect x="15" y="15" width="6.5" height="6.5" rx="1.3" />
      <path d="M9 11.75h3v-6h3M9 11.75h3v6.5h3" stroke-width=".85" />
    {:else if id === 'library'}
      <path d="M3.4 6.2H13M3.4 11H10M3.4 15.8h4m11.2 1.8 2.8 2.8" />
      <circle cx="16" cy="15" r="3.5" />
    {:else if id === 'fc'}
      <rect x="2.6" y="3.4" width="18.8" height="17.2" rx="4.2" fill="currentColor" stroke="none" />
      <text x="12" y="15.9" font-weight="800" font-size="10.6" text-anchor="middle" stroke="none" style:fill="var(--aw-bg-2, var(--bg2))">FC</text>
    {:else if id === 'controllers'}
      <circle cx="12" cy="15.6" r="5.6" />
      <path d="M12 15.6V11M4.6 8.6a8.5 8.5 0 0 1 14.8 0" />
    {:else if id === 'scenes'}
      <rect x="3" y="7" width="13" height="13" rx="2" />
      <path d="M8 4h10a2 2 0 0 1 2 2v10M7 12h5m-5 4h5" />
    {:else if id === 'live'}
      <circle cx="12" cy="12" r="8.6" />
      <path d="m10.1 8.5 5.6 3.5-5.6 3.5Z" />
    {:else if id === 'setup'}
      <path d="M3.4 7.4h2.2M12 7.4h8.6M3.4 16.6H12m6.8 0h1.8" stroke-width="2.2" />
      <circle cx="8.4" cy="7.4" r="2.8" fill="currentColor" stroke="none" />
      <circle cx="15.6" cy="16.6" r="2.8" fill="currentColor" stroke="none" />
    {:else if id === 'theme'}
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 0 0 0 17Z" fill="currentColor" stroke="none" />
    {:else if id === 'account'}
      <path d="m12 2.8 9.2 9.2-9.2 9.2L2.8 12Zm0 5.1 4.1 4.1-4.1 4.1L7.9 12Z" />
    {:else}
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    {/if}
  </svg>
{/snippet}

<button
  class="axis-nav-entry"
  class:account={entry.id === 'account'}
  class:active
  type="button"
  aria-current={active ? 'page' : undefined}
  aria-label={entry.label ?? entry.id}
  onclick={runAction}
  title={entry.label ?? entry.id}
>
  <span class="ic">{@render glyph(entry.id)}</span>
  <span class="lbl">{entry.label ?? entry.id}</span>
</button>

<style>
  /* Design 01-shell §9: rail nav items 52×50, radius 11, glyph 18px, label 10px/600. */
  .axis-nav-entry {
    width: 100%;
    min-width: 0;
    height: 50px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: 1px solid transparent;
    border-radius: 11px;
    background: transparent;
    color: var(--textfaint);
    cursor: pointer;
  }
  .axis-nav-entry:hover {
    color: var(--text);
    background: var(--surface2);
  }
  /* Design 01-shell §9: active rail item = accent ink + subtle bg tint + border.
     The wrapper already reserves a transparent 1px border for this. */
  .axis-nav-entry.active {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border-color: color-mix(in srgb, var(--accent) 32%, transparent);
  }
  .axis-nav-entry.active:hover {
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 20%, transparent);
  }
  .axis-nav-entry.account {
    color: var(--accent);
  }
  .ic {
    display: flex;
    line-height: 1;
  }
  .lbl {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10px;
    font-weight: 600;
  }
</style>
