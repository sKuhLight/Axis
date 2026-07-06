<script lang="ts">
  import { onMount } from 'svelte';
  import WorkbenchHost from '../workbench/svelte/WorkbenchHost.svelte';
  import { registerWorkbenchBackupProvider } from '../workbench/svelte/WorkbenchLayoutDrawer.svelte';
  import AxisLayoutPresetPicker from './AxisLayoutPresetPicker.svelte';
  import AxisProfileSwitcher from './AxisProfileSwitcher.svelte';
  import {
    axisWorkbenchController,
    axisWorkbenchInit,
    axisWorkbenchListBackups,
    axisWorkbenchRestoreBackup
  } from './axisWorkbenchStore.svelte';
  import { axisWorkbenchRegistry } from './axisWorkbenchRegistry';
  import { axisWorkbenchTheme } from './axisWorkbenchTheme';
  import { seedAxisProfiles } from './axisWorkbenchLayoutActions';
  import { editor } from '../editor.svelte';
  import {
    createAxisMobileBlockFlowMemory,
    decideAxisMobileBlockFlow,
    type AxisMobileBlockFlowMemory
  } from './axisMobileBlockFlow';

  // Ensure the tablet/mobile profiles exist (seeded from their presets) so the
  // profile switcher always has a layout to show. Idempotent.
  seedAxisProfiles(axisWorkbenchController);

  // Bridge the Axis-side rolling backups into the generic Layouts drawer's
  // "Backups" section (module-singleton seam exported by the drawer, same
  // pattern as toasts.ts — least ceremony vs threading a prop through
  // WorkbenchHost → EditRibbon for one optional integration). Idempotent.
  registerWorkbenchBackupProvider({
    list: axisWorkbenchListBackups,
    restore: axisWorkbenchRestoreBackup
  });

  onMount(() => {
    void axisWorkbenchInit();
  });

  // ── Phone-profile block flow (operator T31 / R9d) ────────────────────────────
  // On the phone profile only: when a block is active the block editor expands to
  // ~75% of the height with the grid in map mode above it; when minimized we return
  // to the column layout. Pure decision core lives in axisMobileBlockFlow.ts; this
  // effect is the thin wiring — it observes the profile + editor selection and
  // dispatches the returned commands through the controller (so persistence/undo
  // stay coherent). Memory is component-local, NOT persisted on the document.
  let flowMemory: AxisMobileBlockFlowMemory = createAxisMobileBlockFlowMemory();

  const profileIsPhone = $derived($axisWorkbenchController.activeProfile?.breakpoint === 'phone');
  // A block is "open" for flow purposes when its editor is open on a real selection.
  const blockOpen = $derived(!!editor.editorOpen && !!editor.selected);

  $effect(() => {
    // Track the reactive inputs so the effect re-runs on any relevant change.
    const isPhone = profileIsPhone;
    const open = blockOpen;
    // Touch the document so a profile/layout swap also re-evaluates.
    const doc = $axisWorkbenchController.document;
    const heightPx = typeof window !== 'undefined' ? window.innerHeight : 0;

    const decision = decideAxisMobileBlockFlow(
      { profileIsPhone: isPhone, blockOpen: open, workbenchHeightPx: heightPx, doc },
      flowMemory
    );
    flowMemory = decision.memory;
    if (decision.commands.length) {
      axisWorkbenchController.dispatchMany(decision.commands);
    }
  });
</script>

{#snippet ribbonExtras()}
  <AxisProfileSwitcher />
  <AxisLayoutPresetPicker />
{/snippet}

<WorkbenchHost
  controller={axisWorkbenchController}
  registry={axisWorkbenchRegistry}
  theme={axisWorkbenchTheme}
  {ribbonExtras}
/>
