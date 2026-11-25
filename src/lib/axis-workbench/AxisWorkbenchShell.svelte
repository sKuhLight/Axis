<script lang="ts">
  import { onMount } from 'svelte';
  import WorkbenchHost from '../workbench/svelte/WorkbenchHost.svelte';
  import { registerWorkbenchBackupProvider } from '../workbench/svelte/layoutActions';
  import type { WorkbenchEditBarExtension } from '../workbench/svelte/editBarMenus';
  import {
    axisWorkbenchController,
    axisWorkbenchInit,
    axisWorkbenchListBackups,
    axisWorkbenchRestoreBackup
  } from './axisWorkbenchStore.svelte';
  import { axisWorkbenchRegistry } from './axisWorkbenchRegistry';
  import { axisWorkbenchTheme } from './axisWorkbenchTheme';
  import {
    axisActiveLayoutPresetKind,
    axisLayoutPresetLabel,
    axisProfileSummaryLabel,
    buildAxisLayoutMenuItems,
    buildAxisProfileOptions,
    resolveAxisProfileSwitcherState,
    seedAxisProfiles,
    setAxisProfileOverride
  } from './axisWorkbenchLayoutActions';
  import { createAxisPagesExtension } from './axisDefaultPages';
  import { editor } from '../editor.svelte';
  import {
    createAxisMobileBlockFlowMemory,
    decideAxisMobileBlockFlow,
    type AxisMobileBlockFlowMemory
  } from './axisMobileBlockFlow';

  // Ensure the tablet/mobile profiles exist (seeded from their presets) so the
  // profile switcher always has a layout to show. Idempotent.
  seedAxisProfiles(axisWorkbenchController);

  // Bridge the Axis-side rolling backups into the generic "Backups" sections (the
  // edit bar's LAYOUT menu and the Layouts drawer) — a module-singleton seam in
  // layoutActions.ts, same pattern as toasts.ts. Idempotent.
  registerWorkbenchBackupProvider({
    list: axisWorkbenchListBackups,
    restore: axisWorkbenchRestoreBackup
  });

  // Axis contributions to the generic edit bar: the LAYOUT presets (+ reset),
  // the PROFILE control (Auto · Desktop · Tablet · Mobile), and the PAGES part
  // (missing default pages in every "Add page" menu, Reset to default / Clear
  // page — shared with the nav "+" and context menu). Read on every controller
  // change; the pure builders live in axisWorkbenchLayoutActions.ts and
  // axisDefaultPages.ts.
  const profileState = () =>
    resolveAxisProfileSwitcherState(
      axisWorkbenchController.profileOverride,
      axisWorkbenchController.document.activeProfileId
    );
  const editBar: WorkbenchEditBarExtension = {
    layout: {
      label: () => axisLayoutPresetLabel(axisActiveLayoutPresetKind(axisWorkbenchController.activeLayout)),
      items: () => buildAxisLayoutMenuItems(axisWorkbenchController)
    },
    profile: {
      label: () => axisProfileSummaryLabel(profileState()),
      options: () => buildAxisProfileOptions(profileState()),
      // Live viewport width so clearing the pin (Auto) re-resolves against the
      // real window instead of holding a stale profile id.
      select: (id) =>
        setAxisProfileOverride(
          axisWorkbenchController,
          id,
          typeof window !== 'undefined' ? window.innerWidth : undefined
        )
    },
    pages: createAxisPagesExtension({
      getLayout: () => axisWorkbenchController.activeLayout,
      dispatchMany: (commands) => {
        axisWorkbenchController.dispatchMany(commands);
      }
    })
  };

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
  let workspaceHeightPx = $state(0);
  let heightPx = $state(0);

  onMount(() => {
    const workspace = document.querySelector<HTMLElement>('.aw-workspace');
    if (!workspace) return;
    const measure = () => { workspaceHeightPx = workspace.clientHeight; };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(workspace);
    return () => observer.disconnect();
  });

  const profileIsPhone = $derived($axisWorkbenchController.activeProfile?.breakpoint === 'phone');
  // A block is "open" for flow purposes when its editor is open on a real selection.
  const blockOpen = $derived(!!editor.editorOpen && !!editor.selected);

  $effect(() => {
    // Track the reactive inputs so the effect re-runs on any relevant change.
    const isPhone = profileIsPhone;
    const open = blockOpen;
    // Touch the document so a profile/layout swap also re-evaluates.
    const doc = $axisWorkbenchController.document;
    const decision = decideAxisMobileBlockFlow(
      { profileIsPhone: isPhone, blockOpen: open, workbenchHeightPx: heightPx, workspaceHeightPx, doc },
      flowMemory
    );
    flowMemory = decision.memory;
    if (decision.commands.length) {
      axisWorkbenchController.dispatchMany(decision.commands);
    }
  });
</script>

<svelte:window bind:innerHeight={heightPx} />

<WorkbenchHost
  controller={axisWorkbenchController}
  registry={axisWorkbenchRegistry}
  theme={axisWorkbenchTheme}
  {editBar}
/>
