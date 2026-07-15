import { createWorkbenchRenderRegistry } from '../workbench';
import FallbackNavigation from '../workbench/svelte/FallbackNavigation.svelte';
import FallbackPanel from '../workbench/svelte/FallbackPanel.svelte';
import FallbackWidget from '../workbench/svelte/FallbackWidget.svelte';
import AxisBlockEditorPanel from './panels/AxisBlockEditorPanel.svelte';
import AxisConvertBlockEditorPanel from './panels/AxisConvertBlockEditorPanel.svelte';
import AxisConvertGridPanel from './panels/AxisConvertGridPanel.svelte';
import AxisConvertMinimapPanel from './panels/AxisConvertMinimapPanel.svelte';
import AxisConvertTrayPanel from './panels/AxisConvertTrayPanel.svelte';
import AxisCustomPanel from './panels/AxisCustomPanel.svelte';
import AxisDockActionPanel from './panels/AxisDockActionPanel.svelte';
import AxisFcPanel from './panels/AxisFcPanel.svelte';
import AxisHistoryDockPanel from './panels/AxisHistoryDockPanel.svelte';
import AxisPlaceholderPanel from './panels/AxisPlaceholderPanel.svelte';
import AxisPresetBrowserPanel from './panels/AxisPresetBrowserPanel.svelte';
import AxisSignalGridPanel from './panels/AxisSignalGridPanel.svelte';
import AxisVirtualScreenPanel from './panels/AxisVirtualScreenPanel.svelte';
import AxisBlockEditorModifierPanel from './panels/block-editor/AxisBlockEditorModifierPanel.svelte';
import AxisFcPartPanel from './panels/fc/AxisFcPartPanel.svelte';
import AxisPresetBrowserPartPanel from './panels/preset-browser/AxisPresetBrowserPartPanel.svelte';
import AxisWorkbenchNavigationEntry from './widgets/AxisWorkbenchNavigationEntry.svelte';
import AxisWorkbenchWidget from './widgets/AxisWorkbenchWidget.svelte';
import { axisWidgetEstWidth, axisWidgetIsKeep } from './widgets/widgetEstWidths';
import { createAxisParameterSourceEdgeDropAction, createAxisPinSelectedParametersAction } from './axisParameterActions';
import { createAxisNavigationPanelAction } from './axisWorkbenchNavigationActions';
import { isAxisNavigationEntryActive } from './axisNavigationActiveState';
import { editor } from '../editor.svelte';
import { axisWorkbenchController } from './axisWorkbenchStore.svelte';
import {
  AXIS_WORKBENCH_BASE_PANEL_TYPES,
  AXIS_WORKBENCH_BLOCK_EDITOR_PANEL_TYPES,
  AXIS_WORKBENCH_FC_PANEL_TYPES,
  AXIS_WORKBENCH_NAVIGATION_IDS,
  AXIS_WORKBENCH_PRESET_BROWSER_PANEL_TYPES,
  AXIS_WORKBENCH_WIDGET_TYPES
} from './axisWorkbenchRegistryManifest';

async function axisEditor() {
  return (await import('../editor.svelte')).editor;
}

const registry = createWorkbenchRenderRegistry(FallbackPanel, FallbackWidget, FallbackNavigation);

AXIS_WORKBENCH_BASE_PANEL_TYPES.forEach((type) => {
  const component =
    type === 'axis.signalGrid' ? AxisSignalGridPanel :
    type === 'axis.blockEditor' ? AxisBlockEditorPanel :
    type === 'axis.presetBrowser' ? AxisPresetBrowserPanel :
    type === 'axis.fc' ? AxisFcPanel :
    type === 'axis.history' ? AxisHistoryDockPanel :
    type === 'axis.customPanel' ? AxisCustomPanel :
    type === 'axis.virtualScreen' ? AxisVirtualScreenPanel :
    type === 'axis.placeholder' ? AxisPlaceholderPanel :
    type === 'axis.convertGrid' ? AxisConvertGridPanel :
    type === 'axis.convertBlockEditor' ? AxisConvertBlockEditorPanel :
    type === 'axis.convertMinimap' ? AxisConvertMinimapPanel :
    type === 'axis.convertTray' ? AxisConvertTrayPanel :
    AxisDockActionPanel;
  registry.registerPanel({ type, component });
});

AXIS_WORKBENCH_PRESET_BROWSER_PANEL_TYPES.forEach((type) =>
  registry.registerPanel({
    type,
    component: type === 'axis.presetBrowser' ? AxisPresetBrowserPanel : AxisPresetBrowserPartPanel
  })
);

AXIS_WORKBENCH_FC_PANEL_TYPES.forEach((type) =>
  registry.registerPanel({
    type,
    component: type === 'axis.fc' ? AxisFcPanel : AxisFcPartPanel
  })
);

