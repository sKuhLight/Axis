import { describe, expect, it } from 'vitest';
import { createWorkbenchBindingRegistry } from '../../workbench';
import { AXIS_PARAM_CONTROL_BINDING, registerAxisWorkbenchBindings, type AxisParamControlValue } from '../axisWorkbenchBindings';
import { createAxisWorkbenchDefaultDocument } from '../axisWorkbenchDefaults';
import { axisWorkbenchController } from '../axisWorkbenchStore.svelte';

describe('Axis Workbench binding adapter', () => {
  it('registers the axis parameter control binding resolver', async () => {
    const registry = createWorkbenchBindingRegistry();
    const unregister = registerAxisWorkbenchBindings(registry, { getEditor: () => null });
    const result = await registry.resolve<AxisParamControlValue>(
      {
        kind: AXIS_PARAM_CONTROL_BINDING,
        version: 1,
        target: {
          effectId: 123,
          paramId: 45,
          block: 'Amp 1',
          param: 'Gain'
        }
      },
      { document: createAxisWorkbenchDefaultDocument() }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toMatchObject({
        kind: AXIS_PARAM_CONTROL_BINDING,
        effectId: 123,
        paramId: 45,
        block: 'Amp 1',
        label: 'Gain',
        writable: true,
        source: 'metadata'
      });
    }

    unregister();
    expect(registry.has(AXIS_PARAM_CONTROL_BINDING)).toBe(false);
  });

  it('registers bindings on the singleton Workbench controller', () => {
    expect(axisWorkbenchController.bindingRegistry.has(AXIS_PARAM_CONTROL_BINDING)).toBe(true);
  });
});
