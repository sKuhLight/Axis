export interface AxisWorkbenchRuntimeAdapterManifestEntry {
  id: string;
  label: string;
  panelModule: string;
  runtimeModule: string;
  hostFactoryModule: string;
  controllerModule: string;
  dataModule: string;
  parts: string[];
}

export const AXIS_WORKBENCH_RUNTIME_ADAPTERS: AxisWorkbenchRuntimeAdapterManifestEntry[] = [
  {
    id: 'axis.presetBrowser',
    label: 'Preset Browser',
    panelModule: 'src/lib/axis-workbench/panels/preset-browser/AxisPresetBrowserPartPanel.svelte',
    runtimeModule: 'src/lib/axis-workbench/presetBrowser/presetBrowserWorkbenchRuntime.ts',
    hostFactoryModule: 'src/lib/axis-workbench/presetBrowser/presetBrowserWorkbenchHost.ts',
    controllerModule: 'src/lib/axis-workbench/presetBrowser/presetBrowserWorkbenchController.ts',
    dataModule: 'src/lib/axis-workbench/presetBrowser/presetBrowserWorkbenchData.ts',
    parts: ['full', 'sources', 'list', 'detail']
  },
  {
    id: 'axis.fc',
    label: 'Foot Controller',
    panelModule: 'src/lib/axis-workbench/panels/fc/AxisFcPartPanel.svelte',
    runtimeModule: 'src/lib/axis-workbench/fc/fcWorkbenchRuntime.ts',
    hostFactoryModule: 'src/lib/axis-workbench/fc/fcWorkbenchHost.ts',
    controllerModule: 'src/lib/axis-workbench/fc/fcWorkbenchController.ts',
    dataModule: 'src/lib/axis-workbench/fc/fcWorkbenchData.ts',
    parts: ['full', 'board', 'inspector', 'layouts', 'led', 'tap', 'hold']
  }
];

export function axisWorkbenchRuntimeAdapterIds(): string[] {
  return AXIS_WORKBENCH_RUNTIME_ADAPTERS.map((adapter) => adapter.id);
}
