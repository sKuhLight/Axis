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
  .axis-nav-entry {
    width: 100%;
    min-width: 0;
    height: 48px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--textdim);
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
    font-size: 17px;
    line-height: 1;
  }
  .lbl {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 9px;
    font-weight: 800;
  }
</style>
