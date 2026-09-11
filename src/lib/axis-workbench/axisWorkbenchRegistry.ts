import { createWorkbenchRenderRegistry, type WorkbenchPanelComponent, type WorkbenchWidgetComponent } from '../workbench';
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
import AxisMyControlsPanel from './panels/AxisMyControlsPanel.svelte';
import AxisPlaceholderPanel from './panels/AxisPlaceholderPanel.svelte';
import AxisPresetBrowserPanel from './panels/AxisPresetBrowserPanel.svelte';
import AxisSignalGridPanel from './panels/AxisSignalGridPanel.svelte';
import AxisVirtualScreenPanel from './panels/AxisVirtualScreenPanel.svelte';
import AxisBlockEditorModifierPanel from './panels/block-editor/AxisBlockEditorModifierPanel.svelte';
import AxisFcBoardPanel from './panels/fc/AxisFcBoardPanel.svelte';
import AxisFcHoldPanel from './panels/fc/AxisFcHoldPanel.svelte';
import AxisFcInspectorPanel from './panels/fc/AxisFcInspectorPanel.svelte';
import AxisFcLayoutsPanel from './panels/fc/AxisFcLayoutsPanel.svelte';
import AxisFcLedPanel from './panels/fc/AxisFcLedPanel.svelte';
import AxisFcTapPanel from './panels/fc/AxisFcTapPanel.svelte';
import AxisPresetBrowserDetailPanel from './panels/preset-browser/AxisPresetBrowserDetailPanel.svelte';
import AxisPresetBrowserFullPanel from './panels/preset-browser/AxisPresetBrowserFullPanel.svelte';
import AxisPresetBrowserListPanel from './panels/preset-browser/AxisPresetBrowserListPanel.svelte';
import AxisPresetBrowserSourcesPanel from './panels/preset-browser/AxisPresetBrowserSourcesPanel.svelte';
import AxisWorkbenchNavigationEntry from './widgets/AxisWorkbenchNavigationEntry.svelte';
import AxisAccountWidget from './widgets/AxisAccountWidget.svelte';
import AxisBlockSizeWidget from './widgets/AxisBlockSizeWidget.svelte';
import AxisConnectionWidget from './widgets/AxisConnectionWidget.svelte';
import AxisCpuWidget from './widgets/AxisCpuWidget.svelte';
import AxisFcDeviceWidget from './widgets/AxisFcDeviceWidget.svelte';
import AxisFcLayoutsWidget from './widgets/AxisFcLayoutsWidget.svelte';
import AxisFcSwitchViewWidget from './widgets/AxisFcSwitchViewWidget.svelte';
import AxisGridMapWidget from './widgets/AxisGridMapWidget.svelte';
import AxisGridModeWidget from './widgets/AxisGridModeWidget.svelte';
import AxisHintWidget from './widgets/AxisHintWidget.svelte';
import AxisHistoryWidget from './widgets/AxisHistoryWidget.svelte';
import AxisLegalWidget from './widgets/AxisLegalWidget.svelte';
import AxisLogoWidget from './widgets/AxisLogoWidget.svelte';
import AxisMeterToggleWidget from './widgets/AxisMeterToggleWidget.svelte';
import AxisParamControlWidget from './widgets/AxisParamControlWidget.svelte';
import AxisPresetWidget from './widgets/AxisPresetWidget.svelte';
import AxisSaveWidget from './widgets/AxisSaveWidget.svelte';
import AxisScenesWidget from './widgets/AxisScenesWidget.svelte';
import AxisSearchWidget from './widgets/AxisSearchWidget.svelte';
import AxisSectionHeaderWidget from './widgets/AxisSectionHeaderWidget.svelte';
import AxisTelemetryWidget from './widgets/AxisTelemetryWidget.svelte';
import AxisTempoWidget from './widgets/AxisTempoWidget.svelte';
import AxisTunerWidget from './widgets/AxisTunerWidget.svelte';
import AxisUndoRedoWidget from './widgets/AxisUndoRedoWidget.svelte';
import { axisWidgetEstWidth, axisWidgetIsKeep } from './widgets/widgetEstWidths';
import { createAxisPinSelectedParametersAction } from './axisParameterActions';
import { createAxisNavigationPanelAction } from './axisWorkbenchNavigationActions';
import { isAxisNavigationEntryActive } from './axisNavigationActiveState';
import { AXIS_SECTION_HEADER_TYPE, axisMyControlsSectionRemovalIds, axisSectionHeaderLabel, isAxisSectionHeader } from './myControlsSections';
import { AXIS_MY_CONTROLS_ZONE } from './myControlsPanel';
import { overlays } from '$lib/overlay/overlays.svelte';
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
  return (await import('$lib/editor/editor.svelte')).editor;
}