// 'axis.blockEditor' itself is a base panel type (registered above) — register only the parts.
AXIS_WORKBENCH_BLOCK_EDITOR_PANEL_TYPES.filter((type) => type !== 'axis.blockEditor').forEach((type) =>
  registry.registerPanel({ type, component: AxisBlockEditorModifierPanel })
);
AXIS_WORKBENCH_WIDGET_TYPES.forEach((type) => registry.registerWidget({ type, component: AxisWorkbenchWidget }));

// Feed the generic auto-fit (workbench/core/widgetFit.ts) the Axis estW table
// + keep-set. The generic layer stays widget-type agnostic.
registry.registerWidgetSizing({ estWidth: axisWidgetEstWidth, isKeep: axisWidgetIsKeep });

// Active-section tint (01-shell.md §9). ROUND 15: the seven page-bound nav entries
// resolve their tint generically in NavigationHost (pageNavigationEntryActive — the
// entry's page is the layout's activePageId). This app provider only covers the two
// ACTION entries — Theme / Axis Cloud — whose open-state lives on the editor store.
// NavigationHost reads this inside a reactive $derived, so the editor runes below
// are tracked and the tint stays live.
registry.registerNavigationState({
  isActive: (entryId) =>
    isAxisNavigationEntryActive({ themeOpen: editor.themeOpen, accountOpen: editor.axisOpen }, entryId)
});

AXIS_WORKBENCH_NAVIGATION_IDS.forEach((id) =>
  registry.registerNavigation({ id, component: AxisWorkbenchNavigationEntry })
);

registry.registerAction({ id: 'axis.openGrid', run: async () => (await axisEditor()).openBuild() });
// Preset Browser nav entry docks-or-focuses the workbench Preset Browser panel
// (V13d), the same add-or-focus semantics as Setup/Scenes/Controllers — so a
// closed PB panel can be reopened from the rail instead of only via a layout
// reload. The panelId matches the singleton key seeded by the defaults roster
// (createAxisWorkbenchPanels), so re-docking never mints a colliding id.
// The old overlay Preset Browser (editor.openLibrary) stays reachable from the
// legacy ToolRail shell and the top-bar search widget (feature-keep).
registry.registerAction(
  createAxisNavigationPanelAction({
    actionId: 'axis.openPresetBrowser',
    panelId: 'axis.presetBrowser',
    panelType: 'axis.presetBrowser',
    title: 'Preset Browser',
    region: 'left'
  })
);
registry.registerAction({
  id: 'axis.openFc',
  run: async () => {
    const editor = await axisEditor();
    const fc = editor.caps?.virtualEffects?.find((effect) => effect.slug === 'fc') ?? { eid: 199, slug: 'fc', name: 'Footswitches' };
    editor.openVirtual(fc.eid, fc.slug, fc.name);
  }
});
registry.registerAction({ id: 'axis.openAccount', run: async () => (await axisEditor()).openAxis('account') });
registry.registerAction({ id: 'axis.openTheme', run: async () => { (await axisEditor()).themeOpen = true; } });
// Nav entries open real docked panels (design rule: no dead no-op navigation, 01-shell.md §9).
// Setup/Controllers dock the shared virtual-effect editor; Scenes/Live get placeholder panels
// until their editors are ported.
registry.registerAction(
  createAxisNavigationPanelAction({
    actionId: 'axis.openSetup',
    panelId: 'axis.setup',
    panelType: 'axis.virtualScreen',
    title: 'Setup',
    region: 'main',
    state: { slug: 'global' }
  })
);
registry.registerAction(
  createAxisNavigationPanelAction({
    actionId: 'axis.openControllers',
    panelId: 'axis.controllers',
    panelType: 'axis.virtualScreen',
    title: 'Controllers',
    region: 'main',
    state: { slug: 'controllers' }
  })
);
registry.registerAction(
  createAxisNavigationPanelAction({
    actionId: 'axis.openScenes',
    panelId: 'axis.scenes',
    panelType: 'axis.placeholder',
    title: 'Scenes',
    region: 'main',
    state: {
      glyph: '◪',
      heading: 'Scenes',
      description: 'Scene snapshots, per-scene bypass and level rides dock here in a later phase.',
      meta: 'Meanwhile · switch scenes from the Scenes widget in the top bar'
    }
  })
);
registry.registerAction(
  createAxisNavigationPanelAction({
    actionId: 'axis.openLive',
    panelId: 'axis.live',
    panelType: 'axis.placeholder',
    title: 'Live',
    region: 'main',
    state: {
      glyph: '⏺',
      heading: 'Live',
      description: 'The performance / setlist view docks here in a later phase.',
      meta: 'Meanwhile · use the Footswitches editor for live control'
    }
  })
);
registry.registerAction(createAxisPinSelectedParametersAction());
registry.registerAction(createAxisParameterSourceEdgeDropAction());

export const axisWorkbenchRegistry = registry;
