import { editor } from '../../editor.svelte';
import { forgefx } from '../../forgefx';
import type { AxisFcRuntimeHost } from './fcWorkbenchRuntime';

export function createAxisFcWorkbenchHost(): AxisFcRuntimeHost {
  return {
    loadModel: forgefx.fcModel,
    readState: forgefx.fcState,
    setParam: async (effectId, paramId, value, refresh) => {
      await forgefx.setParam(effectId, paramId, value, refresh);
    },
    notifyError: (message) => editor.showToast(message, '#ff6b6b')
  };
}
