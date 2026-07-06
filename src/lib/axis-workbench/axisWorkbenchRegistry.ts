import { createWorkbenchRenderRegistry } from '../workbench';
import FallbackNavigation from '../workbench/svelte/FallbackNavigation.svelte';
import FallbackPanel from '../workbench/svelte/FallbackPanel.svelte';
import FallbackWidget from '../workbench/svelte/FallbackWidget.svelte';
import AxisBlockEditorPanel from './panels/AxisBlockEditorPanel.svelte';
import AxisCustomPanel from './panels/AxisCustomPanel.svelte';
import AxisDockActionPanel from './panels/AxisDockActionPanel.svelte';
import AxisFcPanel from './panels/AxisFcPanel.svelte';
import AxisHistoryDockPanel from './panels/AxisHistoryDockPanel.svelte';
import AxisPresetBrowserPanel from './panels/AxisPresetBrowserPanel.svelte';
import AxisSignalGridPanel from './panels/AxisSignalGridPanel.svelte';
import AxisFcPartPanel from './panels/fc/AxisFcPartPanel.svelte';
import AxisPresetBrowserPartPanel from './panels/preset-browser/AxisPresetBrowserPartPanel.svelte';
import AxisWorkbenchNavigationEntry from './widgets/AxisWorkbenchNavigationEntry.svelte';
import AxisWorkbenchWidget from './widgets/AxisWorkbenchWidget.svelte';
import { createAxisParameterSourceEdgeDropAction, createAxisPinSelectedParametersAction } from './axisParameterActions';
import {
  AXIS_WORKBENCH_BASE_PANEL_TYPES,
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

AXIS_WORKBENCH_WIDGET_TYPES.forEach((type) => registry.registerWidget({ type, component: AxisWorkbenchWidget }));

AXIS_WORKBENCH_NAVIGATION_IDS.forEach((id) =>
  registry.registerNavigation({ id, component: AxisWorkbenchNavigationEntry })
);

registry.registerAction({ id: 'axis.openGrid', run: async () => (await axisEditor()).openBuild() });
registry.registerAction({ id: 'axis.openPresetBrowser', run: async () => (await axisEditor()).openLibrary() });
registry.registerAction({
  id: 'axis.openFc',
  run: async () => {
    const editor = await axisEditor();
    const fc = editor.caps?.virtualEffects?.find((effect) => effect.slug === 'fc') ?? { eid: 199, slug: 'fc', name: 'Footswitches' };
    editor.openVirtual(fc.eid, fc.slug, fc.name);
  }
});
registry.registerAction({ id: 'axis.openAccount', run: async () => (await axisEditor()).openAxis('account') });
registry.registerAction({ id: 'axis.openScenes', run: async () => (await axisEditor()).showToast('Scenes — coming soon', '#35c9d6') });
registry.registerAction({ id: 'axis.openLive', run: async () => (await axisEditor()).showToast('Live — coming soon', '#35c9d6') });
registry.registerAction({ id: 'axis.openSetup', run: async () => (await axisEditor()).showToast('Setup — coming soon', '#35c9d6') });
registry.registerAction(createAxisPinSelectedParametersAction());
registry.registerAction(createAxisParameterSourceEdgeDropAction());

export const axisWorkbenchRegistry = registry;
