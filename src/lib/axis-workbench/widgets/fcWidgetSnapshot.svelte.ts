import { axisFcWorkbenchController, type AxisFcControllerSnapshot } from '../fc/fcWorkbenchController';
import { axisFcWorkbenchRuntime } from '../fc/fcWorkbenchRuntime';
import type { AxisFcModelLike } from '../fc/fcWorkbenchData';

// Shared by the three top-bar FC widgets (fcDevice/fcLayouts/fcSwitchView): live selection +
// model, so the roster sizes mirror a connected unit's actual switch/layout/view counts.
export function createAxisFcWidgetSnapshot() {
  let selection = $state<AxisFcControllerSnapshot>(axisFcWorkbenchController.snapshot);
  let model = $state<AxisFcModelLike | null>(axisFcWorkbenchRuntime.snapshot.model);

  $effect(() => {
    const offSelection = axisFcWorkbenchController.subscribe((next) => (selection = next));
    const offModel = axisFcWorkbenchRuntime.subscribe((next) => (model = next.model));
    return () => {
      offSelection();
      offModel();
    };
  });

  return {
    get selection() {
      return selection;
    },
    get model() {
      return model;
    }
  };
}
