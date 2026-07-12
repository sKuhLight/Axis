import { describe, expect, it } from 'vitest';
import { AXIS_FC_PARTS } from '../fc/types';
import { AXIS_PRESET_BROWSER_PARTS } from '../presetBrowser/types';
import {
  AXIS_WORKBENCH_RUNTIME_ADAPTERS,
  axisWorkbenchRuntimeAdapterIds
} from '../axisWorkbenchRuntimeAdapters';

describe('Axis Workbench runtime adapter manifest', () => {
  it('covers the current split-panel runtime adapters without importing live Axis stores', () => {
    expect(axisWorkbenchRuntimeAdapterIds()).toEqual(['axis.presetBrowser', 'axis.fc']);

    const presetBrowser = AXIS_WORKBENCH_RUNTIME_ADAPTERS.find((adapter) => adapter.id === 'axis.presetBrowser');
    const fc = AXIS_WORKBENCH_RUNTIME_ADAPTERS.find((adapter) => adapter.id === 'axis.fc');

    expect(presetBrowser?.parts).toEqual([...AXIS_PRESET_BROWSER_PARTS]);
    expect(fc?.parts).toEqual([...AXIS_FC_PARTS]);
    for (const adapter of AXIS_WORKBENCH_RUNTIME_ADAPTERS) {
      expect(adapter.runtimeModule).toMatch(/Runtime\.ts$/);
      expect(adapter.hostFactoryModule).toMatch(/Host\.ts$/);
      expect(adapter.controllerModule).toMatch(/Controller\.ts$/);
      expect(adapter.dataModule).toMatch(/Data\.ts$/);
      expect(adapter.panelModule).toMatch(/PartPanel\.svelte$/);
    }
  });
});
