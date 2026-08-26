// Pulled out of AxisPresetBrowserPartPanel.svelte's template so it is unit-testable: Vitest runs
// in the node environment with no DOM, and .svelte files are never unit-mounted here.
import type { AxisPresetBrowserDetailState } from './presetBrowserWorkbenchRuntime';

export interface AxisPresetBrowserDetailStatusItem {
  key: 'grid' | 'params' | 'versions';
  label: string;
  loaded: boolean;
  title: string;
}

export function detailStatusItems(
  detail: AxisPresetBrowserDetailState | null | undefined
): AxisPresetBrowserDetailStatusItem[] {
  const gridLoaded = detail?.gridLoaded ?? false;
  const paramsLoaded = detail?.paramsLoaded ?? false;
  const versionCount = detail?.versions.length ?? 0;

  return [
    {
      key: 'grid',
      label: 'GRID',
      loaded: gridLoaded,
      title: gridLoaded ? 'Grid preview ready' : 'No grid preview'
    },
    {
      key: 'params',
      label: 'PARAMS',
      loaded: paramsLoaded,
      title: paramsLoaded ? 'Params loaded' : 'Summary params only'
    },
    {
      key: 'versions',
      label: versionCount === 0 ? 'VERSIONS' : `VERSIONS ${versionCount}`,
      loaded: versionCount > 0,
      title:
        versionCount === 0
          ? 'No versions'
          : versionCount === 1
            ? '1 version'
            : `${versionCount} versions`
    }
  ];
}
