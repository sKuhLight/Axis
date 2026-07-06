<script lang="ts">
  import type { NavigationEntryState, WorkbenchCommand } from '../../workbench';

  let {
    entry,
    runAction
  }: {
    entry: NavigationEntryState;
    dispatch: (command: WorkbenchCommand) => void;
    runAction: () => void;
    editMode: boolean;
  } = $props();

  const glyphs: Record<string, string> = {
    grid: '▦',
    library: '≣',
    fc: '⬚',
    scenes: '❏',
    live: '▷',
    setup: '⚙',
    account: '◈'
  };

</script>

<button class="axis-nav-entry" class:account={entry.id === 'account'} type="button" onclick={runAction} title={entry.label ?? entry.id}>
  <span class="ic">{glyphs[entry.id] ?? '•'}</span>
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
