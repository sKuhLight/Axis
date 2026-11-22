import { getContext, hasContext, setContext } from 'svelte';
import type { WorkbenchController } from './controller.svelte';
import type { WorkbenchRenderRegistry } from './renderRegistry';
import type { WorkbenchEditBarExtension } from './editBarMenus';

export interface WorkbenchContext {
  controller: WorkbenchController;
  registry: WorkbenchRenderRegistry;
  /**
   * Host edit contributions (edit bar LAYOUT / PROFILE, and the `pages` part the
   * navigation shares: the "+" Add page menu and per-page resets).
   */
  editBar?: WorkbenchEditBarExtension;
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
