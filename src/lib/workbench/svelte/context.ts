import { getContext, hasContext, setContext } from 'svelte';
import type { WorkbenchController } from './controller.svelte';
import type { WorkbenchRenderRegistry } from './renderRegistry';

export interface WorkbenchContext {
  controller: WorkbenchController;
  registry: WorkbenchRenderRegistry;
}

export const WORKBENCH_CONTEXT = Symbol('workbench-context');

export function setWorkbenchContext(context: WorkbenchContext): WorkbenchContext {
  setContext(WORKBENCH_CONTEXT, context);
  return context;
}

export function getWorkbenchContext(): WorkbenchContext {
  return getContext<WorkbenchContext>(WORKBENCH_CONTEXT);
}

export function getOptionalWorkbenchContext(): WorkbenchContext | null {
  return hasContext(WORKBENCH_CONTEXT) ? getContext<WorkbenchContext>(WORKBENCH_CONTEXT) : null;
}
