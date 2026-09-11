import { axisFcWorkbenchRuntime } from './fcWorkbenchRuntime';

let pendingModelLoad: ReturnType<typeof axisFcWorkbenchRuntime.loadModel> | null = null;

export function ensureAxisFcWorkbenchModel() {
  if (axisFcWorkbenchRuntime.snapshot.model) return;
  pendingModelLoad ??= axisFcWorkbenchRuntime.loadModel().finally(() => {
    pendingModelLoad = null;
  });
  return pendingModelLoad;
}