const registry = createWorkbenchRenderRegistry(FallbackPanel, FallbackWidget, FallbackNavigation);

const AXIS_BASE_PANEL_COMPONENTS: Record<string, WorkbenchPanelComponent> = {
  'axis.signalGrid': AxisSignalGridPanel,
  'axis.blockEditor': AxisBlockEditorPanel,
  'axis.presetBrowser': AxisPresetBrowserPanel,
  'axis.fc': AxisFcPanel,
  'axis.history': AxisHistoryDockPanel,
  'axis.customPanel': AxisCustomPanel,
  'axis.myControls': AxisMyControlsPanel,
  'axis.virtualScreen': AxisVirtualScreenPanel,
  'axis.placeholder': AxisPlaceholderPanel,
  'axis.convertGrid': AxisConvertGridPanel,
  'axis.convertBlockEditor': AxisConvertBlockEditorPanel,
  'axis.convertMinimap': AxisConvertMinimapPanel,
  'axis.convertTray': AxisConvertTrayPanel
};
AXIS_WORKBENCH_BASE_PANEL_TYPES.forEach((type) =>
  registry.registerPanel({ type, component: AXIS_BASE_PANEL_COMPONENTS[type] ?? AxisDockActionPanel })
);

const AXIS_PRESET_BROWSER_PANEL_COMPONENTS: Record<string, typeof AxisPresetBrowserPanel> = {
  // Re-registers the same dispatcher the base-panel-types loop above already wired for
  // 'axis.presetBrowser' (a no-op overwrite) — kept for parity with that loop rather than
  // collapsed away, since the manifest genuinely lists this type as one of the preset-browser
  // panel types too.
  'axis.presetBrowser': AxisPresetBrowserPanel,
  'axis.presetBrowser.sources': AxisPresetBrowserSourcesPanel,
  'axis.presetBrowser.list': AxisPresetBrowserListPanel,
  'axis.presetBrowser.detail': AxisPresetBrowserDetailPanel
};
AXIS_WORKBENCH_PRESET_BROWSER_PANEL_TYPES.forEach((type) =>
  registry.registerPanel({ type, component: AXIS_PRESET_BROWSER_PANEL_COMPONENTS[type] })
);

const AXIS_FC_PANEL_COMPONENTS: Record<string, WorkbenchPanelComponent> = {
  'axis.fc': AxisFcPanel,
  'axis.fc.board': AxisFcBoardPanel,
  'axis.fc.inspector': AxisFcInspectorPanel,
  'axis.fc.layouts': AxisFcLayoutsPanel,
  'axis.fc.led': AxisFcLedPanel,
  'axis.fc.tap': AxisFcTapPanel,
  'axis.fc.hold': AxisFcHoldPanel
};
AXIS_WORKBENCH_FC_PANEL_TYPES.forEach((type) => registry.registerPanel({ type, component: AXIS_FC_PANEL_COMPONENTS[type] }));

// 'axis.blockEditor' itself is a base panel type (registered above) — register only the parts.
AXIS_WORKBENCH_BLOCK_EDITOR_PANEL_TYPES.filter((type) => type !== 'axis.blockEditor').forEach((type) =>
  registry.registerPanel({ type, component: AxisBlockEditorModifierPanel })
);
const AXIS_WIDGET_COMPONENTS: Record<string, WorkbenchWidgetComponent> = {
  'axis.logo': AxisLogoWidget,
  'axis.preset': AxisPresetWidget,
  'axis.scenes': AxisScenesWidget,
  'axis.tuner': AxisTunerWidget,
  'axis.tempo': AxisTempoWidget,
  'axis.cpu': AxisCpuWidget,
  'axis.meterToggle': AxisMeterToggleWidget,
  'axis.save': AxisSaveWidget,
  'axis.search': AxisSearchWidget,
  'axis.history': AxisHistoryWidget,
  'axis.gridMap': AxisGridMapWidget,
  'axis.undoRedo': AxisUndoRedoWidget,
  'axis.connection': AxisConnectionWidget,
  'axis.account': AxisAccountWidget,
  'axis.gridMode': AxisGridModeWidget,
  'axis.blockSize': AxisBlockSizeWidget,
  'axis.fcDevice': AxisFcDeviceWidget,
  'axis.fcLayouts': AxisFcLayoutsWidget,
  'axis.fcSwitchView': AxisFcSwitchViewWidget,
  'axis.paramControl': AxisParamControlWidget,
  'axis.sectionHeader': AxisSectionHeaderWidget,
  'axis.hint': AxisHintWidget,
  'axis.legal': AxisLegalWidget,
  'axis.telemetry': AxisTelemetryWidget
};
AXIS_WORKBENCH_WIDGET_TYPES.forEach((type) => registry.registerWidget({ type, component: AXIS_WIDGET_COMPONENTS[type] }));

