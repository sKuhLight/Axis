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

  // Inline SVG nav glyphs — 24×24 viewBox, 1em square so they inherit the `.ic`
  // font-size. `line` is the chosen 1.7px rounded-stroke set; `solid` covers the
  // two filled glyphs (Footswitches, Setup). The Footswitches switch cut-outs use
  // `--aw-bg-2` (the bottom bar's own background) so they read as holes. No hex,
  // and `style` (not the `fill` attribute) carries the `var()` for Safari.
  const line = (inner: string) =>
    `<svg viewBox="0 0 24 24" width="1em" height="1em" style="display:block" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const solid = (inner: string) =>
    `<svg viewBox="0 0 24 24" width="1em" height="1em" style="display:block" aria-hidden="true" stroke="none">${inner}</svg>`;

  const glyphs: Record<string, string> = {
    grid: line(
      '<rect x="2.5" y="8.5" width="6.5" height="6.5" rx="1.3"/><rect x="15" y="2.5" width="6.5" height="6.5" rx="1.3"/><rect x="15" y="15" width="6.5" height="6.5" rx="1.3"/><path d="M9 11.75h3v-6h3" stroke-width=".85"/><path d="M9 11.75h3v6.5h3" stroke-width=".85"/>'
    ),
    library: line(
      '<path d="M3.4 6.2h9.6M3.4 11h6.6M3.4 15.8h4"/><circle cx="16" cy="15" r="3.5"/><path d="m18.6 17.6 2.8 2.8"/>'
    ),
    fc: solid(
      '<rect x="2.8" y="4.2" width="18.4" height="15.6" rx="2.8" fill="currentColor"/><circle cx="7.6" cy="15.6" r="3" style="fill:var(--aw-bg-2)"/><circle cx="7.6" cy="15.6" r="1.4" fill="currentColor"/><circle cx="12" cy="15.6" r="3" style="fill:var(--aw-bg-2)"/><circle cx="12" cy="15.6" r="1.4" fill="currentColor"/><circle cx="16.4" cy="15.6" r="3" style="fill:var(--aw-bg-2)"/><circle cx="16.4" cy="15.6" r="1.4" fill="currentColor"/>'
    ),
    controllers: line(
      '<circle cx="12" cy="15.6" r="5.6"/><path d="M12 15.6V11"/><path d="M4.6 8.6a8.5 8.5 0 0 1 14.8 0"/>'
    ),
    scenes: line(
      '<path d="m12 3.2 8.5 4.5-8.5 4.5-8.5-4.5L12 3.2Z"/><path d="m4.4 12.2 7.6 4 7.6-4"/><path d="m4.4 15.9 7.6 4 7.6-4"/>'
    ),
    live: line('<circle cx="12" cy="12" r="8.6"/><path d="m10.1 8.5 5.6 3.5-5.6 3.5V8.5Z"/>'),
    setup: solid(
      '<path d="M3.4 7.4h2.2M12 7.4h8.6M3.4 16.6h8.6M18.8 16.6h1.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="8.4" cy="7.4" r="2.8" fill="currentColor"/><circle cx="15.6" cy="16.6" r="2.8" fill="currentColor"/>'
    ),
    account: line('<path d="m12 2.8 9.2 9.2-9.2 9.2L2.8 12 12 2.8Z"/><path d="m12 7.9 4.1 4.1-4.1 4.1L7.9 12 12 7.9Z"/>')
  };
</script>

<button
  class="axis-nav-entry"
  class:account={entry.id === 'account'}
  class:active
  type="button"
  aria-current={active ? 'page' : undefined}
  aria-label={entry.label ?? entry.id}
  onclick={runAction}
  onmouseleave={(event) => (event.currentTarget as HTMLElement).blur()}
  title={entry.label ?? entry.id}
>
  <span class="ic">{@html glyphs[entry.id] ?? '•'}</span>
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
    font-size: 18px;
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
