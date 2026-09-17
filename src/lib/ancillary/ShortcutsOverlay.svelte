<script lang="ts">
  import Dialog from '$lib/ui/Dialog.svelte';
  import DialogBody from '$lib/ui/DialogBody.svelte';
  import { overlays } from '$lib/overlay/overlays.svelte';
  import { deviceSession } from '$lib/editor/editorClients.svelte';
  import { axisWorkbenchController } from '$lib/axis-workbench/axisWorkbenchStore.svelte';
  import { AXIS_PAGE_GRID, AXIS_PAGE_PRESET_BROWSER } from '$lib/axis-workbench/axisWorkbenchPages';
  import { visibleShortcutGroups } from './shortcuts';

  const open = $derived(overlays.isOpen('shortcuts'));
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
  const keyLabel = (key: string) => (key === 'Mod' ? (isMac ? '⌘' : 'Ctrl') : key);

  // Only advertise keys that would do something right now: off the Grid page the editing and
  // grid-tool rows are dropped, and the device-gated rows follow the connected unit's caps.
  const groups = $derived(
    visibleShortcutGroups({
      gridActive: $axisWorkbenchController.activePage?.id === AXIS_PAGE_GRID,
      presetBrowserActive: $axisWorkbenchController.activePage?.id === AXIS_PAGE_PRESET_BROWSER,
      hasTuner: deviceSession.hasTuner,
      hasTempo: deviceSession.hasTempo
    })
  );
</script>

<Dialog
  overlay="shortcuts"
  {open}
  onClose={() => overlays.close('shortcuts')}
  title="Keyboard shortcuts"
  width="520px"
  maxHeight="82vh"
>
  <DialogBody>
    <div class="sc">
      {#each groups as group (group.title)}
        <section class="sc-group">
          <h3 class="sc-group-title">{group.title}</h3>
          <dl class="sc-list">
            {#each group.items as item (item.keys.join('+') + item.label)}
              <div class="sc-row">
                <dt class="sc-keys">
                  {#each item.keys as key, i (i)}
                    {#if i > 0}<span class="sc-plus" aria-hidden="true">+</span>{/if}
                    <kbd class="sc-key mono">{keyLabel(key)}</kbd>
                  {/each}
                </dt>
                <dd class="sc-label">{item.label}</dd>
              </div>
            {/each}
          </dl>
        </section>
      {/each}
    </div>
  </DialogBody>
</Dialog>

<style>
  .sc {
    display: grid;
    gap: 18px;
    padding: 16px 20px 20px;
  }
  .sc-group-title {
    margin: 0 0 8px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .sc-list {
    display: grid;
    gap: 2px;
    margin: 0;
  }
  .sc-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 7px 8px;
    border-radius: 8px;
  }
  .sc-row:hover {
    background: var(--surface-2);
  }
  .sc-keys {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 0;
  }
  .sc-plus {
    color: var(--text-faint);
    font-size: 10px;
  }
  .sc-key {
    min-width: 22px;
    padding: 3px 7px;
    border: 1px solid var(--border2);
    border-radius: 6px;
    background: var(--surface-2);
    color: var(--text);
    font-size: 11px;
    font-weight: 700;
    line-height: 1.3;
    text-align: center;
  }
  .sc-label {
    margin: 0;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-dim);
    text-align: right;
  }
</style>