// Feed the generic auto-fit (workbench/core/widgetFit.ts) the Axis estW table
// + keep-set. The generic layer stays widget-type agnostic.
registry.registerWidgetSizing({ estWidth: axisWidgetEstWidth, isKeep: axisWidgetIsKeep });

// Removing a My Controls section header cascades to the controls under it —
// see myControlsSections.ts. Every other widget type removes just itself,
// which axisMyControlsSectionRemovalIds also returns for a blank divider.
registry.registerWidgetRemoval({
  idsForRemoval: (widget, doc) =>
    widget.type === AXIS_SECTION_HEADER_TYPE ? axisMyControlsSectionRemovalIds(doc, widget.id) : [widget.id]
});

// My Controls is a pin board, not a layout surface — the size / move / save
// items are layout-editing chrome the pin flow retired, so its widgets get a
// context menu of just removal. A named header cascades to its controls, so it
// reads "Remove whole section"; a divider or control is a plain "Remove".
registry.registerWidgetMenu({
  filterItems: (widget, _doc, items) => {
    if (widget.zone !== AXIS_MY_CONTROLS_ZONE) return items;
    const label = isAxisSectionHeader(widget) && axisSectionHeaderLabel(widget) ? 'Remove whole section' : 'Remove';
    return items.filter((item) => item.id === 'remove').map((item) => ({ ...item, label }));
  }
});

// Active-section tint (01-shell.md §9). ROUND 15: the seven page-bound nav entries
// resolve their tint generically in NavigationHost (pageNavigationEntryActive — the
// entry's page is the layout's activePageId). This app provider only covers the two
// ACTION entries — Theme / Axis — whose open-state lives on the editor store.
// NavigationHost reads this inside a reactive $derived, so the editor runes below
// are tracked and the tint stays live.
registry.registerNavigationState({
  isActive: (entryId) =>
    isAxisNavigationEntryActive({ themeOpen: overlays.isOpen('theme'), accountOpen: overlays.isOpen('axisHub') }, entryId)
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
registry.registerAction({ id: 'axis.openAccount', run: async () => (await axisEditor()).openAxis('about') });
registry.registerAction({ id: 'axis.openTheme', run: async () => { overlays.open('theme'); } });
// Nav entries open real docked panels (design rule: no dead no-op navigation, 01-shell.md §9).
// Setup/Controllers dock the shared virtual-effect editor; Scenes/Live get placeholder panels
// until their editors are ported. Copy lives here as data, not inline in the registration call.
const AXIS_SCENES_PLACEHOLDER_COPY = {
  glyph: '◪',
  heading: 'Scenes',
  description: 'Scene snapshots, per-scene bypass and level rides dock here in a later phase.',
  meta: 'Meanwhile · switch scenes from the Scenes widget in the top bar'
};
const AXIS_LIVE_PLACEHOLDER_COPY = {
  glyph: '⏺',
  heading: 'Live',
  description: 'The performance / setlist view docks here in a later phase.',
  meta: 'Meanwhile · use the Footswitches editor for live control'
};
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
    state: AXIS_SCENES_PLACEHOLDER_COPY
  })
);
registry.registerAction(
  createAxisNavigationPanelAction({
    actionId: 'axis.openLive',
    panelId: 'axis.live',
    panelType: 'axis.placeholder',
    title: 'Live',
    region: 'main',
    state: AXIS_LIVE_PLACEHOLDER_COPY
  })
);
registry.registerAction(createAxisPinSelectedParametersAction());
// The generic parameter-source EDGE-DROP action is deliberately NOT registered.
// `DockWorkspace` and `TabStack` gate their parameter drop handlers on
// `registry.hasAction(WORKBENCH_PARAMETER_SOURCE_EDGE_DROP_ACTION)`, so leaving it
// unregistered disables every drag-to-pin drop target at one choke point — pinning
// goes through the pin menu into My Controls only.

export const axisWorkbenchRegistry = registry;
